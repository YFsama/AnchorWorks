# AnchorWorks Optimization Backlog — 2026-09-22 audit

Evidence-based audit (sourcemap build + code read). Baseline: entry `index-*.js` 1,143 kB raw / 217 kB gzip; 141 eager sources totaling 2,112 kB of source text. A parallel session is mid-edit on `epson*/plotter*/src-tauri` — those files are measured but excluded from recommendations.

**Status updates (2026-09-22, post-audit waves):**
- **P0-1 DONE** — viewport gate landed (`a3f179e`).
- **P0-3 PARTIAL / REVISED** — MenuBar's click-only libs lazy-loaded (`f92e4e8`, 59 sites) but the entry is byte-neutral: honest correction, MenuBar is sole eager pinner of only ~19 kB source. The REAL unlock chain is **App.tsx's static imports** (`commitDimension` from measureTool; formats/runtime/projectFile/updater) + CommandPalette's static measureTool proof names + freeDistort's static envelope pin — P0-2 must therefore start at App.tsx, then the P0-3 conversions already in place pay off automatically. A clean measureTool split (measureProof.ts, 140.5 kB) was executed, measured (entry GREW — back-compat re-exports re-link the eager graph), and reverted; redo it only together with the App.tsx/CommandPalette import changes in one coordinated pass.
- **P0-4 STARTED** — kit landed (`10beae5`): `src/components/ui/` (useRovingActions/ActionToolbar/PresetRow/ReviewedFooter/SearchableListActions, 36 tests incl. 16 DOM-equivalence cases) + 6 pilot dialogs migrated (−233 lines; also fixed a latent PrintDialog rAF/currentTarget crash). Follow-up batches A/B/C in the wave report; ~48 surfaces remain.


## P0 — highest value / effort

### P0-1. Guard `emitViewport` behind an actual viewport change
- Evidence: `src/lib/canvasEngine.ts:133` — `canvas.on('after:render', () => emitViewport())`. Fabric fires `after:render` on EVERY render (selection change, object drag, hover), not just pan/zoom. Consumers repaint synchronously in the same frame: `Rulers.tsx:66`, `GridOverlay.tsx:133`, `ArtboardLayer.tsx:144`, `GuidesLayer.tsx:70`. Each does a full-viewport `clearRect` + repaint; GridOverlay draws O(viewport/gridStep) line segments (~1,000 segments at 4px min step on 2560x1440); ArtboardLayer re-dims the whole viewport, re-punches every artboard with `shadowBlur` 8–24px (expensive) and re-measures every label, plus 4× `getComputedStyle` per draw (`ArtboardLayer.tsx:64-68,175-181` — local `cssVar` dupes of `lib/tokens.ts`).
- Cost: 4 full-canvas 2D repaints + style resolution per rendered frame during any drag; scales with artboard count and grid density. User-perceptible as dropped frames on 1000-object docs during selection drags.
- Change: in the `after:render` handler, diff the last 6-number `viewportTransform`; only `emitViewport()` when it changed (or on explicit `zoomTo*` calls). Also cache token colors in `tokens.ts` with a theme-change invalidation instead of per-draw `getComputedStyle`.
- Effort S · Risk low (pure event gating; zoom/pan e2e in `tests/e2e/zoom.spec.ts` protects).

### P0-2. Defer `measureTool.ts` (172 kB, 8.1% of eager sources) out of the entry
- Evidence: `src/lib/tools/measureTool.ts` = 3,737 lines / 176 kB, 79 exports. Imported statically by `App.tsx:132` (only `commitDimension`, used in a keyboard handler at `App.tsx:1157`), `MenuBar.tsx:24` (~90 functions), and lazy `CommandPalette.tsx`. 39 of its exports are a cookie-cutter `addMeasureProof*` family (`measureTool.ts:3159-3567`, each ~20-line find-or-create skeleton).
- Change: (a) in App.tsx, replace the static `commitDimension` import with a cached dynamic import inside the key handler; (b) MenuBar keeps static import — measureTool then becomes part of the MenuBar action-registry chunk (P0-3). Verify via `--sourcemap` that it lands in a lazy chunk.
- Effort S for (a), M with (b) · Risk low-moderate (single call site; menu path covered by HelpCenter/e2e).

### P0-3. MenuBar action indirection — decouple the 2,541-line MenuBar from ~200 kB of action libraries
- Evidence: `src/components/MenuBar.tsx` is 18.6% of eager sources (393.6 kB / 2,541 lines). Its import block (`MenuBar.tsx:4,24`) statically pulls `canvasEngine` (~250 named fns), `measureTool` (~90), plus eagerly-only-needed-on-click libs: `blend.ts` (31.2 kB), `io3.ts` (28.0 kB), `artboards.ts` (26.6 kB), `cleanUp`, `booleanOps`, `rasterize`, `masks`, etc. Vite already warns `formats/runtime/projectFile/updater` dynamic imports are defeated by MenuBar's static imports (build log, INEFFECTIVE_DYNAMIC_IMPORT x4).
- Change: menu rows already take `MenuItem { label, onClick }` (`MenuBar.tsx:2407`); switch heavy `onClick`s to a registry of lazy resolvers (`actions.run('blend.open')` → `await import('../lib/blend')`) and let the existing idle-warm pattern (App.tsx:112-117) prefetch after boot. Expected: 150–250 kB of sources leaves the entry (~30–50 kB gzip), first paint keeps the identical menu DOM.
- Effort M-L · Risk moderate (touch point for every menu action; mechanical but wide). Depends: P0-2.

