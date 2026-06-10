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

2026-06-08: Measure proof asset archive panel: proof packets now include source/export/photo/note archive details, with manual add/update commands for final asset handoff.
2026-06-08: Measure proof file verification panel: proof packets now include version/checksum/reviewer/note verification details, with manual add/update commands for final file QA and archive traceability.
2026-06-08: Rich black / registration color preflight selectors: Select Object and command palette can isolate CMYK rich-black over-inking risks and all-plates registration-color artwork, including active-artboard scoped audits.
2026-06-08: Prepress color repair commands: command palette and Select Object menu can convert rich-black and registration/all-plates artwork to 100K process black while preserving generated print marks, with undo/history coverage.
2026-06-08: Total ink coverage selector: Select Object menu and command palette can isolate CMYK artwork over the 300% total ink limit globally or within the active artboard for separations/TAC preflight.
2026-06-08: Total ink coverage repair command: command palette and Select Object menu can proportionally reduce CMY channels to keep CMYK artwork under 300% TAC while preserving K and ignoring registration/overlay paints.
2026-06-08: White overprint preflight and repair: Select Object menu and command palette can isolate white fill/stroke artwork with overprint enabled and clear only the risky white overprint flags while preserving other overprint settings.
2026-06-08: Spot color separation selector: Select Object menu and command palette can isolate spot/separation/PANTONE artwork globally or on the active artboard for Illustrator-like separations preview audits.

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
      menu + command palette. 2026-06-02. Snap-to-guide follow-up completed:
      shape creation points now snap to visible ruler guides through maybeSnap(),
      matching moved-object guide snapping. 2026-06-07.
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
- [x] **Single-line / engraving fonts** — upgraded from seven-segment strokes to
      an embedded engineering single-line vector alphabet with curves, numbers,
      and common engraving punctuation; no external font payload required.
      2026-06-07.
- [x] **Rhinestone / hotfix templates** — rhinestone.ts rhinestoneFromSelection()
      drops Ø-sized stones every N mm along the selection outline as cut-path
      circles; RhinestoneDialog (SS presets). Command palette + right-click.
      2026-06-02.
- [x] **Gradient mesh** — FreeformGradientDialog now has a Mesh Surface mode:
      rasterizes a corner-preserving bilinear mesh with interior stop influence,
      giving Illustrator-like mesh color surfaces despite SVG/Fabric limitations.
      2026-06-07.
- [x] **Isolation mode** — group isolation now works through command palette,
      shortcut/right-click, Esc exit, and Illustrator-style double-click entry;
      it temporarily ungroups children for editing and restores a group on exit.
      2026-06-07.

## Operation-convenience refinements (when the actionable backlog is blocked)
- [x] **Graphic Styles** — PropertiesPanel now has Illustrator-style reusable
      appearance presets: save the active object's fill/stroke/opacity/blend/
      dash/caps/joins/shadow as a style, persist it, and apply it to selections.
      2026-06-07.
- [x] **Select by Graphic Style** — Graphic Style tiles can now select every
      object matching that saved appearance signature, making reusable style cleanup
      work like Illustrator's Graphic Styles panel. 2026-06-07.
- [x] **Graphic Styles menu/palette parity** — Appearance menu, command palette,
      and right-click Appearance submenu now save the selection as a reusable
      graphic style, apply saved styles, and select matching artwork without
      opening Properties, closer to Illustrator's panel/menu workflow. 2026-06-07.
- [x] **Clear Appearance** — Appearance menu and command palette can reset
      selected objects to default fill/stroke/opacity, clearing blend modes, dash
      styling, caps/joins, and shadows for Illustrator-like appearance cleanup.
      2026-06-07.
- [x] **Layers search Set Shadow** — Layers search actions can now batch
      apply or clear drop shadows across filtered matches with color, blur, and
      offset controls, extending Illustrator-style appearance cleanup from the
      Layers panel. 2026-06-08.
- [x] **Layers search Clear Image FX** — Layers search actions can now
      batch-clear raster image filters across filtered image matches, pairing
      Select Same Image FX with cleanup operations for Illustrator-like placed
      image production fixes. 2026-06-08.
- [x] **Layers search Clear Gradients/Patterns** — Layers search actions now
      batch-clear live gradient fills and pattern-fill metadata across filtered
      matches, pairing Same Gradient/Same Pattern discovery with Illustrator-like
      appearance cleanup directly in the Layers panel. 2026-06-08.
- [x] **Layers search Release Clips** — Layers search actions can now
      release clipping masks across filtered matches, pairing Same Clip discovery
      with Illustrator-like mask cleanup directly in the Layers panel. 2026-06-08.
- [x] **Layers search Expand Clips** — Layers search actions can now
      expand clipping masks across filtered matches, clearing clip paths and
      ungrouping matching clipping groups into editable artwork from the Layers
      panel. 2026-06-08.
- [x] **Layers search Release Compound** — Layers search actions can now
      release matching compound paths into editable subpaths, bringing another
      Illustrator path-cleanup workflow directly to filtered layer results.
      2026-06-08.
- [x] **Layers search Make Compound** — Layers search actions can now
      combine filtered vector matches into a single even-odd compound path using
      the same path assembly as Object > Compound Path, completing make/release
      compound cleanup from the Layers panel. 2026-06-08.
- [x] **Layers search Outline Stroke** — Layers search actions can now
      outline strokes on filtered matches into editable even-odd filled paths,
      reusing Object > Path > Outline Stroke semantics for batch layer cleanup.
      2026-06-08.
- [x] **Layers search Offset Path** — Layers search actions can now
      add positive or negative offset copies for filtered vector matches in mm,
      bringing Object > Path > Offset Path into search-scoped cleanup workflows.
      2026-06-08.
- [x] **Layers search Smooth Path** — Layers search actions can now
      smooth filtered vector matches with bounded multi-pass path smoothing,
      bringing Object > Path > Smooth into search-scoped cleanup workflows.
      2026-06-08.
- [x] **Layers search Simplify Path** — Layers search actions can now
      simplify filtered path matches with Douglas-Peucker tolerance control,
      bringing Object > Path > Simplify into search-scoped cleanup workflows.
      2026-06-08.
- [x] **Layers search Reverse Path** — Layers search actions can now
      reverse path direction across filtered path matches, bringing Object > Path
      > Reverse Path Direction into search-scoped cleanup workflows.
      2026-06-08.
- [x] **Layers search Add Anchors** — Layers search actions can now
      add midpoint anchors to filtered path matches in place, bringing Object >
      Path > Add Anchor Points into search-scoped path editing workflows.
      2026-06-08.
- [x] **Layers search Clean Up** — Layers search actions can now
      remove matching empty text, stray points, and zero-size junk without touching
      nonmatching cleanup candidates, bringing Object > Path > Clean Up into
      search-scoped document repair workflows. 2026-06-08.
- [x] **Layers search Split Into Grid** — Layers search actions can now
      replace filtered objects with rows×columns grid rectangles using optional
      gutter spacing, bringing Object > Path > Split Into Grid into search-scoped
      layout production workflows. 2026-06-08.
- [x] **Layers search Scissors** — Layers search actions can now
      split filtered open path matches at their midpoint while leaving closed and
      nonmatching paths intact, bringing Scissors-style path cutting into
      search-scoped cleanup workflows. 2026-06-08.
- [x] **Layers search Knife Split** — Layers search actions can now
      split filtered closed shapes horizontally or vertically through their center,
      bringing Knife-style shape cutting into search-scoped path cleanup workflows.
      2026-06-08.
- [x] **Layers search Pucker/Bloat** — Layers search actions can now
      apply signed Pucker & Bloat distortion to filtered path/shape matches,
      bringing Effect > Distort & Transform cleanup into search-scoped workflows.
      2026-06-08.
- [x] **Layers search Roughen** — Layers search actions can now
      roughen filtered path/shape matches with size/detail prompts, bringing
      Effect > Distort & Transform > Roughen into search-scoped cleanup workflows.
      2026-06-08.
- [x] **Layers search Zig Zag** — Layers search actions can now
      apply corner or smooth Zig Zag waves to filtered path/shape matches with
      size/ridge prompts, extending Distort & Transform cleanup from search.
      2026-06-08.
- [x] **Layers search Twist** — Layers search actions can now
      twist filtered path/shape matches by a signed angle, making Distort &
      Transform spiral cleanup available directly from filtered layer results.
      2026-06-08.
- [x] **Layers search Round Corners** — Layers search actions can now
      round filtered path/rectangle/polygon matches by radius, bringing Stylize >
      Round Corners into search-scoped import cleanup workflows. 2026-06-08.
- [x] **Layers search Free Distort** — Layers search actions can now
      apply Free Distort presets or eight-value corner offsets to filtered path/
      shape matches, bringing envelope-style perspective cleanup into search.
      2026-06-08.
- [x] **Layers search Warp** — Layers search actions can now
      apply Arc/Rise/Flag/Wave warp styles to filtered path/shape matches across
      a shared search-result frame, bringing envelope warp cleanup into Layers.
      2026-06-08.
- [x] **Layers search Multi-outline** — Layers search actions can now
      add stacked multi-colour contour outlines behind filtered matches, bringing
      sign-style Outline effects into search-scoped production cleanup. 2026-06-08.
- [x] **Layers search Variable Width** — Layers search actions can now
      expand filtered open stroked paths with uniform, taper, bulge, or hourglass
      variable-width profiles for Illustrator-like stroke cleanup. 2026-06-08.
- [x] **Layers search Blend** — Layers search actions can now
      create Illustrator-style blend steps between filtered matches using step,
      spacing, and orientation options while preserving blend metadata. 2026-06-08.
- [x] **Layers search Rhinestone** — Layers search actions can now
      generate hotfix/rhinestone cut-path templates from filtered matches with
      spacing and stone-diameter controls, extending production cleanup. 2026-06-08.
- [x] **Layers search Banner Grommets** — Layers search actions can now
      generate banner grommet cut-path templates from filtered matches with
      inset, max-spacing, and diameter controls for production finishing. 2026-06-08.
- [x] **Measure annotation surface parity** — live distance/angle overlay now
      includes a first-class Pin measurement command in View/menu search plus
      Enter, so production drawings can preserve editable dimension annotations.
      2026-06-08.
- [x] **Selection dimensions** — Measure commands can now generate editable
      width and height dimension annotations around the active selection bounds,
      speeding shop drawings and Illustrator-like production markups. 2026-06-08.
- [x] **Selection area labels** — Measure commands can now add editable
      area/perimeter labels at the selection centre, giving production reviewers
      quick square-mm and perimeter estimates without opening Inspector. 2026-06-08.
- [x] **Selection center marks** — Measure commands can now add editable
      crosshair/circle centre marks with mm coordinate labels for the selection
      bounds, improving alignment and production registration workflows. 2026-06-08.
- [x] **Selection corner marks** — Measure commands can now add editable
      L-shaped marks at all selection bounds corners for trim, placement, and
      production registration workflows. 2026-06-08.
- [x] **Selection production mark set** — Measure commands can now add a
      single editable group containing width/height dimensions, area/perimeter
      label, centre mark, and corner marks for production proofing. 2026-06-08.
- [x] **Selection margin frame** — Measure commands can now prompt for a
      mm clearance and add an editable dashed safe-area frame around the selection,
      supporting proofing, bleed, and placement reviews. 2026-06-08.
- [x] **Selection inset frame** — Measure commands can now prompt for a
      mm inset and add an editable dashed internal safe-area frame, complementing
      outside margin frames for placement and trim reviews. 2026-06-08.
- [x] **Measure annotation management** — generated measure/production
      annotations now carry metadata, and menu/search commands can select or clear
      all of them for cleanup after proofing. 2026-06-08.
- [x] **Measure annotation lock workflow** — generated measure/production
      annotations can now be locked or unlocked in bulk from View/menu search,
      protecting proofing marks from accidental edits while artwork is adjusted. 2026-06-08.
- [x] **Measure annotation visibility workflow** — generated measure/production
      annotations can now be hidden or shown in bulk from View/menu search, so
      complex artwork can be edited without deleting proofing marks. 2026-06-08.
- [x] **Measure annotation arrange workflow** — generated measure/production
      annotations can now be brought to front in bulk from View/menu search, keeping
      proofing dimensions readable above dense artwork. 2026-06-08.
- [x] **Measure annotation proof mode** — View/menu search can now prepare
      all generated measure/production annotations for proofing in one action by
      showing, bringing forward, and locking them. 2026-06-08.
- [x] **Measure annotation edit mode** — View/menu search can now restore
      generated measure/production annotations for editing in one action by showing,
      bringing forward, unlocking, and selecting them. 2026-06-08.
- [x] **Measure annotation duplication** — View/menu search can now duplicate
      existing measure/production annotations onto the current artwork selection,
      speeding repeated proof markups across multi-object or multi-layout jobs. 2026-06-08.
- [x] **Measure annotation guide conversion** — View/menu search can now create
      persistent ruler guides from generated measure/production annotation bounds,
      turning proof marks into reusable Illustrator-like alignment guides. 2026-06-08.
- [x] **Measure annotation center guides** — View/menu search can now create
      persistent horizontal/vertical center guides from generated measure/production
      annotation bounds for Illustrator-like centerline alignment. 2026-06-08.
- [x] **Measure annotation full guide set** — View/menu search can now create
      boundary plus center ruler guides from generated measure/production annotation
      bounds in one action for faster Illustrator-like alignment setup. 2026-06-08.
- [x] **Measure annotation margin guides** — View/menu search can now create
      persistent ruler guides offset outward from measure/production annotation bounds
      by a prompted mm margin for bleed and safe-area alignment. 2026-06-08.
- [x] **Measure annotation margin full guide set** — View/menu search can now
      create boundary guides offset by a prompted mm margin plus original center guides
      from measure/production annotations in one action. 2026-06-08.
- [x] **Measure annotation print marks** — View/menu search can now convert
      measure/production annotation bounds into crop marks, registration marks,
      bleed indicators, and page info with a prompted bleed value. 2026-06-08.
- [x] **Measure annotation cut contour** — View/menu search can now turn
      measure/production annotation bounds into a visible plotter outline with
      a prompted non-negative offset for sticker and print-and-cut setup. 2026-06-08.
- [x] **Measure annotation bridged cut contour** — View/menu search can now
      create a bridged plotter outline from measure/production annotation bounds
      with prompted offset, bridge count, and gap values for stencil/tabbed cuts. 2026-06-08.
- [x] **Measure annotation plotter positioning marks** — View/menu search can now
      replace plotter regmarks from measure/production annotation bounds with a
      prompted offset, aligning print-and-cut setup to proof geometry. 2026-06-08.
- [x] **Measure annotation weed border** — View/menu search can now create
      a plotter weed border from measure/production annotation bounds with a
      prompted margin, keeping vinyl waste removal aligned to proof geometry. 2026-06-08.
- [x] **Measure annotation weed grid** — View/menu search can now create
      a weed border plus prompted row/column divider cuts from measure/production
      annotation bounds for large vinyl waste removal. 2026-06-08.
- [x] **Measure annotation banner grommets** — View/menu search can now
      generate banner eyelet cut paths from measure/production annotation bounds
      with prompted inset, spacing, and diameter values. 2026-06-08.
- [x] **Measure annotation rhinestone template** — View/menu search can now
      place hotfix/rhinestone template circles along measure/production annotation
      outlines with prompted spacing and diameter values. 2026-06-08.
- [x] **Measure annotation print-and-cut prep package** — View/menu search can now
      create print marks, cut contour, plotter positioning marks, weed border, and
      full guide set from measure/production annotation bounds in one prompted flow. 2026-06-08.
- [x] **Measure annotation banner finishing package** — View/menu search can now
      create banner grommets, weed border/grid cuts, and full guide set from
      measure/production annotation bounds in one prompted flow. 2026-06-08.
- [x] **Measure annotation stencil cut package** — View/menu search can now
      create bridged stencil/sandblast cut outlines, weed border/grid cuts, and
      full guide set from measure/production annotation bounds in one prompted flow. 2026-06-08.
- [x] **Measure annotation rhinestone template package** — View/menu search can now
      create hotfix/rhinestone template circles, weed border, and full guide set
      from measure/production annotation bounds in one prompted flow. 2026-06-08.
- [x] **Measure annotation proof page package** — View/menu search can now
- [x] Measure annotation multi proof pages — batch-create one proof artboard, print-mark set, and guide package per measurement annotation for multi-panel review sheets.
- [x] Measure proof page review labels — proof page generation now adds exportable page labels with proof number, trim size, margin, and bleed values for client/shop review sheets. 2026-06-08.
- [x] Measure proof page trim/artwork frames — proof page generation now adds exportable dashed trim and artwork frames alongside print marks, labels, artboards, and guides for clearer approval sheets. 2026-06-08.
- [x] Measure proof page legends — proof page generation now adds exportable legends explaining trim/page, artwork bounds, and bleed styling for clearer approval handoffs. 2026-06-08.
- [x] Measure proof page approval checklist — proof page generation now adds exportable approval checklists with production review items and signature/date lines for client sign-off. 2026-06-08.
- [x] Measure proof page colour control bars — proof page generation now adds exportable CMYK/RGB/gray control bars for print colour review on approval sheets. 2026-06-08.
- [x] Measure proof page 100mm scale bars — proof page generation now adds exportable 100 mm scale-check rulers with 10 mm ticks so printed approvals can be physically verified. 2026-06-08.
- [x] Measure proof page job info panels — proof page generation now adds exportable job/revision/prepared/notes fields per proof sheet for client and production handoff. 2026-06-08.
- [x] Measure proof page production specs — proof page generation now adds exportable artwork/trim/margin/bleed spec panels for production-ready approval sheets. 2026-06-08.
- [x] Measure proof page safety notes — proof page generation now adds exportable safe-margin and cut/finish verification notes for production approval sheets. 2026-06-08.
- [x] Measure proof sheet cleanup — View/menu search can now clear all generated proof sheet print marks, frames, labels, legends, control bars, specs, and notes while keeping the source measure annotations. 2026-06-08.
- [x] Measure proof approval status stamps — proof page generation now adds exportable Draft/Approved/Changes Required status stamps, with View/menu search commands to batch update all proof sheets for Illustrator-like client approval handoff. 2026-06-08.
- [x] Measure proof job metadata updates — View/menu search can now batch-fill generated proof job info panels with job name, revision, prepared-by, and notes so client/shop proof sheets can be templated after generation. 2026-06-08.
- [x] Measure proof export filename labels — proof page generation now adds exportable suggested PDF filename labels that auto-refresh from job name, revision, approval status, and page number for production handoff. 2026-06-08.
- [x] Measure proof preflight summaries — proof page generation now adds exportable preflight summary panels covering size, bleed, safe margin, trim marks, and filename readiness for Illustrator-like print approval handoff. 2026-06-08.
- [x] Measure proof manifest summaries — batch proof generation now adds an exportable manifest panel summarising job, revision, page count, approval status mix, and suggested files; View/menu search can add or refresh the manifest for existing proof sheets. 2026-06-08.
- [x] Measure proof dynamic preflight refresh — proof preflight panels now track the generated filename and approval status, refreshing automatically when job metadata or Draft/Approved/Changes state changes. 2026-06-08.
- [x] Measure proof signoff metadata — approval checklists now carry batch-fillable signer, date, and note metadata with View/menu search prompts for client/shop signoff handoff. 2026-06-08.
- [x] Measure proof checklist state sync — approval checklist boxes now move between empty, checked, and issue states when proof sheets are marked Draft, Approved, or Changes Required, matching client review workflows. 2026-06-08.
- [x] Measure proof status selection — View/menu search can now select Draft, Approved, or Changes Required proof review objects by status for focused batch inspection and cleanup. 2026-06-08.
- [x] Measure proof signoff manifest rollup — proof manifest panels now include completed signoff counts and refresh when signer/date metadata changes, making batch approval readiness visible. 2026-06-08.
- [x] Measure proof revision history panel — proof sheets can now add/export a revision-history panel that rolls up revision, prepared-by, page count, approvals, changes, signoff completion, and notes, refreshing with job/status/signoff metadata for Illustrator-like production review packets. 2026-06-08.
- [x] Measure proof approval audit panel — proof packets now include/export an approval-audit panel that highlights production blockers across draft, changes-required, and unsigned pages, refreshing as approval and signoff metadata changes. 2026-06-08.
- [x] Measure proof package cover sheet — proof packets now include/export a package cover summarising job, revision, prepared-by, page count, approval mix, signoff readiness, output files, and release/hold status for Illustrator-like client/production handoff. 2026-06-08.
- [x] Measure proof delivery checklist — proof packets now include/export a pre-delivery checklist that marks job metadata, revision, prepared-by, page count, filename readiness, approvals, changes, drafts, and signoff completion before release. 2026-06-08.
- [x] Measure proof delivery blocker selection — View/menu search can now select proof pages and summary panels that block release due to missing metadata, draft/changes status, or incomplete signoff, making pre-delivery cleanup work like Illustrator preflight issue isolation. 2026-06-08.
- [x] Measure proof release/hold stamp — proof packets now include/export a release status stamp that flips between RELEASE HOLD and RELEASE READY from delivery checklist readiness, giving production handoff an Illustrator-like visual approval gate. 2026-06-08.
- [x] Measure proof package index — proof packets now include/export a package index listing each proof page's status, signoff state, and suggested output filename for Illustrator-like multi-page delivery handoff. 2026-06-08.
- [x] Measure proof delivery contact panel — proof packets now include/export client, contact, email, and phone handoff metadata with View/menu search commands to add and update the panel for Illustrator-like client approval packets. 2026-06-08.
      create a margin artboard, print marks, and full guide set from measure/production
      annotation bounds in one prompted proofing flow. 2026-06-08.
- [x] **Measure annotation artboard creation** — View/menu search can now create
      a new artboard from generated measure/production annotation bounds, turning
      proof markups into Illustrator-like page/crop regions. 2026-06-08.
- [x] **Measure annotation margin artboards** — View/menu search can now create
      new artboards from measure/production annotation bounds with a prompted mm
      margin for bleed, safe area, and print-ready proof pages. 2026-06-08.
- [x] **Measure annotation artboard resize** — View/menu search can now resize
      the relevant existing artboard to generated measure/production annotation
      bounds, avoiding extra pages when proof crop regions change. 2026-06-08.
- [x] **Measure annotation margin artboard resize** — View/menu search can now
      resize the relevant existing artboard to measure/production annotation bounds
      with a prompted mm margin for iterative bleed and safety adjustments. 2026-06-08.
- [x] **Layers search Break Symbols** — Layers search actions can now
      detach linked symbol metadata across filtered matches and nested symbol
      children, pairing Same Symbol discovery with Illustrator-like symbol cleanup
      directly in the Layers panel. 2026-06-08.
- [x] **Layers search Flatten Transparency** — Layers search actions can now
      batch-flatten opacity and blend-mode artwork across filtered matches, baking
      alpha into fills/strokes/shadows for Illustrator-like transparency cleanup
      without leaving the Layers panel. 2026-06-08.
- [x] **Layers search Expand Appearance** — Layers search actions can now
      batch-expand matching pattern fills, drop shadows, and transparency cleanup
      into editable artwork, closing a complex Illustrator-style appearance workflow
      directly from filtered layer results. 2026-06-08.
- [x] **Flatten Transparency command** — Appearance menu, command palette, and
      right-click Appearance now normalize selected opacity/blend-mode artwork by
      baking object opacity into flat fill/stroke/shadow alpha and resetting opacity
      plus blend mode for Illustrator-like transparency cleanup. 2026-06-07.
- [x] **Unified Expand Appearance command** — Appearance menu, command palette,
      and right-click now run one Illustrator-style expansion pass that expands
      pattern fills, drop shadows, and flattened transparency in a single history
      step while keeping the individual commands available. 2026-06-07.
- [x] **Clear Gradient Fill** — Appearance menu and command palette can remove
      live gradient fills while restoring the first stop as a solid colour, giving
      imported/experimental artwork a quick Illustrator-like cleanup path.
      2026-06-07.
- [x] **Overprint fill/stroke controls** — Appearance menu, command palette, and
      right-click Appearance can mark fill, stroke, or both as overprint metadata
      and clear it again, pairing with Select Overprint Objects for Illustrator-like
      print separation preflight. 2026-06-07.
- [x] **Variable Width Profiles** — PropertiesPanel + command palette can expand
      open stroked paths into filled variable-width shapes (uniform/taper/bulge/
      hourglass), approximating Illustrator's Width Profile workflow. 2026-06-07.
- [x] **Scissors at midpoint** — Path menu + command palette can split selected
      open paths at half their travelled length into two editable open paths,
      covering the common Illustrator Scissors cut-path workflow. 2026-06-07.
- [x] **Smooth Path command** — pathSmooth.ts adds a Chaikin smoothing pass that
      rebuilds selected paths/shapes as editable paths, with Path menu, command
      palette, and right-click Path Effects access for Illustrator-style cleanup
      of jagged traced artwork. 2026-06-07.
- [x] **Shape Builder same-fill merge** — Pathfinder menu + command palette can
      union same-colour filled regions independently, cleaning fragmented artwork
      like Illustrator Shape Builder without merging different colours. 2026-06-07.
- [x] **Redefine Symbol** — inserted symbols now carry instance metadata; the
      Symbols panel + command palette can redefine the master symbol from the
      selected instance, matching Illustrator's reusable symbol workflow. 2026-06-07.
- [x] **Global Swatch Replace** — Swatches can mark a color and replace all
      matching solid fills/strokes across the canvas with the current fill, while
      updating/deduping the stored swatch list for Illustrator-like global color
      edits. 2026-06-07.
- [x] **Select by Swatch surface parity** — global swatch storage now lives in
      globalSwatches.ts, and MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx expose select-art-by-swatch commands for every saved
      swatch, matching Illustrator swatch cleanup beyond the Properties panel.
      2026-06-07.
- [x] **Global Swatch Replace surface parity** — replaceSavedSwatchWithColor()
      centralizes canvas replacement plus stored-swatch dedupe, and MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx now replace any saved swatch
      with the current fill from menu/search/right-click workflows. 2026-06-07.
- [x] **Scale Strokes & Effects transform option** — TransformDialog.tsx now
      exposes Illustrator's Scale Strokes & Effects checkbox, and transformOps.ts
      scales stroke widths plus drop-shadow blur/offsets for selection-centre and
      Transform Each workflows. 2026-06-07.
- [x] **Diagonal Reflect transform commands** — transformOps.ts now supports
      arbitrary-angle reflection and Object/Transform, command palette, and
      right-click surfaces expose 45° and 135° reflect commands beyond simple
      horizontal/vertical flips. 2026-06-07.
- [x] **Swatch add/collect surface parity** — addSavedSwatchColor() and
      collectSelectionColorsIntoSwatches() centralize palette updates, while
      MenuBar.tsx, CommandPalette.tsx, and CanvasContextMenu.tsx expose Add
      current fill and Collect colours from selection outside Properties. 2026-06-07.
- [x] **Swatch apply surface parity** — applySwatchToSelection() centralizes
      saved-swatch fill/stroke application, and PropertiesPanel.tsx, MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx expose fill and stroke apply
      workflows for every saved swatch. 2026-06-07.
- [x] **Break Symbol Link** — Symbols panel, Document menu, and command palette
      can detach selected symbol instances by removing instance metadata, so users
      can expand/edit placed symbols independently like Illustrator. 2026-06-07.
- [x] **Select Symbol Instances** — Symbols panel tiles now expose a select-instances
      action that selects every placed instance of that library symbol, including
      nested tagged children, matching Illustrator symbol-management cleanup.
      2026-06-07.
- [x] **Select Symbol Instances surface parity** — MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx now expose library-symbol
      instance selection by symbol name, so reusable symbol cleanup is reachable
      from menus, search, right-click, and the Symbols panel. 2026-06-07.
- [x] **Select all symbol instances** — selectAllSymbolInstances() audits every
      linked symbol instance regardless of which saved symbol entry it belongs to;
      Select Object, Symbols menu, command palette, and right-click. 2026-06-07.
- [x] **Brush Presets** — Pencil now uses a persisted Illustrator-like brush
      preset library (Basic/Calligraphy/Marker/Inking) that controls pressure
      width, minimum width, and speed thinning; Properties exposes the preset.
      2026-06-07.
- [x] **Knife center split** — Path menu and command palette can knife-split
      selected closed shapes horizontally or vertically through their center,
      producing separate editable filled pieces via polygon clipping. 2026-06-07.
- [x] **Recolor sort mappings** — Recolor Artwork now adds hue and luminance
      sort actions so complex palettes can be reassigned in predictable color-wheel
      or lightness order, closer to Illustrator's advanced recolor controls.
      2026-06-07.
- [x] **Expand Drop Shadow** — Appearance menu and command palette can expand
      selected drop shadows into separate editable shadow artwork, clearing the
      live effect from originals for Illustrator-like Expand Appearance workflows.
      2026-06-07.
- [x] **Expand Pattern Fill** — Pattern fills now carry expansion metadata;
      Appearance menu and command palette can convert them into separate editable
      tile artwork while clearing the live pattern fill from the source object.
      2026-06-07.
- [x] **Clear Pattern Fill** — Appearance menu and command palette can remove
      live pattern metadata while restoring the solid base colour, matching
      Illustrator-style appearance cleanup without expanding tiles. 2026-06-07.
- [x] **Expand Clipping Mask** — Arrange menu and command palette can release
      clipping paths and ungroup clipping groups into normal editable contents,
      matching Illustrator's expand/edit masked-art workflow. 2026-06-07.
- [x] **Select Same advanced appearance** — Select Same now matches
      drop shadows, pattern fills, symbol instances, and clipping-mask presence
      from the Edit menu and command palette for faster complex-art cleanup.
      2026-06-07.
- [x] **Select Same full appearance** — Select Same now compares complete
      appearance signatures across fill/stroke/width/opacity/blend/dash/caps/joins/
      shadows/patterns from the Edit menu and command palette. 2026-06-07.
- [x] **Select Same Fill & Stroke** — selectionOps.ts now exposes a combined
      fill/stroke color signature, and MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx surface the Illustrator-style Select Same Fill &
      Stroke command for faster two-color artwork cleanup. 2026-06-07.
- [x] **Select Same Stroke Appearance** — selectionOps.ts now matches stroke
      color, weight, dash array, cap, and join together, with MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx exposing the combined
      Illustrator-style stroke-appearance selection command. 2026-06-07.
- [x] **Select Same Text Appearance** — selectionOps.ts now matches text
      family, size, weight, style, tracking, and leading together, with MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx exposing the combined
      Illustrator-style text-appearance selection command. 2026-06-07.
- [x] **Select Same Fill Appearance** — selectionOps.ts now matches solid
      fills, live gradient fills, pattern fills, opacity, and blend mode together,
      with MenuBar.tsx, CommandPalette.tsx, and CanvasContextMenu.tsx exposing the
      Illustrator-style fill-appearance selection command. 2026-06-07.
- [x] **Select Same Position** — selectionOps.ts now matches object left/top
      coordinates together, with MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx exposing an Illustrator-style same-position selection
      command for stacked and duplicated artwork cleanup. 2026-06-07.
- [x] **Select Same X/Y Position** — selectionOps.ts now matches left-only
      and top-only coordinates separately, with MenuBar.tsx, CommandPalette.tsx,
      and CanvasContextMenu.tsx exposing Illustrator-style same-X and same-Y
      position selection commands for aligned artwork cleanup. 2026-06-07.
- [x] **Select Same Center** — selectionOps.ts now matches center X, center Y,
      and combined center point from scaled bounds, with MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx exposing Illustrator-style
      same-center selection commands for aligned and stacked artwork. 2026-06-07.
- [x] **Select Same Width/Height** — selectionOps.ts now matches scaled width
      and scaled height independently in addition to full object size, with
      MenuBar.tsx, CommandPalette.tsx, and CanvasContextMenu.tsx exposing
      Illustrator-style dimension-specific selection commands. 2026-06-07.
- [x] **Select Same Bounds/Edges** — selectionOps.ts now matches right edge,
      bottom edge, and full scaled bounds independently, with MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx exposing Illustrator-style
      bounding-box selection commands for precise layout cleanup. 2026-06-07.
- [x] **Select Same Object Size** — selectionOps.ts now matches scaled
      object width and height together, with MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx exposing an Illustrator-style same-size selection
      command for repeated sign-layout cleanup. 2026-06-07.
- [x] **Select Same Area/Aspect Ratio** — selectionOps.ts now matches scaled
      visible area and width:height ratio independently, with MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx exposing Illustrator-style
      proportional and footprint selection for layout cleanup. 2026-06-07.
- [x] **Blend expanded appearance interpolation** — blend.ts now interpolates
      object width/height, skew, stroke weight, dash arrays, shadows, blend mode
      transitions, caps/joins, and flat colours via a tested buildBlendProps()
      helper for richer Illustrator Object→Blend behaviour. 2026-06-07.
- [x] **Blend multi-object spine** — blend.ts now treats three-or-more
      selected objects as adjacent blend segments in z-order instead of blending
      only the first and last endpoints, with buildBlendSequence() tests covering
      multi-stop Illustrator-style Object→Blend workflows. 2026-06-07.
- [x] **Blend z-order insertion** — blendSelection() now moves generated
      intermediate objects between their source endpoints in canvas stacking order
      instead of appending every blend step to the front, with buildBlendInsertPlan()
      coverage for Illustrator-like layer order. 2026-06-07.
- [x] **Blend RGB/RGBA colour interpolation** — blendColor() now handles
      Fabric rgb()/rgba() strings in addition to hex values, preserving alpha while
      interpolating fills, strokes, and shadow colours for richer Illustrator-like
      blends. 2026-06-07.
- [x] **Blend reverse spine option** — BlendDialog.tsx now exposes a Reverse
      blend spine checkbox and blendSelection()/buildBlendSequence() accept a
      reverse option, enabling Illustrator-like reverse multi-stop blend direction
      without manually reordering objects. 2026-06-07.
- [x] **Blend specified-distance spacing** — BlendDialog.tsx now adds
      Specified Steps / Specified Distance spacing controls, while blend.ts resolves
      per-segment intermediate counts from endpoint distance for Illustrator-like
      Blend Options workflows. 2026-06-07.
- [x] **Blend Smooth Color spacing** — BlendDialog.tsx now includes the
      Smooth Color spacing mode, and blend.ts estimates per-segment steps from
      fill/stroke/shadow colour distance for Illustrator-like automatic colour
      blends. 2026-06-07.
- [x] **Blend orientation options** — BlendDialog.tsx now exposes Align to
      Page / Align to Path, and blend.ts can rotate generated blend steps to each
      segment direction for Illustrator-like Blend Options orientation workflows.
      2026-06-07.
- [x] **Blend step-count preview** — BlendDialog.tsx now shows a live
      estimated intermediate-object count using blend.ts estimateBlendStepCount(),
      so Specified Distance, Smooth Color, reverse, and multi-stop blends are
      predictable before applying. 2026-06-07.
- [x] **Apply Blend Options to existing blends** — BlendDialog.tsx now has an
      Apply Options action that rebuilds selected blend steps or blends referenced
      by selected endpoints with new spacing, step count, orientation, and reverse
      settings, matching Illustrator's editable Object→Blend→Blend Options flow.
      2026-06-07.
- [x] **Relink Blend Endpoint command** — Object/Blend, command palette, and
      context menu can now replace one source endpoint of an existing blend with
      another selected object, refreshing related generated steps while preserving
      their spacing/orientation metadata. 2026-06-07.
- [x] **Blend shortest rotation interpolation** — blend.ts now interpolates
      page-aligned blend rotations through the shortest angular delta, preventing
      350°→10° blends from spinning the long way around. 2026-06-07.
- [x] **Blend text and corner attribute interpolation** — blend.ts now
      interpolates optional text metrics (fontSize, tracking, leading) and rounded
      shape attributes (rx, ry, radius) when both endpoints provide them, improving
      Illustrator-like blends between labels and rounded geometry. 2026-06-07.
- [x] **Blend generated-step metadata** — blendSelection() now tags each
      generated intermediate object with __blend metadata (pair index, step index,
      t, spacing, orientation, reverse), enabling future Illustrator-like expand,
      select, and cleanup workflows. 2026-06-07.
- [x] **Blend step selection/release/expand commands** — blend.ts now exposes
      metadata-aware Select Blend Steps, Select Related Blend Steps, Expand Blend
      Steps, and Release Blend Steps operations in the menu bar, command palette,
      and canvas context menu, turning generated blends into manageable Illustrator-like
      workflow objects. 2026-06-07.
- [x] **Endpoint-aware blend metadata** — generated blend steps now store a
      stable blendId plus source endpoint object ids, so Select Related Blend Steps
      follows the exact source pair instead of matching unrelated steps that share
      only pair index or spacing options. 2026-06-07.
- [x] **Blend endpoint reselection** — Select Blend Endpoints now uses stored
      source endpoint ids to jump from generated blend steps back to their original
      editable source objects from the menu bar, command palette, or context menu.
      2026-06-07.
- [x] **Update Blend Steps command** — generated blend steps can now be refreshed
      from their current source endpoint geometry and appearance via Object/command
      palette/context-menu actions, approximating Illustrator's Update Blend workflow
      after endpoints are edited. 2026-06-07.
- [x] **Update All Blend Steps command** — the Object menu, command palette,
      and context menu now expose a document-scope update action that refreshes every
      generated blend step with stored endpoint ids, useful after editing multiple
      endpoints across a complex artwork. 2026-06-07.
- [x] **Expand/Release All Blend Steps commands** — Object/Blend, command
      palette, and context-menu actions now support document-scope expansion and
      release of every generated blend step, letting complex artwork be cleaned up
      or made permanently editable without manually selecting each blend. 2026-06-07.
- [x] **Select Blend Group command** — generated blend steps can now select
      their complete editable blend group (source endpoints plus related intermediate
      steps) from Object/Blend, the command palette, or context menu, improving
      Illustrator-like group-level blend editing workflows. 2026-06-07.
- [x] **Endpoint-driven Blend selection** — selecting a blend endpoint can now
      find related generated steps or the full source-plus-steps blend group, so
      users can navigate blends from either endpoints or intermediate objects like
      Illustrator-style editable blend structures. 2026-06-07.
- [x] **Endpoint-driven Update Blend** — selecting a source endpoint and running
      Update Blend Steps now refreshes generated steps that reference that endpoint,
      matching Illustrator-style workflows where users edit endpoints first and then
      update the blend without manually selecting intermediate objects. 2026-06-07.
- [x] **Endpoint-driven Expand/Release Blend** — selecting a blend source
      endpoint and running Expand or Release Blend Steps now targets related generated
      steps, enabling endpoint-first cleanup or permanent-edit workflows without
      selecting intermediate blend objects manually. 2026-06-07.
- [x] **Reverse Blend Steps command** — generated blend steps can now swap
      source endpoints, reverse step order, refresh interpolated geometry/appearance,
      and run from selected steps, selected endpoints, or document scope via Object,
      command palette, and context-menu actions. 2026-06-07.
- [x] **Select All Blend Endpoints command** — Object/Blend, command palette,
      and context menu now expose a document-wide endpoint selection command that
      collects every source object referenced by generated blend metadata, making
      complex blend endpoint edits faster. 2026-06-07.
- [x] **Select All Blend Groups command** — Object/Blend, command palette,
      and context menu now select every generated blend step plus its referenced
      source endpoints across the document, enabling document-wide blend inspection
      and editing workflows. 2026-06-07.
- [x] **Remove Orphan Blend Steps command** — Blend cleanup now removes generated
      steps whose source endpoints are missing or whose legacy metadata lacks endpoint
      references, with Object/Blend, command palette, and context-menu access for
      repairing complex edited documents. 2026-06-07.
- [x] **Select Orphan Blend Steps command** — Blend cleanup now also supports
      selecting orphan generated steps before deletion, including legacy metadata
      without endpoint ids, from Object/Blend, command palette, and context menu.
      2026-06-07.
- [x] **Select Same Scale** — selectionOps.ts now matches scaleX and scaleY
      transform values together, with MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx exposing an Illustrator-style same-scale selection
      command for non-uniformly transformed imported art. 2026-06-07.
- [x] **Select Same Skew** — selectionOps.ts now matches skewX and skewY
      transform values together, with MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx exposing an Illustrator-style same-skew selection
      command for shear-transformed layouts. 2026-06-07.
- [x] **Select Same Transform** — selectionOps.ts now combines scale,
      skew, and normalized rotation into one transform signature, with MenuBar.tsx,
      CommandPalette.tsx, and CanvasContextMenu.tsx exposing an Illustrator-style
      same-transform selection command for complex imported artwork. 2026-06-07.
- [x] **Select Same Rotation** — selectionOps.ts now normalizes object angles
      and matches rotation across artwork, with MenuBar.tsx, CommandPalette.tsx,
      and CanvasContextMenu.tsx exposing an Illustrator-style same-rotation
      selection command for transformed/imported layouts. 2026-06-07.
- [x] **Select Same Gradient Fill** — Select Same can now match Fabric
      gradient fills by type, coordinates, and color stops from the Edit menu and
      command palette for imported SVG/gradient artwork cleanup. 2026-06-07.
- [x] **Select Same Overprint** — Select Same can now match fill/stroke overprint
      metadata combinations from the Edit menu, command palette, and right-click,
      pairing the overprint controls with Illustrator-like print preflight cleanup.
      2026-06-07.
- [x] **Select Same Print Mark Type** — Select Same can now match generated crop,
      registration, bleed, and page-info print marks by `printMarkKind` from the
      Edit menu, command palette, and right-click for Illustrator-like prepress
      mark cleanup. 2026-06-07.
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
- [x] Lock Others — lockOthers() (selectionOps.ts) freezes every unlocked,
      unselected exportable object while preserving the active selection for
      complex-artwork isolation; Edit menu, command palette, and right-click.
      2026-06-07.
- [x] Select Locked Objects — selectionOps.ts can now select protected/locked
      artwork from the Edit menu, command palette, and right-click menu so users
      can find and manage locked content in dense Illustrator-like documents.
      2026-06-07.
- [x] Unlock Selection — unlockSelection() releases only the selected locked
      artwork while leaving other protected objects untouched; available from the
      Edit menu, command palette, and right-click menu. 2026-06-07.
- [x] Release Guides — releaseGuides() converts persistent ruler guides into
      editable dashed line objects and clears the guide overlay, matching
      Illustrator's View→Guides→Release Guides workflow from menu, command
      palette, and right-click. 2026-06-07.
- [x] Hidden-object management — selectHiddenObjects() and showSelection() let
      users find hidden artwork and reveal only selected hidden objects without
      exposing the whole document; Edit menu, command palette, and right-click.
      2026-06-07.
- [x] Select clipping-masked objects — selectClippingMaskedObjects() finds all
      artwork carrying a clipPath so complex mask-heavy documents can be audited
      from Select Object, command palette, and right-click. 2026-06-07.
- [x] Select open path objects — selectOpenPathObjects() finds unclosed path,
      polyline, and line artwork before Join/Clean Up/Outline workflows; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select all group objects — selectAllGroups() finds grouped artwork before
      Ungroup/Isolation Mode audits; Select Object, command palette, and right-click.
      2026-06-07.
- [x] Select point/area text objects — selectPointTextObjects() and
      selectAreaTextObjects() split point labels from textbox/area text for
      Illustrator-style typography audits; Select Object, palette, and right-click.
      2026-06-07.
- [x] Select overflowing text objects — selectOverflowingTextObjects() finds area
      text whose measured content height exceeds its text box or is explicitly
      marked overflow/hidden, matching overset-text preflight audits; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select empty text objects — selectEmptyTextObjects() finds whitespace-only
      point/area text left behind by imports or edits before Clean Up / outline
      conversion; Select Object, command palette, and right-click. 2026-06-07.
- [x] Select text-on-path objects — Text on Path / Text on Arc generated glyph
      groups now carry __textOnPath metadata and selectTextOnPathObjects() audits
      curved typography before outline, expand, or badge-layout edits; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select missing-font text objects — selectMissingFontTextObjects() finds text
      using explicit missing-font flags or families outside the registered font
      picker list so typography preflight can isolate substitutions before export;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select custom text spacing objects — selectCustomTextSpacingObjects() finds
      text with non-default tracking or leading so typography audits can isolate
      manual spacing before style normalization or export; Select Object, command
      palette, and right-click. 2026-06-07.
- [x] Select decorated text objects — selectDecoratedTextObjects() finds text with
      underline, strikethrough, or overline flags so typography audits can isolate
      special inline decorations before style cleanup/export; Select Object,
      command palette, and right-click. 2026-06-07.
- [x] Select non-left-aligned text objects — selectNonLeftAlignedTextObjects()
      finds center, right, and justified text so paragraph alignment audits can
      isolate non-default type before batch normalization/export; Select Object,
      command palette, and right-click. 2026-06-07.
- [x] Select styled text objects — selectStyledTextObjects() finds bold,
      italic, oblique, and heavy-weight text so typography audits can isolate
      local font styling before normalization/export; Select Object, command
      palette, and right-click. 2026-06-07.
- [x] Select transformed text objects — selectTransformedTextObjects() finds
      scaled, rotated, or skewed text so preflight audits can catch locally
      distorted typography before outlining, normalization, or export; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select mixed-style text objects — selectMixedStyleTextObjects() finds
      character-level inline formatting so typography audits can isolate local
      overrides before style cleanup, outlining, or export; Select Object,
      command palette, and right-click. 2026-06-07.
- [x] Select named/unnamed objects — selectNamedObjects() and selectUnnamedObjects()
      audit layer/object naming hygiene before exports or scripted workflows; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select filtered image objects — selectFilteredImageObjects() finds raster
      images carrying live Fabric filters before Clear Filters / export audits; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select cropped image objects — selectCroppedImageObjects() finds placed
      raster artwork with crop offsets or reduced crop dimensions before image
      relink/export audits; Select Object, command palette, and right-click.
      2026-06-07.
- [x] Select embedded image objects — selectEmbeddedImageObjects() finds placed
      raster artwork backed by embedded data URLs so users can audit document
      weight versus linked-image workflows; Select Object, command palette, and
      right-click. 2026-06-07.
- [x] Select linked image objects — selectLinkedImageObjects() finds placed raster
      artwork backed by external/file URLs so users can audit relink/export
      dependencies separately from embedded images; Select Object, command palette,
      and right-click. 2026-06-07.
- [x] Select missing linked image objects — selectMissingLinkedImageObjects() finds
      linked raster artwork with explicit missing/broken flags or failed image
      elements so packaging/relink audits can isolate broken dependencies; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select transformed image objects — selectTransformedImageObjects() finds
      scaled, rotated, or skewed placed rasters so preflight audits can normalize
      image geometry before packaging, tracing, or export; Select Object, command
      palette, and right-click. 2026-06-07.
- [x] Select low-resolution image objects — selectLowResolutionImageObjects()
      estimates effective raster PPI after placement scale and finds images below
      the 150ppi audit threshold before print/export; Select Object, command
      palette, and right-click. 2026-06-07.
- [x] Select high-resolution image objects — selectHighResolutionImageObjects()
      estimates effective raster PPI after placement scale and finds images above
      the 450ppi downsample audit threshold before print/export packaging; Select
      Object, command palette, and right-click. 2026-06-07.
- [x] Select transformed objects — selectTransformedObjects() finds any selectable
      artwork with non-default scale, rotation, or skew so geometry preflight can
      isolate transformed items before expand, normalize, or export workflows;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select compound path objects — selectCompoundPathObjects() finds multi-subpath
      even-odd paths before Release Compound Path / fill-rule audits; Select Object,
      command palette, and right-click. 2026-06-07.
- [x] Select stray point objects — selectStrayPointObjects() finds Move-only empty
      path anchors so imported artwork cleanup can remove Illustrator-style stray
      points before joining, outlining, or export; Select Object, command palette,
      and right-click. 2026-06-07.
- [x] Select zero-length path objects — selectZeroLengthPathObjects() finds
      degenerate line/path segments whose endpoints collapse to the same anchor,
      separating them from pure stray points for cleanup before join/outline/export;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select unpainted objects — selectUnpaintedObjects() finds objects with no
      visible fill and no visible stroke for imported-artwork audits; Select Object,
      command palette, and right-click. 2026-06-07.
- [x] Select drop-shadow objects — selectDropShadowObjects() selects every object
      with a live Fabric shadow/glow for effect audits before Expand Appearance or
      Clear Shadow; Select Object, command palette, and right-click. 2026-06-07.
- [x] Select transparency objects — selectTransparencyObjects() finds opacity and
      non-normal blend-mode artwork so complex appearance stacks can be audited
      before flattening/export; Select Object, palette, and right-click. 2026-06-07.
- [x] Select dashed-stroke objects — selectDashedStrokeObjects() finds perforation,
      cut-line, and decorative dashed strokes before expand/outline workflows;
      Select Object, palette, and right-click. 2026-06-07.
- [x] Select thin-stroke objects — selectThinStrokeObjects() finds painted strokes
      below the 0.25px hairline threshold so print/cut preflight can isolate fragile
      vector lines before outlining or export; Select Object, command palette, and
      right-click. 2026-06-07.
- [x] Select overprint objects — selectOverprintObjects() finds imported fill/stroke
      overprint metadata from common SVG/PDF-style fields so print separation and
      trapping audits can isolate risky artwork; Select Object, command palette,
      and right-click. 2026-06-07.
- [x] Select print-mark objects — selectPrintMarkObjects() finds editable crop,
      registration, bleed, and page-info objects generated by Add Print Marks so
      prepress handoff marks can be isolated before moving, locking, or cleanup;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select same-artboard objects — selectSameArtboardObjects() infers the
      active object's artboard and selects all printable objects intersecting that
      page, including bleed-crossing artwork, for Illustrator-like current-page
      edits in multi-artboard documents. 2026-06-07.
- [x] Select other-artboards objects — selectOtherArtboardsObjects() selects
      printable artwork outside the active object's artboard, making it easy to
      isolate, lock, hide, or audit non-current pages in complex multi-artboard
      documents. 2026-06-07.
- [x] Lock/Hide other artboards — lockOtherArtboards() and
      hideOtherArtboards() isolate the active object's artboard by protecting or
      concealing printable artwork on other pages while preserving generated
      overlays; menu, palette, right-click, and tests. 2026-06-07.
- [x] Unlock/Show active artboard — unlockActiveArtboard() and
      showActiveArtboard() restore editability/visibility only on the active
      object's page after artboard isolation, preserving other pages and overlays;
      menu, palette, right-click, and tests. 2026-06-07.
- [x] Lock/Hide active artboard — lockActiveArtboard() and
      hideActiveArtboard() apply page-scoped protection or concealment to the
      active object's artboard, completing symmetric current/other artboard
      isolation commands across menu, palette, right-click, and tests. 2026-06-07.
- [x] Unlock/Show other artboards — unlockOtherArtboards() and
      showOtherArtboards() restore editability/visibility outside the active
      object's artboard, completing both sides of multi-artboard isolate/restore
      controls across menu, palette, right-click, and tests. 2026-06-07.
- [x] Select outside-artboard objects — selectOutsideArtboardObjects() finds
      selectable artwork whose bounding box is fully outside the first artboard,
      catching pasteboard leftovers before print/export/package workflows;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select outside-any-artboard objects — selectOutsideAnyArtboardObjects()
      audits multi-artboard documents by selecting only artwork outside every
      artboard, avoiding false positives from valid second/third artboard content;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select inside-artboard objects — selectInsideArtboardObjects() finds
      selectable artwork fully contained by the first artboard, completing an
      Illustrator-like inside / overflow / outside artboard audit split for
      print/export preflight; Select Object, command palette, and right-click.
      2026-06-07.
- [x] Select inside-any-artboard objects — selectInsideAnyArtboardObjects()
      audits multi-artboard documents by finding artwork fully contained by any
      artboard, so valid second/third artboard artwork can be isolated without
      first-artboard bias; Select Object, palette, and right-click. 2026-06-07.
- [x] Select overflowing-artboard objects — selectOverflowingArtboardObjects()
      finds artwork intersecting the first artboard while crossing a trim edge,
      isolating bleed/clip risks separately from fully off-page leftovers;
      Select Object, command palette, and right-click. 2026-06-07.
- [x] Select overflowing-any-artboard objects —
      selectOverflowingAnyArtboardObjects() finds artwork crossing any artboard
      trim edge in multi-artboard documents for bleed/clip audits without
      first-artboard bias; Select Object, palette, and right-click. 2026-06-07.
- [x] Select Same Artboard Placement — Select Same can match the active
      object's inside / overflowing / outside first-artboard bucket, letting
      prepress cleanup batch-select artwork by trim relationship from menu,
      command palette, and right-click. 2026-06-07.
- [x] Select Same Any-Artboard Placement — Select Same can match the active
      object's multi-artboard placement bucket (inside any, overflowing any, or
      outside every artboard), giving complex multi-artboard preflight the same
      batch-cleanup affordance as first-artboard audits. 2026-06-07.
- [x] Select active-artboard inside/overflowing objects —
      selectInsideActiveArtboardObjects() and
      selectOverflowingActiveArtboardObjects() split the current page into exact
      contained vs trim-crossing artwork, closing the gap between broad same-page
      selection and multi-artboard preflight cleanup; menu, palette, right-click,
      and tests. 2026-06-07.
- [x] Select locked/hidden active-artboard objects —
      selectLockedActiveArtboardObjects() and
      selectHiddenActiveArtboardObjects() scope layer-state audits to the active
      object's page, so complex multi-artboard documents can find protected or
      invisible artwork without selecting every page; menu, palette, right-click,
      and tests. 2026-06-07.
- [x] Select visible/unlocked active-artboard objects —
      selectVisibleActiveArtboardObjects() and
      selectUnlockedActiveArtboardObjects() scope editable/visible batch picks to
      the active object's page, completing the per-page layer-state selection
      quartet for multi-artboard cleanup; menu, palette, right-click, and tests.
      2026-06-07.
- [x] Select named/unnamed active-artboard objects —
      selectNamedActiveArtboardObjects() and
      selectUnnamedActiveArtboardObjects() scope layer/object naming audits to the
      active object's page for multi-artboard rename cleanup; menu, palette,
      right-click, and tests. 2026-06-07.
- [x] Select path-preflight active-artboard objects —
      selectClippingMaskedActiveArtboardObjects(),
      selectOpenPathActiveArtboardObjects(), and
      selectCompoundPathActiveArtboardObjects() scope mask/open-path/compound-path
      cleanup audits to the active page; menu, palette, right-click, and tests.
      2026-06-07.
- [x] Select cleanup active-artboard objects —
      selectStrayPointActiveArtboardObjects(),
      selectZeroLengthPathActiveArtboardObjects(), and
      selectUnpaintedActiveArtboardObjects() scope degenerate-path and no-paint
      cleanup audits to the active page; menu, palette, right-click, and tests.
      2026-06-07.
- [x] Select appearance/prepress active-artboard objects —
      selectDropShadowActiveArtboardObjects(),
      selectTransparencyActiveArtboardObjects(),
      selectDashedStrokeActiveArtboardObjects(),
      selectThinStrokeActiveArtboardObjects(), and
      selectOverprintActiveArtboardObjects() scope appearance and print-risk audits
      to the active page; menu, palette, right-click, and tests. 2026-06-07.
- [x] Select stroke/fill active-artboard objects —
      selectCustomStrokeActiveArtboardObjects(),
      selectNonScalingStrokeActiveArtboardObjects(),
      selectPatternFillActiveArtboardObjects(), and
      selectGradientFillActiveArtboardObjects() scope stroke/fill appearance audits
      to the active page; menu, palette, right-click, and tests. 2026-06-07.
- [x] Select transformed/print-mark active-artboard objects —
      selectTransformedActiveArtboardObjects() and
      selectPrintMarkActiveArtboardObjects() scope geometry and print-handoff audits
      to the active page; menu, palette, right-click, and tests. 2026-06-07.
- [x] Select text active-artboard objects —
      selectAllTextActiveArtboardObjects(), selectPointTextActiveArtboardObjects(),
      selectAreaTextActiveArtboardObjects(), selectOverflowingTextActiveArtboardObjects(),
      and selectEmptyTextActiveArtboardObjects() scope typography cleanup audits to
      the active page; menu, palette, right-click, and tests. 2026-06-07.
- [x] Select image active-artboard objects —
      selectAllImagesActiveArtboardObjects(), filtered/cropped/embedded/linked/missing,
      transformed, and low/high-resolution image active-artboard selectors scope raster
      preflight cleanup to the active page; menu, palette, right-click, and tests.
      2026-06-07.
- [x] Select advanced text active-artboard objects —
      text-on-path, missing-font, custom-spacing, decorated, non-left-aligned,
      styled, transformed, and mixed-style text active-artboard selectors scope
      typography preflight cleanup to the active page; menu, palette, right-click,
      and tests. 2026-06-07.
- [x] Select type active-artboard objects —
      selectAllPathsActiveArtboardObjects(), selectAllShapesActiveArtboardObjects(),
      and selectAllGroupsActiveArtboardObjects() scope object-type cleanup picks to
      the active page; menu, palette, right-click, and tests. 2026-06-07.
- [x] Select Same Type active-artboard objects —
      selectSameTypeActiveArtboardObjects() limits same-object-kind cleanup to the
      active page while preserving text subtype folding; menu, palette, right-click,
      and tests. 2026-06-07.
- [x] Select Same appearance active-artboard objects —
      selectSameActiveArtboard() scopes high-frequency Select Same Fill/Stroke,
      Fill & Stroke, Fill Appearance, Stroke Appearance, and full Appearance
      cleanup to the active page; menu, palette, right-click, and tests.
      2026-06-07.
- [x] Select Same geometry active-artboard objects —
      Select Same position, bounds, edges, center, dimensions, area/aspect, scale,
      skew, rotation, and transform now have active-page commands backed by
      selectSameActiveArtboard(); menu, palette, right-click, and tests.
      2026-06-07.
- [x] Select Same text/opacity active-artboard objects —
      Select Same stroke weight, opacity, font family, font size, text appearance,
      and blend mode now have active-page commands backed by selectSameActiveArtboard();
      menu, palette, right-click, and tests. 2026-06-07.
- [x] Select Same effects/prepress active-artboard objects —
      Select Same shadow, pattern fill, gradient fill, overprint, print mark type,
      symbol, and clipping mask now have active-page commands backed by
      selectSameActiveArtboard(); menu, palette, right-click, and tests. 2026-06-07.
- [x] Select Same stroke/name/placement active-artboard objects —
      Select Same dash, line cap, line join, object name, artboard placement, and
      any-artboard placement now have active-page commands backed by
      selectSameActiveArtboard(); menu, palette, right-click, and tests. 2026-06-07.
- [x] Active artboard fit commands — Fit Active Artboard to Artwork / Selection
      now resize the artboard containing the active object instead of always using
      the first artboard, matching Illustrator multi-artboard cleanup workflows;
      menu, palette, right-click, and tests. 2026-06-07.
- [x] Select Active Artboard Objects — selectActiveArtboardObjects() provides a
      direct Select menu / palette / right-click command for selecting all exportable
      artwork intersecting the active object's artboard, matching Illustrator
      multi-artboard page cleanup. 2026-06-07.
- [x] Duplicate Active Artboard — duplicateActiveArtboard() duplicates the
      artboard containing the active object with its page artwork, exposed from
      Document, command palette, and right-click Artboard workflows for
      Illustrator-like multi-page layout reuse. 2026-06-07.
- [x] Delete Active Artboard — deleteActiveArtboard() removes the artboard
      containing the active object with confirmation from Document, command palette,
      and right-click Artboard workflows for Illustrator-like multi-page cleanup.
      2026-06-07.
- [x] Rename Active Artboard — renameActiveArtboard() and promptRenameActiveArtboard()
      rename the artboard containing the active object from Document, command palette,
      and right-click Artboard workflows for Illustrator-like page organization.
      2026-06-07.
- [x] Zoom to Active Artboard — zoomToActiveArtboard() frames the artboard
      containing the active object from View, command palette, and right-click
      workflows, matching Illustrator-style current-page navigation. 2026-06-07.
- [x] Export Active Artboard — exportActiveArtboardAsSVG() and
      exportActiveArtboardAsPNG() export the artboard containing the active
      object from File, command palette, and right-click workflows for
      Illustrator-like single-page delivery. 2026-06-07.
- [x] Export Artboard Range — parseArtboardRange(), exportArtboardRangeAsFiles(),
      and exportArtboardRangeAsPNG() support Illustrator-style ranges like
      1,3-5 from File, command palette, and right-click workflows. 2026-06-07.
- [x] ArtboardsPanel selected export — exportArtboardsByIdAsFiles() and
      exportArtboardsByIdAsPNG() let checked panel rows export selected
      artboards directly as separate SVG/PNG files. 2026-06-07.
- [x] Rearrange Artboards — rearrangeArtboards() lays out artboards into
      a grid and moves contained artwork with each page, exposed from Document,
      ArtboardsPanel, command palette, and right-click workflows for
      Illustrator-like multi-page organization. 2026-06-07.
- [x] Rearrange Artboards options — promptRearrangeArtboards() adds shared
      columns, spacing, and move-artwork prompts across Document,
      ArtboardsPanel, command palette, and right-click workflows. 2026-06-07.
- [x] Duplicate Active Artboard Frame — duplicateActiveArtboardFrame()
      duplicates only the current artboard rectangle without copying artwork,
      exposed from Document, command palette, and right-click workflows for
      Illustrator-like blank-page variants. 2026-06-07.
- [x] Previous / Next Artboard navigation — zoomToAdjacentArtboard() cycles
      through artboards from the active object or viewport center, exposed from
      View, command palette, and right-click workflows for Illustrator-like
      page browsing. 2026-06-07.
- [x] Fit All Artboards in Window — zoomToAllArtboards() frames the union
      of every artboard from View, command palette, and right-click workflows
      for Illustrator-like multi-page overview navigation. 2026-06-07.
- [x] Active Artboard order commands — reorderActiveArtboard() moves the
      current artboard earlier/later or to first/last in the artboard array,
      updating export and navigation order from Document, command palette, and
      right-click workflows. 2026-06-07.
- [x] Sort Artboards by Position — sortArtboardsByPosition() rewrites the
      artboard array to match top-to-bottom, left-to-right page layout, exposed
      from Document, command palette, and right-click workflows to repair export
      and navigation order after manual layout edits. 2026-06-07.
- [x] Renumber Artboards by Position — renumberArtboardsByPosition() sorts
      by visual page layout and rewrites names to Artboard 1..n (or localized
      prefix), exposed from Document, command palette, and right-click workflows
      for Illustrator-like export filename cleanup. 2026-06-07.
- [x] ArtboardsPanel row order controls — each artboard row now exposes
      First/Earlier/Later/Last order actions backed by reorderArtboard(), so
      users can repair export/navigation sequence directly in the panel.
      2026-06-07.
- [x] ArtboardsPanel order cleanup shortcuts — the panel header now exposes
      Sort by Position and Renumber actions backed by sortArtboardsByPosition()
      and renumberArtboardsByPosition() for Illustrator-like export cleanup.
      2026-06-07.
- [x] ArtboardsPanel duplicate-frame row action — each artboard row now
      exposes a frame-only duplicate button backed by duplicateArtboardFrame(),
      matching Illustrator workflows for blank same-size page variants.
      2026-06-07.
- [x] Select custom-stroke objects — selectCustomStrokeObjects() finds painted
      strokes with non-default caps, joins, or miter limits for imported linework
      audits before Outline Stroke; Select Object, palette, and right-click. 2026-06-07.
- [x] Select non-scaling stroke objects — selectNonScalingStrokeObjects() finds
      `strokeUniform` artwork for Scale Strokes & Effects audits before resizing
      logos/signage; Select Object, palette, and right-click. 2026-06-07.
- [x] Select pattern/gradient fill objects — selectPatternFillObjects() and
      selectGradientFillObjects() locate rich fill artwork before Clear/Expand
      Appearance; Select Object, command palette, and right-click. 2026-06-07.
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
- [x] Eyedropper rich appearance — eyedropperTool.ts now also samples
      stroke dash/caps/joins, blend mode, drop shadow, and pattern metadata for
      fuller Illustrator-like appearance transfer. 2026-06-07.
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
- [x] Select cleanup candidates — cleanUp.ts selectCleanupObjects() selects empty
      text, stray paths, and zero-size junk for audit before deletion; Object→Path,
      command palette, and right-click Clean Up. 2026-06-07.
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
- [x] Align-to-key command parity — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now expose Set Key Object plus all six Align to Key
      Object actions, so Illustrator-style key-object alignment is available from
      menus, search, and right-click without opening the Align panel. 2026-06-07.
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
- [x] Adjust Brightness — colorAdjust.ts brightnessColorsSelection()/brightenRGB()
      scale HSL lightness (−100..100%) of every solid fill/stroke; BrightnessDialog +
      Edit Colors submenu + command palette. +2 tests. Rounds out Edit Colors
      (Invert/Grayscale/Saturate/Hue/Brightness). 2026-06-03.
- [x] Pathfinder menu — Edit menu gains a Pathfinder submenu (MenuBar.tsx) with
      Union/Subtract/Intersect/Exclude/Minus Back + Divide/Trim (booleanOps.ts);
      the boolean ops were Align-panel/palette-only, absent from the menu bar.
      2026-06-03.
- [x] Swatches panel — PropertiesPanel has a full Illustrator-like Swatches
      section (default palette, localStorage `vector.swatches`, click=fill /
      Alt=stroke / right-click=remove / + add current), plus collect colours,
      global replace, and select artwork using the active swatch. 2026-06-07.
- [x] Collect colours into swatches — added a Pipette button to the existing
      PropertiesPanel Swatches that harvests every solid fill/stroke in the
      selection (collectSelectionColors) into the palette, deduped. 2026-06-03.
- [x] Rasterize — rasterize.ts rasterizeSelection() renders the selection to an
      offscreen 2×-zoomed StaticCanvas, then replaces it with a single embedded PNG
      FabricImage at the same on-screen size (Illustrator Object→Rasterize); Document
      Path submenu + command palette. 2026-06-03.
- [x] Pathfinder Crop — cropSelection() (booleanOps.ts) intersects every back
      object with the frontmost (crop frame), keeping each piece's own fill and
      discarding the frame (Illustrator Pathfinder Crop); Edit→Pathfinder submenu +
      command palette. 2026-06-03.
- [x] Keyboard increment preference — preferences.ts keyboardIncrementPx +
      getKeyboardIncrement(); the arrow-key nudge in App.tsx now reads it (Shift =
      10×) instead of a hardcoded 1px, with a Preferences field (Illustrator's
      Keyboard Increment). 2026-06-03.
- [x] Shear / Skew transform — transformOps.ts shearSelection(angle, axis) skews
      the selection's skewX/skewY about its centre (clamped ±85°) — Illustrator
      Object→Transform→Shear; ShearDialog (angle + axis) + Edit menu + command
      palette. 2026-06-03.
- [x] Distribute centers — distributeSelection(dir, 'center') (alignDistribute.ts
      distributeCentres()) equalises centre-to-centre spacing (equal pitch), the
      Illustrator distribute mode distinct from the existing equal-gap; two new
      Align-panel buttons. 2026-06-03.
- [x] Arc Warp — warp.ts warpArcPoints() (pure) + warpArcSelection() bend the
      selection into an arc/banner over a shared x-frame (parabolic Y shift,
      Illustrator Effect→Warp→Arc), distinct from Text-on-Arc; WarpDialog (bend) +
      Distort submenu + command palette. +3 tests. 2026-06-03.
- [x] Warp styles — generalised to warpPoints()/warpSelection(bend, style) with
      Arc / Rise / Flag / Wave profiles (warp.ts); WarpDialog gains a style radio
      group (Illustrator's Warp styles). +2 tests. 2026-06-03.
- [x] Banner grommets — grommets.ts grommetsFromSelection() rings the selection
      bbox's inset perimeter with evenly-spaced grommet-hole cut circles (corners +
      edges, gap-capped) for vinyl-banner finishing (SignMaster); Sign Effects
      submenu + command palette. 2026-06-03.
- [x] Grommets dialog — GrommetsDialog (inset / max spacing / diameter) replaces
      the hardcoded-defaults command, since banner sizes vary; menu + palette now
      open it. 2026-06-03.
- [x] Pathfinder Merge — mergeSelection() (booleanOps.ts) knocks out hidden
      (front-overlapped) parts then unites surviving same-fill pieces into one
      compound path each (Illustrator Pathfinder Merge), for flattening same-colour
      sign regions; Edit→Pathfinder submenu + command palette. 2026-06-03.
- [x] Right-click submenu — CanvasContextMenu.tsx SubMenu (edge-aware left/right
      flyout) folds the 7 path-effect items into a "Path Effects" submenu, cutting
      the overgrown right-click menu's length. 2026-06-03.
- [x] Pathfinder in right-click — added a Pathfinder submenu to the canvas
      right-click (Union/Subtract/Intersect/Exclude/Minus Back + Divide/Trim/Merge/
      Crop), enabled for 2+ selected; high-frequency boolean ops were menu-bar/
      palette-only on right-click before. 2026-06-03.
- [x] Margin guides — selectionOps.ts makeMarginGuides(mm) drops a safe-area frame
      of 4 ruler guides inset from the first artboard's edges; MarginGuidesDialog +
      View menu + command palette. 2026-06-03.
- [x] Right-click Sign Effects submenu — folded Multi-outline / Recolor Artwork /
      Auto-arrange / Rhinestone into a "Sign Effects" flyout in CanvasContextMenu,
      further shortening the right-click menu. 2026-06-03.
- [x] Shift-constrain while drawing — shapeDrawUpdate(sp, constrain) (shapeDrawTool.ts)
      makes Shift draw rect→square / ellipse→circle (equal extents) and snap a line
      to the nearest 45°; registerTools passes the event's shiftKey. 2026-06-03.
- [x] Shift-snap rotation — canvasEngine.ts object:rotating handler snaps the
      angle to 15° increments while Shift is held (Illustrator behaviour); additive,
      no effect without Shift. 2026-06-03.
- [x] Alt-drag duplicate — canvasEngine.ts arms an altPending clone on alt+mousedown
      over a single object and drops the copy at the drag-start position on the first
      object:moving (cleared on mouseup, so an alt-click alone never duplicates) —
      Illustrator's Alt-drag. 2026-06-03.
- [x] Double-click path to edit — canvasEngine.ts mouse:dblclick on a path switches
      to Direct Select and enterPathEdit() (Illustrator double-click-to-edit); text
      keeps Fabric's native dblclick-to-edit. 2026-06-03.
- [x] Select Next Object Above/Below — selectObjectInStack(dir) (selectionOps.ts)
      walks the z-order to select the adjacent object (Illustrator Select→Next Object
      Above/Below, Ctrl+Alt+] / [); keymap + App + command palette. Avoids hijacking
      Tab (preserves a11y focus nav). 2026-06-03.
- [x] Snap to artboard frame — applySmartSnap() (smartGuides.ts) now also snaps a
      dragged object's edges/centre to the first artboard's left/centre/right +
      top/centre/bottom (under the Smart Guides toggle), so centring/edge-aligning to
      the page snaps. 2026-06-03.
- [x] Artboard snap guide lines — the artboard-frame snap now records the matched
      page line (smartGuides.ts artGuides) and pushes it into the emitted guide
      overlay, so the blue feedback line shows when you hit a page edge/centre.
      2026-06-03.
- [x] Font-size shortcuts — adjustFontSize(delta) (textCase.ts) bumps every selected
      text object's fontSize by ±2px; bound to Ctrl+> / Ctrl+< (keymap + App) and the
      command palette (Illustrator's Increase/Decrease Font Size). 2026-06-03.
- [x] Character panel live sync — adjustFontSize now calls updateSelection() and the
      panel's syncKey includes the summary w×h, so an external font-size change
      refreshes the panel's font-size field instead of going stale. 2026-06-03.
- [x] Tracking / leading shortcuts — adjustTracking()/adjustLeading() (textCase.ts);
      Alt+←/→ nudges letter-spacing and Alt+↑/↓ line-height on a selected text object
      (Illustrator), falling through to arrow-nudge otherwise. App arrow handler.
      2026-06-03.
- [x] Tracking/leading in palette — surfaced Increase/Decrease Tracking & Leading
      as four command-palette entries (with their Alt+arrow shortcut hints) so the
      keyboard-only adjusters are discoverable. 2026-06-03.
- [x] Show/Hide Rulers — store rulersVisible flag (default true) gates the Rulers
      overlay in CanvasView; View-menu checkbox + command palette toggle it
      (Illustrator View→Rulers), for more canvas room. 2026-06-03.
- [x] Show/Hide Guides — store guidesVisible flag gates GuidesLayer's draw (hide
      without deleting); View-menu checkbox + Ctrl+; keymap/App + command palette
      (Illustrator View→Guides→Hide Guides). 2026-06-03.
- [x] Recently used fonts — FontPicker.tsx loadRecentFonts()/pushRecentFont()
      (localStorage vector.recentFonts, cap 6) + a "Recently used" section at the top
      of the font list when not searching. 2026-06-03.
- [x] Hide Others — selectionOps.ts hideOthers() hides every object not in the
      selection (Illustrator Object→Hide→Other) for focused editing; Edit menu +
      command palette (Show All reveals them). 2026-06-03.
- [x] Configurable grid size — preferences.ts gridSizePx + getGridSize(); a
      Preferences "Grid size (px)" field updates the store live and persists, and
      CanvasView applies the saved value on boot (the grid was hardcoded 20px with
      no UI). 2026-06-03.
- [x] Eyedropper copies type — eyedropperTool.ts readTextStyle() + paint() now also
      transfer font family/size/weight/style/tracking/leading/align/underline between
      text objects (Illustrator's eyedropper carries type attributes). 2026-06-03.
- [x] Select All Text Objects — selectionOps.ts selectByType()/selectAllText() select
      every text object on the canvas (Illustrator Select→Object→Text Objects), for
      batch restyling; command palette. 2026-06-03.
- [x] Distribute to artboard — distributeInArtboard(dir) (alignDistribute.ts) spreads
      the selection across the first artboard with equal gaps incl. edge margins;
      the Align panel's equal-spacing buttons use it when Align-To is set to Artboard
      (Illustrator Distribute + Align To Artboard). 2026-06-03.
- [x] Align-to-artboard command parity — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now expose all six Align to Artboard actions beside
      distribute/center artboard commands, matching Illustrator's Align To Artboard
      workflow from menu, search, and right-click surfaces. 2026-06-07.
- [x] Center on Artboard — centerOnArtboard() (alignDistribute.ts) centres each
      selected object on the first artboard on both axes in one shot; command palette.
      2026-06-03.
- [x] Constant Stroke Width — effects.ts toggleUniformStroke() flips strokeUniform on
      the selection so strokes/cut lines keep a fixed px width when scaled
      (Illustrator "Scale Strokes & Effects" off); command palette. 2026-06-03.
- [x] Export All Artboards (SVG) — artboards.ts exportAllArtboardsAsFiles() downloads
      each artboard as its own SVG via the async full-fidelity render (replacing the
      unused/incomplete sync exportAllArtboardsSVG); File menu + command palette.
      2026-06-03.
- [x] Export All Artboards (PNG) — artboards.ts exportAllArtboardsAsPNG() downloads
      each artboard as a 2× PNG (mirrors the SVG batch via exportArtboardPNG); File
      menu + command palette. 2026-06-03.
- [x] Constant-width stroke checkbox — Properties panel gains a "Constant width"
      checkbox (effects.ts setUniformStroke()) that reflects + sets strokeUniform on
      the selection, a discoverable home for the command-palette toggle. 2026-06-03.
- [x] Hide/Show All shortcuts — Ctrl+3 hides the selection and Ctrl+Alt+3 shows all
      (Illustrator defaults); keymap + App handlers + kbd hints on the existing menu /
      palette entries. Lock later gained the standard Ctrl+2 shortcut; Zoom to Selection moved to Ctrl+Shift+2.
      2026-06-03.
- [x] Font picker multi-select — FontPicker.apply() now sets fontFamily on every
      selected text object, not just the active one, so Select All Text Objects +
      pick a font restyles them all (Illustrator's font-change-across-selection /
      Find Font). 2026-06-03.
- [x] Character panel multi-select — patchActiveText() (CharacterPanel.tsx) applies
      bold/italic/size/tracking/leading/align/etc. to every selected text object, not
      just the active one (same single-object bug as the font picker). 2026-06-03.
- [x] Create Outlines on multi-selection — textToOutline.ts refactored into
      traceTextToPath() + a loop, so Create Outlines converts every selected text
      object (was single-only); canCreateOutlines() now true for 1+ text. 2026-06-03.
- [x] Ungroup All — grouping.ts ungroupAll() recursively breaks every nested group
      in the selection down to leaf objects (flatten before cutting/booleans); Edit
      menu + command palette. 2026-06-03.
- [x] Transform dialog mm/px move — TransformDialog gains a mm/px unit toggle for the
      Move X/Y fields (default mm), converting to px before applyTransform; px-only
      before, which is awkward for sign work. 2026-06-03.
- [x] Inspector Transform mm/px — PropertiesPanel Transform section (X/Y/W/H) gains a
      persisted mm/px segmented toggle (PropertiesPanel.tsx xfUnit + toU/fromU,
      localStorage vector.xfUnit, default mm); the always-visible core inspector was
      px-only while the Resize/Transform dialogs already used mm. 2026-06-03.
- [x] Shared dim unit — lift the mm/px unit into the store (editor.ts dimUnit/setDimUnit
      + readInitialDimUnit, reuses vector.xfUnit key) so the inspector and the status-bar
      selection dimensions (StatusBar.tsx dim()) always agree instead of the status bar
      staying hard-coded px. 2026-06-03.
- [x] Rulers follow unit — Rulers.tsx now ticks in the shared dimUnit (px/mm) with an
      adaptive 1-2-5-10 major step (~80px between labels; lib/rulerTicks.ts niceMajor +
      formatTick, 7 tests) instead of fixed 10/50/100 doc-px; closes the last unit gap so
      ruler labels match the inspector + status bar. 2026-06-03.
- [x] Cursor readout unit — StatusBar.tsx live cursor X/Y now converts via dim() and
      labels the shared dimUnit (was raw doc-px); the pointer position reads in mm when
      the doc is in mm, matching rulers + inspector + selection dims. 2026-06-03.
- [x] Transform dialog shared unit — TransformDialog.tsx binds its mm/px toggle to the
      store dimUnit/setDimUnit (was local useState) so the dialog opens in the document
      unit and toggling there flips inspector/rulers/status bar — one global unit. 2026-06-03.
- [x] Right-click Select Same submenu — CanvasContextMenu.tsx replaces the lone Select
      Same Fill item with a Select Same SubMenu (fill/stroke/stroke-weight/opacity) to
      match the command palette + Illustrator Select>Same; i18n.ts adds parent key. 2026-06-03.
- [x] Select Same Type — selectionOps.ts selectSameType() selects every object sharing the
      active object's type (text variants folded); wired into the right-click Select Same
      submenu + command palette (Illustrator/SignMaster Select>Same>Object Type). 2026-06-03.
- [x] Align spacing unit — AlignPanel.tsx Distribute-Spacing input now follows the shared
      dimUnit (spacing in doc unit → spacingMm via MM_TO_PX; dynamic label/aria/title) so
      px docs can enter a px gap; was hard-coded mm. 2026-06-03.
- [x] Right-click Path Effects parity — CanvasContextMenu.tsx Path Effects submenu gains
      Outline Stroke to Fill + Reverse Path Direction (were in Object>Path menu + palette
      only); high-frequency for sign/cut knockouts. 2026-06-03.
- [x] Right-click Sign Effects parity — CanvasContextMenu.tsx Sign Effects submenu gains
      Banner Grommets + Variable Data (were in Document>Sign Effects menu only); extended
      the local openModal union to cover the two modal keys. 2026-06-03.
- [x] Edit-menu Select family — MenuBar.tsx Edit menu gains a Select Same flyout
      (fill/stroke/weight/opacity/type) + Select All Text Objects + Select Inverse after
      Deselect All; were palette/right-click only (Illustrator Select menu). 2026-06-03.
- [x] Keyboard-increment unit — PreferencesDialog.tsx GeneralTab keyboard-increment field
      now displays/edits in the shared dimUnit (storage stays keyboardIncrementPx; converts
      via MM_TO_PX) so mm users can set a physical nudge step; was px-only. 2026-06-03.
- [x] Smart Punctuation — lib/smartPunctuation.ts smartenPunctuation()/smartPunctuationSelection()
      converts straight quotes→curly, --→em dash, ...→ellipsis across selected text; Type menu
      + command palette (Illustrator Type→Smart Punctuation); 6 unit tests. 2026-06-03.
- [x] Step & Repeat seamless default — RepeatDialog.tsx grid dx/dy now lazy-init from the
      selection's bounding size (was fixed 80px) so the default array tiles edge-to-edge
      like SignMaster; falls back to 80 with no selection. 2026-06-03.
- [x] Text H/V scale — CharacterPanel.tsx adds Horizontal/Vertical Scale (%) fields backed
      by the text scaleX/scaleY (10..1000%) for condensing/extending type to fit a width
      (CorelDRAW/SignMaster staple); applies across multi-text selection. 2026-06-03.
- [x] Zoom to Selection surfaces — viewport.ts zoomToSelection() extracted from App.tsx
      inline; now wired into the View menu + command palette (now Ctrl+Shift+2 after Ctrl+2 moved to Lock Selection), not keyboard-only. 2026-06-03.
- [x] Duplicate Artboard — artboards.ts duplicateArtboard() clones an artboard frame +
      its contained artwork (centre-in-bounds) offset to the row's right; ArtboardsPanel
      per-row Copy button focuses the new board (Illustrator/SignMaster). 2026-06-03.
- [x] Artboard from selection — artboards.ts createArtboardFromSelection() frames the active
      selection's bbox in place; ArtboardsPanel 'From Selection' button beside Add Artboard
      (Illustrator Artboard-from-selection), distinct from Fit-Artboard. 2026-06-03.
- [x] Pucker & Bloat — lib/pucker.ts puckerBloatPolyline()/puckerSelection() bows segments
      toward/away from the centroid (-100..100%) keeping anchors fixed; PuckerDialog +
      Distort&Transform menu/palette/right-click (Illustrator); 6 unit tests. 2026-06-03.
- [x] Edge distribution — alignDistribute.ts distributeByAnchor(dir,'start'|'center'|'end')
      adds top/bottom/left/right-edge distribute (Illustrator's 6-op set); AlignPanel.tsx
      second distribute row with 4 edge buttons. 2026-06-03.
- [x] Edge distribution command parity — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now expose horizontal/vertical center distribution plus
      left/right/top/bottom edge distribution, so Illustrator's full distribute set
      is reachable from menus, search, and right-click. 2026-06-07.
- [x] Key-object distribution command parity — MenuBar.tsx, CommandPalette.tsx,
      and CanvasContextMenu.tsx now expose the same six center/edge distribution
      commands against the current key object, matching Illustrator's key-object
      distribute workflow outside the Align panel. 2026-06-07.
- [x] Custom dash pattern — PropertiesPanel.tsx Advanced stroke gains a Custom dash field
      parsing space/comma-separated lengths into strokeDashArray (perforation/cut lines);
      presets were the only option. 2026-06-03.
- [x] Copy as SVG — exportSelection.ts copySelectionSVG() writes cropped selection SVG to
      the clipboard (Illustrator Copy as SVG); File menu + command palette. Export was
      file-only before. 2026-06-03.
- [x] Paste from Clipboard — io3.ts pasteFromSystemClipboard() imports an external image /
      SVG from the system clipboard via the async Clipboard API; File menu + command palette
      (explicit, to avoid the internal Ctrl+V paste collision). 2026-06-03.
- [x] Polar move — TransformDialog.tsx adds an XY/Polar toggle; polar Distance+Angle resolve
      to dx=dist·cos(a), dy=-dist·sin(a) (Illustrator Move dialog) in the active unit before
      applyTransform; was X/Y only. 2026-06-03.
- [x] Non-uniform scale — transformOps.ts TransformParams.scaleY (optional) + per-axis apply;
      TransformDialog Scale X%/Y% with a Link toggle (default linked); was single uniform %. 2026-06-03.
- [x] Miter limit — effects.ts StrokeStylePatch.strokeMiterLimit + apply; PropertiesPanel
      Advanced stroke shows a Miter limit field when join=miter (SVG stroke-miterlimit). 2026-06-03.
- [x] Stroke controls sync — PropertiesPanel.tsx selection-change block now hydrates dash
      preset/custom + cap + join + miter from the active object (were write-only/stale),
      matching the dash array to a preset or surfacing it in the custom field. 2026-06-03.
- [x] Blend mode sync — PropertiesPanel.tsx selection-change block hydrates blendMode from
      the object's globalCompositeOperation (was write-only/stale, same class of fix). 2026-06-03.
- [x] Trace Image surfaces — io3.ts traceSelectedImage() now returns boolean (no alert);
      wired into right-click + command palette (was Assets-panel button only); toasts on
      not-an-image / low-detail. 2026-06-03.
- [x] Select visible / unlocked batches — selectionOps.ts adds selectVisibleObjects()
      and selectUnlockedObjects(); Edit menu, right-click menu, and command palette expose
      SignMaster-style batch selection for cleaning large layouts without touching locked
      cutter/reference art. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click selection parity — CanvasContextMenu.tsx selection block now exposes
      Select All Text Objects plus Select Next Object Above/Below, matching the Edit menu
      and command palette for dense stacked sign layouts. USER_GUIDE updated. 2026-06-03.
- [x] Right-click Artboard submenu — CanvasContextMenu.tsx now exposes Create Artboard
      from Selection plus Fit Artboard to Selection/Artwork beside cut-prep operations,
      matching Illustrator's contextual artboard workflow. README + USER_GUIDE updated. 2026-06-03.
- [x] Cut-by-colour quick controls — PlotterDialog.tsx colour separation row now has
      All colors / No colors / Invert plus per-swatch Only buttons, matching SignMaster's
      one-colour-at-a-time vinyl workflow with fewer error-prone swatch toggles. README +
      USER_GUIDE updated. 2026-06-03.
- [x] Create Artboard from Selection surfaces — MenuBar.tsx Document menu and
      CommandPalette.tsx now expose the existing createArtboardFromSelection() alongside
      Fit Artboard commands, matching the Artboards panel + right-click pathway. USER_GUIDE
      updated. 2026-06-03.
- [x] Command-palette Cut prep parity — CommandPalette.tsx now exposes Generate 2 mm
      contour, Weld cut paths, Stroke edges to cut paths, Show/Hide cut preview, and Clear
      cut paths, matching the right-click Cut prep submenu for keyboard-first cutter prep.
      USER_GUIDE updated. 2026-06-03.
- [x] Right-click Edit Colors parity — CanvasContextMenu.tsx adds an Edit Colors
      submenu with Recolor Artwork, Freeform Gradient, Invert, Grayscale, Saturate, Hue,
      and Brightness, matching Document menu + command palette for high-frequency colour
      cleanup on imported sign artwork. USER_GUIDE updated. 2026-06-03.
- [x] Right-click Type submenu parity — CanvasContextMenu.tsx now exposes Create
      Outlines, Break Text into Letters/Lines, Text on Arc Up/Down, Change Case,
      and Smart Punctuation for selected text, matching the Type menu and command
      palette from the canvas context workflow. USER_GUIDE updated. 2026-06-03.
- [x] Align/distribute quick surfaces — CommandPalette.tsx now exposes the six
      core align commands, horizontal/vertical distribute, and artboard distribute;
      CanvasContextMenu.tsx adds an Align & Distribute submenu beside Pathfinder,
      matching Illustrator/SignMaster's high-frequency layout workflow without
      requiring the side panel. README + USER_GUIDE updated. 2026-06-03.
- [x] Select Object by type parity — selectionOps.ts adds selectAllImages(),
      selectAllPaths(), and selectAllShapes() beside text selection; Edit menu,
      command palette, and right-click Select Object submenu expose text/image/path/
      shape batch selection for imported artwork cleanup and cutter prep. README +
      USER_GUIDE updated. 2026-06-03.
- [x] Right-click Transform submenu parity — CanvasContextMenu.tsx now groups
      Transform, Resize, Shear, Repeat, Transform Again, Flip, and 90°/180° rotate
      under a contextual Transform submenu, matching the menu bar + command palette
      for high-frequency layout edits without leaving the canvas. USER_GUIDE updated.
      2026-06-03.
- [x] Right-click Export Selection parity — CanvasContextMenu.tsx adds an
      Export Selection submenu with Export Selection as SVG, Export Selection as PNG,
      and Copy as SVG, matching the File menu + command palette for quick handoff of
      only the selected artwork from the canvas context. README + USER_GUIDE updated.
      2026-06-03.
- [x] Right-click View / Guides parity — CanvasContextMenu.tsx adds a View /
      Guides submenu for Outline View, grid/snap/smart-guide/anchor-snap toggles,
      rulers, show/lock guides, Make Guides from Selection, Margin Guides, and Clear
      Guides, matching View menu + command palette from the canvas context. README +
      USER_GUIDE updated. 2026-06-03.
- [x] Image filter quick surfaces — existing filters.ts operations are now exposed
      in CommandPalette.tsx and the right-click Image Filters submenu (Blur, Sepia,
      Grayscale, Brightness +/- presets, Contrast +, Hue rotate, Clear), giving
      imported raster artwork SignMaster-style quick cleanup without hunting code-only
      APIs. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click typography nudges — CanvasContextMenu.tsx Type submenu now exposes
      Increase/Decrease Font Size, Tracking, and Leading beside text outline/path/case
      actions, matching the command palette for SignMaster-style quick text fitting
      directly from the canvas. USER_GUIDE updated. 2026-06-03.
- [x] Right-click Find & Replace parity — CanvasContextMenu.tsx Type submenu now opens
      Find & Replace without requiring a preselected text object, matching the Edit/Type
      menu and command palette for Illustrator-style copy correction from the canvas.
      README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click single-line text parity — CanvasContextMenu.tsx Type submenu now
      opens the existing Single-line Text dialog from the canvas context, reducing
      engraving/pen-plotter text setup trips through the menu bar. README + USER_GUIDE
      updated. 2026-06-03.
- [x] Right-click Warp/Blend parity — CanvasContextMenu.tsx Path Effects submenu
      now exposes Arc Warp and Blend beside the existing live path effects, matching
      the Object menu and command palette for banner arcs and interpolated sign
      artwork from the canvas context. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click insert/layout parity — CanvasContextMenu.tsx now adds an
      Insert / Layout submenu with Star / Polygon and Split Into Grid, matching
      the Object menu and command palette for fast badge bursts, polygons, panels,
      and label-grid setup from the canvas context. README + USER_GUIDE updated.
      2026-06-03.
- [x] Right-click print/output parity — CanvasContextMenu.tsx now adds a
      Print / Output submenu with Print and Tile Print, matching the File menu,
      command palette, and SignMaster large-format handoff flow directly from
      the canvas context. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click help/settings parity — CanvasContextMenu.tsx now adds a
      Help / Settings submenu for Help Center, Preferences, and Customize
      Shortcuts, matching the Help menu and command palette for in-context
      discoverability and shortcut tuning. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click document/template parity — CanvasContextMenu.tsx Artboard
      submenu now opens Document Settings and New from Template beside artboard
      fit/create actions, matching the Document/File menu and command palette for
      fast job setup from the canvas context. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click command-palette parity — CanvasContextMenu.tsx Help / Settings
      submenu now opens Command Palette with Ctrl+K shown beside Help Center,
      Preferences, and shortcut customization, improving command discoverability
      from the canvas context. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click Clean Up parity — CanvasContextMenu.tsx Path Effects submenu
      now exposes Clean Up without requiring a selection, matching Object menu and
      command palette cleanup for imported SVG/sign files with stray points or empty
      text. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click symbol-save parity — CanvasContextMenu.tsx Insert / Layout
      submenu now saves the current selection as a reusable Symbol, matching the
      Symbols panel workflow for reusable logos, badges, and sign components without
      leaving the canvas. README + USER_GUIDE updated. 2026-06-03.
- [x] Select Same text attributes — selectionOps.ts now supports fontFamily
      and fontSize matching; Edit menu, command palette, and right-click Select Same
      expose font/size batch selection for imported text cleanup and typography
      normalization. README + USER_GUIDE updated. 2026-06-03.
- [x] Select Same blend mode — selectionOps.ts now supports matching
      globalCompositeOperation; Edit menu, command palette, and right-click Select Same
      expose blend-mode batch selection for cleaning imported transparency and
      Illustrator-style appearance groups. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click arrowhead parity — CanvasContextMenu.tsx Path Effects submenu now
      exposes Add Arrowhead (Start), Add Arrowhead (End), and Add Arrowheads (Both),
      matching the Document Path menu and command palette for sign/dimension line
      finishing directly from the canvas context. README + USER_GUIDE updated.
      2026-06-03.
- [x] Right-click average-anchor parity — CanvasContextMenu.tsx Path Effects submenu
      now exposes Average Anchor Points with Ctrl+Alt+J, matching the Object Path
      menu and command palette for direct-select node cleanup without leaving the
      canvas context. README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click stroke appearance parity — CanvasContextMenu.tsx now exposes a
      Stroke alignment submenu with Center / Inside / Outside and Constant Stroke
      Width, matching the Properties panel + command palette for Illustrator-style
      appearance fixes directly from the canvas. README + USER_GUIDE updated.
      2026-06-03.
- [x] Blend-mode quick surfaces — CommandPalette.tsx now exposes common Blend mode
      commands (Normal, Multiply, Screen, Overlay, Difference) and CanvasContextMenu.tsx
      adds a Blend mode submenu with Normal / Multiply / Screen / Overlay / Darken /
      Lighten / Difference, matching Properties-panel appearance edits from keyboard
      and right-click workflows. README + USER_GUIDE updated. 2026-06-03.
- [x] Pattern-fill quick presets — CommandPalette.tsx now exposes Checker / Stripes /
      Dots / Crosshatch commands, and CanvasContextMenu.tsx adds a Pattern Fill submenu
      with the same presets for fast sign-background textures before fine-tuning in the
      Properties panel. README + USER_GUIDE updated. 2026-06-03.
- [x] Drop-shadow quick presets — CommandPalette.tsx now exposes Soft Shadow, Hard
      Shadow, Glow, and Clear Shadow; CanvasContextMenu.tsx adds a Drop shadow submenu
      with the same presets, matching Properties-panel appearance edits from keyboard
      and right-click workflows. README + USER_GUIDE updated. 2026-06-03.
- [x] Stroke style quick presets — CommandPalette.tsx now exposes Solid / Dashed /
      Dotted dash commands plus butt/round/square caps and miter/round/bevel joins, while
      CanvasContextMenu.tsx adds a Stroke style submenu with Dash, Line cap, and
      Line join presets for fast cutter/perforation and dimension-line finishing
      without opening Properties. README + USER_GUIDE updated. 2026-06-03.
- [x] Opacity quick presets — CommandPalette.tsx now exposes 100% / 75% / 50% /
      25% opacity commands, and CanvasContextMenu.tsx adds an Opacity submenu beside
      blend/shadow/pattern appearance controls for faster watermark, overlay, proof,
      and transparent guide workflows without opening Properties. README + USER_GUIDE
      updated. 2026-06-03.
- [x] Stroke width quick presets — CommandPalette.tsx now exposes 0 / 0.5 / 1 /
      2 / 4 / 8 px stroke-width commands, and CanvasContextMenu.tsx adds a Stroke
      width submenu beside alignment/style controls for fast no-stroke, hairline cut,
      and bold sign-outline workflows without opening Properties. README +
      USER_GUIDE updated. 2026-06-03.
- [x] Fill/stroke quick toggles — CommandPalette.tsx now exposes No Fill and No
      Stroke beside Swap Fill/Stroke and Default Fill/Stroke, while CanvasContextMenu.tsx
      adds a Fill / Stroke submenu with Swap, Default, No Fill, and No Stroke for
      Illustrator-style appearance cleanup directly from the canvas. README +
      USER_GUIDE updated. 2026-06-03.
- [x] Right-click Hide Others parity — CanvasContextMenu.tsx now exposes Hide
      Others beside Hide Selection and Show All, matching the Edit menu and command
      palette for Illustrator-style focused cleanup of crowded imported sign layouts.
      README + USER_GUIDE updated. 2026-06-03.
- [x] Right-click system clipboard import — CanvasContextMenu.tsx now exposes Paste
      from Clipboard beside Paste / Paste Here / Paste in Place / Front / Back, reusing
      io3.ts pasteFromSystemClipboard() so external SVG or raster artwork can be imported
      directly from the canvas context. README + USER_GUIDE updated. 2026-06-03.
- [x] Edit-menu stack selection parity — MenuBar.tsx now exposes Select Next
      Object Above / Below with Ctrl+Alt+] / Ctrl+Alt+[ beside Select Inverse, matching
      the command palette and right-click menu for dense stacked-object selection.
      USER_GUIDE updated. 2026-06-03.
- [x] Command-palette Cut Contour suite — CommandPalette.tsx now exposes Cut
      Contour… with Ctrl+Shift+C and keywords for offset, trace, registration marks,
      print-and-cut, and vinyl cutter workflows, matching the Document menu and right-click
      Cut prep path for keyboard-first access to the multi-tab cutter dialog. USER_GUIDE
      updated. 2026-06-03.
- [x] Select Same stroke styles — selectionOps.ts now matches strokeDashArray,
      strokeLineCap, and strokeLineJoin; Edit menu, command palette, and right-click
      Select Same expose dash/cap/join batch selection for imported linework cleanup,
      dashed cut lines, and dimension/sign strokes. README + USER_GUIDE updated.
      2026-06-03.
- [x] Right-click advanced Select Same — CanvasContextMenu.tsx now mirrors
      appearance, shadow, pattern, gradient, symbol, and clipping-mask Select Same
      modes for fast on-canvas cleanup without opening the menu bar or palette.
      2026-06-07.
- [x] Right-click appearance cleanup parity — CanvasContextMenu.tsx now mirrors
      Clear Appearance, Clear Gradient Fill, Clear/Expand Pattern Fill, and
      Expand Drop Shadow from the menu bar and command palette so complex
      appearance cleanup can finish directly from the canvas. 2026-06-07.
- [x] Command-palette export parity — CommandPalette.tsx now exposes Export DXF
      (paths) and Export JSON using the shared format registry, matching the File menu
      for CAD handoff and automation/backup workflows from keyboard search. USER_GUIDE
      updated. 2026-06-03.
- [x] Command-palette Freeform Gradient parity — CommandPalette.tsx now exposes
      Freeform Gradient… beside Recolor Artwork so keyboard-first users can create
      rasterized mesh-style highlights/shading without digging through menus or the
      canvas context menu. README + USER_GUIDE updated. 2026-06-03.
- [x] Command-palette snap/guides toggles — CommandPalette.tsx now exposes
      Snap to Grid, Smart Guides, and Anchor Snap beside rulers/guides commands,
      matching the View menu + canvas context menu for keyboard-first layout and
      path-edit precision setup. README + USER_GUIDE updated. 2026-06-03.
- [x] Command-palette clipboard basics — CommandPalette.tsx now exposes Copy,
      Cut, and Paste with Ctrl+C / Ctrl+X / Ctrl+V beside Duplicate and Paste in
      Place/Front/Back, matching keyboard shortcuts and the canvas context menu for
      users who search common Illustrator clipboard actions. README + USER_GUIDE
      updated. 2026-06-03.
- [x] Command-palette paste feedback — Paste in Place / Front / Back now warn
      when the internal canvas clipboard is empty or unavailable, matching the new
      basic Paste command's feedback so keyboard-search clipboard workflows never
      fail silently. USER_GUIDE updated. 2026-06-03.
- [x] Edit-menu clipboard parity — MenuBar.tsx now exposes Cut, Copy, and
      Paste with Ctrl+X / Ctrl+C / Ctrl+V between Undo/Redo and Find & Replace,
      matching Illustrator's Edit menu plus the command palette and canvas context
      menu while preserving empty-selection/clipboard feedback. USER_GUIDE updated.
      2026-06-03.
- [x] Edit-menu advanced paste parity — MenuBar.tsx now exposes Paste in
      Place, Paste in Front, and Paste in Back with Ctrl+Shift+V / Ctrl+F / Ctrl+B
      beside standard Paste, matching the command palette and right-click menu for
      Illustrator-style stacking/location paste workflows. USER_GUIDE updated.
      2026-06-03.
- [x] Edit-menu duplicate/delete parity — MenuBar.tsx now exposes Duplicate
      and Delete with Ctrl+D / Del beside clipboard commands, matching the command
      palette and canvas context menu for common Illustrator object-edit actions.
      USER_GUIDE updated. 2026-06-03.
- [x] Edit-menu Isolation Mode feedback — MenuBar.tsx now warns when
      Isolation Mode is invoked without a selected group, matching the command palette
      and making the Edit menu workflow explain why group editing did not start.
      USER_GUIDE updated. 2026-06-03.
- [x] Group/Ungroup feedback parity — MenuBar.tsx and CommandPalette.tsx now
      warn when Group is invoked with fewer than two selected objects or Ungroup is
      invoked without a selected group, matching the disabled canvas context menu's
      intent and making grouping workflows explain failures. USER_GUIDE updated.
      2026-06-03.
- [x] Z-order command feedback parity — MenuBar.tsx and CommandPalette.tsx now
      warn when Bring to Front / Forward / Send Backward / Send to Back are invoked
      without a selection, matching the canvas context menu's disabled state and
      avoiding silent no-ops in keyboard/menu workflows. USER_GUIDE updated.
      2026-06-03.
- [x] Transform dialog entry feedback — MenuBar.tsx and CommandPalette.tsx now
      warn instead of opening Transform / Resize / Shear / Repeat dialogs with no
      selection, matching the canvas context menu's disabled state for transform
      workflows. USER_GUIDE updated. 2026-06-03.
- [x] Rotate/flip command feedback parity — MenuBar.tsx and CommandPalette.tsx now
      warn when Rotate 90°/180° or Flip Horizontal/Vertical are invoked without a
      selection, matching the canvas context menu's disabled state for quick transform
      workflows. USER_GUIDE updated. 2026-06-03.
- [x] Color dialog entry feedback — MenuBar.tsx and CommandPalette.tsx now
      warn instead of opening Recolor, Freeform Gradient, Saturate, Hue, or Brightness
      dialogs with no selection, matching the canvas context menu's disabled Edit Colors
      workflow. USER_GUIDE updated. 2026-06-03.

- [x] Command-palette appearance feedback — CommandPalette.tsx now warns when
      No Fill / No Stroke, stroke width/alignment/style, blend mode, pattern fill,
      drop shadow, or opacity presets are invoked without a selection, matching the
      canvas context menu's disabled-state workflow and avoiding silent no-ops.
      USER_GUIDE updated. 2026-06-03.

- [x] Path/effect dialog entry feedback — MenuBar.tsx and CommandPalette.tsx now
      warn instead of opening selection-dependent Cut Contour, Simplify, Round Corners,
      Offset Path, Roughen/Zig Zag/Pucker/Twist/Free Distort/Warp, Blend, Multi-outline,
      Rhinestone, Grommets, or Variable Data dialogs without enough selected objects,
      matching the canvas context menu's disabled-state workflow. USER_GUIDE updated.
      2026-06-03.

- [x] Pathfinder/mask command feedback — MenuBar.tsx and CommandPalette.tsx now
      warn when Divide / Trim, Make or Release Clip Mask, and Make or Release Compound
      Path cannot run because the selection is missing, too small, or not the expected
      object type, matching existing Merge/Crop feedback and avoiding silent no-ops.
      USER_GUIDE updated. 2026-06-03.

- [x] Object and base Pathfinder feedback — MenuBar.tsx and CommandPalette.tsx now
      warn when Duplicate/Delete/Lock/Hide are invoked without a selection, when Unlock
      All or Show All have nothing to change, and when Union/Subtract/Intersect/Exclude/
      Minus Back cannot produce a boolean result, making menu and command-palette flows
      match the clarity of the context menu. USER_GUIDE updated. 2026-06-03.

- [x] Help/settings quick surfaces — CommandPalette.tsx now exposes Debug Panel and
      High Contrast beside theme/preferences/help commands, and CanvasContextMenu.tsx
      Help / Settings now opens Keyboard Shortcuts plus Light/Dark Theme and High
      Contrast toggles, matching the Help menu for canvas-first troubleshooting and
      accessibility workflows. USER_GUIDE updated. 2026-06-03.

- [x] Context-menu boolean/reveal feedback — CanvasContextMenu.tsx now mirrors the
      menu bar and command palette by warning when Union/Subtract/Intersect/Exclude/
      Minus Back fail to generate a result, and by warning instead of showing 0-item
      success for Unlock All or Show All when nothing changes. 2026-06-03.

- [x] Right-click full export parity — CanvasContextMenu.tsx now expands Export into
      full-document SVG/PNG/JPG/PDF/vector PDF/DXF/JSON actions plus all-artboards and
      selection-only export/copy actions, matching the File menu and command palette for
      canvas-first handoff workflows. USER_GUIDE updated. 2026-06-03.

- [x] Scrollable context flyouts — CanvasContextMenu.tsx flyout submenus now cap at
      70vh and scroll internally, keeping long Export / Select Same / appearance lists
      usable on smaller screens instead of overflowing off the viewport. USER_GUIDE
      updated. 2026-06-03.

- [x] Scrollable context root menu — CanvasContextMenu.tsx now caps the root menu at
      90vh with internal scrolling, so the expanded canvas-first command surface remains
      reachable on laptop and tablet-sized viewports. USER_GUIDE updated. 2026-06-03.

- [x] Right-click file/import parity — CanvasContextMenu.tsx now adds a
      File / Import submenu with New, New from Template, Open SVG / JSON,
      Import Image, Paste from Clipboard, Open Project, Save Project, and
      Save Project As, giving canvas-first users the same project/open/import
      entry points as the File menu and command palette. USER_GUIDE updated.
      2026-06-03.


- [x] Recent Files command/context parity — CommandPalette.tsx now exposes
      Open Recent entries plus Clear Recent, and CanvasContextMenu.tsx mirrors
      the same recent-project actions inside File / Import, so project recall
      is no longer limited to the top File menu. USER_GUIDE updated.
      2026-06-03.


- [x] Selection rename workflow — selectionOps.ts now provides renameSelection(),
      and Edit menu, command palette, and canvas right-click expose Rename
      Selection so users can name selected artwork directly from Illustrator-style
      edit surfaces and keep Layers-panel rows readable during imported-sign cleanup.
      USER_GUIDE updated. 2026-06-03.


- [x] Recent/rename localization polish — i18n.ts now translates Open Recent,
      File / Import, Rename Selection, Object name, and renamed-object feedback,
      keeping the newly added command-palette and right-click workflows coherent
      in the Chinese UI. 2026-06-03.


- [x] Right-click zoom/view parity — CanvasContextMenu.tsx now adds Zoom In,
      Zoom Out, Actual Size, Fit to Page, and Zoom to Selection at the top of
      View / Guides, matching the View menu and command palette for canvas-first
      navigation in dense sign layouts. USER_GUIDE updated. 2026-06-03.


- [x] Select Same by name — selectionOps.ts can now match object names, and
      Edit menu, command palette, and right-click Select Same expose Select Same
      Name with Chinese translations, pairing the new Rename Selection workflow
      with batch cleanup for named imported artwork. USER_GUIDE updated.
      2026-06-03.


- [x] Properties-panel object naming — selection summaries now carry object
      names and PropertiesPanel.tsx adds a Selection / Object name field that
      commits on blur or Enter, giving users an inspector-based way to name
      artwork for Layers-panel organization and Select Same Name cleanup.
      USER_GUIDE updated. 2026-06-03.


- [x] Rename refresh consistency — renameSelection() now emits selection and
      object-modified events after writing object names, so Properties-panel
      summaries, Layers-panel rows, autosave, and undo history update immediately
      when names are changed from menus, command palette, right-click, or the
      Properties object-name field. USER_GUIDE updated. 2026-06-03.


- [x] Right-click plotter output parity — CanvasContextMenu.tsx now includes
      Send to Plotter inside Print / Output beside Print and Tile Print, matching
      the File menu for users who think of cutter handoff as an output workflow.
      USER_GUIDE updated. 2026-06-03.


- [x] Print Prep direct access — store/editor now supports an openPrintPrep
      flag so File menu, command palette, and right-click Print / Output can
      open Print with the Print Prep section expanded for crop marks, registration
      marks, and bleed setup. USER_GUIDE updated. 2026-06-03.


- [x] Editable print marks on canvas — printMarks.ts can generate crop marks,
      registration targets, bleed indicator, and page-info text around the first
      artboard as selectable Fabric objects; File menu, command palette, and
      right-click Print / Output can add or clear them for Illustrator-like
      prepress layout handoff. 2026-06-07.


- [x] One-click plotter prep shortcuts — shared cutPrepActions now let File menu,
      command palette, and canvas right-click add cutter registration marks or a
      weed border without opening Send to Plotter first, while PlotterDialog uses
      the same helper so bounds and toast feedback stay consistent. README and
      USER_GUIDE updated. 2026-06-03.


- [x] Layers-panel batch controls — LayersPanel.tsx now exposes Visible,
      Unlocked, Hide Others, Show All, and Unlock All quick actions above the
      layer list, reusing existing selection/visibility/lock operations with
      toast feedback so Illustrator/SignMaster-style object cleanup can start
      directly from the layer stack. README and USER_GUIDE updated. 2026-06-03.


- [x] Menu-bar Type workflow parity — MenuBar.tsx now adds a Document → Type
      submenu for Create Outlines, Break Text, Text on Arc, font-size/tracking/
      leading nudges, Single-line Text, Find & Replace, Change Case, and Smart
      Punctuation, matching the right-click Type submenu and command palette for
      users who work from the top menu. README and USER_GUIDE updated. 2026-06-03.


- [x] Menu-bar Image workflow parity — MenuBar.tsx now adds Document → Image
      with Trace Image, Rasterize, and Image Filters presets (Blur, Sepia,
      Grayscale, Brightness +/-, Contrast +, Hue rotate, Clear), matching the
      right-click and command-palette raster workflows for imported bitmap cleanup.
      README and USER_GUIDE updated. 2026-06-03.


- [x] Menu-bar Appearance workflow parity — MenuBar.tsx now adds Document →
      Appearance with fill/stroke toggles, stroke alignment/width/style presets,
      blend modes, opacity presets, pattern fills, and drop-shadow presets, matching
      right-click and command-palette appearance workflows for menu-first users.
      README and USER_GUIDE updated. 2026-06-03.


- [x] Menu-bar Align/Distribute parity — MenuBar.tsx now adds Document → Align &
      Distribute with horizontal/vertical align, equal-spacing distribute, artboard
      distribute, and Center on Artboard, matching the right-click submenu and command
      palette for menu-first layout workflows. README and USER_GUIDE updated. 2026-06-03.


- [x] Focused plotter-prep cleanup — cutPrepActions now provides Clear positioning
      marks and Clear weed borders, surfaced in File menu, Document menu, command
      palette, right-click Cut prep, and right-click Print / Output so users can
      remove registration/weed helper geometry without clearing contour cut paths.
      README and USER_GUIDE updated. 2026-06-03.


- [x] Plotter-dialog prep cleanup parity — PlotterDialog.tsx now exposes Clear
      weed borders and Clear positioning marks beside the existing add/redo buttons,
      using the shared cutPrepActions cleanup helpers so users can fix helper geometry
      without leaving Send to Plotter. USER_GUIDE updated. 2026-06-03.


- [x] Status-bar cut output shortcut — the pink cut-path count now opens Send to
      Plotter / Cutter directly, with Shift/Alt-click reserved for returning to
      Cut Contour, matching sign-software output workflows where ready cut jobs
      are one click from production. README and USER_GUIDE updated. 2026-06-03.



- [x] Status-bar snap toggles — GRID / SNAP / GUIDES / ANCHOR badges now toggle
      grid visibility, grid snapping, smart guides, and anchor snapping directly
      from the status bar, matching Illustrator / SignMaster quick precision
      workflows without opening View menus. README and USER_GUIDE updated. 2026-06-03.



- [x] Command-palette grid toggle parity — CommandPalette.tsx now exposes Show
      Grid beside rulers, snap, smart guides, anchor snap, and guide toggles so
      keyboard-first layout users can fully control precision overlays from Ctrl+K.
      USER_GUIDE updated. 2026-06-03.



- [x] State-aware command-palette toggles — View and Window toggle commands now
      show Hide/Disable/Unlock labels when grid, rulers, snap, smart guides,
      anchor snap, guides, guide locks, or high contrast are already enabled,
      matching the right-click menu and reducing keyboard-first mode mistakes.
      README and USER_GUIDE updated. 2026-06-03.



- [x] Command-palette theme/outline state labels — Ctrl+K now mirrors the
      right-click Help / Settings and View / Guides menus by showing Dark Theme
      or Light Theme plus Hide Outline View when those toggles are active, making
      keyboard-first display-mode changes explicit before users press Enter.
      README and USER_GUIDE updated. 2026-06-03.



- [x] Help-menu theme label parity — MenuBar.tsx now shows Dark Theme or Light
      Theme based on the active mode, matching the right-click Help / Settings
      submenu and command palette so every theme surface says what pressing it
      will do. USER_GUIDE updated. 2026-06-03.



- [x] High-contrast label parity — Help menu, right-click Help / Settings, and
      command palette now all expose Disable High Contrast when the accessibility
      mode is active, with en/zh i18n coverage so users know the next action.
      USER_GUIDE updated. 2026-06-03.



- [x] Update-check surface parity — Check for Updates is now exposed from the
      command palette and right-click Help / Settings submenu in addition to the
      Help menu, using the same checkAndPrompt confirmation path so users can
      verify releases without leaving their current workflow. README and
      USER_GUIDE updated. 2026-06-03.



- [x] Plotter shortcut visibility parity — Send to Plotter now shows Ctrl+Shift+P
      in the File menu, command palette, and both right-click output surfaces,
      matching the existing keymap so cutter users can discover the production
      shortcut without opening Customize Shortcuts. USER_GUIDE updated. 2026-06-03.



- [x] Cut Contour shortcut visibility parity — the right-click Cut prep submenu
      now shows Ctrl+Shift+C beside Cut Contour, matching the Document menu,
      command palette, and keymap so contour setup is discoverable from canvas
      workflows. USER_GUIDE updated. 2026-06-03.



- [x] Topbar plotter shortcut hint — the Plotter button tooltip and aria shortcut
      now expose Ctrl+Shift+P, matching File menu, right-click output, command
      palette, and the keymap for faster cutter-output discovery. 2026-06-03.



- [x] Join Paths shortcut documentation — USER_GUIDE now calls out Ctrl+J for
      Join Paths across Edit menu, right-click Path Effects, and command palette,
      improving discoverability for imported line-art cleanup and cutter contour
      preparation. 2026-06-03.



- [x] Transform shortcut visibility parity — right-click Transform now shows
      Shift+H / Shift+V for Flip Horizontal / Vertical, and USER_GUIDE documents
      those plus Ctrl+Alt+D for Transform Again so SignMaster-style layout edits
      are discoverable from the canvas workflow. 2026-06-03.


- [x] Command-palette mask shortcut parity — clipping-mask and compound-path
      commands now use the same stable keymap ids, Illustrator-style labels, and
      visible Ctrl+7 / Ctrl+Alt+7 / Ctrl+8 / Ctrl+Alt+8 shortcuts as the Document
      menu, making mask/path workflows discoverable from Ctrl+K. README and
      USER_GUIDE updated. 2026-06-03.


- [x] Right-click type shortcut parity — CanvasContextMenu.tsx now shows Ctrl+> /
      Ctrl+< plus Alt+arrow shortcuts for font size, tracking, and leading, and uses
      the same tracking/leading step sizes as Document → Type and the command palette
      so canvas-first text fitting behaves consistently. README and USER_GUIDE updated.
      2026-06-03.


- [x] View-menu zoom shortcut parity — Document/View menu zoom items now display
      Ctrl+= / Ctrl+- / Ctrl+1 / Ctrl+0, matching the keymap, command palette, and
      right-click View / Guides submenu; CommandPalette also uses the stable view.zoomFit
      id for Fit to Page so high-frequency navigation shortcuts are
      discoverable from every view surface. README and USER_GUIDE updated. 2026-06-03.


- [x] Z-order shortcut visibility parity — Bring to Front / Forward and Send
      Backward / to Back now show Ctrl+] / Ctrl+[ plus Shift variants in the
      Document menu, command palette, and right-click canvas menu, matching the
      existing keymap behavior for fast Illustrator-style stacking edits. README
      and USER_GUIDE updated. 2026-06-03.


- [x] Right-click hide/show shortcut parity — CanvasContextMenu.tsx now shows
      Ctrl+3 for Hide Selection and Ctrl+Alt+3 for Show All, matching the keymap,
      Edit menu, and command palette so focus-editing shortcuts are discoverable
      from the canvas context workflow. README and USER_GUIDE updated. 2026-06-03.


- [x] Right-click undo/redo parity — CanvasContextMenu.tsx now exposes Undo and
      Redo at the top of the canvas menu with Ctrl+Z / Ctrl+Y and live disabled
      states, matching the Edit menu and command palette for quick recovery during
      canvas-first layout and cutter-prep workflows. README and USER_GUIDE updated.
      2026-06-03.


- [x] Alternate redo shortcut visibility — Redo now shows Ctrl+Y / Ctrl+Shift+Z
      in the Edit menu, command palette, toolbar tooltip, and right-click canvas
      menu, matching the existing keymap plus Illustrator muscle memory for undo/
      redo recovery. README and USER_GUIDE updated. 2026-06-03.


- [x] Right-click debug-panel parity — CanvasContextMenu.tsx Help / Settings now
      exposes Debug Panel with Ctrl+Shift+D, matching the Help menu and command
      palette so diagnostics are reachable from canvas-first workflows without
      leaving the current context. README and USER_GUIDE updated. 2026-06-03.


- [x] Keyboard guide coverage parity — USER_GUIDE now lists paste variants
      (Ctrl+Shift+V / Ctrl+F / Ctrl+B), Select/Deselect All, Swap Fill/Stroke,
      and Show/Hide Guides beside the already visible menu, context-menu, command
      palette, and keymap surfaces, improving shortcut recall for Illustrator and
      SignMaster users. README updated. 2026-06-03.


- [x] Test-cut output surface parity — File menu, command palette, right-click
      Cut prep, and right-click Print / Output now expose Save Test Cut File,
      sharing the same HP-GL calibration pattern as the Plotter dialog so cutter
      operators can dial in blade force/offset before opening the full output
      dialog or touching USB send. README and USER_GUIDE updated. 2026-06-03.


- [x] Banner-grommet output parity — Banner Grommets is now reachable from the
      Document cut-prep group, command palette File/output search, right-click
      Cut prep, and right-click Print / Output, not only Sign Effects, so
      SignMaster-style banner finishing stays in the cutter-output workflow.
      README and USER_GUIDE updated. 2026-06-03.


- [x] Output-nesting surface parity — Auto-arrange (Nest) is now available from
      File/Print output, command palette File/output search, and right-click
      Print / Output, matching SignMaster's habit of nesting material before
      registration marks, weed borders, grommets, or plotter send. README and
      USER_GUIDE updated. 2026-06-03.


- [x] Select Inverse shortcut parity — Select Inverse now has a stable
      Ctrl+Shift+I keymap binding plus App handler, visible shortcuts in the
      Edit menu, command palette, and canvas context menu, and USER_GUIDE
      coverage for quick imported-artwork cleanup. README updated. 2026-06-03.


- [x] Eyedropper guide parity — USER_GUIDE now lists Measure (M) and
      Eyedropper (I) in the tool shortcut table and documents Illustrator-style
      appearance sampling plus Alt/Option reverse-apply behavior; README now
      calls out Measure/Eyedropper tools and Eyedropper sampling. 2026-06-03.


- [x] Toolbar Measure/Eyedropper parity — the left toolbar now exposes Measure
      and Eyedropper beside navigation tools, using registry icons and M/I
      shortcut badges, so Illustrator-style measuring and appearance sampling
      are discoverable without memorising single-key shortcuts. README and
      USER_GUIDE updated. 2026-06-03.


- [x] Short-window toolbar access — desktop vertical toolbars now scroll within
      the canvas height, while the existing mobile toolbar remains horizontal,
      so newly exposed Measure/Eyedropper and lower tool groups stay reachable
      on laptop or split-screen windows. README and USER_GUIDE updated.
      2026-06-03.


- [x] Lock/Unlock shortcut parity — Lock Selection now uses Illustrator's
      Ctrl+2 and Unlock All uses Ctrl+Alt+2 across the keymap, App handler,
      Edit menu, command palette, and canvas right-click menu. Zoom to
      Selection moved to Ctrl+Shift+2 on all visible surfaces to avoid the
      conflict while preserving a keyboard path. USER_GUIDE updated.
      2026-06-03.


- [x] Keyboard Shortcuts dialog coverage parity — the Help shortcut cheat-sheet
      now lists Eyedropper, Select/Deselect All, Select Inverse, Paste in
      Place/Front/Back, Lock/Unlock, and Hide/Show shortcuts so the dialog
      matches the current keymap, menus, command palette, and right-click
      surfaces instead of hiding recent Illustrator-style additions. README and
      USER_GUIDE updated. 2026-06-03.


- [x] Advanced shortcut cheat-sheet parity — the Keyboard Shortcuts dialog now
      also lists clipping-mask/compound-path, Transform Again, Average Anchor
      Points, Isolation Mode, font-size, and Cut Contour shortcuts, keeping Help
      aligned with Illustrator-style path editing and SignMaster cut-prep muscle
      memory. README and USER_GUIDE updated. 2026-06-03.


- [x] Responsive shortcut cheat-sheet — the Keyboard Shortcuts dialog now widens
      slightly on desktop, collapses from three columns to two/one columns on
      smaller windows, and keeps key chips from shrinking so the expanded
      Illustrator/SignMaster shortcut list remains readable on laptops and
      split-screen layouts. README and USER_GUIDE updated. 2026-06-03.


- [x] Shortcut cheat-sheet to keymap handoff — the Keyboard Shortcuts dialog now
      includes a footer Customize Shortcuts button that closes the cheat-sheet and
      opens the Keymap Editor, matching pro-app workflows where users can inspect
      a shortcut and immediately rebind it. README and USER_GUIDE updated.
      2026-06-03.


- [x] Searchable keymap editor — Customize Shortcuts now has a search field that
      filters by command label, translated label, binding id, default combo, or
      current override, plus an empty-results state, so Illustrator/SignMaster
      users can quickly find and rebind a shortcut from the expanded keymap.
      README and USER_GUIDE updated. 2026-06-03.


- [x] Keymap search clear affordance — the Customize Shortcuts search row now
      shows a Clear button whenever a query is active, reducing friction when
      users jump between Illustrator/SignMaster-style command names and shortcut
      combos while rebinding. README and USER_GUIDE updated. 2026-06-03.


- [x] Keymap editor search autofocus — opening Customize Shortcuts now focuses
      the search field immediately, so keyboard-first users can type a command
      name or combo right after jumping from the shortcut cheat-sheet or command
      palette. README and USER_GUIDE updated. 2026-06-03.


- [x] Keymap search result counts — Customize Shortcuts now shows total shortcut
      count at rest and live match/total counts while filtering, with polite
      screen-reader updates, so large Illustrator/SignMaster-style keymaps are
      easier to scan and verify before rebinding. README and USER_GUIDE updated.
      2026-06-03.


- [x] Keymap search keyboard clear — pressing Esc inside the Customize Shortcuts
      search field now clears an active filter without closing the dialog,
      matching keyboard-first pro-app filtering patterns while leaving Esc to
      close the dialog when no query is active. README and USER_GUIDE updated.
      2026-06-03.


- [x] Command Palette search feedback — the Command Palette now shows total
      command count at rest, live match/total counts while filtering, a Clear
      button for active searches, and Esc-first search clearing before closing,
      matching pro-app command launcher expectations for large Illustrator /
      SignMaster-style command sets. README and USER_GUIDE updated.
      2026-06-03.


- [x] Searchable Layers panel — Layers now has a compact search field that
      filters by object name, translated type, raw type, or object id, shows
      match/total counts with polite screen-reader updates, supports one-click
      or Esc clearing, and preserves arrow-key selection through filtered
      results so complex imported Illustrator/SignMaster sign layouts are
      easier to navigate. README and USER_GUIDE updated. 2026-06-03.


- [x] Searchable asset and symbol libraries — Assets and Symbols now include
      compact search rows with live match/total counts, empty-result hints,
      one-click Clear, and Esc clearing, so reusable imported artwork and saved
      sign components stay manageable as libraries grow. README and USER_GUIDE
      updated. 2026-06-03.


- [x] Searchable Artboards panel — the Artboards panel now filters by artboard
      name, id, or size, shows live match/total counts, includes no-results
      guidance, and supports one-click or Esc clearing so multi-page signs,
      decals, and tiled print layouts are faster to navigate. README and
      USER_GUIDE updated. 2026-06-03.


- [x] Searchable template gallery — New from Template now has a search row that
      filters by template name, translated name, description, translated
      description, or id, shows live match/total counts, supports Clear/Esc,
      and explains empty results so users can start signs, stickers, posters,
      and cards faster. README and USER_GUIDE updated. 2026-06-03.


- [x] Font search feedback parity — the Properties font picker now shows total
      font count at rest, live match/total counts while filtering, and Clear/Esc
      search clearing, matching the searchable Layers/Assets/Symbols/Artboards
      workflows so large typography lists are easier to browse when preparing
      sign text. README and USER_GUIDE updated. 2026-06-03.


- [x] Searchable document presets — Document Settings now filters preset sizes
      by translated label, category, id, unit, or dimensions, shows live
      match/total counts, preserves the active preset while filtered out, and
      supports Clear/Esc so print, sticker, card, and social document setups are
      faster to find. README and USER_GUIDE updated. 2026-06-03.


- [x] Searchable plotter material presets — Send to Plotter now filters material
      presets by translated name, id, feed/force/speed/overcut values, and HTV /
      mirror hints, shows live match/total counts, preserves the active material
      while filtered out, and supports Clear/Esc for faster SignMaster-style
      cutter setup. README and USER_GUIDE updated. 2026-06-03.


- [x] Searchable Preferences dialog — Preferences now has a sidebar search that
      matches setting names and translated labels, jumps to the first matching
      section, filters visible tabs, shows live match/total section counts, and
      supports Clear/Esc so global app settings are faster to find. README and
      USER_GUIDE updated. 2026-06-03.

- [x] Help Center search feedback — Help Center topic search now shows the
      total topic count at rest, live match/total counts while filtering, and
      one-click or Esc clearing in the search row, keeping help discovery
      consistent with command, preferences, layer, and cutter searches. README
      and USER_GUIDE updated. 2026-06-03.

- [x] Searchable Print page sizes — PrintDialog.tsx now replaces the plain
      page-size select with a searchable A4/A3/Letter/Legal picker that shows
      physical dimensions, live match/total counts, empty results, and
      one-click or Esc clearing, reducing print setup friction for labels,
      signs, proofs, and PDF output. README and USER_GUIDE updated.
      2026-06-03.

- [x] Searchable Tile Print page sizes — TilePrintDialog.tsx now matches the
      Print dialog with a searchable A4/A3/Letter/Legal page-size picker,
      physical dimensions, live match/total counts, empty results, and Clear/Esc
      clearing, improving large-format paneling setup for banners, signs, and
      tiled proofs. README and USER_GUIDE updated. 2026-06-03.

- [x] Visual advanced-stroke controls — PropertiesPanel.tsx replaces the plain
      Dash, Line cap, and Line join selects with Illustrator-style preview
      button groups that apply the same stroke styles in one click, making
      dashed cut lines, rounded dimension strokes, and beveled sign outlines
      easier to choose without opening dropdowns. README and USER_GUIDE
      updated. 2026-06-03.

- [x] Visual pattern-fill picker — PropertiesPanel.tsx replaces the Pattern Fill
      dropdown with a four-button preview grid for Checker, Stripes, Dots, and
      Crosshatch using the current pattern colours, making sign backgrounds,
      hatching, and decal textures easier to choose before applying. README and
      USER_GUIDE updated. 2026-06-03.

- [x] Visual blend-mode controls — PropertiesPanel.tsx adds preview buttons for
      Normal, Multiply, Screen, Overlay, and Difference while keeping an All
      modes dropdown for the full Canvas blend list, making transparent
      overprint, shadow, and highlight cleanup easier to choose visually. README
      and USER_GUIDE updated. 2026-06-03.

- [x] Properties opacity presets — PropertiesPanel.tsx now adds 100%, 75%, 50%,
      and 25% one-click opacity buttons under the slider with active-state
      feedback, matching the menu, right-click, and command-palette opacity
      presets for faster watermark, underlay, and overprint setup. README and
      USER_GUIDE updated. 2026-06-03.

- [x] Properties stroke-width presets — PropertiesPanel.tsx now adds 0, 0.5, 1,
      2, 4, and 8 px one-click buttons under Stroke W with active-state feedback,
      matching the Document menu, right-click menu, and command palette for
      faster hairline cut paths, fine outlines, and bold sign borders. README
      and USER_GUIDE updated. 2026-06-03.

- [x] Properties drop-shadow presets — PropertiesPanel.tsx now shows Soft Shadow,
      Hard Shadow, Glow, and Clear Shadow buttons inside the Drop shadow section,
      matching the Document menu, right-click menu, and command palette while
      keeping exact colour, blur, and offset controls for sign lettering and
      decal depth effects. README and USER_GUIDE updated. 2026-06-03.

- [x] Properties image-filter clear parity — PropertiesPanel.tsx now routes both
      Filters clear buttons through a panel helper that clears the applied image
      filters and resets custom Blur/Bright/Contrast/Hue slider state, using the
      same Clear Image Filters label as the menu, right-click menu, and command
      palette. README and USER_GUIDE updated. 2026-06-03.

- [x] Properties image-filter preset readout sync — PropertiesPanel.tsx now keeps
      Blur, Brightness +/-, Contrast +/-, and Hue quick buttons in sync with the
      custom slider readouts, so users can see and fine-tune the exact filter
      amount immediately after applying a preset. README and USER_GUIDE updated.
      2026-06-03.


- [x] Align exact-spacing presets — AlignPanel.tsx now adds one-click spacing
      presets under the exact gap field, with active-state feedback and document
      unit-aware values, so users can quickly set common decal/sign gaps before
      distributing objects horizontally or vertically. README and USER_GUIDE
      updated. 2026-06-03.

- [x] Cut Contour job presets — CutContourDialog.tsx now adds Kiss-cut,
      Sticker bleed, Wide decal, Inside cut, and Heavy material preset buttons
      that set contour offset and pass count together with active-state feedback,
      reducing SignMaster-style print-and-cut setup from repeated numeric entry
      to one click. README and USER_GUIDE updated. 2026-06-03.

- [x] Character size presets — CharacterPanel.tsx now adds 12, 18, 24,
      36, 48, and 72 pt one-click size presets below the font-size field, with
      active-state feedback and multi-text selection support through the existing
      patchActiveText path, speeding label, decal, sign, and banner text setup.
      README and USER_GUIDE updated. 2026-06-03.

- [x] Character leading presets — CharacterPanel.tsx now adds 0.9, 1,
      1.16, 1.5, and 2 one-click line-height presets below the Leading slider,
      with active-state feedback and multi-text selection support, completing the
      quick Size / Tracking / Leading text setup flow for labels, decals, and
      sign copy. README and USER_GUIDE updated. 2026-06-03.

- [x] Layers search Select Matches — LayersPanel.tsx now turns a layer
      search filter into a one-click selection action for matching visible,
      unlocked objects, creating an ActiveSelection when multiple rows match and
      warning when filtered results are hidden or locked. README and USER_GUIDE
      updated. 2026-06-03.

- [x] Asset/Symbol search Insert First — AssetsPanel.tsx and
      SymbolsPanel.tsx now add an Insert First button whenever a library search
      is active, inserting the first matching asset or symbol directly from the
      search row while keeping Clear/Esc behavior, reducing reusable-artwork
      placement to type-and-click. README and USER_GUIDE updated. 2026-06-03.

- [x] Template search Use First — TemplatesDialog.tsx now adds a Use First
      button whenever template search is active, applying the first matching
      template directly from the search row while preserving Clear/Esc and empty
      result behavior, speeding business-card, sticker, and poster startup.
      README and USER_GUIDE updated. 2026-06-03.

- [x] Document preset Use First — DocSettingsDialog.tsx now adds a Use
      First action to preset-size search, applying the first matching paper,
      card, sticker, or screen size directly while preserving Clear/Esc and
      no-results behavior, matching the template search flow. README and
      USER_GUIDE updated. 2026-06-03.

- [x] Print page-size Use First — PrintDialog.tsx and TilePrintDialog.tsx
      now add a Use First action to page-size search, applying the first matching
      A4/A3/Letter/Legal result directly while preserving Clear/Esc and empty
      result behavior, keeping print and tiled-output setup consistent with
      document presets and templates. README and USER_GUIDE updated. 2026-06-03.

- [x] Plotter material Use First — PlotterDialog.tsx now adds a Use
      First action to material-preset search, applying the first matching vinyl,
      cardstock, paper, or HTV preset directly while preserving Clear/Esc and
      no-results behavior, reducing cutter setup after filtering by material or
      machine parameter. README and USER_GUIDE updated. 2026-06-03.

- [x] Artboards search Target First — ArtboardsPanel.tsx now adds a
      Target First action whenever artboard search is active, zooming to the
      first matching artboard directly from the search row while preserving
      Clear/Esc and no-results behavior for faster multi-page sign navigation.
      README and USER_GUIDE updated. 2026-06-03.

- [x] Search result first-action consistency — PreferencesDialog, HelpCenter,
      and KeymapEditor now expose Go First / Open First / Edit First actions
      beside live search counts, so users can jump to a matching settings
      section, open a help topic, or start rebinding the first shortcut without
      hunting through filtered lists. README and USER_GUIDE updated.
      2026-06-03.

- [x] Command and shortcut search first-actions — CommandPalette now exposes
      Run First beside live command search counts, and ShortcutsDialog is now
      searchable by command name or key combo with match counts, Clear/Esc,
      empty-state guidance, and Edit First handoff into KeymapEditor using the
      same search text. README and USER_GUIDE updated. 2026-06-03.


- [x] Character horizontal-scale presets — CharacterPanel.tsx now adds
      75 / 85 / 100 / 115 / 125% one-click H% buttons below the text scale
      fields, with active-state feedback and multi-text selection support,
      speeding SignMaster-style condensed/extended sign copy fitting without
      manual percentage entry. README and USER_GUIDE updated. 2026-06-04.


- [x] Character vertical-scale presets — CharacterPanel.tsx now mirrors the
      H% preset workflow with 75 / 100 / 125% V% buttons, giving sign-text
      users quick tall/compressed lettering adjustments with active-state
      feedback and multi-text selection support. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Properties rotation presets — PropertiesPanel.tsx now adds 0° / 90° /
      180° / -90° one-click buttons under Transform rotation, with active-state
      feedback, making common sign-layout rotations available without typing
      angles or opening the Transform dialog. README and USER_GUIDE updated.
      2026-06-04.


- [x] Properties size-scale presets — PropertiesPanel.tsx now adds 25% /
      50% / 75% / 100% / 150% / 200% one-click scale buttons under Transform,
      scaling W and H together from the selected object's base size with
      active-state feedback for fast proof, decal, and layout resizing without
      opening the Transform dialog. README and USER_GUIDE updated. 2026-06-04.


- [x] Properties fit-to-document sizing — PropertiesPanel.tsx now adds Fit W
      and Fit H buttons under Transform, proportionally scaling the selection so its width or height matches the
      current document size in one click for quick sign-panel, decal, and
      proof layout fitting without manual dimension math. USER_GUIDE
      updated. 2026-06-04.


- [x] Properties document-center shortcuts — PropertiesPanel.tsx now adds
      Center X, Center Y, and Center buttons beside Fit W / Fit H in Transform,
      moving the selection horizontally, vertically, or fully to the current
      document centre in one click for faster sign-panel and proof layout setup.
      USER_GUIDE updated. 2026-06-04.


- [x] Properties Fit Page shortcut — PropertiesPanel.tsx now adds Fit Page
      beside Fit W / Fit H in Transform, proportionally scaling the selection
      inside the current document bounds and centering it in one click for fast
      proof, panel, and decal layout setup. USER_GUIDE updated. 2026-06-04.


- [x] Properties fit/center active feedback — PropertiesPanel.tsx now marks
      Fit W, Fit H, Fit Page, Center X, Center Y, and Center with aria-pressed
      active-state styling whenever the selection already matches the document
      width, height, fitted-page, or centre position, making the Transform panel
      easier to read before output prep. USER_GUIDE updated. 2026-06-04.


- [x] Align spacing preset apply buttons — AlignPanel.tsx now adds H/V apply
      rows under exact-spacing presets, so sign-layout users can click 0H, 5H,
      10V, etc. to both choose and immediately apply a spacing preset without
      moving back to the horizontal/vertical spacing buttons. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Trace Bitmap presets — CutContourDialog.tsx now adds Logo, Dark art,
      Photo high contrast, Transparent PNG, and Noisy scan presets in the Trace
      Bitmap tab, applying threshold, simplify, and alpha-channel settings in
      one click with active-state feedback for faster print-and-cut contour
      setup. README and USER_GUIDE updated. 2026-06-04.


- [x] Registration-mark presets — CutContourDialog.tsx now adds Roland
      standard, Graphtec scan, Outside bleed, Compact sheet, and Long banner
      presets in the Reg Marks tab, applying arm length and X/Y inset values
      together with active-state feedback so print-and-cut jobs can switch
      cutter/stock conventions without manual parameter entry. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter Next Color separation — PlotterDialog.tsx now adds a Next
      color button beside All colors / No colors / Invert, cycling the output
      into a one-colour solo state so multi-vinyl jobs can step through colour
      separations without clicking each swatch's Only button manually. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Print Prep presets — PrintDialog.tsx now adds Proof, Press, Sticker,
      and None presets inside Print Prep, applying bleed, crop marks,
      registration marks, and page-info settings together with active-state
      feedback so print/PDF setup matches common proof, press, and sticker
      workflows without toggling each option manually. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Tile Print overlap presets — TilePrintDialog.tsx now adds 0 / 5 / 10
      / 15 / 20 mm overlap buttons below the overlap field, with active-state
      feedback, so oversized poster/panel jobs can quickly choose common tape
      margins without manual numeric entry. README and USER_GUIDE updated.
      2026-06-04.


- [x] Tile Print grid presets — TilePrintDialog.tsx now adds 1×2, 2×1,
      2×2, 3×2, and 3×3 grid buttons below Columns / Rows, with active-state
      feedback, so poster/panel jobs can choose common page layouts without
      typing both dimensions manually. README and USER_GUIDE updated.
      2026-06-04.


- [x] Margin Guides safe-area presets — MarginGuidesDialog.tsx now adds 0 /
      3 / 5 / 10 / 15 / 25 mm preset buttons below the margin field, with
      active-state feedback, so Illustrator/SignMaster-style safe-area guides
      can be dropped around the first artboard without manual numeric entry.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Layers search Select First — LayersPanel.tsx now adds Select First
      beside Select Matches whenever layer search is active, selecting and
      scrolling to the first visible unlocked match so imported artwork can be
      inspected one result at a time before bulk-selecting all matches. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Asset/Symbol Enter-to-insert — AssetsPanel.tsx and SymbolsPanel.tsx now
      let users press Enter in an active search box to run the existing Insert
      First action, preserving Esc/Clear behavior while making reusable artwork
      insertion faster for keyboard-first layout work. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Find & Replace Enter-to-replace — FindReplaceDialog.tsx now lets users
      press Enter from either the Find or Replace field to run Replace All with
      IME-safe handling and a no-op guard for empty Find text, speeding global
      sign-copy corrections without leaving the keyboard. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Enter-to-first for document startup searches — TemplatesDialog.tsx,
      DocSettingsDialog.tsx, and ArtboardsPanel.tsx now let users press Enter
      in active template, preset-size, or artboard search fields to run the
      existing Use First / Target First action with IME-safe handling, making
      new-document and multi-artboard setup faster for keyboard-first sign
      layout work. README and USER_GUIDE updated. 2026-06-04.


- [x] Enter-to-first for output setup searches — PrintDialog.tsx,
      TilePrintDialog.tsx, and PlotterDialog.tsx now let users press Enter in
      page-size or material searches to apply the existing Use First result with
      IME-safe handling, making print, tile, and cutter setup faster without
      leaving the keyboard. README and USER_GUIDE updated. 2026-06-04.


- [x] Font search Apply First — FontPicker.tsx now adds an Apply First action
      to active font searches and lets Enter apply the first matching font with
      IME-safe handling, so keyboard-first text styling can search and commit a
      face without tabbing into the font list. README and USER_GUIDE updated.
      2026-06-04.


- [x] Enter-to-first for help and shortcut searches — PreferencesDialog.tsx,
      HelpCenter.tsx, ShortcutsDialog.tsx, and KeymapEditor.tsx now let Enter
      run the existing Go First / Open First / Edit First actions with IME-safe
      handling, making settings, help, and shortcut customization searches
      consistent with the document, output, asset, and font search workflows.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Layers search Enter-to-select — LayersPanel.tsx now lets users press
      Enter in an active layer search to run Select First with IME-safe
      handling, and fixes a stray duplicate chevron in the Clear button markup,
      making imported-artwork cleanup consistent with other first-result search
      workflows. README and USER_GUIDE updated. 2026-06-04.


- [x] Path effect presets — OffsetPathDialog.tsx, SimplifyDialog.tsx, and
      RoundCornersDialog.tsx now add one-click preset buttons with active-state
      feedback for common inside/outside offsets, simplification tolerances, and
      corner radii, speeding imported-path cleanup, rounded sign shapes, and
      sticker-contour prep without manual slider/numeric tuning. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Sign-size text presets — CharacterPanel.tsx now expands Size presets from
      12–72 px to include 96, 144, and 216 px one-click sizes, speeding large
      storefront, banner, and decal text layout without typing common signmaking
      dimensions manually. README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter overcut presets — PlotterDialog.tsx now adds 0 / 0.1 / 0.2 /
      0.3 / 0.5 / 1.0 mm overcut buttons with active-state feedback, helping
      cutter users quickly dial closed-path release for vinyl, cardstock, and
      print-and-cut jobs without typing small decimals manually. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter bridge presets — PlotterDialog.tsx now adds None / Light /
      Standard / Heavy bridge preset buttons beside the bridge count×gap inputs,
      with active-state feedback, so stencil and no-shift weeding jobs can pick
      common uncut tab settings without typing both values manually. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter weed-grid presets — PlotterDialog.tsx now adds None / Rows /
      Columns / 2×2 / 3×2 preset buttons beside the weed grid row×column inputs,
      with active-state feedback, so large vinyl waste can be split into common
      peel-off sections without typing both divider counts manually. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Pattern fill size presets — PropertiesPanel.tsx now adds 8 / 12 / 16 /
      24 / 32 / 48 pattern-size buttons with active-state feedback, so sign
      background textures can be scaled quickly after choosing Checker, Stripes,
      Dots, or Crosshatch without typing common tile sizes manually. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Image filter strength presets — PropertiesPanel.tsx now adds one-click
      Blur, Brightness, Contrast, and Hue amount buttons under the custom filter
      sliders, keeping the readouts in sync so bitmap cleanup and sign mockup
      edits can use common corrections without carefully dragging sliders.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Find/Replace clear and swap helpers — FindReplaceDialog.tsx now adds
      Clear fields and Swap find/replace buttons beside the live match count,
      making repeated text cleanup trials faster without retyping both terms.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Active image filter preset feedback — PropertiesPanel.tsx now marks
      Blur, Brightness, Contrast, and Hue strength preset buttons with
      aria-pressed plus accent styling when their value matches the slider,
      so bitmap edits show the currently chosen correction at a glance.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Miter-limit preset buttons — PropertiesPanel.tsx now adds 2 / 4 / 8 /
      12 active-state buttons under the Miter limit field and removes a
      duplicated cap-preview guide line, making sharp-corner stroke cleanup
      faster and visually clearer in Advanced stroke. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Active apply-spacing buttons — AlignPanel.tsx now gives the 0H / 5H
      and 0V / 5V exact-spacing apply buttons aria-pressed plus the same
      active styling as the base spacing presets, so layout users can see
      which gap value will be applied before distributing sign elements.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Active cut-by-colour Only feedback — PlotterDialog.tsx now marks each
      swatch's Only button with aria-pressed and accent styling when it is the
      sole enabled cut colour, making multi-colour vinyl separation state clear
      before sending the next cutter pass. README and USER_GUIDE updated.
      2026-06-04.


- [x] Active cut-by-colour mode controls — PlotterDialog.tsx now gives
      All colors, No colors, and Next color aria-pressed plus accent styling
      when they represent the current colour-separation state, matching the
      per-swatch Only feedback for safer multi-pass vinyl output. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Tile Print orientation buttons — TilePrintDialog.tsx now replaces the
      orientation dropdown with active-state Portrait / Landscape buttons,
      making large-format tiled output setup faster and less error-prone before
      choosing grid and overlap presets. README and USER_GUIDE updated.
      2026-06-04.


- [x] Print orientation buttons — PrintDialog.tsx now matches Tile Print by
      replacing the orientation dropdown with active-state Portrait / Landscape
      buttons, making normal PDF/print setup faster and visually consistent with
      tiled output. README and USER_GUIDE updated. 2026-06-04.


- [x] Print scaling buttons — PrintDialog.tsx now replaces the Scaling dropdown
      with active-state Actual size / Fit to page / Fill page buttons, making
      page-fit decisions visible before printing or exporting PDF. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Print margin presets — PrintDialog.tsx now adds 0 / 3 / 5 / 10 / 15 /
      25 mm active-state buttons under Margin, making common desktop-print and
      PDF-safe margins one-click instead of numeric retyping. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Print Prep bleed presets — PrintDialog.tsx now adds 0 / 1 / 2 / 3 /
      5 / 10 mm active-state buttons under Bleed, so proof, sticker, and press
      jobs can adjust common bleed values without numeric retyping. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter output format and unit buttons — PlotterDialog.tsx now replaces
      the Format and Unit dropdowns with active-state HP-GL / G-code and
      mm / inches buttons, so cutter operators can visually confirm machine
      language and measurement units before saving or sending a job. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter HP-GL dialect buttons — PlotterDialog.tsx now replaces the
      Cutter dialect dropdown with active-state Bare / Roland CAMM / Graphtec FC
      buttons when HP-GL output is selected, making cutter-specific wrapper
      commands visible before exporting or sending a vinyl job. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter cut-strategy buttons — PlotterDialog.tsx now groups Mirror,
      Optimize order, Reverse direction, and Inner contours first into
      active-state strategy buttons, making HTV, travel optimisation, blade
      direction, and print-and-cut inside-first choices visible before output.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter preview toggle buttons — PlotterDialog.tsx now turns Show print
      and Cut order preview checkboxes into active-state buttons, making print
      overlay and numbered travel-order review visible before sending cutter
      output. README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter feed/travel speed presets — PlotterDialog.tsx now adds active
      200 / 400 / 800 / 1200 feed-rate and 800 / 1200 / 2000 / 3000 travel-rate
      buttons under the numeric fields, making test cuts, detailed vinyl, and
      fast traversal setup one-click instead of repeated typing. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter curve-tolerance presets — PlotterDialog.tsx now adds active
      0.25 / 0.5 / 1 / 2 px buttons under Curve tolerance, making detailed
      logos, smooth decals, and fast draft cuts easier to balance without
      retyping tessellation values. README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter origin buttons — PlotterDialog.tsx now replaces the bottom-left
      origin checkbox with active Top-left / Bottom-left origin buttons, making
      CNC-style coordinate flipping explicit before exporting G-code or HP-GL.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Layers search batch hide/lock — LayersPanel.tsx now adds Hide Matches
      and Lock Matches beside Select First / Select Matches when a layer search
      is active, making imported artwork cleanup and reference/cut-line isolation
      faster from the Layers panel. README and USER_GUIDE updated. 2026-06-04.


- [x] Layers search batch restore — LayersPanel.tsx now adds Show Matches and
      Unlock Matches beside the existing Select/Hide/Lock search-result actions,
      so filtered reference art, imported groups, or cut-line layers can be restored
      without clearing the search. README and USER_GUIDE updated. 2026-06-04.


- [x] State-aware Layers search actions — LayersPanel.tsx now computes selectable,
      visible, hidden, unlocked, and locked search-result counts and disables each
      Select/Hide/Lock/Show/Unlock Matches button unless it can actually change the
      current filtered set. README and USER_GUIDE updated. 2026-06-04.


- [x] Layers row duplicate action — LayersPanel.tsx now adds a row-level
      duplicate button that clones the object, offsets it slightly, preserves the
      layer name with a copy suffix, places it above the source, and selects it.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Layers selected-row action visibility — LayersPanel.tsx now keeps object
      id, duplicate, and delete controls visible when a row is selected or
      keyboard-focused instead of only on hover, making row-level cleanup easier
      to discover during keyboard-heavy layer work. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Layers keyboard duplicate/delete — LayersPanel.tsx now handles
      Ctrl/Cmd+D on the focused layer row to duplicate the object, Delete or
      Backspace to remove it, and records row deletion in undo history. The
      listbox screen-reader hint, README, and USER_GUIDE now document the
      keyboard workflow. 2026-06-04.

- [x] Layers keyboard visibility/lock toggles — LayersPanel.tsx now lets users
      press V on the focused layer row to show/hide and L to lock/unlock, with
      the same undo/history behavior as the eye and lock buttons. README,
      USER_GUIDE, and the listbox hint now document the workflow. 2026-06-04.

- [x] Artboard row size presets — ArtboardsPanel.tsx now adds A4, Letter,
      and 24×12 in buttons on each artboard row, converting through the
      document DPI so print sheets, sticker layouts, and sign/banner panels
      can be resized without manually typing pixel dimensions. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Artboard row orientation swap — ArtboardsPanel.tsx now adds a Swap W/H
      button beside row size presets, letting users flip a print sheet, sticker
      page, or sign/banner artboard between portrait and landscape without
      retyping dimensions. README and USER_GUIDE updated. 2026-06-04.

- [x] Row-level artboard fit controls — fitArtboardToContent() now accepts an
      optional target artboard id, and ArtboardsPanel.tsx exposes Fit Selection
      and Fit Artwork buttons on each artboard row so any page/sign panel can
      be fitted to selected art or all artwork without using the global first
      artboard command. README and USER_GUIDE updated. 2026-06-04.

- [x] Tile Print Auto Grid — TilePrintDialog.tsx now adds an Auto Grid button
      that estimates columns and rows from the current artwork preview, selected
      page size, orientation, and overlap, reducing manual panel-count setup for
      large signs and tiled proofs. README and USER_GUIDE updated. 2026-06-04.

- [x] Tile Print output-size summary — TilePrintDialog.tsx now shows total
      pages, selected page dimensions, and estimated assembled size after
      overlap, giving sign and poster users a quick sanity check before
      printing tiled jobs. README and USER_GUIDE updated. 2026-06-04.

- [x] Cut Contour per-type cleanup — CutContourDialog.tsx now exposes Clear
      contour, Clear trace, and Clear regmarks buttons beside Clear all, using
      the existing kind-aware cut-path store cleanup so users can iterate one
      print-and-cut layer without wiping the rest of the job. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Plotter output-side cut-path cleanup — PlotterDialog.tsx now mirrors the
      Cut Contour per-type cleanup with Clear contour, Clear trace, and Clear
      regmarks buttons in the output prep area, so cutter operators can remove
      one generated layer right before saving or sending without reopening the
      contour dialog. README and USER_GUIDE updated. 2026-06-04.

- [x] Command/right-click cut-path type cleanup — CommandPalette.tsx now adds
      Clear contour, Clear trace, and Clear regmarks commands with state-aware
      warnings, and CanvasContextMenu.tsx mirrors them inside Cut prep with
      per-kind disabled states. README and USER_GUIDE updated. 2026-06-04.

- [x] Document-menu cut-path type cleanup — MenuBar.tsx now mirrors Clear
      contour, Clear trace, and Clear regmarks under Document with disabled
      states when each cut-path type is absent, matching the command palette,
      right-click Cut prep, Cut Contour, and Send to Plotter cleanup workflow.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Document-menu cut-path clear-all parity — MenuBar.tsx now adds Clear cut
      paths beside the per-type Clear contour / trace / regmarks entries, with
      disabled state when no cut paths exist, matching command-palette and
      right-click cleanup for users working from the top menu. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Artboard row keyboard actions — ArtboardsPanel.tsx rows are now
      keyboard-focusable and support Enter to target, Ctrl/Cmd+D to duplicate,
      Delete/Backspace to remove after confirmation, and R to swap width/height,
      with an inline hint so multi-page sign layouts can be managed without
      chasing tiny row icons. README and USER_GUIDE updated. 2026-06-04.

- [x] Library tile keyboard cleanup — AssetsPanel.tsx asset tiles now support
      Delete/Backspace removal, and SymbolsPanel.tsx symbol tiles support F2
      inline rename plus Delete/Backspace removal, with discoverable tooltips
      so reusable artwork libraries can be managed without hunting hover-only
      trash icons. README and USER_GUIDE updated. 2026-06-04.

- [x] Template gallery keyboard flow — TemplatesDialog.tsx now auto-focuses
      the search field when opened, lets ArrowDown jump from search results to
      the first template tile, and adds explicit Enter-to-use tile hints/focus
      styling so template-based sign and print starts work smoothly by keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Preferences keyboard search flow — PreferencesDialog.tsx now auto-focuses
      its search field on open and lets ArrowDown jump from matching settings
      to the first visible section tab, matching the template-gallery keyboard
      flow and reducing setup friction for AI, snapping, theme, and workspace
      options. README and USER_GUIDE updated. 2026-06-04.

- [x] Help Center search keyboard flow — HelpCenter.tsx now lets ArrowDown
      move from the search box to the first visible topic while selecting it,
      matching the Preferences and Template keyboard search flow so users can
      learn features without leaving the keyboard. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Customize Shortcuts ArrowDown handoff — KeymapEditor.tsx now lets
      ArrowDown move from the search box to the first matching shortcut row's
      rebind button, complementing Enter-to-edit and making shortcut review or
      rebinding work smoothly without leaving the keyboard. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Command Palette visible Esc hint — CommandPalette.tsx footer now shows
      Esc alongside the existing arrow-key and Enter hints, making the
      clear-search/close behavior discoverable for keyboard-first command
      workflows. README and USER_GUIDE updated. 2026-06-04.

- [x] Font picker ArrowDown handoff — FontPicker.tsx now lets ArrowDown move
      from the search box to the first visible font preview, complementing
      Enter-to-apply so typography cleanup can preview fonts by keyboard before
      applying them. README and USER_GUIDE updated. 2026-06-04.


- [x] Document Settings ArrowDown handoff — DocSettingsDialog.tsx now lets
      ArrowDown move from preset search to the filtered preset dropdown without
      applying a size immediately, complementing Use First / Enter-to-use for
      safer keyboard review of print, sticker, card, and screen sizes. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Print page-size ArrowDown handoff — PrintDialog.tsx and
      TilePrintDialog.tsx now let ArrowDown move from page-size search to the
      first visible page-size button without applying it, matching the safer
      Document Settings review flow for print, PDF, and tiled output setup.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter material ArrowDown handoff — PlotterDialog.tsx now lets
      ArrowDown move from material-preset search to the filtered material
      dropdown without applying a preset, matching the safer output setup flow
      added for document and page-size searches. README and USER_GUIDE updated.
      2026-06-04.


- [x] Library search ArrowDown handoff — AssetsPanel.tsx and SymbolsPanel.tsx
      now let ArrowDown move from library search to the first matching asset or
      symbol tile, complementing Insert First / Enter-to-insert so reusable art
      can be previewed, renamed, or removed by keyboard before insertion.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Keyboard Shortcuts ArrowDown review — ShortcutsDialog.tsx now lets
      ArrowDown move from the shortcut search box to the first visible shortcut
      row with focus styling, complementing Edit First / Enter-to-edit so users
      can inspect the matching shortcut before jumping into customization.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Artboard search ArrowDown handoff — ArtboardsPanel.tsx now lets
      ArrowDown move from artboard search to the first matching artboard row
      without zooming immediately, complementing Target First / Enter-to-target
      so multi-page sign layouts can be reviewed before focus jumps. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Find/Replace field-arrow handoff — FindReplaceDialog.tsx now lets
      ArrowDown move from Find to Replace and ArrowUp move back while selecting
      the destination field, complementing Enter-to-replace for faster global
      text cleanup without reaching for Tab. README and USER_GUIDE updated.
      2026-06-04.


- [x] Cut Contour tab keyboard switching — CutContourDialog.tsx now supports
      Left/Right plus Home/End on the Contour / Trace Bitmap / Reg Marks tab
      strip, keeping focus on the active tab so print-and-cut setup can move
      between outline, trace, and registration modes without mouse travel.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter preview tab keyboard switching — PlotterDialog.tsx now supports
      Left/Right plus Home/End on the Outline / Code preview tabs, keeping
      focus on the active mode and generating code on demand when keyboard
      users switch into the machine-output view. README and USER_GUIDE updated.
      2026-06-04.


- [x] Print segmented-button keyboard switching — PrintDialog.tsx now supports
      Left/Right plus Home/End on Orientation and Scaling segmented buttons,
      and TilePrintDialog.tsx mirrors the same keyboard switching for
      orientation, reducing mouse travel during print/PDF/tile setup. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Plotter output segmented-button keyboard switching — PlotterDialog.tsx
      now supports Left/Right plus Home/End on Format, HP-GL dialect, Unit,
      and Origin button groups, keeping focus on the selected output option so
      cutter setup can confirm machine format, wrapper dialect, units, and
      coordinate origin without mouse travel. README and USER_GUIDE updated.
      2026-06-04.


- [x] Plotter numeric preset keyboard switching — PlotterDialog.tsx now supports
      Left/Right plus Home/End on Feed rate, Travel rate, Curve tolerance, and
      Overcut preset groups, including a safe handoff from custom numeric values
      into the nearest preset row so cutter speed, precision, and overcut setup
      can be tuned without mouse travel. README and USER_GUIDE updated.
      2026-06-04.


- [x] Plotter weed and bridge preset keyboard switching — PlotterDialog.tsx
      now supports Left/Right plus Home/End on Weed grid and Bridge preset
      groups, including custom-value handoff through the shared segmented-key
      helper, so vinyl waste-cut and stencil-island holding tabs can be tuned
      from the cutter dialog without mouse travel. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Plotter cut-strategy keyboard browsing — PlotterDialog.tsx now lets the
      Mirror, Optimize order, Reverse direction, and Inner contours first
      buttons share Left/Right plus Home/End focus movement while preserving
      Space/Enter toggling, making output strategy checks faster for keyboard
      users before sending vinyl or print-and-cut jobs. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Plotter cut-by-colour quick-action keyboard browsing — PlotterDialog.tsx
      now groups All colors, No colors, Invert, and Next color with Left/Right
      plus Home/End focus movement while preserving button activation, reducing
      mouse travel when cycling one vinyl colour at a time. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter preview-toggle keyboard browsing — PlotterDialog.tsx now groups
      Show print and Cut order with Left/Right plus Home/End focus movement
      while preserving Space/Enter toggling, making the graphical cut preview
      easier to audit from the keyboard before output. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Print prep preset keyboard switching — PrintDialog.tsx now supports
      Left/Right plus Home/End on Margin, Proof/Press/Sticker/None, and Bleed
      preset groups, including safe handoff from custom numeric values, so print
      and sticker prep can be tuned without leaving the keyboard. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Tile Print grid and overlap preset keyboard switching — TilePrintDialog.tsx
      now supports Left/Right plus Home/End on tile grid and overlap preset
      groups, including custom-value handoff, so large-format paneling setup can
      adjust page grids and tape overlaps without mouse travel. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Layers search ArrowDown handoff — LayersPanel.tsx now lets ArrowDown move
      from the layer search field to the first matching layer row, focusing the
      listbox and selecting that row for immediate arrow-key review, F2 rename,
      V/L visibility-lock toggles, or Delete cleanup. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Character preset keyboard switching — CharacterPanel.tsx now supports
      Left/Right plus Home/End on Size, Tracking, Leading, Horizontal scale,
      and Vertical scale preset groups, moving focus to the applied preset so
      sign text can be sized, spaced, and condensed/extended without mouse
      travel. README and USER_GUIDE updated. 2026-06-04.

- [x] Align spacing preset keyboard switching — AlignPanel.tsx now supports
      Left/Right plus Home/End on exact-spacing preset rows, including direct
      horizontal and vertical apply rows that move focus to the applied spacing
      button, so sticker gaps, door-letter spacing, and multi-object layouts can
      be tuned from the keyboard. README and USER_GUIDE updated. 2026-06-04.

- [x] Properties stroke/opacity preset keyboard switching — PropertiesPanel.tsx
      now supports Left/Right plus Home/End on Stroke W and Opacity preset
      groups, applying the newly focused preset and keeping focus on the active
      button so outline weights and transparency can be tuned without mouse
      travel. README and USER_GUIDE updated. 2026-06-04.

- [x] Properties transform preset keyboard switching — PropertiesPanel.tsx now
      supports Left/Right plus Home/End on Transform size-scale and rotation
      preset groups, applying the newly focused preset and keeping focus on the
      active button so sign layouts can be resized or squared up without mouse
      travel. README and USER_GUIDE updated. 2026-06-04.

- [x] Properties Fit/Center keyboard browsing — PropertiesPanel.tsx now lets
      Transform Fit W / Fit H / Fit Page and Center X / Center Y / Center groups
      share Left/Right plus Home/End focus movement while preserving Space/Enter
      activation, making document fitting and centering safer from the keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties advanced-stroke keyboard browsing — PropertiesPanel.tsx now lets
      Dash, Line cap, and Line join preview-button groups share Left/Right plus
      Home/End focus movement while preserving Space/Enter activation, making
      cutter/perforation and dimension-line finishing safer from the keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties miter-limit preset keyboard switching — PropertiesPanel.tsx
      now supports Left/Right plus Home/End on the Miter limit preset group,
      applying the newly focused corner-limit value and keeping focus on the
      active button for faster sharp-corner sign linework cleanup. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Properties stroke-alignment keyboard browsing — PropertiesPanel.tsx now lets
      Center / Inside / Outside stroke-alignment buttons share Left/Right plus
      Home/End focus movement while preserving Space/Enter activation, making
      sticker outlines and cut-line appearance checks safer from the keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties blend-mode keyboard browsing — PropertiesPanel.tsx now lets
      visual Normal / Multiply / Screen / Overlay / Difference quick-mode buttons
      share Left/Right plus Home/End focus movement while preserving Space/Enter
      activation for safer imported-art transparency cleanup. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Properties pattern-fill keyboard browsing — PropertiesPanel.tsx now lets
      Checker / Stripes / Dots / Crosshatch pattern preview buttons share
      Left/Right plus Home/End focus movement, and pattern-size presets switch
      with the same keys, making sign background fills easier to tune by keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties drop-shadow keyboard browsing — PropertiesPanel.tsx now lets
      Soft Shadow / Hard Shadow / Glow / Clear Shadow preset buttons share
      Left/Right plus Home/End focus movement while preserving Space/Enter
      activation, making quick shadow/glow cleanup safer from the keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties image-filter preset keyboard switching — PropertiesPanel.tsx
      now supports Left/Right plus Home/End on Blur, Brightness, Contrast, and
      Hue strength preset groups, applying the newly focused amount and keeping
      focus on the active button for faster bitmap cleanup from the keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties gradient-angle preset keyboard switching — PropertiesPanel.tsx
      now adds 0° / 45° / 90° / 135° / 180° / 270° linear-gradient angle
      buttons with Left/Right plus Home/End switching, so sign fills, highlights,
      and bevel-style gradients can be squared up without dragging the slider.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Properties suggested-palette keyboard browsing — PropertiesPanel.tsx now
      lets generated 5-color palette swatches share Left/Right plus Home/End
      focus movement while preserving Space/Enter activation, making sign color
      trials and sticker background choices faster without mouse travel.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Plotter output-action keyboard browsing — PlotterDialog.tsx now groups
      Cancel / Test cut / Save File / Send via USB as footer output actions with
      Left/Right plus Home/End focus movement while preserving Space/Enter
      activation, making the final cutter handoff safer from the keyboard.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Print output-action keyboard browsing — PrintDialog.tsx now groups
      Cancel / PDF / Print footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, making final proof/PDF
      handoff safer from the keyboard. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Tile Print output-action keyboard browsing — TilePrintDialog.tsx now
      groups Cancel / Print footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, matching the Print dialog
      for safer large-format tiled output handoff. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Template grid arrow-key review — TemplatesDialog.tsx now lets focused
      template tiles move with Left/Right/Up/Down plus Home/End after ArrowDown
      handoff from search, so users can compare starter layouts before pressing
      Enter to apply one. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Symbols tile arrow-key review — SymbolsPanel.tsx now lets focused symbol
      tiles move with Left/Right/Up/Down plus Home/End after ArrowDown handoff
      from search, preserving Enter insert, F2 rename, and Delete cleanup for
      faster reusable-art library browsing. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Asset tile arrow-key review — AssetsPanel.tsx now lets focused asset tiles
      move with Left/Right/Up/Down plus Home/End after ArrowDown handoff from
      search, preserving Enter insert and Delete cleanup for faster reusable
      bitmap/logo library browsing. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Help Center topic-list keyboard review — HelpCenter.tsx now lets focused
      topic buttons move with Up/Down plus Home/End after ArrowDown handoff from
      search, updating the active topic as focus moves so users can scan the
      in-app manual without returning to the mouse. README, USER_GUIDE, and i18n
      updated. 2026-06-04.


- [x] Keyboard Shortcuts list keyboard review — ShortcutsDialog.tsx now lets
      focused shortcut rows move with Up/Down plus Home/End after ArrowDown
      handoff from search, so users can scan the cheat-sheet results before
      deciding whether to open Customize Shortcuts. README, USER_GUIDE, and i18n
      updated. 2026-06-04.


- [x] Customize Shortcuts row keyboard review — KeymapEditor.tsx now lets focused
      rebind buttons move with Up/Down plus Home/End after ArrowDown handoff from
      search, while capture mode still owns real shortcut recording. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Preferences output-action keyboard browsing — PreferencesDialog.tsx now
      groups Cancel / Apply / Save as footer actions with Left/Right plus
      Home/End focus movement while preserving Space/Enter activation, matching
      the print/plotter handoff pattern for safer settings saves. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Transform dialog action keyboard browsing — TransformDialog.tsx now groups
      Cancel / Apply as footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, making exact move/scale/
      rotate commits safer from the keyboard. README, USER_GUIDE, and i18n
      updated. 2026-06-04.


- [x] Resize dialog action keyboard browsing — ResizeDialog.tsx now groups
      Cancel / Apply as footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, matching the Transform
      dialog for exact-size scaling workflows. README, USER_GUIDE, and i18n
      updated. 2026-06-04.


- [x] Shear dialog action keyboard browsing — ShearDialog.tsx now groups Cancel /
      Apply as footer actions with Left/Right plus Home/End focus movement while
      preserving Space/Enter activation, matching exact Transform and Resize
      dialog commits. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Repeat dialog action keyboard browsing — RepeatDialog.tsx now groups Cancel /
      Apply as footer actions with Left/Right plus Home/End focus movement while
      preserving Space/Enter activation and disabled Apply state, matching the
      exact Transform / Resize / Shear dialog commit pattern. README, USER_GUIDE,
      and i18n updated. 2026-06-04.


- [x] Offset Path action keyboard browsing — OffsetPathDialog.tsx now groups
      Cancel / Apply as footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, making sticker/contour
      offset commits safer from the keyboard. README, USER_GUIDE, and i18n
      updated. 2026-06-04.


- [x] Round Corners action keyboard browsing — RoundCornersDialog.tsx now groups
      Cancel / Apply as footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, matching Offset Path for
      keyboard-safe sign-corner cleanup. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Simplify Path action keyboard browsing — SimplifyDialog.tsx now groups
      Cancel / Apply as footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, matching Offset Path and
      Round Corners for keyboard-safe import cleanup. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Distort dialog action keyboard browsing — RoughenDialog.tsx,
      ZigzagDialog.tsx, PuckerDialog.tsx, and TwistDialog.tsx now group Cancel /
      Apply as footer actions with Left/Right plus Home/End focus movement while
      preserving Space/Enter activation, making live-preview distress, wave,
      bloat, and twist commits safer from the keyboard. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Blend / Warp / Multi-outline action keyboard browsing — BlendDialog.tsx,
      WarpDialog.tsx, and OutlineEffectDialog.tsx now group Cancel / Apply as
      footer actions with Left/Right plus Home/End focus movement while preserving
      Space/Enter activation, matching cleanup and distort dialogs for safer
      keyboard commits on sign effects. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Edit Colors dialog action keyboard browsing — HueDialog.tsx,
      SaturateDialog.tsx, BrightnessDialog.tsx, and RecolorDialog.tsx now group
      Cancel / Apply plus Recolor Reset as footer actions with Left/Right plus
      Home/End focus movement while preserving Space/Enter activation and disabled
      states, making imported-artwork colour cleanup safer from the keyboard.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Type and gradient dialog action keyboard browsing —
      SingleLineTextDialog.tsx, FreeformGradientDialog.tsx, and
      FindReplaceDialog.tsx now group Cancel / Create or Cancel / Replace All as
      footer actions with Left/Right plus Home/End focus movement while preserving
      Space/Enter activation and disabled states, matching the newer color and
      path-effect dialog commit pattern for text and artwork creation workflows.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Sign prep dialog action keyboard browsing — GrommetsDialog.tsx,
      RhinestoneDialog.tsx, SplitGridDialog.tsx, and MarginGuidesDialog.tsx now
      group Cancel / Apply as footer actions with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation, matching cutter, layout,
      and safe-area prep workflows to the newer dialog commit pattern. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Document / variable / shape dialog action keyboard browsing —
      DocSettingsDialog.tsx, VariableDataDialog.tsx, and StarDialog.tsx now group
      Cancel / Apply, Cancel / Generate, or Cancel / Insert as footer actions with
      Left/Right plus Home/End focus movement while preserving Space/Enter
      activation, matching document setup, serial-numbering, and shape generation
      workflows to the newer dialog commit pattern. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Cut Contour cleanup/output action keyboard browsing —
      CutContourDialog.tsx now groups the live Clear contour / Clear trace /
      Clear regmarks / Clear all cleanup row and the Close / Send to Plotter
      footer as keyboard-browsable action toolbars with Left/Right plus Home/End
      focus movement while preserving Space/Enter activation and disabled states.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Star / Polygon mode keyboard switching — StarDialog.tsx now lets focused
      Star / Polygon / Spiral tabs move with Left/Right plus Home/End, updating
      focus and active mode together so keyboard-first users can pick the shape
      generator before inserting. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Variable Data source-mode keyboard switching — VariableDataDialog.tsx now
      lets focused Numbers / List tabs move with Left/Right plus Home/End,
      updating focus and active source mode together so serial-number and custom
      list badge workflows can be configured without leaving the keyboard.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Document Settings orientation keyboard switching — DocSettingsDialog.tsx
      now lets focused Portrait / Landscape buttons move with Left/Right plus
      Home/End, applying the orientation and keeping focus on the active choice
      so keyboard-first users can finish document setup without mouse travel.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Print page-size list keyboard browsing — PrintDialog.tsx and
      TilePrintDialog.tsx now let focused A4 / A3 / Letter / Legal page-size
      results move with Arrow keys plus Home/End, applying the focused size as
      users browse so PDF, print, and paneling setup can be completed without
      returning to the mouse. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Plotter material preset card browsing — PlotterDialog.tsx now replaces the
      plain material dropdown with searchable material cards that show feed,
      force, speed, overcut, and mirror hints; Arrow keys plus Home/End move
      through filtered presets and apply the focused material, matching
      SignMaster-style cutter setup cards for keyboard-first output checks.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Font preview list keyboard browsing — FontPicker.tsx now makes recent and
      filtered font preview rows a keyboard-browsable listbox; Arrow Up/Down plus
      Home/End move through visible font previews while focus preloads each face,
      then Space/Enter applies the chosen font to the selected text. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Artboard list keyboard browsing — ArtboardsPanel.tsx now treats filtered
      artboard rows as a keyboard-browsable listbox; Arrow Up/Down plus Home/End
      move between artboards after search handoff, while each focused row keeps
      Enter-to-target, Ctrl/Cmd+D duplicate, Delete remove, and R swap workflows.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Artboard row action keyboard browsing — ArtboardsPanel.tsx now groups each
      row's A4 / Letter / 24×12 in / Swap W/H size actions and Fit Selection /
      Fit Artwork actions as keyboard-browsable toolbars with Left/Right plus
      Home/End focus movement, preserving Space/Enter activation for fast
      multi-page setup without mouse travel. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Layers action keyboard browsing — LayersPanel.tsx now groups the Visible /
      Unlocked / Hide Others / Show All / Unlock All quick actions and the active
      search actions (Select First / Matches, Hide / Lock / Show / Unlock Matches,
      Clear) as keyboard-browsable toolbars with Left/Right plus Home/End focus
      movement while skipping disabled buttons. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Asset / Symbol search-action keyboard browsing — AssetsPanel.tsx and
      SymbolsPanel.tsx now group Insert First and Clear as keyboard-browsable
      search action toolbars with Left/Right plus Home/End focus movement,
      skipping disabled Insert First states and matching the newer layer/search
      action pattern for reusable artwork libraries. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Asset import/trace action keyboard browsing — AssetsPanel.tsx now groups
      Import and Trace as a keyboard-browsable asset action toolbar with
      Left/Right plus Home/End focus movement, skipping Trace while tracing is in
      progress and preserving Space/Enter activation for reusable-image setup.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Symbol naming action keyboard browsing — SymbolsPanel.tsx now groups the
      inline Save and Cancel naming buttons as a keyboard-browsable toolbar with
      Left/Right plus Home/End focus movement while preserving Enter/Esc on the
      name field, making reusable artwork creation safer from the keyboard.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Top bar action keyboard browsing — MenuBar.tsx now groups Undo / Redo,
      Grid / Snap / Guides / Anchor, and Plotter / Print / Export / Document
      Settings / AI as keyboard-browsable top-bar toolbars with Left/Right plus
      Home/End focus movement while skipping disabled history buttons and
      preserving Space/Enter activation. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Language switcher keyboard browsing — MenuBar.tsx now lets the top-bar
      language pill hand focus into the EN / 中文 menu with ArrowDown or ArrowUp,
      then move through language choices with Up/Down, Left/Right, Home, or End
      before Space/Enter switches locale. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Status-bar action keyboard browsing — StatusBar.tsx now groups artboard
      previous/current/next navigation, cut-path count, Grid / Snap / Guides /
      Anchor toggles, and the version/help entry as keyboard-browsable status
      actions with Left/Right plus Home/End focus movement, preserving existing
      Space/Enter activation and Shift/Alt cut-contour behavior. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Recovery dialog action keyboard browsing — RecoveryDialog.tsx now groups
      Discard and Restore as a keyboard-browsable recovery toolbar with
      Left/Right plus Home/End focus movement, preserving Escape-as-discard and
      Space/Enter activation so crash recovery can be completed safely without
      mouse travel. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Toast action keyboard browsing — ToastHost.tsx now groups optional toast
      action buttons and Dismiss as a keyboard-browsable notification toolbar
      with Left/Right plus Home/End focus movement, preserving Space/Enter
      activation and auto-dismiss after action runs. README, USER_GUIDE, and
      i18n updated. 2026-06-04.


- [x] Confirm dialog action keyboard browsing — ConfirmHost.tsx now groups
      Cancel and OK/Confirm as a keyboard-browsable alertdialog toolbar with
      Left/Right plus Home/End focus movement while preserving Escape-to-cancel,
      danger-confirm default focus on Cancel, and focused-button Enter semantics.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] AI / MCP settings action keyboard browsing — AIPanel.tsx now groups AI
      settings Cancel / Save, MCP discovery Refresh / + Add, and MCP settings
      Cancel / Save as keyboard-browsable action toolbars with Left/Right plus
      Home/End focus movement while skipping disabled Refresh states and
      preserving Space/Enter activation. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] AI panel main-action keyboard browsing — AIPanel.tsx now groups the main
      MCP / Settings / Close header buttons, quick prompt chips, Vision / SVG
      context toggles, and Send as keyboard-browsable AI action toolbars with
      Left/Right plus Home/End focus movement while preserving native textarea
      cursor navigation and disabled busy/send states. README, USER_GUIDE, and
      i18n updated. 2026-06-04.


- [x] MCP server row action keyboard browsing — AIPanel.tsx now treats each MCP
      server row's Test and Remove controls as a keyboard-browsable toolbar with
      Left/Right plus Home/End focus movement, skipping a row's disabled Test
      button while a probe is running and preserving native editing inside name,
      URL, and transport fields. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Debug diagnostics action keyboard browsing — DebugPanel.tsx now groups
      Copy diagnostics, Download diagnostics, Clear log, and Close as a
      keyboard-browsable debug toolbar with Left/Right plus Home/End focus
      movement while preserving Space/Enter activation and the existing debug
      tablist navigation. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Onboarding action keyboard browsing — Onboarding.tsx now groups slide
      pagination dots and Back / Next / Get Started as keyboard-browsable
      onboarding toolbars with Left/Right plus Home/End focus movement while
      skipping disabled Back on the first slide and preserving Space/Enter
      activation. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Help Center search-action keyboard browsing — HelpCenter.tsx now groups
      Open First and Clear as a keyboard-browsable help search toolbar with
      Left/Right plus Home/End focus movement while preserving Enter-to-open,
      ArrowDown-to-first-topic handoff, Escape clear-search, and Space/Enter
      activation so in-app reference lookup works without mouse travel. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Preferences search-action keyboard browsing — PreferencesDialog.tsx now
      groups Go First and Clear as a keyboard-browsable preferences search
      toolbar with Left/Right plus Home/End focus movement while preserving
      Enter-to-go, ArrowDown-to-first-section handoff, Escape clear-search, and
      Space/Enter activation so app setup changes remain keyboard-first.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Command Palette search-action keyboard browsing — CommandPalette.tsx now
      groups Run First and Clear as a keyboard-browsable command search toolbar
      with Left/Right plus Home/End focus movement while skipping disabled Run
      First states and preserving input ArrowUp/ArrowDown/Home/End command-list
      navigation, Enter-to-run, Escape clear/close, and Space/Enter activation.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Shortcut search-action keyboard browsing — ShortcutsDialog.tsx and
      KeymapEditor.tsx now group Edit First and Clear as keyboard-browsable
      shortcut search toolbars with Left/Right plus Home/End focus movement,
      skipping disabled Edit First in the rebinding editor and preserving
      Enter-to-edit, ArrowDown-to-first-shortcut handoff, Escape clear-search,
      row/list arrow review, and Space/Enter activation for faster shortcut
      lookup and customization. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Document preset search-action keyboard browsing — DocSettingsDialog.tsx
      now groups Use First and Clear as a keyboard-browsable preset search
      toolbar with Left/Right plus Home/End focus movement while skipping
      disabled Use First states and preserving Enter-to-use,
      ArrowDown-to-preset-list handoff, Escape clear-search, orientation
      switching, and footer action browsing for faster document setup. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Template search-action keyboard browsing — TemplatesDialog.tsx now groups
      Use First and Clear as a keyboard-browsable template search toolbar with
      Left/Right plus Home/End focus movement while skipping disabled Use First
      states and preserving Enter-to-use, ArrowDown-to-first-template handoff,
      Escape clear-search, tile arrow review, and Space/Enter activation for
      faster template-based sign, sticker, and print starts. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Print page-size search-action keyboard browsing — PrintDialog.tsx and
      TilePrintDialog.tsx now group Use First and Clear as keyboard-browsable
      page-size search toolbars with Left/Right plus Home/End focus movement,
      skipping disabled Use First states and preserving Enter-to-use,
      ArrowDown-to-first-page-size handoff, Escape clear-search, page-size grid
      review, and output action browsing for faster print and tiled-output setup.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Plotter material search-action keyboard browsing — PlotterDialog.tsx now
      groups Use First and Clear as a keyboard-browsable material search toolbar
      with Left/Right plus Home/End focus movement while skipping disabled Use
      First states and preserving Enter-to-use, ArrowDown-to-material-list
      handoff, Escape clear-search, material-card arrow review, cutter strategy
      toggles, and output action browsing for faster SignMaster-style cutter
      setup. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Font search-action keyboard browsing — FontPicker.tsx now groups Apply
      First and Clear as a keyboard-browsable font search toolbar with
      Left/Right plus Home/End focus movement while skipping disabled Apply
      First states and preserving Enter-to-apply, ArrowDown-to-first-font
      handoff, Escape clear-search, font-preview arrow review, and Space/Enter
      activation for faster text cleanup and brand font matching. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Artboard search-action keyboard browsing — ArtboardsPanel.tsx now groups
      Target First and Clear as a keyboard-browsable artboard search toolbar
      with Left/Right plus Home/End focus movement while skipping disabled
      Target First states and preserving Enter-to-target,
      ArrowDown-to-first-artboard handoff, Escape clear-search, artboard-list
      review, and row-level artboard actions for faster multi-page layout.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Find & Replace field-action keyboard browsing — FindReplaceDialog.tsx now
      groups Clear fields and Swap find/replace as a keyboard-browsable field
      toolbar with Left/Right plus Home/End focus movement while skipping disabled
      field actions and preserving Enter-to-replace, ArrowUp/ArrowDown field
      handoff, footer Cancel/Replace All browsing, and Space/Enter activation
      for faster imported-text cleanup. USER_GUIDE and i18n updated.
      2026-06-04.

- [x] Variable Data serial preset keyboard browsing — VariableDataDialog.tsx now
      adds Badges 10 / Badges 50 / Odd 25 / Tickets 100 presets that fill common
      start, step, count, pad, and columns settings for badge, door-label, ticket,
      and sticker runs; the preset toolbar supports Left/Right plus Home/End focus
      movement and highlights the active preset while preserving manual fields,
      Numbers/List switching, and Cancel/Generate footer browsing. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data list cleanup keyboard browsing — VariableDataDialog.tsx now
      gives List mode Sample list / Clean list / Dedupe / Sort A-Z / Clear list
      actions for pasted badge, door-label, ticket, and sticker names; the list
      toolbar supports Left/Right plus Home/End focus movement, skips disabled
      cleanup actions when the list is empty, and preserves manual textarea entry,
      serial presets, Numbers/List switching, and Cancel/Generate footer browsing.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data generation preview — VariableDataDialog.tsx now shows a live
      Generation preview with the first generated serial/list values, total value
      count, and a +N overflow chip before Generate runs, helping users catch bad
      starts, padding, pasted lists, or ticket counts before duplicating artwork.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data helper coverage — variableData.ts now exposes shared parsing,
      dedupe, natural sort, and preview helpers used by VariableDataDialog.tsx, and
      variableData.test.ts covers serial clamping, pasted comma/newline lists,
      case-insensitive dedupe, Door 2 before Door 10 natural sorting, and preview
      overflow counts so badge/ticket/list workflows stay verifiable as the UI grows.
      README and USER_GUIDE remain aligned with the tested workflow. 2026-06-04.

- [x] Variable Data list reverse action — VariableDataDialog.tsx now adds a
      Reverse list action beside Sample / Clean / Dedupe / Sort / Clear so pasted
      door-label, ticket, and badge names can be output in descending or press-sheet
      order without returning to a spreadsheet; reverseVariableListValues() is
      covered in variableData.test.ts and preserves the original input array.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data row/column fill order — variableData.ts now supports row-first
      or column-first grid coordinates via getVariableDataGridPosition(),
      generateVariableData() accepts a fill order without breaking existing row
      output, and VariableDataDialog.tsx exposes a keyboard-switchable Rows / Cols
      control for badge sheets, ticket books, labels, and press layouts that need
      column-wise numbering. variableData.test.ts covers both coordinate modes;
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data column-count preset browsing — VariableDataDialog.tsx now adds
      2 / 3 / 4 / 5 / 10 column presets below the Columns field, highlights the
      active count, and lets keyboard users browse the preset toolbar with
      Left/Right plus Home/End before generating badge, ticket, label, or sticker
      sheets. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data grid-size preview — variableData.ts now exposes
      summarizeVariableDataGrid(), VariableDataDialog.tsx shows a live rows × cols
      grid summary with cell count inside Generation preview, and
      variableData.test.ts covers empty and partial final-row sheet dimensions so
      users can catch label-sheet or ticket-book layout mistakes before Generate.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data gap preset browsing — VariableDataDialog.tsx now adds
      5 / 10 / 20 / 40 / 80 mm presets under both Gap X and Gap Y, highlights the
      active spacing, and lets keyboard users browse each preset strip with
      Left/Right plus Home/End so badge, ticket, label, and sticker sheets can be
      spaced without repeated numeric typing. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Variable Data linked gap editing — VariableDataDialog.tsx now adds a Link
      gaps toggle above the layout controls so Gap X / Gap Y typing or preset picks
      can update both axes together when building square badge grids, sticker
      sheets, or evenly spaced ticket layouts; linked state is visually highlighted
      and the gap preset tooltips explain the two-axis update. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Variable Data auto gap refresh — VariableDataDialog.tsx now adds an Auto gap
      button that re-measures the currently selected text object and resets Gap X /
      Gap Y from its bounding box plus padding, matching the dialog's open-time
      smart spacing and giving users a quick recovery path after changing fonts,
      text size, or template wording. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Variable Data layout-action keyboard browsing — VariableDataDialog.tsx now
      groups Auto gap and Link gaps as a keyboard-browsable layout toolbar with
      Left/Right plus Home/End focus movement while preserving the linked-state
      highlight and auto-measure behavior, so spacing recovery and linked grid
      setup are reachable without leaving the keyboard. USER_GUIDE and i18n
      updated. 2026-06-04.

- [x] Variable Data auto-gap helper coverage — variableData.ts now centralizes the
      selected-text bounds to Gap X / Gap Y calculation in estimateVariableDataGaps(),
      VariableDataDialog.tsx reuses it for both open-time smart spacing and Auto gap,
      and variableData.test.ts covers normal, zero-size, and clamped padding cases so
      future badge/ticket layout tweaks keep the same spacing behavior. 2026-06-04.

- [x] Cut Contour preset keyboard browsing — CutContourDialog.tsx now treats
      Contour, Trace Bitmap, and Reg Marks preset rows as toolbar groups with
      Left/Right plus Home/End focus movement before Space/Enter applies a
      preset, matching SignMaster/CutStudio-style cutter setup where operators
      can step through kiss-cut, bitmap trace, and optical-mark defaults without
      reaching for the mouse. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Cut Contour replace/append retry mode — CutContourDialog.tsx now adds a
      Replace existing contour paths checkbox that defaults on, so repeated
      offset/preset trials replace old outline cuts while preserving bitmap traces
      and registration marks; operators can turn it off when they intentionally
      need stacked kiss-cut / through-cut passes. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Trace Bitmap replace/append retry mode — CutContourDialog.tsx now adds a
      Replace existing trace paths checkbox that defaults on, so repeated bitmap
      threshold/simplify trials replace old trace cut paths while preserving manual
      contour offsets and registration marks; turning it off intentionally stacks
      alternate trace passes for comparison or compound cut jobs. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Cut Contour final-job preview — CutContourDialog.tsx now composes the
      right-side preview from the current cut job plus the pending contour/regmark
      result after replace/append settings are applied, so operators can see whether
      old outline or trace paths will remain before committing a retry. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Cut Contour preview action summary — CutContourDialog.tsx now adds a
      magenta preview summary that states whether the current tab will replace
      existing outline/trace/regmark paths or append new paths, plus the pending
      contour/regmark count where known, making cutter retries safer before
      Generate/Place. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Plotter final output summary — PlotterDialog.tsx now shows a Ready to
      output strip above Test cut / Save File / Send via USB with the selected
      format, output source, path count, active colour-filter count, and estimated
      run time so operators can confirm the job at a glance before sending vinyl
      to the cutter. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Plotter machine-setting output summary — PlotterDialog.tsx now expands the
      Ready to output strip with HP-GL dialect / G-code, unit, origin, and mirror
      state beside source, path count, colour filtering, and time estimate, reducing
      common vinyl mistakes before Save File or Send via USB. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Plotter material/speed output summary — PlotterDialog.tsx now includes the
      selected material or Custom material plus feed, travel, overcut, and Graphtec
      force/speed details in the Ready to output strip, giving sign-shop operators
      a final material/settings check before saving or sending a cutter job.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Plotter empty colour-output guard — PlotterDialog.tsx now detects when
      colour separation mutes every cut path, shows a warning under Ready to
      output, disables Save File / Send via USB, and warns if code generation is
      attempted, preventing accidental empty cutter files after using No colors.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Print ready-summary strip — PrintDialog.tsx now shows a Ready to print
      strip before PDF / Print actions with page size, orientation, fit mode,
      margins, bleed, crop marks, registration marks, and page-info state, giving
      press/proof/sticker jobs the same final confirmation pattern as Plotter.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Tile Print final ready-summary strip — TilePrintDialog.tsx now shows a
      Ready to tile print strip before Print with page size, orientation, grid,
      total pages, overlap, single-page size, and assembled output size, matching
      the final confirmation pattern used by Print and Plotter so panel jobs are
      easier to verify before paper is consumed. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Tile Print artwork-bounds source — TilePrintDialog.tsx now previews,
      Auto Grid-estimates, summarizes, and prints from selected artwork bounds
      first, then visible artwork bounds, falling back to the full canvas only
      when the document is empty; io3 tilePrint() accepts matching crop bounds,
      so panel jobs no longer waste pages on unused canvas whitespace. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Tile Print source-mode controls — TilePrintDialog.tsx now adds
      keyboard-browsable Auto / Selected / Visible / Canvas source buttons so
      panel-print operators can deliberately tile only the selected decal, all
      visible artwork, or the full canvas; Auto still follows the SignMaster-like
      selected-then-visible fallback. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Tile Print unavailable-source fallback — TilePrintDialog.tsx now resolves
      Selected with no selected printable artwork to Visible or Canvas, resolves
      empty Visible to Canvas, and highlights the actual source used so source
      buttons never imply a different panel-print crop than the preview/summary.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Tile Print per-page margin presets — TilePrintDialog.tsx now adds a
      Margin (mm) control with 0 / 3 / 5 / 10 / 15 mm keyboard-browsable presets,
      includes margin in the page and Ready to tile print summaries, and passes the
      value to io3 tilePrint() so every printed tile keeps a white in-page margin
      for trimming, tape assembly, and non-printable printer edges. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Tile Print printable-area Auto Grid — TilePrintDialog.tsx now subtracts the
      selected per-page margin from page width/height before Auto Grid estimates,
      shows the resulting printable area in the inline and Ready to tile print
      summaries, and bases assembled size on that printable area so panel jobs
      match the actual printed tile content. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Tile Print sticky Auto Grid — TilePrintDialog.tsx now keeps Auto Grid active
      after pressing it and re-estimates columns/rows whenever the source bounds,
      page size, orientation, overlap, or margin changes; manual Columns/Rows edits
      or fixed grid presets turn the automatic mode off. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Tile Print 1×1 proof preset — TilePrintDialog.tsx now includes a 1×1
      grid preset before multi-page layouts and expands the preset row to six
      columns, making it faster to return from tiled paneling to a single-page
      proof while still using the same source, margin, overlap, and summary flow.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Tile Print printable-area preview guides — TilePrintDialog.tsx now overlays
      green dashed printable-area rectangles inside each tile whenever page margin
      is enabled, so the live preview shows the same safe area that the print iframe
      will preserve for trimming, tape assembly, and non-printable printer edges.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Tile Print preview legend — TilePrintDialog.tsx now shows a compact legend
      beside the live preview title for pink overlap bands and green printable-area
      guides, making panel-print preview overlays self-explanatory before operators
      commit paper or vinyl transfer sheets. README and USER_GUIDE updated.
      2026-06-04.

- [x] Tile Print shortcut parity — Tile Print now has a dedicated `Ctrl+Alt+P`
      binding in the customizable keymap, opens from the global keyboard handler,
      and shows the shortcut in File menu, command palette, and right-click
      Print / Output so large-format panel printing is as quick to reach as
      standard Print and Send to Plotter. README and USER_GUIDE updated.
      2026-06-04.

- [x] Top output toolbar Tile Print action — MenuBar.tsx now adds a dedicated
      Tile button between Print and Export with the `Ctrl+Alt+P` shortcut hint
      and keyboard-toolbar navigation, so large-format panel printing is visible
      from the always-on output strip instead of only File menu, command palette,
      or right-click Print / Output. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Top output toolbar Print Prep action — MenuBar.tsx now adds a dedicated
      Prep button beside Print that opens the Print dialog with Print Prep already
      expanded, so crop marks, registration marks, bleed, and proof/press/sticker
      presets are reachable from the always-on output strip. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Top output toolbar Nest action — MenuBar.tsx now adds a dedicated Nest
      button beside Plotter that runs Auto-arrange (Nest) with the same success
      and empty-selection feedback as File menu, Sign Effects, right-click, and
      command palette, making material-saving layout a visible pre-output step.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Top output toolbar Test Cut action — MenuBar.tsx now adds a dedicated Test
      button beside Plotter that saves the shared HP-GL test-cut calibration file
      with the same toast feedback as File menu, right-click Print / Output, Cut
      prep, and command palette, making blade pressure/offset checks visible before
      production output. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Top output toolbar positioning marks action — MenuBar.tsx now adds a
      dedicated Reg button beside Plotter that runs the shared Add positioning
      marks helper with the same bounds fallback and toast feedback as File menu,
      Document menu, right-click Cut prep / Print Output, and command palette,
      making print-and-cut alignment setup visible from the always-on output strip.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Top output toolbar weed-border action — MenuBar.tsx now adds a dedicated
      Weed button beside Reg that runs the shared Weed border helper with the same
      cut-path bounds fallback and toast feedback as File menu, Document menu,
      right-click Cut prep / Print Output, and command palette, making vinyl
      weeding setup a visible pre-output step. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Top output toolbar overflow guard — MenuBar.tsx now marks the output
      action group with a dedicated class and index.css makes it horizontally
      scrollable with non-wrapping buttons, so the growing Plotter / Reg / Weed /
      Test / Nest / Print / Prep / Tile / Export strip stays usable on narrower
      windows while preserving arrow-key toolbar navigation. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Top output toolbar Cut Contour action — MenuBar.tsx now adds a dedicated
      Contour button beside Plotter with the Ctrl+Shift+C shortcut hint and the
      same selection guard as the Document menu, so offset contour, trace bitmap,
      and registration-mark setup are visible from the always-on output strip
      before sending to the plotter. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Top output toolbar Banner Grommets action — MenuBar.tsx now adds a
      dedicated Grommet button beside Weed that opens Banner Grommets with the
      same selection guard as File menu, Document Sign Effects, right-click, and
      command palette, making banner eyelet-hole finishing visible from the
      always-on output strip before plotter or print output. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Top output toolbar Rhinestone action — MenuBar.tsx now adds a dedicated
      Stone button beside Grommet that opens Rhinestone Template with the same
      selection guard as Document Sign Effects, right-click, and command palette,
      making hotfix/rhinestone template finishing visible from the always-on
      output strip before cutter output. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Top output toolbar Variable Data action — MenuBar.tsx now adds a
      dedicated Data button beside Stone that opens Variable Data with the same
      selection guard as Document Sign Effects, right-click, and command palette,
      making badge, ticket, serial-number, and label personalization visible from
      the always-on production/output strip before print, tile print, or cutter
      output. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Variable Data shortcut parity — keymap.ts now registers `Ctrl+Alt+V` as
      a customizable Variable Data shortcut, App.tsx opens the dialog with the
      same selection guard as menus/toolbars, and MenuBar.tsx plus
      CommandPalette.tsx show the shortcut hint so badge, ticket, and serial
      personalization can be launched keyboard-first without conflicting with
      paste. README and USER_GUIDE updated. 2026-06-04.

- [x] Single-line Text shortcut parity — keymap.ts now registers `Ctrl+Alt+T`
      as a customizable Single-line Text shortcut, App.tsx opens the engraving /
      pen-plotter text dialog from the global keyboard handler, and MenuBar.tsx,
      CanvasContextMenu.tsx, and CommandPalette.tsx show the shortcut hint so
      cutter-friendly stroke text is reachable from keyboard, menu, search, or
      right-click workflows. README and USER_GUIDE updated. 2026-06-04.

- [x] Find & Replace shortcut parity — keymap.ts now registers `Ctrl+Alt+F`
      as a customizable text Find & Replace shortcut, App.tsx opens the global
      text replacement dialog from the keyboard handler, and MenuBar.tsx,
      CanvasContextMenu.tsx, and CommandPalette.tsx show the shortcut hint while
      leaving `Ctrl+F` available for Paste in Front. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Create Outlines shortcut parity — keymap.ts now registers `Ctrl+Shift+O`
      as a customizable text-to-outlines shortcut, App.tsx runs the shared
      createOutlinesFromText() action with success/warning feedback, and
      MenuBar.tsx, CanvasContextMenu.tsx, and CommandPalette.tsx show the shortcut
      hint so Illustrator-style type-to-curves and cutter-ready text conversion
      are reachable from keyboard, menus, search, or right-click. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Break Text shortcut parity — keymap.ts now registers `Ctrl+Alt+L` for
      Break Text into Letters and `Ctrl+Alt+Shift+L` for Break Text into Lines,
      App.tsx runs the shared splitText helpers with success/warning feedback,
      and MenuBar.tsx, CanvasContextMenu.tsx, and CommandPalette.tsx show the
      shortcut hints so sign text can be exploded for spacing, vinyl layout, or
      per-letter editing from keyboard, menus, search, or right-click. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Text on Arc shortcut parity — keymap.ts now registers `Ctrl+Alt+A` for
      Text on Arc (Up) and `Ctrl+Alt+Shift+A` for Text on Arc (Down), App.tsx
      runs the shared applyTextOnArc() helper with selection feedback, and
      MenuBar.tsx, CanvasContextMenu.tsx, and CommandPalette.tsx show the hints
      so badge, seal, arch, and storefront text can be curved from keyboard,
      menus, search, or right-click. README and USER_GUIDE updated. 2026-06-04.

- [x] Change Case uppercase/lowercase shortcut parity — keymap.ts now registers
      `Ctrl+Alt+U` for UPPERCASE and `Ctrl+Alt+Shift+U` for lowercase, App.tsx
      runs changeCaseSelection() with selection feedback, and MenuBar.tsx,
      CanvasContextMenu.tsx, and CommandPalette.tsx show the shortcut hints so
      sign text capitalization cleanup is reachable from keyboard, menu, search,
      or right-click workflows. README and USER_GUIDE updated. 2026-06-04.

- [x] Change Case title/sentence shortcut parity — keymap.ts now registers
      `Ctrl+Alt+Shift+T` for Title Case and `Ctrl+Alt+Shift+S` for Sentence case,
      App.tsx runs changeCaseSelection() with the same selection feedback as
      uppercase/lowercase, and MenuBar.tsx, CanvasContextMenu.tsx, and
      CommandPalette.tsx show the shortcut hints so imported or pasted sign copy
      can be normalized from keyboard, menu, search, or right-click workflows.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Smart Punctuation shortcut parity — keymap.ts now registers `Ctrl+Alt+Q`
      as a customizable Smart Punctuation shortcut, App.tsx runs
      smartPunctuationSelection() with the same success/warning feedback as menus,
      and MenuBar.tsx, CanvasContextMenu.tsx, and CommandPalette.tsx show the hint
      so pasted sign copy can be cleaned up from keyboard, menu, search, or
      right-click workflows. README and USER_GUIDE updated. 2026-06-04.


- [x] Tracking / leading keymap parity — keymap.ts now registers Increase /
      Decrease Tracking and Increase / Decrease Leading as customizable
      `Alt+ArrowRight/Left/Up/Down` shortcuts, App.tsx routes those actions
      through the shared keymap before normal arrow nudging, and the Document
      Type menu, canvas right-click Type submenu, and command palette read the
      current binding so SignMaster-style text spacing tweaks stay discoverable
      after customization. README and USER_GUIDE updated. 2026-06-04.


- [x] Align / distribute shortcut parity — keymap.ts now registers the six
      common selection align commands plus horizontal / vertical equal-spacing
      distribute as customizable Alt+Shift shortcuts, App.tsx runs the shared
      alignSelection()/distributeSelection() helpers with selection-count
      feedback, and Document Align & Distribute, canvas right-click, and command
      palette entries display the current bindings for keyboard-first vinyl
      layout cleanup. README and USER_GUIDE updated. 2026-06-04.


- [x] No Fill / No Stroke shortcut parity — keymap.ts now registers
      customizable `Ctrl+Alt+X` and `Ctrl+Alt+Shift+X` bindings for removing
      fills or strokes during cutter/print artwork cleanup, App.tsx applies the
      same style updates with selection feedback, and Document Appearance,
      canvas right-click Fill / Stroke, and command palette entries display the
      current binding. README and USER_GUIDE updated. 2026-06-04.


- [x] New Document shortcut parity — keymap.ts now registers `Ctrl+N` as a
      customizable New command, App.tsx opens the same guarded Clear Canvas
      confirmation from the keyboard handler, and File menu, command palette,
      and canvas right-click File / Import read the current binding so creating
      a fresh job is no longer a static shortcut hint. README and USER_GUIDE
      updated. 2026-06-04.


- [x] New from Template shortcut parity — keymap.ts now registers
      `Ctrl+Alt+N` as a customizable template-start shortcut, App.tsx opens
      the searchable template gallery from the global keyboard handler, and
      File menu, command palette, and canvas right-click File / Import display
      the current binding so common sign-job presets are reachable without
      hunting through menus. README and USER_GUIDE updated. 2026-06-04.


- [x] Import Image shortcut parity — keymap.ts now registers
      `Ctrl+Alt+Shift+I` as a customizable bitmap import shortcut, App.tsx
      opens the same image picker from the global keyboard handler, and File
      menu, command palette, and canvas right-click File / Import display the
      current binding so logo/photo/scanned artwork import is reachable without
      menu hunting. README and USER_GUIDE updated. 2026-06-04.


- [x] Project open/save-as shortcut parity — keymap.ts now registers
      customizable `Ctrl+Alt+O` for Open Project and `Ctrl+Alt+Shift+P` for
      Save Project As, App.tsx runs the same project file pickers from the
      global keyboard handler, and File menu, command palette, and canvas
      right-click File / Import display the current bindings so native project
      recall and handoff are reachable keyboard-first. README and USER_GUIDE
      updated. 2026-06-04.


- [x] File/output shortcut hint sync — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now read the shared keymap for Open SVG/JSON, Save
      Project, Export SVG, Print, Tile Print, and Send to Plotter instead of
      static shortcut strings, so customized file/output bindings stay visible
      across menu, search, and right-click workflows. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Cut Contour shortcut hint sync — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now read `window.cutContour` from the shared
      keymap for the Document menu, top output Contour button, command palette,
      and right-click Cut prep entry, so customized print-and-cut contour
      bindings remain visible across cutter-prep workflows. README and
      USER_GUIDE updated. 2026-06-04.

- [x] View / Help shortcut hint sync — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now read the shared keymap for Zoom to Selection,
      Outline View, Show/Hide Guides, Command Palette, Help Center, Keyboard
      Shortcuts, Preferences, Theme, and Debug Panel hints, so customized
      view/help/settings bindings stay visible across menu, search, and
      right-click workflows. README and USER_GUIDE updated. 2026-06-04.


- [x] Type shortcut hint sync — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now read the shared keymap for Create Outlines,
      Break Text into Letters/Lines, Text on Arc, font-size nudges, Find &
      Replace, Single-line Text, Change Case, and Smart Punctuation hints, so
      customized text-production bindings stay visible across Document Type,
      command search, and right-click Type workflows. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Edit / clipboard shortcut hint sync — MenuBar.tsx, CommandPalette.tsx,
      CanvasContextMenu.tsx, and the top history buttons now read the shared
      keymap for Undo/Redo, Cut/Copy/Paste, Paste in Place/Front/Back,
      Duplicate, Group/Ungroup, Isolation Mode, Clipping Mask, and Compound
      Path hints, so customized high-frequency edit bindings stay visible
      across menus, command search, right-click, and toolbar workflows. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Arrange / select shortcut hint sync — MenuBar.tsx, CommandPalette.tsx,
      and CanvasContextMenu.tsx now read the shared keymap for Transform Again,
      Flip H/V, Bring Forward/Back, Select All/Deselect/Inverse/Next, Lock/
      Unlock, Hide/Show, Average Anchors, Join Paths, Variable Data, Swap Fill
      / Stroke, and Default Fill / Stroke hints, keeping canvas cleanup and
      sign-layout bindings visible after customization. README and USER_GUIDE
      updated. 2026-06-04.


- [x] View zoom / topbar shortcut hint sync — MenuBar.tsx, CommandPalette.tsx,
      CanvasContextMenu.tsx, the output topbar Variable Data button, and the
      save-status button now read the shared keymap for Zoom In/Out, Actual
      Size, Fit to Page, Variable Data, Save Project, and top/bottom arrange
      hint variants, so customized navigation and topbar bindings stay visible
      across menu, search, right-click, and toolbar workflows. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Tool shortcut hint sync — Toolbar.tsx now reads `tool.<id>` bindings
      from the shared keymap, subscribes to keymap changes for immediate badge
      refresh, and CommandPalette.tsx shows the same current tool bindings, so
      customized Select/Shape/Pen/Text/Hand/Zoom/Measure/Eyedropper shortcuts
      stay visible across toolbar hover badges, accessibility hints, and
      command search. README and USER_GUIDE updated. 2026-06-04.


- [x] Delete / Backspace hint parity — MenuBar.tsx, CommandPalette.tsx, and
      CanvasContextMenu.tsx now show `Del / Backspace` for Delete, matching the
      App handler that accepts either key and making laptop/Mac deletion more
      discoverable from menus, command search, and right-click workflows.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Keyboard Shortcuts live keymap sync — ShortcutsDialog.tsx now stores
      keymap binding ids for tools, edit, file/output, view, and help entries,
      renders the current bindings through getBinding(), derives shifted
      front/back arrange hints from the live binding, subscribes to keymap
      changes for immediate refresh, and searches against current overrides
      instead of stale defaults. README and USER_GUIDE updated. 2026-06-04.

- [x] Right-click weed-grid presets — CanvasContextMenu.tsx now exposes Rows,
      Columns, 2×2, and 3×2 weed-grid shortcuts inside both Cut prep and Print /
      Output flyouts, reusing the PlotterDialog cut-prep generator so large
      vinyl jobs can add common weeding dividers without opening the plotter
      dialog. README and USER_GUIDE updated. 2026-06-04.


- [x] Command-palette weed-grid presets — CommandPalette.tsx now mirrors the
      right-click Rows, Columns, 2×2, and 3×2 weed-grid shortcuts in both File
      and Arrange search results, so keyboard/search-first cutter workflows can
      add common weeding dividers without opening Send to Plotter. README and
      USER_GUIDE updated. 2026-06-04.


- [x] File-menu weed-grid presets — MenuBar.tsx now adds Rows, Columns, 2×2,
      and 3×2 weed-grid subcommands under File → Weed border, matching the
      PlotterDialog, command palette, and right-click cutter-prep workflows so
      mouse-first users can add common vinyl weeding dividers from the main
      output menu. README and USER_GUIDE updated. 2026-06-04.


- [x] Output-surface bridge presets — cutPrepActions.ts now exposes shared
      Light / Standard / Heavy bridge helpers, PlotterDialog.tsx reuses the
      helper, and File menu, command palette, and right-click Cut prep / Print /
      Output surfaces can add stencil/weeding bridges without opening Send to
      Plotter. README and USER_GUIDE updated. 2026-06-04.


- [x] Topbar bridge shortcut — MenuBar.tsx now adds a visible Bridge output
      button next to Weed that applies the Standard 4×1 mm bridge preset from
      the shared cut-prep helper, so cutter operators can add stencil/weeding
      tabs directly from the horizontally scrollable output toolbar. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Reversible bridge cleanup — addBridges() now tags bridged segments with
      their original closed path, cutPrepActions.ts adds Clear bridges to restore
      bridged cutter jobs, and File menu, command palette, and right-click Cut
      prep / Print / Output surfaces expose the cleanup next to regmark / weed
      cleanup. README, USER_GUIDE, and bridges tests updated. 2026-06-04.


- [x] Plotter in-dialog bridge cleanup — PlotterDialog.tsx now exposes Clear
      bridges beside Add bridges in the Bridges row, reusing the shared restore
      helper so operators can test Light / Standard / Heavy bridge presets and
      restore closed cut paths without leaving Send to Plotter. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter in-dialog Clear cut paths — PlotterDialog.tsx now adds a
      state-aware Clear cut paths button beside the per-kind cleanup controls,
      matching File / Document / command-palette cleanup so operators can wipe a
      bad cutter job without leaving Send to Plotter. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Bridge preset no-op guard — cutPrepActions.ts now warns instead of
      claiming success when Add bridges runs with a zero-count / None preset,
      PlotterDialog.tsx disables Add bridges for None, and bridges tests cover
      the zero-count no-op. README and USER_GUIDE updated. 2026-06-04.


- [x] Output-surface Clear cut paths parity — File menu and right-click Print /
      Output now expose state-aware Clear cut paths beside regmark / weed / bridge
      cleanup, matching the Plotter dialog and Document / command-palette cleanup
      flow so output operators can wipe a bad cutter job from any output surface.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Banner grommet preset chips — GrommetsDialog.tsx now adds keyboard-browsable
      Small / Standard / Large banner presets that set inset, max spacing, and
      hole diameter together, so sign-shop operators can prep common banner
      grommet jobs without manually typing three measurements. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Output-surface banner grommet presets — cutPrepActions.ts now exposes a
      shared addPlotterGrommets helper and File menu, command palette, and
      right-click Cut prep / Print Output surfaces expose Small / Standard /
      Large banner grommet presets plus a Custom dialog entry, so common
      banner-finishing jobs can be generated directly from SignMaster-style
      output workflows. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Rhinestone stone-size preset keyboard browsing — RhinestoneDialog.tsx now
      groups SS6 / SS10 / SS16 / SS20 as a labelled toolbar with active-state
      diameter readouts and Left / Right / Home / End browsing, so hotfix template
      setup matches the keyboard-browsable preset workflow used by cutter and
      banner-finishing dialogs. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Rhinestone spacing preset keyboard browsing — RhinestoneDialog.tsx now adds
      Dense / Standard / Loose spacing preset cards with active mm readouts and
      Left / Right / Home / End browsing, reducing manual hotfix template setup
      and matching the SS stone-size preset accessibility pattern. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Output-surface rhinestone presets — cutPrepActions.ts now exposes a shared
      addPlotterRhinestones helper and File menu, command palette, and right-click
      Sign Effects expose Fine / Standard / Bold stone presets plus Custom, so
      common hotfix templates can be generated from SignMaster-style output/search
      workflows without opening the Rhinestone dialog. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Rhinestone in-dialog job presets — RhinestoneDialog.tsx now mirrors the
      Fine / Standard / Bold external hotfix presets inside the dialog as a
      keyboard-browsable job preset row that sets stone diameter and spacing
      together, so operators can switch complete template recipes before Apply.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Offset / Round Corners preset keyboard browsing — OffsetPathDialog.tsx and
      RoundCornersDialog.tsx now expose their mm preset rows as labelled toolbars
      with Left / Right / Home / End browsing and active-state buttons, making
      Illustrator-style offset outlines and rounded-label cleanup faster without
      mouse-only preset picking. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Margin Guides preset keyboard browsing — MarginGuidesDialog.tsx now exposes
      the 0 / 3 / 5 / 10 / 15 / 25 mm safe-area presets as a labelled toolbar with
      Left / Right / Home / End browsing and active-state buttons, matching the
      keyboard preset workflow used by Offset Path and Round Corners. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Split Into Grid preset keyboard browsing — SplitGridDialog.tsx now adds
      1×2 / 2×1 / 2×2 / 3×2 / 3×3 row-column preset buttons as a labelled toolbar
      with Left / Right / Home / End browsing and active-state feedback, speeding
      Illustrator-style panelization, label grids, and cutter layout subdivision.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Star / Polygon common shape presets — StarDialog.tsx now adds a
      keyboard-browsable Shape presets row for 5-point star, 6-point star,
      Triangle, and Hexagon, applying the matching mode, point/sides count, and
      star inner radius before Insert so common sign shapes no longer require
      manual slider setup. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Star / Polygon spiral presets — StarDialog.tsx now adds Gentle / Standard /
      Tight spiral presets inside Spiral mode with Left / Right / Home / End
      browsing and active-state feedback, setting turns and decay together for
      faster decorative swirls, flourishes, and sign accents. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Simplify Path tolerance preset keyboard browsing — SimplifyDialog.tsx now
      exposes the 0.5 / 1 / 1.5 / 3 / 5 / 8 px tolerance presets as a labelled
      toolbar with Left / Right / Home / End browsing and active-state buttons,
      matching the Offset Path / Round Corners preset workflow for imported-art
      path cleanup. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Tile Print Auto Grid preset-toolbar browsing — TilePrintDialog.tsx now
      folds Auto Grid into the same keyboard-browsable grid preset toolbar as
      1×1, 1×2, 2×1, 2×2, 3×2, and 3×3, so large-format paneling operators can
      switch between automatic estimation and fixed proof/production grids with
      Left / Right / Home / End instead of jumping between separate controls.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Tile Print job preset recipes — TilePrintDialog.tsx now adds keyboard-browsable
      Proof / Poster / Banner job presets that set grid size, overlap, and per-page
      margin together, matching SignMaster-style paneling recipes for quick proof,
      small poster, and banner tiling setup. README, USER_GUIDE, and i18n updated.
      2026-06-04.


- [x] Resize scale preset keyboard browsing — ResizeDialog.tsx now adds Half /
      Original / Double scale presets based on the selection size captured when
      the dialog opens, with Left / Right / Home / End browsing, so common sign
      layout scaling no longer requires manually typing both exact dimensions.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Shear angle preset keyboard browsing — ShearDialog.tsx now adds -30° /
      -15° / 0° / +15° / +30° angle presets as a labelled toolbar with Left /
      Right / Home / End browsing, making Illustrator-style skew setup faster for
      italic sign text, slanted panels, and perspective accents. README,
      USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Transform move preset keyboard browsing — TransformDialog.tsx now adds 1 /
      5 / 10 / 25 active-unit move presets as a labelled toolbar with Left /
      Right / Home / End browsing; XY mode fills X movement with Y reset to zero,
      while Polar mode fills Distance, speeding exact nudge/copy setup for sign
      layout repeats. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Transform rotation preset keyboard browsing — TransformDialog.tsx now adds
      -90° / -45° / 0° / +45° / +90° / 180° rotation presets as a labelled
      toolbar with Left / Right / Home / End browsing, matching Illustrator-style
      exact-transform setup for common sign layout rotations and copy transforms.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Transform scale preset keyboard browsing — TransformDialog.tsx now adds
      50% / 100% / 150% / 200% scale presets as a labelled toolbar with Left /
      Right / Home / End browsing; linked scale applies both axes while unlinked
      scale updates X only, matching the exact-transform workflow for quick sign
      layout resizing. README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Repeat Grid preset keyboard browsing — RepeatDialog.tsx now adds 2×2 /
      3×3 / 5 across / 5 down Step & Repeat presets as a labelled toolbar with
      Left / Right / Home / End browsing, so common SignMaster-style label rows,
      columns, and small grids no longer require manual row/column entry.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Repeat Radial preset keyboard browsing — RepeatDialog.tsx now adds 6 around /
      8 around / 12 badge radial presets as a labelled toolbar with Left / Right /
      Home / End browsing, applying count, radius, angle span, and rotate-instances
      together for SignMaster-style seals, bursts, and circular badge layouts.
      README, USER_GUIDE, and i18n updated. 2026-06-04.


- [x] Repeat Mirror axis preset keyboard browsing — RepeatDialog.tsx now replaces
      Mirror's separate radio rows with Horizontal / Vertical / Both preset buttons
      in a labelled toolbar with Left / Right / Home / End browsing, keeping Mirror
      consistent with Grid and Radial repeat preset workflows. README, USER_GUIDE,
      and i18n updated. 2026-06-04.


- [x] Blend step preset keyboard browsing — BlendDialog.tsx now adds 3 / 5 /
      10 / 20 step presets as a labelled toolbar with Left / Right / Home / End
      browsing, making Illustrator-style blend setup faster for gradients,
      shadows, contour-like transitions, and sign decoration effects. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Arc Warp bend preset keyboard browsing — WarpDialog.tsx now adds -75% /
      -50% / -25% / 0 / +25% / +50% / +75% bend presets as a labelled toolbar
      with Left / Right / Home / End browsing, speeding common banner, arch,
      flag, and wave distort setup without dragging the Bend slider each time.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Pucker / Bloat amount preset keyboard browsing — PuckerDialog.tsx now adds
      -75% / -50% / -25% / 0 / +25% / +50% / +75% amount presets as a labelled
      toolbar with Left / Right / Home / End browsing, speeding Illustrator-style
      pucker, bloat, badge, burst, and organic sign-distort setup without dragging
      the signed Amount slider each time. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Twist angle preset keyboard browsing — TwistDialog.tsx now adds -180° /
      -90° / -45° / 0° / 45° / 90° / 180° angle presets as a labelled toolbar
      with Left / Right / Home / End browsing, making Illustrator-style twist
      effects faster for swirls, badges, decorative arrows, and sign accents
      without dragging the Angle slider. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Roughen recipe preset keyboard browsing — RoughenDialog.tsx now adds
      Smooth / Hand-drawn / Distressed / Rugged recipe presets that set Size and
      Detail together in a labelled toolbar with Left / Right / Home / End
      browsing, making Illustrator-style distressed, hand-cut, and organic sign
      edges faster without manually balancing two sliders. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Zig Zag recipe preset keyboard browsing — ZigzagDialog.tsx now adds
      Sawtooth / Burst / Wave / Scallop recipe presets that set Size, Ridges,
      and Smooth together in a labelled toolbar with Left / Right / Home / End
      browsing, speeding Illustrator-style corner zig-zags, bursts, wave borders,
      and scalloped sign edges without juggling three controls. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Multi-outline recipe preset keyboard browsing — OutlineEffectDialog.tsx
      now adds Shadow / Sticker / Team / Badge presets that set outline count,
      per-ring width, and common sign-colour stacks together in a labelled toolbar
      with Left / Right / Home / End browsing, matching SignMaster-style quick
      contour recipes for decals, team lettering, badges, and layered sign text.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Saturate amount preset keyboard browsing — SaturateDialog.tsx now adds
      -100% / -50% / 0 / +50% / +100% saturation presets as a labelled toolbar
      with Left / Right / Home / End browsing, making Illustrator-style Edit
      Colors cleanup faster for desaturating imported art, restoring neutral
      colour, or boosting sign artwork before production. README, USER_GUIDE,
      and i18n updated. 2026-06-04.

- [x] Brightness amount preset keyboard browsing — BrightnessDialog.tsx now adds
      -50% / -25% / 0 / +25% / +50% brightness presets as a labelled toolbar
      with Left / Right / Home / End browsing, making Edit Colors cleanup faster
      for darkening imported art, restoring neutral colour, or brightening sign
      artwork before output. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Hue shift preset keyboard browsing — HueDialog.tsx now adds -180° /
      -120° / -60° / 0 / +60° / +120° / +180° hue-shift presets as a labelled
      toolbar with Left / Right / Home / End browsing, making Edit Colors cleanup
      faster for complementary swaps, triadic palette tests, and imported sign
      artwork recolour experiments without dragging the hue slider. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Recolor mapping action keyboard browsing — RecolorDialog.tsx now adds
      Rotate map / Reverse map / Map to gray actions above the source→target
      table, all keyboard-browsable with Left / Right / Home / End, so imported
      multi-colour sign art can be palette-cycled, reversed, or grayscale-mapped
      without editing each target swatch individually. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Print job preset keyboard browsing — PrintDialog.tsx now adds Proof /
      Office / Photo fill / True size presets that set page size, orientation,
      scaling, and margin together in a keyboard-browsable toolbar with Left /
      Right / Home / End, speeding common proof, office, photo-fill, and 1:1
      output checks before PDF or system printing. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Split Into Grid recipe preset keyboard browsing — SplitGridDialog.tsx now
      adds Sticker sheet / Yard sign / Banner panels / Tile proof recipes that
      set rows, columns, and gutter together in a labelled toolbar with Left /
      Right / Home / End browsing, speeding SignMaster-style sticker sheets,
      yard-sign panels, banner segments, and tile-proof setups without balancing
      separate sliders. README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Single-line Text recipe preset keyboard browsing — SingleLineTextDialog.tsx
      now adds Engraving / Badge / Serial / Pen plot presets that set sample text,
      size, and tracking together in a labelled toolbar with Left / Right / Home /
      End browsing, making SignMaster-style engraving labels, nameplates, serial
      tags, and pen-plot text faster than manually editing every field. README,
      USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Freeform Gradient recipe preset keyboard browsing — FreeformGradientDialog.tsx
      now adds Poster glow / Neon sign / Metal plate / Heat map presets that set
      canvas size and complete color-stop recipes together in a labelled toolbar
      with Left / Right / Home / End browsing, making Illustrator-style mesh-like
      poster, sign mockup, metal plaque, and decal backgrounds faster without
      manually entering every stop. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Free Distort recipe preset keyboard browsing — FreeDistortDialog.tsx now
      expands the preset row to Left perspective / Right perspective / Skew /
      Top taper / Bottom taper / Flag wave recipes and makes both presets and
      Reset / Cancel / Apply keyboard-browsable with Left / Right / Home / End,
      speeding Illustrator-style envelope mockups for signs, banners, and panels
      without manually entering every corner offset. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Margin Guides recipe preset keyboard browsing — MarginGuidesDialog.tsx now
      adds Trim edge / Sticker safe / Office print / Banner hem recipes that set
      common 3 / 5 / 10 / 25 mm safe areas in a labelled toolbar with Left /
      Right / Home / End browsing while keeping the exact numeric preset row,
      speeding Illustrator/SignMaster print, sticker, office-proof, and banner
      finishing guides without manual margin entry. README, USER_GUIDE, and i18n
      updated. 2026-06-04.

- [x] Recolor palette recipe keyboard browsing — RecolorDialog.tsx now adds Vinyl
      primary / Monochrome sign / Safety decal / Team colors palette recipes that
      cycle target swatches across the harvested source colours in a labelled
      toolbar with Left / Right / Home / End browsing, speeding SignMaster-style
      vinyl, grayscale, safety decal, and team-lettering recolour jobs without
      editing each target swatch manually. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Find & Replace recipe preset keyboard browsing — FindReplaceDialog.tsx now
      adds Double spaces / Dash cleanup / Number token / Brand mark recipes that
      fill Find, Replace, and Match case together in a labelled toolbar with Left
      / Right / Home / End browsing, speeding Illustrator-style imported-copy
      cleanup, serial placeholder replacement, and brand-mark normalization
      without manually typing each rule. README, USER_GUIDE, and i18n updated.
      2026-06-04.

- [x] Shortcut reference search recipe keyboard browsing — ShortcutsDialog.tsx now
      adds Text keys / Output keys / View keys / Edit keys recipe chips above the
      shortcut search field, each filling a useful query and browsable with Left /
      Right / Home / End, making Illustrator/SignMaster-style keyboard discovery
      faster for text editing, output/cutter prep, view navigation, and core edit
      workflows before jumping into Customize Shortcuts. README, USER_GUIDE, and
      i18n updated. 2026-06-04.

- [x] Preferences workspace recipe keyboard browsing — PreferencesDialog.tsx now
      adds Design focus / Production prep / Presentation recipe chips above the
      preference tabs, setting theme, high contrast, grid snap, smart guides, and
      anchor snap together while keeping Apply/Save explicit; the recipe toolbar
      is browsable with Left / Right / Home / End, speeding Illustrator/SignMaster
      workspace switches between drawing, cutter prep, and presentation modes.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Resize finished-size recipe keyboard browsing — ResizeDialog.tsx now adds
      Sticker label / Name badge / Yard sign / Banner panel size recipes that set
      exact 76×51, 89×38, 457×305, and 610×305 mm targets while disabling aspect
      lock for true finished-size scaling; the recipe toolbar is browsable with
      Left / Right / Home / End, speeding SignMaster-style decal, badge, yard
      sign, and banner panel resizing without manually typing both dimensions.
      README, USER_GUIDE, and i18n updated. 2026-06-04.

- [x] Banner grommet preset live keyboard browsing — GrommetsDialog.tsx now makes
      Left / Right / Home / End on Small / Standard / Large banner preset chips
      immediately apply inset, spacing, and diameter while moving focus, with
      aria-pressed state on the active chip, so SignMaster-style banner finishing
      can compare common grommet jobs without requiring Space/Enter after every
      review step. README and USER_GUIDE updated. 2026-06-04.

- [x] Rhinestone preset live keyboard browsing — RhinestoneDialog.tsx now makes
      Left / Right / Home / End on Fine / Standard / Bold job presets, SS stone
      size presets, and Dense / Standard / Loose spacing presets immediately
      update diameter and/or spacing while moving focus, with aria-pressed state
      on active chips, so hotfix template setup can compare common SignMaster
      stone recipes without requiring Space/Enter after every review step.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties drop-shadow preset live keyboard browsing — PropertiesPanel.tsx
      now shares one Soft / Hard / Glow / Clear shadow preset list, applies the
      matching shadow while Left / Right / Home / End moves focus, and marks the
      active preset with aria-pressed plus accent styling, matching the live
      SignMaster-style review flow used by grommet and rhinestone presets.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties pattern-fill preset live keyboard browsing — PropertiesPanel.tsx
      now applies Checker / Stripes / Dots / Crosshatch and 8 / 12 / 16 / 24 /
      32 / 48 pattern sizes while Left / Right / Home / End moves focus, keeping
      the explicit Apply pattern button for color edits while making common
      sign-background pattern trials immediate from the keyboard. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Properties blend-mode preset live keyboard browsing — PropertiesPanel.tsx
      now applies Normal / Multiply / Screen / Overlay / Difference while Left /
      Right / Home / End moves focus across the visual blend previews, keeping
      the All modes dropdown for less-common Canvas compositing modes while
      making imported-art transparency trials immediate from the keyboard.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties stroke-style preset live keyboard browsing — PropertiesPanel.tsx
      now applies Solid / Dashed / Dotted dash styles, Butt / Round / Square caps,
      and Miter / Round / Bevel joins while Left / Right / Home / End moves focus
      across the visual Advanced stroke preview buttons, speeding cutter-line,
      perforation, and dimension-line finishing without extra Space/Enter presses.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties stroke-alignment preset live keyboard browsing — PropertiesPanel.tsx
      now applies Center / Inside / Outside while Left / Right / Home / End moves
      focus across the Advanced stroke alignment buttons, matching the live
      stroke-style workflow and speeding decal outlines, icon borders, and cutter
      line appearance checks without extra Space/Enter presses. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Properties Fit/Center live keyboard browsing — PropertiesPanel.tsx now
      applies Fit W / Fit H / Fit Page and Center X / Center Y / Center while
      Left / Right / Home / End moves focus across the Transform fit and center
      groups, speeding sign layout placement and artboard fitting without extra
      Space/Enter confirmation after every review step. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Properties transform-unit keyboard browsing — PropertiesPanel.tsx now lets
      the Transform mm / px unit radio group use Left / Right / Home / End to
      switch units and keep focus on the active unit, making precise sign sizing
      faster when alternating between production millimetres and canvas pixels.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Variable Data preset live keyboard browsing — VariableDataDialog.tsx now
      applies Badges 10 / Badges 50 / Odd 25 / Tickets 100 serial recipes,
      2 / 3 / 4 / 5 / 10 column presets, and 5 / 10 / 20 / 40 / 80 mm X/Y gap
      presets while Left / Right / Home / End moves focus, including linked-gap
      two-axis updates and aria-pressed active state, so badge, ticket, door-label,
      and sticker personalization previews update without extra Space/Enter
      presses. README and USER_GUIDE updated. 2026-06-04.

- [x] Roughen recipe live keyboard browsing — RoughenDialog.tsx now applies
      Smooth / Hand-drawn / Distressed / Rugged size+detail recipes while Left /
      Right / Home / End moves focus, keeps aria-pressed active state, and refreshes
      the existing canvas preview immediately so distressed-edge trials no longer
      require Space/Enter after each recipe. README and USER_GUIDE updated.
      2026-06-04.

- [x] Zig Zag recipe live keyboard browsing — ZigzagDialog.tsx now applies
      Sawtooth / Burst / Wave / Scallop size+ridges+smooth recipes while Left /
      Right / Home / End moves focus, keeps aria-pressed active state, and refreshes
      the existing canvas preview immediately so wave/scallop and jagged-edge
      trials no longer require Space/Enter after each recipe. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Pucker/Bloat amount live keyboard browsing — PuckerDialog.tsx now applies
      -75 / -50 / -25 / 0 / +25 / +50 / +75% amount presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and refreshes the
      existing canvas preview immediately so pucker-versus-bloat trials no longer
      require Space/Enter after each amount. README and USER_GUIDE updated.
      2026-06-04.

- [x] Twist angle live keyboard browsing — TwistDialog.tsx now applies
      -180 / -90 / -45 / 0 / +45 / +90 / 180° angle presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and refreshes the
      existing canvas preview immediately so swirl-direction trials no longer
      require Space/Enter after each angle. README and USER_GUIDE updated.
      2026-06-04.

- [x] Brightness amount live keyboard browsing — BrightnessDialog.tsx now
      applies -50 / -25 / 0 / +25 / +50% brightness presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and updates the
      slider/readout immediately so Edit Colors light/dark trials no longer
      require Space/Enter after each amount. README and USER_GUIDE updated.
      2026-06-04.

- [x] Saturate amount live keyboard browsing — SaturateDialog.tsx now applies
      -100 / -50 / 0 / +50 / +100% saturation presets while Left / Right / Home /
      End moves focus, keeps aria-pressed active state, and updates the slider/readout
      immediately so Edit Colors saturation trials no longer require Space/Enter
      after each amount. README and USER_GUIDE updated. 2026-06-04.

- [x] Hue shift live keyboard browsing — HueDialog.tsx now applies -180° /
      -120° / -60° / 0 / +60° / +120° / +180° hue presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and updates the
      slider/readout immediately so Edit Colors hue trials no longer require
      Space/Enter after each shift. README and USER_GUIDE updated. 2026-06-04.

- [x] Arc Warp bend live keyboard browsing — WarpDialog.tsx now applies
      -75 / -50 / -25 / 0 / +25 / +50 / +75% bend presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and updates the
      Bend slider/readout immediately so arc/banner curve trials no longer require
      Space/Enter after each bend. README and USER_GUIDE updated. 2026-06-04.

- [x] Split Into Grid preset live keyboard browsing — SplitGridDialog.tsx now
      applies Sticker sheet / Yard sign / Banner panels / Tile proof recipes and
      1×2 / 2×1 / 2×2 / 3×2 / 3×3 grid presets while Left / Right / Home / End
      moves focus, including recipe gutter updates, so panel and tile layouts no
      longer require Space/Enter after each preset. README and USER_GUIDE updated.
      2026-06-04.

- [x] Round Corners radius live keyboard browsing — RoundCornersDialog.tsx
      now applies 1 / 2 / 3 / 5 / 10 / 20 mm radius presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and updates the
      Radius slider/readout immediately so corner-fillet trials no longer require
      Space/Enter after each radius. README and USER_GUIDE updated. 2026-06-04.

- [x] Offset Path preset live keyboard browsing — OffsetPathDialog.tsx now
      applies -2 / -1 / +1 / +2 / +3 / +5 mm offset presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and updates the
      Offset input immediately so inset/outset sticker-outline trials no longer
      require Space/Enter after each offset. README and USER_GUIDE updated.
      2026-06-04.

- [x] Simplify tolerance live keyboard browsing — SimplifyDialog.tsx now
      applies 0.5 / 1 / 1.5 / 3 / 5 / 8 px tolerance presets while Left / Right /
      Home / End moves focus, keeps aria-pressed active state, and updates the
      Tolerance slider/readout immediately so imported-path cleanup trials no
      longer require Space/Enter after each tolerance. README and USER_GUIDE updated.
      2026-06-04.


- [x] Creation/distortion recipe live keyboard browsing — SingleLineTextDialog.tsx,
      FreeformGradientDialog.tsx, and FreeDistortDialog.tsx now apply their focused
      recipe while Left / Right / Home / End moves through Engraving / Badge /
      Serial / Pen plot, Poster glow / Neon sign / Metal plate / Heat map, and
      perspective/taper/wave preset rows, updating fields and Free Distort preview
      immediately so setup no longer requires Space/Enter after each recipe.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Multi-outline/Recolor recipe live keyboard browsing — OutlineEffectDialog.tsx
      now applies Shadow / Sticker / Team / Badge outline recipes while Left /
      Right / Home / End moves focus, and RecolorDialog.tsx now applies Vinyl
      primary / Monochrome sign / Safety decal / Team colors palette recipes with
      active aria-pressed feedback while browsing, so layered-outline and vinyl
      palette trials no longer require Space/Enter after each recipe. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Star / Polygon preset live keyboard browsing — StarDialog.tsx now applies
      5-point star / 6-point star / Triangle / Hexagon and Gentle / Standard /
      Tight spiral presets while Left / Right / Home / End moves focus, updating
      mode, points/sides, inner radius, turns, decay, and active aria-pressed state
      immediately so sign-shape setup no longer requires Space/Enter after each
      preset. README and USER_GUIDE updated. 2026-06-04.


- [x] Print job preset live keyboard browsing — PrintDialog.tsx now applies Proof /
      Office / Photo fill / True size page size, orientation, scaling, and margin
      recipes while Left / Right / Home / End moves focus, updating the print
      preview and Ready to print summary immediately so output setup no longer
      requires Space/Enter after each job preset. README and USER_GUIDE updated.
      2026-06-04.


- [x] Shear axis live keyboard switching — ShearDialog.tsx now treats Horizontal /
      Vertical as a keyboard-browsable radiogroup, so Left / Right / Home / End
      moves focus and immediately switches the shear axis before Apply, matching
      the angle preset workflow and reducing mouse travel in skewed sign-text
      setup. README and USER_GUIDE updated. 2026-06-04.


- [x] Transform unit/move-mode keyboard switching — TransformDialog.tsx now lets
      focused mm / px units and XY / Polar move-mode radiogroups switch with Left /
      Right / Home / End, immediately updating units or the move preset target before
      Apply so exact move/scale/rotate setup matches the keyboard-first preset rows.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Margin Guides live keyboard browsing — MarginGuidesDialog.tsx now applies
      Trim edge / Sticker safe / Office print / Banner hem recipes and 0 / 3 / 5 /
      10 / 15 / 25 mm safe-area presets while Left / Right / Home / End moves focus,
      updating the Margin input and active state immediately so print/cut safe-area
      setup no longer requires Space/Enter after each preset. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Cut Contour preset live keyboard browsing — CutContourDialog.tsx now applies
      Contour, Trace Bitmap, and Reg Marks presets while Left / Right / Home / End
      moves focus, reusing the existing click handlers so offset/passes,
      threshold/simplify/alpha, and registration arm/inset fields update immediately
      without requiring Space/Enter after each cutter setup preset. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Plotter cut-strategy live keyboard switching — PlotterDialog.tsx now toggles
      Mirror, Optimize order, Reverse direction, and Inner contours first as
      Left / Right / Home / End moves focus across the strategy row, keeping the
      active aria-pressed state and Ready to output summary in sync so HTV and
      print-and-cut setup no longer needs Space/Enter after each strategy check.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Find & Replace recipe live keyboard browsing — FindReplaceDialog.tsx now
      applies Double spaces / Dash cleanup / Number token / Brand mark recipes as
      Left / Right / Home / End moves focus, filling Find, Replace, and Match case
      and refreshing the live match count immediately so imported-copy cleanup and
      serial placeholder setup no longer require Space/Enter after each recipe.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Preferences recipe live keyboard browsing — PreferencesDialog.tsx now
      applies Design focus / Production prep / Presentation workspace recipes as
      Left / Right / Home / End moves focus, switches to the Workspace tab, and
      highlights the active recipe with aria-pressed so drawing, cutter-prep, and
      presentation workspace drafts no longer require Space/Enter after each
      recipe check. README and USER_GUIDE updated. 2026-06-04.

- [x] Shortcut reference recipe live keyboard browsing — ShortcutsDialog.tsx now
      applies Text keys / Output keys / View keys / Edit keys search recipes as
      Left / Right / Home / End moves focus, updating the search query, active
      aria-pressed chip, match count, and visible shortcut cards immediately so
      keyboard discovery no longer requires Space/Enter after each recipe.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Artboard size preset live keyboard browsing — ArtboardsPanel.tsx now applies
      row-level A4 / Letter / 24×12 in size presets as Left / Right / Home / End
      moves focus through the size toolbar while leaving Swap W/H and Fit actions
      as Space/Enter-confirmed commands, so print, sticker, and banner artboards
      can be resized from the panel without an extra activation keystroke.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Properties suggested-palette live keyboard browsing — PropertiesPanel.tsx
      now applies generated 5-colour Suggested palette swatches as Left / Right /
      Home / End moves focus, updating the selection fill immediately while
      preserving Space/Enter activation so sign and sticker colour trials no
      longer require an extra confirmation keystroke after each swatch.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Font preview live keyboard browsing — FontPicker.tsx now applies recent and
      filtered font preview rows as Up / Down / Home / End moves focus, updating
      selected text immediately while preserving Space/Enter activation and recent
      font tracking so sign text can be auditioned without an extra confirmation
      keystroke after each font. README and USER_GUIDE updated. 2026-06-04.

- [x] Font preview active-row feedback — FontPicker.tsx now reads the selected
      text object's current font family and marks matching recent/search preview
      rows with aria-selected plus accent styling, so live arrow-key font browsing
      always shows which family is currently applied across the text selection.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Template and library tile review feedback — TemplatesDialog.tsx,
      AssetsPanel.tsx, and SymbolsPanel.tsx now keep the current arrow-key
      reviewed tile highlighted with aria-selected plus a polite review status
      that announces item name and position, so keyboard users can audit
      templates, reusable artwork, and symbols before pressing Enter without
      accidentally applying or inserting while browsing. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Shortcut Output recipe multi-keyword search — ShortcutsDialog.tsx and
      KeymapEditor.tsx now support `|`-separated search terms, and Output
      keys filters print / cut / plotter / export together so keyboard
      discovery plus Edit First handoff surfaces Cut Contour and Send to
      Plotter beside print/export shortcuts instead of hiding cutter commands
      behind separate manual searches. README and USER_GUIDE updated.
      2026-06-04.

- [x] Shortcut list active-row review feedback — ShortcutsDialog.tsx and
      KeymapEditor.tsx now keep the currently arrow-key reviewed shortcut
      highlighted and expose polite review status text with action name and
      position, so keyboard users can audit shortcut cards and rebindable rows
      before editing without losing their place in long Illustrator/SignMaster
      command lists. README and USER_GUIDE updated. 2026-06-04.

- [x] Command Palette active-command review feedback — CommandPalette.tsx
      now exposes a polite review status for the highlighted command and shows
      Home / End plus PgUp / PgDn hints beside the existing arrow / Enter / Esc
      footer, so keyboard users can skim long Illustrator/SignMaster command
      lists quickly while assistive tech announces the command name and
      position before running it. README and USER_GUIDE updated. 2026-06-04.

- [x] Print page-size review status — PrintDialog.tsx and
      TilePrintDialog.tsx now attach polite review status text to the searchable
      page-size listboxes, announcing the current A4 / A3 / Letter / Legal
      choice and position as arrow keys move through the list, so print and
      tiled-output setup matches the active-row feedback used by command,
      shortcut, template, asset, and symbol browsers. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Plotter material review status — PlotterDialog.tsx now attaches
      polite review status text to the searchable material preset list,
      announcing the current vinyl / HTV / paper material name and position as
      arrow keys move through feed / force / speed / overcut cards, so cutter
      setup gets the same active-row feedback as print page sizes and shortcut
      browsers. README and USER_GUIDE updated. 2026-06-04.

- [x] Font preview review status — FontPicker.tsx now attaches polite
      review status text to the recent/search font preview list, announcing the
      active preview family name and position as arrow keys live-apply fonts to
      selected text, so text styling gets the same current-row feedback as
      command, shortcut, material, and page-size browsers. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Layers active-row review status — LayersPanel.tsx now pairs the
      existing layer-list keyboard hint with a polite review status that
      announces the focused layer name, position, visibility, and lock state as
      Up / Down / Home / End moves through filtered rows, so dense imported
      artwork can be audited without looking away from the keyboard workflow.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Artboards active-row review status — ArtboardsPanel.tsx now keeps the
      focused artboard row highlighted with aria-selected and exposes a polite
      review status that announces artboard name, position, and pixel size as
      Up / Down / Home / End moves through filtered rows, so multi-page print,
      sticker, and cutter layouts can be audited from the keyboard before
      targeting, duplicating, deleting, or resizing a board. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Help Center topic review status — HelpCenter.tsx now attaches a polite
      review status to the searchable topic list, announcing the active help
      topic title, position, and category as ArrowDown, Up / Down, and Home / End
      move through results, so keyboard users can audit long Illustrator /
      SignMaster workflow documentation before opening or reading a topic body.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Variable Data preview review status — VariableDataDialog.tsx now makes
      Generation preview an atomic polite status that announces Numbers/List
      source mode, total value count, grid rows/columns, and the first sample
      values whenever serial presets, pasted lists, columns, fill order, or gap
      controls change, so badge, ticket, and label runs can be checked from the
      keyboard before Generate. README and USER_GUIDE updated. 2026-06-04.


- [x] Find & Replace recipe review status — FindReplaceDialog.tsx now pairs the
      live Double spaces / Dash cleanup / Number token / Brand mark recipe toolbar
      with a polite review status that announces the focused recipe name,
      position, and purpose while Left / Right / Home / End fills Find, Replace,
      and Match case, so imported copy cleanup and serial-placeholder setup can
      be audited before Replace All. README and USER_GUIDE updated. 2026-06-04.


- [x] Recovery action review status — RecoveryDialog.tsx now adds a polite
      review status to the Discard / Restore toolbar, announcing the currently
      focused recovery action while Left / Right or Home / End moves focus, so
      autosave recovery can be audited from the keyboard before choosing the safe
      discard path or restoring prior work. README and USER_GUIDE updated.
      2026-06-04.


- [x] Debug diagnostics action review status — DebugPanel.tsx now adds a polite
      review status to the Copy diagnostics / Download diagnostics / Clear log /
      Close toolbar, announcing the currently focused diagnostics action while
      Left / Right or Home / End moves focus, so support and plotter-debug
      workflows can be audited from the keyboard before copying, downloading,
      clearing, or closing. README and USER_GUIDE updated. 2026-06-04.


- [x] Onboarding slide/action review status — Onboarding.tsx now adds a polite
      review status shared by the slide dots and Back / Next / Get Started
      action toolbar, announcing the focused slide title or action while Left /
      Right or Home / End moves focus, so first-run keyboard users can audit the
      guided tour before changing pages or dismissing it. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Cut Contour preset review status — CutContourDialog.tsx now adds polite
      review status text to the Outline, Trace Bitmap, and Reg Marks preset
      toolbars, announcing the focused preset name plus offset/passes,
      threshold/simplify/alpha, or arm/inset values while Left / Right or
      Home / End live-applies recipes, so sticker contour, bitmap trace, and
      optical-registration setup can be audited before generating cut paths.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter weed/bridge preset review status — PlotterDialog.tsx now adds
      polite review status text to the Weed grid and Bridge preset groups,
      announcing the focused rows/columns or bridge count/gap while Left / Right
      or Home / End live-switches output-prep presets, so vinyl weeding and
      stencil bridge trials can be audited from the keyboard before adding
      borders or bridges. README and USER_GUIDE updated. 2026-06-04.


- [x] Tile Print overlap/margin preset review status — TilePrintDialog.tsx now
      adds polite review status text to the Overlap and Margin preset groups,
      announcing the focused millimetre value while Left / Right or Home / End
      live-switches panel-print overlap and printable-margin setup, so poster and
      banner tiling can be audited from the keyboard before printing. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Print margin/bleed preset review status — PrintDialog.tsx now adds polite
      review status text to the Margin and Bleed preset groups, announcing the
      focused millimetre value while Left / Right or Home / End switches print
      margins and print-prep bleed, so proof, sticker, and press output setup can
      be audited from the keyboard before exporting PDF or printing. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Print job/prep preset review status — PrintDialog.tsx now adds polite
      review status text to the Proof / Office / Photo fill / True size print job
      toolbar and the Proof / Press / Sticker / None print-prep toolbar,
      announcing the focused recipe page, orientation, scaling, margin, bleed,
      and mark settings while Left / Right or Home / End live-switches setup, so
      print operators can audit output recipes from the keyboard before PDF or
      print. README and USER_GUIDE updated. 2026-06-04.


- [x] Tile Print job/grid preset review status — TilePrintDialog.tsx now adds
      polite review status text to the Proof / Poster / Banner tile-job toolbar
      and the Auto / fixed grid preset toolbar, announcing the focused job name,
      grid, page count, overlap, and margin or the current reviewed grid while
      Left / Right or Home / End live-switches paneling setup. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Plotter speed/tolerance preset review status — PlotterDialog.tsx now adds
      polite review status text to Feed rate, Travel rate, Curve tolerance, and
      Overcut preset groups, announcing the focused value and unit while Left /
      Right or Home / End live-switches machine setup, so cutter operators can
      audit speed and blade-compensation settings before sending HP-GL or G-code.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter cut-strategy/preview review status — PlotterDialog.tsx now adds
      polite review status text to the Mirror / Optimize / Reverse / Inner-first
      strategy toolbar and the Show print / Cut order preview toggles, announcing
      the focused control and on/off state while keyboard browsing moves across
      the groups, so cutter operators can audit output strategy and preview
      overlays without relying only on visual highlighting. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Plotter cut-by-colour action review status — PlotterDialog.tsx now adds
      polite review status text to the All colors / No colors / Invert / Next
      color toolbar, announcing the focused action plus resulting active-colour
      count or next solo swatch while keyboard browsing moves across separation
      controls, so multi-colour vinyl jobs can be audited before muting or soloing
      a layer. README and USER_GUIDE updated. 2026-06-04.


- [x] Plotter output action review status — PlotterDialog.tsx now adds polite
      review status text to the Cancel / Test cut / Save File / Send via USB
      footer action group, announcing the focused action plus calibration hint,
      filename, blocked reason, or final send summary while Left / Right or
      Home / End moves focus, so cutter operators can audit the last output step
      before saving a file or sending over USB. README and USER_GUIDE updated.
      2026-06-04.


- [x] Rhinestone preset review status — RhinestoneDialog.tsx now adds polite
      review status text to the Fine / Standard / Bold job presets, SS stone-size
      presets, and Dense / Standard / Loose spacing presets, announcing the
      focused recipe name, stone diameter, or spacing while Left / Right or
      Home / End live-applies hotfix template setup. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Banner Grommets preset review status — GrommetsDialog.tsx now adds polite
      review status text to the Small / Standard / Large banner preset toolbar,
      announcing the focused preset name plus inset, maximum spacing, and hole
      diameter while Left / Right or Home / End live-applies finishing setup, so
      sign/banner operators can audit grommet recipes before Apply. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Split Into Grid preset review status — SplitGridDialog.tsx now adds polite
      review status text to the Sticker sheet / Yard sign / Banner panels / Tile
      proof recipe toolbar and the 1×2 / 2×1 / 2×2 / 3×2 / 3×3 grid preset
      toolbar, announcing the focused recipe or grid plus rows, columns, and
      gutter while Left / Right or Home / End live-applies layout setup. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Star / Polygon preset review status — StarDialog.tsx now adds polite
      review status text to the 5-point star / 6-point star / Triangle / Hexagon
      shape preset toolbar and Gentle / Standard / Tight spiral preset toolbar,
      announcing the focused recipe plus points, sides, inner-radius ratio, winds,
      or decay while Left / Right or Home / End live-applies shape setup. README
      and USER_GUIDE updated. 2026-06-04.


- [x] Resize preset review status — ResizeDialog.tsx now adds polite review
      status text to the Sticker label / Name badge / Yard sign / Banner panel
      size recipes and Half / Original / Double scale preset toolbar,
      announcing the focused recipe name, target width, target height, or no
      selection warning while Left / Right or Home / End live-updates resize
      fields. README and USER_GUIDE updated. 2026-06-04.

- [x] Shear preset review status — ShearDialog.tsx now adds polite review
      status text to the -30° / -15° / 0° / +15° / +30° angle preset toolbar
      and Horizontal / Vertical axis switcher, announcing the focused angle or
      axis while Left / Right or Home / End live-updates the shear setup before
      Apply. README and USER_GUIDE updated. 2026-06-04.

- [x] Transform preset review status — TransformDialog.tsx now adds polite
      review status text to the mm/px unit switcher, XY/Polar move-mode switcher,
      1 / 5 / 10 / 25 move presets, 50% / 100% / 150% / 200% scale presets, and
      -90° / -45° / 0° / +45° / +90° / 180° rotation presets, announcing the
      focused unit, mode, move target, scale target, or rotation while Left /
      Right or Home / End live-updates transform fields. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Repeat preset review status — RepeatDialog.tsx now adds polite review
      status text to the Grid 2×2 / 3×3 / 5 across / 5 down presets, Radial
      6 around / 8 around / 12 badge presets, and Mirror Horizontal / Vertical /
      Both axis presets, announcing focused rows/columns, radial count/radius/
      rotate state, or mirror axis while Left / Right or Home / End live-updates
      repeat setup. README and USER_GUIDE updated. 2026-06-04.

- [x] Offset Path preset review status — OffsetPathDialog.tsx now adds polite
      review status text to the -2 / -1 / +1 / +2 / +3 / +5 mm offset preset
      toolbar, announcing the focused inward or outward offset value while Left /
      Right or Home / End live-updates the offset input before Apply. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Round Corners preset review status — RoundCornersDialog.tsx now adds
      polite review status text to the 1 / 2 / 3 / 5 / 10 / 20 mm radius preset
      toolbar, announcing the focused radius while Left / Right or Home / End
      live-updates the radius slider before Apply. README and USER_GUIDE updated.
      2026-06-04.

- [x] Simplify Path preset review status — SimplifyDialog.tsx now adds polite
      review status text to the 0.5 / 1 / 1.5 / 3 / 5 / 8 px tolerance preset
      toolbar, announcing the focused tolerance while Left / Right or Home / End
      live-updates the tolerance slider before Apply. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Roughen preset review status — RoughenDialog.tsx now adds polite review
      status text to Smooth / Hand-drawn / Distressed / Rugged recipe presets
      and makes Left / Right or Home / End browsing live-load the focused recipe,
      announcing its size and detail while the magenta preview refreshes. README
      and USER_GUIDE updated. 2026-06-04.

- [x] Zig Zag preset review status — ZigzagDialog.tsx now adds polite review
      status text to Sawtooth / Burst / Wave / Scallop recipe presets, announcing
      each focused recipe's size, ridges, and Corner/Smooth state while Left /
      Right or Home / End live-loads the recipe and refreshes the magenta preview.
      README and USER_GUIDE updated. 2026-06-04.

- [x] Pucker/Bloat preset review status — PuckerDialog.tsx now adds polite
      review status text to the -75 / -50 / -25 / 0 / +25 / +50 / +75% amount
      preset toolbar, announcing focused Pucker or Bloat percentage while Left /
      Right or Home / End live-updates the slider and magenta preview. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Twist preset review status — TwistDialog.tsx now adds polite review
      status text to the -180° / -90° / -45° / 0° / 45° / 90° / 180° angle
      preset toolbar, announcing the focused twist angle while Left / Right or
      Home / End live-updates the slider and magenta preview. README and
      USER_GUIDE updated. 2026-06-04.

- [x] Arc Warp bend preset review status — WarpDialog.tsx now adds polite review
      status text to the -75 / -50 / -25 / 0 / +25 / +50 / +75% bend preset
      toolbar, announcing the focused bend percentage while Left / Right or
      Home / End live-updates the Bend slider before Apply. README and USER_GUIDE
      updated. 2026-06-04.

- [x] Blend step preset review status — BlendDialog.tsx now adds polite review
      status text to the 3 / 5 / 10 / 20 blend step preset toolbar, announcing
      the focused step count while Left / Right or Home / End live-updates the
      Steps slider before Apply. README and USER_GUIDE updated. 2026-06-04.


- [x] Multi-outline preset review status — OutlineEffectDialog.tsx now adds polite
      review status text to the Shadow / Sticker / Team / Badge outline recipe
      toolbar, announcing the focused recipe, outline count, and per-ring width
      while Left / Right or Home / End live-loads the contour stack before Apply.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Free Distort preset review status — FreeDistortDialog.tsx now adds polite
      review status text to the Left/Right perspective, Skew, Top/Bottom taper,
      and Flag wave preset toolbar, announcing the focused recipe and purpose
      while Left / Right or Home / End live-loads the four-corner preview before
      Apply. README and USER_GUIDE updated. 2026-06-04.


- [x] Freeform Gradient preset review status — FreeformGradientDialog.tsx now
      adds polite review status text to the Poster glow / Neon sign / Metal
      plate / Heat map recipe toolbar, announcing the focused recipe, purpose,
      canvas size, and stop count while Left / Right or Home / End live-loads
      the gradient before Create. README and USER_GUIDE updated. 2026-06-04.


- [x] Hue shift preset review status — HueDialog.tsx now adds polite review
      status text to the -180 / -120 / -60 / 0 / +60 / +120 / +180° hue preset
      toolbar, announcing the focused hue offset while Left / Right or Home /
      End live-updates the slider before Apply. README and USER_GUIDE updated.
      2026-06-04.


- [x] Saturation preset review status — SaturateDialog.tsx now adds polite
      review status text to the -100 / -50 / 0 / +50 / +100% saturation preset
      toolbar, announcing the focused saturation amount while Left / Right or
      Home / End live-updates the slider before Apply. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Brightness preset review status — BrightnessDialog.tsx now adds polite
      review status text to the -50 / -25 / 0 / +25 / +50% brightness preset
      toolbar, announcing the focused brightness amount while Left / Right or
      Home / End live-updates the slider before Apply. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Recolor palette recipe review status — RecolorDialog.tsx now adds polite
      review status text to the Vinyl primary / Monochrome sign / Safety decal /
      Team colors recipe toolbar, announcing the focused palette recipe, purpose,
      and color count while Left / Right or Home / End live-applies the mapping
      before Apply. README and USER_GUIDE updated. 2026-06-04.


- [x] Single-line Text preset review status — SingleLineTextDialog.tsx now adds
      polite review status text to the Engraving / Badge / Serial / Pen plot
      preset toolbar, announcing the focused recipe, sample text, size, and
      tracking while Left / Right or Home / End live-loads the single-line text
      setup before Create. README and USER_GUIDE updated. 2026-06-04.


- [x] Margin Guides preset review status — MarginGuidesDialog.tsx now adds
      polite review status text to the Trim edge / Sticker safe / Office print /
      Banner hem safe-area recipe toolbar and the 0 / 3 / 5 / 10 / 15 / 25 mm
      margin preset toolbar, announcing the focused recipe purpose or margin
      value while Left / Right or Home / End live-updates the Margin field before
      Apply. README and USER_GUIDE updated. 2026-06-04.


- [x] Character size preset review status — CharacterPanel.tsx now adds polite
      review status text to the 12 / 18 / 24 / 36 / 48 / 72 / 96 / 144 / 216
      font-size preset group, announcing the focused size while Left / Right or
      Home / End live-applies the size to selected text. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Character tracking preset review status — CharacterPanel.tsx now adds
      polite review status text to the tight / normal / loose / wide tracking
      preset group, announcing the focused tracking value while Left / Right or
      Home / End live-applies character spacing to selected text. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Character leading preset review status — CharacterPanel.tsx now adds
      polite review status text to the 0.9 / 1 / 1.16 / 1.5 / 2 leading preset
      group, announcing the focused line-height value while Left / Right or
      Home / End live-applies leading to selected text. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Character scale preset review status — CharacterPanel.tsx now adds polite
      review status text to the 75 / 85 / 100 / 115 / 125% horizontal scale
      preset group and the 75 / 100 / 125% vertical scale preset group,
      announcing the focused glyph scaling percentage while Left / Right or
      Home / End live-applies text condense/extend values. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Variable Data preset review status — VariableDataDialog.tsx now adds
      polite review status text to the Badges/Tickets serial recipe toolbar,
      2 / 3 / 4 / 5 / 10 column presets, and 5 / 10 / 20 / 40 / 80 mm Gap X/Y
      presets, announcing focused numbering parameters, column count, gap axis,
      millimeter value, and linked-gap state while Left / Right or Home / End
      live-loads the batch layout. README and USER_GUIDE updated. 2026-06-04.


- [x] Properties appearance preset review status — PropertiesPanel.tsx now adds
      polite review status text to the 0 / 0.5 / 1 / 2 / 4 / 8 px stroke-width
      presets, 100 / 75 / 50 / 25% opacity presets, and 0 / 45 / 90 / 135 / 180 /
      270° gradient-angle presets, announcing the focused appearance value while
      Left / Right or Home / End live-applies the selection styling. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Properties pattern/filter preset review status — PropertiesPanel.tsx now
      adds polite review status text to the 8 / 12 / 16 / 24 / 32 / 48 pattern
      size presets plus Blur, Brightness, Contrast, and Hue filter strength
      presets, announcing the focused size, blur amount, tone amount, or hue
      angle while Left / Right or Home / End live-applies the panel effect.
      README and USER_GUIDE updated. 2026-06-04.


- [x] Properties transform preset review status — PropertiesPanel.tsx now adds
      polite review status text to the 25 / 50 / 75 / 100 / 150 / 200% scale
      presets, Fit W / Fit H / Fit Page actions, Center X / Center Y / Center
      actions, and 0 / 90 / 180 / -90° rotation presets, announcing the focused
      transform action or value while Left / Right or Home / End live-applies
      layout changes. README and USER_GUIDE updated. 2026-06-04.


- [x] Properties advanced-stroke preset review status — PropertiesPanel.tsx now
      adds polite review status text to Dash, Line cap, Line join, Miter limit,
      and Stroke alignment preset groups, announcing the focused stroke style,
      cap, join, miter value, or alignment while Left / Right or Home / End
      live-applies cutter-friendly stroke settings. README and USER_GUIDE
      updated. 2026-06-04.


- [x] Layers action review status — LayersPanel.tsx now adds a polite live
      review status for the top quick-action toolbar and search action toolbar,
      announcing focused Select Visible / Select Unlocked / Hide Others / Show
      All / Unlock All and Select/Hide/Lock/Show/Unlock Matches actions while
      Left / Right or Home / End browses layer cleanup commands. README and
      USER_GUIDE updated. 2026-06-04.


- [x] Asset/Symbol library action review status — AssetsPanel.tsx and
      SymbolsPanel.tsx now add polite review status text to Asset Import / Trace,
      shared Insert First / Clear search library actions, and Symbol Save /
      Cancel naming actions, announcing the focused action while Left / Right or
      Home / End browses reusable-asset workflows. README and USER_GUIDE updated.
      2026-06-04.


- [x] Artboard action review status — ArtboardsPanel.tsx now adds polite review
      status text to Target First / Clear search actions, row-level A4 / Letter /
      24×12 in size presets, Swap W/H, and Fit Selection / Fit Artwork controls,
      announcing the focused artboard action while Left / Right or Home / End
      browses page-layout commands. README and USER_GUIDE updated. 2026-06-04.


- [x] Document Settings action review status — DocSettingsDialog.tsx now adds
      polite review status text to Use First / Clear search preset actions,
      Portrait / Landscape orientation buttons, and Cancel / Apply footer
      actions, announcing the focused document setup action while Left / Right
      or Home / End browses page-start controls. README and USER_GUIDE updated.
      2026-06-04.


- [x] Template search action review status — TemplatesDialog.tsx now adds
      polite review status text to Use First / Clear search template actions,
      announcing the focused template action while Left / Right or Home / End
      browses template-start controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Keyboard Shortcuts search action review status — ShortcutsDialog.tsx now
      adds polite review status text to Edit First / Clear search shortcut
      actions, announcing the focused shortcut action while Left / Right or
      Home / End browses the cheat-sheet search controls. README and USER_GUIDE
      updated. 2026-06-05.

- [x] Print page search action review status — PrintDialog.tsx and
      TilePrintDialog.tsx now add polite review status text to Use First /
      Clear page-size search actions, announcing the focused output page action
      while Left / Right or Home / End browses print and tile-print setup
      controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Command Palette search action review status — CommandPalette.tsx now adds
      polite review status text to Run First / Clear search command actions,
      announcing the focused command-palette action while Left / Right or Home /
      End browses the search controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Help Center search action review status — HelpCenter.tsx now adds polite
      review status text to Open First / Clear search help actions, announcing
      the focused help action while Left / Right or Home / End browses the help
      search controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Preferences search action review status — PreferencesDialog.tsx now adds
      polite review status text to Go First / Clear search preferences actions,
      announcing the focused settings action while Left / Right or Home / End
      browses workspace/settings search controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Customize Shortcuts search action review status — KeymapEditor.tsx now
      adds polite review status text to Edit First / Clear search keymap
      actions, announcing the focused rebind action while Left / Right or Home /
      End browses shortcut-editor search controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Font search action review status — FontPicker.tsx now adds polite review
      status text to Apply First / Clear search font actions, announcing the
      focused font action while Left / Right or Home / End browses typography
      search controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Find & Replace action review status — FindReplaceDialog.tsx now adds
      polite review status text to Clear fields / Swap find/replace helpers and
      Cancel / Replace All footer actions, announcing the focused text-cleanup
      action while Left / Right or Home / End browses the dialog controls.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Single-line Text action review status — SingleLineTextDialog.tsx now adds
      polite review status text to Cancel / Create footer actions, announcing the
      focused engraving-text action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Freeform Gradient action review status — FreeformGradientDialog.tsx now
      adds polite review status text to Cancel / Create footer actions,
      announcing the focused freeform-gradient action while Left / Right or
      Home / End browses the dialog controls. USER_GUIDE updated. 2026-06-05.

- [x] Variable Data action review status — VariableDataDialog.tsx now adds
      polite review status text to Sample / Clean / Dedupe / Sort / Reverse /
      Clear list actions and Cancel / Generate footer actions, announcing the
      focused batch-numbering action while Left / Right or Home / End browses
      list cleanup and generation controls. README and USER_GUIDE updated.
      2026-06-05.


- [x] Arc Warp footer action review status — WarpDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the
      focused warp commit action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Rhinestone footer action review status — RhinestoneDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused hotfix-template commit action while Left / Right or Home / End
      browses the dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Split Into Grid footer action review status — SplitGridDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused grid-splitting commit action while Left / Right or Home / End
      browses the dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Star / Polygon footer action review status — StarDialog.tsx now adds
      polite review status text to Cancel / Insert footer actions, announcing the
      focused shape-insertion action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Banner Grommets footer action review status — GrommetsDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused banner-finishing action while Left / Right or Home / End browses
      the dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Transform footer action review status — TransformDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused exact-transform action while Left / Right or Home / End browses
      the dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Resize footer action review status — ResizeDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the
      focused exact-size action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Shear footer action review status — ShearDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the
      focused skew-transform action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Repeat footer action review status — RepeatDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the
      focused step-and-repeat commit action while Left / Right or Home / End
      browses the dialog controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Margin Guides footer action review status — MarginGuidesDialog.tsx now
      adds polite review status text to Cancel / Apply footer actions,
      announcing the focused safe-area guide action while Left / Right or Home /
      End browses the dialog controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Offset Path footer action review status — OffsetPathDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused offset-commit action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Round Corners footer action review status — RoundCornersDialog.tsx now
      adds polite review status text to Cancel / Apply footer actions,
      announcing the focused rounded-label commit action while Left / Right or
      Home / End browses the dialog controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Simplify Path footer action review status — SimplifyDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused path-cleanup commit action while Left / Right or Home / End browses
      the dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Roughen footer action review status — RoughenDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the focused
      distressed-edge commit action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Zig Zag footer action review status — ZigzagDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the focused
      wave/corner commit action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Pucker/Bloat footer action review status — PuckerDialog.tsx now adds
      polite review status text to Cancel / Apply footer actions, announcing the
      focused pucker/bloat commit action while Left / Right or Home / End browses
      the dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Twist footer action review status — TwistDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the focused
      twist commit action while Left / Right or Home / End browses the dialog
      controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Blend footer action review status — BlendDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the focused
      object-blend commit action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Multi-outline footer action review status — OutlineEffectDialog.tsx now
      adds polite review status text to Cancel / Apply footer actions,
      announcing the focused layered-outline commit action while Left / Right or
      Home / End browses the dialog controls. README and USER_GUIDE updated.
      2026-06-05.

- [x] Saturate footer action review status — SaturateDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the focused
      saturation commit action while Left / Right or Home / End browses the
      dialog controls. README and USER_GUIDE updated. 2026-06-05.

- [x] Adjust Hue footer action review status — HueDialog.tsx now adds polite
      review status text to Cancel / Apply footer actions, announcing the focused
      hue-shift commit action while Left / Right or Home / End browses the dialog
      controls. USER_GUIDE updated. 2026-06-05.

- [x] Adjust Brightness footer action review status — BrightnessDialog.tsx now
      adds polite review status text to Cancel / Apply footer actions,
      announcing the focused brightness commit action while Left / Right or Home
      / End browses the dialog controls. USER_GUIDE updated. 2026-06-05.


- [x] Recolor Artwork action review status — RecolorDialog.tsx now adds polite
      review status text to Rotate map / Reverse map / Map to gray helper
      actions and Reset / Cancel / Apply footer actions, announcing the focused
      recolor action while Left / Right or Home / End browses dialog controls.
      USER_GUIDE updated. 2026-06-05.


- [x] Free Distort footer action review status — FreeDistortDialog.tsx now adds
      polite review status text to Reset / Cancel / Apply footer actions,
      announcing the focused four-corner distortion action while Left / Right or
      Home / End browses dialog controls. USER_GUIDE updated. 2026-06-05.


- [x] Cut Contour cleanup/output action review status — CutContourDialog.tsx now
      adds polite review status text to Clear contour / Clear trace / Clear
      regmarks / Clear all cleanup actions plus Close / Send to Plotter output
      actions, announcing the focused cutter-prep action while Left / Right or
      Home / End browses dialog controls. USER_GUIDE updated. 2026-06-05.


- [x] Plotter prep action review status — PlotterDialog.tsx now groups Weed
      border / positioning mark / cut-path cleanup actions and Add/Clear bridges
      into keyboard-browsable action toolbars with polite review status text,
      announcing the focused cutter-prep action while Left / Right or Home / End
      browses output controls. USER_GUIDE updated. 2026-06-05.


- [x] Tile Print output action review status — TilePrintDialog.tsx now adds
      polite review status text to Cancel / Print footer actions, announcing the
      focused tiled-output action while Left / Right or Home / End browses the
      final print controls. USER_GUIDE updated. 2026-06-05.


- [x] Print output action review status — PrintDialog.tsx now adds polite review
      status text to Cancel / PDF / Print footer actions, announcing the focused
      print-output action while Left / Right or Home / End browses final output
      controls. USER_GUIDE updated. 2026-06-05.


- [x] Preferences recipe/footer action review status — PreferencesDialog.tsx now
      adds polite review status text to Design focus / Production prep /
      Presentation workspace recipes plus Cancel / Apply / Save footer actions,
      announcing the focused preference action while Left / Right or Home / End
      browses settings controls. README and USER_GUIDE updated. 2026-06-05.


- [x] Keyboard Shortcuts recipe/footer review status — ShortcutsDialog.tsx now
      adds polite review status text to Text / Output / View / Edit search
      recipes and the Customize Shortcuts footer handoff, announcing the focused
      shortcut-help action while Left / Right or Home / End browses controls.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Template category filters — TemplatesDialog.tsx and templates.ts now add
      Business / Social / Logo / Print / Stickers categories with visible counts,
      keyboard-browsable category chips, active filter state, and polite review
      status so New from Template can be narrowed before searching or browsing
      tiles. README and USER_GUIDE updated. 2026-06-05.

- [x] Template category-aware result summary — TemplatesDialog.tsx now
      reports search matches against the active category size instead of the
      full template library, and shows the selected category name when browsing
      without a query so New from Template filtering is auditable at a glance.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Template empty-result recovery actions — TemplatesDialog.tsx now
      adds keyboard-browsable Clear search / Show all categories / Reset
      filters buttons with polite review status when a template category and
      query combination has no matches, giving New from Template a fast recovery
      path without retyping. README and USER_GUIDE updated. 2026-06-05.

- [x] Asset/Symbol empty-result clear recovery — AssetsPanel.tsx and
      SymbolsPanel.tsx now show a direct Clear search button when a reusable
      library query has no matches, giving imported asset and symbol browsing a
      quick recovery path without returning to the search field. README and
      USER_GUIDE updated. 2026-06-05.

- [x] Layers empty-result clear recovery — LayersPanel.tsx now shows a
      direct Clear search button when a layer query hides every object, giving
      dense imported layouts a quick way back to the full stack without
      returning to the search field. README and USER_GUIDE updated. 2026-06-05.

- [x] Shortcut search empty-result clear recovery — ShortcutsDialog.tsx
      and KeymapEditor.tsx now show direct Clear search buttons when shortcut
      discovery or rebinding searches have no matches, giving keyboard-first
      users a quick recovery path without editing the query by hand. README and
      USER_GUIDE updated. 2026-06-05.

- [x] Command Palette empty-result clear recovery — CommandPalette.tsx
      now shows a direct Clear search button when a command query has no
      matches, giving keyboard-first command discovery a quick reset path from
      the empty state. README and USER_GUIDE updated. 2026-06-05.

- [x] Help Center empty-result clear recovery — HelpCenter.tsx now shows
      a direct Clear search button when a help topic query has no matches,
      giving feature-discovery searches a quick reset path from the empty
      state. README and USER_GUIDE updated. 2026-06-05.

- [x] Preferences empty-result clear recovery — PreferencesDialog.tsx
      now shows direct Clear search buttons in both the sidebar and content
      empty states when a settings query has no matches, giving workspace setup
      searches a quick reset path. README and USER_GUIDE updated. 2026-06-05.

- [x] Print page-size empty-result clear recovery — PrintDialog.tsx and
      TilePrintDialog.tsx now show direct Clear search buttons when page-size
      searches have no matches, giving print and tiling setup a quick reset
      path from the empty state. README and USER_GUIDE updated. 2026-06-05.

- [x] Plotter material empty-result clear recovery — PlotterDialog.tsx
      now shows a direct Clear search button when material preset searches
      have no matches, giving cutter setup a quick reset path from the empty
      material list. README and USER_GUIDE updated. 2026-06-05.

- [x] Document Settings preset empty-result clear recovery —
      DocSettingsDialog.tsx now shows a direct Clear search button when preset
      size searches have no matches, giving document and artboard setup a quick
      reset path from the empty state. README and USER_GUIDE updated.
      2026-06-05.

- [x] Font picker empty-result clear recovery — FontPicker.tsx now shows
      a direct Clear search button when font searches have no matches, giving
      typography cleanup a quick reset path from the empty preview list. README
      and USER_GUIDE updated. 2026-06-05.

- [x] Artboards empty-result clear recovery — ArtboardsPanel.tsx now shows
      a direct Clear search button when artboard searches have no matches,
      giving multi-page layout cleanup a quick reset path from the empty
      artboard list. README and USER_GUIDE updated. 2026-06-05.

- [x] Asset/Symbol search action wording — AssetsPanel.tsx and
      SymbolsPanel.tsx now label the library search reset action as Clear
      search, matching the empty-result recovery button and other searchable
      SignMaster-style panels. USER_GUIDE updated. 2026-06-05.

- [x] Help Center search action wording — HelpCenter.tsx now labels the
      visible help search reset action as Clear search, matching its review
      status, title, empty-result recovery button, and other searchable panels.
      USER_GUIDE updated. 2026-06-05.

- [x] Search reset wording consistency — searchable panels now label their
      visible reset actions as Clear search across Document Settings, Command
      Palette, Shortcuts, Artboards, Font Picker, Preferences, Keymap Editor,
      Print/Tile Print, Templates, Plotter materials, and Layers, matching
      titles, review status, empty-result recovery, README, and USER_GUIDE.
      2026-06-05.

- [x] Layers search Delete Matches — LayersPanel.tsx now adds a keyboard-
      browsable Delete Matches action for active layer searches, with destructive
      confirmation before removing every matching object so imported reference
      marks, notes, or temporary cleanup layers can be purged from the filtered
      layer list. README and USER_GUIDE updated. 2026-06-05.

- [x] Layers search Duplicate Matches — LayersPanel.tsx now adds a keyboard-
      browsable Duplicate Matches action for active layer searches, cloning all
      matching objects with a small offset, preserving object names as “copy”,
      and selecting the new duplicates for immediate layout or cleanup edits.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Layers search Solo Matches — LayersPanel.tsx now adds a keyboard-
      browsable Solo Matches action for active layer searches, revealing every
      matching object while hiding non-matches so imported artwork can be
      isolated by name, type, or id without first selecting objects on canvas.
      README and USER_GUIDE updated. 2026-06-05.

- [x] User guide layer search action parity — docs/USER_GUIDE.md now lists
      Solo Matches, Duplicate Matches, Delete Matches, and Clear search in the
      primary Layers search workflow paragraph so the guide matches the current
      LayersPanel search toolbar. 2026-06-05.

- [x] User guide search reset wording parity — docs/USER_GUIDE.md now uses
      Clear search consistently for shortcut, command palette, preferences,
      asset/symbol, document/template, help, and font search action groups so
      written workflows match the current visible UI labels. 2026-06-05.

- [x] User guide symbol search clear wording — docs/USER_GUIDE.md now describes
      symbol-grid recovery as Clear search, matching the visible SymbolsPanel
      search reset action and empty-result recovery wording. 2026-06-05.

- [x] Shortcut table search reset wording — docs/USER_GUIDE.md now uses
      Clear search for the command-palette clipboard row and Help Center row,
      matching current search action labels throughout the app. 2026-06-05.

- [x] Backlog search reset wording parity — PARITY_BACKLOG.md now uses Clear
      search in the recent action-review status records for library, preset,
      template, shortcut, command, help, preferences, keymap, and font search
      actions, matching the current UI and USER_GUIDE wording. 2026-06-05.

- [x] Properties object-name Apply/Clear actions — PropertiesPanel.tsx now adds
      keyboard-browsable Apply name and Clear name actions below Object name,
      with disabled states and screen-reader review status so production users
      can explicitly commit or clear selection names without relying on blur.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Rename Selection prompt prefill — selectionOps.ts now exposes a shared
      promptRenameSelection() helper that pre-fills the current single-object
      name for Edit menu, command palette, and right-click Rename Selection
      flows while keeping multi-select batch rename blank. README and
      USER_GUIDE updated. 2026-06-05.

- [x] Layers search Replace Names — replaceLayerObjectNamesById() applies
      scoped find/replace to names on matching layer rows, enabling Illustrator-like
      cleanup of imported object labels without touching unrelated rows. 2026-06-07.
- [x] Layers search Change Case — changeLayerObjectNameCaseById() and
      LayersPanel.tsx now apply uppercase, lowercase, Title Case, or Sentence case
      to filtered layer/object names without touching unrelated rows. 2026-06-07.
- [x] Layers search Clean Names — cleanLayerObjectNamesById() trims and
      collapses whitespace on filtered layer/object names, clearing whitespace-only
      labels for Illustrator-like cleanup after importing messy artwork. 2026-06-07.
- [x] Layers search Set Opacity — setLayerObjectOpacityById() and
      LayersPanel.tsx now apply a prompted opacity value to filtered layer/object
      matches for Illustrator-like batch appearance cleanup. 2026-06-07.
- [x] Layers search Set Blend Mode — setLayerObjectBlendModeById() and
      LayersPanel.tsx now apply a prompted blend/compositing mode to filtered
      layer/object matches for Illustrator-like batch appearance cleanup. 2026-06-07.
- [x] Layers search Set Fill/Stroke — setLayerObjectPaintById() and
      LayersPanel.tsx now apply prompted fill or stroke paint to filtered
      layer/object matches, including `none` for cleanup. 2026-06-07.
- [x] Layers search Set Stroke Width — setLayerObjectStrokeWidthById()
      and LayersPanel.tsx now apply a prompted stroke width to filtered layer/object
      matches for Illustrator-like batch line-weight cleanup. 2026-06-07.
- [x] Layers search Set Cap/Join — setLayerObjectStrokeStyleById()
      and LayersPanel.tsx now apply prompted line cap or line join values to filtered
      layer/object matches for Illustrator-like advanced stroke cleanup. 2026-06-07.
- [x] Layers search Set Dash — setLayerObjectDashById() and
      LayersPanel.tsx now apply solid/dashed/dotted or custom numeric dash arrays
      to filtered layer/object matches for Illustrator-like stroke cleanup. 2026-06-07.
- [x] Layers search Set Miter Limit — setLayerObjectMiterLimitById()
      and LayersPanel.tsx now apply prompted stroke miter limits to filtered
      layer/object matches for Illustrator-like advanced stroke cleanup. 2026-06-07.
- [x] Layers search Set Production Flags — setLayerObjectOverprintById(),
      setLayerObjectPrintMarkKindById(), and LayersPanel.tsx now batch-toggle
      overprint metadata and print-mark kind on filtered layer/object matches for
      Illustrator-like print-preflight cleanup. 2026-06-08.
- [x] Layers search Set Text Style — setLayerObjectTextStyleById()
      and LayersPanel.tsx now batch-apply font family, font size, weight, style,
      paragraph alignment, underline, strikethrough, overline, tracking, and
      leading to filtered text layer/object matches for Illustrator-like typography
      cleanup in dense imported layouts. 2026-06-08.
- [x] Layers search Set Geometry — setLayerObjectGeometryById()
      and LayersPanel.tsx now batch-apply X/Y position, center X/Y, right/bottom
      edges, width, height, rotation, horizontal/vertical scale, and
      horizontal/vertical skew to filtered layer/object matches for Illustrator-like
      transform cleanup in dense production layouts. 2026-06-08.
- [x] Layers search Set Paired Geometry — setLayerObjectGeometryPairById()
      and LayersPanel.tsx now batch-apply position, center, size, scale, skew, and
      full bounds from comma/space separated values to filtered layer/object matches
      for Illustrator-like Transform panel cleanup. 2026-06-08.
- [x] Layers search Constant Stroke Width — setLayerObjectStrokeUniformById()
      and LayersPanel.tsx now toggle constant/scaled stroke width on filtered
      layer/object matches for Illustrator-like scale-stroke cleanup. 2026-06-07.
- [x] Layers search Clear Appearance — clearLayerObjectAppearanceById()
      and LayersPanel.tsx now reset fill, stroke, opacity, blend, dash, caps,
      joins, and shadow on filtered layer/object matches for Illustrator-like
      Appearance panel cleanup without touching unrelated rows. 2026-06-07.
- [x] Layers search Apply Graphic Style — applyGraphicStyleToLayerObjectsById()
      and LayersPanel.tsx now apply saved Graphic Styles to filtered layer/object
      matches by number, ID, or name for Illustrator-like Appearance panel batch
      styling without changing unrelated artwork. 2026-06-07.
- [x] Layers search Select Same Appearance — selectMatchingLayerAppearanceById()
      and LayersPanel.tsx now select only filtered layer/object matches sharing
      the active-or-first match's full graphic-style signature, enabling
      Illustrator-like Select Same cleanup inside search results. 2026-06-07.
- [x] Layers search Select Same Fill/Stroke/Opacity/Blend —
      selectSameLayerAppearanceById() and LayersPanel.tsx now scope Select Same
      variants to filtered layer/object matches for Illustrator-like targeted
      appearance cleanup without selecting unrelated artwork. 2026-06-07.
- [x] Layers search Select Same Stroke Details — selectSameLayerAppearanceById()
      and LayersPanel.tsx now scope stroke width, cap, join, and dash Select Same
      variants to filtered layer/object matches for Illustrator-like advanced
      stroke cleanup workflows. 2026-06-07.
- [x] Layers search Select Same Effects — selectSameLayerAppearanceById()
      and LayersPanel.tsx now scope miter limit, constant stroke width, and shadow
      Select Same variants to filtered matches for Illustrator-like advanced
      Appearance cleanup. 2026-06-07.
- [x] Layers search Select Same Structure — selectSameLayerObjectById()
      and LayersPanel.tsx now scope object type, visibility, and lock-state Select
      Same variants to filtered layer/object matches for Illustrator-like layer
      audits and cleanup in complex documents. 2026-06-07.
- [x] Layers search Select Same Naming — selectSameLayerObjectById()
      and LayersPanel.tsx now scope named/unnamed state and name-prefix Select Same
      variants to filtered layer/object matches for Illustrator-like imported-file
      naming audits and cleanup. 2026-06-07.
- [x] Layers search Select Same Geometry — selectSameLayerGeometryById()
      and LayersPanel.tsx now scope width, height, size, aspect-ratio, rotation,
      and scale Select Same variants to filtered layer/object matches for
      Illustrator-like layout cleanup. 2026-06-07.
- [x] Layers search Select Same Position/Bounds — selectSameLayerGeometryById()
      and LayersPanel.tsx now scope x/y position, full position, center, and bounds
      Select Same variants to filtered layer/object matches for Illustrator-like
      layout audits in dense documents. 2026-06-07.
- [x] Layers search Select Same Edges/Area/Skew — selectSameLayerGeometryById()
      and LayersPanel.tsx now scope right edge, bottom edge, area, and skew Select
      Same variants to filtered layer/object matches for Illustrator-like transform
      audits and cleanup. 2026-06-07.
- [x] Layers search Select Same Production Flags — selectSameLayerProductionById()
      and LayersPanel.tsx now scope overprint and print-mark-kind Select Same
      variants to filtered layer/object matches for Illustrator-like print-preflight
      audits. 2026-06-07.
- [x] Layers search Select Same Complex Appearance —
      selectSameLayerComplexAppearanceById() and LayersPanel.tsx now scope
      gradient fills, pattern specs, and clipping-mask presence to filtered
      layer/object matches for Illustrator-like Appearance cleanup. 2026-06-07.
- [x] Layers search Select Same Text — selectSameLayerTextById()
      and LayersPanel.tsx now scope font family, font size, and full text
      appearance Select Same variants to filtered layer/object matches for
      Illustrator-like typography cleanup. 2026-06-07.
- [x] Layers search Select Same Assets — selectSameLayerAssetById()
      and LayersPanel.tsx now scope symbol instances, image source, and image
      filter-stack Select Same variants to filtered layer/object matches for
      Illustrator-like linked artwork and placed-image cleanup. 2026-06-07.
- [x] Layers search Group Matches — groupLayerObjectsById() and
      LayersPanel.tsx now turn filtered layer/object matches into a selected group
      from the Layers panel, replacing root-level matches at the top matched stack
      slot for Illustrator-like structure cleanup. 2026-06-07.
- [x] Layers search Ungroup Matches — ungroupLayerObjectsById() and
      LayersPanel.tsx now release filtered matching groups back into the root stack
      and select their children for Illustrator-like structure cleanup. 2026-06-07.
- [x] Layers search Renumber Matches — renumberLayerObjectsById() applies
      prefix plus sequential numbers to matching layer rows from one prompt flow,
      improving Illustrator-like layer/object organization. 2026-06-07.
- [x] Layers search Target Matches — targetLayerObjectsById() reveals,
      unlocks, and selects matching layer rows from one Layers panel action,
      matching Illustrator's target/current-layer recovery workflow. 2026-06-07.
- [x] Layers search stack ordering — moveLayerObjectsById() lets search
      matches move forward, backward, to front, to back, or reverse order
      directly from the Layers panel, matching Illustrator-style layer list
      stack management. 2026-06-07.
- [x] Layers search Rename Matches — LayersPanel.tsx now adds a keyboard-
      browsable Rename Matches action for active layer searches, prompting once
      with the current search text and applying that name (or clearing names
      when blank) to every matching object so imported marks, cut lines, or
      repeated decals can be batch-labeled from the filtered layer list. README
      and USER_GUIDE updated. 2026-06-05.

- [x] Align panel Center on Artboard shortcut — AlignPanel.tsx now surfaces the
      existing Center on Artboard command directly below the six align buttons,
      with a clear disabled hint when there is no selection or artboard so panel-
      first layout users can center decals/sign panels without switching to the
      menu, command palette, or right-click submenu. README and USER_GUIDE
      updated. 2026-06-05.

- [x] Single-line Text field helpers — SingleLineTextDialog.tsx now adds
      keyboard-browsable Reset fields and Clear text actions with screen-reader
      review status, letting engraving/sign users quickly return to the default
      sample or clear stale copy while making multiple nameplates. README,
      USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Asset/Symbol tile removal feedback — AssetsPanel.tsx and SymbolsPanel.tsx
      now show success toasts when library tiles are removed via Delete/Backspace
      or the visible trash button, so keyboard cleanup of imported assets and
      reusable symbols no longer feels silent. README, USER_GUIDE, and i18n
      updated. 2026-06-05.

- [x] Plotter Reset output settings — PlotterDialog.tsx now adds a keyboard-
      browsable Reset output settings action in the prep toolbar, restoring
      default HPGL output options, clearing material search, color filters, weed
      grid, bridge presets, generated code, and returning to Outline preview so
      risky cutter setup experiments can be safely reset in-dialog. README,
      USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Print Reset output action — PrintDialog.tsx now adds a keyboard-browsable
      Reset action beside Cancel/PDF/Print, restoring A4 portrait Fit with 10 mm
      margin, default Print Prep, closed prep details, and a cleared page-size
      search so proof/press/photo experiments can be safely reset before output.
      README, USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Tile Print Reset output action — TilePrintDialog.tsx now adds a
      keyboard-browsable Reset action beside Cancel/Print, restoring A4 portrait
      1×1 proof tiling with 0 mm overlap, 5 mm margin, Auto artwork source, and
      a cleared page-size search so poster/banner paneling experiments can be
      safely reset before printing. README, USER_GUIDE, and i18n updated.
      2026-06-05.

- [x] Banner Grommets Reset footer action — GrommetsDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring the
      Standard banner recipe (20 mm inset, 500 mm max spacing, 10 mm diameter)
      and updating preset/footer review status so sign operators can safely
      return from small/large banner experiments before adding cut holes.
      README, USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Rhinestone Template Reset footer action — RhinestoneDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring the
      Standard stones recipe (SS10 2.8 mm diameter with 4 mm spacing) while
      updating job, size, spacing, and footer review status so heat-transfer
      template experiments can safely return to common production settings.
      README, USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Split Into Grid Reset footer action — SplitGridDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring the
      Sticker sheet recipe (3×3 grid with 2 mm gutter) and updating recipe, grid,
      and footer review status so layout experiments for yard signs, banner
      panels, or tile proofs can safely return to sticker-sheet production.
      README, USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Star / Polygon Reset footer action — StarDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Insert, restoring the default
      5-point star with 5 points and 45% inner radius while clearing stale spiral
      review status so shape-insertion experiments can safely return to the
      common Illustrator-style star setup. README, USER_GUIDE, and i18n updated.
      2026-06-05.

- [x] Margin Guides Reset footer action — MarginGuidesDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring the
      Sticker safe 5 mm safe-area recipe and updating recipe, numeric preset, and
      footer review status so trim, office-print, and banner-hem experiments can
      safely return to common decal production guides. README, USER_GUIDE, and
      i18n updated. 2026-06-05.

- [x] Shear Reset footer action — ShearDialog.tsx now adds a keyboard-browsable
      Reset action between Cancel and Apply, restoring 0° Horizontal shear and
      updating angle, axis, and footer review status so skew experiments can
      safely return to the no-shear baseline before applying transforms. README,
      USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Transform Reset footer action — TransformDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring XY move mode,
      zero X/Y/distance/angle, 100% linked scale, 0° rotation, and disabled copy /
      transform-each options while updating move, scale, rotate, mode, and footer
      review status so exact-transform experiments can safely return to a no-op
      baseline. README, USER_GUIDE, and i18n updated. 2026-06-05.

- [x] Resize Reset footer action — ResizeDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring the opened
      selection dimensions, re-locking aspect ratio, and clearing stale size /
      scale preset review status so decal, badge, yard-sign, or banner-size
      experiments can safely return to the original object size before applying.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Repeat Reset footer action — RepeatDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring the Grid tab,
      3×3 selection-sized step repeat, 8-around radial defaults, horizontal
      mirror, and clearing stale preset review status so array, badge-ring, or
      mirror experiments can safely return to the common Step & Repeat baseline.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Document Settings Reset footer action — DocSettingsDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring the
      opened document width, height, DPI, background, matched preset/orientation,
      and clearing preset search/review state so page-size experiments can safely
      return to the original document setup before applying. README and
      USER_GUIDE updated. 2026-06-05.

- [x] Blend Reset footer action — BlendDialog.tsx now adds a keyboard-browsable
      Reset action between Cancel and Apply, restoring the default 5 blend steps
      and clearing stale preset review status so Illustrator-style blend tests
      can safely return from dense or sparse interpolation before applying.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Adjust Brightness Reset footer action — BrightnessDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring 0%
      neutral brightness and clearing stale preset review status so batch color
      correction can safely return from lighten/darken experiments before
      applying. README and USER_GUIDE updated. 2026-06-05.

- [x] Saturate Reset footer action — SaturateDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring 0% neutral
      saturation and clearing stale preset review status so batch color cleanup
      can safely return from desaturate or boost experiments before applying.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Adjust Hue Reset footer action — HueDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring 0° neutral hue
      shift and clearing stale preset review status so batch color rotation can
      safely return from large hue experiments before applying. README and
      USER_GUIDE updated. 2026-06-05.

- [x] Arc Warp Reset footer action — WarpDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring Arc style with
      the default 40% bend and clearing stale bend review status so banner, rise,
      flag, or wave warp experiments can safely return to the common arc setup.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Pucker & Bloat Reset footer action — PuckerDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring 0% neutral
      distortion and clearing stale preset review status so live pucker/bloat
      previews can safely return to the original path baseline before applying.
      README and USER_GUIDE updated. 2026-06-05.

- [x] Twist Reset footer action — TwistDialog.tsx now adds a keyboard-browsable
      Reset action between Cancel and Apply, restoring 0° neutral twist and
      clearing stale angle review status so live twist previews can safely return
      to the original path baseline before applying. README and USER_GUIDE
      updated. 2026-06-05.

- [x] Roughen Reset footer action — RoughenDialog.tsx now adds a keyboard-
      browsable Reset action between Cancel and Apply, restoring default
      1 mm Size and 3 mm Detail while clearing stale recipe review status so
      hand-drawn/distressed/rugged edge experiments can safely return to the
      common roughen baseline before applying. README and USER_GUIDE updated.
      2026-06-05.

- [x] 0.12.0 release metadata sync — package.json, package-lock.json,
      src-tauri/tauri.conf.json, and src-tauri/Cargo.toml now share the
      0.12.0 version, with CHANGELOG, README, and USER_GUIDE updated for the
      release candidate. 2026-06-05.

- [x] Preferences Reset footer action — PreferencesDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Apply, restoring the
      draft captured when Preferences opened, returning to General, and clearing
      stale search / recipe / footer review state so workspace, AI, default
      document, and snapping experiments can safely return to their opened
      baseline before Apply or Save. README, USER_GUIDE, and CHANGELOG updated.
      2026-06-05.

- [x] Find & Replace Reset footer action — FindReplaceDialog.tsx now adds a
      keyboard-browsable Reset action between Cancel and Replace All, clearing
      Find / Replace text, disabling Match case, returning recipe review to the
      first cleanup recipe, clearing stale field/footer review state, and
      refocusing Find so imported-copy cleanup experiments can safely return to
      a blank replacement baseline before running Replace All. README,
      USER_GUIDE, and CHANGELOG updated. 2026-06-05.

- [x] Keyboard Shortcuts Close footer action — ShortcutsDialog.tsx now adds a
      keyboard-browsable Close action beside Customize Shortcuts, with Left /
      Right / Home / End moving across both footer actions and polite review
      status announcing the focused close-or-customize choice so shortcut
      discovery can exit or hand off to rebinding without using the title-bar
      close button. README, USER_GUIDE, and CHANGELOG updated. 2026-06-05.

- [x] Document-menu bridge prep parity — MenuBar.tsx now mirrors File,
      command-palette, and right-click cutter-prep bridge workflows by adding
      Light / Standard / Heavy Bridge presets plus Clear bridges cleanup in the
      Document cut-output block, so stencil/weeding bridge experiments can be
      added or restored from any main production menu. README, USER_GUIDE, and
      CHANGELOG updated. 2026-06-05.

- [x] Top output Clear bridges action — MenuBar.tsx now places a keyboard-
      browsable Clear bridges button directly beside the one-click Standard
      Bridge output action, restoring bridged cut paths from the always-visible
      production toolbar so stencil/weeding bridge trials can be reverted without
      opening menus or Send to Plotter. README, USER_GUIDE, and CHANGELOG
      updated. 2026-06-05.

- [x] Status-bar cut-count clear shortcut — StatusBar.tsx now lets the pink
      cut-count button clear all cut paths with Ctrl/Cmd-click while preserving
      click-to-Plotter and Shift/Alt-click-to-Cut-Contour behavior, giving
      cutter operators a direct recovery path from bad contour / trace / regmark
      jobs without opening menus. README, USER_GUIDE, CHANGELOG, and i18n
      updated. 2026-06-05.
- Measure proof delivery schedule panel: proof packets now include an exportable due/ship/method/notes schedule panel, with manual add/update commands for production handoff timing.
- Measure proof delivery route panel: proof packets now include carrier/service/account/address routing details, with manual add/update commands for shipping handoff control.
- Measure proof fulfillment handoff panel: proof packets now include quantity/packaging/owner/tracking details, with manual add/update commands for final production handoff.
- Measure proof install handoff panel: proof packets now include installer/date/site/notes details, with manual add/update commands for installation-stage production handoff.
- Measure proof site readiness panel: proof packets now include permit/access/power/risk readiness details, with manual add/update commands for installation planning.
- Measure proof install punch list panel: proof packets now include open item/owner/due/resolution tracking, with manual add/update commands for post-install closure.
- Measure proof client acceptance panel: proof packets now include accepted-by/date/status/notes closure details, with manual add/update commands for client signoff after install.
- Measure proof warranty info panel: proof packets now include term/coverage/contact/notes warranty details, with manual add/update commands for post-acceptance support handoff.
- Measure proof care instructions panel: proof packets now include cleaning/chemical/inspection/note care guidance, with manual add/update commands for customer maintenance handoff.

- Spot color process-conversion repair: Select/Object prepress commands can now convert PANTONE/spot/separation paints to process CMYK, preserving supplied CMYK alternates and falling back to 100K for unmapped inks.

- Active-artboard spot conversion repair: prepress commands can now convert only spot/separation paints intersecting the active artboard, preserving other artboards for multi-artboard production jobs.

- Active-artboard prepress repair set: white-overprint, rich-black, total-ink-limit, and registration-color repairs now support active-artboard scoping for multi-artboard production cleanup.

- RGB color prepress audit and conversion: command palette and Select Object menu can isolate RGB/screen-color artwork globally or by active artboard and convert it to process CMYK for print handoff.

- Grayscale/DeviceGray prepress audit and conversion: command palette and Select Object menu can isolate grayscale artwork globally or by active artboard and convert it to K-only process CMYK.

- Lab/CIELAB prepress audit and conversion: command palette and Select Object menu can isolate Lab artwork globally or by active artboard and convert it through sRGB to process CMYK for print handoff.

- Non-CMYK color batch preflight: command palette and Select Object menu can isolate and convert mixed spot, RGB, grayscale, and Lab artwork globally or by active artboard in one CMYK-only handoff pass.

- Thin-stroke repair command: preflight can now raise printable hairline strokes to the 0.25pt safety threshold globally or by active artboard.

- Dashed-stroke repair command: preflight can now clear printable dash patterns to solid strokes globally or by active artboard for output-safe paths.

- Transparency flatten repair command: preflight can now normalize opacity and blend modes to print-safe solid/source-over appearance globally or by active artboard.

- All-overprint repair command: preflight can now clear imported fill/stroke/global overprint flags, including metadata payloads, globally or by active artboard for knockout-safe output.

- Fix-all prepress risks command: Select Object and command palette can now run a one-click production cleanup pass for transparency, dash patterns, hairlines, overprint, non-CMYK paints, rich black, over-ink, and registration colors globally or by active artboard.

- Cleanup repair commands: preflight can now remove stray-point paths and zero-length geometry globally or by active artboard, matching Illustrator cleanup workflows for imported artwork.

- Unpainted-artwork cleanup repair: preflight can now remove invisible no-fill/no-stroke objects globally or by active artboard for cleaner imported Illustrator/PDF artwork.

- Fix-all cleanup objects command: preflight can now remove stray points, zero-length paths, and unpainted invisible artwork in one global or active-artboard cleanup pass for messy imported files.

- Empty-text cleanup repair: preflight can now remove whitespace-only point/area text objects globally or by active artboard, and the fix-all cleanup pass includes them for imported AI/PDF text junk.

- Zero-size cleanup repair: preflight can now select and remove zero-width/zero-height imported objects globally or by active artboard, and fix-all cleanup includes them without confusing them with zero-length paths.
- Empty-group cleanup repair: preflight can now select and remove empty imported groups or groups containing only cleanup junk globally or by active artboard, and the fix-all cleanup pass includes them while preserving real painted groups.
- Hidden-artwork cleanup repair: preflight can now explicitly remove hidden exportable artwork globally or by active artboard after review, giving imported Illustrator/PDF cleanup a safe opt-in delete path without folding hidden alternates into Fix All Cleanup.
- Fully transparent cleanup repair: preflight can now select and explicitly remove zero-opacity exported artwork globally or by active artboard after review, separating invisible imported junk from normal transparency flattening.
- Pasteboard/outside-artboard cleanup repair: preflight can now remove artwork fully outside the first artboard or outside every artboard, preserving overlapping trim-edge artwork and non-exporting overlays for Illustrator-like production handoff cleanup.
- Missing linked-image cleanup repair: Links/preflight workflows can now remove broken linked-image placeholders globally or by active artboard after review, preserving healthy links, embedded images, and non-exporting overlays.
- Cropped-image review repair: image/preflight workflows can now clear crop offsets and crop dimensions globally or by active artboard, exposing hidden placed-image pixels for Illustrator-like Links/asset review without deleting the image object.
- Filtered-image review repair: image/preflight workflows can now clear live raster filters globally or by active artboard, supporting Illustrator-like placed-image appearance review before print/export handoff.
- Low-resolution image preflight repair: Links/preflight workflows can now mark low effective-PPI placed images globally or by active artboard with persistent review metadata and a visible red outline for print handoff triage.
- High-resolution image preflight repair: Links/package workflows can now mark over-sampled placed images globally or by active artboard with optimization metadata and a visible amber review outline for downsample/export triage.
- Combined image preflight repair: Links/preflight workflows can now run a single non-destructive image handoff fix globally or by active artboard, clearing live raster filters and crops while marking low/high effective-PPI images for review.
- Transformed-image preflight repair: Links/preflight workflows can now mark scaled, rotated, or skewed placed images globally or by active artboard with transform metadata and visible review styling, and the combined image preflight pass preserves PPI findings while adding transform review details.
- Image preflight review selection: Links/preflight workflows can now select every placed-image handoff issue in one pass globally or by active artboard, covering live filters, crops, transforms, and low/high effective-PPI risks before applying fixes.
- Image preflight review style preservation: Links/preflight review markers now preserve each image object's original stroke, stroke width, and stroke-uniform style in metadata before applying visible review outlines, keeping future cleanup/revert workflows non-destructive.
- Image preflight review marker cleanup: Links/preflight workflows can now clear review metadata globally or by active artboard and restore saved image stroke styling, completing a non-destructive review/fix/cleanup loop for placed-image handoff.
- Image preflight review marker selection: Links/preflight workflows can now select already-marked placed-image review objects globally or by active artboard, enabling a final cleanup review before restoring original styles and clearing metadata.
- Image preflight summary reporting: Links/preflight workflows can now report placed-image issue counts globally or by active artboard, covering filters, crops, transforms, low/high effective-PPI, missing links, and review markers before review/fix/cleanup.
- Missing-link combined image preflight: Links/preflight select-all and non-destructive fix-all workflows now include missing linked placed images globally or by active artboard, marking them with review metadata instead of deleting placeholders so cleanup/relink review remains possible.
- Linked-image embedding workflow: Links workflows can now embed loaded linked placed images globally or by active artboard, converting available bitmap payloads to data URLs while preserving the original link source metadata for package/review traceability.
- Embedded-image link restore workflow: Links workflows can now restore embedded placed images back to their preserved original linked sources globally or by active artboard, completing a reversible embed/unembed loop for package and handoff review.
- Image links summary reporting: Links workflows can now report placed-image asset state globally or by active artboard, including total images, linked, embedded, missing, embeddable, restorable, and unknown-source counts before package/relink/embed decisions.
- Actionable Links selection: Links workflows can now select embeddable linked images and restorable embedded-link images globally or by active artboard, turning summary counts into direct object review targets before embed/unembed operations.
- Unknown-source image selection: Links workflows can now select placed images that have neither embedded data nor link source metadata globally or by active artboard, making unknown asset origins actionable before packaging or relinking.
- Not-embeddable linked image audit: Links workflows can now report and select linked placed images that are present but cannot currently be embedded globally or by active artboard, surfacing CORS/unavailable bitmap payload risks before package handoff.
- Image handoff-risk selector: Links workflows now include global and active-artboard commands that select placed-image package risks in one pass, combining missing links, unknown-source images, and linked images that are present but not embeddable before package/collect handoff.
- Image handoff report export: Links workflows now generate copyable document and active-artboard image handoff reports summarizing missing links, not-embeddable linked images, unknown-source assets, embeddable links, and restorable embedded links for package/collect review.
- Image handoff report asset details: Package/collect handoff reports now include per-image asset rows with document order, display name, status, and source/original-source fallback, making Links audits actionable instead of only summary-level.
- Image handoff report resolution details: Package/collect image reports now include per-asset pixel dimensions and effective PPI, using existing natural-dimension metadata and placement scale to surface print-resolution risks directly in Links handoff notes.
- Image handoff report severity/actions: Package/collect Links reports now label every placed-image row with error/warning/info/ok severity and a concrete next action, turning handoff notes into prioritized preflight instructions.
- Image handoff report severity summary: Package/collect Links reports now include top-level error/warning/info/ok counts derived from per-asset severities, making the overall handoff risk level visible before reading individual rows.
- Image handoff TSV export: Links package/collect reporting now has document and active-artboard TSV copy commands with spreadsheet-ready columns for index, asset name, severity, status, action, pixels, effective PPI, and source.
- Image handoff JSON export: Links package/collect reporting now has document and active-artboard JSON copy commands with machine-readable scope, status, summary counts, severity counts, and per-asset action rows for automation or ticketing integrations.
- Image source manifest export: Links package/collect reporting now includes document and active-artboard source manifests grouped by required handoff action, separating relink, replace/embed, provenance review, collect/embed, restore-link, collect-only, and ready image sources.

- [x] Links package collect source list parity — added copyable deduplicated linked-file source lists for document and active-artboard handoff workflows.

- [x] Links missing relink list parity — added copyable deduplicated missing linked-image path lists for document and active-artboard package preflight handoff workflows.

- [x] Links package checklist parity — added copyable document/active-artboard image package checklists that group relink, collect, manual-review, and ready asset steps for handoff.

- [x] Links package plan JSON parity — added copyable document/active-artboard machine-readable image package plans for relink, collect, manual-review, ready assets, and automation handoff.

- [x] Links collect destination manifest parity — added copyable TSV source-to-Links package path manifests with safe filenames, duplicate-name suffixing, and active-artboard scoping.

- [x] Links package plan collect-destination parity — Package Plan JSON now includes source-to-Links destination records so automation can copy/rename collected linked images deterministically.

- [x] Links package README parity — added copyable document/active-artboard package README handoff notes with contents, collected destinations, relink items, manual review, and ready assets.

- [x] Links package file tree parity — added copyable document/active-artboard package tree previews that show document, README, reports, package plan, and collected Links files.

- [x] Links package bundle JSON parity — added copyable document/active-artboard virtual package bundles containing README, tree, reports, checklist, plan JSON, destination TSV, and source manifest file contents.

- [x] Links package blockers parity — added copyable document/active-artboard package gate reports that list only missing, not-embeddable, and unknown-source image blockers.

- [x] Links package gate JSON parity — added copyable document/active-artboard machine-readable package pass/fail gates with blocker counts and blocker detail arrays.

- [x] Links package gate artifact parity — Package bundle JSON and file-tree previews now include `image-package-gate.json` so automated package handoff has a visible pass/fail gate file.

- [x] Links package collect script parity — added document/active-artboard copy commands plus bundle/tree artifacts for `collect-linked-images.sh`, generating shell-safe `cp` steps from collected linked-image destinations.

- [x] Links package PowerShell collect script parity — added Windows-friendly `collect-linked-images.ps1` package artifacts and copy commands for document/active-artboard linked-image collection.

- [x] Links package verify script parity — added POSIX and PowerShell package verification scripts plus copy commands so collected Links files can be checked after handoff packaging.

- [x] Links package verify manifest parity — added document/active-artboard machine-readable `image-package-verify-manifest.json` artifacts and copy commands listing every expected collected Links file for automation gates.

- [x] Links package README automation parity — package README now documents collect scripts, verify scripts, and `image-package-verify-manifest.json` so handoff recipients can run and audit package automation.

- [x] Links package file index parity — added copyable document/active-artboard `image-package-file-index.json` artifacts listing every virtual package file, kind, and byte count for audit and automation handoff.

- [x] Links package file index digest parity — `image-package-file-index.json` now includes deterministic per-file digests alongside kind and byte counts for package audit comparisons.

- [x] Links package audit JSON parity — added document/active-artboard `image-package-audit.json` with package gate status, expected Links manifest, file count, and per-file digests for final handoff audit.

- [x] Links package README audit artifact parity — package README now documents `image-package-file-index.json` and `image-package-audit.json` so recipients know where to validate file digests and gate status.

- [x] Links package audit report parity — added document/active-artboard `image-package-audit.md` reports with gate status, expected Links count, package file count, and file digest rows for human production review.

- [x] Links package digest TSV parity — added document/active-artboard `image-package-digests.tsv` copy commands and package artifacts with spreadsheet-ready path, kind, byte, and digest rows.

- [x] Links package signoff parity — added document/active-artboard `image-package-signoff.md` copy commands and package artifacts with gate status, verification checklist, and designer/prepress signoff lines.

- [x] Links package signoff JSON parity — added document/active-artboard `image-package-signoff.json` artifacts and copy commands with machine-readable checklist items and designer/prepress signature fields.

- [x] Links package signoff TSV parity — added document/active-artboard `image-package-signoff.tsv` artifacts and copy commands with spreadsheet-ready checklist/signature rows for production signoff tracking. 2026-06-08.

- [x] Links package delivery manifest parity — added document/active-artboard `image-package-delivery-manifest.json` and `.tsv` artifacts plus copy commands for external QA deliverable readiness checks. 2026-06-08.

- [x] Links package release gate parity — added document/active-artboard `image-package-release-gate.json`, `.md`, and `.tsv` artifacts plus copy commands that hold final delivery until package gate, deliverables, signoff, and digest checks are cleared. 2026-06-08.

- [x] Links package release gate verifier parity — added document/active-artboard `verify-package-release-gate.sh` and `.ps1` artifacts plus copy commands so CI/package handoff can fail while releaseStatus remains on hold. 2026-06-08.

- [x] Links package CI manifest parity — added document/active-artboard `image-package-ci-manifest.json` artifacts and copy commands listing required release files plus shell/PowerShell verification steps for automated handoff pipelines. 2026-06-08.

- [x] Links package GitHub Actions workflow parity — added document/active-artboard `image-package-github-actions.yml` artifacts and copy commands with ready-to-copy CI steps for Links verification, release gate checks, and QA artifact upload. 2026-06-08.

- [x] Links package GitLab CI workflow parity — added document/active-artboard `image-package-gitlab-ci.yml` artifacts and copy commands with ready-to-copy CI jobs for Links verification, release gate checks, and QA artifact retention. 2026-06-08.

- [x] Links package Azure Pipelines workflow parity — added document/active-artboard `image-package-azure-pipelines.yml` artifacts and copy commands with ready-to-copy pipeline steps for Links verification, release gate checks, and QA artifact publishing. 2026-06-08.

- [x] Links package CircleCI workflow parity — added document/active-artboard `image-package-circleci.yml` artifacts and copy commands with ready-to-copy CircleCI jobs for Links verification, release gate checks, and QA artifact storage. 2026-06-08.

- [x] Links package Jenkins pipeline parity — added document/active-artboard `image-package-jenkinsfile` artifacts and copy commands with ready-to-copy Jenkins stages for Links verification, release gate checks, and QA artifact archiving. 2026-06-08.

- [x] Links package Bitbucket Pipelines parity — added document/active-artboard `image-package-bitbucket-pipelines.yml` artifacts and copy commands with ready-to-copy pipeline steps for Links verification, release gate checks, and QA artifact retention. 2026-06-08.

- [x] Links package Buildkite pipeline parity — added document/active-artboard `image-package-buildkite.yml` artifacts and copy commands with ready-to-copy Buildkite steps for Links verification, release gate checks, and QA artifact retention. 2026-06-08.

- [x] Links package Drone CI pipeline parity — added document/active-artboard `image-package-drone.yml` artifacts and copy commands with ready-to-copy Drone CI steps for Links verification, release gate checks, and external QA artifact publishing. 2026-06-08.

- [x] Links package TeamCity Kotlin DSL parity — added document/active-artboard `image-package-teamcity.kts` artifacts and copy commands with ready-to-copy TeamCity build steps for Links verification, release gate checks, and QA artifact publishing. 2026-06-08.

- [x] Links package provenance manifest parity — added document/active-artboard `image-package-provenance.json` and `.tsv` artifacts plus copy commands so package handoff captures every placed image source, status, proof requirement, and traceability row. 2026-06-08.

- [x] Links package acceptance checklist parity — added document/active-artboard `image-package-acceptance.json` and `.tsv` artifacts plus copy commands so package handoff tracks production, prepress, producer, and client/shop acceptance before closeout. 2026-06-08.

- [x] Links package delivery receipt parity — added document/active-artboard `image-package-delivery-receipt.md`, `.json`, and `.tsv` artifacts plus copy commands so package handoff has a recipient-facing closeout receipt tied to release gate and acceptance status. 2026-06-08.

- [x] Links package release notes parity — added document/active-artboard `image-package-release-notes.md`, `.json`, and `.tsv` artifacts plus copy commands so package handoff includes client/shop-facing release status, highlights, blockers, pending closeout items, and collected Links summary. 2026-06-08.

- [x] Links package SBOM parity — added document/active-artboard `image-package-sbom.json` and `.tsv` artifacts plus copy commands so package handoff has an audit-friendly bill of materials for linked, embedded, and provenance-review image components. 2026-06-08.

- [x] Links package attestation parity — added document/active-artboard `image-package-attestation.json` and `.tsv` artifacts plus copy commands so package handoff can assert SBOM generation, provenance manifest generation, release gate evaluation, and digest manifest availability. 2026-06-08.

- [x] Links package risk register parity — added document/active-artboard image-package-risk-register.md, .json, and .tsv outputs for producer/prepress triage of placed-image blockers, residual risks, owners, mitigations, package impact, and release readiness.

- [x] Links package verification summary parity — added document/active-artboard image-package-verification-summary.md, .json, and .tsv outputs that summarize Links verification, release gate, risk register, SBOM, and attestation readiness for human review and CI archive handoff.

- [x] Links package client README parity — added document/active-artboard image-package-client-readme.md and .json outputs with recipient-facing open/review/acceptance steps, required review artifacts, Links expectations, and delivery hold status for external handoff.

- [x] Links package change log parity — added document/active-artboard image-package-change-log.md, .json, and .tsv outputs for package version, revision, client/shop request, risk, verification, and release gate evidence tracking.

- [x] Links package relink map parity — added document/active-artboard image-package-relink-map.md, .json, and .tsv outputs mapping original placed-image sources to packaged Links targets, unresolved relink states, and recipient relink instructions.

- [x] Links package rights manifest parity — added document/active-artboard image-package-rights-manifest.md, .json, and .tsv outputs for placed-image license proof, usage scope, blocked/unverified rights review, and delivery approval evidence.

- [x] Links package prepress ticket parity — added document/active-artboard image-package-prepress-ticket.md, .json, and .tsv outputs for operator-facing production tasks, owners, holds, Links collection, rights proof, relink resolution, risk clearance, and release gate evidence.

- [x] Links package printer intake parity — added document/active-artboard image-package-printer-intake.md, .json, and .tsv outputs for print-shop receiving fields, intake checklist, delivery manifest review, prepress ticket holds, rights proof, Links receipt, and release gate evidence.
- [x] Links package shop proof checklist parity — added document/active-artboard image-package-shop-proof-checklist.md, .json, and .tsv outputs for print-shop proof rounds, proof file approval fields, intake acceptance, prepress ticket clearance, rights proof, verification summary, and release gate signoff evidence.
- [x] Links package production handoff parity — added document/active-artboard image-package-production-handoff.json and .tsv outputs for press scheduling, shop custody, production owners, intake/proof/prepress/release evidence, holds, and next production actions.
- [x] Links package print release approval parity — added document/active-artboard image-package-print-release-approval.md, .json, and .tsv outputs for final print release fields, client/shop signers, delivery/rights/proof/production/gate evidence, blockers, and press approval state.
- [x] Links package vendor QA parity — added document/active-artboard image-package-vendor-qa.md, .json, and .tsv outputs for supplier QA acceptance, vendor job fields, verification/delivery/production/print-release/release-gate evidence, dispositions, holds, and vendor release status.
- [x] Links package press run ticket parity — added document/active-artboard image-package-press-run-ticket.md, .json, and .tsv outputs for press run fields, operator setup checks, prepress/production/approval/vendor-QA/release-gate evidence, holds, and production-start actions.
- [x] Links package postpress inspection parity — added document/active-artboard image-package-postpress-inspection.md, .json, and .tsv outputs for finished-goods inspection fields, press/vendor-QA/print-approval/delivery-receipt/release-gate evidence, defects, holds, and corrective actions.
- [x] Links package finished goods release parity — added document/active-artboard image-package-finished-goods-release.md, .json, and .tsv outputs for shipment fields, postpress/acceptance/delivery-receipt/release-notes/release-gate evidence, holds, release actions, and finished-goods status.
- [x] Links package shipment handoff parity — added document/active-artboard image-package-shipment-handoff.md, .json, and .tsv outputs for carrier/service/tracking/recipient fields, finished-goods/delivery-manifest/delivery-receipt/release-notes/release-gate evidence, custody actions, holds, and shipment status.
- [x] Links package delivery confirmation parity — added document/active-artboard image-package-delivery-confirmation.md, .json, and .tsv outputs for delivered-at/received-by/signature/exception fields, shipment/receipt/acceptance/release-notes/release-gate evidence, holds, follow-up actions, and final delivery status.
- [x] Links package closeout certificate parity — added document/active-artboard image-package-closeout-certificate.md, .json, and .tsv outputs for certificate/archive/retention fields, delivery/acceptance/attestation/verification/release-gate evidence, holds, archive actions, and final closeout status.
- [x] Links package archive manifest parity — added document/active-artboard image-package-archive-manifest.md, .json, and .tsv outputs for archive ID/location/retention fields, closeout/file-index/audit/attestation/release-gate evidence, holds, retention actions, and archive status.
- [x] Links package retention schedule parity — added document/active-artboard image-package-retention-schedule.md, .json, and .tsv outputs for retention policy/start/until fields, legal holds, review triggers, disposal approvals, archive/closeout/audit evidence, and disposition actions.
- [x] Links package disposition certificate parity — added document/active-artboard image-package-disposition-certificate.md, .json, and .tsv outputs for retain/delete disposition decisions, legal-hold clearance, approver/witness fields, retention/archive/release/rights evidence, and final disposal certificate actions.
- [x] Links package destruction log parity — added document/active-artboard image-package-destruction-log.md, .json, and .tsv outputs for destruction/retained-exception execution, operator/witness fields, certificate hashes, disposition/retention/archive evidence, linked-source actions, and final proof logging.
- [x] Links package archive retrieval request parity — added document/active-artboard image-package-retrieval-request.md, .json, and .tsv outputs for archive restore requests, requester/purpose/approval fields, retention/destruction/archive evidence, file-index matching, custody release, return due, and destroy-after-use controls.
- [x] Links package retrieval fulfillment parity — added document/active-artboard image-package-retrieval-fulfillment.md, .json, and .tsv outputs for actual archive restore receipts, custody recipient, checksum verification, restored package/link evidence, return due, returned-by fields, and destroy-after-use outcome logging.
- [x] Links package retrieval return receipt parity — added document/active-artboard image-package-retrieval-return-receipt.md, .json, and .tsv outputs for returned/re-frozen/destroy-after-use closure, returned-by/received-by fields, archive re-freeze evidence, file-index matching, exceptions, final custodian signoff, and custody closure.
- [x] Links package custody ledger parity — added document/active-artboard image-package-custody-ledger.md, .json, and .tsv outputs for end-to-end custody stages across delivery, closeout, archive freeze, retrieval request, retrieval fulfillment, and return closure with actors, evidence, holds, and next actions.
- [x] Links package custody exceptions parity — added document/active-artboard image-package-custody-exceptions.md, .json, and .tsv outputs for chain-of-custody holds, pending evidence, release-gate blockers, owners, severity, remediation due fields, and audit-ready exception rows.
- [x] Links package custody remediation plan parity — added document/active-artboard image-package-custody-remediation-plan.md, .json, and .tsv outputs that convert custody exceptions into owner-assigned remediation tasks with priority, status, due fields, evidence, verification steps, and final audit signoff fields.
- [x] Links package custody remediation verification parity — added document/active-artboard image-package-custody-remediation-verification.md, .json, and .tsv outputs for remediation completion checks, critical exception clearance, evidence verification, verifier/residual-risk/audit-signoff fields, and final custody signoff proof.
- [x] Links package final custody signoff parity — added document/active-artboard image-package-final-custody-signoff.md, .json, and .tsv outputs for final custodian, release manager, archive owner, client/shop recipient, residual-condition fields, release-gate/custody-exception/remediation-verification evidence, and signed custody handoff proof.
- [x] Links package final package seal parity — added document/active-artboard image-package-final-package-seal.md, .json, and .tsv outputs for tamper-evident package sealing, seal ID/witness/hash-authority fields, digest review, final custody signoff evidence, linked-asset lock confirmation, and reseal policy tracking.
- [x] Links package final package seal verification parity — added document/active-artboard image-package-final-package-seal-verification.md, .json, and .tsv outputs for independent seal review, digest spot-checks, witness confirmation, linked-asset lock verification, seal ID/sample fields, exception decisions, and reseal approval tracking.
- [x] Links package reseal remediation plan parity — added document/active-artboard image-package-reseal-remediation-plan.md, .json, and .tsv outputs that convert final package seal verification holds into owner-assigned reseal tasks with priority, status, due fields, evidence, approval decisions, and regenerate-digests/reissue-seal guidance.
- [x] Links package reseal remediation verification parity — added document/active-artboard image-package-reseal-remediation-verification.md, .json, and .tsv outputs for reseal task completion checks, package blocker clearance, regenerated digest proof, reissued seal ID/witness/residual-risk fields, and final reissue approval evidence.
- [x] Links package reissued seal certificate parity — added document/active-artboard image-package-reissued-seal-certificate.md, .json, and .tsv outputs for post-remediation reissued seal ID, authority/witness/issued-at fields, regenerated digest binding, blocker clearance, custody release, and signed certificate evidence.
- [x] Links package post-reseal release authorization parity — added document/active-artboard image-package-post-reseal-release-authorization.md, .json, and .tsv outputs for final post-reseal shipment/archive/client release approval, approver/authorized-at/release-target/custody-recipient fields, reissued seal certificate evidence, linked asset lock confirmation, and residual-condition tracking.
- [x] Links package post-reseal release execution receipt parity — added document/active-artboard image-package-post-reseal-release-execution-receipt.md, .json, and .tsv outputs for actual post-reseal release execution, executor/executed-at/release-target/custody-recipient/transfer-reference fields, custody ledger/archive/delivery evidence, blocker checks, linked asset seal confirmation, and exception notes.
- [x] Links package post-reseal release execution verification parity — added document/active-artboard image-package-post-reseal-release-execution-verification.md, .json, and .tsv outputs for independent release execution review, recipient transfer confirmation, custody ledger/archive update checks, blocker verification, linked asset seal comparison, verifier fields, and residual exception tracking.
- [x] Links package post-reseal closeout certificate parity — added document/active-artboard image-package-post-reseal-closeout-certificate.md, .json, and .tsv outputs for final post-reseal archive/client/shop closeout, certificate ID/closed-by/closed-at/release-target/archive-location fields, execution verification evidence, archive/retention/custody updates, blocker checks, and residual exception tracking.
- [x] Links package post-reseal archive update parity — added document/active-artboard image-package-post-reseal-archive-update.md, .json, and .tsv outputs for archive manifest, retention, custody ledger, retrieval-readiness, linked asset completeness, blocker checks, archive lock, and residual exception tracking after post-reseal closeout.
- [x] Links package post-reseal retention update parity — added document/active-artboard image-package-post-reseal-retention-update.md, .json, and .tsv outputs for retention class, policy citation, legal hold, matter ID, disposal review date, notification owner, linked asset retention coverage, archive lock, blocker checks, and residual exception tracking after post-reseal archive update.
- [x] Links package post-reseal retention verification parity — added document/active-artboard image-package-post-reseal-retention-verification.md, .json, and .tsv outputs for independent retention policy, legal hold, disposal review workflow, archive lock approval, linked asset inheritance, blocker checks, reviewer fields, and residual exception verification after retention update.
- [x] Links package post-reseal archive lock certificate parity — added document/active-artboard image-package-post-reseal-archive-lock-certificate.md, .json, and .tsv outputs for immutable archive lock certificate ID, lock approver, archive lock URI, storage tier, retention lock mode, legal hold, custody ledger freeze, linked asset lock inheritance, blocker checks, and residual exception tracking after retention verification.
- [x] Links package post-reseal archive lock verification parity — added document/active-artboard image-package-post-reseal-archive-lock-verification.md, .json, and .tsv outputs for independent immutable archive lock review, digest proof, retention lock evidence, custody ledger freeze, retrieval instructions, linked asset lock proof, blocker checks, reviewer fields, and residual exception verification after archive lock certificate.
- [x] Links package post-reseal locked archive closeout certificate parity — added document/active-artboard image-package-post-reseal-locked-archive-closeout-certificate.md, .json, and .tsv outputs for locked archive closeout certificate ID, filed-by/filed-at, final archive location, final custodian, retrieval policy version, custody closeout acknowledgement, linked asset closeout proof, blocker checks, and residual exception tracking after archive lock verification.
- [x] Links package post-reseal locked archive closeout verification parity — added document/active-artboard image-package-post-reseal-locked-archive-closeout-verification.md, .json, and .tsv outputs for independent locked archive closeout certificate review, final records filing, retrieval policy verification, custody acknowledgement, linked asset closeout evidence, blocker checks, reviewer fields, and residual exception verification.
- [x] Links package post-reseal locked archive audit certificate parity — added document/active-artboard image-package-post-reseal-locked-archive-audit-certificate.md, .json, and .tsv outputs for final audit certificate ID, audit owner, evidence index version, audit trail reference, retention/retrieval audit acceptance, linked asset audit coverage, blocker checks, auditor fields, and residual exception tracking after locked archive closeout verification.
- [x] Links package post-reseal locked archive audit verification parity — added document/active-artboard image-package-post-reseal-locked-archive-audit-verification.md, .json, and .tsv outputs for independent locked archive audit certificate review, evidence index verification, audit trail review, residual exception disposition, linked asset audit evidence, blocker checks, reviewer fields, and final audit signoff.
- [x] Links package post-reseal locked archive audit signoff certificate parity — added document/active-artboard image-package-post-reseal-locked-archive-audit-signoff-certificate.md, .json, and .tsv outputs for final audit signoff ID, signed-by/signed-at, audit owner, final archive closure ID, evidence index freeze, compliance final acceptance, linked asset signoff coverage, blocker checks, approver fields, and residual exception tracking after audit verification.
- [x] Links package post-reseal locked archive audit signoff verification parity — added document/active-artboard image-package-post-reseal-locked-archive-audit-signoff-verification.md, .json, and .tsv outputs for independent final audit signoff verification, approver signature checks, evidence freeze verification, compliance closure, linked asset signoff evidence, blocker checks, reviewer fields, and residual exception disposition.
- [x] Links package post-reseal final compliance certificate parity — added document/active-artboard image-package-post-reseal-final-compliance-certificate.md, .json, and .tsv outputs for final compliance acceptance, retention and retrieval obligations, custody/reseal closure, residual exception disposition, linked asset compliance evidence, release restrictions, approver fields, and package blocker checks.
- [x] Links package post-reseal final archive release receipt parity — added document/active-artboard image-package-post-reseal-final-archive-release-receipt.md, .json, and .tsv outputs for final archive release receipt acceptance, recipient acknowledgement, custody transfer, release restrictions, linked asset receipt coverage, retention handoff, archive location, and release gate/compliance evidence checks.
- [x] Links package post-reseal final archive release verification parity — added document/active-artboard image-package-post-reseal-final-archive-release-verification.md, .json, and .tsv outputs for independent archive release receipt verification, recipient identity review, custody transfer checks, release restriction verification, linked asset release evidence, retention handoff closure, reviewer fields, and blocker disposition.
- [x] Links package post-reseal final archive release closeout certificate parity — added document/active-artboard image-package-post-reseal-final-archive-release-closeout-certificate.md, .json, and .tsv outputs for release verification acceptance, closeout authority, final closure IDs, records lock, custody transfer closure, linked asset release closeout, retention handoff, and final blocker disposition.
- [x] Links package post-reseal final archive release closeout verification parity — added document/active-artboard image-package-post-reseal-final-archive-release-closeout-verification.md, .json, and .tsv outputs for independent final closeout certificate verification, closeout authority review, records lock verification, custody closure checks, linked asset closeout evidence, final reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive completion certificate parity — added document/active-artboard image-package-post-reseal-final-archive-completion-certificate.md, .json, and .tsv outputs for final release closeout verification acceptance, final evidence freeze, archive custody completion, retention handoff, linked asset archive completion, completion authority fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive completion verification parity — added document/active-artboard image-package-post-reseal-final-archive-completion-verification.md, .json, and .tsv outputs for independent final archive completion certificate verification, completion authority review, final evidence freeze verification, archive custody and retention handoff checks, linked asset archive completion evidence, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-certificate.md, .json, and .tsv outputs for final archive seal authority, completion verification acceptance, evidence freeze sealing, retention lock, custody seal evidence, linked asset seal coverage, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-verification.md, .json, and .tsv outputs for independent final archive seal certificate acceptance, seal identity review, evidence freeze verification, retention lock and custody seal checks, linked asset seal coverage, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal closeout certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-closeout-certificate.md, .json, and .tsv outputs for final archive seal verification acceptance, closeout authority, archive closure IDs, sealed evidence and manifest freeze, retention lock and custody freeze closure, linked asset seal closeout coverage, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal closeout verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-closeout-verification.md, .json, and .tsv outputs for independent final archive seal closeout certificate acceptance, archive closure identity review, sealed evidence and manifest freeze verification, retention lock and custody freeze checks, linked asset seal closeout verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release gate certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-gate-certificate.md, .json, and .tsv outputs for final seal closeout verification acceptance, package release gate status, sealed archive gate IDs, release authority/recipient fields, custody and retention release controls, linked asset sealed archive release coverage, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release gate verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-gate-verification.md, .json, and .tsv outputs for independent sealed archive release gate certificate acceptance, package release gate verification, sealed archive gate identity review, custody and retention release control checks, linked asset sealed archive release coverage verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release execution receipt parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-execution-receipt.md, .json, and .tsv outputs for verified sealed archive release gate execution, release executor/recipient acknowledgement fields, custody transfer, retention controls, linked asset sealed release execution evidence, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release execution verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-execution-verification.md, .json, and .tsv outputs for independent sealed archive release execution receipt acceptance, release execution identity review, recipient acknowledgement verification, custody transfer and retention control checks, linked asset sealed release execution verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release closeout certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-closeout-certificate.md, .json, and .tsv outputs for sealed archive release execution verification acceptance, closeout authority/release closure IDs, recipient acceptance, custody transfer and retention closure, linked asset sealed release closeout evidence, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release closeout verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-closeout-verification.md, .json, and .tsv outputs for independent sealed archive release closeout certificate acceptance, release closure ID review, recipient acceptance verification, custody transfer and retention closure checks, linked asset sealed release closeout verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release completion certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-completion-certificate.md, .json, and .tsv outputs for sealed archive release closeout verification acceptance, final completion authority/IDs, recipient acceptance closure, custody and retention completion, linked asset release completion evidence, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release completion verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-completion-verification.md, .json, and .tsv outputs for independent final sealed archive release completion certificate acceptance, completion ID review, recipient acceptance closure verification, custody and retention completion checks, linked asset release completion evidence verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release finalization certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-finalization-certificate.md, .json, and .tsv outputs for sealed archive release completion verification acceptance, immutable finalization IDs, recipient acceptance finalization, custody and retention finalization, linked asset finalization evidence, authority fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release finalization verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-finalization-verification.md, .json, and .tsv outputs for independent final sealed archive release finalization certificate acceptance, immutable finalization ID review, recipient acceptance finalization verification, custody and retention finalization checks, linked asset finalization evidence verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records freeze certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-freeze-certificate.md, .json, and .tsv outputs for finalization verification acceptance, immutable evidence lock, recipient final record acknowledgement, custody and retention ledger freeze, linked asset records freeze evidence, freeze authority fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records freeze verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-freeze-verification.md, .json, and .tsv outputs for independent final records freeze certificate acceptance, immutable evidence lock verification, recipient final record acknowledgement verification, custody and retention ledger freeze checks, linked asset records freeze evidence verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records closure certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-closure-certificate.md, .json, and .tsv outputs for records freeze verification acceptance, immutable ledger closeout IDs, recipient records closure acknowledgement, custody and retention ledger closeout, linked asset records closure evidence, closure authority fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records closure verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-closure-verification.md, .json, and .tsv outputs for independent final records closure certificate acceptance, immutable ledger closeout ID review, recipient records closure acknowledgement verification, custody and retention ledger closeout checks, linked asset records closure evidence verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records completion certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-completion-certificate.md, .json, and .tsv outputs for records closure verification acceptance, immutable records completion IDs, recipient records completion acknowledgement, custody and retention completion, linked asset records completion evidence, completion authority fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records completion verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-completion-verification.md, .json, and .tsv outputs for independent final records completion certificate acceptance, immutable records completion ID review, recipient records completion acknowledgement verification, custody and retention completion checks, linked asset records completion evidence verification, reviewer fields, and blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records signoff certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-signoff-certificate.md, .json, and .tsv outputs for completion verification acceptance, final signoff authority/IDs, immutable archive release signoff lock, recipient/custody/retention final signoff acknowledgement, linked asset final records signoff evidence, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records signoff verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-signoff-verification.md, .json, and .tsv outputs for independent final records signoff certificate acceptance, final signoff authority/ID review, immutable archive release signoff lock verification, recipient/custody/retention final signoff acknowledgement verification, linked asset final records signoff evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records release certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-release-certificate.md, .json, and .tsv outputs for signoff verification acceptance, final records release authority/IDs, immutable final records release lock, recipient/custody/retention release acknowledgement, linked asset final records release evidence, release authority fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records release verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-release-verification.md, .json, and .tsv outputs for independent final records release certificate acceptance, final records release authority/ID review, immutable final records release lock verification, recipient/custody/retention release acknowledgement verification, linked asset final records release evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records handoff certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-handoff-certificate.md, .json, and .tsv outputs for release verification acceptance, final records handoff authority/IDs, immutable final records handoff lock, recipient/custody/retention handoff acknowledgement, linked asset final records handoff evidence, handoff authority fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records handoff verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-handoff-verification.md, .json, and .tsv outputs for independent final records handoff certificate acceptance, final records handoff authority/ID review, immutable final records handoff lock verification, recipient/custody/retention handoff acknowledgement verification, linked asset final records handoff evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records closeout certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-closeout-certificate.md, .json, and .tsv outputs for handoff verification acceptance, final records closeout authority/IDs, immutable final records closeout lock, recipient/custody/retention closeout acknowledgement, linked asset final records closeout evidence, closeout authority fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records closeout verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-closeout-verification.md, .json, and .tsv outputs for independent final records closeout certificate acceptance, final records closeout authority/ID review, immutable final records closeout lock verification, recipient/custody/retention closeout acknowledgement verification, linked asset final records closeout evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records archive certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-archive-certificate.md, .json, and .tsv outputs for final records closeout verification acceptance, final archive authority/ID recording, immutable final records archive lock, recipient/custody/retention archive acknowledgements, linked asset archive evidence, and residual blocker/exception archive disposition.
- [x] Links package post-reseal final archive seal release final records archive verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-archive-verification.md, .json, and .tsv outputs for independent final records archive certificate acceptance, archive authority/ID review, immutable archive lock verification, recipient/custody/retention archive acknowledgement verification, linked asset archive evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records retention certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-retention-certificate.md, .json, and .tsv outputs for final records archive verification acceptance, retention authority/ID recording, immutable retention lock, recipient/custody/archive retention acknowledgements, linked asset retention evidence, and residual blocker/exception retention disposition.
- [x] Links package post-reseal final archive seal release final records retention verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-retention-verification.md, .json, and .tsv outputs for independent final records retention certificate acceptance, retention authority/ID review, immutable retention lock verification, recipient/custody/archive retention acknowledgement verification, linked asset retention evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records disposition certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-disposition-certificate.md, .json, and .tsv outputs for final records retention verification acceptance, disposition authority/ID recording, immutable disposition lock, recipient/custody/archive disposition acknowledgements, linked asset disposition evidence, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records disposition verification parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-disposition-verification.md, .json, and .tsv outputs for independent final records disposition certificate acceptance, disposition authority/ID review, immutable disposition lock verification, recipient/custody/archive disposition acknowledgement verification, linked asset disposition evidence review, reviewer fields, and residual blocker/exception disposition.
- [x] Links package post-reseal final archive seal release final records destruction certificate parity — added document/active-artboard image-package-post-reseal-final-archive-seal-release-final-records-destruction-certificate.md, .json, and .tsv outputs for final records disposition verification acceptance, destruction authority/ID recording, immutable destruction lock, recipient/custody/archive destruction acknowledgements, linked asset destruction evidence, and residual blocker/exception destruction disposition.
