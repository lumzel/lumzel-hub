import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

import { STRINGS, applyI18n, getLocale, setLocale, t } from '../src/i18n.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR = path.resolve(HERE, '..');

function extractVars(str) {
  return [...String(str).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
}

test('STRINGS.en and STRINGS.zh have identical keys and template variables', () => {
  const enKeys = Object.keys(STRINGS.en).sort();
  const zhKeys = Object.keys(STRINGS.zh).sort();
  assert.deepEqual(enKeys, zhKeys, 'STRINGS.en and STRINGS.zh keys must stay in sync');

  for (const key of enKeys) {
    assert.deepEqual(
      extractVars(STRINGS.en[key]),
      extractVars(STRINGS.zh[key]),
      `Template variables mismatch for key "${key}"`,
    );
  }
});

test('index.html defaults to English and all data-i18n* keys exist in STRINGS', () => {
  const html = fs.readFileSync(path.join(DECK_DIR, 'index.html'), 'utf8');
  const { document } = parseHTML(html);
  assert.equal(document.documentElement.getAttribute('lang'), 'en');
  assert.equal(document.title, 'Spec Workbench');

  const keys = new Set();
  for (const el of document.querySelectorAll('[data-i18n]')) keys.add(el.getAttribute('data-i18n'));
  for (const el of document.querySelectorAll('[data-i18n-title]')) keys.add(el.getAttribute('data-i18n-title'));
  for (const el of document.querySelectorAll('[data-i18n-aria]')) keys.add(el.getAttribute('data-i18n-aria'));
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) keys.add(el.getAttribute('data-i18n-placeholder'));

  assert.ok(keys.size > 0);
  for (const key of keys) {
    assert.ok(key in STRINGS.en, `Missing STRINGS.en key for index.html: ${key}`);
    assert.ok(key in STRINGS.zh, `Missing STRINGS.zh key for index.html: ${key}`);
  }
});

test('setLocale, getLocale, t, and applyI18n switch between en and zh cleanly', () => {
  const prevDoc = globalThis.document;
  const html = fs.readFileSync(path.join(DECK_DIR, 'index.html'), 'utf8');
  const { document } = parseHTML(html);
  globalThis.document = document;

  try {
    setLocale('en-US');
    assert.equal(getLocale(), 'en');
    assert.equal(t('ticketTotal', { n: 4 }), '4 total');
    applyI18n(document);
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(document.title, 'Spec Workbench');
    assert.equal(document.querySelector('[data-i18n="featuresHeader"]')?.textContent, 'Features');

    assert.equal(setLocale('zh-CN'), true);
    assert.equal(getLocale(), 'zh');
    assert.equal(t('ticketTotal', { n: 4 }), '共 4 张');
    applyI18n(document);
    assert.equal(document.documentElement.lang, 'zh');
    assert.equal(document.title, '方案工作台');
    assert.equal(document.querySelector('[data-i18n="featuresHeader"]')?.textContent, '需求列表');

    assert.equal(setLocale('fr-FR'), true);
    assert.equal(getLocale(), 'en');
    applyI18n(document);
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(document.querySelector('[data-i18n="featuresHeader"]')?.textContent, 'Features');
  } finally {
    setLocale('en');
    globalThis.document = prevDoc;
  }
});

function runRuntimeScript(scriptPath, html, search) {
  const code = fs.readFileSync(scriptPath, 'utf8');
  const { document } = parseHTML(html);
  const listeners = new Map();
  const win = {
    parent: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    scrollTo() {},
  };
  win.parent = win;
  const loc = new URL(`http://localhost/sample/docs/features/invoice-cache/design.html${search}`);
  const context = {
    document,
    window: win,
    location: loc,
    navigator: { language: 'en-US' },
    matchMedia: () => ({ matches: false }),
    URLSearchParams,
    URL,
    requestAnimationFrame: cb => cb(),
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(code, context);
  const dispatchMessage = data => {
    for (const fn of listeners.get('message') || []) fn({ data });
  };
  return { document, dispatchMessage };
}

test('runtime/doc.js renders Ticket / 工单 trace chips per ?lang= and updates live on doc:locale', () => {
  const docHtml =
    '<!doctype html><html lang="en" data-doc-id="invoice-cache"><body>' +
    '<div data-doc-node="read" data-doc-status="done"><span data-doc-label>Read Cache</span></div>' +
    '</body></html>';
  const trace = {
    nodes: { read: { t: ['docs/features/invoice-cache/tickets/01-read-path.html'] } },
    tickets: {
      'docs/features/invoice-cache/tickets/01-read-path.html': { n: '01', title: '01 Read Path' },
    },
  };

  const enRun = runRuntimeScript(path.join(DECK_DIR, 'runtime/doc.js'), docHtml, '?theme=light&lang=en');
  enRun.dispatchMessage({ type: 'doc:trace', trace });
  assert.equal(enRun.document.querySelector('.lumzel-trace button')?.textContent, 'Ticket 01');

  enRun.dispatchMessage({ type: 'doc:locale', locale: 'zh-CN' });
  assert.equal(enRun.document.querySelector('.lumzel-trace button')?.textContent, '工单 01');

  const zhRun = runRuntimeScript(path.join(DECK_DIR, 'runtime/doc.js'), docHtml, '?theme=light&lang=zh');
  zhRun.dispatchMessage({ type: 'doc:trace', trace });
  assert.equal(zhRun.document.querySelector('.lumzel-trace button')?.textContent, '工单 01');
});

test('runtime/prototype.js renders Link Design / 设计联动 per ?lang= and updates live on doc:locale', () => {
  const protoHtml =
    '<!doctype html><html lang="en"><body>' +
    '<section data-doc-screen="pick" data-doc-title="Pick"><p data-doc-intro>Pick</p></section>' +
    '</body></html>';

  const enRun = runRuntimeScript(path.join(DECK_DIR, 'runtime/prototype.js'), protoHtml, '?embed=1&theme=light&lang=en');
  const enBtn = enRun.document.querySelector('.lumzel-proto-bar button');
  assert.equal(enBtn?.textContent, 'Link Design');

  enRun.dispatchMessage({ type: 'doc:locale', locale: 'zh-CN' });
  assert.equal(enBtn?.textContent, '设计联动');

  const zhRun = runRuntimeScript(path.join(DECK_DIR, 'runtime/prototype.js'), protoHtml, '?embed=1&theme=light&lang=zh');
  assert.equal(zhRun.document.querySelector('.lumzel-proto-bar button')?.textContent, '设计联动');
});
