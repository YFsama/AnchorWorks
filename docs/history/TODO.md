# Anchorworks — Open Work

Snapshot of in-flight feature work + polish residue noted across the recent
polish-loop cycles. Items below are roughly ordered by impact / dependency.

---

## Feature work (TaskList #25, #27–31)

### #25 — Bezier pen tool + node editing

Today's pen tool now emits real beziers via press-and-drag tangent gestures
and exposes on-canvas reshape. Status:

- [x] Click-place anchor + drag-out tangent handle (the canonical bezier
      gesture). Cornering: a simple click without drag keeps the anchor as
      a corner; pressing and dragging shapes the outgoing tangent.
- [x] On-canvas anchor + handle handles after path commit (drag to
      reshape). Tangent diamonds render for C/Q commands; dashed guides
      connect each tangent to its anchor.
- [x] Convert anchor smooth ↔ corner via double-click on anchor. When
      converting corner→smooth we synthesise default tangents 1/3-2/3
      along the prior segment so the visual shift is gentle.
- [x] Remove anchor on existing path (Alt-click on anchor). First M
      anchor is refused since dropping it would orphan the path.
- [x] Add anchor on existing path segment — click on path inserts an
      anchor at the closest point. L segments split at the chord-fraction
      point; C segments use de Casteljau split so the curve stays
      visually identical after the new anchor lands. Q segments are
      promoted to C (standard Q→C control-point promotion) and then
      split, since splitting a Q at arbitrary t into two Qs is not
      geometrically clean.
- [x] Close path (click first anchor) with visible hover halo — accent2
      circle grows around the first anchor while the cursor is within 8px.
- [x] `Esc` finishes open path; `Enter` closes it. Routed through
      `App.tsx` so the pen tool gets first crack at both keys before the
      deselect-or-fallthrough branch fires.
- [x] PathOps / Pathfinder bool ops now refit curves on output. The
      polygon-clipping backend still flattens C/Q segments to many tiny
      lines internally (its model has no curve concept), so exact-handle
      preservation isn't possible — but the new `pathOps.ts#ringToBezier
      PathD` post-processes each output ring: vertices with a smooth
      angle change become part of cardinal-spline C segments, while sharp
      corners stay as L. Net visual: union/difference/intersection/xor
      output reads as a rounded shape again whenever the input was
      rounded, instead of a 200-vertex polygon approximation. Sharp
      polygon corners stay sharp.

### #27 — Tauri T1 native commands

- [x] `fs_save_project(bytes, suggested_name, path?)` — native save dialog
      via `tauri_plugin_dialog`; writes through `std::fs::write`. The
      frontend (`projectFile.ts`) routes through `callNative` and remembers
      the returned path for silent quick-saves.
- [x] `fs_open_project()` — native open dialog, returns `{ path, name,
      bytes }`. Mirrors `openProjectFromFile` and registers the path with
      Recent Files.
- [x] `fs_read_path(path)` — supporting command for the file-association
      / single-instance path; the frontend doesn't need `@tauri-apps/
      plugin-fs` because of this.
- [x] `serial_list_ports()` — wraps the `serialport` crate, returns
      `[{ path, kind, manufacturer, vid, pid, product }]`. `sendOverSerial`
      now prefers it under Tauri and falls back to Web Serial in the PWA.
- [x] `serial_send(path, baud, payload)` — opens the chosen port, writes
      in 256-byte chunks, flushes and drops. Surfaces port errors as a
      typed `Result::Err` the frontend toasts.
- [x] `print_native()` — calls `webview.print()` from the Rust side for
      cold launches that have no user gesture; the hot iframe-print path
      in `printer.ts` keeps using `window.print()` because Tauri's webview
      hands that straight to the OS dialog.

Validation note: `cargo check` not available in the polish-loop sandbox.
The Rust side has been written against the documented Tauri 2.x API; a
local `npm run tauri:dev` or CI `cargo check` is needed to confirm.

### #28 — Tauri T2 native menu + shortcuts

- [x] `build_app_menu(app)` in `lib.rs` mirrors the DOM MenuBar
      dropdowns (File / Edit / View / Document / Help) with stable
      string ids per item ("file.save", "edit.undo", …).
- [x] `app.on_menu_event(...)` emits `menu-action` with the id; the
      frontend listener in `src/lib/tauriMenu.ts` maps each id to the
      same handler the in-DOM MenuBar uses.
- [x] DOM MenuBar stays visible (brand-iconic chrome with logo, autosave
      chip, AI button). Native menu adds the OS-standard keyboard /
      accessibility surface alongside. Both surfaces route through one
      action table — no duplication of dispatch logic.

### #29 — Tauri T3 file associations + single-instance + protocol

- [x] `tauri.conf.json#bundle.fileAssociations` registers `.vstudio.json`
      (Owner) and `.svg` (Alternate). Cold-launching from the file
      explorer routes the path through `file-open` window event.
