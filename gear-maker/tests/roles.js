// Make every gear of every sample the driver, one after the other: nothing may move, every link must still fit and mesh.
const GW = require('./harness.js')(['util.js','anim.js','profiles.js','geo.js','types.js','tol.js','builders.js','calc.js','compat.js','mount.js','tex.js','gears.js','collide.js','presets.js']);
const THREE = globalThis.THREE; GW.Build.quality = 0;
const G = GW.Gears; let bad = 0, n = 0;
GW.Presets.forEach(p => {
  if(p.id === 'showcase') return;
  G.clear(); G.nextId = 1; p.build(0, 0); GW.Layout.solveAll();
  const ids = G.list.map(g => g.id);
  ids.forEach(id => {
    const before = new Map(G.list.map(g => [g.id, g.rt.pos.clone()]));
    const r = G.makeDriver(id); n++;
    if(!r.ok){ console.log('✘', p.id, G.get(id).name, r.reason); bad++; return; }
    GW.Layout.solveAll();
    const off = G.list.reduce((m, g) => Math.max(m, g.rt.pos.distanceTo(before.get(g.id))), 0);
    const g = G.get(id), roots = G.list.filter(x => !x.parentId);
    let msg = '';
    if(off > 0.02) msg += ' moved ' + off.toFixed(3);
    if(g.parentId) msg += ' still has a parent';
    G.list.forEach(c => { if(!c.parentId) return; const P = G.get(c.parentId), r2 = GW.Compat.check(P, c, { kind: c.linkKind === 'same shaft' ? 'shaft' : 'mesh' }); if(!r2.ok) msg += ` link ${P.name}→${c.name} not ok`; });
    G.list.forEach(c => { if(!c.parentId || c.linkKind !== 'mesh') return; const P = G.get(c.parentId); if(GW.Collide.applies(P, c, { supported: true, ok: true, kind: GW.Compat.kindOf(P.type, c.type) })){ let ov = 0; for(let k = 0; k < 4; k++){ const rt = G.rootOf(c); rt.rt.q += 0.7; GW.Layout.update(0); ov = Math.max(ov, GW.Collide.overlap(P, c, 200)); } if(ov > GW.Collide.limit(GW.Compat.kindOf(P.type, c.type))) msg += ` overlap ${P.name}/${c.name} ${(ov*100).toFixed(1)}%`; } });
    if(msg){ console.log('✘', p.id, 'driver =', g.name + ':' + msg); bad++; }
  });
});
console.log(bad ? `\n${bad} of ${n} failed` : `all ${n} re-rootings clean`);
process.exit(bad ? 1 : 0);
