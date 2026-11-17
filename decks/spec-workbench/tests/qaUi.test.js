import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

import {
  applyQaAnswerSelection,
  captureContainerScrollTop,
  restoreContainerScrollTop,
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

test('app.js uses in-place option selection instead of rebuilding QA panels on option click', () => {
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

  const ticketsOptBlock = ticketsQaFn.slice(
    ticketsQaFn.indexOf('class: `qa-opt'),
    ticketsQaFn.indexOf('const noteArea'),
  );
  assert.doesNotMatch(ticketsOptBlock, /renderTicketsQa\s*\(/);
  assert.match(ticketsOptBlock, /applyQaAnswerSelection\s*\(/);
});
