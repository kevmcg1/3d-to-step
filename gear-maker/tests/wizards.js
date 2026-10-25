// Every wizard: its default answers must work, "which gear to adjust" options must really fix a broken answer, and what it builds must
// mesh without overlap.
const GW = require('./harness.js')(['util.js','anim.js','profiles.js','geo.js','types.js','tol.js','builders.js','calc.js','compat.js','mount.js','tex.js','gears.js','collide.js','presets.js']);
globalThis.document = { getElementById: () => null };
['wizard.js', 'wizard2.js'].forEach(f => require('vm').runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', f), 'utf8'), { filename: f }));
const D = GW.Wizard.Defs; GW.Build.quality = 0; let bad = 0; const ok = (c, m) => { if(!c){ bad++; console.log('✘ ' + m); } };
const defaults = id => { const v = {}; D[id].fields.forEach(f => { v[f.id] = f.def; }); return v; };
const G = GW.Gears;
function check(id, v, label){
  const s = D[id].solve(v); if(!s.ok){ ok(false, `${id} ${label}: ${s.why.join(' | ')}`); return; }
  G.clear(); G.nextId = 1; let made;
  try { made = D[id].build(v, s); } catch(e){ ok(false, `${id} ${label} build threw ${e.message}`); return; }
  GW.Layout.solveAll();
  made.forEach(c => { if(!c.parentId) return; const P = G.get(c.parentId), r = GW.Compat.check(P, c, { kind: c.linkKind === 'same shaft' ? 'shaft' : 'mesh' }); ok(r.ok, `${id} ${label}: ${P.name}→${c.name} not ok: ${r.issues.filter(i => i.level === 'err').map(i => i.text.replace(/<[^>]+>/g, '')).join(' | ')}`); });
  for(let a = 0; a < made.length; a++) for(let b = a + 1; b < made.length; b++){
    const A = made[a], B = made[b], kind = GW.Compat.kindOf(A.type, B.type) || GW.Compat.kindOf(B.type, A.type);
    if(!kind || kind === 'chain' || kind === 'belt') continue;
    let ov = 0; for(let k = 0; k < 6; k++){ G.rootOf(A).rt.q += 0.61; GW.Layout.update(0); ov = Math.max(ov, GW.Collide.overlap(A, B, 250)); }
    ok(ov < 0.012, `${id} ${label}: ${A.name}/${B.name} overlap ${(ov * 100).toFixed(1)}%`);
  }
}
Object.keys(D).forEach(id => {
  check(id, defaults(id), 'defaults');
  // broken answers must be explained and every offered fix must work
  const broken = { train: { ratio: 3.37, cd: 91 }, rack: { perturn: 70, travel: 400 }, worm: { dia: 8, starts: 3, ratio: 12 }, bevel: { ratio: 1.337 }, drive: { cd: 151.3, ratio: 2.33 } }[id];
  const v = Object.assign(defaults(id), broken), s = D[id].solve(v);
  if(s.ok){ console.log('  (' + id + ': the broken answer happens to be fine)'); return; }
  ok(s.why.length > 0, id + ': explains why');
  ok(s.opts.length > 0, id + ': offers something to adjust');
  s.opts.forEach((o, i) => { const v2 = Object.assign({}, v, o.set), s2 = D[id].solve(v2); ok(s2.ok || s2.why.length < s.why.length, `${id}: option "${o.label}" does not help: ${s2.why.join(' | ')}`); if(s2.ok) check(id, v2, 'after fix ' + i); });
});
console.log(bad ? bad + ' problems' : 'all wizards clean'); process.exit(bad ? 1 : 0);
