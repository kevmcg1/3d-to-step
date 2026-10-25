"use strict";
/* Gear Maker — the catalog of gear types and every setting each one has.
   The UI panel is generated from PARAMS + TYPES.keys, so adding a setting
   here adds a control there. */
(function(){

/* ---- presets ---- */
const CHAIN = {
  '#25 (6.35 mm)':   { chainPitch: 6.35,   rollerDia: 3.30 },
  '#35 (9.525 mm)':  { chainPitch: 9.525,  rollerDia: 5.08 },
  '#40 / 08A (12.7)':{ chainPitch: 12.7,   rollerDia: 7.92 },
  '#50 / 10A (15.875)':{ chainPitch: 15.875, rollerDia: 10.16 },
  '#60 / 12A (19.05)':{ chainPitch: 19.05,  rollerDia: 11.91 },
  '#80 / 16A (25.4)':{ chainPitch: 25.4,   rollerDia: 15.88 },
  'ISO 06B (9.525)': { chainPitch: 9.525,  rollerDia: 6.35 },
  'ISO 08B (12.7)':  { chainPitch: 12.7,   rollerDia: 8.51 },
  'Bicycle 1/2 x 1/8':{ chainPitch: 12.7,  rollerDia: 7.75 },
  'custom': null
};
const BELT = {
  'GT2 2 mm':  { beltPitch: 2,     pitchLineDiff: 0.254, grooveDepth: 0.75, grooveWidth: 1.15 },
  'GT2 3 mm':  { beltPitch: 3,     pitchLineDiff: 0.381, grooveDepth: 1.14, grooveWidth: 1.7 },
  'HTD 3M':    { beltPitch: 3,     pitchLineDiff: 0.381, grooveDepth: 1.22, grooveWidth: 1.75 },
  'HTD 5M':    { beltPitch: 5,     pitchLineDiff: 0.5715,grooveDepth: 2.06, grooveWidth: 3.0 },
  'MXL 2.032': { beltPitch: 2.032, pitchLineDiff: 0.254, grooveDepth: 0.51, grooveWidth: 1.1 },
  'XL 5.08':   { beltPitch: 5.08,  pitchLineDiff: 0.254, grooveDepth: 1.27, grooveWidth: 2.6 },
  'T2.5':      { beltPitch: 2.5,   pitchLineDiff: 0.3,   grooveDepth: 0.7,  grooveWidth: 1.4 },
  'T5':        { beltPitch: 5,     pitchLineDiff: 0.5,   grooveDepth: 1.2,  grooveWidth: 2.6 },
  'L 3/8"':    { beltPitch: 9.525, pitchLineDiff: 0.381, grooveDepth: 1.9,  grooveWidth: 5.0 },
  'custom': null
};
const FINISH = {
  brass:    { label: 'Brass',        color: '#c9a24b', metal: 0.55, rough: 0.45 },
  steel:    { label: 'Steel',        color: '#9aa4b0', metal: 0.70, rough: 0.38 },
  copper:   { label: 'Copper',       color: '#b96f4a', metal: 0.60, rough: 0.42 },
  aluminum: { label: 'Aluminum',    color: '#c8ced6', metal: 0.75, rough: 0.33 },
  bronze:   { label: 'Bronze',       color: '#8c6a3b', metal: 0.55, rough: 0.50 },
  black:    { label: 'Black oxide',  color: '#3a3f46', metal: 0.50, rough: 0.55 },
  nylon:    { label: 'Nylon white',  color: '#e9e6dc', metal: 0.00, rough: 0.60 },
  pla:      { label: 'PLA orange',   color: '#e8742c', metal: 0.00, rough: 0.50 },
  brassM:   { label: 'Machined brass',     color: '#c9a24b', metal: 0.85, rough: 0.34, surface: 'turned' },
  steelM:   { label: 'Machined steel',     color: '#9aa4b0', metal: 0.90, rough: 0.30, surface: 'turned' },
  aluM:     { label: 'Machined aluminum',  color: '#c8ced6', metal: 0.88, rough: 0.36, surface: 'brushed' },
  plaP:     { label: '3D printed PLA',     color: '#e8742c', metal: 0.00, rough: 0.62, surface: 'layers' },
  petg:     { label: 'PETG blue',    color: '#3b82c4', metal: 0.05, rough: 0.35 },
  custom:   { label: 'Custom color', color: null }
};

/* ---- settings ----
   [label, kind, group, min, max, step, unit/options, hint]
   kind: num | int | sel | bool | color | text                         */
const PARAMS = {
  name:       ['Name', 'text', 'Identity'],
  type:       ['Gear type', 'type', 'Identity'],

  m:          ['Module', 'num', 'Teeth', 0.2, 12, 0.05, 'mm', 'Tooth size. Gears only mesh if their modules match.'],
  z:          ['Teeth', 'int', 'Teeth', 6, 300, 1, '', 'Number of teeth (rack: teeth in the bar).'],
  pa:         ['Pressure angle', 'num', 'Profile', 5, 35, 0.5, '°', 'Common: 14.5°, 20°, 25°. Must match to mesh.'],
  ha:         ['Addendum', 'num', 'Profile', 0.3, 2, 0.05, '× m', 'Tooth height above the pitch circle, in modules.'],
  hf:         ['Dedendum', 'num', 'Profile', 0.5, 2.5, 0.05, '× m', 'Tooth depth below the pitch circle, in modules.'],
  x:          ['Profile shift', 'num', 'Profile', -1, 1.5, 0.05, '× m', 'Positive thickens the tooth root and stops undercut on small gears.'],
  backlash:   ['Backlash', 'num', 'Profile', 0, 1.5, 0.01, 'mm', 'Play between meshing teeth. Each gear is thinned by half of this.'],
  fillet:     ['Root fillet', 'num', 'Profile', 0, 1, 0.05, '', '0 = sharp root, 1 = fully rounded.'],
  helix:      ['Helix angle', 'num', 'Profile', -45, 45, 0.5, '°', 'Tooth lean. + is right hand, − is left hand. Meshing pairs need opposite hands.'],
  spiral:     ['Spiral angle', 'num', 'Profile', -60, 60, 0.5, '°', 'Curve of the teeth across the face. Meshing pairs need opposite signs.'],
  cone:       ['Pitch cone angle', 'num', 'Profile', 3, 87, 0.5, '°', 'Half-angle of the pitch cone. Set automatically from the tooth ratio when meshed.'],
  vgap:       ['Center groove', 'num', 'Profile', 0, 30, 0.5, 'mm', 'Relief groove between the two helical halves.'],

  thick:      ['Face width', 'num', 'Body', 0.5, 150, 0.5, 'mm', 'How wide the gear is along its axis.'],
  bodyStyle:  ['Body style', 'sel', 'Body', null, null, null, ['solid', 'webbed', 'spoked']],
  rimW:       ['Rim width', 'num', 'Body', 0.5, 40, 0.5, 'mm', 'Radial thickness of the rim (webbed / spoked / ring).'],
  webT:       ['Web / spoke thickness', 'num', 'Body', 0.5, 40, 0.5, 'mm', ''],
  webOff:     ['Web offset', 'num', 'Body', -30, 30, 0.5, 'mm', 'Moves the web off the center plane.'],
  spokes:     ['Spokes', 'int', 'Body', 2, 12, 1, '', ''],
  spokeW:     ['Spoke width', 'num', 'Body', 1, 40, 0.5, 'mm', ''],
  holeN:      ['Lightening holes', 'int', 'Body', 0, 24, 1, '', 'Holes through the disc or web (rack: holes along the bar).'],
  holeD:      ['Hole diameter', 'num', 'Body', 1, 80, 0.5, 'mm', ''],
  holePCD:    ['Hole circle Ø', 'num', 'Body', 0, 400, 0.5, 'mm', '0 = automatic.'],
  chamfer:    ['Edge chamfer', 'num', 'Body', 0, 5, 0.1, 'mm', 'Breaks the sharp edge on both faces.'],
  barH:       ['Bar height', 'num', 'Body', 1, 60, 0.5, 'mm', 'Thickness of the rack below the teeth.'],
  faceW:      ['Tooth length (radial)', 'num', 'Body', 2, 100, 0.5, 'mm', 'How far the teeth extend in the radial direction.'],

  bore:       ['Bore Ø', 'num', 'Bore & hub', 0, 120, 0.1, 'mm', '0 = no hole.'],
  keyW:       ['Keyway width', 'num', 'Bore & hub', 0, 30, 0.1, 'mm', '0 = no keyway.'],
  keyD:       ['Keyway depth', 'num', 'Bore & hub', 0, 15, 0.1, 'mm', 'Depth beyond the bore wall.'],
  dFlat:      ['D-flat depth', 'num', 'Bore & hub', 0, 10, 0.1, 'mm', 'Flat cut in the bore (D-shaft). 0 = round.'],
  hubDia:     ['Hub Ø', 'num', 'Bore & hub', 0, 200, 0.5, 'mm', '0 = automatic.'],
  hubUp:      ['Hub length +z', 'num', 'Bore & hub', 0, 80, 0.5, 'mm', 'Hub sticking out of the front face.'],
  hubDown:    ['Hub length −z', 'num', 'Bore & hub', 0, 80, 0.5, 'mm', 'Hub sticking out of the back face.'],

  starts:     ['Thread starts', 'int', 'Worm', 1, 8, 1, '', 'More starts = faster wheel, lower gear ratio.'],
  wormDia:    ['Pitch Ø', 'num', 'Worm', 4, 200, 0.5, 'mm', 'Pitch diameter of the worm. Sets the lead angle.'],
  hand:       ['Hand', 'sel', 'Worm', null, null, null, ['right', 'left']],
  throatR:    ['Throat radius', 'num', 'Worm', 0, 150, 0.5, 'mm', 'Hollow the rim to hug the worm. 0 = plain helical wheel.'],

  chainPreset:['Chain size', 'sel', 'Chain', null, null, null, Object.keys(CHAIN)],
  chainPitch: ['Chain pitch', 'num', 'Chain', 3, 60, 0.005, 'mm', 'Must match the chain (and the other sprocket).'],
  rollerDia:  ['Roller Ø', 'num', 'Chain', 1, 40, 0.01, 'mm', ''],
  tipRelief:  ['Tip relief', 'num', 'Chain', 0, 5, 0.1, 'mm', 'Shaves the tooth tips.'],

  beltPreset: ['Belt profile', 'sel', 'Belt', null, null, null, Object.keys(BELT)],
  beltPitch:  ['Belt pitch', 'num', 'Belt', 1, 30, 0.001, 'mm', ''],
  pitchLineDiff:['Pitch line offset', 'num', 'Belt', 0, 2, 0.001, 'mm', 'Distance from pitch line to outside diameter.'],
  grooveDepth:['Groove depth', 'num', 'Belt', 0.2, 6, 0.01, 'mm', ''],
  grooveWidth:['Groove width', 'num', 'Belt', 0.4, 12, 0.01, 'mm', ''],
  flange:     ['Flanges', 'sel', 'Belt', null, null, null, ['none', 'both', 'front', 'back']],
  flangeD:    ['Flange Ø', 'num', 'Belt', 0, 300, 0.5, 'mm', '0 = automatic.'],
  flangeT:    ['Flange thickness', 'num', 'Belt', 0.5, 10, 0.1, 'mm', ''],

  rollR:      ['Rolling circle radius', 'num', 'Cycloid', 0.5, 80, 0.1, 'mm', 'Generating circle. Must match to mesh.'],

  majorA:     ['Semi-major axis', 'num', 'Ellipse', 5, 200, 0.5, 'mm', 'Pair center distance is twice this.'],
  ecc:        ['Eccentricity', 'num', 'Ellipse', 0, 0.8, 0.01, '', '0 = circle. Higher = more speed variation.'],
  phase:      ['Tooth phase', 'num', 'Ellipse', 0, 1, 0.01, 'pitch', 'Shifts the teeth along the curve.'],

  px:         ['Position X', 'num', 'Placement', -1000, 1000, 0.5, 'mm'],
  py:         ['Position Y', 'num', 'Placement', -1000, 1000, 0.5, 'mm'],
  pz:         ['Position Z', 'num', 'Placement', -1000, 1000, 0.5, 'mm'],
  rx:         ['Tilt about X', 'num', 'Placement', -180, 180, 1, '°'],
  ry:         ['Tilt about Y', 'num', 'Placement', -180, 180, 1, '°'],
  rz:         ['Turn about axis', 'num', 'Placement', -180, 180, 1, '°'],

  rpm:        ['Speed', 'num', 'Motion', -300, 300, 0.5, 'rpm', 'Driving speed (− reverses). Meshed gears follow their parent.'],

  finish:     ['Finish', 'sel', 'Appearance', null, null, null, Object.keys(FINISH)],
  surface:    ['Surface texture', 'sel', 'Appearance', null, null, null, ['smooth', 'turned', 'brushed', 'layers'], 'How the surface looks: smooth, machined with tool marks, brushed, or the layer lines of a 3D print.'],
  color:      ['Color', 'color', 'Appearance'],
  tolerance:  ['Process', 'sel', 'Tolerance', null, null, null, ['ideal', 'machined', 'sla', 'fdm'], 'How the part is made. It sets how much bigger the bore and keyway are cut than the shaft, and the smallest backlash that will run.'],
  tolAdd:     ['Extra fit clearance', 'num', 'Tolerance', 0, 1, 0.01, 'mm', 'Added to the process allowance on the bore diameter and keyway. Use it for a looser or tighter fit.'],
  metal:      ['Metalness', 'num', 'Appearance', 0, 1, 0.05, ''],
  rough:      ['Roughness', 'num', 'Appearance', 0, 1, 0.05, ''],
  opacity:    ['Opacity', 'num', 'Appearance', 0.1, 1, 0.05, ''],
  wire:       ['Wireframe', 'bool', 'Appearance'],
  visible:    ['Visible', 'bool', 'Appearance']
};

/* settings only offered while this gear is hooked to a parent */
const LINK_PARAMS = {
  linkKind:   ['Connection', 'sel', 'Mesh', null, null, null, ['mesh', 'same shaft']],
  meshAngle:  ['Position around partner', 'num', 'Mesh', -180, 180, 1, '°', 'Which side of the partner this gear sits on.'],
  shaftAngle: ['Shaft angle', 'num', 'Mesh', 10, 170, 0.5, '°', 'Angle between the two shafts (bevel gears).'],
  meshOffset: ['Extra center distance', 'num', 'Mesh', -20, 400, 0.1, 'mm', 'Added to the ideal center distance (chain and belt: the span between sprockets).'],
  shaftOffset:['Offset along shaft', 'num', 'Mesh', -200, 200, 0.5, 'mm', 'Slides this gear along the shared shaft or the partner axis.'],
  shaftPhase: ['Rotation phase', 'num', 'Mesh', -180, 180, 1, '°', 'Turns this gear on the shared shaft.']
};

/* ---- type catalog ---- */
const TOOTH = ['m', 'z', 'pa', 'ha', 'hf', 'x', 'backlash', 'fillet'];
const BODY  = ['thick', 'bodyStyle', 'rimW', 'webT', 'webOff', 'spokes', 'spokeW', 'holeN', 'holeD', 'holePCD', 'chamfer',
               'bore', 'keyW', 'keyD', 'dFlat', 'hubDia', 'hubUp', 'hubDown'];
const SOLID = ['thick', 'chamfer', 'bore', 'keyW', 'keyD', 'dFlat', 'hubDia', 'hubUp', 'hubDown', 'holeN', 'holeD', 'holePCD'];

const TYPES = {
  spur:       { label: 'Spur', group: 'Parallel shafts', desc: 'Straight teeth on parallel shafts. The classic.', keys: [...TOOTH, ...BODY] },
  helical:    { label: 'Helical', group: 'Parallel shafts', desc: 'Angled teeth: smoother and quieter, adds axial thrust.', keys: [...TOOTH, 'helix', ...BODY], defaults: { helix: 20 } },
  herring:    { label: 'Herringbone', group: 'Parallel shafts', desc: 'Two opposite helical halves: no axial thrust.', keys: [...TOOTH, 'helix', 'vgap', ...BODY], defaults: { helix: 25, vgap: 2 } },
  internal:   { label: 'Internal / ring', group: 'Parallel shafts', desc: 'Teeth point inward. Used in planetary sets.', keys: [...TOOTH, 'helix', 'thick', 'rimW', 'chamfer'], defaults: { z: 60, rimW: 6, bore: 0 } },
  rack:       { label: 'Rack', group: 'Linear', desc: 'A gear unrolled flat. Turns rotation into travel.', keys: ['m', 'z', 'pa', 'ha', 'hf', 'backlash', 'helix', 'thick', 'barH', 'holeN', 'holeD', 'chamfer'], defaults: { z: 16, thick: 10, barH: 8, helix: 0, rpm: 20 } },
  bevel:      { label: 'Straight bevel', group: 'Crossing shafts', desc: 'Conical gears that turn the drive through an angle.', keys: [...TOOTH, 'cone', ...SOLID], defaults: { thick: 8, z: 20 } },
  spiralbevel:{ label: 'Spiral bevel', group: 'Crossing shafts', desc: 'Curved-tooth bevel: smoother and stronger.', keys: [...TOOTH, 'cone', 'spiral', ...SOLID], defaults: { thick: 8, z: 20, spiral: 30 } },
  crown:      { label: 'Crown / face gear', group: 'Crossing shafts', desc: 'Teeth on the flat face. Mates with a spur pinion at 90°.', keys: ['m', 'z', 'pa', 'ha', 'hf', 'backlash', 'faceW', 'thick', 'bore', 'keyW', 'keyD', 'dFlat'], defaults: { z: 40, thick: 5, faceW: 10, bore: 8 } },
  worm:       { label: 'Worm', group: 'Crossing shafts', desc: 'A screw thread that drives a worm wheel. Big ratios.', keys: ['m', 'pa', 'ha', 'hf', 'backlash', 'starts', 'wormDia', 'hand', 'thick', 'bore', 'keyW', 'keyD', 'dFlat'], defaults: { thick: 40, wormDia: 16, bore: 5, z: 1, starts: 1, hand: 'right' } },
  wormwheel:  { label: 'Worm wheel', group: 'Crossing shafts', desc: 'The big wheel that a worm drives.', keys: [...TOOTH, 'helix', 'throatR', ...BODY], defaults: { z: 30, thick: 8, helix: 5.71, throatR: 0 } },
  sprocket:   { label: 'Chain sprocket', group: 'Flexible drives', desc: 'Roller-chain sprocket. Pair it for a chain drive.', keys: ['z', 'chainPreset', 'chainPitch', 'rollerDia', 'tipRelief', ...BODY], defaults: { z: 18, thick: 5, bore: 8 } },
  pulley:     { label: 'Timing pulley', group: 'Flexible drives', desc: 'Toothed belt pulley (GT2, HTD, XL...) with optional flanges.', keys: ['z', 'beltPreset', 'beltPitch', 'pitchLineDiff', 'grooveDepth', 'grooveWidth', 'flange', 'flangeD', 'flangeT', ...BODY], defaults: { z: 20, thick: 8, bore: 5, hubDia: 10, hubUp: 6, flange: 'both' } },
  cycloid:    { label: 'Cycloidal (clock)', group: 'Special profiles', desc: 'Clock and watch gearing with epi/hypocycloid teeth.', keys: ['m', 'z', 'ha', 'hf', 'backlash', 'rollR', ...BODY], defaults: { m: 1.5, z: 30, ha: 1, hf: 1.25, rollR: 4.5, thick: 3, bore: 4 } },
  elliptical: { label: 'Elliptical', group: 'Special profiles', desc: 'Non-circular pair: speed pulses as it turns.', keys: ['z', 'majorA', 'ecc', 'pa', 'ha', 'hf', 'backlash', 'phase', ...BODY], defaults: { z: 36, majorA: 30, ecc: 0.25, ha: 0.8, hf: 1, backlash: 0.35, phase: 0, bore: 5, thick: 6 } },
  spline:     { label: 'Spline shaft', group: 'Special profiles', desc: 'Involute spline, slides into a spline hub.', keys: [...TOOTH, 'thick', 'bore', 'chamfer'], defaults: { m: 1.5, z: 20, pa: 30, ha: 0.5, hf: 0.75, x: 0, fillet: 0.5, thick: 25, bore: 0, backlash: 0.05 } },
  splinehub:  { label: 'Spline hub', group: 'Special profiles', desc: 'Internal spline that a spline shaft slides into.', keys: [...TOOTH, 'thick', 'rimW', 'chamfer'], defaults: { m: 1.5, z: 20, pa: 30, ha: 0.5, hf: 0.75, x: 0, fillet: 0.5, thick: 12, rimW: 5, backlash: 0.05 } }
};

const SHORT = { spur: 'Spur', helical: 'Helical', herring: 'Herringbone', internal: 'Ring', rack: 'Rack', bevel: 'Bevel', spiralbevel: 'Spiral bevel',
  crown: 'Crown', worm: 'Worm', wormwheel: 'Wheel', sprocket: 'Sprocket', pulley: 'Pulley', cycloid: 'Cycloid', elliptical: 'Ellipse', spline: 'Spline', splinehub: 'Hub' };
Object.keys(TYPES).forEach(k => { TYPES[k].short = SHORT[k]; });

/* global defaults every gear starts from */
const BASE = {
  name: '', type: 'spur',
  m: 2, z: 20, pa: 20, ha: 1, hf: 1.25, x: 0, backlash: 0.1, fillet: 0.3,
  helix: 0, spiral: 30, cone: 45, vgap: 0,
  thick: 8, bodyStyle: 'solid', rimW: 4, webT: 3, webOff: 0, spokes: 5, spokeW: 5,
  holeN: 0, holeD: 6, holePCD: 0, chamfer: 0, barH: 8, faceW: 10,
  bore: 6, keyW: 0, keyD: 0, dFlat: 0, hubDia: 0, hubUp: 0, hubDown: 0,
  starts: 1, wormDia: 16, hand: 'right', throatR: 0,
  chainPreset: '#40 / 08A (12.7)', chainPitch: 12.7, rollerDia: 7.92, tipRelief: 0,
  beltPreset: 'GT2 2 mm', beltPitch: 2, pitchLineDiff: 0.254, grooveDepth: 0.75, grooveWidth: 1.15,
  flange: 'none', flangeD: 0, flangeT: 1.2,
  rollR: 6, majorA: 25, ecc: 0.3, phase: 0,
  px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0,
  rpm: 12,
  tolerance: 'machined', tolAdd: 0, finish: 'brass', surface: 'smooth', color: '#c9a24b', metal: 0.55, rough: 0.45, opacity: 1, wire: false, visible: true,
  parentId: null, linkKind: 'mesh', meshAngle: 0, shaftAngle: 90, meshOffset: 0, shaftOffset: 0, shaftPhase: 0
};

/* Always-available (not type specific) */
const ALWAYS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'rpm', 'tolerance', 'tolAdd', 'finish', 'surface', 'color', 'metal', 'rough', 'opacity', 'wire', 'visible'];

const GROUP_ORDER = ['Identity', 'Teeth', 'Profile', 'Body', 'Bore & hub', 'Tolerance', 'Worm', 'Chain', 'Belt', 'Cycloid', 'Ellipse', 'Mesh', 'Placement', 'Motion', 'Appearance'];

GW.Types = {
  TYPES, PARAMS, LINK_PARAMS, BASE, ALWAYS, GROUP_ORDER, CHAIN, BELT, FINISH,
  /* Switch a gear to another type, keeping what both types share and
     seeding the settings the new type has but the old one did not. */
  convert(g, nt){
    const oldT = TYPES[g.type], newT = TYPES[nt];
    if(!newT || g.type === nt) return Object.assign({}, g);
    const d = GW.Types.defaults(nt), out = Object.assign({}, g, { type: nt });
    newT.keys.forEach(k => { if(!oldT || oldT.keys.indexOf(k) < 0) out[k] = d[k]; });
    if(nt === 'worm') out.z = 1;
    if(nt === 'rack' && !oldT.keys.includes('barH')) out.barH = d.barH;
    if(g.type === 'worm' && nt !== 'worm') out.z = d.z;
    return out;
  },
  /* slider range of a setting for a given type (a rack, for one, can have just a couple of teeth) */
  range(type, key){
    const d = PARAMS[key] || LINK_PARAMS[key];
    if(key === 'z' && type === 'rack') return [2, 80];
    return [d[3], d[4]];
  },
  has(type, key){ const t = TYPES[type]; return !!t && (t.keys.indexOf(key) >= 0 || ALWAYS.indexOf(key) >= 0); },
  /* a fresh settings object for a type */
  defaults(type){
    const d = Object.assign({}, BASE, (TYPES[type] || {}).defaults || {}, { type });
    d.metal = FINISH[d.finish].metal; d.rough = FINISH[d.finish].rough; d.color = FINISH[d.finish].color;
    if(type === 'sprocket') Object.assign(d, CHAIN[d.chainPreset]);
    if(type === 'pulley') Object.assign(d, BELT[d.beltPreset]);
    if(type === 'worm') d.z = 1;
    return d;
  }
};
})();
