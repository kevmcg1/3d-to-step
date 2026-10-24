// Gearworks self-test:  node tests/run.js      (needs `npm install` once, for three.js)
const GW = require('./harness.js')(['util.js','anim.js','profiles.js','geo.js','types.js','builders.js','calc.js','compat.js','mount.js','gears.js','brep.js','exporters.js','presets.js']);
const THREE = globalThis.THREE;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if(cond){ pass++; } else { fail++; console.log('  ✘ ' + msg); } };
const section = s => console.log('\n' + s);

section('1. every gear type builds a closed, outward-facing mesh');
GW.Build.quality = 1;
Object.keys(GW.Types.TYPES).forEach(t => {
  const g = GW.Types.defaults(t), a = GW.Geo.analyze(GW.Build.build(g).geo);
  ok(a.open === 0 && a.nonManifold === 0 && a.flipped === 0 && a.nan === 0 && a.degenerate === 0 && a.volume > 0, `${t}: ${JSON.stringify(a)}`);
});

section('2. variations: body styles, keyways, hubs, chamfers, twists');
const variants = [
  ['spur', { bodyStyle: 'webbed', holeN: 6, holeD: 5, hubUp: 5, hubDown: 3, keyW: 2, keyD: 1, dFlat: 0.5, bore: 8 }],
  ['spur', { bodyStyle: 'spoked', spokes: 7, spokeW: 4, chamfer: 0.6, z: 60 }],
  ['spur', { holeN: 5, holeD: 6, chamfer: 0.4, z: 12, x: 0.5 }],
  ['helical', { helix: -30, bodyStyle: 'webbed', chamfer: 0.5 }],
  ['herring', { vgap: 0, helix: 30 }], ['herring', { vgap: 3, hubUp: 4, bodyStyle: 'webbed' }],
  ['bevel', { cone: 20, z: 40, thick: 10 }], ['spiralbevel', { spiral: -40, cone: 70 }],
  ['wormwheel', { throatR: 10, helix: -8 }], ['worm', { hand: 'left', starts: 3, keyW: 2, keyD: 1 }],
  ['internal', { helix: 20, chamfer: 0.5, z: 80 }], ['rack', { helix: 15, holeN: 4, holeD: 3, chamfer: 0.3 }],
  ['pulley', { flange: 'front', beltPreset: 'HTD 5M', z: 30 }], ['sprocket', { z: 9 }], ['sprocket', { z: 60, chainPreset: '#80 / 16A (25.4)' }],
  ['cycloid', { z: 60 }], ['elliptical', { ecc: 0.5, z: 40 }], ['crown', { z: 80, bore: 12, keyW: 3, keyD: 1.5 }],
  ['spline', { bore: 6 }], ['splinehub', { z: 30 }], ['spur', { z: 6, x: 0.6 }], ['spur', { z: 200, m: 0.5 }]
];
variants.forEach(([t, o]) => {
  const g = Object.assign(GW.Types.defaults(t), o);
  if(o.chainPreset) Object.assign(g, GW.Types.CHAIN[o.chainPreset]);
  if(o.beltPreset) Object.assign(g, GW.Types.BELT[o.beltPreset]);
  let a; try { a = GW.Geo.analyze(GW.Build.build(g).geo); } catch(e){ ok(false, t + ' ' + JSON.stringify(o) + ' threw ' + e.message); return; }
  ok(a.open === 0 && a.nonManifold === 0 && a.flipped === 0 && a.nan === 0 && a.volume > 0, `${t} ${JSON.stringify(o)}: ${JSON.stringify(a)}`);
});

section('3. compatibility rules');
const D = (t, o) => Object.assign(GW.Types.defaults(t), o || {});
let r = GW.Compat.check(D('spur'), D('spur'));            ok(r.ok, 'identical spurs mesh');
r = GW.Compat.check(D('spur'), D('spur', { m: 3 }));      ok(!r.ok && r.issues.some(i => i.id === 'm' && i.optB.B.m === 2), 'module mismatch names the exact module needed');
r = GW.Compat.check(D('spur'), D('spur', { pa: 25 }));    ok(!r.ok && r.issues.some(i => i.id === 'pa'), 'pressure angle mismatch');
r = GW.Compat.check(D('spur'), D('bevel'));               ok(!r.supported && r.issues[0].id === 'type', 'spur + bevel is a type error');
r = GW.Compat.check(D('helical', { helix: 20 }), D('helical', { helix: 20 })); ok(!r.ok && r.issues.some(i => i.id === 'helix' && i.optB.B.helix === -20), 'helical needs opposite hand');
r = GW.Compat.check(D('internal', { z: 60 }), D('spur', { z: 58 })); ok(!r.ok && r.issues.some(i => i.id === 'z'), 'pinion too big for ring');
r = GW.Compat.check(D('spur', { z: 20 }), D('internal', { z: 25 })); ok(!r.ok, 'ring only 5 teeth bigger than pinion');
r = GW.Compat.check(D('bevel', { z: 20, cone: 45 }), D('bevel', { z: 30, cone: 45 })); ok(!r.ok && r.issues.some(i => i.id === 'cone'), 'bevel cones follow tooth ratio');
r = GW.Compat.check(D('sprocket'), D('sprocket', { chainPitch: 8 })); ok(!r.ok, 'sprocket pitch must match');
r = GW.Compat.check(D('worm', { starts: 1, wormDia: 16, m: 2 }), D('wormwheel', { helix: 3 })); ok(!r.ok && r.issues.some(i => i.id === 'helix'), 'worm wheel helix must equal lead angle');
r = GW.Compat.check(D('elliptical'), D('elliptical')); ok(!r.ok && r.issues.some(i => i.id === 'phase'), 'elliptical needs the right tooth phase');
r = GW.Compat.check(D('spline'), D('splinehub')); ok(r.ok, 'spline shaft fits spline hub');
['spur', 'helical', 'herring', 'bevel', 'spiralbevel', 'worm', 'sprocket', 'pulley', 'cycloid', 'elliptical', 'crown', 'internal', 'rack'].forEach(t => {
  // whatever the other end, the auto-fix must end in a compatible pair
  GW.Compat.partnersOf(t).forEach(p => {
    const A = D(t), B = D(p), plan = GW.Compat.plan(A, B, { kind: 'mesh' }, 'B');
    const A2 = Object.assign({}, A, plan.A), B2 = Object.assign({}, B.type === (plan.B.type || B.type) ? B : GW.Types.convert(B, plan.B.type), plan.B);
    const res = GW.Compat.check(A2, B2);
    ok(res.ok, `auto-fix ${t} + ${p} -> ${res.issues.filter(i => i.level === 'err').map(i => i.id)}`);
  });
});

