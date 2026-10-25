"use strict";
/* Gear Maker — "How do I use it?": a short guided tour. The screen dims except for the part being
   explained; a card beside it says what to do. Steps do things on the real app (load a sample, select a
   gear, drag a value, break a mesh and fix it) so you see the result, and Exit puts back whatever you had
   on the table. Esc leaves at any time. */
(function(){
const U = GW.U, $ = U.el, G = () => GW.Gears;

const Guide = GW.Guide = {
  active: false, i: 0, token: 0,

  start(){
    if(Guide.active) return;
    Guide.active = true; Guide.i = 0;
    // remember what was on the table, so leaving the tour gives it back
    Guide.saved = { json: JSON.parse(JSON.stringify(G().toJSON())), sel: GW.UI.selId, spin: G().spin };
    Guide.kept = false;
    const gd = $('gd'); gd.hidden = false;
    gd.innerHTML = '<div class="gd-hole nohole"></div><div class="gd-card swap"></div>';
    Guide.hole = gd.querySelector('.gd-hole'); Guide.card = gd.querySelector('.gd-card');
    window.addEventListener('resize', Guide.relayout);
    Guide.go(0);
  },

  stop(keep){
    if(!Guide.active) return;
    Guide.active = false; Guide.token++;
    window.removeEventListener('resize', Guide.relayout);
    const gd = $('gd'); gd.hidden = true; gd.innerHTML = '';
    $('app').classList.remove('show-left', 'show-right');
    $('legend').classList.remove('gone');
    if(!keep && Guide.saved){
      GW.UI.selId = null;
      G().clear({ stagger: 25 });
      const s = Guide.saved;
      setTimeout(() => { G()._stagger = { n: 0, step: 80 }; try { G().fromJSON(s.json); } finally { G()._stagger = null; } GW.Scene.fit(); GW.UI.setPlaying(s.spin); if(s.sel != null && G().get(s.sel)) GW.UI.select(s.sel); GW.UI.mark({ list: 1, props: 1, fb: 1 }); }, 380);
    }
  },

  /* ---------------------------------------------------------------- the steps */
  steps(){
    const UI = GW.UI;
    const sun = () => G().list.find(g => g.name === 'Sun') || G().list[0];
    const planet = () => G().list.find(g => g.name === 'Planet 1') || G().list[1];
    const open = side => { if(window.innerWidth <= 980){ $('app').classList.toggle('show-left', side === 'left'); $('app').classList.toggle('show-right', side === 'right'); } };
    return [
      { title: 'Welcome to Gear Maker', text: 'A lab for <b>16 kinds of gear</b>: build them, spin them, find out whether they mesh, and export them for printing or CAD.\n\nThis tour takes about a minute. The screen has three areas: <b>samples on the left</b>, <b>every property on the right</b> and <b>feedback along the bottom</b>.', target: null, where: 'center', next: 'Start' },
      { title: 'Samples live on the left', text: 'Click any sample to load it straight away (it replaces the table), or press its <b>+</b> to build it beside what you have. Hover one to preview it first.\n\nI have just loaded a <b>planetary gearset</b> for you.',
        target: () => $('secSamples'), where: 'right', enter(){ open('left'); UI.markSample('planetary'); UI.loadSample(GW.Presets.find(p => p.id === 'planetary'), true); } },
      { title: 'Look around', text: '<b>Drag</b> to orbit, <b>right-drag</b> (or Shift-drag) to pan, <b>wheel</b> to zoom. The buttons at the top right jump to a top, front or isometric view.\n\nThe gears are really turning: the sun drives the planets, the planets drive the ring.',
        target: () => Guide.stageRect(), where: 'center-bottom', enter(){ open(null); $('legend').classList.remove('gone'); GW.Scene.flyTo({ theta: 0.5, phi: 0.75 }, 1600); } },
      { title: 'Click a gear to select it', text: 'A selected gear glows blue, with its pitch circle and shaft drawn on it.\n\nI have picked the <b>Sun</b>. Clicking empty space lets go; clicking another gear switches to it.',
        target: () => Guide.gearRect(sun()), where: 'auto', ping: true, enter(){ GW.Scene.flyTo({ theta: -0.55, phi: 1.0 }, 900); UI.selId = null; UI.mark({ props: 1 }); setTimeout(() => { if(Guide.active) UI.select(sun().id); }, 700); } },
      { title: 'Every property, live', text: 'The right sidebar lists <b>every setting</b> of the selected gear: teeth, module, pressure angle, body, bore, hub, speed, finish and more. Drag a slider or type a number and the 3D model updates as you go.\n\nWatch the <b>face width</b> change by itself.',
        target: () => { const c = UI.ctl.thick; return c ? c.row : $('right'); }, where: 'left', ping: true,
        enter(){ open('right'); UI.openGroups.Body = true; UI.mark({ props: 1 }); setTimeout(() => Guide.demo('thick', [10, 20, 10]), 700); } },
      { title: 'Feedback along the bottom', text: 'The strip at the bottom tells you how the selected gear behaves: <b>green</b> means it meshes with its partner, and you get its speed, pitch diameter, ratio, center distance and contact ratio.',
        target: () => $('feedback'), where: 'top', enter(){ open(null); GW.UI.toggleFeedback(false); UI.select(planet().id); } },
      { title: 'Break it on purpose', text: 'I just changed Planet 1\'s <b>module</b> to 3. Gears only mesh when their tooth size matches, so the strip turns <b>red</b> and says exactly what it needs.',
        target: () => $('feedback'), where: 'top', enter(){ const p = planet(); p._tourM = p.m; UI.queue(p, 'm', 3); UI.flush(); }, leave(){ } },
      { title: 'One click to fix it', text: 'Each problem has a button: <b>Set mine</b> changes this gear, <b>Set …</b> changes the partner. <b>Fix all</b> does everything at once. I will press it for you.',
        target: () => $('feedback'), where: 'top', enter(){ setTimeout(() => { if(!Guide.active) return; const b = document.querySelector('#fbInner [data-act="fixall-B"]'); if(b) b.click(); }, 1100); } },
      { title: 'Mesh your own gears', text: '<b>Add gear</b> lets you pick any of the 16 types. Then use <b>Connection</b> at the top of the right sidebar: choose a partner and press <b>Fix this gear & mesh</b>, or tap <b>+ Spur</b> and so on to add a new gear that is already set up to fit.',
        target: () => $('addBtn'), where: 'bottom-left', ping: true, enter(){ open('right'); } },
      { title: 'Playback and view', text: 'The bar at the top of the 3D view has undo and redo (Ctrl + Z, Ctrl + Y), pause and speed, the pitch circles and the mesh quality. The buttons on the right change the camera and fade the floor grid.',
        target: () => $('vp'), where: 'bottom', enter(){ open(null); } },
      { title: 'Export', text: '<b>Export</b> saves STL, OBJ or STEP: one gear, a whole assembly or everything, as assembled or laid flat for printing. Chains and belts are included.',
        target: () => $('exportBtn'), where: 'bottom-left', ping: true, enter(){ open(null); } },
      { title: 'That\'s the tour', text: 'Gears you build are yours: <b>Save</b> and <b>Open</b> in the left sidebar keep a project as a file. The <b>How do I use it?</b> button is always there if you want this again.\n\nKeep the planetary sample, or go back to what you had?', target: null, where: 'center', last: true }
    ];
  },

  stageRect(){ const r = $('stage').getBoundingClientRect(); return { left: r.left + 8, top: r.top + 8, width: r.width - 16, height: r.height - 90 }; },
  gearRect(g){
    if(!g) return null;
    const S = GW.Scene, r = S.renderer.domElement.getBoundingClientRect();
    g.mesh.updateMatrixWorld(true);
    const c = g.mesh.position.clone(); const rad = Math.max(GW.Gears.reach(g), 8);
    const p = c.clone().project(S.camera);
    const right = new THREE.Vector3().setFromMatrixColumn(S.camera.matrixWorld, 0).multiplyScalar(rad);
    const q = c.clone().add(right).project(S.camera);
    const cx = r.left + (p.x * 0.5 + 0.5) * r.width, cy = r.top + (-p.y * 0.5 + 0.5) * r.height;
    const pr = Math.abs((q.x - p.x) * 0.5 * r.width) * 1.05;
    return { left: cx - pr, top: cy - pr, width: pr * 2, height: pr * 2 };
  },
  demo(key, seq){
    const g = GW.UI.sel(); if(!g || !Guide.active) return;
    let k = 0;
    const run = () => {
      if(!Guide.active || k >= seq.length - 1) return;
      const a = seq[k], b = seq[k + 1]; k++;
      GW.Build.draft = true;
      GW.Anim.tween(750, (p, e) => { GW.UI.queue(g, key, a + (b - a) * e, true); }, { ease: 'inOut', done: () => { GW.Build.draft = false; GW.UI.flush(); G().rebuild(g); run(); } });
    };
    run();
  },

  /* ---------------------------------------------------------------- showing a step */
  go(i){
    const steps = Guide.steps(); Guide.list = steps;
    if(i < 0) i = 0;
    if(i >= steps.length){ Guide.stop(true); return; }
    const prev = steps[Guide.i]; if(prev && prev.leave && Guide.i !== i) prev.leave();
    Guide.i = i; const s = steps[i], my = ++Guide.token; s._scrolled = false;
    Guide.card.classList.add('swap');
    setTimeout(() => {
      if(my !== Guide.token) return;
      if(s.enter) s.enter();
      Guide.render(s, steps.length);
      // targets can move once drawers open / panels rebuild, so place after things settle
      setTimeout(() => { if(my === Guide.token) Guide.place(s); }, 60);
      setTimeout(() => { if(my === Guide.token) Guide.place(s); }, 650);
      setTimeout(() => { if(my === Guide.token) Guide.place(s); }, 1100);
    }, 220);
  },

  render(s, n){
    const dots = Array.from({ length: n }, (_, k) => `<i class="${k === Guide.i ? 'on' : ''}"></i>`).join('');
    const back = Guide.i > 0 ? '<button data-g="back">Back</button>' : '';
    const btns = s.last
      ? `<button data-g="exit">Go back to mine</button><span class="sp"></span><button class="next" data-g="keep">Keep this sample</button>`
      : `${back}<span class="sp"></span><button data-g="exit">Exit</button><button class="next" data-g="next">${s.next || 'Next'}</button>`;
    Guide.card.innerHTML = `<div class="gd-step">Step ${Guide.i + 1} of ${n}</div><h3>${s.title}</h3><p>${s.text}</p><div class="gd-btns">${btns}</div><div class="gd-dots">${dots}</div>`;
    Guide.card.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const a = b.dataset.g;
      if(a === 'next') Guide.go(Guide.i + 1); else if(a === 'back') Guide.go(Guide.i - 1);
      else if(a === 'exit') Guide.stop(false); else if(a === 'keep') Guide.stop(true);
    });
  },

  relayout(){ const s = Guide.list && Guide.list[Guide.i]; if(s) Guide.place(s); },

  place(s){
    if(!Guide.active) return;
    const hole = Guide.hole, card = Guide.card, vw = window.innerWidth, vh = window.innerHeight;
    let rect = null;
    if(s.target){
      const t = s.target();
      if(t && t.scrollIntoView && !s._scrolled && t.closest && t.closest('.side')){ s._scrolled = true; t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      if(t){ rect = t.getBoundingClientRect ? t.getBoundingClientRect() : t; }
    }
    const pad = 7;
    if(rect && rect.width > 0 && rect.height > 0){
      hole.classList.remove('nohole'); hole.classList.toggle('ping', !!s.ping);
      hole.style.left = rect.left - pad + 'px'; hole.style.top = rect.top - pad + 'px';
      hole.style.width = rect.width + pad * 2 + 'px'; hole.style.height = rect.height + pad * 2 + 'px';
      hole.style.borderRadius = s.target && rect.width === rect.height ? '50%' : '12px';
    } else {
      hole.classList.add('nohole'); hole.classList.remove('ping');
      hole.style.left = vw / 2 + 'px'; hole.style.top = vh / 2 + 'px'; hole.style.width = '0px'; hole.style.height = '0px';
    }
    const cw = card.offsetWidth || 330, ch = card.offsetHeight || 220, m = 14;
    let x, y;
    if(!rect || s.where === 'center'){ x = (vw - cw) / 2; y = (vh - ch) / 2; }
    else {
      const R = { l: rect.left - pad, t: rect.top - pad, r: rect.left + rect.width + pad, b: rect.top + rect.height + pad };
      const opts = {
        right: [R.r + m, R.t], left: [R.l - cw - m, R.t], top: [R.l + (R.r - R.l) / 2 - cw / 2, R.t - ch - m],
        bottom: [R.l + (R.r - R.l) / 2 - cw / 2, R.b + m], 'bottom-left': [R.r - cw, R.b + m], 'center-bottom': [(vw - cw) / 2, R.b - ch - 20]
      };
      let order = s.where === 'auto' ? ['right', 'left', 'bottom', 'top'] : [s.where, 'right', 'left', 'bottom', 'top'];
      const fits = ([px, py]) => px >= 8 && py >= 8 && px + cw <= vw - 8 && py + ch <= vh - 8;
      let pick = order.find(k => opts[k] && fits(opts[k])) || order[0];
      [x, y] = opts[pick];
    }
    card.style.left = U.clamp(x, 8, Math.max(8, vw - cw - 8)) + 'px'; card.style.top = U.clamp(y, 8, Math.max(8, vh - ch - 8)) + 'px';
    card.classList.remove('swap');
  }
};

$('guideBtn').onclick = () => Guide.active ? Guide.stop(false) : Guide.start();
})();
