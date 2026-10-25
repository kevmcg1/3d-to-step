"use strict";
/* Gear Maker — "Make a planetary gearbox". A short set of questions: where to start (the center gear, the outside gear, or the
   ratio), the properties of that gear, then what is recommended for the rest. When the numbers cannot work together (a planet
   needs a whole number of teeth, and the planets must be able to sit evenly round the sun) it says why and asks WHICH gear to adjust,
   with the nearest good values for each choice. It then builds the set, every pair meshed like the Planetary sample.
   The rules (module m, sun S teeth, ring R teeth, planets of P teeth, N of them):
     P = (R - S) / 2 must be a whole number,   (S + R) / N must be a whole number so the planets sit evenly,
     and the planets must not touch each other: 2 a sin(pi / N) > planet tip diameter, with a = m (S + P) / 2. */
(function(){
const U = GW.U, $ = U.el, esc = U.esc;
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const W = GW.Wizard = {
  st: null,

  /* ------------------------------------------------------------ the maths */
  /* everything about one choice of S, R and m: is it buildable, and how many planets fit */
  solve(S, R, m, ha){
    ha = ha == null ? 1 : ha;
    const out = { S, R, ok: false, P: (R - S) / 2, validN: [], maxN: 0, why: [] };
    if(!(S >= 6) || !Number.isInteger(S)) out.why.push('The sun needs at least 6 teeth.');
    if(R > 300) out.why.push('The ring can have at most 300 teeth.');
    if(R <= S) out.why.push('The ring must have more teeth than the sun.');
    if((R - S) % 2 !== 0) out.why.push(`The ring (${R}) minus the sun (${S}) must be even, because each planet has (ring − sun) ÷ 2 teeth and ${R - S} ÷ 2 is not a whole number.`);
    if(out.why.length) return out;
    const P = out.P;
    if(P < 8) out.why.push(`The planets would have only ${P} teeth: too small to be useful. The ring needs at least ${S + 16} teeth for this sun.`);
    const a = m * (S + P) / 2, tip = (P + 2 * ha) * m;
    for(let N = 2; N <= 8; N++){
      if((S + R) % N !== 0) continue;
      if(N > 2 && 2 * a * Math.sin(Math.PI / N) < tip * 1.03) continue;
      out.validN.push(N); out.maxN = N;
    }
    if(!out.validN.length) out.why.push(`No number of planets fits: ${S} + ${R} = ${S + R} does not divide evenly into 2 to 8 planets that also clear each other.`);
    out.ok = !out.why.length;
    return out;
  },
  /* the nearest good values when something does not work, for each gear that could be adjusted */
  suggest(S, R, m, keep){
    const opts = [];
    const good = (s, r) => W.solve(s, r, m).ok && W.solve(s, r, m).validN.some(n => n >= 3);
    const near = (list, make) => { list.sort((a, b) => Math.abs(a.d) - Math.abs(b.d)); return list.slice(0, 2).map(make); };
    if(keep !== 'ring'){
      const L = []; for(let d = -14; d <= 14; d++) if(d && S + 0 > 0 && good(S, R + d)) L.push({ d, v: R + d });
      opts.push(...near(L, x => ({ gear: 'ring', label: `Ring: ${R} → ${x.v} teeth`, S, R: x.v })));
    }
    if(keep !== 'sun'){
      const L = []; for(let d = -8; d <= 8; d++) if(d && S + d >= 8 && good(S + d, R)) L.push({ d, v: S + d });
      opts.push(...near(L, x => ({ gear: 'sun', label: `Sun: ${S} → ${x.v} teeth`, S: x.v, R })));
    }
    const L2 = []; for(let d = -6; d <= 6; d++) for(let e = -10; e <= 10; e++){ if((d || e) && Math.abs(d) + Math.abs(e) <= 10 && S + d >= 8 && good(S + d, R + e)) L2.push({ d: Math.abs(d) + Math.abs(e), s: S + d, r: R + e }); }
    if(!keep) opts.push(...near(L2, x => ({ gear: 'both', label: `Sun ${S} → ${x.s} and ring ${R} → ${x.r}`, S: x.s, R: x.r })));
    return opts;
  },
  ratios(S, R){
    const f = v => U.fmt(v, 3);
    return [
      ['Carrier held still (what the 3D view simulates)', `sun → ring  ${f(R / S)} : 1, turning the opposite way`],
      ['Ring held still, sun in, carrier out', `${f(1 + R / S)} : 1 reduction, same direction`],
      ['Sun held still, ring in, carrier out', `${f(1 + S / R)} : 1 reduction, same direction`]
    ];
  },

  /* ------------------------------------------------------------ the dialog */
  open(){
    W.st = { step: 'start', start: 'sun', S: 18, R: 54, N: 3, m: 2, pa: 20, thick: 10, sunBore: 8, planetBore: 5, process: 'machined', pick: null, ringBy: 'ratio', ratio: 3, ringOD: 0, note: '' };
    W.draw();
  },
  draw(){
    const st = W.st, UI = GW.UI;
    const head = `<div class="mhead"><h3>Make a planetary gearbox</h3><button class="iconbtn" id="wzClose" aria-label="Close">${ICON_X}</button></div>`;
    const steps = ['start', 'first', 'rest', 'build'], idx = steps.indexOf(st.step);
    const dots = '<div class="wz-dots">' + steps.map((s, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('') + '</div>';
    let body = '';
    if(st.step === 'start') body = W.stepStart();
    else if(st.step === 'first') body = W.stepFirst();
    else if(st.step === 'rest') body = W.stepRest();
    else body = W.stepBuild();
    UI.openModal(head + '<div class="mbody wz">' + dots + body + '</div>');
    $('wzClose').onclick = UI.closeModal;
    W.wire();
  },
  radio(name, val, label, sub, checked){ return `<label class="opt"><input type="radio" name="${name}" value="${val}" ${checked ? 'checked' : ''}><span><b>${label}</b>${sub ? '<small>' + sub + '</small>' : ''}</span></label>`; },
  num(id, label, val, step, hint, unit){ return `<div class="mrow"><label for="${id}">${label}</label><div class="wz-in"><input type="number" id="${id}" value="${val}" step="${step}" inputmode="decimal">${unit ? '<span>' + unit + '</span>' : ''}</div></div>${hint ? '<div class="mhint wz-h">' + hint + '</div>' : ''}`; },

  stepStart(){
    const st = W.st;
    return `<h4>Where do you want to start?</h4>
      <div class="opts col">
        ${W.radio('start', 'sun', 'The center gear (the sun)', 'I know the gear that goes in the middle. Tell me what the outside and the planets should be.', st.start === 'sun')}
        ${W.radio('start', 'ring', 'The outside gear (the ring)', 'I know how big the outside is. Tell me the sun and the planets.', st.start === 'ring')}
        ${W.radio('start', 'ratio', 'The speed ratio I want', 'I know the reduction. Pick sizes that give it.', st.start === 'ratio')}
      </div>
      <div class="mhint">A planetary set has a sun in the middle, planets around it, and a ring with teeth on the inside around them all. It is built here with the carrier held still, so the planets spin in place.</div>
      <div class="mfoot"><button class="go" id="wzNext">Next</button></div>`;
  },
  stepFirst(){
    const st = W.st, Un = GW.Units;
    const sunQs = `${W.num('wzS', 'Sun teeth', st.S, 1, 'Fewer than 17 teeth will undercut; a profile shift is added for you. 12 to 24 is common.')}
      ${W.num('wzBoreS', 'Sun bore Ø', U.fmt(Un.d(st.sunBore), 4), Un.inch ? 0.001 : 0.01, '', Un.unit())}`;
    const ringQs = `${W.num('wzR', 'Ring teeth', st.R, 1, 'The ring has more teeth than the sun: ring = sun + 2 × planet.')}`;
    const common = `${W.num('wzM', 'Module', U.fmt(st.m, 3), 0.05, 'Tooth size in millimeters. Every gear in the set shares it. 1 to 3 suits most small gearboxes.', 'mm')}
      ${W.num('wzPA', 'Pressure angle', st.pa, 0.5, '20° is the standard.', '°')}
      ${W.num('wzT', 'Face width', U.fmt(Un.d(st.thick), 4), Un.inch ? 0.001 : 0.01, 'How thick every gear is.', Un.unit())}
      <div class="mrow"><label for="wzProc">Made by</label><select id="wzProc">${Object.keys(GW.Tol.PROCESSES).map(k => `<option value="${k}" ${st.process === k ? 'selected' : ''}>${esc(GW.Tol.PROCESSES[k].label)}</option>`).join('')}</select></div>`;
    let first = '';
    if(st.start === 'sun') first = '<h4>The center gear</h4>' + sunQs + '<h4>The outside gear: how should I size it?</h4>' + `<div class="opts col">${W.radio('ringBy', 'ratio', 'By the ratio I want', 'Sun to ring, with the carrier still. 3 means the ring has three times the sun\'s teeth.', st.ringBy === 'ratio')}${W.radio('ringBy', 'teeth', 'By its number of teeth', '', st.ringBy === 'teeth')}${W.radio('ringBy', 'od', 'By its outside diameter', 'The largest the whole gearbox may be.', st.ringBy === 'od')}</div>`
      + `<div id="wzRingBy">${W.ringBy()}</div>`;
    else if(st.start === 'ring') first = '<h4>The outside gear</h4>' + ringQs + '<h4>The center gear: how should I size it?</h4>' + `<div class="opts col">${W.radio('ringBy', 'ratio', 'By the ratio I want', 'Sun to ring, with the carrier still.', st.ringBy === 'ratio')}${W.radio('ringBy', 'teeth', 'By its number of teeth', '', st.ringBy === 'teeth')}</div><div id="wzRingBy">${W.ringBy()}</div>`;
    else first = `<h4>The ratio</h4>${W.num('wzRatio', 'Ratio', st.ratio, 0.1, 'Ring teeth ÷ sun teeth. 3 to 8 is typical for one stage.')}${W.num('wzS', 'Sun teeth', st.S, 1, 'Pick the sun and I will find the ring.')}`;
    return first + '<h4>All the gears</h4>' + common + `<div class="mfoot"><button id="wzBack">Back</button><button class="go" id="wzNext">Next: recommendations</button></div>`;
  },
  ringBy(){
    const st = W.st;
    if(st.start === 'ring') return st.ringBy === 'ratio' ? W.num('wzRatio', 'Ratio', st.ratio, 0.1, 'Ring teeth ÷ sun teeth.') : W.num('wzS', 'Sun teeth', st.S, 1, '');
    return st.ringBy === 'ratio' ? W.num('wzRatio', 'Ratio', st.ratio, 0.1, '') : st.ringBy === 'teeth' ? W.num('wzR', 'Ring teeth', st.R, 1, '') : W.num('wzOD', 'Outside Ø limit', U.fmt(GW.Units.d(st.ringOD || 120), 4), GW.Units.inch ? 0.01 : 1, 'The ring is its tip circle plus a rim; I choose the biggest ring that stays inside this.', GW.Units.unit());
  },
  /* read what was typed into the current step */
  read(){
    const st = W.st, g = id => { const e = $(id); return e ? e.value : null; }, Un = GW.Units, n = id => { const v = parseFloat(g(id)); return isFinite(v) ? v : null; };
    const pick = name => { const e = document.querySelector(`#modal input[name=${name}]:checked`); return e ? e.value : null; };
    if(st.step === 'start'){ st.start = pick('start') || st.start; return; }
    if(st.step === 'first'){
      if(pick('ringBy')) st.ringBy = pick('ringBy');
      if(n('wzS') != null) st.S = Math.round(n('wzS'));
      if(n('wzR') != null) st.R = Math.round(n('wzR'));
      if(n('wzRatio') != null) st.ratio = n('wzRatio');
      if(n('wzOD') != null) st.ringOD = Un.fromD(n('wzOD'));
      if(n('wzM') != null) st.m = Math.max(0.2, n('wzM'));
      if(n('wzPA') != null) st.pa = n('wzPA');
      if(n('wzT') != null) st.thick = Math.max(0.5, Un.fromD(n('wzT')));
      if(n('wzBoreS') != null) st.sunBore = Math.max(0, Un.fromD(n('wzBoreS')));
      if(g('wzProc')) st.process = g('wzProc');
    }
  },
  /* from what was asked, the first guess at S and R */
  derive(){
    const st = W.st; let S = st.S, R = st.R;
    if(st.start === 'sun'){
      if(st.ringBy === 'ratio') R = Math.round(S * st.ratio);
      else if(st.ringBy === 'od'){ const rim = Math.max(4, 2 * st.m); let best = R; for(let r = 300; r > S; r--){ if((r * st.m / 2 + st.m * 1.25 + rim) * 2 <= st.ringOD){ best = r; break; } } R = best; }
    } else if(st.start === 'ring'){
      if(st.ringBy === 'ratio') S = Math.max(6, Math.round(R / st.ratio));
    } else R = Math.round(S * st.ratio);
    st.S = S; st.R = R;
  },

  stepRest(){
    const st = W.st, r = W.solve(st.S, st.R, st.m), keep = st.start === 'sun' ? 'sun' : st.start === 'ring' ? 'ring' : null;
    let h = `<h4>What I recommend</h4><div class="wz-sum"><div><b>${st.S}</b><small>sun teeth</small></div><div><b>${r.ok ? r.P : '?'}</b><small>planet teeth</small></div><div><b>${st.R}</b><small>ring teeth</small></div></div>`;
    if(!r.ok){
      h += `<div class="wz-bad"><b>These do not fit together</b><ul>${r.why.map(w => '<li>' + esc(w) + '</li>').join('')}</ul></div>`;
      const sg = W.suggest(st.S, st.R, st.m, keep);
      h += `<h4>Which gear should I adjust?</h4><div class="opts col">`;
      sg.forEach((o, i) => { const rr = W.solve(o.S, o.R, st.m); h += W.radio('fix', i, esc(o.label), `${rr.P}-tooth planets · ${rr.validN.filter(n => n >= 3).join(', ')} planets fit · ratio ${U.fmt(o.R / o.S, 3)} : 1`, i === 0); });
      h += `</div>`;
      if(!sg.length) h += '<div class="mhint">I could not find a nearby set that works. Go back and try a different sun or ring size.</div>';
      W.sg = sg;
      return h + `<div class="mfoot"><button id="wzBack">Back</button><button class="go" id="wzApply" ${sg.length ? '' : 'disabled'}>Use this and continue</button></div>`;
    }
    const nOpts = r.validN.filter(n => n >= 3);
    if(!nOpts.includes(st.N)) st.N = nOpts[0] || r.validN[r.validN.length - 1];
    h += `<div class="mhint wz-h">The planets each have <b>${r.P}</b> teeth ((${st.R} − ${st.S}) ÷ 2). They sit evenly round the sun when the planet count divides ${st.S} + ${st.R} = ${st.S + st.R}.</div>`;
    h += `<h4>How many planets?</h4><div class="opts">${r.validN.map(n => W.radio('nplan', n, n + ' planets', n === nOpts[nOpts.length - 1] ? 'the most that fit: strongest' : n === 3 ? 'the usual' : '', n === st.N)).join('')}</div>`;
    const a = st.m * (st.S + r.P) / 2, ringTip = st.m * (st.R - 2 * 1) / 2;
    h += `<h4>What you get</h4><div class="wz-tab">${W.ratios(st.S, st.R).map(([a1, b1]) => `<div><span>${esc(a1)}</span><b>${esc(b1)}</b></div>`).join('')}
      <div><span>Planet center distance from the sun</span><b>${esc(GW.Units.pair(a))}</b></div>
      <div><span>Ring outside Ø (approx.)</span><b>${esc(GW.Units.pair((st.R * st.m / 2 + st.m * 1.25 + Math.max(4, 2 * st.m)) * 2))}</b></div>
      <div><span>Planet Ø (tip)</span><b>${esc(GW.Units.pair((r.P + 2) * st.m))}</b></div></div>`;
    if(st.S < 17) h += `<div class="mhint wz-h">The sun has ${st.S} teeth, so its roots would be undercut. The set is built with a profile shift that fixes it.</div>`;
    return h + `<div class="mfoot"><button id="wzBack">Back</button><button class="go" id="wzNext">Next: planet details</button></div>`;
  },
  stepBuild(){
    const st = W.st, Un = GW.Units, r = W.solve(st.S, st.R, st.m);
    return `<h4>Planets</h4>${W.num('wzBoreP', 'Planet bore Ø', U.fmt(Un.d(st.planetBore), 4), Un.inch ? 0.001 : 0.01, 'Each planet turns on a pin this size.', Un.unit())}
      <div class="wz-sum"><div><b>${st.S}</b><small>sun</small></div><div><b>${st.N} × ${r.P}</b><small>planets</small></div><div><b>${st.R}</b><small>ring</small></div></div>
      <div class="mhint">Everything meshes like the Planetary sample: the sun drives the planets and they walk round inside the ring. Each pair is checked, and the settings the checker asks for are applied.</div>
      <div class="mfoot"><button id="wzBack">Back</button><button class="go" id="wzBuild">Build the gearbox</button></div>`;
  },

  wire(){
    const st = W.st, go = step => { W.read(); st.step = step; W.draw(); };
    const next = $('wzNext'), back = $('wzBack');
    const order = ['start', 'first', 'rest', 'build'];
    if(next) next.onclick = () => {
      W.read();
      if(st.step === 'first'){ W.derive(); }
      if(st.step === 'rest'){ const e = document.querySelector('#modal input[name=nplan]:checked'); if(e) st.N = +e.value; }
      st.step = order[order.indexOf(st.step) + 1]; W.draw();
    };
    if(back) back.onclick = () => { W.read(); st.step = order[Math.max(0, order.indexOf(st.step) - 1)]; W.draw(); };
    const ap = $('wzApply');
    if(ap) ap.onclick = () => { const e = document.querySelector('#modal input[name=fix]:checked'), o = W.sg[e ? +e.value : 0]; if(!o) return; st.S = o.S; st.R = o.R; W.draw(); };
    document.querySelectorAll('#modal input[name=ringBy]').forEach(i => i.onchange = () => { W.read(); $('wzRingBy').innerHTML = W.ringBy(); });
    const b = $('wzBuild'); if(b) b.onclick = () => { W.read(); const bp = parseFloat(($('wzBoreP') || {}).value); if(isFinite(bp)) st.planetBore = Math.max(0, GW.Units.fromD(bp)); W.build(); };
  },

  /* ------------------------------------------------------------ build it on the table */
  build(){
    const st = W.st, r = W.solve(st.S, st.R, st.m), G = GW.Gears, UI = GW.UI;
    if(!r.ok){ UI.toast('Those sizes do not fit together yet.', 4000, 'bad'); return; }
    UI.closeModal();
    const make = () => {
      let maxX = -Infinity; G.list.forEach(g => { g.mesh.updateMatrixWorld(true); maxX = Math.max(maxX, g.rt.pos.x + G.reach(g)); });
      const ringR = st.R * st.m / 2 + st.m * 1.25 + Math.max(4, 2 * st.m), x = isFinite(maxX) ? maxX + ringR + 20 : 0;
      G._stagger = { n: 0, step: 90 };
      let made = [];
      try {
        const base = { m: st.m, pa: st.pa, thick: st.thick, tolerance: st.process };
        const sun = G.add('spur', Object.assign({}, base, { name: 'Sun', z: st.S, px: x, py: 0, bore: st.sunBore, finish: 'brass' }));
        const planets = [];
        for(let k = 0; k < st.N; k++){
          const p = G.add('spur', Object.assign({}, base, { name: 'Planet ' + (k + 1), z: r.P, bore: st.planetBore, finish: 'steel' }));
          GW.meshAuto(p, sun);
          const a = (360 * k / st.N + 180) % 360 - 180; G.set(p, 'meshAngle', +a.toFixed(3));
          planets.push(p);
        }
        const ring = G.add('internal', Object.assign({}, base, { name: 'Ring', z: st.R, rimW: Math.max(4, 2 * st.m), bore: 0, finish: 'aluminum' }));
        GW.meshAuto(ring, planets[0]); G.set(ring, 'meshAngle', 0);
        made = [sun].concat(planets, [ring]);
      } finally { G._stagger = null; }
      GW.Scene.fit(false, G.list);
      UI.selId = null; UI.select(made[0].id);
      UI.toast(`Built a planetary gearbox: ${st.S}-tooth sun, ${st.N} planets of ${r.P} teeth, ${st.R}-tooth ring.`, 4200);
      UI.mark({ list: 1, fb: 1 });
      GW.History.busy = false; GW.History.touch();
    };
    GW.History.busy = true; make();
  }
};
})();
