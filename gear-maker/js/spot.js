"use strict";
/* Gear Maker — "Which gear is this?". With more than one gear on the table, pick a gear and press the button (or H):
   the view dims, the gear gets an outline and a tag that points at it, every other gear fades to 90 % transparent,
   and after 3 seconds it all eases back by itself. A click, Esc or choosing another gear also ends it (another gear
   restarts it on that gear). Nothing about the gears themselves is changed: only their drawn opacity, and only while it runs. */
(function(){
const U = GW.U, T = THREE, $ = U.el, make = U.make, esc = U.esc;
const HOLD = 3000, FADE = 0.1;                      // seconds on screen; the others keep this much of their opacity

const Spot = GW.Spot = {
  active: false, k: 0, id: null, t0: 0, outline: null, dim: null, tag: null, _end: 0,

  init(){
    if(Spot.tag) return;
    const stage = $('stage');
    Spot.dim = make('div', 'spot-dim'); Spot.dim.setAttribute('aria-hidden', 'true');
    stage.insertBefore(Spot.dim, stage.firstChild);                    // under the 3D canvas: only the backdrop darkens, the gear stays bright
    const tag = Spot.tag = make('div', 'spot-tag'); tag.setAttribute('role', 'status');
    tag.innerHTML = '<small>Which gear is this?</small><b></b><span></span><i class="spot-bar"></i><em class="spot-arrow"></em>';
    stage.appendChild(tag);
    stage.addEventListener('pointerdown', e => { if(Spot.active && !e.target.closest('.xf, .vp, .views')) Spot.stop(); }, true);
    document.addEventListener('keydown', e => {
      if(e.ctrlKey || e.metaKey || e.altKey || (e.target.matches && e.target.matches('input,select,textarea')) || document.querySelector('.modal-bg.show')) return;
      if(e.key === 'Escape' && Spot.active) Spot.stop();
      else if((e.key === 'h' || e.key === 'H') && GW.UI && GW.UI.sel()) Spot.start();
    });
  },

  /* only worth showing when there is something to tell the gear apart from */
  available(){ return GW.Gears.list.length > 1 && !!GW.UI.sel(); },

  start(id){
    Spot.init();
    const g = id != null ? GW.Gears.get(id) : GW.UI.sel();
    if(!g || GW.Gears.list.length < 2) return false;
    Spot.clearOutline();
    Spot.id = g.id; Spot.active = true; Spot.t0 = performance.now();
    // the outline: a slightly fattened copy of the gear's own mesh, drawn behind it
    const d = Math.max(0.5, GW.Gears.reach(g) * 0.022);
    const mat = new T.MeshBasicMaterial({ color: 0x8fbcff, side: T.BackSide, transparent: true, opacity: 0, depthWrite: false });
    mat.onBeforeCompile = sh => {
      sh.uniforms.od = { value: d };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float od;').replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * od;');
    };
    const o = Spot.outline = new T.Mesh(g.mesh.geometry, mat);
    o.renderOrder = -1; g.mesh.add(o);
    const rt = g.parentId ? 'meshed with ' + (GW.Gears.get(g.parentId) || {}).name : GW.Gears.children(g.id).length ? 'drives ' + GW.Gears.children(g.id).length + ' gear' + (GW.Gears.children(g.id).length > 1 ? 's' : '') : 'a free gear';
    Spot.tag.querySelector('b').textContent = g.name;
    Spot.tag.querySelector('span').textContent = GW.Types.TYPES[g.type].label + (g.type === 'rack' ? '' : g.type === 'worm' ? ' · ' + g.starts + ' start' + (g.starts > 1 ? 's' : '') : ' · ' + Math.round(g.z) + ' teeth') + ' · ' + rt;
    const bar = Spot.tag.querySelector('.spot-bar'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
    Spot.tag.style.setProperty('--hold', HOLD + 'ms');
    Spot.tag.classList.add('on');
    clearTimeout(Spot._end); Spot._end = setTimeout(() => Spot.stop(), HOLD);
    GW.Scene.wake(40);
    return true;
  },
  stop(){
    if(!Spot.active) return;
    Spot.active = false; clearTimeout(Spot._end);
    Spot.tag.classList.remove('on');
    GW.Scene.wake(40);
  },
  clearOutline(){
    if(Spot.outline){ if(Spot.outline.parent) Spot.outline.parent.remove(Spot.outline); Spot.outline.material.dispose(); Spot.outline = null; }
  },

  /* every frame: ease in or out, and apply it */
  sync(){
    const G = GW.Gears;
    if(Spot.active){
      const g = G.get(Spot.id);
      if(!g || G.list.length < 2){ Spot.stop(); }
      else if(GW.UI.selId !== Spot.id){ if(GW.UI.selId != null && G.list.length > 1) Spot.start(GW.UI.selId); else Spot.stop(); }
    }
    const want = Spot.active ? 1 : 0, was = Spot.k;
    Spot.k = GW.Anim.chase(Spot.k, want, 0.16); if(Math.abs(Spot.k - want) < 0.004) Spot.k = want;
    if(Spot.k === 0 && was === 0) return;
    GW.Scene.wake(4);
    const g = G.get(Spot.id), k = Spot.k;
    Spot.dim.style.opacity = (k * 0.7).toFixed(3);
    $('stage').classList.toggle('spotting', k > 0.02);
    if(Spot.outline) Spot.outline.material.opacity = k;
    G.list.forEach(x => {
      const m = x.mesh.material;
      if(x === g || k === 0 && !x._spotted) return;
      if(k > 0){ x._spotted = true; m.transparent = true; m.depthWrite = false; m.opacity = x.opacity + (FADE * x.opacity - x.opacity) * k; }
      else if(x._spotted){ x._spotted = false; G.restyle(x); }
    });
    if(g && k > 0 && g._spotted){ g._spotted = false; G.restyle(g); }
    if(k === 0){ Spot.clearOutline(); G.list.forEach(x => { if(x._spotted){ x._spotted = false; G.restyle(x); } }); Spot.tag.classList.remove('on'); }
    // the tag floats above the gear, pointing down at it (or below it when there is no room above)
    if(g && Spot.active || k > 0){
      const S = GW.Scene, c = S.camera, { w, h } = S.size(), tg = Spot.tag, gg = g || G.list[0];
      if(!gg) return;
      const v = gg.mesh.position.clone().project(c), ppu = h / Math.max(c.top - c.bottom, 1e-6);
      const px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h, r = G.reach(gg) * ppu;
      const bw = tg.offsetWidth || 230, bh = tg.offsetHeight || 84;
      let y = py - r - bh - 18, below = false;
      if(y < S.insetTop() + 4){ y = py + r + 18; below = true; }
      const x = U.clamp(px - bw / 2, 8, Math.max(8, w - bw - 8));
      tg.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(U.clamp(y, 4, h - bh - 4)) + 'px)';
      tg.classList.toggle('below', below);
      tg.style.setProperty('--ax', Math.round(U.clamp(px - x, 18, bw - 18)) + 'px');
    }
  }
};
})();
