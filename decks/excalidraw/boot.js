// Must load before vendor/excalidraw.js so Excalidraw resolves local .woff2 fonts offline.
window.EXCALIDRAW_ASSET_PATH = new URL('./vendor/', window.location.href).href;
