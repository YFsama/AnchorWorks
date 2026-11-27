# Changelog

All notable changes to Anchorworks are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [0.20.0] — 2026-11-27

### Added — connecting, setting up and debugging a plotter
- **Calibrate & test tab** in the Send to Plotter dialog: a workbench for
  dialling in a blade and a machine without leaving the app.
  - *Blade offset test* — a row of cells, each cut with a different blade
    offset (0 / 0.15 / 0.25 / 0.35 / 0.45 / 0.6 mm, or your own steps); the
    *Blade offset calculator* turns a measured seam gap or overlap into a
    suggested offset.
  - *Overcut test* — the same cells cut with overcut 0 / 0.1 / 0.2 / 0.3 / 0.5 mm
    through the real overcut pass.
  - *Force test* — five squares at rising blade pressure in one pass (HP-GL);
    weed them and the first clean lift is the force to use.
  - *Distance calibration* — a raw 50 / 100 / 200 mm square (no overcut, no
    blade offset) with corner crosshairs; enter the measured length and the
    scale error and corrected grbl `$100` / `$101` values are suggested, and
    the two diagonals give the axis squareness error.
  - *Dry run* — the current job with the tool up (HP-GL: every `PD` becomes
    `PU`; G-code: Z at pen-up height, rapids at the travel rate, spindle and
    laser commands removed).
  - *Positioning marks*: *Mark origin* (a 10 mm corner bracket and dot at the
    current origin) and a *Ruler* (50 / 100 / 200 mm along the machine's axes),
    plus a *Drift test* (two rows of crosses near the top and the bottom of the
    page — how far the lower row sits off is the drift to enter in Cut
    settings).
  - Every pattern can be rehearsed on the virtual plotter first; the
    *Rehearsal result* view reports where the head ended up.
- **Virtual plotter (rehearsal mode)** — `PlotterSimulator` answers HP-GL and
  grbl like a cutter does. It is the first entry of the port list, connects
  with no machine and no cable, tracks the carriage position, the page and the
  travel limits, and reports moves that would leave them. Nothing sent to it
  reaches a serial port; the connection and positioning cards say so.
- **Position & test card** (Machine tab): jog pad with hold-to-repeat, keyboard
  jog (arrows 10 mm, Shift + arrows 1 mm), jog step 1 / 5 / 10 / 25 / 50 mm,
  typed X / Y with Go, Set origin, Home, a live carriage position, pen up /
  blade tap / feed / eject, and Test cut / Force test / Corner tour one click
  away.
- **Automatic scan and identification**: opening the Machine tab scans by
  itself — already-authorized Web Serial ports in the browser, the native port
  list in the desktop app — and never raises the browser's port chooser. The
  last link is remembered. After connecting, the machine is identified without
  asking (`OI;`, or `?` and `$I` when it answers like grbl); the model and page
  size appear in the connection card, and a brand profile is offered when one
  matches.
- **Job progress and completion** in the dialog and in the status-bar chip
  (`plotterJobMonitor`).
- **Show on canvas**: draws the job over the artwork with its start points, the
  origin marker and axes, the material band, the job's bounding box with its X
  / Y distance from the origin, and anything outside the material in red.
- The Diagnostics & console section of the plotter dialog starts collapsed;
  the connection and positioning cards come first.

### Added — editing
- **Artboard size presets**: the Add Artboards picker offers the document sizes
  and 12 sign and large-format sizes (yard signs, banners, posters, roll-up
  banner, sticker label, name badge, bumper sticker, door hanger) with search,
  count and placement; each artboard row resizes to a preset and keeps the
  artwork outside it.
- File ▸ **Restore Last Session…** reopens the last autosave by hand.

### Changed
- **Session recovery stays out of the way.** The recovery dialog now appears
  only when the previous session crashed with unsaved work. A normal exit that
  left unsaved work gets a quiet toast. Nothing is shown when the last session
  ended with everything saved, when the canvas already has content, or when the
  document is still open in another window of the app (a Web Locks probe tells
  a live window from a crash). Unsaved is a change counter measured against the
  last project save, so a document that is already on disk is never offered
  again, and an empty canvas is never snapshotted. Closing the desktop window
  goes through the same exit mark (`core:window:allow-destroy`); *New* clears
  the session.
- **File drag-and-drop works anywhere in the window**, desktop app included:
  files land at the cursor on the canvas or at the centre of the view when
  released over a panel, a dashed overlay says what a drop will do, a drop that
  lands before the import module has loaded is held and then imported, and
  every outcome is reported by toasts that name the files — never a raw
  exception. A drop target with its own handler (the Gang Sheet Builder intake)
  keeps its files. `tauri.conf.json` sets `dragDropEnabled: false`: with the
  default, Tauri replaces WebView2's drop handler on Windows and the page never
  receives the files.
- **Context menu regrouped** from 67 rows (about 1800 px tall) to 22: Paste
  special ▸, Arrange ▸, Lock & Hide ▸, Path ▸, Select ▸, Appearance ▸ and
  Image ▸ hold what moved, and a hint appears when the menu scrolls.
- The arrow-key nudge no longer fires when the focused control already handled
  the key.

### Fixed
- **A plot job built from the canvas lost every object transform** (canvas
  artwork source) and could emit `PD NaN,NaN`. Transforms are now applied when
  the artwork is read, non-geometry subtrees are skipped, zero-size and
  percentage-size rectangles are dropped, and a path with a non-finite point is
  filtered out.
- **G-code files ended without a newline**, so the comment on the closing
  `M30` line could swallow the next command appended to the file.
- **grbl controllers were misidentified as HP-GL**: an `error:N` reply to `OI;`
  was read as an HP-GL error string. It now counts as silence, the `?` probe
  follows, and the machine is suggested as `grbl-generic`.
- **Inch mode applied overcut and blade offset as inches** — 25.4 times too
  large. Both are millimetres in every unit.
- **A project file opened through drag-drop or *Open SVG / JSON…* cleared the
  canvas and loaded nothing**: it was handed to the raw canvas-JSON loader. A
  project envelope now opens as a project (the decision ⌘/Ctrl+O already made),
  asks first when the canvas holds work, and opens before the other files of
  the same drop so they land inside it.

### Fixed — independent review of the plotter output
An independent, probe-backed review of everything this release sends to a
machine. Ordered by what it would have done to a real cutter.
- **The dry run could cut.** Its rewrites were case-sensitive (HP-GL `PD` →
  `PU`, G-code Z and M3) and ignored the pen-down selector on `PA`/`PR`, while
  the Code page is editable and cutters take lower case: a payload written
  `pd` / `m3` went out with the tool down. The rewrite now matches either
  spelling, lifts the selector too, and the result is replayed through the
  machine simulator — a dry run that still marks anywhere is refused with a
  message, never sent.
- **A grbl job was reported finished the moment it started.** The progress
  monitor's own position polls (`?`) went out as sends on the same link, and
  each one raised the "done" the monitor took for the job's: "Cut finished"
  16 ms in, Pause and Stop gone for the whole transfer. Every send is now
  tagged with its job (`plotterJobMonitor.start()` returns the id), and only
  that send's completion ends the transfer.
- **Status replies were shared.** `link.query()` had no queue, so a position
  poll and a status poll on one link could each take the other's answer: a
  busy machine read as idle — reported complete — or a working machine as
  "does not report status". Queries are now queued and matched to their
  command; the completion watch reads the last complete reply and wants two
  idle polls in a row before it says "Cut complete".
- **An alarm counted as completion.** grbl `Alarm`, `Door` and `Hold` — and
  the virtual plotter's travel-limit alarm — mapped to idle, so a job that
  stopped mid-cut showed "Cut complete". They are a phase of their own now:
  "Machine alarm — job NOT finished", with the reason.
- **grbl machines that report machine coordinates (`MPos`)** showed the
  wrong work position after *Set origin*. Reports are converted to work
  position (`grblWorkPosition`), and the snapshot says which frame it has.
- **Rehearsal could reach a blade.** With a real machine linked, *Rehearse on
  virtual plotter* did nothing (the link was already open) and the next test
  cut went to the machine. With the virtual plotter picked in the port list,
  or Rehearse pressed, the real link is now let go first: nothing asked of the
  virtual plotter is ever sent to a port.
- **Calibration patterns threw the origin away.** Their HP-GL header carried
  `IN;`, which resets the scaling points on an HP-GL-compliant plotter — the
  very origin *Set origin* (`IP;`) had just defined — so *Mark origin* cut at
  the material corner instead of under the head. Calibration and positioning
  patterns are now emitted without it; jobs keep their initializer.
- **Mirrored jobs slid their cut kinds apart.** Through-cuts, kiss-cuts and
  the perf border were each mirrored about their own centre, so with mirror
  on a kiss-cut window landed beside the print it belongs to — and off from
  where the canvas overlay drew it. Every kind now flips about the job's one
  mirror line (`plotter.ts` `jobMirrorLine`, `mirrorPolys(…, around)`).
- **Progress ran ahead of the head** on the virtual plotter: a move split
  across pump ticks had its time booked twice (a blade offset test read
  "150%"). The played time now adds only what each step still had to play.
- **Every visit of the Machine tab re-probed the ports and re-applied a
  guess.** "This list was already probed" lived in a component ref, and the
  pane remounts on each visit; a silent CH340 port was applied as "suspected
  clone" — profile, HP-GL and 9600 Bd — without asking. A port list is now
  probed once per session (`plotterScan.ts` probe memory) and the detection is
  offered, not imposed: the *Connect* beside it applies it.
- **A 200 mm distance box did not fit a 210 mm page** — its far crosshair
  crossed the origin line by 4 mm into the travel limit. The box states the
  room it needs from the page corner, and sizes that do not fit are disabled.
- **The canvas cut preview dropped a transform written with a unit**
  (`translate(50px, 60px)` — how the preview's CSS rewrite spells it): the
  object was drawn at the page origin while the output went to the right
  place. Transform arguments now take a unit, and `skewX` / `skewY` are read.

### Verified
- Gates: ESLint 0, `tsc -b` 0, `cargo check` clean; unit suite 179 files /
  2,896 tests green; full end-to-end suite on the production build 131 passed,
  0 failed. Three specs that only ran against a dev server (`dragdrop`,
  `artboard-presets`, `plotter-calibration`) now observe what is on screen —
  rows, read-outs, pixels — and run on the build CI ships.
- Real Tauri shell, debug build under an isolated identifier: the app boots, a
  PNG dropped into WebView2 imports, the connection card lists the virtual
  plotter first, the virtual plotter connects and the keyboard jog moves the
  position read-out, and closing the window writes the clean-exit mark and ends
  the process.
- Bundle: the other twelve eager chunks are byte-identical to 0.19.0 and no
  lazy module became eager; the entry chunk grew 52 kB raw / 17 kB gzip
  (293 → 345 kB raw), nearly all of it the session system in `autosave.ts`,
  which runs at boot (OPTIMIZATION_BACKLOG, open item 15).

## [0.19.0] — 2026-11-24

### Fixed — pre-release audit (2026-11, ahead of 0.19.0)
- The release gates (ESLint had not been run during waves 3–5) plus
  pointer-driven probes turned up four defects that are fixed here. Two of
  them existed in every release so far; one was a regression that would have
  shipped with the wave-3 changes.
- **Recolor Artwork was unusable** (all releases ≤ 0.18.0). App.tsx mounts
  dialogs conditionally, so every open is a fresh mount with the store flag
  already true — and the codebase's "re-seed on open transition" idiom (a
  `prevOpen` reconciliation during render) never fires on a first mount. The
  colour harvest lived only in that block: the dialog opened with zero
  colours — "No solid colors in the selection to recolor", Reset/Apply
  disabled — for every selection. It had no tests, and the wave-4 harness had
  pinned that broken state as a "negative contract". Same mechanism, smaller
  effect: **Variable Data** never estimated its grid gaps from the selected
  text and **Document Settings** always opened on Custom / Portrait
  (disagreeing with Reset). All three now seed through `useState`
  initializers. Guarded by unit tests that mount each dialog exactly like
  App.tsx (flag set before the first render) and by a pixel-level Recolor e2e
  (two coloured shapes → rows → Map to gray → Apply → one undo restores).
  *Correction:* the wave-4 entry below used to claim Document Settings'
  render-time seeding "froze the page intermittently" — that was never
  established; the pattern is the standard idiom in sibling dialogs and
  cannot livelock.
- **Nested submenus could not be opened by mouse.** A flyout that hangs
  outside a scrolling ancestor is clipped by it (`overflow-y: auto` clips
  both axes even when nothing overflows): the panel still reported
  "visible", but clicks on its rows landed on the canvas. Affected: the
  menubar's top-level panel (clipping *every* nested submenu — introduced by
  the wave-3b height cap, caught before release), the menubar's own nested
  panels (depth 3+, in 0.18.0), and the context menu's root (all of its
  submenus, in 0.18.0). Every flyout level is now `position: fixed`, placed
  from its anchor's viewport rect and flipped/clamped at the window edges.
  Existing e2e never noticed because Playwright scrolls clipped targets into
  view before hovering; the new `menu-flyout.spec.ts` drives menus with real
  pointer movement and hit-tests each flyout instead.
