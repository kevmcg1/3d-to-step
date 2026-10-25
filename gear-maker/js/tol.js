"use strict";
/* Gear Maker — fits and tolerances. The numbers a part really needs depend on how it is made:
   a machined bore is a few hundredths of a millimeter over the shaft, a printed one needs a few tenths, and printed
   teeth need a lot more backlash than cut ones. The process is a setting of each gear; the allowances below
   are added to the bore and keyway when the shape is built, and set the smallest backlash that works. */
(function(){
const Tol = GW.Tol = {
  PROCESSES: {
    ideal:    { label: 'Ideal (no tolerance)',     bore: 0,    key: 0,    floor: 0,    perM: 0 },
    machined: { label: 'CNC machined (± 0.02 mm)', bore: 0.02, key: 0.04, floor: 0.05, perM: 0.04 },
    sla:      { label: '3D print: resin (SLA)',    bore: 0.15, key: 0.15, floor: 0.12, perM: 0.05 },
    fdm:      { label: '3D print: filament (FDM)', bore: 0.30, key: 0.25, floor: 0.25, perM: 0.08 }
  },
  LABELS: {},
  of: g => Tol.PROCESSES[g.tolerance] || Tol.PROCESSES.machined,

  /* extra diameter of the bore, and extra width / depth of the keyway, for this gear's process */
  allowance(g){ const p = Tol.of(g), add = +g.tolAdd || 0; return { bore: p.bore + add, key: p.key + add }; },

  /* the smallest backlash that still runs, for the process and tooth size */
  minBacklash(g){
    if(['pulley', 'sprocket'].includes(g.type)) return 0;
    const p = Tol.of(g); return p.floor ? Math.max(p.floor, p.perM * (g.m || 1)) : 0;
  },
  hasTeeth: g => !['pulley', 'sprocket'].includes(g.type),

  /* the settings the builders should use: bore and keyway opened up by the allowance */
  apply(g){
    const a = Tol.allowance(g);
    if(!(a.bore > 0) && !(a.key > 0)) return g;
    const o = Object.assign({}, g);
    if(g.bore > 0) o.bore = g.bore + a.bore;
    if(g.keyW > 0){ o.keyW = g.keyW + a.key; o.keyD = g.keyD + a.key / 2; }
    return o;
  }
};
Object.keys(Tol.PROCESSES).forEach(k => { Tol.LABELS[k] = Tol.PROCESSES[k].label; });
})();
