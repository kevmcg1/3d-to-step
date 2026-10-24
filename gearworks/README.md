# Gearworks

A 3D gear lab that runs in the browser. Build almost any kind of engineering gear, click it to change every setting, find out whether two gears can mesh (and exactly what each needs from the other), watch them turn, and export **STL, OBJ or STEP**.

No build step and no backend. It lives at `/gearworks/` next to the STEP converter: serve the repo root with any static server and open `/gearworks/`.

```
python3 -m http.server 8080      # then open http://localhost:8080/gearworks/
```

## Gear types (16)

| Group | Types |
|---|---|
| Parallel shafts | Spur · Helical · Herringbone · Internal / ring |
| Linear | Rack (straight or helical) |
| Crossing shafts | Straight bevel · Spiral bevel · Crown / face gear · Worm · Worm wheel (throated) |
| Flexible drives | Roller-chain sprocket (with chain) · Timing pulley (with belt) |
| Special profiles | Cycloidal (clock) · Elliptical · Spline shaft · Spline hub |

Gears can also be keyed to the same shaft (compound gears), and 15 ready-made assemblies are included: gear train, compound reduction, rack and pinion, helical / herringbone pairs, planetary set, bevel pairs, crown gear, worm drive, chain and belt drives, clock train, elliptical pair, spline coupling.

## The interface

Modelled on the Shop Tool Sim: **left sidebar** with a *How do I use it?* guided tour, 16 loadable **samples**, the list of gears, playback and view; the **3D stage** in the middle; **every property of the selected gear on the right**, all live (coarse draft meshes while you drag, full quality on release); and a **feedback strip along the bottom** that says whether the selected gear meshes, exactly what it needs, and its speed, ratio, centre distance and contact ratio.

## Every setting is editable

Click a gear in the 3D view (or the Gears tab). The Edit tab lists every setting for that type, each with a slider and an exact number box:

* **Teeth / profile**: module, tooth count, pressure angle, addendum, dedendum, profile shift, backlash, root fillet, helix or spiral angle, cone angle, centre groove
* **Body**: face width, solid / webbed / spoked, rim width, web thickness and offset, spokes, lightening holes, edge chamfer
* **Bore & hub**: bore, keyway, D-flat, hub diameter and length either side
* **Type-specific**: worm starts, hand and pitch diameter, wheel throat; chain size, roller diameter; belt profile, groove shape, flanges; cycloid rolling circle; ellipse axis, eccentricity, tooth phase
* **Placement, speed, finish**: position and tilt of free gears, rpm, material finish, colour, metalness, opacity, wireframe

## Will they mesh?

Pick a partner on the Mesh tab. The report lists each problem with the exact value that fixes it, and offers **fix this gear**, **fix the partner**, **mesh anyway**, or **add a matching gear** (a new gear already set up to fit). It checks:

* tooth size (module), pressure angle, helix / spiral hand and angle, bevel cone angles from the tooth ratio and shaft angle
* ring and pinion size limits, worm lead angle = wheel helix, chain pitch and roller, belt pitch and profile, cycloid rolling circle, ellipse axes and tooth phase, spline teeth
* tip clearance, contact ratio, undercut, backlash, centre distance, ratio, chain and belt length

Meshed gears are placed at the right centre distance and phased so teeth fall into gaps at every angle. A link that stops being compatible after an edit stays in place and turns red.

## Export

STL (binary or ASCII), OBJ and STEP. Export the selected gear, its whole assembly, or everything, either as assembled or laid out flat for printing, optionally as one file per gear in a zip. Units are millimetres, Z up.

STEP files are true boundary representations: flat regions (caps, straight tooth flanks) become single planar faces and curved surfaces become small flat facets. They import as solids in FreeCAD / OpenCascade, and were checked there for validity, self-intersection and volume. Gears with hubs, webs or flanges export as a few overlapping solids that you union in your CAD tool (slicers do this for you with STL).

## Tests

```
npm test            # geometry, compatibility, presets, exports
node tests/fuzz.js  # thousands of random settings, every gear type
```

Checks that every gear type (and many setting combinations) builds a closed mesh, the compatibility rules, that every preset meshes without overlapping while turning, and the export formats.

## How it is organised

`js/profiles.js` tooth outlines · `js/builders.js` 3D geometry · `js/compat.js` meshing rules · `js/mount.js` placement and kinematics · `js/gears.js` state · `js/exporters.js` + `js/brep.js` file formats · `js/ui.js` panel. Three.js r128 comes from this repo's `vendor/` folder.

## Honest limits

Bevel, spiral bevel, crown, worm and elliptical teeth are visual approximations of the true conjugate profiles. They interleave correctly (tests measure well under 1.5% volume overlap) but are not tooth-strength-grade. Elliptical pairs need generous backlash. This is a design and visualisation tool, not load analysis.

MIT licensed.
