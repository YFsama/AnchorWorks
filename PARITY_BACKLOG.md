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
- [x] **Convert Text to Outlines** — UNBLOCKED without a dependency:
      createOutlinesFromText() (textToOutline.ts) rasterises the text to a
      supersampled offscreen canvas and traces it with traceBitmap into an
      even-odd compound fabric.Path (works for ANY font — system/Google/custom —
      since it goes through the renderer, not font bytes). Character panel button
      + command palette. Raster-traced (Simplify thins it), not glyph-bezier.
      2026-06-02.
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

- [x] **Simplify Path** — pathSimplify.ts simplifySelection() flattens each
      selected path, Douglas-Peucker-reduces it at a px tolerance, and rebuilds it
      (absolute-`d` → new fabric.Path, like boolean ops); SimplifyDialog tolerance
      slider; command palette + right-click. 2026-06-02.
- [x] **Flip Horizontal / Vertical** — flipSelection() in selectionOps.ts; wired
      into Edit menu, command palette, Align panel "Flip" row, Shift+H / Shift+V
      shortcuts (keymap + App), and the existing right-click. 2026-06-02.
- [x] **Transform dialog** — transformOps.ts applyTransform() moves/scales/rotates
      the selection by exact values about its centre, with an optional copy;
      TransformDialog; Edit menu + command palette. 2026-06-02.
- [x] **Join paths** — pathJoin.ts joinSelection() connects the nearest endpoints
      of 2 selected open paths into one (or closes 1); rebuilt as a new
      fabric.Path. Ctrl+J (keymap+App), Edit menu, command palette, right-click.
      2026-06-02. — P1 path/transform group complete.

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
- [~] **Gradient mesh** — BLOCKED: SVG/Fabric have no mesh-gradient primitive
      (SVG2 mesh isn't shipped in browsers); a real implementation needs a bespoke
      patch renderer. Out of scope for a surgical change — dedicated effort.
- [~] **Isolation mode** — BLOCKED: Fabric v6 has no clean in-place group-child
      editing (`interactive`/`subTargetCheck` aren't in the typings, no dblclick
      infra); a faithful version needs significant bespoke interaction work.

## Operation-convenience refinements (when the actionable backlog is blocked)
- [x] Surface the new sign/effect operations (Multi-outline, Recolor, Rhinestone,
      Variable Data, Auto-arrange/Nest) in the Document menu — previously command
      palette + right-click only. 2026-06-02.
- [x] Snap-to-guides — applySmartSnap() (smartGuides.ts) now snaps a dragged
      object's edges/centre to ruler-dragged user guides (under the Smart Guides
      toggle), completing the guides feature. 2026-06-02.
- [x] Persist user guides — editor.ts loadGuides()/persistGuides() save guides to
      localStorage (vector.guides) so they survive a reload, like artboards.
      2026-06-02.
- [x] Doc sync — add the Measure tool (M) to the Shortcuts dialog + boot hint,
      which were missing the new tool. 2026-06-02.
- [x] Transform Each — TransformDialog "Transform each" checkbox + applyTransform
      `each` (transformOps.ts) pivots every object on its own centre (Illustrator
      Transform Each), completing the Transform feature. 2026-06-02.
- [x] Select Same — selectSame() (selectionOps.ts) selects every object matching
      the active object's fill/stroke colour (Illustrator Select→Same); command
      palette + right-click. 2026-06-02.
- [x] Lock / Unlock — lockSelection()/unlockAll() (selectionOps.ts) lock move/
      scale/rotate (matches the Layers-panel lock, serialises); Edit menu +
      command palette. 2026-06-02.
- [x] Hide / Show All — hideSelection()/showAll() (selectionOps.ts) toggle
      `visible` (matches the Layers-panel eye, serialises); Edit menu + command
      palette. 2026-06-02.
- [x] Swap Fill/Stroke — swapFillStroke() (selectionApply.ts) exchanges the
      selection's fill & stroke colours (Illustrator Shift+X); keymap + App +
      command palette. 2026-06-02.
