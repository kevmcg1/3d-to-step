"use strict";
/* Gearworks — 2D tooth outlines.
   Every function returns an array of {x,y} in counter-clockwise order
   (a closed loop; the last point is NOT repeated). */
(function(){
const U = GW.U;
const pol = (R, a) => ({ x: R * Math.cos(a), y: R * Math.sin(a) });

GW.Prof = {

  /* ------------------------------------------------------------
     Involute (spur / helical / bevel / spline / ring-hole) outline
     o: m z pa ha hf x backlash fillet N  (+ flat tip option)
     ------------------------------------------------------------ */
  involute(o){
    const m = o.m, z = Math.max(3, Math.round(o.z)), a0 = U.rad(o.pa);
    const ha = o.ha, hf = o.hf, x = o.x || 0, bl = o.backlash || 0;
    const f = U.clamp(o.fillet == null ? 0.3 : o.fillet, 0, 1);
    const N = o.N || 8;
    const r = m * z / 2, rb = r * Math.cos(a0);
    let ra = r + m * (ha + x);
    let rf = Math.max(r - m * (hf - x), m * 0.3);
    const step = 2 * Math.PI / z;

    // tooth thickness at the pitch circle -> half-angle there
    const sP = Math.max(Math.PI * m / 2 + 2 * x * m * Math.tan(a0) - bl / 2, 0.3 * Math.PI * m / 2);
    const half = sP / (2 * r);
    const invA = U.inv(a0);
    const fa = R => {
      const rr = Math.max(R, rb + 1e-9);
      return half + invA - U.inv(Math.acos(U.clamp(rb / rr, -1, 1)));
    };
    // keep the tooth from coming to a sharp point
    const minTip = 0.025 * step;
    let pointed = false;
    if(fa(ra) < minTip){
      pointed = true;
      // search from the base circle upward for where the tooth is still minTip wide
      let lo = rb + 1e-6, hi = ra;
      if(fa(lo) < minTip) hi = lo;
      else for(let i = 0; i < 40; i++){ const mid = (lo + hi) / 2; if(fa(mid) > minTip) lo = mid; else hi = mid; }
      ra = lo;
    }
    if(ra <= rf + 0.05 * m) ra = rf + 0.05 * m;

    const undercut = rf < rb - 1e-9;
    return GW.Prof._involuteOutline(o, { r, rb, ra, rf, pointed, undercut, z, step });
  },

  /* Builds the ordered outline tooth by tooth:
     gap floor -> root fillet -> rising flank -> tip -> falling flank -> fillet */
  _involuteOutline(o, info){
    const m = o.m, a0 = U.rad(o.pa), z = info.z, step = info.step;
    const ha = o.ha, hf = o.hf, x = o.x || 0, bl = o.backlash || 0;
    const f = U.clamp(o.fillet == null ? 0.3 : o.fillet, 0, 1);
    const N = o.N || 8;
    const { r, rb, ra, rf } = info;
    const sP = Math.max(Math.PI * m / 2 + 2 * x * m * Math.tan(a0) - bl / 2, 0.3 * Math.PI * m / 2);
    const half = sP / (2 * r), invA = U.inv(a0);
    const fa = R => half + invA - U.inv(Math.acos(U.clamp(rb / Math.max(R, rb + 1e-9), -1, 1)));
    let Rs = Math.max(rf, rb);
    // with few teeth and a steep pressure angle neighbouring teeth would overlap at the base circle:
    // start the flank higher up, where each tooth is at most 92% of a pitch wide
    const maxHalf = 0.46 * step;
    if(fa(Rs) > maxHalf){
      let lo = Rs, hi = ra;
      if(fa(hi) > maxHalf) lo = hi = ra * 0.999;
      else for(let i = 0; i < 40; i++){ const mid = (lo + hi) / 2; if(fa(mid) > maxHalf) lo = mid; else hi = mid; }
      Rs = hi;
    }
    const gapHalf = step / 2 - fa(Rs);
    const out = [];
    const bez = (P0, K, P2, n, arr) => {
      for(let k = 1; k <= n; k++){
        const t = k / (n + 1), u = 1 - t;
        arr.push({ x: u * u * P0.x + 2 * u * t * K.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * K.y + t * t * P2.y });
      }
    };
    const R1 = f > 0.001 ? Rs + f * 0.25 * (ra - Rs) : Rs;
    for(let i = 0; i < z; i++){
      const c = i * step, gc = c - step / 2;
      const floorEnd = gc + gapHalf * (1 - f);
      // gap floor (from gap centre up to where the fillet starts)
      const nFloor = Math.max(1, Math.round(gapHalf * (1 - f) / 0.2));
      for(let k = 0; k < nFloor; k++) out.push(pol(rf, gc + (floorEnd - gc) * k / nFloor));
      out.push(pol(rf, floorEnd));
      if(f > 0.001){
        bez(pol(rf, floorEnd), pol(rf, c - fa(Rs)), pol(R1, c - fa(R1)), 4, out);
        out.push(pol(R1, c - fa(R1)));
      } else {
        if(Rs > rf + 1e-9) out.push(pol(rf, c - fa(Rs)));
        out.push(pol(Rs, c - fa(Rs)));
      }
      for(let k = 1; k <= N; k++){ const R = R1 + (ra - R1) * k / N; out.push(pol(R, c - fa(R))); }
      for(let k = N; k >= 0; k--){ const R = R1 + (ra - R1) * k / N; out.push(pol(R, c + fa(R))); }
      if(f > 0.001){
        const gcR = c + step / 2, floorEndR = gcR - gapHalf * (1 - f);
        const tmp = [];
        bez(pol(R1, c + fa(R1)), pol(rf, c + fa(Rs)), pol(rf, floorEndR), 4, tmp);
        tmp.forEach(p => out.push(p));
        out.push(pol(rf, floorEndR));
      } else if(Rs > rf + 1e-9){
        out.push(pol(rf, c + fa(Rs)));
      }
    }
    // de-duplicate coincident neighbours (flat floors share endpoints)
    const res = [];
    for(let i = 0; i < out.length; i++){
      const p = out[i], q = res[res.length - 1];
      if(!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) res.push(p);
    }
    while(res.length > 2 && Math.hypot(res[0].x - res[res.length - 1].x, res[0].y - res[res.length - 1].y) < 1e-6) res.pop();
    return { pts: res, info };
  },

  /* ------------------------------------------------------------
     Cycloidal (clock) gear. Epicycloid addendum, hypocycloid root.
     ------------------------------------------------------------ */
  cycloid(o){
    const m = o.m, z = Math.max(6, Math.round(o.z));
    const R = m * z / 2, step = 2 * Math.PI / z;
    let rr = Math.min(o.rollR, R / 2 * 0.999);
    let ra = Math.min(R + o.ha * m, R + 2 * rr * 0.98);
    let rf = Math.max(R - o.hf * m, R - 2 * rr * 0.98, m * 0.3);
    const bl = o.backlash || 0;
    const sP = Math.max(Math.PI * m / 2 - bl / 2, 0.3 * Math.PI * m / 2);
    const delta = sP / (2 * R);
    const N = o.N || 8;
    const epi = t => {
      const k = (R + rr) / rr;
      return { x: (R + rr) * Math.cos(t) - rr * Math.cos(k * t), y: (R + rr) * Math.sin(t) - rr * Math.sin(k * t) };
    };
    const hypo = t => {
      const k = (R - rr) / rr;
      return { x: (R - rr) * Math.cos(t) + rr * Math.cos(k * t), y: (R - rr) * Math.sin(t) - rr * Math.sin(k * t) };
    };
    const rad = p => Math.hypot(p.x, p.y), ang = p => Math.atan2(p.y, p.x);
    // find parameter reaching a radius (monotonic near the pitch point)
    const solve = (fn, sgn, target, limit) => {
      let lo = 0, hi = limit;
      const inc = rad(fn(sgn * limit)) > rad(fn(0));
      if((inc && rad(fn(sgn * hi)) < target) || (!inc && rad(fn(sgn * hi)) > target)) return hi;
      for(let i = 0; i < 50; i++){
        const mid = (lo + hi) / 2, rm = rad(fn(sgn * mid));
        if((rm < target) === inc) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const tE = solve(epi, -1, ra, Math.PI * rr / R * 0.98 * 1);
    const tH = solve(hypo, +1, rf, Math.PI * rr / R * 0.98 * 1);
    // right flank samples, root -> tip  (angles measured from the tooth centre)
    const flank = [];
    for(let k = N; k >= 1; k--){ const p = hypo(tH * k / N); flank.push({ r: rad(p), a: delta + ang(p) }); }
    flank.push({ r: R, a: delta });
    for(let k = 1; k <= N; k++){ const p = epi(-tE * k / N); flank.push({ r: rad(p), a: delta + ang(p) }); }
    // a flank may never cross the tooth's centre line, or the tooth folds over itself
    const minA = 0.03 * step;
    flank.forEach(p => { if(p.a < minA) p.a = minA; });
    // and the root end must leave room for the gap
    flank.forEach(p => { if(p.a > step * 0.49) p.a = step * 0.49; });
    const pts = [];
    for(let i = 0; i < z; i++){
      const c = i * step;
      // gap floor: from the previous tooth's right root to this tooth's left root
      const a1 = c - step + flank[0].a, a2 = c - flank[0].a;
      const nF = Math.max(1, Math.round((a2 - a1) / 0.2));
      for(let k = 0; k < nF; k++) pts.push(pol(rf, a1 + (a2 - a1) * k / nF));
      for(let k = 0; k < flank.length; k++) pts.push(pol(flank[k].r, c - flank[k].a));
      for(let k = flank.length - 1; k >= 0; k--) pts.push(pol(flank[k].r, c + flank[k].a));
    }
    return { pts: dedupe(pts), info: { r: R, ra, rf, rb: R, z, step, rr } };
  },

  /* ------------------------------------------------------------
     Roller-chain sprocket
     ------------------------------------------------------------ */
  sprocket(o){
    const z = Math.max(6, Math.round(o.z)), p = o.chainPitch, dr = Math.min(o.rollerDia, 0.62 * o.chainPitch);
    const R = p / (2 * Math.sin(Math.PI / z));
    const rs = 0.505 * dr + 0.05;          // roller seat radius
    const step = 2 * Math.PI / z;
    const OD = p * (0.6 + 1 / Math.tan(Math.PI / z));
    const Ro = Math.max(OD / 2 - (o.tipRelief || 0), R + 0.1 * p);
    const sa = U.rad(62);                  // how far each seat wraps round the roller
    const pts = [];
    const nA = 9;
    const tipHalf = step * 0.09;
    for(let i = 0; i < z; i++){
      const th = i * step;
      const C = pol(R, th);
      // seat arc, facing the sprocket centre (direction th+PI); sweeping the angle
      // downwards walks the outline counter-clockwise around the sprocket
      for(let k = 0; k <= nA; k++){
        const a = th + Math.PI + sa - 2 * sa * k / nA;
        pts.push({ x: C.x + rs * Math.cos(a), y: C.y + rs * Math.sin(a) });
      }
      // tooth tip between this seat and the next
      const mid = th + step / 2;
      pts.push(pol(Ro * 0.985, mid - tipHalf * 1.4));
      pts.push(pol(Ro, mid - tipHalf * 0.5));
      pts.push(pol(Ro, mid + tipHalf * 0.5));
      pts.push(pol(Ro * 0.985, mid + tipHalf * 1.4));
    }
    return { pts, info: { r: R, ra: Ro, rf: R - rs, rb: R, z, step, seat: rs } };
  },

  /* ------------------------------------------------------------
     Timing-belt pulley (rounded grooves on the outside diameter)
     ------------------------------------------------------------ */
  pulley(o){
    const z = Math.max(6, Math.round(o.z)), p = o.beltPitch;
    const PD = z * p / Math.PI, Ro = PD / 2 - o.pitchLineDiff;
    const step = 2 * Math.PI / z;
    const depth = Math.min(o.grooveDepth, Ro * 0.6);
    const hw = Math.min(o.grooveWidth / 2, Ro * step * 0.46);   // half groove width (mm)
    const hwA = hw / Ro;
    const pts = [];
    const n = 10;
    for(let i = 0; i < z; i++){
      const c = i * step;
      for(let k = 0; k <= n; k++){
        const u = -1 + 2 * k / n;
        const rr = Ro - depth * Math.sqrt(Math.max(0, 1 - u * u));
        pts.push(pol(rr, c + u * hwA));
      }
      const nLand = Math.max(0, Math.round((step - 2 * hwA) / 0.25));
      for(let k = 1; k <= nLand; k++) pts.push(pol(Ro, c + hwA + (step - 2 * hwA) * k / (nLand + 1)));
    }
    return { pts: dedupe(pts), info: { r: PD / 2, ra: Ro, rf: Ro - depth, rb: PD / 2, z, step } };
  },

  /* ------------------------------------------------------------
     Elliptical gear, pivoting about one focus.
     a: semi-major axis, e: eccentricity, z teeth equally spaced along
     the pitch curve, phase: shift in pitches.
     ------------------------------------------------------------ */
  ellipse(o){
    const a = o.majorA, e = U.clamp(o.ecc, 0, 0.8), z = Math.max(6, Math.round(o.z));
    const rOf = ph => a * (1 - e * e) / (1 - e * Math.cos(ph));
    // arclength table
    const M = 2400, tab = new Float64Array(M + 1);
    let prev = pol(rOf(0), 0);
    for(let i = 1; i <= M; i++){
      const ph = 2 * Math.PI * i / M, q = pol(rOf(ph), ph);
      tab[i] = tab[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
    const L = tab[M], p = L / z;
    const phiAt = s => {                     // arclength -> polar angle
      s = U.mod(s, L);
      let lo = 0, hi = M;
      while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(tab[mid] <= s) lo = mid; else hi = mid; }
      const t = (s - tab[lo]) / Math.max(tab[hi] - tab[lo], 1e-12);
      return 2 * Math.PI * (lo + t) / M;
    };
    const mEq = p / Math.PI;
    const ha = (o.ha || 1) * mEq, hf = (o.hf || 1.25) * mEq, a0 = U.rad(o.pa);
    const sT = Math.max(p / 2 - (o.backlash || 0) / 2, 0.05 * p);
    const topHalf = Math.max(sT / 2 - ha * Math.tan(a0), 0.03 * p);
    const rootHalf = Math.min(sT / 2 + hf * Math.tan(a0), p * 0.48);
    const pts = [];
    const normalAt = ph => {                 // outward normal of the pitch curve
      const d = 1e-4, p1 = pol(rOf(ph - d), ph - d), p2 = pol(rOf(ph + d), ph + d);
      const tx = p2.x - p1.x, ty = p2.y - p1.y, l = Math.hypot(tx, ty);
      return { x: ty / l, y: -tx / l };
    };
    const at = (s, h) => {
      const ph = phiAt(s), c = pol(rOf(ph), ph), n = normalAt(ph);
      return { x: c.x + n.x * h, y: c.y + n.y * h };
    };
    const prof = [   // [offset along the curve (in pitches), height] across one tooth, left to right
      [-0.5, -hf], [-rootHalf / p, -hf], [-topHalf / p, ha], [topHalf / p, ha], [rootHalf / p, -hf], [0.5, -hf]
    ];
    for(let i = 0; i < z; i++){
      const s0 = (i + (o.phase || 0)) * p;
      for(let k = 0; k < prof.length - 1; k++){
        const [u0, h0] = prof[k], [u1, h1] = prof[k + 1];
        const sub = (k === 0 || k === prof.length - 2) ? 2 : (k === 2 ? 3 : 4);
        for(let j = 0; j < sub; j++){
          const t = j / sub;
          pts.push(at(s0 + (u0 + (u1 - u0) * t) * p, h0 + (h1 - h0) * t));
        }
      }
    }
    return { pts: dedupe(pts), info: { r: a, ra: a * (1 + e) + ha, rf: a * (1 - e) - hf, rb: a, z, step: p, perim: L, pitch: p, mEq } };
  },

  /* Circle / D-shaft / keyway bore polygon (CCW). The flat sits at +x,
     the keyway notch at -x. */
  bore(rb, keyW, keyD, dFlat, nSeg){
    const n = nSeg || 64;
    const aKey = keyW > 0 && keyD > 0 ? Math.asin(U.clamp(keyW / 2 / rb, 0, 0.99)) : 0;
    const aFlat = dFlat > 0 ? Math.acos(U.clamp((rb - dFlat) / rb, -1, 1)) : 0;
    const start = aFlat, end = 2 * Math.PI - aFlat;
    const pts = [];
    const notch = () => {
      const xs = -Math.sqrt(rb * rb - (keyW / 2) ** 2);
      pts.push({ x: xs, y: keyW / 2 }, { x: -rb - keyD, y: keyW / 2 }, { x: -rb - keyD, y: -keyW / 2 }, { x: xs, y: -keyW / 2 });
    };
    let done = aKey === 0;
    if(aFlat > 0){
      pts.push({ x: rb - dFlat, y: -rb * Math.sin(aFlat) });
      pts.push({ x: rb - dFlat, y: rb * Math.sin(aFlat) });
    }
    for(let i = 0; i <= n; i++){
      const a = start + (end - start) * i / n;
      if(aKey > 0 && Math.abs(a - Math.PI) < aKey){
        if(!done && a >= Math.PI){ notch(); done = true; }
        continue;
      }
      if(!done && a > Math.PI){ notch(); done = true; }
      pts.push(pol(rb, a));
    }
    if(!done) notch();
    return dedupe(pts);
  },

  circle(R, n){
    const pts = [];
    for(let i = 0; i < n; i++) pts.push(pol(R, 2 * Math.PI * i / n));
    return pts;
  },

  /* Pitch-line distance between two circles of radius r1,r2 whose centres
     are d apart: the closed path used by chain and belt drives.
     Returns {len, at(s) -> {x,y,tx,ty}} in a frame where A is at the
     origin and B is at (d,0). */
  loopPath(r1, r2, d){
    const beta = Math.asin(U.clamp((r1 - r2) / d, -0.999, 0.999));
    const lineLen = Math.sqrt(Math.max(d * d - (r1 - r2) ** 2, 0));
    const arcA = r1 * (Math.PI + 2 * beta), arcB = r2 * (Math.PI - 2 * beta);
    const len = arcA + arcB + 2 * lineLen;
    const aStart = Math.PI / 2 - beta;       // upper tangent point on A (angle of normal)
    const at = s => {
      s = U.mod(s, len);
      if(s < arcA){                                  // around A, counter-clockwise
        const a = aStart + s / r1;
        return { x: r1 * Math.cos(a), y: r1 * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) };
      }
      s -= arcA;
      if(s < lineLen){                               // lower straight run A -> B
        const a = -(Math.PI / 2 - beta);             // normal angle on lower tangent
        const tx = -Math.sin(a), ty = Math.cos(a);
        const px = r1 * Math.cos(a), py = r1 * Math.sin(a);
        return { x: px + tx * s, y: py + ty * s, tx, ty, nx: Math.cos(a), ny: Math.sin(a) };
      }
      s -= lineLen;
      if(s < arcB){                                  // around B
        const a = -(Math.PI / 2 - beta) + s / r2;
        return { x: d + r2 * Math.cos(a), y: r2 * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) };
      }
      s -= arcB;                                     // upper straight run B -> A
      const a = Math.PI / 2 - beta;
      const tx = -Math.sin(a), ty = Math.cos(a);
      const px = d + r2 * Math.cos(a), py = r2 * Math.sin(a);
      return { x: px + tx * s, y: py + ty * s, tx, ty, nx: Math.cos(a), ny: Math.sin(a) };
    };
    return { len, at, arcA, arcB, lineLen, beta };
  }
};

function dedupe(pts){
  const res = [];
  for(let i = 0; i < pts.length; i++){
    const p = pts[i], q = res[res.length - 1];
    if(!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) res.push(p);
  }
  while(res.length > 2 && Math.hypot(res[0].x - res[res.length - 1].x, res[0].y - res[res.length - 1].y) < 1e-6) res.pop();
  return res;
}
GW.Prof.dedupe = dedupe;
})();