section('4. presets: every pair compatible, and no solid overlaps its neighbour while turning');
GW.Build.quality = 0;
const inside = (mesh, p, ray, dir) => {
  ray.set(p, dir); const ds = ray.intersectObject(mesh, false).map(h => h.distance).sort((a, b) => a - b);
  let n = 0, last = -1; ds.forEach(d => { if(d - last > 1e-4) n++; last = d; }); return n % 2 === 1;
};
const rnd = (() => { let s = 7; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
const dir = new THREE.Vector3(0.3719, 0.5513, 0.7481).normalize(), ray = new THREE.Raycaster();
GW.Presets.filter(p => p.id !== 'showcase').forEach(p => {
  GW.Gears.clear({ instant: true }); p.build(0, 0); GW.Layout.solveAll();
  const bad = GW.Gears.list.filter(g => { if(!g.parentId) return false; return !GW.Compat.check(GW.Gears.get(g.parentId), g, { kind: g.linkKind === 'same shaft' ? 'shaft' : 'mesh' }).ok; });
  ok(bad.length === 0, `${p.id}: incompatible links ${bad.map(g => g.name)}`);
  // sampled overlap between each meshed (not shaft-mounted) pair at a few angles
  let worst = 0, minVol = Infinity;
  GW.Gears.list.filter(g => g.parentId && g.linkKind === 'mesh').forEach(c => {
    const P = GW.Gears.get(c.parentId);
    minVol = Math.min(minVol, Math.abs(GW.Geo.analyze(P.mesh.geometry).volume), Math.abs(GW.Geo.analyze(c.mesh.geometry).volume)); [P, c].forEach(g => { g.mesh.material.side = THREE.DoubleSide; });
    [0.3, 1.1, 2.0].forEach(q => {
      GW.Gears.order.forEach(g => { if(!g.parentId) g.rt.q = q; });
      GW.Layout.update(0);
      P.mesh.updateMatrixWorld(true); c.mesh.updateMatrixWorld(true);
      const bp = new THREE.Box3().setFromObject(P.mesh), bc = new THREE.Box3().setFromObject(c.mesh);
      const lo = bp.min.clone().max(bc.min), hi = bp.max.clone().min(bc.max);
      if(hi.x <= lo.x || hi.y <= lo.y || hi.z <= lo.z) return;
      let both = 0; const N = 500;
      for(let i = 0; i < N; i++){
        const pt = new THREE.Vector3(lo.x + (hi.x - lo.x) * rnd(), lo.y + (hi.y - lo.y) * rnd(), lo.z + (hi.z - lo.z) * rnd());
        if(inside(P.mesh, pt, ray, dir) && inside(c.mesh, pt, ray, dir)) both++;
      }
      worst = Math.max(worst, both / N * (hi.x - lo.x) * (hi.y - lo.y) * (hi.z - lo.z));
    });
  });
  ok(worst < 0.015 * minVol, `${p.id}: overlapping volume ${worst.toFixed(1)} mm³ while meshed (${(worst / minVol * 100).toFixed(2)}% of the smaller gear)`);
});

section('5. export formats');
GW.Build.quality = 1;
GW.Gears.clear({ instant: true }); GW.Presets.find(p => p.id === 'worm').build(0, 0); GW.Layout.solveAll(); GW.Layout.update(0);
const solids = GW.Export.collect('all', 'world', null, false);
const stl = GW.Export.stlBinary(solids, 'x'), n = new DataView(stl.buffer).getUint32(80, true);
ok(stl.length === 84 + n * 50 && n === GW.Export.stats(solids).tris, 'binary STL size matches triangle count');
ok(new TextDecoder().decode(GW.Export.stlAscii(solids, 'x')).startsWith('solid'), 'ASCII STL');
const obj = new TextDecoder().decode(GW.Export.obj(solids));
ok(/^o /m.test(obj) && /^f \d+ \d+ \d+/m.test(obj), 'OBJ has objects and faces');
const step = new TextDecoder().decode(GW.Export.step(solids, 'x'));
ok(step.startsWith('ISO-10303-21;') && /MANIFOLD_SOLID_BREP/.test(step) && /ADVANCED_FACE/.test(step) && step.trim().endsWith('END-ISO-10303-21;'), 'STEP structure');
const zip = GW.Zip.make([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
ok(zip[0] === 0x50 && zip[1] === 0x4b && GW.Zip.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'ZIP + CRC32');
const flat = GW.Export.collect('all', 'flat', null, false);
let minZ = Infinity; flat.forEach(s => { for(let i = 2; i < s.pos.length; i += 3) minZ = Math.min(minZ, s.pos[i]); });
ok(Math.abs(minZ) < 1e-6, 'flat layout rests on z = 0');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
