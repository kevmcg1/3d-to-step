"use strict";
/* Gear Maker — more gear-set wizards, next to the planetary one. Each one asks a few plain questions, works out what to build,
   explains anything that cannot work (a whole number of teeth, no undercut, a center distance that must be hit, a chain with
   an even number of links...) and then says WHICH gear to adjust, with the nearest good values for each choice. Then it builds
   the set on the table, every pair meshed like the samples.
   A wizard is data: { id, label, desc, sample, fields[], solve(v) -> { ok, why[], table[], notes[], opts[] }, build(v) }.
   solve() is pure (no page needed) so tests/wizards.js can run it with node. */
(function(){
const U = GW.U, esc = U.esc;
const MODULES = [0.5, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const minTeeth = (pa, ha) => 2 * (ha == null ? 1 : ha) / Math.pow(Math.sin(U.rad(pa)), 2);
const f3 = v => U.fmt(v, 3), f2 = v => U.fmt(v, 2);
const mm = v => GW.Units ? GW.Units.pair(v) : f2(v) + ' mm';
const nearStd = m => MODULES.slice().sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0];
/* the nearest (pinion, gear) tooth counts to a ratio, smallest change from the current pair first */
function pairs(ratio, z1, o){
  o = o || {}; const out = [];
  for(let a = Math.max(o.minZ || 12, 6); a <= (o.maxPin || 60); a++){
    const b = Math.round(a * ratio); if(b > 300 || b < 6) continue;
    const err = Math.abs(b / a - ratio) / ratio;
    out.push({ z1: a, z2: b, err, cost: err * 100 + Math.abs(a - z1) * 0.6 + (gcd(a, b) > 1 ? 0.8 : 0) });
  }
  return out.sort((x, y) => x.cost - y.cost);
}

const common = [
  { id: 'm', label: 'Module', kind: 'num', def: 2, step: 0.05, unit: 'mm', hint: 'Tooth size in millimeters; every gear in the set shares it. 1 to 3 suits most small gearboxes.' },
  { id: 'pa', label: 'Pressure angle', kind: 'num', def: 20, step: 0.5, unit: '°', hint: '20° is the standard.' },
  { id: 'thick', label: 'Face width', kind: 'len', def: 10, step: 0.5, hint: 'How thick the gears are.' },
  { id: 'process', label: 'Made by', kind: 'sel', def: 'machined', opts: () => Object.keys(GW.Tol.PROCESSES).map(k => [k, GW.Tol.PROCESSES[k].label]) }
];

const Defs = {
  /* ---------------------------------------------------------------- reduction train */
  train: {
    label: 'Gear reduction', sample: 'compound', desc: 'One pair, or two pairs on shared shafts, for a speed ratio you choose. Picks tooth counts that mesh smoothly.',
    fields: [
      { id: 'kind', label: 'How many stages?', kind: 'sel', def: 'single', opts: [['single', 'One pair of gears'], ['compound', 'Two pairs (compound): big reductions in a small space']] },
      { id: 'ratio', label: 'Speed reduction', kind: 'num', def: 4, step: 0.1, hint: 'Input turns per output turn. 4 means the output turns four times slower.' },
      { id: 'z1', label: 'Small gear teeth', kind: 'int', def: 18, step: 1, hint: 'The input gear. 17 or more avoids undercut at 20°.' },
      { id: 'cd', label: 'Center distance', kind: 'len', def: 0, step: 0.5, hint: '0 = whatever the teeth give. Type a number if the shafts must be exactly that far apart.' },
      { id: 'bore', label: 'Bore Ø', kind: 'len', def: 6, step: 0.1, hint: 'Shaft size.' }
    ].concat(common),
    solve(v){
      const r = { ok: true, why: [], notes: [], table: [], opts: [], geo: {} };
      const comp = v.kind === 'compound', r1 = comp ? Math.sqrt(v.ratio) : v.ratio;
      const z1 = Math.round(v.z1), z2 = Math.round(z1 * r1), z3 = comp ? z1 : 0, z4 = comp ? Math.round(z3 * v.ratio / (z2 / z1)) : 0;
      const got = comp ? (z2 / z1) * (z4 / z3) : z2 / z1, err = Math.abs(got - v.ratio) / v.ratio;
      Object.assign(r.geo, { z1, z2, z3, z4, got });
      if(z1 < 6 || z2 > 300 || (comp && (z4 > 300 || z4 < 6))) r.why.push(`A gear would have ${z2 > 300 ? z2 : z1 < 6 ? z1 : z4} teeth: the range is 6 to 300.`);
      if(err > 0.02) r.why.push(`Whole teeth cannot give exactly ${f3(v.ratio)} : 1 here. The nearest is ${f3(got)} : 1 (${f2(err * 100)} % off).`);
      const a1 = v.m * (z1 + z2) / 2;
      if(v.cd > 0 && Math.abs(a1 - v.cd) > 0.05) r.why.push(`The shafts would be ${f2(a1)} mm apart, not the ${f2(v.cd)} mm you need (module ${f2(v.m)} × (${z1} + ${z2}) ÷ 2).`);
      if(z1 < minTeeth(v.pa, 1)) r.notes.push(`The ${z1}-tooth gear is below ${Math.ceil(minTeeth(v.pa, 1))} teeth, so its roots would be undercut. A profile shift is added for you.`);
      if(gcd(z1, z2) > 1) r.notes.push(`${z1} and ${z2} share a factor of ${gcd(z1, z2)}, so the same teeth meet again and again and wear unevenly. A tooth count with no common factor spreads the wear.`);
      r.table = [['Small gear → big gear', `${z1} → ${z2} teeth`]];
      if(comp) r.table.push(['Second stage', `${z3} → ${z4} teeth`]);
      r.table.push(['Overall reduction', `${f3(got)} : 1  (output turns ${f3(got)}× slower, ${comp ? 'the same way' : 'the opposite way'})`], ['Center distance' + (comp ? ' (stage 1)' : ''), mm(a1)], ['Output at 12 rpm in', f2(12 / got) + ' rpm']);
      r.ok = !r.why.length;
      if(!r.ok){
        // which gear to adjust
        pairs(r1, z1, { minZ: 8 }).filter(p => p.err <= 0.02 || p.err < err).slice(0, 12).forEach(p => {
          if(p.z1 === z1 && p.z2 === z2) return;
          if(v.cd > 0 && Math.abs(v.m * (p.z1 + p.z2) / 2 - v.cd) > 0.05) return;
          r.opts.push({ label: p.z1 === z1 ? `Big gear: ${z2} → ${p.z2} teeth` : `Small gear ${z1} → ${p.z1} and big gear ${z2} → ${p.z2} teeth`, sub: `ratio ${f3(comp ? (p.z2 / p.z1) * (p.z2 / p.z1) : p.z2 / p.z1)} : 1${gcd(p.z1, p.z2) === 1 ? ' · no common factor' : ''}`, set: { z1: p.z1 } });
        });
        if(v.cd > 0){
          const s = 2 * v.cd / (z1 + z2), m2 = nearStd(s);
          if(Math.abs(m2 * (z1 + z2) / 2 - v.cd) < 0.5) r.opts.unshift({ label: `Module: ${f2(v.m)} → ${f2(m2)}`, sub: `puts the shafts ${f2(m2 * (z1 + z2) / 2)} mm apart`, set: { m: m2 } });
          const S = Math.round(2 * v.cd / v.m), alt = [];
          for(let a = 8; a <= 60; a++){ const b = S - a; if(b > a && b <= 300) alt.push({ z1: a, z2: b, e: Math.abs(b / a - r1) / r1 + (gcd(a, b) > 1 ? 0.01 : 0) }); }
          alt.sort((x, y) => x.e - y.e).slice(0, 2).forEach(p => r.opts.push({ label: `Teeth: ${z1} / ${z2} → ${p.z1} / ${p.z2}`, sub: `exactly ${f2(v.cd)} mm between shafts at module ${f2(v.m)}, ratio ${f3(p.z2 / p.z1)} : 1`, set: { z1: p.z1 } }));
          r.opts.push({ label: `Center distance: ${f2(v.cd)} → ${f2(a1)} mm`, sub: 'what these teeth give: move the shafts instead of the gears', set: { cd: +a1.toFixed(2) } });
        }
        r.opts = r.opts.slice(0, 4);
      }
      return r;
    },
    build(v, s){
      const g = s.geo, add = (t, o) => GW.Gears.add(t, Object.assign({ m: v.m, pa: v.pa, thick: v.thick, tolerance: v.process }, o)), A = GW.meshAuto;
      const a = add('spur', { name: 'Input', z: g.z1, bore: v.bore, finish: 'brass' }), b = add('spur', { name: 'Stage 1 gear', z: g.z2, bore: v.bore, finish: 'steel' });
      A(b, a); const made = [a, b];
      if(v.kind === 'compound'){
        const c = add('spur', { name: 'Stage 2 pinion', z: g.z3, bore: v.bore, finish: 'brass', thick: v.thick }), d = add('spur', { name: 'Output', z: g.z4, bore: v.bore, finish: 'aluminum' });
        A(c, b, 'same shaft'); GW.Gears.set(c, 'shaftOffset', +(b.info.z1 - c.info.z0 + 0.5).toFixed(2)); A(d, c); GW.Gears.set(d, 'meshAngle', 0); made.push(c, d);
      }
      return made;
    }
  },

  /* ---------------------------------------------------------------- rack and pinion */
  rack: {
    label: 'Rack and pinion', sample: 'rack', desc: 'Turns a shaft into travel. Say how far it must move and how far per turn; the rack is sized to fit.',
    fields: [
      { id: 'travel', label: 'Travel needed', kind: 'len', def: 100, step: 1, hint: 'How far the rack must slide.' },
      { id: 'z1', label: 'Pinion teeth', kind: 'int', def: 18, step: 1, hint: 'The round gear. 17 or more avoids undercut at 20°.' },
      { id: 'perturn', label: 'Travel per turn', kind: 'len', def: 0, step: 0.5, hint: '0 = whatever the pinion gives (π × module × teeth). Type a number to have me pick the pinion for it.' },
      { id: 'bore', label: 'Pinion bore Ø', kind: 'len', def: 8, step: 0.1, hint: '' }
    ].concat(common),
    solve(v){
      const r = { ok: true, why: [], notes: [], table: [], opts: [], geo: {} };
      const z1 = Math.round(v.z1), p = Math.PI * v.m, circ = p * z1, reach = v.m * (z1 / 2 + 1);
      const zr = Math.max(4, Math.ceil((v.travel + 2 * reach + 2) / p)); Object.assign(r.geo, { z1, zr, circ });
      if(z1 < 6 || z1 > 300) r.why.push('The pinion needs 6 to 300 teeth.');
      if(v.perturn > 0 && Math.abs(circ - v.perturn) > 0.05 * v.perturn + 0.05) r.why.push(`One turn of a ${z1}-tooth pinion moves the rack ${f2(circ)} mm, not the ${f2(v.perturn)} mm you want.`);
      if(zr > 80) r.why.push(`The rack would need ${zr} teeth (the most is 80). Use a smaller module, or less travel.`);
      if(z1 < minTeeth(v.pa, 1)) r.notes.push(`The pinion is under ${Math.ceil(minTeeth(v.pa, 1))} teeth, so its roots would be undercut. A profile shift is added for you.`);
      r.table = [['Pinion', `${z1} teeth, Ø ${mm(v.m * z1)} pitch`], ['Rack', `${zr} teeth, ${mm(zr * p)} long`], ['Travel per turn', mm(circ)], ['Turns for the full travel', f2(v.travel / circ)], ['At 12 rpm the rack moves', f2(circ * 12 / 60) + ' mm/s']];
      r.ok = !r.why.length;
      if(!r.ok){
        if(v.perturn > 0){ const want = v.perturn / p; for(const z of [Math.round(want), Math.floor(want), Math.ceil(want)].filter((x, i, a) => x >= 6 && a.indexOf(x) === i)) r.opts.push({ label: `Pinion: ${z1} → ${z} teeth`, sub: `${f2(p * z)} mm per turn`, set: { z1: z } }); const m2 = nearStd(v.perturn / (Math.PI * z1)); r.opts.push({ label: `Module: ${f2(v.m)} → ${f2(m2)}`, sub: `${f2(Math.PI * m2 * z1)} mm per turn with ${z1} teeth`, set: { m: m2 } }); }
        if(zr > 80){ const m2 = nearStd((v.travel + 4) / (Math.PI * 78)); r.opts.push({ label: `Module: ${f2(v.m)} → ${f2(Math.max(m2, v.m))}`, sub: 'a bigger tooth, so fewer teeth for the same length', set: { m: Math.max(m2, v.m) } }); }
      }
      return r;
    },
    build(v, s){
      const g = s.geo, a = GW.Gears.add('spur', { name: 'Pinion', z: g.z1, m: v.m, pa: v.pa, thick: v.thick, bore: v.bore, tolerance: v.process, finish: 'brass' });
      const r = GW.Gears.add('rack', { name: 'Rack', z: g.zr, m: v.m, pa: v.pa, thick: v.thick, tolerance: v.process, finish: 'steel' });
      GW.meshAuto(r, a); GW.Gears.set(r, 'meshAngle', -90); return [a, r];
    }
  },

  /* ---------------------------------------------------------------- worm drive */
  worm: {
    label: 'Worm drive', sample: 'worm', desc: 'A screw that turns a wheel: a big ratio in one stage, and it can hold its load without back-driving.',
    fields: [
      { id: 'ratio', label: 'Speed reduction', kind: 'num', def: 15, step: 1, hint: 'Wheel teeth ÷ worm starts. 15 means the wheel turns 15 times slower.' },
      { id: 'starts', label: 'Worm starts', kind: 'int', def: 1, step: 1, hint: '1 gives the biggest ratio and self-locks; 2 to 4 are faster and efficient but may back-drive.' },
      { id: 'dia', label: 'Worm pitch Ø', kind: 'len', def: 20, step: 0.5, hint: 'Thicker worms are stiffer but have a smaller lead angle.' },
      { id: 'bore', label: 'Bore Ø', kind: 'len', def: 6, step: 0.1, hint: 'Both shafts.' }
    ].concat(common),
    solve(v){
      const r = { ok: true, why: [], notes: [], table: [], opts: [], geo: {} };
      const n = Math.round(v.starts), zw = Math.round(v.ratio * n), lead = U.deg(Math.atan(n * v.m / v.dia));
      Object.assign(r.geo, { n, zw, lead });
      if(n < 1 || n > 8) r.why.push('The worm has 1 to 8 starts.');
      if(zw < 6 || zw > 300) r.why.push(`The wheel would have ${zw} teeth: the range is 6 to 300.`);
      if(zw < 17 && zw >= 6) r.notes.push(`The wheel has ${zw} teeth, below the usual 17 or more: it will be cut with a profile shift.`);
      if(lead > 25) r.why.push(`The lead angle is ${f2(lead)}°: steeper than 25° the thread is too coarse for the wheel to mesh well. Make the worm thicker, use fewer starts, or a smaller module.`);
      r.notes.push(lead < 5 ? `Lead angle ${f2(lead)}°: below about 5° a worm drive normally cannot be turned backwards from the wheel (it self-locks).` : `Lead angle ${f2(lead)}°: it can be back-driven, so add a brake if the load must stay put.`);
      r.table = [['Wheel teeth', `${zw}  (${f2(v.ratio)} × ${n} starts)`], ['Worm', `Ø ${mm(v.dia)} pitch, lead ${mm(n * Math.PI * v.m)}`], ['Lead angle = wheel helix', f2(lead) + '°'], ['Center distance', mm(v.dia / 2 + zw * v.m / 2)], ['Output at 1200 rpm in', f2(1200 / v.ratio) + ' rpm']];
      r.ok = !r.why.length;
      if(!r.ok){
        if(lead > 25){ const d = n * v.m / Math.tan(U.rad(20)); r.opts.push({ label: `Worm Ø: ${f2(v.dia)} → ${f2(Math.ceil(d))}`, sub: 'a 20° lead angle', set: { dia: Math.ceil(d) } }); if(n > 1) r.opts.push({ label: `Starts: ${n} → ${n - 1}`, sub: `lead angle ${f2(U.deg(Math.atan((n - 1) * v.m / v.dia)))}°`, set: { starts: n - 1 } }); const m2 = nearStd(v.m * 0.6); if(m2 < v.m) r.opts.push({ label: `Module: ${f2(v.m)} → ${f2(m2)}`, sub: `lead angle ${f2(U.deg(Math.atan(n * m2 / v.dia)))}°`, set: { m: m2 } }); }
        if(zw > 300) r.opts.push({ label: `Ratio: ${f2(v.ratio)} → ${Math.floor(300 / n)}`, sub: 'the most this worm can give', set: { ratio: Math.floor(300 / n) } });
        if(zw < 6) r.opts.push({ label: `Ratio: ${f2(v.ratio)} → ${Math.ceil(6 / n)}`, sub: 'the least a wheel can have', set: { ratio: Math.ceil(6 / n) } });
      }
      return r;
    },
    build(v, s){
      const g = s.geo, w = GW.Gears.add('worm', { name: 'Worm', m: v.m, pa: v.pa, starts: g.n, wormDia: v.dia, thick: Math.max(20, Math.round(v.dia * 2.2)), bore: v.bore, tolerance: v.process, finish: 'steel' });
      const h = GW.Gears.add('wormwheel', { name: 'Worm wheel', z: g.zw, m: v.m, pa: v.pa, thick: v.thick, throatR: +(v.dia / 2 + 2).toFixed(1), bore: v.bore, hubDia: v.bore * 2.2, hubUp: 4, tolerance: v.process, finish: 'bronze' });
      GW.meshAuto(h, w); return [w, h];
    }
  },

  /* ---------------------------------------------------------------- bevel pair */
  bevel: {
    label: 'Bevel pair', sample: 'bevel', desc: 'Turns the drive through an angle (usually 90°). Works out the cone angles from the tooth counts.',
    fields: [
      { id: 'ratio', label: 'Speed ratio', kind: 'num', def: 1.5, step: 0.1, hint: 'Pinion turns per gear turn. 1 = a mitre pair.' },
      { id: 'z1', label: 'Pinion teeth', kind: 'int', def: 20, step: 1, hint: 'The small gear. Bevel gears act like gears of z ÷ cos(cone) teeth, so 17+ is easy to reach.' },
      { id: 'sigma', label: 'Angle between the shafts', kind: 'num', def: 90, step: 1, unit: '°', hint: '90° is the usual corner.' },
      { id: 'bore', label: 'Bore Ø', kind: 'len', def: 6, step: 0.1, hint: '' }
    ].concat(common),
    solve(v){
      const r = { ok: true, why: [], notes: [], table: [], opts: [], geo: {} };
      const z1 = Math.round(v.z1), z2 = Math.round(z1 * v.ratio), sg = U.rad(v.sigma);
      const d1 = Math.atan2(Math.sin(sg), z2 / z1 + Math.cos(sg)), d2 = sg - d1, got = z2 / z1, err = Math.abs(got - v.ratio) / v.ratio;
      Object.assign(r.geo, { z1, z2, d1: U.deg(d1), d2: U.deg(d2), got });
      if(z1 < 6 || z2 > 300) r.why.push('A gear would be outside 6 to 300 teeth.');
      if(err > 0.03) r.why.push(`Whole teeth give ${f3(got)} : 1, ${f2(err * 100)} % away from ${f3(v.ratio)} : 1.`);
      if(U.deg(d1) < 5 || U.deg(d2) > 80) r.notes.push('One cone is very flat or very pointed; it works but is awkward to make.');
      const vz = z1 / Math.cos(d1); if(vz < 17) r.notes.push(`The pinion acts like a ${f2(vz)}-tooth spur gear. Below 17 its teeth are undercut; a profile shift is added.`);
      r.table = [['Pinion → gear', `${z1} → ${z2} teeth`], ['Ratio', `${f3(got)} : 1`], ['Cone angles', `${f2(U.deg(d1))}° and ${f2(U.deg(d2))}°`], ['Pitch diameters', `${mm(v.m * z1)} and ${mm(v.m * z2)}`]];
      r.ok = !r.why.length;
      if(!r.ok) pairs(v.ratio, z1, { minZ: 12, maxPin: 40 }).filter(p => p.err < err).slice(0, 3).forEach(p => r.opts.push({ label: p.z1 === z1 ? `Gear: ${z2} → ${p.z2} teeth` : `Pinion ${z1} → ${p.z1}, gear ${z2} → ${p.z2}`, sub: `ratio ${f3(p.z2 / p.z1)} : 1`, set: { z1: p.z1 } }));
      return r;
    },
    build(v, s){
      const g = s.geo, a = GW.Gears.add('bevel', { name: 'Pinion', z: g.z1, m: v.m, pa: v.pa, thick: v.thick, bore: v.bore, tolerance: v.process, finish: 'brass' });
      const b = GW.Gears.add('bevel', { name: 'Gear', z: g.z2, m: v.m, pa: v.pa, thick: v.thick, bore: v.bore, tolerance: v.process, finish: 'steel' });
      GW.meshAuto(b, a); GW.Gears.set(b, 'shaftAngle', v.sigma); return [a, b];
    }
  },

  /* ---------------------------------------------------------------- chain or belt drive */
  drive: {
    label: 'Chain or belt drive', sample: 'chain', desc: 'Two sprockets or pulleys and a chain or belt. Picks sizes, and a center distance that gives a whole number of links or teeth.',
    fields: [
      { id: 'kind', label: 'Chain or belt?', kind: 'sel', def: 'chain', opts: [['chain', 'Roller chain'], ['belt', 'Timing belt']] },
      { id: 'ratio', label: 'Speed reduction', kind: 'num', def: 2, step: 0.1, hint: 'Driver turns per driven turn.' },
      { id: 'z1', label: 'Small sprocket teeth', kind: 'int', def: 17, step: 1, hint: 'Chain sprockets under 13 teeth run rough; 17+ is smooth.' },
      { id: 'pitch', label: 'Chain / belt size', kind: 'sel', def: '#40 / 08A (12.7)', opts: v => v.kind === 'belt' ? Object.keys(GW.Types.BELT).filter(k => k !== 'custom').map(k => [k, k]) : Object.keys(GW.Types.CHAIN).filter(k => k !== 'custom').map(k => [k, k]), dep: 'kind', defFor: { belt: 'GT2 3 mm', chain: '#40 / 08A (12.7)' } },
      { id: 'cd', label: 'Center distance wanted', kind: 'len', def: 150, step: 1, hint: 'Between the two shafts. I will nudge it so the chain or belt closes.' },
      { id: 'thick', label: 'Face width', kind: 'len', def: 8, step: 0.5, hint: '' },
      { id: 'bore', label: 'Bore Ø', kind: 'len', def: 8, step: 0.1, hint: '' },
      { id: 'process', label: 'Made by', kind: 'sel', def: 'machined', opts: () => Object.keys(GW.Tol.PROCESSES).map(k => [k, GW.Tol.PROCESSES[k].label]) }
    ],
    solve(v){
      const r = { ok: true, why: [], notes: [], table: [], opts: [], geo: {} };
      const preset = v.kind === 'belt' ? GW.Types.BELT[v.pitch] : GW.Types.CHAIN[v.pitch];
      if(!preset){ r.ok = false; r.why.push('Pick a chain or belt size.'); return r; }
      const p = v.kind === 'belt' ? preset.beltPitch : preset.chainPitch, z1 = Math.round(v.z1), z2 = Math.round(z1 * v.ratio), got = z2 / z1;
      const R1 = v.kind === 'belt' ? z1 * p / (2 * Math.PI) : p / (2 * Math.sin(Math.PI / z1)), R2 = v.kind === 'belt' ? z2 * p / (2 * Math.PI) : p / (2 * Math.sin(Math.PI / z2));
      Object.assign(r.geo, { z1, z2, p, R1, R2, got });
      const len = (c) => GW.Prof && GW.Prof.loopPath ? GW.Prof.loopPath(R1, R2, c).len : 2 * c + Math.PI * (R1 + R2) + Math.pow(R2 - R1, 2) / c;
      const links = c => len(c) / p;
      const minC = (R1 + R2) * 1.25 + 6;
      if(z1 < 6 || z2 > 300) r.why.push('A sprocket would be outside 6 to 300 teeth.');
      if(v.cd < minC) r.why.push(`The sprockets would touch: they need at least ${f2(minC)} mm between the shafts.`);
      if(v.kind === 'chain' && z1 < 13) r.notes.push(`${z1} teeth is small for a chain sprocket: expect rough running and wear. 17 or more is smooth.`);
      // the center distance that gives a whole (and for chain, even) count
      const step = v.kind === 'chain' ? 2 : 1, near = [];
      const L0 = links(Math.max(v.cd, minC));
      for(let n = Math.floor(L0) - 4 * step; n <= Math.ceil(L0) + 4 * step; n++){
        if(v.kind === 'chain' && n % 2) continue;
        // solve length(c) = n * p for c by bisection
        let lo = minC, hi = Math.max(v.cd * 4, 1000);
        if(links(lo) > n || links(hi) < n) continue;
        for(let k = 0; k < 50; k++){ const mid = (lo + hi) / 2; if(links(mid) < n) lo = mid; else hi = mid; }
        near.push({ n, c: (lo + hi) / 2 });
      }
      near.sort((a, b) => Math.abs(a.c - v.cd) - Math.abs(b.c - v.cd));
      const best = near[0]; r.geo.best = best;
      if(best){
        const off = Math.abs(best.c - v.cd);
        if(off > Math.max(3, v.cd * 0.03) && !r.why.length) r.why.push(`A ${best.n}-${v.kind === 'chain' ? 'link' : 'tooth'} ${v.kind} closes at ${f2(best.c)} mm between shafts, not ${f2(v.cd)} mm.${v.kind === 'chain' ? ' (A chain needs an even number of links, or an offset link.)' : ''}`);
        else if(off > 0.5) r.notes.push(`The shafts are set ${f2(best.c)} mm apart (you asked ${f2(v.cd)} mm) so the ${v.kind} closes with a whole ${best.n} ${v.kind === 'chain' ? 'links' : 'teeth'}.`);
        r.geo.c = best.c; r.geo.n = best.n;
        near.slice(0, 3).forEach(o => { if(Math.abs(o.c - v.cd) > 0.5) r.opts.push({ label: `Center distance: ${f2(v.cd)} → ${f2(o.c)} mm`, sub: `${o.n} ${v.kind === 'chain' ? 'links' : 'teeth'} of ${v.kind}`, set: { cd: +o.c.toFixed(2) } }); });
      }
      if(got !== v.ratio && Math.abs(got - v.ratio) / v.ratio > 0.03) r.why.push(`Whole teeth give ${f3(got)} : 1, not ${f3(v.ratio)} : 1.`);
      pairs(v.ratio, z1, { minZ: v.kind === 'chain' ? 13 : 10, maxPin: 50 }).filter(q => Math.abs(q.z2 / q.z1 - v.ratio) / v.ratio < Math.abs(got - v.ratio) / v.ratio - 1e-9).slice(0, 2).forEach(q => r.opts.push({ label: `Sprockets: ${z1} / ${z2} → ${q.z1} / ${q.z2} teeth`, sub: `ratio ${f3(q.z2 / q.z1)} : 1`, set: { z1: q.z1 } }));
      r.table = [['Sprockets', `${z1} and ${z2} teeth, ratio ${f3(got)} : 1`], ['Pitch circles', `Ø ${mm(2 * R1)} and Ø ${mm(2 * R2)}`], [best ? `Closes with` : '', best ? `${best.n} ${v.kind === 'chain' ? 'links' : 'teeth'} at ${f2(best.c)} mm between shafts` : '—'], ['Output at 1200 rpm in', f2(1200 / got) + ' rpm']].filter(x => x[0]);
      r.ok = !r.why.length; r.opts = r.opts.slice(0, 4);
      return r;
    },
    build(v, s){
      const g = s.geo, t = v.kind === 'belt' ? 'pulley' : 'sprocket', base = { thick: v.thick, bore: v.bore, tolerance: v.process, finish: v.kind === 'belt' ? 'aluminum' : 'steel' };
      const preset = v.kind === 'belt' ? { beltPreset: v.pitch } : { chainPreset: v.pitch };
      const a = GW.Gears.add(t, Object.assign({ name: 'Drive ' + t, z: g.z1 }, base, preset)), b = GW.Gears.add(t, Object.assign({ name: 'Driven ' + t, z: g.z2 }, base, preset));
      GW.meshAuto(b, a); if(g.c) GW.Gears.set(b, 'meshOffset', +(g.c - (g.R1 + g.R2)).toFixed(2)); return [a, b];
    }
  }
};

/* every offered fix is tried first: only the ones that really make the answer work are shown (else the ones that get closest) */
Object.keys(Defs).forEach(k => {
  const raw = Defs[k].solve;
  Defs[k].solve = function(v){
    const r = raw.call(this, v);
    if(!r.ok && r.opts.length){
      const tried = r.opts.map(o => ({ o, s: raw.call(this, Object.assign({}, v, o.set)) })), good = tried.filter(t => t.s.ok);
      r.opts = (good.length ? good : tried.filter(t => t.s.why.length < r.why.length)).map(t => t.o);
    }
    return r;
  };
});

/* ---------------------------------------------------------------- the generic dialog */
const Wz = GW.Wizard;
Wz.defs = Defs;
Wz.openPlanetary = Wz.open;           // the planetary wizard keeps its own questions; the chooser comes first
Wz.open = () => Wz.chooser();
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* the first screen: which kind of set? */
Wz.chooser = function(){
  const UI = GW.UI;
  const cards = [['planetary', 'Planetary gearbox', 'Sun, planets and a ring. Asks for the center or outside gear and sizes the rest.']].concat(Object.keys(Defs).map(k => [k, Defs[k].label, Defs[k].desc]));
  UI.openModal(`<div class="mhead"><h3>Gear wizards</h3><button class="iconbtn" id="wzClose" aria-label="Close">${ICON_X}</button></div><div class="mbody wz"><div class="mhint wz-top">Pick what you want to make. Each wizard asks a few plain questions, recommends sizes that really mesh, and tells you which gear to change when the numbers do not fit.</div><div class="cards">${cards.map(([id, t, d]) => `<button class="card" data-w="${id}" type="button"><canvas class="cth" width="264" height="184" aria-hidden="true"></canvas><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}</div></div>`);
  GW.U.el('wzClose').onclick = UI.closeModal;
  document.querySelectorAll('#modal .card[data-w]').forEach(c => {
    const id = c.dataset.w, sample = id === 'planetary' ? 'planetary' : Defs[id].sample, p = GW.Presets.find(x => x.id === sample);
    if(p) GW.Preview.thumb(c.querySelector('canvas'), { sample: p });
    c.onclick = () => { GW.Preview.hide(); id === 'planetary' ? Wz.openPlanetary() : Wz.openDef(id); };
  });
};

const val = (f, v) => f.kind === 'len' ? U.fmt(GW.Units.d(v), 4) : f.kind === 'num' ? U.fmt(v, 4) : v;
Wz.openDef = function(id){
  const d = Defs[id], v = {}; d.fields.forEach(f => { v[f.id] = f.def; });
  Wz.d = { id, v, step: 'ask', sol: null };
  Wz.drawDef();
};
Wz.readDef = function(){
  const D = Wz.d, d = Defs[D.id], $ = GW.U.el;
  d.fields.forEach(f => {
    const e = $('wf_' + f.id); if(!e) return;
    if(f.kind === 'sel'){ D.v[f.id] = e.value; return; }
    const n = parseFloat(e.value); if(!isFinite(n)) return;
    D.v[f.id] = f.kind === 'len' ? GW.Units.fromD(n) : f.kind === 'int' ? Math.round(n) : n;
  });
  // choices that depend on another (chain vs belt sizes)
  d.fields.forEach(f => { if(f.dep && D.last && D.last[f.dep] !== D.v[f.dep]) D.v[f.id] = f.defFor[D.v[f.dep]]; });
};
Wz.drawDef = function(){
  const D = Wz.d, d = Defs[D.id], UI = GW.UI, $ = GW.U.el, Un = GW.Units;
  let body = '';
  if(D.step === 'ask'){
    body = `<h4>${esc(d.label)}</h4><div class="mhint wz-top">${esc(d.desc)}</div>` + d.fields.map(f => {
      let ctl;
      if(f.kind === 'sel'){ const opts = typeof f.opts === 'function' ? f.opts(D.v) : f.opts; ctl = `<select id="wf_${f.id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(D.v[f.id]) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
      else ctl = `<div class="wz-in"><input type="number" id="wf_${f.id}" value="${val(f, D.v[f.id])}" step="${f.kind === 'len' ? (Un.inch ? 0.001 : 0.01) : f.step}" inputmode="decimal">${f.kind === 'len' ? `<span>${Un.unit()}</span>` : f.unit ? `<span>${f.unit}</span>` : ''}</div>`;
      return `<div class="mrow"><label for="wf_${f.id}">${esc(f.label)}</label>${ctl}</div>${f.hint ? `<div class="mhint wz-h">${esc(f.hint)}</div>` : ''}`;
    }).join('') + `<div class="mfoot"><button id="wdBack">All wizards</button><button class="go" id="wdNext">Next: recommendations</button></div>`;
  } else if(D.step === 'rec'){
    const s = D.sol = d.solve(D.v);
    body = `<h4>What I recommend</h4><div class="wz-tab">${s.table.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>`;
    if(s.notes.length) body += s.notes.map(n => `<div class="mhint wz-h" style="margin-left:0">• ${esc(n)}</div>`).join('');
    if(!s.ok){
      body += `<div class="wz-bad"><b>This does not work yet</b><ul>${s.why.map(w => '<li>' + esc(w) + '</li>').join('')}</ul></div>`;
      body += s.opts.length ? `<h4>Which gear should I adjust?</h4><div class="opts col">${s.opts.map((o, i) => Wz.radio('fix', i, esc(o.label), esc(o.sub || ''), i === 0)).join('')}</div>` : '<div class="mhint">I could not find a nearby set that works. Go back and change a number.</div>';
      body += `<div class="mfoot"><button id="wdBackAsk">Back</button><button class="go" id="wdApply" ${s.opts.length ? '' : 'disabled'}>Use this and recalculate</button></div>`;
    } else body += `<div class="mfoot"><button id="wdBackAsk">Back</button><button class="go" id="wdBuild">Build it</button></div>`;
  }
  UI.openModal(`<div class="mhead"><h3>${esc(d.label)}</h3><button class="iconbtn" id="wzClose" aria-label="Close">${ICON_X}</button></div><div class="mbody wz">${body}</div>`);
  $('wzClose').onclick = UI.closeModal;
  const on = (id, fn) => { const e = $(id); if(e) e.onclick = fn; };
  on('wdBack', () => Wz.chooser());
  on('wdBackAsk', () => { D.step = 'ask'; Wz.drawDef(); });
  on('wdNext', () => { Wz.readDef(); D.step = 'rec'; Wz.drawDef(); });
  on('wdApply', () => { const e = document.querySelector('#modal input[name=fix]:checked'), o = D.sol.opts[e ? +e.value : 0]; if(o){ Object.assign(D.v, o.set); Wz.drawDef(); } });
  on('wdBuild', () => Wz.buildDef());
  d.fields.filter(f => f.kind === 'sel' && d.fields.some(g => g.dep === f.id)).forEach(f => { const e = $('wf_' + f.id); if(e) e.onchange = () => { D.last = Object.assign({}, D.v); Wz.readDef(); D.last = null; Wz.drawDef(); }; });
};
Wz.buildDef = function(){
  const D = Wz.d, d = Defs[D.id], G = GW.Gears, UI = GW.UI, s = d.solve(D.v);
  if(!s.ok){ UI.toast('Those sizes do not fit together yet.', 4000, 'bad'); return; }
  UI.closeModal();
  let maxX = -Infinity; G.list.forEach(g => { g.mesh.updateMatrixWorld(true); maxX = Math.max(maxX, g.rt.pos.x + G.reach(g)); });
  G._stagger = { n: 0, step: 90 }; let made;
  try {
    const before = G.list.length;
    made = d.build(D.v, s);
    // set it down to the right of whatever is already there
    if(isFinite(maxX)){ const root = made[0]; const c = G.assemblyCircle(root); G.set(root, 'px', +(maxX + c.R + 24).toFixed(2)); G.set(root, 'py', 0); }
  } finally { G._stagger = null; }
  GW.Scene.fit(false, G.list); UI.selId = null; UI.select(made[0].id);
  UI.toast(d.label + ' built: ' + made.map(g => g.name).join(', ') + '.', 4200);
  UI.mark({ list: 1, fb: 1 }); GW.History.busy = false; GW.History.touch();
};
Wz.Defs = Defs;
})();
