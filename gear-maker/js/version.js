// The version of Gear Maker and what changed in each one, read by changelog.js (the chip under the logo and the What's new list).
// To release: add an entry to the top of `changelog`, set `version` to match, and raise the ?v=N on this file's <script> tag in index.html.
// Keep ONE entry per day, and each entry to ONE short, simple sentence: if today already has an entry, add to its sentence instead of a new entry.
window.__GM = {
  version: '0.4.0',
  changelog: [
    { v: '0.4.0', date: '2026-10-25', title: 'Blueprints, wizards and tools', items: ['Added blueprint sheets, gear wizards, measuring and set origin, move / rotate / scale handles, roles, a which-gear spotlight, search for settings, and smoother movement everywhere.'] },
    { v: '0.3.0', date: '2026-10-24', title: 'Inches, honest status and tolerances', items: ['Inches come first, mesh status is checked on the real shapes, and materials, tolerances, labels and a light mode were added.'] },
    { v: '0.2.0', date: '2026-10-24', title: 'Renamed to Gear Maker', items: ['Gearworks became Gear Maker with undo and redo, a view toolbar, sample explanations, previews and a phone layout.'] },
    { v: '0.1.0', date: '2026-10-24', title: 'First release', items: ['A 3D gear designer with 16 gear types and STL, OBJ and STEP export.'] }
  ]
};
