/**
 * Curved-surface decal unwraps (表面涂装): flat developments that wrap a
 * cylinder, a cone/frustum, or a sphere.
 *
 *  - cylinder : the classic label unwrap — a rectangle of width π·D (the
 *               full circumference) plus an optional overlap strip for the
 *               seam (OnlineLabels cylinder-label guidance).
 *  - cone     : annular-sector frustum unwrap. R = L·D/(D−d),
 *               r = L·d/(D−d), θ = 360°·(D−d)/(2L) (BlockLayer cone
 *               calculator / ConeCalc / Makers Math).
 *  - gore     : one lens segment of an n-gore sphere skin. Height follows
 *               the meridian π·D/2 (pole to pole), max width π·D/n at the
 *               equator, half-width (π·D/(2n))·sin(t) at polar angle t with
 *               y = (D/2)·t (arc-length parameterization; width 0 at both
 *               poles by construction).
 *
 * Everything is pure math in document mm-space, Y-down (same convention as
 * CutPath points). Outlines are closed rings whose last point repeats the
 * first — the generateWeedBorder convention.
 */

export interface CylinderWrap {
  type: 'cylinder';
  /** Developed width: π·D + overlapMm. */
  widthMm: number;
  heightMm: number;
  outline: [number, number][];
}

/**
 * Unwrap a cylinder of `diameterMm` × `heightMm` into a flat label rect.
 * `overlapMm` (default 0) widens the strip past one full circumference so
 * the seam can be glued/laminated over. Outline is top-left anchored at
 * (0,0) — the generateWeedBorder placement convention.
 */
export function cylinderWrap(
  diameterMm: number,
  heightMm: number,
  opts: { overlapMm?: number } = {},
): CylinderWrap {
  if (!(diameterMm > 0)) {
    throw new Error(`cylinderWrap: diameter must be > 0, got ${diameterMm}`);
  }
  if (!(heightMm > 0)) {
    throw new Error(`cylinderWrap: height must be > 0, got ${heightMm}`);
  }
  const overlapMm = opts.overlapMm ?? 0;
  const widthMm = Math.PI * diameterMm + overlapMm;
  return {
    type: 'cylinder',
    widthMm,
    heightMm,
    outline: [
      [0, 0],
      [widthMm, 0],
      [widthMm, heightMm],
      [0, heightMm],
      [0, 0],
    ],
  };
}

export interface ConeWrap {
  type: 'cone';
  /** Outer (bottom-circumference) sector radius, mm. */
  RMm: number;
  /** Inner (top-circumference) sector radius, mm. */
  rMm: number;
  /** Sector angle in degrees, including any overlapDeg. */
  thetaDeg: number;
  outline: [number, number][];
}

const DEG = Math.PI / 180;

/**
 * Unwrap a cone frustum (bottom diameter D > top diameter d, slant height L)
 * into an annular sector: R = L·D/(D−d), r = L·d/(D−d),
 * θ = 360°·(D−d)/(2L). `overlapDeg` (default 0) widens θ past a full wrap
 * so the seam overlaps. The apex sits at the origin, the sector is bisected
 * by the +Y axis (so in the editor's Y-down canvas the opening faces down),
 * and the outline walks outer arc → radial edge → inner arc back → close,
 * tessellated at ≤2° steps.
 */
export function coneSector(
  bottomDiameterMm: number,
  topDiameterMm: number,
  slantHeightMm: number,
  opts: { overlapDeg?: number } = {},
): ConeWrap {
  if (bottomDiameterMm <= topDiameterMm) {
    throw new Error(
      `coneSector: bottom diameter (${bottomDiameterMm}) must exceed top diameter (${topDiameterMm}) — not a cone/frustum`,
    );
  }
  if (!(slantHeightMm > 0)) {
    throw new Error(`coneSector: slant height must be > 0, got ${slantHeightMm}`);
  }
  const D = bottomDiameterMm;
  const d = topDiameterMm;
  const L = slantHeightMm;
  const RMm = (L * D) / (D - d);
  const rMm = (L * d) / (D - d);
  const thetaDeg = (360 * (D - d)) / (2 * L) + (opts.overlapDeg ?? 0);

  const steps = Math.max(1, Math.ceil(thetaDeg / 2)); // ≤2° per arc step
  const at = (radius: number, i: number): [number, number] => {
    const a = (90 - thetaDeg / 2 + (thetaDeg * i) / steps) * DEG;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  };
  const outer: [number, number][] = [];
  for (let i = 0; i <= steps; i++) outer.push(at(RMm, i));
  const inner: [number, number][] = [];
  for (let i = steps; i >= 0; i--) inner.push(at(rMm, i));

  const outline = [...outer, ...inner];
  outline.push([outline[0][0], outline[0][1]]);
  return { type: 'cone', RMm, rMm, thetaDeg, outline };
}

