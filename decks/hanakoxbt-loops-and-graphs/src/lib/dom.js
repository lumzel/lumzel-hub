const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') {
      el.setAttribute('class', v);
    } else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) {
        if (dv !== undefined && dv !== null) el.dataset[dk] = String(dv);
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

function appendChildren(el, children) {
  for (const ch of children.flat(Infinity)) {
    if (ch === null || ch === undefined || ch === false) continue;
    el.appendChild(typeof ch === 'string' || typeof ch === 'number' ? document.createTextNode(String(ch)) : ch);
  }
}

export function setAttr(el, name, value) {
  const next = value === null || value === undefined || value === false ? null : value === true ? '' : String(value);
  const prev = el.getAttribute(name);
  if (prev === next) return false;
  if (next === null) el.removeAttribute(name);
  else el.setAttribute(name, next);
  return true;
}

export function setText(el, text) {
  const next = text === null || text === undefined ? '' : String(text);
  if (el.textContent !== next) el.textContent = next;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
