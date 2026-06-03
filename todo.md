# TODO — Anchorworks / Vector Studio

Outstanding work after the Illustrator + SignMaster parity loop. All actionable
**P0–P2** items in `PARITY_BACKLOG.md` are done (155 checked, 0 unchecked), plus a
long tail of operation-convenience refinements. What remains is split into:

1. **Blocked** — needs a dedicated run + a user decision (data assets / bespoke
   engines / deep interaction work). Not safe to do silently in the surgical loop.
2. **Deferred / nice-to-have** — small parity gaps the loop deprioritised; each is
   doable but low marginal value.
3. **Known warnings / tech debt** — non-blocking, worth cleaning when convenient.

Status legend: `[ ]` todo · `[~]` blocked/partial · `[x]` done.

---

## 1. Blocked — needs a dedicated run + user decision

### [~] Single-line / engraving (Hershey) fonts
- **Why blocked:** needs a bundled single-stroke font dataset (Hershey or
  equivalent). That's a sizeable data asset — like adding `opentype.js`, it
  shouldn't be pulled into the bundle silently inside the auto-loop.
- **Needed decision:** OK to add the dataset/dependency and grow the bundle? Which
  glyph set / license (the public-domain Hershey set is the usual choice)?
- **Sketch of approach:** ship a compact Hershey JSON (glyph → polylines); a
  `singleLineText(str, font, sizeMm)` that lays out glyph polylines into a
  `CutPath[]` (reuse the cut-path pipeline used by outline/contour); expose in the
  Type menu + a dialog. Engraving/V-carve toolpaths reuse the plotter export.
- **Effort:** medium–large (data asset + layout engine + UI).

### [~] Gradient mesh
- **Why blocked:** there is no mesh-gradient primitive in SVG (SVG2 mesh isn't
  shipped in browsers) or in Fabric. A faithful version needs a bespoke patch
  renderer (Coons patches) drawn to canvas, plus its own editing UI and a custom
  serialiser (it can't round-trip through SVG).
- **Needed decision:** is a true mesh worth a bespoke renderer, or is the existing
  multi-stop linear/radial gradient + blend enough? A cheaper middle ground is a
  "freeform gradient" (a few draggable color stops blurred together) which *can*
  rasterise.
- **Effort:** large (renderer + editor + persistence).

### [~] Isolation mode (enter-group editing in place)
- **Why blocked:** Fabric v6 has no clean in-place group-child editing — the
  `interactive` / `subTargetCheck` paths aren't in the typings and there's no
  double-click-into-group infrastructure. A faithful isolation mode needs
  significant bespoke interaction work (dim siblings, retarget hit-testing to the
  isolated group, breadcrumb, Esc to exit).
- **Note:** double-click-to-edit a *path* already works; this is specifically about
  isolating a **group** and editing its children in place.
- **Effort:** large (interaction layer + state + chrome).

---

## 2. Deferred / nice-to-have (small parity gaps)

- [ ] **Add Arrowhead (Start)** — menu/palette expose only `End` and `Both`;
      `addArrowheads('start')` already exists in `lib/arrowheads.ts`, so this is a
      one-line wiring in `MenuBar.tsx` + `CommandPalette.tsx` (+ optional i18n key).
- [ ] **Rasterize in right-click** — `Rasterize` is in the Path menu + command
      palette but not the canvas context menu (Trace Image now is). Add an Item to
      `CanvasContextMenu.tsx` for symmetry.
- [ ] **Live preview for distort dialogs** — Roughen / Zig Zag / Pucker & Bloat /
      Twist apply destructively on *Apply* with no preview. The flatten→rebuild
      pipeline replaces the object, so a faithful live preview needs an apply/revert
      (ghost object or snapshot-restore) harness. Medium; UX win.
- [ ] **Free Distort** — the only missing Illustrator *Distort & Transform* entry
      (4-corner perspective/envelope). Needs a 4-handle drag UI + a projective
      transform of the path points. Medium.
- [ ] **Average anchor points** (`Object → Path → Average`, Ctrl+Alt+J) — averages
      *selected anchor points* to a common X / Y / both. Blocked on the path editor
      having no multi-anchor selection (marquee/shift-click on handles); that
      selection model is the real prerequisite. Medium.
- [ ] **Distribute relative to a key object** — align already supports a key
      object; Illustrator's distribute can anchor on it too. Low value.
- [ ] **Stroke-panel control read-back** is done for dash/cap/join/miter/blend;
      the **gradient editor** state is still write-only (doesn't hydrate from a
      selected gradient-filled object). Lower value, more involved (parsing a
      `fabric.Gradient` back into the stop editor).

---

## 3. Known warnings / tech debt (non-blocking)

- [ ] **ESLint** — 2 pre-existing warnings in `src/App.tsx` (~lines 777, 788):
      `react-hooks/exhaustive-deps` "missing dependency: 't'" on two effects.
      Intentional (i18n `t` is stable per render); silence with an
      `// eslint-disable-next-line` + reason, or add `t` to deps if safe. 0 errors.
- [ ] **TSC / tests / build** — all green (tsc 0, eslint 0 errors, vitest 252
      passing incl. 6 todo, build ✓) as of the last loop run.

---

## How the parity loop ran (context for whoever resumes)

- One surgical change per iteration; grep-first to confirm the gap is real; wire
  into menu / command palette / right-click / panel as appropriate; full en+zh
  i18n; keep `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build` green;
  commit to `main` (no push / tag / version bump — releases are the user's call);
  check the item off in `PARITY_BACKLOG.md` with a `file:function` note.
- The session-only cron (`9b87f2d4`, every 10 min) that drove this was **cancelled**
  on pause. Re-arm with `/loop 10m <prompt>` to resume.
