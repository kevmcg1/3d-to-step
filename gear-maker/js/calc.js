"use strict";
/* Gear Maker — gear arithmetic shared by the compatibility checker,
   the mounting maths and the stats readout. */
(function(){
const U = GW.U;

const INVOLUTE = ['spur', 'helical', 'herring', 'bevel', 'spiralbevel', 'wormwheel', 'spline', 'internal', 'splinehub'];

const Calc = GW.Calc = {
  isRack: g => g.type === 'rack',

  /* helix angle as the geometry actually uses it (a spur gear has none) */
  helixOf(g){
    if(g.type === 'spur' || g.type === 'bevel' || g.type === 'crown' || g.type === 'cycloid') return 0;
    if(g.type === 'wormwheel' || g.type === 'helical' || g.type === 'herring' || g.type === 'internal' || g.type === 'rack') return g.helix;
    return 0;
  },

  /* pitch radius (mm) */
  pitchR(g){
    switch(g.type){
      case 'sprocket': return g.chainPitch / (2 * Math.sin(Math.PI / Math.max(g.z, 3)));
      case 'pulley':   return g.z * g.beltPitch / (2 * Math.PI);
      case 'elliptical': return g.majorA;
      case 'worm':     return g.wormDia / 2;
      case 'rack':     return Infinity;
      default:         return g.m * g.z / 2;
    }
  },

  /* tip / root / base radius, from the settings (the builders may trim the tip) */
  radii(g){
    if(g.info && g.info.tipR != null) return { r: g.info.pitchR, ra: g.info.tipR, rf: g.info.rootR, rb: g.info.baseR };
    const r = Calc.pitchR(g), a = U.rad(g.pa);
    return { r, ra: r + g.m * (g.ha + g.x), rf: r - g.m * (g.hf - g.x), rb: r * Math.cos(a) };
  },

  /* operating pressure angle and center distance for external / internal pairs */
  centerDistance(A, B, internal){
    const m = A.m, a0 = U.rad(A.pa);
    let zs, xt;
    if(internal){
      const ring = A.type === 'internal' || A.type === 'splinehub' ? A : B, pin = ring === A ? B : A;
      zs = ring.z - pin.z; xt = ring.x - pin.x;
    } else { zs = A.z + B.z; xt = A.x + B.x; }
    zs = Math.max(zs, 1);
    const invAw = 2 * Math.tan(a0) * xt / zs + U.inv(a0);
    const aw = U.invInv(Math.max(invAw, 0));
    return { a: m * zs / 2 * Math.cos(a0) / Math.cos(aw), aw, a0: m * zs / 2 };
  },

  /* the largest radius a gear reaches: tip circle, or the flange of a pulley */
  outerReach(g){
    if(g.type === 'pulley'){
      const base = Calc.pitchR(g) - g.pitchLineDiff;
      return g.flange !== 'none' ? (g.flangeD > 0 ? g.flangeD / 2 : base + 1.5 + g.grooveDepth * 0.6) : base;
    }
    return Calc.radii(g).ra;
  },

  /* a one-line table of numbers for the info panel */
  stats(g){
    const rows = [];
    const add = (k, v, u) => rows.push([k, v, u || '']);
    const R = Calc.radii(g), f = U.fmt;
    const t = g.type;
    if(t === 'rack'){
      add('Pitch', f(Math.PI * g.m, 3), 'mm');
      add('Length', f(Math.PI * g.m * g.z, 2), 'mm');
      add('Tooth height', f((g.ha + g.hf) * g.m, 2), 'mm');
    } else if(t === 'sprocket'){
      add('Pitch Ø', f(2 * R.r, 2), 'mm');
      add('Outside Ø', f(2 * R.ra, 2), 'mm');
      add('Chain pitch', f(g.chainPitch, 3), 'mm');
    } else if(t === 'pulley'){
      add('Pitch Ø', f(2 * R.r, 2), 'mm');
      add('Outside Ø', f(2 * R.ra, 2), 'mm');
    } else if(t === 'worm'){
      add('Pitch Ø', f(g.wormDia, 2), 'mm');
      add('Outside Ø', f(g.wormDia + 2 * g.ha * g.m, 2), 'mm');
      add('Lead', f(g.starts * Math.PI * g.m, 3), 'mm');
      add('Lead angle', f(U.deg(Math.atan(g.starts * g.m / g.wormDia)), 2), '°');
    } else if(t === 'elliptical'){
      const info = g.info || {};
      add('Semi-major / minor', f(g.majorA, 1) + ' / ' + f(g.majorA * Math.sqrt(1 - g.ecc * g.ecc), 1), 'mm');
      if(info.perim) add('Perimeter', f(info.perim, 2), 'mm');
      if(info.pitch) add('Tooth pitch', f(info.pitch, 3), 'mm');
    } else {
      add('Pitch Ø', f(2 * R.r, 2), 'mm');
      if(R.ra != null && isFinite(R.ra)) add(t === 'internal' || t === 'splinehub' ? 'Tip Ø (inner)' : 'Outside Ø', f(2 * R.ra, 2), 'mm');
      if(R.rf != null && isFinite(R.rf)) add('Root Ø', f(2 * R.rf, 2), 'mm');
      add('Base Ø', f(2 * R.rb, 2), 'mm');
      add('Circular pitch', f(Math.PI * g.m, 3), 'mm');
      add('Tooth height', f((g.ha + g.hf) * g.m, 2), 'mm');
      const h = Calc.helixOf(g);
      if(h) add('Normal module', f(g.m * Math.cos(U.rad(h)), 3), 'mm');
    }
    if(g.info && g.info.pointed) rows.push(['⚠ Tooth tips', 'pointed — reduce addendum or add profile shift', '']);
    return rows;
  },

  /* smallest tooth count that avoids undercut for a given addendum / shift */
  minTeeth(g){
    const s = Math.sin(U.rad(g.pa));
    return 2 * (g.ha - g.x) / (s * s);
  },
  minShift(g){
    const s = Math.sin(U.rad(g.pa));
    return g.ha - g.z * s * s / 2;
  },

  /* chain length in links for two sprockets d apart (pitch circles) */
  loopLength(r1, r2, d){
    return GW.Prof.loopPath(r1, r2, d).len;
  },

  involute: INVOLUTE
};
})();
