# AnchorWorks Optimization Backlog — 2026-09-22 audit

Evidence-based audit (sourcemap build + code read). Baseline: entry `index-*.js` 1,143 kB raw / 217 kB gzip; 141 eager sources totaling 2,112 kB of source text. A parallel session is mid-edit on `epson*/plotter*/src-tauri` — those files are measured but excluded from recommendations.

**Status update (2026-11-24, pre-release audit before 0.19.0):**
- **Process gap, fixed in practice:** ESLint is a stated release gate (see the 0.18.0 commit) but is NOT run in CI and had not been run during waves 3–5 — it was red with 4 errors (`react-hooks/set-state-in-effect` ×3, `react-hooks/globals` ×1), all from those waves. Run `npx eslint .` with the other gates; adding it to the CI `test` job is an open item.
- **Verification gap, fixed in practice:** Playwright's `hover()`/`click()` scroll clipped targets into a scrollable ancestor's visible box, so every e2e that navigated nested menus passed while the flyouts were unclickable for a real mouse. Menu checks now use pointer coordinates + `elementFromPoint` (`tests/e2e/menu-flyout.spec.ts`, mutation-checked).
- **Fixed (details in CHANGELOG › pre-release audit):** Recolor Artwork unusable since it shipped (harvest only in an open-transition block that never fires under App.tsx's conditional mount); Variable Data gap estimate + Document Settings preset/orientation seeding (same mechanism); nested flyouts clipped by their panels' `overflow-y-auto` (menubar top-level = wave-3b regression; menubar depth-3+ and the whole context menu = pre-existing) → every flyout level `position: fixed` via `src/components/ui/useFlyoutPosition.ts`; context menu closing on its own wheel scroll; topbar controls unreachable below ~1310px → stepped compact mode.
- **Rule going forward:** any dialog mounted as `{showX && <Dialog/>}` must seed open-time state in `useState` initializers — a `prevOpen` reconciliation alone is dead code there. `src/components/__tests__/openSeed.productionMount.test.tsx` is the template (mount with the flag already set).
- **OPEN after the audit:**
  1. **Context menu is ~1800px tall** (43 direct rows + 20 submenus; visible box 540–810px). It now scrolls and every flyout works, but a context menu that needs scrolling is still poor UX — restructure to ≤ ~20 direct rows (group clipboard/z-order/etc. into submenus). In 0.18.0 everything below the first screen was unreachable.
  2. **Diagonal pointer moves across cascading submenus** switch to the sibling row's flyout (pure CSS hover, no intent delay / safe-triangle) — pre-existing; users must move right into a flyout before moving down. Needs a hover-intent design + tests.
  3. **ESLint in CI** (add `npm run lint` to the `test` job).
  4. The one-off "page freeze" the wave-4 harness saw while toggling Document Settings orientation (3-worker load, never reproduced singly) remains unexplained — the seeding bug it was blamed on is now fixed; re-run that interaction under load.
  5. v0.18.0 impact of the flyout/wheel defects is established by identical source structure, not by running a 0.18.0 build — worth a one-off confirmation on the tag.

**Status update (2026-11-21, wave-5 topbar declutter + Plotter tabs):**
- **Topbar right 24→7 DONE** — view toggles delegated to StatusBar/View menu; 16-button output strip → Plotter + Print + grouped More… dropdown (trigger = button + aria-haspopup; menuitem-in-toolbar fails aria-required-parent). print.spec entry path updated to the dropdown (same handshake, one extra hover).
- **Plotter dialog 3-tab reorg DONE** — Machine / Cut settings / Output, ≤8 numeric inputs per tab (was 17 flat), pinned action footer on every tab, smart default tab by connection state, preflight rejection jumps to Output. Unit suites (450) + card-behavior/dialog-fit green with assertion strength preserved.
- **Residuals:**
  - Cut-tab preset chips have slight style variance (Travel-rate active outline vs Feed-rate style) — visual polish pass candidate.
  - `window.confirm` double-track now also covers the two send() preflight rejections (PlotterDialog:874/958) beyond the previously logged Epson/plotter spots — unify on ConfirmHost in one sweep.
  - Material preset cards truncate their description lines by design (ellipsis); fine at current sizes.

**Status update (2026-11-21, wave-4 plotter auto-detect + card deep-tests):**
- **Plotter/engraver auto-detect DONE** — `runAutoSetup` orchestration (chip fingerprint → baud ladder → OI;/$I/$$ identification → light self-test → profile suggestion), Plotter-dialog top-level Auto-detect button with step panel, grbl-generic/grbl-laser profiles, optional spindle in the G-code generator (byte-identical when unset, M5 before homing), `$$`/`$#` console commands, laser/corner test patterns, diagnostics report now embeds identify + selfTest + grbl settings. 36 new unit tests. Remaining notes:
  - `buildCornerTour` hardcodes Z −1/+5 taps (not the user's pen Z) — small-Z-travel lasers may alarm on soft limits (test-button use, accepted).
  - `parseGrblSettings` doesn't tolerate grblHAL inline comments (`$32=1 (…)`) → such lasers suggest grbl-generic; official grbl 1.1 is fine.
  - `$$` full-table snapshots truncate to the first line on real links (query() returns at the first CR/LF); single-key fallbacks ($32/$130/$131) carry the decisions.
  - gcode jog re-queries travel limits per jog when the controller doesn't answer (fire-and-forget 2×900 ms).
  - Plotter/Epson still use native `window.confirm` in 3 spots alongside ConfirmHost (double-track confirm UX).
- **Card deep-tests DONE** — card-behavior.spec (44 dialogs × focus/footer/preset/reset/cancel/focus-return/objects-unchanged contracts, 3 batches ~90 s), confirm-behavior.spec (4 tests incl. the menu path), dialog-fit +Zig Zag/Multi-outline. Harness surfaced and the wave fixed two src defects: ErrorLog empty-log focus no-op (→ Close fallback), and the menu-row focus-restore :hover race (→ shared `restoreDialogFocus`, menu rows resolve to their `aria-haspopup` trigger). A third "fix" from that wave was wrong: Document Settings' seeding was moved to an open-edge effect and blamed for an unreproduced "render-time setState freeze" — the real defect was the conditional-mount seeding bug (see the 2026-11-24 audit), corrected there. Known residual:
  - **Reset semantics are three-headed** (Twist/Shear reset to 0 rather than the open value; SplitGrid/MarginGuides/TilePrint load a canonical preset rather than the open state) — a product decision to unify, not touched.
  - RecoveryDialog still has no UI-path test (mounts only from crash-recovery state; needs injection).
  - AIPanel with no API key auto-opens its Configuration modal on "Open AI Panel" — by design, pinned as-is.

**Status update (2026-11-21, wave-3b dialog viewport-fit):**
- **Dialog height caps DONE** — every modal now fits the window: 16 big dialogs restructured (pinned header/footer + scroll body, `max-h-[calc(100vh-4rem)]`), ~31 small cards mechanical `max-h + overflow-y-auto`, menubar dropdown panels `max-h-[calc(100vh-6rem)]`, whole-card-scroll trio (Epson/GangSheet/TraceArt) upgraded so footers no longer scroll out of reach. Wave-3 follow-up #5 (dropdown max-height) closed by this. Guarded by `tests/e2e/dialog-fit.spec.ts` (47 dialogs × 2 viewports + 9 menu panels × 2): card four-side fit, pinned footer clickable on first paint, close control reachable.
- **Notes for future waves:**
  - **Tailwind class-order reliance** — the common `overflow-hidden overflow-y-auto` combo only yields x-hidden/y-auto because Tailwind v4 emits `.overflow-hidden` before `.overflow-y-auto` in the generated CSS (verified in dist 4.3.3 via compile API + computed styles). Undocumented ordering; re-verify on Tailwind major bumps.
  - **EpsonMaintDialog is footer-less by design** (header + monolithic body); its actions scroll with content and only the header × is pinned. A pinned action row is a product decision away.
  - **PrintDialog right preview column `min-h-[280px]`** clips below ~470px viewport height — below the promised 600px floor.
  - **dialog-fit spec runtime** — the two 47-dialog cases are the heaviest e2e block (~2-3 min); iterate with `--grep dialog-fit`. `'Open AI Panel'` actually measures AIPanel's auto-opened Configuration Modal (the sidebar has no role=dialog) — if that default changes the spec fails loudly, which is the desired tripwire.

**Status update (2026-11-21, wave-3 UI-deep-dive: responsive layout + IA reorg):**
- **Responsive layout DONE** — desktop shells' minWidth 900→960 (decoupled from the 900px mobile breakpoint), viewport-aware panel clamp with `min(320px, 32vw)` mid-band terms synced between `useResizableWidth.ts` (MID_BAND_* constants) and the `.aside-right` CSS backstop, shrink-only resize fallback that preserves the persisted preference (new regression suite `src/lib/hooks/__tests__/useResizableWidth.test.tsx`), slide-over `min(280px,86vw) !important`, canvas 320px floor, 36 dialogs `max-w-[92vw]`, scrollable menubar strip with fixed-position dropdowns that re-measure on resize/scroll. Layout probe: 18/18 across 901–1440px (1024px → panel 288-304 / canvas ≥660).
- **IA reorg DONE** — MenuBar 6→9 top menus (File/Edit/Object/Type/Effects/Production/View/Insert/Help), 807→490 entries; CanvasContextMenu 629→147 (object-context core only). Zero commands lost: 300 removed entries verified byte-exact against CommandPalette (`C:\tmp\audit_aw\cp_coverage_removed.json`), 34 merges logged, Darken/Lighten blend kept as the only context-only pair. Tauri native shell menu synced (File/Edit/Object/View/Help). zh dict: +4 keys (Effects/Production/Stylize/Proof), 9 dead keys removed.
- **OPEN follow-ups from this wave:**
  1. **Unified command registry (P1)** — MenuBar, CanvasContextMenu, and CommandPalette still hand-write their own onClick wiring for shared commands (Send-to-Plotter had 6 entry points pre-reorg). One id→label/shortcut/run table consumed by all three surfaces is the structural fix; the wave-3 reorg moved blocks but did not introduce it.
  2. **"Simplified mode" progressive disclosure (P2)** — one toggle hiding the Production/Effects/Insert top menus and low-frequency submenus (~400 entries) behind CP-only; cheap now that menus are grouped, deferred to avoid scope-creep in wave 3.
  3. **`aria-valuemax` on the panel drag handle is static 560** while the effective ceiling is viewport-aware (`App.tsx` handle; SR users get a stale capability range on narrow windows).
  4. **Electron `loadWindowState` clamps a sub-960 restored width but not `x`** — a right-edge window restores 60px off-screen right (work-area intersection only rescues fully-offscreen).
  5. ~~**Dropdown panels lack max-height**~~ — **DONE in wave 3b** (`max-h-[calc(100vh-6rem)] overflow-y-auto`, guarded by dialog-fit.spec).
  6. ~~**First-open dropdown plays a ~150ms slide-in** from the off-screen parking spot~~ — **DONE in the 2026-11-24 audit** (panels transition opacity/visibility only, via the fixed-flyout positioning).
  7. **AIPanel ≤900px** still renders inline-capped (`max-w-[32vw]`) rather than joining the mobile slide-over mechanism.

**Status update (2026-10-31, dependency-refresh + tailwind v4 session):**
- **Eager-set health re-verified on the tailwind v4 build**: 13 chunks / 988 kB raw / **300 kB gzip** for the full first-paint chain (entry 293, fabric 285, react 208, canvasEngine 99, lucide 51 kB raw). All heavyweights (pdf.worker 420, jspdf 390, CommandPalette 366, fontkit 348, MenuBar 246, i18n-zh 228 kB; html2canvas was dropped from the dependency tree entirely in the 2026-10-31 refresh) stay lazy. The 2026-09-22→10-04 slim-down work survived the fabric 7 / lucide 1.64 / tailwind 4 upgrades — no action needed.
- **`pool: 'vmThreads'` REJECTED for vitest**: tried 2026-10-31 — 15 tests fail (shared-jsdom module-state leaks across files in the same VM) and env time only drops 73%→58% with no wall-clock gain (12.1s vs 11.6s). One-jsdom-per-file (default `threads` pool) is load-bearing isolation here.
- **axe Label-in-Name sweep DONE (2026-10-31, same session)**: all five a11y surfaces scan clean with `label-content-name-mismatch` re-enabled. Key implementation detail (from axe 4.14 source): `curateTokens` strips **parenthesised fragments** out of the accessible name before token-subsequence matching, so "(abbrev)" suffixes can never satisfy the rule — the working forms are an em-dash join ("Shape Builder — Shift+M", "Reg — Add positioning marks") or exact word-form inclusion ("Anchorworks Version v0.17.0" ⊇ "v0.17.0"). Command palette rows now carry NO aria-label (name computes from visible row content — always congruent). `page-has-heading-one` remains the only disabled rule — a page h1 would cascade every panel heading level (h3 by design) plus their byte-exact DOM snapshots; revisit only with a landing/marketing surface.

**Status updates (2026-09-23, wave 4):**
- **P1-7 DONE** — seam hair fixed (`9fbdfd3`): ringToBezierPathD collapses consecutive-duplicate runs incl. the wrap-around pair (the duplicate is a rotated-cycle trailing pair — naive last==first dedup missed it); knife's latent case fixed for free.
- **P1-8 DONE** — inward-overflow inversion fixed (same commit): returns [] on zero-area collapse | winding flip | miter-closer-than-|d| (red-run disproved the signed-area-only heuristic — convex inversions preserve winding); Cut Contour's existing 'no geometry' toast covers the UX. Red→green for both, zero legacy expectations changed, 12+1 tests.
- **P1-4 COMPLETE for the effect-lib tier** — batch 3 landed (`5efbed2`, 70 tests): pathReverse/freeDistort/scaleToSize/splitText/textToOutline/outlineEffect/outlineStrokeFill (pucker pre-existed). Deeper IO/UI libs (clipboard/selectionApply/svgImport/svgImport filters/eraserHitTest/scissors/pressureBrush/smartGuides) remain open-ended candidates, not blocking.
- **splitText data-loss edge fixed** (`5ed0dae`): zero-piece texts are kept instead of silently deleted without undo (found by batch-3 tests).

- **P1-6 DONE** — the off-origin outline-shift bug is fixed (`e019415`): d→scene mapping now subtracts `pathOffset` (d-bbox centre) instead of half-width/height, mirroring booleanOps.objectToRings; primitive fallback no longer double-transforms. 8 red→green tests + consumer cases in simplify/join/roundCorners; full suite + e2e green.
- **P1-4 now 15/17 core libs covered** — batch 2 landed (`cb606f5`, 144 tests): booleanOps/offsetPath/pathEdit/repeat/zOrder/grouping/twist/zigzag/roughen. Next tier candidates: pathReverse, pucker, freeDistort, scaleToSize, splitText, textToOutline, clipboard, selectionApply, smartGuides, svgImport.
- **NEW P1-7 (found by batch-2 tests):** `booleanOps.ts:236` → `pathOps.ts ringToBezierPathD` — polygon-clipping rings close by repeating the first vertex; the refit doesn't drop the duplicate, emitting a zero-length C whose control points reach ~⅓ of the neighbouring edge OUTSIDE the shape — a visible ~15px hair at every boolean-result seam corner. Fix: drop the duplicate closing vertex before refit (pathOps is the right seam; add a seam-corner case to booleanOps.test.ts).
- **NEW P1-8 (found by batch-2 tests):** `cutContour.ts offsetPolyline` — an inward offset exceeding the shape's half-extent returns an inverted LARGER ring (span 2·(|d|−halfExtent)) instead of vanishing. Fix: detect the self-intersection/inversion (signed area flip or winding check) and return null. One skip-with-reason test blocks on this.

- **P1-2 DONE** — capture coalescing landed (`7776fe0`): one flush per macrotask via queueMicrotask + a beforeNavigate seam for same-tick undo ordering; all legacy assertions unmodified; 1,000-object bursts go 1,000 serializations → 1.
- **P1-3 DONE** — LayersPanel delay-mounted behind a skeleton (`3b7e207`): entry 1,088.9 → 956.2 kB (gzip 177.1); panel+layerOps in their own 120.9 kB chunk.
- **P1-4 PARTIAL (6/17)** — keymap, pathSimplify, pathJoin, roundCorners, grommets, rhinestone covered (`9348b36`, 110 tests). Remaining candidates: addAnchors, alignDistribute, booleanOps, offsetPath, outlineEffect, pathEdit, pathReverse, rasterize, repeat, roughen, splitText, textToOutline, twist, zigzag, pressureBrush, freeDistort, smartGuides, scaleToSize, zOrder, grouping (pick by blast radius).
- **P1-5 DONE** — projectRoundTrip.test.ts (v2 envelope through fabric's real class registry) + first file-open e2e (`9348b36`).

**NEW P1-6 (bug found by P1-4 testing, needs dedicated pass):** the outline rebuild pipeline in `contourFromSelection.ts:63-72` emits output coords = input d coords + (obj.left, obj.top) — exact only when a path's d-bbox starts at the origin without stroke padding; with fabric's default strokeWidth:1 every rebuild also carries a ±0.5px shift. Affects pathSimplify/pathJoin/roundCorners (shared pipeline). Tests pin the well-behaved case; fix requires reasoning about the calcTransformMatrix/originX composition shared with booleanOps/cutContour/knife/envelope — high blast radius, do with fresh tests for each consumer.

- **P0-1 DONE** — viewport gate landed (`a3f179e`).
- **P0-2 + P0-3 DONE** — coordinated pass landed (`bc50b78`): measureTool split (36.2 kB eager core / 140.7 kB measureProof on-demand chunk, runtime-verified 0 boot fetches), App commitDimension cached-dynamic, MenuBar+CommandPalette 82 sites each converted, ShortcutsDialog lazy (P1-1 DONE), updater import dynamic (warning gone). Entry 1,147.9 → 1,088.9 kB (gzip −15.1).
- **Unlock-chain pass DONE (2026-10-03)**: formatRegistration's heavy deps (plotter/cutOptimize/pltImporter/pdfImporter/io2/printPrep/svgImport ≈ 112 kB sources) now resolve inside export/import closures; measureTool unpinned via the `measureState.ts` micro-split (4 sync mouse callbacks + dragging state; re-exported, zero consumer edits); tauriMenu mount-effect + projectFile call sites cached-dynamic; runtime/formats "ceremonial" dynamic imports reverted to static. All four INEFFECTIVE_DYNAMIC_IMPORT warnings cleared except io3 (left deliberately — see below). With the plotter-chip deferral this session took the entry 956.3 kB raw / 177.1 kB gzip → 858.1 / 143.6 (−33.5 kB gzip, −18.9%). Tauri-shell-only paths (native menu/deep-link) reasoned through but not smoke-tested in a real shell.
- **P0-4 BATCH C + GAP B DONE (2026-10-03)**: every remaining batch-C surface rides the kit — PropertiesPanel (all 8 handler families, wrap-verified from HEAD; fixed a latent React 19 rAF crash where the transformUnit handler read the nulled `event.currentTarget` so focus never moved), Assets/Symbols (2-D grids → `makeGridKeys`), Artboards (vertical list + size presets), Character/Align/StatusBar, Debug/AI, and LayersPanel last (146-button search toolbar via `externalStatus`; layers e2e stayed green). Gap B landed too: `PresetItem.radio` (role="radio" + aria-checked) with the Transform/ShearDialog inline radiogroups retrofitted byte-identically. Deliberate keeps (all argued + frozen): Symbols naming-toolbar handler (the only roving container in the codebase where the fallback path is REACHABLE — auto-focused input inside; needs a kit `fallbackIndex` option), AIPanel's 8 containers (ActionToolbar's mandatory aria-describedby would add dangling refs / new live regions), DebugPanel's tablist (selected-roving shape the kit doesn't model). Known kit divergences, all unreachable-in-Chromium and frozen in tests: `preventDefault`-before-`guardEmpty`, `Math.max(0, findIndex)` vs asymmetric fallback (Firefox keeps focus on newly-disabled buttons — if roving regressions ever show up there, add `unmatchedBase`), `skipDisabled` also filtering `aria-disabled`. Tail pass (2026-10-03): `aria-busy` passthrough + `fallbackIndex: -1` landed, AIPanel's busy buttons ride a new `ActionButton` primitive and SymbolsPanel's naming toolbar (the reachable-fallback container) is fully on the kit — no legacy roving handlers remain anywhere.
- **P0-4 BATCH B + KIT GAPS DONE (2026-10-03)**: the kit grew `disabled`/`aria-label` passthrough (PresetItem/FooterAction), `makeRovingKeys({ axis: 'vertical' })`, `makeGridKeys({ columns })` (byte-aligned with the legacy template-grid contract), and ActionToolbar `externalStatus`/`statusContent`/`'radiogroup'` role. Six of the seven heavy dialogs migrated behind frozen-DOM + keyboard-behavior snapshots (FindReplace 257→236, DocSettings 373→353, Separations 280→264, Preferences 797→782 — e2e preferences-wheel + axe stayed green, Templates 394→349, VariableData 767→672; −308 net lines while gaining kit reuse). **RecoveryDialog deliberately skipped** (one 16-line handler; migrating needs two one-off kit capabilities — negative ROI).
- **P0-4 PILOT + BATCH A DONE** — kit landed (`10beae5`) + 24 chip-preset dialogs migrated (`11f08a2`, 93 roving handlers → factory calls, 12 new equivalence cases; fixed TilePrint's latent rAF/currentTarget crash).


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

### P2-1. Enable `strict` in tsconfig — **DONE (2026-10-04)**
- The feared churn never materialized: measured with CLI overrides before flipping, the entire `src/` tree AND `vite.config.ts` already pass full `--strict` with **0 errors** (verified the measurement itself with a planted violation probe). The flip is one line each in `tsconfig.app.json` / `tsconfig.node.json`; `tsc -b`, full vitest and the vite build all stayed green. The 2026-09-22 audit's "lax config" concern is retired — the safety net is now enforced, not just coincidental.

### P2-3. Document-size performance regression test — **DONE (2026-10-03)**
- `src/lib/__tests__/perfBudget.test.ts`: 2,000-object mixed documents guard `History.capture()` (budget 500 ms vs ~37 ms median) and the JSON-parse + classRegistry revival path (budget 1,200 ms vs ~89 ms median), 5-sample median after warm-up, ~10× headroom to stay quiet on slow CI; the render measurement is an explicit `it.skip` (jsdom has no rasterizer — belongs in a real-browser harness). Red-verified: 100× tighter budgets fail with full diagnostics.

### P2-4. `objectCaching=false` — document the trade-off, add escape hatch — **DONE (2026-10-04)**
- Trade-off documented at `fabricBootstrap.ts` head (why off by default: zoom crispness / cut-path precision; cost: O(total path complexity) per frame). Escape hatch shipped: a Preferences → Editor "Object caching" segmented control (`off` default / `zoom`) persisted in its own localStorage key; `zoom` mode enables per-object caching only at zoom ≥ 4× with a `lastApplied` memo as the throttle (one O(n) walk per threshold crossing, prototype defaults restored exactly on off, direct property assignment = zero events/history impact). 20 tests; default-off path proven side-effect-free. Known gap: no pixel-level visual regression here — the ≥4× softness call needs a real-machine eyeball (toggle back to off to compare).

### P2-2. Undo/redo + Templates/Find-Replace e2e flows — **DONE (2026-10-04)**
- Wave 1: `undo.spec.ts` (3), `templates.spec.ts` (2 — 2-D grid keyboard + external live region), `findreplace.spec.ts` (1). Wave 2: `print.spec.ts` (4 — PrintDialog's first e2e ever; presets/orientation/margins/print-prep handshake, never actually prints), `templates-filters.spec.ts` (3 — search/category filters + empty states incl. the 3-button variant), `findreplace-options.spec.ts` (2 — match-case both directions + recipes driving real field fills and a real replace). All stable across repeat runs, role/name/aria-state anchors only.

### P2-5. Helper micro-dedupes — **DONE (2026-10-03)**
- `toHex(Uint8Array)` now lives once in `src/lib/hex.ts`; `epsonMaint.ts` / `plotterLink.ts` re-export it (export surfaces unchanged, zero test edits). `cssVar/cssVarA` in `ArtboardLayer.tsx` replaced by the `lib/tokens.ts` alias import (Rulers/GridOverlay precedent) — that was the last copy. `hexToRgb` in `contrast.ts` vs `freeformGradient.ts`: **resolved as intentionally separate** — one is a strict parser (null on failure, rgb() support), the other a lenient never-fail normalizer for internal gradient stops; merging would add indirection and semantic risk for near-zero gain. Cross-reference comments added in `freeformGradient.ts`.

### Plotter family eager deferral — **DONE (2026-10-03)**
- The previously excluded zone is clear: `StatusBar.tsx` now lazy-loads `PlotterStatusChip` behind a pixel-matched skeleton (250 ms mount timer, LayersPanel pattern), moving `hpglDebug` + `plotterLink` + `plotterDiag` + `plotterRecords` + the chip (~93.5 kB sources) out of the entry — **956.3 kB raw / 177.1 kB gzip → 917.0 / 162.6 kB (−14.5 kB gzip)**. e2e smoke + a11y green.
- PlotterConsole's 2.5 s auto-poll remains properly gated (`PlotterConsole.tsx:210-218`: only when `connected && autoPoll && !sending`) — no fix needed.
- Next unlock in this chain: ~~`formatRegistration.ts:24` statically pins `plotter.ts`~~ **all cleared (2026-10-04)**: the formatRegistration closures, measureState split, projectFile/tauriMenu cached-dynamics and finally io3 (App/CanvasView/AssetsPanel/MenuBar all switched to cached-dynamic loaders; AssetsPanel kicks the fetch at module-eval so its frozen first-frame tests stay synchronous) left the entry. **INEFFECTIVE_DYNAMIC_IMPORT count: 0.**
- **>750 kB chunk advisory resolved (2026-10-04)**: composition audit showed MenuBar.tsx alone was 53.4% of the entry (451 kB minified — vendor split was already done, zero node_modules left in the entry). MenuBar now lazy-loads behind a pixel-matched same-height skeleton (`MenuBarSkeleton`, aria-hidden, import fires on first render — no timer), taking blend/envelope/printMarks & co. with it. **Entry: 956.3 kB raw / 177.1 kB gzip at session start → 375.5 / 101.1 kB (−60.7% raw / −42.9% gzip; this round alone 844.7→375.5 raw).** Deliberately abandoned (per audit): vendor-split migration to advancedChunks (zero gain), MenuBar shell/data refactor (same gain, disproportionate risk), the small right-rail panels (all <5 kB gz each, ×5 skeleton/CLS risk), canvasEngine (first-frame canvas init). Optional future: PropertiesPanel subtree idle-mount (−91.9 kB raw more) — deferred pending real-world feel of the MenuBar strip.
- **Firefox roving verification closed (2026-10-04)**: full e2e suite green on Firefox 150 (46 passed + 2 cold-start chunk flakes, fixed with a generous first-paint timeout in palette.spec). The suspected divergence (Firefox keeping focus on newly-disabled buttons) was probed with a real two-browser test: disabled controls don't dispatch user keydowns in EITHER browser, so the kit's unmatched-focus fallback path is unreachable for real keyboard input everywhere — no code change needed, evidence over assumption. `playwright.config.ts` gained a `RUN_FIREFOX=1`-gated firefox project; default chromium-only behavior unchanged.

## Non-findings (verified healthy)
- Dependencies: all 12 runtime deps imported (jspdf/svg2pdf/pdfjs each isolated in lazy chunks — html2canvas was removed from the tree in the 2026-10-31 refresh; fabric/lucide fine).
- Dead exports: 0 unused across 8 largest lib files sampled (`layerOps`, `measureTool`, `blend`, `effects`, `keymap`, `io3`, `symbols`, `knife`).
- `useT` i18n selector (`i18n.ts:151-155`): template-string selector returns a primitive — zustand v5 `Object.is` equality means NO re-render fan-out on unrelated store writes; per-write cost is one string concat. Fine as-is.
- `History` cutPaths guard + immutable-array sharing: correct as landed.

## 2026-11 improvement-wave candidates (from docs/research-competitive-2026-11.md)

### W1. Prune the imageHandoff variant family — **DONE (2026-11, 5da7668)**
212 exports → 9 (−5,576 lines): all ActiveArtboard twins, the ~36 report
families, and all 9 CI workflow generators deleted; the real core kept
(Report/Tsv/Json/SourceManifest/collect+verify scripts/checklists). Menu
212→9, palette 212→9, 203 zh keys dropped; i18n orphan-key guard stayed
green throughout.

### W2. Image Trace → editable vector art — **DONE (2026-11, 671f2ea)**
`Document → Trace to Vector Art…`: per-cluster evenodd paths (holes for
free, no ring classification), worker progress, live preview, one-undo
group insert. Follow-up found by its own tests: **k-means luminance-
percentile seeding merges small colour clusters at extreme area ratios**
(fix = k-means++ or histogram-peak seeding — affects the existing
multi-colour cut trace too). Other follow-ups: "replace source image"
toggle; per-ring containment classification if per-ring export is ever
needed; PNG pHYs dpi metadata read on upload.

### W3. Segmented linear drift compensation — **DONE (2026-11, 647c6ab + 454b7db)**
cutDrift.ts lib (19 tests) + plotter output seam + PlotterDialog UI with
live correction preview. Open verification: the originBottomLeft=true Y
flip path and the drift+ARMS mark-rect interaction were reasoned through
but only the unflipped path is seam-tested.

### W4. AI generate-then-cut — effort M, NEXT UP
Free/self-hostable OpenAI-compatible `/v1/images/generations` endpoints
(Pollinations, local ComfyUI bridges) → generated bitmap on canvas →
Trace to Vector Art (W2) → Make Sticker. The prompt→cuttable-sticker
one-click chain Kittl hasn't closed and Cricut charges credits for. The
manual chain is now three steps; productize the chaining.

### W5. Small follow-ups from the 2026-11 independent review — **DONE (2026-11, 647c6ab)**
Import duplicate detection + newer-version warning, accelMmS2/headUpS on
user cards, all 6 `it.todo` tests landed (masks ×4, strokeAlign ×2).

## Verdict
The three highest-leverage moves: (1) **P0-1 viewport gate** — a ~10-line change that eliminates 4 full-canvas overlay repaints on every non-viewport render; it is the single biggest runtime win per line of code. (2) **P0-3 MenuBar action registry** — MenuBar's static imports are the root cause keeping measureTool + ~200 kB of click-only libraries in the entry chunk AND defeating four existing dynamic imports; fixing it (with P0-2/P1-1 riding along) should cut the eager entry by roughly a quarter. (3) **P0-4 dialog primitives** — 1,308 duplicated roving-handler lines plus ~3,000 lines of wiring across 51 dialogs is the codebase's dominant maintenance tax; a byte-compatible shared kit pays back on every future dialog. Everything else is opportunistic.
