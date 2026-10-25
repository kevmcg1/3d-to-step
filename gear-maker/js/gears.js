"use strict";
/* Gear Maker — the list of gears, their links, and the per-frame layout. */
(function(){
const U = GW.U, T = THREE, Types = GW.Types;
const Z = new T.Vector3(0, 0, 1);
const qz = new T.Quaternion();

/* settings that never change the gear's own shape */
const SOFT = new Set(['name', 'px', 'py', 'pz', 'rx', 'ry', 'rz', 'rpm', 'finish', 'surface', 'color', 'metal', 'rough', 'opacity', 'wire', 'visible',
                      'parentId', 'linkKind', 'meshAngle', 'shaftAngle', 'meshOffset', 'shaftOffset', 'shaftPhase']);
const STYLE = new Set(['finish', 'surface', 'color', 'metal', 'rough', 'opacity', 'wire', 'visible']);

const Gears = GW.Gears = {
  list: [], order: [], nextId: 1, dirty: true, speed: 1, spin: true,
  root: null,            // THREE.Group that holds the meshes (set by the scene)
  listeners: [],
  onChange(fn){ this.listeners.push(fn); },
  emit(what, g){ this.listeners.forEach(f => f(what, g)); },

  get: id => Gears.list.find(g => g.id === id),
  children: id => Gears.list.filter(g => g.parentId === id),
  descendants(id){
    const out = [], stack = [id];
    while(stack.length){ const i = stack.pop(); Gears.children(i).forEach(c => { out.push(c); stack.push(c.id); }); }
    return out;
  },
  rootOf(g){ let c = g, n = 0; while(c.parentId && n++ < 200) c = Gears.get(c.parentId) || c; return c; },

  /* ------------------------------------------------------------ create */
  add(type, over, opts){
    opts = opts || {};
    if(opts.delay == null && Gears._stagger) opts.delay = Gears._stagger.n++ * Gears._stagger.step;
    const g = Object.assign(Types.defaults(type), over || {});
    g.id = Gears.nextId++;
    if(!g.name) g.name = Types.TYPES[type].short + ' ' + g.id;
    g.rt = { pos: new T.Vector3(), quat: new T.Quaternion(), q: 0, link: null };
    g.mesh = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial());
    g.mesh.userData.id = g.id;
    Gears.list.push(g);
    if(Gears.root) Gears.root.add(g.mesh);
    Gears.rebuild(g);
    if(!over || over.px == null) Gears.park(g);
    Gears.restyle(g);
    Gears.dirty = true;
    // pop in: grows from nothing with a little overshoot
    if(GW.Anim && !opts.instant && !Gears._instant){
      g.scale = 0.001;
      GW.Anim.tween(420, (p, e) => { g.scale = Math.max(0.001, e); }, { ease: 'back', delay: opts.delay || 0, done: () => { g.scale = 1; } });
    } else g.scale = 1;
    Gears.emit('add', g);
    return g;
  },

  rebuild(g){
    const r = GW.Build.build(g);
    g.mesh.geometry.dispose();
    g.mesh.geometry = r.geo;
    g.info = r.info;
    if(GW.Tex && g.surface && g.surface !== 'smooth') GW.Tex.apply(g, r.geo);
    Gears.dirty = true;
  },

  restyle(g){
    const m = g.mesh.material, f = Types.FINISH[g.finish];
    m.color.set(g.color);
    m.metalness = g.metal; m.roughness = g.rough;
    m.transparent = g.opacity < 0.999; m.opacity = g.opacity;
    m.wireframe = !!g.wire; m.depthWrite = !m.transparent;
    if(GW.Tex) GW.Tex.apply(g);
    g.mesh.visible = g.visible !== false;
    m.needsUpdate = true;
  },

  /* ------------------------------------------------------------ edit */
  /* Change one setting, with every knock-on effect. Returns notes (strings) for the user. */
  set(g, key, val){
    const notes = [];
    const def = Types.PARAMS[key] || Types.LINK_PARAMS[key];
    if(def && (def[1] === 'num' || def[1] === 'int')){
      val = +val;
      if(!isFinite(val)) return notes;
      if(def[1] === 'int') val = Math.round(val);
      if(def[3] != null && key !== 'rpm' && !/^p[xyz]$/.test(key)){ const rg = Types.range(g.type, key); val = U.clamp(val, rg[0], rg[1]); }
    }
    if(key === 'type'){
      if(val === g.type) return notes;
      const next = Types.convert(g, val);
      const keep = { id: g.id, rt: g.rt, mesh: g.mesh, info: g.info };
      Object.assign(g, next, keep);
      if(g.name.endsWith(' ' + g.id) && Object.values(Types.TYPES).some(t => g.name === t.short + ' ' + g.id)) g.name = Types.TYPES[val].short + ' ' + g.id;
      Gears.validateLinks(g, notes);
      Gears.rebuild(g); Gears.restyle(g);
      Gears.emit('edit', g);
      return notes;
    }
    const before = g[key];
    g[key] = val;
    if(key === 'finish'){
      const f = Types.FINISH[val];
      if(f.color){ g.color = f.color; g.metal = f.metal; g.rough = f.rough; g.surface = f.surface || 'smooth'; }
    } else if(key === 'color') g.finish = 'custom';
    else if(key === 'chainPreset'){ const p = Types.CHAIN[val]; if(p) Object.assign(g, p); }
    else if(key === 'beltPreset'){ const p = Types.BELT[val]; if(p) Object.assign(g, p); }
    else if(key === 'chainPitch' || key === 'rollerDia') g.chainPreset = 'custom';
    else if(['beltPitch', 'pitchLineDiff', 'grooveDepth', 'grooveWidth'].includes(key)) g.beltPreset = 'custom';
    if(key === 'starts' && g.type === 'worm') g.z = 1;

    if(STYLE.has(key)) Gears.restyle(g);
    if(!SOFT.has(key)){
      try { Gears.rebuild(g); }
      catch(e){                                    // never let a value the geometry cannot take break the app
        console.warn('rebuild failed for', key, val, e);
        g[key] = before; Gears.rebuild(g);
        notes.push('That value cannot be built, so it was put back.');
      }
    }
    Gears.dirty = true;
    Gears.emit(SOFT.has(key) ? 'soft' : 'edit', g);
    return notes;
  },

  /* drop links that can no longer exist after a type change */
  validateLinks(g, notes){
    const P = g.parentId ? Gears.get(g.parentId) : null;
    if(P && g.linkKind === 'mesh' && !GW.Compat.kindOf(P.type, g.type)){
      notes.push(`${g.name} can no longer mesh with ${P.name} (${P.type} + ${g.type}), so it was un-meshed.`);
      Gears.unlink(g.id, true);
    }
    if(P && g.linkKind === 'same shaft' && (g.type === 'rack' || P.type === 'rack')){
      notes.push(`${g.name} was released from the shared shaft.`);
      Gears.unlink(g.id, true);
    }
    Gears.children(g.id).forEach(c => {
      if(c.linkKind === 'mesh' && !GW.Compat.kindOf(g.type, c.type)){
        notes.push(`${c.name} can no longer mesh with ${g.name}, so it was un-meshed.`);
        Gears.unlink(c.id, true);
      } else if(c.linkKind === 'same shaft' && (c.type === 'rack' || g.type === 'rack')){
        notes.push(`${c.name} was released from the shared shaft.`);
        Gears.unlink(c.id, true);
      }
    });
  },

  /* apply a {A:{...}, B:{...}} fix plan from the compatibility checker */
  applyPlan(A, B, plan){
    [[A, plan.A], [B, plan.B]].forEach(([g, set]) => {
      if(!set || !Object.keys(set).length) return;
      if(set.type) Gears.set(g, 'type', set.type);
      let hard = false;
      Object.keys(set).forEach(k => { if(k === 'type') return; g[k] = set[k]; if(!SOFT.has(k)) hard = true; });
      if(hard) Gears.rebuild(g);
    });
    Gears.dirty = true; Gears.emit('edit', B);
  },

  /* ------------------------------------------------------------ links */
  canLink(childId, parentId){
    if(childId === parentId) return false;
    return !Gears.descendants(childId).some(d => d.id === parentId);
  },

  link(childId, parentId, kind){
    const C = Gears.get(childId), P = Gears.get(parentId);
    if(!C || !P || !Gears.canLink(childId, parentId)) return false;
    C.parentId = parentId;
    C.linkKind = kind || 'mesh';
    if(C.linkKind === 'mesh'){
      const k = GW.Compat.kindOf(P.type, C.type);
      if(k === 'chain' || k === 'belt') C.meshOffset = Math.max(C.meshOffset, 40);
      else if(C.meshOffset > 30 && !(k === 'chain' || k === 'belt')) C.meshOffset = 0;
      if(k === 'bevel' && C.shaftAngle == null) C.shaftAngle = 90;
      C.shaftOffset = 0;
    } else {
      // stack on the shared shaft: next to the partner, not inside it
      const gap = 0.5;
      C.shaftOffset = (P.info ? P.info.z1 : P.thick / 2) - (C.info ? C.info.z0 : -C.thick / 2) + gap;
      C.shaftPhase = 0;
    }
    C.rt.q = 0;
    Gears.chooseSide(C);
    Gears.dirty = true; Gears.emit('link', C);
    return true;
  },

  /* ------------------------------------------------------------ roles
     Make a gear the driver (the first gear of its assembly, the one with its own speed). Every link between it and the old driver
     is turned round: the old parent becomes a child of the gear it used to drive, put exactly where it already stands (the angle
     around the partner, the offsets and the shaft angle are searched until the pose matches to a thousandth of a millimeter), so
     nothing in the 3D view moves and every pair keeps meshing. Returns { ok, reason }. Nothing is changed unless every link reverses. */
  LINKKEYS: ['linkKind', 'meshAngle', 'meshOffset', 'shaftOffset', 'shaftAngle', 'shaftPhase'],
  makeDriver(id){
    const s = Gears.get(id); if(!s) return { ok: false, reason: 'That gear is not on the table.' };
    if(!s.parentId) return { ok: true, unchanged: true };
    Layout.solveAll();
    const path = [s]; for(let n = 0; path[path.length - 1].parentId && n < 200; n++) path.push(Gears.get(path[path.length - 1].parentId));
    const pose = new Map(); Gears.list.forEach(g => pose.set(g.id, { pos: g.rt.pos.clone(), quat: g.rt.quat.clone() }));
    const keep = new Map(); Gears.list.forEach(g => { const o = { parentId: g.parentId, px: g.px, py: g.py, pz: g.pz, rx: g.rx, ry: g.ry, rz: g.rz, rpm: g.rpm }; Gears.LINKKEYS.forEach(k => { o[k] = g[k]; }); keep.set(g.id, o); });
    const omega = s.rt.omega || 0, q = s.rt.q;
    const restore = () => { Gears.list.forEach(g => Object.assign(g, keep.get(g.id))); Gears.dirty = true; Layout.solveAll(); };
    try {
      for(let k = path.length - 1; k >= 1; k--){
        const P = path[k], C = path[k - 1], ok = Gears.reverseLink(P, C, pose);
        if(!ok) throw new Error(`The link between ${P.name} and ${C.name} cannot be turned round (${P.type} + ${C.type}).`);
      }
    } catch(e){ restore(); return { ok: false, reason: e.message }; }
    // the new driver stands where it stood and keeps the speed it already had
    const ps = pose.get(s.id), eu = new T.Euler().setFromQuaternion(ps.quat, 'XYZ');
    s.parentId = null; s.px = +ps.pos.x.toFixed(4); s.py = +ps.pos.y.toFixed(4); s.pz = +ps.pos.z.toFixed(4);
    s.rx = +U.deg(eu.x).toFixed(4); s.ry = +U.deg(eu.y).toFixed(4); s.rz = +U.deg(eu.z).toFixed(4);
    s.rpm = +(s.type === 'rack' ? omega : omega * 30 / Math.PI).toFixed(3);
    Gears.list.forEach(g => { g.rt.osc = null; });
    Gears.dirty = true; Layout.solveAll(); s.rt.q = q;
    // every gear must have stayed where it was
    const off = Gears.list.reduce((m, g) => Math.max(m, g.rt.pos.distanceTo(pose.get(g.id).pos)), 0);
    if(off > 0.02){ restore(); return { ok: false, reason: 'The assembly would have moved (' + off.toFixed(2) + ' mm), so it was left as it was.' }; }
    Gears.emit('link', s);
    return { ok: true };
  },
  /* P (the old parent) becomes a child of C. Search the link settings until P is placed where it is now. */
  reverseLink(P, C, pose){
    const Cp = pose.get(C.id), Pp = pose.get(P.id);
    const save = { c: [C.rt.pos.clone(), C.rt.quat.clone()], p: [P.rt.pos.clone(), P.rt.quat.clone()] };
    const old = {}; Gears.LINKKEYS.forEach(k => { old[k] = C[k]; });
    const kind = GW.Compat.kindOf(C.type, P.type);
    if(!kind) return false;
    const err = () => {
      let r;
      try { C.rt.pos.copy(Cp.pos); C.rt.quat.copy(Cp.quat); r = GW.Mount.place(C, P); } catch(e){ return Infinity; }
      return P.rt.pos.distanceTo(Pp.pos) + 10 * Math.abs(2 * Math.acos(Math.min(1, Math.abs(P.rt.quat.dot(Pp.quat)))));
    };
    let best = { e: Infinity };
    const sA = old.shaftAngle;
    const offs = [-old.shaftOffset, old.shaftOffset, 0].filter((v, i, a) => a.indexOf(v) === i);
    const angs = [sA, 180 - sA].filter((v, i, a) => a.indexOf(v) === i);
    const phs = [-old.shaftPhase, old.shaftPhase].filter((v, i, a) => a.indexOf(v) === i);
    const mos = [old.meshOffset];
    P.linkKind = old.linkKind;
    offs.forEach(so => angs.forEach(sa => phs.forEach(sp => mos.forEach(mo => {
      P.shaftOffset = so; P.shaftAngle = sa; P.shaftPhase = sp; P.meshOffset = mo;
      for(let a = -180; a < 180; a += 5){ P.meshAngle = a; const e = err(); if(e < best.e) best = { e, a, so, sa, sp, mo }; }
    }))));
    if(!isFinite(best.e)){ P.rt.pos.copy(save.p[0]); P.rt.quat.copy(save.p[1]); return false; }
    P.shaftOffset = best.so; P.shaftAngle = best.sa; P.shaftPhase = best.sp; P.meshOffset = best.mo;
    for(const step of [1, 0.2, 0.04, 0.008, 0.0016]){
      const mid = best.a; for(let a = mid - step * 5; a <= mid + step * 5 + 1e-9; a += step){ P.meshAngle = a; const e = err(); if(e < best.e) best = Object.assign(best, { e, a }); }
    }
    P.meshAngle = +best.a.toFixed(4);
    const fin = err();
    C.rt.pos.copy(save.c[0]); C.rt.quat.copy(save.c[1]); P.rt.pos.copy(save.p[0]); P.rt.quat.copy(save.p[1]);
    if(!(fin < 0.01)) return false;
    // turn the link round: C becomes free (its own world pose is written at the end for the new driver), P hangs off C
    P.parentId = C.id; P.rt.q = 0;
    C.parentId = null; const eu = new T.Euler().setFromQuaternion(Cp.quat, 'XYZ');
    C.px = Cp.pos.x; C.py = Cp.pos.y; C.pz = Cp.pos.z; C.rx = U.deg(eu.x); C.ry = U.deg(eu.y); C.rz = U.deg(eu.z);
    return true;
  },

  /* turn the new child to the roomiest side of its parent */
  chooseSide(C){
    const P = Gears.get(C.parentId);
    if(!P || C.linkKind !== 'mesh') return;
    const kind = GW.Compat.kindOf(P.type, C.type);
    if(['bevel', 'crown', 'worm'].includes(kind)) { C.meshAngle = kind === 'bevel' ? 0 : 0; }
    const others = Gears.list.filter(g => g.id !== C.id && !Gears.descendants(C.id).some(d => d.id === g.id));
    let best = C.meshAngle, bestM = -Infinity;
    for(let a = 0; a < 360; a += 15){
      C.meshAngle = a;
      try { Layout.solveAll(); } catch(e){ continue; }
      let margin = Infinity;
      others.forEach(o => {
        const d = o.rt.pos.distanceTo(C.rt.pos);
        margin = Math.min(margin, d - Gears.reach(o) - Gears.reach(C));
      });
      if(margin > bestM + 1e-9){ bestM = margin; best = a; }
    }
    C.meshAngle = best;
    Layout.solveAll();
  },

  unlink(id, silent){
    const g = Gears.get(id);
    if(!g || !g.parentId) return;
    // freeze where it is: its last solved pose (re-solving here could fail for a link that has just become impossible)
    const p = g.rt.pos, e = new T.Euler().setFromQuaternion(g.rt.quat, 'XYZ');
    g.px = +p.x.toFixed(3); g.py = +p.y.toFixed(3); g.pz = +p.z.toFixed(3);
    g.rx = +U.deg(e.x).toFixed(3); g.ry = +U.deg(e.y).toFixed(3); g.rz = +U.deg(e.z).toFixed(3);
    g.rt.q = 0; g.parentId = null;
    Gears.dirty = true;
    if(!silent) Gears.emit('link', g);
  },

  remove(id, opts){
    opts = opts || {};
    const g = Gears.get(id);
    if(!g) return;
    Gears.children(id).forEach(c => Gears.unlink(c.id, true));
    Gears.list = Gears.list.filter(x => x.id !== id);
    const finish = () => { if(Gears.root) Gears.root.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); };
    if(GW.Anim && !opts.instant && g.mesh.parent){
      const s0 = g.scale == null ? 1 : g.scale;
      g.scale = null;                                                  // out of the layout now; the tween owns the mesh
      GW.Anim.tween(260, (p, e) => { g.mesh.scale.setScalar(Math.max(0.001, s0 * (1 - e))); }, { ease: 'in', delay: opts.delay || 0, done: finish });
    } else finish();
    Gears.dirty = true; Gears.emit('remove', g);
  },

  clear(opts){
    opts = opts || {};
    Gears.list.slice().forEach((g, i) => Gears.remove(g.id, { instant: opts.instant, delay: opts.stagger ? i * opts.stagger : 0 }));
    Gears.nextId = 1;
  },

  duplicate(id){
    const s = Gears.get(id); if(!s) return null;
    const over = {};
    Object.keys(Types.BASE).forEach(k => { over[k] = s[k]; });
    over.parentId = null; over.name = s.name + ' copy';
    over.px = s.rt.pos.x; over.py = s.rt.pos.y; over.pz = s.rt.pos.z;
    const e = new T.Euler().setFromQuaternion(s.rt.quat, 'XYZ');
    over.rx = U.deg(e.x); over.ry = U.deg(e.y); over.rz = U.deg(e.z);
    const g = Gears.add(s.type, over);
    Gears.park(g);
    return g;
  },

  /* ------------------------------------------------------------ spacing */
  reach(g){
    const i = g.info || {};
    let r = i.outerR || 10;
    const hub = g.hubDia > 0 ? g.hubDia / 2 : 0;
    if(g.type === 'pulley' && g.flange !== 'none') r = Math.max(r, g.flangeD > 0 ? g.flangeD / 2 : r + 2 + g.grooveDepth);
    return Math.max(r, hub);
  },
  assemblyCircle(root){
    let R = Gears.reach(root);
    Gears.descendants(root.id).forEach(d => {
      R = Math.max(R, d.rt.pos.distanceTo(root.rt.pos) + Gears.reach(d));
    });
    return { c: root.rt.pos, R };
  },
  /* put a new free gear where nothing else is */
  park(g){
    Layout.solveAll();
    const roots = Gears.list.filter(x => !x.parentId && x.id !== g.id);
    const circles = roots.map(r => Gears.assemblyCircle(r));
    const R = Gears.reach(g) + 6;
    const fits = (x, y) => circles.every(c => Math.hypot(x - c.c.x, y - c.c.y) >= c.R + R);
    let spot = { x: 0, y: 0 };
    if(!fits(0, 0)){
      outer: for(let rad = 10; rad < 1500; rad += 8){
        for(let k = 0; k < 24; k++){
          const a = (k / 24) * Math.PI * 2 + rad * 0.05;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad * 0.8;
          if(fits(x, y)){ spot = { x, y }; break outer; }
        }
      }
    }
    g.px = +spot.x.toFixed(2); g.py = +spot.y.toFixed(2); g.pz = 0;
    Gears.dirty = true;
  },

  /* ------------------------------------------------------------ save / load */
  toJSON(){
    return {
      app: 'gear-maker', version: 1,
      gears: Gears.list.map(g => {
        const o = {}; Object.keys(Types.BASE).forEach(k => { o[k] = g[k]; }); o.id = g.id;
        const e = new T.Euler().setFromQuaternion(g.rt.quat, 'XYZ');
        if(!g.parentId){ o.px = g.px; o.py = g.py; o.pz = g.pz; }
        return o;
      })
    };
  },
  fromJSON(data){
    Gears.clear({ instant: !!Gears._instant });
    const idMap = {};
    (data.gears || []).forEach(o => {
      if(!Types.TYPES[o.type]) return;
      const over = Object.assign({}, o); delete over.id; delete over.parentId;
      const g = Gears.add(o.type, Object.assign(over, { px: o.px || 0, py: o.py || 0 }));
      idMap[o.id] = g.id;
    });
    (data.gears || []).forEach(o => {
      if(o.parentId != null && idMap[o.id] && idMap[o.parentId]){
        const c = Gears.get(idMap[o.id]);
        c.parentId = idMap[o.parentId];
        ['linkKind', 'meshAngle', 'shaftAngle', 'meshOffset', 'shaftOffset', 'shaftPhase'].forEach(k => { if(o[k] != null) c[k] = o[k]; });
      }
    });
    Gears.dirty = true; Layout.solveAll();
    Gears.emit('load');
  }
};

