"use strict";
/* Gear Maker — Blueprint. Exact dimensions and drawings of every gear on the table, redrawn every time anything changes.
   The person chooses the origin (world zero, any point, or a face / center of any gear, optionally using that gear's own axes);
   every position and every gap is then measured from it:
     - a layout plan (top / front / side) with the origin, each gear's center and the distances between meshed gears
     - a placement table: center, shaft direction, face width and overall length of each gear from the origin
     - a spacing table: distance between every pair of gears, between their shafts, and the air gap between their faces
     - one dimensioned drawing per gear (front view and half section) with its full table of numbers
   Everything is computed here from the same numbers the 3D view uses (Gears.list, rt poses, build info), so drawing and model cannot disagree.
   Sheets download as SVG (print-friendly, one per gear + the layout) and the numbers as CSV. */
(function(){
const U = GW.U, T = THREE, $ = U.el, make = U.make, esc = U.esc;
const Z = new T.Vector3(0, 0, 1);

const PAL = {
  screen: { paper: '#0f1114', ink: '#e6e8ec', dim: '#5b93ea', hatch: '#3a4f78', fill: '#1a2436', muted: '#8a8f97', center: '#e8c547', grid: '#1d2026', origin: '#ff7a6e' },
  paper:  { paper: '#ffffff', ink: '#15171a', dim: '#1d4ed8', hatch: '#9aa3b2', fill: '#f1f3f6', muted: '#5b6270', center: '#b45309', grid: '#e5e8ee', origin: '#c2261b' }
};

const BP = GW.Blueprint = {
  open: false, only: false, view: 'top', _sig: '', _t: 0,
  origin: { mode: 'world', gearId: null, ref: 'center', axes: false, x: 0, y: 0, z: 0 },      // x, y, z in millimeters (world)

  /* ================================================================== numbers */
  /* the origin as a frame: where it is, how it is turned, and a name for the sheets */
  frame(){
    const o = BP.origin, G = GW.Gears, F = { O: new T.Vector3(), Q: new T.Quaternion(), label: 'World zero (0, 0, 0)' };
    if(o.mode === 'custom'){ F.O.set(o.x, o.y, o.z); F.label = 'Custom point'; }
    else if(o.mode === 'gear'){
      const g = G.get(o.gearId);
      if(g){
        const e = BP.extent(g), k = BP.axis(g);
        F.O.copy(g.rt.pos);
        if(o.ref === 'front') F.O.addScaledVector(k, e.z1); else if(o.ref === 'back') F.O.addScaledVector(k, e.z0);
        if(o.axes) F.Q.copy(g.rt.quat);
        F.label = g.name + (o.ref === 'front' ? ' · front face' : o.ref === 'back' ? ' · back face' : ' · center') + (o.axes ? ' · its axes' : '');
      } else o.mode = 'world';
    }
    F.inv = F.Q.clone().invert();
    return F;
  },
  rel(p, F){ return p.clone().sub(F.O).applyQuaternion(F.inv); },
  dir(v, F){ return v.clone().applyQuaternion(F.inv); },
  axis: g => Z.clone().applyQuaternion(g.rt.quat),

  /* the shaft-direction extent of a gear: the faces (z0, z1) and the ends of anything that sticks out (hubs, flanges) */
  extent(g){
    const i = g.info || {}, z0 = i.z0 != null ? i.z0 : -g.thick / 2, z1 = i.z1 != null ? i.z1 : g.thick / 2;
    let lo = z0, hi = z1;
    if(GW.Types.has(g.type, 'hubDown') && g.hubDown > 0) lo = z0 - g.hubDown;
    if(GW.Types.has(g.type, 'hubUp') && g.hubUp > 0) hi = z1 + g.hubUp;
    if(g.type === 'pulley' && g.flange !== 'none'){
      if(g.flange === 'both' || g.flange === 'front') hi = Math.max(hi, z1 + g.flangeT);
      if(g.flange === 'both' || g.flange === 'back') lo = Math.min(lo, z0 - g.flangeT);
    }
    return { z0, z1, lo, hi, face: z1 - z0, overall: hi - lo };
  },

  hubR(g){
    if(!(g.hubUp > 0 || g.hubDown > 0 || g.bodyStyle !== 'solid') || !GW.Types.has(g.type, 'hubUp')) return 0;
    if(g.hubDia > 0) return Math.max(g.hubDia / 2, g.bore / 2 + 0.6);
    return g.bore / 2 + Math.max(3, g.bore * 0.45);
  },

  /* the diameters that go on the front view, outermost first */
  radialDims(g){
    const i = g.info || {}, out = [], add = (label, r) => { if(isFinite(r) && r > 0.05 && !out.some(d => Math.abs(d.r - r) < 0.05)) out.push({ label, r }); };
    const t = g.type;
    if(t === 'internal' || t === 'splinehub'){ add('Outside Ø', i.outerR); add('Root Ø', i.rootR); add('Pitch Ø', i.pitchR); add('Tip Ø (inner)', i.tipR); }
    else if(t === 'crown'){ add('Outside Ø', i.outerR); add('Pitch circle Ø', i.pitchR); add('Inner Ø', i.innerR); }
    else if(t === 'rack') return out;
    else {
      if(t === 'pulley' && g.flange !== 'none') add('Flange Ø', GW.Gears.reach(g));
      add(t === 'sprocket' || t === 'pulley' || t === 'spline' ? 'Outside Ø' : 'Outside Ø', i.tipR != null ? i.tipR : GW.Calc.outerReach(g));
      add('Pitch Ø', GW.Calc.pitchR(g));
      if(i.rootR != null) add('Root Ø', i.rootR);
      add('Hub Ø', BP.hubR(g));
      if(g.bore > 0.2) add('Bore Ø', g.bore / 2);
    }
    if((t === 'internal' || t === 'splinehub') && g.bore > 0.2) add('Bore Ø', g.bore / 2);
    return out.sort((a, b) => b.r - a.r);
  },

  /* everything about one gear, measured from the origin */
  gearData(g, F){
    const i = g.info || {}, e = BP.extent(g), k = BP.axis(g);
    const center = BP.rel(g.rt.pos, F), kk = BP.dir(k, F);
    const pt = z => BP.rel(g.rt.pos.clone().addScaledVector(k, z), F);
    const euler = new T.Euler().setFromQuaternion(g.rt.quat.clone(), 'XYZ');
    return {
      g, id: g.id, name: g.name, type: g.type, label: GW.Types.TYPES[g.type].label,
      center, axis: kk, back: pt(e.z0), front: pt(e.z1), ends: [pt(e.lo), pt(e.hi)], e,
      face: e.face, overall: e.overall, hubUp: GW.Types.has(g.type, 'hubUp') ? g.hubUp : 0, hubDown: GW.Types.has(g.type, 'hubDown') ? g.hubDown : 0,
      reach: GW.Gears.reach(g), tilt: [U.deg(euler.x), U.deg(euler.y), U.deg(euler.z)],
      rows: BP.rowsOf(g, e), linked: g.parentId ? GW.Gears.get(g.parentId) : null
    };
  },

  /* the table of numbers for one gear: [label, mm value | text, kind] — kind 'L' = length, 'T' = text, 'A' = angle */
  rowsOf(g, e){
    const i = g.info || {}, rows = [], L = (k, v) => { if(v != null && isFinite(v)) rows.push([k, v, 'L']); }, Tx = (k, v) => rows.push([k, v, 'T']);
    const t = g.type, tol = GW.Tol, a = tol.allowance(g);
    Tx('Type', GW.Types.TYPES[t].label);
    if(t !== 'rack' && t !== 'worm') Tx('Teeth', String(Math.round(g.z))); else if(t === 'rack') Tx('Teeth', String(Math.round(g.z))); else Tx('Starts', String(g.starts));
    if(GW.Types.has(t, 'm')) Tx('Module', U.fmt(g.m, 3) + ' mm'), Tx('Pressure angle', U.fmt(g.pa, 2) + '°');
    GW.Calc.stats(g).forEach(([k, v, u]) => { if(/^[-\d.]+$/.test(String(v)) && u === 'mm') L(k, +v); else if(u !== 'mm' && !/⚠/.test(k)) Tx(k, v + (u ? ' ' + u : '')); });
    if(g.helix && GW.Types.has(t, 'helix')) Tx('Helix angle', U.fmt(g.helix, 2) + '°');
    L('Face width (thickness)', e.face);
    if(t !== 'rack' && GW.Types.has(t, 'hubUp')){ if(g.hubUp > 0) L('Hub length +z', g.hubUp); if(g.hubDown > 0) L('Hub length −z', g.hubDown); }
    if(t === 'pulley' && g.flange !== 'none') L('Flange thickness', g.flangeT);
    L('Overall length along shaft', e.overall);
    if(t === 'rack'){ L('Bar height', g.barH); L('Overall height', i.height); }
    if(g.bore > 0.2 && t !== 'rack'){
      L('Bore Ø (shaft size)', g.bore);
      if(a.bore > 0) L('Bore Ø as cut (+ ' + U.fmt(a.bore, 2) + ' mm allowance)', g.bore + a.bore);
      if(g.keyW > 0){ L('Keyway width', g.keyW + (a.key > 0 ? a.key : 0)); L('Keyway depth', g.keyD + (a.key > 0 ? a.key / 2 : 0)); }
      if(g.dFlat > 0) L('D-flat depth', g.dFlat);
    }
    if(g.backlash > 0 && GW.Types.has(t, 'backlash')) L('Backlash', g.backlash);
    Tx('Process', tol.of(g).label);
    return rows;
  },

  /* spacing between every pair of gears, from the origin's point of view */
  pairs(list, F){
    const out = [];
    for(let a = 0; a < list.length; a++) for(let b = a + 1; b < list.length; b++){
      const A = list[a], B = list[b], d = B.g.rt.pos.clone().sub(A.g.rt.pos), k1 = BP.axis(A.g), k2 = BP.axis(B.g);
      const cr = k1.clone().cross(k2), sinA = cr.length();
      const r = { A, B, d3: d.length(), delta: BP.dir(d, F), parallel: sinA < 1e-3 };
      if(r.parallel){
        const along = d.dot(k1), perp = d.clone().addScaledVector(k1, -along).length(), same = k1.dot(k2) > 0;
        const al = [A.e.lo, A.e.hi], bl = same ? [along + B.e.lo, along + B.e.hi] : [along - B.e.hi, along - B.e.lo];
        r.axes = perp; r.along = along; r.gap = Math.max(al[0] - bl[1], bl[0] - al[1]);
        r.kind = perp < 0.05 ? 'same shaft' : 'parallel shafts';
      } else {
        r.axes = Math.abs(d.dot(cr.clone().normalize())); r.angle = U.deg(Math.asin(Math.min(1, sinA))); if(k1.dot(k2) < 0) r.angle = 180 - r.angle;
        r.kind = r.axes < 0.05 ? 'shafts cross' : 'shafts skew';
        r.gap = null;
      }
      const c = B.g.parentId === A.g.id ? B.g : A.g.parentId === B.g.id ? A.g : null;
      r.link = c ? (c.linkKind === 'same shaft' ? 'keyed to the same shaft' : 'meshed') : '';
      r.extra = c && c.linkKind === 'mesh' ? c.meshOffset : null;
      out.push(r);
    }
    return out;
  },

  model(){
    const G = GW.Gears; if(G.dirty) GW.Layout.solveAll();
    const F = BP.frame(), list = G.list.map(g => BP.gearData(g, F));
    return { F, list, pairs: BP.pairs(list, F) };
  },

  /* ================================================================== text helpers */
  /* "1.772 in" with "45 mm" under it, in whichever unit comes first */
  Ls(mm){
    const Un = GW.Units, big = Math.abs(mm) < 0.0005 ? 0 : mm;
    return Un.inch ? Un.fmtD(big) + ' in' : U.fmt(big, 3) + ' mm';
  },
  L2(mm){ const Un = GW.Units; return Un.inch ? U.fmt(Math.abs(mm) < 0.0005 ? 0 : mm, 2) + ' mm' : Un.fmtD(mm) + ' in'; },
  Lh(mm){ return '<b>' + esc(BP.Ls(mm)) + '</b><i>' + esc(BP.L2(mm)) + '</i>'; },
  Lt(mm){ return BP.Ls(mm) + ' (' + BP.L2(mm) + ')'; },
  V3(v){ return [v.x, v.y, v.z].map(BP.Lh).join(''); },
  dirTxt(v){ return '(' + [v.x, v.y, v.z].map(n => U.fmt(Math.abs(n) < 5e-4 ? 0 : n, 3)).join(', ') + ')'; },

  /* ================================================================== SVG toolkit */
  svg: {
    arrow(x, y, dx, dy, c){ const s = 7, px = -dy, py = dx; return `<path d="M${x} ${y}L${x - dx * s + px * 2.4} ${y - dy * s + py * 2.4}L${x - dx * s - px * 2.4} ${y - dy * s - py * 2.4}Z" fill="${c}" stroke="none"/>`; },
    text(x, y, s, c, o){
      o = o || {}; const lines = String(s).split('\n'), sz = o.size || 11, fx = U.fmt(x, 1);
      const body = lines.length === 1 ? esc(lines[0]) : lines.map((l, n) => `<tspan x="${fx}" dy="${n ? sz + 1 : 0}">${esc(l)}</tspan>`).join('');
      const y0 = y - (lines.length - 1) * (sz + 1) / 2;
      return `<text x="${fx}" y="${U.fmt(y0, 1)}" fill="${c}" font-size="${sz}" text-anchor="${o.anchor || 'middle'}" ${o.weight ? 'font-weight="' + o.weight + '"' : ''}>${body}</text>`;
    },
    /* a horizontal dimension: x1..x2 measured, drawn at yD, extension lines from yRef */
    dimH(x1, x2, yRef, yD, label, P){
      const s = BP.svg, lo = Math.min(x1, x2), hi = Math.max(x1, x2), dy = yD > yRef ? 1 : -1;
      return `<g stroke="${P.dim}" stroke-width="1" fill="none"><path d="M${x1} ${yRef + dy * 2}V${yD + dy * 4}M${x2} ${yRef + dy * 2}V${yD + dy * 4}M${lo} ${yD}H${hi}"/></g>` + s.arrow(lo, yD, -1, 0, P.dim) + s.arrow(hi, yD, 1, 0, P.dim) + s.text((lo + hi) / 2, yD + (dy > 0 ? 14 : -5), label, P.ink, { size: 11 });
    },
    dimV(y1, y2, xRef, xD, label, P){
      const s = BP.svg, lo = Math.min(y1, y2), hi = Math.max(y1, y2), dx = xD > xRef ? 1 : -1;
      return `<g stroke="${P.dim}" stroke-width="1" fill="none"><path d="M${xRef + dx * 2} ${y1}H${xD + dx * 4}M${xRef + dx * 2} ${y2}H${xD + dx * 4}M${xD} ${lo}V${hi}"/></g>` + s.arrow(xD, lo, 0, -1, P.dim) + s.arrow(xD, hi, 0, 1, P.dim) + s.text(xD + (dx > 0 ? 6 : -6), (lo + hi) / 2, label, P.ink, { size: 11, anchor: dx > 0 ? 'start' : 'end' });
    },
    /* a clean "nice" step (1, 2, 5 × 10^n) in millimeters, in inches when the unit is inches */
    nice(range){
      const inch = GW.Units.inch, u = inch ? 25.4 : 1, r = range / u, p = Math.pow(10, Math.floor(Math.log10(Math.max(r, 1e-9) / 4))), m = [1, 2, 5, 10].find(f => f * p >= r / 6) || 10;
      return m * p * u;
    }
  },

  /* ================================================================== one gear's sheet */
  gearSheet(d, theme){
    const P = PAL[theme || 'screen'], S = BP.svg, g = d.g, i = g.info || {}, t = g.type;
    const W = 860, H = 430, out = [];
    out.push(`<rect width="${W}" height="${H}" fill="${P.paper}"/>`);
    out.push(S.text(16, 22, d.name + ' — ' + d.label, P.ink, { size: 14, anchor: 'start', weight: 700 }));
    out.push(S.text(W - 16, 22, 'All sizes ' + (GW.Units.inch ? 'in inches (millimeters in parentheses)' : 'in millimeters (inches in parentheses)'), P.muted, { size: 10, anchor: 'end' }));
    const dimsTxt = mm => BP.Lt(mm);

    if(t === 'rack'){ BP.rackViews(d, out, P, W, H); return BP.wrapSvg(out, W, H); }

    // ---------- front view (looking down the shaft), diameters fanned out to the right
    const dims = BP.radialDims(g), R = dims.length ? dims[0].r : 10, cx = 160, cy = 232, sc = 118 / Math.max(R, 1e-6);
    out.push(S.text(cx, 52, 'FRONT VIEW (along the shaft)', P.muted, { size: 10 }));
    out.push(`<g fill="none" stroke-width="1.4">`);
    dims.forEach(dm => {
      const dash = dm.label.indexOf('Pitch') === 0 ? ' stroke-dasharray="7 3 1.5 3"' : '', col = dm.label.indexOf('Pitch') === 0 ? P.center : P.ink;
      if(t === 'elliptical' && dm.label.indexOf('Pitch') === 0){
        const a = g.majorA * sc, b = g.majorA * Math.sqrt(1 - g.ecc * g.ecc) * sc;
        out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${a}" ry="${b}" stroke="${col}"${dash}/>`);
      } else out.push(`<circle cx="${cx}" cy="${cy}" r="${dm.r * sc}" stroke="${col}"${dash}/>`);
    });
    if(g.keyW > 0 && g.bore > 0.2){ const br = g.bore / 2 * sc, kw = g.keyW * sc / 2, kd = g.keyD * sc; out.push(`<path d="M${cx - kw} ${cy - br}V${cy - br - kd}H${cx + kw}V${cy - br}" stroke="${P.ink}"/>`); }
    out.push(`<path d="M${cx - R * sc - 14} ${cy}H${cx + R * sc + 14}M${cx} ${cy - R * sc - 14}V${cy + R * sc + 14}" stroke="${P.center}" stroke-width=".8" stroke-dasharray="10 3 2 3"/>`);
    out.push('</g>');
    dims.forEach((dm, n) => {
      const th = U.rad(50 - n * 24), c = Math.cos(th), s = -Math.sin(th), r = dm.r * sc, lx = cx + (R * sc + 20) * c, ly = cy + (R * sc + 20) * s;
      out.push(`<path d="M${cx - r * c} ${cy - r * s}L${cx + r * c} ${cy + r * s}L${lx} ${ly}" stroke="${P.dim}" stroke-width="1" fill="none"/>`);
      out.push(S.arrow(cx + r * c, cy + r * s, c, s, P.dim), S.arrow(cx - r * c, cy - r * s, -c, -s, P.dim));
      out.push(S.text(lx + (c >= 0 ? 4 : -4), ly + 4, dm.label + '\n' + dimsTxt(dm.r * 2), P.ink, { size: 10.5, anchor: c >= 0 ? 'start' : 'end' }));
    });
    if(t === 'elliptical') out.push(S.text(cx, cy + R * sc + 38, 'Major axis ' + dimsTxt(g.majorA * 2) + ' · minor axis ' + dimsTxt(g.majorA * Math.sqrt(1 - g.ecc * g.ecc) * 2), P.ink, { size: 10.5 }));

    // ---------- half section (side view, shaft horizontal)
    const e = d.e, sx0 = 520, sw = 200, sy = 232;
    const rects = BP.sectionShapes(g, e), maxR = Math.max(...rects.map(r => Math.max(...r.poly.map(p => p[1]))), 1);
    const ssc = Math.min(sw / Math.max(e.overall, 1e-6), 108 / maxR), midZ = (e.lo + e.hi) / 2, X = z => sx0 + sw / 2 + (z - midZ) * ssc, Y = r => sy - r * ssc;
    out.push(S.text(sx0 + sw / 2, 52, 'SECTION (through the shaft)', P.muted, { size: 10 }));
    out.push(`<defs><pattern id="hat-${d.id}-${theme || 's'}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="${P.hatch}" stroke-width="1.2"/></pattern></defs>`);
    rects.forEach(r => {
      const up = r.poly.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' '), dn = r.poly.map(p => X(p[0]).toFixed(1) + ',' + Y(-p[1]).toFixed(1)).join(' ');
      [up, dn].forEach(pts => out.push(`<polygon points="${pts}" fill="${P.fill}" stroke="none"/><polygon points="${pts}" fill="url(#hat-${d.id}-${theme || 's'})" stroke="${P.ink}" stroke-width="1.4"/>`));
    });
    out.push(`<path d="M${X(e.lo) - 16} ${sy}H${X(e.hi) + 16}" stroke="${P.center}" stroke-width=".8" stroke-dasharray="10 3 2 3"/>`);
    const rp = GW.Calc.pitchR(g);
    if(isFinite(rp) && g.type !== 'worm') out.push(`<path d="M${X(e.z0)} ${Y(rp)}H${X(e.z1)}M${X(e.z0)} ${Y(-rp)}H${X(e.z1)}" stroke="${P.center}" stroke-width=".9" stroke-dasharray="7 3 1.5 3"/>`);
    // thickness and overall length underneath
    const yb = sy + maxR * ssc + 18;
    out.push(S.dimH(X(e.z0), X(e.z1), sy + maxR * ssc, yb, 'Face width ' + dimsTxt(e.face), P));
    if(e.overall - e.face > 0.01) out.push(S.dimH(X(e.lo), X(e.hi), sy + maxR * ssc, yb + 30, 'Overall ' + dimsTxt(e.overall), P));
    if(g.hubUp > 0 && GW.Types.has(t, 'hubUp')) out.push(S.dimH(X(e.z1), X(e.hi), sy - BP.hubR(g) * ssc, sy - maxR * ssc - 16, '+z hub ' + dimsTxt(g.hubUp), P));
    if(g.hubDown > 0 && GW.Types.has(t, 'hubDown')) out.push(S.dimH(X(e.lo), X(e.z0), sy - BP.hubR(g) * ssc, sy - maxR * ssc - 34, '−z hub ' + dimsTxt(g.hubDown), P));
    out.push(S.dimV(Y(maxR), Y(-maxR), X(e.hi), X(e.hi) + 26, 'Outside Ø\n' + dimsTxt(maxR * 2), P));
    if(g.bore > 0.2 && t !== 'rack') out.push(S.dimV(Y(g.bore / 2), Y(-g.bore / 2), X(e.lo), X(e.lo) - 26, 'Bore Ø\n' + dimsTxt(g.bore), P));

    // ---------- title block: where it sits from the origin
    const F = BP.frame();
    out.push(`<path d="M16 ${H - 52}H${W - 16}" stroke="${P.muted}" stroke-width=".8"/>`);
    out.push(S.text(16, H - 36, 'Center from origin:  X ' + BP.Ls(d.center.x) + '   Y ' + BP.Ls(d.center.y) + '   Z ' + BP.Ls(d.center.z), P.ink, { size: 11, anchor: 'start' }));
    out.push(S.text(16, H - 20, 'Shaft direction ' + BP.dirTxt(d.axis) + '   ·   Origin: ' + F.label, P.muted, { size: 10.5, anchor: 'start' }));
    out.push(S.text(W - 16, H - 20, 'Gear Maker', P.muted, { size: 10, anchor: 'end' }));
    return BP.wrapSvg(out, W, H);
  },

  /* the cut shapes, as polygons in (z, r), upper half; mirrored when drawn */
  sectionShapes(g, e){
    const i = g.info || {}, t = g.type, shapes = [], poly = (z0, z1, r0, r1, r2) => ({ poly: [[z0, r0], [z1, r0], [z1, r2 != null ? r2 : r1], [z0, r1]] });
    const bore = g.bore > 0.2 ? g.bore / 2 : 0, tip = i.tipR != null ? i.tipR : (i.outerR || 10), root = i.rootR != null ? i.rootR : tip * 0.85;
    const hubR = BP.hubR(g);
    if(t === 'internal' || t === 'splinehub'){ shapes.push(poly(e.z0, e.z1, i.tipR, i.outerR)); return shapes; }
    if(t === 'crown'){ shapes.push(poly(e.z0, e.z1, bore, i.outerR)); return shapes; }
    if(t === 'bevel' || t === 'spiralbevel'){
      const r = i.pitchR, k = s => Math.max(1 - s * Math.tan(U.rad(g.cone)) / r, 0.12), T_ = g.thick;
      shapes.push({ poly: [[0, bore], [T_, bore * 1], [T_, tip * k(T_)], [0, tip]] });
      if(hubR && (g.hubUp > 0 || g.hubDown > 0)) shapes.push(poly(-g.hubDown, T_ + g.hubUp, bore, hubR));
      return shapes;
    }
    const style = g.bodyStyle || 'solid', ri = Math.max(root - g.rimW, hubR + 2);
    if(GW.Types.has(t, 'bodyStyle') && style !== 'solid' && ri < root - 0.8){
      const wT = Math.min(g.webT, e.face), zc = U.clamp((e.z0 + e.z1) / 2 - wT / 2 + g.webOff, e.z0, e.z1 - wT);
      shapes.push(poly(e.z0, e.z1, ri, tip, tip));
      shapes.push(poly(zc, zc + wT, hubR, ri + 0.8));
      shapes.push(poly(e.lo, e.hi, bore, hubR));
    } else {
      shapes.push(poly(e.z0, e.z1, bore, tip));
      if(hubR && (g.hubUp > 0 || g.hubDown > 0)) shapes.push(poly(e.lo, e.hi, bore, hubR));
    }
    if(t === 'pulley' && g.flange !== 'none'){
      const fr = GW.Gears.reach(g);
      if(g.flange === 'both' || g.flange === 'front') shapes.push(poly(e.z1, e.z1 + g.flangeT, bore, fr));
      if(g.flange === 'both' || g.flange === 'back') shapes.push(poly(e.z0 - g.flangeT, e.z0, bore, fr));
    }
    return shapes;
  },

  /* a rack is a bar: side profile with the teeth, and an end view for its width */
  rackViews(d, out, P, W, H){
    const S = BP.svg, g = d.g, i = g.info, L = i.length, ded = i.ded, add = i.add, Hh = i.height, p = i.pitch, n = Math.max(1, Math.round(g.z));
    const sc = Math.min(520 / L, 150 / Hh), x0 = 40, y0 = 170;                      // y0: pitch line
    const X = x => x0 + (x + L / 2) * sc, Y = y => y0 - y * sc;
    out.push(S.text(x0 + L * sc / 2, 52, 'SIDE VIEW (tooth profile)', P.muted, { size: 10 }));
    const a0 = U.rad(g.pa), tanA = Math.tan(a0), halfP = Math.max((p / 2 - g.backlash / 2) / 2, 0.05 * g.m), tipH = Math.max(halfP - add * tanA, 0.04 * p), rootH = Math.min(halfP + ded * tanA, p * 0.48);
    let pts = `${X(-L / 2)},${Y(-Hh)} ${X(L / 2)},${Y(-Hh)} ${X(L / 2)},${Y(-ded)}`;
    for(let k = n - 1; k >= 0; k--){ const c = -L / 2 + p * (k + 0.5); pts += ` ${X(c + rootH)},${Y(-ded)} ${X(c + tipH)},${Y(add)} ${X(c - tipH)},${Y(add)} ${X(c - rootH)},${Y(-ded)}`; }
    pts += ` ${X(-L / 2)},${Y(-ded)}`;
    out.push(`<polygon points="${pts}" fill="${P.fill}" stroke="${P.ink}" stroke-width="1.3"/>`);
    out.push(`<path d="M${X(-L / 2) - 10} ${Y(0)}H${X(L / 2) + 10}" stroke="${P.center}" stroke-width=".9" stroke-dasharray="7 3 1.5 3"/>`);
    out.push(S.dimH(X(-L / 2), X(L / 2), Y(-Hh), Y(-Hh) + 26, 'Length ' + BP.Lt(L), P));
    out.push(S.dimH(X(-L / 2 + p * 0.5 - p / 2), X(-L / 2 + p * 1.5 - p / 2), Y(add), Y(add) - 22, 'Pitch ' + BP.Lt(p), P));
    out.push(S.dimV(Y(add), Y(-Hh), X(L / 2), X(L / 2) + 26, 'Total height ' + BP.Lt(Hh), P));
    out.push(S.dimV(Y(-ded), Y(-Hh), X(-L / 2), X(-L / 2) - 26, 'Bar ' + BP.Lt(g.barH), P));
    out.push(S.dimV(Y(add), Y(-ded), X(-L / 2), X(-L / 2) - 70, 'Tooth ' + BP.Lt(add + ded), P));
    // end view
    const ex = 700, ey = 290, esc_ = Math.min(130 / Math.max(g.thick, 1), 130 / Hh);
    out.push(S.text(ex + g.thick * esc_ / 2, 262, 'END VIEW', P.muted, { size: 10 }));
    out.push(`<rect x="${ex}" y="${ey - add * esc_}" width="${g.thick * esc_}" height="${Hh * esc_}" fill="${P.fill}" stroke="${P.ink}" stroke-width="1.3"/>`);
    out.push(S.dimH(ex, ex + g.thick * esc_, ey + (Hh - add) * esc_, ey + (Hh - add) * esc_ + 20, 'Face width ' + BP.Lt(g.thick), P));
    const F = BP.frame();
    out.push(`<path d="M16 ${H - 52}H${W - 16}" stroke="${P.muted}" stroke-width=".8"/>`);
    out.push(S.text(16, H - 36, 'Center from origin:  X ' + BP.Ls(d.center.x) + '   Y ' + BP.Ls(d.center.y) + '   Z ' + BP.Ls(d.center.z) + '   (rack at rest)', P.ink, { size: 11, anchor: 'start' }));
    out.push(S.text(16, H - 20, 'Length direction ' + BP.dirTxt(BP.dir(new T.Vector3(1, 0, 0).applyQuaternion(g.rt.quat), F)) + '   ·   Origin: ' + F.label, P.muted, { size: 10.5, anchor: 'start' }));
  },

  wrapSvg(parts, W, H){ return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter,Helvetica,Arial,sans-serif" stroke="none" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</svg>`; },

  /* ================================================================== the layout plan */
  /* convex hull of 2D points */
  hull(pts){
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if(pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    pts.forEach(p => { while(lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for(let k = pts.length - 1; k >= 0; k--){ const p = pts[k]; while(up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  },
  /* outline of a gear in the origin frame: its two end faces, as circles in 3D, projected on the chosen plane */
  silhouette(g, F, ax){
    const k = BP.axis(g), e = BP.extent(g), q = g.rt.quat, pts = [];
    const u = new T.Vector3(1, 0, 0).applyQuaternion(q), v = new T.Vector3(0, 1, 0).applyQuaternion(q);
    const R = g.type === 'rack' ? 0 : BP.reachOf(g);
    const push = p => { const r = BP.rel(p, F); pts.push([r[ax[0]], r[ax[1]]]); };
    if(g.type === 'rack'){
      const i = g.info; [-1, 1].forEach(sx => [-i.height, i.add].forEach(y => [e.z0, e.z1].forEach(z => push(g.rt.pos.clone().addScaledVector(u, sx * i.length / 2).addScaledVector(v, y).addScaledVector(k, z)))));
    } else [e.lo, e.hi].forEach(z => { for(let n = 0; n < 48; n++){ const a = n / 48 * Math.PI * 2; push(g.rt.pos.clone().addScaledVector(k, z).addScaledVector(u, Math.cos(a) * R).addScaledVector(v, Math.sin(a) * R)); } });
    return BP.hull(pts);
  },
  reachOf(g){ return g.type === 'elliptical' ? g.majorA * (1 + g.ecc) + 2 : Math.max(GW.Gears.reach(g), BP.hubR(g)); },

  layoutSheet(m, view, theme){
    const P = PAL[theme || 'screen'], S = BP.svg, W = 900, H = 520, ax = { top: ['x', 'y'], front: ['x', 'z'], side: ['y', 'z'] }[view], names = { x: 'X', y: 'Y', z: 'Z' };
    const out = [`<rect width="${W}" height="${H}" fill="${P.paper}"/>`];
    const hulls = m.list.map(d => BP.silhouette(d.g, m.F, ax));
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    hulls.forEach(h => h.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
    const pad = Math.max(x1 - x0, y1 - y0, 20) * 0.08 + 8; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const mx = 54, my = 40, sc = Math.min((W - mx * 2) / (x1 - x0), (H - my * 2 - 30) / (y1 - y0));
    const ox = mx + (W - mx * 2 - (x1 - x0) * sc) / 2, oy = my + (H - my * 2 - 30 - (y1 - y0) * sc) / 2;
    const X = x => ox + (x - x0) * sc, Y = y => oy + (y1 - y) * sc;
    // grid with nice labels
    const step = S.nice(Math.max(x1 - x0, y1 - y0));
    out.push(`<g stroke="${P.grid}" stroke-width="1">`);
    for(let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) out.push(`<path d="M${X(gx)} ${Y(y0)}V${Y(y1)}"/>`);
    for(let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) out.push(`<path d="M${X(x0)} ${Y(gy)}H${X(x1)}"/>`);
    out.push('</g>');
    for(let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) out.push(S.text(X(gx), Y(y0) + 14, GW.Units.fmtD(gx), P.muted, { size: 9 }));
    for(let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) out.push(S.text(X(x0) - 6, Y(gy) + 3, GW.Units.fmtD(gy), P.muted, { size: 9, anchor: 'end' }));
    out.push(S.text(W - 16, 22, 'Grid every ' + BP.Ls(step) + ' · ' + names[ax[0]] + ' → right, ' + names[ax[1]] + ' → up · ' + (GW.Units.inch ? 'inches' : 'millimeters'), P.muted, { size: 10, anchor: 'end' }));
    out.push(S.text(16, 22, 'LAYOUT — ' + { top: 'top view', front: 'front view', side: 'side view' }[view] + ' · origin: ' + m.F.label, P.ink, { size: 13, anchor: 'start', weight: 700 }));
    // gears
    m.list.forEach((d, n) => {
      const h = hulls[n], sel = GW.UI && GW.UI.selId === d.id;
      if(h.length) out.push(`<polygon points="${h.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}" fill="${P.fill}" fill-opacity=".7" stroke="${sel ? P.center : P.ink}" stroke-width="${sel ? 2 : 1.3}"/>`);
    });
    // distances between the gears that are linked
    m.pairs.forEach(r => {
      if(!r.link) return;
      const a = r.A.center, b = r.B.center, ax0 = X(a[ax[0]]), ay0 = Y(a[ax[1]]), bx = X(b[ax[0]]), by = Y(b[ax[1]]);
      if(Math.hypot(bx - ax0, by - ay0) < 6) return;
      const val = r.parallel && r.kind !== 'same shaft' ? r.axes : r.d3, lab = (r.kind === 'same shaft' ? 'gap ' + BP.Ls(r.gap) : BP.Ls(val));
      out.push(`<path d="M${ax0} ${ay0}L${bx} ${by}" stroke="${P.dim}" stroke-width="1.2" stroke-dasharray="4 3"/>`);
      out.push(S.text((ax0 + bx) / 2, (ay0 + by) / 2 - 5, lab, P.dim, { size: 10.5, weight: 600 }));
    });
    m.list.forEach(d => {
      const px = X(d.center[ax[0]]), py = Y(d.center[ax[1]]);
      out.push(`<circle cx="${px}" cy="${py}" r="2.6" fill="${P.center}"/>`);
      out.push(S.text(px, py + 15, d.name, P.ink, { size: 11, weight: 600 }));
      out.push(S.text(px, py + 28, '(' + GW.Units.fmtD(d.center[ax[0]]) + ', ' + GW.Units.fmtD(d.center[ax[1]]) + ')', P.muted, { size: 9.5 }));
    });
    // the origin
    const ox_ = X(0), oy_ = Y(0);
    out.push(`<g stroke="${P.origin}" stroke-width="1.5"><path d="M${ox_ - 14} ${oy_}H${ox_ + 14}M${ox_} ${oy_ - 14}V${oy_ + 14}"/><circle cx="${ox_}" cy="${oy_}" r="5" fill="none"/></g>`);
    out.push(S.text(ox_ + 9, oy_ - 9, 'ORIGIN', P.origin, { size: 10, anchor: 'start', weight: 700 }));
    return BP.wrapSvg(out, W, H);
  },

  /* ================================================================== the panel */
  init(){
    if(BP.el) return;
    const el = BP.el = make('section', 'bp'); el.id = 'bp'; el.setAttribute('aria-label', 'Blueprint'); el.hidden = true;
    el.innerHTML = `
      <header class="bp-head">
        <div class="bp-title"><b>Blueprint</b><small>Exact sizes and positions, redrawn on every change</small></div>
        <div class="bp-origin" id="bpOrigin"></div>
        <div class="bp-actions">
          <button type="button" class="pill" id="bpSvg" data-tip="Download sheets&#10;The layout and one dimensioned drawing per gear, as SVG (white paper, ready to print)."><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><span>Sheets</span></button>
          <button type="button" class="pill" id="bpCsv" data-tip="Download numbers&#10;Placement, spacing and every gear's dimensions as one CSV file."><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 10h16M10 5v14"/></svg><span>CSV</span></button>
          <button type="button" class="pill" id="bpPrint" data-tip="Print&#10;Prints these sheets on white paper."><svg viewBox="0 0 24 24"><path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z"/></svg><span>Print</span></button>
          <button type="button" class="ib" id="bpClose" aria-label="Close the blueprint" data-tip="Back to 3D&#10;B"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
      </header>
      <div class="bp-body" id="bpBody"></div>`;
    $('stage').appendChild(el);
    $('bpClose').onclick = () => BP.show(false);
    $('bpSvg').onclick = () => BP.downloadSheets();
    $('bpCsv').onclick = () => BP.downloadCsv();
    $('bpPrint').onclick = () => BP.print();
    const btn = $('bpBtn'); if(btn) btn.onclick = () => BP.show(!BP.open);
    document.addEventListener('keydown', e => {
      if(e.ctrlKey || e.metaKey || e.altKey || (e.target.matches && e.target.matches('input,select,textarea')) || document.querySelector('.modal-bg.show')) return;
      if(e.key === 'b' || e.key === 'B') BP.show(!BP.open); else if(e.key === 'Escape' && BP.open && !document.querySelector('.modal-bg.show')) BP.show(false);
    });
    BP.buildOrigin();
  },

  show(on){
    BP.init(); BP.open = on; BP.el.hidden = !on; BP.el.classList.toggle('on', on);
    const b = $('bpBtn'); if(b) b.setAttribute('aria-pressed', String(on));
    if(on){ BP.buildOrigin(); BP.render(true); }
  },

  /* the origin chooser is built once per opening (typing in it must not be interrupted by a redraw) */
  buildOrigin(){
    const o = BP.origin, G = GW.Gears, host = $('bpOrigin'); if(!host) return;
    if(o.mode === 'gear' && !G.get(o.gearId)) o.mode = 'world';
    const un = GW.Units.unit(), gears = G.list.map(g => `<option value="${g.id}" ${g.id === o.gearId ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
    host.innerHTML = `<label>Origin <select id="boMode"><option value="world" ${o.mode === 'world' ? 'selected' : ''}>World zero</option><option value="gear" ${o.mode === 'gear' ? 'selected' : ''}>A gear…</option><option value="custom" ${o.mode === 'custom' ? 'selected' : ''}>A point I type…</option></select></label>
      <span class="bo-g" ${o.mode === 'gear' ? '' : 'hidden'}><select id="boGear" aria-label="Which gear">${gears}</select>
        <select id="boRef" aria-label="Where on that gear"><option value="center" ${o.ref === 'center' ? 'selected' : ''}>its center</option><option value="front" ${o.ref === 'front' ? 'selected' : ''}>its front face</option><option value="back" ${o.ref === 'back' ? 'selected' : ''}>its back face</option></select>
        <label class="chk bo-chk"><input type="checkbox" id="boAxes" ${o.axes ? 'checked' : ''}> use its axes</label></span>
      <span class="bo-c" ${o.mode === 'custom' ? '' : 'hidden'}>${['x', 'y', 'z'].map(a => `<label>${a.toUpperCase()} <input type="number" step="any" id="bo_${a}" value="${U.fmt(GW.Units.d(o[a]), 4)}"></label>`).join('')}<small>${un}</small></span>`;
    const upd = () => {
      o.mode = $('boMode').value;
      if(o.mode === 'gear'){ o.gearId = +$('boGear').value || (G.list[0] && G.list[0].id) || null; o.ref = $('boRef').value; o.axes = $('boAxes').checked; if(o.gearId == null) o.mode = 'world'; }
      if(o.mode === 'custom') ['x', 'y', 'z'].forEach(a => { const v = parseFloat($('bo_' + a).value); o[a] = isFinite(v) ? GW.Units.fromD(v) : 0; });
      host.querySelector('.bo-g').hidden = o.mode !== 'gear'; host.querySelector('.bo-c').hidden = o.mode !== 'custom';
      BP.render(true);
    };
    host.querySelectorAll('select,input').forEach(c => { c.oninput = upd; c.onchange = upd; });
    // choosing "A gear…" with nothing chosen yet picks the selected gear (or the first)
    $('boMode').addEventListener('change', () => { if($('boMode').value === 'gear' && !o.gearId){ const s = GW.UI && GW.UI.sel(); o.gearId = s ? s.id : (G.list[0] && G.list[0].id); $('boGear').value = o.gearId; upd(); } });
  },

  /* ---- drawing the whole panel body ---- */
  signature(){
    const G = GW.Gears, o = BP.origin;
    return [G.version, G.list.length, GW.Units.mode, JSON.stringify(o), GW.UI ? GW.UI.selId : '', BP.view, BP.only].join('|');
  },
  tick(){
    if(!BP.open) return;
    const now = performance.now(), s = BP.signature();
    if(s === BP._sig || now - BP._t < 120) return;
    BP.render();
  },
  render(force){
    if(!BP.open) return;
    const body = $('bpBody'), m = BP.model(), sel = GW.UI ? GW.UI.selId : null;
    BP._sig = BP.signature(); BP._t = performance.now(); BP._m = m;
    const o = BP.origin;
    if(o.mode === 'gear' && !GW.Gears.get(o.gearId)){ o.mode = 'world'; BP.buildOrigin(); }
    // keep the gear list inside the origin chooser current when gears come and go
    const sig2 = GW.Gears.list.map(g => g.id + g.name).join('|');
    if(sig2 !== BP._gsig){ BP._gsig = sig2; if(document.activeElement && document.activeElement.closest && !document.activeElement.closest('#bpOrigin')) BP.buildOrigin(); }
    const top = body.scrollTop;
    if(!m.list.length){ body.innerHTML = '<div class="bp-empty"><b>Nothing on the table</b><span>Add a gear and its drawing appears here.</span></div>'; return; }
    const tabs = ['top', 'front', 'side'].map(v => `<button type="button" class="bp-tab" data-v="${v}" aria-pressed="${BP.view === v}">${{ top: 'Top', front: 'Front', side: 'Side' }[v]}</button>`).join('');
    let h = `<div class="bp-sec"><div class="bp-sh"><h3>Layout</h3><div class="bp-tabs">${tabs}</div></div><div class="bp-fig">${BP.layoutSheet(m, BP.view, 'screen')}</div></div>`;

    h += `<div class="bp-sec"><div class="bp-sh"><h3>Placement from the origin</h3><small>${esc(m.F.label)}</small></div><div class="bp-tw"><table class="bp-t"><thead><tr><th>Gear</th><th>X</th><th>Y</th><th>Z</th><th>Shaft direction</th><th>Face width</th><th>Overall length</th><th>Back face (X, Y, Z)</th><th>Front face (X, Y, Z)</th></tr></thead><tbody>`;
    m.list.forEach(d => { h += `<tr class="${d.id === sel ? 'sel' : ''}" data-id="${d.id}"><th>${esc(d.name)}<small>${esc(d.label)}</small></th><td>${BP.Lh(d.center.x)}</td><td>${BP.Lh(d.center.y)}</td><td>${BP.Lh(d.center.z)}</td><td class="mono">${BP.dirTxt(d.axis)}</td><td>${BP.Lh(d.face)}</td><td>${BP.Lh(d.overall)}</td><td class="mono sm">${[d.back.x, d.back.y, d.back.z].map(BP.Ls).join(', ')}</td><td class="mono sm">${[d.front.x, d.front.y, d.front.z].map(BP.Ls).join(', ')}</td></tr>`; });
    h += '</tbody></table></div></div>';

    if(m.pairs.length){
      h += `<div class="bp-sec"><div class="bp-sh"><h3>Spacing between gears</h3><small>Air gap: positive is empty space, negative means the two overlap along the shaft (normal for a meshed pair)</small></div><div class="bp-tw"><table class="bp-t"><thead><tr><th>Pair</th><th>Relation</th><th>Center to center</th><th>Between shafts</th><th>Shaft angle</th><th>ΔX</th><th>ΔY</th><th>ΔZ</th><th>Air gap along shaft</th><th>Extra spacing</th></tr></thead><tbody>`;
      m.pairs.forEach(r => {
        const rel = [r.link, r.kind].filter(Boolean).join(' · ');
        h += `<tr class="${r.link ? 'lnk' : ''} ${(r.A.id === sel || r.B.id === sel) ? 'sel' : ''}"><th>${esc(r.A.name)} ↔ ${esc(r.B.name)}</th><td class="sm">${esc(rel)}</td><td>${BP.Lh(r.d3)}</td><td>${BP.Lh(r.axes)}</td><td>${r.angle != null ? U.fmt(r.angle, 2) + '°' : 'parallel'}</td><td>${BP.Lh(r.delta.x)}</td><td>${BP.Lh(r.delta.y)}</td><td>${BP.Lh(r.delta.z)}</td><td>${r.gap != null ? BP.Lh(r.gap) : '—'}</td><td>${r.extra != null ? BP.Lh(r.extra) : '—'}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    h += `<div class="bp-sec"><div class="bp-sh"><h3>Gear drawings</h3><label class="chk bp-only"><input type="checkbox" id="bpOnly" ${BP.only ? 'checked' : ''}> selected gear only</label></div><div class="bp-cards">`;
    m.list.forEach(d => {
      if(BP.only && sel != null && d.id !== sel) return;
      h += `<article class="bp-card ${d.id === sel ? 'sel' : ''}" data-id="${d.id}"><div class="bp-fig">${BP.gearSheet(d, 'screen')}</div><table class="bp-t bp-kv"><tbody>`;
      d.rows.forEach(([k, v, kind]) => { h += `<tr><th>${esc(k)}</th><td>${kind === 'L' ? BP.Lh(v) : esc(v)}</td></tr>`; });
      h += `<tr><th>Center from origin</th><td>${BP.V3(d.center)}</td></tr><tr><th>Shaft direction</th><td class="mono">${BP.dirTxt(d.axis)}</td></tr></tbody></table></article>`;
    });
    h += '</div></div>';
    body.innerHTML = h;
    body.scrollTop = top;
    body.querySelectorAll('.bp-tab').forEach(b => b.onclick = () => { BP.view = b.dataset.v; BP.render(true); });
    const only = $('bpOnly'); if(only) only.onchange = () => { BP.only = only.checked; BP.render(true); };
    body.querySelectorAll('[data-id]').forEach(r => r.addEventListener('click', () => { if(GW.UI) GW.UI.select(+r.dataset.id); }));
  },

  /* ================================================================== files */
  csv(){
    const m = BP.model(), q = s => '"' + String(s).replace(/"/g, '""') + '"', mm = v => U.fmt(v, 4), inch = v => U.fmt(v / 25.4, 5);
    const L = [];
    L.push(['Gear Maker blueprint'], ['Origin', m.F.label], ['Units', 'millimeters and inches']);
    L.push([]); L.push(['PLACEMENT FROM THE ORIGIN']);
    L.push(['Gear', 'Type', 'X mm', 'Y mm', 'Z mm', 'X in', 'Y in', 'Z in', 'Shaft dir X', 'Shaft dir Y', 'Shaft dir Z', 'Face width mm', 'Face width in', 'Overall length mm', 'Overall length in']);
    m.list.forEach(d => L.push([d.name, d.label, mm(d.center.x), mm(d.center.y), mm(d.center.z), inch(d.center.x), inch(d.center.y), inch(d.center.z), U.fmt(d.axis.x, 4), U.fmt(d.axis.y, 4), U.fmt(d.axis.z, 4), mm(d.face), inch(d.face), mm(d.overall), inch(d.overall)]));
    L.push([]); L.push(['SPACING BETWEEN GEARS']);
    L.push(['Gear A', 'Gear B', 'Relation', 'Center to center mm', 'Center to center in', 'Between shafts mm', 'Between shafts in', 'Shaft angle deg', 'dX mm', 'dY mm', 'dZ mm', 'Air gap along shaft mm', 'Air gap in', 'Extra spacing mm']);
    m.pairs.forEach(r => L.push([r.A.name, r.B.name, [r.link, r.kind].filter(Boolean).join(' / '), mm(r.d3), inch(r.d3), mm(r.axes), inch(r.axes), r.angle != null ? U.fmt(r.angle, 3) : 0, mm(r.delta.x), mm(r.delta.y), mm(r.delta.z), r.gap != null ? mm(r.gap) : '', r.gap != null ? inch(r.gap) : '', r.extra != null ? mm(r.extra) : '']));
    m.list.forEach(d => { L.push([]); L.push(['DIMENSIONS OF', d.name]); d.rows.forEach(([k, v, kind]) => L.push(kind === 'L' ? [k, mm(v) + ' mm', inch(v) + ' in'] : [k, v])); });
    return L.map(r => r.map(q).join(',')).join('\r\n');
  },
  file(name, text, mime){ return { name, data: new TextEncoder().encode(text), mime }; },
  downloadSheets(){
    const m = BP.model(); if(!m.list.length) return;
    const files = [BP.file('layout-top.svg', BP.layoutSheet(m, 'top', 'paper'), 'image/svg+xml'), BP.file('layout-front.svg', BP.layoutSheet(m, 'front', 'paper'), 'image/svg+xml'), BP.file('layout-side.svg', BP.layoutSheet(m, 'side', 'paper'), 'image/svg+xml')];
    m.list.forEach((d, n) => files.push(BP.file((n + 1) + '-' + GW.Export.safe(d.name) + '.svg', BP.gearSheet(d, 'paper'), 'image/svg+xml')));
    GW.Export.download(files, 'gear-maker-blueprint');
    if(GW.UI) GW.UI.toast('Downloaded ' + files.length + ' sheets.');
  },
  downloadCsv(){ GW.Export.download([BP.file('gear-maker-blueprint.csv', BP.csv(), 'text/csv')], 'gear-maker-blueprint'); if(GW.UI) GW.UI.toast('Downloaded the numbers as CSV.'); },
  /* print on white paper: the sheets are redrawn with the paper palette in a hidden block that only the printer sees */
  print(){
    const m = BP.model(); if(!m.list.length) return;
    let host = $('bpPrintHost'); if(!host){ host = make('div'); host.id = 'bpPrintHost'; document.body.appendChild(host); }
    host.innerHTML = ['top', 'front', 'side'].map(v => '<div class="pp">' + BP.layoutSheet(m, v, 'paper') + '</div>').join('') + m.list.map(d => '<div class="pp">' + BP.gearSheet(d, 'paper') + '</div>').join('');
    document.body.classList.add('printing-bp');
    const done = () => { document.body.classList.remove('printing-bp'); host.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }
};
})();
