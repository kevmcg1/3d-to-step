"use strict";
/* Gear Maker — ready-made assemblies. Each one is built the same way you would by hand:
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
  { id: 'train', group: 'Basics', name: 'Gear train (3 spur gears)', note: 'The middle gear is an idler: it reverses nothing overall.', why: "Gear A turns gear B, and B turns gear C. Each time two gears touch, the direction flips, so A and C end up spinning the same way. The middle gear is just a go-between (an idler): it changes direction twice, so it changes nothing overall. Only the first and last gears decide the speed: 16 teeth driving 20 teeth means the last gear turns a bit slower.",
    build(x, y){
      const a = add('spur', { name: 'Driver', z: 16, px: x, py: y, bore: 6 });
      const b = add('spur', { name: 'Idler', z: 32, bore: 8 });
      const c = add('spur', { name: 'Driven', z: 20, bore: 6 });
      meshAuto(b, a); ang(b, 20); meshAuto(c, b); ang(c, -35);
      return [a, b, c];
    } },
  { id: 'compound', group: 'Basics', name: 'Compound reduction (12:36 → 12:36)', note: 'Two gears share a shaft. 9:1 overall.', why: "One pair of gears can only slow things down so much. Here two pairs are chained: the big gear and the small gear in the middle sit on the same shaft, so they turn together. The first pair slows the speed to a third, the second pair slows it to a third again, so the output turns 9 times slower but with 9 times more pulling force.",
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
  { id: 'rack', group: 'Basics', name: 'Rack and pinion', note: 'The pinion turns; the rack slides back and forth, one pitch per tooth.', why: "A rack is a gear that has been rolled out flat. When the round pinion turns, its teeth push the flat rack sideways, so spinning motion becomes straight-line motion. This is how a steering rack or a sliding door opener works. One tooth of spin moves the rack one tooth-width.",
    build(x, y){
      const p = add('spur', { name: 'Pinion', z: 18, px: x, py: y, bore: 8, keyW: 2.5, keyD: 1.2, hubDia: 18, hubUp: 5 });
      const r = add('rack', { name: 'Rack', z: 14, thick: 12 });
      meshAuto(r, p); ang(r, -90);
      return [p, r];
    } },
  { id: 'helical', group: 'Smooth & strong', name: 'Helical pair', note: 'Opposite hands, so they mesh smoothly.', why: "The teeth here are slanted like a screw thread, so they touch gradually from one end to the other instead of all at once. That makes them much quieter and smoother than straight teeth. The slants must lean opposite ways (one left-handed, one right-handed) or they will not fit together. The slant also pushes the gears sideways a little.",
    build(x, y){
      const a = add('helical', { name: 'Helical A', z: 20, helix: 20, thick: 14, px: x, py: y, finish: 'steel' });
      const b = add('helical', { name: 'Helical B', z: 28, thick: 14, finish: 'steel' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'herring', group: 'Smooth & strong', name: 'Herringbone pair', note: 'Two opposing helical halves cancel the axial thrust.', why: "This is two helical gears joined back-to-back in a V shape. Each half pushes sideways, but the other half pushes the opposite way, so the sideways push cancels out. You get the smoothness of helical teeth without the sideways force. Big machines and old ship engines use these.",
    build(x, y){
      const a = add('herring', { name: 'Herringbone A', z: 20, helix: 25, thick: 18, vgap: 2, px: x, py: y, finish: 'bronze' });
      const b = add('herring', { name: 'Herringbone B', z: 30, thick: 18, vgap: 2, finish: 'bronze' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'planetary', group: 'Smooth & strong', name: 'Planetary set (carrier fixed)', note: 'Sun drives three planets inside a ring. 18 + 54 ÷ 3 teeth fit evenly.', why: "Picture the solar system: the sun gear in the middle drives three planet gears, and they all roll around inside a big ring gear with teeth on its inside. Here the ring is held still, so the planets are forced to walk around it. It packs a big speed change into a small, strong, balanced package, which is why automatic gearboxes use it.",
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
  { id: 'bevel', group: 'Crossing shafts', name: 'Bevel pair (90°)', note: 'Cone angles are worked out from the tooth ratio.', why: "Bevel gears are cone-shaped so that two shafts can meet at an angle, here a right angle. They turn a corner. Think of the gears under a hand drill: you turn the handle sideways and the chuck spins forward. The tooth counts decide the speed change, and the cone angles are worked out from them.",
    build(x, y){
      const a = add('bevel', { name: 'Bevel A', z: 20, thick: 9, px: x, py: y });
      const b = add('bevel', { name: 'Bevel B', z: 30, thick: 9 });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'trio', group: 'Crossing shafts', name: 'Bevel trio (differential-style)', note: 'One bevel gear drives two others from opposite sides.', why: "One bevel gear drives two others from opposite sides. They turn in opposite directions, but each one is free to speed up or slow down. This is the idea behind a car differential, which lets the two wheels turn at different speeds when you go around a corner.",
    build(x, y){
      const a = add('bevel', { name: 'Input bevel', z: 20, thick: 9, px: x, py: y });
      const b = add('bevel', { name: 'Left bevel', z: 20, thick: 9 });
      const c = add('bevel', { name: 'Right bevel', z: 20, thick: 9 });
      meshAuto(b, a); ang(b, 0); meshAuto(c, a); ang(c, 180);
      return [a, b, c];
    } },
  { id: 'spiral', group: 'Crossing shafts', name: 'Spiral bevel pair', note: 'Curved teeth with opposite spiral angles.', why: "Straight bevel teeth hit all at once and make noise. Spiral bevel teeth are curved like a bent claw, so they roll into contact gradually. They are quieter and stronger, and are used in car rear axles. The two curves must spiral opposite ways to fit.",
    build(x, y){
      const a = add('spiralbevel', { name: 'Spiral A', z: 22, thick: 9, px: x, py: y, finish: 'steel' });
      const b = add('spiralbevel', { name: 'Spiral B', z: 22, thick: 9, finish: 'steel' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'crown', group: 'Crossing shafts', name: 'Crown gear and pinion', note: 'A spur pinion drives teeth cut into the face of a crown gear.', why: "A crown gear has its teeth standing up from a flat face, like the points of a crown. An ordinary straight gear (the pinion) meshes with it from the side, so the shafts cross at a right angle. It is a simple way to turn a corner when the speed does not have to be exact.",
    build(x, y){
      const c = add('crown', { name: 'Crown', z: 40, px: x, py: y, thick: 6, faceW: 10, bore: 10 });
      const p = add('spur', { name: 'Pinion', z: 14, thick: 12, bore: 5 });
      meshAuto(p, c);
      return [c, p];
    } },
  { id: 'worm', group: 'Crossing shafts', name: 'Worm drive', note: 'One turn of the worm advances the wheel by one tooth (per start).', why: "A worm is a gear shaped like a screw. Every full turn of the worm pushes the wheel forward by just one tooth, so the wheel turns very slowly but with great force. Try turning the wheel by hand and it will not move the worm: that self-locking is why worm drives are used in guitar tuners and lifts.",
    build(x, y){
      const w = add('worm', { name: 'Worm', m: 2, starts: 2, wormDia: 20, thick: 44, px: x, py: y, bore: 6, finish: 'steel' });
      const h = add('wormwheel', { name: 'Worm wheel', z: 30, thick: 12, throatR: 12, bore: 10, hubDia: 20, hubUp: 4, finish: 'bronze' });
      meshAuto(h, w);
      return [w, h];
    } },
  { id: 'chain', group: 'Belts & chains', name: 'Chain drive', note: '#40 roller chain over two sprockets.', why: "The chain links wrap around the sprockets (toothed wheels) and carry the motion from one to the other, the way a bicycle does. The sprockets turn the same way. The sprocket with fewer teeth spins faster, and the pitch of the chain must match the teeth or it will skip.",
    build(x, y){
      const a = add('sprocket', { name: 'Drive sprocket', z: 17, px: x, py: y });
      const b = add('sprocket', { name: 'Driven sprocket', z: 34, thick: 5 });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'belt', group: 'Belts & chains', name: 'Timing-belt drive', note: 'GT2 pulleys with flanges and a toothed belt.', why: "A toothed belt does the same job as a chain but it is quiet and needs no oil. The belt teeth fit the pulley grooves so it cannot slip, which is why 3D printers and cameras use it. Little flanges on the sides keep the belt from wandering off.",
    build(x, y){
      const a = add('pulley', { name: 'Motor pulley', z: 20, px: x, py: y, finish: 'aluminum' });
      const b = add('pulley', { name: 'Driven pulley', z: 40, finish: 'aluminum' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'clock', group: 'Special', name: 'Clock train (cycloidal)', note: 'Epicycloid / hypocycloid teeth, the way watch gears are cut.', why: "Clock gears use a different tooth shape from ordinary gears, made from rolling circles (cycloid curves). The teeth roll against each other with very little rubbing, so they last long and waste almost no energy, which matters in a watch with a tiny spring. Each stage steps the speed down until the last wheel turns once per hour.",
    build(x, y){
      const a = add('cycloid', { name: 'Center wheel', z: 48, px: x, py: y, bore: 4, finish: 'brass', bodyStyle: 'spoked', spokes: 5, spokeW: 3 });
      const b = add('cycloid', { name: 'Third pinion', z: 12, bore: 3, finish: 'steel' });
      const c = add('cycloid', { name: 'Third wheel', z: 45, bore: 4, finish: 'brass', bodyStyle: 'spoked', spokes: 5, spokeW: 3 });
      meshAuto(b, a); ang(b, 25);
      meshAuto(c, b, 'same shaft');
      return [a, b, c];
    } },
  { id: 'ellipse', group: 'Special', name: 'Elliptical gear pair', note: 'Speed pulses each turn. Both ellipses pivot on a focus.', why: "These gears are oval instead of round. When the narrow part of one meets the wide part of the other, the second gear speeds up, then slows again as they turn. So a steady input gives a pulsing output, once per turn. It is used for machines that need a quick return stroke, like some presses and pumps.",
    build(x, y){
      const a = add('elliptical', { name: 'Ellipse A', z: 36, majorA: 30, ecc: 0.25, px: x, py: y });
      const b = add('elliptical', { name: 'Ellipse B', z: 36, majorA: 30, ecc: 0.25, finish: 'copper' });
      meshAuto(b, a);
      return [a, b];
    } },
  { id: 'spline', group: 'Special', name: 'Spline shaft and hub', note: 'The shaft slides inside the hub and turns it 1:1.', why: "A spline is a row of long teeth along a shaft that fit into matching grooves in a hub. The hub is forced to turn with the shaft, but it can still slide along it. That is how a car's drive shaft passes power through while still moving up and down with the suspension.",
    build(x, y){
      const s = add('spline', { name: 'Spline shaft', z: 20, thick: 40, px: x, py: y, finish: 'steel' });
      const h = add('splinehub', { name: 'Spline hub', z: 20, thick: 14, rimW: 6, finish: 'brass', opacity: 0.85 });
      meshAuto(h, s);
      return [s, h];
    } }
];

/* one of every kind of pair, laid out on a grid */
GW.Presets.push({ id: 'showcase', group: 'Everything', name: 'One of every kind of pair', note: 'A showroom: every gear type, meshed, laid out on a grid.', why: "This is a showroom with one working example of every kind of gear, each pair already meshed and spinning. It is big, so give it a moment to build. Click any gear to see its settings, or point at a pair to see what it needs from its partner in the strip along the bottom.",
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
