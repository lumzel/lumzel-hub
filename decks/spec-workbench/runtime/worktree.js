// Lumzel appends this script to every Worktree page the Deck frames (lumzel://deck/<id>/worktree/docs/...).
// The page on disk links no stylesheet and no script: this Deck decides how a Visual Doc and a prototype look.
(() => {
  const here = document.currentScript?.src;
  if (!here) return;
  const at = file => new URL(file, here).href;
  const root = document.documentElement;
  const style = file => document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: at(file) }));
  const script = file => document.body.append(Object.assign(document.createElement('script'), { src: at(file) }));

  // A prototype has screens; a Visual Doc names itself on <html>. Anything else under docs/ is left alone.
  if (document.querySelector('[data-doc-screen]')) return script('prototype.js');
  if (root.hasAttribute('data-doc-id') || document.querySelector('main.lumzel-doc')) {
    // Set the theme before the stylesheet lands, so a dark Deck never flashes a light page.
    root.dataset.theme = new URLSearchParams(location.search).get('theme') || root.dataset.theme || 'light';
    style('doc.css');
    script('doc.js');
  }
})();