- [x] `tauri-plugin-single-instance` — second-launch process forwards
      argv to the running window and exits; primary window listens for
      `file-open` and opens each path via `fs_read_path`.
- [x] `tauri-plugin-deep-link` — custom protocols `anchorworks://` and
      `web+vector://` configured in `tauri.conf.json`; frontend listens
      for `deep-link://new-url`. Routing semantics (which URL paths map
      to which UI affordance) are intentionally undefined — first wire-up
      logs the URL for development visibility.

### #30 — Tauri T4 updater + code signing

- [x] `tauri-plugin-updater` added to deps + capabilities;
      `tauri.conf.json#plugins.updater` carries an endpoint stub
      (`releases/latest/download/latest.json`) and a `pubkey`
      placeholder. Replace `REPLACE_WITH_TAURI_SIGNER_PUBKEY` with the
      key from `cargo tauri signer generate` before first signed release.
- [x] `.github/workflows/release.yml` — runs on `v*` tags, drafts a
      release, builds + signs per-OS bundles via `tauri-apps/tauri-action`,
      then publishes. Reads `TAURI_SIGNING_PRIVATE_KEY` +
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from repo secrets.

### #31 — Tauri T5 dual-target build

- [x] `package.json` scripts: `build:web`, `build:native`, `build:all`.
      `build:web` is just `tsc -b && vite build`; `build:native` chains
      `tauri build` after the web bundle exists.
- [x] `.github/workflows/build.yml` — PWA job on every push (fast),
      native job matrix on `macos-latest` / `ubuntu-latest` /
      `windows-latest` with WebKitGTK system deps for Linux and the
      `Swatinem/rust-cache` action to amortise the cold cargo build.

---

## A11y residue (smaller than feature work, larger than micro-polish)

- [x] **LayersPanel rows**: converted to `role="option"` inside a parent
      `role="listbox"` — `aria-selected` now carries semantic weight. The
      embedded eye / lock / trash buttons technically violate strict
      listbox composability, but it's the long-standing convention in
      Figma / Illustrator / Sketch and Safari/Chrome ATs handle it.
- [x] **LayersPanel keyboard nav**: container is now `role="listbox"` with
      `aria-activedescendant`; Up/Down arrow, Home/End, F2/Enter to rename.
      Delete falls through to the global delete (already wired against the
      canvas active object). Arrow handler stops propagation so the global
      nudge handler doesn't fire when the listbox is focused.
- [x] **Mac `aria-keyshortcuts` Ctrl→Meta**: extracted `ariaKeyshortcuts()`
      helper into `runtime.ts`; MenuBar / CanvasContextMenu / CommandPalette
      / PropertiesPanel / Toolbar all route their combos through it. Mac
      SRs now announce `Meta+X` instead of `Ctrl+X`, matching the actual
      `⌘` press users make.
- [x] **PropertiesPanel `Row` helper**: now uses `useId` + `htmlFor` on
      the `<label>` and exposes the id to children via a
      `RowInputIdContext` / `useRowInputId()` hook. `ColorRow` opts in
      so the text input is properly associated with its label. The
      surface for migrating the remaining inline inputs is now available
      without breaking any existing call site.

## Micro-copy / zh follow-ups

- [x] `src/lib/formatRegistration.ts` description strings (svg/png/jpg/
      json/pdf/pdf-vector/dxf) wrapped in `t()`. Translation table
      added in `i18n.ts`. Translation freezes at registration time; if a
      future UI surface needs live language switching, convert the
      description field to a translation key consumed at render time.
- [x] `src/lib/ai.ts` tool descriptions — kept English by design.
      Documented the convention inline: the model is the primary
      reader (tool-selection accuracy degrades on translated specs);
      the AIPanel MCP modal is an inspect-the-internals view, not a UX
      surface.

## Lower-priority polish observations

- [x] TemplatesDialog tile names promoted to `<h4>`. Each tile is a
      subsection under the dialog's `<h2>` "Templates" title; the
      heading-outline tree now branches properly.
- [x] Toolbar tool buttons stay on `aria-pressed` (decision recorded:
      design-tool convention — Figma / Illustrator / Sketch all use the
      toolbar+aria-pressed shape rather than strict
      `role="radiogroup"` / `role="radio"`. axe doesn't flag it; mac
      VoiceOver announces "toggle button, pressed" which matches the
      visual semantic).

---

## Already done (just for reference — don't redo)

Heading outline sweep across right rail (h2/h3/h4) · defensive
`type="button"` across dialog footers + modals + MenuBar + dropdowns ·
WAI-ARIA tab pattern (3 tablists, full id/aria-controls/aria-labelledby) ·
IME `isComposing` guards on every Enter handler · `aria-busy` + verb-tense
+ `cursor: progress` for async buttons · transition-colors on all hover
states · zh translation sweep of every visible UI string · template
name/description i18n · `aria-current="page"` on HelpCenter topics · skip-
to-canvas link translated · AI Assistant heading + status dot a11y · color
picker popover dialog role + label · disabled-hint conditional tooltip on
AlignPanel buttons.
