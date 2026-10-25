"use strict";
/* Gear Maker — small tween engine: everything that moves (camera flights, gears popping in and out,
   selection glow, readout numbers) runs through here so it all shares one clock and one feel. */
(function(){
const ease = {
  linear: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  in: t => t * t * t
};
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Anim = GW.Anim = {
  ease, list: [],
  /* run fn(progress 0..1, eased) over `ms`; returns the tween (call .stop() to cancel) */
  tween(ms, fn, opts){
    opts = opts || {};
    const e = typeof opts.ease === 'function' ? opts.ease : (ease[opts.ease] || ease.out);
    const tw = { t0: performance.now() + (opts.delay || 0), ms: reduced() ? 1 : ms, fn, e, done: opts.done, key: opts.key, stopped: false, stop(){ this.stopped = true; } };
    if(opts.key) Anim.list.forEach(o => { if(o.key === opts.key) o.stopped = true; });   // a new tween on the same key replaces the old
    Anim.list.push(tw);
    return tw;
  },
  update(now){
    if(!Anim.list.length) return;
    const keep = [];
    Anim.list.forEach(tw => {
      if(tw.stopped) return;
      if(now < tw.t0){ keep.push(tw); return; }
      const p = Math.min((now - tw.t0) / tw.ms, 1);
      tw.fn(p, tw.e(p));
      if(p < 1) keep.push(tw); else if(tw.done) tw.done();
    });
    Anim.list = keep;
  },
  /* ease a number toward a target each frame (for glows): returns the new value */
  chase(cur, target, k){ const d = target - cur; return Math.abs(d) < 0.002 ? target : cur + d * k; }
};
})();
