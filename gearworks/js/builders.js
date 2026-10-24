"use strict";
/* Gearworks — turns a gear's settings into 3D geometry.
   Every builder works in the gear's own frame: the shaft is the z axis.
   build(g) -> { geo, info } where info carries the numbers other modules need
   (pitch radius, outer radius, warnings, ...). */
(function(){
const U = GW.U, Prof = GW.Prof, Geo = GW.Geo;

const Q = {
  flank:  [5, 8, 12],
  bore:   [32, 64, 96],
  wormM:  [72, 120, 200],
  wormK:  [8, 12, 18],
  twistDeg: [6, 3, 1.5]
};

const B = GW.Build = {
  quality: 1,
  draft: false,                       // true while a slider is being dragged: coarse meshes, instant feedback
  q(arr){ return arr[B.draft ? 0 : B.quality]; },

  build(g){
    const fn = B['b_' + g.type];
    if(!fn) throw new Error('no builder for ' + g.type);
    B._notes = []; B._fit = null;
    const r = fn(g);
    r.info.notes = Array.from(new Set((r.info.notes || []).concat(B._notes)));
    const parts = Array.isArray(r.geo) ? r.geo : [r.geo];
    const merged = Geo.merge(parts);
    const geo = Geo.creaseNormals(merged, 38);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return { geo, info: r.info };
  },

  /* ------------------------------ helpers ------------------------------ */
  borePts(g){
    return g.bore > 0.2 ? Prof.bore(g.bore / 2, g.keyW, g.keyD, g.dFlat, B.q(Q.bore)) : null;
  },
  boreExtent(g){
    return g.bore > 0.2 ? g.bore / 2 + (g.keyW > 0 ? g.keyD : 0) : 0;
  },
  hubRadius(g){
    if(g.hubDia > 0) return Math.max(g.hubDia / 2, g.bore / 2 + 0.6);
    return g.bore / 2 + Math.max(3, g.bore * 0.45);
  },

  /* Clamp every feature to what the gear can physically hold, so any combination of slider
     positions still gives a valid solid. Returns an adjusted copy; each change is noted in
     `notes` so the feedback strip can tell the user. minR = smallest solid radius at the teeth. */
  fit(g, minR, T, notes, opt){
    opt = opt || {};
    const e = Object.assign({}, g), f = v => U.fmt(v, 1);
    const note = (what, v, why) => notes.push(`${what} limited to ${f(v)} mm — ${why}`);
    const boreMax = Math.max(0, 2 * (minR - (opt.wall == null ? 3 : opt.wall)));
    if(e.bore > 0.2 && e.bore > boreMax){ e.bore = boreMax < 1 ? 0 : boreMax; note('Bore', e.bore, 'the gear is too small for a bigger hole'); }
    if(e.bore <= 0.2){ e.bore = 0; e.keyW = 0; e.dFlat = 0; }
    if(e.keyW > e.bore * 0.6) e.keyW = e.bore * 0.6;
    // the notch's outer corners must stay inside the teeth roots, not just its middle
    const half = e.keyW / 2, reach = minR - 1.2;
    const keyMax = reach > half ? Math.max(Math.min(e.bore * 0.5, Math.sqrt(reach * reach - half * half) - e.bore / 2), 0) : 0;
    if(e.keyD > keyMax) e.keyD = keyMax;
    if(e.keyW < 0.3 || e.keyD < 0.2){ e.keyW = 0; }
    if(e.dFlat > e.bore * 0.3) e.dFlat = e.bore * 0.3;
    if(e.hubDia > 0 && e.hubDia < e.bore + 1.2) e.hubDia = e.bore + 1.2;
    const chMax = Math.max(Math.min(T / 2.2, 0.2 * minR), 0);
    if(e.chamfer > chMax){ if(e.chamfer > chMax + 0.05) note('Chamfer', chMax, 'the gear is too thin or small'); e.chamfer = chMax; }
    if(e.webT > T) e.webT = T;
    return e;
  },

  /* Circle-hole layout inside an annulus [rIn, rOut]. Returns {pts[][], reach} */
  lighten(g, rIn, rOut){
    const n = Math.round(g.holeN);
    if(n < 1) return { holes: [], reach: 0 };
    rIn += 1.2; rOut -= 1.2;
    if(rOut - rIn < 1.5) return { holes: [], reach: 0 };
    let hr = Math.min(g.holeD / 2, (rOut - rIn) / 2);
    let rc = g.holePCD > 0 ? g.holePCD / 2 : (rIn + rOut) / 2;
    rc = U.clamp(rc, rIn + hr, rOut - hr);
    if(n > 1) hr = Math.min(hr, rc * Math.sin(Math.PI / n) - 0.4);
    if(hr < 0.3) return { holes: [], reach: 0 };
    const holes = [];
    for(let i = 0; i < n; i++){
      const a = 2 * Math.PI * i / n;
      const c = Prof.circle(hr, 28).map(p => ({ x: p.x + rc * Math.cos(a), y: p.y + rc * Math.sin(a) }));
      holes.push(c);
    }
    return { holes, reach: rc + hr, rc, hr };
  },

  twistSteps(totalAngle){
    return U.clamp(Math.ceil(Math.abs(totalAngle) / U.rad(B.q(Q.twistDeg))), 1, 80);
  },

  /* ---------------------------------------------------------------------
     Generic toothed disc: outline + body style + bore + hub.
     o = { pts, minR, z0, z1, map(v,limit)?, steps?, info }
     --------------------------------------------------------------------- */
  wheel(g, o){
    const T = o.z1 - o.z0, parts = [];
    g = B.fit(g, o.minR, T, B._notes, { wall: o.wall }); B._fit = g;
    const borePts = B.borePts(g);
    const bExt = B.boreExtent(g);
    const hubR = B.hubRadius(g);
    const wantHub = g.hubUp > 0 || g.hubDown > 0;
    let style = o.styled === false ? 'solid' : g.bodyStyle;
    let ri = Math.max(o.minR - g.rimW, hubR + 2);
    if(ri > o.minR - 0.8) style = 'solid';
    // the toothed rim: a plain extrusion, or a loft when it twists / tapers
    // the chamfer shrinks the outline a little at each face, so it must not reach the holes inside
    let Rmax = 0; o.pts.forEach(p => { Rmax = Math.max(Rmax, Math.hypot(p.x, p.y)); });
    const rimOf = (holes, reach) => {
      const room = Math.max((o.minR - reach - 0.4) * Rmax / Math.max(o.minR, 1e-6), 0);
      return Geo.loft([{ pts: o.pts, xf: o.xf }].concat(holes.map(h => ({ pts: h, chamfer: false }))), o.z0, o.z1, o.steps || 1, Math.min(g.chamfer, room));
    };

    if(style === 'solid'){
      const inner = wantHub ? Math.max(hubR, bExt) : bExt;
      const L = B.lighten(g, inner, o.minR);
      const holes = (borePts ? [borePts] : []).concat(L.holes);
      parts.push(rimOf(holes, Math.max(bExt, L.reach)));
    } else {
      parts.push(rimOf([Prof.circle(ri, B.q(Q.bore))], ri));
      // web or spokes sit between the hub and the rim
      const wT = Math.min(g.webT, T);
      const zc = U.clamp((o.z0 + o.z1) / 2 - wT / 2 + g.webOff, o.z0, o.z1 - wT);
      const rW = ri + 0.8, rH = Math.max(hubR - 0.8, 0.2);
      if(style === 'webbed'){
        const L = B.lighten(g, hubR, ri);
        parts.push(Geo.extrude(Prof.circle(rW, B.q(Q.bore)), [Prof.circle(rH, 32)].concat(L.holes), wT, { z0: zc }));
      } else {
        const n = Math.max(2, Math.round(g.spokes)), len = rW - rH, rc = (rW + rH) / 2;
        for(let i = 0; i < n; i++){
          const sp = Geo.box(len, Math.min(g.spokeW, 2 * rH * 0.98 + 4), wT, 0, 0, 0);
          sp.translate(rc, 0, zc + wT / 2);
          sp.rotateZ(2 * Math.PI * i / n);
          parts.push(sp);
        }
      }
    }
    // hub: always present for webbed/spoked, optional for solid. In solid style the hub only
    // overlaps the rim by a little so the two shells never share edges.
    const hubProfile = Prof.circle(hubR, B.q(Q.bore));
    const mkHub = (za, zb) => Geo.extrude(hubProfile, borePts ? [borePts] : [], zb - za, { z0: za });
    if(style !== 'solid'){
      parts.push(mkHub(o.z0 - g.hubDown, o.z1 + g.hubUp));
    } else {
      const ov = Math.min(0.6, T * 0.3);
      if(g.hubUp > 0) parts.push(mkHub(o.z1 - ov, o.z1 + g.hubUp));
      if(g.hubDown > 0) parts.push(mkHub(o.z0 - g.hubDown, o.z0 + ov));
    }
    return parts;
  },

  minRadius(pts){
    let m = Infinity;
    for(let i = 0; i < pts.length; i++){ const r = Math.hypot(pts[i].x, pts[i].y); if(r < m) m = r; }
    return m;
  },

  /* ------------------------------ builders ------------------------------ */
  toothArgs(g){
    return { m: g.m, z: g.z, pa: g.pa, ha: g.ha, hf: g.hf, x: g.x, backlash: Math.min(g.backlash, 0.5 * Math.PI * g.m / 2), fillet: g.fillet, N: B.q(Q.flank) };
  },

  b_spur(g){
    const pr = Prof.involute(B.toothArgs(g));
    const T = g.thick;
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2 });
    return { geo: parts, info: B.wheelInfo(g, pr.info, -T / 2, T / 2) };
  },

  b_helical(g){
    const pr = Prof.involute(B.toothArgs(g));
    const T = g.thick, r = pr.info.r, k = Math.tan(U.rad(g.helix)) / r;
    const xf = (x, y, z) => { const a = k * z, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
    const steps = B.twistSteps(k * T);
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2, xf: Math.abs(k) > 1e-9 ? xf : null, steps });
    return { geo: parts, info: B.wheelInfo(g, pr.info, -T / 2, T / 2) };
  },

  b_herring(g){
    const pr = Prof.involute(B.toothArgs(g));
    const T = g.thick, r = pr.info.r, k = Math.tan(U.rad(g.helix)) / r;
    const gap = U.clamp(g.vgap, 0, T - 1);
    const xf = (x, y, z) => { const a = k * Math.max(Math.abs(z) - gap / 2, 0), c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
    let parts;
    if(gap < 0.01){
      let steps = B.twistSteps(k * T / 2) * 2;
      parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2, xf: Math.abs(k) > 1e-9 ? xf : null, steps });
    } else {
      // two helical halves and a root-diameter core in the groove, then one hub through all of it
      const half = (T - gap) / 2;
      const steps = B.twistSteps(k * half);
      const gp = Object.assign({}, g, { hubUp: 0, hubDown: 0 });
      const base = { minR: pr.info.rf, xf, steps, styled: false };
      const up = B.wheel(gp, Object.assign({ pts: pr.pts, z0: gap / 2, z1: T / 2 }, base));
      const dn = B.wheel(gp, Object.assign({ pts: pr.pts, z0: -T / 2, z1: -gap / 2 }, base));
      const core = B.wheel(gp, { pts: Prof.circle(pr.info.rf * 0.995, 96), minR: pr.info.rf * 0.99, z0: -gap / 2 - 0.2, z1: gap / 2 + 0.2, styled: false });
      parts = up.concat(dn, core);
      const gf = B._fit || g, bp = B.borePts(gf), hr = B.hubRadius(gf), prof = Prof.circle(hr, B.q(Q.bore));
      const hub = (za, zb) => Geo.extrude(prof, bp ? [bp] : [], zb - za, { z0: za });
      if(g.hubUp > 0) parts.push(hub(T / 2 - 0.6, T / 2 + g.hubUp));
      if(g.hubDown > 0) parts.push(hub(-T / 2 - g.hubDown, -T / 2 + 0.6));
    }
    return { geo: parts, info: B.wheelInfo(g, pr.info, -T / 2, T / 2) };
  },

  b_bevel(g){ return B.bevelBase(g, 0); },
  b_spiralbevel(g){ return B.bevelBase(g, g.spiral); },

  bevelBase(g, spiral){
    const pr = Prof.involute(B.toothArgs(g));
    const T = g.thick, r = pr.info.r, tanD = Math.tan(U.rad(g.cone));
    const kmin = Math.max(0.12, (B.boreExtent(g) + 1.2) / pr.info.rf);
    const kOf = s => Math.max(1 - s * tanD / r, kmin);
    const ks = Math.tan(U.rad(spiral)) / r;
    const xf = (px, py, s) => {
      const k = kOf(s);
      let x = px * k, y = py * k;
      if(ks !== 0){ const a = ks * s, c = Math.cos(a), sn = Math.sin(a); const nx = x * c - y * sn, ny = x * sn + y * c; x = nx; y = ny; }
      return [x, y];
    };
    const steps = Math.max(B.twistSteps(ks * T), 6);
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf * kOf(T), z0: 0, z1: T, xf, steps, styled: false });
    const info = B.wheelInfo(g, pr.info, 0, T);
    info.apexH = r / tanD;            // distance along the axis from the big end to the cone apex
    info.coneDist = r / Math.sin(U.rad(g.cone));
    info.bevel = true;
    return { geo: parts, info };
  },

  b_wormwheel(g){
    const pr = Prof.involute(B.toothArgs(g));
    const T = g.thick, r = pr.info.r, k = Math.tan(U.rad(g.helix)) / r;
    const Rt = g.throatR, ra = pr.info.ra, rf = pr.info.rf;
    const xf = (px, py, z) => {
      const a = k * z, c = Math.cos(a), s = Math.sin(a);
      let x = px * c - py * s, y = px * s + py * c;
      if(Rt > 0){
        const rr = Math.hypot(px, py);
        const cut = Rt - Math.sqrt(Math.max(Rt * Rt - z * z, 0));            // how far the throat has fallen away
        const lim = Math.max(ra - cut, rf + 0.15 * (ra - rf));
        if(rr > lim){ const sc = lim / rr; x *= sc; y *= sc; }
      }
      return [x, y];
    };
    const steps = Math.max(B.twistSteps(k * T), Rt > 0 ? 14 : 1);
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2, xf: (Math.abs(k) > 1e-9 || Rt > 0) ? xf : null, steps });
    return { geo: parts, info: B.wheelInfo(g, pr.info, -T / 2, T / 2) };
  },

  b_cycloid(g){
    const pr = Prof.cycloid(Object.assign(B.toothArgs(g), { rollR: g.rollR }));
    const T = g.thick;
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2 });
    return { geo: parts, info: B.wheelInfo(g, pr.info, -T / 2, T / 2) };
  },

  b_sprocket(g){
    const pr = Prof.sprocket({ z: g.z, chainPitch: g.chainPitch, rollerDia: g.rollerDia, tipRelief: g.tipRelief });
    const T = g.thick;
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2 });
    const info = B.wheelInfo(g, pr.info, -T / 2, T / 2);
    info.chainPitch = g.chainPitch;
    return { geo: parts, info };
  },

  b_pulley(g){
    const pr = Prof.pulley({ z: g.z, beltPitch: g.beltPitch, pitchLineDiff: g.pitchLineDiff, grooveDepth: g.grooveDepth, grooveWidth: g.grooveWidth });
    const T = g.thick, ra = pr.info.ra;
    const parts = B.wheel(g, { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2 });
    // flanges
    if(g.flange !== 'none'){
      const fr = (g.flangeD > 0 ? g.flangeD / 2 : ra + 1.5 + g.grooveDepth * 0.6);
      const ft = g.flangeT, bp = B.borePts(B._fit || g);
      const disc = (z0) => Geo.extrude(Prof.circle(fr, B.q(Q.bore) * 2), bp ? [bp] : [], ft, { z0 });
      if(g.flange === 'both' || g.flange === 'front') parts.push(disc(T / 2 - 0.01));
      if(g.flange === 'both' || g.flange === 'back') parts.push(disc(-T / 2 - ft + 0.01));
    }
    const info = B.wheelInfo(g, pr.info, -T / 2, T / 2);
    info.beltPitch = g.beltPitch;
    return { geo: parts, info };
  },

  b_elliptical(g){
    const pr = Prof.ellipse({ majorA: g.majorA, ecc: g.ecc, z: g.z, pa: g.pa, ha: g.ha, hf: g.hf, backlash: g.backlash, phase: g.phase });
    const T = g.thick;
    const parts = B.wheel(g, { pts: pr.pts, minR: B.minRadius(pr.pts), z0: -T / 2, z1: T / 2 });
    const info = B.wheelInfo(g, pr.info, -T / 2, T / 2);
    info.perim = pr.info.perim; info.pitch = pr.info.pitch; info.mEq = pr.info.mEq;
    return { geo: parts, info };
  },

  b_spline(g){
    const pr = Prof.involute(B.toothArgs(g));
    const T = g.thick;
    const parts = B.wheel(Object.assign({}, g, { hubUp: 0, hubDown: 0, holeN: 0, keyW: 0, dFlat: 0 }), { pts: pr.pts, minR: pr.info.rf, z0: -T / 2, z1: T / 2, styled: false });
    return { geo: parts, info: B.wheelInfo(g, pr.info, -T / 2, T / 2) };
  },

  /* Ring-shaped parts: the hole is the gap pattern of a "virtual" external gear */
  ringGeo(g, helixOn){
    const args = B.toothArgs(g);
    const virt = Object.assign({}, args, { ha: g.hf, hf: g.ha, x: g.x, backlash: -g.backlash });
    const pr = Prof.involute(virt);
    const T = g.thick, r = pr.info.r;
    const Ro = pr.info.ra + g.rimW;
    const chamfer = Math.min(g.chamfer, T / 2.2, g.rimW * 0.45, 0.04 * Ro);
    const k = helixOn ? Math.tan(U.rad(g.helix)) / r : 0;
    const xf = Math.abs(k) > 1e-9 ? (x, y, z) => { const a = k * z, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; } : null;
    const geo = Geo.loft([{ pts: Prof.circle(Ro, 96) }, { pts: pr.pts, xf, grow: true }], -T / 2, T / 2, xf ? B.twistSteps(k * T) : 1, chamfer);
    const info = {
      pitchR: r, tipR: r - g.m * (g.ha - g.x), rootR: pr.info.ra, baseR: pr.info.rb, outerR: Ro, z0: -T / 2, z1: T / 2,
      pointed: pr.info.pointed, ring: true
    };
    return { geo, info };
  },
  b_internal(g){ return B.ringGeo(g, true); },
  b_splinehub(g){ return B.ringGeo(g, false); },

  /* --------------------------------- rack --------------------------------- */
  b_rack(g){
    const m = g.m, p = Math.PI * m, n = Math.max(1, Math.round(g.z)), L = n * p;
    const add = g.ha * m, ded = g.hf * m, H = ded + g.barH;
    const a0 = U.rad(g.pa), tanA = Math.tan(a0);
    const halfP = Math.max((p / 2 - g.backlash / 2) / 2, 0.05 * m);       // half tooth thickness at the pitch line
    const tipHalf = Math.max(halfP - add * tanA, 0.04 * p), rootHalf = Math.min(halfP + ded * tanA, p * 0.48);
    const pts = [{ x: -L / 2, y: -H }, { x: L / 2, y: -H }, { x: L / 2, y: -ded }];
    // teeth, right to left (counter-clockwise outline)
    for(let i = n - 1; i >= 0; i--){
      const cx = -L / 2 + p * (i + 0.5);
      pts.push({ x: cx + rootHalf, y: -ded }, { x: cx + tipHalf, y: add }, { x: cx - tipHalf, y: add }, { x: cx - rootHalf, y: -ded });
    }
    pts.push({ x: -L / 2, y: -ded });
    // clean consecutive duplicates
    const poly = Prof.dedupe(pts);
    const holes = [];
    const hn = Math.round(g.holeN);
    if(hn > 0 && g.barH > 3){
      const hr = Math.min(g.holeD / 2, (g.barH - 1.5) / 2, L / hn / 2 - 0.5);
      if(hr > 0.3) for(let i = 0; i < hn; i++){
        const cx = -L / 2 + L * (i + 0.5) / hn, cy = -ded - g.barH / 2;
        holes.push(Prof.circle(hr, 24).map(q => ({ x: q.x + cx, y: q.y + cy })));
      }
    }
    const T = g.thick, tk = Math.tan(U.rad(g.helix));
    const steps = Math.abs(tk) > 1e-9 ? 6 : 1;
    const geo = Geo.extrude(poly, holes, T, { z0: -T / 2, steps, chamfer: Math.min(g.chamfer, tipHalf * 0.8, T / 2.2) });
    if(steps > 1) Geo.map(geo, v => { v.x += tk * v.z; });
    return { geo, info: { pitch: p, length: L, pitchR: Infinity, outerR: Math.hypot(L / 2, H), z0: -T / 2, z1: T / 2, rack: true, add, ded, height: H } };
  },

  /* --------------------------------- crown --------------------------------- */
  b_crown(g){
    const m = g.m, z = Math.max(6, Math.round(g.z)), step = 2 * Math.PI / z;
    const Rp = m * z / 2, a0 = U.rad(g.pa), tanA = Math.tan(a0);
    const W = Math.min(g.faceW, Rp * 1.2);
    const Rin = Math.max(Rp - W / 2, 1), Rout = Rp + W / 2;
    const zr = -g.hf * m, zt = g.ha * m, zb = zr - g.thick;
    const sT = Math.max(Math.PI * m / 2 - g.backlash / 2, 0.05 * m);
    const psi0 = sT / (2 * Rp);
    const psiT = Math.max(psi0 - tanA * g.ha * m / Rp, 0.03 * step);
    const psiR = Math.min(psi0 + tanA * g.hf * m / Rp, 0.48 * step);
    const A = [], Hh = [];
    for(let i = 0; i < z; i++){
      const c = i * step;
      A.push(c - psiR, c - psiT, c + psiT, c + psiR);
      Hh.push(zr, zt, zt, zr);
    }
    const n = A.length;
    const P = [];                                   // output triangles (flat array)
    const V = (r, a, zz) => [r * Math.cos(a), r * Math.sin(a), zz];
    const same = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
    const tri = (a, b, c) => { if(!same(a, b) && !same(b, c) && !same(a, c)) P.push(a, b, c); };
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    g = B.fit(g, Rin, g.thick, B._notes, { wall: 1.5 });
    const bore = B.borePts(g);
    const cap = (ring, holes, zz, up) => B.capTris(ring, holes, zz, up, tri);
    for(let k = 0; k < n; k++){
      const k1 = (k + 1) % n;
      const a = A[k], b = A[k1] + (k1 === 0 ? 2 * Math.PI : 0);
      // toothed top
      quad(V(Rin, a, Hh[k]), V(Rout, a, Hh[k]), V(Rout, b, Hh[k1]), V(Rin, b, Hh[k1]));
      // inner wall: faces the bore side, so wound the opposite way round
      quad(V(Rin, a, zr), V(Rin, a, Hh[k]), V(Rin, b, Hh[k1]), V(Rin, b, zr));
      // outer wall (outward)
      quad(V(Rout, a, zb), V(Rout, b, zb), V(Rout, b, Hh[k1]), V(Rout, a, Hh[k]));
    }
    const ringAt = (r, zz) => A.map(a => ({ x: r * Math.cos(a), y: r * Math.sin(a) }));
    cap(ringAt(Rin, zr), bore ? [bore] : [], zr, true);
    cap(ringAt(Rout, zb), bore ? [bore] : [], zb, false);
    if(bore){
      for(let i = 0; i < bore.length; i++){
        const p = bore[i], q = bore[(i + 1) % bore.length];
        quad([p.x, p.y, zb], [p.x, p.y, zr], [q.x, q.y, zr], [q.x, q.y, zb]);   // inward-facing
      }
    }
    const arr = new Float32Array(P.length * 3);
    P.forEach((v, i) => { arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2]; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return { geo, info: { pitchR: Rp, tipR: Rout, outerR: Rout, rootR: Rin, innerR: Rin, baseR: Rp, z0: zb, z1: zt, crown: true, pitchPlaneZ: 0, toothTop: zt } };
  },

  /* Triangulate a ring (+holes) and emit triangles facing +z (up) or -z */
  capTris(ring, holes, zz, up, tri){
    const toV = p => new THREE.Vector2(p.x, p.y);
    const contour = ring.map(toV), hs = holes.map(h => h.map(toV));
    const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
    const all = ring.concat(...holes);
    faces.forEach(f => {
      let [a, b, c] = f.map(i => all[i]);
      const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if((cr > 0) !== up){ const t = b; b = c; c = t; }
      tri([a.x, a.y, zz], [b.x, b.y, zz], [c.x, c.y, zz]);
    });
  },

  /* ---------------------------------- worm ---------------------------------- */
  b_worm(g){
    const m = g.m, N = Math.max(1, Math.round(g.starts)), a0 = U.rad(g.pa);
    const px = Math.PI * m, lead = N * px, s = g.hand === 'left' ? -1 : 1;
    const rp = Math.max(g.wormDia / 2, g.hf * m + 1.2);
    const ra = rp + g.ha * m;
    g = B.fit(g, rp - g.hf * m, g.thick, B._notes, { wall: 1.2 });
    const rf = Math.max(rp - g.hf * m, g.bore / 2 + (g.keyW > 0 ? g.keyD : 0) + 0.8, 0.3 * m);
    const L = g.thick;
    const half = Math.max(px / 4 - g.backlash / 4, 0.04 * px);
    const tipHalf = Math.max(half - g.ha * m * Math.tan(a0), 0.04 * px);
    const rootHalf = Math.min(half + g.hf * m * Math.tan(a0), px * 0.48);
    const K = Math.max(8, Math.ceil(L / px * B.q(Q.wormK)));
    const M = B.q(Q.wormM);
    const R = (zz, phi) => {
      let u = zz - s * lead * phi / (2 * Math.PI);
      u = U.mod(u + px / 2, px) - px / 2;
      const au = Math.abs(u);
      if(au <= tipHalf) return ra;
      if(au >= rootHalf) return rf;
      return ra - (au - tipHalf) / (rootHalf - tipHalf) * (ra - rf);
    };
    const P = [];
    const tri = (a, b, c) => P.push(a, b, c);
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    const grid = [];
    for(let i = 0; i <= K; i++){
      const zz = -L / 2 + L * i / K, row = [];
      for(let j = 0; j < M; j++){
        const phi = 2 * Math.PI * j / M, r = R(zz, phi);
        row.push([r * Math.cos(phi), r * Math.sin(phi), zz]);
      }
      grid.push(row);
    }
    for(let i = 0; i < K; i++) for(let j = 0; j < M; j++){
      const j1 = (j + 1) % M;
      quad(grid[i][j], grid[i][j1], grid[i + 1][j1], grid[i + 1][j]);
    }
    const bore = B.borePts(g);
    const ringOf = row => row.map(v => ({ x: v[0], y: v[1] }));
    B.capTris(ringOf(grid[K]), bore ? [bore] : [], L / 2, true, tri);
    B.capTris(ringOf(grid[0]), bore ? [bore] : [], -L / 2, false, tri);
    if(bore) for(let i = 0; i < bore.length; i++){
      const p = bore[i], q = bore[(i + 1) % bore.length];
      quad([p.x, p.y, -L / 2], [p.x, p.y, L / 2], [q.x, q.y, L / 2], [q.x, q.y, -L / 2]);
    }
    const arr = new Float32Array(P.length * 3);
    P.forEach((v, i) => { arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2]; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const lead_ang = Math.atan(lead / (2 * Math.PI * rp));
    return { geo, info: { pitchR: rp, tipR: ra, outerR: ra, rootR: rf, baseR: rp, z0: -L / 2, z1: L / 2, worm: true, lead, leadAngle: lead_ang, axialPitch: px, hand: s } };
  },

  wheelInfo(g, pi, z0, z1, notes){
    return {
      notes: notes || [],
      pitchR: pi.r, tipR: pi.ra, outerR: pi.ra, rootR: pi.rf, baseR: pi.rb, z0, z1,
      pointed: !!pi.pointed, undercut: !!pi.undercut
    };
  }
};
})();
