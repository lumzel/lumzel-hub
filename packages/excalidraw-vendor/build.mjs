import esbuild from 'esbuild';
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../decks/excalidraw/vendor');
const excalidrawProd = path.join(here, 'node_modules/@excalidraw/excalidraw/dist/prod');

const KEEP_LOCALE_PREFIXES = ['en-', 'zh-CN-', 'zh-TW-'];

const trimLocalesPlugin = {
  name: 'trim-locales',
  setup(build) {
    build.onResolve({ filter: /[\/\\]locales[\/\\][^/\\]+\.js$/ }, args => {
      const base = path.basename(args.path);
      if (KEEP_LOCALE_PREFIXES.some(prefix => base.startsWith(prefix))) return null;
      return { path: base, namespace: 'empty-locale' };
    });
    build.onLoad({ filter: /.*/, namespace: 'empty-locale' }, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
};

const stubMermaidPlugin = {
  name: 'stub-mermaid',
  setup(build) {
    build.onResolve({ filter: /^@excalidraw\/mermaid-to-excalidraw$/ }, args => ({
      path: args.path,
      namespace: 'stub-mermaid',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub-mermaid' }, () => ({
      contents: 'export async function parseMermaidToExcalidraw() { throw new Error("Mermaid import is disabled in this offline Deck bundle."); }',
      loader: 'js',
    }));
  },
};

const offlineFontUrlsPlugin = {
  name: 'offline-font-urls',
  setup(build) {
    build.onLoad({ filter: /@excalidraw[\/\\]excalidraw[\/\\]dist[\/\\]prod[\/\\]chunk-.*\.js$/ }, async args => {
      const { readFile } = await import('node:fs/promises');
      let contents = await readFile(args.path, 'utf8');
      if (contents.includes('ASSETS_FALLBACK_URL')) {
        // Only use ASSETS_FALLBACK_URL if EXCALIDRAW_ASSET_PATH did not provide any local URLs;
        // WebKit enforces font-src CSP on every url() listed in a FontFace source string.
        const patched = contents.replace(
          /return\s+([A-Za-z_$][\w$]*)\.push\(new URL\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\.ASSETS_FALLBACK_URL\)\),\1/,
          'return $1.length||$1.push(new URL($2,$3.ASSETS_FALLBACK_URL)),$1',
        );
        if (patched === contents) {
          throw new Error(`Failed to patch ASSETS_FALLBACK_URL in ${args.path}`);
        }
        contents = patched;
      }
      return { contents, loader: 'js' };
    });
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await esbuild.build({
  entryPoints: { excalidraw: path.join(here, 'entry.jsx') },
  outdir: outDir,
  bundle: true,
  format: 'esm',
  splitting: true,
  minify: true,
  sourcemap: false,
  target: ['safari16', 'chrome110'],
  conditions: ['production'],
  jsx: 'automatic',
  external: ['./fonts/*'],
  plugins: [trimLocalesPlugin, stubMermaidPlugin, offlineFontUrlsPlugin],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  loader: {
    '.svg': 'dataurl',
    '.png': 'dataurl',
  },
  logLevel: 'info',
});

// Copy Excalidraw runtime fonts into vendor/fonts/ so EXCALIDRAW_ASSET_PATH + excalidraw.css resolve offline.
await cp(path.join(excalidrawProd, 'fonts'), path.join(outDir, 'fonts'), { recursive: true });

let files = 0;
let bytes = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) {
      files += 1;
      bytes += (await stat(full)).size;
    }
  }
}
await walk(outDir);
console.log(`Built vendor bundle at ${outDir}: ${files} files, ${(bytes / (1024 * 1024)).toFixed(2)} MB`);