- **The context menu closed on the first turn of the mouse wheel over it**
  (in 0.18.0): its "close when the page scrolls" listener also caught the
  menu's own box scrolling, leaving everything below its first screen
  unreachable. Scrolls inside the menu no longer dismiss it.
- **Below ~1310px wide, three menus and three toolbar buttons were
  unreachable by mouse** — View / Insert / Help sat in the menubar strip's
  horizontal scroll and the output toolbar was squeezed to 73px, with no
  scroll affordance. The topbar now steps down for narrow windows (mark-only
  logo below 1100px; icon-only toolbar, dot-only save state and tighter gaps
  below 1400px): all nine menus and all seven right-hand controls are
  reachable down to the 960px window minimum.

### Changed — topbar declutter + Plotter dialog tabs (2026-11 wave 5)
- **Topbar right side: 24 controls → 7.** The Grid/Snap/Guides/Anchor
  segmented toggle moved out (the StatusBar pips and View menu remain the
  two always-available entry points), and the 16-button horizontally
  scrolling output strip collapsed to three: **Plotter** and **Print**
  stay one-click, everything else (Cut Contour, Reg marks, Weed/Bridges/
  Grommets, Test cut, Nest, Rhinestone, Variable Data, Print Prep, Tile
  Print, Export SVG, Document Settings) folds into a grouped **More…**
  dropdown — grouped by cut-prep / layout / print / doc with separators,
  keyboard-reachable, shortcuts preserved. The dropdown trigger renders as
  a plain button + `aria-haspopup` (menuitem-in-toolbar fails axe's
  aria-required-parent; LanguageSwitcher was the working precedent).
- **Plotter dialog: flat 17-input form → three tabs.** Machine
  (profiles/auto-detect/connection/serial console/Data-Link), Cut settings
  (material presets, feed/travel with chips, strategy toggles, ARMS,
  blade overcut/offset with chips, drift compensation), and Output
  (preview, estimates, cut-by-colour, job prep, weed grid). Any single tab
  exposes ≤8 numeric inputs (was 17 in one scroll); the action footer
  (Cancel / Test cut / Force test / Laser test / Corner tour / Save File /
  Send via USB) is pinned and visible on every tab; opening defaults to
  Machine when disconnected and Output when connected; a rejected preflight
  now jumps to the Output tab so the code pane with the rejection is
  actually visible. Zero callback/state changes — JSX reorganization only,
  both PlotterDialog behaviour suites kept their assertion strength.
- Wave-5 residuals recorded in OPTIMIZATION_BACKLOG (preset-chip style
  variance in Cut tab, window.confirm double-track in send paths).

### Added — plotter/engraver auto-detect + grbl laser tooling (2026-11 wave 4)
- **Auto-detect machine** (Plotter dialog, machine settings): one button now
  runs the whole identification pipeline that previously took 6-7 manual
  steps through the collapsed debug console — rank candidate ports by USB
  bridge chip (CH340/CH9102 → clone cutters, FTDI/Prolific → brand machines,
  CP2102/STM32 CDC → grbl), probe baud rates (chip-suggested first, then the
  full ladder), query the machine (HP-GL `OI;`/`OE;`/`OH;`, grbl `$I` and a
  `$$` snapshot with a single-line `$32` fallback for truncating links),
  run a light self-test, and suggest a machine profile — auto-filling
  port/baud/profile/format and pre-filling the saved-machine name. A CH340
  port that stays silent is suggested as the china-clone profile (they
  mostly ignore status queries); detection never auto-connects (that stays
  a user action) and releases the port when it started disconnected. Web
  Serial builds degrade to guidance (the browser requires a gesture per
  port and cannot enumerate).
