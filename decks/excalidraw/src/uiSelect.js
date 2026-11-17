// Custom accessible UI Select component (replaces native <select> elements).
// Matches Lumzel's Select interaction: combobox trigger, fixed-positioned listbox menu,
// checkmark indicator, optional swatch dot, keyboard navigation, and outside-click handling.

const registry = new Map();
let activeController = null;
let idSeq = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function createChevronSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ui-sel-chevron');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'm4 6 4 4 4-4');
  svg.appendChild(path);
  return svg;
}

function createCheckSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ui-sel-check');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.85');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'm3.5 8.5 3 3 6-7');
  svg.appendChild(path);
  return svg;
}

function closeActiveSelect(refocus = false) {
  if (activeController) {
    activeController.close(refocus);
  }
}

document.addEventListener(
  'pointerdown',
  e => {
    if (!activeController) return;
    const { root, menu } = activeController;
    if (root.contains(e.target) || menu.contains(e.target)) return;
    closeActiveSelect(false);
  },
  true,
);

window.addEventListener(
  'scroll',
  e => {
    if (!activeController) return;
    if (activeController.menu.contains(e.target)) return;
    closeActiveSelect(false);
  },
  true,
);

window.addEventListener('resize', () => {
  if (activeController) closeActiveSelect(false);
});

window.addEventListener('blur', () => {
  if (activeController) closeActiveSelect(false);
});

window.addEventListener(
  'keydown',
  e => {
    if (!activeController) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeActiveSelect(true);
    }
  },
  true,
);