### P0-4. Shared dialog-primitives package (`useRovingActions`, `<PresetRow>`, `<ReviewedFooter>`, `<SearchableList>`)
- Evidence: the README-documented dialog convention is copy-pasted 51 times: 85 `handle*ActionKeys` roving-tabindex handlers = 1,308 identical lines; 335 `review-status` regions; 431 `onFocus={() => setReviewed...}` wiring lines; 392 `data-*-action-review` attributes; 167 sr-only live regions; 7 Use-First/Clear-search recovery blocks. Per-dialog sample: SimplifyDialog 97/170 lines (57%) boilerplate; GrommetsDialog ~110/245; RhinestoneDialog ~150/279 (3 preset regions); FreeDistortDialog ~100/259; PrintDialog ~300/664 (6 regions); ShortcutsDialog ~250/495.
- Change: one hook (`useRovingActions(scopeId)` returning `{onKeyDown, reviewStatus, bind}`) + three components replicating current DOM byte-for-byte (same ids, `data-*` attrs, aria wiring — e2e a11y specs depend on them). Migrate the 6 sample dialogs first, then the long tail mechanically.
- Savings: ~2,500–3,500 lines net; also cuts eager+lazy chunk bytes and makes future dialogs ~60% smaller.
- Effort M (core + 6 dialogs), L (all 51) · Risk moderate (a11y regressions; protected by `tests/e2e/a11y.spec.ts` + shortcuts spec).

## P1 — clear wins, slightly lower leverage

### P1-1. Lazy `ShortcutsDialog` (24.2 kB eager)
- Evidence: `App.tsx:15` imports it statically while 40+ sibling dialogs use `lazy()` (App.tsx:29-59). It's a modal opened via `?`/menu — never first-paint.
- Change: one-line `lazy()` + Suspense, same as PrintDialog two lines below. Effort S · Risk trivial.

### P1-2. Coalesce `pushHistory` during bulk object adds (O(n²) → O(n))
- Evidence: `canvasEngine.ts:69-71` fires `pushHistory()` per `object:added/modified/removed`; `historyOps.ts:22-28` calls `History.capture` directly; `history.ts:37` serializes the ENTIRE canvas (`JSON.stringify(canvas.toJSON())`) per event. Generating 1,000 rhinestones = 1,000 full-document serializations. The recent hot-path fix (cutPaths guard, `history.ts:66-69`) helps but the canvas JSON round-trip remains per-event.
- Change: microtask-coalesce captures in `historyOps.pushHistory` (schedule via `queueMicrotask`, collapse to one `capture()` per tick) — preserves final-state semantics; `History.suspend/resume` already exists for programmatic batches as fallback.
- Effort S-M · Risk medium (undo boundaries); `src/lib/__tests__/historyPerf.test.ts` already pins capture-count behavior — extend it.

### P1-3. Idle-lazy `LayersPanel` + `layerOps` (244 kB combined, 11.6% of eager)
- Evidence: `LayersPanel.tsx` 166.1 kB + `layerOps.ts` 77.6 kB (layerOps imported only by LayersPanel). Panel is visible at startup but not needed for first canvas paint.
- Change: `lazy()` + render behind the boot rAF with a skeleton strip; keep interaction identical. Alternatively defer only `layerOps` via the P0-3 registry (its commands are menu/panel actions).
- Effort M · Risk low-moderate (panel appears ~1 frame-to-100ms late).

### P1-4. Unit tests for untested user-facing effect libs
- Evidence: no `__tests__` for `grommets.ts`, `rhinestone.ts`, `offsetPath.ts`, `roughen.ts`, `repeat.ts`, `roundCorners.ts`, `zigzag.ts`, `twist.ts`, `pathSimplify.ts`, `pathJoin.ts`, `pathEdit.ts`, `pathReverse.ts`, `findReplace.ts`, `rasterize.ts`, `grouping.ts`, `zOrder.ts`, `keymap.ts`. (Checked per mission: `plotterLink`, `hpglDebug`, `machineProfiles`, `nesting`, `csvMerge`, `pdfImporter` DO have tests.)
- Change: prioritize by blast radius: `keymap.ts` (19 kB, every shortcut), `pathSimplify`/`pathJoin` (destructive geometry), `grommets`/`rhinestone` (production cut output). Pure-fabric libs follow the existing stub-canvas pattern in `selectionOps.test.ts`.
- Effort M · Risk none. Depends: none.

