#!/usr/bin/env node
// Renders the cover of every Deck in this repository: decks/<id>/preview/cover-{light,dark}.webp.
//
// Each Deck is loaded the way Lumzel shows it from the market before it is installed: in an iframe
// with sandbox="allow-scripts", on a bridge that answers `context()` with `preview: true` and refuses
// every other call. A Deck that wants a good cover draws sample data when it sees `preview`.
//
//   node tools/render-previews.mjs [deck-id ...] [--browser webkit|chromium|chrome]
//
// The window is 800×500 at 2x unless the Deck's marketplace.json entry names "coverViewport".
//
// Needs `playwright` (and its browser) and the `cwebp` command. Lumzel renders Decks in WebKit, so
// the workflow uses webkit on macOS: the same engine and the same system fonts.
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args.splice(at, 2)[1];
};
const browserName = flag('--browser') ?? 'webkit';
const VIEW = { width: 800, height: 500 };
const SCALE = 2;
const QUALITY = '80';
const THEMES = ['light', 'dark'];
const LOCALES = [
  { id: 'en', suffix: '' },
  { id: 'zh-CN', suffix: '.zh-CN' },
];
const DEFAULT_THEME_PRESET = 'lumzel';
// Matches Lumzel's default `lumzel` theme (`buildHostThemeTokens` in apps/desktop/src/lib/theme.ts).
const DEFAULT_THEME_TOKENS = {
  light: {
    '--deck-bg': '#fbf9f6',
    '--deck-surface': '#ffffff',
    '--deck-surface-subtle': '#f3efe9',
    '--deck-surface-hover': '#f6f3ee',
    '--deck-border': 'rgba(42, 32, 22, 0.075)',
    '--deck-border-strong': 'rgba(42, 32, 22, 0.12)',
    '--deck-text': '#1b1714',
    '--deck-text-secondary': '#5c554e',
    '--deck-muted': '#8a837b',
    '--deck-accent': '#1b1714',
    '--deck-accent-hover': '#000000',
    '--deck-accent-soft': 'rgba(199, 78, 36, 0.1)',
    '--deck-accent-contrast': '#fbf8f3',
    '--deck-ok': '#15803d',
    '--deck-err': '#b91c1c',
    '--deck-warn': '#b45309',
    '--deck-shadow': '0 1px 2px rgba(42, 32, 22, 0.04), 0 2px 8px -2px rgba(42, 32, 22, 0.05)',
    '--deck-shadow-lg':
      '0 0 0 1px rgba(42, 32, 22, 0.05), 0 8px 24px -6px rgba(42, 32, 22, 0.12), 0 32px 72px -16px rgba(42, 32, 22, 0.22)',
    '--shell': '#f3efe9',
    '--canvas': '#fbf9f6',
    '--surface': '#ffffff',
    '--surface-hover': '#f6f3ee',
    '--surface-selected': '#efebe5',
    '--border': 'rgba(42, 32, 22, 0.075)',
    '--border-strong': 'rgba(42, 32, 22, 0.12)',
    '--fg': '#1b1714',
    '--muted': '#5c554e',
    '--faint': '#8a837b',
    '--primary': '#1b1714',
    '--primary-fg': '#fbf8f3',
    '--primary-hover': '#000000',
    '--brand': '#c74e24',
    '--brand-soft': 'rgba(199, 78, 36, 0.1)',
    '--ring': '#c74e24',
    '--planned': '#8a837b',
    '--in-progress': '#c74e24',
    '--done': '#15803d',
    '--gate': '#b45309',
    '--changed': '#2563eb',
    '--drift': '#b91c1c',
  },
  dark: {
    '--deck-bg': '#141210',
    '--deck-surface': '#1a1715',
    '--deck-surface-subtle': '#0e0d0c',
    '--deck-surface-hover': '#211d1a',
    '--deck-border': 'rgba(243, 234, 219, 0.08)',
    '--deck-border-strong': 'rgba(243, 234, 219, 0.14)',
    '--deck-text': '#f3eadb',
    '--deck-text-secondary': '#a89e93',
    '--deck-muted': '#766d64',
    '--deck-accent': '#f3eadb',
    '--deck-accent-hover': '#ffffff',
    '--deck-accent-soft': 'rgba(232, 105, 59, 0.14)',
    '--deck-accent-contrast': '#12100e',
    '--deck-ok': '#34d399',
    '--deck-err': '#f87171',
    '--deck-warn': '#fbbf24',
    '--deck-shadow': '0 1px 2px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(243, 234, 219, 0.045)',
    '--deck-shadow-lg': '0 24px 64px rgba(0, 0, 0, 0.72), 0 4px 16px rgba(0, 0, 0, 0.46)',
    '--shell': '#0e0d0c',
    '--canvas': '#141210',
    '--surface': '#1a1715',
    '--surface-hover': '#211d1a',
    '--surface-selected': '#292420',
    '--border': 'rgba(243, 234, 219, 0.08)',
    '--border-strong': 'rgba(243, 234, 219, 0.14)',
    '--fg': '#f3eadb',
    '--muted': '#a89e93',
    '--faint': '#766d64',
    '--primary': '#f3eadb',
    '--primary-fg': '#12100e',
    '--primary-hover': '#ffffff',
    '--brand': '#e8693b',
    '--brand-soft': 'rgba(232, 105, 59, 0.14)',
    '--ring': '#e8693b',
    '--planned': '#766d64',
    '--in-progress': '#e8693b',
    '--done': '#34d399',
    '--gate': '#fbbf24',
    '--changed': '#60a5fa',
    '--drift': '#f87171',
  },
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

// The page that stands in for Lumzel: one sandboxed frame and the preview bridge.
const hostPage = (theme, title, locale) => {
  const polarity = theme === 'dark' ? 'dark' : 'light';
  const activeLocale = locale || 'en';
  const themeTokens = DEFAULT_THEME_TOKENS[polarity];
  return `<!doctype html><meta charset="utf-8">
<style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style>
<iframe id="deck" sandbox="allow-scripts"></iframe>
<script>
  const frame = document.getElementById('deck');
  const themeTokens = ${JSON.stringify(themeTokens)};
  const context = {
    project: 'Sample project',
    branch: 'main',
    theme: ${JSON.stringify(polarity)},
    themePreset: ${JSON.stringify(DEFAULT_THEME_PRESET)},
    themeTokens,
    deck: ${JSON.stringify(title)},
    locale: ${JSON.stringify(activeLocale)},
    preview: true,
  };
  addEventListener('message', event => {
    const message = event.data;
    if (event.source !== frame.contentWindow || !message || message.v !== 1) return;
    if (message.op === 'deck.error') return console.error('deck error: ' + message.args.message);
    const reply = message.op === 'ui.context'
      ? { ok: true, result: context }
      : { ok: false, error: 'PermissionDenied: preview' };
    frame.contentWindow.postMessage({ id: message.id, ...reply }, '*');
    if (message.op === 'ui.context') {
      frame.contentWindow.postMessage({
        event: 'theme.tokens',
        theme: context.theme,
        presetId: context.themePreset,
        tokens: themeTokens,
      }, '*');
    }
  });
  frame.src = new URLSearchParams(location.search).get('src');
</script>`;
};

// What Lumzel sends with every file of a previewed Deck (MARKET_PREVIEW_CSP in docserve.rs), with this
// server's origin in place of lumzel://market-preview: a Deck that needs more than this has no preview.
const deckCsp = origin =>
  [
    "default-src 'none'",
    `script-src 'self' ${origin}`,
    `style-src 'self' ${origin} 'unsafe-inline'`,
    `img-src 'self' ${origin} data: blob:`,
    `media-src 'self' ${origin} data: blob:`,
    `font-src 'self' ${origin}`,
    `frame-src 'self' ${origin}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://deck');
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/favicon.ico') return response.writeHead(204).end();
  if (url.pathname === '/__host') {
    response.setHeader('Content-Type', TYPES['.html']);
    return response.end(
      hostPage(url.searchParams.get('theme'), url.searchParams.get('title') ?? '', url.searchParams.get('locale') ?? 'en'),
    );
  }
  const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  const file =
    relative === 'sdk.js' || relative.startsWith('lib/')
      ? path.join(root, 'tools', relative)
      : path.join(root, 'decks', relative);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.setHeader('Content-Security-Policy', deckCsp(`http://${request.headers.host}`));
    response.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const { chromium, webkit } = await import('playwright');
const browser =
  browserName === 'webkit'
    ? await webkit.launch()
    : await chromium.launch(browserName === 'chrome' ? { channel: 'chrome' } : {});

async function measureThemeContrast(browser, lightBuffer, darkBuffer) {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  try {
    const lightUrl = `data:image/png;base64,${lightBuffer.toString('base64')}`;
    const darkUrl = `data:image/png;base64,${darkBuffer.toString('base64')}`;
    return await page.evaluate(
      async ([aUrl, bUrl]) => {
        const load = src =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to decode preview PNG'));
            img.src = src;
          });
        const [aImg, bImg] = await Promise.all([load(aUrl), load(bUrl)]);
        const w = 160;
        const h = 100;
        const sample = img => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          return ctx.getImageData(0, 0, w, h).data;
        };
        const a = sample(aImg);
        const b = sample(bImg);
        const pixels = w * h;
        let lumA = 0;
        let lumB = 0;
        let changed = 0;
        for (let i = 0; i < a.length; i += 4) {
          lumA += (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
          lumB += (0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]) / 255;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) {
            changed += 1;
          }
        }
        return {
          lightLum: lumA / pixels,
          darkLum: lumB / pixels,
          changedRatio: changed / pixels,
        };
      },
      [lightUrl, darkUrl],
    );
  } finally {
    await page.close();
  }
}

