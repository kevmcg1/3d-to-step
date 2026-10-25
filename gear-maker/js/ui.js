"use strict";
/* Gear Maker — the interface.
   Left sidebar  : samples, the gears on the table, playback and view, project.
   Right sidebar : every property of the selected gear. Everything is live: a change is applied on the
                   next animation frame, with coarse "draft" meshes while a slider is being dragged and a
                   full-quality rebuild the moment it is let go.
   Bottom strip  : feedback about the selected gear: does it mesh, what does it need, speeds and ratios. */
(function(){
const U = GW.U, Types = GW.Types, G = () => GW.Gears;
const { TYPES, PARAMS, LINK_PARAMS, FINISH } = Types;
const $ = U.el, make = U.make, esc = U.esc;

const ICON = {
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.3 7.6A17 17 0 0 0 2 12s4 6 10 6c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4 10-10"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'
};

/* settings that change which other controls exist, so the panel is rebuilt after them */
const REBUILD = new Set(['type']);

const UI = GW.UI = {
  selId: null, partnerId: null, linkChoice: 'mesh', ctl: {},
  openGroups: { Connection: true, Identity: true, Teeth: true, Profile: true, Body: true },
  _seen: new Set(), _pending: new Map(), _touched: new Set(), _dirty: {},

  /* ================================================================== start-up */
  init(){
    UI.initTips();
    UI.initLeft();
    UI.initBar();
    G().onChange((what, g) => UI.onChange(what, g));
    document.addEventListener('keydown', UI.onKey);
    if(window.innerWidth <= 640) UI.toggleFeedback(true);
    UI.mark({ list: 1, props: 1, fb: 1 });
  },

  initBar(){
    $('addBtn').onclick = $('addBtn2').onclick = () => UI.openAdd();
    $('exportBtn').onclick = () => UI.openExport();
    $('openLeft').onclick = () => UI.drawer('left');
    $('openRight').onclick = () => UI.drawer('right');
    $('scrim').onclick = () => UI.drawer(null);
    // hold to reset
    const btn = $('resetAll'); let tw = null;
    const stop = () => { if(tw){ tw.stop(); tw = null; } btn.classList.remove('holding'); btn.style.setProperty('--p', 0); };
    const start = () => {
      btn.classList.add('holding');
      tw = GW.Anim.tween(2000, p => { btn.style.setProperty('--p', p); }, { ease: 'linear', done: () => { tw = null; btn.classList.remove('holding'); btn.classList.add('done'); UI.resetAll(); setTimeout(() => { btn.classList.remove('done'); btn.style.setProperty('--p', 0); }, 700); } });
    };
    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('keydown', e => { if((e.key === 'Enter' || e.key === ' ') && !tw) start(); });
    btn.addEventListener('keyup', stop);
    // feedback strip
    $('fbToggle').onclick = () => UI.toggleFeedback();
    document.querySelectorAll('#views [data-view]').forEach(b => b.onclick = () => { b.dataset.view === 'fit' ? GW.Scene.fit() : GW.Scene.view(b.dataset.view); });
  },

  drawer(side){
    const app = $('app');
    app.classList.toggle('show-left', side === 'left' && !app.classList.contains('show-left'));
    app.classList.toggle('show-right', side === 'right' && !app.classList.contains('show-right'));
  },

  toggleFeedback(force){
    const fb = $('feedback'), min = force != null ? force : !fb.classList.contains('min');
    fb.classList.toggle('min', min);
    $('fbToggle').setAttribute('aria-expanded', String(!min));
  },

  onKey(e){
    if(e.key === 'Escape'){ UI.closeModal(); UI.drawer(null); if(GW.Guide && GW.Guide.active) GW.Guide.stop(false); return; }
    if(GW.Guide && GW.Guide.active) return;
    if((e.ctrlKey || e.metaKey) && !e.altKey){
      const k = e.key.toLowerCase(), t = e.target;
      const typing = t && t.matches && (t.matches('textarea') || t.matches('input:not([type=range]):not([type=checkbox])')) ;
      if(!typing && !document.querySelector('.modal-bg.show') && (k === 'z' || k === 'y')){
        e.preventDefault();
        if(k === 'y' || e.shiftKey) GW.History.redo(); else GW.History.undo();
      }
      return;
    }
    if(e.target.matches && e.target.matches('input,select,textarea')) return;
    if((e.key === 'Delete' || e.key === 'Backspace') && UI.selId && !document.querySelector('.modal-bg.show')){ e.preventDefault(); UI.deleteSel(); }
    else if(e.key === ' '){ e.preventDefault(); UI.setPlaying(!G().spin); }
    else if(e.key === 'f' || e.key === 'F') GW.Scene.fit();
    else if(e.key === 'g' || e.key === 'G') GW.Scene.setGrid(!GW.Scene.gridOn);
  },

  /* ================================================================== tooltips */
  initTips(){
    const tip = make('div', 'tip'); document.body.appendChild(tip);
    let cur = null;
    const show = el => {
      const raw = el.getAttribute('data-tip'); if(!raw) return;
      const [t, ...rest] = raw.split('\n');
      tip.innerHTML = '<b>' + esc(GW.Units.text(t)) + '</b>' + esc(GW.Units.text(rest.join('\n')));
      const r = el.getBoundingClientRect(), w = Math.min(250, tip.offsetWidth || 200);
      tip.classList.add('on');
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 8;
      if(y + th > window.innerHeight - 8) y = r.top - th - 8;
      tip.style.left = U.clamp(x, 8, window.innerWidth - tw - 8) + 'px'; tip.style.top = Math.max(8, y) + 'px';
    };
    document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if(el !== cur){ cur = el; if(el) show(el); else tip.classList.remove('on'); } });
    document.addEventListener('pointerdown', () => { tip.classList.remove('on'); });
  },

  /* ================================================================== marking work to do
     (everything redraws on the next frame, however many changes came in) */
  mark(f){ for(const k in f) if(f[k]) UI._dirty[k] = 1;                     // a request is never cancelled by a later "false"
    if(!UI._tick){ UI._tick = requestAnimationFrame(() => { UI._tick = 0; UI.process(); }); } },
  process(){
    const d = UI._dirty; UI._dirty = {};
    if(d.list) UI.renderList();
    if(d.props) UI.buildProps(); else if(d.sync) UI.syncProps();
    if(d.fb) UI.renderFeedback();
    if(d.helpers) GW.Scene.updateHelpers(UI.sel());
    UI.updateEmpty();
  },
  onChange(what, g){
    if(what !== 'soft') GW.History.touch();
    if(what === 'remove' && UI.selId === g.id){ UI.selId = null; UI.mark({ props: 1 }); }
    if(what === 'load'){ UI.selId = null; UI.mark({ props: 1 }); }
    UI.mark({ list: 1, fb: 1, helpers: 1, sync: 1 });
  },
  updateEmpty(){ $('empty').classList.toggle('on', !G().list.length); },

  sel(){ return G().get(UI.selId); },

  /* ================================================================== selection */
  select(id){
    if(UI.selId === id) return;
    UI.selId = id;
    const g = UI.sel();
    UI.partnerId = null;
    UI.mark({ list: 1, props: 1, fb: 1, helpers: 1 });
    if(g && window.innerWidth <= 980 && !$('app').classList.contains('show-left')) { /* stay out of the way on small screens */ }
  },

  /* emissive glow: eased every frame so selecting / hovering / a broken mesh all fade rather than snap */
  tick(){
    G().list.forEach(g => {
      const st = UI.statusOf(g);
      const w = g._w || (g._w = { sel: 0, bad: 0, hov: 0 });
      w.sel = GW.Anim.chase(w.sel, g.id === UI.selId ? 1 : 0, 0.18);
      w.bad = GW.Anim.chase(w.bad, st && !st.ok && g.id !== UI.selId ? 1 : 0, 0.12);
      w.hov = GW.Anim.chase(w.hov, GW.Scene.hoverId === g.id && g.id !== UI.selId ? 1 : 0, 0.25);
      const m = g.mesh.material;
      m.emissive.setRGB(0.03 * w.sel + 0.3 * w.bad + 0.03 * w.hov, 0.07 * w.sel + 0.05 * w.bad + 0.045 * w.hov, 0.17 * w.sel + 0.045 * w.bad + 0.08 * w.hov);
      m.emissiveIntensity = 1;
    });
  },

  /* mesh status of a gear against its parent, cached per frame-ish */
  statusOf(g){
    if(!g.parentId) return null;
    const P = G().get(g.parentId); if(!P) return null;
    const key = G().version + ':' + g.id + ':' + UI._sv;
    if(g._st && g._st.key === key && (g._st.real || UI.dragging || !UI.wantsReal(g))) return g._st.v;
    let v = GW.Compat.check(P, g, { kind: g.linkKind === 'same shaft' ? 'shaft' : 'mesh' }), real = false;
    // the rules say it fits: make sure the actual shapes really do (only for the gear being worked on, and not mid-drag)
    if(!UI.dragging && UI.wantsReal(g)) real = true;
    if(real && GW.Collide.applies(P, g, v)){
      const ov = GW.Collide.overlap(P, g);
      if(ov > GW.Collide.limit(v.kind)){
        v = Object.assign({}, v, { ok: false, issues: v.issues.concat([{ level: 'err', id: 'collide', text: `<b>teeth collide</b> — the real shapes overlap by <span class="val">${(ov * 100).toFixed(1)}%</span> of the smaller gear while turning, even though the numbers look right. Check the tooth shape on both gears: pressure angle, tooth heights, profile shift and backlash.` }]) });
      }
    }
    g._st = { key, v, real };
    return v;
  },
  /* the shape test is a little costly, so it runs for the selected gear and the gears next to it */
  wantsReal(g){
    // only when everything has settled: positions solved, nothing growing or flying (a half-built scene would give a wrong answer). Camera moves do not matter here: the answer must not change when the camera starts or stops.
    // (a gear pops in with an overshoot past full size, so "ready" means exactly full size)
    const s = UI.selId; if(s == null || G().dirty || G().list.some(x => x.scale != null && Math.abs(x.scale - 1) > 0.001)) return false;
    return g.id === s || g.parentId === s || (G().get(g.parentId) && G().get(g.parentId).id === s);
  },
  _sv: 0,                                   // bumped on every settings change so cached statuses refresh

  /* ================================================================== left: samples */
  initLeft(){
    // samples: a list of cards; clicking one loads it, the + beside it adds it next to what is there
    const sl = $('sampleList'), groups = {}, COLS = ['#5b93ea', '#5fcf8a', '#a78bfa', '#f472b6', '#fb923c', '#2dd4bf', '#94a3b8', '#e8b547']; let ci = 0;
    GW.Presets.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
    $('sampleCount').textContent = GW.Presets.length;
    Object.keys(groups).forEach(gr => {
      const cat = make('div', 'scat'); cat.style.setProperty('--sc', COLS[ci++ % COLS.length]); cat.appendChild(make('h3', 'sgrp', gr)); sl.appendChild(cat);
      groups[gr].forEach(p => {
        const row = make('div', 'srow'); row.dataset.id = p.id;
        const line = make('div', 'sline');
        const b = make('button', 'sbtn'); b.type = 'button'; b.dataset.id = p.id;
        b.innerHTML = `<canvas class="sth" width="264" height="184" aria-hidden="true"></canvas><span class="stx"><span class="sn">${esc(p.name)}</span><span class="sd">${esc(p.note)}</span></span>`;
        GW.Preview.thumb(b.querySelector('canvas'), { sample: p });
        b.onclick = () => { GW.Preview.hide(); UI.markSample(p.id); UI.loadSample(p, true); };
        const info = make('button', 'sinfo'); info.type = 'button'; info.dataset.id = p.id; info.textContent = '?';
        info.setAttribute('aria-label', 'Explain ' + p.name); info.setAttribute('aria-expanded', 'false'); info.dataset.tip = 'What is happening?\nA plain-English explanation.';
        const why = make('div', 'sx'); why.innerHTML = '<div><p>' + esc(p.why) + '</p></div>';
        info.onclick = e => { e.stopPropagation(); const o = !row.classList.contains('open'); row.classList.toggle('open', o); info.setAttribute('aria-expanded', o); };
        const add = make('button', 'sadd'); add.type = 'button'; add.dataset.id = p.id; add.textContent = '+';
        add.setAttribute('aria-label', 'Add ' + p.name + ' beside the others'); add.dataset.tip = 'Add beside\nBuilds it next to what is already there.';
        add.onclick = e => { e.stopPropagation(); UI.loadSample(p, false); };
        const prev = on => () => { if(on) GW.Preview.show({ sample: p, anchor: row, side: 'right' }); else GW.Preview.hide(); };
        row.addEventListener('pointerenter', prev(true)); row.addEventListener('pointerleave', prev(false));
        b.addEventListener('focus', prev(true)); b.addEventListener('blur', prev(false));
        line.append(b, info, add); row.append(line, why); cat.appendChild(row);
      });
    });

    // playback
    $('playBtn').onclick = () => UI.setPlaying(!G().spin);
    const ub = $('unitBtn'), paintUnits = () => { ub.textContent = GW.Units.inch ? 'IN' : 'MM'; ub.setAttribute('aria-label', 'Units: ' + (GW.Units.inch ? 'inches (millimeters in parentheses)' : 'millimeters (inches in parentheses)')); };
    paintUnits();
    ub.onclick = () => { GW.Units.set(GW.Units.inch ? 'mm' : 'in'); paintUnits(); UI._sv++; UI._reads = {}; UI.mark({ fb: 1, sync: 1, list: 1 }); UI.toast(GW.Units.inch ? 'Showing inches, with millimeters in parentheses.' : 'Showing millimeters, with inches in parentheses.', 2200); };
    $('labelBtn').onclick = () => GW.Labels.set(!GW.Labels.on);
    $('undoBtn').onclick = () => GW.History.undo(); $('redoBtn').onclick = () => GW.History.redo();
    GW.History.onState = () => { $('undoBtn').disabled = GW.History.at <= 0; $('redoBtn').disabled = GW.History.at >= GW.History.stack.length - 1; };
    const sp = $('speedR');
    const fill = el => el.style.setProperty('--fill', ((+el.value - el.min) / (el.max - el.min) * 100) + '%');
    sp.oninput = () => { G().speed = +sp.value; $('speedV').textContent = (+sp.value).toFixed(2) + '×'; fill(sp); };
    fill(sp);
    const tg = (id, get, set) => { const b = $(id); b.onclick = () => { const v = !get(); set(v); b.setAttribute('aria-pressed', v); }; };
    tg('helpBtn', () => GW.Scene.showHelpers, v => { GW.Scene.showHelpers = v; GW.Scene.updateHelpers(UI.sel()); });
    $('gridQuick').onclick = () => GW.Scene.setGrid(!GW.Scene.gridOn);
    $('qualSel').onchange = () => { GW.Build.quality = +$('qualSel').value; const t0 = performance.now(); G().list.forEach(g => G().rebuild(g)); UI.toast('Rebuilt every gear at ' + ['draft', 'normal', 'fine'][GW.Build.quality] + ' quality.'); UI.mark({ fb: 1 }); };

    // project
    $('saveBtn').onclick = () => UI.saveProject();
    $('openBtn').onclick = () => $('openFile').click();
    $('tidyBtn').onclick = () => UI.tidy();
    $('clearBtn').onclick = () => UI.confirm('Remove every gear from the table?', 'Clear all', () => { G().clear({ stagger: 40 }); UI.toast('The table is clear.'); });
  },

  markSample(id){ document.querySelectorAll('#sampleList .srow').forEach(r => r.classList.toggle('on', r.dataset.id === id)); },

  setPlaying(on){
    G().spin = on;
    $('playBtn').setAttribute('aria-pressed', on);
  },

  /* load or add a sample, with the old gears shrinking away and the new ones popping in one by one */
  loadSample(p, replace){
    if(!p) return;
    const build = () => {
      G().list.forEach(g => G().cancelSpawn && G().cancelSpawn(g));
      let maxX = -Infinity;
      if(!replace){ G().list.forEach(g => { g.mesh.updateMatrixWorld(true); maxX = Math.max(maxX, g.rt.pos.x + G().reach(g)); }); }
      const x = replace || !isFinite(maxX) ? 0 : maxX + 70;
      G()._stagger = { n: 0, step: 90 };
      let made; try { made = p.build(x, 0); } finally { G()._stagger = null; }
      GW.Scene.fit(false, G().list.filter(g => !replace ? true : true));
      UI.selId = null; UI.select(made[0].id);
      UI.toast(p.name + (replace ? ' loaded.' : ' added beside the others.'));
      UI.mark({ list: 1, fb: 1 });
      GW.History.busy = false; GW.History.touch();
    };
    GW.History.busy = true;
    if(replace && G().list.length){ const n = G().list.length; G().clear({ stagger: 35 }); UI.selId = null; UI.mark({ props: 1, list: 1, fb: 1, helpers: 1 }); setTimeout(build, 260 + 35 * n); }
    else build();
  },

  resetAll(){
    GW.History.busy = true;
    G().clear({ stagger: 25 }); UI.selId = null;
    setTimeout(() => { UI.startPair(); GW.History.busy = false; GW.History.touch(); }, 300);
  },
  /* the opening scene: a driver and a driven spur gear */
  startPair(instant){
    G()._stagger = { n: 0, step: 120 };
    const a = G().add('spur', { name: 'Driver', z: 18, bore: 6 });
    const b = G().add('spur', { name: 'Driven', z: 27, bore: 8, finish: 'steel', thick: 8 });
    G()._stagger = null;
    GW.meshAuto(b, a);
    GW.Scene.fit(!!instant);
    UI.selId = null; UI.select(b.id);
  },

  /* ================================================================== left: gear list */
  renderList(){
    const box = $('gearList'); box.innerHTML = '';
    const list = G().list;
    const cnt = $('gearCount');
    if(cnt.textContent !== String(list.length)){ cnt.textContent = list.length; cnt.classList.add('bump'); setTimeout(() => cnt.classList.remove('bump'), 300); }
    if(!list.length){ box.innerHTML = '<p class="note" style="min-height:0;margin:0">Nothing here yet.</p>'; return; }
    let i = 0;
    const draw = (g, depth) => {
      const st = UI.statusOf(g);
      const b = make('button', 'grow' + (g.id === UI.selId ? ' sel' : '') + (g.visible === false ? ' hidden-g' : ''));
      b.style.marginLeft = depth * 12 + 'px'; b.style.width = `calc(100% - ${depth * 12}px)`;
      if(UI._seen.has(g.id)) b.style.animation = 'none'; else { b.style.animationDelay = (i++ * 40) + 'ms'; UI._seen.add(g.id); }
      b.innerHTML = `<span class="dot ${st ? (st.ok ? 'ok' : 'bad') : ''}"></span><span class="nm">${esc(g.name)}</span><span class="sub">${TYPES[g.type].short}${g.type !== 'rack' && g.type !== 'worm' ? ' · ' + g.z + 't' : ''}</span>`;
      const eye = make('span', 'eye', g.visible === false ? ICON.eyeOff : ICON.eye);
      eye.setAttribute('role', 'button'); eye.setAttribute('aria-label', 'Show or hide ' + g.name);
      eye.onclick = e => { e.stopPropagation(); G().set(g, 'visible', g.visible === false); UI.mark({ list: 1, helpers: 1 }); };
      b.appendChild(eye);
      b.onclick = () => { UI.select(g.id); if(window.innerWidth <= 980) UI.drawer('right'); };
      b.onpointerenter = () => { GW.Scene.hoverId = g.id; }; b.onpointerleave = () => { GW.Scene.hoverId = null; };
      box.appendChild(b);
      G().children(g.id).forEach(k => draw(k, depth + 1));
    };
    list.filter(g => !g.parentId).forEach(r => draw(r, 0));
  },

  /* ================================================================== right: properties */
  buildProps(){
    const host = $('props'), g = UI.sel();
    const keepScroll = host.dataset.id === String(UI.selId) ? $('right').scrollTop : 0;
    host.innerHTML = ''; UI.ctl = {}; host.dataset.id = UI.selId;
    if(!g){
      host.innerHTML = '<div class="none"><b>No gear selected</b>Click a gear in the 3D view or in the list.<br>Every setting appears here and changes live.</div>';
      return;
    }
    host.appendChild(UI.propHeader(g));
    host.appendChild(make('div', null, '')).id = 'adj';
    host.appendChild(UI.connGroup(g));

    const keys = TYPES[g.type].keys.concat(Types.ALWAYS);
    const decl = Object.keys(PARAMS);
    Types.GROUP_ORDER.forEach(gr => {
      if(gr === 'Mesh' || gr === 'Identity') return;
      const ks = keys.filter(k => PARAMS[k] && PARAMS[k][2] === gr).sort((a, b) => decl.indexOf(a) - decl.indexOf(b));
      if(!ks.length) return;
      const grp = UI.group(gr, ks.length);
      const body = grp.querySelector('.gbody');
      if(gr === 'Placement'){
        const note = make('div', 'prow'); note.id = 'placeNote';
        note.innerHTML = '<div class="pin"><div class="hint">This gear is placed by its mesh. Un-mesh it to place it freely.</div></div>';
        body.appendChild(note);
      }
      if(gr === 'Tolerance'){
        const to = make('div', 'prow'); to.id = 'tolInfo';
        to.innerHTML = '<div class="pin"><div class="tolbox"><p id="tolNums"></p><button type="button" class="go wide" id="bestFit" data-tip="Best-fit tolerances&#10;Gives every gear on the table this gear\'s process, opens bores and keyways by its allowance, and raises any backlash that is too tight.">Set best-fit tolerances for everything</button></div></div>';
        body.appendChild(to);
        setTimeout(() => { const b = $('bestFit'); if(b) b.onclick = () => UI.bestFit(UI.sel()); }, 0);
      }
      if(gr === 'Motion'){
        const ro = make('div', 'prow'); ro.id = 'speedRo';
        ro.innerHTML = '<div class="pin"><div class="pr wide1"><label>Speed</label><b id="roSpeed" style="font-size:13px"></b></div><div class="hint" id="roWho"></div></div>';
        body.appendChild(ro);
      }
      ks.forEach(k => { const c = UI.control(g, k); UI.ctl[k] = c; body.appendChild(c.row); });
      host.appendChild(grp);
    });
    UI.syncProps();
    if(UI.psq) UI.applySearch();
    $('right').scrollTop = keepScroll;
  },

  propHeader(g){
    const h = make('div', 'ph');
    const top = make('div', 'ph-top');
    const nm = make('input', 'txt'); nm.type = 'text'; nm.value = g.name; nm.setAttribute('aria-label', 'Gear name'); nm.maxLength = 40;
    nm.oninput = () => { G().set(g, 'name', nm.value || 'Gear'); UI.mark({ list: 1, fb: 1 }); };
    top.appendChild(nm);
    const act = make('div', 'ph-act');
    const ib = (svg, tip, fn, cls) => { const b = make('button', 'iconbtn ' + (cls || ''), svg); b.setAttribute('data-tip', tip); b.setAttribute('aria-label', tip.split('\n')[0]); b.onclick = fn; act.appendChild(b); };
    ib(ICON.copy, 'Duplicate\nA free copy beside this gear.', () => { const n = G().duplicate(g.id); GW.Scene.fit(); UI.select(n.id); UI.toast('Duplicated ' + g.name + '.'); });
    ib(ICON.down, 'Export this gear\nSTL, OBJ or STEP.', () => UI.openExport('selected'));
    ib(ICON.trash, 'Delete\nShortcut: Delete key.', () => UI.deleteSel(), 'danger');
    top.appendChild(act); h.appendChild(top);
    const sub = make('div', 'ph-sub');
    sub.innerHTML = `<span class="tag">${TYPES[g.type].label}</span> <span id="phDesc" style="margin-left:4px">${esc(TYPES[g.type].desc)}</span>`;
    h.appendChild(sub);
    // the gear type is a setting like any other: change it and the controls below follow
    const tc = UI.control(g, 'type'); UI.ctl.type = tc; tc.row.classList.add('ph-type'); h.appendChild(tc.row);
    // search every setting of this gear by name or by what it does
    const sb = make('label', 'psearch', ICON.search + '<input type="search" placeholder="Search settings…" aria-label="Search this gear\'s settings" autocomplete="off" spellcheck="false"><button type="button" class="psx" aria-label="Clear the search" hidden>' + ICON.x + '</button>');
    const si = sb.querySelector('input'), sx = sb.querySelector('.psx');
    si.value = UI.psq || '';
    si.oninput = () => { UI.psq = si.value; sx.hidden = !si.value; UI.applySearch(); };
    si.onkeydown = e => { if(e.key === 'Escape' && si.value){ e.stopPropagation(); si.value = ''; si.oninput(); } };
    sx.onclick = () => { si.value = ''; si.oninput(); si.focus(); };
    sx.hidden = !si.value;
    h.appendChild(sb);
    return h;
  },

  /* show only the settings that match what was typed (every word must appear in the name, the hint or the group); groups with nothing left hide */
  applySearch(){
    const q = (UI.psq || '').toLowerCase().split(/\s+/).filter(Boolean), host = $('props');
    if(!host) return;
    const rows = host.querySelectorAll('.grp .prow');
    host.classList.toggle('searching', q.length > 0);
    host.querySelectorAll('.grp').forEach(grp => {
      let hits = 0;
      const gname = (grp.dataset.g || '').toLowerCase();
      grp.querySelectorAll('.prow').forEach(r => {
        const hay = (r.dataset.s || (r.dataset.s = (r.textContent + ' ' + (r.querySelector('label') ? (r.querySelector('label').getAttribute('data-tip') || '') : '') + ' ' + gname).toLowerCase()));
        const ok = !q.length || q.every(w => hay.indexOf(w) >= 0);
        r.classList.toggle('nomatch', !ok); if(ok) hits++;
      });
      const gok = !q.length || hits > 0 || q.every(w => gname.indexOf(w) >= 0);
      grp.classList.toggle('nomatch', !gok);
      if(q.length && gname && q.every(w => gname.indexOf(w) >= 0)) grp.querySelectorAll('.prow').forEach(r => r.classList.remove('nomatch'));
    });
    let none = $('psNone');
    const any = !q.length || [...host.querySelectorAll('.grp:not(.nomatch)')].length;
    if(!any){ if(!none){ none = make('div', 'none'); none.id = 'psNone'; host.appendChild(none); } none.innerHTML = '<b>No setting matches “' + esc(UI.psq) + '”</b>Try a shorter word, like “bore”, “teeth” or “angle”.'; }
    else if(none) none.remove();
  },

  group(name, count){
    const grp = make('div', 'grp' + (UI.openGroups[name] ? ' open' : '')); grp.dataset.g = name;
    const gh = make('button', 'gh', ICON.chev + `<span>${name}</span><span class="gc">${count}</span>`);
    gh.onclick = () => { grp.classList.toggle('open'); UI.openGroups[name] = grp.classList.contains('open'); };
    const wrap = make('div', 'gwrap'); wrap.appendChild(make('div', 'gbody'));
    grp.appendChild(gh); grp.appendChild(wrap);
    return grp;
  },

  /* ---- one control per setting; syncing re-reads the gear, so a change made anywhere shows up here */
  control(g, key){
    const def = PARAMS[key] || LINK_PARAMS[key];
    const [label, kind, , min, max, step, unit, hint] = def;
    const row = make('div', 'prow'), pin = make('div', 'pin'), pr = make('div', 'pr');
    row.appendChild(pin); pin.appendChild(pr);
    const lab = make('label', null, label); if(hint) lab.setAttribute('data-tip', label + '\n' + hint); pr.appendChild(lab);
    const apply = (v, drag) => UI.queue(g, key, typeof v === 'number' ? +v.toFixed(4) : v, drag);
    const ctl = { key, row, label: lab, sync(){}, visible(){ return UI.visibleIf(g, key); } };

    if(kind === 'text'){
      pr.classList.add('wide1');
      const i = make('input', 'txt'); i.type = 'text'; i.maxLength = 40; i.oninput = () => apply(i.value);
      pr.appendChild(i); ctl.sync = () => { if(document.activeElement !== i) i.value = g[key]; };
    } else if(kind === 'type'){
      pr.classList.add('wide1');
      const s = make('select');
      const groups = {};
      Object.keys(TYPES).forEach(t => { (groups[TYPES[t].group] = groups[TYPES[t].group] || []).push(t); });
      Object.keys(groups).forEach(gr => { const og = make('optgroup'); og.label = gr; groups[gr].forEach(t => { const o = make('option', null, TYPES[t].label); o.value = t; og.appendChild(o); }); s.appendChild(og); });
      s.onchange = () => { apply(s.value); UI.flush(); };
      pr.appendChild(s); ctl.sync = () => { s.value = g.type; };
    } else if(kind === 'sel'){
      pr.classList.add('wide1');
      const nice = { linkKind: { mesh: 'Mesh teeth', 'same shaft': 'Same shaft' }, hand: { right: 'Right hand', left: 'Left hand' }, flange: { none: 'None', both: 'Both sides', front: 'Front only', back: 'Back only' }, bodyStyle: { solid: 'Solid disc', webbed: 'Webbed', spoked: 'Spoked' }, surface: GW.Tex ? GW.Tex.SURFACES : {}, tolerance: GW.Tol ? GW.Tol.LABELS : {} };
      const s = make('select'); unit.forEach(o => { const op = make('option', null, key === 'finish' ? FINISH[o].label : ((nice[key] && nice[key][o]) || o)); op.value = o; s.appendChild(op); });
      s.onchange = () => { apply(s.value); UI.flush(); };
      pr.appendChild(s); ctl.sync = () => { s.value = g[key]; };
    } else if(kind === 'bool'){
      pr.classList.add('wide1');
      const c = make('input'); c.type = 'checkbox'; c.onchange = () => { apply(c.checked); UI.flush(); };
      pr.appendChild(c); ctl.sync = () => { c.checked = !!g[key]; };
    } else if(kind === 'color'){
      pr.classList.add('wide1');
      const c = make('input'); c.type = 'color'; c.oninput = () => apply(c.value);
      pr.appendChild(c); ctl.sync = () => { if(document.activeElement !== c) c.value = g.color; };
    } else {
      const r = make('input'); r.type = 'range'; r.step = kind === 'int' ? 1 : 'any';           // smooth: no notches between positions
      const u = make('div', 'u'); const n = make('input', 'num'); n.type = 'number'; n.inputMode = 'decimal';
      const Un = GW.Units, isLen0 = unit === 'mm';
      const lenNow = () => isLen0 || (key === 'rpm' && g.type === 'rack');                    // a rack's "speed" is a travel speed in mm/s
      const un = make('span', 'un', unit || ''), mmv = make('span', 'mmv'); u.appendChild(n); u.appendChild(un); u.appendChild(mmv);
      const toD = v => lenNow() ? Un.d(v) : v, fromD = v => lenNow() ? Un.fromD(v) : v;
      const fmtD = v => lenNow() ? (Un.inch ? U.fmt(Un.d(v), 4) : U.fmt(v, 3)) : U.fmt(v, 4);
      const dStep = () => kind === 'int' ? 1 : lenNow() && !Un.inch ? 0.01 : 0.001;               // arrows: .001 in (0.01 mm), .001 for the rest; Shift = ten times
      const showAlt = v => { mmv.textContent = lenNow() ? '(' + Un.other(v) + (key === 'rpm' ? '/s' : '') + ')' : ''; };
      pr.appendChild(r); pr.appendChild(u);
      const fill = () => r.style.setProperty('--fill', U.clamp((r.value - r.min) / (r.max - r.min), 0, 1) * 100 + '%');
      r.oninput = () => { n.value = fmtD(+r.value); showAlt(+r.value); fill(); apply(+r.value, true); };
      r.addEventListener('pointerdown', () => UI.beginDrag());
      r.addEventListener('change', () => { UI.flush(); UI.endDrag(); });
      n.oninput = () => { if(n.value === '' || isNaN(+n.value)) return; const mm = fromD(+n.value); r.value = mm; showAlt(mm); fill(); apply(mm, false); };
      n.onchange = () => { UI.flush(); UI.syncProps(); };
      n.step = dStep();
      n.onkeydown = e => { if(e.key === 'Enter') n.blur(); if(e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); const s = dStep(); n.value = U.fmt(+n.value + (e.key === 'ArrowUp' ? s : -s) * (e.shiftKey ? 10 : 1), 4); n.oninput(); } };
      ctl.sync = () => {
        const [lo, hi] = Types.range(g.type, key);
        r.min = lo; r.max = hi; n.step = dStep();
        const rackSpeed = g.type === 'rack' && key === 'rpm';
        if(rackSpeed) lab.textContent = 'Travel speed'; else if(key === 'rpm'){ un.textContent = 'rpm'; lab.textContent = label; }
        const v = g[key];
        if(lenNow()) un.textContent = (Un.inch ? 'in' : 'mm') + (rackSpeed ? '/s' : '');
        showAlt(v);
        if(+r.value !== v) r.value = v;
        const want = fmtD(v);
        if(document.activeElement !== n && n.value !== want){ n.value = want; }
        fill();
      };
    }
    return ctl;
  },

  visibleIf(g, k){
    switch(k){
      case 'rimW': return g.type === 'internal' || g.type === 'splinehub' || (TYPES[g.type].keys.includes('bodyStyle') && g.bodyStyle !== 'solid');
      case 'webT': case 'webOff': return g.bodyStyle !== 'solid';
      case 'spokes': case 'spokeW': return g.bodyStyle === 'spoked';
      case 'holeD': case 'holePCD': return g.holeN > 0;
      case 'keyD': return g.keyW > 0;
      case 'flangeD': case 'flangeT': return g.flange !== 'none';
      case 'px': case 'py': case 'pz': case 'rx': case 'ry': case 'rz': return !g.parentId;
      case 'rpm': return !g.parentId;
      default: return true;
    }
  },

  /* push the gear's current values and visibility into the controls that already exist */
  syncProps(){
    const g = UI.sel(); if(!g || !$('props').dataset.id) return;
    Object.values(UI.ctl).forEach(c => {
      c.sync();
      const vis = c.visible();
      c.row.classList.toggle('off', !vis);
    });
    const linked = !!g.parentId;
    const tn = $('tolNums'); if(tn) tn.innerHTML = UI.tolText(g);
    const pn = $('placeNote'); if(pn) pn.classList.toggle('off', !linked);
    const sr = $('speedRo'); if(sr) sr.classList.toggle('off', !linked);
    if(linked) UI.updateSpeedReadout(g);
    // header
    const nm = document.querySelector('.ph input.txt'); if(nm && document.activeElement !== nm) nm.value = g.name;
    // notes where the geometry had to be trimmed to fit
    const adj = $('adj'); if(adj){ const n = g.info && g.info.notes || []; adj.innerHTML = n.length ? `<div class="adjnote"><b>Adjusted to fit:</b> ${n.map(x => esc(GW.Units.text(x))).join(' · ')}</div>` : ''; }
    UI.syncConn(g);
  },
  updateSpeedReadout(g){
    const el = $('roSpeed'); if(!el) return;
    const w = g.rt.omega || 0;
    el.textContent = g.type === 'rack' ? GW.Units.text(U.fmt(Math.abs(w), 2) + ' mm/s') : U.fmt(Math.abs(w * 30 / Math.PI), 2) + ' rpm' + (w < 0 ? ' (reverse)' : '');
    const P = G().get(g.parentId), who = $('roWho'); if(who && P) who.textContent = 'Driven by ' + P.name + '.';
  },

  /* ---- coalesced live editing ---- */
  queue(g, key, val, drag){
    UI._pending.set(g.id + ':' + key, { g, key, val });
    if(drag) UI._touched.add(g.id);
    if(!UI._raf) UI._raf = requestAnimationFrame(UI.tickFlush);
  },
  /* while a slider is dragged, rebuilds wait for the last one to finish (and a beat more), so the thumb and the pointer never stall behind the geometry */
  _cost: 0, _lf: 0,
  tickFlush(){
    UI._raf = 0;
    if(UI.dragging && performance.now() - UI._lf < UI._cost){ UI._raf = requestAnimationFrame(UI.tickFlush); return; }
    const t = performance.now(); UI.flush();
    const dt = performance.now() - t; UI._cost = Math.min(120, UI._cost * 0.6 + dt * 0.5); UI._lf = performance.now();
  },
  flush(){
    UI._raf = 0;
    const items = [...UI._pending.values()]; UI._pending.clear();
    if(!items.length) return;
    let rebuild = false, geom = false;
    items.forEach(({ g, key, val }) => {
      UI.notes(G().set(g, key, val));
      g._st = null;
      if(REBUILD.has(key) || key === 'finish') rebuild = true;
      if(!/^(name|px|py|pz|rx|ry|rz|rpm|finish|color|metal|rough|opacity|wire|visible)$/.test(key)) geom = true;
    });
    UI._sv++;
    UI.mark({ list: 1, fb: 1, helpers: 1, sync: !rebuild, props: rebuild });
  },
  beginDrag(){
    UI.dragging = true; GW.Build.draft = true;
    const up = () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); UI.endDrag(); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  },
  /* the slider is let go: rebuild what was drafted at the chosen quality */
  endDrag(){
    if(!UI.dragging) return;
    UI.dragging = false; GW.Build.draft = false;
    UI.flush();
    UI._touched.forEach(id => { const g = G().get(id); if(g){ try { G().rebuild(g); } catch(e){ console.warn(e); } } });
    UI._touched.clear(); UI._sv++;
    UI.mark({ fb: 1, helpers: 1, sync: 1 });
  },

  notes(list){ (list || []).forEach(n => UI.toast(n, 4500)); },

  deleteSel(){
    const g = UI.sel(); if(!g) return;
    const kids = G().children(g.id).length;
    G().remove(g.id); UI.selId = null;
    UI.toast(`Deleted ${g.name}.` + (kids ? ` Its ${kids} meshed gear${kids > 1 ? 's were' : ' was'} left in place.` : ''));
    UI.mark({ props: 1, list: 1, fb: 1, helpers: 1 });
  },

  /* ================================================================== right: the connection group */
  connGroup(g){
    const grp = UI.group('Connection', '');
    const body = grp.querySelector('.gbody'); body.classList.add('conn');
    const host = make('div', null); host.id = 'connHost'; body.appendChild(host);
    UI._conn = { grp, host };
    return grp;
  },
  /* rebuilt whenever the partner / link changes (it holds buttons, so not worth patching in place) */
  syncConn(g){
    const c = UI._conn; if(!c) return;
    const sig = [g.id, g.parentId, g.linkKind, G().list.length, UI.partnerId, UI.linkChoice, g.type, G().version].join('|');
    if(c.sig === sig){ c.grp.querySelector('.gc').textContent = g.parentId ? '●' : ''; return; }
    c.sig = sig;
    const host = c.host; host.innerHTML = '';
    const P = g.parentId ? G().get(g.parentId) : null;
    const st = UI.statusOf(g);
    c.grp.querySelector('.gc').textContent = P ? (st && st.ok ? '● meshed' : '● needs work') : 'free';
    if(P){
      const line = make('div', 'hint');
      line.innerHTML = `${g.linkKind === 'same shaft' ? 'Keyed to the shaft of' : 'Meshed with'} <b style="color:#fff">${esc(P.name)}</b>. ${st && !st.ok ? '<span style="color:var(--bad)">The teeth do not fit yet — see the strip below.</span>' : ''}`;
      host.appendChild(line);
      const bt = make('div', 'cbtns');
      const un = make('button', null, 'Un-mesh'); un.onclick = () => { G().unlink(g.id); UI._sv++; UI.toast(g.name + ' is free again.'); UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 }); };
      bt.appendChild(un); host.appendChild(bt);
      const kinds = st ? st.kind : null;
      ['linkKind', 'meshAngle', 'meshOffset', 'shaftOffset', 'shaftAngle', 'shaftPhase'].forEach(k => {
        if(k === 'shaftAngle' && kinds !== 'bevel') return;
        if(k === 'shaftPhase' && g.linkKind !== 'same shaft') return;
        if(k === 'meshOffset' && (g.linkKind === 'same shaft' || ['bevel', 'spline'].includes(kinds))) return;
        if(k === 'meshAngle' && g.linkKind === 'same shaft') return;
        const ctl = UI.control(g, k);
        if(k === 'shaftOffset'){ ctl.label.textContent = kinds === 'crown' ? 'Slide along radius' : kinds === 'worm' ? 'Slide along worm' : kinds === 'bevel' ? 'Slide along own axis' : 'Offset along shaft'; }
        ctl.sync(); host.appendChild(ctl.row);
      });
    }
    // connect to another gear
    const others = G().list.filter(x => x.id !== g.id && !G().descendants(g.id).some(d => d.id === x.id));
    const head = make('div', 'hint', P ? '<b style="color:#fff">Re-connect to a different gear</b>' : '<b style="color:#fff">Mesh this gear with another</b>');
    head.style.marginTop = '8px'; host.appendChild(head);
    if(!others.length){ host.appendChild(make('div', 'hint', 'Add a second gear to check whether they can mesh.')); }
    else {
      if(!others.some(o => o.id === UI.partnerId)) UI.partnerId = (P && others.some(o => o.id === P.id) ? P.id : (others.find(o => GW.Compat.kindOf(o.type, g.type)) || others[0]).id);
      const r1 = make('div', 'pr wide1'); r1.appendChild(make('label', null, 'Partner'));
      const s1 = make('select'); others.forEach(o => { const op = make('option', null, `${o.name} — ${TYPES[o.type].short}${o.type === 'rack' || o.type === 'worm' ? '' : ', ' + o.z + 't'}`); op.value = o.id; s1.appendChild(op); });
      s1.value = UI.partnerId; s1.onchange = () => { UI.partnerId = +s1.value; UI.mark({ fb: 1 }); c.sig = null; UI.syncConn(g); };
      r1.appendChild(s1); host.appendChild(r1);
      const r2 = make('div', 'pr wide1'); r2.appendChild(make('label', null, 'Connection'));
      const s2 = make('select'); [['mesh', 'Mesh teeth'], ['same shaft', 'Same shaft (compound)']].forEach(([v, l]) => { const o = make('option', null, l); o.value = v; s2.appendChild(o); });
      s2.value = UI.linkChoice; s2.onchange = () => { UI.linkChoice = s2.value; UI.mark({ fb: 1 }); c.sig = null; UI.syncConn(g); };
      r2.appendChild(s2); host.appendChild(r2);
      const A = G().get(UI.partnerId);
      const res = A ? GW.Compat.check(A, g, { kind: UI.linkChoice === 'same shaft' ? 'shaft' : 'mesh' }) : null;
      const bt = make('div', 'cbtns');
      if(A && !(g.parentId === A.id && g.linkKind === UI.linkChoice)){
        const fixable = res && res.issues.some(i => i.level === 'err' && i.optB);
        const go = make('button', 'go', res && res.ok ? (UI.linkChoice === 'mesh' ? 'Mesh them' : 'Put on same shaft') : (fixable ? (res.supported ? 'Fix this gear & mesh' : 'Change & mesh') : 'Connect anyway'));
        go.onclick = () => UI.doLink(A, g, UI.linkChoice, res && res.ok || !fixable ? null : 'B');
        bt.appendChild(go);
      }
      host.appendChild(bt);
    }
    // partners that would work
    const partners = GW.Compat.partnersOf(g.type);
    if(partners.length){
      const t = make('div', 'hint', `A ${TYPES[g.type].label} gear can mesh with — tap to add one already set up to fit:`); t.style.marginTop = '8px'; host.appendChild(t);
      const ch = make('div', 'chips');
      partners.forEach(t2 => { const b = make('button', 'chip', '+ ' + TYPES[t2].label); b.onclick = () => UI.addMatching(g, t2); ch.appendChild(b); });
      host.appendChild(ch);
    }
  },

  /* ================================================================== linking */
  doLink(A, g, kind, side){
    if(side){ const plan = GW.Compat.plan(A, g, { kind: kind === 'same shaft' ? 'shaft' : 'mesh' }, side); G().applyPlan(A, g, plan); }
    if(!G().link(g.id, A.id, kind)){ UI.toast('Those two cannot be linked (it would make a loop).'); return; }
    UI._sv++; g._st = null; UI._conn && (UI._conn.sig = null);
    const st = UI.statusOf(g);
    UI.toast(st && !st.ok ? 'Linked, but the teeth do not fit — see the strip below.' : (kind === 'mesh' ? `${g.name} is now meshed with ${A.name}.` : `${g.name} is keyed to ${A.name}'s shaft.`));
    GW.Scene.fit();
    UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 });
  },
  addMatching(g, type){
    if(!GW.Compat.kindOf(g.type, type)) return;
    const n = G().add(type, { name: TYPES[type].short + ' for ' + g.name });
    GW.meshAuto(n, g, 'mesh', 'B');
    UI._sv++;
    GW.Scene.fit();
    UI.selId = null; UI.select(n.id);
    UI.toast(`Added a ${TYPES[type].label.toLowerCase()} that fits ${g.name}.`);
  },
  /* one fix from the feedback strip: side 'B' changes this gear, 'A' the partner */
  fixIssue(P, g, issue, side){
    const opt = side === 'A' ? issue.optA : issue.optB;
    if(!opt) return;
    G().applyPlan(P, g, { A: opt.A || {}, B: opt.B || {} });
    UI._sv++; g._st = null; P._st = null;
    UI.mark({ list: 1, fb: 1, sync: 1, props: opt.B && opt.B.type || opt.A && opt.A.type ? 1 : 0, helpers: 1 });
  },
  fixAll(P, g, side, thenLink){
    const kind = thenLink || (g.linkKind === 'same shaft' ? 'same shaft' : 'mesh');
    const plan = GW.Compat.plan(P, g, { kind: kind === 'same shaft' ? 'shaft' : 'mesh' }, side);
    G().applyPlan(P, g, plan);
    UI._sv++; g._st = null; P._st = null;
    if(thenLink) UI.doLink(P, g, thenLink, null);
    else UI.mark({ list: 1, fb: 1, sync: 1, props: 1, helpers: 1 });
  },

  /* ================================================================== bottom: the feedback strip */
  renderFeedback(){
    const fb = $('feedback'), body = $('fbInner'), g = UI.sel();
    const C = GW.Compat;
    let head, cols = '', cls = '';
    const kindName = k => ({ ext: 'Parallel-shaft pair', ring: 'Ring and pinion', rack: 'Rack and pinion', bevel: 'Bevel pair', crown: 'Crown and pinion', worm: 'Worm drive', chain: 'Chain drive', belt: 'Belt drive', cyc: 'Cycloidal pair', ell: 'Elliptical pair', spline: 'Spline fit', shaft: 'Same shaft' }[k] || 'Pair');
    UI.kindName = kindName;
    const linkOpt = () => ({ kind: UI.linkChoice === 'same shaft' ? 'shaft' : 'mesh' });
    UI._fbCtx = null;

    if(!g){
      head = { orb: '', title: 'No gear selected', sub: 'Click a gear to see how it behaves. Everything here updates live.' };
      cols = `<div class="fb-col"><h3>Try this</h3><div class="hint">Load a sample on the left, click any gear, then drag a slider in the right sidebar. A red gear does not mesh with its partner, and this strip says why.</div></div><div class="fb-col"></div>`;
    } else {
      const parent = g.parentId ? G().get(g.parentId) : null;
      const kids = G().children(g.id);
      const badKid = kids.find(k => { const s = UI.statusOf(k); return s && !s.ok; });
      // which pair is this strip talking about?
      let mode, P, Cc, res;
      if(parent){ mode = 'linked'; P = parent; Cc = g; res = UI.statusOf(g); }
      else if(kids.length){ mode = 'parent'; P = g; Cc = badKid || kids[0]; res = UI.statusOf(Cc); }
      else { mode = 'free'; P = G().get(UI.partnerId); Cc = g; res = P ? C.check(P, g, linkOpt()) : null; }

      const errs = res ? res.issues.filter(i => i.level === 'err') : [];
      const warns = res ? res.issues.filter(i => i.level !== 'err') : [];
      const btn = (i, idx) => {
        const b = [];
        if(i.optB) b.push(`<button class="mini go" data-fix="${idx}" data-side="B">${i.id === 'type' ? 'Change ' + esc(Cc.name) : 'Set ' + esc(Cc.name)}</button>`);
        if(i.optA) b.push(`<button class="mini" data-fix="${idx}" data-side="A">${i.id === 'type' ? 'Change ' + esc(P.name) : 'Set ' + esc(P.name)}</button>`);
        return b.join('');
      };
      const item = (i, level) => `<div class="need ${level === 'err' ? '' : 'warn'}"><div class="tx">${level === 'err' ? '' : '⚠ '}${i.text}</div><div class="nbtns">${level === 'err' ? btn(i, res.issues.indexOf(i)) : ''}</div></div>`;

      let needHtml = '';
      if(res){
        if(mode === 'parent' && badKid) needHtml += `<div class="hint" style="padding-bottom:6px"><b style="color:#fff">${esc(badKid.name)}</b> does not fit ${esc(g.name)}:</div>`;
        if(errs.length) needHtml += errs.map(i => item(i, 'err')).join('');
        else needHtml += `<div class="okline">${ICON.check}<span>${mode === 'free' ? 'These two can mesh. Same tooth size, pressure angle and fit.' : (mode === 'parent' ? `All ${kids.length} meshed gear${kids.length > 1 ? 's' : ''} fit.` : 'These two mesh correctly.')}</span></div>`;
        needHtml += warns.map(i => item(i, 'warn')).join('');
      }
      const notes = (g.info && g.info.notes) || [];
      needHtml += notes.map(n => `<div class="need warn"><div class="tx">⚠ Adjusted to fit: ${esc(GW.Units.text(n))}</div></div>`).join('');

      // chips: the gears this one drives, and (for a free gear) gears it could mesh with
      let chips = '';
      if(kids.length){
        chips += '<div class="chiph">Drives</div><div class="cands">' + kids.slice(0, 12).map(k => { const s = UI.statusOf(k); return `<button class="cand ${s && s.ok ? 'ok' : ''}" data-goto="${k.id}"><i></i>${esc(k.name)}</button>`; }).join('') + '</div>';
      }
      if(!parent){
        const others = G().list.filter(x => x.id !== g.id && !G().descendants(g.id).some(d => d.id === x.id) && !kids.includes(x));
        if(others.length){
          chips += `<div class="chiph">${kids.length ? 'Could also mesh with' : 'Check against'}</div><div class="cands">` + others.slice(0, 14).map(o => {
            const r = C.check(o, g, linkOpt());
            return `<button class="cand ${r.ok ? 'ok' : ''} ${mode === 'free' && P && o.id === P.id ? 'sel' : ''}" data-cand="${o.id}"><i></i>${esc(o.name)}</button>`;
          }).join('') + '</div>';
        }
      }

      const infoRows = res ? res.info.map(r => ({ k: r[0], v: r[1] })) : [];
      const reads = UI.ownReads(g).concat(infoRows.slice(0, 5)).map(r => `<div class="rd${r.v && GW.Units.text(r.v).length > 16 ? ' w2' : ''}" title="${esc(r.v || '')}"><span>${esc(r.k)}</span><b data-num="${r.num != null ? r.num : ''}" data-fmt="${r.fmt || ''}"${r.unit === 'mm' || r.unit === 'mm/s' ? ' data-len="' + r.unit + '"' : ''}>${r.num != null ? '' : esc(r.v)}${r.unit ? ' <small>' + (r.unit === 'mm' || r.unit === 'mm/s' ? '' : r.unit) + '</small>' + (r.unit === 'mm' || r.unit === 'mm/s' ? '<small class="alt"></small>' : '') : ''}</b></div>`).join('');

      const actions = [];
      if(mode === 'free' && P && res){
        if(res.ok) actions.push(`<button class="mini go" data-act="mesh">${UI.linkChoice === 'mesh' ? 'Mesh them' : 'Put on same shaft'}</button>`);
        else if(res.supported){
          if(errs.some(i => i.optB)) actions.push(`<button class="mini go" data-act="fixmesh-B">Fix ${esc(g.name)} &amp; mesh</button>`);
          if(errs.some(i => i.optA)) actions.push(`<button class="mini" data-act="fixmesh-A">Fix ${esc(P.name)} &amp; mesh</button>`);
          actions.push(`<button class="mini" data-act="force">Mesh anyway</button>`);
        }
      } else if(mode !== 'free' && res && errs.length){
        actions.push(`<button class="mini go" data-act="fixall-B">Fix all on ${esc(Cc.name)}</button>`);
        if(errs.some(i => i.optA)) actions.push(`<button class="mini" data-act="fixall-A">Fix all on ${esc(P.name)}</button>`);
        actions.push(`<button class="mini" data-act="unmesh">Un-mesh ${esc(Cc.name)}</button>`);
      } else if(mode === 'linked'){ actions.push(`<button class="mini" data-act="unmesh">Un-mesh</button>`); }

      // the two ways out when this gear no longer fits the gears around it
      if(UI.problemLinks(g).length){
        actions.push(`<button class="mini go" data-act="match" data-tip="Change the other gears&#10;Adjust every gear linked to this one so it fits these settings, then show what changed.">Change other gears to match</button>`);
        actions.push(`<button class="mini" data-act="explain" data-tip="Why not?&#10;A detailed explanation of what clashes. Nothing is changed.">Explain why</button>`);
      }

      if(mode === 'linked'){
        cls = res && res.ok ? 'ok' : 'bad';
        head = { orb: cls, title: res && res.ok ? `${esc(g.name)} meshes with ${esc(P.name)}` : `${esc(g.name)} does not mesh with ${esc(P.name)} yet`, sub: res ? kindName(res.kind) + (errs.length ? ` · ${errs.length} thing${errs.length > 1 ? 's' : ''} to change` : '') : '' };
      } else if(mode === 'parent'){
        const nbad = kids.filter(k => { const s = UI.statusOf(k); return s && !s.ok; }).length;
        cls = nbad ? 'bad' : 'ok';
        head = { orb: cls, title: `${esc(g.name)} drives ${kids.length} gear${kids.length > 1 ? 's' : ''}`, sub: nbad ? `${nbad} of them ${nbad > 1 ? 'do' : 'does'} not fit yet` : 'every mesh is correct' };
      } else if(P && res){
        cls = res.ok ? 'ok' : 'bad';
        head = { orb: cls, title: res.ok ? `${esc(g.name)} can mesh with ${esc(P.name)}` : (res.supported ? `${esc(g.name)} cannot mesh with ${esc(P.name)} yet` : `${esc(g.name)} and ${esc(P.name)} are not a pair`), sub: res.ok ? 'Press “Mesh them”, or pick another gear to compare.' : 'Here is exactly what it needs:' };
      } else {
        head = { orb: '', title: `${esc(g.name)} — free gear`, sub: G().list.length > 1 ? 'Pick a partner to check whether they fit.' : 'Add a second gear to check whether they mesh.' };
      }
      cols = `<div class="fb-col"><h3>${mode === 'free' ? 'Fit check' : 'What it needs'}</h3>${chips}${needHtml || (P ? '' : '<div class="hint">Nothing to check yet.</div>')}${actions.length ? `<div class="fb-actions">${actions.join('')}</div>` : ''}</div>
        <div class="fb-col"><h3>Readouts</h3><div class="reads">${reads}</div></div>`;
      UI._fbCtx = { P, partner: P, res, g: Cc, sel: g };
    }
    fb.classList.toggle('ok', cls === 'ok'); fb.classList.toggle('bad', cls === 'bad');
    body.innerHTML = GW.Units.text(`<div class="fb-body"><div class="fb-head"><span class="orb ${head.orb}"></span><span class="fb-title">${head.title}</span><span class="fb-sub">${esc(head.sub)}</span></div>${cols ? `<div class="fb-cols">${cols}</div>` : ''}</div>`);
    body.querySelector('.fb-head').onclick = () => UI.toggleFeedback();
    UI.wireFeedback(body);
    // numbers glide to their new values
    body.querySelectorAll('[data-num]').forEach(el => {
      const v = +el.dataset.num; if(isNaN(v) || el.dataset.num === '') return;
      const key = (UI.selId || 0) + ':' + el.parentNode.querySelector('span').textContent;
      const prev = UI._reads && UI._reads[key] != null ? UI._reads[key] : v;
      (UI._reads = UI._reads || {})[key] = v;
      const f = el.dataset.fmt, len = el.dataset.len, Un = GW.Units;
      const put = x => {
        if(len){ el.firstChild.textContent = Un.fmtD(x); const sm = el.querySelector('small'), al = el.querySelector('small.alt'); if(sm) sm.textContent = ' ' + (Un.inch ? 'in' : 'mm') + (len === 'mm/s' ? '/s' : ''); if(al) al.textContent = '(' + Un.other(x) + (len === 'mm/s' ? '/s' : '') + ')'; return; }
        el.firstChild.textContent = f === 'int' ? Math.round(x) : U.fmt(x, f === 'd1' ? 1 : 2);
      };
      if(!el.firstChild || el.firstChild.nodeType !== 3) el.insertBefore(document.createTextNode(''), el.firstChild);
      if(Math.abs(prev - v) < 1e-9) put(v); else GW.Anim.tween(380, (p, e) => put(prev + (v - prev) * e), { key });
    });
  },

  ownReads(g){
    const R = GW.Calc.radii(g), reads = [];
    const w = g.rt && g.rt.omega || 0;
    if(g.type === 'rack') reads.push({ k: 'Travel', num: Math.abs(w), unit: 'mm/s', fmt: 'd1' });
    else reads.push({ k: 'Speed', num: Math.abs(w * 30 / Math.PI), unit: 'rpm' + (w < 0 ? ' ↺' : ' ↻'), fmt: 'd1' });
    if(g.type !== 'rack' && isFinite(R.r)) reads.push({ k: 'Pitch Ø', num: 2 * R.r, unit: 'mm', fmt: 'd1' });
    return reads;
  },

  wireFeedback(body){
    const ctx = UI._fbCtx; if(!ctx) return;
    body.querySelectorAll('[data-cand]').forEach(b => b.onclick = e => { e.stopPropagation(); UI.partnerId = +b.dataset.cand; if(UI._conn) UI._conn.sig = null; UI.mark({ fb: 1, sync: 1 }); });
    body.querySelectorAll('[data-goto]').forEach(b => b.onclick = e => { e.stopPropagation(); UI.select(+b.dataset.goto); });
    body.querySelectorAll('[data-fix]').forEach(b => b.onclick = e => { e.stopPropagation(); UI.fixIssue(ctx.P, ctx.g, ctx.res.issues[+b.dataset.fix], b.dataset.side); });
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const { P, g } = ctx, partner = P, a = b.dataset.act, kind = UI.linkChoice;
      if(a === 'mesh') UI.doLink(partner, g, kind, null);
      else if(a === 'force') UI.doLink(partner, g, kind, null);
      else if(a === 'match') UI.matchOthers(UI.sel() || g);
      else if(a === 'explain') UI.explain(UI.sel() || g);
      else if(a === 'fixmesh-B') UI.fixAll(partner, g, 'B', kind);
      else if(a === 'fixmesh-A') UI.fixAll(partner, g, 'A', kind);
      else if(a === 'fixall-B') UI.fixAll(P, g, 'B');
      else if(a === 'fixall-A') UI.fixAll(P, g, 'A');
      else if(a === 'unmesh'){ G().unlink(g.id); UI._sv++; UI.toast(g.name + ' is free again.'); UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 }); }
    });
  },

  /* what the chosen process does to this gear, in words and numbers */
  tolText(g){
    const a = GW.Tol.allowance(g), mb = GW.Tol.minBacklash(g), P = GW.Tol.of(g);
    const parts = [];
    if(g.bore > 0 && a.bore > 0) parts.push(`Bore is cut <b class="val">${U.fmt(g.bore + a.bore, 3)} mm</b> for a ${U.fmt(g.bore, 3)} mm shaft (+${U.fmt(a.bore, 3)} mm).`);
    if(g.keyW > 0 && a.key > 0) parts.push(`Keyway is opened by ${U.fmt(a.key, 3)} mm.`);
    if(mb > 0) parts.push(`Smallest backlash for ${esc(P.label.replace(/ \(.*/, ''))}: <b class="val">${U.fmt(mb, 3)} mm</b>${g.backlash < mb - 1e-6 ? ' (this gear has less)' : ''}.`);
    return GW.Units.text(parts.join(' ') || 'No tolerance is added: the part is built to the exact numbers.');
  },
  /* give every gear one process, open bores to match, and lift any backlash that is too tight to run */
  bestFit(g){
    if(!g) return; GW.History.commit();
    const proc = g.tolerance, changed = [];
    G().list.forEach(x => {
      if(x.tolerance !== proc){ G().set(x, 'tolerance', proc); }
      const mb = GW.Tol.minBacklash(x);
      if(GW.Tol.hasTeeth(x) && x.backlash < mb - 1e-6){ changed.push(`${x.name}: backlash ${U.fmt(x.backlash, 3)} → ${U.fmt(mb, 3)} mm`); G().set(x, 'backlash', +mb.toFixed(3)); }
    });
    G().dirty = true; UI._sv++; G().list.forEach(x => { x._st = null; });
    UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 }); UI.flush(); GW.History.commit();
    UI.toast(changed.length ? `Best-fit tolerances set (${GW.Tol.PROCESSES[proc].label.replace(/ \(.*/, '')}). Backlash raised on ${changed.length} gear${changed.length > 1 ? 's' : ''}.` : `Best-fit tolerances set for ${G().list.length} gear${G().list.length > 1 ? 's' : ''} (${GW.Tol.PROCESSES[proc].label.replace(/ \(.*/, '')}).`);
  },

  /* ================================================================== matching the neighbors / explaining a clash */
  /* the links around a gear (to its parent and to each child) that do not currently fit */
  problemLinks(g){
    const out = [];
    if(g.parentId){ const st = UI.statusOf(g); if(st && st.supported && !st.ok) out.push({ parent: G().get(g.parentId), child: g, res: st }); }
    G().children(g.id).forEach(k => { const st = UI.statusOf(k); if(st && st.supported && !st.ok) out.push({ parent: g, child: k, res: st }); });
    return out;
  },
  plain(html){ return String(html).replace(/<[^>]+>/g, ''); },
  fmtVal(key, v, gear){
    const def = GW.Types.PARAMS[key] || GW.Types.LINK_PARAMS[key] || [], unit = def[6];
    if(key === 'type') return GW.Types.TYPES[v] ? GW.Types.TYPES[v].label : v;
    if(unit === 'mm') return U.fmt(+v, 3) + ' mm';                 // callers pass the text through Units.text
    if(typeof v === 'number') return U.fmt(v, 3) + (Array.isArray(unit) ? '' : (unit ? ' ' + unit : ''));
    return String(v);
  },
  label(key){ const d = GW.Types.PARAMS[key] || GW.Types.LINK_PARAMS[key]; return d ? d[0] : key; },

  /* change every gear linked to this one (and the gears linked to those) so each pair fits again, and report it */
  matchOthers(g){
    const log = [], seen = new Set([g.id]), queue = [g], touched = [];
    GW.History.commit();
    while(queue.length){
      const X = queue.shift();
      const nb = []; if(X.parentId) nb.push(G().get(X.parentId)); G().children(X.id).forEach(k => nb.push(k));
      nb.forEach(N => {
        if(!N || seen.has(N.id)) return; seen.add(N.id); queue.push(N);
        const kid = N.parentId === X.id, parent = kid ? X : N, child = kid ? N : X;
        const link = { kind: child.linkKind === 'same shaft' ? 'shaft' : 'mesh' };
        const before = GW.Compat.check(parent, child, link);
        if(before.ok) return;
        const why = before.issues.filter(i => i.level === 'err').map(i => UI.plain(i.text));
        const plan = GW.Compat.plan(parent, child, link, kid ? 'B' : 'A');
        const set = kid ? plan.B : plan.A;                     // only the OTHER gear is changed; this one stays as it is
        const keys = Object.keys(set || {}); if(!keys.length) return;
        const from = {}; keys.forEach(k => { from[k] = N[k]; });
        if(set.type) G().set(N, 'type', set.type);
        keys.forEach(k => { if(k !== 'type') G().set(N, k, set[k]); });
        log.push({ gear: N, with: X, why, changes: keys.map(k => ({ key: k, from: from[k], to: N[k] })) });
        touched.push(N);
      });
    }
    G().dirty = true; UI._sv++; UI.selId === g.id || (UI.selId = g.id);
    G().list.forEach(x => { x._st = null; });
    UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 }); UI.flush();
    // anything that still does not fit (needs a change on THIS gear)
    const left = [];
    seen.forEach(id => { const x = G().get(id); if(!x || !x.parentId || !seen.has(x.parentId)) return; const st = UI.statusOf(x); if(st && !st.ok) left.push({ gear: x, parent: G().get(x.parentId), issues: st.issues.filter(i => i.level === 'err') }); });
    UI.showMatchReport(g, log, left);
    GW.History.commit();
  },

  showMatchReport(g, log, left){
    const row = c => `<li><b>${esc(UI.label(c.key))}</b>: ${esc(GW.Units.text(UI.fmtVal(c.key, c.from)))} <span class="arrow">→</span> <b class="val">${esc(GW.Units.text(UI.fmtVal(c.key, c.to)))}</b></li>`;
    let html = `<div class="mhead"><h3>Other gears now match ${esc(g.name)}</h3><button class="iconbtn" id="mClose" aria-label="Close">${ICON.x}</button></div><div class="mbody an">`;
    if(!log.length) html += `<p>Nothing could be changed on the other gears to fix this. See below for what ${esc(g.name)} itself needs.</p>`;
    else html += `<p>${log.length} gear${log.length > 1 ? 's were' : ' was'} adjusted so every link fits ${esc(g.name)}'s new settings. ${esc(g.name)} was left exactly as you set it.</p>`;
    log.forEach(e => {
      html += `<section class="anx"><h4>${esc(e.gear.name)} <small>(was clashing with ${esc(e.with.name)})</small></h4><ul>${e.changes.map(row).join('')}</ul>`;
      if(e.why.length) html += `<p class="why">Because: ${e.why.map(w => esc(GW.Units.text(w))).join('; ')}.</p>`;
      html += '</section>';
    });
    if(left.length){
      html += '<section class="anx bad"><h4>Still not compatible</h4><p>These cannot be fixed by changing the other gear. They need a change on the gear you edited:</p><ul>';
      left.forEach(l => { l.issues.forEach(i => { html += `<li><b>${esc(l.gear.name)} + ${esc(l.parent.name)}</b>: ${GW.Units.text(i.text)}</li>`; }); });
      html += '</ul></section>';
    } else if(log.length) html += '<p class="okline">' + ICON.check + '<span>Every link around ' + esc(g.name) + ' now fits.</span></p>';
    html += `<div class="mfoot"><button id="mUndo">Undo these changes</button><button class="go" id="mOk">Done</button></div></div>`;
    UI.openModal(html);
    $('mClose').onclick = $('mOk').onclick = UI.closeModal;
    $('mUndo').onclick = () => { UI.closeModal(); GW.History.undo(); };
  },

  /* the plain-English reason behind each kind of clash */
  WHY: {
      m: 'Teeth only fit into the gaps of another gear if they are the same size. The module sets the tooth size, so two meshing gears must share it exactly.',
      pa: 'The pressure angle is the slope of the tooth flank. Flanks with different slopes touch at a point instead of rolling along each other, which wears fast and runs noisily.',
      helix: 'Slanted teeth must lean opposite ways (or the same angle against a ring or rack) so the slants line up along the whole width of the teeth.',
      clearance: 'A tooth tip must stay clear of the root of the tooth space it enters. If it reaches into the root the two gears jam or the teeth break.',
      undercut: 'With few teeth the root of each tooth gets cut away by the tooth shape. That weakens the tooth. A profile shift or more teeth fixes it.',
      contact: 'The contact ratio is how many teeth are touching on average. Below about 1.2 the load jumps from tooth to tooth, and below 1 the drive stalls and skips.',
      apart: 'The gears are being held at a distance from each other that is not the meshing distance, so teeth do not reach into each others gaps.',
      collide: 'The numbers say the gears fit, but the real shapes overlap while turning. Something about the tooth shape (heights, shift, backlash) makes the teeth run into each other.',
      type: 'These two kinds of gear cannot be paired directly. A different type on one side makes the pair work.',
      z: 'The tooth counts have a problem for this pair: for example the teeth must divide evenly around a ring, or a gear is too small for the other.',
      bore: 'Two gears on one shaft need the same bore, or one of them wobbles or does not fit.',
      thick: 'The faces of the two gears barely overlap along the shaft, so only a small part of each tooth carries load.',
      backlash: 'Backlash is the little gap between teeth. With none at all, parts that are printed or machined will bind.',
      phase: 'The teeth of the two gears are not lined up as they must be at the start of the mesh.',
      cone: 'Bevel gears must have cone angles that add up to the angle between the shafts.',
      spiral: 'Spiral bevel teeth must curve in opposite directions to run together.',
      chainPitch: 'A chain only sits on the sprocket teeth if the pitch of the chain and the sprocket are the same.', rollerDia: 'The roller of the chain must be the same size on both sprockets or it rides up the tooth.',
      beltPitch: 'A timing belt only sits in the pulley grooves if the belt pitch is the same on both pulleys.', majorA: 'Elliptical gears only roll against each other if their ellipses are the same size.', rollR: 'Cycloidal teeth only roll together if they were cut with the same rolling circle.'
    },

  /* a detailed explanation of what clashes, why, and every way out; changes nothing until an option is applied */
  explain(g){
    const links = UI.problemLinks(g), T2 = t => esc(GW.Units.text(t));
    const val = (k, v) => T2(UI.fmtVal(k, v));
    // the changes of one fix plan, as a table: setting, now, becomes
    const changesTable = (gear, set, why) => {
      const keys = Object.keys(set || {}); if(!keys.length) return '';
      return `<table class="chg"><thead><tr><th>${esc(gear.name)}</th><th>Now</th><th></th><th>Change to</th></tr></thead><tbody>${keys.map(k => `<tr><td>${esc(UI.label(k))}</td><td>${val(k, gear[k])}</td><td class="arrow">→</td><td class="to">${val(k, set[k])}</td></tr>`).join('')}</tbody></table>`;
    };
    // what a plan leaves behind once it is applied (checked on copies, nothing is touched)
    const outcome = (P, C, link, plan) => {
      const a = Object.assign({}, P, plan.A || {}, Object.keys(plan.A || {}).length ? { info: null } : {}), b = Object.assign({}, C, plan.B || {}, Object.keys(plan.B || {}).length ? { info: null } : {});
      const r = GW.Compat.check(a, b, link), errs = r.issues.filter(i => i.level === 'err');
      return errs.length ? { ok: false, left: errs.map(i => UI.plain(i.text)) } : { ok: true, left: [] };
    };
    let html = `<div class="mhead"><h3>Why ${esc(g.name)} does not fit</h3><button class="iconbtn" id="mClose" aria-label="Close">${ICON.x}</button></div><div class="mbody an">`;
    if(!links.length) html += `<p class="okline">${ICON.check}<span>Everything linked to ${esc(g.name)} fits. Nothing to explain.</span></p>`;
    else html += `<p class="lead"><b>${links.length} link${links.length > 1 ? 's' : ''}</b> around ${esc(g.name)} ${links.length > 1 ? 'do' : 'does'} not fit. For each one you get <b>1. what clashes</b>, <b>2. why it matters</b> and <b>3. every way to fix it</b>. Nothing is changed until you press an Apply button.</p>`;
    const applies = [];
    links.forEach((L, li) => {
      const P = L.parent, C = L.child, other = P === g ? C : P;
      const link = { kind: C.linkKind === 'same shaft' ? 'shaft' : 'mesh' };
      const errs = L.res.issues.filter(i => i.level === 'err'), warns = L.res.issues.filter(i => i.level !== 'err');
      html += `<section class="anx bad"><h4>${esc(g.name)} + ${esc(other.name)} <small>${esc(UI.kindName(L.res.kind))}</small><span class="verdict">${errs.length} problem${errs.length > 1 ? 's' : ''}</span></h4>`;

      // 1 + 2: what clashes and why it matters
      html += '<h5><i>1</i> What clashes, and why it matters</h5><div class="probs">';
      errs.forEach(i => {
        const key = (GW.Types.PARAMS[i.id] || GW.Types.LINK_PARAMS[i.id]) ? i.id : null;
        html += `<div class="prob"><div class="pt">${GW.Units.text(i.text)}</div>`;
        if(key) html += `<table class="cmp"><tr><th></th><th>${esc(P.name)}</th><th>${esc(C.name)}</th></tr><tr><td>${esc(UI.label(key))}</td><td>${val(key, P[key])}</td><td>${val(key, C[key])}</td></tr></table>`;
        html += `<p class="whyt">${esc(UI.WHY[i.id] || 'The two gears cannot work together this way.')}</p></div>`;
      });
      html += '</div>';

      // 3: every way out
      html += '<h5><i>2</i> Your options</h5><div class="opts">';
      const optFor = (side, title, lead, thisFirst) => {
        const plan = GW.Compat.plan(P, C, link, side), onOther = other === P ? plan.A : plan.B, onThis = other === P ? plan.B : plan.A;
        const nO = Object.keys(onOther || {}).length, nT = Object.keys(onThis || {}).length;
        if(!nO && !nT) return `<div class="opt dead"><h6>${title}</h6><p>${lead} Not possible here: none of the problems can be solved this way.</p></div>`;
        const res = outcome(P, C, link, plan), id = applies.push({ P, C, plan }) - 1;
        const first = thisFirst ? [g, onThis] : [other, onOther], second = thisFirst ? [other, onOther] : [g, onThis];
        const left = res.left.map(x => x.replace(/[.\s]+$/, ''));
        return `<div class="opt ${res.ok ? 'good' : ''}"><h6>${title}</h6><p>${lead}</p>${changesTable(first[0], first[1])}${Object.keys(second[1] || {}).length ? `<p class="also">This option also needs these changes on <b>${esc(second[0].name)}</b>:</p>${changesTable(second[0], second[1])}` : ''}
          <p class="res ${res.ok ? 'ok' : 'bad'}">${res.ok ? '✓ After this the pair fits.' : '✗ Still not fitting afterwards: ' + left.map(T2).join('; ') + '.'}</p>
          <button class="go apply" data-ap="${id}">Apply this option</button></div>`;
      };
      html += optFor(P === g ? 'B' : 'A', `Option A · Change ${esc(other.name)} to match ${esc(g.name)}`, `${esc(g.name)} stays exactly as you set it.`, false);
      html += optFor(P === g ? 'A' : 'B', `Option B · Change ${esc(g.name)} to match ${esc(other.name)}`, `${esc(other.name)} stays as it is; ${esc(g.name)} is changed to what ${esc(other.name)} needs.`, true);
      const fits = GW.Compat.partnersOf(P === g ? g.type : P.type);
      html += `<div class="opt"><h6>Option C · Take the link away</h6><p>Un-mesh ${esc(C.name)}. It keeps its shape and stays where it is, it just stops following ${esc(P.name)}.</p><button class="apply" data-un="${C.id}">Un-mesh ${esc(C.name)}</button></div>`;
      html += `<div class="opt"><h6>Option D · Pick a different partner type</h6><p>A ${esc(GW.Types.TYPES[g.type].label.toLowerCase())} can mesh with: ${GW.Compat.partnersOf(g.type).map(t => esc(GW.Types.TYPES[t].label)).join(', ') || 'nothing else'}. Add one from the Connection section of the properties panel and it is set up to fit.</p></div>`;
      html += '</div>';
      if(warns.length) html += `<h5><i>!</i> Also worth knowing</h5><ul class="warns">${warns.map(i => `<li>${GW.Units.text(i.text)}</li>`).join('')}</ul>`;
      html += '</section>';
    });
    html += `<div class="mfoot"><button id="mMatch" class="go">Change ALL other gears to match</button><button id="mOk">Close</button></div></div>`;
    UI.openModal(html);
    $('mClose').onclick = $('mOk').onclick = UI.closeModal;
    $('mMatch').onclick = () => { UI.closeModal(); UI.matchOthers(g); };
    if(!links.length) $('mMatch').style.display = 'none';
    document.querySelectorAll('#modal [data-ap]').forEach(b => b.onclick = () => {
      const o = applies[+b.dataset.ap]; GW.History.commit();
      G().applyPlan(o.P, o.C, o.plan); G().dirty = true; UI._sv++; G().list.forEach(x => { x._st = null; });
      UI.closeModal(); UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 }); UI.flush(); GW.History.commit(); UI.toast('Option applied. Undo (Ctrl+Z) takes it back.');
    });
    document.querySelectorAll('#modal [data-un]').forEach(b => b.onclick = () => { GW.History.commit(); G().unlink(+b.dataset.un); UI._sv++; UI.closeModal(); UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 }); GW.History.commit(); UI.toast('Un-meshed. Undo (Ctrl+Z) takes it back.'); });
  },

  /* ================================================================== modals */
  openModal(html){ $('modal').innerHTML = html; $('modalBg').classList.add('show'); },
  closeModal(){ $('modalBg').classList.remove('show'); },
  confirm(msg, label, fn){
    UI.openModal(`<div class="mhead"><h3>Are you sure?</h3></div><div class="mbody"><p style="font-size:14px;line-height:1.5">${esc(msg)}</p><div class="mfoot"><button id="cNo">Cancel</button><button class="danger" id="cYes">${esc(label)}</button></div></div>`);
    $('cNo').onclick = UI.closeModal; $('cYes').onclick = () => { UI.closeModal(); fn(); };
  },
  /* the little status card: an icon for what kind of message it is, and an outline that draws itself
     once around the card each time a message arrives */
  toast(msg, ms, kind){
    const t = $('toast'); msg = String(msg);
    kind = kind || (/cannot|could not|failed|not a /i.test(msg) ? 'bad' : /but the teeth|\bbut\b.*(fit|mesh)/i.test(msg) ? 'warn' : /^(undid|redid)/i.test(msg) ? 'undo' : /deleted|removed|clear|free again/i.test(msg) ? 'del' : 'ok');
    const ic = { ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', bad: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.1"/>', warn: '<path d="M12 4 2.8 20h18.4zM12 10v5M12 17.5v.1"/>', del: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>' }[kind];
    t.className = 'toast ' + kind;
    t.innerHTML = '<svg class="t-ic" viewBox="0 0 24 24">' + ic + '</svg><span class="t-tx"></span><svg class="t-ring" preserveAspectRatio="none"><rect pathLength="1" x="0.75" y="0.75" rx="10" ry="10"/></svg>';
    t.querySelector('.t-tx').textContent = GW.Units.text(msg);
    const r = t.querySelector('.t-ring rect'); const b = t.getBoundingClientRect();
    r.setAttribute('width', Math.max(10, b.width - 1.5)); r.setAttribute('height', Math.max(10, b.height - 1.5));
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove('show'), ms || 3000);
  },

  openAdd(){
    const groups = {};
    Object.keys(TYPES).forEach(t => { (groups[TYPES[t].group] = groups[TYPES[t].group] || []).push(t); });
    let html = `<div class="mhead"><h3>Add a gear</h3><button class="iconbtn" id="mClose" aria-label="Close">${ICON.x}</button></div><div class="mbody">`, i = 0;
    Object.keys(groups).forEach(gr => {
      html += `<h4>${gr}</h4><div class="cards">`;
      groups[gr].forEach(t => { html += `<button class="card" data-t="${t}" style="animation-delay:${i++ * 25}ms"><canvas class="cth" width="264" height="184" aria-hidden="true"></canvas><b>${TYPES[t].label}</b><span>${TYPES[t].desc}</span></button>`; });
      html += '</div>';
    });
    UI.openModal(html + '</div>');
    $('mClose').onclick = UI.closeModal;
    document.querySelectorAll('#modal .card').forEach(c => {
      GW.Preview.thumb(c.querySelector('canvas'), { type: c.dataset.t });
      const on = () => GW.Preview.show({ type: c.dataset.t, anchor: c, side: 'right' }), off = () => GW.Preview.hide();
      c.addEventListener('pointerenter', on); c.addEventListener('pointerleave', off); c.addEventListener('focus', on); c.addEventListener('blur', off);
    });
    document.querySelectorAll('#modal .card').forEach(c => c.onclick = () => {
      GW.Preview.hide(); UI.closeModal();
      const g = G().add(c.dataset.t);
      GW.Scene.fit(false, G().list);
      UI.selId = null; UI.select(g.id);
      if(window.innerWidth <= 980) UI.drawer('right');
    });
  },

  tidy(){
    const roots = G().list.filter(g => !g.parentId);
    let x = 0; const info = [];
    roots.forEach(r => { const c = G().assemblyCircle(r); x += c.R; info.push({ r, x }); x += c.R + 14; });
    const shift = (x - 14) / 2;
    info.forEach(({ r, x: cx }) => { G().set(r, 'px', cx - shift); G().set(r, 'py', 0); });
    GW.Scene.fit(); UI.mark({ sync: 1, helpers: 1 }); UI.toast('Assemblies lined up.');
  },

  saveProject(){
    const blob = new Blob([JSON.stringify(G().toJSON(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gear-maker-project.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  },
  loadProject(file){
    const rd = new FileReader();
    rd.onload = () => {
      try { const d = JSON.parse(rd.result); if(d.app !== 'gear-maker' && d.app !== 'gearworks') throw new Error('not a Gear Maker project'); UI.selId = null; G().fromJSON(d); GW.Scene.fit(); UI.toast('Project loaded.'); UI.mark({ list: 1, props: 1, fb: 1, helpers: 1 }); }
      catch(e){ UI.toast('Could not open that file: ' + e.message, 5000); }
    };
    rd.readAsText(file);
  },

  /* ================================================================== export dialog */
  openExport(scope){
    const g = UI.sel();
    const st = UI.exportState = Object.assign({ format: 'stl', scope: g ? 'assembly' : 'all', pose: 'world', split: false, drives: true, name: 'gear-maker' }, UI.exportState || {}, scope ? { scope } : {});
    if(!g && st.scope !== 'all') st.scope = 'all';
    const radio = (name, val, label, sub) => `<label class="opt"><input type="radio" name="${name}" value="${val}" ${st[name] === val ? 'checked' : ''}><span><b>${label}</b>${sub ? '<small>' + sub + '</small>' : ''}</span></label>`;
    UI.openModal(`<div class="mhead"><h3>Export 3D files</h3><button class="iconbtn" id="mClose" aria-label="Close">${ICON.x}</button></div>
      <div class="mbody">
        <h4>Format</h4>
        <div class="opts">${radio('format', 'stl', 'STL', 'binary — 3D printing')}${radio('format', 'stla', 'STL (ASCII)', 'text, larger')}${radio('format', 'obj', 'OBJ', 'meshes, Blender')}${radio('format', 'step', 'STEP', 'CAD solids')}</div>
        <h4>What to export</h4>
        <div class="opts col">${radio('scope', 'selected', 'Selected gear only', g ? esc(g.name) : 'select a gear first')}${radio('scope', 'assembly', 'Selected gear + everything it is connected to', g ? 'its whole assembly' : 'select a gear first')}${radio('scope', 'all', 'Everything on the table', G().list.length + ' gears')}</div>
        <h4>Layout</h4>
        <div class="opts col">${radio('pose', 'world', 'As assembled', 'gears where they are in the 3D view (includes chains and belts)')}${radio('pose', 'flat', 'Flat on the print bed', 'each gear lying on its face, side by side')}</div>
        <label class="chk"><input type="checkbox" id="xSplit" ${st.split ? 'checked' : ''}> one file per gear (downloads a .zip)</label>
        <div class="mrow"><label>File name</label><input type="text" id="xName" value="${esc(st.name)}"></div>
        <div class="mhint" id="xInfo"></div>
        <div class="mfoot"><button class="go" id="xGo">Download</button></div>
        <div class="mhint">Millimeters, Z up. STEP files are faceted solids: flat areas are single faces, curved areas are small flat facets. Gears with hubs, webs or flanges export as a few overlapping solids to union in your CAD tool.</div>
      </div>`);
    $('mClose').onclick = UI.closeModal;
    const update = () => {
      document.querySelectorAll('#modal input[type=radio]').forEach(r => { if(r.checked) st[r.name] = r.value; });
      st.split = $('xSplit').checked; st.name = $('xName').value;
      const solids = GW.Export.collect(st.scope, st.pose, UI.selId, st.pose === 'world');
      const s = GW.Export.stats(solids);
      $('xInfo').textContent = solids.length ? `${solids.length} part${solids.length > 1 ? 's' : ''} · ${s.tris.toLocaleString()} triangles · ${s.size.map(v => GW.Units.fmtD(v)).join(' × ')} ${GW.Units.unit()} (${s.size.map(v => GW.Units.other(v).replace(/ (mm|in)$/, '')).join(' × ')} ${GW.Units.inch ? 'mm' : 'in'})` : 'Nothing to export.';
      $('xGo').disabled = !solids.length;
    };
    document.querySelectorAll('#modal input').forEach(i => i.oninput = update);
    update();
    $('xGo').onclick = () => {
      update();
      const files = GW.Export.files({ format: st.format, scope: st.scope, pose: st.pose, split: st.split, drives: st.drives, name: st.name }, UI.selId);
      if(!files.length) return;
      GW.Export.download(files, GW.Export.safe(st.name));
      UI.toast('Exported ' + files.map(f => f.name).slice(0, 3).join(', ') + (files.length > 3 ? '…' : ''));
      UI.closeModal();
    };
  }
};
})();
