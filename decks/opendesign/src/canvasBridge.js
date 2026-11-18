// Helpers for rendering HTML artifacts in the canvas iframe, parsing/serializing CSS tokens,
// and baking standalone HTML exports.

export const TOKEN_DEFAULTS = {
  '--od-bg': '#fbfbfb',
  '--od-surface': '#ffffff',
  '--od-surface-2': '#f4f4f5',
  '--od-fg': '#09090b',
  '--od-muted': '#64636e',
  '--od-accent': '#0070e3',
  '--od-accent-fg': '#ffffff',
  '--od-border': '#e4e4e7',
  '--od-radius': '8px',
  '--od-space': '16px',
  '--od-font-scale': '1',
  '--od-font-sans': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
  '--od-font-mono': "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

export function parseTokensCss(cssText = '') {
  const vars = { ...TOKEN_DEFAULTS };
  const re = /(--od-[a-z0-9-]+)\s*:\s*([^;}\n]+)\s*;?/gi;
  let m;
  while ((m = re.exec(cssText)) !== null) {
    vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

export function serializeTokensCss(vars = {}) {
  const merged = { ...TOKEN_DEFAULTS, ...vars };
  const lines = Object.entries(merged).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function normalizeHex(value, fallback = '#0070e3') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return fallback;
}

export function parsePx(value, fallback = 8) {
  const n = parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : fallback;
}

export function buildTweaksBlock(tweaks = {}) {
  const entries = Object.entries(tweaks).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return `:root {\n${entries.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
}

/**
 * Prepares HTML for `srcdoc` mode (used in Market Preview or non-`docs/` artifact paths).
 * Because `DECK_CSP` and `MARKET_PREVIEW_CSP` forbid `'unsafe-inline'` scripts inside `srcdoc`,
 * inline `<script>...</script>` tags are stripped here and the external `runtime/worktree.js`
 * script is linked cleanly via same-origin URL.
 * Real `docs/` artifacts in an installed Deck run via `worktree/docs/...` where `DECK_WORKTREE_CSP`
 * permits `'unsafe-inline'` scripts and Lumzel auto-appends `runtime/worktree.js`.
 */
export function buildSrcdocHtml(rawHtml, tokensCss = '', tweaks = {}) {
  const safeBody = String(rawHtml || '<!doctype html><html><body></body></html>').replace(
    /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,
    '',
  );
  const bridgeUrl = new URL('runtime/worktree.js', window.location.href).href;
  const tweaksCss = buildTweaksBlock(tweaks);
  const injection = [
    tokensCss ? `<style id="od-system-tokens">\n${tokensCss}\n</style>` : '',
    tweaksCss ? `<style id="od-tweaks">\n${tweaksCss}\n</style>` : '',
    `<script src="${bridgeUrl}"></script>`,
  ]
    .filter(Boolean)
    .join('\n');

  if (/<\/head>/i.test(safeBody)) {
    return safeBody.replace(/<\/head>/i, `${injection}\n</head>`);
  }
  if (/<\/body>/i.test(safeBody)) {
    return safeBody.replace(/<\/body>/i, `${injection}\n</body>`);
  }
  return `${safeBody}\n${injection}`;
}

/**
 * Bakes active tokens.css and tweaks overrides into a standalone exportable HTML document.
 * Preserves the artifact's own scripts and removes any temporary preview bridge tags.
 */
export function buildStandaloneHtml(rawHtml, tokensCss = '', tweaks = {}) {
  let html = String(rawHtml || '').replace(/<script[^>]+runtime\/worktree\.js[^>]*><\/script>\s*/gi, '');
  const tweaksCss = buildTweaksBlock(tweaks);
  const combinedCss = [tokensCss.trim(), tweaksCss.trim()].filter(Boolean).join('\n');
  if (!combinedCss) return html;

  const styleTag = `<style id="od-system-tokens">\n${combinedCss}\n</style>`;
  if (/<style\s+id=["']od-system-tokens["'][^>]*>[\s\S]*?<\/style>/i.test(html)) {
    html = html.replace(/<style\s+id=["']od-system-tokens["'][^>]*>[\s\S]*?<\/style>/i, styleTag);
  } else if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${styleTag}\n</head>`);
  } else {
    html = `${styleTag}\n${html}`;
  }
  return html;
}