const ids = args.length ? args : (await readdir(path.join(root, 'decks'))).sort();
// A Deck with more on screen names a larger window in its marketplace.json entry: "coverViewport": [1200, 750].
const catalog = JSON.parse(await readFile(path.join(root, 'marketplace.json'), 'utf8'));
const viewportOf = id => {
  const [width, height] = catalog.decks?.find(entry => entry.id === id)?.coverViewport ?? [];
  return Number.isInteger(width) && Number.isInteger(height) ? { width, height } : VIEW;
};
const scratch = path.join(os.tmpdir(), `lumzel-hub-previews-${process.pid}`);
await mkdir(scratch, { recursive: true });
let failed = false;
for (const id of ids) {
  const folder = path.join(root, 'decks', id);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(folder, 'deck.json'), 'utf8'));
  } catch {
    continue; // not a Deck folder
  }
  await mkdir(path.join(folder, 'preview'), { recursive: true });
  for (const loc of LOCALES) {
    const pngBuffers = {};
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: viewportOf(id), deviceScaleFactor: SCALE, colorScheme: theme });
      const errors = [];
      page.on('console', message => message.type() === 'error' && errors.push(message.text()));
      const src = `/${id}/${manifest.entry ?? 'index.html'}`;
      const query = new URLSearchParams({ theme, title: manifest.title ?? id, locale: loc.id, src });
      await page.goto(`${origin}/__host?${query}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600); // module scripts and the first context() round trip
      const png = path.join(scratch, `${id}-${theme}${loc.suffix}.png`);
      pngBuffers[theme] = await page.screenshot({ path: png });
      await page.close();
      const out = path.join(folder, 'preview', `cover-${theme}${loc.suffix}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', QUALITY, png, '-o', out]);
      const kb = ((await stat(out)).size / 1024).toFixed(1);
      console.log(`${path.relative(root, out)}  ${kb} KB${errors.length ? `  (${errors.length} page error)` : ''}`);
      for (const error of errors) console.log(`  ! ${error}`);
      failed ||= errors.length > 0;
    }
    if (pngBuffers.light && pngBuffers.dark) {
      const { lightLum, darkLum, changedRatio } = await measureThemeContrast(browser, pngBuffers.light, pngBuffers.dark);
      const themeOk = changedRatio >= 0.05 && darkLum < lightLum && darkLum < 0.55;
      if (!themeOk) {
        console.log(
          `  ! [${id}:${loc.id}] light/dark theme contrast check failed (lightLum=${lightLum.toFixed(3)}, darkLum=${darkLum.toFixed(3)}, diff=${(changedRatio * 100).toFixed(1)}%)`,
        );
        failed = true;
      }
    }
  }
}
await browser.close();
server.close();
await rm(scratch, { recursive: true, force: true });
// A Deck that throws while it is previewed or ignores light/dark themes has a broken cover: fail so it is noticed.
process.exit(failed ? 1 : 0);
