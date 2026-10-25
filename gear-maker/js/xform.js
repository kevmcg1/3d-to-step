"use strict";
/* Gear Maker — click a gear and a small bar offers Move, Rotate or Scale. Pick one and the handle appears on the gear in the 3D view.
   A gear that is meshed or keyed to another is part of an assembly, so the handle works on the whole assembly (its root gear moves,
   turns or scales and the rest follow). Scale is a true uniform scale: every length of every gear in the assembly is multiplied
   (module, face width, bore, hub, spacing...), so what fitted before still fits.
   Keys: W move, E rotate, R scale, Q handle off. */
(function(){
const U = GW.U, T = THREE, $ = U.el, make = U.make;

/* every length setting a uniform scale multiplies (mm settings only: counts, angles and ratios stay) */
const LENGTHS = ['m', 'thick', 'rimW', 'webT', 'webOff', 'spokeW', 'holeD', 'holePCD', 'chamfer', 'barH', 'faceW', 'bore', 'keyW', 'keyD', 'dFlat',
  'hubDia', 'hubUp', 'hubDown', 'wormDia', 'throatR', 'chainPitch', 'rollerDia', 'tipRelief', 'beltPitch', 'pitchLineDiff', 'grooveDepth', 'grooveWidth',
  'flangeD', 'flangeT', 'rollR', 'majorA', 'vgap', 'backlash', 'meshOffset', 'shaftOffset'];

const ICON = {
  move: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><path d="M4 20V13M4 20h7M4 20 13 11M20 4v7M20 4h-7M20 4l-5 5"/></svg>',
  off: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};
const MODES = [['translate', 'move', 'Move', 'W'], ['rotate', 'rotate', 'Rotate', 'E'], ['scale', 'scale', 'Scale', 'R']];

const Xf = GW.Xform = {
  mode: null, tc: null, pivot: null, bar: null, drag: null, pendingF: null, _bw: 0,

  init(){
    const S = GW.Scene;
    if(!T.TransformControls || Xf.tc) return;
    Xf.pivot = new T.Object3D(); S.scene.add(Xf.pivot);
    const tc = Xf.tc = new T.TransformControls(S.camera, S.renderer.domElement);
    tc.setSize(1.1);
    tc.addEventListener('change', () => S.wake(8));
    tc.addEventListener('dragging-changed', e => { if(e.value) Xf.begin(); else Xf.end(); });
    tc.addEventListener('objectChange', () => Xf.changed());
    S.scene.add(tc);
    Xf.buildBar();
    document.addEventListener('keydown', Xf.onKey);
  },

  /* ------------------------------------------------------------ the bar that offers the three tools */
  buildBar(){
    const bar = Xf.bar = make('div', 'xf');
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Move, rotate or scale the selected gear');
    bar.innerHTML = '<div class="xf-btns"></div><div class="xf-read" aria-live="polite"></div>';
    const row = bar.firstChild;
    MODES.forEach(([mode, ic, label, key]) => {
      const b = make('button', 'xf-b', ICON[ic] + '<span>' + label + '</span>');
      b.type = 'button'; b.dataset.mode = mode;
      b.dataset.tip = label + '\n' + ({ translate: 'Drag an arrow to slide the gear (or its whole assembly) along that axis.', rotate: 'Drag a ring to turn it about that axis.', scale: 'Drag a handle to make it bigger or smaller. Every size scales together, so meshes keep fitting.' })[mode] + ' (' + key + ')';
      b.onclick = () => Xf.setMode(Xf.mode === mode ? null : mode);
      row.appendChild(b);
    });
    const who = make('button', 'xf-b xf-who', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg><span>Which gear is this?</span>');
    who.type = 'button'; who.dataset.tip = 'Which gear is this?\nDims the view and outlines this gear for 3 seconds (H).';
    who.onclick = () => GW.Spot.start();
    row.insertBefore(who, row.firstChild);
    const off = make('button', 'xf-b xf-off', ICON.off); off.type = 'button'; off.setAttribute('aria-label', 'Hide the handle'); off.dataset.tip = 'Hide the handle\nQ';
    off.onclick = () => Xf.setMode(null); row.appendChild(off);
    GW.Scene.container.appendChild(bar);
    bar.addEventListener('pointerdown', e => e.stopPropagation());
    Xf.paintBar();
  },
  paintBar(){
    Xf.bar.querySelectorAll('.xf-b[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === Xf.mode)));
    Xf.bar.classList.toggle('active', !!Xf.mode);
  },

  setMode(mode){
    Xf.mode = mode;
    if(mode){ Xf.tc.setMode(mode); Xf.tc.setSpace(mode === 'rotate' || mode === 'scale' ? 'local' : 'world'); }
    Xf.paintBar(); Xf.readout();
    GW.Scene.wake(10);
  },

  onKey(e){
    if(e.ctrlKey || e.metaKey || e.altKey || (e.target.matches && e.target.matches('input,select,textarea')) || document.querySelector('.modal-bg.show') || (GW.Guide && GW.Guide.active)) return;
    const k = e.key.toLowerCase();
    if(!GW.UI.sel()) return;
    if(k === 'w') Xf.setMode('translate'); else if(k === 'e') Xf.setMode('rotate'); else if(k === 'r') Xf.setMode('scale'); else if(k === 'q') Xf.setMode(null);
  },

  /* the gear that actually carries out the change: the first gear of the assembly */
  rootOf(g){ return g ? GW.Gears.rootOf(g) : null; },
  assembly(root){ return [root].concat(GW.Gears.descendants(root.id)); },

  /* ------------------------------------------------------------ every frame */
  sync(){
    const tc = Xf.tc; if(!tc) return;
    const S = GW.Scene, g = GW.UI.sel(), root = Xf.rootOf(g);
    const shown = !!(g && g.mesh.visible) && !(GW.Spot && GW.Spot.active) && !(GW.Tools && GW.Tools.mode);
    if(Xf.pendingF != null && Xf.drag){ Xf.applyScale(Xf.pendingF, true); Xf.pendingF = null; }
    if(shown && Xf.mode){
      if(tc.object !== Xf.pivot) tc.attach(Xf.pivot);
      if(!tc.dragging){ Xf.pivot.position.copy(root.rt.pos); Xf.pivot.quaternion.copy(root.rt.quat); Xf.pivot.scale.set(1, 1, 1); }
    } else if(tc.object){ tc.detach(); S.wake(8); }
    const bar = Xf.bar;
    bar.classList.toggle('on', shown);
    const who = bar.querySelector('.xf-who'); if(who) who.hidden = GW.Gears.list.length < 2;
    if(!shown) return;
    if(!Xf._bw) Xf._bw = bar.offsetWidth || 220;
    // float the bar just above the selected gear, kept inside the stage and clear of the toolbar and the strip
    const { w, h } = S.size(), c = S.camera, v = g.mesh.position.clone().project(c);
    const ppu = h / Math.max(c.top - c.bottom, 1e-6);
    const px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h - (GW.Gears.reach(g) * ppu + 54);
    const x = U.clamp(px - Xf._bw / 2, 8, Math.max(8, w - Xf._bw - 8 - S.insetRight()));
    const y = U.clamp(py, S.insetTop() + 4, Math.max(S.insetTop() + 4, h - S.insetBottom() - 70));
    const key = Math.round(x) + ',' + Math.round(y);
    if(key !== Xf._pos){ Xf._pos = key; bar.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'; }
    const name = (root !== g ? root.name + ' (assembly)' : g.name);
    if(Xf._name !== name){ Xf._name = name; Xf.readout(); }
  },

  /* ------------------------------------------------------------ a drag */
  begin(){
    const g = GW.UI.sel(), root = Xf.rootOf(g); if(!g || !root) return;
    const start = new Map();
    Xf.assembly(root).forEach(x => { const o = {}; LENGTHS.forEach(k => { if(typeof x[k] === 'number') o[k] = x[k]; }); start.set(x.id, o); });
    Xf.drag = { mode: Xf.mode, root, start, clamped: false };
    GW.UI.dragging = true; GW.Build.draft = true;
    Xf.bar.classList.add('dragging');
  },
  end(){
    const d = Xf.drag; if(!d) return;
    if(d.mode === 'scale' && Xf.pendingF != null){ Xf.applyScale(Xf.pendingF, true); }
    Xf.pendingF = null; Xf.drag = null;
    GW.UI.dragging = false; GW.Build.draft = false;
    if(d.mode === 'scale'){
      Xf.assembly(d.root).forEach(x => { try { GW.Gears.rebuild(x); } catch(err){ console.warn(err); } });
      Xf.pivot.scale.set(1, 1, 1);
      if(d.clamped) GW.UI.toast('Some sizes reached the limit of what that gear can be, so they stopped there.', 3600);
    }
    GW.UI._sv++; GW.UI.mark({ list: 1, fb: 1, props: 1, helpers: 1 });
    Xf.bar.classList.remove('dragging');
    GW.History.commit();
    Xf.readout();
  },

  changed(){
    const d = Xf.drag; if(!d) return;
    const G = GW.Gears, root = d.root, p = Xf.pivot;
    if(d.mode === 'translate'){
      root.px = +p.position.x.toFixed(2); root.py = +p.position.y.toFixed(2); root.pz = +p.position.z.toFixed(2);
      G.dirty = true; G.emit('soft', root);
      Xf.readout(root.px + ',' + root.py + ',' + root.pz);
    } else if(d.mode === 'rotate'){
      const e = new T.Euler().setFromQuaternion(p.quaternion, 'XYZ');
      root.rx = +U.deg(e.x).toFixed(1); root.ry = +U.deg(e.y).toFixed(1); root.rz = +U.deg(e.z).toFixed(1);
      G.dirty = true; G.emit('soft', root);
      Xf.readout(root.rx + ',' + root.ry + ',' + root.rz);
    } else {
      // the handle that moved the most decides the factor (the center handle moves all three the same)
      const s = [p.scale.x, p.scale.y, p.scale.z];
      let f = s[0]; s.forEach(v => { if(Math.abs(v - 1) > Math.abs(f - 1)) f = v; });
      Xf.pendingF = U.clamp(f, 0.1, 10);
      Xf.readout(Xf.pendingF);
    }
  },

  /* multiply every length of every gear in the assembly by f (measured from the sizes at the start of the drag) */
  applyScale(f, quick){
    const d = Xf.drag; if(!d) return;
    const G = GW.Gears, Types = GW.Types;
    Xf.assembly(d.root).forEach(g => {
      const st = d.start.get(g.id); if(!st) return;
      LENGTHS.forEach(k => {
        if(st[k] == null) return;
        let v = st[k] * f;
        const def = Types.PARAMS[k] || Types.LINK_PARAMS[k];
        if(def && def[3] != null){
          const rg = Types.range(g.type, k);
          if(st[k] !== 0){ const c = U.clamp(v, rg[0], rg[1]); if(c !== v){ d.clamped = true; v = c; } }
        }
        g[k] = +v.toFixed(4);
      });
      if(st.chainPitch != null) g.chainPreset = 'custom';
      if(st.beltPitch != null) g.beltPreset = 'custom';
      try { G.rebuild(g); } catch(err){ console.warn('scale rebuild failed', err); }
    });
    G.dirty = true; G.emit('edit', d.root);
  },

  /* what the bar says: which thing is being worked on, and the number while dragging */
  readout(v){
    const g = GW.UI.sel(), root = Xf.rootOf(g), r = Xf.bar.querySelector('.xf-read');
    if(!g){ r.textContent = ''; return; }
    const who = root !== g ? root.name + ' + ' + (GW.Gears.descendants(root.id).length) + ' meshed' : g.name;
    let t = who;
    if(Xf.drag && v != null){
      const m = Xf.drag.mode, U_ = GW.Units;
      if(m === 'translate'){ const [x, y, z] = String(v).split(',').map(Number); t = 'X ' + U_.fmtD(x) + '  Y ' + U_.fmtD(y) + '  Z ' + U_.fmtD(z) + ' ' + U_.unit(); }
      else if(m === 'rotate'){ const [x, y, z] = String(v).split(',').map(Number); t = 'X ' + x + '°  Y ' + y + '°  Z ' + z + '°'; }
      else t = '× ' + (+v).toFixed(2) + ' size';
    } else if(Xf.mode === 'translate') t += ' · drag an arrow';
    else if(Xf.mode === 'rotate') t += ' · drag a ring';
    else if(Xf.mode === 'scale') t += ' · drag a handle';
    else t += ' · pick a tool';
    r.textContent = t;
  }
};
})();
