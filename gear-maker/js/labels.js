"use strict";
/* Gear Maker — a label on every gear in the 3D view: which one is the DRIVER and which is DRIVEN.
   Plain HTML pills laid over the canvas, moved to follow each gear. They only move when the picture is redrawn. */
(function(){
const T = THREE, v = new T.Vector3();
const Labels = GW.Labels = {
  on: true, els: new Map(), box: null,

  init(stage){
    Labels.box = document.createElement('div'); Labels.box.className = 'glabels'; Labels.box.id = 'glabels'; Labels.box.setAttribute('aria-hidden', 'true');
    stage.appendChild(Labels.box);
  },
  set(on){ Labels.on = !!on; if(Labels.box) Labels.box.classList.toggle('off', !Labels.on); const b = document.getElementById('labelBtn'); if(b) b.setAttribute('aria-pressed', Labels.on); if(on) Labels.update(); },

  /* what a gear is doing in the assembly */
  role(g){
    const G = GW.Gears;
    if(!g.parentId) return G.children(g.id).length ? 'driver' : 'free';
    return g.linkKind === 'same shaft' ? 'shaft' : 'driven';
  },
  NAMES: { driver: 'Driver', driven: 'Driven', shaft: 'Same shaft', free: 'Free' },

  update(){
    if(!Labels.box || !Labels.on) return;
    const S = GW.Scene, G = GW.Gears, cam = S.camera, { w, h } = S.size();
    const pxPerUnit = h / (2 * cam.top), seen = new Set();
    G.list.forEach(g => {
      let el = Labels.els.get(g.id);
      if(!g.mesh.visible || (g.scale != null && g.scale < 0.2)){ if(el) el.style.display = 'none'; seen.add(g.id); return; }
      if(!el){ el = document.createElement('div'); el.className = 'glabel'; el.innerHTML = '<i></i><b></b><span></span>'; Labels.box.appendChild(el); Labels.els.set(g.id, el); el._k = ''; }
      seen.add(g.id);
      const role = Labels.role(g), name = g.name || '', nm = name.toLowerCase() === Labels.NAMES[role].toLowerCase() ? '' : name;
      const key = role + '|' + nm + '|' + g.color + '|' + (g.id === GW.UI.selId);
      if(el._k !== key){
        el._k = key; el.className = 'glabel ' + role + (g.id === GW.UI.selId ? ' sel' : '');
        el.children[0].style.background = g.color; el.children[1].textContent = Labels.NAMES[role]; el.children[2].textContent = nm;
      }
      // sit just above the gear's top edge, as the camera sees it
      v.copy(g.mesh.position).project(cam);
      const reach = (G.reach ? G.reach(g) : 20) * pxPerUnit;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h - Math.min(reach * 0.62, h * 0.35) - 8;
      const px = Math.round(Math.min(Math.max(x, 50), w - S.insetRight() - 50)), py = Math.round(Math.max(y, S.insetTop() + 24));   // stay clear of the toolbar              // (project() already includes the camera's view offset)
      if(el._px !== px || el._py !== py){ el._px = px; el._py = py; el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`; }
      el.style.display = '';
    });
    Labels.els.forEach((el, id) => { if(!seen.has(id)){ el.remove(); Labels.els.delete(id); } });
  }
};
})();
