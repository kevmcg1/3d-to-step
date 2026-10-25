"use strict";
/* Gear Maker — the three.js world: renderer, lights, orbit camera, picking, smooth camera flights.
   The canvas fills the stage between the two sidebars and follows its size. */
(function(){
const U = GW.U, T = THREE;

GW.Scene = {
  init(container){
    const S = GW.Scene;
    S.container = container;
    S.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    S.renderer.setClearColor(0x0d0e10, 0);
    S.renderer.domElement.className = 'gl';
    container.appendChild(S.renderer.domElement);

    S.scene = new T.Scene();
    S.scene.fog = new T.Fog(0x131518, 400, 1400);
    S.camera = new T.PerspectiveCamera(42, 1, 0.5, 6000);
    S.orbit = { theta: -0.55, phi: 1.0, dist: 150, target: new T.Vector3(0, 0, 0) };

    S.scene.add(new T.HemisphereLight(0xe6ecf5, 0x2a2d35, 0.95));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(60, -80, 120);
    const rim = new T.DirectionalLight(0x8fb3ff, 0.3); rim.position.set(-80, 60, 40);
    const fill = new T.DirectionalLight(0x9fb4d0, 0.25); fill.position.set(-60, -60, 30);
    S.scene.add(key, rim, fill);
    S.scene.environment = S.makeEnvironment();

    S.grid = new T.GridHelper(1600, 160, 0x2a2e35, 0x1c1f24);
    S.grid.rotation.x = Math.PI / 2; S.grid.position.z = -0.05;
    S.grid.material.transparent = true; S.grid.material.depthWrite = false;
    S.gridOn = true;
    S.scene.add(S.grid);

    S.root = new T.Group();           // gears
    S.scene.add(S.root);
    GW.Gears.root = S.root;
    S.drives = new T.Group();         // chains and belts
    S.scene.add(S.drives);
    S.helpers = new T.Group();        // pitch circle / shaft axis of the selected gear
    S.scene.add(S.helpers);
    S.showHelpers = true;

    S.bindInput();
    S.resize();
    if(window.ResizeObserver) new ResizeObserver(() => S.resize()).observe(container);
    window.addEventListener('resize', () => S.resize());
  },

  /* a small studio-like cube map so metals have something to reflect */
  makeEnvironment(){
    const size = 128, faces = [];
    for(let i = 0; i < 6; i++){
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, size);
      if(i === 2){ g.addColorStop(0, '#9aa7b8'); g.addColorStop(1, '#6b7482'); }
      else if(i === 3){ g.addColorStop(0, '#20242b'); g.addColorStop(1, '#14161a'); }
      else { g.addColorStop(0, '#6e7a8a'); g.addColorStop(0.55, '#3a414c'); g.addColorStop(1, '#1b1e24'); }
      x.fillStyle = g; x.fillRect(0, 0, size, size);
      if(i !== 3){
        x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(size * .25, size * .15, size * .5, size * .18);
        x.fillStyle = 'rgba(190,215,255,.5)'; x.fillRect(size * .1, size * .55, size * .18, size * .25);
      }
      faces.push(c);
    }
    const tex = new T.CubeTexture(faces);
    tex.needsUpdate = true;
    return tex;
  },

  /* the floor grid fades in and out instead of snapping */
  setGrid(on){
    const S = GW.Scene, m = S.grid.material, from = m.opacity;
    S.gridOn = on; if(on) S.grid.visible = true;
    GW.Anim.tween(380, (p, e) => { m.opacity = from + ((on ? 1 : 0) - from) * e; }, { ease: 'out', key: 'grid', done: () => { if(!S.gridOn) S.grid.visible = false; } });
    const b1 = document.getElementById('gridBtn'), b2 = document.getElementById('gridQuick');
    [b1, b2].forEach(b => { if(b){ b.setAttribute('aria-pressed', on); const em = b.querySelector('em'); if(em) em.textContent = on ? 'on' : 'off'; } });
  },

  size(){ const c = GW.Scene.container; return { w: Math.max(c.clientWidth, 1), h: Math.max(c.clientHeight, 1) }; },
  resize(){
    const S = GW.Scene, { w, h } = S.size();
    S.renderer.setSize(w, h);
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
  },

  /* how much of the stage's bottom the feedback strip covers (eased, so opening / closing it slides the view) */
  insetBottom(){
    const fb = document.getElementById('feedback'), want = fb ? fb.offsetHeight + 22 : 0;
    const S = GW.Scene;
    S._inset = GW.Anim.chase(S._inset == null ? want : S._inset, want, 0.14);
    return S._inset;
  },
  updateCam(){
    const S = GW.Scene, o = S.orbit, c = S.camera;
    const inset = S.insetBottom(), { w, h } = S.size();
    if(inset > 2 && inset < h * 0.8) c.setViewOffset(w, h, 0, inset / 2, w, h); else c.clearViewOffset();
    c.updateProjectionMatrix();
    o.phi = U.clamp(o.phi, 0.04, Math.PI - 0.04);
    o.dist = U.clamp(o.dist, 8, 3000);
    c.position.set(
      o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y - o.dist * Math.sin(o.phi) * Math.cos(o.theta),
      o.target.z + o.dist * Math.cos(o.phi));
    c.up.set(0, 0, 1);
    c.lookAt(o.target);
    S.scene.fog.near = o.dist * 2; S.scene.fog.far = o.dist * 7;
  },

  /* ---------- camera moves ---------- */
  flyTo(to, ms){
    const o = GW.Scene.orbit, from = { theta: o.theta, phi: o.phi, dist: o.dist, tx: o.target.x, ty: o.target.y, tz: o.target.z };
    const dt = to.theta != null ? U.wrapPi(to.theta - o.theta) : 0;      // turn the short way round
    GW.Anim.tween(ms || 700, (p, e) => {
      if(to.theta != null) o.theta = from.theta + dt * e;
      if(to.phi != null) o.phi = from.phi + (to.phi - from.phi) * e;
      if(to.dist != null) o.dist = from.dist + (to.dist - from.dist) * e;
      if(to.target) o.target.set(from.tx + (to.target.x - from.tx) * e, from.ty + (to.target.y - from.ty) * e, from.tz + (to.target.z - from.tz) * e);
    }, { ease: 'inOut', key: 'cam' });
  },
  view(name){
    const S = GW.Scene, f = S.fitPlan();
    const a = { iso: { theta: -0.55, phi: 1.0 }, top: { theta: 0, phi: 0.06 }, front: { theta: 0, phi: Math.PI / 2 - 0.02 }, side: { theta: Math.PI / 2, phi: Math.PI / 2 - 0.02 } }[name];
    S.flyTo(Object.assign({ dist: f.dist, target: f.target }, a), 800);
  },
  /* where the camera has to sit to see every visible gear (and chain / belt) */
  fitPlan(list){
    const S = GW.Scene;
    list = list || GW.Gears.list.filter(g => g.mesh.visible);
    if(!list.length) return { target: new T.Vector3(0, 0, 0), dist: 150 };
    GW.Layout.update(0);
    const box = new T.Box3();
    list.forEach(g => {
      g.mesh.updateMatrixWorld(true); g.mesh.geometry.computeBoundingBox();
      const sc = g.scale == null || g.scale < 0.05 ? 1 : g.scale;
      const b = g.mesh.geometry.boundingBox.clone();
      box.union(b.applyMatrix4(new T.Matrix4().compose(g.mesh.position, g.mesh.quaternion, new T.Vector3(sc, sc, sc))));
    });
    GW.Drives.items.forEach(d => { d.group.updateMatrixWorld(true); box.expandByObject(d.group); });
    const c = box.getCenter(new T.Vector3()), r = Math.max(box.getSize(new T.Vector3()).length() / 2, 12);
    const { w, h } = S.size(), hh = Math.max(h - S.insetBottom(), h * 0.3);
    const half = Math.atan(Math.min(1, w / hh) * Math.tan(U.rad(S.camera.fov * hh / h / 2)));
    return { target: c, dist: Math.max(40, r / Math.sin(half) * 1.15) };
  },
  fit(instant, list){
    const S = GW.Scene, f = S.fitPlan(list);
    if(instant){ S.orbit.target.copy(f.target); S.orbit.dist = f.dist; return; }
    S.flyTo({ target: f.target, dist: f.dist }, 750);
  },

  /* ---------- mouse / touch ---------- */
  bindInput(){
    const S = GW.Scene, el = S.renderer.domElement, o = S.orbit;
    const ptrs = new Map();
    let lastPinch = 0, lastMid = null, moved = 0, downAt = null, panning = false;
    const stopFly = () => GW.Anim.list.forEach(t => { if(t.key === 'cam') t.stopped = true; });
    const pan = (dx, dy) => {
      const { h } = S.size();
      const f = o.dist * Math.tan(U.rad(S.camera.fov / 2)) * 2 / h;
      const dir = S.camera.getWorldDirection(new T.Vector3());
      const right = new T.Vector3().crossVectors(dir, S.camera.up).normalize();
      const up = new T.Vector3().crossVectors(right, dir).normalize();
      o.target.addScaledVector(right, -dx * f).addScaledVector(up, dy * f);
    };
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      stopFly();
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if(ptrs.size === 1){ moved = 0; downAt = { x: e.clientX, y: e.clientY }; panning = e.button === 2 || e.button === 1 || e.shiftKey; el.classList.add('grab'); }
      if(ptrs.size === 2){
        const [a, b] = [...ptrs.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
        lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    el.addEventListener('pointermove', e => {
      if(!ptrs.has(e.pointerId)){ S.hover(e.clientX, e.clientY); return; }
      const prev = ptrs.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if(ptrs.size === 1){
        if(panning) pan(dx, dy); else { o.theta -= dx * 0.006; o.phi -= dy * 0.006; }
      } else if(ptrs.size === 2){
        const [a, b] = [...ptrs.values()];
        const pinch = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if(lastPinch > 0) o.dist *= lastPinch / Math.max(pinch, 1);
        if(lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
        lastPinch = pinch; lastMid = mid; moved += 20;
      }
    });
    const up = e => {
      if(ptrs.size === 1 && moved < 6 && downAt && e.type === 'pointerup') S.pick(e.clientX, e.clientY);
      ptrs.delete(e.pointerId);
      if(ptrs.size < 2){ lastPinch = 0; lastMid = null; }
      if(!ptrs.size) el.classList.remove('grab');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => S.setHover(null));
    el.addEventListener('wheel', e => {
      e.preventDefault(); stopFly();
      o.dist *= Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0011);
    }, { passive: false });
  },

  hit(x, y){
    const S = GW.Scene, r = S.renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), S.camera);
    const hits = ray.intersectObjects(S.root.children.filter(m => m.visible), false);
    return hits.length ? hits[0].object.userData.id : null;
  },
  pick(x, y){ const id = GW.Scene.hit(x, y); if(GW.UI) GW.UI.select(id); },
  _hoverT: 0,
  hover(x, y){
    const S = GW.Scene, now = performance.now();
    if(now - S._hoverT < 60) return; S._hoverT = now;       // keep the ray test cheap
    S.setHover(S.hit(x, y));
  },
  setHover(id){
    const S = GW.Scene;
    if(S.hoverId === id) return;
    S.hoverId = id;
    S.renderer.domElement.style.cursor = id != null ? 'pointer' : '';
  },

  /* pitch circle + shaft axis of the selected gear */
  updateHelpers(sel){
    const S = GW.Scene, h = S.helpers;
    while(h.children.length){ const c = h.children.pop(); c.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); }
    S._helperGroup = null;
    if(!sel || !S.showHelpers || !sel.mesh.visible) return;
    const r = GW.Calc.pitchR(sel), info = sel.info || {};
    const mat = new T.LineBasicMaterial({ color: 0x5b93ea, transparent: true, opacity: 0.85, depthTest: false });
    const grp = new T.Group();
    if(isFinite(r) && sel.type !== 'worm' && sel.type !== 'elliptical'){
      const pts = [];
      for(let i = 0; i <= 120; i++) pts.push(new T.Vector3(r * Math.cos(i / 120 * Math.PI * 2), r * Math.sin(i / 120 * Math.PI * 2), 0));
      grp.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), mat));
    }
    const z0 = (info.z0 != null ? info.z0 : -sel.thick / 2) - 8;
    const z1 = (info.z1 != null ? info.z1 : sel.thick / 2) + 8 + (info.apexH && sel.type.indexOf('bevel') >= 0 ? Math.max(0, info.apexH - sel.thick) : 0);
    const axis = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, z0), new T.Vector3(0, 0, z1)]),
      new T.LineDashedMaterial({ color: 0x5b93ea, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.85, depthTest: false }));
    axis.computeLineDistances();
    grp.add(axis);
    grp.renderOrder = 10;
    grp.position.copy(sel.mesh.position);
    grp.quaternion.copy(sel.rt.quat);
    h.add(grp);
    S._helperGroup = grp;
  },

  render(){
    const S = GW.Scene;
    S.updateCam();
    S.renderer.render(S.scene, S.camera);
  }
};
})();