- **grbl/engraver support**: two new machine profiles (grbl-generic pen/
  spindle, grbl-laser with $32=1 / $30 notes and goggle warnings); the
  profile picker now renders for every output format; the G-code generator
  gained an optional spindle/laser power field (M3 S… header, **M5 before
  the G0 return home** so a laser never fires on the way back — output is
  byte-identical when unset); `$$`/`$#` console commands with decoded
  replies; jog travel-limits awareness via `$130/$131` instead of HP-GL
  page queries; new **Laser test** gradient strip (10-50%, M3/M5-paired)
  and **Corner tour** four-corner probe pattern, both streamed through the
  existing test-cut channel.
- **Diagnostics report** now embeds the machine identification, grbl `$$`
  snapshot, and self-test steps alongside the existing connection knobs and
  job history.
- 36 new unit tests (auto-setup orchestration across clone/grbl/brand/
  silent branches, identify format fields, spindle snapshots, corner-tour/
  laser-test structure and lint, profile compatibility).

### Added — card deep-test harness: 44 dialogs × behavior contracts (2026-11 wave 4)
- `tests/e2e/card-behavior.spec.ts` (three batches, ~90s): every dialog that
  previously only had open/close coverage now asserts a behavioral contract
  — initial focus (where the card defines one), footer inventory (incl.
  negative disabled pins like Trace Art's Trace/Insert without a bitmap,
  Plotter's Send before a connection),
  safe preset-chip interaction (aria-pressed flip + linked field value),
  Reset regression where present, Cancel/Escape closes, focus returns to the
  menu trigger, and the canvas object count is unchanged — plus zero new
  console errors. `tests/e2e/confirm-behavior.spec.ts` pins the ConfirmHost
  contract (alertdialog role, Escape answers false without reload, danger
  defaults focus to Cancel, focus returns on both binding and menu paths).
  dialog-fit gained Zig Zag and Multi-outline entries.
- Harness-driven src fixes: **Error Log focuses the enabled Close when the
  log is empty** (disabled Copy-all silently refused focus);
  **useFocusRestore now routes menu-row restores to the menu's trigger
  button** — the row is hidden the moment a dialog steals focus-within, and
  focusing it raced :hover recomputation into focus-drops-to-body in both
  orderings; the shared `restoreDialogFocus` resolves role=menu targets to
  their `aria-haspopup` trigger (tight match, verified against all six
  role=menu sites) and hidden non-menu targets to the nearest visible
  focusable ancestor.

### Fixed — every dialog now fits the window (2026-11 wave 3b, dialog viewport-fit)
- The width caps from wave 3 hid the other axis: modal cards had **no height
  constraint at all**, so tall dialogs overflowed the window on both sides
  and their footer actions were unreachable — measured at 960×600, the
  Plotter dialog (1472px of content) overflowed 436px top and bottom with
  "Send via USB" off-screen, Print Prep overflowed 192px, Tile Print 99px,
  and the seven long menubar dropdown panels overflowed ~100px. Fixed with a
  measured hybrid: the 16 big dialogs got the structural treatment
  (`max-h-[calc(100vh-4rem)]` card, pinned header/footer, scrollable body —
  Plotter/Print/TilePrint/CutContour/Repeat/VariableData/MakeSticker/
  Transform/FreeDistort/ProductionPreview/FreeformGradient/EpsonMaint/
  GangSheet/TraceArt/Shortcuts plus Print's left-column scroll), the ~31
  small cards got a mechanical `max-h + overflow-y-auto` backstop, and the
  menubar panels got `max-h-[calc(100vh-6rem)]`. The three whole-card-scroll
  dialogs (Epson/GangSheet/TraceArt) were upgraded — their footers used to
  scroll out of reach with the content. Guarded by a new data-driven e2e
  (`tests/e2e/dialog-fit.spec.ts`): 47 dialogs × 2 viewports (960×600,
  1366×768) assert the card fits on all four sides, the pinned footer is
  clickable on first paint, and the close control is reachable, plus 9 menu
  panels × 2 viewports assert no bottom overflow. All measured green at
  960×600, 1366×768, and spot-checked 1440×900 / 1920×1080 (no large-window
  regressions from the flex-column restructure).

### Changed — responsive layout: the window can finally be resized sanely (2026-11 wave 3, UI-deep-dive)
- Root causes fixed at the layout-container tier (the canvas itself always
  handled resize — ResizeObserver + zoom-preserving reflow): the desktop
  shells' `minWidth` (Tauri + Electron) moved 900→960 so dragging to the
  minimum no longer collides with the single `max-width: 900px` mobile
  breakpoint (which made the UI flip into mobile mode and jitter at the
  minimum size); the right panel's drag-resize clamp became viewport-aware
  (`min(max, 100vw − 720px canvas reserve)`, plus the same `min(320px, 32vw)`
  mid-band terms as the CSS backstop — a JS/CSS disagreement was a drag dead
  zone) with shrink-only fallback on window resize that leaves the persisted
  preference untouched; `≤1200px` windows cap the panel harder so it never
  dominates a narrow canvas (1024px window → panel 288-304px, canvas ≥660px,
  measured); the `≤900px` slide-over ignores stale inline widths
  (`min(280px, 86vw) !important` — previously a panel dragged to 560px on a
  big screen reopened as a 560px drawer); the canvas `main` keeps a 320px
  floor; the AI panel shrinks (`max-w-[32vw]`); and the 36 fixed-px dialogs
  that lacked a viewport cap got `max-w-[92vw]` so their close buttons stay
  reachable. The menubar strip scrolls horizontally instead of pushing the
  right-hand controls off-screen, dropdown panels re-measure on resize/scroll
  while open (they're `position: fixed` against the scrollable strip), and
  the Save chip no longer wraps to three lines at narrow widths. Verified:
  Playwright layout probe 18/18 across 901-1440px, plus 160 vitest files
  (new `useResizableWidth` regression suite incl. mid-band/dead-zone cases).

### Changed — information architecture: 807 menu entries → 490, context menu 629 → 147, zero commands lost (2026-11 wave 3, UI-deep-dive)
- The menubar grew 6 top menus with 807 discoverable entries (View alone had
  103 — 73% of them measure/proof commands; Edit buried Select Object [217]
  + Select Same [86]; Document had 30 submenus, 4 levels deep). Reorganized
  into the 9-menu layout pro apps converge on — File / Edit / Object / Type
  / Effects / Production / View / Insert / Help: Document's five jobs split
  into Object (arrange/align/appearance/path), Effects (stylize/distort/
  colour dialogs), and Production (plotter/cut prep/nesting/proof — the 82
  measure/proof commands live under Production ▸ Proof); the Select
  monoliths keep only the 10 high-frequency entries in-menus; the 16 export
  formats collapsed into one Export submenu. Context menu reduced to the
  object-context core (clipboard, z-order, group/mask/compound + Pathfinder/
  Align/Transform/Type/stroke/appearance submenus), dropping the submenus
  that duplicated the menubar wholesale (File/Export/Cut prep/Print/Help/
  Select ×2 — including three preset submenus that appeared twice). Zero
  commands lost: every one of the 300 entries removed from menus matches a
  command-palette entry byte-for-byte (audited, `Ctrl+K` reaches them), the
  34 merges are accounted, and the only two context-only commands
  (Darken/Lighten blend modes) were kept. The Tauri native shell menu
  mirrors the new shape (File/Edit/Object/View/Help). New zh entries for
  the new menus (效果/生产/风格化/打样校验); 9 dead zh keys retired.
  Follow-ups recorded in OPTIMIZATION_BACKLOG: unified command registry
  (three entry surfaces still hand-sync their onClicks), a lightweight
  "simplified mode" progressive-disclosure switch, dynamic
  `aria-valuemax` on the panel drag handle.

### Added — Image Trace to editable vector art (2026-11 wave 2, W2)
- **Production → Trace to Vector Art… (moved from Document in the wave-3 IA reorg)**: bitmaps (selected canvas image or
  uploaded PNG/JPEG/WebP) become filled, layer-editable vector art — the
  entry-side capability every competitor ships (Kittl Vectorizer, Linearity
  Auto Trace, SignLab Vectorization Previewer, Illustrator Image Trace) that
  was our highest-value gap. Each k-means colour cluster becomes one fabric
  Path whose subpaths carry all of that cluster's rings under
  `fillRule: evenodd` — holes render as holes with zero ring classification.
  Colour count 2-8, three detail steps, min-size filter, output width,
  per-colour worker progress + live Path2D preview, insert as a named Group
  (members named by hex, layer-panel readable) in one undo step. Known
  limitation documented in tests: the k-means luminance-percentile seeding
  merges small colour clusters at extreme area ratios (k-means++ seeding is
  a backlog item affecting the existing multi-colour trace too).

### Added — segmented drift compensation (2026-11 wave 2, W3)
- **Drift compensation** in the Plotter dialog (machine settings, next to
  overcut/blade-offset): enter the measured offsets of a test cut at the top
  and bottom of the page; every cut point shifts by the y-interpolated
  opposite (per-point, which also cancels the shear distortion drift
  introduces). Registration marks stay fixed (the sensor's reference frame)
  and don't widen the interpolation domain. Applied at the single
  cut-paths→polylines seam so send / save / layered per-colour jobs / code
  view all compensate identically while test cuts (the measurement tool)
  route around it. Live top/middle/bottom correction preview, ±20 mm band,
  persisted with plotter prefs, "active" chip in the Ready-to-output summary.
  Sign convention pinned by 19 lib tests + 4 output-seam tests on
  hand-computable geometry. No consumer cutting tool ships per-region drift
  correction — top-true/bottom-drifted is the #1 print&cut complaint class.

### Changed — imageHandoff variant family pruned (2026-11 wave 2, W1)
- **−5,576 lines** of confirmed self-generated make-work: 212 exports → 9
  (all 106 ActiveArtboard twins, ~36 report families × 3 formats, 9 CI
  workflow generators deleted; the real core kept — Report / Tsv / Json /
  SourceManifest / Collect script + PowerShell / Verify script / Package
  Checklist + Blockers). Menu 212 → 9 items, palette 212 → 9 commands,
  203 orphaned zh keys dropped. Precedent: the certificate-chain prune
  (33ee5f9 / 9d34fa5).

### Added — materials import hardening (2026-11 wave 2, W5)
- Importing the same shared file twice now counts content-duplicate cards
  (label + feed/force/speed/overcut/mirror fingerprint) instead of stacking
  duplicates; version > 1 envelopes flag a newer-version warning; user cards
  carry optional `accelMmS2` / `headUpS` (banded, clamped, inherited from
  the active material on save) so the physics cut-time estimate no longer
  silently degrades. The 6 long-standing `it.todo` tests (clip masks,
  compound paths, inside stroke alignment) landed against the real
  contracts — zero source changes needed.

### Added — Gang Sheet Builder (2026-11 wave)
- **File → Gang Sheet Builder…**: batch-drop PNG/JPEG/WebP files, nest them
  onto a fixed-width DTF/UV-DTF roll, export one production PNG — the
  workflow free tools (DTFBuild) and $1000-class sign suites (Flexi) sell as
  their whole product, on top of the engines this app already ships. Engine
  routing per job: all-rect jobs → `nestRects` (no part cap), masked jobs →
  `nestPolygonsRaster` true-shape nesting (60-part cap surfaced in-UI),
  masked + rotation-off → `nestPolygons`. Per-file quantity steppers,
  alpha≥128 downsampled hull for true-shape nesting, roll-width presets
  (13/22/24 in, A4/A3, custom), gap/DPI/90°-rotation controls, live preview
  with utilization %, unfit reasons (`too-wide` / `too-tall` / `engine-cap`),
  64-megapixel composition budget with proportional downscale, and an exact-mm
  PNG export honoring the packer's rotation mapping. Lazy-loaded as its own
  chunk; File-menu + command-palette entries; 22 unit tests.
- Research digest: `docs/research-competitive-2026-11.md` — 11-competitor gap
  analysis with evidence, seller pain points, and the shipped-vs-backlog
  decision record (image trace, segmented drift compensation,
  AI-generate-then-cut on the backlog).

### Added — user materials library (2026-11 wave)
- **Save / apply / delete material cards + JSON share** (LightBurn-parity):
  the Plotter dialog's material section now captures the live feed rate / force
  / speed / overcut / mirror into a named user card (`Save as material`), lists
  user cards alongside the 9 read-only built-ins with a badge, deletes them
  behind a confirmation, and exports/imports the library as a versioned JSON
  envelope (`{schema:'anchorworks-materials', version:1}`) for community
  sharing — LightBurn's `.lbvendor` distribution model on a free tool. Import
  is lenient (envelope or bare array, per-row validation, bad rows skipped and
  counted, conflicting ids regenerated, never throws). 23 unit tests.

### Fixed — data-safety feedback (2026-11 wave)
Five read-audit findings where protective features failed invisibly:
- **Autosave quota failures now speak**: `localStorage` full used to silently
  disable every snapshot from then on. Failures record to the error log every
  time and toast once per session (latch) that recent changes are not being
  saved (quota called out when detectable, neutral wording otherwise). 10
  red→green tests.
- Artboard persistence failures (refresh would lose artboards) get the same
  treatment — in-memory artboards keep working.
- Cut-contour geometry degradation (polygon-clipping union failure falling
  back to the raw ring) warns and records — this geometry feeds a physical
  cutter.
- AI context capture failures (vision snapshot / SVG markup) record to the
  error log AND annotate the request so the model knows it is answering blind;
  a malformed data-URL path that sent `data: undefined` is folded into the
  same failure handling.
- Embed Linked Images now distinguishes failure from "nothing to embed":
  new `embedLinkedImageObjectsDetailed()` / `...ActiveArtboard...Detailed()`
  return `{embedded, failed}` (three-state per-object outcome; legacy number
  API stays as a thin wrapper); MenuBar + Command Palette warn
  "N failed (cross-origin or serialization failure)" instead of misleading
  "no embeddable objects".
- New public `recordLibError(source, error)` in the error log (reuses the
  200-entry ring buffer + 60s dedup).

### Fixed — independent-review follow-ups (same wave)
- **User-materials storage failures no longer fake success**: save / delete /
  import all surface `localStorage` write failures (`toast.warn` + error log)
  instead of toasting success over a card that never persisted — the exact
  silent-failure class this wave set out to kill, caught by independent
  review on the feature that introduced it.
- User cards can no longer shadow built-in preset ids: ids colliding with
  `MATERIAL_PRESETS` are regenerated at load, import, and add time (a shadowed
  id applied the BUILT-IN force/speed when clicked — a physical-output
  mismatch); duplicate stored ids are re-ided instead of silently dropped
  (import parity).

### Security
- **Tauri shell CSP** (was `null`): `script-src 'self'` (Tauri appends its
  injection nonces), `object-src 'none'`, `base-uri`/`form-action 'self'`;
  fonts.googleapis.com / rsms.me style+font allowlist. `img-src` keeps `https:`
  (linked https images are a supported feature) and `connect-src` keeps plain
  `http:` — LAN MCP servers (`http://192.168.x.x`) are a considered use case,
  and `https:` was already open so blocking plain-http added no meaningful
  exfil protection beyond `script-src 'self'` itself. `cargo check` clean.

## [0.18.0] — 2026-11-01

### Changed — dependency refresh (2026-10-30)
- **fabric 6.9.1 → 7.4.0** (fixes GHSA-hfvx-25r5-qc3w / GHSA-w22m-hvvm-xmwx — Stored XSS via SVG export and Gradient colorStops escaping; v6 will never receive these fixes). fabric 7's one real breaking change ([#10715](https://github.com/fabricjs/fabric.js/pull/10715): default `originX`/`originY` flipped `left/top` → `center/center`) is neutralized by `src/lib/fabricDefaults.ts`, which restores the v6 defaults for every construction path (tools, import, `loadFromJSON` of v6-era projects). Source fixes: `findTarget()` now returns full target info (`eyedropperTool` reads `.target`), `fontStyle` narrowed to fabric's `FontStyle` union (`textPath`).
- **pdfjs-dist 5.7.284 → 6.4.299** (fixes GHSA-hq66-cqwq-w95j — arbitrary JavaScript execution when opening a malicious PDF). Only `pdfImporter.ts` touches pdfjs; verified by a jsPDF-generated PDF → `getOperatorList()` smoke (all consumed OPS codes present, 6 entries extracted) plus the emitted worker asset in the build.
- **vitest 3.2.4 → 5.0.5** (+ `@vitest/coverage-v8`), clearing the tinypool prototype-pollution/RCE advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) and the vitest mocker advisory.
- In-range refresh of the rest: React 19.3.1, Tauri JS plugins (updater 2.14.1 / shell 2.6.0 / process 2.4.0), `@tauri-apps/cli` 2.12.4, vite 8.3.5, playwright 1.64.1, lucide-react 1.64.0, svg2pdf.js 2.9.0, zustand 5.0.16, eslint 10.13.0, typescript-eslint 8.72.1, and dev-types. Lucide's renamed icon classes/aliases (`lucide-trash2`→`lucide-trash`, new legacy aliases on lock-open/sparkles/wand-sparkles/code-xml) and redesigned pen-tool/zap glyphs are re-frozen in the byte-exact migration-guard snapshots.
- **vite-plugin-pwa 1.3.0 → 2.0.0** (vite 8 compatible).
- **Declared previously-undeclared script dependencies**: electron 45, electron-builder 26, concurrently, wait-on, cross-env — `dev:electron` / `electron:build` were unrunnable on a clean install.
- Rust side: `cargo update` across the Tauri tree (tauri 2.12.x, serde, etc.); `cargo check` clean.
- Security posture: 26 npm advisories (5 critical / 12 high) → 4 low, all in `vite-plugin-pwa → workbox-build → deepmerge` (build-time only; no fixed release exists yet — deepmerge 4.3.1 is already the latest).

### Changed — toolchain completion (2026-10-31)
- **Tailwind CSS 3.4 → 4.3** via the official upgrade tool + manual hardening: config collapsed into `@theme` CSS (fonts, radius tokens) with the 13 theme colours as `@theme inline` full-colour vars (`--color-ink: var(--ink)` — different names are required; same-name entries make Tailwind drop opacity modifiers), runtime vars converted from `R G B` triplets to `rgb(R G B)` values, all direct `rgb(var(--color-x))` references unwrapped (131), alpha uses compiled to color-mix. PostCSS pipeline slimmed to `@tailwindcss/postcss` (autoprefixer is built into v4). Class renames (ring→ring-3, shadow→shadow-sm, blur-sm→blur-xs, outline-none→outline-hidden, flex-shrink→shrink) applied across 150 files; bare `rounded` keeps resolving to the 6px token. The upgrade tool's over-reach (renaming data-contract strings `'outline'`, `selectSame('shadow')`, the `'blur'` DOM event, filter types, i18n keys — 68 files) was reverted by codemod. Verified: compiled CSS emission, computed styles in-browser, and a same-pipeline headless pixel-diff against a v3 build (3.7–7.6% differing pixels, concentrated in toolbar icons — accepted lucide 1.64 glyph redesigns + v4's softer shadow scale; 1196 chrome buttons contrast-audited clean, overflow pattern identical to v3).
- **@vitejs/plugin-react 6.0.2 → 6.1.2** — unblocked with a scoped `overrides` pinning `@rolldown/plugin-babel`'s optional `@babel/plugin-transform-runtime` peer to the v7 line (eslint-plugin-react-hooks + workbox-build hold `@babel/core@7`; the babel path is never used — oxc transforms).
- **jsdom 27 → 30** (test environment only).
- **CI Node 20 → 22** in build.yml/release.yml (Node 20 reached end-of-maintenance in April 2026).
- **a11y: axe-core 4.11 → 4.14 fallout fixed** — Help Center section headings h4→h3 (139 sites via the `H` helper, fixes `heading-order` skips under the dialog's h2), the left Tools toolbar and the aside resize handle wrapped in named `display:contents` sections (fixes `region` — content outside landmarks). `label-content-name-mismatch` (promoted to serious in 4.14) and `page-has-heading-one` are explicitly disabled with rationale + TODO: the compact-abbreviation-plus-full-aria-label pattern is deliberate for this dense tool UI, and a page h1 would cascade every panel heading level.
- **Rust**: `build_app_menu` and the tauri menu imports are now `#[cfg(target_os = "macos")]` — the Windows build no longer warns dead_code; `cargo check` fully clean.
- **TypeScript stays on 6.0.x deliberately**: TS 7 (the native Go port, GA July 2026) ships no programmatic API, so typescript-eslint support is still incomplete (tracked in their issue #12518) and `tsc -b` tooling is in flux. Revisit once typescript-eslint announces TS7 support; a separate experiment could benchmark tsgo for typecheck-only speedups.

Gates: 2386 unit tests, tsc --strict, eslint, vite build, cargo check, e2e 56/56 (previous 9-flaky suite is now fully deterministic — the flakiness was axe 4.14's rule promotion surfacing as intermittent failures).

### Changed — CI hardening + performance verification (2026-10-31, round 2)
- **axe Label-in-Name sweep — the rule is now enforced, not disabled**: every aria-label that pairs with a compact visible code embeds it. Because axe 4.14's `curateTokens` strips parenthesised fragments from the accessible name before matching, "(abbrev)" suffixes can't satisfy the rule — the labels use em-dash joins ("Shape Builder — Shift+M", "Reg — Add positioning marks") or exact word forms ("Anchorworks Version v0.17.0" contains the visible "v0.17.0"). Command palette options dropped their explicit aria-label so the accessible name computes from the visible row content (always congruent, voice-control friendly). All five a11y surfaces scan clean with `label-content-name-mismatch` re-enabled; `page-has-heading-one` remains the sole disabled rule (documented design decision). Six e2e specs' exact-name tool selectors and one frozen DOM snapshot updated to match.
- **CI now gates behaviour, not just compilation**: new `test` job in build.yml runs the full vitest suite (2,386 tests) plus the Playwright e2e suite on ubuntu, with the chromium browser cached by lockfile hash. Previously the 2,386 unit tests and 56 e2e specs ran only on dev machines — a red suite never blocked a green build.
- **Native CI job verified end-to-end locally**: `npm run build:native` on Windows completes the Rust release build (2m16s) and produces both installers (MSI 7.3 MB, NSIS 5.54 MB); the only local exit-1 is the updater-signing step, which needs the `TAURI_SIGNING_PRIVATE_KEY` secret that exists only in CI.
- **Performance audit on the final bundle** (documented in OPTIMIZATION_BACKLOG): eager first-paint chain is 988 kB raw / 300 kB gzip across 13 chunks; every heavyweight (pdf.worker 420 kB, jspdf 390 kB, CommandPalette 366 kB, fontkit 348 kB, MenuBar 246 kB, i18n-zh 228 kB) stays lazy — the earlier slim-down work survived the fabric 7 / lucide 1.64 / tailwind 4 upgrades intact. `pool: 'vmThreads'` for vitest was tried and rejected (15 shared-state failures, no wall-clock gain — per-file jsdom isolation is load-bearing). Stale chunk-size comment in vite.config.ts refreshed with current numbers.
- Backlog: axe Label-in-Name sweep (~90 nodes, centralised in Toolbar/MenuBar/StatusBar) filed as the next a11y candidate.

## [0.17.0] — 2026-10-29

### Added (wave 8)
- **Mixed-sheet imposition**: Production Preview now partitions a multi-object selection into per-object items (2–12 objects — each with its own contour via sourceObjectId, its own bleed raster, packed together in one true-shape layout; copies apply per item). Single-object runs are byte-identical; >12 objects fall back to one union item.
- **Direct sheet output**: Save PNG (the composed sheet as a dated file) and Print (printImageAtSize — @page at exact sheet size, margin 0, web iframe + Tauri native transports) straight from the Production Preview footer — no canvas roundtrip.

### Added (wave 7)
- Help Center coverage for the whole suite: 12 new topics (8 in a new "Stickers & cutting" category + 4 in "Plotter & cutter"), every number mined from the live dialogs/libs; titles and search keywords fully bilingual (89 topics total).
- e2e regression net for the flagship dialogs: makesticker / surfacewrap / productionpreview specs (7 tests) — guard toasts, preset roving, Apply end-to-end incl. undo of cut-path changes, lazy-chunk loads; suite now 56 specs.

### Added (wave 6)
- **Data-Link network handoff (TCP 9100)**: four Tauri Rust commands (tcp_connect/write/read/close — cargo-check clean) + a pure protocol library (ESC.d1–d6 framing, job-list/selection/registration-vector parsing, byte-pinned against open-graphtec-server protocol.py) + a Data-Link section in the Plotter dialog (host/port/job name with live validation, handshake log, Tauri-only gating). Hardware validation on a real networked cutter remains the open item.
- **Part-in-hole nesting**: RasterNestItem.holes — a frame with a cut-out nests smaller parts inside its hole (occupancy grid marks holes free; the EDT fit test keeps the gap from the hole walls automatically).
- Pinch localization for ≥3-lobe thin features now scans all lobe pairs (≤10 lobes) so the flag lands on the true bottleneck.

### Changed (wave 6)
- rasterNest lazy-loads behind its one-click action (−1 kB gzip warm graph; the entry was already clean — honest numbers in the wave log).

Eight research-grounded waves (vendor specs + hardware-validated open-source cutter stacks; full findings and spec tables in docs/research-sticker-printcut-2026-10.md). All gates green at release: 2386 unit tests, tsc --strict, eslint, vite build, cargo check, 56 e2e specs.

### Added
- **Make Sticker (Ctrl+Alt+K)** — the Sticker Mule / Cricut "Create Sticker" / Silhouette Offset-panel workflow as one command: weld the selection, round-join offset border (2.54 mm default), white/custom underlay behind the art, and a die-cut / kiss-cut / perf-border contour (own overlay colours, project persistence, through→kiss→perf ordering at the plotter, PerfCutContour export naming).
- **Surface Wrap generator** (Document → Surface Wrap…): cylinder (π·D × H), cone/frustum annular sector (R = L·D/(D−d), θ = 360°·(D−d)/(2L)), and sphere-gore patterns from container dimensions, with starter presets.
- **Three sticker templates**: kiss-cut sheet with safe areas + perf border, laptop decal with 2.54 mm border ring, tumbler wrap sized from a real cone sector.
- **Round-join offsets**: offsetPolyline join:round (tessellated outer arcs) — the pro-workflow join for sticker contours; miter default unchanged.
- **Print-side vendor registration marks**: Graphtec ARMS Type-2 (20 mm / 0.7 mm corner L-brackets, matching the TB52,2 reader), Silhouette (10 / 0.25), Roland (25 / 0.5) with arm/stroke overrides, a printable 50 × 9 mm scale-check block, and a print-at-100% warning — print marks and the cutter reader now share one geometry source.
- **ARMS emit for Graphtec cutters**: the Graphtec dialect wraps the job in the hardware-validated TB99/TB51/TB52/TB54/TB55/TB24…TB0 registration block (ETX-terminated, 0.1 mm steps, mark rectangle auto-filled from the job bbox).
- **Blade-offset compensation (drag knives)**: applyBladeOffset inserts Siser-validated corner loops (overshoot + bowed return, ≥15° turns, close-corner merging, seam to the longest edge) with 0 / 0.25 / 0.5 mm presets — sharp corners on every cutter including clones.
- **CutContour spot-colour export**: SVG / PDF "with cut layer" append the cut paths as a magenta hairline layer (CutContour / PerfCutContour, data-cut-kind) — the VersaWorks / RasterLink7 convention; the PDF variant additionally tags ISO 19593-1 processing-step OCGs (Structural / Cutting / PartialCutting, viewer-hidden by default, pdfjs round-trip verified).
- **Material library**: glitter-HTV (170 gf, 2 passes, 60° blade), Oracal 651, printable vinyl added; HTV corrected to 85 gf/45°; all presets carry accel/head-up physics constants; cards show blade angle / passes and apply default overcut.
- **Weedability preflight (排废检查)** — no cutter tool on the market lints this: thin features (EDT medial-axis width with a fail-closed quantization band — pinch necks caught), narrow inter-path gaps, small islands (letter counters), per material profile (vinyl / HTV / glitter / sticker paper), in a collapsible Plotter-dialog panel.
- **Auto-bleed (Cricut-style)**: ring-draw edge smear (0–5 mm) rasterized beneath the underlay in Make Sticker, an HQ nearest-colour mode (labelled-chamfer dilation), and — in Production Preview — masking to the cut lines (smear only where the blade cuts).
- **Layered-vinyl jobs (多层贴花)**: per-colour layers (largest = bottom) whose jobs automatically carry the shared registration marks; per-layer Send/Save (+ HP-GL and DXF variants, staggered save-all), per-layer mirror, send-all with vinyl-swap confirmations, +0.5 mm layer trap with a dry-run preview, and ~0.5 mm alignment-tolerance guidance.
- **True-shape nesting**: convex-hull skyline (nestPolygons) plus a raster occupancy-grid packer (nestPolygonsRaster — interleaves concave parts the hull packer cannot) as one-click cut-path layouts with utilization reporting.
- **Physics time estimate**: estimateJobSeconds with trapezoidal profiles, chained junction speeds, and CutTime radius→speed corner caps (curvature from polyline triples); shown as a second "≈ (physics)" estimate, with the animated replay total following it.
- **Production Preview (生产预览)**: live imposed-sheet preview (sheet presets, gap, copies, baked bleed, cut overlay, regmarks, utilization) with a one-step undoable Apply that inserts the sheet at 1:1 and swaps in the per-copy cut paths.
- **Graphtec Data-Link barcode band (print side)**: full CODE39 encoder (mod-43 check, 0.5 mm narrow / 2.5× wide, 9 mm band 20 mm from the media leading edge, 50×9 mm Start Mark, 7 mm quiet zones, media-space placement) + Print Prep toggle with link-info validation. The network job handoff (TCP 9100) remains open — see the research doc.

### Changed
- Cut-time estimates count compensations: overcut retrace and blade-offset loops enter the stats, and the classic estimate adds the corner-swing term (pre-adjustment corner counts).
- MATERIAL_PRESETS fully populated with physics constants (sign vinyl 1500 mm/s² / 0.15 s head-up … cardstock 800 / 0.35).
- applyLayerTrap gained a dryRun mode (shared detection engine) powering the preview line.

### Fixed
- Project files persist kiss/perf cut kinds (schema + loader widened — previously silently dropped on load).
- 230+ new zh dictionary entries across the suite (fully bilingual).

## [0.16.0] — 2026-10-09

- **Error recording, copying, and one-click reporting**: a global error net now catches `window.onerror`, `unhandledrejection`, error toasts, and React render crashes into a 200-entry ring buffer (consecutive repeats fold into a count). Help → Error Log… opens a viewer with the environment summary (version · shell · OS · viewport), expandable stacks, **Copy all / Download .txt / Report on GitHub / Clear** — the report button prefills a GitHub issue (recent errors + env, with a redact-anything-private footer; opens externally via the shell plugin under Tauri). A React `ErrorBoundary` replaces the blank white screen with a recovery card (Reload / Copy details / Report / Open error log); the Debug Panel gains **Simulate error** and **Open error log** buttons. 15 unit tests cover the ring buffer, dedupe, formatting, and issue-URL building.
- **Native export under the Tauri shell (macOS/Linux)**: `<a download>` exports (SVG/PNG/JPG/JSON/DXF/PDF) silently did nothing in WKWebView/WebKitGTK because wry registers no download handler — `download()`/`downloadDataURL()`/jsPDF now route through a new `fs_save_bytes` Rust command (OS save dialog with per-extension filters, cancel is not an error; a generic `print_native`-style transport keeps the web path byte-identical). 16 unit tests pin the branch selection and dataURL decoding.
- **Native print under the Tauri shell**: `print_native` existed in Rust but nothing called it — JS `window.print()` in an embedded WKWebView/WebKitGTK is exactly where printing silently fails. All three print paths (canvas print, multi-page PDF, tile print) now share `printHtmlDocument()`, which injects the payload into a print-only container (screen-hidden, `@media print` isolates it from the app UI, `@page` preserved), prints via wry's real PrintOperation, and cleans up on `afterprint` (500 ms settle fallback + 5-minute failsafe). The hidden-iframe web transport keeps byte-identical markup, with the image-heavy paths keeping their 8-second survival window.
- **Window state persistence**: the Tauri shell remembers size/position/maximized across launches (`tauri-plugin-window-state`); the Electron shell does the same via a defensive `window-state.json` (corrupt JSON / fully off-screen rects fall back to the 1440×900 default). The in-app updater toast gains **Skip this version** (toast actions now support an array); a manual Check for Updates always re-prompts. The Electron shell is now detectable (`isElectron()`) and its update message no longer claims PWA-style auto-updates.
- **PWA install completion**: real PNG icons (192/512/apple-touch-icon 180/maskable 512 with the artwork inset to the safe circle — generated by `scripts/generate-icons.mjs`, a Playwright-based rasterizer), a conditional **Install Anchorworks…** entry in the Help menu + command palette (visible only when the browser fired `beforeinstallprompt`), `fonts.gstatic.com` added to the offline runtime cache (Google fonts no longer silently fall back offline), and the declared-but-unhandled `window-controls-overlay` display override removed (it would have overlapped OS window controls on the DOM menu bar).
- **Bilingual help search**: all 77 Help Center topics' keywords now translate (Chinese search terms like 打印/刻字/保存 hit), 11 topic titles that missed `t()` are translated, and the PWA/offline doc is corrected (the offline banner pins bottom-left, `navigator.onLine` not `navigator.online`). The empty-canvas hint lists every droppable format (SVG/PDF/PLT/JSON project/PNG-JPG-WebP-GIF) + F1; the onboarding dialog no longer overflows narrow screens and mentions the desktop-install entry; QuickHelp shortcut chips now read the live keymap instead of hardcoded strings.

### Fixed
- **Window resize no longer resets your view**: every layout change (OS window resize, sidebar drag, panel toggle) used to call `zoomFit()`, stomping the user's zoom/pan. Resizes now re-anchor the previously-centred scene point at the new centre (zoom untouched; `computeResizeViewportTransform` is a pure tested function, and the re-anchor uses the canvas's live extent so interleaved `resizeCanvas` calls can't skew it). First mount still fits.
- **Display-scale changes stay crisp**: a `matchMedia('(resolution: …dppx)')` watcher reflows the canvas when the window crosses monitors with different DPI or the OS scale changes (fabric re-reads `devicePixelRatio` on every `setDimensions`, rebuilding the retina buffer), and all six overlay canvases (rulers, grid, artboards, guides, cut paths, measure) now read the ratio at draw time and reallocate their backing stores on a change instead of repainting at a stale density.
- **Insecure-context clipboard crashes**: `navigator.clipboard` is `undefined` on http://LAN-IP deployments, and bare `void navigator.clipboard.writeText(...).catch(...)` patterns throw synchronously — MenuBar, CommandPalette, PlotterConsole, and VariableDataDialog now guard the access (fallback toast instead of a dead button). New e2e: `resize.spec.ts` pins that resizing keeps the zoom reading.

### Known gaps (follow-ups)
- Tauri native export/print transports are verified by unit tests + wry source analysis; the OS-dialog end-to-end needs a real macOS/Linux shell run. Very large (>20 MB) exports pay a 3-4× IPC JSON-array overhead (upgrade path: raw IPC bodies).
- The Electron build has no file-open forwarding (the frontend's only open-file channel is Tauri-IPC-specific) and Windows treats `.awk.json` as plain `.json` for double-click routing — the NSIS `fileAssociations` registration is cosmetic until a shared channel exists.
- Help Center topic *bodies* remain English by design; only titles/keywords are bilingual so far.

## [0.15.0] — 2026-10-05

- **Glyph-level Text-to-Outlines (slice 1 — custom fonts)**: uploaded fonts now outline to true bezier curves instead of the raster trace, wherever the exact face the canvas paints can be proven (real bold/italic faces resolve; anything the browser would synthesize — faux bold, faux italic — falls back to the tracer, which stays faithful to the paint). Placement replays fabric's own layout caches so glyph positions match the rendered text; fontkit loads lazily in its own precached 356 kB chunk. Slice 2 (Google-font byte fetching) to follow.

### Fixed
- **i18n silent-failure class closed**: 12 zhDict keys realigned to their components' exact byte form (two genuinely failed lookup at runtime), 38 dead keys swept under a three-level liveness check that correctly rescued 11 dynamically-built keys, plotter quick-command descriptions now translate, and two mutation-verified guards make the byte-drift failure class unlandable.

### Removed
- **The self-generated "certificate chain"** — 75 families / 450 exported functions of image-handoff paperwork that a runaway improvement loop manufactured against itself in June (post-reseal remediation plans, records-destruction certificates, custody ledgers… every one a zero-input derivation with empty signature fields, existing only as clipboard strings about other documents). The real Links-package capability — collect/verify/digest/audit/release-gate/delivery-receipt/SBOM and the print-production chain — is untouched (independently re-adjudicated family by family). `imageHandoff.ts` drops from 1.15 MB / 662 exports to 254 kB / 212; 450 menu items and palette commands disappear; the three lazy chunks shed ~540 kB combined. 444 dead zhDict keys swept with it, and the closed PARITY/TODO backlogs moved to `docs/history/` so no future loop mistakes them for live work.

- **First-paint: PropertiesPanel subtree defers behind a skeleton** — the right rail's top section lazy-loads (immediate import, same-shape skeleton), taking CharacterPanel/FontPicker/contrast/ColorPicker and the swatch/style libraries with it: entry 375.5 → **284.0 kB raw / 81.2 kB gzip** (session total: 956.3 → 284.0 raw, −70%).

## [0.14.0] — 2026-10-04

- **Long-tail polish wave**: MenuBar — 53% of the entry chunk — now lazy-loads behind a pixel-matched same-height skeleton, taking the blend/envelope/printMarks families with it (**entry 956.3 kB raw / 177.1 kB gzip → 375.5 / 101.1 kB, −60.7% / −42.9% this session**; the >750 kB chunk warning is gone). The Firefox question is closed with evidence: the full e2e suite runs green there, and a two-browser probe proved the suspected roving fallback divergence is unreachable for real keyboard input in either browser — plus a `RUN_FIREFOX=1`-gated Playwright project for future runs. `objectCaching` gets its documented trade-off and an escape hatch: a Preferences → Editor control (`off` default / `on at ≥4× zoom`) with memo-throttled per-threshold walks and a proven side-effect-free default path.
- **Build hygiene: zero dynamic-import warnings + `strict` TypeScript**: io3 (the last statically-pinned lazy module — image import/paste/trace/asset registry/drag-drop) now loads through cached-dynamic loaders in App/CanvasView/AssetsPanel/MenuBar, taking the eager entry to **844.7 kB raw / 140.3 kB gzip (−36.8 kB gzip, −20.8% over this session's start)** with **zero INEFFECTIVE_DYNAMIC_IMPORT warnings**; drag-drop listeners attach the moment the chunk lands with StrictMode-safe cleanup. `strict: true` is now enforced in both tsconfigs — the whole tree already passed (measured with CLI overrides and a planted-violation probe before flipping), so the safety net went from coincidental to guaranteed at zero churn. Nine more e2e specs land with it: PrintDialog's first-ever coverage (presets, orientation/summary wiring, print-prep handshake — never actually prints), Templates search/category filters with empty states, and Find & Replace match-case + recipes driving real replacements.
- **Kit tail pass + e2e regression net**: the a11y kit gained `aria-busy` passthrough, a `fallbackIndex` option (reproducing the one roving container in the codebase whose asymmetric fallback is actually reachable — the Symbols naming toolbar with its auto-focused input), and a standalone `ActionButton` primitive; AIPanel's busy buttons and the naming toolbar are now on the kit, retiring the last legacy roving handlers anywhere. Three new e2e specs protect what unit tests can't: undo/redo flows (History button disabled states mirror the stack), Templates' 2-D grid keyboard navigation + external live region, and Find & Replace's match counting / Replace All (verified by re-querying the dialog).
- **P0-4 complete — every panel rides the dialog kit**: PropertiesPanel's eight roving handler families (one hid a React 19 crash — the transformUnit handler read the nulled `event.currentTarget` inside rAF, so arrow focus never actually moved), the Assets/Symbols 2-D grids, Artboards' vertical list, Character/Align/StatusBar, Debug/AI and LayersPanel's 146-button search toolbar all moved onto the shared kit behind frozen-DOM and keyboard-snapshot tests; the kit's gap B (`PresetItem.radio` → role="radio"/aria-checked) retrofitted the Transform/ShearDialog radiogroups byte-identically. Deliberate keeps and known (unreachable-in-Chromium) kit divergences are documented in OPTIMIZATION_BACKLOG.
- **Dialog kit completion + the six heavy settings dialogs**: the shared a11y kit (`useRovingKeys` family) gained `disabled`/`aria-label` passthrough, vertical roving (`axis`), 2-D grid navigation (`makeGridKeys`, byte-aligned with the shipped template-grid key contract), and external/compound status regions. Find & Replace, Document Settings, Separations, Preferences, Templates, and Variable Data (the hardest — 9 roving zones) now ride the kit instead of hand-rolled handlers, each migration locked by frozen-DOM and keyboard-behavior snapshot tests (−308 net lines; Preferences' axe + behavior e2e stayed green throughout). Also new: a document-size performance budget test (2,000-object `History.capture()` / restore medians guarded at ~10× headroom) and `recentFiles` left the entry chunk.
- **First-paint: plotter family out of the entry chunk**: the status bar now lazy-mounts the plotter chip behind a pixel-matched skeleton (250 ms), moving the HP-GL debug/link/diagnostics libraries and the chip (~93.5 kB of sources) out of the eager bundle. Two shared-helper dedupes ride along: `toHex` lives once in `lib/hex.ts` (re-exported by the Epson workbench and the plotter link) and `ArtboardLayer` reads CSS tokens through `lib/tokens.ts` like its siblings.
- **First-paint: entry-chunk unpinning pass**: format registration now resolves its heavy deps (plotter/HP-GL, cut optimization, PLT/PDF importers, io2/printPrep/svgImport ≈ 112 kB) inside the export/import closures — the registry stays synchronous (metadata readable at module-eval, verified by a new formatRegistration test tier); the measure tool left the entry via a `measureState.ts` micro-split that keeps its mouse callbacks synchronous; project save/open and the native-menu listener became cached dynamic imports. Four `INEFFECTIVE_DYNAMIC_IMPORT` warnings cleared (io3 remains, deliberately — it needs the MenuBar slimming pass). Entry chunk this session: **956.3 kB raw / 177.1 kB gzip → 858.3 / 142.6 kB (−19.5% gzip)**.
- **SNMP network transport for the Epson maintenance dialog**: network-attached Epsons are now reachable without the spooler — EPSON-CTRL frames ride SNMP v1 GETs (UDP 161, community "public") as arcs under the Seiko-Epson enterprise OID 1.3.6.1.4.1.1248.1.2.2.44.1.1.2.1, the same path epson_print_conf uses. The BER codec is hand-rolled in Rust (no dependencies) and covered by golden-byte tests plus a loopback UDP round-trip test; the dialog auto-fills the printer IP from the spooler port name (`IP_192.168.1.50` → `192.168.1.50`). Works on every platform — it is plain UDP.
- **Cartridge chip / firmware / device-ID queries**: three new maintenance actions — "ii" cartridge chip readout (colour, chip ink quantity, production date, chip serial), "vi" firmware version with build-date decoding, and "di" IEEE-1284 device ID — plus a scan-all-slots flow that walks slots 1–8 and stops at the first empty one. The readout card renders every populated slot.
- **Honest SNMP routing in the UI**: actions that are plain EPSON-CTRL frames (ST2 status, ii/vi/di) switch to the network path automatically, shown in the TX log; local-only actions (REMOTE1 cleaning, D4 handshake, @EJL probe, test print, custom hex) are disabled with a reason tooltip instead of silently falling back to the spooler.

### Fixed
- **SNMP OID encoder continuation-bit inversion** (never shipped): arcs ≥ 128 encoded the 0x80 continuation bit on the wrong byte, so every real request — including the enterprise prefix 1248 — was malformed on the wire. Caught by finally compiling and running the golden-byte test after a stale toolchain cache masked it.
- **SNMP reply parser walked the wrong BER level** (never shipped): the varbind value was sliced out of the OID content instead of its sibling position, so even a correct request could never return the printer's answer. Rewritten with a strict sibling-walk parser (never panics on malformed replies) and unit-tested against exhaustive truncation prefixes.
- **`parseCartridgeReplies` slot numbering shifted by leading NUL**: replies open with a NUL byte (same wire shape as @BDC ST2) that `trim()` keeps, consuming slot 1 for the preamble; multi-slot streams now number from 1 regardless.

- The high-level Epson flows (`epsonReadWaste`, `epsonResetWastePermanent`/`Temporary`, `epsonReadStats`, `epsonDumpEeprom`, `epsonRestoreBackup`) now take one options object (`{ log, transport, host }`) instead of trailing positional parameters; the Epson prefs record gains an optional `host` field.

## [0.13.0] — 2026-09-28

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

- **Production workflow parity**: expanded SignMaster/FlexiSign-style command surfaces across menus, command palette, context menus, and layer/search workflows for artboards, blends, masks, path effects, selection cleanup, symbols, measurement, snapping, and cutter-prep operations.
- **Vector cleanup coverage**: added focused utilities and tests for layer operations, artboards, blends, brush presets, global swatches, graphic styles, knife/scissors cuts, path smoothing, print marks, recolor sorting, variable-width strokes, viewport operations, and related selection tools.

- **Release metadata**: synchronized npm, Tauri, Cargo, and lockfile package versions for the 0.12.1 release.

## [0.12.0] — 2026-06-05

- **Desktop plotter USB picker**: the Send to Plotter dialog now lists OS serial ports in the Tauri desktop app, lets operators refresh/select the cutter USB port, and uses that selection for Test cut and Send via USB instead of relying on ambiguous auto-detection.
- **Workflow parity polish**: added more keyboard-browsable dialog actions, preset review status, and reset baselines across production dialogs so sign, print, and path-editing workflows are safer to explore before applying.
- **Roughen reset**: the Roughen effect now exposes a footer Reset action that restores the default 1 mm Size and 3 mm Detail while clearing stale recipe review status.
- **Preferences reset**: Preferences now includes a footer Reset action that restores the draft captured when the dialog opened and clears stale search / recipe review state before applying or saving.
- **Find & Replace reset**: the global text cleanup dialog now adds a footer Reset action that clears Find / Replace, Match case, stale recipe review, and returns focus to Find.
- **Keyboard Shortcuts footer**: the shortcut cheat-sheet now adds a keyboard-browsable Close action beside Customize Shortcuts so users can exit or rebind without reaching for the title-bar close button.
- **Document-menu bridge parity**: Document now mirrors File, command-palette, and right-click bridge presets plus Clear bridges cleanup for cutter-prep workflows.
- **Topbar bridge cleanup**: the output toolbar now places Clear bridges beside the one-click Standard bridge action for faster bridge/revert cutter-prep trials.
- **Status-bar cut cleanup**: the pink cut-count shortcut now supports Ctrl/Cmd-click to clear cut paths directly, while click and Shift/Alt-click still open Plotter and Cut Contour.

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

- **One-click contour**: right-click a selection → *Create Contour* drops a
  default 2 mm offset cut line with no dialog. The dialog stays for tuning.
- **Print preview**: the Print dialog now shows a live WYSIWYG preview — page,
  margins, artwork fit, and any crop/registration marks — matching exactly what
  `printer.ts` outputs.
- **Plotter preview without cut paths**: *Send to Plotter* now previews the
  geometry that will actually export (the canvas outlines) instead of an empty
  state, and the job estimate counts it too.
- **Version chip**: the build version is always visible in the status bar.

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

- The cutter's "needs Chrome" gate is reframed: **Save File** works in any
  browser and is the primary action when direct USB (Tauri native or Web
  Serial) is unavailable.

### Notes
- New pure modules `cutOptimize.ts` and `paperSizes.ts` ship with unit tests
  (25 cases across the two). Full en/zh translations. tsc + eslint + vitest
  (180) + vite build all green.
