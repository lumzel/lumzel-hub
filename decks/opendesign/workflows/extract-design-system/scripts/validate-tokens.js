// QuickJS helper for extract-design-system workflow.

export async function probeSource(ctx) {
  const kind = String(ctx.inputs?.sourceKind || 'brief').trim();
  const value = String(ctx.inputs?.sourceValue || '').trim();
  const outDir = String(ctx.inputs?.outDir || '').trim();

  if (kind === 'codebase') {
    ctx.log(`Prepared codebase extraction for target "${value || '.'}"`);
    return {
      kind,
      value: value || '.',
      outDir,
      fetched: false,
      snippet: '',
    };
  }

  if (kind === 'url' && /^https?:\/\//i.test(value)) {
    const safeUrl = value.replace(/'/g, "'\\''");
    let html = '';
    let fetchedOk = false;
    try {
      const res = await ctx.sh(`curl -sL --max-time 10 '${safeUrl}' | head -c 16000`);
      html = (res && res.stdout) || '';
      fetchedOk = Boolean(res && res.ok && html.length > 0);
    } catch {
      html = '';
      fetchedOk = false;
    }
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const vars = Array.from(new Set((html.match(/--[a-z0-9-]+/gi) || []).slice(0, 30)));
    const colors = Array.from(new Set((html.match(/#[0-9a-f]{3,8}\b/gi) || []).slice(0, 30)));
    ctx.log(`Probed URL ${value}: ok=${fetchedOk}, bytes=${html.length}`);
    return {
      kind,
      value,
      outDir,
      fetched: fetchedOk,
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
    const requiredSections = [
      { label: 'Color', re: /color|色彩|颜色|调色板/i },
      { label: 'Typography', re: /typography|字体|排版/i },
      { label: 'Spacing', re: /spacing|间距|圆角/i },
      { label: 'Anti-Patterns', re: /anti|禁忌|反模式|避免/i },
    ];
    for (const section of requiredSections) {
      if (!section.re.test(designMd)) {
        errors.push(`DESIGN.md should document "${section.label}"`);
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