export interface SphereGore {
  type: 'gore';
  /** Number of gores the sphere is split into (this outline is ONE gore). */
  count: number;
  /** Meridian length pole to pole: π·D/2. */
  heightMm: number;
  /** Equator width: π·D/n. */
  maxWidthMm: number;
  outline: [number, number][];
}

/**
 * One gore (lens segment) of an n-gore sphere skin for diameter D. The gore
 * runs pole to pole along the meridian: y = (D/2)·t, half-width
 * (π·D/(2n))·sin(t) for polar angle t ∈ [0,π] — zero width at the poles,
 * π·D/n at the equator, total height π·D/2. `segments` below 4 throws;
 * above 24 it clamps to 24 (more gores than that never lie flat on a
 * hand-cut decal). Outline is centered on the y axis, north pole at (0,0),
 * walked down the right edge and back up the left.
 */
export function sphereGore(diameterMm: number, segments: number): SphereGore {
  if (!(diameterMm > 0)) {
    throw new Error(`sphereGore: diameter must be > 0, got ${diameterMm}`);
  }
  if (!Number.isFinite(segments) || segments < 4) {
    throw new Error(`sphereGore: segments must be >= 4, got ${segments}`);
  }
  const n = Math.min(24, Math.floor(segments));
  const heightMm = (Math.PI * diameterMm) / 2;
  const maxWidthMm = (Math.PI * diameterMm) / n;
  const halfWidth = (t: number) => ((Math.PI * diameterMm) / (2 * n)) * Math.sin(t);
  const yAt = (t: number) => (diameterMm / 2) * t;

  const STEPS = 90; // 2° of polar angle per edge sample
  const right: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = (Math.PI * i) / STEPS;
    right.push([halfWidth(t), yAt(t)]);
  }
  const left: [number, number][] = [];
  for (let i = STEPS - 1; i > 0; i--) {
    const t = (Math.PI * i) / STEPS;
    left.push([-halfWidth(t), yAt(t)]);
  }

  const outline = [...right, ...left];
  outline.push([outline[0][0], outline[0][1]]);
  return { type: 'gore', count: n, heightMm, maxWidthMm, outline };
}

/**
 * Starter dims for common wrapped objects — plausible starting points, not
 * calibrated measurements; measure the real object before cutting.
 *   - straight-bottle : 70 mm Ø body, 160 mm label band, 5 mm seam overlap
 *   - tumbler-30oz    : 95 → 82 mm taper over a 110 mm slant
 *   - wedding-cup     : 82 → 55 mm taper over a 95 mm slant
 *   - sphere-ornament : 80 mm ball split into 12 gores
 */
export const SURFACE_WRAP_PRESETS: { id: string; label: string; kind: 'cylinder' | 'cone' | 'gore'; dims: Record<string, number> }[] = [
  { id: 'straight-bottle', label: 'Straight bottle label 70×160 (5 mm overlap)', kind: 'cylinder', dims: { diameter: 70, height: 160, overlap: 5 } },
  { id: 'tumbler-30oz', label: '30 oz tumbler wrap 95→82 taper', kind: 'cone', dims: { bottomDiameter: 95, topDiameter: 82, slantHeight: 110 } },
  { id: 'wedding-cup', label: 'Wedding cup wrap 82→55 taper', kind: 'cone', dims: { bottomDiameter: 82, topDiameter: 55, slantHeight: 95 } },
  { id: 'sphere-ornament', label: 'Sphere ornament 80 mm, 12 gores', kind: 'gore', dims: { diameter: 80, segments: 12 } },
];
