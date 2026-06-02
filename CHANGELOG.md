# Changelog

All notable changes to Anchorworks are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

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
