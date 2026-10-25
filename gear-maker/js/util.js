"use strict";
/* Gear Maker — shared helpers. Everything hangs off one global: GW. */
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

/* Units. Everything inside is millimeters; what the person reads is inches by default, with the metric value in
   parentheses (or the reverse when millimeters are chosen). */
GW.Units = (() => {
  const U = GW.U, MM = 25.4;
  let mode = 'in';
  try { mode = localStorage.getItem('gm.units') === 'mm' ? 'mm' : 'in'; } catch(e){}
  const sig = (v, d) => { const a = Math.abs(v); return U.fmt(v, d != null ? d : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4); };
  const Un = {
    get mode(){ return mode; }, get inch(){ return mode === 'in'; },
    set(m){ mode = m === 'mm' ? 'mm' : 'in'; try { localStorage.setItem('gm.units', mode); } catch(e){} },
    d: mm => mode === 'in' ? mm / MM : mm,                       // millimeters -> the number shown in the box
    fromD: v => mode === 'in' ? v * MM : v,                      // the number typed -> millimeters
    fmtD: mm => mode === 'in' ? sig(mm / MM) : U.fmt(mm, 3),    // text for the box
    unit: () => mode,                                           // 'in' or 'mm'
    other: mm => mode === 'in' ? U.fmt(mm, 3) + ' mm' : sig(mm / MM) + ' in',   // the value in parentheses
    pair: mm => mode === 'in' ? sig(mm / MM) + ' in (' + U.fmt(mm, 2) + ' mm)' : U.fmt(mm, 2) + ' mm (' + sig(mm / MM) + ' in)',
    /* rewrite every "12.5 mm" inside a sentence */
    text(str){
      if(typeof str !== 'string' || str.indexOf('mm') < 0) return str;
      return str.replace(/(?<![\w.])(-?\d+(?:\.\d+)?)(\s*)mm(?![\w\/²³])/g, (m, n) => Un.pair(+n))
                .replace(/(?<![\w.])(-?\d+(?:\.\d+)?)(\s*)mm\/s\b/g, (m, n) => mode === 'in' ? sig(+n / MM) + ' in/s (' + U.fmt(+n, 2) + ' mm/s)' : U.fmt(+n, 2) + ' mm/s (' + sig(+n / MM) + ' in/s)');
    }
  };
  return Un;
})();

/* Is this a slow machine? Few cores, little memory, a phone, a software renderer, or frames that were too slow last time. */
GW.Perf = (() => {
  let lite = false;
  try { lite = localStorage.getItem('gm.lite') === '1'; } catch(e){}
  try {
    const n = navigator;
    if((n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.deviceMemory && n.deviceMemory <= 4) || /Android|iPhone|iPad|Mobi/i.test(n.userAgent || '')) lite = true;
    const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if(ext && /swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')) lite = true;
    if(gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
  } catch(e){}
  return { lite };
})();
