#!/usr/bin/env node
/**
 * Inject an idempotent Lumzel reply bridge into a rendered standalone HTML file
 * (such as upstream `answer-me-with-html` output) so `# Re:` replies route
 * directly to Lumzel's native Session reply dialog while keeping clipboard
 * fallback outside Lumzel.
 *
 * Usage:
 *   node scripts/bridge-reply.mjs <path/to/page.html>
 */
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node bridge-reply.mjs <path/to/page.html>');
  process.exit(1);
}

const filePath = path.resolve(target);
let html = fs.readFileSync(filePath, 'utf8');

const MARKER = 'data-lumzel-reply-bridge';
if (html.includes(MARKER)) {
  process.exit(0);
}

const BRIDGE_SCRIPT = `<script ${MARKER}>
(() => {
  if (window.parent === window) return;
  let hostCanReply = false;
  const pending = new Map();

  window.addEventListener('message', (event) => {
    if (event.source && event.source !== window.parent) return;
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'lumzel:preview-host-ready' && Array.isArray(data.capabilities)) {
      hostCanReply = data.capabilities.includes('reply');
      return;
    }
    if (data.type === 'lumzel:html-reply-ack' && data.requestId && pending.has(data.requestId)) {
      const resolve = pending.get(data.requestId);
      pending.delete(data.requestId);
      resolve(data);
    }
  });

  window.parent.postMessage({ type: 'lumzel:preview-ping' }, '*');

  const sendReply = (text) => {
    const requestId = 'am-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const title = document.querySelector('h1')?.textContent?.trim() || document.title || 'Reply';
    return new Promise((resolve) => {
      pending.set(requestId, resolve);
      window.parent.postMessage({ type: 'lumzel:html-reply', requestId, title, text }, '*');
    });
  };

  const origClipboard = navigator.clipboard;
  const origWriteText = origClipboard && typeof origClipboard.writeText === 'function'
    ? origClipboard.writeText.bind(origClipboard)
    : null;

  const bridgedWriteText = async (raw) => {
    const text = String(raw ?? '');
    if (hostCanReply && /^#\\s*Re:/i.test(text.trim())) {
      const ack = await sendReply(text);
      if (ack && ack.ok) return;
      if (ack && ack.status === 'cancelled') return;
    }
    if (origWriteText) return origWriteText(text);
    throw new Error('Clipboard API unavailable');
  };

  try {
    if (origClipboard && origWriteText) {
      Object.defineProperty(origClipboard, 'writeText', {
        configurable: true,
        writable: true,
        value: bridgedWriteText,
      });
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: bridgedWriteText },
      });
    }
  } catch {
    // Keep native clipboard behavior if navigator.clipboard is non-configurable.
  }
})();
</script>`;

if (/<\/body>/i.test(html)) {
  html = html.replace(/<\/body>/i, `${BRIDGE_SCRIPT}\n</body>`);
} else {
  html += `\n${BRIDGE_SCRIPT}\n`;
}

fs.writeFileSync(filePath, html, 'utf8');
