import { h, clear } from '../lib/dom.js';
import { fmtDuration } from '../lib/format.js';
import { imeGuard } from '../lib/ime.js';
import { t } from '../i18n.js';

export function createGatePanelRenderer(store, host) {
  let approveArmUntil = 0;
  let approveTimer = null;
  let riskAccepted = false;
  let reworkExpanded = false;
  let noteDraft = '';
  let lastRunId = null;

  function resetInteraction() {
    approveArmUntil = 0;
    if (approveTimer) {
      clearTimeout(approveTimer);
      approveTimer = null;
    }
    riskAccepted = false;
    reworkExpanded = false;
    noteDraft = '';
  }

  return function renderGatePanel(container, view) {
    clear(container);
    const st = store.get();
    if (view.runId !== lastRunId) {
      lastRunId = view.runId;
      resetInteraction();
    }

    const activeGate = view.gate;
    const fallbackCandidate =
      !activeGate && st.run && st.run.workflowState && st.run.workflowState.candidate
        ? st.run.workflowState.candidate
        : null;

    if (!activeGate && !fallbackCandidate) {
      container.appendChild(h('div', { class: 'empty-state' }, t('noGateWaiting')));
      return;
    }

    const g = activeGate || {
      candidate: fallbackCandidate,
      integrate: st.run?.outputs?.integrate || null,
      reverify: st.run?.outputs?.reverify || null,
      reworksLeft: Math.max(0, 2 - (Number(st.run?.workflowState?.reworks) || 0)),
      waitingSinceSec: null,
    };

    const cand = g.candidate || {};
    const baseBranch =
      (st.run && st.run.outputs && st.run.outputs.preflight && st.run.outputs.preflight.branch) ||
      st.ctx.branch ||
      'main';
    const checkOk = cand.checkOk !== false;
    const checkSkipped = Boolean(cand.checkSkipped);
    const files = Array.isArray(cand.files) ? cand.files.slice(0, 8) : [];
    const maxChurn = files.reduce((m, f) => Math.max(m, (f.add || 0) + (f.del || 0)), 1);
    const flags = (cand.risk && cand.risk.flags) || [];
    const riskLevel = (cand.risk && cand.risk.level) || 'low';
    const isInteractive = Boolean(activeGate);
    const isResuming = st.pending === 'resuming';

    const card = h('div', { class: 'gate-card' });

    // Header
    card.appendChild(
      h(
        'div',
        { class: 'gate-card-hd' },
        h('span', { class: 'truncate' }, `◆ HUMAN GATE · ${t('gateOnly')}`),
        g.waitingSinceSec !== null
          ? h('span', { class: 'tabular', style: { whiteSpace: 'nowrap', flexShrink: 0 } }, `awaiting ${fmtDuration(g.waitingSinceSec)}`)
          : null,
      ),
    );

    // Prompt
    card.appendChild(
      h(
        'div',
        { class: 'gate-prompt' },
        cand.passed !== undefined
          ? `Accept ${cand.passed}/${cand.total} unit(s) in current worktree (${baseBranch})?`
          : activeGate?.prompt || 'Approve and finish?',
      ),
    );

    // 3 metrics
    card.appendChild(
      h(
        'div',
        { class: 'gate-metrics' },
        h(
          'div',
          { class: 'gate-metric' },
          h('div', { class: 'gate-metric-k' }, 'UNITS'),
          h('div', { class: 'gate-metric-v' }, `${cand.passed ?? '—'}/${cand.total ?? '—'}`),
          h('div', { class: 'gate-metric-sub' }, `${(view.lanes || []).filter(l => l.status === 'fail').length} excluded`),
        ),
        h(
          'div',
          { class: 'gate-metric' },
          h('div', { class: 'gate-metric-k' }, 'FULL CHECK'),
          h(
            'div',
            {
              class: 'gate-metric-v',
              style: { color: checkSkipped ? 'var(--gate)' : checkOk ? 'var(--ok)' : 'var(--fail)' },
            },
            checkSkipped ? 'SKIPPED' : checkOk ? 'PASS' : 'FAIL',
          ),
          h('div', { class: 'gate-metric-sub', title: cand.checkCmd || cand.checkReason }, cand.checkCmd || cand.checkReason || '—'),
        ),
        h(
          'div',
          { class: 'gate-metric' },
          h('div', { class: 'gate-metric-k' }, 'DIFF'),
          h('div', { class: 'gate-metric-v' }, `+${cand.insertions ?? 0} −${cand.deletions ?? 0}`),
          h('div', { class: 'gate-metric-sub' }, `${cand.filesChanged ?? 0} files`),
        ),
      ),
    );

    // Units status summary
    const realLanes = (view.lanes || []).filter(l => !l.blueprint);
    if (realLanes.length) {
      const unitsBox = h('div', { class: 'sec', style: { marginBottom: '12px' } }, h('div', { class: 'sec-hd' }, 'UNITS'));
      const row = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
      for (const l of realLanes) {
        const cnt = (l.attempts.green && l.attempts.green.length) || 1;
        row.appendChild(
          h(
            'span',
            {
              class: 'chip',
              style: {
                borderColor: l.status === 'pass' ? 'var(--ok)' : l.status === 'fail' ? 'var(--fail)' : undefined,
                color: l.status === 'pass' ? 'var(--ok)' : l.status === 'fail' ? 'var(--fail)' : undefined,
              },
            },
            `${l.status === 'pass' ? '✓' : '✗'} ${l.id} ×${cnt}`,
          ),
        );
      }
      unitsBox.appendChild(row);
      card.appendChild(unitsBox);
    }

    // Risk section
    if (flags.length) {
      const riskSec = h(
        'div',
        { class: 'sec', style: { marginBottom: '12px' } },
        h(
          'div',
          { class: 'sec-hd' },
          h('span', null, 'RISK'),
          h(
            'span',
            {
              class: 'chip',
              style: {
                color: riskLevel === 'high' ? 'var(--fail)' : riskLevel === 'medium' ? 'var(--gate)' : 'var(--muted)',
                borderColor: riskLevel === 'high' ? 'var(--fail)' : riskLevel === 'medium' ? 'var(--gate)' : 'var(--line-strong)',
              },
            },
            riskLevel.toUpperCase(),
          ),
        ),
      );
      for (const fl of flags) {
        const pathSuffix = fl.paths && fl.paths.length ? ` (${fl.paths.join(', ')})` : '';
        riskSec.appendChild(
          h(
            'div',
            { style: { fontSize: '11.5px', color: 'var(--ink-2)', marginBottom: '3px' } },
            `• ${fl.label}${pathSuffix}`,
          ),
        );
      }
      card.appendChild(riskSec);
    }

    // Top 8 files diff bars
    if (files.length) {
      const filesSec = h('div', { class: 'sec', style: { marginBottom: '12px' } }, h('div', { class: 'sec-hd' }, `FILES (TOP ${files.length})`));
      const list = h('div', { class: 'gate-files' });
      for (const f of files) {
        const pct = Math.max(4, Math.round((((f.add || 0) + (f.del || 0)) / maxChurn) * 100));
        list.appendChild(
          h(
            'div',
            { class: 'gate-file-row' },
            h('span', { class: 'truncate', title: f.path, style: { color: 'var(--ink-2)' } }, f.path),
            h('span', { class: 'gate-bar' }, h('i', { style: { width: `${pct}%` } })),
            h('span', { class: 'tabular', style: { color: 'var(--muted)' } }, `+${f.add} −${f.del}`),
          ),
        );
      }
      filesSec.appendChild(list);
      card.appendChild(filesSec);
    }

    // Branch + copy
    if (cand.branch) {
      card.appendChild(
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              color: 'var(--muted)',
            },
          },
          h('span', { class: 'truncate' }, `${cand.branch} · ${cand.source || 'integrate'} · round ${cand.round || 0}`),
          h(
            'button',
            {
              type: 'button',
              class: 'ghost',
              style: { height: '22px', padding: '0 8px' },
              onClick: () => {
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(cand.branch).then(() => host.showToast(t('copied')));
                }
              },
            },
            t('copyBranch'),
          ),
        ),
      );
    }

    // Actions (when waiting)
    if (isInteractive) {
      const actionsWrap = h('div', { class: 'gate-actions' });

      if (!checkOk) {
        const cb = h('input', {
          type: 'checkbox',
          checked: riskAccepted,
          onChange: e => {
            riskAccepted = e.target.checked;
            renderGatePanel(container, view);
          },
        });
        actionsWrap.appendChild(h('label', { class: 'gate-risk-check' }, cb, h('span', null, t('acceptRisk'))));
      }

      const armed = Date.now() < approveArmUntil;
      const approveBtn = h(
        'button',
        {
          type: 'button',
          class: 'gate-primary',
          disabled: isResuming || (!checkOk && !riskAccepted),
          onClick: () => {
            const now = Date.now();
            if (now >= approveArmUntil) {
              approveArmUntil = now + 4000;
              if (approveTimer) clearTimeout(approveTimer);
              approveTimer = setTimeout(() => {
                approveArmUntil = 0;
                renderGatePanel(container, view);
              }, 4000);
              renderGatePanel(container, view);
              return;
            }
            approveArmUntil = 0;
            if (approveTimer) {
              clearTimeout(approveTimer);
              approveTimer = null;
            }
            host.resumeGate('human_gate', 'approve', {
              by: 'deck',
              at: Math.floor(Date.now() / 1000),
            });
          },
        },
        isResuming
          ? t('resuming')
          : armed
            ? t('confirmMerge', { branch: baseBranch })
            : `◆ ${t('approve')}`,
      );

      const reqBtn = h(
        'button',
        {
          type: 'button',
          class: 'secondary',
          disabled: isResuming,
          onClick: () => {
            reworkExpanded = !reworkExpanded;
            renderGatePanel(container, view);
          },
        },
        t('requestChanges'),
      );

      actionsWrap.appendChild(
        h(
          'div',
          { class: 'gate-btn-row' },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            reqBtn,
            h(
              'span',
              { class: 'mono', style: { fontSize: '10.5px', color: g.reworksLeft <= 0 ? 'var(--fail)' : 'var(--muted)' } },
              g.reworksLeft <= 0 ? t('reworkExhausted') : t('reworkLeft', { n: g.reworksLeft }),
            ),
          ),
          approveBtn,
        ),
      );

      if (reworkExpanded) {
        const submitBtn = h(
          'button',
          {
            type: 'button',
            class: 'danger-outline',
            disabled: isResuming || noteDraft.trim().length < 8,
            onClick: () => {
              const note = noteDraft.trim();
              if (note.length < 8) return;
              host.resumeGate('human_gate', 'reject', { note });
            },
          },
          t('submitRework'),
        );

        const ta = h('textarea', {
          placeholder: t('reworkNotePh'),
          value: noteDraft,
          onInput: e => {
            noteDraft = e.target.value;
            submitBtn.disabled = isResuming || noteDraft.trim().length < 8;
          },
        });
        ta.value = noteDraft;
        imeGuard(ta, () => {
          if (noteDraft.trim().length >= 8 && !isResuming) {
            host.resumeGate('human_gate', 'reject', { note: noteDraft.trim() });
          }
        });

        actionsWrap.appendChild(
          h(
            'div',
            { class: 'gate-rework-box' },
            ta,
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('span', { class: 'mono', style: { fontSize: '10.5px', color: 'var(--muted)' } }, `${noteDraft.trim().length}/8+`),
              h(
                'div',
                { style: { display: 'flex', gap: '6px' } },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'ghost',
                    onClick: () => {
                      reworkExpanded = false;
                      renderGatePanel(container, view);
                    },
                  },
                  t('cancel'),
                ),
                submitBtn,
              ),
            ),
          ),
        );
      }

      card.appendChild(actionsWrap);
    }

    container.appendChild(card);
  };
}