### P1-5. Project save/load round-trip test (`io.ts`/`io2.ts`/`io3.ts`/`projectFile.ts`)
- Evidence: zero direct tests for the four files that own document persistence; only incidental coverage via `variableWidthPersist.test.ts`. No e2e uses `setInputFiles` at all (20 specs checked) — file open/import flows are untested end-to-end.
- Change: one round-trip unit test (build canvas → serialize → apply → assert objects/cutPaths/artboards) + one e2e opening a fixture SVG via chooser. Effort M · Risk none.

## P2 — worth doing when touching the area

### P2-1. Enable `strict` in tsconfig
- Evidence: `tsconfig.app.json` has `noUnusedLocals/Parameters` but NO `strict` — no `strictNullChecks`, no `noImplicitAny`. "tsc 0 errors" is against a lax config. Incremental plan: `strictNullChecks` first per-directory.
- Effort L · Risk high churn / low semantic risk. Do after P0 lands to avoid merge friction.

### P2-2. Undo/redo + Templates/Find-Replace e2e flows
- Evidence: no e2e exercises undo after an edit (only the shortcut binding in `shortcuts.spec.ts`); TemplatesDialog (394 lines), FindReplaceDialog (257 lines), PrintDialog (664 lines) have zero e2e. Preferences/variable-data/plotter console already covered.
- Effort M · Risk none.

### P2-3. Document-size performance regression test
- Evidence: `historyPerf.test.ts` pins call-counts with stubs but measures no wall time; nothing measures `capture()`/`loadFromJSON()`/render at 1k/5k objects.
- Change: a vitest budget test (soft assert `capture() < X ms` at 2,000 objects) using the existing `makeCutPaths`-style generator; catches P1-2 and future serializer regressions. Effort S-M.

### P2-4. `objectCaching=false` — document the trade-off, add escape hatch
- Evidence: `fabricBootstrap.ts:29` disables caching globally for zoom crispness. Correct for vector editing, but render cost becomes O(total path complexity) per frame; at 1000s of complex paths low-end machines will drop frames during drags (compounded by P0-1 until fixed).
- Change: leave the default; optionally re-enable caching only above a zoom threshold where blit-scaling is visually safe. Effort M · Risk moderate (visual regressions at zoom).

### P2-5. Helper micro-dedupes
- Evidence: `toHex(Uint8Array)` duplicated `epsonMaint.ts:63` / `plotterLink.ts:103` (both in excluded edit zone — note only); `hexToRgb` in `contrast.ts:29` vs `freeformGradient.ts:21` (different null-vs-throw semantics — unify behind one); `cssVar/cssVarA` in `ArtboardLayer.tsx:175-181` despite `lib/tokens.ts` existing precisely to replace them (fix rides along with P0-1 token caching).
- Effort S · Risk trivial.

### Measured but excluded (parallel session owns epson*/plotter*/src-tauri)
- Plotter family in the EAGER entry: `hpglDebug.ts` 38.1 kB + `plotterDiag.ts` 12.3 kB + `plotterLink.ts` 19.2 kB + `PlotterStatusChip.tsx` 15.1 kB ≈ 85 kB of sources — the same P0-3 registry would defer them once that session lands.
- `PlotterConsole` 2.5 s auto-poll is properly gated (`PlotterConsole.tsx:210-218`: only when `connected && autoPoll && !sending`) — no fix needed.

## Non-findings (verified healthy)
- Dependencies: all 12 runtime deps imported (jspdf/svg2pdf/pdfjs/html2canvas each isolated in lazy chunks; fabric/lucide fine).
- Dead exports: 0 unused across 8 largest lib files sampled (`layerOps`, `measureTool`, `blend`, `effects`, `keymap`, `io3`, `symbols`, `knife`).
- `useT` i18n selector (`i18n.ts:151-155`): template-string selector returns a primitive — zustand v5 `Object.is` equality means NO re-render fan-out on unrelated store writes; per-write cost is one string concat. Fine as-is.
- `History` cutPaths guard + immutable-array sharing: correct as landed.

## Verdict
The three highest-leverage moves: (1) **P0-1 viewport gate** — a ~10-line change that eliminates 4 full-canvas overlay repaints on every non-viewport render; it is the single biggest runtime win per line of code. (2) **P0-3 MenuBar action registry** — MenuBar's static imports are the root cause keeping measureTool + ~200 kB of click-only libraries in the entry chunk AND defeating four existing dynamic imports; fixing it (with P0-2/P1-1 riding along) should cut the eager entry by roughly a quarter. (3) **P0-4 dialog primitives** — 1,308 duplicated roving-handler lines plus ~3,000 lines of wiring across 51 dialogs is the codebase's dominant maintenance tax; a byte-compatible shared kit pays back on every future dialog. Everything else is opportunistic.
