/**
 * Cut drift compensation — the print-and-cut "top row perfect, bottom row a
 * millimetre off" fixer.
 *
 * Market gap: no consumer cutter software (Silhouette Studio, Cricut Design
 * Space, Roland CutStudio, Sure Cuts A Lot) corrects PROGRESSIVE drift — the
 * media-slip / feed-backlash error that accumulates down the sheet and makes
 * the first sticker of a print-and-cut job align while the last one lands
 * 0.5–2 mm sideways (the most common print-and-cut complaint on cutter
 * forums; 10 in+ sheets are the worst). The only fixes offered are "cut
 * slower" or "redesign smaller". Sign shops solve this by hand: two test
 * cuts, measure, pre-distort the job. That workflow, automated:
 *
 *   1. CALIBRATE — print a sheet with registration marks, cut two small
 *      test shapes (one near the page top, one near the bottom), and
 *      measure each one's error: where the blade ACTUALLY cut minus where
 *      the shape was printed.
 *   2. COMPENSATE — every subsequent job's paths are pre-shifted by the
 *      NEGATED interpolated error, so the blade — drifting exactly as it
 *      always does — lands on the printed contour instead of beside it.
 *
 * Physical model (first order, and honest about it):
 *   • Feed error accumulates ~linearly with fed distance, so a row's offset
 *     is an affine function of its y:
 *       offset(y) = top + (y − minY) / (maxY − minY) · (bottom − top)
 *     with minY/maxY the job's OWN y extent (see regmark note below).
 *   • Every point is corrected by ITS OWN y. A slanted path gets a slight
 *     corrective shear — precisely the shape distortion the drift itself
 *     introduced, so unwinding it restores the printed geometry.
 *   • Linear by design: two samples are all a user will realistically
 *     measure. Truly non-linear machines need denser sampling — out of
 *     scope for v1 (and untested water in every competitor too).
 *
 * SIGN CONVENTION — read before touching this math. A flipped sign doubles
 * the error instead of removing it and wastes the sheet; the tests pin the
 * convention end to end:
 *   DriftSample.dxMm / dyMm  = ACTUAL cut position − INTENDED position,
 *                              mm in document space (y grows DOWN, like the
 *                              rest of the app). dxMm +1 = "the blade cut
 *                              1 mm to the RIGHT of the print".
 *   applied compensation     = −offset(y). That same +1 mm sample moves the
 *                              cut coordinates 1 mm LEFT, so the drifting
 *                              blade ends where it was supposed to.
 *   driftPreviewAt           reports the APPLIED displacement (−offset), so
 *                              its numbers are exactly what the compensated
 *                              coordinates do.
 *
 * Registration marks are sacred. The sensor READS the printed marks to
 * locate the sheet; pre-shifting them would move the cut relative to a
 * moved baseline — doubling the error and destroying the reference frame.
 * Paths with kind === 'regmark' therefore pass through untouched (the very
 * same object reference) AND are excluded from the y extent that anchors
 * the interpolation: the cut geometry itself defines the domain, so the
 * topmost / bottommost cut rows receive exactly the top / bottom samples.
 *
 * Pure functions, mm in / mm out. No store, DOM, or npm dependencies.
 */

/**
 * Minimal structural subset of the store's CutPath (src/store/editor.ts) —
 * the drift math only needs identity + geometry + kind. All other fields
 * (passes, color, sourceObjectId, …) ride along untouched: a compensated
 * path is a shallow copy with a new points array, so a store CutPath[] goes
 * in and a structurally store-compatible CutPath[] comes out. (Local shape
 * rather than a store import, keeping lib → store a one-way street.)
 */
export interface CutPath {
  /** Unused by the math — carried for identity. Optional so plotter-side
   *  CutPathLike arrays (no id) can pass through without adapter types. */
  id?: string;
  /** Polyline vertices, document mm, y down — same space as DriftSample. */
  points: Array<[number, number]>;
  closed: boolean;
  /** Plotter-side kinds arrive as free strings (sometimes absent — the
   *  plotter layer defaults missing kinds to 'manual'); only 'regmark' is
   *  special to the math. */
  kind?: string;
}

/** One measured calibration error (mm, document space): where the blade
 *  ACTUALLY cut minus where the target was printed. +dx = cut landed right
 *  of the target, +dy = landed below it (y grows down). */
export interface DriftSample {
  /** Horizontal error: actual x − intended x. */
  dxMm: number;
  /** Vertical error: actual y − intended y. */
  dyMm: number;
}

export interface DriftCalibration {
  /** Page-top sample (y smallest) — measured on a test cut near the top. */
  top: DriftSample;
  /** Page-bottom sample (y largest) — measured on a test cut near the bottom. */
  bottom: DriftSample;
}

export interface DriftCalibrationResult {
  /** Compensated paths: a NEW array (the input is never mutated). Non-
   *  regmark entries are shallow copies with new points arrays; regmark
   *  entries keep their original object references. Generic in the input
   *  element type so caller-specific CutPath shapes (store CutPath,
   *  plotter CutPathLike) pass through without adapter casts. */
  paths: CutPath[];
  /** Growth of the (un-negated) drift offset per mm of y travel,
   *  (bottom − top) / y-range, for UI diagnostics. Zero when the extent is
   *  degenerate or nothing was compensated. */
  slope: { dxPerMm: number; dyPerMm: number };
  /** The job's own y extent — min/max y over the NON-regmark points, i.e.
   *  the interpolation domain. {minY: 0, maxY: 0} when no compensatable
   *  geometry exists (empty input, regmarks only). */
  extentMm: { minY: number; maxY: number };
}

