import { h } from './dom.js';

const ROW_CAP = 200;

export function renderJsonTree(value, opts = {}) {
  const root = h('div', { class: 'jtree' });
  let rows = 0;
  let truncated = false;
  const showAll = !!opts.showAll;

  function build(val, keyName, depth) {
    if (!showAll && rows >= ROW_CAP) {
      truncated = true;
      return null;
    }
    if (val === null || typeof val !== 'object') {
      rows += 1;
      const row = h('div', { class: 'jtree-row' });
      if (keyName !== null) {
        row.appendChild(h('span', { class: 'jk' }, `${keyName}: `));
      }
      if (typeof val === 'string') {
        row.appendChild(h('span', { class: 'js' }, JSON.stringify(val)));
      } else if (typeof val === 'number') {
        row.appendChild(h('span', { class: 'jn' }, String(val)));
      } else {
        row.appendChild(h('span', { class: 'jb' }, String(val)));
      }
      return row;
    }

    const isArr = Array.isArray(val);
    const entries = isArr ? val.map((v, i) => [String(i), v]) : Object.entries(val);
    if (entries.length === 0) {
      rows += 1;
      const row = h('div', { class: 'jtree-row' });
      if (keyName !== null) row.appendChild(h('span', { class: 'jk' }, `${keyName}: `));
      row.appendChild(h('span', { class: 'jb' }, isArr ? '[]' : '{}'));
      return row;
    }

    rows += 1;
    const det = h('details', { open: depth < 2 });
    const summaryText = isArr ? `[${entries.length}]` : `{${entries.length}}`;
    const sum = h('summary', null);
    if (keyName !== null) sum.appendChild(h('span', { class: 'jk' }, `${keyName}: `));
    sum.appendChild(h('span', { class: 'jb' }, summaryText));
    det.appendChild(sum);

    const body = h('div', { class: 'jtree-children' });
    for (const [k, v] of entries) {
      const child = build(v, k, depth + 1);
      if (child) body.appendChild(child);
      if (!showAll && rows >= ROW_CAP) {
        truncated = true;
        break;
      }
    }
    det.appendChild(body);
    return det;
  }

  const top = build(value, null, 0);
  if (top) root.appendChild(top);
  if (truncated && !showAll) {
    const moreBtn = h(
      'button',
      {
        type: 'button',
        class: 'ghost',
        style: { marginTop: '6px', height: '24px', padding: '0 8px' },
        onClick: () => {
          const full = renderJsonTree(value, { showAll: true });
          root.replaceWith(full);
        },
      },
      opts.showAllLabel || 'Show all',
    );
    root.appendChild(moreBtn);
  }
  return root;
}
