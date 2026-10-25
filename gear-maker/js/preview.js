"use strict";
/* Gear Maker — option previews. While you hover (or arrow through) a gear type or a sample, a small card
   shows a slowly turning model of what you would get, before you pick it. It is drawn like the real thing
   (solid metal, the same lighting), on a plain card: it is a preview, not a part of the table.

   GW.Preview.show({ type | sample, anchor, side })   GW.Preview.hide()
   Sample previews are built off the table: the gear list is swapped out for the length of the build, so
   nothing you have placed is touched. */
(function(){
const T = THREE, U = GW.U;
const W = 214, H = 172;

const Preview = GW.Preview = {
  cache: new Map(),          // 'type:spur' / 'sample:planetary' -> { group, radius, caption }
  shown: null, el: null, raf: 0,

  init(){
    if(Preview.el) return;
    const el = document.createElement('div');
    el.className = 'pv'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="pv-pill">Preview</span><canvas width="' + W * 2 + '" height="' + H * 2 + '"></canvas><div class="pv-cap"><b></b><small></small></div>';
    document.body.appendChild(el);
    Preview.el = el; Preview.cv = el.querySelector('canvas');
    Preview.r = new T.WebGLRenderer({ canvas: Preview.cv, antialias: true, alpha: true });
    Preview.r.setPixelRatio(1); Preview.r.setSize(W * 2, H * 2, false);
    Preview.scene = new T.Scene();
    Preview.scene.environment = GW.Scene.scene.environment;
    Preview.scene.add(new T.HemisphereLight(0xe6ecf5, 0x2a2d35, 0.95));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(60, -80, 120);
    const rim = new T.DirectionalLight(0x8fb3ff, 0.3); rim.position.set(-80, 60, 40);
    Preview.scene.add(key, rim);
    Preview.cam = new T.PerspectiveCamera(36, W / H, 0.5, 4000);
    Preview.holder = new T.Group(); Preview.scene.add(Preview.holder);
    Preview.cap = { b: el.querySelector('.pv-cap b'), s: el.querySelector('.pv-cap small') };
  },

  /* ---- building what to show ---- */
  solid(g){ const f = GW.Types.FINISH[g.finish] || GW.Types.FINISH.brass; return new T.MeshStandardMaterial({ color: g.color || f.color, metalness: g.metal, roughness: g.rough, envMapIntensity: 1 }); },

  forType(type){
    const k = 'type:' + type; if(Preview.cache.has(k)) return Preview.cache.get(k);
    const g = GW.Types.defaults(type); g.name = GW.Types.TYPES[type].label;
    const prev = GW.Build.quality, prevD = GW.Build.draft; GW.Build.quality = Math.max(prev, 1); GW.Build.draft = false;
    let r; try { r = GW.Build.build(g); } finally { GW.Build.quality = prev; GW.Build.draft = prevD; }
    const group = new T.Group(); group.add(new T.Mesh(r.geo, Preview.solid(g)));
    const e = { group, caption: [GW.Types.TYPES[type].label, GW.Types.TYPES[type].desc] };
    Preview.cache.set(k, e); return e;
  },

  forSample(p){
    const k = 'sample:' + p.id; if(Preview.cache.has(k)) return Preview.cache.get(k);
    const e = { group: new T.Group(), caption: [p.name, p.note] };
    if(p.id === 'showcase'){ e.caption = [p.name, p.note + ' (too big to preview)']; e.none = true; Preview.cache.set(k, e); return e; }
    const G = GW.Gears, saved = { list: G.list, order: G.order, root: G.root, nextId: G.nextId, dirty: G.dirty, listeners: G.listeners, stagger: G._stagger, anim: GW.Anim };
    const tmp = new T.Group(); let made = [];
    G.list = []; G.order = []; G.root = tmp; G.nextId = 1; G.listeners = []; G._stagger = null; GW.Anim = null;
    try {
      made = p.build(0, 0);
      G.dirty = true; GW.Layout.solveAll(); GW.Layout.update(0);
      G.list.forEach(g => {
        g.mesh.updateMatrixWorld(true);
        const m = new T.Mesh(g.mesh.geometry, Preview.solid(g));
        m.position.copy(g.mesh.position); m.quaternion.copy(g.mesh.quaternion); m.scale.copy(g.mesh.scale);
        e.group.add(m);
      });
      e.count = G.list.length;
    } finally {
      G.list = saved.list; G.order = saved.order; G.root = saved.root; G.nextId = saved.nextId; G.dirty = true; G.listeners = saved.listeners; G._stagger = saved.stagger; GW.Anim = saved.anim;
    }
    e.caption = [p.name, p.note + (e.count ? '  ·  ' + e.count + ' gear' + (e.count > 1 ? 's' : '') : '')];
    Preview.cache.set(k, e); return e;
  },

  /* ---- showing it ---- */
  show(o){
    Preview.init();
    let e;
    try { e = o.sample ? Preview.forSample(o.sample) : Preview.forType(o.type); } catch(err){ console.warn('preview failed', err); return; }
    const id = o.sample ? 'sample:' + o.sample.id : 'type:' + o.type;
    Preview.cap.b.textContent = e.caption[0]; Preview.cap.s.textContent = e.caption[1];
    if(Preview.shown !== id){
      Preview.shown = id;
      while(Preview.holder.children.length) Preview.holder.remove(Preview.holder.children[0]);
      if(!e.none){
        Preview.holder.add(e.group);
        const box = new T.Box3().setFromObject(e.group), c = box.getCenter(new T.Vector3()), r = Math.max(box.getSize(new T.Vector3()).length() / 2, 5);
        Preview.holder.position.set(-c.x, -c.y, -c.z); Preview.pivot = c; Preview.radius = r;
        Preview.spin = 0;
        const d = r / Math.sin(U.rad(Preview.cam.fov / 2)) * 1.08;
        Preview.cam.position.set(0, -d * Math.cos(0.5), d * Math.sin(0.5) * 0.9 + d * 0.3); Preview.cam.up.set(0, 0, 1); Preview.cam.lookAt(0, 0, 0);
      }
      Preview.cv.style.opacity = e.none ? 0 : 1;
      Preview.el.classList.remove('swap'); void Preview.el.offsetWidth; Preview.el.classList.add('swap');
    }
    Preview.place(o.anchor, o.side);
    Preview.el.classList.add('show');
    if(!Preview.raf) Preview.loop();
  },
  place(a, side){
    if(!a) return;
    const r = a.getBoundingClientRect(), w = 238, h = Preview.el.offsetHeight || 250, vw = window.innerWidth, vh = window.innerHeight;
    let x = side === 'left' ? r.left - w - 12 : r.right + 12;
    if(x + w > vw - 8) x = r.left - w - 12;
    if(x < 8) x = Math.min(vw - w - 8, Math.max(8, r.right + 12));
    let y = r.top + r.height / 2 - h / 2;
    Preview.el.style.left = x + 'px'; Preview.el.style.top = U.clamp(y, 8, vh - h - 8) + 'px';
  },
  hide(){
    if(!Preview.el) return;
    Preview.el.classList.remove('show'); Preview.shown = null;
  },
  loop(){
    Preview.raf = requestAnimationFrame(t => {
      Preview.raf = 0;
      if(!Preview.el.classList.contains('show')) return;
      Preview.holder.rotation.z += 0.012;
      // turn about the model's own center: the holder is offset, so rotate the group about it
      const c = Preview.pivot;
      if(c){ const a = Preview.holder.rotation.z; Preview.holder.position.set(-(c.x * Math.cos(a) - c.y * Math.sin(a)), -(c.x * Math.sin(a) + c.y * Math.cos(a)), -c.z); }
      Preview.r.render(Preview.scene, Preview.cam);
      Preview.loop();
    });
  }
};
})();