/* ============================ layout ============================ */
const Layout = GW.Layout = {
  solveAll(){
    const order = [];
    const seen = new Set();
    const visit = g => {
      if(seen.has(g.id)) return; seen.add(g.id);
      const P = g.parentId ? Gears.get(g.parentId) : null;
      if(P) visit(P);
      order.push(g);
    };
    Gears.list.forEach(visit);
    Gears.order = order;
    order.forEach(g => {
      const P = g.parentId ? Gears.get(g.parentId) : null;
      if(!P){ if(g.parentId) g.parentId = null; GW.Mount.placeRoot(g); return; }
      try { g.rt.link = GW.Mount.place(P, g); }
      catch(e){ console.warn('link failed', e); g.parentId = null; GW.Mount.placeRoot(g); }
    });
    // angular speed (rad/s, or mm/s for a rack) of every gear
    order.forEach(g => {
      const P = g.parentId ? Gears.get(g.parentId) : null;
      if(!P) g.rt.omega = g.rpm * (g.type === 'rack' ? 1 : Math.PI / 30);
      else g.rt.omega = g.rt.link.mode === 'ratio' ? g.rt.link.kappa * P.rt.omega : P.rt.omega;
    });
    // a rack has a finite length: whatever drives it goes back and forth instead of round and round
    order.forEach(g => {
      if(g.parentId){ g.rt.osc = null; return; }
      const prev = g.rt.osc, o = Layout.rackStroke(g);
      if(!o){ g.rt.osc = null; return; }
      g.rt.osc = prev ? Object.assign(prev, o) : Object.assign(o, { ph: 0, q0: g.rt.q });
    });
    Gears.version = (Gears.version || 0) + 1;
    Gears.dirty = false;
  },

  /* amplitude (in the root gear's own units) that keeps the rack's travel inside its length, or null */
  rackStroke(root){
    const all = [root].concat(Gears.descendants(root.id));
    const R = all.find(x => x.type === 'rack' && ((x.parentId && x.rt.link && x.rt.link.kind === 'rack') || Gears.children(x.id).some(c => c.rt.link && c.rt.link.kind === 'rack')));
    if(!R) return null;
    const pin = R.parentId ? Gears.get(R.parentId) : Gears.children(R.id).find(c => c.rt.link && c.rt.link.kind === 'rack');
    const p = Math.PI * R.m, S = Math.max(2 * p, R.z * p - 2 * Gears.reach(pin) - 2);
    let ratio = 1, c = R;
    while(c.parentId){ const l = c.rt.link; ratio *= l && l.mode === 'ratio' ? l.kappa : 1; c = Gears.get(c.parentId); }
    if(!isFinite(ratio) || Math.abs(ratio) < 1e-6) return null;
    return { amp: (S / 2) / Math.abs(ratio) };
  },

  update(dt){
    if(Gears.dirty) Layout.solveAll();
    Gears.order.forEach(g => {
      const P = g.parentId ? Gears.get(g.parentId) : null;
      if(!P){
        const w = g.rpm * (g.type === 'rack' ? 1 : Math.PI / 30), o = g.rt.osc;
        if(o){
          if(Gears.spin) o.ph += Math.abs(w) * dt * Gears.speed / Math.max(o.amp, 1e-6) * Math.sign(w || 1);
          g.rt.q = o.q0 + o.amp * Math.sin(o.ph);
        } else if(Gears.spin) g.rt.q += w * dt * Gears.speed;
      } else g.rt.q = GW.Mount.follow(g.rt.link, P.rt.q);
      Layout.apply(g);
    });
  },

  apply(g){
    const m = g.mesh;
    m.position.copy(g.rt.pos);
    if(g.scale != null) m.scale.setScalar(g.scale);
    if(g.type === 'rack'){
      const p = Math.PI * g.m, s = g.parentId || g.rt.osc ? g.rt.q : U.mod(g.rt.q, p);   // finite stroke: no wrapping
      m.position.add(new T.Vector3(1, 0, 0).applyQuaternion(g.rt.quat).multiplyScalar(s));
      m.quaternion.copy(g.rt.quat);
    } else {
      qz.setFromAxisAngle(Z, g.rt.q);
      m.quaternion.copy(g.rt.quat).multiply(qz);
    }
    m.updateMatrixWorld(true);
  }
};
})();
