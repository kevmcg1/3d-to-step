// The left sidebar fills in one piece at a time: every heading, line of text, button, tab, slider and picture pops in on its own, like a bubble
// (it grows from small with a little overshoot, and the next one follows a moment later). It only animates the look of each piece for a moment
// (Web Animations, nothing is left behind), so every control works while it plays. Not played when the person has asked for less motion.
(function(){
  const PICK = 'h1,h2,h3,h4,p,.note,.logo-rule,.logo-foot,.logo-range,.chip-ver,button,a,label,input:not([type=hidden]),select,textarea,canvas,.count,.tag,.badge,.notice,.srow,.sgrp,.switch-inst a';
  function pieces(root){
    const all = [...root.querySelectorAll(PICK)];
    return all.filter(el => {
      if(el.closest('[data-nobub]')) return false;
      // a piece inside a button / link / label moves with it
      const up = el.parentElement && el.parentElement.closest('button,a,label,.srow');
      if(up && root.contains(up) && up !== el && !(el.matches('button') && up.matches('.srow'))) return false;
      if(el.matches('.srow')) return false;                     // the row itself holds buttons that pop in one by one
      const r = el.getBoundingClientRect(); if(!r.width || !r.height) return false;
      const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
  }
  function run(root, opt){
    opt = opt || {};
    if(!root || !root.animate) return 0;
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    const list = pieces(root);
    if(!list.length) return 0;
    const step = Math.min(opt.step || 34, 1500 / list.length), t0 = opt.delay || 0;
    list.forEach((el, i) => {
      // only the pieces actually in view are worth the show (a long list below the fold just appears)
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      const d = r.top > vh + 40 ? 0 : t0 + i * step;
      if(r.top > vh + 40) return;
      el.animate([
        { opacity: 0, transform: 'scale(.3) translateY(14px)' },
        { opacity: 1, transform: 'scale(1.08) translateY(-2px)', offset: .62 },
        { opacity: 1, transform: 'scale(1) translateY(0)' }
      ], { duration: 560, delay: d, easing: 'cubic-bezier(.3,1.35,.5,1)', fill: 'backwards' });
    });
    return list.length;
  }
  window.Bubbles = { run };
  function start(){
    const root = document.querySelector('aside, #left'); if(!root) return;
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => run(root)));
    // wait out a loading screen if the page has one
    const t0 = Date.now();
    const wait = () => {
      const l = document.getElementById('loading');
      if(l && getComputedStyle(l).display !== 'none' && getComputedStyle(l).visibility !== 'hidden' && parseFloat(getComputedStyle(l).opacity) > 0.05 && Date.now() - t0 < 20000) return setTimeout(wait, 120);
      go();
    };
    wait();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 60)); else setTimeout(start, 60);
})();
