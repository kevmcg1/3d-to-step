// Random-settings fuzz: every gear type, many random combinations of its own settings.
// node tests/fuzz.js [runsPerType] [seed]
const GW = require('./harness.js')(['util.js','anim.js','profiles.js','geo.js','types.js','builders.js','calc.js','compat.js','mount.js','gears.js','brep.js','exporters.js']);
const runs = +process.argv[2] || 30; let seed = +process.argv[3] || 1;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
GW.Build.quality = 0;
const T = GW.Types;
let bad = 0, total = 0; const report = {};
function randomValue(def, cur){
  const [, kind, , min, max, step, unit] = def;
  if(kind === 'sel') return pick(unit);
  if(kind === 'bool') return rnd() < 0.5;
  if(kind === 'num' || kind === 'int'){
    const mode = rnd();
    let v = mode < 0.15 ? min : mode < 0.3 ? max : mode < 0.6 ? cur * (0.5 + rnd()) : min + (max - min) * rnd();
    v = Math.min(max, Math.max(min, v));
    return kind === 'int' ? Math.round(v) : Math.round(v / step) * step;
  }
  return cur;
}
Object.keys(T.TYPES).forEach(type => {
  let fails = 0;
  for(let i = 0; i < runs; i++){
    const g = T.defaults(type), changed = {};
    T.TYPES[type].keys.forEach(k => {
      const def = (T.PARAMS[k] || []).slice(); if(!def.length || rnd() < 0.55) return; const rg = T.range(type, k); def[3] = rg[0]; def[4] = rg[1];
      if(k === 'chainPreset' || k === 'beltPreset') return;
      g[k] = randomValue(def, g[k]); changed[k] = g[k];
    });
    // keep derived pieces sane the way the UI does
    total++;
    let res;
    try { const b = GW.Build.build(g); res = GW.Geo.analyze(b.geo); } catch(e){ res = { err: e.message.split('\n')[0] }; }
    const ok = res && !res.err && res.nan === 0 && res.open === 0 && res.nonManifold === 0 && res.flipped === 0 && res.volume > 0;
    if(!ok){ fails++; bad++; (report[type] = report[type] || []).push({ changed, res }); }
  }
  console.log(type.padEnd(12), fails ? `${fails}/${runs} bad` : 'ok');
});
console.log(`\n${total - bad}/${total} clean`);
Object.entries(report).forEach(([t, list]) => { console.log('\n' + t); list.slice(0, 3).forEach(r => console.log(' ', JSON.stringify(r.changed), '\n   ->', JSON.stringify(r.res))); });
process.exit(bad ? 1 : 0);
