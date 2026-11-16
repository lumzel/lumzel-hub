import { h, clear } from '../lib/dom.js';
import { fmtDuration, fmtRelative } from '../lib/format.js';
import { stripAnsi } from '../lib/ansi.js';
import { renderJsonTree } from '../lib/json.js';
import { t } from '../i18n.js';

const TERM_LINE_CAP = 400;
const AGENT_TEXT_LINE_CAP = 120;

export function renderTerminal(stdoutRaw, stderrRaw, exitCode) {
  let stream = stderrRaw && !stdoutRaw ? 'stderr' : 'stdout';
  let showAll = false;
  const wrap = h('div', { class: 'term', 'data-stream': stream });
  const pre = h('pre', { class: 'term-pre' });
  const tabsWrap = h('div', { class: 'term-tabs' });
  const moreBtn = h('button', { type: 'button', class: 'ghost', style: { height: '20px', padding: '0 6px' } });

  function redraw() {
    wrap.setAttribute('data-stream', stream);
    clear(tabsWrap);
    for (const sName of ['stdout', 'stderr']) {
      tabsWrap.appendChild(
        h(
          'button',
          {
            type: 'button',
            'aria-selected': stream === sName ? 'true' : 'false',
            onClick: () => {
              stream = sName;
              showAll = false;
              redraw();
            },
          },
          t(sName),
        ),
      );
    }

    const raw = stripAnsi(stream === 'stderr' ? stderrRaw || '' : stdoutRaw || '');
    const lines = raw.split('\n');
    const truncated = !showAll && lines.length > TERM_LINE_CAP;
    const shown = truncated ? lines.slice(0, TERM_LINE_CAP).join('\n') : raw;
    pre.textContent = shown || '(empty)';

    moreBtn.hidden = !truncated;
    if (truncated) {
      moreBtn.textContent = `${t('showAll')} (${lines.length})`;
      moreBtn.onclick = () => {
        showAll = true;
        redraw();
      };
    }
  }

  const exitBadge =
    exitCode !== undefined && exitCode !== null
      ? h(
          'span',
          {
            class: 'mono',
            style: { color: exitCode === 0 ? 'var(--ok)' : 'var(--fail)', fontSize: '10.5px' },
          },
          `exit ${exitCode}`,
        )
      : null;

  const hd = h(
    'div',
    { class: 'term-hd' },
    tabsWrap,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, moreBtn, exitBadge),
  );
  wrap.append(hd, pre);
  redraw();
  return wrap;
}

function copyText(host, text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => host.showToast(t('copied')),
      () => host.showToast(text),
    );
  } else {
    host.showToast(text);
  }
}

