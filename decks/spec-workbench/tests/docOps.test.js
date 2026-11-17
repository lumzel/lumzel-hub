import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

import {
  applyDesignStatus,
  applyTicketDone,
  buildDesignReplyPrompt,
  buildTicketsReplyPrompt,
  deriveFeatureTitle,
  extractDocCreatedAttr,
  featureTimeInfo,
  formatShortTime,
  generateFeatureId,
  parseDesignDocQuestions,
  parseTicketChoices,
  removeDesignTicketItem,
  slugifyFeatureId,
  sortFeaturesDesc,
  syncDesignTicketItem,
} from '../src/docOps.js';
import {
  SAMPLE_DOCS,
  SAMPLE_DOCS_EN,
  SAMPLE_INDEX,
  SAMPLE_INDEX_EN,
  getSampleData,
} from '../src/sample.js';
import { extractDoc, lintDoc } from '../../../../apps/desktop/src/deck/docModel/html.js';
import { buildTrace, ticketStatus } from '../../../../apps/desktop/src/deck/docModel/trace.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR = path.resolve(HERE, '..');

const parseHtml = html => parseHTML(html).document;

test('parseDesignDocQuestions extracts open & settled decisions accurately', () => {
  const draftHtml = fs.readFileSync(
    path.join(DECK_DIR, 'sample/docs/features/pdf-export/design.html'),
    'utf8',
  );
  const parsedDraft = parseDesignDocQuestions(draftHtml, { parseHtml });
  assert.equal(parsedDraft.open.length, 2);
  assert.equal(parsedDraft.settled.length, 0);
  assert.equal(parsedDraft.hasTicketsBlock, false);
  assert.equal(parsedDraft.open[0].id, 'where');
  assert.equal(parsedDraft.open[0].question, '在哪里生成？');
  assert.equal(parsedDraft.open[0].recommend, '后台任务');
  assert.deepEqual(
    parsedDraft.open[0].options.map(o => o.label),
    ['请求里同步生成', '后台任务'],
  );
  assert.equal(parsedDraft.open[0].options[1].recommended, true);
  assert.deepEqual(parsedDraft.open[1].depends, ['where']);

  const confirmedHtml = fs.readFileSync(
    path.join(DECK_DIR, 'sample/docs/features/invoice-cache/design.html'),
    'utf8',
  );
  const parsedConfirmed = parseDesignDocQuestions(confirmedHtml, { parseHtml });
  assert.equal(parsedConfirmed.open.length, 0);
  assert.equal(parsedConfirmed.settled.length, 2);
  assert.equal(parsedConfirmed.hasTicketsBlock, true);
  assert.equal(parsedConfirmed.settled[0].answer, 'Redis');
});

test('parseTicketChoices extracts open choices from ticket scaffold', () => {
  const ticketHtml = fs.readFileSync(
    path.join(DECK_DIR, 'skills/spec-workbench-html/scaffolds/ticket.html'),
    'utf8',
  );
  const parsed = parseTicketChoices(ticketHtml, { parseHtml });
  assert.equal(parsed.open.length, 1);
  assert.equal(parsed.open[0].id, 'd-1');
  assert.equal(parsed.open[0].recommend, 'A');
  assert.deepEqual(
    parsed.open[0].options.map(o => o.label),
    ['A', 'B'],
  );
});

test('applyDesignStatus marks feature done and reopens cleanly while passing lintDoc', () => {
  const html = fs.readFileSync(
    path.join(DECK_DIR, 'sample/docs/features/invoice-cache/design.html'),
    'utf8',
  );

  const doneHtml = applyDesignStatus(html, 'done', '2026-11-16', { parseHtml });
  const doneDoc = parseHtml(doneHtml);
  const extractedDone = extractDoc(doneDoc);
  assert.equal(extractedDone.status, 'done');
  assert.equal(extractedDone.updated, '2026-11-16');
  assert.deepEqual(lintDoc(extractedDone), []);
  assert.equal(doneDoc.querySelector('.lumzel-hero .pill.s-done')?.textContent.trim(), 'done');

  const reopenedHtml = applyDesignStatus(doneHtml, 'confirmed', '2026-11-16', { parseHtml });
  const reopenedDoc = parseHtml(reopenedHtml);
  const extractedReopened = extractDoc(reopenedDoc);
  assert.equal(extractedReopened.status, 'confirmed');
  assert.deepEqual(lintDoc(extractedReopened), []);
  assert.equal(reopenedDoc.querySelector('.lumzel-hero .pill.s-confirmed')?.textContent.trim(), 'confirmed');
});

