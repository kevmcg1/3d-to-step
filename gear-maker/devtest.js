/* =====================================================================
   Gear Maker: automatic tester (dev tool).
   Press the ` key to open it (or add ?dev=quick|standard|thorough|problems|free to the address).
   It clicks, drags, types and presses keys on its own, and builds, meshes, edits and exports gears
   through the real controls, while it checks that things work (errors, closed meshes, teeth that really
   interleave, the feedback strip agreeing with the model, every control showing the true value, exports and
   saved projects that read back, no leaked memory) and look right (blank 3D view, clipped controls,
   contrast, slow frames). It then says what went right and wrong, with how to reproduce each problem
   and a guess at the cause. Seeded: the same seed gives the same actions.
   Modes: Quick, Standard and Thorough follow a plan (every control of every gear type, every kind of pair,
   every sample, whole flows, random runs) with a percentage bar and a finishing time;
   "Aim at problems" replays what broke before, shrinks each failure to its shortest recipe and hunts around it;
   "Free run" goes on until you stop it.
   ===================================================================== */
(() => {
'use strict';
if (window.GWDev) return;
const GW = window.GW;
if (!GW || !GW.UI) return;
const G = () => GW.Gears, UI = GW.UI, Types = GW.Types, Compat = GW.Compat;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NOW = performance.now.bind(performance);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const yieldNow = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });   // not throttled in a background tab

/* ----------------------------------------------------------------- seeded random */
function rngFrom(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ----------------------------------------------------------------- state of one run */
const T = { running: false, stop: false, rng: Math.random, seed: 1, n: 0, log: [], findings: new Map(), passed: new Map(), counters: {}, mode: 'quick', t0: 0, planTotal: 0, planDone: 0, errors: [], downloads: [], phase: '' };
const find = (kind, sev, title, detail, extra) => {
  const key = kind + '|' + title.replace(/\d+(\.\d+)?/g, '#').slice(0, 90);
  let f = T.findings.get(key);
  if (!f){ f = { kind, sev, title, detail: detail || '', count: 0, first: { n: T.n, seed: T.seed, phase: T.phase, recipe: T.log.slice(-10) }, extra: extra || null }; T.findings.set(key, f); }
  f.count++; if (sev === 'error') f.sev = 'error';
  return f;
};
const ok = name => T.passed.set(name, (T.passed.get(name) || 0) + 1);
const act = (name, args) => { T.n++; T.log.push(`#${T.n} ${name}${args ? ' ' + args : ''}`); if (T.log.length > 200) T.log.shift(); };

/* guesses at the cause, from what kind of check failed */
const GUESS = [
  [/not watertight|open edge|non-?manifold|flipped/i, 'A loft or cap was triangulated from an outline that crosses itself or from holes that touch the teeth. Look at Build.fit() limits and the profile generator for the settings shown.'],
  [/non-finite|NaN/i, 'A division by zero or a value outside a function\'s range (acos / sqrt of a negative) in a builder or in Mount.place.'],
  [/overlap|interfer/i, 'The mounting phase, center distance or tooth profile of this pair is off: see Mount.place for the pair kind and Compat.check for the values it assumes.'],
  [/auto-?fix/i, 'Compat.plan() ended with an error it has no fix for, or a fix it applies undoes another. Check the issue\'s optA / optB values.'],
  [/feedback/i, 'The bottom strip is not redrawn after this kind of change: see UI.mark flags in UI.flush, onChange and renderFeedback.'],
  [/control shows|control value|out of sync/i, 'UI.syncProps is not reached after this change, or a control\'s sync() compares the wrong thing.'],
  [/exception|error|threw/i, 'An uncaught exception: the stack in the detail points at the function.'],
  [/export|stl|obj|step|zip/i, 'The exporter output disagrees with the mesh: check Export.collect (pose) and the writer for this format.'],
  [/project|round trip|save/i, 'toJSON / fromJSON drops or renames a setting, or the links are re-created in a different order.'],
  [/leak|memory|geometr(y|ies) alive/i, 'A geometry or material is not disposed: look at Gears.remove, Scene.updateHelpers and Drives.dispose.'],
  [/blank/i, 'The camera is not framing the gears, or every mesh is hidden or at scale 0 (see Scene.fit / fitPlan and the spawn tween).'],
  [/clipped|overflow|covered/i, 'A control is wider than its sidebar: check the .pr grid columns and the label length at this width.'],
  [/contrast/i, 'Text color is too close to its background.'],
  [/slow frames|took \d+ ms/i, 'A rebuild or the render loop is taking too long: the typical cause is a very high tooth count or quality "Fine".']
];
const guess = f => { const s = f.kind + ' ' + f.title + ' ' + f.detail; const g = GUESS.find(([re]) => re.test(s)); return g ? g[1] : ''; };

/* ----------------------------------------------------------------- capturing errors */
const hooks = { onerr: null, onrej: null, ce: null, cw: null };
function hook(){
  hooks.onerr = e => { if (T.running) { const m = e.message || String(e.error); find('error', 'error', 'Uncaught exception: ' + m.slice(0, 120), (e.error && e.error.stack || '').split('\n').slice(0, 4).join(' | ')); } };
  hooks.onrej = e => { if (T.running) find('error', 'error', 'Unhandled rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0, 120), ''); };
  window.addEventListener('error', hooks.onerr); window.addEventListener('unhandledrejection', hooks.onrej);
  hooks.ce = console.error; hooks.cw = console.warn;
  console.error = function (...a) { if (T.running && !/ERR_TUNNEL|Failed to load resource/.test(a.join(' '))) find('error', 'error', 'console.error: ' + a.join(' ').slice(0, 120), ''); return hooks.ce.apply(console, a); };
  console.warn = function (...a) { if (T.running) find('warn', 'warn', 'console.warn: ' + a.join(' ').slice(0, 120), ''); return hooks.cw.apply(console, a); };
  // exports are captured, not downloaded
  hooks.dl = GW.Export.download; GW.Export.download = (files, name) => { T.downloads.push({ files, name }); };
}
function unhook(){
  window.removeEventListener('error', hooks.onerr); window.removeEventListener('unhandledrejection', hooks.onrej);
  console.error = hooks.ce; console.warn = hooks.cw; if (hooks.dl) GW.Export.download = hooks.dl;
}

/* ----------------------------------------------------------------- driving the page */
const fire = (el, type, init) => { const E = /^pointer/.test(type) ? PointerEvent : MouseEvent; el.dispatchEvent(new E(type, Object.assign({ bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true }, init || {}))); };
const click = el => { if (!el) return false; ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(t => fire(el, t)); el.click(); return true; };
const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
/* let every pending redraw, tween and queued edit finish, as if a second had passed */
function settle(){
  UI.flush(); UI.process();
  GW.Anim.update(NOW() + 1e6);
  GW.Layout.update(0.016); GW.Drives.sync(); GW.Drives.update(); UI.tick();
  UI.process(); GW.Anim.update(NOW() + 1e6);
}
async function dragRange(r, frac){
  fire(r, 'pointerdown'); r.value = (+r.min) + ((+r.max) - (+r.min)) * frac;
  r.dispatchEvent(new Event('input', { bubbles: true })); settle();
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); settle();
}
/* length settings show inches (or millimeters) in the box, while the model keeps millimeters */
const isLenCtl = (g, k) => (Types.PARAMS[k] || Types.LINK_PARAMS[k] || [])[6] === 'mm' || (k === 'rpm' && g.type === 'rack');
const toBox = (g, k, mm) => isLenCtl(g, k) ? GW.Units.d(mm) : mm;
const fromBox = (g, k, v) => isLenCtl(g, k) ? GW.Units.fromD(v) : v;
function typeNum(n, v){ n.focus(); n.value = String(v); n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); n.blur(); settle(); }
function pickOption(sel, i){ sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); settle(); }
const sel = () => UI.sel();
const ctlRows = () => Object.entries(UI.ctl || {}).filter(([k, c]) => c.row && !c.row.classList.contains('off') && c.row.isConnected);
const defaults = type => Types.defaults(type);
/* how a gear differs from a fresh one: the shortest way to say "these settings" */
const diff = g => { const d = defaults(g.type), out = []; Object.keys(d).forEach(k => { if (k !== 'name' && typeof d[k] !== 'object' && d[k] !== g[k] && !/^p[xyz]$|^r[xyz]$/.test(k)) out.push(k + '=' + (typeof g[k] === 'number' ? +g[k].toFixed(3) : g[k])); }); return g.type + (out.length ? ' {' + out.slice(0, 10).join(', ') + '}' : ''); };

/* ----------------------------------------------------------------- the checks */
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

