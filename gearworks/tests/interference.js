// Mesh two gears, spin them through the kinematics and count vertices of one that end up inside the other.
const GW = require('./harness.js')(['util.js','profiles.js','geo.js','types.js','builders.js','calc.js','compat.js','mount.js','gears.js']);
const THREE = globalThis.THREE;
GW.Build.quality = 0;

function insideCount(meshA, pts){
  // odd-even ray test against meshA (world space), for each point
  meshA.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3(0.3719, 0.5513, 0.7481).normalize();
  let inside = 0; insideCount.maxDepth = 0;
  const mat = meshA.material; mat.side = THREE.DoubleSide;
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(a => new THREE.Vector3(...a));
  for(const p of pts){
    ray.set(p, dir); ray.far = 1000;
    const hits = ray.intersectObject(meshA, false);
    // merge duplicate hits on shared edges
    const ds = hits.map(h => h.distance).sort((a,b)=>a-b);
    let n = 0, last = -1;
    ds.forEach(d => { if(d - last > 1e-4) n++; last = d; });
    if(n % 2 === 1){
      inside++;
      let depth = Infinity;
      dirs.forEach(d => { ray.set(p, d); const h = ray.intersectObject(meshA, false)[0]; if(h) depth = Math.min(depth, h.distance); });
      insideCount.maxDepth = Math.max(insideCount.maxDepth, depth);
    }
  }
  return inside;
}
function worldVerts(mesh, stride){
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position, out = [];
  for(let i = 0; i < pos.count; i += stride){
    out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}
function run(name, setup, opts){
  opts = opts || {};
  GW.Gears.clear();
  const [P, C] = setup();
  GW.Layout.solveAll();
  const comp = GW.Compat.check(P, C, { kind: C.linkKind === 'same shaft' ? 'shaft' : 'mesh' });
  let worst = 0, depth = 0, samples = 0;
  const steps = opts.steps || 8;
  for(let s = 0; s < steps; s++){
    P.rt.q = s * (opts.sweep || 0.35) / steps * (P.type === 'rack' ? 5 : 1);
    GW.Layout.update(0);
    GW.Gears.order.forEach(g => { g.rt.q = g.parentId ? GW.Mount.follow(g.rt.link, GW.Gears.get(g.parentId).rt.q) : g.rt.q; GW.Layout.apply(g); });
    const cv = worldVerts(C.mesh, opts.stride || 7);
    const inP = insideCount(P.mesh, cv);
    const pv = worldVerts(P.mesh, opts.stride || 7);
    const inC = insideCount(C.mesh, pv);
    worst = Math.max(worst, inP + inC); depth = Math.max(depth, insideCount.maxDepth); samples += cv.length + pv.length;
  }
  console.log(name.padEnd(34), 'compat', comp.ok ? 'OK ' : 'BAD', comp.issues.filter(i=>i.level==='err').map(i=>i.id).join(','), ' penetrating verts: worst', worst, ' of ~', Math.round(samples/steps), ' max depth', (depth>=1e9?'?':depth.toFixed(2))+'mm', (worst===0?'  ✔':'  ✘'));
  return worst;
}
const add = (t, o) => GW.Gears.add(t, o);
const link = (c, p, k) => { GW.Gears.link(c.id, p.id, k); };
let fails = 0;
const t = (...a) => { if(run(...a) > (a[2] && a[2].tol || 0)) fails++; };

t('spur 20:30', () => { const a = add('spur', {z:20, px:0, py:0}); const b = add('spur', {z:30, px:100, py:100}); link(b, a); return [a, b]; });
t('spur 13:47 shifted', () => { const a = add('spur', {z:13, x:0.3, px:0, py:0}); const b = add('spur', {z:47, px:100, py:100}); link(b, a); return [a, b]; });
t('helical 24:24', () => { const a = add('helical', {z:24, helix:20}); const b = add('helical', {z:24, px:100, py:100, helix:-20}); link(b, a); return [a, b]; });
t('herringbone 22:30', () => { const a = add('herring', {z:22, helix:25, vgap:2}); const b = add('herring', {z:30, px:100, py:100, helix:-25, vgap:2}); link(b, a); return [a, b]; });
t('ring 60 + pinion 20', () => { const r = add('internal', {z:60}); const p = add('spur', {z:20, px:100, py:100}); link(p, r); return [r, p]; });
t('pinion 20 + ring 60 (ring child)', () => { const p = add('spur', {z:20}); const r = add('internal', {z:60, px:100, py:100}); link(r, p); return [p, r]; });
t('helical ring + helical pinion', () => { const r = add('internal', {z:48, helix:15}); const p = add('helical', {z:16, px:100, py:100, helix:15}); link(p, r); return [r, p]; });
t('pinion on rack', () => { const r = add('rack', {z:12}); const p = add('spur', {z:16, px:100, py:100}); link(p, r); return [r, p]; }, {sweep:0.5});
t('rack on pinion', () => { const p = add('spur', {z:16}); const r = add('rack', {z:12, px:100, py:100}); link(r, p); return [p, r]; }, {sweep:0.5});
t('bevel 20:30 @90', () => { const a = add('bevel', {z:20, cone:33.69}); const b = add('bevel', {z:30, cone:56.31, px:100, py:100}); link(b, a); return [a, b]; }, {tol: 400});
t('crown 40 + pinion 14', () => { const c = add('crown', {z:40}); const p = add('spur', {z:14, px:100, py:100}); link(p, c); return [c, p]; }, {tol: 400});
t('worm 1-start + wheel 24', () => { const w = add('worm', {m:2, starts:1, wormDia:16, thick:40}); const h = add('wormwheel', {z:24, helix:7.125, px:100, py:100}); link(h, w); return [w, h]; }, {tol: 400});
t('wheel + worm(child)', () => { const h = add('wormwheel', {z:24, helix:7.125}); const w = add('worm', {m:2, starts:1, wormDia:16, thick:40, px:100, py:100}); link(w, h); return [h, w]; }, {tol: 400});
t('cycloid 30:24', () => { const a = add('cycloid', {z:30}); const b = add('cycloid', {z:24, px:100, py:100}); link(b, a); return [a, b]; });
t('elliptical 24:24', () => { const a = add('elliptical', {z:24, thick:5}); const b = add('elliptical', {z:24, px:100, py:100, thick:5}); const pl = GW.Compat.plan(a, b, {kind:'mesh'}); GW.Gears.applyPlan(a, b, pl); link(b, a); return [a, b]; }, {sweep:1.2});
console.log(fails ? fails + ' scenario(s) with penetration' : 'all clean');
