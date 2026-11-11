// HTML Visual Doc runtime. The page is readable without it; this adds theme follow, Node picking and Trace focus.
// Same postMessage bridge as prototype.js: doc:pick, doc:trace, doc:theme, doc:show.
// The Deck loads it into every Visual Doc it frames (runtime/worktree.js); a doc on disk links nothing.
(() => {
  const root = document.documentElement;
  const query = new URLSearchParams(location.search);
  const saved = (() => {
    try {
      return localStorage.getItem('doc-theme');
    } catch {
      return null;
    }
  })();
  const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = query.get('theme') || saved || (prefersDark ? 'dark' : 'light');

  const parent = window.parent !== window ? window.parent : null;
  // Accept the current data-doc-* vocabulary and the pre-migration data-lumzel-* spelling.
  const value = (el, key) => {
    const current = el?.getAttribute(`data-doc-${key}`);
    if (current != null) return current;
    // The root used data-lumzel-doc before the attribute vocabulary was renamed.
    const legacyName = key === 'id' && el === root ? 'data-lumzel-doc' : `data-lumzel-${key}`;
    return el?.getAttribute(legacyName) ?? '';
  };
  const nodes = () => [...document.querySelectorAll('[data-doc-node], [data-lumzel-node]')];
  const labelOf = el =>
    (el.querySelector('[data-doc-label], [data-lumzel-label]') || el).textContent.replace(/\s+/g, ' ').trim();
  const linksOf = el => value(el, 'links').split(/\s+/).filter(Boolean);

  let picked = null;
  const pick = el => {
    if (picked) picked.classList.remove('lumzel-picked');
    picked = el;
    if (el) el.classList.add('lumzel-picked');
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-doc-node], [data-lumzel-node]');
    if (!el || !parent) return;
    if (e.target.closest('a')) return;
    pick(el);
    const block = el.closest('[data-doc-block], [data-lumzel-block]');
    parent.postMessage(
      {
        type: 'doc:pick',
        ref: `${value(root, 'id')}#${value(el, 'node')}`,
        links: linksOf(el),
        kind: block ? value(block, 'kind') : '',
        label: labelOf(el),
        status: value(el, 'status'),
      },
      '*',
    );
  });

  // Trace chips: the host sends doc:trace; each Node that a ticket delivers gets a chip posting doc:open-trace.
  let chips = [];
  const drawTrace = trace => {
    for (const c of chips) c.remove();
    chips = [];
    if (!trace || !trace.nodes) return;
    for (const el of nodes()) {
      const node = trace.nodes[value(el, 'node')];
      if (!node || !node.t || !node.t.length) continue;
      const row = document.createElement('div');
      row.className = 'lumzel-trace';
      for (const path of node.t) {
        const ticket = (trace.tickets || {})[path];
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `工单 ${ticket ? ticket.n : '??'}`;
        button.title = ticket ? ticket.title : path;
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (parent) parent.postMessage({ type: 'doc:open-trace', kind: 'ticket', path }, '*');
        });
        row.append(button);
      }
      (el.querySelector('.meta') || el).append(row);
      chips.push(row);
    }
  };

  const show = id => {
    const el = nodes().find(x => value(x, 'node') === id);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('lumzel-flash');
    setTimeout(() => el.classList.remove('lumzel-flash'), 1600);
  };

  window.addEventListener('message', e => {
    const data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'doc:theme') root.dataset.theme = data.theme;
    if (data.type === 'doc:trace') drawTrace(data.trace);
    if (data.type === 'doc:show') show(data.id);
    if (data.type === 'doc:mark') {
      const ids = new Set(data.ids || []);
      for (const el of nodes()) el.toggleAttribute('data-changed', ids.has(value(el, 'node')));
    }
  });

  if (location.hash.length > 1) show(decodeURIComponent(location.hash.slice(1)));
  if (parent) parent.postMessage({ type: 'doc:ready' }, '*');
})();
