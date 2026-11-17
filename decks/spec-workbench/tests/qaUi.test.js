import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

import {
  applyQaAnswerSelection,
  captureContainerScrollTop,
  draftStoreKey,
  hasQaDraftContent,
  mergeStoredQaDrafts,
  normalizeQaDraft,
  restoreContainerScrollTop,
  shouldAutoOpenQaPanel,
  syncQaOptionButtons,
} from '../src/qaUi.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_JS_PATH = path.resolve(HERE, '../src/app.js');

test('syncQaOptionButtons and applyQaAnswerSelection update option pills and input in place without touching scrollTop', () => {
  const { document } = parseHTML(`
    <div id="design-qa" data-feature-id="feat-1">
      <div class="qa-body">
        <div class="qa-list">
          <div class="qa-item">
            <div class="qa-opts">
              <button type="button" class="qa-opt" data-opt-value="Option A">Option A</button>
              <button type="button" class="qa-opt" data-opt-value="Option B">Option B</button>
            </div>
            <input type="text" class="qa-input" value="" />
          </div>
        </div>
      </div>
    </div>
  `);

  const body = document.querySelector('.qa-body');
  const itemEl = document.querySelector('.qa-item');
  const [optA, optB] = Array.from(itemEl.querySelectorAll('.qa-opt'));
  const inputEl = itemEl.querySelector('.qa-input');
  const answers = {};

  body.scrollTop = 320;

  applyQaAnswerSelection({
    answers,
    answerKey: 'q-bottom',
    value: 'Option B',
    itemEl,
    inputEl,
  });

  assert.equal(answers['q-bottom'], 'Option B');
  assert.equal(inputEl.value, 'Option B');
  assert.equal(optA.classList.contains('on'), false);
  assert.equal(optB.classList.contains('on'), true);
  assert.equal(body.scrollTop, 320);
  assert.equal(document.querySelector('.qa-body'), body);

  // Typing custom input syncs option pills without clobbering input value or scrollTop
  inputEl.value = 'Custom answer';
  applyQaAnswerSelection({
    answers,
    answerKey: 'q-bottom',
    value: inputEl.value,
    itemEl,
  });

  assert.equal(answers['q-bottom'], 'Custom answer');
  assert.equal(optA.classList.contains('on'), false);
  assert.equal(optB.classList.contains('on'), false);
  assert.equal(body.scrollTop, 320);

  // Selecting Option A switches highlight cleanly
  syncQaOptionButtons(itemEl, 'Option A');
  assert.equal(optA.classList.contains('on'), true);
  assert.equal(optB.classList.contains('on'), false);
});

test('captureContainerScrollTop and restoreContainerScrollTop preserve scroll for same feature and reset on feature switch', () => {
  const { document } = parseHTML(`
    <div id="design-qa">
      <div class="qa-body"></div>
    </div>
  `);
  const box = document.getElementById('design-qa');
  const oldBody = box.querySelector('.qa-body');
  box.dataset.featureId = 'feat-1';
  oldBody.scrollTop = 415;

  // Same feature re-render preserves scrollTop onto the newly created .qa-body
  const savedSameFeature = captureContainerScrollTop(box, 'feat-1', box.querySelector('.qa-body'));
  assert.equal(savedSameFeature, 415);

  const newBody = document.createElement('div');
  newBody.className = 'qa-body';
  box.replaceChildren(newBody);
  restoreContainerScrollTop(box, 'feat-1', savedSameFeature, newBody);
  assert.equal(box.dataset.featureId, 'feat-1');
  assert.equal(newBody.scrollTop, 415);

  // Switching to another feature resets scrollTop instead of carrying over feat-1's scroll offset
  const savedOtherFeature = captureContainerScrollTop(box, 'feat-2', box.querySelector('.qa-body'));
  assert.equal(savedOtherFeature, 0);

  const otherBody = document.createElement('div');
  otherBody.className = 'qa-body';
  box.replaceChildren(otherBody);
  restoreContainerScrollTop(box, 'feat-2', savedOtherFeature, otherBody);
  assert.equal(box.dataset.featureId, 'feat-2');
  assert.equal(otherBody.scrollTop, 0);
});