const Check = {
  /* cheap: runs after every action */
  invariants(){
    const L = G().list; let good = true;
    L.forEach(g => {
      const p = g.rt.pos, q = g.rt.quat;
      if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, g.rt.q].every(Number.isFinite)) { good = false; find('invariant', 'error', 'Non-finite pose or angle', diff(g) + (g.parentId ? ' (meshed)' : '')); }
      const pos = g.mesh.geometry.attributes.position;
      if (!pos || pos.count < 12) { good = false; find('invariant', 'error', 'Gear has no geometry', diff(g)); }
      else { g.mesh.geometry.computeBoundingSphere(); if (!Number.isFinite(g.mesh.geometry.boundingSphere.radius)) { good = false; find('invariant', 'error', 'NaN in a gear\'s geometry', diff(g)); } }
      if (g.parentId && !G().get(g.parentId)) { good = false; find('invariant', 'error', 'Gear points at a parent that no longer exists', diff(g)); }
      if (!(g.scale == null || (g.scale > 0 && g.scale < 3))) { good = false; find('invariant', 'warn', 'Gear stuck at an odd scale (' + g.scale + ')', diff(g)); }
    });
    if (G().order.length !== L.length) { good = false; find('invariant', 'error', 'Layout order out of step with the gear list', `${G().order.length} vs ${L.length}`); }
    if (UI.selId != null && !G().get(UI.selId)) { good = false; find('invariant', 'error', 'Selection points at a gear that was removed', ''); }
    L.forEach(g => { if (g.parentId && G().descendants(g.id).some(d => d.id === g.parentId)) { good = false; find('invariant', 'error', 'A loop of parents', diff(g)); } });
    if (good) ok('state is consistent');
  },
  /* the panels agree with the model */
  panels(){
    const g = sel(), L = G().list; let good = true;
    if ($('#gearList') && $$('#gearList .grow').length !== L.length) { good = false; find('feedback', 'error', 'Gear list shows ' + $$('#gearList .grow').length + ' rows for ' + L.length + ' gears', ''); }
    if ($('#gearCount') && +$('#gearCount').textContent !== L.length) { good = false; find('feedback', 'warn', 'Gear counter says ' + $('#gearCount').textContent + ' for ' + L.length + ' gears', ''); }
    const badDots = $$('#gearList .dot.bad').length, wantBad = L.filter(x => { const s = UI.statusOf(x); return s && !s.ok; }).length;
    if (badDots !== wantBad) { good = false; find('feedback', 'error', 'Gear list shows ' + badDots + ' red dots but ' + wantBad + ' meshes are broken', ''); }
    if ($('#empty') && $('#empty').classList.contains('on') !== !L.length) { good = false; find('feedback', 'warn', 'The "nothing on the table" notice is ' + ($('#empty').classList.contains('on') ? 'showing' : 'hidden') + ' with ' + L.length + ' gears', ''); }
    if (g){
      // controls show the real values
      ctlRows().forEach(([k, c]) => {
        const row = c.row, v = g[k];
        const n = $('input.num', row), s = $('select', row), cb = $('input[type=checkbox]', row), r = $('input[type=range]', row);
        if (n && document.activeElement !== n && Number.isFinite(+v) && Math.abs(fromBox(g, k, +n.value) - v) > (isLenCtl(g, k) ? Math.max(0.02, Math.abs(v) * 2e-3) : Math.max(1e-3, Math.abs(v) * 1e-4))) { good = false; find('control', 'error', `Control "${k}" shows ${n.value} but the gear has ${+(+v).toFixed(4)}`, diff(g)); }
        if (r && Number.isFinite(+v) && (+r.value < +r.min - 1e-9 || +r.value > +r.max + 1e-9)) { /* a typed value beyond the slider is clamped by the model: fine */ }
        if (s && String(s.value) !== String(v) && k !== 'type') { good = false; find('control', 'error', `Select "${k}" shows ${s.value} but the gear has ${v}`, diff(g)); }
        if (s && k === 'type' && s.value !== g.type) { good = false; find('control', 'error', `Gear type select shows ${s.value} but the gear is ${g.type}`, diff(g)); }
        if (cb && cb.checked !== !!v) { good = false; find('control', 'error', `Toggle "${k}" shows ${cb.checked} but the gear has ${v}`, diff(g)); }
      });
      // the properties panel is for this gear
      if ($('#props').dataset.id !== String(g.id)) { good = false; find('control', 'error', 'The properties panel belongs to another gear', ''); }
      // every setting of this type has a control (that is the point of the right sidebar)
      const need = Types.TYPES[g.type].keys.concat(Types.ALWAYS).filter(k => Types.PARAMS[k] && (UI.visibleIf(g, k)) && !(g.parentId && /^(p[xyz]|r[xyz]|rpm)$/.test(k)));
      const miss = need.filter(k => !(UI.ctl && UI.ctl[k]));
      if (miss.length) { good = false; find('control', 'error', 'Settings with no control: ' + miss.join(', '), diff(g)); }
      if (!UI.ctl || !UI.ctl.type) { good = false; find('control', 'error', 'The properties panel has no Gear type selector', ''); }
    }
    if (good) ok('panels match the model');
  },
  /* the bottom strip tells the truth */
  feedback(){
    const g = sel(), fb = $('#feedback'); if (!fb) return;
    const title = $('.fb-title', fb); if (!title) { find('feedback', 'error', 'Feedback strip is empty', ''); return; }
    if (!g){ ok('feedback (no selection)'); return; }
    const parent = g.parentId ? G().get(g.parentId) : null, kids = G().children(g.id);
    let wantBad = null;
    if (parent){ const s = UI.statusOf(g); wantBad = !s.ok; }
    else if (kids.length){ wantBad = kids.some(k => { const s = UI.statusOf(k); return s && !s.ok; }); }
    if (wantBad !== null){
      const isBad = fb.classList.contains('bad'), isOk = fb.classList.contains('ok');
      if (wantBad !== isBad || wantBad === isOk) { find('feedback', 'error', `Feedback strip says ${isBad ? 'broken' : isOk ? 'fine' : 'nothing'} but the mesh is ${wantBad ? 'broken' : 'fine'}`, diff(g) + ' | ' + title.textContent); return; }
      if (parent){
        const s = UI.statusOf(g), nerr = s.issues.filter(i => i.level === 'err').length, shown = $$('.need:not(.warn)', fb).filter(n => !/Adjusted to fit/.test(n.textContent)).length;
        if (nerr !== shown) { find('feedback', 'error', `Strip lists ${shown} problems but there are ${nerr}`, diff(g)); return; }
      }
    }
    ok('feedback matches the mesh');
  },
  /* a gear's mesh is a closed solid */
  geometry(g){
    if (!g || !g.mesh) return;
    const a = GW.Geo.analyze(g.mesh.geometry);
    if (a.nan) return find('geometry', 'error', 'NaN in geometry', diff(g));
    const fitted = g.info && g.info.notes && g.info.notes.length;
    if (a.open || a.nonManifold || a.flipped || a.volume <= 0) {
      const f = find('geometry', fitted ? 'warn' : 'warn', `Mesh not watertight (${g.type}): ${a.open} open, ${a.nonManifold} non-manifold, ${a.flipped} flipped edges${a.volume <= 0 ? ', volume ' + a.volume.toFixed(1) : ''}`, diff(g));
      return f;
    }
    ok('meshes are closed solids');
  },
  allGeometry(){ G().list.forEach(g => Check.geometry(g)); },
  /* do the teeth of a meshed pair really interleave? sampled overlap volume at a few angles */
  overlap(P, C, angles){
    const THREE = window.THREE;
    if (!P || !C || C.linkKind !== 'mesh') return;
    const st = UI.statusOf(C); if (!st || !st.ok) return;
    const vol = g => Math.abs(GW.Geo.analyze(g.mesh.geometry).volume);
    const small = Math.min(vol(P), vol(C)); if (!(small > 0)) return;
    const ray = new THREE.Raycaster(), dir = new THREE.Vector3(0.3719, 0.5513, 0.7481).normalize();
    const inside = (mesh, p) => { ray.set(p, dir); ray.far = 1e4; const ds = ray.intersectObject(mesh, false).map(h => h.distance).sort((a, b) => a - b); let n = 0, last = -1; ds.forEach(d => { if (d - last > 1e-4) n++; last = d; }); return n % 2 === 1; };
    const mats = [P.mesh.material.side, C.mesh.material.side]; P.mesh.material.side = C.mesh.material.side = THREE.DoubleSide;
    const saved = G().list.map(x => x.rt.q);
    let worst = 0;
    const root = G().rootOf(P);
    angles.forEach(a => {
      root.rt.q = a; GW.Layout.update(0); G().list.forEach(x => x.mesh.updateMatrixWorld(true));
      const bp = new THREE.Box3().setFromObject(P.mesh), bc = new THREE.Box3().setFromObject(C.mesh);
      const lo = bp.min.clone().max(bc.min), hi = bp.max.clone().min(bc.max);
      if (hi.x <= lo.x || hi.y <= lo.y || hi.z <= lo.z) return;
      let both = 0; const N = 260, rnd = rngFrom(7 + T.n);
      for (let i = 0; i < N; i++) { const pt = new THREE.Vector3(lo.x + (hi.x - lo.x) * rnd(), lo.y + (hi.y - lo.y) * rnd(), lo.z + (hi.z - lo.z) * rnd()); if (inside(P.mesh, pt) && inside(C.mesh, pt)) both++; }
      worst = Math.max(worst, both / N * (hi.x - lo.x) * (hi.y - lo.y) * (hi.z - lo.z) / small);
    });
    G().list.forEach((x, i) => { x.rt.q = saved[i]; }); P.mesh.material.side = mats[0]; C.mesh.material.side = mats[1]; GW.Layout.update(0);
    const limit = st.kind === 'ell' ? 0.03 : 0.015;
    if (worst > limit) find('overlap', 'error', `Meshed ${P.type} + ${C.type} overlap by ${(worst * 100).toFixed(1)}% of the smaller gear while turning`, diff(P) + '  +  ' + diff(C) + `  [${st.kind}]`);
    else ok('meshed teeth interleave');
  },
  overlapAll(){ G().list.filter(g => g.parentId && g.linkKind === 'mesh').forEach(c => Check.overlap(G().get(c.parentId), c, [0.3, 1.4])); },
  /* looks */
  layout(){
    const sides = [['#left', 'left sidebar'], ['#right', 'right sidebar']]; let good = true;
    sides.forEach(([s, name]) => {
      const el = $(s); if (!el || !visible(el)) return;
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2) { good = false; find('layout', 'warn', `The ${name} scrolls sideways`, `scrollWidth ${el.scrollWidth} > ${el.clientWidth}`); }
      $$('input,select,button', el).filter(visible).slice(0, 400).forEach(c => {
        const b = c.getBoundingClientRect(); if (!b.width) return;
        if (b.right > r.right + 1.5 || b.left < r.left - 1.5) { good = false; find('layout', 'warn', `A control is clipped by the ${name}: ${c.id || c.className || c.tagName}`, `${Math.round(b.left)}–${Math.round(b.right)} vs ${Math.round(r.left)}–${Math.round(r.right)}`); }
      });
    });
    $$('.fb-title,.guide-btn span,.pill span').filter(visible).forEach(e => { if (e.scrollWidth > e.clientWidth + 3 && getComputedStyle(e).overflow === 'hidden') { /* ellipsis is intended */ } });
    const fb = $('#feedback'), st = $('#stage');
    if (fb && st && visible(fb)) { const a = fb.getBoundingClientRect(), b = st.getBoundingClientRect(); if (a.height > b.height * 0.8) { good = false; find('layout', 'warn', 'The feedback strip covers most of the stage', `${Math.round(a.height)} of ${Math.round(b.height)} px`); } if (a.left < b.left - 1 || a.right > b.right + 1) { good = false; find('layout', 'warn', 'The feedback strip runs off the stage', ''); } }
    // contrast of the small gray text
    [['.rd span', '.rd'], ['.grow .sub', '.grow'], ['.note', '.side'], ['.pr label', '.pin'], ['.fb-sub', '.fb-head']].forEach(([t, b]) => {
      const e = $(t); if (!e || !visible(e)) return; const bg = e.closest(b) || e.parentElement;
      const c1 = rgb(getComputedStyle(e).color); let c2 = rgb(getComputedStyle(bg).backgroundColor); if (!c2.length || getComputedStyle(bg).backgroundColor === 'rgba(0, 0, 0, 0)') c2 = rgb(getComputedStyle(e.closest('.side,.feedback,.stage') || document.body).backgroundColor);
      if (c1.length && c2.length === 3) { const a = lum(c1), bb = lum(c2), ratio = (Math.max(a, bb) + 0.05) / (Math.min(a, bb) + 0.05); if (ratio < 3) { good = false; find('layout', 'warn', `Low contrast for ${t} (${ratio.toFixed(1)}:1)`, ''); } }
    });
    if (good) ok('layout is tidy');
  },
  blank(){
    const THREE = window.THREE, L = G().list.filter(x => x.mesh.visible); if (!L.length) return;
    const cam = GW.Scene.camera; GW.Scene.updateCam(); cam.updateMatrixWorld(true);
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const inView = L.filter(x => { x.mesh.geometry.computeBoundingSphere(); const s = x.mesh.geometry.boundingSphere.clone().applyMatrix4(x.mesh.matrixWorld); return fr.intersectsSphere(s); });
    const info = `camera target (${GW.Scene.orbit.target.toArray().map(v => v.toFixed(0))}) at distance ${GW.Scene.orbit.dist.toFixed(0)}; gears: ` + L.map(x => `${x.name}@(${x.rt.pos.toArray().map(v => v.toFixed(0))}) s${x.scale}`).slice(0, 6).join('; ');
    if (!inView.length){
      GW.Scene.fit(true); GW.Scene.updateCam();
      return find('view', 'warn', `None of the ${L.length} gears is in the camera's view (Frame everything fixes it)`, info);
    }
    // gears are in view: the canvas must show something
    const cv = GW.Scene.renderer.domElement, S = document.createElement('canvas'); S.width = 64; S.height = 40;
    const cx = S.getContext('2d', { willReadFrequently: true }); GW.Scene.render(); cx.drawImage(cv, 0, 0, 64, 40);
    const dd = cx.getImageData(0, 0, 64, 40).data; let lit = 0; for (let i = 0; i < dd.length; i += 4) if (dd[i + 3] > 20 && (dd[i] + dd[i + 1] + dd[i + 2]) > 120) lit++;
    const big = inView.some(x => { const s = x.mesh.geometry.boundingSphere, v = x.mesh.position.clone().project(cam); const p2 = x.mesh.position.clone().add(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(s.radius)).project(cam); return Math.abs(p2.x - v.x) * 0.5 * cv.clientWidth > 6; });
    if (lit / (64 * 40) < 0.0008 && big) find('view', 'error', `The 3D view draws nothing although ${inView.length} gears are in view`, `${(lit / 25.6).toFixed(2)}% lit; ` + info);
    else ok('3D view shows the gears');
  },
  leaks(){
    const info = GW.Scene.renderer.info.memory;
    let expect = G().list.length; GW.Drives.items.forEach(d => { expect += d.parts.length; }); expect += 8;
    T.leakSeries = (T.leakSeries || []).concat(info.geometries - expect).slice(-4);
    if (T.leakSeries.length >= 3 && T.leakSeries.every(v => v > 3)) find('leak', 'warn', `Geometries alive (${info.geometries}) exceed what is on the table (${expect - 8} + helpers)`, `renderer.info.memory.geometries = ${info.geometries}, textures = ${info.textures}`);
    else ok('no leaked geometry');
  },
  jank(){
    return new Promise(res => {
      if (document.hidden) return res();
      let n = 0, t0 = 0, last = 0; const dts = [];
      const f = t => { if (last) dts.push(t - last); last = t; if (++n < 24) requestAnimationFrame(f); else { dts.sort((a, b) => a - b); const med = dts[dts.length >> 1]; if (med > 70) find('perf', 'warn', `Slow frames: ${med.toFixed(0)} ms each (${G().list.length} gears)`, 'Software rendering looks like this; on a real GPU it should be far faster'); else ok('frames are smooth'); res(); } };
      requestAnimationFrame(f);
      setTimeout(res, 3000);
    });
  },
  /* auto-fix really gets two gears to mesh */
  autofix(A, B, kind){
    const link = { kind: kind === 'same shaft' ? 'shaft' : 'mesh' };
    const r0 = Compat.check(A, B, link); if (!r0.supported) return null;
    const plan = Compat.plan(A, B, link, 'B');
    const A2 = Object.assign({}, A, plan.A), B2 = Object.assign({}, plan.B.type ? Types.convert(B, plan.B.type) : B, plan.B);
    const r = Compat.check(A2, B2, link);
    if (!r.ok) find('autofix', 'error', `Auto-fix cannot make ${A.type} + ${B.type} compatible: ${r.issues.filter(i => i.level === 'err').map(i => i.id).join(', ')}`, diff(A) + '  +  ' + diff(B));
    else ok('auto-fix produces a compatible pair');
    return r.ok;
  },
  exports(scope, pose, format, split){
    const g = sel(); const opts = { format, scope, pose, split, drives: pose === 'world', name: 'devtest' };
    let files;
    try { files = GW.Export.files(opts, g ? g.id : null); } catch (e) { return find('export', 'error', `Export threw (${format}, ${scope}, ${pose}): ${e.message}`, (e.stack || '').split('\n')[1] || ''); }
    if (!G().list.length) return;
    if (!files.length) return find('export', 'error', `Nothing exported (${format}, ${scope}, ${pose})`, '');
    const solids = GW.Export.collect(scope, pose, g ? g.id : null, pose === 'world');
    const tris = GW.Export.stats(solids).tris;
    files.forEach(f => {
      if (!f.data || !f.data.length) return find('export', 'error', `Empty export file ${f.name}`, '');
      const txt = format === 'stla' || format === 'obj' || format === 'step' ? new TextDecoder().decode(f.data.length > 4e6 ? f.data.slice(0, 4e6) : f.data) : '';
      if (format === 'stl' && !split && f.data.length !== 84 + 50 * tris) find('export', 'error', `Binary STL is ${f.data.length} bytes but ${tris} triangles need ${84 + 50 * tris}`, '');
      else if (format === 'stla' && !/^solid/.test(txt)) find('export', 'error', 'ASCII STL does not start with "solid"', '');
      else if (format === 'obj'){ const nv = (txt.match(/^v /gm) || []).length, bad = (txt.match(/^f (\d+) (\d+) (\d+)/gm) || []).some(l => l.split(' ').slice(1).some(i => +i > nv || +i < 1)); if (bad || !nv) find('export', 'error', 'OBJ has a face that points past its vertices (or none)', ''); else ok('exports read back'); }
      else if (format === 'step' && f.data.length < 6e6){
        const full = new TextDecoder().decode(f.data); const def = new Set((full.match(/^#(\d+)=/gm) || []).map(s => s.slice(1, -1)));
        const body = full.slice(full.indexOf('DATA;')); const refs = body.replace(/^#\d+=/gm, '').match(/#\d+/g) || [];
        const missing = refs.find(r => !def.has(r.slice(1)));
        if (!/^ISO-10303-21;/.test(full) || !/END-ISO-10303-21;\s*$/.test(full)) find('export', 'error', 'STEP file header or footer is wrong', '');
        else if (missing) find('export', 'error', 'STEP refers to ' + missing + ' which is never defined', '');
        else ok('exports read back');
      } else ok('exports read back');
    });
    if (files.length > 1 || split){ const z = GW.Zip.make(files.map(f => ({ name: f.name, data: f.data }))); if (z[0] !== 0x50 || z[1] !== 0x4b) find('export', 'error', 'Zip does not start with PK', ''); }
  },
  roundTrip(){
    const sig = () => G().list.map(g => `${g.type}|${g.name}|${g.z}|${+g.m.toFixed(3)}|${g.parentId ? G().get(g.parentId).name : '-'}|${g.linkKind}`).sort().join('\n');
    const before = sig(), selId = UI.selId, j = JSON.parse(GW.History.snap());
    G().clear({ instant: true }); UI.selId = null; G().fromJSON(j); settle();
    const after = sig();
    if (before !== after) find('project', 'error', 'Saving then opening a project changes the gears', `before:\n${before.slice(0, 300)}\nafter:\n${after.slice(0, 300)}`);
    else ok('projects round-trip');
    UI.selId = null; if (G().list[0]) UI.select(G().list[0].id); settle();
  }
};

/* ----------------------------------------------------------------- actions (each drives the real page) */
const rnd = () => T.rng();
const pick = a => a[Math.floor(rnd() * a.length)];
const typeKeys = Object.keys(Types.TYPES);
function after(g){ settle(); Check.invariants(); Check.panels(); Check.feedback(); if (g && g.mesh) Check.geometry(g); }


/* ----------------------------------------------------------------- newer features */
const BRIT = /\b(colours?|centres?|centred|neighbours?|metres?|millimetres?|grey|catalogue|aluminium|behaviour|favourite|organis\w+|normalis\w+|visualis\w+|optimis\w+|analyse|modelled|labelled|cancelled|travelled)\b/i;
Check.features = async function(){
  // the name, and where things live
  if (!/Gear Maker/.test(document.title) || /gearworks|gear lab/i.test(document.title)) find('ui', 'error', 'The page title is not "Gear Maker"', document.title); else ok('named Gear Maker');
  const brand = ($('.brand') || {}).textContent || '', logo = (($('.logo-mark') || {}).textContent || '').replace(/\s+/g, '');
  if (!/GEAR MAKER/.test(brand) || !/GearMaker/i.test(logo)) find('ui', 'error', 'The header or logo does not say Gear Maker', brand + ' / ' + logo);
  if ($('#loadSample') || $('#sampleSel')) find('ui', 'error', 'The old Load button / sample drop-down is still there', '');
  else ok('no Load button');
  const rows = $$('#sampleList .srow');
  if (rows.length !== GW.Presets.length) find('ui', 'error', `The sample list shows ${rows.length} of ${GW.Presets.length} samples`, '');
  rows.forEach(r => { const id = r.dataset.id, p = GW.Presets.find(x => x.id === id); const t = ($('.sx p', r) || {}).textContent || ''; if (!p || !p.why || p.why.length < 80 || t !== p.why) find('ui', 'error', `Sample "${id}" has no plain-language explanation`, ''); if (!$('.sinfo', r) || !$('.sadd', r) || !$('.sbtn', r)) find('ui', 'error', `Sample row "${id}" is missing a button`, ''); });
  const vp = $('#vp'), st = $('#stage');
  if (!vp || !st.contains(vp)) find('layout', 'error', 'The playback bar is not inside the 3D view', '');
  else { ['#undoBtn', '#redoBtn', '#playBtn', '#speedR', '#helpBtn', '#qualSel'].forEach(q => { if (!vp.querySelector(q)) find('layout', 'error', `${q} is not in the 3D view's toolbar`, ''); }); }
  if ($('#left #playBtn') || $('#left #speedR') || $('#left #qualSel') || $('#secView')) find('layout', 'error', 'Playback controls are still in the left sidebar', '');
  if (vp && vp.scrollWidth > vp.clientWidth + 2 && innerWidth > 700) find('layout', 'warn', 'The toolbar in the 3D view is cut off', `${vp.scrollWidth} > ${vp.clientWidth}`);
  // American spelling in everything the person can read
  const txt = [document.title, ...$$('body *').filter(e => visible(e) && e.children.length === 0).map(e => e.textContent), ...GW.Presets.map(p => [p.name, p.note, p.why].join(' ')), ...Object.values(Types.TYPES).map(t => t.label + ' ' + t.desc)].join('\n');
  const m = BRIT.exec(txt); if (m) find('ui', 'error', `British spelling on screen: "${m[0]}"`, ''); else ok('American spelling');
  // sample cards expand
  const r0 = rows[0]; if (r0){ click($('.sinfo', r0)); await sleep(520); const open = r0.classList.contains('open'), h = r0.querySelector('.sx').getBoundingClientRect().height; click($('.sinfo', r0)); await sleep(120); if (!open || h < 20) find('ui', 'error', 'The sample explanation does not open', ''); else ok('sample explanations open'); }
  // status card: icon + outline
  UI.toast('Test message.', 400); await sleep(60); const t = $('#toast'); if (!$('svg.t-ic', t) || !$('.t-ring rect', t) || !/ring/.test(getComputedStyle($('.t-ring rect', t)).animationName)) find('ui', 'error', 'The status card has no icon or no outline animation', ''); else ok('status card icon and outline');
  UI.toast('Could not do that.', 400); await sleep(40); if (!t.classList.contains('bad')) find('ui', 'warn', 'An error message does not get the error icon', ''); await sleep(450);
  // preview card: a solid model, no hologram styling
  UI.openAdd(); settle(); await sleep(200); const card = $('#modal .card[data-t="helical"]'); if (card){ card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); await sleep(500); const pv = $('.pv'); const pc = ((pv && $('.pv-cap b', pv)) || {}).textContent;
    if (!pv || !pv.classList.contains('show') || !pc) find('ui', 'error', 'No preview appears when you point at a gear type', ''); else { const bd = getComputedStyle(pv).borderColor, [r, g, b] = rgb(bd); if (b > 200 && g > 200 && r < 120) find('ui', 'error', 'The preview looks like a cyan hologram', bd); else ok('preview card is a normal solid'); if (/holo/i.test(pv.innerHTML)) find('ui', 'error', 'The preview mentions a hologram', ''); const cv = $('canvas', pv); const px = cv.getContext && null; }
    card.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); await sleep(300); if ($('.pv') && $('.pv').classList.contains('show')) find('ui', 'error', 'The preview stays after the pointer leaves', ''); }
  UI.closeModal(); await sleep(300);
  if (rows[0]){ rows[0].dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); await sleep(500); const pv = $('.pv'); if (!pv || !pv.classList.contains('show')) find('ui', 'error', 'No preview appears when you point at a sample', ''); else ok('sample preview shows'); rows[0].dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); await sleep(250); }
};

