# Changelog

All notable changes to Anchorworks are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Plotter debug console**: the Send to Plotter dialog now has a built-in serial console. Connect once and keep the cutter link alive across dialog reopens, pick the baud rate (most HP-GL vinyl cutters speak 9600, not the previous hard-coded 115200) and flow control (none / RTS-CTS / XON-XOFF), then use one-click machine commands (initialize, pen up, blade tap, HP-GL OE/OH/OA/OS queries, grbl status / unlock / home / pause / resume, immediate force/speed push), a jog pad with set-origin, and a raw-command input with automatic reply decoding. The TX/RX traffic log timestamps every byte with an ASCII/HEX toggle plus copy / download / clear.
- **Paced, cancellable job streaming**: Send via USB and Test cut now stream through the persistent link with chunk pacing below the line rate (protects cutters whose tiny buffers overflow without RTS/CTS wiring), a live progress bar, and a Stop button that aborts the transfer and lifts the blade (PU; / grbl feed-hold). Falls back to the legacy one-shot send when no connection is open.
- **Native persistent serial link (Tauri)**: new serial_open / serial_write / serial_read / serial_close commands keep OS handles in a Rust-side registry with configurable flow control, so read-back and interleaved operations work in the desktop app; all serial commands now run off the main thread.
- **Persistent plotter settings**: machine options, format, material preset, baud, flow control, and last-used port round-trip through localStorage (sanitised on load), so a dialled-in setup survives dialog reopens and app restarts instead of resetting to defaults.
- **Brand machine profiles**: a profile picker covering the real cutter families — Roland CAMM-1 GX/GS and legacy PNC, Graphtec CE/FC/CE7000, the Roland-compatible Chinese clones (Liyu / Rabbit / Teneth / Redsail / Creation / Saga / 文泰-Artcut ecosystem), Mimaki CG, Summa, and GCC. Each profile loads the right dialect, baud, flow control, force/speed starting points and field notes (buffer quirks, panel-only machines, TB-overcut tips), sends a brand-correct init statement on connect, and drives the profile-aware force/speed quick command.
- **Plotter diagnostics**: one-click connection self-test (OE/OH/OA or grbl ?/$I with decoded answers and round-trip latency), automatic baud-rate detection (reconnects at each common rate and watches for a reply, restoring the link afterwards), and a transfer-time estimate in the output summary.
- **Configuration records**: named saved machines — full setup snapshots (profile, dialect, force/speed, baud, flow, port, material) with save / load / update / delete — plus a job history of the last 50 sends with settings, byte counts, durations and results.
- **Freehand knife tool (`K`)**: drag a polyline across objects to slice them along the cut corridor (kerf-modelled, curve-refit pieces) — Illustrator-style freehand cutting for vinyl/laser prep, with a live dashed preview, Esc cancel, and one undo entry per gesture.
- **Trace presets + multi-color trace**: three named recipes (Black & White logo / Line art / Photo cut) plus deterministic seeded k-means colour quantization (2–8 colours) that traces one filled path per colour region through the existing worker, with per-colour progress. Single-contour API unchanged.
- **Vector PDF import** (`File > Import PDF…` + drag-drop): pdf.js operator-list walker emitting SVG paths with full transform-stack, RGB/CMYK/gray, and even-odd support; text runs are skipped with a counted warning. Ships as a separate lazily-loaded, PWA-precached chunk.
- **Animated cut simulation**: a Simulate toggle in the plotter preview replays the optimized cut order at the configured feed rate — crosshair cutter head, pen-up hop trails, 0.5×–4× speed, progress and elapsed readout; the timeline provably matches the job time estimate, and prefers-reduced-motion skips straight to the end.
- **Rotation-aware nesting**: first-fit-decreasing skyline packer with 90° rotation against the artboard width (`Nest (rotation-aware)` next to Auto-arrange) — measurably better material utilization than the shelf packer, single undo step.
- **CSV data merge**: RFC-4180-tolerant CSV source in the Variable Data dialog with column↔named-text-object bindings, `{{token}}` substitution, live first-record preview, and per-record clones on the existing grid — the Etsy/name-badge workflow.
- **Editor operability**: live W×H / angle HUD while scaling/rotating, Shift+drag axis-lock, Shift+wheel horizontal pan, and a Mouse-wheel preference (Figma-style scroll default or Illustrator-style wheel-zoom) in Preferences → Editor.
- **First-paint**: CommandPalette and the canvas context menu are now lazy chunks (entry 1,851 kB → 1,306 kB, −29.4%); history snapshots cost one canvas stringify instead of three with zero-copy cut-path sharing.
- **Test infra**: jsdom localStorage shim for Node ≥ 26 (the inert experimental global shadowed jsdom's Storage and broke 31 storage tests).
- **Interactive Shape Builder (`Shift+M`)**: drag across arrangement regions of 2–8 overlapping objects to merge them into one path, Alt-drag to erase regions — Affinity/Illustrator-style with live region highlighting, one undo per gesture, and untouched sources keeping their object identity.
- **Envelope Distort — Make with Top Object**: targets deform into the top object's shape via even-odd scanline chord mapping (row-cached); curves refit after mapping, groups recurse, live text converts through the trace pipeline, the top object is consumed like Illustrator. Registered in Distort & Transform, the command palette, and the Free Distort dialog.
- **Chinese dictionary lazy chunk**: keys-are-English collapsed the en table to 37 overrides and moved the 3,956-entry zh dictionary behind a dynamic import — entry chunk 1,306 kB → 889 kB (−52% cumulative from 1,851 kB); persisted-zh boots are flash-gated, others warm the chunk idle.
- **selectionOps decomposition, phase 1**: the select-same and appearance-apply families moved verbatim to `src/lib/selection/` (16,941 → 16,232 lines) with the public surface preserved; next target identified — the template-generated imageHandoff family is 77% of what remains.
- **Interactive Width tool (`Shift+W`)**: hover a stroked path for station handles, drag perpendicular to set local width with a live outline preview, Alt+click deletes a station — monotone-Hermite interpolation, one undo per gesture, committed outlines stay re-editable in place and profile-menu outputs are editable too. 35 tests.
- **imageHandoff extraction (selectionOps phase 2)**: the 13,024-line template-generated package/handoff report family moved to its own lazy chunk (671 kB, dynamic-imported by its 662 menu/palette handlers). selectionOps.ts is down to 3,241 lines; the eager canvasEngine chunk drops 726 → 96 kB (−72 kB gzip eager).
- **Color separations workflow** (`Document > Separations…`): inventories every spot/process paint in the document, live-isolates any plate on the canvas non-destructively, and exports plates as SVG or 2× PNG — a capability no other web vector tool in our survey ships. 11 tests.
- **Viewport broadcast gating**: overlay canvases (rulers, grid, artboards, guides, cut paths, measure) now repaint only on real zoom/pan changes instead of every rendered frame (audit finding — biggest runtime win per line).
- **In-app help for the whole wave**: Help Center grows 63 → 74 topics covering every new tool and workflow, every statement verified against the code (en/zh).
- **Width-tool metadata now persists** through project files, undo snapshots, and the clipboard via Fabric's customProperties allow-list, with fail-soft normalization of corrupted records. 9 tests.
- **Tauri Rust side compile-verified**: `cargo check` green on the shipped serial/epson Rust code.

## [0.12.1] — 2026-06-10

### Added
- **Production workflow parity**: expanded SignMaster/FlexiSign-style command surfaces across menus, command palette, context menus, and layer/search workflows for artboards, blends, masks, path effects, selection cleanup, symbols, measurement, snapping, and cutter-prep operations.
- **Vector cleanup coverage**: added focused utilities and tests for layer operations, artboards, blends, brush presets, global swatches, graphic styles, knife/scissors cuts, path smoothing, print marks, recolor sorting, variable-width strokes, viewport operations, and related selection tools.

### Changed
- **Release metadata**: synchronized npm, Tauri, Cargo, and lockfile package versions for the 0.12.1 release.

## [0.12.0] — 2026-06-05

### Added
- **Desktop plotter USB picker**: the Send to Plotter dialog now lists OS serial ports in the Tauri desktop app, lets operators refresh/select the cutter USB port, and uses that selection for Test cut and Send via USB instead of relying on ambiguous auto-detection.
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
