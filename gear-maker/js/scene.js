"use strict";
/* Gear Maker — the three.js world: renderer, lights, orbit camera, picking, smooth camera flights.
   The canvas fills the stage between the two sidebars and follows its size. */
(function(){
const U = GW.U, T = THREE;

GW.Scene = {
  init(container){
    const S = GW.Scene;
    S.container = container;
    /* light mode for slow machines: no antialiasing and one pixel per pixel (it never lowers the frame rate), and it only draws when
       something changed. It is chosen from the hardware, and also switched on by itself if frames turn out slow. */
    const lite = S.lite = GW.Perf.lite;
    S.renderer = new T.WebGLRenderer({ antialias: !lite, alpha: true, preserveDrawingBuffer: false, powerPreference: lite ? 'low-power' : 'high-performance' });
    S.renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    S.renderer.setClearColor(0x0d0e10, 0);
    S.renderer.domElement.className = 'gl';
    container.appendChild(S.renderer.domElement);

    S.scene = new T.Scene();
    /* everything is orthographic: parallel lines stay parallel, so sizes read true from any angle.
       orbit.dist is the zoom: the visible height is 2 * dist * HALF (the same framing the old perspective view had). */
    S.HALF = Math.tan(U.rad(21)); S.CAMD = 5000;
    S.camera = new T.OrthographicCamera(-1, 1, 1, -1, 100, 10000);
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

    if(GW.Xform) GW.Xform.init();       // before the camera controls, so a grab on the handle is seen first
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
    S.updateCam();
  },

  /* how much of the stage's bottom the feedback strip covers (eased, so opening / closing it slides the view) */
  /* what sits over the stage is measured a few times a second, not every frame (measuring forces the browser to lay the page out) */
  measure(){
    const S = GW.Scene, t = performance.now();
    if(S._m && t - S._mt < 120) return S._m;
    const fb = document.getElementById('feedback'), vp = document.getElementById('vp'), vw = document.getElementById('views');
    S._mt = t;
    return (S._m = {
      bottom: fb ? fb.offsetHeight + 22 : 0,
      top: vp && vp.offsetParent ? vp.offsetTop + vp.offsetHeight + 8 : 0,
      right: vw && vw.offsetParent && window.innerWidth > 640 ? vw.offsetWidth + 20 : 0
    });
  },
  insetBottom(){
    const S = GW.Scene, want = S.measure().bottom;
    S._inset = GW.Anim.chase(S._inset == null ? want : S._inset, want, 0.14);
    return S._inset;
  },
  /* the parts of the stage that always have something over them: the toolbar along the top, the view buttons down the right */
  insetTop(){ return GW.Scene.measure().top; },
  insetRight(){ return GW.Scene.measure().right; },
  /* Mouse and wheel input is not applied in one jump: it is collected in S.inp and eased into the camera a little every frame
     (about 90 % of it within a sixth of a second, whatever the frame rate), so orbiting, panning and zooming glide and stop softly. */
  inp: { th: 0, ph: 0, px: 0, py: 0, zm: 0 }, _st: 0,
  smooth(){
    const S = GW.Scene, i = S.inp, o = S.orbit, now = performance.now(), dt = Math.min((now - (S._st || now)) / 1000, 0.1); S._st = now;
    if(!(Math.abs(i.th) + Math.abs(i.ph) + Math.abs(i.px) + Math.abs(i.py) + Math.abs(i.zm) > 1e-5)){ i.th = i.ph = i.px = i.py = i.zm = 0; return; }
    const f = 1 - Math.exp(-dt * 14);
    const take = k => { const v = i[k] * f; i[k] -= v; return v; };
    o.theta += take('th'); o.phi += take('ph');
    const px = take('px'), py = take('py'); if(px || py) S.panBy(px, py);
    o.dist *= Math.exp(take('zm'));
    if(Math.abs(i.th) + Math.abs(i.ph) + Math.abs(i.px) + Math.abs(i.py) + Math.abs(i.zm) < 1e-5){ i.th = i.ph = i.px = i.py = i.zm = 0; }
    S.wake(4);
  },
  updateCam(){
    const S = GW.Scene, o = S.orbit, c = S.camera;
    S.smooth();
    const inset = S.insetBottom(), { w, h } = S.size();
    o.dist = U.clamp(o.dist, 8, 3000);
    const hh = o.dist * S.HALF, ww = hh * w / h;
    c.left = -ww; c.right = ww; c.top = hh; c.bottom = -hh;
    const top = S.insetTop(), right = S.insetRight(), dy = (inset - top) / 2, dx = right / 2;
    if((Math.abs(dy) > 1 || dx > 1) && inset < h * 0.8) c.setViewOffset(w, h, dx, dy, w, h); else c.clearViewOffset();
    c.updateProjectionMatrix();
    o.phi = U.clamp(o.phi, 0.04, Math.PI - 0.04);
    o.dist = U.clamp(o.dist, 8, 3000);
    c.position.set(
      o.target.x + S.CAMD * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y - S.CAMD * Math.sin(o.phi) * Math.cos(o.theta),
      o.target.z + S.CAMD * Math.cos(o.phi));
    c.up.set(0, 0, 1);
    c.lookAt(o.target);
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
    const S = GW.Scene;
    const a = { iso: { theta: -0.55, phi: 1.0 }, top: { theta: 0, phi: 0.06 }, front: { theta: 0, phi: Math.PI / 2 - 0.02 }, side: { theta: Math.PI / 2, phi: Math.PI / 2 - 0.02 } }[name];
    S.fit(false, null, a);
  },
  /* where the camera has to sit to see every visible gear (and chain / belt): as close as it can get without
     cutting anything off. Every vertex is projected onto the screen plane of the view that will be shown, so the
     frame hugs the real outline of the build, not a loose box around it. */
  fitPlan(list, ang){
    const S = GW.Scene, o = S.orbit;
    list = list || GW.Gears.list.filter(g => g.mesh.visible);
    if(!list.length) return { target: new T.Vector3(0, 0, 0), dist: 150 };
    GW.Layout.update(0);
    const th = ang && ang.theta != null ? ang.theta : o.theta, ph = ang && ang.phi != null ? ang.phi : o.phi;
    const dir = new T.Vector3(Math.sin(ph) * Math.sin(th), -Math.sin(ph) * Math.cos(th), Math.cos(ph));          // toward the camera
    const right = new T.Vector3().crossVectors(new T.Vector3(0, 0, 1), dir).normalize();
    const up = new T.Vector3().crossVectors(dir, right).normalize();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, d0 = 1e9, d1 = -1e9;
    const take = v => { const x = v.dot(right), y = v.dot(up), d = v.dot(dir); if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; if(d < d0) d0 = d; if(d > d1) d1 = d; };
    const v = new T.Vector3(), m = new T.Matrix4();
    list.forEach(g => {
      const pos = g.mesh.geometry.attributes.position; if(!pos) return;
      const sc = g.scale == null || g.scale < 0.05 ? 1 : g.scale;
      m.compose(g.mesh.position, g.mesh.quaternion, new T.Vector3(sc, sc, sc));
      const step = Math.max(1, Math.floor(pos.count / 2500));
      for(let i = 0; i < pos.count; i += step){ v.fromBufferAttribute(pos, i).applyMatrix4(m); take(v); }
    });
    const box = new T.Box3();
    GW.Drives.items.forEach(d => { d.group.updateMatrixWorld(true); box.makeEmpty(); box.expandByObject(d.group); if(!box.isEmpty()) for(let i = 0; i < 8; i++) take(new T.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)); });
    if(x0 > x1) return { target: new T.Vector3(0, 0, 0), dist: 150 };
    const { w, h } = S.size(), vis = Math.max(h - S.insetBottom() - S.insetTop(), h * 0.3), visW = Math.max(w - S.insetRight(), w * 0.4), pad = 1.04;
    const perPx = Math.max((x1 - x0) * pad / visW, (y1 - y0) * pad / vis, 12 / Math.min(visW, vis));      // world units per pixel
    const target = right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2).addScaledVector(dir, (d0 + d1) / 2);
    return { target, dist: Math.max(8, perPx * h / 2 / S.HALF) };
  },
  fit(instant, list, ang){
    const S = GW.Scene, f = S.fitPlan(list, ang);
    S.auto = { list, ang };                                     // keep the frame snug until the camera is moved by hand
    if(instant){ S.orbit.target.copy(f.target); S.orbit.dist = f.dist; return; }
    S.flyTo(Object.assign({ target: f.target, dist: f.dist }, ang || {}), 750);
  },
  /* the strip along the bottom changes height as its content changes: the frame follows so nothing hides behind it */
  followInset(){
    const S = GW.Scene; if(!S.auto) return;
    const key = Math.round(S.measure().bottom / 16) + ':' + S.insetTop() + ':' + S.insetRight() + ':' + S.size().w + 'x' + S.size().h;
    if(key === S._fk) return; S._fk = key;
    clearTimeout(S._ft); S._ft = setTimeout(() => { if(S.auto) { const live = S.auto.list && S.auto.list.filter(g => GW.Gears.list.includes(g)); S.fit(false, live && live.length ? live : null, S.auto.ang); } }, 160);
  },

  /* ---------- mouse / touch ---------- */
  bindInput(){
    const S = GW.Scene, el = S.renderer.domElement, o = S.orbit;
    const ptrs = new Map();
    let lastPinch = 0, lastMid = null, moved = 0, downAt = null, panning = false;
    const stopFly = () => GW.Anim.list.forEach(t => { if(t.key === 'cam') t.stopped = true; });
    const pan = (dx, dy) => {
      const { h } = S.size();
      const f = o.dist * S.HALF * 2 / h;
      const dir = S.camera.getWorldDirection(new T.Vector3());
      const right = new T.Vector3().crossVectors(dir, S.camera.up).normalize();
      const up = new T.Vector3().crossVectors(right, dir).normalize();
      o.target.addScaledVector(right, -dx * f).addScaledVector(up, dy * f);
    };
    S.panBy = pan;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      if(S.handleBusy()) return;                          // the move / rotate / scale handle has it
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
      if(moved > 5) S.auto = null;                       // moved by hand: stop re-framing
      if(ptrs.size === 1){
        if(panning){ S.inp.px += dx; S.inp.py += dy; } else { S.inp.th -= dx * 0.006; S.inp.ph -= dy * 0.006; }
      } else if(ptrs.size === 2){
        const [a, b] = [...ptrs.values()];
        const pinch = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if(lastPinch > 0) o.dist *= lastPinch / Math.max(pinch, 1);
        if(lastMid){ S.inp.px += mid.x - lastMid.x; S.inp.py += mid.y - lastMid.y; }
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
      S.auto = null;
      e.preventDefault(); stopFly();
      S.inp.zm += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0011;      // eased in by S.smooth, a notch at a time
    }, { passive: false });
  },

  /* the pointer is on (or dragging) the transform handle: the camera must leave it alone */
  handleBusy(){ const t = GW.Xform && GW.Xform.tc; return !!(t && t.object && (t.dragging || t.axis)); },

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

  /* ---------- frame budget ---------- */
  wake(n){ GW.Scene._wake = Math.max(GW.Scene._wake || 0, n || 8); },
  /* true when the picture could have changed since the last draw */
  changed(spinning){
    const S = GW.Scene, o = S.orbit, G = GW.Gears;
    const r = v => Math.round(v * 200);                                    // ignore changes too small to see
    const sig = [r(o.theta), r(o.phi), r(o.dist), r(o.target.x), r(o.target.y), r(o.target.z), Math.round(S._inset || 0), S.size().w, S.size().h, G.version, GW.UI.selId, S.hoverId, GW.Xform ? GW.Xform.mode : '', GW.Spot ? Math.round(GW.Spot.k * 100) : 0, S.gridOn, GW.UI._sv, r(S.grid.material.opacity), GW.Anim.list.length].join('|');
    const diff = sig !== S._sig; S._sig = sig;
    if(diff) S._wake = Math.max(S._wake || 0, 30);                        // highlight fades and the like need a few more frames
    S._moved = diff || S._wake > 0;                                     // the picture itself changed (not just a turning gear)
    return diff || spinning || S._wake > 0;
  },
  render(now){
    const S = GW.Scene, G = GW.Gears;
    const spinning = G.spin && G.list.length > 0 && G.speed > 0;
    // every animation frame is drawn (60 a second on a 60 Hz screen); slow machines save work by drawing smaller, never by skipping frames
    S.updateCam();
    if(!S.changed(spinning)) return;                                      // nothing moved: leave the last picture on screen
    if(S._wake > 0) S._wake--;
    const t0 = performance.now();
    S.renderer.render(S.scene, S.camera);
    if(GW.Labels && S._moved) GW.Labels.update();
    const dt = performance.now() - t0, gap = now != null && S._lastDraw != null ? now - S._lastDraw : 0;
    S._lastDraw = now != null ? now : t0;
    // frames that keep taking too long: switch the light mode on for good
    if(!S.lite && spinning && gap > 0){
      S._slow = (S._slow || 0) * 0.9 + (gap > 40 ? 1 : 0);
      if(S._slow > 6){ S.lite = true; S.renderer.setPixelRatio(1); S.resize(); GW.Perf.lite = true; try { localStorage.setItem('gm.lite', '1'); } catch(e){} }
    }
  }
};
})();