Check.undoRedo = async function(){
  await freshTable(); await sleep(450); GW.History.commit();
  const g = G().list[G().list.length - 1], base = GW.History.snap();
  const key = (k, o) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, ctrlKey: true, bubbles: true, cancelable: true }, o || {})));
  const edit = async () => { UI.queue(g, 'thick', (g.thick || 8) + 3, false); UI.flush(); await sleep(520); };
  await edit(); const after1 = GW.History.snap();
  if (after1 === base) { find('history', 'error', 'The test edit changed nothing', ''); return; }
  if ($('#undoBtn').disabled) find('history', 'error', 'The undo button is still disabled after an edit', '');
  click($('#undoBtn')); settle(); await sleep(80);
  if (GW.History.snap() !== base) find('history', 'error', 'The undo button did not restore the previous table', ''); else ok('undo button');
  if ($('#redoBtn').disabled) find('history', 'error', 'The redo button is disabled after an undo', '');
  click($('#redoBtn')); settle(); await sleep(80);
  if (GW.History.snap() !== after1) find('history', 'error', 'The redo button did not bring the change back', ''); else ok('redo button');
  key('z'); settle(); await sleep(80); if (GW.History.snap() !== base) find('history', 'error', 'Ctrl + Z does not undo', ''); else ok('Ctrl+Z');
  key('y'); settle(); await sleep(80); if (GW.History.snap() !== after1) find('history', 'error', 'Ctrl + Y does not redo', ''); else ok('Ctrl+Y');
  key('z'); settle(); await sleep(60); key('z', { shiftKey: true }); settle(); await sleep(60); if (GW.History.snap() !== after1) find('history', 'error', 'Ctrl + Shift + Z does not redo', '');
  // a new edit after an undo drops the redo branch; deleting and adding come back too
  key('z'); settle(); await sleep(80); const n0 = G().list.length; Act.addGear && await Act.addGear('spur'); await sleep(520); if (G().list.length !== n0 + 1) find('history', 'warn', 'The test gear was not added', '');
  key('z'); settle(); await sleep(100); if (G().list.length !== n0) find('history', 'error', 'Undo does not take back an added gear', `${G().list.length} gears, expected ${n0}`); else ok('undo an added gear');
  if (!$('#redoBtn').disabled && false) {}
  key('y'); settle(); await sleep(100); if (G().list.length !== n0 + 1) find('history', 'error', 'Redo does not bring back the added gear', '');
  // typing in a text box must keep its own undo
  const nm = $('#props input[type=text]'); if (nm){ nm.focus(); const had = GW.History.snap(); nm.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); settle(); if (GW.History.snap() !== had) find('history', 'warn', 'Ctrl + Z inside a text box undoes the table instead of the text', ''); nm.blur(); }
  Check.invariants(); Check.panels(); Check.feedback();
};

