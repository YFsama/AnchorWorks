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

## Features

**Editor**
- Tools: Select, Rect, Ellipse, Line, Polygon, Pen, Pencil (pressure-aware), Eraser, Text, Hand, Zoom
- Direct-select path editing (drag individual anchor points)
- Boolean ops: union / subtract / intersect / exclude (web-worker, won't freeze UI)
- Clip masks + compound paths, stroke alignment (inside / outside / center)
- Repeat transforms (Grid / Radial / Mirror), Outline View (wireframe preview)
- Snap to grid, smart guides between objects, anchor-point snap (corners / centers / midpoints)
- Multi-artboard layout, reusable Symbols library, Asset library with drag-drop import
- Layers panel with live thumbnails, double-click rename, drag-to-reorder
- Undo / redo (snapshot-based)
- 35+ keyboard shortcuts, fully rebindable via Help → Customize Shortcuts

**Fonts**
- Built-in system fonts
- 15+ Google Fonts (Roboto, Inter, Bebas Neue, Noto Sans/Serif SC, ZCOOL XiaoWei, etc.) lazy-loaded
- Upload custom `.ttf / .otf / .woff / .woff2`

**AI Assistant (Claude API)**
- Vision: sends a snapshot of your canvas so the model can *see* and improve it
- SVG context: pastes the underlying SVG markup as additional context
- Tool calling: model can `replace_svg`, `add_svg`, `set_background`, plus any local skill you register
- Configurable model (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)
- API key kept locally in `localStorage`

**MCP & Skills**
- Local skills registered in code via `registerSkill()` (see `src/lib/mcp.ts`)
- Sample skill: `align_selection` (left / right / top / bottom / centerH / centerV)
- MCP server URLs configurable in the UI (HTTP/SSE), probed with `tools/list`

**Format I/O**
- Import: SVG (smart importer — preserves gradients, inlines `<style>`, warns on `<filter>`/`<mask>` drops), JSON, PNG/JPG/WebP/GIF raster drag-drop
- Export: SVG, PNG, JPG, PDF (vector via jsPDF), DXF, JSON
- Native project files (`.vstudio.json`) with Save / Save As / Open via File System Access API + Recent Files submenu
- Print Prep: crop marks, registration marks, bleed indicator, page info strip

**Plotter / Cutter**
- SVG paths flattened into polylines (curves tessellated by tolerance)
- Output: **G-code** (CNC pen plotters, lasers) or **HP-GL** (vinyl cutters)
- Configurable feed rate, travel rate, pen-up/down Z, paper height, unit (mm / in)
- Live preview, save-to-file, or send-over-USB via Web Serial API (Chrome / Edge over HTTPS or localhost)

**Print**
- A4 / A3 / Letter / Legal, Portrait / Landscape, Fit / Actual / Fill, Margin in mm
- Opens hidden iframe with @page CSS sized to selected paper
- Tile Print (N×M sheets) for large artwork

**Productivity surfaces**
- Command Palette (`Cmd+K`) with 54+ fuzzy-searchable commands across all categories
- In-app Help Center (`F1`) — 63 topics, ~7000 words documenting every feature
- Preferences (`Cmd+,`) — AI key, autosave interval, default canvas, theme
- Toast notifications + styled confirm dialogs + tooltip system + recovery dialog
- Right-click canvas context menu with clipboard (Cut / Copy / Paste / Group / Z-order)
- WCAG contrast checker on text objects (AA / AAA / Large badges)
- Inspector panel: live document stats + palette extraction (click to copy hex)

**Themes & accessibility**
- Dark theme (default), Light theme (WCAG AA verified — semantic color tokens have light-theme overrides), High-contrast theme
- `prefers-color-scheme` auto-detected on first run; theme-aware splash screen
- i18n: English + 简体中文 (**598+ keys**, full UI coverage including aria-labels, error toasts, and announce calls). CJK-aware typography: `letter-spacing` / `uppercase` are language-scoped via `:root[data-lang="en"]` so Chinese never gets letter-spacing-induced rendering breakage
- WAI-ARIA patterns: combobox, tabs (with arrow nav), alertdialog, menu/menubar (keyboard openable via `focus-within`), listbox, toolbar (roving tabindex, `aria-orientation`), disclosure (`aria-expanded`), toggle (`aria-pressed`)
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
