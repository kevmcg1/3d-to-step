"use strict";
/* Gear Maker — geometry helpers on top of three.js. */
(function(){
const U = GW.U;

GW.Geo = {
  shape(pts, holes){
    const s = new THREE.Shape();
    s.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y);
    s.closePath();
    (holes || []).forEach(h => s.holes.push(GW.Geo.path(h)));
    return s;
  },
  path(pts){
    const p = new THREE.Path();
    p.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    p.closePath();
    return p;
  },

  /* Extrude an outline (+ holes) along +z from z0 to z0+depth.
     steps  : slices through the depth (needed if you will twist it)
     chamfer: 45-degree edge break on both faces */
  extrude(pts, holes, depth, opt){
    opt = opt || {};
    const ch = Math.min(opt.chamfer || 0, depth / 2.2);
    const geo = new THREE.ExtrudeGeometry(GW.Geo.shape(pts, holes), {
      depth: Math.max(depth - 2 * ch, 0.001),
      steps: Math.max(1, opt.steps || 1),
      bevelEnabled: ch > 0.001,
      bevelThickness: ch, bevelSize: ch, bevelOffset: -ch, bevelSegments: 1,
      curveSegments: 12
    });
    // ExtrudeGeometry puts the bevel below z=0 when enabled
    geo.translate(0, 0, (opt.z0 || 0) + (ch > 0.001 ? ch : 0));
    return geo;
  },

  /* Loft a set of closed loops through z0..z1, transforming each slice.
     loops[0] is the outer boundary, the rest are holes: {pts:[{x,y}], xf?(x,y,z)->[x,y]}.
     Because every slice is a deformed copy of the same outline, the end caps are
     triangulated from the *deformed* outline, so twisted / tapered parts never fold over. */
  loft(loops, z0, z1, steps, chamfer){
    const ch = Math.min(chamfer || 0, (z1 - z0) / 2.2), hasCh = ch > 1e-3;
    const levels = [];
    const a = hasCh ? z0 + ch : z0, b = hasCh ? z1 - ch : z1, nIn = Math.max(1, steps | 0);
    if(hasCh) levels.push({ z: z0, off: ch });
    for(let i = 0; i <= nIn; i++) levels.push({ z: a + (b - a) * i / nIn, off: 0 });
    if(hasCh) levels.push({ z: z1, off: ch });

    // chamfer = the outline shrinks (outer boundary) or grows (a toothed hole) a little at each face.
    // A scaled copy of a simple outline is always simple, so this can never fold over.
    const info = loops.map(lp => {
      let R = 0; lp.pts.forEach(p => { R = Math.max(R, Math.hypot(p.x, p.y)); });
      return { lp, n: lp.pts.length, R: R || 1, materialLeft: (() => { let ar = 0; const p = lp.pts; for(let i = 0; i < p.length; i++){ const q = p[(i + 1) % p.length]; ar += p[i].x * q.y - q.x * p[i].y; } return ar > 0; })() };
    });
    info.forEach((inf, li) => { if(li > 0) inf.materialLeft = !inf.materialLeft; });
    const slices = levels.map(lv => info.map(inf => {
      const sc = lv.off && inf.lp.chamfer !== false ? (inf.lp.grow ? 1 + lv.off / inf.R : 1 - lv.off / inf.R) : 1;
      return inf.lp.pts.map(pt => {
        let x = pt.x * sc, y = pt.y * sc;
        if(inf.lp.xf){ const r = inf.lp.xf(x, y, lv.z); x = r[0]; y = r[1]; }
        return [x, y, lv.z];
      });
    }));
    const P = [];
    const tri = (A, B, C) => P.push(A, B, C);
    for(let k = 0; k < levels.length - 1; k++) info.forEach((inf, li) => {
      const s0 = slices[k][li], s1 = slices[k + 1][li], n = inf.n;
      for(let i = 0; i < n; i++){
        const j = (i + 1) % n;
        const A = s0[i], B = s0[j], C = s1[j], D = s1[i];
        if(inf.materialLeft){ tri(A, B, C); tri(A, C, D); } else { tri(A, C, B); tri(A, D, C); }
      }
    });
    const ring = s => ({ ring: s[0].map(v => ({ x: v[0], y: v[1] })), holes: s.slice(1).map(h => h.map(v => ({ x: v[0], y: v[1] }))) });
    const lo = ring(slices[0]), hi = ring(slices[slices.length - 1]);
    GW.Build.capTris(lo.ring, lo.holes, z0, false, tri);
    GW.Build.capTris(hi.ring, hi.holes, z1, true, tri);
    const arr = new Float32Array(P.length * 3);
    P.forEach((v, i) => { arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2]; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  },

  /* Plain ring/disc between two radii (rIn = 0 for a solid disc) */
  tube(rOut, rIn, z0, len, nSeg, holePts){
    const o = GW.Prof.circle(rOut, nSeg || 48);
    const holes = holePts ? [holePts] : (rIn > 0.001 ? [GW.Prof.circle(rIn, nSeg || 48)] : []);
    return GW.Geo.extrude(o, holes, len, { z0 });
  },

  box(w, h, d, cx, cy, cz){
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(cx || 0, cy || 0, cz || 0);
    return g;
  },

  // apply fn(vec3) -> mutate vec3 to every vertex
  map(geo, fn){
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for(let i = 0; i < pos.count; i++){
      v.fromBufferAttribute(pos, i);
      fn(v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    return geo;
  },

  toNonIndexed(geo){ return geo.index ? geo.toNonIndexed() : geo; },

  /* Merge geometries into one non-indexed position buffer */
  merge(list){
    list = list.filter(Boolean).map(g => GW.Geo.toNonIndexed(g));
    let n = 0;
    list.forEach(g => n += g.attributes.position.array.length);
    const out = new Float32Array(n);
    let o = 0;
    list.forEach(g => { out.set(g.attributes.position.array, o); o += g.attributes.position.array.length; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    return geo;
  },

  /* Smooth shading that keeps hard edges: a vertex normal averages only
     the faces within `angle` degrees of the face it belongs to. */
  creaseNormals(geo, angle){
    geo = GW.Geo.toNonIndexed(geo);
    const P = geo.attributes.position.array, nf = P.length / 9;
    const fn = new Float32Array(nf * 3), fa = new Float32Array(nf);
    for(let f = 0; f < nf; f++){
      const o = f * 9;
      const ax = P[o+3]-P[o], ay = P[o+4]-P[o+1], az = P[o+5]-P[o+2];
      const bx = P[o+6]-P[o], by = P[o+7]-P[o+1], bz = P[o+8]-P[o+2];
      let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
      const l = Math.hypot(nx, ny, nz);
      fa[f] = l / 2;
      if(l > 1e-12){ nx /= l; ny /= l; nz /= l; }
      fn[f*3] = nx; fn[f*3+1] = ny; fn[f*3+2] = nz;
    }
    const Q = 100, OFF = 60000, W = 120001;
    const key = (x, y, z) => ((Math.round(x * Q) + OFF) * W + (Math.round(y * Q) + OFF)) * W + (Math.round(z * Q) + OFF);
    const map = new Map();
    for(let f = 0; f < nf; f++) for(let v = 0; v < 3; v++){
      const o = f * 9 + v * 3, k = key(P[o], P[o+1], P[o+2]);
      let l = map.get(k); if(!l){ l = []; map.set(k, l); }
      l.push(f);
    }
    const cosT = Math.cos(U.rad(angle));
    const N = new Float32Array(P.length);
    for(let f = 0; f < nf; f++) for(let v = 0; v < 3; v++){
      const o = f * 9 + v * 3, l = map.get(key(P[o], P[o+1], P[o+2]));
      let sx = 0, sy = 0, sz = 0;
      for(let i = 0; i < l.length; i++){
        const g = l[i];
        const d = fn[f*3]*fn[g*3] + fn[f*3+1]*fn[g*3+1] + fn[f*3+2]*fn[g*3+2];
        if(d >= cosT){ sx += fn[g*3]*fa[g]; sy += fn[g*3+1]*fa[g]; sz += fn[g*3+2]*fa[g]; }
      }
      const ll = Math.hypot(sx, sy, sz) || 1;
      N[o] = sx/ll; N[o+1] = sy/ll; N[o+2] = sz/ll;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return geo;
  },

  /* Closed-mesh sanity numbers: signed volume, open edges, non-manifold edges */
  analyze(geo){
    geo = GW.Geo.toNonIndexed(geo);
    const P = geo.attributes.position.array, nf = P.length / 9;
    let vol = 0;
    const Q = 1000, OFF = 200000, W = 400001;
    const vid = new Map();
    const id = (x, y, z) => {
      const k = ((Math.round(x*Q)+OFF)*W + (Math.round(y*Q)+OFF))*W + (Math.round(z*Q)+OFF);
      let i = vid.get(k); if(i === undefined){ i = vid.size; vid.set(k, i); } return i;
    };
    const edges = new Map();
    let nan = 0, degenerate = 0;
    for(let f = 0; f < nf; f++){
      const o = f * 9;
      for(let i = 0; i < 9; i++) if(!isFinite(P[o+i])) nan++;
      const a = [P[o],P[o+1],P[o+2]], b = [P[o+3],P[o+4],P[o+5]], c = [P[o+6],P[o+7],P[o+8]];
      vol += (a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
      const ia = id(...a), ib = id(...b), ic = id(...c);
      if(ia === ib || ib === ic || ia === ic){ degenerate++; continue; }
      [[ia, ib], [ib, ic], [ic, ia]].forEach(([u, v]) => {
        const k = u < v ? u * 4294967296 + v : v * 4294967296 + u;
        const dir = u < v ? 1 : -1;
        const e = edges.get(k) || { n: 0, s: 0 };
        e.n++; e.s += dir; edges.set(k, e);
      });
    }
    let open = 0, nonManifold = 0, flipped = 0;
    edges.forEach(e => { if(e.n === 1) open++; else if(e.n > 2) nonManifold++; else if(e.s !== 0) flipped++; });
    return { tris: nf, volume: vol, open, nonManifold, flipped, nan, degenerate, verts: vid.size };
  }
};
})();