export function renderNodePanel(container, store, host, view) {
  clear(container);
  const st = store.get();
  const sel = st.selection;

  if (!sel) {
    container.appendChild(h('div', { class: 'empty-state' }, t('selectHint')));
    return;
  }

  if (sel.kind === 'lane') {
    const lane = (view.lanes || []).find(l => l.id === sel.id);
    if (!lane || lane.blueprint) {
      container.appendChild(h('div', { class: 'empty-state' }, t('selectHint')));
      return;
    }
    renderLaneDetail(container, store, host, view, lane);
    return;
  }

  const node = view.nodes && view.nodes[sel.id];
  if (!node) {
    container.appendChild(h('div', { class: 'empty-state' }, t('selectHint')));
    return;
  }

  // Header
  container.appendChild(
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        { class: 'panel-title-wrap' },
        h('i', { class: `dot ${node.role}` }),
        h('span', { class: 'panel-title' }, node.id),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '6px', flexShrink: 0 } },
        h('span', { class: 'chip' }, node.kind),
        h(
          'span',
          {
            class: 'chip',
            style: {
              color:
                node.status === 'ok'
                  ? 'var(--ok)'
                  : node.status === 'fail'
                    ? 'var(--fail)'
                    : node.status === 'waiting'
                      ? 'var(--gate)'
                      : 'var(--ink-2)',
            },
          },
          node.status,
        ),
      ),
    ),
  );

  // Actions
  const canRetry =
    !view.blueprint &&
    st.mode !== 'demo' &&
    st.caps.workflow !== false &&
    ['completed', 'failed', 'stopped', 'limit', 'interrupted'].includes(view.state);

  const actions = [];
  if (canRetry) {
    const retryLbl =
      node.id === 'ship' && node.status === 'fail'
        ? t('retryShip')
        : node.id === 'preflight' && node.status === 'fail'
          ? t('retryPreflight')
          : t('retryHere');
    actions.push(
      h(
        'button',
        { type: 'button', class: 'secondary', disabled: st.pending, onClick: () => host.retryNode(node.id) },
        retryLbl,
      ),
    );
  }
  if (node.sessionId && st.caps.agent !== false && st.caps.open !== false) {
    actions.push(
      h(
        'button',
        { type: 'button', class: 'secondary', onClick: () => host.openSession(node.sessionId) },
        t('openSession'),
      ),
    );
  }
  if (node.output && node.output.branch) {
    actions.push(
      h(
        'button',
        { type: 'button', class: 'ghost', onClick: () => copyText(host, node.output.branch) },
        t('copyBranch'),
      ),
    );
  }
  if (actions.length) container.appendChild(h('div', { class: 'panel-actions' }, ...actions));

  // Error
  if (node.error) {
    container.appendChild(
      h(
        'div',
        { class: 'sec' },
        h('div', { class: 'sec-hd' }, t('errorSec')),
        h('div', { class: 'error-box' }, node.error),
      ),
    );
  }

  // Telemetry KV
  container.appendChild(
    h(
      'div',
      { class: 'sec' },
      h('div', { class: 'sec-hd' }, t('telemetrySec')),
      h(
        'div',
        { class: 'kv-grid' },
        h('div', { class: 'kv-item' }, h('div', { class: 'kv-k' }, 'iteration'), h('div', { class: 'kv-v' }, `${node.iteration}/${node.max}`)),
        h('div', { class: 'kv-item' }, h('div', { class: 'kv-k' }, 'duration'), h('div', { class: 'kv-v' }, fmtDuration(node.durationSec))),
        h(
          'div',
          { class: 'kv-item' },
          h('div', { class: 'kv-k' }, 'started'),
          h('div', { class: 'kv-v' }, fmtRelative(node.startedAt, st.ctx.locale, view.nowSec)),
        ),
        node.worktreePath
          ? h(
              'div',
              { class: 'kv-item' },
              h('div', { class: 'kv-k' }, 'worktree'),
              h('div', { class: 'kv-v', title: node.worktreePath }, node.worktreePath),
            )
          : null,
      ),
    ),
  );

  // Input
  if (node.input !== null && node.input !== undefined) {
    container.appendChild(
      h(
        'div',
        { class: 'sec' },
        h('div', { class: 'sec-hd' }, t('inputSec')),
        renderJsonTree(node.input, { showAllLabel: t('showAll') }),
      ),
    );
  }

  // Output
  if (node.output !== null && node.output !== undefined) {
    const outSec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, t('outputSec')));
    const out = node.output;

    // Code-review findings block on merge node
    if (node.id === 'merge' && Array.isArray(out.findings) && out.findings.length) {
      const fList = h('div', { class: 'attempts-list', style: { marginBottom: '10px' } });
      for (const f of out.findings) {
        const tagCls = f.severity === 'high' ? 'tag-fail' : f.severity === 'medium' ? '' : '';
        fList.appendChild(
          h(
            'div',
            { class: 'attempt-row', style: { flexDirection: 'column', gap: '3px' } },
            h(
              'div',
              { style: { display: 'flex', gap: '6px', width: '100%' } },
              h(
                'span',
                { class: tagCls, style: { textTransform: 'uppercase', color: f.severity === 'medium' ? 'var(--gate)' : undefined } },
                f.severity,
              ),
              h('span', { style: { color: 'var(--ink)' } }, `${f.file}:${f.line || ''}`),
            ),
            h('div', { style: { color: 'var(--ink-2)', fontFamily: 'var(--sans)' } }, f.title),
            f.evidence ? h('div', { style: { color: 'var(--muted)', fontSize: '10.5px' } }, f.evidence) : null,
          ),
        );
      }
      outSec.appendChild(fList);
    }

    if (out && typeof out === 'object' && ('stdout' in out || 'stderr' in out)) {
      outSec.appendChild(renderTerminal(out.stdout || '', out.stderr || '', out.code));
    } else if (out && typeof out === 'object' && typeof out.text === 'string') {
      const lines = out.text.split('\n');
      const clipped = lines.length > AGENT_TEXT_LINE_CAP ? lines.slice(0, AGENT_TEXT_LINE_CAP).join('\n') + '\n…' : out.text;
      outSec.appendChild(
        h('pre', { class: 'term-pre', style: { border: '1px solid var(--line)', borderRadius: 'var(--r-card)', background: 'var(--bg-sunken)', marginBottom: '8px' } }, clipped),
      );
      outSec.appendChild(renderJsonTree(out, { showAllLabel: t('showAll') }));
    } else {
      outSec.appendChild(renderJsonTree(out, { showAllLabel: t('showAll') }));
    }
    container.appendChild(outSec);
  }
}