test('mergeStoredQaDrafts restores unsubmitted drafts across refresh while respecting dirty/cleared guards', () => {
  const entries = [
    {
      key: 'design:feat-1',
      value: {
        kind: 'design',
        featureId: 'feat-1',
        answers: { q1: 'Redis', empty: '' },
        note: 'Keep TTL short',
        updatedAt: 200,
      },
    },
    {
      key: 'design:feat-dirty',
      value: {
        kind: 'design',
        featureId: 'feat-dirty',
        answers: { q1: 'Old' },
        note: '',
        updatedAt: 100,
      },
    },
    {
      key: 'design:feat-cleared',
      value: {
        kind: 'design',
        featureId: 'feat-cleared',
        answers: { q1: 'Stale' },
        note: '',
        updatedAt: 150,
      },
    },
    {
      key: 'tickets:feat-1',
      value: {
        kind: 'tickets',
        featureId: 'feat-1',
        answers: { 'docs/features/feat-1/tickets/01.html::d1': 'Option B' },
        note: 'Check edge cases',
        updatedAt: 300,
      },
    },
  ];

  const dirtyKeys = new Set([draftStoreKey('design', 'feat-dirty')]);
  const clearedAtMap = { [draftStoreKey('design', 'feat-cleared')]: 200 };
  const memoryDesign = {
    'feat-dirty': { answers: { q1: 'Fresh local' }, note: 'Typing', updatedAt: 250 },
  };

  const mergedDesign = mergeStoredQaDrafts({
    memoryDrafts: memoryDesign,
    entries,
    kind: 'design',
    dirtyKeys,
    clearedAtMap,
  });

  assert.deepEqual(mergedDesign['feat-1'], {
    answers: { q1: 'Redis' },
    note: 'Keep TTL short',
    updatedAt: 200,
  });
  assert.deepEqual(mergedDesign['feat-dirty'], memoryDesign['feat-dirty']);
  assert.equal(mergedDesign['feat-cleared'], undefined);

  const mergedTickets = mergeStoredQaDrafts({
    memoryDrafts: {},
    entries,
    kind: 'tickets',
  });
  assert.deepEqual(mergedTickets['feat-1'], {
    answers: { 'docs/features/feat-1/tickets/01.html::d1': 'Option B' },
    note: 'Check edge cases',
    updatedAt: 300,
  });
});

test('hasQaDraftContent, normalizeQaDraft, and shouldAutoOpenQaPanel handle draft notes and explicit collapse', () => {
  assert.equal(hasQaDraftContent(null), false);
  assert.equal(hasQaDraftContent({ answers: { a: '   ' }, note: '  ' }), false);
  assert.equal(hasQaDraftContent({ answers: { a: 'Redis' }, note: '' }), true);
  assert.equal(hasQaDraftContent({ answers: {}, note: 'Follow up' }), true);

  assert.deepEqual(normalizeQaDraft({ answers: { k: 42, empty: '' }, note: 'hi', updatedAt: '10' }), {
    answers: { k: '42' },
    note: 'hi',
    updatedAt: 10,
  });

  // Auto-opens when there are no open questions yet, as long as user has an unsaved draft note/answer
  assert.equal(shouldAutoOpenQaPanel({ hasOpen: false, draft: { answers: {}, note: 'unsaved' } }), true);
  assert.equal(shouldAutoOpenQaPanel({ hasOpen: false, draft: { answers: {}, note: '' } }), false);
  // Explicit user collapse/expand overrides automatic open state
  assert.equal(
    shouldAutoOpenQaPanel({ hasOpen: false, draft: { answers: {}, note: 'unsaved' }, explicitCollapsed: true }),
    false,
  );
  assert.equal(shouldAutoOpenQaPanel({ hasOpen: false, draft: { answers: {}, note: '' }, explicitCollapsed: false }), true);
});

test('app.js uses in-place option selection instead of rebuilding QA panels on option click and persists drafts', () => {
  const src = fs.readFileSync(APP_JS_PATH, 'utf8');
  const designStart = src.indexOf('function renderDesignQa(');
  const ticketsQaStart = src.indexOf('function renderTicketsQa(');
  const ticketsStart = src.indexOf('function renderTickets(');
  assert.ok(designStart >= 0 && ticketsQaStart > designStart && ticketsStart > ticketsQaStart);

  const designFn = src.slice(designStart, ticketsQaStart);
  const ticketsQaFn = src.slice(ticketsQaStart, ticketsStart);

  const designOptBlock = designFn.slice(
    designFn.indexOf('class: `qa-opt'),
    designFn.indexOf('const noteArea'),
  );
  assert.doesNotMatch(designOptBlock, /renderDesignQa\s*\(/);
  assert.match(designOptBlock, /applyQaAnswerSelection\s*\(/);
  assert.match(designOptBlock, /scheduleQaDraftSave\s*\(/);

  const ticketsOptBlock = ticketsQaFn.slice(
    ticketsQaFn.indexOf('class: `qa-opt'),
    ticketsQaFn.indexOf('const noteArea'),
  );
  assert.doesNotMatch(ticketsOptBlock, /renderTicketsQa\s*\(/);
  assert.match(ticketsOptBlock, /applyQaAnswerSelection\s*\(/);
  assert.match(ticketsOptBlock, /scheduleQaDraftSave\s*\(/);

  assert.match(src, /mergeStoredQaDrafts\s*\(/);
  assert.match(src, /clearQaDraft\s*\(\s*'design'/);
  assert.match(src, /clearQaDraft\s*\(\s*'tickets'/);
  assert.match(src, /addEventListener\s*\(\s*'pagehide',\s*flushPendingQaDrafts\s*\)/);
  assert.match(src, /addEventListener\s*\(\s*'beforeunload',\s*flushPendingQaDrafts\s*\)/);
});
