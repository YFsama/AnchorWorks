# Competitive Landscape & Product Gaps — Research Digest (2026-11)

Sources distilled by the 2026-11 improvement session (vendor sites, pricing pages,
Reddit/forum seller threads, and a code-level audit of AnchorWorks v0.18.0 so every
"we lack X" claim is verified against `src/lib`). Decisions taken from this digest are
marked **SHIPPED THIS WAVE** / **BACKLOG**.

## 1. Competitor snapshot (what they win on)

| Product | Position | Killer capability we lack | Evidence |
|---|---|---|---|
| **Kittl** | Sticker/POD design, hottest online tool | Content library (10k+ illustrations, Monotype fonts), AI vector/image generator, built-in mockups, real-time teams. Known weakness: **exports carry no cut contour** — users bolt on VectoSolve / Cut Line Pro | kittl.com/pricing; stablecommerce.ai Kittl/Etsy review; vectosolve.com/sticker-cut-line |
| **Linearity Curve** | Apple-ecosystem vector editor | Pen-first iPad experience, Auto Trace (Sketch/Illustration modes), cloud sync. No print&cut story at all | linearity.io/curve/whats-new |
| **Cricut Design Space** | Consumer cutting | **AI Project Designer** (2026-10): conversational "generate a ready-to-cut design", 1 AI credit per generation | cricut.com/blog AI Project Designer launch post |
| **Silhouette Studio 5** | Consumer cutting | Starter Mode; closed asset store. Community sentiment poor (bug-driven downgrades to 4.5) — our quality bar is a differentiator | r/silhouettecameo release threads |
| **Flexi (SAi)** | Pro sign shop RIP | ICC colour management chain, white-ink preview, gang-sheet tooling, DTF/DTG direct output | thinksai.com/products |
| **SignLab 11 (Fiery)** | Pro sign shop | Vectorization Previewer (live trace-param preview), Fit To Shape, **Power Weed Text Lines**, PDF cutter support | Fiery SignLab 11 announcement |
| **VinylMaster / Easy Cut Studio** | Budget pro cutting | Nothing fundamental — ARMS contour cutting, nesting both present there and here | vinylmaster.software |
| **LightBurn** | Laser (highest user overlap) | **Materials Library** (`user-editable` material cards + `.lbvendor` single-file community/manufacturer distribution), Camera Print and Cut (2.2), buy-once pricing ($99/$199) proving willingness to pay | lightburnsoftware.com 2.1/2.2 posts; docs VendorBundles |
| **Inkscape 1.5** | Open-source baseline | Live Path Effects (non-destructive, stackable parametric effects); new PDF engine | wiki.inkscape.org 1.5 release notes |
| **Affinity 3 (Canva)** | Free pro editor | Went **free** in 2025-10 — "free professional vector tool" is no longer our differentiation; the print/cut production chain is | canva.com/newsroom |
| **Illustrator 30.x** | Industry standard | Text-to-Vector, Generative Shape Fill, Text to Pattern, Generative Recolor/Expand | adobe.com/products/illustrator/ai |

## 2. Evidence-backed seller pain points (2026)

1. **Print-then-cut misalignment is pain #1**, scattered across the chain: laminate glare
   defeats mark sensors (r/silhouettecameo), print-to-PDF-then-print rescaling (our
   50×9 mm scale-check block already answers this), and **progressive drift down long
   pages** (top cuts true, bottom drifts) — **no consumer tool ships per-region linear
   drift compensation. Vacuum.**
2. **Design/cut toolchain split**: Kittl users need third-party web tools to add cut
   lines; Illustrator registration marks unreadable by ScanNCut.
3. **Weeding/laminating/packaging is the manual time sink** — SignLab's Power Weed Text
   Lines (weed lines between text rows) is a cheap-to-clone relief valve.
4. **Gang sheets are the standard DTF/UV-DTF order form** — free web tools (DTFBuild:
   100+ PNGs auto-nested, PNG/PDF out) commoditize exactly the engine we already ship
   (rasterNest + productionPreview).
5. **AI is flattening design's entry barrier** ("describe → get a producible design").

## 3. Decisions

### SHIPPED THIS WAVE (2026-11)
- **User Materials Library** (LightBurn parity): save-current-settings-as-material
  card, user card management, JSON import/export for community sharing. LightBurn's
  materials library is its stickiest feature; ours was 9 read-only cards.
- **Data-safety feedback fixes**: autosave/artboard quota failures surface to the user
  instead of silently disabling protection; cut-contour geometry degradation logs;
  embed-failure feedback; AI context-capture failure feedback.
- **Tauri shell CSP** (was `null`): script-src 'self' etc. — see `tauri.conf.json`.

### BACKLOG (ranked, not scheduled)
1. **Image Trace → editable vector art** (effort M): we already ship k-means colour
   clustering in the trace worker; missing is per-cluster → filled Path groups (layer-
   editable art), plus SignLab-style live parameter preview. Highest-value entry-side
   gap: every seller's starting point is a bitmap (Procreate/Kittl AI output).
2. **Gang Sheet Builder mode** (effort S-M): batch-drop files → nest to custom roll
   width → one-click finished-sheet export. Engine exists (rasterNest); needs the
   productized entry point. Consider for next wave.
3. **Segmented linear drift compensation** (effort S-M): enter measured top/bottom
   offsets, interpolate per-y correction into cut coordinates. Industry vacuum —
   nobody ships this.
4. **AI generate-then-cut** (effort M): free/self-hostable endpoints (OpenAI-compatible
   base URL), generated bitmap → auto-trace → auto Make Sticker. The "prompt →
   cuttable sticker" one-click chain Kittl hasn't closed and Cricut charges for.
5. **Power Weed Text Lines** (effort S): weed lines between text rows; we already have
   the bridge/weed primitives.
6. Camera-assisted alignment (effort M-L; ArUco-tagged page + phone photo perspective
   solve) — after drift compensation.
7. Not pursued: real CMYK/ICC pipeline (L, desktop-printer audience), CRDT
   collaboration (L, single-operator market — LightBurn proves this market doesn't pay
   for collaboration), Inkscape-style LPE (architecture-level).

## 4. Codebase-health findings from the same session

- `src/lib/imageHandoff.ts` (4,121 lines) confirmed as self-generated make-work
  residue (36 report families × 3 formats × 2 scopes + 9 CI workflow generators; its
  only consumers are the 212 menu items / 212 palette commands generated alongside
  it). Pruning precedent exists (commits 33ee5f9, 9d34fa5). Candidate for a dedicated
  prune wave — ~10k lines of cognitive load.
- i18n dictionary has **0 true orphan keys** (guard tests healthy).
- History stack bounded (100 snapshots), store has no unbounded arrays, error log is
  a 200-entry ring buffer — the historical "loop-generated bloat" fear does not apply
  to the rest of the codebase.
