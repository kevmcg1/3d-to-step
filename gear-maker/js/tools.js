"use strict";
/* Gear Maker — two tools for the 3D view, and the axes they speak in.
     Measure     click two points (on a gear, or on its center / a face center, which they snap to): the distance and the
                 X / Y / Z gap between them, measured from the origin's axes, are drawn on the view and listed. Points stick to their gear,
                 so the numbers follow when a gear is moved or resized.
     Set origin  click a point: it becomes the origin the Blueprint measures everything from (a gear's center or face when you click one,
                 otherwise the exact point).
   Axes, from the front: X runs left to right, Y runs forward to back (away from you), Z runs up and down. A small triad in the corner shows
   them for the current view. Everything is drawn on one SVG laid over the canvas. */
(function(){
const U = GW.U, T = THREE, $ = U.el, make = U.make, esc = U.esc;
const NS = 'http://www.w3.org/2000/svg';
const COL = { X: '#ff7a6e', Y: '#5fcf8a', Z: '#5b93ea', measure: '#e8c547', origin: '#ff7a6e', snap: '#ffffff' };
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); if(parent) parent.appendChild(e); return e; };

const Tools = GW.Tools = {
  mode: null, ms: [], pending: null, hoverPt: null, ver: 0, svg: null, _nid: 1,

  init(){
    if(Tools.svg) return;
    const stage = $('stage');
    const svg = Tools.svg = el('svg', { class: 'tools-svg', 'aria-hidden': 'true' });
    stage.appendChild(svg);
    Tools.gMeas = el('g', {}, svg); Tools.gOrigin = el('g', {}, svg); Tools.gSnap = el('g', {}, svg); Tools.gTriad = el('g', { class: 'triad' }, svg);
    // the hint under the toolbar and the list of measurements
    const hint = Tools.hint = make('div', 'tool-hint'); hint.setAttribute('role', 'status'); stage.appendChild(hint);
    const list = Tools.list = make('div', 'meas-list'); stage.appendChild(list);
    $('measureBtn').onclick = () => Tools.set(Tools.mode === 'measure' ? null : 'measure');
    $('originBtn').onclick = () => Tools.set(Tools.mode === 'origin' ? null : 'origin');
    document.addEventListener('keydown', e => {
      if(e.ctrlKey || e.metaKey || e.altKey || (e.target.matches && e.target.matches('input,select,textarea')) || document.querySelector('.modal-bg.show')) return;
      if(e.key === 'm' || e.key === 'M') Tools.set(Tools.mode === 'measure' ? null : 'measure');
      else if(e.key === 'o' || e.key === 'O') Tools.set(Tools.mode === 'origin' ? null : 'origin');
      else if(e.key === 'Escape' && Tools.mode){ if(Tools.pending){ Tools.pending = null; Tools.paint(); } else Tools.set(null); }
    });
  },

  set(mode){
    Tools.init();
    Tools.mode = mode; Tools.pending = null; Tools.hoverPt = null;
    $('measureBtn').setAttribute('aria-pressed', String(mode === 'measure')); $('originBtn').setAttribute('aria-pressed', String(mode === 'origin'));
    GW.Scene.renderer.domElement.classList.toggle('tool', !!mode);
    if(GW.Xform && mode && GW.Xform.mode) GW.Xform.setMode(null);
    Tools.paint(); Tools.ver++; GW.Scene.wake(10);
  },

  /* ------------------------------------------------------------ points */
  /* base-frame point of a gear (stays put while the gear spins) -> world */
  world(p){
    const g = GW.Gears.get(p.gid); if(!g) return null;
    return p.local.clone().applyQuaternion(g.rt.quat).add(g.rt.pos);
  },
  free: p => new T.Vector3(p.x, p.y, p.z),
  worldOf(p){ return p.gid != null ? Tools.world(p) : Tools.free(p); },
  /* what is under a screen position: a gear's center or face center it is close to, else the surface, else the floor */
  pick(cx, cy){
    const S = GW.Scene, r = S.renderer.domElement.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    const proj = v => { const p = v.clone().project(S.camera); return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height }; };
    let best = null;
    GW.Gears.list.forEach(g => {
      if(!g.mesh.visible) return;
      const e = GW.Blueprint ? GW.Blueprint.extent(g) : { z0: -g.thick / 2, z1: g.thick / 2 };
      [['center', 0], ['back face', e.z0], ['front face', e.z1]].forEach(([name, z]) => {
        const local = new T.Vector3(0, 0, z), w = local.clone().applyQuaternion(g.rt.quat).add(g.rt.pos), sp = proj(w), d = Math.hypot(sp.x - x, sp.y - y);
        if(d < 14 && (!best || d < best.d)) best = { d, gid: g.id, local, name: name === 'center' ? g.name + ' center' : g.name + ' ' + name, ref: name === 'center' ? 'center' : name === 'back face' ? 'back' : 'front', world: w, snapped: true };
      });
    });
    if(best) return best;
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), S.camera);
    const hits = ray.intersectObjects(S.root.children.filter(m => m.visible), false);
    if(hits.length){
      const g = GW.Gears.get(hits[0].object.userData.id), w = hits[0].point.clone();
      const local = w.clone().sub(g.rt.pos).applyQuaternion(g.rt.quat.clone().invert());
      return { gid: g.id, local, name: g.name + ' surface', world: w, ref: null };
    }
    const pl = new T.Plane(new T.Vector3(0, 0, 1), 0), pt = new T.Vector3();
    if(ray.ray.intersectPlane(pl, pt)) return { gid: null, x: pt.x, y: pt.y, z: 0, name: 'floor', world: pt, ref: null };
    return null;
  },

  hover(cx, cy){
    if(!Tools.mode) return;
    const t = performance.now(); if(t - (Tools._ht || 0) < 24) return; Tools._ht = t;
    Tools.hoverPt = Tools.pick(cx, cy); Tools.ver++; GW.Scene.wake(3);
  },

  click(cx, cy){
    const pt = Tools.pick(cx, cy); if(!pt) return;
    if(Tools.mode === 'origin'){ Tools.setOrigin(pt); return; }
    if(!Tools.pending){ Tools.pending = pt; Tools.paint(); }
    else {
      const a = Tools.pending, m = { id: Tools._nid++, a: Tools.keep(a), b: Tools.keep(pt) };
      Tools.ms.push(m); Tools.pending = null; Tools.paint();
      if(GW.UI) GW.UI.toast('Measured ' + U.fmt(Tools.dist(m), 2) + ' mm. Click two more points, or press Esc to finish.', 3200);
    }
    Tools.ver++; GW.Scene.wake(6);
  },
  keep: p => p.gid != null ? { gid: p.gid, local: p.local.clone(), name: p.name } : { gid: null, x: p.x, y: p.y, z: p.z, name: p.name },

  dist(m){ const a = Tools.worldOf(m.a), b = Tools.worldOf(m.b); return a && b ? a.distanceTo(b) : 0; },
  fmt(mm){ return GW.Units.pair(mm); },

  /* ------------------------------------------------------------ the origin */
  setOrigin(pt){
    const B = GW.Blueprint, o = B.origin;
    if(pt.snapped && pt.gid != null){ o.mode = 'gear'; o.gearId = pt.gid; o.ref = pt.ref; o.axes = false; }
    else { const w = pt.world; o.mode = 'custom'; o.x = +w.x.toFixed(4); o.y = +w.y.toFixed(4); o.z = +w.z.toFixed(4); }
    B.init(); B.buildOrigin(); if(B.open) B.render(true);
    Tools.set(null);
    GW.UI.toast('Origin set to ' + (o.mode === 'gear' ? pt.name : 'the point you clicked') + '. X runs left to right, Y forward to back, Z up and down.', 4200);
    Tools.ver++;
  },
  resetOrigin(){
    const o = GW.Blueprint.origin; o.mode = 'world'; o.x = o.y = o.z = 0; GW.Blueprint.init(); GW.Blueprint.buildOrigin(); if(GW.Blueprint.open) GW.Blueprint.render(true);
    GW.UI.toast('Origin is back at world zero.', 2400); Tools.ver++; Tools.paint();
  },

  /* ------------------------------------------------------------ text */
  paint(){
    const h = Tools.hint, m = Tools.mode;
    h.classList.toggle('on', !!m);
    if(m === 'measure') h.innerHTML = '<b>Measure</b> ' + (Tools.pending ? 'Click the second point.' : 'Click a point, then a second point.') + ' <small>Gear centers and faces snap. Esc to finish.</small>';
    else if(m === 'origin') h.innerHTML = '<b>Set origin</b> Click the point everything is measured from. <small>Click a gear center or face to use it. Esc to cancel.</small><button type="button" id="orgReset">World zero</button>';
    const rb = $('orgReset'); if(rb) rb.onclick = () => { Tools.resetOrigin(); Tools.set(null); };
    Tools.renderList();
  },
  renderList(){
    const L = Tools.list; L.classList.toggle('on', Tools.ms.length > 0);
    if(!Tools.ms.length){ L.innerHTML = ''; return; }
    const F = GW.Blueprint.frame();
    L.innerHTML = '<div class="ml-head"><b>Measurements</b><button type="button" class="ml-clear">Clear all</button></div>' + Tools.ms.map((m, i) => {
      const a = Tools.worldOf(m.a), b = Tools.worldOf(m.b); if(!a || !b) return '';
      const d = GW.Blueprint.dir(b.clone().sub(a), F);
      return `<div class="ml-row" data-i="${m.id}"><span class="ml-n">${i + 1}</span><span class="ml-v"><b>${esc(Tools.fmt(a.distanceTo(b)))}</b><small>ΔX ${esc(GW.Blueprint.Ls(d.x))} · ΔY ${esc(GW.Blueprint.Ls(d.y))} · ΔZ ${esc(GW.Blueprint.Ls(d.z))}</small></span><button type="button" class="ml-x" aria-label="Remove this measurement">×</button></div>`;
    }).join('');
    L.querySelector('.ml-clear').onclick = () => { Tools.ms = []; Tools.ver++; Tools.renderList(); };
    L.querySelectorAll('.ml-x').forEach(b => b.onclick = () => { const id = +b.parentNode.dataset.i; Tools.ms = Tools.ms.filter(m => m.id !== id); Tools.ver++; Tools.renderList(); });
    Tools._lsig = Tools.listSig();
  },
  listSig(){ return Tools.ms.map(m => { const a = Tools.worldOf(m.a), b = Tools.worldOf(m.b); return a && b ? [a.x, a.y, a.z, b.x, b.y, b.z].map(v => v.toFixed(2)).join(',') : 'x'; }).join('|') + GW.Units.mode + JSON.stringify(GW.Blueprint.origin); },

  /* ------------------------------------------------------------ drawing, every frame */
  sync(){
    if(!Tools.svg) return;
    const S = GW.Scene, r = S.size(), svg = Tools.svg;
    const showOrigin = Tools.mode === 'origin' || (GW.Blueprint && (GW.Blueprint.open || GW.Blueprint.origin.mode !== 'world'));
    if(!Tools.ms.length && !Tools.pending && !Tools.mode && !showOrigin && !Tools._clean){ Tools._clean = true; Tools.gMeas.textContent = ''; Tools.gOrigin.textContent = ''; Tools.gSnap.textContent = ''; }
    if(Tools.ms.length || Tools.pending || Tools.mode || showOrigin) Tools._clean = false;
    svg.setAttribute('viewBox', `0 0 ${r.w} ${r.h}`);
    Tools.drawTriad(r);
    const bt = Math.round(S.insetBottom()) + 12; if(Tools._bt !== bt){ Tools._bt = bt; Tools.list.style.bottom = bt + 'px'; }
    if(Tools._clean && !Tools.ms.length) return;
    const proj = v => { const p = v.clone().project(S.camera); return [(p.x * 0.5 + 0.5) * r.w, (-p.y * 0.5 + 0.5) * r.h]; };
    // measurements
    const g = Tools.gMeas; g.textContent = '';
    const dot = (parent, x, y, c, rr) => el('circle', { cx: x, cy: y, r: rr || 4.5, fill: c, stroke: '#0d0e10', 'stroke-width': 1.5 }, parent);
    const tag = (parent, x, y, l1, l2, c) => {
      const w = Math.max(l1.length * 6.6, (l2 || '').length * 5.6) + 18, h = l2 ? 36 : 22;
      el('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 7, fill: 'rgba(19,20,22,.92)', stroke: c, 'stroke-width': 1 }, parent);
      el('text', { x, y: y + (l2 ? -3 : 4), 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, 'font-weight': 600 }, parent).textContent = l1;
      if(l2) el('text', { x, y: y + 12, 'text-anchor': 'middle', fill: '#aab0b8', 'font-size': 10 }, parent).textContent = l2;
    };
    if(Tools.ms.length){
      const F = GW.Blueprint.frame();
      Tools.ms.forEach((m, i) => {
        const a = Tools.worldOf(m.a), b = Tools.worldOf(m.b); if(!a || !b) return;
        const [ax, ay] = proj(a), [bx, by] = proj(b);
        el('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: COL.measure, 'stroke-width': 2, 'stroke-dasharray': '6 4' }, g);
        dot(g, ax, ay, COL.measure); dot(g, bx, by, COL.measure);
        const d = GW.Blueprint.dir(b.clone().sub(a), F);
        tag(g, (ax + bx) / 2, (ay + by) / 2 - 4, GW.Units.pair(a.distanceTo(b)), `ΔX ${GW.Blueprint.Ls(d.x)}  ΔY ${GW.Blueprint.Ls(d.y)}  ΔZ ${GW.Blueprint.Ls(d.z)}`, COL.measure);
      });
      if(Tools.listSig() !== Tools._lsig) Tools.renderList();
    }
    if(Tools.pending){ const w = Tools.worldOf(Tools.pending); if(w){ const [px, py] = proj(w); dot(g, px, py, COL.measure, 6); if(Tools.hoverPt){ const [hx, hy] = proj(Tools.hoverPt.world); el('line', { x1: px, y1: py, x2: hx, y2: hy, stroke: COL.measure, 'stroke-width': 1.5, 'stroke-dasharray': '3 4', opacity: .7 }, g); } } }
    // the origin and its three axes
    const go = Tools.gOrigin; go.textContent = '';
    if(showOrigin){
      const F = GW.Blueprint.frame(), o = proj(F.O), len = 46;
      const dirs = [['X', new T.Vector3(1, 0, 0)], ['Y', new T.Vector3(0, 1, 0)], ['Z', new T.Vector3(0, 0, 1)]];
      dirs.forEach(([n, v]) => {
        const w = v.clone().applyQuaternion(F.Q), tip = proj(F.O.clone().add(w)), ref = proj(F.O);
        let dx = tip[0] - ref[0], dy = tip[1] - ref[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const ex = o[0] + dx * len, ey = o[1] + dy * len;
        el('line', { x1: o[0], y1: o[1], x2: ex, y2: ey, stroke: COL[n], 'stroke-width': 2.2 }, go);
        el('path', { d: `M${ex} ${ey}L${ex - dx * 8 - dy * 4} ${ey - dy * 8 + dx * 4}L${ex - dx * 8 + dy * 4} ${ey - dy * 8 - dx * 4}Z`, fill: COL[n] }, go);
        el('text', { x: ex + dx * 10, y: ey + dy * 10 + 4, fill: COL[n], 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle' }, go).textContent = n;
      });
      el('circle', { cx: o[0], cy: o[1], r: 6, fill: 'none', stroke: COL.origin, 'stroke-width': 2 }, go);
      el('text', { x: o[0] + 10, y: o[1] - 10, fill: COL.origin, 'font-size': 10, 'font-weight': 700 }, go).textContent = 'ORIGIN';
    }
    // what the pointer would pick
    const gs = Tools.gSnap; gs.textContent = '';
    if(Tools.mode && Tools.hoverPt){
      const [sx, sy] = proj(Tools.hoverPt.world), c = Tools.hoverPt.snapped ? '#fff' : Tools.mode === 'origin' ? COL.origin : COL.measure;
      el('circle', { cx: sx, cy: sy, r: Tools.hoverPt.snapped ? 9 : 5, fill: 'none', stroke: c, 'stroke-width': 2 }, gs);
      tag(gs, sx, sy - 22, Tools.hoverPt.name, null, c);
    }
  },

  /* a small triad in the corner: which way X, Y and Z point in the current view */
  drawTriad(r){
    const S = GW.Scene, g = Tools.gTriad, c = S.camera;
    const sig = [S.orbit.theta.toFixed(3), S.orbit.phi.toFixed(3), r.w, r.h, Math.round(S.insetBottom())].join('|');
    if(Tools._tsig === sig) return; Tools._tsig = sig; g.textContent = '';
    const right = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
    const cx = 54, cy = r.h - Math.round(S.insetBottom()) - 52, len = 30;
    el('circle', { cx, cy, r: 40, fill: 'rgba(19,20,22,.55)', stroke: 'rgba(255,255,255,.12)' }, g);
    [['X', new T.Vector3(1, 0, 0)], ['Y', new T.Vector3(0, 1, 0)], ['Z', new T.Vector3(0, 0, 1)]].forEach(([n, v]) => {
      const dx = v.dot(right), dy = -v.dot(up), ex = cx + dx * len, ey = cy + dy * len;
      el('line', { x1: cx, y1: cy, x2: ex, y2: ey, stroke: COL[n], 'stroke-width': 2.4 }, g);
      el('text', { x: cx + dx * (len + 9), y: cy + dy * (len + 9) + 4, fill: COL[n], 'font-size': 11, 'font-weight': 700, 'text-anchor': 'middle' }, g).textContent = n;
    });
  }
};
})();