Check.rackStroke = async function(){
  const prev = [G().spin, G().speed]; G().clear({ instant: true }); GW.Presets.find(p => p.id === 'rack').build(0, 0); settle();
  const R = G().list.find(g => g.type === 'rack'); G().spin = true; G().speed = 1;
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(R.rt.quat); let lo = 1e9, hi = -1e9, flips = 0, last = null, dir = 0;
  for (let i = 0; i < 4000; i++){ GW.Layout.update(1 / 30); const x = R.mesh.position.dot(axis); lo = Math.min(lo, x); hi = Math.max(hi, x); if (last != null && Math.abs(x - last) > 1e-9){ const d = Math.sign(x - last); if (dir && d !== dir) flips++; dir = d; } last = x; }
  const L = R.z * Math.PI * R.m;
  if (flips < 2) find('rack', 'error', 'The rack slides one way forever instead of back and forth', `${flips} reversals`); else if (hi - lo > L) find('rack', 'error', 'The rack travels farther than its own length', `${(hi - lo).toFixed(0)} mm of ${L.toFixed(0)} mm`); else ok('rack goes back and forth');
  G().spin = prev[0]; G().speed = prev[1];
};

/* the page at laptop and phone sizes, in iframes (so the media queries really apply) */
Check.responsive = async function(){
  for (const [w, h] of [[1280, 720], [1024, 700], [820, 1180], [390, 844], [360, 640]]){
    if (T.stop) return;
    const f = document.createElement('iframe'); f.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;border:0`; f.src = location.pathname + '?frame=1'; document.body.appendChild(f);
    await new Promise(r => { f.onload = r; setTimeout(r, 6000); }); await sleep(1800);
    try {
      const d = f.contentDocument, W = f.contentWindow; const q = x => d.querySelector(x); const where = `${w}x${h}`;
      if (!q('#vp')) { find('layout', 'error', `The page did not start at ${where}`, ''); }
      else {
        if (d.documentElement.scrollWidth > w + 1) find('layout', 'error', `The page scrolls sideways at ${where}`, `${d.documentElement.scrollWidth} > ${w}`);
        const vb = q('#vp').getBoundingClientRect(); if (vb.left < -1 || vb.right > w + 1) find('layout', 'error', `The toolbar leaves the screen at ${where}`, '');
        const vv = q('#views').getBoundingClientRect(); if (vv.right > w + 1 || vv.bottom > h) find('layout', 'error', `The view buttons leave the screen at ${where}`, '');
        if (vb.right > vv.left + 1 && vb.bottom > vv.top && vb.top < vv.bottom) find('layout', 'warn', `The toolbar overlaps the view buttons at ${where}`, '');
        ['#addBtn', '#exportBtn', '#resetAll'].forEach(x => { const b = q(x).getBoundingClientRect(); if (b.right > w + 1 || b.left < -1) find('layout', 'error', `${x} is off screen at ${where}`, ''); });
        const fb = q('#feedback').getBoundingClientRect(); if (fb.height > h * 0.55) find('layout', 'warn', `The feedback strip covers ${(fb.height / h * 100).toFixed(0)}% of the screen at ${where}`, '');
        if (w <= 980){ q('#openLeft').click(); await sleep(900); const lb = q('#left').getBoundingClientRect(); if (lb.left < -1 || lb.right > w + 1) find('layout', 'error', `The left drawer does not fit at ${where}`, ''); q('#scrim').click(); await sleep(700); q('#openRight').click(); await sleep(900); const rb = q('#right').getBoundingClientRect(); if (rb.left < -1 || rb.right > w + 1) find('layout', 'error', `The right drawer does not fit at ${where}`, ''); q('#scrim').click(); await sleep(400); }
        else if (q('#left').getBoundingClientRect().right > w * 0.4) find('layout', 'warn', `The left column is wider than 40% at ${where}`, '');
        ok(`responsive at ${where}`);
      }
    } catch (e) { find('layout', 'error', 'Responsive check failed: ' + e.message, ''); }
    f.remove(); await sleep(100);
  }
};


/* ----------------------------------------------------------------- units, camera, colors, honest status */
Check.units = async function(){
  await freshTable(); const g = sel(), U2 = GW.Units, btn = $('#unitBtn');
  if (!btn) { find('ui', 'error', 'There is no units button', ''); return; }
  if (U2.mode !== 'in') { click(btn); settle(); }
  if (U2.mode !== 'in' || !/IN/i.test(btn.textContent)) find('units', 'error', 'The units do not start in inches', btn.textContent);
  const bare = (txt, unit) => { const t = txt.replace(/\([^)]*\)/g, ''); const m = unit === 'mm' ? /\d\s?mm\b/.exec(t) : /\d\s?in\b(?!g)/.exec(t); return m ? m[0] : null; };
  const scan = (where) => {
    ['#feedback', '#props'].forEach(sel2 => { const el = $(sel2); if (!el) return; const txt = el.innerText || ''; const b = bare(txt, where === 'in' ? 'mm' : 'in'); if (b) find('units', 'error', `A length is shown in ${where === 'in' ? 'millimeters' : 'inches'} with no ${where === 'in' ? 'inch' : 'metric'} value beside it (${b})`, sel2); });
  };
  // every length box agrees with the model, and shows the other unit in parentheses
  settle(); let bad = 0;
  ctlRows().forEach(([k, c]) => { if (!isLenCtl(g, k)) return; const n = $('input.num', c.row), mv = $('.mmv', c.row); if (!n || !mv) return; const mm = fromBox(g, k, +n.value); if (Math.abs(mm - g[k]) > Math.max(0.02, Math.abs(g[k]) * 2e-3)) { bad++; find('units', 'error', `"${k}" shows ${n.value} in but the gear has ${g[k]} mm`, ''); } if (!/^\(.*mm(\/s)?\)$/.test(mv.textContent)) { bad++; find('units', 'error', `"${k}" has no metric value in parentheses`, mv.textContent); } if (!/^in(\/s)?$/.test(($('.un', c.row) || {}).textContent)) { bad++; find('units', 'error', `"${k}" is not labeled in inches`, ''); } });
  scan('in');
  // typing an inch value sets the right number of millimeters
  const thick = $('input.num', UI.ctl.thick.row); typeNum(thick, 0.5); settle(); if (Math.abs(g.thick - 12.7) > 0.01) find('units', 'error', `Typing 0.5 in made the thickness ${g.thick} mm, not 12.7`, ''); else ok('typing inches');
  // the other way round
  click(btn); settle(); await sleep(120);
  if (U2.mode !== 'mm' || !/MM/i.test(btn.textContent)) find('units', 'error', 'The units button does not switch to millimeters', ''); else { const n = $('input.num', UI.ctl.thick.row); if (Math.abs(+n.value - g.thick) > 0.01) find('units', 'error', 'In millimeter mode the thickness box does not show millimeters', n.value); scan('mm'); ok('units switch'); }
  click(btn); settle(); await sleep(80);
  if (U2.mode !== 'in') find('units', 'error', 'The units button does not switch back to inches', '');
};

Check.camera = async function(){
  await freshTable(); const S = GW.Scene;
  if (!S.camera.isOrthographicCamera) { find('camera', 'error', 'The main view is not orthographic', S.camera.type); return; }
  ok('main view is orthographic');
  const THREE = window.THREE;
  const frameOf = () => {
    const r = S.renderer.domElement.getBoundingClientRect(), w = r.width, h = r.height, top = S.insetTop(), bot = S.insetBottom(), right = S.insetRight();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const v = new THREE.Vector3();
    S.camera.updateMatrixWorld(true);
    G().list.filter(g => g.mesh.visible).forEach(g => { g.mesh.updateMatrixWorld(true); const pos = g.mesh.geometry.attributes.position, st = Math.max(1, Math.floor(pos.count / 1500)); for (let i = 0; i < pos.count; i += st){ v.fromBufferAttribute(pos, i).applyMatrix4(g.mesh.matrixWorld).project(S.camera); const px = (v.x * .5 + .5) * w, py = (-v.y * .5 + .5) * h; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); } });
    return { x0, x1, y0, y1, w, h, top, bot, right };
  };
  for (const view of ['iso', 'top', 'front', 'fit']){
    if (view === 'fit') S.fit(); else S.view(view);
    await sleep(1200); settle();
    const f = frameOf(), tol = 3;
    // the strip along the bottom may have changed height while the camera moved: wait for it to settle
    await sleep(500); const f2 = frameOf();
    const cut = f2.x0 < -tol || f2.x1 > f2.w - f2.right + tol || f2.y0 < f2.top - tol - 2 || f2.y1 > f2.h - f2.bot + tol;
    if (cut) find('camera', 'error', `The ${view} view cuts something off or hides it behind the toolbar or strip`, `x ${f2.x0.toFixed(0)}–${f2.x1.toFixed(0)} of ${f2.w.toFixed(0)}, y ${f2.y0.toFixed(0)}–${f2.y1.toFixed(0)} within ${f2.top.toFixed(0)}–${(f2.h - f2.bot).toFixed(0)}`);
    const fillX = (f2.x1 - f2.x0) / Math.max(1, f2.w - f2.right), fillY = (f2.y1 - f2.y0) / Math.max(1, f2.h - f2.bot - f2.top);
    if (Math.max(fillX, fillY) < 0.82) find('camera', 'error', `The ${view} view is farther away than it needs to be (fills ${(Math.max(fillX, fillY) * 100).toFixed(0)}% of the free space)`, '');
    if (!cut && Math.max(fillX, fillY) >= 0.82) ok(`${view} view is snug and complete`);
  }
};

Check.sampleColors = function(p){
  const cols = G().list.map(g => String(g.color).toLowerCase());
  if (new Set(cols).size !== cols.length) find('sample', 'error', `Sample "${p.name}" has gears with the same color`, `${cols.length - new Set(cols).size} repeated`); else ok('every gear in a sample has its own color');
};

Check.status = async function(){
  await freshTable(); const c = sel(), P = G().get(c.parentId);
  const read = () => { c._st = null; UI._sv++; settle(); const v = UI.statusOf(c); return v; };
  if (!read().ok) { find('status', 'error', 'The starting pair does not read as meshing', ''); return; }
  // pull the gears apart with the extra center distance: it must stop reading as meshing, and the strip must say so
  UI.queue(c, 'meshOffset', 4, false); UI.flush(); settle(); await sleep(60);
  const v = read(); if (v.ok || !v.issues.some(i => i.id === 'apart')) find('status', 'error', 'Gears pulled 4 mm apart still read as meshing', JSON.stringify(v.issues.map(i => i.id)));
  else { const strip = $('#feedback').innerText; if (!/extra center distance/i.test(strip)) find('status', 'error', 'The strip does not explain that the gears are pulled apart', ''); else ok('pulled-apart gears are reported'); }
  UI.queue(c, 'meshOffset', 0, false); UI.flush(); settle(); if (!read().ok) find('status', 'error', 'Putting the extra distance back did not clear the warning', '');
  // odd tooth shapes: whatever the numbers say, the real shapes must not be allowed to collide silently
  for (const [who, k, val] of [[P, 'pa', 28], [c, 'ha', 1.5], [P, 'backlash', 0.8], [c, 'x', 0.8], [P, 'hf', 0.9], [c, 'fillet', 0.5]]){
    const old = who[k]; UI.queue(who, k, val, false); UI.flush(); settle(); await sleep(40);
    const st = read(); if (st.ok){ const ov = GW.Collide.overlap(P, c); if (ov > GW.Collide.limit(st.kind) * 1.5) find('status', 'error', `Reads as meshing but the real shapes overlap ${(ov * 100).toFixed(1)}% after setting ${k}=${val}`, diff(P) + ' + ' + diff(c)); else ok('status agrees with the real shapes'); }
    UI.queue(who, k, old, false); UI.flush(); settle();
  }
};

Check.sidebars = function(){
  const bands = ['#secSamples', '#secGears', '#secProject'].map(q => $(q)).filter(Boolean);
  const bad = bands.filter(e => !/gradient/.test(getComputedStyle(e).backgroundImage) || getComputedStyle(e).boxShadow === 'none');
  if (bad.length) find('layout', 'error', 'A left sidebar section is not a colored band: ' + bad.map(e => e.id).join(', '), '');
  const cols = new Set(bands.map(e => getComputedStyle(e).getPropertyValue('--sc').trim()));
  if (cols.size < bands.length) find('layout', 'error', 'The left sidebar sections do not each have their own color', [...cols].join(' '));
  const grps = $$('#props .grp'); const gbad = grps.filter(e => !/gradient/.test(getComputedStyle(e).backgroundImage));
  if (gbad.length) find('layout', 'error', 'A right sidebar group is not a colored band: ' + gbad.map(e => e.dataset.g).join(', '), ''); else if (grps.length) ok('sidebars are colored bands');
};


Check.materials = async function(){
  await freshTable(); UI.endDrag(); const g = sel(); const fin = UI.ctl.finish && $('select', UI.ctl.finish.row);
  if (!fin) { find('materials', 'error', 'There is no Finish selector', ''); return; }
  const expect = { brassM: 'turned', steelM: 'turned', aluM: 'brushed', plaP: 'layers', brass: 'smooth' };
  for (const [f, surf] of Object.entries(expect)){
    pickOption(fin, [...fin.options].findIndex(o => o.value === f)); settle(); await sleep(60); settle();
    const m = g.mesh.material, hasUv = !!g.mesh.geometry.attributes.uv;
    if (g.surface !== surf) find('materials', 'error', `Finish "${f}" did not set the ${surf} surface`, g.surface);
    else if (surf !== 'smooth' && (!m.bumpMap || !hasUv)) find('materials', 'error', `Finish "${f}" has no texture on the mesh`, `bump ${!!m.bumpMap}, uv ${hasUv}`);
    else if (surf === 'smooth' && m.bumpMap) find('materials', 'error', 'A smooth finish still has a texture', '');
    else ok('material textures');
  }
  // the surface can also be chosen on its own, and survives a rebuild
  const sf = UI.ctl.surface && $('select', UI.ctl.surface.row); if (!sf) { find('materials', 'error', 'There is no Surface texture selector', ''); return; }
  pickOption(sf, [...sf.options].findIndex(o => o.value === 'layers')); settle(); UI.queue(g, 'thick', g.thick + 1, false); UI.flush(); settle(); await sleep(50);
  if (!g.mesh.material.bumpMap || !g.mesh.geometry.attributes.uv) find('materials', 'error', 'The texture is lost when the gear is rebuilt', ''); else ok('texture survives a rebuild');
};

Check.matchExplain = async function(){
  await freshTable(); const P = G().list.find(g => g.name === 'Driver'), C = G().list.find(g => g.name === 'Driven');
  UI.select(P.id); settle(); UI.queue(P, 'm', 3, false); UI.queue(P, 'pa', 25, false); UI.flush(); settle(); await sleep(100); settle();
  const btnE = $('#feedback [data-act="explain"]'), btnM = $('#feedback [data-act="match"]');
  if (!btnE || !btnM) { find('match', 'error', 'No "Change other gears to match" / "Explain why" buttons when a meshed gear no longer fits', ''); return; }
  const before = GW.History.snap();
  click(btnE); settle(); const m1 = $('#modal').innerText;
  if (!/What clashes/i.test(m1) || !/module/i.test(m1) || !/pressure angle/i.test(m1)) find('match', 'error', 'The explanation does not describe the module and pressure angle clash', m1.slice(0, 160));
  else if (!/Option A/.test(m1) || !/Option B/.test(m1) || !/Option C/.test(m1) || !/Option D/.test(m1) || !$('#modal [data-ap]')) find('match', 'error', 'The explanation does not list every option (A to D) with Apply buttons', m1.slice(0, 200));
  else if (!/After this the pair fits/.test(m1)) find('match', 'error', 'No option says it makes the pair fit', m1.slice(0, 200));
  else ok('explanation lists every option');
  if (/\d in \([^)]*\d in \(/.test(m1)) find('units', 'error', 'The explanation shows nested units like "in (x in (y mm))"', '');
  if (GW.History.snap() !== before) find('match', 'error', '"Explain why" changed the table', '');
  else ok('explain changes nothing');
  click($('#mOk')); settle();
  click($('#feedback [data-act="match"]')); settle(); await sleep(120); settle();
  const m2 = $('#modal').innerText;
  if (P.m !== 3 || P.pa !== 25) find('match', 'error', 'Matching changed the gear that was edited', `m ${P.m}, pa ${P.pa}`);
  else if (C.m !== 3 || C.pa !== 25) find('match', 'error', 'The other gear was not changed to match', `m ${C.m}, pa ${C.pa}`);
  else if (!/now match/i.test(m2) || !/Module/.test(m2)) find('match', 'error', 'There is no report of what was changed', m2.slice(0, 160));
  else if (!UI.statusOf(C).ok) find('match', 'error', 'After matching, the pair still does not fit', '');
  else ok('match other gears');
  click($('#mUndo')); settle(); await sleep(150); settle();
  const P2 = G().list.find(g => g.name === 'Driver'), C2 = G().list.find(g => g.name === 'Driven');
  if (!(P2 && C2 && P2.m === 3 && C2.m === 2)) find('match', 'error', '"Undo these changes" did not put the other gear back', `driver m ${P2 && P2.m}, driven m ${C2 && C2.m}`); else ok('match can be undone');
};

Check.performance = async function(){
  await freshTable(); const S = GW.Scene, fr = () => S.renderer.info.render.frame, prev = G().spin;
  UI.endDrag(); UI.setPlaying(false);
  { let n = 0; while (GW.Anim.list.length && n++ < 40) await sleep(200); if (GW.Anim.list.length) find('speed', 'error', 'Something keeps animating for 8 seconds with nothing happening', 'tweens ' + GW.Anim.list.map(t => t.key || '?').join(',')); }
  await sleep(2600);                                     // the last few frames of a fade, then it must go quiet
  const a = fr(); const s0 = (S._sig || '').split('|'); await sleep(1500); const idle = fr() - a; const s1 = (S._sig || '').split('|');
  const names = ['theta', 'phi', 'dist', 'target x', 'target y', 'target z', 'strip height', 'width', 'height', 'layout version', 'selection', 'hover', 'grid', 'settings', 'grid fade', 'animations'];
  if (idle > 5) find('speed', 'error', `The 3D view keeps redrawing while nothing moves (${idle} frames in 1.5 s)`, 'changing: ' + (s0.map((v, i) => v !== s1[i] ? names[i] : null).filter(Boolean).join(', ') || 'nothing in the signature (wake counter ' + S._wake + ', ' + G().list.length + ' gears, tweens ' + GW.Anim.list.length + ')'));
  else ok('idle view does not redraw');
  UI.setPlaying(true); await sleep(300); const b = fr(); await sleep(1000); const live = fr() - b;
  if (live < 3) find('speed', 'error', `The view barely redraws while the gears spin (${live} frames in 1 s)`, '');
  UI.setPlaying(false); await sleep(1200); UI.select(G().list[0].id); await sleep(100); const c = fr(); await sleep(700);
  if (fr() - c < 1) find('speed', 'error', 'Selecting a gear does not redraw the view', ''); else ok('changes redraw');
  UI.setPlaying(prev);
  if (S.lite && GW.Perf.lite && S.renderer.getPixelRatio() > 1) find('speed', 'warn', 'Light mode is on but the view still renders at more than one pixel per pixel', '');
};


Check.labels = async function(){
  await freshTable(); await sleep(300); settle();
  const labs = $$('#glabels .glabel'), n = G().list.length;
  if (labs.length !== n) find('labels', 'error', `${labs.length} labels for ${n} gears`, ''); 
  const roles = labs.map(l => ($('b', l) || {}).textContent);
  if (!roles.includes('Driver') || !roles.includes('Driven')) find('labels', 'error', 'The labels do not say which gear is the driver and which is driven', roles.join(', '));
  const st = $('#stage').getBoundingClientRect();
  labs.forEach(l => { const b = l.getBoundingClientRect(); if (l.style.display === 'none' || b.width < 10) find('labels', 'error', 'A gear label is hidden', l.textContent); else if (b.right < st.left - 4 || b.left > st.right + 4 || b.bottom < st.top - 4 || b.top > st.bottom + 4) find('labels', 'error', 'A gear label is outside the 3D view', l.textContent); });
  // the label follows its gear: the same driver label sits above the driver gear
  const drv = G().list.find(g => !g.parentId), v = drv.mesh.position.clone().project(GW.Scene.camera), cr = GW.Scene.renderer.domElement.getBoundingClientRect();
  const gx = cr.left + (v.x * .5 + .5) * cr.width; const lab = labs.find(l => /Driver/.test(l.textContent)); if (lab){ const b = lab.getBoundingClientRect(); if (Math.abs((b.left + b.right) / 2 - gx) > 40) find('labels', 'error', 'The driver label is not over the driver gear', `${Math.round((b.left + b.right) / 2)} vs ${Math.round(gx)}`); else ok('labels sit on their gears'); }
  // the toggle
  click($('#labelBtn')); settle(); await sleep(350); if (parseFloat(getComputedStyle($('#glabels')).opacity) > 0.1) find('labels', 'error', 'The label button does not hide the labels', ''); click($('#labelBtn')); settle(); await sleep(350);
  // adding a gear labels it, removing one removes the label
  await Act.addGear('spur'); await sleep(250); settle(); if ($$('#glabels .glabel').length !== G().list.length) find('labels', 'error', 'A new gear did not get a label', ''); else ok('every gear is labeled');
};

Check.tolerance = async function(){
  await freshTable(); const g = sel(), T2 = GW.Tol; const sel2 = UI.ctl.tolerance && $('select', UI.ctl.tolerance.row);
  if (!sel2 || !$('#bestFit')) { find('tolerance', 'error', 'The Tolerance section has no process selector or best-fit button', ''); return; }
  const vol = x => Math.abs(GW.Geo.analyze(x.mesh.geometry).volume);
  pickOption(sel2, [...sel2.options].findIndex(o => o.value === 'ideal')); settle(); await sleep(60); const v0 = vol(g);
  pickOption(sel2, [...sel2.options].findIndex(o => o.value === 'fdm')); settle(); await sleep(60); settle(); const v1 = vol(g);
  if (!(v1 < v0 - 1e-6)) find('tolerance', 'error', 'A printed (FDM) part has the same bore as an ideal one', `${v0.toFixed(2)} vs ${v1.toFixed(2)}`); else ok('process changes the bore');
  if (!/Bore is cut/.test($('#tolNums').textContent)) find('tolerance', 'error', 'The Tolerance section does not show the bore allowance', $('#tolNums').textContent);
  G().list.forEach(x => { x.backlash = 0.02; }); UI._sv++; settle();
  click($('#bestFit')); settle(); await sleep(80); settle();
  const bad = G().list.filter(x => x.tolerance !== 'fdm' || x.backlash < T2.minBacklash(x) - 1e-6);
  if (bad.length) find('tolerance', 'error', 'Best-fit tolerances did not set every gear', bad.map(x => x.name).join(', ')); else ok('best-fit tolerances');
  const st = UI.statusOf(g.parentId ? g : G().children(g.id)[0] || g); if (st && st.issues.some(i => i.id === 'backlash')) find('tolerance', 'error', 'A backlash warning is left after best-fit', '');
};

const Act = {
  async addGear(type){ act('add gear', type); click($('#addBtn')); settle(); const card = $(`#modal .card[data-t="${type || pick(typeKeys)}"]`); if (!card) { find('ui', 'error', 'Add dialog is missing a gear type', type); UI.closeModal(); return; } click(card); settle(); after(sel()); },
  async loadSample(replace){ const p = pick(GW.Presets); act('sample', p.id + (replace ? ' (replace)' : ' (add)')); click($(replace ? `#sampleList .sbtn[data-id="${p.id}"]` : `#sampleList .sadd[data-id="${p.id}"]`)); await sleep(replace ? 420 + 40 * 38 : 50); settle(); await sleep(60); settle(); after(sel()); },
  async selectGear(){ const L = G().list; if (!L.length) return; const g = pick(L); act('select', g.name); const row = $$('#gearList .grow')[ UI.rowOrder().indexOf(g.id) ]; click(row || null); settle(); after(sel()); },
  async clickCanvas(){ const L = G().list.filter(g => g.mesh.visible); if (!L.length) return; const g = pick(L); act('click gear in 3D', g.name); const v = g.mesh.position.clone().project(GW.Scene.camera), r = GW.Scene.renderer.domElement.getBoundingClientRect(); const x = r.left + (v.x * .5 + .5) * r.width, y = r.top + (-v.y * .5 + .5) * r.height; const cv = GW.Scene.renderer.domElement; ['pointerdown', 'pointerup'].forEach(t => fire(cv, t, { clientX: x, clientY: y })); settle(); after(sel()); },
  async editControl(){
    const g = sel(); if (!g) return Act.selectGear();
    const rows = ctlRows().filter(([k]) => k !== 'type' && k !== 'name'); if (!rows.length) return;
    const [k, c] = pick(rows), row = c.row, n = $('input.num', row), r = $('input[type=range]', row), s = $('select', row), cb = $('input[type=checkbox]', row), col = $('input[type=color]', row);
    const t0 = NOW();
    if (r && n){ if (rnd() < 0.5){ const f = rnd(); act('drag', k + ' to ' + f.toFixed(2)); await dragRange(r, f); } else { const rg = Types.range(g.type, k), v = rg[0] + (rg[1] - rg[0]) * rnd(); act('type', k + ' = ' + v.toFixed(2)); typeNum(n, +toBox(g, k, v).toFixed(4)); } }
    else if (s){ const i = Math.floor(rnd() * s.options.length); act('choose', k + ' = ' + s.options[i].value); pickOption(s, i); }
    else if (cb){ act('toggle', k); click(cb); cb.dispatchEvent(new Event('change', { bubbles: true })); settle(); }
    else if (col){ act('color', k); col.value = '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0'); col.dispatchEvent(new Event('input', { bubbles: true })); settle(); }
    const dt = NOW() - t0; if (dt > 600) find('perf', 'warn', `A change to "${k}" took ${dt.toFixed(0)} ms (${g.type})`, diff(g));
    after(G().get(g.id));
  },
  async changeType(){ const g = sel(); if (!g) return; const s = $('#props .ph-type select'); if (!s){ find('ui', 'error', 'No gear type selector in the properties header', ''); return; } const t = pick(typeKeys); act('type of gear', g.type + ' → ' + t); s.value = t; s.dispatchEvent(new Event('change', { bubbles: true })); settle(); after(sel()); },
  async renameGear(){ const g = sel(); if (!g) return; const i = $('.ph-top input.txt'); if (!i) return; act('rename'); i.value = 'T' + T.n; i.dispatchEvent(new Event('input', { bubbles: true })); settle(); if (g.name !== 'T' + T.n) find('control', 'error', 'Renaming a gear does not stick', ''); after(g); },
  async meshViaPanel(){
    const g = sel(); if (!g || G().list.length < 2) return;
    const host = $('#connHost'); if (!host) return;
    const selects = $$('select', host), partnerSel = selects.find(s => s.options.length && [...s.options].some(o => /—/.test(o.text)));
    if (!partnerSel) return;
    const i = Math.floor(rnd() * partnerSel.options.length); act('partner', partnerSel.options[i].text.slice(0, 24)); pickOption(partnerSel, i);
    if (rnd() < 0.2){ const ks = $$('#connHost select').find(s => [...s.options].some(o => /Same shaft/.test(o.text))); if (ks){ act('connection kind: same shaft'); pickOption(ks, 1); } }
    const go = $$('#connHost .cbtns .go')[0]; if (go){ act('click', go.textContent); click(go); settle(); }
    after(sel());
  },
  async stripButton(){
    const bs = $$('#fbInner .mini').filter(visible); if (!bs.length) return; const b = pick(bs); act('strip', b.textContent.trim().slice(0, 30)); click(b); settle(); after(sel());
  },
  async stripChip(){ const cs = $$('#fbInner .cand,#fbInner [data-goto]'); if (!cs.length) return; const c = pick(cs); act('strip chip', c.textContent.trim()); click(c); settle(); after(sel()); },
  async matching(){ const bs = $$('#connHost .chips .chip'); if (!bs.length) return; const b = pick(bs); act('add matching', b.textContent.trim()); click(b); settle(); after(sel()); },
  async unmesh(){ const b = $$('#connHost .cbtns button').find(x => /Un-mesh/.test(x.textContent)); if (!b) return; act('un-mesh'); click(b); settle(); after(sel()); },
  async duplicate(){ const b = $('.ph-act button[aria-label^="Duplicate"]'); if (!b) return; act('duplicate'); click(b); settle(); after(sel()); },
  async remove(){ if (G().list.length < 2) return; const b = $('.ph-act button[aria-label^="Delete"]'); if (!b) return; act('delete'); click(b); settle(); after(sel()); },
  async eye(){ const e = $$('#gearList .eye'); if (!e.length) return; act('hide/show'); click(pick(e)); settle(); after(sel()); },
  async playback(){
    const w = pick(['play', 'speed', 'help', 'grid2', 'quality', 'view', 'undo']);
    if (w === 'play'){ act('play/pause'); click($('#playBtn')); } else if (w === 'speed'){ act('speed'); await dragRange($('#speedR'), rnd()); } else if (w === 'help'){ act('pitch circles'); click($('#helpBtn')); } else if (w === 'grid2'){ act('grid (stage button)'); click($('#gridQuick')); settle(); const off = !GW.Scene.gridOn; if (GW.Scene.grid.visible === off || $('#gridQuick').getAttribute('aria-pressed') !== String(GW.Scene.gridOn)) find('ui', 'error', 'The two grid buttons disagree with the grid', ''); else ok('the grid switch works'); }
    else if (w === 'quality'){ const q = $('#qualSel'); const i = Math.floor(rnd() * 2); act('quality', q.options[i].text); pickOption(q, i); }
    else if (w === 'undo'){ act('undo / redo'); await sleep(450); const before = GW.History.snap(); const had = !$('#undoBtn').disabled; click(had ? $('#undoBtn') : $('#redoBtn')); settle(); await sleep(60); settle(); if (had && !$('#redoBtn').disabled) { click($('#redoBtn')); settle(); await sleep(60); settle(); if (GW.History.snap() !== before) find('history', 'error', 'Undo then redo did not bring the table back', ''); else ok('undo/redo round trip'); } after(sel()); }
    else { const b = pick($$('#views [data-view]')); act('view', b.dataset.view); click(b); }
    settle(); Check.invariants();
  },
  async strip(){ act('collapse strip'); click($('#fbToggle')); settle(); Check.panels(); },
  async keys(){ const k = pick([' ', 'f', 'g', 'Escape', 'ctrl+z', 'ctrl+y']); act('key', JSON.stringify(k)); const before = G().spin; document.dispatchEvent(new KeyboardEvent('keydown', k.startsWith('ctrl+') ? { key: k.slice(5), ctrlKey: true, bubbles: true, cancelable: true } : { key: k, bubbles: true })); settle(); if (k === ' ' && G().spin === before) find('ui', 'error', 'The space bar does not pause and play', ''); else if (k === ' ') { ok('keyboard shortcuts work'); UI.setPlaying(before); } },
  async exportDialog(){
    act('export dialog'); click($('#exportBtn')); settle();
    const m = $('#modal'); if (!$('#xGo', m)){ find('ui', 'error', 'The export dialog did not open', ''); return; }
    const fmt = pick(['stl', 'stla', 'obj', 'step']), scope = sel() ? pick(['selected', 'assembly', 'all']) : 'all', pose = pick(['world', 'flat']);
    [['format', fmt], ['scope', scope], ['pose', pose]].forEach(([n, v]) => { const r = $(`input[name="${n}"][value="${v}"]`, m); if (r){ r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); } });
    const info = $('#xInfo', m).textContent; const solids = GW.Export.collect(scope, pose, UI.selId, pose === 'world'); const tris = GW.Export.stats(solids).tris;
    if (G().list.length && !new RegExp(tris.toLocaleString().replace(/[,.]/g, '[,.]?') + ' triangles').test(info) && solids.length) find('export', 'error', `Export dialog says "${info}" but there are ${tris} triangles`, `${fmt} ${scope} ${pose}`);
    T.downloads.length = 0; if (!$('#xGo', m).disabled) click($('#xGo', m)); settle();
    if (G().list.length && !T.downloads.length) find('export', 'error', 'The Download button produced no file', `${fmt} ${scope} ${pose}`); else ok('exports read back');
    UI.closeModal(); settle();
  },
  async saveLoad(){ act('save and open'); Check.roundTrip(); },
  async tour(){
    const before = G().list.length; act('tour'); click($('#guideBtn')); await sleep(300);
    let guard = 0; while (GW.Guide.active && guard++ < 16){ const nx = $('.gd-btns .next'); if (!nx) break; const lastStep = GW.Guide.i === GW.Guide.list.length - 1; if (lastStep){ click($('.gd-btns [data-g="exit"]')); break; } click(nx); await sleep(280); settle(); Check.invariants(); }
    await sleep(700); settle(); await sleep(900); settle();
    if (GW.Guide.active) find('tour', 'error', 'The tour did not end', ''); else if (G().list.length !== before) find('tour', 'error', `Leaving the tour changed the table: ${before} gears before, ${G().list.length} after`, ''); else ok('the tour starts and ends cleanly');
    after(sel());
  },
  async resetHold(){ act('reset'); UI.resetAll(); await sleep(900); settle(); await sleep(400); settle(); if (G().list.length !== 2) find('ui', 'error', `Reset left ${G().list.length} gears (expected the starting pair)`, ''); else ok('reset restores the starting pair'); after(sel()); },
  async drawers(){ if (window.innerWidth > 980) return; act('drawer'); click($(pick(['#openLeft', '#openRight']))); settle(); click($('#scrim')); settle(); }
};
UI.rowOrder = () => { const out = []; const draw = g => { out.push(g.id); G().children(g.id).forEach(draw); }; G().list.filter(g => !g.parentId).forEach(draw); return out; };

