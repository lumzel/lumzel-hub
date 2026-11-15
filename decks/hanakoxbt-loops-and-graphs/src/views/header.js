import { h, clear, setAttr, setText } from '../lib/dom.js';
import { fmtDuration } from '../lib/format.js';
import { t } from '../i18n.js';
import { derive } from '../runModel.js';

export function mountHeader(store, host) {
  const ctxEl = document.getElementById('ctx');
  const presetEl = document.getElementById('preset');
  const demoTagEl = document.getElementById('demo-tag');
  const demoMenuWrap = document.getElementById('demo-menu-wrap');
  const demoPop = document.getElementById('demo-pop');
  const agentWrap = document.getElementById('agent-wrap');
  const agentBtn = document.getElementById('agent-btn');
  const agentDot = document.getElementById('agent-dot');
  const agentLabel = document.getElementById('agent-label');
  const agentPop = document.getElementById('agent-pop');
  const agentBadge = document.getElementById('agent-badge');
  const agentResetBtn = document.getElementById('agent-reset-btn');
  const agentSelect = document.getElementById('agent-select');
  const agentModelSelect = document.getElementById('agent-model-select');
  const agentEffortRow = document.getElementById('agent-effort-row');
  const agentEffortSelect = document.getElementById('agent-effort-select');
  const agentHint = document.getElementById('agent-hint');
  const agentSaveDefaultBtn = document.getElementById('agent-save-default-btn');
  const pillEl = document.getElementById('run-pill');
  const demoBtn = document.getElementById('demo-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const inspBtn = document.getElementById('insp-btn');

  // Wire preset tabs
  presetEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn) return;
    host.selectPreset(btn.dataset.preset);
  });

  // Demo toggle button
  demoBtn.addEventListener('click', () => {
    const st = store.get();
    if (st.mode === 'demo') {
      host.demo.stop();
    } else if (st.mode === 'live' && st.run && (st.run.state === 'running' || st.run.state === 'waiting_gate')) {
      host.showToast(t('stop') + '...');
    } else {
      host.demo.start(st.preset);
    }
  });

  // Demo menu popover toggle on DEMO tag click
  demoTagEl.addEventListener('click', e => {
    e.stopPropagation();
    demoPop.hidden = !demoPop.hidden;
  });

  function setAgentPopOpen(open) {
    if (!agentPop || !agentBtn) return;
    agentPop.hidden = !open;
    agentBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (agentBtn && agentPop) {
    agentBtn.addEventListener('click', e => {
      e.stopPropagation();
      setAgentPopOpen(agentPop.hidden);
    });
  }

  document.addEventListener('click', e => {
    if (!demoPop.hidden && !demoMenuWrap.contains(e.target) && e.target !== demoTagEl) {
      demoPop.hidden = true;
    }
    if (agentPop && !agentPop.hidden && agentWrap && !agentWrap.contains(e.target)) {
      setAgentPopOpen(false);
    }
  });

  if (agentSelect) {
    agentSelect.addEventListener('change', () => {
      host.setAgentOverride({ provider: agentSelect.value, model: '', effort: '' });
    });
  }
  if (agentModelSelect) {
    agentModelSelect.addEventListener('change', () => {
      host.setAgentOverride({ model: agentModelSelect.value, effort: '' });
    });
  }
  if (agentEffortSelect) {
    agentEffortSelect.addEventListener('change', () => {
      host.setAgentOverride({ effort: agentEffortSelect.value });
    });
  }
  if (agentResetBtn) {
    agentResetBtn.addEventListener('click', () => {
      host.resetAgentDefaults();
    });
  }
  if (agentSaveDefaultBtn) {
    agentSaveDefaultBtn.addEventListener('click', () => {
      host.saveAgentAsProjectDefault();
    });
  }
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      host.openSettings();
    });
  }

  // Inspector toggle
  inspBtn.addEventListener('click', () => {
    const open = !store.get().ui.inspectorOpen;
    host.savePrefs({ inspectorOpen: open });
  });

  function renderAgentSelector(catalog, override, ctx, mode) {
    if (!agentWrap) return;
    const info = host.effectiveAgentInfo(catalog, override);
    const show = !ctx?.preview && mode !== 'demo' && info.agents.length > 0;
    agentWrap.hidden = !show;
    if (!show) {
      setAgentPopOpen(false);
      return;
    }

    const parts = [info.providerName, info.modelName, info.effort].filter(Boolean);
    setText(agentLabel, parts.join(' · '));
    agentBtn.classList.toggle('active', info.hasOverride);
    if (agentDot) {
      agentDot.className = info.hasOverride ? 'dot run' : 'dot ink';
    }
    if (agentBadge) {
      setText(agentBadge, info.hasOverride ? t('agentBadgeCustom') : t('agentBadgeHost'));
    }
    if (agentResetBtn) {
      agentResetBtn.hidden = !info.hasOverride && !info.hasDeckDefaults;
    }
    if (agentSaveDefaultBtn) {
      agentSaveDefaultBtn.hidden = !info.hasOverride;
    }
    if (agentHint) {
      setText(agentHint, info.hasOverride ? t('agentHintCustom') : t('agentHintHost'));
    }

    if (agentSelect) {
      clear(agentSelect);
      const hostName = info.hostAgent?.name || info.providerName;
      agentSelect.appendChild(
        h('option', { value: '' }, t('agentFollowHost', { name: hostName })),
      );
      for (const a of info.agents) {
        agentSelect.appendChild(h('option', { value: a.id }, a.name || a.id));
      }
      agentSelect.value = override?.provider || '';
    }

    if (agentModelSelect) {
      clear(agentModelSelect);
      const defModelObj = info.models.find(m => m.id === info.defaultModelId);
      const defModelName = defModelObj?.name || info.defaultModelId || 'auto';
      agentModelSelect.appendChild(
        h('option', { value: '' }, t('agentFollowDefaultModel', { name: defModelName })),
      );
      for (const m of info.models) {
        agentModelSelect.appendChild(h('option', { value: m.id }, m.name || m.id));
      }
      agentModelSelect.value = override?.model || '';
      agentModelSelect.disabled = info.models.length === 0;
    }

    if (agentEffortRow && agentEffortSelect) {
      const hasEfforts = info.efforts.length > 0;
      agentEffortRow.hidden = !hasEfforts;
      if (hasEfforts) {
        clear(agentEffortSelect);
        agentEffortSelect.appendChild(
          h('option', { value: '' }, t('agentFollowDefaultEffort', { effort: info.defaultEffort || 'default' })),
        );
        for (const ef of info.efforts) {
          agentEffortSelect.appendChild(h('option', { value: ef }, ef));
        }
        agentEffortSelect.value = override?.effort || '';
      }
    }
  }

  function renderDemoMenu(speed) {
    clear(demoPop);
    demoPop.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'ghost',
          onClick: () => {
            host.demo.setSpeed(speed === 4 ? 1 : 4);
            demoPop.hidden = true;
          },
        },
        h('span', null, t('demoSpeed')),
        h('span', { class: 'mono' }, speed === 4 ? '4×' : '1×'),
      ),
    );
    demoPop.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'ghost',
          onClick: () => {
            host.demo.restart();
            demoPop.hidden = true;
          },
        },
        h('span', null, t('demoRestart')),
      ),
    );
    demoPop.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'ghost',
          onClick: () => {
            host.demo.seek('gate');
            demoPop.hidden = true;
          },
        },
        h('span', null, t('demoJumpGate')),
      ),
    );
    demoPop.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'danger-outline',
          onClick: () => {
            host.demo.stop();
            demoPop.hidden = true;
          },
        },
        h('span', null, t('demoExit')),
      ),
    );
  }

  store.subscribe(
    s => s.ctx,
    ctx => {
      const parts = [ctx.project, ctx.branch].filter(Boolean);
      setText(ctxEl, parts.join(' · '));
    },
  );

  store.subscribe(
    s => ({
      catalog: s.agentCatalog,
      override: s.agentOverride,
      ctx: s.ctx,
      mode: s.mode,
    }),
    ({ catalog, override, ctx, mode }) => {
      renderAgentSelector(catalog, override, ctx, mode);
    },
    (a, b) =>
      a.catalog === b.catalog &&
      a.override === b.override &&
      a.ctx.preview === b.ctx.preview &&
      a.ctx.locale === b.ctx.locale &&
      a.mode === b.mode,
  );

  store.subscribe(
    s => s.preset,
    preset => {
      for (const btn of presetEl.querySelectorAll('button[data-preset]')) {
        setAttr(btn, 'aria-selected', btn.dataset.preset === preset ? 'true' : 'false');
      }
    },
  );

  store.subscribe(
    s => ({ mode: s.mode, speed: s.ui.demoSpeed, insp: s.ui.inspectorOpen, run: s.run }),
    ({ mode, speed, insp, run }) => {
      const isDemo = mode === 'demo';
      demoTagEl.hidden = !isDemo;
      demoMenuWrap.hidden = !isDemo;
      if (!isDemo) demoPop.hidden = true;
      renderDemoMenu(speed);

      const liveBusy =
        mode === 'live' && run && (run.state === 'running' || run.state === 'waiting_gate');
      demoBtn.disabled = Boolean(liveBusy);
      demoBtn.classList.toggle('active', isDemo);
      inspBtn.classList.toggle('active', Boolean(insp));
    },
    (a, b) => a.mode === b.mode && a.speed === b.speed && a.insp === b.insp && a.run === b.run,
  );

  store.subscribe(
    s => ({
      run: s.run,
      pending: s.pending,
      preset: s.preset,
      tick: s.ui.tick,
      locale: s.ctx.locale,
    }),
    ({ run, pending, preset }) => {
      clear(pillEl);
      if (pending === 'starting') {
        setAttr(pillEl, 'data-state', 'running');
        pillEl.appendChild(h('i', { class: 'pill-dot' }));
        pillEl.appendChild(document.createTextNode(t('starting')));
        return;
      }
      if (!run) {
        setAttr(pillEl, 'data-state', null);
        pillEl.textContent = '—';
        return;
      }

      const nowSec = store.get().ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(run, preset, store.get().telemetry.rev, store.get().telemetry.byUnit, nowSec);
      const st = run.state;
      const out = run.outputs || {};
      const integ = out.integrate || {};
      const notShippable = st === 'failed' && integ.shippable === false;

      if (notShippable) {
        setAttr(pillEl, 'data-state', 'stopped');
        pillEl.textContent = t('notShippable', { reason: (integ.check && integ.check.reason) || 'gate' });
        return;
      }

      setAttr(pillEl, 'data-state', st);
      if (st === 'running') {
        pillEl.appendChild(h('i', { class: 'pill-dot' }));
        pillEl.appendChild(document.createTextNode(`running ${fmtDuration(view.elapsedSec)}`));
      } else if (st === 'waiting_gate') {
        pillEl.textContent = `◆ ${t('reviewGate')}`;
      } else if (st === 'completed') {
        pillEl.textContent =
          view.preset === 'code-review'
            ? `✓ ${view.verdict ? view.verdict.verdict : 'reviewed'}`
            : out.ship && out.ship.ok
              ? '✓ shipped'
              : '✓ completed';
      } else if (st === 'failed') {
        const failNode = (run.nodes || []).slice().reverse().find(n => n.state === 'failed');
        pillEl.textContent = failNode ? `✗ failed at ${failNode.nodeId}` : '✗ failed';
      } else if (st === 'stopped') {
        pillEl.textContent = '■ stopped';
      } else if (st === 'interrupted') {
        pillEl.textContent = '⟲ interrupted';
      } else if (st === 'limit') {
        pillEl.textContent = '✗ limit';
      } else {
        pillEl.textContent = st;
      }
    },
    (a, b) =>
      a.run === b.run &&
      a.pending === b.pending &&
      a.preset === b.preset &&
      a.tick === b.tick &&
      a.locale === b.locale,
  );
}