- [x] Pathfinder Minus Back + palette — booleanOp gains 'minus-back' (front −
      back); Align-panel button + all 5 boolean ops added to the command palette
      (were panel-only). 2026-06-02.
- [x] Paste in Place — pasteFromClipboard(at, inPlace) keeps the copied coords
      (Illustrator Ctrl+Shift+V); keymap + App, right-click, command palette.
      2026-06-02.
- [x] Make Guides from Selection — makeGuidesFromSelection() (selectionOps.ts)
      drops ruler guides at each selected object's bbox edges (Illustrator
      Make Guides); View menu + command palette. 2026-06-02.
- [x] Select Inverse — selectInverse() (selectionOps.ts) selects all selectable
      objects except the current selection (Illustrator Select→Inverse); command
      palette + right-click. 2026-06-02.
- [x] Default Fill/Stroke — defaultColors() (selectionApply.ts) resets to white
      fill / black stroke (Illustrator "D"); D shortcut (keymap+App) + command
      palette. 2026-06-02.
- [x] Distribute by spacing — distributeSpacing() (alignDistribute.ts) lays the
      selection out with an exact mm gap (Illustrator Distribute Spacing value);
      Align-panel spacing input + H/V buttons. 2026-06-02.
- [x] Reverse cut direction — reversePolys() (cutOptimize.ts) + plotter `reverse`
      option flip every path's blade-travel direction; Plotter-dialog checkbox.
      +1 unit test. 2026-06-02.
- [x] Inner contours first — sortInsideFirst() (cutOptimize.ts, containment by
      centroid+area) + plotter `insideFirst` option cut nested contours before
      their container (print-and-cut); Plotter-dialog checkbox. +1 test. 2026-06-02.
- [x] Round Corners — roundCornersOnSelection() (roundCorners.ts) fillets path/
      shape corners by a radius via quadratic arcs (Illustrator Stylize→Round
      Corners); RoundCornersDialog + command palette + right-click. 2026-06-02.
- [x] Offset Path — offsetPathSelection() (offsetPath.ts) adds a parallel offset
      copy (±mm, original kept) via offsetPolyline (Illustrator Object→Path→Offset
      Path); OffsetPathDialog + command palette + right-click. 2026-06-02.
- [x] Pathfinder Divide — divideSelection() (booleanOps.ts) splits two shapes
      into A−B / B−A / A∩B pieces (Illustrator Pathfinder Divide); Align-panel
      button + command palette. 2026-06-02.
- [x] Pathfinder Trim — trimSelection() (booleanOps.ts) keeps the front whole and
      removes the front-covered part of the back, both separate (Illustrator
      Pathfinder Trim); Align-panel button + command palette. 2026-06-02.
- [x] Reverse Path Direction — reversePathSelection() (pathReverse.ts) flips each
      selected path's winding (Illustrator Object→Path→Reverse Path Direction);
      command palette. 2026-06-02.
- [x] Blend — blendSelection() (blend.ts) inserts N interpolated copies between
      two objects (position/scale/rotation/opacity/colour) — Illustrator
      Object→Blend; BlendDialog + command palette. 2026-06-02.
- [x] Surface path-effect dialogs in the Document menu (Simplify / Round Corners
      / Offset Path / Reverse Path Direction / Blend) — were palette/panel-only.
      2026-06-02.
- [x] Cut bridges / tabs — bridgePolyline()/addBridges() (bridges.ts) break
      closed cut paths with uncut gaps so pieces/stencil islands stay attached
      (SignMaster Bridge); Plotter-dialog count×gap + button. +3 tests. 2026-06-02.
