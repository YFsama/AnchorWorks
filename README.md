# Anchorworks

An Adobe Illustrator-style vector graphics editor with built-in **AI assistance** (Claude with vision), **MCP / Skill** extensibility, plotter (G-code / HP-GL via Web Serial), and printer output. Built as an **installable PWA** that runs in any modern browser and gets a native-app feel via Chrome/Edge "Install" (window-controls-overlay, file associations, offline-first).

## Quick start

```bash
npm install
npm run dev            # web — open http://127.0.0.1:5173
npm run build          # static site in dist/
npx vite preview       # serve the production build at 127.0.0.1:4173

# Tauri native shell (T0-T5 all landed)
npm run tauri:dev      # run the native shell against the Vite dev server
npm run tauri:build    # produce a signed installer (Linux AppImage / macOS DMG / Windows NSIS)
```

Deploy: `dist/` is a static site. Drop it on any host (Vercel, Netlify, Cloudflare Pages, Nginx, GitHub Pages…). HTTPS required for Web Serial + Service Worker (localhost is exempt).

**Install as desktop client**: open in Chrome/Edge → ⋮ menu → "Install Anchorworks". App becomes a standalone window, registers `.svg` / `.vstudio.json` file associations, opens via `web+vector://` protocol, works offline after first visit.

## Installing the native bundles

