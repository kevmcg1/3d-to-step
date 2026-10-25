"use strict";
/* Gear Maker — does the real 3D shape of one gear run into the other?
   The compatibility rules read the settings (module, pressure angle, tooth heights...). That cannot catch every
   odd combination, so after the rules say "fits" the actual meshes are tested too: random points inside the
   region where the two gears' boxes overlap are checked against both solids, at a few turn angles.
   Result: the share of the smaller gear's volume that is inside both gears at once. */
(function(){
const T = THREE;
const ray = new T.Raycaster(), dir = new T.Vector3(0.3719, 0.5513, 0.7481).normalize();
const rng = seed => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const inside = (mesh, p) => {
  ray.set(p, dir); ray.far = 1e4;
  const ds = ray.intersectObject(mesh, false).map(h => h.distance).sort((a, b) => a - b);
  let n = 0, last = -1; ds.forEach(d => { if(d - last > 1e-4){ n++; } last = d; });
  return n % 2 === 1;
};

const Collide = GW.Collide = {
  /* share of the smaller gear's volume that overlaps the other, worst of a few turn angles (0 = clean) */
  overlap(P, C, N){
    const G = GW.Gears, Layout = GW.Layout;
    const vol = g => Math.abs(GW.Geo.analyze(g.mesh.geometry).volume);
    const small = Math.min(P._vol || (P._vol = vol(P)), C._vol || (C._vol = vol(C)));
    if(!(small > 0)) return 0;
    const root = G.rootOf(P), q0 = root.rt.q, saved = G.list.map(x => x.rt.q);
    const sides = [P.mesh.material.side, C.mesh.material.side]; P.mesh.material.side = C.mesh.material.side = T.DoubleSide;
    let worst = 0;
    try {
      [0, 0.37, 1.31].forEach((da, k) => {
        root.rt.q = q0 + da; Layout.update(0); G.list.forEach(x => x.mesh.updateMatrixWorld(true));
        const bp = new T.Box3().setFromObject(P.mesh), bc = new T.Box3().setFromObject(C.mesh);
        const lo = bp.min.clone().max(bc.min), hi = bp.max.clone().min(bc.max);
        if(hi.x <= lo.x || hi.y <= lo.y || hi.z <= lo.z) return;
        const r = rng(11 + k * 5); let both = 0; const n = N || 200;
        for(let i = 0; i < n; i++){
          const pt = new T.Vector3(lo.x + (hi.x - lo.x) * r(), lo.y + (hi.y - lo.y) * r(), lo.z + (hi.z - lo.z) * r());
          if(inside(P.mesh, pt) && inside(C.mesh, pt)) both++;
        }
        worst = Math.max(worst, both / n * (hi.x - lo.x) * (hi.y - lo.y) * (hi.z - lo.z) / small);
      });
    } finally {
      G.list.forEach((x, i) => { x.rt.q = saved[i]; });
      P.mesh.material.side = sides[0]; C.mesh.material.side = sides[1];
      Layout.update(0); G.list.forEach(x => x.mesh.updateMatrixWorld(true));
    }
    return worst;
  },
  /* tolerance by kind: elliptical teeth are only an approximation */
  limit(kind){ return kind === 'ell' ? 0.04 : kind === 'crown' ? 0.02 : 0.02; },
  /* only for pairs whose teeth really interleave */
  applies(P, C, res){
    return res && res.supported && res.ok && C.linkKind === 'mesh' && ['ext', 'ring', 'rack', 'bevel', 'crown', 'worm', 'cyc', 'ell', 'spline'].includes(res.kind);
  }
};
})();
