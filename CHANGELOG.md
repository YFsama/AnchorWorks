# Changelog

All notable changes to Anchorworks are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [0.12.0] — 2026-06-05

### Added
- **Workflow parity polish**: added more keyboard-browsable dialog actions, preset review status, and reset baselines across production dialogs so sign, print, and path-editing workflows are safer to explore before applying.
- **Roughen reset**: the Roughen effect now exposes a footer Reset action that restores the default 1 mm Size and 3 mm Detail while clearing stale recipe review status.
- **Preferences reset**: Preferences now includes a footer Reset action that restores the draft captured when the dialog opened and clears stale search / recipe review state before applying or saving.
- **Find & Replace reset**: the global text cleanup dialog now adds a footer Reset action that clears Find / Replace, Match case, stale recipe review, and returns focus to Find.
- **Keyboard Shortcuts footer**: the shortcut cheat-sheet now adds a keyboard-browsable Close action beside Customize Shortcuts so users can exit or rebind without reaching for the title-bar close button.
- **Document-menu bridge parity**: Document now mirrors File, command-palette, and right-click bridge presets plus Clear bridges cleanup for cutter-prep workflows.
- **Topbar bridge cleanup**: the output toolbar now places Clear bridges beside the one-click Standard bridge action for faster bridge/revert cutter-prep trials.
- **Status-bar cut cleanup**: the pink cut-count shortcut now supports Ctrl/Cmd-click to clear cut paths directly, while click and Shift/Alt-click still open Plotter and Cut Contour.

### Changed
- **Release metadata**: synchronized npm, Tauri, and Cargo package versions for the 0.12.0 release.

## [0.11.1] — 2026-06-03

### Fixed
- **Release CI (portable Windows)**: the portable-exe step passed an invalid
  `--bundles app` flag — the Tauri CLI only accepts `msi` / `nsis` as Windows
  bundle targets, which failed the 0.11.0 release build. Switched to
  `--no-bundle` (compiles the raw `anchorworks.exe` without an installer). No
  application changes — this re-ships the 0.11.0 feature set with a working
  release pipeline.

## [0.11.0] — 2026-06-03

A large Adobe Illustrator + SignMaster parity release. The headline themes:

### Added
- **Pathfinder** — Union, Subtract, Intersect, Exclude, Minus Back, Divide,
  Trim, Merge, Crop, plus Clipping Mask and Compound Path (menu + right-click +
  Align panel + shortcuts).
- **Distort & Transform** — Roughen, Zig Zag, **Pucker & Bloat**, Twist, Arc
  Warp (Arc / Rise / Flag / Wave), and Blend between two objects.
- **Numeric Transform** — move / scale / rotate / copy dialog with **polar
  (distance + angle) move**, **non-uniform X/Y scale** with a link toggle,
  Transform Each, Transform Again (step-and-repeat), Shear, quick 90°/180°
  rotates, Flip H/V, and Resize-to-exact-mm.
- **Align & Distribute** — full align (edges/centres) with Selection / Artboard /
  Key-Object reference; distribute by centres, by **each edge (top/bottom/
  left/right)**, by equal gap, and by an exact spacing value; Auto-arrange
  (shelf-pack nest); Center / Distribute on the artboard.
- **Type** — Create Outlines (font-independent), Change Case, **Smart
  Punctuation**, Break into Letters / Lines, Text on Arc, **horizontal/vertical
  scale**, tracking & leading (with Alt+arrow shortcuts), Find & Replace, and
  Variable Data (serial numbering / list merge).
- **Colour** — Recolor Artwork, Edit Colors (Invert, Grayscale, Saturate, Hue,
  Brightness), a persistent Swatches palette, eyedropper that carries appearance
  *and* text attributes, swap / default fill+stroke.
- **Selection** — Select Same (fill, stroke, stroke-weight, opacity, **object
  type**), Select Inverse, Select All Text, next/previous object in the stack,
  Lock / Unlock All, Hide / Hide Others / Show All.
- **Shapes & paths** — Star / Polygon / Spiral generators; Simplify, Offset
  Path, Round Corners, Add Anchor Points, Outline Stroke to Fill, Reverse Path
  Direction, Join, Clean Up, Arrowheads.
- **Artboards** — **Duplicate Artboard** (with its contents), **Artboard from
  selection**, Fit to Artwork / Selection, and Export-all as separate SVG / PNG.
- **Stroke** — custom dash pattern, **miter limit**, constant-width (uniform)
  toggle, line cap / join, stroke alignment (centre / inside / outside).
- **Cut & sign** — Weld, Multi-outline, Rhinestone / hotfix templates, Banner
  Grommets, bridges / tabs, inner-contours-first cut ordering, Outline-Stroke
  cut lines, and a Measure tool (distance + angle).
- **Import / export** — **Copy as SVG** to the clipboard, **Paste from
  Clipboard** (external image / SVG), Image Trace from the right-click + command
  palette, and Export-Selection as SVG / PNG.
- **Shared document unit** — one mm/px unit drives the inspector, rulers
  (adaptive 1-2-5-10 ticks), status-bar dimensions + cursor read-out, the
  Resize / Transform dialogs, align spacing, and the keyboard nudge increment.