/* a fresh table: the starting pair, so every run begins the same way */
async function freshTable(){ UI.linkChoice = 'mesh'; G().clear({ instant: true }); UI.selId = null; settle(); const a = G().add('spur', { name: 'Driver', z: 18, bore: 6 }, { instant: true }); const b = G().add('spur', { name: 'Driven', z: 27, bore: 8, finish: 'steel' }, { instant: true }); GW.meshAuto(b, a); UI.selId = null; UI.select(b.id); settle(); }

const WEIGHTS = [['editControl', 34], ['addGear', 6], ['selectGear', 8], ['clickCanvas', 4], ['changeType', 4], ['meshViaPanel', 8], ['stripButton', 7], ['stripChip', 3], ['matching', 5], ['unmesh', 3], ['duplicate', 2], ['remove', 3], ['eye', 2], ['playback', 5], ['strip', 1], ['keys', 2], ['renameGear', 1], ['exportDialog', 2], ['saveLoad', 1], ['loadSample', 2]];
async function randomAction(){ let r = rnd() * WEIGHTS.reduce((s, w) => s + w[1], 0); for (const [n, w] of WEIGHTS){ if ((r -= w) < 0){ const a = Act[n]; await (n === 'addGear' ? a() : n === 'loadSample' ? a(rnd() < 0.7) : a()); return; } } }

