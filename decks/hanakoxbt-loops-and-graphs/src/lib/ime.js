export function imeGuard(el, onEnter) {
  let composing = false;
  let justEnded = false;
  el.addEventListener('compositionstart', () => {
    composing = true;
  });
  el.addEventListener('compositionend', () => {
    composing = false;
    justEnded = true;
    setTimeout(() => {
      justEnded = false;
    }, 0);
  });
  el.addEventListener('keyup', () => {
    justEnded = false;
  });
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (composing || justEnded || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    onEnter(e);
  });
}
