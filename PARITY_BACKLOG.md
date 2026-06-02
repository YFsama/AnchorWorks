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
- [~] **Convert Text to Outlines** — BLOCKED: needs a font-vectorisation dep
      (opentype.js) + access to font bytes (custom-font ArrayBuffers we keep;
      Google fonts fetched by URL; system fonts can't be embedded). Adding a
      dependency shouldn't happen silently in the autonomous loop — surface to
      the user for a dedicated run / approval, then implement Type→Create Outlines.
- [x] **Outline Stroke** — `outlineStrokeToCutPaths()` in contourFromSelection.ts
      (offset ±½ stroke into cut lines on both band edges; closed→outer+inner ring,
      open→closed band); right-click menu + command palette. 2026-06-02.
- [x] **Tiling / paneling for cut & print** — new TilePrintDialog.tsx (page size/
      orientation/cols/rows/overlap + live grid preview) replacing the prompt()
      flow; io3 tilePrint() gained `overlapPx` glue margins. Menu + command
      palette. 2026-06-02.

## P1 — sign text effects & layout

- [x] **Text on Arc / circle** — `applyTextOnArc(flip)` in textPath.ts (analytic
      per-glyph placement on an auto-fit circle, ∩ up / ∪ down); Character panel
      buttons + command palette. 2026-06-02.
- [x] **Multi-outline (contour text effect)** — outlineEffect.ts addOutlineEffect()
      stacks 1–4 stroke-silhouette clones behind any object (works on text without
      vectorising) via OutlineEffectDialog; per-ring colour, uniform width. Command
      palette + right-click. 2026-06-02.
- [x] **Letter spacing (tracking) + line height (leading)** — ALREADY PRESENT:
      CharacterPanel has Tracking + Leading sliders/inputs/presets (charSpacing /
      lineHeight). Inventory was wrong. 2026-06-02.
- [x] **Align to key object / align to artboard** — alignSelection(axis, ref) in
      alignDistribute.ts gained an 'artboard' reference; Align panel "Align to"
      selector (Selection / Artboard). Key-object (last-clicked) deferred — Fabric
      doesn't track selection click order cleanly. 2026-06-02.

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

- [x] **Cut-order visualisation** — CutPreview `showOrder` prop overlays numbered
      badges + start arrows in the same greedy travel order the output uses;
      "Cut order" toggle in the Plotter dialog. 2026-06-02.
- [x] **User guides from rulers** — drag off the top/left ruler to drop a
      persistent guide (Rulers.tsx startGuide); GuidesLayer.tsx renders them +
      the live drag; store userGuides/guidesLocked; Lock/Clear Guides in View
      menu + command palette. (Snap-to-guide is a follow-up.) 2026-06-02.
- [x] **Dimension / measure tool** — new 'measure' tool (M): measureTool.ts +
      MeasureLayer.tsx draw a click-drag segment with a px/mm/angle readout; never
      mutates the document. Auto-listed in toolbar/palette/keymap. (Persistent
      dimension annotations are a follow-up.) 2026-06-02.
- [x] **Recolor artwork** — collectSelectionColors()/recolorSelection() in
      selectionApply.ts (walks groups, remaps solid fills+strokes); RecolorDialog
      swatch table. Command palette + right-click. 2026-06-02.
- [x] **Serial / variable data** — variableData.ts buildSerialValues()/
      generateVariableData() + VariableDataDialog grid out N text copies from a
      number sequence or a list ("#" run = slot). Command palette. 2026-06-02.
- [x] **PLT import colour restore** — pltImporter.ts tracks SP pen per polyline
      (PltPolyline.pen) and polylinesToSvg() restores it via penColor()/PEN_COLORS,
      so imported jobs separate by colour. +3 unit tests. 2026-06-02.
- [x] **Nesting / auto-arrange** — autoArrangeSelection() in alignDistribute.ts
      shelf-packs the selection into rows within the artboard/material width
      (tallest-first); command palette + right-click "Auto-arrange (Nest)".
      2026-06-02.

## P3 — stretch (harder / niche)
- [~] **Single-line / engraving fonts** — BLOCKED: needs a bundled single-stroke
      (Hershey) font dataset — a sizable data asset. Like opentype.js, shouldn't be
      added silently in the loop; surface to the user for a dedicated run.
- [x] **Rhinestone / hotfix templates** — rhinestone.ts rhinestoneFromSelection()
      drops Ø-sized stones every N mm along the selection outline as cut-path
      circles; RhinestoneDialog (SS presets). Command palette + right-click.
      2026-06-02.
- [ ] **Gradient mesh** (freeform multi-point gradient).
- [ ] **Isolation mode** (double-click group to edit-in-place).