Pre-built installers for every release are on the [Releases page](https://github.com/YFsama/AnchorWorks/releases). Pick the one matching your OS:

| OS | File | First-launch note |
|---|---|---|
| **macOS (universal)** | `Anchorworks_0.9.0_universal.dmg` | The build is **not Apple-signed yet** — Gatekeeper will refuse to open it on double-click and show "cannot be opened because Apple cannot verify the developer". **Workaround**: right-click the `.app` → **Open** → confirm in the dialog. macOS remembers your choice and stops asking. We'll ship a notarized build once we have an Apple Developer cert. |
| **Windows x64** | `Anchorworks_0.9.0_x64-setup.exe` (NSIS) or `.msi` | The `.exe` is **not Authenticode-signed yet** — SmartScreen will show "Windows protected your PC". **Workaround**: click **More info** → **Run anyway**. Future builds with an OV/EV code-signing cert will skip this entirely. |
| **Linux (Debian / Ubuntu)** | `Anchorworks_0.9.0_amd64.deb` | `sudo apt install ./Anchorworks_0.9.0_amd64.deb` (apt resolves the WebKitGTK + GTK deps automatically). |
| **Linux (Fedora / RHEL)** | `Anchorworks-0.9.0-1.x86_64.rpm` | `sudo dnf install ./Anchorworks-0.9.0-1.x86_64.rpm` |
| **Linux (any)** | `Anchorworks_0.9.0_amd64.AppImage` | `chmod +x` and run directly. Self-contained — no install needed. |

> **Don't want to install?** The PWA path above is fully offline-capable after first visit and gets every Tauri feature *except* native file dialogs / serial port direct access. For most users the PWA install is the better path.

## Features

**Editor**
- Tools: Select, Rect, Ellipse, Line, Polygon, Pen, Pencil (pressure-aware), Eraser, Text, Hand, Zoom, Measure, Eyedropper (all visible in the left toolbar, with desktop scrolling for short windows)
- Direct-select path editing (drag individual anchor points)
- Boolean ops: union / subtract / intersect / exclude (web-worker, won't freeze UI)
- Clip masks + compound paths, stroke alignment (inside / outside / center), live keyboard-browsable preset-driven Margin Guides with Cancel/Apply action review status plus live keyboard-browsable Simplify Path tolerance, Offset Path, and Round Corners presets with screen-reader review status, Simplify Path, Offset Path, and Round Corners Cancel/Apply action review status, live-preview Roughen / Zig Zag / Pucker & Bloat / Twist effects, and keyboard-browsable Cancel/Apply actions plus recipe presets across cleanup, edit-colors, distort, blend, warp, and multi-outline dialogs with screen-reader review status, including Multi-outline Cancel/Apply action review, plus keyboard-browsable Blend 3/5/10/20 step presets and Cancel/Reset/Apply actions with screen-reader review status, with Reset restoring the default 5 blend steps, live keyboard-browsable Arc Warp bend presets and Cancel/Reset/Apply actions with screen-reader review status, with Reset restoring Arc style and 40% bend, live keyboard-browsable Roughen and Zig Zag recipes plus Roughen Cancel/Reset/Apply and Zig Zag Cancel/Apply actions with screen-reader review status, with Roughen Reset restoring the default 1 mm Size and 3 mm Detail, live Pucker/Bloat amount and Twist angle presets plus Pucker/Bloat and Twist Cancel/Reset/Apply actions with screen-reader review status, with Pucker/Bloat Reset restoring 0% neutral distortion and Twist Reset restoring 0° neutral twist
- Repeat transforms (Grid / Radial / Mirror) with keyboard-browsable 2×2 / 3×3 / 5-across / 5-down grid presets and 6-around / 8-around / 12-badge radial presets, and keyboard-browsable mirror-axis presets with screen-reader review status plus a Reset footer action that restores 3×3 grid, selection-sized steps, 8-around radial defaults, and horizontal mirror, keyboard-switchable Transform/Resize/Shear/Repeat dialog Cancel/Apply actions, keyboard-switchable Transform units and XY/Polar move modes plus keyboard-browsable 1/5/10/25-unit move, 50/100/150/200% scale, and -90°/-45°/0°/+45°/+90°/180° rotation presets with screen-reader review status plus a Reset footer action that restores zero move, 100% linked scale, 0° rotate, XY mode, and no copy/each options, keyboard-browsable Resize Sticker label / Name badge / Yard sign / Banner panel size recipes plus half/original/double scale presets with screen-reader review status plus a Reset footer action that restores the opened selection size and locked aspect ratio, and Shear -30°/-15°/0°/+15°/+30° angle presets plus keyboard-switchable horizontal/vertical shear axis with screen-reader review status and a Reset footer action that restores 0° horizontal shear, keyboard-switchable Properties Transform units, scale, live Fit/Center, and rotation presets with screen-reader review status, Align panel Center on Artboard shortcut plus keyboard-switchable exact-spacing presets with active one-click horizontal/vertical apply, rebindable Alt+Shift align/distribute shortcuts, Outline View (wireframe preview)
- Snap to grid, smart guides between objects, anchor-point snap (corners / centers / midpoints), keyboard-browsable status-bar Grid/Snap/Guides/Anchor toggles, and Margin Guides Trim edge / Sticker safe / Office print / Banner hem recipes plus live keyboard-browsable safe-area presets with screen-reader review status and keyboard-browsable Cancel/Reset/Apply actions, with Reset restoring Sticker safe
- Searchable multi-artboard layout with keyboard-browsable Target First / Clear search actions with screen-reader action review status, empty-result Clear search recovery, Enter-to-target, ArrowDown-to-first-artboard focus, Up/Down/Home/End artboard-list browsing with active-row highlighting and screen-reader review status announcing artboard name, position, and pixel size, keyboardable artboard rows (Enter target, Ctrl/Cmd+D duplicate, Delete remove, R swap), row-level live keyboard-browsable A4 / Letter / 24×12 in size presets, keyboard-browsable Swap W/H orientation, and Fit Selection / Fit Artwork controls with screen-reader action review status, searchable document preset sizes with keyboard-browsable Use First / Clear search actions with screen-reader action review status, empty-result Clear search recovery, Enter-to-use, and ArrowDown-to-preset-list flow plus keyboard-switchable Document Settings orientation and keyboard-browsable Cancel/Reset/Apply actions with screen-reader action review status, with Reset restoring the opened document size, DPI, background, orientation, and cleared preset search, built-in templates with auto-focused search, Business / Social / Logo / Print / Stickers category filters with counts, category-aware search summaries, empty-result Clear search / Show all categories / Reset filters recovery actions, and screen-reader review status, keyboard-browsable Use First / Clear search actions with screen-reader action review status, Enter-to-use, ArrowDown-to-first-template keyboard flow, and arrow-key template-grid review with active-tile highlighting and screen-reader review status, searchable reusable Symbols and Asset libraries with keyboard-browsable Asset Import / Trace actions and screen-reader action review status, keyboard-browsable Insert First / Clear search actions with screen-reader action review status, empty-result Clear search recovery, Enter-to-insert, ArrowDown-to-first-library-item focus, arrow-key Asset/Symbol tile review with active-tile highlighting and screen-reader review status, keyboard-browsable symbol naming Save/Cancel with screen-reader action review status, keyboard tile cleanup with toast feedback (F2 rename symbols, Delete remove assets/symbols), and drag-drop import
- Layers panel with live thumbnails, keyboard-browsable quick actions with screen-reader action review status, search by name/type/id with match counts, empty-result Clear search recovery, Select First / Enter-to-select, ArrowDown-to-first-layer focus / active-row screen-reader review status / keyboard-browsable Select Matches and Solo Matches for filtered review plus Rename Matches, Duplicate Matches, and Delete Matches cleanup with action review status and destructive confirmation, double-click rename plus keyboard F2, row-level duplicate/delete that stay visible on selected/focused rows with Ctrl/Cmd+D, V/L visibility-lock toggles, and Delete/Backspace support, drag-to-reorder, and quick select/show/unlock batch actions
- Undo / redo (snapshot-based)
- 35+ keyboard shortcuts, fully rebindable via Help → Customize Shortcuts, with a responsive searchable Keyboard Shortcuts dialog reading the live keymap and covering visible tools/tool-hint-sync plus new-document/template-start/import-image/project-open-save-as/output-hint-sync/cut-contour-hint-sync/view-help-hint-sync/view-zoom-topbar-hint-sync/edit-clipboard-delete-hint-sync/arrange-select-hint-sync, paste, select, mask/compound path, transform, path-edit, type-hint-sync/type-size/tracking/leading, align/distribute, appearance no-fill/no-stroke, lock/unlock, hide/show, zoom, cut-contour, and output shortcuts with live keyboard-browsable Text / Output / View / Edit search recipes with screen-reader review status, Output now filtering print / cut / plotter / export together, Edit First / Clear search actions with screen-reader action review status, Enter-to-edit, ArrowDown-to-first-shortcut and Up/Down/Home/End shortcut review with active-card highlighting and screen-reader review status, plus an auto-focused searchable Customize Shortcuts editor with match counts, keyboard-browsable Edit First / Clear search actions with screen-reader action review status, Enter-to-edit, ArrowDown-to-first-shortcut focus, Up/Down/Home/End keymap-row review with active-row highlighting and screen-reader review status, Esc/one-click clear, and one-click handoff

**Fonts**
- Built-in system fonts with searchable picker, live match counts, keyboard-browsable Apply First / Clear search actions with screen-reader action review status and Enter-to-apply, direct empty-result Clear search recovery, ArrowDown-to-first-font focus, live arrow-key font-preview browsing with current-font row highlighting and screen-reader review status, recent fonts, one-click/Esc search clearing, rebindable Create Outlines (`Ctrl+Shift+O`), Break Text into Letters/Lines (`Ctrl+Alt+L` / `Ctrl+Alt+Shift+L`), Text on Arc (`Ctrl+Alt+A` / `Ctrl+Alt+Shift+A`), UPPER/lower/Title/Sentence case (`Ctrl+Alt+U` / `Ctrl+Alt+Shift+U` / `Ctrl+Alt+Shift+T` / `Ctrl+Alt+Shift+S`), Smart Punctuation (`Ctrl+Alt+Q`), Tracking/Leading nudges (`Alt+ArrowLeft/Right/Up/Down`), Find & Replace (`Ctrl+Alt+F`), and shortcut-opened Single-line Text (`Ctrl+Alt+T`) dialog actions whose hints stay synchronized across Document Type, command palette, and right-click Type, plus Character panel keyboard-switchable sign-size, tracking, leading, and H/V scale presets
- 15+ Google Fonts (Roboto, Inter, Bebas Neue, Noto Sans/Serif SC, ZCOOL XiaoWei, etc.) lazy-loaded
- Upload custom `.ttf / .otf / .woff / .woff2`

**AI Assistant (Claude API)**
- Vision: sends a snapshot of your canvas so the model can *see* and improve it
- SVG context: pastes the underlying SVG markup as additional context
- Tool calling: model can `replace_svg`, `add_svg`, `set_background`, plus any local skill you register
- Configurable model (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)
- Keyboard-browsable AI header, quick prompts, Vision/SVG context toggles, Send, settings, and MCP discovery/test/remove/save actions
- API key kept locally in `localStorage`

**MCP & Skills**
- Local skills registered in code via `registerSkill()` (see `src/lib/mcp.ts`)
- Sample skill: `align_selection` (left / right / top / bottom / centerH / centerV)
- MCP server URLs configurable in the UI (HTTP/SSE), probed with `tools/list`

**Format I/O**
- Import: SVG (smart importer — preserves gradients, inlines `<style>`, warns on `<filter>`/`<mask>` drops), JSON, PNG/JPG/WebP/GIF raster drag-drop
- Export: SVG, PNG, JPG, PDF (vector via jsPDF), DXF, JSON
- Native project files (`.vstudio.json`) with Save / Save As / Open via File System Access API + Recent Files submenu
- Print Prep (also on the top output toolbar): searchable page sizes with keyboard-browsable Use First / Clear search actions with screen-reader action review status, Enter-to-use, and page-size screen-reader review status, active orientation/scaling buttons, keyboard-switchable print job presets with screen-reader preset review status, keyboard-switchable margin presets with screen-reader preset review status, Proof / Press / Sticker / None prep presets with review status, keyboard-switchable bleed presets with preset review status, plus crop marks, registration marks, bleed indicator, page info strip, Tile Print orientation buttons plus Proof / Poster / Banner job presets, an Auto / fixed grid preset toolbar, overlap presets, and a final Ready to tile print summary, and live keyboard-browsable Split Into Grid Sticker sheet / Yard sign / Banner panels / Tile proof recipes plus grid presets/actions with screen-reader review status and a Reset footer action that restores the Sticker sheet recipe, and Banner Grommets preset browsing that immediately applies Small / Standard / Large banner measurements

**Plotter / Cutter**
- SVG paths flattened into polylines (curves tessellated by tolerance)
- Cut Contour dialog with live cutter-outline preview, keyboard-switchable contour / Trace Bitmap / Reg Marks tabs, live keyboard-browsable contour job presets with screen-reader preset review status, replace/append contour retry mode, live Trace Bitmap presets with preset review status and replace/append retry mode, live registration-mark presets with preset review status, final-job preview with replace/append action summary, mark position preview, keyboard-browsable cleanup buttons for Clear contour / trace / regmarks / all, and keyboard-browsable Close / Send to Plotter output actions
- Horizontally scrollable output toolbar includes Cut Contour, one-click positioning marks, weed border, one-click standard bridge plus topbar Clear bridges restore, File-menu, Document-menu, command-palette, and right-click weed-grid presets (Rows / Columns / 2×2 / 3×2), Light / Standard / Heavy bridge presets plus Clear bridges cleanup, Banner Grommets with keyboard-browsable and menu/search/right-click Small / Standard / Large banner presets plus screen-reader review status and a Reset footer action that restores the Standard banner recipe, Rhinestone Template with live keyboard-browsable Fine / Standard / Bold job presets plus screen-reader review status, SS stone-size / Dense-Standard-Loose spacing presets with review status, a Reset footer action that restores Standard stones, plus menu/search/right-click Fine / Standard / Bold stone presets, Variable Data (`Ctrl+Alt+V`) for badge/ticket/serial personalization, Save Test Cut File, and Auto-arrange (Nest) before print/plotter output, plus keyboard-switchable active **G-code** (CNC pen plotters, lasers) / **HP-GL** (vinyl cutters) buttons plus active Bare / Roland / Graphtec HP-GL dialect buttons, with keyboard-browsable Banner Grommets and Rhinestone Template commit actions
- Configurable feed/travel rates with keyboard-switchable quick presets and screen-reader review status, keyboard-switchable curve-tolerance and overcut presets with review status, pen-up/down Z, paper height, and keyboard-switchable active unit buttons (mm / in) plus active origin buttons
- Graphical cut preview with keyboard-switchable Outline/Code modes, searchable material preset cards with match counts, visible feed/force/speed/overcut hints, keyboard-browsable Use First / Clear search actions, empty-result Clear search recovery, Enter-to-use, ArrowDown-to-material-list focus, arrow-key material browsing with screen-reader review status, overcut preset buttons, live keyboard-switchable active cut-strategy buttons for Mirror / Optimize / Reverse / Inner-first with screen-reader review status, keyboard-browsable active preview buttons for print overlay and cut-order badges with review status, keyboard-browsable cut-by-colour quick toggles with screen-reader review status, Next Color solo cycling, and empty-output blocking, status-bar cut-count output shortcut with Shift/Alt opening Cut Contour and Ctrl/Cmd clearing cut paths, output-surface auto-arrange/nesting, one-click add/clear registration marks, keyboard-switchable weed border/grid presets with screen-reader preset review status, keyboard-switchable bridge presets with preset review status, disabled None no-op, and in-dialog Clear bridges restore, in-dialog Reset output settings, in-dialog and output-surface Clear cut paths plus Clear contour / trace / regmarks / bridges cleanup, and banner grommet prep with Small / Standard / Large preset chips plus direct File-menu, command-palette, and right-click preset actions for common banner jobs, final Ready to output summary with material, speed, overcut, machine, mirror, and origin settings, keyboard-browsable output action buttons for cancel/test-cut/save/send with screen-reader review status, save-to-file, direct test-cut calibration file export, or send-over-USB via Web Serial API (Chrome / Edge over HTTPS or localhost)

**Print**
- Searchable A4 / A3 / Letter / Legal page-size picker with dimensions, live match counts, live keyboard-browsable Proof / Office / Photo fill / True size print job presets with screen-reader review status for page, orientation, scaling, and margin, Use First / Clear search actions with screen-reader action review status, empty-result Clear search recovery, and Enter-to-use, ArrowDown-to-first-page-size focus, arrow-key page-size browsing with screen-reader review status, and Clear/Esc clearing, keyboard-switchable Portrait / Landscape plus Fit / Actual / Fill segmented buttons, final Ready to print summary plus keyboard-browsable Cancel / Reset / PDF / Print output actions, Margin in mm
- Opens hidden iframe with @page CSS sized to selected paper
- Tile Print (N×M sheets, `Ctrl+Alt+P`, also on the top output toolbar) for large artwork with the same searchable page-size picker, dimensions, match counts, keyboard-browsable Use First / Clear search actions, empty-result Clear search recovery, and Enter-to-use, ArrowDown-to-first-page-size focus, arrow-key page-size browsing with screen-reader review status, keyboard-switchable source buttons for Auto / Selected / Visible / Canvas artwork with unavailable-source fallback, keyboard-switchable orientation, Proof / Poster / Banner job presets with screen-reader review status that apply grid, overlap, and margin together, an Auto Grid / 1×1 proof / fixed-grid preset toolbar with Left / Right / Home / End browsing and review status, grid presets plus overlap/margin presets with screen-reader review status, source/page/margin/printable/assembled-size summary, printable-area preview guides with overlap/printable legend, final Ready to tile print confirmation, keyboard-browsable Cancel / Reset / Print output actions, Reset restoring A4 portrait 1×1 proof tiling with 0 mm overlap, 5 mm margin, Auto source, and cleared search, and Clear/Esc clearing

**Productivity surfaces**
- Command Palette (`Cmd+K`) with 85+ fuzzy-searchable commands across all categories, live result counts, keyboard-browsable Run First / Clear search actions with screen-reader action review status, active-command screen-reader review status, visible ↑/↓ / Home/End / PgUp/PgDn / Enter / Esc keyboard hints, empty-result Clear search recovery, one-click/Esc search clearing, including clipboard, clipping/compound-path shortcuts, and state-aware theme, outline-view, grid/snap/guides toggles
- In-app Help Center (`F1`) — 63 searchable topics, live match counts, keyboard-browsable Open First / Clear search actions with screen-reader action review status, Enter-to-open, ArrowDown-to-first-topic keyboard flow plus Up/Down/Home/End topic-list review with active-topic screen-reader status, empty-result Clear search recovery, one-click/Esc search clearing, ~7000 words documenting every feature
- Keyboard Shortcuts and Customize Shortcuts now show direct Clear search recovery buttons in no-match states, plus keyboard-browsable Keyboard Shortcuts Close / Customize Shortcuts footer actions with screen-reader action review status, keeping shortcut discovery, closing, and rebinding workflows from getting trapped by over-specific searches
Preferences (`Cmd+,`) — searchable settings for AI key, autosave interval, default canvas, theme, snapping, and workspace options with live keyboard-browsable Design focus / Production prep / Presentation workspace recipes with screen-reader review status, auto-focused search, active recipe chips, Go First / Clear search actions with screen-reader action review status, empty-result Clear search recovery, Enter-to-go, ArrowDown-to-section jumps, and keyboard-browsable Cancel / Reset / Apply / Save actions with screen-reader action review status, with Reset restoring the draft captured when Preferences opened and clearing stale search / recipe review state
- Toast notifications with keyboard-browsable action/dismiss buttons + styled confirm dialogs with keyboard-browsable Cancel/OK actions + tooltip system + recovery dialog with keyboard-browsable Discard/Restore actions and screen-reader action review status + onboarding slide/action keyboard browsing with screen-reader review status
- Right-click canvas context menu plus Document → Type/Image/Align/Appearance menus with undo/redo with visible alternate redo shortcut, clipboard/system-clipboard import, print/output with nesting and active cut-by-color controls, help/settings/command-palette/update-check/debug-panel with keyboard-browsable diagnostics actions and screen-reader action review status, document/template/artboard shortcuts, export-selection, view/guides with visible zoom/guides shortcuts, status-bar grid/snap/guide/anchor toggles, insert/layout/symbol save with Split Into Grid Cancel/Apply action review status, type/find-replace with Character size/tracking/leading/H-scale/V-scale preset screen-reader review status and Enter-to-replace, ArrowUp/ArrowDown field switching, live keyboard-browsable Double spaces / Dash cleanup / Number token / Brand mark recipes with screen-reader recipe review status, clear/swap helpers with screen-reader action review status, keyboard-browsable Cancel / Reset / Replace All actions with screen-reader action review status, with Reset clearing Find/Replace text, Match case, stale recipe review, and returning focus to Find, single-line text and visible paste/type/fill-stroke/no-fill/no-stroke shortcuts, image filters with panel preset/readout sync, keyboard-switchable active strength preset buttons with screen-reader review status, and clear/reset, fill/stroke toggles, live keyboard-browsable suggested palette swatches, live keyboard-browsable visual blend-mode quick buttons, keyboard-browsable Recolor mapping/actions plus live keyboard-browsable Vinyl primary / Monochrome sign / Safety decal / Team colors palette recipes with screen-reader review status and live keyboard-browsable Hue/Saturate/Brightness amount presets with screen-reader review status, with Hue Reset restoring 0° neutral shift, Saturate Reset restoring 0% neutral saturation, and Adjust Brightness Reset restoring 0% neutral brightness, Rename Selection prompts from the menu, command palette, and right-click prefill the current single-object name, plus keyboard-switchable Properties object-name Apply name / Clear name actions with screen-reader action review status, keyboard-switchable Properties stroke-width, opacity, and gradient-angle preset buttons with screen-reader review status, live keyboard-browsable visual pattern-fill and pattern-size presets with screen-reader review status, live keyboard-browsable Properties drop-shadow preset buttons, live keyboard-browsable visual stroke dash/cap/join buttons with screen-reader review status, keyboard-switchable miter-limit presets with screen-reader review status, keyboard-switchable Properties stroke-width preset buttons and Transform / Resize / Shear / Repeat Cancel/Apply action review status, live keyboard-browsable stroke alignment plus width/style presets/constant stroke with screen-reader review status, align/distribute with keyboard-switchable exact-spacing presets, rasterize, cut-prep/banner-grommet shortcuts with Document menu / command-palette / right-click Clear contour / trace / regmarks / all cleanup plus Banner Grommets Cancel/Apply action review status and Rhinestone Cancel/Apply action review status, grouping, visible Z-order, lock/unlock (`Ctrl+2` / `Ctrl+Alt+2`), and hide/show shortcuts, lock/hide focus editing, state-aware layer-search Select/Hide/Lock/Show/Unlock Matches cleanup, select-inverse shortcut, and batch selection helpers (visible/unlocked/object type/same, including text font/size, blend mode, and stroke dash/cap/join)
- Path editing polish: Shift-click multi-anchor selection, Average Anchor Points (`Ctrl+Alt+J`), right-click Clean Up/average anchors/arrowheads/Warp/Blend/Free Distort effects, live distort previews with Free Distort perspective/taper/wave presets that apply while browsing with arrow keys and announce the focused recipe, Illustrator-style Eyedropper sampling (`I`, Alt/Option reverse), and group Isolation Mode
- Single-line engraving text (`Ctrl+Alt+T`) with Engraving / Badge / Serial / Pen plot presets that load while browsing with arrow keys and announce recipe, sample text, size, and tracking, keyboard-browsable Reset fields / Clear text helpers plus Cancel / Create actions with screen-reader action review status, keyboard-shortcut Variable Data (`Ctrl+Alt+V`) serial/list generation with live keyboard-browsable badge/ticket presets, column-count presets, and gap presets with screen-reader review status, auto/linked gap controls, row/column fill order, grid-size preview, list cleanup/reverse tools and Cancel / Generate actions with screen-reader action review status, and generation preview chips with screen-reader status announcing source mode, value count, grid size, and sample values, live keyboard-browsable Star/Polygon/Spiral insertion presets and Cancel/Reset/Insert actions with screen-reader review status, with Reset restoring the default 5-point star, and command-palette/right-click Freeform Gradient generation for cutter/engraving-friendly artwork with Poster glow / Neon sign / Metal plate / Heat map presets that load while browsing with arrow keys, announce size/stop details, and keyboard-browsable footer actions with screen-reader action review status
- WCAG contrast checker on text objects (AA / AAA / Large badges)
- Inspector panel: live document stats + palette extraction (click to copy hex)

**Themes & accessibility**
- Dark theme (default), Light theme (WCAG AA verified — semantic color tokens have light-theme overrides), High-contrast theme
- `prefers-color-scheme` auto-detected on first run; theme-aware splash screen
- i18n: English + 简体中文 (**598+ keys**, full UI coverage including aria-labels, error toasts, and announce calls). The top-bar language switcher supports ArrowUp/ArrowDown/Home/End browsing; CJK-aware typography uses language-scoped `letter-spacing` / `uppercase` via `:root[data-lang="en"]` so Chinese never gets letter-spacing-induced rendering breakage
- WAI-ARIA patterns: combobox, tabs (with arrow nav), alertdialog, menu/menubar (keyboard openable via `focus-within`), listbox, toolbar (roving tabindex, `aria-orientation`, including top-bar history/canvas-helper/output action groups), disclosure (`aria-expanded`), toggle (`aria-pressed`)
- `<header>` / `<main>` / `<aside>` landmark trio + skip-link to canvas
- Global focus halo via box-shadow ring (light/dark adaptive, WCAG 1.4.11 ≥ 3:1)
- All 12 dialogs: `<h2>` titles + Escape to close + focus restored to invoking element
- All icon-only buttons have accessible names; all decorative icons `aria-hidden`
- Touch + pen pressure (canvas pinch zoom, two-finger pan)
- Reduced-motion respected (animations disabled when OS pref set)
- Installable PWA with full offline support; OfflineBanner on disconnect

**Desktop / PWA integration**
- `display_override: window-controls-overlay` — installed PWA can reclaim the title-bar area
- `file_handlers` — OS associates `.svg` and `.json/.vstudio.json` to open in the app
- `launch_handler: navigate-existing` — file-open events reuse an existing window
- `protocol_handlers: web+vector://` — custom deep-link protocol for external automation
- Service Worker `registerType: autoUpdate` — silent updates on next reload
- Runtime cache for Inter font (`rsms.me`), Google Fonts, Anthropic API (NetworkFirst with offline fallback)

**Debug**
- Toggle the bottom drawer for live log entries (info / warn / error)
- View canvas state JSON (objects, viewport, background)
- Performance: JS heap, object count, Web Serial availability

## Architecture

```
src/
  lib/
    canvasEngine.ts   Fabric.js wrapper, tools, transforms, undo/redo
    history.ts        snapshot-based history stack
    io.ts             SVG / PNG import + export, download helpers
    io2.ts            JPG, PDF (via print), DXF, JSON
    plotter.ts        SVG -> polylines -> G-code or HP-GL, Web Serial sender
    printer.ts        Hidden iframe + window.print
    fonts.ts          Google Fonts + custom font loader
    ai.ts             Claude API client, vision, tool dispatch
    mcp.ts            Skill registry + MCP server probe
    debug.ts          In-app log buffer + perf timers
  components/
    MenuBar / Toolbar / CanvasView
    PropertiesPanel / LayersPanel / FontPicker
    AIPanel / PlotterDialog / PrintDialog / DocSettingsDialog / DebugPanel
  store/
    editor.ts         Zustand store: tool, doc, selection, history flags, modals
  App.tsx             layout, keyboard shortcuts, sample skill registration
```

## Adding a skill

```ts
import { registerSkill } from './lib/mcp';
import { getCanvas } from './lib/canvasEngine';

registerSkill({
  name: 'rotate_selection',
  description: 'Rotate the current selection by N degrees.',
  input_schema: { type: 'object', properties: { degrees: { type: 'number' } }, required: ['degrees'] },
  handler: ({ degrees }) => {
    const c = getCanvas();
    const o = c?.getActiveObject();
    if (o) { o.rotate((o.angle ?? 0) + Number(degrees)); c?.requestRenderAll(); }
    return 'rotated';
  },
});
```

The AI assistant can then call your skill as a tool.

## Browser support notes

- **Web Serial** (plotter USB): Chrome / Edge / Opera (Chromium-based) over HTTPS or `localhost`. Not Firefox / Safari.
- **PWA file_handlers + protocol_handlers**: Chromium-based browsers (Chrome 102+, Edge 102+). Safari / Firefox install the PWA but skip these features silently.
- **Custom fonts** require the **FontFace** API (all current browsers).
- **WebGL filter backend** for image effects (blur / brightness / contrast / hue): all current browsers with WebGL1/2; silent CPU fallback if absent.
- The Anthropic API call uses the `anthropic-dangerous-direct-browser-access` header. Your API key never leaves your machine, but consider running through a proxy for production.

## Native shell — Tauri 2

The web/PWA build remains the default target; Tauri 2 wraps the same `dist/` in a native shell. All five phases are landed:

- **T0** — `src-tauri/` scaffold (Cargo.toml, build.rs, src/main.rs+lib.rs, tauri.conf.json, capabilities).
- **T1** — native commands: `platform_info`, `fs_save_project`, `fs_open_project`, `fs_read_path`, `serial_list_ports`, `serial_send`, `print_native`. Frontend routes through `runtime.ts#callNative` and falls back to Web Serial / `window.print` / `showSaveFilePicker` under the PWA.
- **T2** — `build_app_menu()` mirrors the DOM MenuBar (File/Edit/View/Document/Help). `on_menu_event` emits `menu-action`; `src/lib/tauriMenu.ts` maps id → handler. DOM MenuBar stays visible for brand chrome; both surfaces dispatch through one action table.
- **T3** — `tauri.conf.json#bundle.fileAssociations`: `.vstudio.json` (Owner) + `.svg` (Alternate). `tauri-plugin-single-instance` forwards argv → `file-open` event → `fs_read_path` → project apply. `tauri-plugin-deep-link` recognises `anchorworks://open?path=…` / `command/<id>` / `tool/<id>`.
- **T4** — `tauri-plugin-updater` configured with real pubkey + endpoint. `.github/workflows/release.yml` signs per-OS bundles on `v*` tags via `tauri-apps/tauri-action@v0`.
- **T5** — `package.json` scripts `build:web` / `build:native` / `build:all`; `.github/workflows/build.yml` runs the PWA on every push plus a native matrix on macos/ubuntu/windows-latest.

## Building native bundles locally (Docker)

The repo ships a reproducible Docker pipeline so you don't have to install WebKitGTK / GTK3 / AppIndicator on your host:

```bash
# One-time: image is ~1.6 GB (Ubuntu 22.04 + Rust 1.95 + Node 20 + WebKitGTK 4.1)
docker build -f docker/build-linux.Dockerfile -t anchorworks-builder .

# Then per-bundle:
mkdir -p out
docker run --rm \
  -v "$PWD":/work \
  -v "$PWD/out":/out \
  -e TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/anchorworks.key)" \
  -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  anchorworks-builder
```

Output (`out/`):
- `Anchorworks_0.9.0_amd64.deb` (7.7 MB) + `.sig` — Debian / Ubuntu
- `Anchorworks-0.9.0-1.x86_64.rpm` (7.7 MB) + `.sig` — Fedora / RHEL / openSUSE
- `Anchorworks_0.9.0_amd64.AppImage` (85 MB) + `.sig` — distro-agnostic
- `latest.json` — updater manifest the in-app plugin polls

Signing keys live in `.tauri/` (gitignored; only `.pub` is committed). Generate yours via:

```bash
cargo tauri signer generate -w .tauri/anchorworks.key --password ""
# then paste the .pub contents into tauri.conf.json#plugins.updater.pubkey
```

### Windows cross-compile from Linux

The same docker pattern produces a Windows installer + portable .exe via
`cargo-xwin` (auto-fetches Microsoft's MSVC SDK + CRT, accepts the
distribution license inline):

```bash
docker build -f docker/build-windows.Dockerfile -t anchorworks-builder-win .
mkdir -p out-win
docker run --rm \
  -v "$PWD":/work \
  -v "$PWD/out-win":/out \
  -e TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/anchorworks.key)" \
  -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  anchorworks-builder-win
```

Output (`out-win/`):
- `Anchorworks_0.9.0_x64-setup.exe` (~4.5 MB) — NSIS installer
- `Anchorworks_0.9.0_x64-setup.exe.sig` — updater-side minisign
- `anchorworks.exe` (~17 MB) — portable PE32+ binary
- `latest-windows.json` — updater manifest for Windows

Two caveats vs. the Windows runner in `release.yml`:
- **Authenticode code-signing** is skipped here (it needs `signtool.exe`
  or `osslsigncode` + your codesign cert). The minisign updater signature
  still works; users just see the SmartScreen prompt on first run.
- **MSI bundle** is not produced — WiX needs Windows. NSIS (.exe) is the
  cross-platform output. The CI matrix produces both.

macOS `.dmg` still needs a macOS host (no cross-compile path exists today
because Apple's signing tooling is macOS-only). The `release.yml`
workflow handles all three OSes in a matrix on every `v*` tag.

## What this is *not*

- The web/PWA build does **not** call Windows COM automation, native printer drivers, or any OS-specific APIs.
- Plotter integration on the web path uses **Web Serial API** (browser-managed USB ports), cross-platform.
- Printer integration on the web path uses **`window.print()`** which delegates to the OS print dialog, cross-platform.
- The Tauri build (T1+) additionally supports native printer queues and native serial ports — but the codebase keeps the web path working so the PWA install stays viable.

## License

MIT for this scaffold. Lucide icons under ISC. Fabric.js under MIT.
