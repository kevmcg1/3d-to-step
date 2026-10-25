// The planetary wizard's maths, and a real build of what it recommends.
const GW = require('./harness.js')(['util.js','anim.js','profiles.js','geo.js','types.js','tol.js','builders.js','calc.js','compat.js','mount.js','tex.js','gears.js','collide.js','presets.js']);
globalThis.document = { getElementById: () => null }; GW.Wizard = undefined;
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'wizard.js'), 'utf8');
require('vm').runInThisContext(src, { filename: 'wizard.js' });
const W = GW.Wizard; let bad = 0; const ok = (c, m) => { if(!c){ bad++; console.log('✘ ' + m); } };
let r = W.solve(18, 54, 2); ok(r.ok && r.P === 18 && r.validN.includes(3), 'sun 18, ring 54 -> planets 18, 3 fit');
r = W.solve(18, 55, 2); ok(!r.ok && /even/.test(r.why[0]), 'odd ring - sun is explained');
r = W.solve(20, 30, 2); ok(!r.ok, 'planets of 5 teeth are refused');
r = W.solve(24, 72, 2); ok(r.ok && r.validN.includes(4), 'sun 24 ring 72: 4 planets');
r = W.solve(17, 55, 2); ok(r.ok, 'sun 17 ring 55 (planets 19) works: ' + JSON.stringify(r.why));
const sg = W.suggest(18, 55, 2, 'sun'); ok(sg.length && sg.every(o => o.S === 18 && W.solve(o.S, o.R, 2).ok), 'suggestions keep the sun and are valid');
const sg2 = W.suggest(18, 55, 2, 'ring'); ok(sg2.length && sg2.every(o => o.R === 55 && W.solve(o.S, o.R, 2).ok), 'suggestions keep the ring and are valid');
// every recommendation really builds, meshes and does not overlap
GW.Build.quality = 0;
[[18, 54, 3], [24, 72, 4], [12, 60, 3], [20, 80, 5], [15, 45, 3]].forEach(([S, R, N]) => {
  const s = W.solve(S, R, 2); if(!s.ok || !s.validN.includes(N)){ console.log('skip', S, R, N, s.why.join(' ')); return; }
  const G = GW.Gears; G.clear(); G.nextId = 1;
  const sun = G.add('spur', { name: 'Sun', z: S, bore: 8, thick: 10 }); const ps = [];
  for(let k = 0; k < N; k++){ const p = G.add('spur', { name: 'P' + k, z: s.P, bore: 5, thick: 10 }); GW.meshAuto(p, sun); G.set(p, 'meshAngle', (360 * k / N + 180) % 360 - 180); ps.push(p); }
  const ring = G.add('internal', { name: 'Ring', z: R, rimW: 4, bore: 0, thick: 10 }); GW.meshAuto(ring, ps[0]); G.set(ring, 'meshAngle', 0);
  GW.Layout.solveAll();
  const all = [sun, ...ps, ring];
  for(let a = 0; a < all.length; a++) for(let b = a + 1; b < all.length; b++){
    const A = all[a], B = all[b]; let ov = 0; for(let k = 0; k < 6; k++){ sun.rt.q += 0.61; GW.Layout.update(0); ov = Math.max(ov, GW.Collide.overlap(A, B, 250)); }
    ok(ov < 0.012, `S${S} R${R} N${N}: ${A.name}/${B.name} overlap ${(ov * 100).toFixed(1)}%`);
  }
  ps.forEach(p => { const c = GW.Compat.check(sun, p, { kind: 'mesh' }); ok(c.ok, `S${S} R${R}: sun/${p.name} ${c.issues.map(i => i.id)}`); });
});
console.log(bad ? bad + ' problems' : 'wizard maths and builds clean'); process.exit(bad ? 1 : 0);
