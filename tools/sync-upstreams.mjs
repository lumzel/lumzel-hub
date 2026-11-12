#!/usr/bin/env node
/**
 * Declarative upstream synchronizer & verifier for Lumzel Hub (`upstreams.json`).
 *
 * Supports two Loadout sync modes:
 * 1. `curated` — Pulls standalone skills from multiple upstream repositories into `loadouts/<id>/skills/`.
 * 2. `suite`   — Pulls full upstream suites (skills, subagents, rules, MCP configs, instructions)
 *                and adapts them to Lumzel's standard Loadout directory layout.
 *
 * Usage:
 *   node tools/sync-upstreams.mjs                         # Incremental sync (clones only changed upstreams)
 *   node tools/sync-upstreams.mjs --check                 # Dry-run check against remote HEAD SHAs
 *   node tools/sync-upstreams.mjs --verify                # Validate catalog, manifests & preview size limits
 *   node tools/sync-upstreams.mjs --only daily-driver   # Sync specific Loadout ID(s), comma-separated
 *   node tools/sync-upstreams.mjs --force                 # Force re-clone & re-sync even when SHA matches
 *   node tools/sync-upstreams.mjs --report /tmp/pr.md     # Write Markdown change report for CI Pull Requests
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAMS_PATH = path.join(ROOT, 'upstreams.json');
const MARKETPLACE_PATH = path.join(ROOT, 'marketplace.json');

// Matches Lumzel `market_preview.rs` bounds (`MAX_FILES = 2000`, `MAX_BYTES = 20 MiB`).
const PREVIEW_MAX_FILES = 2000;
const PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

const SKIP_NAMES = new Set([
  '.git',
  '.github',
  '.DS_Store',
  'node_modules',
  '__pycache__',
  '.pytest_cache',
  '.lumzel-source',
  '.ruff_cache',
  '.mypy_cache',
]);

const ROOT_SKILL_ALLOWED_DIRS = new Set([
  'references',
  'scripts',
  'templates',
  'assets',
  'agents',
  'prompts',
  'recommendations',
  'eval-viewer',
  'sections',
]);

const LANG_PATHS_GLOB = {
  angular: '**/*.ts, **/*.html, **/*.scss',
  arkts: '**/*.ets',
  cpp: '**/*.cpp, **/*.cc, **/*.cxx, **/*.hpp, **/*.h',
  csharp: '**/*.cs',
  dart: '**/*.dart',
  fsharp: '**/*.fs, **/*.fsi, **/*.fsx',
  golang: '**/*.go',
  java: '**/*.java',
  kotlin: '**/*.kt, **/*.kts',
  nuxt: '**/*.vue, **/*.ts, **/*.js',
  perl: '**/*.pl, **/*.pm',
  php: '**/*.php',
  python: '**/*.py',
  react: '**/*.tsx, **/*.jsx, **/*.ts, **/*.js',
  ruby: '**/*.rb',
  rust: '**/*.rs',
  swift: '**/*.swift',
  typescript: '**/*.ts, **/*.tsx, **/*.js, **/*.jsx',
  vue: '**/*.vue, **/*.ts, **/*.js',
  web: '**/*.html, **/*.css, **/*.js, **/*.ts',
};