test('applyTicketDone & syncDesignTicketItem keep ticketStatus and design checklist in sync', () => {
  const ticketPath = 'docs/features/invoice-cache/tickets/02-miss-load.html';
  const ticketHtml = fs.readFileSync(path.join(DECK_DIR, 'sample', ticketPath), 'utf8');
  const designHtml = fs.readFileSync(
    path.join(DECK_DIR, 'sample/docs/features/invoice-cache/design.html'),
    'utf8',
  );

  const doneTicketHtml = applyTicketDone(ticketHtml, true, '2026-11-16', { parseHtml });
  const doneTicketIR = extractDoc(parseHtml(doneTicketHtml));
  assert.equal(ticketStatus(doneTicketIR), 'done');
  assert.deepEqual(lintDoc(doneTicketIR), []);

  const syncedDesignHtml = syncDesignTicketItem(designHtml, ticketPath, 'done', '2026-11-16', {
    parseHtml,
  });
  const syncedDesignDoc = parseHtml(syncedDesignHtml);
  const row = syncedDesignDoc.querySelector(`[data-doc-ticket="${ticketPath}"]`);
  assert.equal(row?.getAttribute('data-doc-status'), 'done');
  assert.equal(row?.querySelector('.pill')?.textContent.trim(), 'done');
  assert.deepEqual(lintDoc(extractDoc(syncedDesignDoc)), []);

  const revertedTicketHtml = applyTicketDone(doneTicketHtml, false, '2026-11-16', { parseHtml });
  assert.equal(ticketStatus(extractDoc(parseHtml(revertedTicketHtml))), 'planned');

  const emptyDoc = parseHtml(ticketHtml);
  const doneCheck = emptyDoc.querySelector('#done-when .check');
  if (doneCheck) doneCheck.innerHTML = '';
  const emptyDoneWhen = `<!doctype html>\n${emptyDoc.documentElement.outerHTML}\n`;
  const defaultEmptyDone = applyTicketDone(emptyDoneWhen, true, '2026-11-16', { parseHtml });
  assert.equal(parseHtml(defaultEmptyDone).querySelector('#done-when [data-doc-label]')?.textContent, 'Verified');
  const zhEmptyDone = applyTicketDone(emptyDoneWhen, true, '2026-11-16', { parseHtml, locale: 'zh-CN' });
  assert.equal(parseHtml(zhEmptyDone).querySelector('#done-when [data-doc-label]')?.textContent, '已完成验证');
});

test('sortFeaturesDesc orders features by newest timestamp first', () => {
  const features = [
    { id: 'older', updated: '2026-11-10' },
    { id: 'same-day-new', updated: '2026-11-12' },
    { id: 'same-day-old', updated: '2026-11-12' },
    { id: 'pending-newest', updated: '2026-11-16', pending: true },
  ];
  const metaMap = {
    'pending-newest': { createdAt: 1700100000000, updatedAt: 1700100000000 },
    'same-day-new': { createdAt: 1700000050000, updatedAt: 1700000050000 },
    'same-day-old': { createdAt: 1700000010000, updatedAt: 1700000010000 },
  };
  const mtimes = {
    older: 1699900000000,
    'same-day-new': 1700000060000,
    'same-day-old': 1700000020000,
  };
  const sorted = sortFeaturesDesc(features, metaMap, mtimes);
  assert.deepEqual(
    sorted.map(f => f.id),
    ['pending-newest', 'same-day-new', 'same-day-old', 'older'],
  );
});

