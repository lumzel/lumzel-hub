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
  generateFeatureId,
  parseDesignDocQuestions,
  parseTicketChoices,
  removeDesignTicketItem,
  slugifyFeatureId,
  sortFeaturesDesc,
  syncDesignTicketItem,
} from '../src/docOps.js';
import { SAMPLE_DOCS, SAMPLE_INDEX } from '../src/sample.js';
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

test('slugifyFeatureId produces safe unique kebab-case ids', () => {
  assert.equal(slugifyFeatureId('Invoice Cache v2', []), 'invoice-cache-v2');
  assert.equal(slugifyFeatureId('Invoice Cache v2', ['invoice-cache-v2']), 'invoice-cache-v2-2');
  const zhId = slugifyFeatureId('中文需求', []);
  assert.match(zhId, /^feat-\d{8}-\d{4}$/);
});

test('buildDesignReplyPrompt & buildTicketsReplyPrompt include full context when starting new session', () => {
  const feature = {
    id: 'invoice-cache',
    title: '发票读取缓存',
    summary: 'Redis cache',
    status: 'draft',
    design: 'docs/features/invoice-cache/design.html',
    prototype: 'docs/features/invoice-cache/prototype.html',
  };
  const newDesignPrompt = buildDesignReplyPrompt({
    feature,
    answers: [{ id: 'ttl', question: 'TTL 多长？', value: '10 分钟' }],
    settled: [{ id: 'store', question: '缓存放哪？', answer: 'Redis' }],
    note: '请补充失效策略',
    isNewSession: true,
  });
  assert.match(newDesignPrompt, /新开会话，附完整上下文/);
  assert.match(newDesignPrompt, /已确定的历史决策/);
  assert.match(newDesignPrompt, /store \(缓存放哪？\): Redis/);
  assert.match(newDesignPrompt, /\[ttl\] TTL 多长？ => 10 分钟/);
  assert.match(newDesignPrompt, /请补充失效策略/);
  assert.match(newDesignPrompt, /不要生成任何 `docs\/results\/` 文件/);
  assert.doesNotMatch(newDesignPrompt, /\bdoc (confirm|trace|check)\b/);
  assert.match(newDesignPrompt, /pnpm lumzel check/);

  const reuseTicketPrompt = buildTicketsReplyPrompt({
    feature,
    answers: [{ ticketPath: 'docs/features/invoice-cache/tickets/01.html', id: 'd-1', question: '库', value: 'ioredis' }],
    tickets: [],
    note: '顺便加单测',
    isNewSession: false,
  });
  assert.doesNotMatch(reuseTicketPrompt, /新开会话/);
  assert.match(reuseTicketPrompt, /\[d-1\] 库 => ioredis/);
  assert.match(reuseTicketPrompt, /顺便加单测/);
  assert.doesNotMatch(reuseTicketPrompt, /\bdoc (confirm|trace|check)\b/);
  assert.match(reuseTicketPrompt, /data-doc-links/);
  assert.match(reuseTicketPrompt, /pnpm lumzel check/);
});

test('SAMPLE_DOCS matches sample files on disk, passes lintDoc, and derives matching buildTrace', () => {
  const expectedPaths = [
    ...SAMPLE_INDEX.features.map(f => f.design),
    ...SAMPLE_INDEX.features.flatMap(f => f.tickets.map(t => t.path)),
  ];
  assert.equal(expectedPaths.length, 5);
  assert.deepEqual(Object.keys(SAMPLE_DOCS).sort(), [...expectedPaths].sort());

  const irDocs = expectedPaths.map(relPath => {
    const onDisk = fs.readFileSync(path.join(DECK_DIR, 'sample', relPath), 'utf8');
    assert.equal(SAMPLE_DOCS[relPath], onDisk, `SAMPLE_DOCS drift for ${relPath}`);
    const result = extractDoc(parseHtml(SAMPLE_DOCS[relPath]), relPath);
    assert.deepEqual(lintDoc(result), [], `lintDoc errors in ${relPath}`);
    return { path: relPath, result };
  });

  const pdfDesign = SAMPLE_DOCS['docs/features/pdf-export/design.html'];
  const parsedPdf = parseDesignDocQuestions(pdfDesign, { parseHtml });
  assert.equal(parsedPdf.open.length, 2);

  const trace = buildTrace(irDocs);
  const invoiceFeature = trace.features['invoice-cache'];
  const sampleInvoice = SAMPLE_INDEX.features.find(f => f.id === 'invoice-cache');
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
