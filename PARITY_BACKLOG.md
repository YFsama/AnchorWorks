# Parity backlog — Adobe Illustrator + SignMaster

Living worklist driving the `/loop` improvement cadence. Each loop iteration:
picks the **top unchecked `[ ]` item**, verifies the gap in code (grep first),
implements one surgical production-quality change (full en/zh i18n), keeps
`tsc + eslint + vitest + vite build` all green, commits to `main`, then checks
the item off here with a one-line note. One item per run. No tagging/release —
that stays the user's call.

Legend: `[ ]` todo · `[~]` partial/in-progress · `[x]` done (note where).

## Already implemented (reference — do NOT redo)
Tools (pen/pencil/rect/ellipse/line/polygon/text/eraser/hand/zoom/select/
direct-select); boolean union/subtract/intersect/exclude; offset/cut contour;
compound paths; clipping masks; align/distribute; repeat grid/radial/mirror;
group/ungroup; z-order; gradients (linear/radial); pattern fill; swatches;
eyedropper; opacity; blend modes; drop shadow; raster filters; stroke align
(center/inside/outside); text tool + text-on-path + font picker + custom fonts;
artboards; paper-size presets (A3–A6/Letter/Legal/Tabloid/cards/stickers/
screen); document settings; print + print-prep (crop/reg/bleed) + **print
preview**; PDF/SVG/DXF/PNG/JPG/JSON in-out; cut contour/bitmap trace/reg marks/
**weed border+grid**/**cut-by-colour**/**HTV mirror**/**cut-order optimise**/
**overcut**/**material presets**/**test cut**/**job estimate**; HPGL+G-code
export w/ dialects; PLT import; plotter preview (incl. canvas geometry);
right-click menu (cut/copy/paste/paste-here/duplicate/delete/group/flip/
edit-text/**one-click create contour**/select-all); command palette; keymap +
customizer; status bar + **version chip**; layers/properties/align/symbols/
artboards/character/inspect/debug panels; preferences; help; onboarding;
i18n en/zh; themes; toasts; undo/redo; autosave.

---

## P0 — sign-making essentials (cut/print correctness)

- [x] **Weld / Merge for cut** — `weldOutline()` in contourFromSelection.ts
      (polygon-clipping union of selection outlines → cut paths); wired into the
      right-click menu + command palette ("Weld"). 2026-06-02.
- [ ] **Convert Text to Outlines** — vectorise IText/Textbox to a Path (per-glyph
      via the font's path data), so text can be contour-cut and ships in SVG/PLT
      without the font. (Illustrator: Type→Create Outlines.) NOTE: needs font
      vectorisation (opentype.js + font bytes) — heavier, schedule a careful run.
- [ ] **Outline Stroke** — convert a stroked path into a filled outline path of
      the stroke width (so the cutter cuts both edges). (Illustrator: Object→Path
      →Outline Stroke.) Reuse offsetPolyline for ± half-width; mind caps/joins.
- [ ] **Tiling / paneling for cut & print** — split an oversized job into panels
      sized to the material width with an overlap, numbered, previewable. Extend
      io3 tilePrint into a cut-aware paneling dialog.

## P1 — sign text effects & layout

- [ ] **Text on Arc / circle** — circular baseline (top & bottom arcs) for
      badge/seal text, not just linear path sampling. Extend textPath.ts.
- [ ] **Multi-outline (contour text effect)** — N stacked offset outlines around
      text/shape with per-ring colour & width (classic sign look). New effect.
- [ ] **Letter spacing (tracking) + line height (leading)** controls in the
      Character panel (charSpacing / lineHeight on IText).
- [ ] **Align to key object / align to artboard** — alignment reference selector
      (selection bbox vs last-clicked object vs artboard) in the Align panel.

## P1 — path & transform tooling (Illustrator parity)

- [ ] **Simplify Path** — user-facing Douglas-Peucker simplify with a tolerance
      slider (reuse douglasPeucker from cutContour). Object→Path→Simplify.
- [ ] **Flip Horizontal / Vertical** as first-class Object commands (menu +
      shortcut + Transform panel), not just the right-click entry.
- [ ] **Transform dialog** — rotate / scale (by % or absolute) / move by exact
      numeric values, with "copy" option. (Illustrator: Object→Transform.)
- [ ] **Join paths** — connect two open-path endpoints into one path
      (Illustrator: Ctrl+J).

## P2 — workflow convenience & SignMaster extras

- [ ] **Cut-order visualisation** — number badges + start arrows overlaid on the
      cut preview (and optionally canvas) so the operator sees travel order.
- [ ] **User guides from rulers** — drag from the ruler to drop snap guides;
      lock/clear guides. (Illustrator core.)
- [ ] **Dimension / measure tool** — click-drag to read distance/angle; optional
      persistent dimension annotations.
- [ ] **Recolor artwork** — remap all colours in the selection through a small
      swatch-to-swatch table (Illustrator: Recolor Artwork).
- [ ] **Serial / variable data** — generate N copies with an incrementing number
      or a list (SignMaster badges/numbering).
- [ ] **PLT import colour restore** — carry pen/colour info from imported PLT so
      cut-by-colour works on imported jobs.
- [ ] **Nesting / auto-arrange** — pack selected shapes to minimise material
      waste within the artboard/material width.

## P3 — stretch (harder / niche)
- [ ] **Single-line / engraving fonts** (centerline text for pen/engrave).
- [ ] **Rhinestone / hotfix templates** (fill an outline with a dot grid).
- [ ] **Gradient mesh** (freeform multi-point gradient).
- [ ] **Isolation mode** (double-click group to edit-in-place).