- [x] Persistent dimensions — commitDimension() (measureTool.ts): Enter pins the
      Measure tool's live segment as a grouped line+mm-label object on the canvas
      (the measure tool's noted follow-up). 2026-06-02.
- [x] Roughen — roughenSelection() (roughen.ts) densifies then jitters path points
      for a distressed/hand-drawn edge (Illustrator Distort→Roughen); RoughenDialog
      (size+detail) + Document menu + command palette. 2026-06-02.
- [x] Roughen in right-click — added the Roughen… item to CanvasContextMenu.tsx
      next to Simplify/Round Corners/Offset Path, so every path effect shares all
      three surfaces (menu / palette / right-click). 2026-06-02.
- [x] Transform Again — transformOps.ts remembers the last applyTransform() params
      (lastTransform) and repeatTransform() re-applies them (Illustrator's
      step-and-repeat / array); Ctrl+Shift+D keymap + Edit menu + command palette.
      Also restored a green `eslint .`: ignore src-tauri/target build output +
      tests/e2e fixtures, and fixed a pre-existing ref-update-during-render in
      useResizableWidth.ts. 2026-06-02.
- [x] Eyedropper tool (I) — eyedropperTool.ts samples the clicked object's
      appearance (fill/stroke/stroke-width/opacity) onto the objects selected when
      the tool was picked (Illustrator Eyedropper); registered in registerTools.ts
      so it auto-lists in toolbar/keymap/shortcuts. Also fixed a Ctrl+Shift+D
      collision (Transform Again moved to Ctrl+Alt+D; it had shadowed the Debug
      Panel). 2026-06-02.
- [x] Deselect All — selectionOps.ts deselectAll()/selectAllObjects() give the
      Select→Deselect (Ctrl+Shift+A) command a real keymap binding + Edit-menu
      pair + command-palette entry; previously only Escape cleared a selection.
      2026-06-02.
- [x] Lock/Hide in right-click — surfaced Lock Selection / Unlock All / Hide
      Selection / Show All (+ Deselect All) in CanvasContextMenu.tsx; these
      high-frequency ops existed only in the Edit menu before. 2026-06-02.
- [x] Eyedropper Alt-click — eyedropperPick() (eyedropperTool.ts) now branches on
      altKey: Alt/Option-click applies the current selection's appearance onto the
      clicked object (Illustrator's reverse eyedropper), completing the I tool.
      2026-06-02.
- [x] Quick rotate 90°/180° — rotateSelection(deg) (transformOps.ts) wraps
      applyTransform to spin the selection about its centre; Rotate 90° CW/CCW +
      180° in the Edit menu, command palette, and right-click (CW/CCW). 2026-06-02.
- [x] Editable zoom field — StatusBar.tsx ZoomField turns the read-only zoom
      readout into a click-to-edit input; viewport.ts zoomToPercent() jumps to a
      typed % centred on the viewport (Illustrator/SignMaster status-bar zoom).
      2026-06-02.
- [x] Actual Size in View menu + palette — surfaced the 100% zoom command
      (zoomToPercent(100)) in the View menu and command palette; it was Ctrl+1
      keyboard-only before. 2026-06-02.
- [x] Zig Zag effect — zigzagSelection() (zigzag.ts) densifies then offsets path
      points perpendicular to the local tangent by a triangle (corner) or sine
      (smooth) wave, `ridges` waves over the path (Illustrator Distort→Zig Zag);
      ZigzagDialog (size/ridges/smooth) + Document menu + palette + right-click.
      2026-06-02.
- [x] Twist effect — twistSelection() (twist.ts) densifies then rotates each path
      point about the object's centre by an angle that scales with its radius
      (Illustrator Distort→Twist), completing the Distort & Transform trio with
      Roughen/Zig Zag; TwistDialog (angle) + Document menu + palette + right-click.
      2026-06-02.
- [x] Distort unit tests — exported the pure roughenPolyline/zigzagPolyline/
      twistPolyline helpers and added __tests__/distort.test.ts (8 tests) asserting
      closed-loop preservation, bounded jitter, displacement, no-op guards, and
      twist's distance-preserving rotation. Guards the new geometry. 2026-06-02.
- [x] Star / Polygon generator — shapes.ts insertStar()/insertRegularPolygon()
      build a parametric star (points + inner-radius ratio) or regular polygon
      centred on the document (Illustrator Star/Polygon tools); StarDialog (mode
      tabs) + Document menu + command palette (Insert). 2026-06-02.
- [x] Spiral generator + shape tests — shapes.ts insertSpiral() (open log-spiral,
      winds + decay, stroke-only) as a 3rd StarDialog tab; extracted pure
      starVertices/polygonVertices/spiralVertices and added __tests__/shapes.test.ts
      (6 tests: radii, top-tip, clamps, spiral monotonic decay). 2026-06-02.
- [x] Add Anchor Points — addAnchorsToSelection() (addAnchors.ts) +
      subdivideAllSegments() (pathEdit.ts) split every L/C/Q segment of each
      selected path at its midpoint, faithfully (de Casteljau) doubling anchors
      (Illustrator Object→Path→Add Anchor Points); Document menu + command palette
      + right-click. 2026-06-02.
- [x] Change Case multi-select + Sentence + palette — extracted textCase.ts
      changeCaseSelection() (works across a multi-text selection, adds Sentence
      case); Character panel now uses it (+4th button) and 4 commands added to the
      palette. Was single-object, panel-only, no sentence case. +3 tests. 2026-06-02.
- [x] Clipping Mask surfaces — the existing masks.ts applyClipMask()/
      releaseClipMask() were command-palette-only; wired Make/Release Clipping
      Mask into the Edit menu, canvas right-click, and Ctrl+7 / Ctrl+Alt+7 keymap
      + App handlers (no new logic — a dup clipMask.ts was caught and dropped).
      2026-06-02.
- [x] Compound Path surfaces — same treatment for masks.ts makeCompoundPath()/
      releaseCompoundPath() (were palette-only): Edit menu, canvas right-click, and
      Ctrl+8 / Ctrl+Alt+8 keymap + App handlers. 2026-06-02.
- [x] Find & Replace text — findReplace.ts replaceAllText()/countTextMatches()
      walk every text object (incl. group children) and replace all occurrences
      (case-sensitive toggle, live match count); FindReplaceDialog + Edit menu +
      command palette (Illustrator Edit→Find and Replace). 2026-06-02.
- [x] Invert Colors / Convert to Grayscale — colorAdjust.ts invertColorsSelection()
      / grayscaleColorsSelection() remap every solid hex/rgb fill+stroke in the
      selection (incl. groups) per-channel (Illustrator Edit→Edit Colors); Document
      menu + command palette. +5 tests (parse/invert/luminance). 2026-06-02.
- [x] Saturate — colorAdjust.ts saturateColorsSelection() scales each solid colour's
      HSL saturation (−100..+100%) via new rgbToHsl/hslToRgb/saturateRGB
      (Illustrator Edit→Edit Colors→Saturate); SaturateDialog slider + Document menu
      + command palette. +3 tests (HSL round-trip, factor 0/1). 2026-06-02.
- [x] Clean Up — cleanUp.ts cleanUpDocument() removes empty text objects, stray
      single-anchor paths, and zero-size objects (Illustrator Object→Path→Clean Up),
      handy after imports; Document menu + command palette. 2026-06-02.
- [x] Outline Stroke to Fill — outlineStrokeFill.ts outlineStrokeToFillSelection()
      reuses outlineStrokeToCutPaths' band rings to build a filled even-odd
      fabric.Path in the stroke colour and drops the source stroke (Illustrator
      Object→Path→Outline Stroke, fill flavour vs the existing cut flavour);
      Document menu + command palette. 2026-06-02.
- [x] Select Same — stroke weight / opacity — selectSame() (selectionOps.ts) now
      also matches numeric props (strokeWidth / opacity) with an epsilon, not just
      fill/stroke colour (Illustrator Select→Same→Stroke Weight / Opacity); 2 new
      command-palette entries. 2026-06-02.
- [x] Adjust Hue — colorAdjust.ts shiftHueColorsSelection()/shiftHueRGB() rotate
      the hue of every solid fill/stroke (−180..180°) reusing rgbToHsl/hslToRgb
      (Illustrator Recolor hue wheel); HueDialog slider + Document menu + command
      palette. +2 tests. Completes Edit Colors (Invert/Grayscale/Saturate/Hue).
      2026-06-02.
- [x] Paste in Front / Back — pasteFromClipboard() gained a `stack` arg
      (clipboard.ts) that bring-to-fronts / send-to-backs the in-place paste
      (Illustrator Ctrl+F / Ctrl+B); keymap + App handlers, command palette, and
      right-click next to Paste in Place. 2026-06-02.
- [x] Group/Ungroup + Arrange in the menu bar — added Group / Ungroup and Bring to
      Front / Forward / Send Backward / to Back to the Edit menu (MenuBar.tsx);
      these were right-click/shortcut/palette-only, absent from the top menu.
      2026-06-02.
- [x] Split Into Grid — splitGrid.ts gridCells() (pure) + splitIntoGrid() divide a
      selected object's bbox into rows×cols rectangles with a mm gutter (Illustrator
      Object→Path→Split Into Grid), distinct from RepeatDialog's duplicate-grid;
      SplitGridDialog + Document menu + command palette. +3 tests. 2026-06-02.
- [x] Arrowheads — arrowheads.ts arrowTriangle() (pure) + addArrowheads() append a
      filled triangular head (sized from stroke width, in the stroke colour) to the
      start/end/both endpoints of selected open paths/lines (sign/dimension arrows);
      Document menu + command palette. +2 tests. 2026-06-02.
- [x] Align to Key Object — alignDistribute.ts setKeyObject()/keyObjectId + a 'key'
      AlignRef align the selection to a designated object's bounds (it stays put),
      resolving the earlier "deferred — Fabric doesn't track click order" note via an
      explicit Set Key button + Key Object option in the Align panel. 2026-06-02.
- [x] Fit Artboard to Artwork / Selection — fitArtboard.ts fitArtboardToContent() +
      artboards.ts fitArtboard() resize+reposition the first artboard to wrap all
      art (or the selection) with a mm margin (Illustrator Fit to Artwork Bounds);
      Document menu + command palette. 2026-06-03.
- [x] Break Text into Letters / Lines — splitText.ts splitTextToLetters()/
      splitTextToLines() explode a text object into per-letter / per-line ITexts
      positioned from __charBounds + getHeightOfLine (honouring scale/rotation),
      keeping font/fill (SignMaster Break Text); command palette. 2026-06-03.
- [x] Document menu submenus — MenuBar.tsx MenuRow gained `sub` flyout support
      (named Tailwind group/sub); the ~30-item Document menu is regrouped into
      Insert / Path / Distort & Transform / Edit Colors / Sign Effects submenus
      so it's navigable again (operation-convenience). 2026-06-03.
- [x] Resize to exact size (mm) — scaleToSize.ts scaleSelectionToSize() scales the
      selection (object/group/multi) so its bbox matches a target W/H in mm about
      its centre, with optional aspect lock; ResizeDialog (prefilled, live ratio) +
      Edit menu + command palette. Fills the px-only single-object W/H gap. 2026-06-03.
- [x] Type menu — new top-level Type menu (MenuBar.tsx) gathers Create Outlines,
      Break Text into Letters/Lines, Text on Arc (Up/Down), Change Case submenu, and
      Find & Replace — text ops were scattered across the Character panel + palette
      with no menu-bar home (Illustrator's Type menu). 2026-06-03.
- [x] Export Selection as SVG / PNG — exportSelection.ts renderSelection() clones
      the selection into an offscreen StaticCanvas cropped to its bbox; exportSelection
      SVG()/PNG() download just the selected art (Illustrator Export Selection); File
      menu + command palette. 2026-06-03.
- [x] Dimension line arrowheads — commitDimension() (measureTool.ts) now groups two
      arrowTriangle() heads (reused from arrowheads.ts) at both endpoints with the
      line + mm label, so a pinned measurement reads as a proper dimension line.
      2026-06-03.
- [x] View-menu display toggles — Show Grid / Snap to Grid / Smart Guides / Anchor
      Snap added as checkbox items to the View menu (MenuBar.tsx) reusing the store
      setters; previously only the toolbar icons toggled them. 2026-06-03.