/* ----------------------------------------------------------------- the plan */
const PHASES = {
  /* every control of every gear type, at its smallest, largest and middle value */
  async controls(types, perType, deep){
    for (const t of types){
      if (T.stop) return;
      T.phase = 'controls: ' + t; await freshTable(); await Act.addGear(t); const g = sel(); if (!g) continue;
      const keys = ctlRows().map(([k]) => k).filter(k => k !== 'name');
      const use = deep ? keys : keys.sort(() => rnd() - 0.5).slice(0, perType);
      for (const k of use){
        if (T.stop) return; T.planDone++;
        const c = UI.ctl[k]; if (!c || c.row.classList.contains('off')) continue;
        const n = $('input.num', c.row), r = $('input[type=range]', c.row), s = $('select', c.row), cb = $('input[type=checkbox]', c.row);
        const base = {}; Object.keys(defaults(t)).forEach(x => { base[x] = g[x]; });
        const test = async fn => { try { await fn(); } catch (e) { find('error', 'error', `Exception while testing "${k}" of ${t}: ${e.message}`, (e.stack || '').split('\n').slice(0, 3).join(' | ')); } after(G().get(g.id)); };
        if (r && n){ const rg = Types.range(g.type, k); for (const f of [0, 1, 0.5]){ act('control', `${t}.${k} → ${f === 0 ? 'min' : f === 1 ? 'max' : 'mid'}`); await test(async () => { typeNum(n, +toBox(g, k, rg[0] + (rg[1] - rg[0]) * f).toFixed(4)); }); } await test(async () => dragRange(r, 0.5)); }
        else if (s){ const lim = Math.min(s.options.length, deep ? 12 : 4); for (let i = 0; i < lim; i++){ act('control', `${t}.${k} = ${s.options[i].value}`); if (k === 'type') continue; await test(async () => pickOption(s, i)); } }
        else if (cb){ act('control', `${t}.${k} toggle`); await test(async () => { click(cb); }); await test(async () => { click(cb); }); }
        // restore the gear so one extreme setting does not hide the next problem
        if (k !== 'type'){ Object.keys(base).forEach(x => { if (!/^(id|name|parentId)$/.test(x)) g[x] = base[x]; }); G().rebuild(g); }
        settle();
        await yieldNow();
      }
    }
  },
  /* every kind of pair the checker allows: build both, mesh them (with and without help), turn them, break one, fix it */
  async pairs(limit){
    const list = []; typeKeys.forEach(a => Compat.partnersOf(a).forEach(b => { if (a <= b || !Compat.partnersOf(b).includes(a)) list.push([a, b]); }));
    const use = limit ? list.sort(() => rnd() - 0.5).slice(0, limit) : list;
    for (const [a, b] of use){
      if (T.stop) return; T.phase = `pair: ${a} + ${b}`; T.planDone++;
      await freshTable(); G().clear({ instant: true }); UI.selId = null;
      const A = G().add(a, null, { instant: true }), B = G().add(b, null, { instant: true });
      act('pair', `${a} + ${b}`); settle();
      const fixable = Check.autofix(A, B, 'mesh'); if (fixable === null) continue;
      UI.select(B.id); settle(); UI.partnerId = A.id; UI._conn && (UI._conn.sig = null); UI.syncConn(B); settle();
      const go = $$('#connHost .cbtns .go')[0]; if (go){ act('click', go.textContent); click(go); settle(); } else UI.doLink(A, B, 'mesh', 'B');
      settle(); after(sel());
      const st = UI.statusOf(B);
      if (!B.parentId) find('mesh', 'error', `Could not mesh ${a} with ${b} from the panel`, ''); else if (!st.ok) find('autofix', 'error', `After "Fix & mesh", ${a} + ${b} still does not fit: ${st.issues.filter(i => i.level === 'err').map(i => i.id).join(', ')}`, diff(A) + ' + ' + diff(B));
      Check.overlap(A, B, [0.2, 0.9, 1.7]);
      // turn the gears and make sure nothing blows up
      for (let i = 0; i < 6; i++){ GW.Layout.update(0.2); } Check.invariants();
      // break it, then fix it from the strip
      const ks = ['m', 'z', 'pa'].filter(k => B[k] != null && Types.has(B.type, k) && Types.PARAMS[k]); if (ks.length && B.parentId){
        const k = pick(ks); const rg = Types.range(B.type, k); act('break', `${B.type}.${k}`); UI.queue(B, k, k === 'z' ? B.z + 3 : k === 'pa' ? (B.pa === 25 ? 20 : 25) : B.m + 1); settle(); after(sel());
        const fx = $('#fbInner [data-act="fixall-B"]'); if (fx){ click(fx); settle(); const s2 = UI.statusOf(B); const still = s2 && s2.issues.filter(i => i.level === 'err'); if (still && still.length && s2.supported) find('autofix', 'error', `"Fix all" on ${b} (broken ${k}) leaves ${still.map(i => i.id).join(', ')}`, diff(A) + ' + ' + diff(B)); else ok('Fix all repairs a broken mesh'); }
        after(sel());
      }
      Check.allGeometry(); await yieldNow();
    }
  },
  /* every sample, through the real Load button */
  async samples(heavy){
    for (const p of GW.Presets){
      if (T.stop) return; T.phase = 'sample: ' + p.id; T.planDone++;
      act('load sample', p.id); click($(`#sampleList .sbtn[data-id="${p.id}"]`));
      await sleep(260 + 36 * 40 + (p.id === 'showcase' ? 1800 : 900)); settle(); await sleep(120); settle();
      if (!G().list.length) find('sample', 'error', `Sample "${p.name}" built no gears`, ''); else ok('samples build');
      const bad = G().list.filter(g => { const s = UI.statusOf(g); return s && !s.ok; });
      if (bad.length) find('sample', 'error', `Sample "${p.name}" has gears that do not mesh: ${bad.map(g => g.name).join(', ')}`, bad.map(g => UI.statusOf(g).issues.filter(i => i.level === 'err').map(i => i.id).join('/')).join(' ; '));
      Check.invariants(); Check.panels(); Check.feedback(); Check.allGeometry(); Check.blank(); Check.sampleColors(p);
      if (heavy || p.id !== 'showcase') Check.overlapAll();
      if (!heavy) { Check.exports('all', 'world', 'stl', false); }
      await yieldNow();
    }
  },
  async flows(){
    T.phase = 'flows';
    await freshTable(); T.planDone++;
    await Act.tour();
    await Act.resetHold();
    await freshTable();
    for (const f of ['stl', 'stla', 'obj', 'step']){ for (const sc of ['selected', 'all']){ for (const pose of ['world', 'flat']){ Check.exports(sc, pose, f, false); } } }
    Check.exports('all', 'world', 'stl', true);
    for (const id of ['chain', 'belt', 'planetary']){ const p = GW.Presets.find(x => x.id === id); G().clear({ instant: true }); UI.selId = null; p.build(0, 0); settle(); UI.select(G().list[0].id); settle(); Check.exports('assembly', 'world', 'step', false); Check.exports('all', 'world', 'obj', false); Check.roundTrip(); }
    T.planDone++;
    for (let i = 0; i < 3; i++) await Act.exportDialog();
    Check.layout(); Check.blank(); Check.leaks(); await Check.jank();
    await Act.drawers();
    T.phase = 'new features'; await Check.features(); await Check.undoRedo(); await Check.rackStroke(); await Check.units(); await Check.camera(); await Check.status(); Check.sidebars(); await Check.materials(); await Check.matchExplain(); await Check.performance(); await Check.labels(); await Check.tolerance(); await freshTable(); await Check.responsive(); await freshTable();
  },
  async random(n){
    T.phase = 'random';
    for (let i = 0; i < n; i++){
      if (T.stop) return; T.planDone++;
      try { await randomAction(); } catch (e) { find('error', 'error', 'Exception during a random action: ' + e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); }
      if (T.n % 8 === 0) Check.allGeometry();
      if (T.n % 25 === 0){ Check.overlapAll(); Check.layout(); Check.blank(); Check.leaks(); }
      if (G().list.length > 24){ while (G().list.length > 6) G().remove(G().list[G().list.length - 1].id, { instant: true }); settle(); }
      if (G().list.length === 0) await freshTable();
      if (i % 4 === 0) await yieldNow();
    }
  }
};

