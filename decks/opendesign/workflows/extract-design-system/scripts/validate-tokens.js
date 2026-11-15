// QuickJS helper for extract-design-system workflow.

export function probeSource(ctx) {
  const kind = String(ctx.inputs?.sourceKind || 'brief').trim();
  const value = String(ctx.inputs?.sourceValue || '').trim();
  const outDir = String(ctx.inputs?.outDir || '').trim();

  if (kind === 'codebase') {
    const pkg = ctx.fsReadOrEmpty('package.json');
    const designMd = ctx.fsReadOrEmpty('DESIGN.md');
    const ls = ctx.sh('ls -la');
    ctx.log(`Probed codebase for design system extraction`);
    return {
      kind,
      value,
      outDir,
      hasPackageJson: pkg.length > 0,
      hasExistingDesignMd: designMd.length > 0,
      snippet: (pkg || designMd || ls.stdout || '').slice(0, 2500),
    };
  }

  if (kind === 'url' && /^https?:\/\//i.test(value)) {
    const safeUrl = value.replace(/'/g, "'\\''");
    const res = ctx.sh(`curl -sL --max-time 10 '${safeUrl}' | head -c 16000`);
    const html = res.stdout || '';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const vars = Array.from(new Set((html.match(/--[a-z0-9-]+/gi) || []).slice(0, 30)));
    const colors = Array.from(new Set((html.match(/#[0-9a-f]{3,8}\b/gi) || []).slice(0, 30)));
    ctx.log(`Probed URL ${value}: ok=${res.ok}, bytes=${html.length}`);
    return {
      kind,
      value,
      outDir,
      fetched: res.ok && html.length > 0,
      title: titleMatch ? titleMatch[1].trim() : '',
      cssVars: vars,
      hexColors: colors,
      snippet: html.slice(0, 2500),
    };
  }

  return {
    kind,
    value,
    outDir,
    fetched: false,
    snippet: value,
  };
}

export function validateSystem(ctx) {
  const outDir = String(ctx.inputs?.outDir || '').replace(/\/+$/, '');
  const designMd = ctx.fsReadOrEmpty(`${outDir}/DESIGN.md`);
  const tokensCss = ctx.fsReadOrEmpty(`${outDir}/tokens.css`);

  const errors = [];
  if (!designMd.trim()) {
    errors.push(`Missing ${outDir}/DESIGN.md`);
  } else {
    for (const section of ['Color', 'Typography', 'Spacing', 'Anti']) {
      if (!new RegExp(section, 'i').test(designMd)) {
        errors.push(`DESIGN.md should document "${section}"`);
      }
    }
  }

  const tokenMatches = tokensCss.match(/--od-[a-z0-9-]+\s*:\s*[^;]+;/gi) || [];
  const tokens = {};
  for (const decl of tokenMatches) {
    const idx = decl.indexOf(':');
    if (idx > 0) {
      const k = decl.slice(0, idx).trim();
      const v = decl.slice(idx + 1).replace(/;$/, '').trim();
      tokens[k] = v;
    }
  }

  for (const required of ['--od-bg', '--od-surface', '--od-fg', '--od-accent', '--od-border']) {
    if (!tokens[required]) {
      errors.push(`tokens.css is missing required variable ${required}`);
    }
  }

  const ok = errors.length === 0;
  ctx.log(`Validated design system at ${outDir}: ok=${ok}, tokens=${Object.keys(tokens).length}`);

  return {
    ok,
    outDir,
    tokenCount: Object.keys(tokens).length,
    tokens,
    errors,
    summary: ok ? 'Design system valid' : errors.join('; '),
  };
}

export function finalizeSystem(ctx) {
  const outDir = String(ctx.inputs?.outDir || '').replace(/\/+$/, '');
  const val = ctx.outputs?.validate_tokens || {};
  return {
    slug: ctx.inputs?.slug || '',
    name: ctx.inputs?.name || '',
    outDir,
    designMdPath: `${outDir}/DESIGN.md`,
    tokensCssPath: `${outDir}/tokens.css`,
    ok: Boolean(val.ok),
    tokenCount: val.tokenCount || 0,
    tokens: val.tokens || {},
  };
}