test('sortFeaturesDesc defaults to created order and supports switching to updated order', () => {
  const oct27 = Date.parse('2026-10-27T00:00:00');
  const nov16Created = Date.parse('2026-11-16T21:03:00');
  const nov17Created = Date.parse('2026-11-17T10:00:00');
  const nov17Touched = Date.parse('2026-11-17T14:19:00');

  const features = [
    // Old disk feature touched by git pull/rebase at 14:19, plus legacy polluted meta.createdAt
    { id: 'html-deck', updated: '2026-10-27' },
    // Created via UI on Nov 16, later updated on Nov 17
    { id: 'ui-feature', updated: '2026-11-17' },
    // Created via CLI/chat with data-doc-created on Nov 17 10:00
    { id: 'cli-feature', updated: '2026-11-17' },
  ];
  const metaMap = {
    'html-deck': { createdAt: nov17Touched, updatedAt: nov17Touched },
    'ui-feature': { pending: false, brief: 'build theme', createdAt: nov16Created, updatedAt: nov17Touched - 60000 },
  };
  const mtimes = {
    'html-deck': nov17Touched,
    'ui-feature': nov17Touched - 60000,
    'cli-feature': nov17Created,
  };
  const docCreatedMap = {
    'cli-feature': '2026-11-17T10:00:00',
  };

  // Default ('created') keeps newest-created first and ignores git mtime / polluted meta
  const byCreated = sortFeaturesDesc(features, metaMap, mtimes, { docCreatedMap });
  assert.deepEqual(
    byCreated.map(f => f.id),
    ['cli-feature', 'ui-feature', 'html-deck'],
  );

  // Explicit 'updated' orders by latest mtime/updatedAt
  const byUpdated = sortFeaturesDesc(features, metaMap, mtimes, { sortBy: 'updated', docCreatedMap });
  assert.deepEqual(
    byUpdated.map(f => f.id),
    ['html-deck', 'ui-feature', 'cli-feature'],
  );

  // Date-only created docs format without a fake 00:00 clock suffix
  const htmlDeckCreated = featureTimeInfo(features[0], metaMap['html-deck'], mtimes['html-deck'], {
    sortBy: 'created',
  });
  assert.equal(htmlDeckCreated.ms, oct27);
  assert.equal(htmlDeckCreated.hasTime, false);
  assert.equal(formatShortTime(htmlDeckCreated.ms, features[0].updated, { hasTime: htmlDeckCreated.hasTime }), '2026-10-27');

  const uiCreated = featureTimeInfo(features[1], metaMap['ui-feature'], mtimes['ui-feature'], {
    sortBy: 'created',
  });
  assert.equal(uiCreated.ms, nov16Created);
  assert.equal(uiCreated.hasTime, true);
  assert.equal(formatShortTime(uiCreated.ms, features[1].updated, { hasTime: uiCreated.hasTime }), '2026-11-16 21:03');
});

test('extractDocCreatedAttr parses data-doc-created and legacy data-lumzel-created from html tag', () => {
  assert.equal(
    extractDocCreatedAttr('<!doctype html>\n<html lang="en" data-doc-id="x" data-doc-created="2026-11-17T14:20:00Z">'),
    '2026-11-17T14:20:00Z',
  );
  assert.equal(
    extractDocCreatedAttr("<html lang='zh' data-lumzel-created='2026-10-28'>"),
    '2026-10-28',
  );
  assert.equal(extractDocCreatedAttr('<html lang="en" data-doc-date="2026-10-28">'), '');
});

test('slugifyFeatureId produces safe unique kebab-case ids', () => {
  assert.equal(slugifyFeatureId('Invoice Cache v2', []), 'invoice-cache-v2');
  assert.equal(slugifyFeatureId('Invoice Cache v2', ['invoice-cache-v2']), 'invoice-cache-v2-2');
  const zhId = slugifyFeatureId('中文需求', []);
  assert.match(zhId, /^feat-\d{8}-\d{4}$/);
});

