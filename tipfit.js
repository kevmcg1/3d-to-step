/* Keeps every CSS tooltip (the [data-tip] ::after boxes) on screen. When a control is hovered or focused, the tip's box is measured from its
   computed style and, if it would run past a window edge, it is nudged back (--tip-dx / --tip-dy) or flipped to the other side (data-tip-flip). */
(function () {
  const M = 6;
  function fit(el) {
    el.style.removeProperty('--tip-dx'); el.style.removeProperty('--tip-dy'); el.removeAttribute('data-tip-flip');
    const cs = getComputedStyle(el, '::after'), w = parseFloat(cs.width), h = parseFloat(cs.height);
    if (!(w > 0) || !(h > 0)) return;
    const ecs = getComputedStyle(el), r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const box = () => { const l = r.left + (parseFloat(ecs.borderLeftWidth) || 0) + (parseFloat(cs.left) || 0) + m.e, t = r.top + (parseFloat(ecs.borderTopWidth) || 0) + (parseFloat(cs.top) || 0) + m.f; return { l, t }; };
    let { l, t } = box();
    if (t < M && r.bottom + 9 + h <= vh - M) { el.setAttribute('data-tip-flip', 'down'); ({ l, t } = box()); }
    else if (t + h > vh - M && r.top - 9 - h >= M) { el.setAttribute('data-tip-flip', 'up'); ({ l, t } = box()); }
    const dx = l < M ? M - l : l + w > vw - M ? vw - M - (l + w) : 0, dy = t < M ? M - t : t + h > vh - M ? vh - M - (t + h) : 0;
    if (dx) el.style.setProperty('--tip-dx', Math.round(dx) + 'px');
    if (dy) el.style.setProperty('--tip-dy', Math.round(dy) + 'px');
  }
  const on = e => { const el = e.target && e.target.closest && e.target.closest('[data-tip]'); if (el) fit(el); };
  document.addEventListener('mouseover', on, true);
  document.addEventListener('focusin', on, true);
  window.addEventListener('resize', () => { const el = document.querySelector('[data-tip]:hover'); if (el) fit(el); });
})();
