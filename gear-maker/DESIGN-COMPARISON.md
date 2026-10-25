# Gear Maker vs Shop Tool Sim: design comparison

Checked side by side on 2026-10-25. "Same" means the same tokens, markup pattern and motion; the Gear Maker was built to share the Shop Tool Sim's look, so most of it already matched.

| Area | Shop Tool Sim | Gear Maker | State |
|---|---|---|---|
| Colors, type | graphite `#0d0e10` / `#131416`, one blue accent `#5b93ea`, yellow brackets, Inter + Bebas Neue + Roboto italic | same tokens and fonts (fonts now loaded from the shared `fonts/fonts.css`, the old variable-font file did not exist) | same |
| Top strip, tool bar, brand | portfolio link strip, `[ BRAND ]` bar, ghost pill buttons | same | same |
| Logo block | stacked bracket logo, rule, range line | same, plus release badge and version chip | same |
| Left sidebar sections | each section a colored band: tinted gradient, inset left edge, italic uppercase title with a gradient rule | Samples / Gears / Project and **every sample category** are now bands in their own color with the same title style | fixed (was only the three top-level sections, with plain titles) |
| Sidebar pop-in | every heading, button, tab and slider pops in one at a time | same script (`bubbles.js`) now in both | added to both |
| Release badge | none | **ALPHA TESTING** under the logo | added |
| Release badge | **STABLE RELEASE** under the logo | none | added |
| Version + changelog | `v1.3.30 · What's new` chip, changelog modal | `v0.4.0 · What's new` chip and changelog modal | added |
| Status messages | plain light pill, 0.2 s fade | dark card, icon that pops in, outline that draws itself once, spring rise | the shop sim now uses the Gear Maker's (`toast.css`, `toastfx.js`) |
| Dropdowns | animated list over a hidden real select | native selects | ported (`dropdowns.js`, grouped headings kept) |
| Checkboxes | round, fill grows from the middle, tick draws in | native | ported (`checkbox.css`) |
| Footer | CC0 line, "All rights reserved" | none | added |
| Tooltips | `data-tip` cards | same system | same |
| Sliders | smooth, fill follows the thumb, reset-to-default button and double-click reset | smooth (no notches, rebuilds wait for the last one), fill follows the thumb, double-click resets | double-click added; the small reset button is not copied |
| Camera | eased wheel zoom (log space), damped orbit and pan | orbit, pan and zoom all eased now (`Scene.smooth`) | matched |
| Frame rate | full rate | full 60 fps, light mode only draws smaller | matched |
| Mouse settings cog | rebind rotate / pan / zoom buttons | not present | open |
| Loading screen | tool loading overlay | none (the page is ready at once) | open, not needed |
| Icons | Font Awesome with a hover motion that also plays when a card pops up | inline strokes, no hover motion | open |
