import { h, clear, setText } from '../lib/dom.js';
import { fmtDuration, shortId } from '../lib/format.js';
import { derive } from '../runModel.js';
import { t } from '../i18n.js';

export function mountStrip(store) {
  const stripEl = document.getElementById('strip');
  let staticKey = null;
  let timerSpan = null;

  function item(label, value, cls = '', extraCls = '') {
    return h(
      'span',
      { class: `strip-item ${extraCls}`.trim() },
      label ? h('span', { class: 'strip-lbl' }, label) : null,
      h('span', { class: `strip-val ${cls}`.trim() }, value),
    );
  }
  function sep(extraCls = '') {
    return h('span', { class: `strip-sep ${extraCls}`.trim(), 'aria-hidden': 'true' }, '·');
  }

  store.subscribe(
    s => ({
      run: s.run,
      preset: s.preset,
      telemetryRev: s.telemetry.rev,
      tick: s.ui.tick,
      locale: s.ctx.locale,
    }),
    ({ run, preset, telemetryRev, locale }) => {
      const nowSec = store.get().ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(run, preset, telemetryRev, store.get().telemetry.byUnit, nowSec);
      const sum = view.summary;

      // Update aria-hidden timer span directly when only tick changed (§10.8 accessibility)
      const nextStaticKey = `${view.runId || 'bp'}|${view.preset}|${view.state}|${view.round}|${telemetryRev}|${locale}`;
      if (nextStaticKey === staticKey && timerSpan) {
        setText(timerSpan, fmtDuration(view.elapsedSec));
        return;
      }
      staticKey = nextStaticKey;

      clear(stripEl);
      timerSpan = h(
        'span',
        { class: 'strip-val', 'aria-hidden': 'true' },
        fmtDuration(view.elapsedSec),
      );

      if (!run) {
        stripEl.append(
          item('RUN', '—'),
          sep(),
          item('', view.preset),
          sep(),
          item('state', 'idle'),
          sep(),
          h('span', { class: 'strip-item' }, timerSpan),
          sep(),
          item('round', '—'),
          sep('s-optional'),
          item(view.preset === 'code-review' ? 'lenses' : 'units', '—', '', 's-optional'),
          sep('s-optional'),
          item('C', '—', '', 's-optional'),
        );
        return;
      }

      const integ = (run.outputs && run.outputs.integrate) || {};
      const notShippable = run.state === 'failed' && integ.shippable === false;
      const stateCls =
        run.state === 'completed'
          ? 'ok'
          : run.state === 'waiting_gate'
            ? 'wait'
            : run.state === 'failed' && !notShippable
              ? 'fail'
              : '';
      const stateLabel = notShippable
        ? t('notShippable', { reason: (integ.check && integ.check.reason) || 'check' })
        : run.state;

      if (view.preset === 'code-review') {
        const counts = sum.counts;
        const findingsTxt = counts ? `H${counts.high} M${counts.medium} L${counts.low}` : '—';
        const checksTxt = !sum.checks
          ? '—'
          : sum.checks.skipped
            ? 'skip'
            : sum.checks.ok
              ? 'PASS'
              : 'FAIL';
        const verdictTxt = sum.verdict ? sum.verdict.toUpperCase() : '—';
        const cTxt = sum.constraints !== null && sum.constraints !== undefined ? String(sum.constraints) : '—';

        stripEl.append(
          item('RUN', shortId(view.runId)),
          sep(),
          item('', stateLabel, stateCls),
          sep(),
          h('span', { class: 'strip-item' }, timerSpan),
          sep(),
          item('files', sum.files ? String(sum.files) : '—'),
          sep(),
          item('lenses', sum.units ? `${sum.passed}/${sum.units}` : '—'),
          sep('s-optional'),
          item('findings', findingsTxt, '', 's-optional'),
          sep('s-optional'),
          item('checks', checksTxt, checksTxt === 'PASS' ? 'ok' : checksTxt === 'FAIL' ? 'fail' : '', 's-optional'),
          sep(),
          item('verdict', verdictTxt, sum.verdict === 'block' ? 'fail' : sum.verdict === 'attention' ? 'wait' : sum.verdict === 'clean' ? 'ok' : ''),
          sep('s-optional'),
          item('C', cTxt, '', 's-optional'),
        );
        return;
      }

      const unitStr = sum.units
        ? `✓${sum.passed} ✗${sum.failed} …${sum.running} /${sum.units}`
        : '—';
      const cTxt = sum.constraints !== null && sum.constraints !== undefined ? String(sum.constraints) : '—';

      stripEl.append(
        item('RUN', shortId(view.runId)),
        sep(),
        item('', stateLabel, stateCls),
        sep(),
        h('span', { class: 'strip-item' }, timerSpan),
        sep(),
        item('round', String(view.round || 1)),
        sep(),
        item('units', unitStr),
        sep('s-optional'),
        item('retries', String(sum.retries ?? 0), '', 's-optional'),
        sep('s-optional'),
        item('reworks', String(sum.reworks ?? 0), '', 's-optional'),
        sep('s-optional'),
        item('C', cTxt, '', 's-optional'),
      );
    },
    (a, b) =>
      a.run === b.run &&
      a.preset === b.preset &&
      a.telemetryRev === b.telemetryRev &&
      a.tick === b.tick &&
      a.locale === b.locale,
  );
}
