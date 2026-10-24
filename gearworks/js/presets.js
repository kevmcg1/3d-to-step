"use strict";
/* Gearworks — ready-made assemblies. Each one is built the same way you would by hand:
   add gears, then mesh them with the auto-fix so every pair is genuinely compatible. */
(function(){
const G = () => GW.Gears;

/* mesh child onto parent, applying whatever fixes the compatibility check asks for */
function meshAuto(child, parent, kind, side){
  const link = { kind: kind === 'same shaft' ? 'shaft' : 'mesh' };
  const plan = GW.Compat.plan(parent, child, link, side || 'B');
  G().applyPlan(parent, child, plan);
  G().link(child.id, parent.id, kind || 'mesh');
  return child;
}
GW.meshAuto = meshAuto;

const add = (t, o) => G().add(t, o);
const ang = (g, a) => G().set(g, 'meshAngle', a);

GW.Presets = [
  { id: 'train', group: 'Basics', name: 'Gear train (3 spur gears)', note: 'The middle gear is an idler: it reverses nothing overall.',
    build(x, y){
      const a = add('spur', { name: 'Driver', z: 16, px: x, py: y, bore: 6 });
      const b = add('spur', { name: 'Idler', z: 32, bore: 8 });
      const c = add('spur', { name: 'Driven', z: 20, bore: 6 });
      meshAuto(b, a); ang(b, 20); meshAuto(c, b); ang(c, -35);
      return [a, b, c];
    } },
  { id: 'compound', group: 'Basics', name: 'Compound reduction (12:36 → 12:36)', note: 'Two gears share a shaft. 9:1 overall.',
    build(x, y){
      const a = add('spur', { name: 'Input', z: 12, x: 0.3, px: x, py: y, bore: 5, thick: 10 });
      const b = add('spur', { name: 'Stage 1 gear', z: 36, bore: 8, thick: 8, bodyStyle: 'webbed', holeN: 6, holeD: 8 });
      const c = add('spur', { name: 'Stage 2 pinion', z: 12, x: 0.3, bore: 8, thick: 10 });
      const d = add('spur', { name: 'Output', z: 36, bore: 10, thick: 10, bodyStyle: 'spoked', spokes: 6 });
      meshAuto(b, a); ang(b, 0);
      meshAuto(c, b, 'same shaft');
      meshAuto(d, c); ang(d, 0);
      G().chooseSide(d);
      return [a, b, c, d];
    } },
  { id: 'rack', group: 'Basics', name: 'Rack and pinion', note: 'The pinion turns; the rack slides one pitch per tooth.',
    build(x, y){
      const p = add('spur', { name: 'Pinion', z: 18, px: x, py: y, bore: 8, keyW: 2.5, keyD: 1.2, hubDia: 18, hubUp: 5 });
      const r = add('rack', { name: 'Rack', z: 14, thick: 12 });
      meshAuto(r, p); ang(r, -90);
      return [p, r];
    } },
  { id: 'helical', group: 'Smooth & strong', name: 'Helical pair', note: 'Opposite hands, so they mesh smoothly.',
    build(x, y){
      const a = add('helical', { name: 'Helical A', z: 20, helix: 20, thick: 14, px: x, py: y, finish: 'steel' });
      const b = add('helical', { name: 'Helical B', z: 28, thick: 14, finish: 'steel' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'herring', group: 'Smooth & strong', name: 'Herringbone pair', note: 'Two opposing helical halves cancel the axial thrust.',
    build(x, y){
      const a = add('herring', { name: 'Herringbone A', z: 20, helix: 25, thick: 18, vgap: 2, px: x, py: y, finish: 'bronze' });
      const b = add('herring', { name: 'Herringbone B', z: 30, thick: 18, vgap: 2, finish: 'bronze' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'planetary', group: 'Smooth & strong', name: 'Planetary set (carrier fixed)', note: 'Sun drives three planets inside a ring. 18 + 54 ÷ 3 teeth fit evenly.',
    build(x, y){
      const sun = add('spur', { name: 'Sun', z: 18, px: x, py: y, bore: 8, thick: 10, finish: 'brass' });
      const ps = [0, 120, 240].map((ang_, i) => {
        const p = add('spur', { name: 'Planet ' + (i + 1), z: 18, bore: 5, thick: 10, finish: 'steel' });
        meshAuto(p, sun); ang(p, ang_); return p;
      });
      const ring = add('internal', { name: 'Ring', z: 54, thick: 10, rimW: 8, finish: 'aluminum' });
      meshAuto(ring, ps[0]); ang(ring, 0);
      return [sun, ...ps, ring];
    } },
  { id: 'bevel', group: 'Crossing shafts', name: 'Bevel pair (90°)', note: 'Cone angles are worked out from the tooth ratio.',
    build(x, y){
      const a = add('bevel', { name: 'Bevel A', z: 20, thick: 9, px: x, py: y });
      const b = add('bevel', { name: 'Bevel B', z: 30, thick: 9 });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'trio', group: 'Crossing shafts', name: 'Bevel trio (differential-style)', note: 'One bevel gear drives two others from opposite sides.',
    build(x, y){
      const a = add('bevel', { name: 'Input bevel', z: 20, thick: 9, px: x, py: y });
      const b = add('bevel', { name: 'Left bevel', z: 20, thick: 9 });
      const c = add('bevel', { name: 'Right bevel', z: 20, thick: 9 });
      meshAuto(b, a); ang(b, 0); meshAuto(c, a); ang(c, 180);
      return [a, b, c];
    } },
  { id: 'spiral', group: 'Crossing shafts', name: 'Spiral bevel pair', note: 'Curved teeth with opposite spiral angles.',
    build(x, y){
      const a = add('spiralbevel', { name: 'Spiral A', z: 22, thick: 9, px: x, py: y, finish: 'steel' });
      const b = add('spiralbevel', { name: 'Spiral B', z: 22, thick: 9, finish: 'steel' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'crown', group: 'Crossing shafts', name: 'Crown gear and pinion', note: 'A spur pinion drives teeth cut into the face of a crown gear.',
    build(x, y){
      const c = add('crown', { name: 'Crown', z: 40, px: x, py: y, thick: 6, faceW: 10, bore: 10 });
      const p = add('spur', { name: 'Pinion', z: 14, thick: 12, bore: 5 });
      meshAuto(p, c);
      return [c, p];
    } },
  { id: 'worm', group: 'Crossing shafts', name: 'Worm drive', note: 'One turn of the worm advances the wheel by one tooth (per start).',
    build(x, y){
      const w = add('worm', { name: 'Worm', m: 2, starts: 2, wormDia: 20, thick: 44, px: x, py: y, bore: 6, finish: 'steel' });
      const h = add('wormwheel', { name: 'Worm wheel', z: 30, thick: 12, throatR: 12, bore: 10, hubDia: 20, hubUp: 4, finish: 'bronze' });
      meshAuto(h, w);
      return [w, h];
    } },
  { id: 'chain', group: 'Belts & chains', name: 'Chain drive', note: '#40 roller chain over two sprockets.',
    build(x, y){
      const a = add('sprocket', { name: 'Drive sprocket', z: 17, px: x, py: y });
      const b = add('sprocket', { name: 'Driven sprocket', z: 34, thick: 5 });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'belt', group: 'Belts & chains', name: 'Timing-belt drive', note: 'GT2 pulleys with flanges and a toothed belt.',
    build(x, y){
      const a = add('pulley', { name: 'Motor pulley', z: 20, px: x, py: y, finish: 'aluminum' });
      const b = add('pulley', { name: 'Driven pulley', z: 40, finish: 'aluminum' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'clock', group: 'Special', name: 'Clock train (cycloidal)', note: 'Epicycloid / hypocycloid teeth, the way watch gears are cut.',
    build(x, y){
      const a = add('cycloid', { name: 'Centre wheel', z: 48, px: x, py: y, bore: 4, finish: 'brass', bodyStyle: 'spoked', spokes: 5, spokeW: 3 });
      const b = add('cycloid', { name: 'Third pinion', z: 12, bore: 3, finish: 'steel' });
      const c = add('cycloid', { name: 'Third wheel', z: 45, bore: 4, finish: 'brass', bodyStyle: 'spoked', spokes: 5, spokeW: 3 });
      meshAuto(b, a); ang(b, 25);
      meshAuto(c, b, 'same shaft');
      return [a, b, c];
    } },
  { id: 'ellipse', group: 'Special', name: 'Elliptical gear pair', note: 'Speed pulses each turn. Both ellipses pivot on a focus.',
    build(x, y){
      const a = add('elliptical', { name: 'Ellipse A', z: 36, majorA: 30, ecc: 0.25, px: x, py: y });
      const b = add('elliptical', { name: 'Ellipse B', z: 36, majorA: 30, ecc: 0.25, finish: 'copper' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'spline', group: 'Special', name: 'Spline shaft and hub', note: 'The shaft slides inside the hub and turns it 1:1.',
    build(x, y){
      const s = add('spline', { name: 'Spline shaft', z: 20, thick: 40, px: x, py: y, finish: 'steel' });
      const h = add('splinehub', { name: 'Spline hub', z: 20, thick: 14, rimW: 6, finish: 'brass', opacity: 0.85 });
      meshAuto(h, s);
      return [s, h];
    } }
];

/* one of every kind of pair, laid out on a grid */
GW.Presets.push({ id: 'showcase', group: 'Everything', name: 'One of every kind of pair', note: 'A showroom: every gear type, meshed, laid out on a grid.',
  build(){ const before = G().list.length; GW.Presets.showcase(); return G().list.slice(before); } });
GW.Presets.showcase = function(){
  const items = GW.Presets.filter(p => p.id !== 'showcase');
  const cols = 4, gapX = 190, gapY = 170;
  items.forEach((p, i) => {
    const gx = (i % cols) * gapX - (cols - 1) * gapX / 2, gy = -Math.floor(i / cols) * gapY + gapY;
    p.build(gx, gy);
  });
};
})();