export function initUiSelect(rootEl, { options = [], value = '', placeholder = '', onChange } = {}) {
  if (!rootEl) return null;
  if (registry.has(rootEl)) return registry.get(rootEl);

  const uid = `ui-sel-${++idSeq}`;
  const state = {
    options: Array.isArray(options) ? options : [],
    value: value ?? '',
    placeholder: placeholder || '',
    open: false,
    activeIndex: -1,
    typedText: '',
    typedAt: 0,
  };

  const swatchEl = el('span', { class: 'ui-sel-swatch', hidden: true });
  const textEl = el('span', { class: 'ui-sel-text' });
  const trigger = el(
    'button',
    {
      type: 'button',
      class: 'ui-sel-trigger',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-controls': `${uid}-list`,
    },
    swatchEl,
    textEl,
    createChevronSvg(),
  );

  const menu = el('div', {
    class: 'ui-sel-menu',
    id: `${uid}-list`,
    role: 'listbox',
    hidden: true,
    'data-ui-select-menu': 'true',
  });
  menu._owner = rootEl;

  rootEl.classList.add('ui-select');
  rootEl.replaceChildren(trigger);
  document.body.appendChild(menu);

  function isEnabled(idx) {
    return idx >= 0 && idx < state.options.length && !state.options[idx].disabled;
  }

  function stepIndex(from, dir) {
    for (let i = from + dir; i >= 0 && i < state.options.length; i += dir) {
      if (isEnabled(i)) return i;
    }
    return from;
  }

  function syncTrigger() {
    const chosen = state.options.find(opt => opt.value === state.value);
    const label = chosen ? chosen.label : state.value || state.placeholder || '';
    const isBlank = Boolean(chosen?.muted || (!chosen && !state.value) || (chosen && chosen.value === ''));
    textEl.textContent = label;
    trigger.title = label;
    trigger.classList.toggle('is-blank', isBlank);
    if (chosen?.swatch) {
      swatchEl.style.background = chosen.swatch;
      swatchEl.hidden = false;
    } else {
      swatchEl.hidden = true;
    }
  }

  function renderMenu() {
    const nodes = state.options.map((opt, idx) => {
      const selected = opt.value === state.value;
      const active = idx === state.activeIndex;
      const cls = [
        'ui-sel-opt',
        selected ? 'on' : '',
        active ? 'act' : '',
        opt.muted || opt.value === '' ? 'is-blank' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return el(
        'div',
        {
          id: `${uid}-opt-${idx}`,
          class: cls,
          role: 'option',
          'aria-selected': selected ? 'true' : 'false',
          'aria-disabled': opt.disabled ? 'true' : undefined,
          'data-value': opt.value,
          onmousedown: e => e.preventDefault(),
          onmouseenter: () => {
            if (!isEnabled(idx) || state.activeIndex === idx) return;
            state.activeIndex = idx;
            for (let i = 0; i < menu.children.length; i++) {
              menu.children[i].classList.toggle('act', i === idx);
            }
            trigger.setAttribute('aria-activedescendant', `${uid}-opt-${idx}`);
          },
          onclick: e => {
            e.stopPropagation();
            choose(idx);
          },
        },
        opt.swatch ? el('span', { class: 'ui-sel-swatch', style: `background:${opt.swatch}` }) : null,
        el('span', { class: 'ui-sel-opt-text' }, opt.label),
        opt.hint ? el('span', { class: 'ui-sel-hint' }, opt.hint) : null,
        selected ? createCheckSvg() : null,
      );
    });
    menu.replaceChildren(...nodes);
  }

  function positionMenu() {
    const rect = trigger.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const roomAbove = rect.top - 8;
    const openUp = roomBelow < 210 && roomAbove > roomBelow;
    const maxHeight = Math.max(120, Math.min(260, openUp ? roomAbove : roomBelow));
    const minWidth = Math.max(rect.width, 148);
    const maxWidth = Math.min(340, Math.max(180, window.innerWidth - 16));
    const estWidth = Math.min(maxWidth, Math.max(minWidth, rect.width));
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - estWidth - 8));

    menu.classList.toggle('up', openUp);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.minWidth = `${Math.round(rect.width)}px`;
    menu.style.maxWidth = `${Math.round(maxWidth)}px`;
    menu.style.maxHeight = `${Math.round(maxHeight)}px`;
    if (openUp) {
      menu.style.top = 'auto';
      menu.style.bottom = `${Math.round(window.innerHeight - rect.top + 4)}px`;
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = `${Math.round(rect.bottom + 4)}px`;
    }
  }

  function open() {
    if (state.open || trigger.disabled || !state.options.length) return;
    if (activeController && activeController !== controller) {
      closeActiveSelect(false);
    }
    const selIdx = state.options.findIndex(o => o.value === state.value && !o.disabled);
    state.activeIndex = selIdx >= 0 ? selIdx : stepIndex(-1, 1);
    state.open = true;
    activeController = controller;
    rootEl.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    renderMenu();
    menu.hidden = false;
    positionMenu();
    if (state.activeIndex >= 0) {
      trigger.setAttribute('aria-activedescendant', `${uid}-opt-${state.activeIndex}`);
      menu.children[state.activeIndex]?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function close(refocus = false) {
    if (!state.open) return;
    state.open = false;
    if (activeController === controller) activeController = null;
    delete rootEl.dataset.open;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    menu.hidden = true;
    if (refocus) trigger.focus();
  }

  function choose(idx) {
    if (!isEnabled(idx)) return;
    const nextVal = state.options[idx].value;
    const changed = nextVal !== state.value;
    state.value = nextVal;
    syncTrigger();
    close(true);
    if (changed) {
      if (typeof onChange === 'function') onChange(nextVal);
      rootEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function moveActive(idx) {
    if (!isEnabled(idx)) return;
    state.activeIndex = idx;
    for (let i = 0; i < menu.children.length; i++) {
      menu.children[i].classList.toggle('act', i === idx);
    }
    trigger.setAttribute('aria-activedescendant', `${uid}-opt-${idx}`);
    menu.children[idx]?.scrollIntoView?.({ block: 'nearest' });
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    if (state.open) close(false);
    else open();
  });

  trigger.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    const { key } = e;
    if (!state.open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        e.preventDefault();
        open();
      }
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      moveActive(stepIndex(state.activeIndex, 1));
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      moveActive(stepIndex(state.activeIndex, -1));
    } else if (key === 'Home') {
      e.preventDefault();
      moveActive(stepIndex(-1, 1));
    } else if (key === 'End') {
      e.preventDefault();
      moveActive(stepIndex(state.options.length, -1));
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      choose(state.activeIndex);
    } else if (key === 'Tab') {
      close(false);
    } else if (key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const text = now - state.typedAt < 900 ? state.typedText + key.toLowerCase() : key.toLowerCase();
      state.typedText = text;
      state.typedAt = now;
      const from = text.length === 1 ? state.activeIndex : state.activeIndex - 1;
      for (let i = 0; i < state.options.length; i++) {
        const idx = (from + 1 + i) % state.options.length;
        if (isEnabled(idx) && String(state.options[idx].label || '').toLowerCase().startsWith(text)) {
          moveActive(idx);
          break;
        }
      }
    }
  });

  const controller = {
    root: rootEl,
    menu,
    trigger,
    setOptions(nextOptions, nextValue) {
      state.options = Array.isArray(nextOptions) ? nextOptions : [];
      if (nextValue !== undefined) {
        state.value = nextValue ?? '';
      } else if (!state.options.some(o => o.value === state.value)) {
        state.value = state.options[0]?.value ?? '';
      }
      syncTrigger();
      if (state.open) {
        renderMenu();
        positionMenu();
      }
    },
    getValue() {
      return state.value;
    },
    setValue(nextValue) {
      state.value = nextValue ?? '';
      syncTrigger();
      if (state.open) renderMenu();
    },
    focus() {
      trigger.focus();
    },
    close,
  };

  Object.defineProperty(rootEl, 'value', {
    configurable: true,
    get() {
      return controller.getValue();
    },
    set(v) {
      controller.setValue(v);
    },
  });
  rootEl.focus = () => controller.focus();

  syncTrigger();
  registry.set(rootEl, controller);
  return controller;
}

export function setUiSelectOptions(rootEl, options, value) {
  const ctrl = registry.get(rootEl) || initUiSelect(rootEl);
  ctrl?.setOptions(options, value);
}

export function getUiSelectValue(rootEl) {
  const ctrl = registry.get(rootEl);
  return ctrl ? ctrl.getValue() : rootEl?.value || '';
}

export function setUiSelectValue(rootEl, value) {
  const ctrl = registry.get(rootEl);
  if (ctrl) ctrl.setValue(value);
  else if (rootEl) rootEl.value = value;
}

export function focusUiSelect(rootEl) {
  const ctrl = registry.get(rootEl);
  if (ctrl) ctrl.focus();
  else rootEl?.focus?.();
}

export function isSelectMenuOwnedBy(target, container) {
  const menu = target?.closest?.('.ui-sel-menu');
  return Boolean(menu && menu._owner && container?.contains?.(menu._owner));
}
