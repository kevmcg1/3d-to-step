"use strict";
/* Gear Maker — can these two gears mesh, and what does each need from the other?
   check(A, B) looks at B as "the gear being attached" and A as "the partner".
   It returns every problem with the exact values that would cure it, as
   changes to B ("optB") or, where that makes sense, to A ("optA"). */
(function(){
const U = GW.U, C = GW.Calc, fmt = U.fmt;

/* which type can sit on the other end of which */
const PARTNERS = {
  spur:        ['spur', 'internal', 'rack', 'crown'],
  helical:     ['helical', 'internal', 'rack'],
  herring:     ['herring'],
  internal:    ['spur', 'helical'],
  rack:        ['spur', 'helical'],
  bevel:       ['bevel'],
  spiralbevel: ['spiralbevel'],
  crown:       ['spur'],
  worm:        ['wormwheel'],
  wormwheel:   ['worm'],
  sprocket:    ['sprocket'],
  pulley:      ['pulley'],
  cycloid:     ['cycloid'],
  elliptical:  ['elliptical'],
  spline:      ['splinehub'],
  splinehub:   ['spline']
};
const KIND = {};
const reg = (kind, a, b) => { KIND[a + '|' + b] = kind; KIND[b + '|' + a] = kind; };
reg('ext', 'spur', 'spur'); reg('ext', 'helical', 'helical'); reg('ext', 'herring', 'herring');
reg('ring', 'internal', 'spur'); reg('ring', 'internal', 'helical');
reg('rack', 'rack', 'spur'); reg('rack', 'rack', 'helical');
reg('bevel', 'bevel', 'bevel'); reg('bevel', 'spiralbevel', 'spiralbevel');
reg('crown', 'crown', 'spur');
reg('worm', 'worm', 'wormwheel');
reg('chain', 'sprocket', 'sprocket'); reg('belt', 'pulley', 'pulley');
reg('cyc', 'cycloid', 'cycloid'); reg('ell', 'elliptical', 'elliptical');
reg('spline', 'spline', 'splinehub');

const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-3 : t) * Math.max(1, Math.abs(a), Math.abs(b));
const LABEL = k => GW.Types.TYPES[k] ? GW.Types.TYPES[k].label : k;

const Compat = GW.Compat = {
  PARTNERS,
  kindOf(ta, tb){ return KIND[ta + '|' + tb] || null; },
  partnersOf(type){ return PARTNERS[type] || []; },
  label: LABEL,

  /* -------------------------------------------------------------------- */
  check(A, B, link){
    link = link || {};
    const out = { supported: false, kind: null, ok: false, issues: [], info: [], allowed: PARTNERS[A.type] || [] };
    const issues = out.issues;
    const add = (level, id, text, optB, optA) => issues.push({ level, id, text, optB: optB || null, optA: optA || null });
    const need = (v, u) => `<span class="val">${v}${u || ''}</span>`;
    const info = (k, v) => out.info.push([k, v]);

    if(link.kind === 'shaft'){
      out.supported = true; out.kind = 'shaft';
      if(A.type === 'rack' || B.type === 'rack') add('err', 'type', 'A rack slides instead of turning, so it cannot share a rotating shaft.');
      else {
        if(A.bore > 0 && B.bore > 0 && !near(A.bore, B.bore, 0.01)) add('warn', 'bore', `Bore is ${fmt(B.bore)} mm but ${A.name || 'the partner'} has ${fmt(A.bore)} mm. One shaft normally means one bore.`, { B: { bore: A.bore } }, { A: { bore: B.bore } });
        info('Speed', 'same speed, same direction (keyed to one shaft)');
      }
      out.ok = !issues.some(i => i.level === 'err');
      return out;
    }

    const kind = Compat.kindOf(A.type, B.type);
    if(!kind){
      const wantB = PARTNERS[A.type] || [], wantA = PARTNERS[B.type] || [];
      add('err', 'type',
        `<b>type</b> — a ${LABEL(A.type)} gear can only mesh with: ${need(wantB.map(LABEL).join(', '))}`,
        wantB.length ? { B: { type: wantB[0] } } : null,
        wantA.length ? { A: { type: wantA[0] } } : null);
      return out;
    }
    out.supported = true; out.kind = kind;

    const mismatch = (key, label, unit, opts) => {
      opts = opts || {};
      const av = A[key], bv = B[key];
      const tol = opts.tol == null ? 1e-3 : opts.tol;
      if(near(av, bv, tol)) return false;
      add('err', key, `<b>${label}</b> — is ${fmt(bv)}${unit || ''}, must be ${need('exactly ' + fmt(av), unit)}`, { B: { [key]: av } }, { A: { [key]: bv } });
      return true;
    };

    const ex = kind;
    /* ---------------- involute, parallel shafts ---------------- */
    if(kind === 'ext' || kind === 'ring' || kind === 'rack'){
      mismatch('m', 'module', ' mm');
      mismatch('pa', 'pressure angle', '°', { tol: 1e-4 });
      const ha = C.helixOf(A), hb = C.helixOf(B);
      if(kind === 'ext'){
        if(A.type !== 'spur'){
          const want = -ha;
          if(Math.abs(hb - want) > 0.01)
            add('err', 'helix', `<b>helix angle</b> — is ${fmt(hb)}°, must be ${need('exactly ' + fmt(want), '°')} (opposite hand to ${A.name || 'the partner'})`, { B: { helix: want } }, { A: { helix: -hb } });
        }
      } else {
        // ring + pinion share a hand; a rack leans the same way as its pinion
        const pin = (A.type === 'internal' || A.type === 'rack') ? B : A;
        const other = pin === A ? B : A;
        const hp = C.helixOf(pin), ho = C.helixOf(other);
        if(Math.abs(hp - ho) > 0.01){
          const fixPinion = pin.type === 'spur' ? { type: 'helical', helix: ho } : { helix: ho };
          const fixOther = other.type === 'internal' || other.type === 'rack' ? { helix: hp } : {};
          const isB = pin === B;
          add('err', 'helix', `<b>helix angle</b> — ${pin.name || 'pinion'} is ${fmt(hp)}°, must be ${need('exactly ' + fmt(ho), '°')} to match the ${other.type === 'rack' ? 'rack' : 'ring'}`,
            isB ? { B: fixPinion } : { B: fixOther }, isB ? { A: fixOther } : { A: fixPinion });
        }
      }

      if(kind === 'ext'){
        const cd = C.centerDistance(A, B, false);
        info('Ratio', `${fmt(A.z)}:${fmt(B.z)}  (output ${fmt(A.z / B.z, 3)}× input speed, reversed)`);
        info('Center distance', `${fmt(cd.a + (B.meshOffset || 0), 3)} mm`);
        Compat.contactAndClearance(A, B, cd, issues, info, need);
        Compat.undercut(A, issues, need); Compat.undercut(B, issues, need);
        if(ha && A.type === 'helical') info('Axial thrust', 'yes — each gear pushes sideways; use thrust bearings or herringbone');
      } else if(kind === 'ring'){
        const ring = (A.type === 'internal') ? A : B, pin = ring === A ? B : A;
        const diff = ring.z - pin.z;
        const isB = pin === B;
        if(diff < 8){
          add('err', 'z', `<b>teeth</b> — ring has ${ring.z}, pinion ${pin.z}: the pinion must be smaller. Need ${need('at least 8 fewer pinion teeth')} (pinion ${need('min 6 / max ' + Math.max(6, ring.z - 8))}, or ring ${need('min ' + (pin.z + 8) + ' / max 300')})`,
            isB ? { B: { z: Math.max(6, ring.z - 8) } } : { B: { z: pin.z + 8 } },
            isB ? { A: { z: pin.z + 8 } } : { A: { z: Math.max(6, ring.z - 8) } });
        } else if(diff < 10) add('warn', 'z', `Ring and pinion differ by only ${diff} teeth — tips may touch (involute interference). 10 or more is safer.`);
        const cd = C.centerDistance(A, B, true);
        info('Ratio', `${fmt(ring.z)}:${fmt(pin.z)}  (same direction, ${fmt(pin.z / ring.z, 3)}× speed ratio)`);
        info('Center distance', `${fmt(cd.a + (B.meshOffset || 0), 3)} mm`);
        Compat.undercut(pin, issues, need);
      } else {
        const pin = A.type === 'rack' ? B : A, rack = pin === A ? B : A;
        info('Travel per turn', `${fmt(Math.PI * pin.m * pin.z, 2)} mm (pinion Ø${fmt(pin.m * pin.z, 2)} mm)`);
        info('Rack length', `${fmt(rack.z * Math.PI * rack.m, 1)} mm (${rack.z} teeth)`);
        Compat.undercut(pin, issues, need);
        if(rack.z < 3) add('warn', 'z', 'A rack with fewer than 3 teeth barely shows the motion.');
      }
      if(A.backlash + B.backlash < -1e-6) add('warn', 'backlash', 'Negative backlash — the teeth will bind.');
      if(A.thick && B.thick){
        const ov = Math.min(A.thick, B.thick);
        info('Face contact', `${fmt(ov)} mm of the ${fmt(Math.max(A.thick, B.thick))} mm width`);
      }
    }

    /* ---------------- bevel ---------------- */
    else if(kind === 'bevel'){
      mismatch('m', 'module', ' mm');
      mismatch('pa', 'pressure angle', '°', { tol: 1e-4 });
      const sigma = U.rad(B.shaftAngle || 90);
      const dA = Math.atan2(Math.sin(sigma), B.z / A.z + Math.cos(sigma)), dB = sigma - dA;
      const dAd = U.deg(dA), dBd = U.deg(dB);
      if(Math.abs(A.cone - dAd) > 0.05 || Math.abs(B.cone - dBd) > 0.05){
        add('err', 'cone',
          `<b>cone angles</b> — are ${fmt(A.cone)}° / ${fmt(B.cone)}°, must be ${need(fmt(dAd, 2) + '° / ' + fmt(dBd, 2) + '°')} (this follows from ${A.z}:${B.z} teeth on ${fmt(B.shaftAngle)}° shafts)`,
          { A: { cone: dAd }, B: { cone: dBd } }, { A: { cone: dAd }, B: { cone: dBd } });
      }
      if(A.type === 'spiralbevel' && Math.abs(A.spiral + B.spiral) > 0.01)
        add('err', 'spiral', `<b>spiral angle</b> — is ${fmt(B.spiral)}°, must be ${need('exactly ' + fmt(-A.spiral), '°')} (opposite hand to the partner)`, { B: { spiral: -A.spiral } }, { A: { spiral: -B.spiral } });
      const cd = (A.m * A.z / 2) / Math.sin(dA);
      if(A.thick > cd / 3 + 1e-6 || B.thick > cd / 3 + 1e-6)
        add('warn', 'thick', `Face width is more than a third of the cone distance (${fmt(cd, 1)} mm). The small ends get thin and weak.`);
      info('Ratio', `${fmt(A.z)}:${fmt(B.z)}  on ${fmt(B.shaftAngle)}° shafts`);
      info('Cone distance', `${fmt(cd, 2)} mm`);
      if(A.z === B.z && Math.abs(B.shaftAngle - 90) < 0.01) info('Type', 'mitre gears (1:1 at 90°)');
    }

    /* ---------------- crown + spur pinion ---------------- */
    else if(kind === 'crown'){
      mismatch('m', 'module', ' mm');
      mismatch('pa', 'pressure angle', '°', { tol: 1e-4 });
      const crown = A.type === 'crown' ? A : B, pin = crown === A ? B : A;
      if(crown.z < pin.z * 1.5) add('warn', 'z', `A crown gear works best with at least 1.5× the pinion's teeth (${Math.ceil(pin.z * 1.5)}).`, crown === B ? { B: { z: Math.ceil(pin.z * 1.5) } } : { A: { z: Math.ceil(pin.z * 1.5) } });
      if(pin.thick > crown.faceW + 0.01) add('warn', 'thick', `Pinion is ${fmt(pin.thick)} mm wide but the crown's teeth are only ${fmt(crown.faceW)} mm long.`);
      info('Ratio', `${fmt(crown.z)}:${fmt(pin.z)}  — shafts cross at 90°`);
      Compat.undercut(pin, issues, need);
    }

    /* ---------------- worm drive ---------------- */
    else if(kind === 'worm'){
      mismatch('m', 'module', ' mm');
      mismatch('pa', 'pressure angle', '°', { tol: 1e-4 });
      const worm = A.type === 'worm' ? A : B, wheel = worm === A ? B : A;
      const gam = Math.atan(worm.starts * worm.m / worm.wormDia), gd = U.deg(gam);
      const hand = worm.hand === 'left' ? -1 : 1;
      const wantBeta = hand * gd;
      const wormIsB = worm === B;
      if(Math.abs(wheel.helix - wantBeta) > 0.05){
        const wantDia = Math.abs(wheel.helix) > 0.2 ? worm.starts * worm.m / Math.tan(U.rad(Math.abs(wheel.helix))) : null;
        const wantHand = wheel.helix < 0 ? 'left' : 'right';
        const fixWheel = { helix: wantBeta };
        const fixWorm = wantDia ? { wormDia: wantDia, hand: wantHand } : null;
        add('err', 'helix', `<b>helix / lead angle</b> — wheel helix is ${fmt(wheel.helix)}°, must be ${need((hand < 0 ? '−' : '') + fmt(gd, 2), '°')} to equal the worm's lead angle (${worm.starts} start${worm.starts > 1 ? 's' : ''}, Ø${fmt(worm.wormDia)}, ${worm.hand} hand)`,
          wormIsB ? (fixWorm ? { B: fixWorm } : null) : { B: fixWheel }, wormIsB ? { A: fixWheel } : (fixWorm ? { A: fixWorm } : null));
      }
      if(wheel.z < 17 / worm.starts) add('warn', 'z', `Wheel has few teeth for ${worm.starts} start(s); expect undercut. About ${Math.ceil(17 / worm.starts)}+ is usual.`);
      const ratio = wheel.z / worm.starts;
      info('Ratio', `${fmt(ratio, 2)}:1  (${worm.starts} start${worm.starts > 1 ? 's' : ''} → ${wheel.z} teeth)`);
      info('Center distance', `${fmt((worm.wormDia + wheel.m * wheel.z) / 2 + (B.meshOffset || 0), 3)} mm`);
      info('Lead angle', `${fmt(gd, 2)}°  ${gd < 5 ? '— likely self-locking' : gd > 15 ? '— will back-drive' : ''}`);
    }

    /* ---------------- chain ---------------- */
    else if(kind === 'chain'){
      mismatch('chainPitch', 'chain pitch', ' mm', { tol: 1e-3 });
      mismatch('rollerDia', 'roller diameter', ' mm', { tol: 2e-2 });
      if(A.z < 9 || B.z < 9) add('warn', 'z', 'Sprockets under 9 teeth make a jerky, noisy chain drive.');
      const rA = C.pitchR(A), rB = C.pitchR(B), d = Math.max(rA + rB + B.meshOffset, (rA + rB) * 0.6);
      Compat.driveClearance(A, B, rA, rB, d, issues, need);
      const len = C.loopLength(rA, rB, d), links = len / A.chainPitch;
      info('Ratio', `${fmt(A.z)}:${fmt(B.z)}  (same direction)`);
      info('Chain length', `${fmt(links, 1)} links  ≈ ${Math.round(links)} (${Math.round(links) % 2 ? 'odd — needs an offset link' : 'even — good'})`);
      info('Center distance', `${fmt(d, 2)} mm`);
    }

    /* ---------------- timing belt ---------------- */
    else if(kind === 'belt'){
      mismatch('beltPitch', 'belt pitch', ' mm', { tol: 1e-3 });
      ['grooveDepth', 'grooveWidth'].forEach(k => {
        if(!near(A[k], B[k], 0.12)) add('warn', k, `Tooth profile differs (${k === 'grooveDepth' ? 'groove depth' : 'groove width'} ${fmt(B[k])} vs ${fmt(A[k])} mm). Both pulleys should be the same belt profile.`, { B: { [k]: A[k] } }, { A: { [k]: B[k] } });
      });
      if(A.z < 10 || B.z < 10) add('warn', 'z', 'Pulleys under 10 teeth wear belts quickly.');
      const rA = C.pitchR(A), rB = C.pitchR(B), d = Math.max(rA + rB + B.meshOffset, (rA + rB) * 0.6);
      Compat.driveClearance(A, B, rA, rB, d, issues, need);
      const len = C.loopLength(rA, rB, d), teeth = len / A.beltPitch;
      info('Ratio', `${fmt(A.z)}:${fmt(B.z)}  (same direction)`);
      info('Belt length', `${fmt(teeth, 1)} teeth ≈ ${Math.round(teeth)} × ${fmt(A.beltPitch)} mm = ${fmt(Math.round(teeth) * A.beltPitch, 1)} mm`);
      info('Center distance', `${fmt(d, 2)} mm`);
    }

    /* ---------------- cycloidal ---------------- */
    else if(kind === 'cyc'){
      mismatch('m', 'module', ' mm');
      mismatch('rollR', 'rolling circle radius', ' mm', { tol: 2e-3 });
      if(A.z < 8 || B.z < 8) add('warn', 'z', 'Cycloidal gears under 8 teeth are not practical.');
      info('Ratio', `${fmt(A.z)}:${fmt(B.z)}`);
      info('Center distance', `${fmt(A.m * (A.z + B.z) / 2 + (B.meshOffset || 0), 3)} mm`);
    }

    /* ---------------- elliptical ---------------- */
    else if(kind === 'ell'){
      mismatch('majorA', 'semi-major axis', ' mm');
      mismatch('ecc', 'eccentricity', '');
      mismatch('z', 'teeth', '', { tol: 1e-6 });
      const want = U.mod(A.z / 2 - A.phase - 0.5, 1);
      const d = Math.min(Math.abs(B.phase - want), 1 - Math.abs(B.phase - want));
      if(d > 0.01) add('err', 'phase', `<b>tooth phase</b> — is ${fmt(B.phase)}, must be ${need('exactly ' + fmt(want, 3), ' pitch')} so teeth meet gaps`, { B: { phase: want } }, { A: { phase: U.mod(B.z / 2 - B.phase - 0.5, 1) } });
      info('Note', 'non-circular teeth are an approximation: allow 0.3 mm+ backlash and keep eccentricity under 0.3');
      info('Center distance', `${fmt(2 * A.majorA + (B.meshOffset || 0), 2)} mm (twice the semi-major axis)`);
      info('Speed', `swings between ${fmt((1 - A.ecc) / (1 + A.ecc), 2)}× and ${fmt((1 + A.ecc) / (1 - A.ecc), 2)}× each turn`);
    }

    /* ---------------- spline ---------------- */
    else if(kind === 'spline'){
      mismatch('m', 'module', ' mm');
      mismatch('z', 'teeth', '', { tol: 1e-6 });
      mismatch('pa', 'pressure angle', '°', { tol: 1e-4 });
      const hub = A.type === 'splinehub' ? A : B, shaft = hub === A ? B : A;
      // the shaft's teeth must fit between the hub's: tip clear of the hub root, and root clear of the hub tip (in modules)
      const rootRoom = (hub.hf + hub.x) - (shaft.ha + shaft.x), tipRoom = (shaft.hf - shaft.x) - (hub.ha - hub.x);
      if(rootRoom < -1e-6 || tipRoom < -1e-6){
        const fixHub = { ha: Math.max(0.3, Math.round(((shaft.hf - shaft.x + hub.x) - 0.05) * 100) / 100), hf: Math.max(0.5, Math.round(((shaft.ha + shaft.x - hub.x) + 0.05) * 100) / 100) };
        const fixShaft = { ha: Math.max(0.3, Math.round(((hub.hf + hub.x - shaft.x) - 0.05) * 100) / 100), hf: Math.max(0.5, Math.round(((hub.ha - hub.x + shaft.x) + 0.05) * 100) / 100) };
        add('err', 'clearance', `<b>tooth depth</b> — the teeth collide: hub addendum ${fmt(hub.ha)} / dedendum ${fmt(hub.hf)} must clear the shaft's ${fmt(shaft.ha)} / ${fmt(shaft.hf)}. Set the hub to ${need('addendum ' + fixHub.ha + ' / dedendum ' + fixHub.hf)}`,
          hub === B ? { B: fixHub } : { B: fixShaft }, hub === B ? { A: fixShaft } : { A: fixHub });
      }
      info('Fit', 'sliding fit: the shaft turns the hub 1:1 and can slide along its axis');
      if(hub.backlash < 0.01 && (A.backlash + B.backlash) < 0.01) add('warn', 'backlash', 'Zero clearance — printed or machined parts will not slide. Add 0.1 mm or more.');
    }

    out.ok = !issues.some(i => i.level === 'err');
    return out;
  },

  /* two sprockets or pulleys sit in one plane: their outer edges (flanges included) must not touch */
  driveClearance(A, B, rA, rB, d, issues, need){
    const reach = C.outerReach(A) + C.outerReach(B) + 1;
    if(d >= reach - 1e-6) return;
    const extra = Math.ceil((reach - rA - rB) * 10) / 10;
    issues.push({ level: 'err', id: 'clearance', text: `<b>center distance</b> — the outer edges${A.type === 'pulley' ? ' (flanges)' : ''} would touch: they need ${need(U.fmt(reach, 1), ' mm')} between centers but there is ${U.fmt(d, 1)} mm. Set the extra center distance to ${need(U.fmt(extra, 1), ' mm')}`,
      optB: { B: { meshOffset: extra } }, optA: null });
  },

  undercut(g, issues, need){
    if(g.type === 'cycloid' || g.type === 'sprocket' || g.type === 'pulley') return;
    const xmin = C.minShift(g);
    if(xmin > 0.02 && g.x < xmin - 0.01 && g.z < C.minTeeth(g) - 0.01){
      issues.push({ level: 'warn', id: 'undercut', text: `${g.name || 'Gear'} (${g.z} teeth) will have undercut tooth roots. Profile shift ${need('≥ ' + U.fmt(xmin, 2))} fixes it.`, optB: null, optA: null, gearFix: { id: g.id, set: { x: Math.ceil(xmin * 100) / 100 } } });
    }
  },

  contactAndClearance(A, B, cd, issues, info, need){
    const a = cd.a + (B.meshOffset || 0);
    const rA = C.radii(A), rB = C.radii(B);
    const clr1 = a - (rA.ra + rB.rf), clr2 = a - (rB.ra + rA.rf);
    const worst = Math.min(clr1, clr2);
    if(worst < -0.001) issues.push({ level: 'err', id: 'clearance', text: `<b>tip clearance</b> — a tooth tip reaches ${U.fmt(-worst, 2)} mm into the other gear's root. Increase dedendum (now ${A.hf} / ${B.hf}) or reduce addendum.`, optB: null, optA: null });
    else info('Tip clearance', `${U.fmt(worst, 2)} mm`);
    const sinAw = Math.sin(cd.aw);
    const eps = (Math.sqrt(Math.max(rA.ra ** 2 - rA.rb ** 2, 0)) + Math.sqrt(Math.max(rB.ra ** 2 - rB.rb ** 2, 0)) - cd.a * sinAw) / (Math.PI * A.m * Math.cos(U.rad(A.pa)));
    let total = eps;
    if(A.type === 'helical' || A.type === 'herring'){
      const beta = Math.abs(U.rad(A.helix));
      const overlap = Math.min(A.thick, B.thick) * Math.tan(beta) / (Math.PI * A.m);
      total = eps + overlap;
      info('Contact ratio', `${U.fmt(eps, 2)} profile + ${U.fmt(overlap, 2)} overlap = ${U.fmt(total, 2)}`);
    } else info('Contact ratio', U.fmt(eps, 2));
    if(total < 1.1) issues.push({ level: 'warn', id: 'contact', text: `Contact ratio is only ${U.fmt(total, 2)}. The load jumps between teeth; 1.2 or more is smooth.`, optB: null, optA: null });
  },

  /* Merge the fixes for every error into {A:{}, B:{}}.
     side 'B' = change this gear (default), 'A' = change the partner.
     It simulates on copies so a type change can reveal the next problem. */
  plan(A, B, link, side){
    const plan = { A: {}, B: {} };
    let a = Object.assign({}, A), b = Object.assign({}, B);
    for(let pass = 0; pass < 5; pass++){
      const res = Compat.check(a, b, link);
      const errs = res.issues.filter(i => i.level === 'err');
      if(!errs.length) break;
      let progressed = false;
      errs.forEach(i => {
        const opt = side === 'A' ? (i.optA || i.optB) : (i.optB || i.optA);
        if(!opt) return;
        ['A', 'B'].forEach(who => {
          if(!opt[who]) return;
          Object.assign(plan[who], opt[who]);
          const cur = who === 'A' ? a : b;
          const next = opt[who].type ? GW.Types.convert(cur, opt[who].type) : cur;
          const merged = Object.assign({}, next, opt[who]);
          if(who === 'A') a = merged; else b = merged;
          progressed = true;
        });
      });
      if(!progressed) break;
    }
    return plan;
  }
};
})();
