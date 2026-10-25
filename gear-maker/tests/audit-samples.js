// Audit every sample as if it were built for real: every pair of gears is checked, not only the ones that were linked.
//   1. each link passes the compatibility rules
//   2. any two gears whose pitch circles touch (an implied mesh, e.g. a planet and the ring) are compatible too
//   3. no two gears' real shapes overlap while the assembly turns (link-or-not), except where the pair is a chain / belt drive
const GW = require('./harness.js')(['util.js','anim.js','profiles.js','geo.js','types.js','tol.js','builders.js','calc.js','compat.js','mount.js','tex.js','gears.js','collide.js','presets.js']);
const THREE = globalThis.THREE;
GW.Build.quality = 1;
const G = GW.Gears; let bad = 0;
const only = process.argv[2];
GW.Presets.forEach(p => {
  if(only && p.id !== only) return;
  G.clear(); G.nextId = 1;
  try { p.build(0, 0); } catch(e){ console.log('✘', p.id, 'build threw', e.message); bad++; return; }
  GW.Layout.solveAll(); GW.Layout.update(0);
  const out = [], L = G.list;
  if(process.env.POS) console.log(p.id, L.map(g => g.name + '@' + g.rt.pos.x.toFixed(1) + ',' + g.rt.pos.y.toFixed(1) + ',' + g.rt.pos.z.toFixed(1)).join('  '));
  // 1. links
  L.forEach(c => { if(!c.parentId) return; const P = G.get(c.parentId), r = GW.Compat.check(P, c, { kind: c.linkKind === 'same shaft' ? 'shaft' : 'mesh' });
    r.issues.filter(i => i.level === 'warn').forEach(i => out.push(`warning ${P.name} → ${c.name}: ${i.text.replace(/<[^>]+>/g, '')}`));
    if(!r.ok) out.push(`link ${P.name} → ${c.name}: ${r.issues.filter(i => i.level === 'err').map(i => i.text.replace(/<[^>]+>/g, '')).join(' | ')}`); });
  // 2 + 3. every pair
  for(let a = 0; a < L.length; a++) for(let b = a + 1; b < L.length; b++){
    const A = L[a], B = L[b], linked = A.parentId === B.id || B.parentId === A.id, kind = GW.Compat.kindOf(A.type, B.type) || GW.Compat.kindOf(B.type, A.type);
    const ka = new THREE.Vector3(0, 0, 1).applyQuaternion(A.rt.quat), kb = new THREE.Vector3(0, 0, 1).applyQuaternion(B.rt.quat);
    const d = B.rt.pos.clone().sub(A.rt.pos), par = ka.clone().cross(kb).length() < 1e-3;
    const along = d.dot(ka), perp = d.clone().addScaledVector(ka, -along).length();
    // implied mesh: parallel shafts, faces overlapping along the shaft, pitch circles touching
    if(!linked && par && (kind === 'ext' || kind === 'ring') && A.type !== 'rack' && B.type !== 'rack'){
      const ea = A.info, eb = B.info, zlo = Math.max(ea.z0, along + eb.z0), zhi = Math.min(ea.z1, along + eb.z1);
      const rs = kind === 'ring' ? Math.abs(GW.Calc.pitchR(A) - GW.Calc.pitchR(B)) : GW.Calc.pitchR(A) + GW.Calc.pitchR(B);
      if(zhi > zlo && Math.abs(perp - rs) < Math.max(A.m, B.m) * 0.6){
        const r = GW.Compat.check(A, B, { kind: 'mesh' });
        if(!r.ok) out.push(`implied mesh ${A.name} ↔ ${B.name} (centers ${perp.toFixed(2)} vs pitch ${rs.toFixed(2)}): ${r.issues.filter(i => i.level === 'err').map(i => i.text.replace(/<[^>]+>/g, '')).join(' | ')}`);
      }
    }
    if(kind === 'chain' || kind === 'belt' || kind === 'ell' && false) continue;
    // many turn positions (the stock test only looks at three)
    let ov = 0; const root = G.rootOf(A), q00 = root.rt.q;
    for(let k = 0; k < 12; k++){ root.rt.q = q00 + k * 0.53; GW.Layout.update(0); ov = Math.max(ov, GW.Collide.overlap(A, B, 400)); }
    root.rt.q = q00; GW.Layout.update(0);
    if(ov > (kind === 'ell' ? GW.Collide.limit('ell') : 0.01)) out.push(`shapes overlap ${(ov * 100).toFixed(1)}%: ${A.name} ↔ ${B.name} ${linked ? '(linked)' : '(NOT linked)'}`);
  }
  console.log((out.length ? '✘ ' : '✔ ') + p.id.padEnd(14) + p.name + (out.length ? '\n    ' + out.join('\n    ') : '')); bad += out.length ? 1 : 0;
});
console.log(bad ? `\n${bad} sample(s) with problems` : '\nall samples clean');
process.exit(bad ? 1 : 0);
