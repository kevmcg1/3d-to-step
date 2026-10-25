# Gear Maker

A 3D gear designer that runs in the browser. Build almost any kind of engineering gear, click it to change every setting, find out whether two gears can mesh (and exactly what each needs from the other), watch them turn, and export **STL, OBJ or STEP**.

No build step and no backend. It lives at `/gear-maker/` next to the STEP converter: serve the repo root with any static server and open `/gear-maker/`.

```
python3 -m http.server 8080      # then open http://localhost:8080/gear-maker/
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

Modeled on the Shop Tool Sim:

- **Left sidebar**: a *How do I use it?* guided tour, 17 **samples**, the list of gears and the project buttons. Click a sample to load it straight away (the **+** beside it builds it next to what is there, **?** opens a plain-English explanation of what is happening). Point at a sample or a gear type in the Add dialog to see a small turning preview of it first (a normal solid model, not a hologram).
- **3D view**: the toolbar at the top has **undo / redo** (`Ctrl+Z`, `Ctrl+Y` or `Ctrl+Shift+Z`), pause and speed, the pitch circles and the mesh quality; the buttons on the right change the camera and fade the floor grid (`G`). Status messages show an icon and an outline that draws itself once.
- **Right sidebar**: every property of the selected gear, all live (coarse draft meshes while you drag, full quality on release).
- **Bottom strip**: whether the selected gear meshes, exactly what it needs, and its speed, ratio, center distance and contact ratio.
- **Phones and small laptops**: the sidebars become drawers, the toolbar shrinks, and the bottom strip starts folded on a phone. A rack and pinion moves back and forth within the rack's length.

## Also in the box

- **Inches first.** Every length is shown in inches with the metric value in parentheses (`1.772 in (45 mm)`), in the boxes, the feedback strip, messages and exports info. The **IN / MM** button in the toolbar flips it, and typing works in whichever unit is showing. Everything inside stays in millimeters.
- **Orthographic camera**, so parallel lines stay parallel and sizes read true. The fit (and the Isometric, Top and Front buttons) goes as close as it can without cutting anything off or hiding it behind the toolbar or the strip, and keeps following when the strip changes height until you move the camera yourself.
- **Labels** on every gear say which is the **driver** and which is **driven** (or on the same shaft); a toolbar button hides them.
- **Colors**: every gear in a sample gets its own color.
- **Materials**: machined brass, steel and aluminum (turned or brushed tool marks) and 3D printed PLA (layer lines), plus a separate *Surface texture* setting.
- **Tolerances**: each gear has a process (ideal, CNC machined, resin print, filament print). The process opens the bore and keyway by its allowance and sets the smallest backlash that will run; *Set best-fit tolerances for everything* applies it to every gear on the table.
- **When a gear stops fitting**: the strip offers *Change other gears to match* (changes the gears around it, leaves the edited one alone, then shows exactly what changed, with an Undo) and *Explain why* (what clashes, why it matters, and every option: change the other gear, change this one, un-mesh, or pick another partner type, each with a table of changes and an Apply button). Nothing changes until you press one.
- **Honest status**: after the rules say a pair fits, the real shapes are tested for overlap while turning, and gears pulled apart with extra center distance are reported.
- **Fast on small laptops**: light mode is chosen from the hardware (few cores, little memory, phone, software rendering) or switches itself on when frames are slow. It turns off antialiasing and draws at one pixel per pixel, but never drops below the screen's full frame rate (60 frames a second on a 60 Hz screen), and the view does not redraw at all while nothing moves.

## Every setting is editable

Click a gear in the 3D view (or the Gears tab). The Edit tab lists every setting for that type, each with a slider and an exact number box:

* **Teeth / profile**: module, tooth count, pressure angle, addendum, dedendum, profile shift, backlash, root fillet, helix or spiral angle, cone angle, center groove
* **Body**: face width, solid / webbed / spoked, rim width, web thickness and offset, spokes, lightening holes, edge chamfer
* **Bore & hub**: bore, keyway, D-flat, hub diameter and length either side
* **Type-specific**: worm starts, hand and pitch diameter, wheel throat; chain size, roller diameter; belt profile, groove shape, flanges; cycloid rolling circle; ellipse axis, eccentricity, tooth phase
* **Placement, speed, finish**: position and tilt of free gears, rpm, material finish, color, metalness, opacity, wireframe

## Will they mesh?

Pick a partner on the Mesh tab. The report lists each problem with the exact value that fixes it, and offers **fix this gear**, **fix the partner**, **mesh anyway**, or **add a matching gear** (a new gear already set up to fit). It checks:

* tooth size (module), pressure angle, helix / spiral hand and angle, bevel cone angles from the tooth ratio and shaft angle
* ring and pinion size limits, worm lead angle = wheel helix, chain pitch and roller, belt pitch and profile, cycloid rolling circle, ellipse axes and tooth phase, spline teeth
* tip clearance, contact ratio, undercut, backlash, center distance, ratio, chain and belt length

Meshed gears are placed at the right center distance and phased so teeth fall into gaps at every angle. A link that stops being compatible after an edit stays in place and turns red.

## Export

STL (binary or ASCII), OBJ and STEP. Export the selected gear, its whole assembly, or everything, either as assembled or laid out flat for printing, optionally as one file per gear in a zip. Units are millimeters, Z up.

STEP files are true boundary representations: flat regions (caps, straight tooth flanks) become single planar faces and curved surfaces become small flat facets. They import as solids in FreeCAD / OpenCascade, and were checked there for validity, self-intersection and volume. Gears with hubs, webs or flanges export as a few overlapping solids that you union in your CAD tool (slicers do this for you with STL).

## Tests

```
npm test            # geometry, compatibility, presets, exports
node tests/fuzz.js  # thousands of random settings, every gear type
```

Checks that every gear type (and many setting combinations) builds a closed mesh, the compatibility rules, that every preset meshes without overlapping while turning, and the export formats.

## Dev tool: the automatic tester

Press the backtick key (`` ` ``) to open it, or add `?dev=quick` (also `standard`, `thorough`, `problems`, `free`) to the address and it starts by itself.

It drives the real controls on its own and checks, as it goes: errors, closed meshes, teeth that really interleave (sampled overlap while turning), auto-fix producing compatible pairs, the bottom strip agreeing with the model, every control showing the true value and every setting having a control, STL / OBJ / STEP / zip output, saved projects that read back, leaked geometry, blank views, clipped controls, contrast and slow frames, plus the newer features (inches and millimeters, the orthographic fit, labels, materials, tolerances, match / explain, undo and redo, idle drawing): undo and redo (buttons and keys), sample explanations, the preview card, status-card icons, American spelling, the toolbar placement, the rack's back-and-forth travel, and the layout at laptop, tablet and phone sizes. The report lists what broke with a seed, the last actions (the recipe) and a guess at the cause. **Aim at problems** replays what broke before and shrinks each failure to its shortest recipe.

## How it is organized

`js/profiles.js` tooth outlines · `js/builders.js` 3D geometry · `js/compat.js` meshing rules · `js/mount.js` placement and kinematics · `js/gears.js` state · `js/exporters.js` + `js/brep.js` file formats · `js/ui.js` panel. Three.js r128 comes from this repo's `vendor/` folder.

## Honest limits

Bevel, spiral bevel, crown, worm and elliptical teeth are visual approximations of the true conjugate profiles. They interleave correctly (tests measure well under 1.5% volume overlap) but are not tooth-strength-grade. Elliptical pairs need generous backlash. This is a design and visualization tool, not load analysis.

MIT licensed.
