"use strict";
/* Gear Maker — undo and redo. After every change settles (a drag has ended, a gear was added, a mesh made)
   the table is saved as a snapshot; undo and redo step through those snapshots.
   Ctrl + Z undoes, Ctrl + Y (or Ctrl + Shift + Z) redoes. */
(function(){
const H = GW.History = {
  stack: [], at: -1, busy: false, max: 100, _t: 0, onState: null,

  /* ids are handed out afresh when a table is rebuilt, so snapshots number the gears by position instead */
  snap(){
    const d = GW.Gears.toJSON(), at = new Map(d.gears.map((g, i) => [g.id, i + 1]));
    d.gears.forEach(g => { g.id = at.get(g.id); if(g.parentId != null) g.parentId = at.get(g.parentId) || null; });
    return JSON.stringify(d);
  },
  reset(){ clearTimeout(H._t); H.stack = [H.snap()]; H.at = 0; H.fire(); },

  /* something changed: wait until it stops changing, then keep a snapshot */
  touch(){ if(H.busy) return; clearTimeout(H._t); H._t = setTimeout(H.commit, 380); },
  commit(){
    clearTimeout(H._t); H._t = 0;
    if(H.busy) return;
    const s = H.snap();
    if(s === H.stack[H.at]) return;
    H.stack.length = H.at + 1;
    H.stack.push(s);
    if(H.stack.length > H.max) H.stack.shift();
    H.at = H.stack.length - 1;
    H.fire();
  },
  can(dir){ H.commit(); return dir < 0 ? H.at > 0 : H.at < H.stack.length - 1; },

  step(dir){
    if(H._t) H.commit();
    const to = H.at + dir;
    if(to < 0 || to >= H.stack.length) return false;
    const G = GW.Gears, UI = GW.UI;
    const idx = UI.sel() ? G.list.indexOf(UI.sel()) : -1;
    H.busy = true;
    try {
      G._instant = true;
      G.clear({ instant: true });
      G.fromJSON(JSON.parse(H.stack[to]));
    } finally { G._instant = false; H.busy = false; }
    H.at = to;
    UI.selId = null;
    if(G.list.length) UI.select(G.list[Math.min(Math.max(idx, 0), G.list.length - 1)].id);
    UI.mark({ list: 1, props: 1, fb: 1, helpers: 1 });
    H.fire();
    UI.toast(dir < 0 ? 'Undid the last change.' : 'Redid the change.', 1800, 'undo');
    return true;
  },
  undo(){ return H.step(-1); },
  redo(){ return H.step(1); },
  fire(){ if(H.onState) H.onState(); }
};
})();