const PLANS = {
  quick:    { total: 70,   run: async () => { await PHASES.samples(false); await PHASES.controls(['spur', 'helical', 'bevel', 'worm', 'sprocket', 'elliptical'], 5, false); await PHASES.pairs(8); await PHASES.random(60); await PHASES.flows(); } },
  standard: { total: 400,  run: async () => { await PHASES.samples(false); await PHASES.controls(typeKeys, 10, false); await PHASES.pairs(0); await PHASES.random(300); await PHASES.flows(); } },
  thorough: { total: 2400, run: async () => { await PHASES.samples(true); await PHASES.controls(typeKeys, 0, true); await PHASES.pairs(0); await PHASES.random(1600); await PHASES.flows(); await PHASES.pairs(0); await PHASES.random(300); } },
  free:     { total: 0,    run: async () => { await PHASES.flows(); while (!T.stop) await PHASES.random(200); } },
  problems: { total: 0,    run: null }
};

/* ----------------------------------------------------------------- "aim at problems": replay, shrink, hunt */
const SAVE = 'gwdev.failures';
const saved = () => { try { return JSON.parse(localStorage.getItem(SAVE) || '[]'); } catch (e) { return []; } };
const remember = () => { const old = saved(); T.findings.forEach(f => { if (f.sev === 'error' && f.first.phase === 'random' && !old.some(o => o.title === f.title)) old.push({ title: f.title, seed: f.first.seed, n: f.first.n, at: Date.now() }); }); try { localStorage.setItem(SAVE, JSON.stringify(old.slice(-20))); } catch (e) {} };
async function replay(seed, steps){
  T.rng = rngFrom(seed); T.seed = seed; T.findings.clear(); await freshTable(); T.log.length = 0; T.n = 0; T.phase = 'random';
  for (let i = 0; i < steps; i++){ if (T.stop) break; try { await randomAction(); } catch (e) { find('error', 'error', 'Exception during a random action: ' + e.message, ''); } if (i % 8 === 0) Check.allGeometry(); }
  Check.allGeometry(); Check.overlapAll(); Check.leaks();
}
async function aimAtProblems(){
  const list = saved();
  if (!list.length){ T.note = 'No earlier failures are saved. Run Standard or Thorough first; anything that breaks in a random run is remembered here.'; await PHASES.random(200); return; }
  T.planTotal = list.length * 14 + 150; const report = [];
  for (const f of list){
    if (T.stop) break;
    const steps = Math.min(f.n + 8, 1500);
    await replay(f.seed, steps); T.planDone += 2;
    const again = [...T.findings.values()].find(x => x.title.replace(/\d+(\.\d+)?/g, '#') === f.title.replace(/\d+(\.\d+)?/g, '#'));
    if (!again){ report.push({ title: f.title, state: 'no longer happens' }); continue; }
    // shrink: the fewest actions of this seed that still show it
    let lo = 1, hi = steps;
    for (let k = 0; k < 9 && lo < hi && !T.stop; k++){ const mid = (lo + hi) >> 1; await replay(f.seed, mid); T.planDone += 1; if ([...T.findings.values()].some(x => x.title.replace(/\d+(\.\d+)?/g, '#') === f.title.replace(/\d+(\.\d+)?/g, '#'))) hi = mid; else lo = mid + 1; }
    await replay(f.seed, hi);
    report.push({ title: f.title, state: `still fails; shortest recipe: seed ${f.seed}, first ${hi} actions`, recipe: T.log.slice(-Math.min(hi, 14)) });
  }
  T.shrunk = report;
  // then a fresh hunt, with new seeds
  T.seed = (Date.now() & 0xffff) | 1; T.rng = rngFrom(T.seed); await freshTable(); await PHASES.random(150);
}