function parseArgs(argv) {
  const opts = {
    check: false,
    verifyOnly: false,
    countsOnly: false,
    force: false,
    only: null,
    reportPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--verify') opts.verifyOnly = true;
    else if (arg === '--counts') opts.countsOnly = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--only' && argv[i + 1]) {
      opts.only = new Set(
        argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (arg === '--report' && argv[i + 1]) {
      opts.reportPath = path.resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node tools/sync-upstreams.mjs [--check] [--verify] [--counts] [--force] [--only id1,id2] [--report path.md]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function withRetry(label, fn, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        const delayMs = attempt * 1500;
        console.warn(`[retry ${attempt}/${attempts - 1}] ${label}: ${err.message || err}`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr?.message || lastErr}`);
}

async function git(args, cwd = ROOT) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

async function resolveRemoteHead(repo, ref) {
  const url = `https://github.com/${repo}.git`;
  return withRetry(`ls-remote ${repo}`, async () => {
    if (ref) {
      const out = await git(['ls-remote', url, ref]);
      const first = out.trim().split('\n')[0] || '';
      const sha = first.split(/\s+/)[0];
      if (!sha || sha.length !== 40) {
        throw new Error(`Could not resolve ref ${ref} on ${repo}`);
      }
      return { branch: ref, sha };
    }
    const out = await git(['ls-remote', '--symref', url, 'HEAD']);
    let branch = 'main';
    let sha = '';
    for (const line of out.trim().split('\n')) {
      if (line.startsWith('ref: refs/heads/')) {
        branch = line.replace(/^ref: refs\/heads\//, '').split(/\s+/)[0];
      } else if (/^[0-9a-f]{40}\s+HEAD$/.test(line.trim())) {
        sha = line.trim().split(/\s+/)[0];
      }
    }
    if (!sha) throw new Error(`Could not resolve HEAD SHA for ${repo}`);
    return { branch, sha };
  });
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

async function cloneUpstream(repo, branch, sparsePaths, scratchRoot) {
  const slug = repo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = path.join(scratchRoot, slug);
  const url = `https://github.com/${repo}.git`;

  await withRetry(`clone ${repo}@${branch}`, async () => {
    fs.rmSync(dest, { recursive: true, force: true });
    if (sparsePaths && sparsePaths.length > 0) {
      await git(
        ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--branch', branch, url, dest],
        scratchRoot,
      );
      await git(['sparse-checkout', 'init', '--no-cone'], dest);
      const patterns = sparsePaths.map((p) => {
        const clean = p.replace(/^\/+|\/+$/g, '');
        return `/${clean}`;
      });
      await git(['sparse-checkout', 'set', '--no-cone', ...patterns], dest);
      await git(['checkout'], dest);
    } else {
      await git(['clone', '--depth', '1', '--filter=blob:none', '--branch', branch, url, dest], scratchRoot);
    }
  });
  return dest;
}

function shouldSkipEntry(name) {
  return SKIP_NAMES.has(name) || name.endsWith('.pyc');
}

function copyTreeClean(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (shouldSkipEntry(entry.name) || entry.isSymbolicLink()) continue;
      copyTreeClean(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    const mode = stat.mode & 0o111 ? 0o755 : 0o644;
    fs.chmodSync(dest, mode);
  }
}

function copyRootSkillClean(repoDir, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(repoDir, { withFileTypes: true })) {
    if (shouldSkipEntry(entry.name) || entry.isSymbolicLink()) continue;
    if (entry.isFile()) {
      if (
        entry.name === 'SKILL.md' ||
        /^README(\..+)?\.md$/i.test(entry.name) ||
        /^LICENSE(\..+)?$/i.test(entry.name)
      ) {
        copyTreeClean(path.join(repoDir, entry.name), path.join(dest, entry.name));
      }
    } else if (entry.isDirectory() && ROOT_SKILL_ALLOWED_DIRS.has(entry.name)) {
      copyTreeClean(path.join(repoDir, entry.name), path.join(dest, entry.name));
    }
  }
}

function splitFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { front: null, body: normalized };
  }
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    return { front: null, body: normalized };
  }
  const front = normalized.slice(4, end);
  const rest = normalized.slice(end + 4).replace(/^\n+/, '');
  return { front, body: rest };
}

function yamlSingleQuote(value) {
  const clean = String(value).replace(/\s+/g, ' ').trim();
  if (/^[A-Za-z0-9_./:@+-]+$/.test(clean)) return clean;
  return `'${clean.replace(/'/g, "''")}'`;
}

function firstSentenceSummary(markdownBody, fallback) {
  for (const rawLine of markdownBody.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```') || line.startsWith('<!--')) {
      continue;
    }
    const stripped = line.replace(/\*\*|__|`/g, '').trim();
    if (stripped.length >= 12) {
      return stripped.length > 220 ? stripped.slice(0, 220).trim() : stripped;
    }
  }
  return fallback;
}

function listLoadoutInventory(loadoutDir) {
  const skillsDir = path.join(loadoutDir, 'skills');
  const skills = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
        .map((d) => d.name)
        .sort()
    : [];

  const listByExt = (sub, ext) => {
    const dir = path.join(loadoutDir, sub);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(ext))
      .map((f) => f.name.slice(0, -ext.length))
      .sort();
  };

  return {
    skills,
    agents: listByExt('agents', '.md'),
    mcp: listByExt('mcp', '.json'),
    hooks: listByExt('hooks', '.json'),
    rules: listByExt('rules', '.md'),
  };
}

function loadoutNeedsBootstrap(spec) {
  const loadoutDir = path.join(ROOT, 'loadouts', spec.id);
  if (!fs.existsSync(path.join(loadoutDir, 'loadout.yaml'))) return true;
  const inv = listLoadoutInventory(loadoutDir);
  if (spec.mode === 'curated') {
    const have = new Set(inv.skills);
    return (spec.skills || []).some((s) => !have.has(s.name));
  }
  return inv.skills.length === 0;
}

function syncCuratedLoadout(spec, repoDirs) {
  const loadoutDir = path.join(ROOT, 'loadouts', spec.id);
  const skillsRoot = path.join(loadoutDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });

  const declaredNames = new Set((spec.skills || []).map((s) => s.name));
  if (!spec.preserveLocalSkills) {
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !declaredNames.has(entry.name)) {
        fs.rmSync(path.join(skillsRoot, entry.name), { recursive: true, force: true });
      }
    }
  }

  for (const item of spec.skills || []) {
    const repoDir = repoDirs.get(item.repo);
    if (!repoDir) {
      // Upstream repo did not change and local skill already exists.
      continue;
    }
    const targetDir = path.join(skillsRoot, item.name);
    const stageDir = `${targetDir}.stage`;
    fs.rmSync(stageDir, { recursive: true, force: true });

    if (item.skillFile) {
      const srcSkillFile = path.join(repoDir, item.skillFile);
      if (!fs.existsSync(srcSkillFile)) {
        throw new Error(`[${spec.id}] Missing skillFile ${item.skillFile} in ${item.repo}`);
      }
      fs.mkdirSync(stageDir, { recursive: true });
      fs.copyFileSync(srcSkillFile, path.join(stageDir, 'SKILL.md'));
      for (const [destSub, srcSub] of Object.entries(item.extraDirs || {})) {
        const srcExtra = path.join(repoDir, srcSub);
        if (fs.existsSync(srcExtra)) {
          copyTreeClean(srcExtra, path.join(stageDir, destSub));
        }
      }
    } else if (!item.path || item.path === '.') {
      if (!fs.existsSync(path.join(repoDir, 'SKILL.md'))) {
        throw new Error(`[${spec.id}] Missing root SKILL.md in ${item.repo}`);
      }
      copyRootSkillClean(repoDir, stageDir);
    } else {
      const srcDir = path.join(repoDir, item.path);
      if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
        throw new Error(`[${spec.id}] Missing ${item.path}/SKILL.md in ${item.repo}`);
      }
      copyTreeClean(srcDir, stageDir);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(stageDir, targetDir);
  }
}

