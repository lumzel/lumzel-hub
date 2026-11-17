// QuickJS deterministic helper & anti-slop linter for OpenDesign artifacts.

const SLOP_PATTERNS = [
  { id: 'lorem-ipsum', re: /\blorem\s+ipsum\b/i, message: 'Contains Lorem ipsum placeholder text' },
  { id: 'acme-filler', re: /\bacme\s+(corp|inc|co)\b/i, message: 'Contains generic Acme placeholder name' },
  { id: 'john-doe', re: /\b(john|jane)\s+doe\b/i, message: 'Contains generic John/Jane Doe placeholder' },
  { id: 'tbd-marker', re: /\b(?:TODO|FIXME)\s*:|\bTBD\b/, message: 'Contains unfinished TODO/FIXME/TBD marker' },
  { id: 'external-cdn', re: /https?:\/\/(cdn\.tailwindcss\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com)/i, message: 'References external CDN/font URL (artifacts must be self-contained offline)' },
];

export function loadDesignContext(ctx) {
  const dsPath = String(ctx.inputs?.designSystemPath || '').trim();
  const tkPath = String(ctx.inputs?.tokensPath || '').trim();
  const designMd = dsPath ? ctx.fsReadOrEmpty(dsPath) : '';
  const tokensCss = tkPath ? ctx.fsReadOrEmpty(tkPath) : '';
  const rootDesignMd = ctx.fsReadOrEmpty('DESIGN.md');
  ctx.log(`Loaded design context (designMd=${designMd.length}B, tokensCss=${tokensCss.length}B)`);
  return {
    hasSystem: Boolean(designMd.trim() || tokensCss.trim()),
    designMd: designMd || rootDesignMd || '',
    tokensCss: tokensCss || '',
  };
}

export function prepareRevision(ctx) {
  const sourcePath = String(ctx.inputs?.sourcePath || ctx.inputs?.targetPath || '').trim();
  const dsPath = String(ctx.inputs?.designSystemPath || '').trim();
  const tkPath = String(ctx.inputs?.tokensPath || '').trim();
  const html = sourcePath ? ctx.fsReadOrEmpty(sourcePath) : '';
  const designMd = dsPath ? ctx.fsReadOrEmpty(dsPath) : '';
  const tokensCss = tkPath ? ctx.fsReadOrEmpty(tkPath) : '';

  let comments = [];
  try {
    const parsed = JSON.parse(String(ctx.inputs?.commentsJson || '[]'));
    if (Array.isArray(parsed)) comments = parsed;
  } catch {
    comments = [];
  }

  let tweaks = {};
  try {
    const parsed = JSON.parse(String(ctx.inputs?.tweakOverridesJson || '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) tweaks = parsed;
  } catch {
    tweaks = {};
  }

  const checklist = comments.map((c, idx) => {
    const target = c.oid ? `[data-od-id="${c.oid}"]` : c.selector || 'canvas';
    return `${idx + 1}. Target ${target} (${c.tag || 'element'}): ${c.note || ''}`;
  });

  const tweakLines = Object.entries(tweaks).map(([k, v]) => `${k}: ${v};`);

  return {
    sourceExists: html.length > 0,
    sourceBytes: html.length,
    commentCount: comments.length,
    tweakCount: tweakLines.length,
    checklistText: checklist.length ? checklist.join('\n') : '(No pinned element comments)',
    tweaksCssText: tweakLines.length ? tweakLines.join('\n') : '(No CSS token overrides)',
    designMd,
    tokensCss,
  };
}

export function lintArtifact(ctx) {
  const targetPath = String(ctx.inputs?.targetPath || '').trim();
  const html = targetPath ? ctx.fsReadOrEmpty(targetPath) : '';

  if (!html.trim()) {
    return {
      ok: false,
      score: 0,
      oidCount: 0,
      bytes: 0,
      issues: [{ severity: 'error', id: 'missing-file', message: `Artifact file not found or empty at ${targetPath}` }],
      summary: `Missing artifact at ${targetPath}`,
    };
  }

  const issues = [];
  if (!/<!doctype\s+html>/i.test(html)) {
    issues.push({ severity: 'warn', id: 'doctype', message: 'Missing <!doctype html> declaration' });
  }
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    issues.push({ severity: 'error', id: 'viewport', message: 'Missing responsive <meta name="viewport"> tag' });
  }
  if (!/<style[\s>]/i.test(html)) {
    issues.push({ severity: 'error', id: 'inline-style', message: 'Missing inline <style> block' });
  }

  const oidMatches = html.match(/data-od-id=["']([a-z0-9][a-z0-9-_]*)["']/gi) || [];
  const oidSet = new Set(oidMatches.map((m) => m.toLowerCase()));
  if (oidSet.size < 4) {
    issues.push({
      severity: 'error',
      id: 'od-id-coverage',
      message: `Only ${oidSet.size} unique data-od-id element(s) found; tag at least 4 structural/interactive elements for canvas Inspect & Comment`,
    });
  }

  if (!/--od-(bg|surface|fg|accent)/.test(html)) {
    issues.push({
      severity: 'warn',
      id: 'od-tokens',
      message: 'Artifact does not reference --od-* design system custom properties',
    });
  }

  for (const rule of SLOP_PATTERNS) {
    if (rule.re.test(html)) {
      issues.push({ severity: 'error', id: rule.id, message: rule.message });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;
  const score = Math.max(0, 100 - errorCount * 18 - warnCount * 6);
  const ok = errorCount === 0;

  ctx.log(`Lint ${targetPath}: ok=${ok} score=${score} oids=${oidSet.size} errors=${errorCount} warns=${warnCount}`);

  return {
    ok,
    score,
    oidCount: oidSet.size,
    bytes: html.length,
    issues,
    summary: issues.length ? issues.map((i) => `[${i.severity}] ${i.message}`).join('; ') : 'All deterministic checks passed',
  };
}

export function finalizeArtifact(ctx) {
  const targetPath = String(ctx.inputs?.targetPath || '').trim();
  const lint = ctx.outputs?.lint_artifact || ctx.outputs?.lint_revision || {};
  const critique = ctx.outputs?.critique_artifact || null;
  const html = targetPath ? ctx.fsReadOrEmpty(targetPath) : '';

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return {
    artifactId: ctx.inputs?.artifactId || '',
    targetPath,
    title: titleMatch ? titleMatch[1].trim() : ctx.inputs?.title || '',
    bytes: html.length,
    oidCount: lint.oidCount || 0,
    lintOk: Boolean(lint.ok),
    lintScore: typeof lint.score === 'number' ? lint.score : 0,
    critiqueScore: critique && typeof critique.score === 'number' ? critique.score : null,
    critiqueSummary: critique && critique.summary ? critique.summary : null,
    rounds: ctx.round || 0,
  };
}