/* ----------------------------------------------------------------- running */
async function run(mode, seed){
  if (T.running) return;
  Object.assign(T, { running: true, stop: false, seed: seed >>> 0 || 1, mode, n: 0, log: [], findings: new Map(), passed: new Map(), downloads: [], leakSeries: [], note: '', shrunk: null, planDone: 0, planTotal: (PLANS[mode] || PLANS.quick).total, t0: NOW(), phase: '' });
  T.rng = rngFrom(T.seed);
  const snapshot = JSON.parse(GW.History.snap()), selBefore = UI.selId, quality = GW.Build.quality, spin = G().spin;
  hook(); UI.closeModal(); if (GW.Guide && GW.Guide.active) GW.Guide.stop(true);
  render();
  try {
    await freshTable();
    if (mode === 'problems') await aimAtProblems(); else await PLANS[mode].run();
  } catch (e) { find('error', 'error', 'The tester itself stopped: ' + e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); }
  finally {
    if (!T.stop) { T.planDone = T.planTotal || T.planDone; }
    remember(); unhook(); T.running = false; GW.Build.quality = quality; $('#qualSel').value = quality; UI.setPlaying(spin);
    // put the table back as it was
    G().clear({ instant: true }); UI.selId = null; try { G().fromJSON(snapshot); } catch (e) {} settle(); if (selBefore != null && G().get(selBefore)) UI.select(selBefore); GW.Scene.fit(true); settle();
    render();
  }
}

/* ----------------------------------------------------------------- the panel */
const CSS = `
#gwdev{position:fixed;right:372px;top:74px;z-index:10000;width:420px;max-height:calc(100vh - 90px);display:flex;flex-direction:column;background:#101113;color:#ececee;border:1px solid #2c2f34;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);font:12.5px/1.45 Inter,system-ui,sans-serif;user-select:none}
#gwdev[hidden]{display:none}
#gwdev .dh{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #222428;cursor:move}
#gwdev .dh b{font:400 17px "Bebas Neue",Inter,sans-serif;letter-spacing:.08em}
#gwdev .dh span{color:#8a8f97;font-size:11px}
#gwdev .dh i{margin-left:auto;display:flex;gap:6px;font-style:normal}
#gwdev button,#gwdev select,#gwdev input{font:inherit;color:inherit;background:transparent;border:1px solid #3d4147;border-radius:7px;padding:5px 10px;cursor:pointer}
#gwdev select,#gwdev input[type=text]{background:#1b1d20;border-color:transparent;cursor:auto}
#gwdev button:hover{border-color:#8a8f97;color:#fff}
#gwdev button.go{border-color:#5b93ea;color:#5b93ea}#gwdev button.go:hover{background:rgba(91,147,234,.16);color:#fff}
#gwdev button.stop{border-color:#f04a45;color:#f2a09d}
#gwdev .bd{overflow-y:auto;padding:10px 12px 12px}
#gwdev .row{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
#gwdev .row label{color:#8a8f97;font-size:11px}
#gwdev .bar{height:7px;border-radius:4px;background:#222428;overflow:hidden;margin:4px 0 2px}
#gwdev .bar div{height:100%;width:0;background:#5b93ea;transition:width .25s}
#gwdev .meta{color:#8a8f97;font-size:11px;display:flex;justify-content:space-between;gap:8px}
#gwdev h4{margin:12px 0 5px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#6d737c}
#gwdev .f{border:1px solid #2c2f34;border-radius:9px;padding:7px 9px;margin-bottom:6px;background:#15171a}
#gwdev .f.error{border-color:rgba(240,74,69,.5)}#gwdev .f.warn{border-color:rgba(240,185,85,.4)}
#gwdev .f b{font-weight:600;word-break:break-word}#gwdev .f .c{color:#8a8f97;font-size:11px}
#gwdev .f pre{margin:5px 0 0;font:11px/1.4 ui-monospace,Consolas,monospace;color:#b9bdc4;white-space:pre-wrap;word-break:break-word;user-select:text}
#gwdev .f .g{color:#e8c547;font-size:11.5px;margin-top:4px}
#gwdev .good{display:flex;flex-wrap:wrap;gap:5px}#gwdev .good span{background:#15271c;border:1px solid #234a30;color:#7fd7a1;border-radius:999px;padding:2px 9px;font-size:11px}
#gwdev .note{color:#e8c547;font-size:11.5px;margin:6px 0}
`;
let panel;
function build(){
  if (panel) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  panel = document.createElement('div'); panel.id = 'gwdev'; panel.hidden = true;
  panel.innerHTML = `<div class="dh"><b>Gear Maker tester</b><span>press \` to close</span><i><button data-a="min" title="Fold">–</button><button data-a="close" title="Close">✕</button></i></div>
  <div class="bd">
    <div class="row"><label>Mode</label><select id="dtMode"><option value="quick">Quick (~1 min)</option><option value="standard">Standard</option><option value="thorough">Thorough</option><option value="problems">Aim at problems</option><option value="free">Free run</option></select>
      <label>Seed</label><input type="text" id="dtSeed" size="7" value="1"></div>
    <div class="row"><button class="go" data-a="start">Start</button><button class="stop" data-a="stop" disabled>Stop</button><button data-a="copy">Copy report</button><button data-a="clear" title="Forget the saved failures that Aim at problems replays">Forget saved</button></div>
    <div class="bar"><div id="dtBar"></div></div><div class="meta"><span id="dtPct">Ready</span><span id="dtEta"></span></div>
    <div id="dtOut"></div>
  </div>`;
  document.body.appendChild(panel);
  // drag by the header
  const dh = $('.dh', panel); let off = null;
  dh.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = panel.getBoundingClientRect(); off = [e.clientX - r.left, e.clientY - r.top]; dh.setPointerCapture(e.pointerId); });
  dh.addEventListener('pointermove', e => { if (!off) return; panel.style.left = e.clientX - off[0] + 'px'; panel.style.top = e.clientY - off[1] + 'px'; panel.style.right = 'auto'; });
  dh.addEventListener('pointerup', () => { off = null; });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'close') toggle(false); else if (a === 'min') $('.bd', panel).hidden = !$('.bd', panel).hidden;
    else if (a === 'start') run($('#dtMode').value, parseInt($('#dtSeed').value, 10) || 1);
    else if (a === 'stop') T.stop = true;
    else if (a === 'copy') copy();
    else if (a === 'clear'){ try { localStorage.removeItem(SAVE); } catch (e) {} render(); }
  });
  panel.addEventListener('keydown', e => e.stopPropagation());
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function report(){
  const fs = [...T.findings.values()].sort((a, b) => (a.sev === 'error' ? 0 : 1) - (b.sev === 'error' ? 0 : 1) || b.count - a.count);
  const lines = [`Gear Maker tester: ${T.mode}, seed ${T.seed}, ${T.n} actions, ${((NOW() - T.t0) / 1000).toFixed(0)} s`, ''];
  lines.push(`${fs.filter(f => f.sev === 'error').length} errors, ${fs.filter(f => f.sev !== 'error').length} warnings`, '');
  fs.forEach(f => { lines.push(`[${f.sev.toUpperCase()}] ${f.title}  (x${f.count})`, '  ' + f.detail, '  first at action #' + f.first.n + ' (' + f.first.phase + ', seed ' + f.first.seed + ')', '  recipe: ' + f.first.recipe.join(' > '), '  guess: ' + guess(f), ''); });
  if (T.shrunk) T.shrunk.forEach(s => lines.push('replayed: ' + s.title + ' -> ' + s.state));
  lines.push('', 'Went right: ' + [...T.passed.entries()].map(([k, v]) => `${k} (${v})`).join('; '));
  return lines.join('\n');
}
function copy(){ const t = report(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }); }
function render(){
  if (!panel) return;
  const total = T.planTotal || 0, pct = T.running ? (total ? clamp(T.planDone / total, 0, 0.99) : 0) : (T.n ? 1 : 0);
  $('#dtBar').style.width = (pct * 100).toFixed(0) + '%';
  const el = (NOW() - T.t0) / 1000; const eta = T.running && total && pct > 0.03 ? Math.max(0, el / pct - el) : null;
  $('#dtPct').textContent = T.running ? `${T.phase || 'starting'}: ${(pct * 100).toFixed(0)}%${total ? '' : ' (runs until stopped)'}  ·  ${T.n} actions` : (T.n ? `Finished: ${T.n} actions in ${el.toFixed(0)} s` : 'Ready');
  $('#dtEta').textContent = eta != null ? `about ${eta > 90 ? Math.round(eta / 60) + ' min' : Math.round(eta) + ' s'} left` : '';
  $('[data-a=start]', panel).disabled = T.running; $('[data-a=stop]', panel).disabled = !T.running;
  const fs = [...T.findings.values()].sort((a, b) => (a.sev === 'error' ? 0 : 1) - (b.sev === 'error' ? 0 : 1) || b.count - a.count);
  const nerr = fs.filter(f => f.sev === 'error').length;
  let h = '';
  if (T.note) h += `<div class="note">${esc(T.note)}</div>`;
  if (T.n){ h += `<h4>${nerr ? nerr + ' problem' + (nerr > 1 ? 's' : '') : 'No errors'}${fs.length - nerr ? ' · ' + (fs.length - nerr) + ' warning' + (fs.length - nerr > 1 ? 's' : '') : ''}</h4>`;
    h += fs.map(f => `<div class="f ${f.sev}"><b>${esc(f.title)}</b> <span class="c">×${f.count} · first at action #${f.first.n} (${esc(f.first.phase)})</span>${f.detail ? `<pre>${esc(f.detail)}</pre>` : ''}<pre>recipe (seed ${f.first.seed}): ${esc(f.first.recipe.join('  ›  '))}</pre>${guess(f) ? `<div class="g">Likely cause: ${esc(guess(f))}</div>` : ''}</div>`).join('');
    if (T.shrunk) h += '<h4>Earlier failures</h4>' + T.shrunk.map(s => `<div class="f ${/still/.test(s.state) ? 'error' : ''}"><b>${esc(s.title)}</b><pre>${esc(s.state)}${s.recipe ? '\n' + esc(s.recipe.join('  ›  ')) : ''}</pre></div>`).join('');
    h += `<h4>What went right</h4><div class="good">${[...T.passed.entries()].map(([k, v]) => `<span>${esc(k)} ×${v}</span>`).join('') || 'nothing yet'}</div>`; }
  else { const sv = saved(); h += `<div class="meta" style="margin-top:8px">${sv.length ? sv.length + ' earlier failure' + (sv.length > 1 ? 's' : '') + ' saved for "Aim at problems".' : 'Pick a mode and press Start. The tester drives the real controls, so leave the mouse alone while it runs.'}</div>`; }
  $('#dtOut').innerHTML = h;
}
setInterval(() => { if (T.running) render(); }, 400);

function toggle(open){ build(); panel.hidden = open == null ? !panel.hidden : !open; if (!panel.hidden) render(); }
window.GWDev = { toggle, run, report, state: T, Check, Act, PHASES, PLANS, find };
})();
