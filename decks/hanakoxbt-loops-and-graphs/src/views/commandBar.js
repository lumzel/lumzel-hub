import { h, clear, setText } from '../lib/dom.js';
import { imeGuard } from '../lib/ime.js';
import { t } from '../i18n.js';

const ALL_LENSES = ['correctness', 'security', 'performance', 'tests'];

export function mountCommandBar(store, host) {
  const inputWrap = document.getElementById('cmd-input-wrap');
  const goalEl = document.getElementById('goal');
  const reviewFieldsEl = document.getElementById('review-fields');
  const baseEl = document.getElementById('base');
  const constraintsBtn = document.getElementById('constraints-btn');
  const constraintsN = document.getElementById('constraints-n');
  const checksBtn = document.getElementById('checks-btn');
  const checksPop = document.getElementById('checks-pop');
  const runBtn = document.getElementById('run-btn');

  // Hint label inside reviewFields
  const reviewHintEl = h('span', { class: 'review-hint' }, t('reviewHint'));
  reviewFieldsEl.appendChild(reviewHintEl);

  function autoGrow() {
    goalEl.style.height = '32px';
    const next = Math.min(76, Math.max(32, goalEl.scrollHeight));
    goalEl.style.height = `${next}px`;
  }

  goalEl.addEventListener('input', () => {
    autoGrow();
    store.set({ goal: goalEl.value });
  });

  imeGuard(goalEl, () => {
    const st = store.get();
    if (st.preset === 'feature-ship' && goalEl.value.trim()) {
      host.startRun({ goal: goalEl.value });
    }
  });

  baseEl.addEventListener('input', () => {
    host.savePrefs({ reviewBase: baseEl.value });
  });

  constraintsBtn.addEventListener('click', () => {
    host.savePrefs({ inspectorOpen: true, tab: 'vault' });
  });

  checksBtn.addEventListener('click', e => {
    e.stopPropagation();
    checksPop.hidden = !checksPop.hidden;
    if (!checksPop.hidden) renderChecksPopover();
  });

  document.addEventListener('click', e => {
    if (!checksPop.hidden && !checksPop.contains(e.target) && e.target !== checksBtn) {
      checksPop.hidden = true;
    }
  });

  runBtn.addEventListener('click', () => {
    const st = store.get();
    if (st.pending) return;
    if (st.mode === 'live' && st.run && st.run.state === 'running') {
      host.stopRun();
      return;
    }
    if (st.run && st.run.state === 'waiting_gate') {
      store.set(s => ({
        ...s,
        selection: { kind: 'node', id: 'human_gate' },
        ui: { ...s.ui, inspectorOpen: true, tab: 'gate' },
      }));
      return;
    }
    if (st.mode === 'demo' && st.run && st.run.state === 'running') {
      host.demo.stop();
      return;
    }
    host.startRun();
  });

  function renderChecksPopover() {
    clear(checksPop);
    const st = store.get();
    const prefs = st.prefs;
    const detectedCmd =
      (st.run && st.run.outputs && st.run.outputs.plan && st.run.outputs.plan.fullCheckCmd) ||
      (st.run && st.run.outputs && st.run.outputs.preflight && st.run.outputs.preflight.fullCheckCmd);

    if (st.preset === 'feature-ship') {
      const fullInput = h('input', {
        type: 'text',
        value: prefs.fullCheckCmd || '',
        placeholder: detectedCmd ? `${detectedCmd} (detected)` : t('fullCheckPh'),
        onInput: e => host.savePrefs({ fullCheckCmd: e.target.value }),
      });
      checksPop.appendChild(
        h('div', { class: 'field-row' }, h('label', null, t('fullCheckLabel')), fullInput),
      );

      const setupInput = h('input', {
        type: 'text',
        value: prefs.setupCmd !== undefined ? prefs.setupCmd : 'auto',
        placeholder: t('setupCmdPh'),
        onInput: e => host.savePrefs({ setupCmd: e.target.value }),
      });
      checksPop.appendChild(
        h('div', { class: 'field-row' }, h('label', null, t('setupCmdLabel')), setupInput),
      );

      const maxVal = Math.max(1, Math.min(6, Number(prefs.maxUnits) || 5));
      const valSpan = h('span', { class: 'mono', style: { minWidth: '18px', textAlign: 'center' } }, String(maxVal));
      const decBtn = h(
        'button',
        {
          type: 'button',
          class: 'secondary',
          disabled: maxVal <= 1,
          onClick: () => {
            const next = Math.max(1, (Number(store.get().prefs.maxUnits) || 5) - 1);
            host.savePrefs({ maxUnits: next });
            renderChecksPopover();
          },
        },
        '−',
      );
      const incBtn = h(
        'button',
        {
          type: 'button',
          class: 'secondary',
          disabled: maxVal >= 6,
          onClick: () => {
            const next = Math.min(6, (Number(store.get().prefs.maxUnits) || 5) + 1);
            host.savePrefs({ maxUnits: next });
            renderChecksPopover();
          },
        },
        '+',
      );
      checksPop.appendChild(
        h(
          'div',
          { class: 'field-row' },
          h('label', null, t('maxUnitsLabel')),
          h('div', { class: 'stepper' }, decBtn, valSpan, incBtn),
        ),
      );
    } else {
      const revCheckInput = h('input', {
        type: 'text',
        value: prefs.reviewCheckCmd || '',
        placeholder: 'pnpm test',
        onInput: e => host.savePrefs({ reviewCheckCmd: e.target.value }),
      });
      checksPop.appendChild(
        h('div', { class: 'field-row' }, h('label', null, t('reviewCheckLabel')), revCheckInput),
      );

      const activeLenses = new Set(Array.isArray(prefs.lenses) && prefs.lenses.length ? prefs.lenses : ALL_LENSES);
      const chipsWrap = h('div', { class: 'lens-chips' });
      for (const id of ALL_LENSES) {
        const pressed = activeLenses.has(id);
        chipsWrap.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'lens-chip',
              'aria-pressed': pressed ? 'true' : 'false',
              onClick: () => {
                const cur = new Set(store.get().prefs.lenses || ALL_LENSES);
                if (cur.has(id)) {
                  if (cur.size <= 1) return; // keep at least 1 lens
                  cur.delete(id);
                } else {
                  cur.add(id);
                }
                host.savePrefs({ lenses: ALL_LENSES.filter(x => cur.has(x)) });
                renderChecksPopover();
              },
            },
            id,
          ),
        );
      }
      checksPop.appendChild(
        h('div', { class: 'field-row' }, h('label', null, t('lensesLabel')), chipsWrap),
      );
    }
  }

  store.subscribe(
    s => ({
      preset: s.preset,
      goal: s.goal,
      reviewBase: s.prefs.reviewBase,
      locale: s.ctx.locale,
    }),
    ({ preset, goal, reviewBase }) => {
      const isReview = preset === 'code-review';
      inputWrap.hidden = isReview;
      reviewFieldsEl.hidden = !isReview;
      setText(reviewHintEl, t('reviewHint'));
      if (goalEl.value !== goal) {
        goalEl.value = goal || '';
        autoGrow();
      }
      if (baseEl.value !== (reviewBase || '')) {
        baseEl.value = reviewBase || '';
      }
      if (!checksPop.hidden) renderChecksPopover();
    },
    (a, b) =>
      a.preset === b.preset &&
      a.goal === b.goal &&
      a.reviewBase === b.reviewBase &&
      a.locale === b.locale,
  );

  store.subscribe(
    s => ({
      lessonsRev: s.lessons.rev,
      fileLen: (s.fileLessons || []).length,
      preset: s.preset,
      locale: s.ctx.locale,
    }),
    ({ preset }) => {
      const active = host.lessons.getActiveForPreset(preset).length;
      setText(constraintsN, String(active));
      constraintsBtn.title = t('nextInject', { n: active });
    },
    (a, b) =>
      a.lessonsRev === b.lessonsRev &&
      a.fileLen === b.fileLen &&
      a.preset === b.preset &&
      a.locale === b.locale,
  );

  store.subscribe(
    s => ({
      mode: s.mode,
      preset: s.preset,
      goal: s.goal,
      run: s.run,
      pending: s.pending,
      capsWf: s.caps.workflow,
      wf: s.workflows[s.preset],
      locale: s.ctx.locale,
    }),
    ({ mode, preset, goal, run, pending, capsWf, wf }) => {
      clear(runBtn);
      runBtn.className = 'primary';
      runBtn.disabled = false;

      if (pending === 'starting') {
        runBtn.disabled = true;
        runBtn.textContent = t('starting');
        return;
      }

      if (mode === 'live' && run && run.state === 'running') {
        runBtn.className = 'secondary';
        const sq = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sq.setAttribute('viewBox', '0 0 14 14');
        sq.innerHTML = '<rect x="3" y="3" width="8" height="8" rx="1" fill="var(--fail)"/>';
        runBtn.appendChild(sq);
        runBtn.appendChild(document.createTextNode(t('stop')));
        return;
      }

      if (run && run.state === 'waiting_gate') {
        runBtn.className = 'gate-outline';
        runBtn.textContent = `◆ ${t('reviewGate')}`;
        return;
      }

      const wfBroken = Boolean(wf && wf.error);
      const missingGoal = preset === 'feature-ship' && !String(goal || '').trim();
      const disabled = capsWf === false || wfBroken || (mode !== 'demo' && missingGoal && !run);
      // If idle or terminal, allow Run / Run again (when goal is present or code-review)
      runBtn.disabled = Boolean(capsWf === false || wfBroken || (preset === 'feature-ship' && !String(goal || '').trim()));

      const label = run ? `▶ ${t('runAgain')}` : `▶ ${t('run')}`;
      runBtn.textContent = label;
    },
    (a, b) =>
      a.mode === b.mode &&
      a.preset === b.preset &&
      a.goal === b.goal &&
      a.run === b.run &&
      a.pending === b.pending &&
      a.capsWf === b.capsWf &&
      a.wf === b.wf &&
      a.locale === b.locale,
  );
}
