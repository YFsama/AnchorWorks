# Sticker / Decal Design & Print-and-Cut — Research Digest (2026-10)

Sources distilled for the 2026-10 sticker/decal/print-cut wave. Every implemented number
below traces to a vendor spec, a print-shop design guide, or a hardware-validated
open-source cutter implementation. Companion changelog entry: `[Unreleased]` in
`CHANGELOG.md`.

## 1. Die-cut sticker geometry (white border / bleed / safe area)

| Quantity | Value | Source |
|---|---|---|
| White border default | 2.54 mm (0.1") | Sticker Mule FAQ |
| White border minimum | 1.59 mm (1/16") | Sticker Mule FAQ |
| Bleed beyond cut line | 3.175 mm (1/8") standard; 1–2 mm accepted | StickerYou, MCRL |
| Safe area inside cut line | ≥ 2 mm | StickerApp |
| Offset join type | **Round** (miter spikes on concave corners; then simplify nodes) | Diginate, Signs101 |
| Corner radius (rect stickers) | 2–5 mm | Paperlust |
| Kiss-cut gutter (sheets) | 1.59 mm hard min, 3–6 mm typical | Standout Stickers, MCRL, NextDayFlyers |

The pro pipeline (Illustrator manual / Cricut "Create Sticker" / Silhouette Offset panel /
Sticker Mule proofing): **union artwork → round-join offset → white underlay → die line**.
Implemented as `makeSticker()` + Make Sticker dialog (`Ctrl+Alt+K`).

## 2. Print-then-cut registration marks

| System | Geometry | Notes |
|---|---|---|
| **Graphtec ARMS** (CE7000/FC) | Type-2 marks ("square" in the machine menu — physically four inward L-brackets, one per corner of the mark rectangle), **20 mm arms, 0.7 mm stroke, 100 % K**; marks ≥50 mm from edges; mark rect ≥60×60 mm; cut ≥1 mm inside | open-graphtec-server `marks.py` (FC9000-validated), CE7000 manual |
| **Silhouette** (Cameo/Portrait) | L marks, **10 mm arm, 0.25 mm line** | inkscape-silhouette `Graphtec.py` (TB51,400 SU / TB53,10 SU) |
| **Roland CAMM-1** | L crop marks ~**25 mm arms / 0.5 mm**; ≥15 mm feed-direction offset; ≥5° skew fails | GX-24 Print&Cut guide, Roland support |
| Cricut sensor | corner box marks; 100 % scale, matte paper | help.cricut.com (closed protocol — output-only) |

ARMS command block (GP-GL `TB`, ETX-terminated, 0.1 mm steps) — implemented in
`plotter.ts` for the Graphtec dialect:

```
TB99␃ TB51,<arm×10>␃ TB52,<type>␃ TB54,0,0␃ TB55,1␃ TB24,<w×10>,<h×10>␃ TB99␃ … TB0␃
```

Silhouette autodetect equivalents: `TB123`/`TB124` (quad). Roland's mark-read extension
is proprietary → manual alignment fallback. 4-point registration corrects position +
rotation + scale; 2-point only translation/rotation.

**Print scale is the #1 failure**: print "fit to page" rescales everything. Mitigation
implemented: 50 × 9 mm scale-check block (Graphtec Start-Mark dimensions — measurable
with a ruler) + print-at-100% note.

## 3. Cutting quality

- **Blade (drag-knife) offset**: 0.25 mm typical for 45° blade; too low → rounded
  corners, too high → hooks. Corner-loop geometry (validated by Siser-Command-v4):
  at turns ≥15°, overshoot `B + v1·d`, bowed cubic return to `B + v2·d`; merge corners
  closer than the offset; rotate closed-path seams to an edge midpoint. Implemented as
  `applyBladeOffset()`.
- **Overcut**: default off (Roland) / 0.5 mm when corners don't sever (mh365).
  Both overcut and blade offset exposed in the Plotter dialog.
- **45° vs 60° blade**: 45° general purpose; 60° for small text, tight inner corners,
  thick/glitter materials.
- **Multiple light passes beat one heavy pass** for glitter/HTV.
- **Cut order**: inner-first (release holes before contours); weeding box around the
  job; kiss cuts before the perf border (sheet stays anchored) — implemented as the
  through → kiss → perf kind ordering.
- Materials: Oracal 651 ≈ 12–20 gf; Siser EasyWeed 80–90 gf, mirror, 45°; Glitter HTV
  150–190 gf, 60°, ≤30 cm/s, 2 passes. In `MATERIAL_PRESETS`.

## 4. RIP/export conventions

- **Spot colour `CutContour`** (100 % magenta, hairline) — Roland VersaWorks matches the
  name; Mimaki RasterLink7 accepts any name *prefixed* `CutContour`; `PerfCutContour`
  for kiss/perf. Implemented in the "with cut layer" SVG/PDF exports.
- ISO 19593-1 processing steps (PDF layer `GTS_ProcStepsType=Cutting|PartialCutting`)
  is the modern standard — future work for the PDF writer.
- PLT/HP-GL: 1016 units/in (25 µm); GP-GL: 0.1 mm steps, `M`/`D`, `TB0` end.

## 5. Curved-surface decals (表面涂装)

- **Cylinder**: flat rect, width = π·D (+ overlap), height = label height.
- **Cone/frustum**: annular sector, **R = L·D/(D−d), r = L·d/(D−d),
  θ = 360°·(D−d)/(2L)** (verify: R·θ = π·D). OnlineLabels tapered generator,
  BlockLayer, ConeCalc. Implemented in `surfaceWrap.ts`.
- **Sphere**: n gores, height π·D/2, max width π·D/n, half-width (π·D/2n)·sin(t).
  Templatemaker.nl convention.
- Vinyl layers: multi-colour decals = one cut file per colour + registration marks cut
  into every layer; transfer tape; wet application for large flat surfaces, dry for
  small/detailed. Cast vinyl for compound curves, calendered for flat.
- Weedability floor: strokes/gaps ≥ ~1.5–2 mm on adhesive vinyl; islands need bridges
  or reverse weeding.

## 6. Implemented in waves 2–5 (2026-10); remaining backlog

Wave 2: weedability linter, Cricut-style auto-bleed (ring-draw), layered-vinyl per-colour
jobs with shared marks, convex-hull skyline nesting, estimate surcharges, ISO 19593-1 OCG
processing steps (inline-dict BDC; pdfjs round-trip verified).

Wave 3: shared raster-EDT kernel (chamfer + labels + scanline fill), weedability
thin-feature v2 (connected-erosion bisection — pinch necks caught), HQ nearest-colour
bleed mode, physics trapezoidal time model + per-material accel/head-up constants +
"≈ (physics)" second estimate + CutPreview eta override, per-layer mirror, layer trap.

Wave 4: Production Preview — live imposed-sheet preview (true-shape nesting, baked
bleed, cut overlay, regmarks, utilization) with one-step apply; selection-derived
contour filtering.

Wave 5 (backlog completion): raster occupancy-grid nesting (`nestPolygonsRaster`,
interleaves concave parts), CutTime radius→speed corner model replacing the turn-angle
proxy, per-layer DXF export + trap dry-run preview + tolerance guidance, cut-path-masked
bleed (smear only along cut lines), Graphtec Data-Link CODE39 band print-side encoder.

Wave 6 (legacy fix + completion): Data-Link TCP transport (Tauri Rust commands +
protocol library + dialog, hardware validation pending), part-in-hole nesting
(RasterNestItem.holes), >=3-lobe pinch localization, rasterNest lazy-loading +
right-edge guard fix.

Still open:

- Data-Link hardware validation: waves 5–6 ship the full print-side band + TCP
  transport + protocol library + dialog; what remains is running it against a real
  networked FC/CE cutter (connection persistence semantics, d1 status values, d6
  necessity, reg-vector pre-scan flow).
- Full NFP+GA nesting (SVGnest-class web-worker GA) — the raster grid now covers the
  concave-shape cases; NFP would add speed at fine rotations.

## Source index (primary)

- open-graphtec-server — ARMS/Data-Link protocol + mark specs (github.com/Fieldkit-Print/open-graphtec-server)
- inkscape-silhouette — Silhouette TB dialect (github.com/fablabnbg/inkscape-silhouette)
- Siser-Command-v4 — blade-offset corner loops (github.com/crazymrzing-prog/Siser-Command-v4)
- mh365-plotter — HP-GL subset, overcut/passes, calibration (github.com/mkabatek/mh365-plotter)
- Sticker Mule FAQ/support — border + cut-line specs (stickermule.com)
- Silhouette School / silhouette-secrets — offset + reg-mark practice
- help.cricut.com — Print Then Cut + Create Sticker
- Mimaki RasterLink7 Reference — CutContour prefix matching
- OnlineLabels / BlockLayer / ConeCalc / Templatemaker — wrap geometry
- USCutter forums / SignWarehouse / Siser HTV cutter-settings PDFs — force/speed/blade tables