function renderLaneDetail(container, store, host, view, lane) {
  const isReview = view.preset === 'code-review';
  container.appendChild(
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        { class: 'panel-title-wrap' },
        h('i', { class: 'dot worker' }),
        h('span', { class: 'panel-title' }, lane.id),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '6px', flexShrink: 0 } },
        h('span', { class: 'chip' }, isReview ? 'LENS' : 'UNIT'),
        h(
          'span',
          {
            class: 'chip',
            style: { color: lane.status === 'pass' ? 'var(--ok)' : lane.status === 'fail' ? 'var(--fail)' : 'var(--ink-2)' },
          },
          lane.status,
        ),
      ),
    ),
  );

  // Actions
  const actions = [];
  if (lane.branch) {
    actions.push(
      h('button', { type: 'button', class: 'secondary', onClick: () => copyText(host, lane.branch) }, t('copyBranch')),
    );
  }
  const st = store.get();
  if (!isReview && lane.item && st.caps.workflow !== false && st.mode !== 'demo') {
    const busy = !!(st.pending || (st.mode === 'live' && st.run && ['running', 'waiting_gate'].includes(st.run.state)));
    actions.push(
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        h('button', { type: 'button', class: 'secondary', disabled: busy, onClick: () => host.rerunUnit(lane.item) }, t('rerunUnit')),
        h('span', { style: { fontSize: '11px', color: 'var(--muted)' } }, t('rerunUnitNote')),
      ),
    );
  }
  if (actions.length) container.appendChild(h('div', { class: 'panel-actions' }, ...actions));

  if (lane.error) {
    container.appendChild(
      h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, t('errorSec')), h('div', { class: 'error-box' }, lane.error)),
    );
  }

  // Spec
  if (lane.item) {
    const specSec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, t('unitSpecSec')));
    if (isReview) {
      specSec.appendChild(
        h(
          'div',
          { class: 'note-box' },
          h('div', { style: { fontWeight: '600', marginBottom: '4px' } }, lane.item.focus || ''),
          h('div', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } }, (lane.item.checklist || []).map(c => `• ${c}`).join('\n')),
        ),
      );
    } else {
      specSec.appendChild(
        h(
          'div',
          { class: 'kv-grid' },
          h('div', { class: 'kv-item' }, h('div', { class: 'kv-k' }, 'title'), h('div', { class: 'kv-v', title: lane.item.title }, lane.item.title || '—')),
          h('div', { class: 'kv-item' }, h('div', { class: 'kv-k' }, 'checkCmd'), h('div', { class: 'kv-v', title: lane.item.checkCmd }, lane.item.checkCmd || '—')),
          h('div', { class: 'kv-item' }, h('div', { class: 'kv-k' }, 'checkFiles'), h('div', { class: 'kv-v' }, (lane.item.checkFiles || []).join(', ') || '—')),
          h('div', { class: 'kv-item' }, h('div', { class: 'kv-k' }, 'branch'), h('div', { class: 'kv-v' }, lane.branch || '—')),
        ),
      );
    }
    container.appendChild(specSec);
  }

  // Attempts timeline
  const attList = h('div', { class: 'attempts-list' });
  if (lane.events && lane.events.length) {
    for (const ev of lane.events) {
      const okCls = ev.s === 'pass' ? 'tag-pass' : ev.s === 'fail' ? 'tag-fail' : '';
      const mark = ev.s === 'pass' ? '✓' : ev.s === 'fail' ? '✗' : '•';
      attList.appendChild(
        h(
          'div',
          { class: 'attempt-row' },
          h('span', { class: okCls }, `${ev.p.toUpperCase()} ${mark}`),
          ev.a ? h('span', { style: { color: 'var(--muted)' } }, `a${ev.a}`) : null,
          ev.m ? h('span', { style: { color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis' } }, ev.m) : null,
        ),
      );
    }
  } else if (isReview) {
    (lane.attempts.evidence || []).forEach((sVal, i) => {
      attList.appendChild(
        h('div', { class: 'attempt-row' }, h('span', { class: sVal === 'pass' ? 'tag-pass' : 'tag-fail' }, `EVIDENCE ${sVal === 'pass' ? '✓' : '✗'} a${i + 1}`)),
      );
    });
  } else {
    (lane.attempts.red || []).forEach((sVal, i) => {
      attList.appendChild(
        h('div', { class: 'attempt-row' }, h('span', { class: sVal === 'pass' ? 'tag-pass' : 'tag-fail' }, `RED ${sVal === 'pass' ? '✓' : '✗'} a${i + 1}`)),
      );
    });
    (lane.attempts.green || []).forEach((sVal, i) => {
      attList.appendChild(
        h('div', { class: 'attempt-row' }, h('span', { class: sVal === 'pass' ? 'tag-pass' : 'tag-fail' }, `GREEN ${sVal === 'pass' ? '✓' : '✗'} a${i + 1}`)),
      );
    });
  }

  if (attList.children.length) {
    container.appendChild(h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, t('attemptsSec')), attList));
  }

  // Final outputs
  if (lane.result && lane.result.outputs) {
    const outSec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, t('outputSec')));
    const vg = lane.result.outputs.verify_green;
    if (vg && ('stdout' in vg || 'stderr' in vg)) {
      outSec.appendChild(renderTerminal(vg.stdout || '', vg.stderr || '', vg.code));
    }
    outSec.appendChild(h('div', { style: { marginTop: '8px' } }, renderJsonTree(lane.result.outputs, { showAllLabel: t('showAll') })));
    container.appendChild(outSec);
  }
}