- **Guides & view** — ruler-drag guides (persisted), margin / safe-area guides,
  Make Guides from selection, lock / show toggles; Zoom to Selection, rulers /
  guides / grid toggles, an editable zoom-percentage field.
- **Canvas interaction** — double-click a path to edit, Alt-drag to duplicate,
  Shift-snap rotation to 15°, Shift-constrained shape drawing, snap to the
  artboard frame.

### Changed / Fixed
- Multi-selection styling now applies to **every** selected text object (font,
  character panel, Create Outlines).
- The Properties panel hydrates its dash / cap / join / miter-limit / blend-mode
  controls from the selected object instead of showing stale defaults.
- Right-click, menu and command-palette surfaces brought to parity (Select Same,
  Path Effects, Sign Effects, Trace Image, the Edit-menu Select family).

## [0.10.3] — 2026-06-02

### Added
- **One-click contour**: right-click a selection → *Create Contour* drops a
  default 2 mm offset cut line with no dialog. The dialog stays for tuning.
- **Print preview**: the Print dialog now shows a live WYSIWYG preview — page,
  margins, artwork fit, and any crop/registration marks — matching exactly what
  `printer.ts` outputs.
- **Plotter preview without cut paths**: *Send to Plotter* now previews the
  geometry that will actually export (the canvas outlines) instead of an empty
  state, and the job estimate counts it too.
- **Version chip**: the build version is always visible in the status bar.

### Changed
- **Single menu bar on Windows/Linux**: the native Tauri menu is now attached
  only on macOS (where it lives in the system menu bar). On Windows/Linux the
  in-window top bar is the sole menu surface — no more duplicated strip under
  the title bar. Web/PWA unaffected.

## [0.10.2] — 2026-06-02

### Fixed
- **Release CI (portable Windows)**: the Edge CDP runtime-download approach
  from 0.10.1 still 404'd in CI. Stop chasing a fixed-version runtime entirely:
  the portable `.exe` now links against the **system WebView2** (shipped in
  Windows 11 and backported to Windows 10 21H2+, so present on virtually every
  supported machine), and the zip bundles Microsoft's **Evergreen Standalone
  Installer** — fetched from a stable, documented fwlink that never rotates —
  as a one-time offline fallback. No version guessing, no CDP, no NuGet. (The
  signed installers and auto-updater were already unaffected, since the
  portable job is `continue-on-error`.)

## [0.10.1] — 2026-06-01

### Fixed
- **Release CI**: the Windows portable `.zip` job could never fetch a
  WebView2 fixed-version runtime — the `Microsoft.Web.WebView2.FixedVersionRuntime.<ver>.x64`
  NuGet packages no longer exist (search + flat-container both 404), so its
  hard-coded candidate list always failed and blocked the whole release at the
  draft stage. The runtime is now fetched from the Edge CDP service the official
  download page uses (resolve current version → get the x64 CAB's CDN URL →
  `expand`), and the portable job is marked `continue-on-error` so a future
  runtime-download breakage can never again hold back the signed installers and
  the auto-updater `latest.json` manifest.

## [0.10.0] — 2026-06-01

A print-and-cut release: the vinyl-cutter pipeline grows to near parity with
desktop sign software, plus a richer right-click menu, more shortcuts, and a
beefed-up debug panel.

### Added — Document
- **Paper-size presets** for the artboard: print (A3–A6, Letter, Legal,
  Tabloid), cards & photo, stickers & labels, and screen/social sizes, with
  DPI-aware mm⇄px conversion, an orientation toggle, and a live physical-size
  readout.

### Added — Cutter / plotter
- **Visual cut preview** — true-scale SVG of the blade path with
  registration/positioning marks and an optional printed-art overlay, so a job
  is verifiable before sending (not just raw G-code/HP-GL text).
- **Cut by colour** — contours record their source swatch; mute colours to cut
  one vinyl colour at a time. Registration marks and weed borders always cut.
- **HTV mirror**, **greedy cut-order optimisation**, and a live **job estimate**
  (cut length / pen-up travel / time / path count).
- **Overcut** for clean closed-path corners, generalised to all dialects.
- **Weed border** plus an optional **weed grid** (rows × columns).
- **Material presets** (vinyl / HTV / sticker / cardstock / tint / stencil) that
  fill speed/force/overcut and auto-enable mirror for HTV.
- **Test cut** calibration pattern to dial in force/offset on scrap.

### Added — Editing & navigation
- **Right-click menu**: Paste Here (at cursor), Flip Horizontal/Vertical,
  Edit Text, Cut Contour…, Send to Plotter…, Select All.
- **Shortcuts**: `Ctrl+2` Zoom to Selection, `Ctrl+Shift+P` Send to Plotter.

### Added — Debug
- Live **FPS** meter, a **keymap** snapshot tab, cut-path totals, app
  version/shell, and one-click **Copy / Download diagnostics** (a structured
  JSON bug-report blob).

### Changed
- The cutter's "needs Chrome" gate is reframed: **Save File** works in any
  browser and is the primary action when direct USB (Tauri native or Web
  Serial) is unavailable.

### Notes
- New pure modules `cutOptimize.ts` and `paperSizes.ts` ship with unit tests
  (25 cases across the two). Full en/zh translations. tsc + eslint + vitest
  (180) + vite build all green.
