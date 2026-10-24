"use strict";
/* Gearworks — shared helpers. Everything hangs off one global: GW. */
var GW = window.GW = window.GW || {};

GW.U = {
  rad: d => d * Math.PI / 180,
  deg: r => r * 180 / Math.PI,
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  fmt(v, d = 2){
    if(typeof v !== 'number' || !isFinite(v)) return String(v);
    const k = Math.pow(10, d);
    return (Math.round(v * k) / k).toString();
  },
  // wrap angle to (-PI, PI]
  wrapPi(a){ a = (a + Math.PI) % (2 * Math.PI); if(a < 0) a += 2 * Math.PI; return a - Math.PI; },
  mod(a, n){ return ((a % n) + n) % n; },
  el: id => document.getElementById(id),
  make(tag, cls, html){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html != null) e.innerHTML = html;
    return e;
  },
  esc: s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  // involute function inv(a) = tan(a) - a, and its inverse (Newton)
  inv: a => Math.tan(a) - a,
  invInv(v){
    let a = Math.pow(3 * v, 1 / 3);
    for(let i = 0; i < 40; i++){
      const f = Math.tan(a) - a - v, d = Math.tan(a) * Math.tan(a);
      if(Math.abs(d) < 1e-14) break;
      const n = a - f / d;
      if(Math.abs(n - a) < 1e-13){ a = n; break; }
      a = n;
    }
    return a;
  }
};