test('buildDesignReplyPrompt & buildTicketsReplyPrompt support English default and Chinese locale', () => {
  const feature = {
    id: 'invoice-cache',
    title: 'Invoice Read Cache',
    summary: 'Redis cache',
    status: 'draft',
    design: 'docs/features/invoice-cache/design.html',
    prototype: 'docs/features/invoice-cache/prototype.html',
  };
  const enDesignPrompt = buildDesignReplyPrompt({
    feature,
    answers: [{ id: 'ttl', question: 'TTL?', value: '10 min' }],
    settled: [{ id: 'store', question: 'Store?', answer: 'Redis' }],
    note: 'Add eviction details',
    isNewSession: true,
  });
  assert.match(enDesignPrompt, /new session with full context/);
  assert.match(enDesignPrompt, /Previously settled decisions/);
  assert.match(enDesignPrompt, /store \(Store\?\): Redis/);
  assert.match(enDesignPrompt, /\[ttl\] TTL\? => 10 min/);
  assert.match(enDesignPrompt, /Add eviction details/);
  assert.match(enDesignPrompt, /Do not generate any `docs\/results\/` files/);
  assert.match(enDesignPrompt, /pnpm lumzel check/);

  const zhDesignPrompt = buildDesignReplyPrompt({
    feature: { ...feature, title: '发票读取缓存' },
    answers: [{ id: 'ttl', question: 'TTL 多长？', value: '10 分钟' }],
    settled: [{ id: 'store', question: '缓存放哪？', answer: 'Redis' }],
    note: '请补充失效策略',
    isNewSession: true,
    locale: 'zh-CN',
  });
  assert.match(zhDesignPrompt, /新开会话，附完整上下文/);
  assert.match(zhDesignPrompt, /已确定的历史决策/);
  assert.match(zhDesignPrompt, /store \(缓存放哪？\): Redis/);
  assert.match(zhDesignPrompt, /\[ttl\] TTL 多长？ => 10 分钟/);
  assert.match(zhDesignPrompt, /请补充失效策略/);
  assert.match(zhDesignPrompt, /不要生成任何 `docs\/results\/` 文件/);
  assert.doesNotMatch(zhDesignPrompt, /\bdoc (confirm|trace|check)\b/);
  assert.match(zhDesignPrompt, /pnpm lumzel check/);

  const enTicketPrompt = buildTicketsReplyPrompt({
    feature,
    answers: [{ ticketPath: 'docs/features/invoice-cache/tickets/01.html', id: 'd-1', question: 'Client', value: 'ioredis' }],
    tickets: [],
    note: 'Add unit test',
    isNewSession: false,
  });
  assert.doesNotMatch(enTicketPrompt, /new session/);
  assert.match(enTicketPrompt, /\[d-1\] Client => ioredis/);
  assert.match(enTicketPrompt, /Add unit test/);
  assert.match(enTicketPrompt, /data-doc-links/);
  assert.match(enTicketPrompt, /pnpm lumzel check/);

  const zhTicketPrompt = buildTicketsReplyPrompt({
    feature: { ...feature, title: '发票读取缓存' },
    answers: [{ ticketPath: 'docs/features/invoice-cache/tickets/01.html', id: 'd-1', question: '库', value: 'ioredis' }],
    tickets: [],
    note: '顺便加单测',
    isNewSession: false,
    locale: 'zh',
  });
  assert.doesNotMatch(zhTicketPrompt, /新开会话/);
  assert.match(zhTicketPrompt, /\[d-1\] 库 => ioredis/);
  assert.match(zhTicketPrompt, /顺便加单测/);
  assert.doesNotMatch(zhTicketPrompt, /\bdoc (confirm|trace|check)\b/);
  assert.match(zhTicketPrompt, /data-doc-links/);
  assert.match(zhTicketPrompt, /pnpm lumzel check/);
});

function assertSampleBundleParity(sampleIndex, sampleDocs, sampleRootRel) {
  const expectedPaths = [
    ...sampleIndex.features.map(f => f.design),
    ...sampleIndex.features.flatMap(f => f.tickets.map(t => t.path)),
  ];
  assert.equal(expectedPaths.length, 5);
  assert.deepEqual(Object.keys(sampleDocs).sort(), [...expectedPaths].sort());

  const irDocs = expectedPaths.map(relPath => {
    const fileOnDisk = path.join(DECK_DIR, sampleRootRel, relPath);
    const onDisk = fs.readFileSync(fileOnDisk, 'utf8');
    assert.equal(sampleDocs[relPath], onDisk, `sample drift for ${sampleRootRel}/${relPath}`);
    const match = onDisk.match(/<script src="([^"]*runtime\/worktree\.js)"><\/script>/);
    assert.ok(match, `missing runtime/worktree.js script tag in ${sampleRootRel}/${relPath}`);
    const resolvedScript = path.resolve(path.dirname(fileOnDisk), match[1]);
    assert.equal(resolvedScript, path.join(DECK_DIR, 'runtime/worktree.js'), `wrong worktree.js path in ${sampleRootRel}/${relPath}`);
    const result = extractDoc(parseHtml(sampleDocs[relPath]), relPath);
    assert.deepEqual(lintDoc(result), [], `lintDoc errors in ${sampleRootRel}/${relPath}`);
    return { path: relPath, result };
  });

  const pdfDesign = sampleDocs['docs/features/pdf-export/design.html'];
  const parsedPdf = parseDesignDocQuestions(pdfDesign, { parseHtml });
  assert.equal(parsedPdf.open.length, 2);

  const trace = buildTrace(irDocs);
  const invoiceFeature = trace.features['invoice-cache'];
  const sampleInvoice = sampleIndex.features.find(f => f.id === 'invoice-cache');
  assert.ok(invoiceFeature && sampleInvoice);

  const actualNodeTickets = Object.fromEntries(
    Object.entries(invoiceFeature.nodes)
      .filter(([, n]) => n.t.length > 0)
      .map(([nid, n]) => [nid, n.t]),
  );
  assert.deepEqual(actualNodeTickets, sampleInvoice.nodeTickets);

  const actualTickets = Object.entries(invoiceFeature.tickets).map(([ticketPath, t]) => ({
    path: ticketPath,
    status: t.status,
    ready: t.ready,
    blockedBy: t.blockedBy,
  }));
  assert.deepEqual(
    actualTickets,
    sampleInvoice.tickets.map(t => ({
      path: t.path,
      status: t.status,
      ready: t.ready,
      blockedBy: t.blockedBy,
    })),
  );
}