/**
 * Calibration self-check: a sample set is usable when all four numbers are
 * finite. All-zero is VALID (it simply means "no measurable drift — nothing
 * to compensate"); NaN/Infinity (a botched measurement entry) is not.
 */
export function isValidCalibration(cal: DriftCalibration): boolean {
  return Number.isFinite(cal.top.dxMm) && Number.isFinite(cal.top.dyMm)
    && Number.isFinite(cal.bottom.dxMm) && Number.isFinite(cal.bottom.dyMm);
}

/**
 * Apply linear-in-y drift compensation to a set of cut paths.
 *
 * For every non-regmark point, offset(y) is the linear interpolation between
 * the top and bottom samples over the job's own y extent, and the point is
 * moved by −offset(y) (see the sign convention in the module header): a
 * blade that drifts +1 mm at the page bottom gets coordinates pre-shifted
 * 1 mm against the drift. Each point uses its own y, so slanted paths get
 * the corrective shear that undoes the drift's shear. Regmark paths are
 * returned untouched — same object reference — because the sensor reads
 * them as the baseline; moving the baseline doubles the error.
 *
 * Degenerate / safe cases (never throws):
 *   • invalid calibration (any non-finite sample) → the ORIGINAL paths array
 *     reference, zero slope, and the still-computable extent as a diagnostic.
 *   • no compensatable geometry (empty input, regmarks only) → original
 *     array reference, zero slope, extent {minY: 0, maxY: 0}.
 *   • flat job (all cut points at one y, maxY === minY) → zero slope and
 *     every point corrected by exactly the TOP sample (t ≡ 0).
 *
 * Determinism: the offset is a pure function of y evaluated with the same
 * expression everywhere, so identical y values always receive bit-identical
 * compensation — duplicated or collinear vertices never diverge.
 */
export function applyDriftCompensation(paths: CutPath[], cal: DriftCalibration): DriftCalibrationResult {
  // The interpolation domain is the CUT geometry's y extent — regmarks are
  // the sensor's reference frame, not drifted work, so they neither get
  // compensated nor widen the domain (the outermost cut rows must map to
  // t = 0 / t = 1 exactly). Points without a finite y cannot anchor it.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of paths) {
    if (p.kind === 'regmark') continue;
    for (const [, y] of p.points) {
      if (!Number.isFinite(y)) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const hasGeometry = Number.isFinite(minY);
  if (!hasGeometry || !isValidCalibration(cal)) {
    return {
      paths, // untouched — caller can keep its own reference
      slope: { dxPerMm: 0, dyPerMm: 0 },
      extentMm: hasGeometry ? { minY, maxY } : { minY: 0, maxY: 0 },
    };
  }

  // offset(y) = top + slope·(y − minY); a flat extent (range 0) pins t at 0,
  // i.e. the top sample — with the whole job on one row, "how wrong is this
  // row" is best answered by the sample taken nearest the sheet start.
  const rangeY = maxY - minY;
  const dxPerMm = rangeY > 0 ? (cal.bottom.dxMm - cal.top.dxMm) / rangeY : 0;
  const dyPerMm = rangeY > 0 ? (cal.bottom.dyMm - cal.top.dyMm) / rangeY : 0;
  const dxAt = (y: number): number => cal.top.dxMm + dxPerMm * (y - minY);
  const dyAt = (y: number): number => cal.top.dyMm + dyPerMm * (y - minY);

  const out = paths.map(p =>
    p.kind === 'regmark'
      ? p // sensor baseline — returned by reference, coordinates intact
      : { ...p, points: p.points.map(([x, y]) => [x - dxAt(y), y - dyAt(y)] as [number, number]) });
  return { paths: out, slope: { dxPerMm, dyPerMm }, extentMm: { minY, maxY } };
}

/**
 * UI preview: the compensation that WOULD be applied at the page top, middle
 * and bottom of a job spanning `extentMm`. Returns the applied displacement
 * (−offset(y) — the same numbers applyDriftCompensation moves points by),
 * NOT the raw drift: with a bottom sample of dxMm +1 the preview's bottom
 * reads dxMm −1 because the cut coordinates move 1 mm left. A degenerate
 * extent (maxY ≤ minY) reports the top sample's displacement at all three
 * positions, matching applyDriftCompensation's flat-job rule. Callers should
 * gate on isValidCalibration first; this is pure interpolation otherwise.
 */
export function driftPreviewAt(
  cal: DriftCalibration,
  extentMm: { minY: number; maxY: number },
): { top: DriftSample; middle: DriftSample; bottom: DriftSample } {
  const rangeY = extentMm.maxY - extentMm.minY;
  // `+ 0` normalises IEEE −0 to +0 — negating a zero top sample would
  // otherwise surface as "-0.00 mm" in the UI for a perfectly calibrated row.
  const at = (y: number): DriftSample => {
    if (rangeY <= 0) {
      return { dxMm: -cal.top.dxMm + 0, dyMm: -cal.top.dyMm + 0 };
    }
    const t = (y - extentMm.minY) / rangeY;
    return {
      dxMm: -(cal.top.dxMm + (cal.bottom.dxMm - cal.top.dxMm) * t) + 0,
      dyMm: -(cal.top.dyMm + (cal.bottom.dyMm - cal.top.dyMm) * t) + 0,
    };
  };
  return {
    top: at(extentMm.minY),
    middle: at(extentMm.minY + rangeY / 2),
    bottom: at(extentMm.maxY),
  };
}