function replaceDirAtomic(targetDir, populateFn) {
  const stageDir = `${targetDir}.stage`;
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  populateFn(stageDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
  if (fs.readdirSync(stageDir).length > 0) {
    fs.renameSync(stageDir, targetDir);
  } else {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

function transformPlaceholderEnv(key, rawVal) {
  const str = String(rawVal);
  if (/^YOUR_.*$/i.test(str) || str === '' || str.startsWith('<')) {
    return `\${env:${key}}`;
  }
  return str.replace(/YOUR_([A-Z0-9_]+?)_HERE/gi, (_, name) => `\${env:${name.toUpperCase()}}`);
}

function syncSuiteLoadout(spec, repoDir) {
  const loadoutDir = path.join(ROOT, 'loadouts', spec.id);
  fs.mkdirSync(loadoutDir, { recursive: true });

  // 1. Skills
  if (spec.skills) {
    const skillsCfg = spec.skills;
    replaceDirAtomic(path.join(loadoutDir, 'skills'), (stageSkills) => {
      if (skillsCfg.mode === 'dir') {
        const srcRoot = path.join(repoDir, skillsCfg.path || 'skills');
        if (!fs.existsSync(srcRoot)) return;
        for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
          if (!entry.isDirectory() || shouldSkipEntry(entry.name)) continue;
          const skillSrc = path.join(srcRoot, entry.name);
          if (fs.existsSync(path.join(skillSrc, 'SKILL.md'))) {
            copyTreeClean(skillSrc, path.join(stageSkills, entry.name));
          }
        }
      } else if (skillsCfg.mode === 'buckets') {
        const baseDir = path.join(repoDir, skillsCfg.path || 'skills');
        for (const bucket of skillsCfg.buckets || []) {
          const bucketDir = path.join(baseDir, bucket);
          if (!fs.existsSync(bucketDir)) continue;
          for (const entry of fs.readdirSync(bucketDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || shouldSkipEntry(entry.name)) continue;
            const skillSrc = path.join(bucketDir, entry.name);
            if (fs.existsSync(path.join(skillSrc, 'SKILL.md'))) {
              copyTreeClean(skillSrc, path.join(stageSkills, entry.name));
            }
          }
        }
      } else if (skillsCfg.mode === 'commands-to-skills') {
        const cmdDir = path.join(repoDir, skillsCfg.commandsDir);
        const tplDir = skillsCfg.templatesDir ? path.join(repoDir, skillsCfg.templatesDir) : null;
        const prefix = skillsCfg.prefix || '';
        const templateFiles =
          tplDir && fs.existsSync(tplDir)
            ? fs
                .readdirSync(tplDir, { withFileTypes: true })
                .filter((f) => f.isFile() && /\.(md|ya?ml)$/i.test(f.name))
                .map((f) => f.name)
            : [];

        for (const entry of fs.readdirSync(cmdDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
          const stem = entry.name.slice(0, -3);
          const skillName = `${prefix}${stem}`;
          const raw = fs.readFileSync(path.join(cmdDir, entry.name), 'utf8');
          const { front, body } = splitFrontmatter(raw);
          let desc = `Execute the ${skillName} workflow.`;
          if (front) {
            const m = front.match(/^description:\s*(.+)$/m);
            if (m) desc = m[1].trim().replace(/^['"]|['"]$/g, '');
          }
          const skillDest = path.join(stageSkills, skillName);
          fs.mkdirSync(skillDest, { recursive: true });
          const note =
            templateFiles.length > 0
              ? '> **Bundled Spec-Kit Templates**: Official templates (`constitution-template.md`, `spec-template.md`, `plan-template.md`, `tasks-template.md`, `checklist-template.md`) are available in `./references/` if `.specify/templates/` has not been initialized in the current repository yet.\n\n\n'
              : '';
          const outMd = `---\nname: ${skillName}\ndescription: ${yamlSingleQuote(desc)}\n---\n\n${note}${body.trimStart()}`;
          fs.writeFileSync(path.join(skillDest, 'SKILL.md'), outMd.endsWith('\n') ? outMd : `${outMd}\n`);
          if (templateFiles.length > 0) {
            const refDir = path.join(skillDest, 'references');
            fs.mkdirSync(refDir, { recursive: true });
            for (const tf of templateFiles) {
              fs.copyFileSync(path.join(tplDir, tf), path.join(refDir, tf));
            }
          }
        }
      } else if (skillsCfg.mode === 'root-scan') {
        const exclude = new Set(skillsCfg.exclude || []);
        for (const entry of fs.readdirSync(repoDir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || shouldSkipEntry(entry.name) || exclude.has(entry.name)) {
            continue;
          }
          const skillSrc = path.join(repoDir, entry.name);
          if (fs.existsSync(path.join(skillSrc, 'SKILL.md'))) {
            copyTreeClean(skillSrc, path.join(stageSkills, entry.name));
          }
        }
      }
    });
  }

  // 2. Subagents
  if (spec.agents) {
    const agentsCfg = spec.agents;
    replaceDirAtomic(path.join(loadoutDir, 'agents'), (stageAgents) => {
      if (agentsCfg.mode === 'dir') {
        const srcDir = path.join(repoDir, agentsCfg.path || 'agents');
        if (!fs.existsSync(srcDir)) return;
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
            copyTreeClean(path.join(srcDir, entry.name), path.join(stageAgents, entry.name));
          }
        }
      } else if (agentsCfg.mode === 'nested-skill-agents') {
        const skillsRoot = path.join(repoDir, agentsCfg.skillsDir || 'skills');
        const prefix = agentsCfg.prefix || '';
        if (!fs.existsSync(skillsRoot)) return;
        const seen = new Set();
        for (const skillEntry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
          if (!skillEntry.isDirectory()) continue;
          const nestedDir = path.join(skillsRoot, skillEntry.name, 'references', 'agents');
          if (!fs.existsSync(nestedDir)) continue;
          for (const agentFile of fs.readdirSync(nestedDir, { withFileTypes: true })) {
            if (!agentFile.isFile() || !agentFile.name.endsWith('.md')) continue;
            const rawStem = agentFile.name.slice(0, -3);
            const agentName = rawStem.startsWith(prefix) ? rawStem : `${prefix}${rawStem}`;
            if (seen.has(agentName)) continue;
            seen.add(agentName);
            const raw = fs.readFileSync(path.join(nestedDir, agentFile.name), 'utf8');
            const { front, body } = splitFrontmatter(raw);
            let desc = '';
            if (front) {
              const m = front.match(/^description:\s*(.+)$/m);
              if (m) desc = m[1].trim().replace(/^['"]|['"]$/g, '');
            }
            if (!desc) {
              desc = firstSentenceSummary(body, `${agentName} specialist subagent`);
            }
            const content = `---\nname: ${agentName}\ndescription: ${yamlSingleQuote(desc)}\n---\n\n${body.trimStart()}`;
            fs.writeFileSync(
              path.join(stageAgents, `${agentName}.md`),
              content.endsWith('\n') ? content : `${content}\n`,
            );
          }
        }
      }
    });
  }

  // 3. Rules
  if (spec.rules) {
    const rulesCfg = spec.rules;
    replaceDirAtomic(path.join(loadoutDir, 'rules'), (stageRules) => {
      if (rulesCfg.mode === 'lang-dirs') {
        const rulesRoot = path.join(repoDir, rulesCfg.path || 'rules');
        const excludeDirs = new Set(rulesCfg.excludeDirs || []);
        const prefix = rulesCfg.prefix || '';
        if (!fs.existsSync(rulesRoot)) return;
        for (const langEntry of fs.readdirSync(rulesRoot, { withFileTypes: true })) {
          if (!langEntry.isDirectory() || excludeDirs.has(langEntry.name) || shouldSkipEntry(langEntry.name)) continue;
          const lang = langEntry.name;
          const langDir = path.join(rulesRoot, lang);
          for (const fileEntry of fs.readdirSync(langDir, { withFileTypes: true })) {
            if (!fileEntry.isFile() || !fileEntry.name.endsWith('.md') || /^readme\.md$/i.test(fileEntry.name)) {
              continue;
            }
            const stem = fileEntry.name.slice(0, -3);
            const ruleName = `${prefix}${lang}-${stem}`;
            const raw = fs.readFileSync(path.join(langDir, fileEntry.name), 'utf8');
            const { front, body } = splitFrontmatter(raw);
            let pathsLine = '';
            if (front) {
              const pm = front.match(/^paths:\s*(.+)$/m);
              if (pm) pathsLine = `\npaths: ${pm[1].trim()}`;
            }
            if (!pathsLine && LANG_PATHS_GLOB[lang]) {
              pathsLine = `\npaths: '${LANG_PATHS_GLOB[lang]}'`;
            }
            const desc = `ECC ${lang} rule: ${stem.replace(/-/g, ' ')}`;
            const out = `---\nname: ${ruleName}\ndescription: ${yamlSingleQuote(desc)}${pathsLine}\n---\n\n${body.trimStart()}`;
            fs.writeFileSync(path.join(stageRules, `${ruleName}.md`), out.endsWith('\n') ? out : `${out}\n`);
          }
        }
      } else if (rulesCfg.mode === 'single-file') {
        const srcFile = path.join(repoDir, rulesCfg.source);
        if (!fs.existsSync(srcFile)) return;
        const raw = fs.readFileSync(srcFile, 'utf8');
        const { body } = splitFrontmatter(raw);
        const out = `---\nname: ${rulesCfg.target}\ndescription: ${yamlSingleQuote(rulesCfg.description || rulesCfg.target)}\n---\n\n${body.trimStart()}`;
        fs.writeFileSync(path.join(stageRules, `${rulesCfg.target}.md`), out.endsWith('\n') ? out : `${out}\n`);
      }
    });
  }

  // 4. MCP Servers
  if (spec.mcp && spec.mcp.mode === 'mcp-servers-json') {
    const srcJson = path.join(repoDir, spec.mcp.source);
    if (fs.existsSync(srcJson)) {
      const parsed = JSON.parse(fs.readFileSync(srcJson, 'utf8'));
      const servers = parsed.mcpServers || {};
      replaceDirAtomic(path.join(loadoutDir, 'mcp'), (stageMcp) => {
        for (const [rawName, cfg] of Object.entries(servers)) {
          if (!cfg || typeof cfg !== 'object' || rawName.startsWith('_')) continue;
          const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, '-');
          const out = {};
          if (cfg.type) out.type = cfg.type;
          if (cfg.command) out.command = cfg.command;
          if (Array.isArray(cfg.args)) {
            out.args = cfg.args.map((arg) =>
              String(arg)
                .replace(/--project-ref=YOUR_PROJECT_REF/g, '--project-ref=${env:SUPABASE_PROJECT_REF}')
                .replace(/YOUR_([A-Z0-9_]+?)(?:_HERE)?\b/g, (_, k) => `\${env:${k}}`),
            );
          }
          if (cfg.url) {
            out.url = String(cfg.url).replace(/YOUR_([A-Z0-9_]+?)(?:_HERE)?\b/g, (_, k) => `\${env:${k}}`);
          }
          if (cfg.headers && typeof cfg.headers === 'object') {
            out.headers = {};
            for (const [hk, hv] of Object.entries(cfg.headers)) {
              const envKey = hk.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
              out.headers[hk] = transformPlaceholderEnv(envKey, hv);
            }
          }
          if (cfg.env && typeof cfg.env === 'object') {
            out.env = {};
            for (const [ek, ev] of Object.entries(cfg.env)) {
              out.env[ek] = transformPlaceholderEnv(ek, ev);
            }
          }
          fs.writeFileSync(path.join(stageMcp, `${cleanName}.json`), `${JSON.stringify(out, null, 2)}\n`);
        }
      });
    }
  }

  // 5. AGENTS.md instructions
  if (spec.instructions?.source) {
    const srcInstructions = path.join(repoDir, spec.instructions.source);
    if (fs.existsSync(srcInstructions)) {
      let body = fs.readFileSync(srcInstructions, 'utf8').replace(/\r\n/g, '\n').trimStart();
      if (spec.instructions.header && !body.startsWith(spec.instructions.header.trim())) {
        // Strip top H1 if header supplies its own H1
        if (spec.instructions.header.startsWith('# ') && body.startsWith('# ')) {
          body = body.replace(/^# [^\n]+\n+/, '');
        }
        body = `${spec.instructions.header}${body}`;
      }
      fs.writeFileSync(path.join(loadoutDir, 'AGENTS.md'), body.endsWith('\n') ? body : `${body}\n`);
    }
  }
}

const MANIFEST_SECTION_KEYS = new Set(['skills', 'agents', 'mcp', 'hooks', 'rules', 'plugins', 'env']);

function updateLoadoutYaml(loadoutDir, spec) {
  const yamlPath = path.join(loadoutDir, 'loadout.yaml');
  const existing = fs.readFileSync(yamlPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = existing.split('\n');

  const headerLines = [];
  const tailSections = new Map();
  let currentKey = null;

  for (const line of lines) {
    const topMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s.*)?$/);
    if (topMatch) {
      const key = topMatch[1];
      if (MANIFEST_SECTION_KEYS.has(key)) {
        currentKey = key;
        if (key === 'plugins' || key === 'env') {
          tailSections.set(key, [line]);
        }
        continue;
      }
      currentKey = null;
      headerLines.push(line);
    } else if (currentKey) {
      if ((currentKey === 'plugins' || currentKey === 'env') && line.trim() !== '') {
        tailSections.get(currentKey).push(line);
      }
    } else if (line.trim() !== '' || headerLines.length > 0) {
      headerLines.push(line);
    }
  }

  while (headerLines.length > 0 && headerLines[headerLines.length - 1].trim() === '') {
    headerLines.pop();
  }

  const inv = listLoadoutInventory(loadoutDir);
  let orderedSkills = inv.skills;
  if (spec?.keepSkillOrder && Array.isArray(spec.skills)) {
    const preferred = spec.skills.map((s) => s.name).filter((n) => inv.skills.includes(n));
    const preferredSet = new Set(preferred);
    const extras = inv.skills.filter((n) => !preferredSet.has(n));
    orderedSkills = [...preferred, ...extras];
  }

  const out = [...headerLines];

  const pushList = (key, arr) => {
    if (arr.length === 0) {
      out.push(`${key}: []`);
    } else {
      out.push(`${key}:`);
      for (const item of arr) {
        out.push(`- ${yamlSingleQuote(item)}`);
      }
    }
  };

  pushList('skills', orderedSkills);

  if (inv.agents.length === 0) {
    out.push('agents: {}');
  } else {
    out.push('agents:');
    for (const agent of inv.agents) {
      out.push(`  ${yamlSingleQuote(agent)}: {}`);
    }
  }

  pushList('mcp', inv.mcp);
  pushList('hooks', inv.hooks);
  pushList('rules', inv.rules);

  out.push(...(tailSections.get('plugins') || ['plugins: []']));
  out.push(...(tailSections.get('env') || ['env: {}']));

  fs.writeFileSync(yamlPath, `${out.join('\n')}\n`);
  return { ...inv, skills: orderedSkills };
}

function measureDir(dir) {
  let files = 0;
  let bytes = 0;
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.lumzel-source' || entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(full).size;
      }
    }
  }
  walk(dir);
  return { files, bytes };
}

function unquoteYamlScalar(raw) {
  const s = raw.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function parseLoadoutYamlRefs(yamlText) {
  const refs = {
    skills: [],
    agents: [],
    rules: [],
    hooks: [],
    mcp: [],
    plugins: [],
  };
  let section = null;
  for (const line of yamlText.replace(/\r\n/g, '\n').split('\n')) {
    const topMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (topMatch) {
      const key = topMatch[1];
      const rest = (topMatch[2] || '').trim();
      section = Object.prototype.hasOwnProperty.call(refs, key) && rest === '' ? key : null;
      continue;
    }
    if (!section) continue;
    if (section === 'agents') {
      const mapMatch = line.match(/^\s{2}([^#\s][^:]*):/);
      if (mapMatch) refs.agents.push(unquoteYamlScalar(mapMatch[1]));
    } else {
      const listMatch = line.match(/^\s*-\s+(.+)$/);
      if (listMatch) refs[section].push(unquoteYamlScalar(listMatch[1]));
    }
  }
  return refs;
}

const COUNT_KEYS = ['skills', 'agents', 'rules', 'hooks', 'mcp', 'plugins'];

function computeItemCounts(itemDir, kind) {
  const inv = listLoadoutInventory(itemDir);
  const union = {
    skills: new Set(inv.skills),
    agents: new Set(inv.agents),
    rules: new Set(inv.rules),
    hooks: new Set(inv.hooks),
    mcp: new Set(inv.mcp.filter((n) => n !== 'lumzel')),
    plugins: new Set(),
  };

  if (kind === 'loadout') {
    const yamlPath = path.join(itemDir, 'loadout.yaml');
    if (fs.existsSync(yamlPath)) {
      const refs = parseLoadoutYamlRefs(fs.readFileSync(yamlPath, 'utf8'));
      for (const k of COUNT_KEYS) {
        for (const name of refs[k] || []) {
          if (k === 'mcp' && name === 'lumzel') continue;
          if (name) union[k].add(name);
        }
      }
    }
  } else if (kind === 'deck') {
    const deckJsonPath = path.join(itemDir, 'deck.json');
    if (fs.existsSync(deckJsonPath)) {
      const manifest = JSON.parse(fs.readFileSync(deckJsonPath, 'utf8'));
      const uses = manifest.uses || {};
      for (const k of ['skills', 'agents', 'rules', 'hooks', 'mcp']) {
        for (const name of uses[k] || []) {
          if (k === 'mcp' && name === 'lumzel') continue;
          if (name) union[k].add(name);
        }
      }
    }
  }

  const out = {};
  for (const k of COUNT_KEYS) {
    if (union[k].size > 0) out[k] = union[k].size;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function withEntryCounts(entry, counts) {
  const next = {};
  let inserted = false;
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'counts') continue;
    if (k === 'source' && counts && !inserted) {
      next.counts = counts;
      inserted = true;
    }
    next[k] = v;
  }
  if (counts && !inserted) {
    next.counts = counts;
  }
  return next;
}

function syncMarketplaceCounts() {
  const raw = fs.readFileSync(MARKETPLACE_PATH, 'utf8');
  const marketplace = JSON.parse(raw);

  if (Array.isArray(marketplace.loadouts)) {
    marketplace.loadouts = marketplace.loadouts.map((entry) => {
      const rel = String(entry.source || '').replace(/^\.\//, '');
      const counts = computeItemCounts(path.join(ROOT, rel), 'loadout');
      return withEntryCounts(entry, counts);
    });
  }
  if (Array.isArray(marketplace.decks)) {
    marketplace.decks = marketplace.decks.map((entry) => {
      const rel = String(entry.source || '').replace(/^\.\//, '');
      const counts = computeItemCounts(path.join(ROOT, rel), 'deck');
      return withEntryCounts(entry, counts);
    });
  }

  const formatted = `${JSON.stringify(marketplace, null, 2)}\n`;
  if (formatted !== raw) {
    fs.writeFileSync(MARKETPLACE_PATH, formatted);
    console.log('↻ Updated structured component counts in marketplace.json');
    return true;
  }
  return false;
}

function normalizeCountsJson(counts) {
  if (!counts || typeof counts !== 'object') return 'null';
  const ordered = {};
  for (const k of COUNT_KEYS) {
    if (typeof counts[k] === 'number' && counts[k] > 0) {
      ordered[k] = counts[k];
    }
  }
  return Object.keys(ordered).length > 0 ? JSON.stringify(ordered) : 'null';
}

function verifyRepository() {
  const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
  const errors = [];

  for (const entry of marketplace.loadouts || []) {
    const rel = String(entry.source || '').replace(/^\.\//, '');
    const loadoutDir = path.join(ROOT, rel);
    const yamlPath = path.join(loadoutDir, 'loadout.yaml');
    if (!fs.existsSync(yamlPath)) {
      errors.push(`[${entry.id}] Missing ${rel}/loadout.yaml`);
      continue;
    }
    const { files, bytes } = measureDir(loadoutDir);
    if (files > PREVIEW_MAX_FILES) {
      errors.push(`[${entry.id}] Exceeds Lumzel preview file cap: ${files} > ${PREVIEW_MAX_FILES}`);
    }
    if (bytes > PREVIEW_MAX_BYTES) {
      errors.push(
        `[${entry.id}] Exceeds Lumzel preview byte cap: ${(bytes / (1024 * 1024)).toFixed(2)} MiB > 20 MiB`,
      );
    }
    const inv = listLoadoutInventory(loadoutDir);
    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    if (!yamlText.includes(`id: ${entry.id}`)) {
      errors.push(`[${entry.id}] loadout.yaml id mismatch`);
    }
    for (const mcpName of inv.mcp) {
      try {
        JSON.parse(fs.readFileSync(path.join(loadoutDir, 'mcp', `${mcpName}.json`), 'utf8'));
      } catch (err) {
        errors.push(`[${entry.id}] Invalid JSON in mcp/${mcpName}.json: ${err.message}`);
      }
    }
    for (const hookName of inv.hooks) {
      try {
        JSON.parse(fs.readFileSync(path.join(loadoutDir, 'hooks', `${hookName}.json`), 'utf8'));
      } catch (err) {
        errors.push(`[${entry.id}] Invalid JSON in hooks/${hookName}.json: ${err.message}`);
      }
    }
    const expectedCounts = computeItemCounts(loadoutDir, 'loadout');
    if (normalizeCountsJson(entry.counts) !== normalizeCountsJson(expectedCounts)) {
      errors.push(
        `[${entry.id}] marketplace.json counts mismatch: have ${normalizeCountsJson(entry.counts)}, expected ${normalizeCountsJson(expectedCounts)} (run: node tools/sync-upstreams.mjs --counts)`,
      );
    }
  }

  for (const entry of marketplace.decks || []) {
    const rel = String(entry.source || '').replace(/^\.\//, '');
    const deckDir = path.join(ROOT, rel);
    const deckJsonPath = path.join(deckDir, 'deck.json');
    if (!fs.existsSync(deckJsonPath)) {
      errors.push(`[deck:${entry.id}] Missing ${rel}/deck.json`);
      continue;
    }
    const { files, bytes } = measureDir(deckDir);
    if (files > PREVIEW_MAX_FILES) {
      errors.push(`[deck:${entry.id}] Exceeds Lumzel preview file cap: ${files} > ${PREVIEW_MAX_FILES}`);
    }
    if (bytes > PREVIEW_MAX_BYTES) {
      errors.push(
        `[${entry.id}] Exceeds Lumzel preview byte cap: ${(bytes / (1024 * 1024)).toFixed(2)} MiB > 20 MiB`,
      );
    }
    const expectedCounts = computeItemCounts(deckDir, 'deck');
    if (normalizeCountsJson(entry.counts) !== normalizeCountsJson(expectedCounts)) {
      errors.push(
        `[deck:${entry.id}] marketplace.json counts mismatch: have ${normalizeCountsJson(entry.counts)}, expected ${normalizeCountsJson(expectedCounts)} (run: node tools/sync-upstreams.mjs --counts)`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Hub verification failed:\n  - ${errors.join('\n  - ')}`);
  }
  console.log(
    `✓ Verified ${(marketplace.loadouts || []).length} Loadouts and ${(marketplace.decks || []).length} Decks in marketplace.json (counts & preview limits OK).`,
  );
}

function diffSets(before, after) {
  const prev = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((x) => !prev.has(x)),
    removed: before.filter((x) => !next.has(x)),
  };
}

function renderReport(repoUpdates, loadoutChanges) {
  const lines = [
    '## Automated Upstream Sync',
    '',
    'Synchronized upstream **Skills** and **Suite Loadouts** declared in [`upstreams.json`](../blob/main/upstreams.json).',
    '',
    '### Updated Upstream Repositories',
    '',
    '| Repository | Branch | Revision |',
    '| :--- | :--- | :--- |',
  ];

  for (const u of repoUpdates) {
    const shortNew = u.newSha.slice(0, 7);
    const revCell = u.oldSha
      ? `[\`${u.oldSha.slice(0, 7)}...${shortNew}\`](https://github.com/${u.repo}/compare/${u.oldSha}...${u.newSha})`
      : `[\`${shortNew}\`](https://github.com/${u.repo}/commit/${u.newSha}) (initial)`;
    lines.push(`| [\`${u.repo}\`](https://github.com/${u.repo}) | \`${u.branch}\` | ${revCell} |`);
  }

  if (loadoutChanges.length > 0) {
    lines.push('', '### Affected Loadouts', '');
    for (const lc of loadoutChanges) {
      lines.push(
        `- **\`${lc.id}\`** (${lc.mode}): ${lc.after.skills.length} skills, ${lc.after.agents.length} subagents, ${lc.after.rules.length} rules, ${lc.after.mcp.length} MCP`,
      );
      for (const kind of ['skills', 'agents', 'rules', 'mcp']) {
        const d = diffSets(lc.before[kind], lc.after[kind]);
        if (d.added.length > 0) lines.push(`  - Added ${kind}: ${d.added.map((x) => `\`${x}\``).join(', ')}`);
        if (d.removed.length > 0) lines.push(`  - Removed ${kind}: ${d.removed.map((x) => `\`${x}\``).join(', ')}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.countsOnly) {
    syncMarketplaceCounts();
    verifyRepository();
    return;
  }
  if (opts.verifyOnly) {
    verifyRepository();
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(UPSTREAMS_PATH, 'utf8'));
  manifest.repos = manifest.repos || {};

  const targetLoadouts = (manifest.loadouts || []).filter((l) => !opts.only || opts.only.has(l.id));
  if (targetLoadouts.length === 0) {
    throw new Error('No matching Loadouts found in upstreams.json');
  }

  // Collect unique repos and whether each repo can use sparse checkout
  const repoMeta = new Map();
  for (const spec of targetLoadouts) {
    const needsBootstrap = loadoutNeedsBootstrap(spec);
    if (spec.mode === 'curated') {
      for (const s of spec.skills || []) {
        const info = repoMeta.get(s.repo) || {
          repo: s.repo,
          ref: s.ref || null,
          fullClone: false,
          sparsePaths: new Set(),
          forceBootstrap: false,
        };
        if (needsBootstrap) info.forceBootstrap = true;
        if (s.skillFile) {
          info.sparsePaths.add(s.skillFile);
          for (const extra of Object.values(s.extraDirs || {})) info.sparsePaths.add(extra);
        } else if (!s.path || s.path === '.') {
          info.fullClone = true;
        } else {
          info.sparsePaths.add(s.path);
        }
        repoMeta.set(s.repo, info);
      }
    } else if (spec.mode === 'suite') {
      const info = repoMeta.get(spec.repo) || {
        repo: spec.repo,
        ref: spec.ref || null,
        fullClone: true,
        sparsePaths: new Set(),
        forceBootstrap: false,
      };
      info.fullClone = true;
      if (needsBootstrap) info.forceBootstrap = true;
      repoMeta.set(spec.repo, info);
    }
  }

  console.log(`Checking ${repoMeta.size} upstream repositories...`);
  const entries = Array.from(repoMeta.values());
  const remoteHeads = await mapConcurrent(entries, 6, async (info) => {
    const head = await resolveRemoteHead(info.repo, info.ref);
    return { ...info, ...head };
  });

  const changedRepos = [];
  for (const item of remoteHeads) {
    const prev = manifest.repos[item.repo];
    const shaChanged = !prev || prev.sha !== item.sha;
    if (opts.force || shaChanged || item.forceBootstrap) {
      changedRepos.push({
        ...item,
        oldSha: prev?.sha || null,
        newSha: item.sha,
        shaChanged,
      });
    }
  }

  if (opts.check) {
    const outdated = changedRepos.filter((r) => r.shaChanged || r.forceBootstrap);
    if (outdated.length === 0) {
      console.log('✓ All upstream repositories are up to date.');
    } else {
      console.log(`! ${outdated.length} upstream repository update(s) available:`);
      for (const r of outdated) {
        console.log(`  - ${r.repo} (${r.branch}): ${(r.oldSha || 'none').slice(0, 7)} -> ${r.newSha.slice(0, 7)}`);
      }
    }
    return;
  }

  if (changedRepos.length === 0) {
    console.log('✓ Everything is already at the latest upstream commit.');
    syncMarketplaceCounts();
    verifyRepository();
    return;
  }

  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lumzel-hub-sync-'));
  try {
    const repoDirs = new Map();
    for (const r of changedRepos) {
      const sparse = r.fullClone ? null : Array.from(r.sparsePaths);
      console.log(
        `↓ Fetching ${r.repo}@${r.branch} (${r.newSha.slice(0, 7)})${sparse ? ` [sparse: ${sparse.length} path(s)]` : ''}...`,
      );
      const clonedDir = await cloneUpstream(r.repo, r.branch, sparse, scratchRoot);
      repoDirs.set(r.repo, clonedDir);
    }

    const loadoutChanges = [];
    for (const spec of targetLoadouts) {
      const loadoutDir = path.join(ROOT, 'loadouts', spec.id);
      const relevantChanged =
        spec.mode === 'curated'
          ? (spec.skills || []).some((s) => repoDirs.has(s.repo)) || loadoutNeedsBootstrap(spec)
          : repoDirs.has(spec.repo);
      if (!relevantChanged) continue;

      const before = listLoadoutInventory(loadoutDir);
      console.log(`↻ Syncing Loadout: ${spec.id} (${spec.mode})...`);
      if (spec.mode === 'curated') {
        syncCuratedLoadout(spec, repoDirs);
      } else if (spec.mode === 'suite') {
        syncSuiteLoadout(spec, repoDirs.get(spec.repo));
      }
      const after = updateLoadoutYaml(loadoutDir, spec);
      loadoutChanges.push({ id: spec.id, mode: spec.mode, before, after });
    }

    for (const r of changedRepos) {
      manifest.repos[r.repo] = {
        branch: r.branch,
        sha: r.newSha,
      };
    }
    fs.writeFileSync(UPSTREAMS_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

    syncMarketplaceCounts();
    verifyRepository();

    if (opts.reportPath) {
      const reportUpdates = changedRepos.filter((r) => r.shaChanged || opts.force);
      const md = renderReport(reportUpdates.length > 0 ? reportUpdates : changedRepos, loadoutChanges);
      fs.writeFileSync(opts.reportPath, md);
      console.log(`✓ Wrote sync report to ${opts.reportPath}`);
    }
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`✗ ${err.stack || err.message || err}`);
  process.exit(1);
});