test('SAMPLE_DOCS & SAMPLE_DOCS_EN match sample files on disk, pass lintDoc, and derive matching buildTrace', () => {
  assertSampleBundleParity(SAMPLE_INDEX, SAMPLE_DOCS, 'sample');
  assertSampleBundleParity(SAMPLE_INDEX_EN, SAMPLE_DOCS_EN, 'sample/en');

  const enAdrPath = path.join(DECK_DIR, 'sample/en/docs/adr/0001-cache-store.html');
  assert.ok(fs.existsSync(enAdrPath));
  const enAdrHtml = fs.readFileSync(enAdrPath, 'utf8');
  assert.deepEqual(lintDoc(extractDoc(parseHtml(enAdrHtml), 'docs/adr/0001-cache-store.html')), []);
  const enAdrScript = enAdrHtml.match(/<script src="([^"]*runtime\/worktree\.js)"><\/script>/)?.[1];
  assert.equal(path.resolve(path.dirname(enAdrPath), enAdrScript || ''), path.join(DECK_DIR, 'runtime/worktree.js'));

  assert.equal(getSampleData('en').prefix, 'sample/en');
  assert.equal(getSampleData('en').index, SAMPLE_INDEX_EN);
  assert.equal(getSampleData('zh-CN').prefix, 'sample');
  assert.equal(getSampleData('zh-CN').index, SAMPLE_INDEX);
});

test('removeDesignTicketItem removes ticket row, cleans blockers and links, and passes lintDoc', () => {
  const designHtml = fs.readFileSync(
    path.join(DECK_DIR, 'sample/docs/features/invoice-cache/design.html'),
    'utf8',
  );
  const ticketPath = 'docs/features/invoice-cache/tickets/02-miss-load.html';
  const withLink = designHtml.replace(
    'data-doc-node="store"',
    `data-doc-node="store" data-doc-links="${ticketPath} docs/features/invoice-cache/tickets/01-read-path.html"`,
  );

  const updated = removeDesignTicketItem(withLink, ticketPath, '2026-11-16', { parseHtml });
  const doc = parseHtml(updated);
  assert.equal(doc.querySelector(`[data-doc-ticket="${ticketPath}"]`), null);
  assert.equal(doc.querySelector('[data-doc-node="t03"]')?.getAttribute('data-doc-blocked-by'), null);
  assert.equal(
    doc.querySelector('[data-doc-node="store"]')?.getAttribute('data-doc-links'),
    'docs/features/invoice-cache/tickets/01-read-path.html',
  );
  assert.deepEqual(lintDoc(extractDoc(doc)), []);
});

test('deriveFeatureTitle and generateFeatureId handle brief-only creation', () => {
  assert.equal(deriveFeatureTitle(''), '');
  assert.equal(deriveFeatureTitle('  - 给发票详情页加 Redis 缓存\n第二行补充说明'), '给发票详情页加 Redis 缓存');
  assert.equal(
    deriveFeatureTitle('1. Add an extra long description for testing title truncation behavior cleanly', 24),
    'Add an extra long descr…',
  );

  const fixedNow = new Date(2026, 10, 16, 9, 5);
  assert.equal(generateFeatureId('Add Redis cache for invoice details', [], fixedNow), 'add-redis-cache-for-invoice');
  assert.equal(
    generateFeatureId('Invoice cache v2', ['invoice-cache-v2', 'invoice-cache-v2-2'], fixedNow),
    'invoice-cache-v2-3',
  );
  assert.equal(generateFeatureId('给发票详情页加 Redis 缓存', [], fixedNow), 'feat-20261116-0905');
  assert.equal(
    generateFeatureId('给发票详情页加 Redis 缓存', ['feat-20261116-0905'], fixedNow),
    'feat-20261116-0905-2',
  );
});
