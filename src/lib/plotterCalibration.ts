/**
 * Plotter "Calibrate & test" workbench — pure geometry and arithmetic.
 *
 * No React, no I/O: every function takes the dialog's own PlotterOptions and
 * returns machine code plus the final geometry, so the card preview and the
 * unit tests read exactly what would go over the link.
 *
 * Coordinate conventions (the SAME ones the shipped job uses — plotter.ts):
 *   • Test geometry is authored in DOCUMENT millimetres, y growing down from
 *     the top of the page, exactly like a CutPath. `toMachine` then applies
 *     the generator's own mapping (mm → user unit, and the bottom-left-origin
 *     Y flip), so a pattern lands where a real job drawn there would land.
 *   • "Origin-anchored" marks (origin mark, ruler) are authored in MACHINE
 *     millimetres — from the current origin along its +X / +Y axes — through
 *     `machineFrame`, and are never mirrored: they describe the origin itself.
 *   • Compensation goes through the real pipeline (`postProcess` →
 *     applyOvercut / applyBladeOffset / mirrorPolys), once. The generator
 *     itself adds nothing on top (generateHPGL / generateGCode only emit the
 *     polylines they are given).
 */

import type { OutputFormat } from './hpglDebug';
import { simulateMachineCode } from './hpglDebug';
import { mirrorPolys, type PolyLite } from './cutOptimize';
import { generateGCode, generateHPGL, postProcess, type PlotterOptions } from './plotter';

export type CalFormat = OutputFormat;
export type CalPoly = PolyLite;
export type CalBbox = { x0: number; y0: number; x1: number; y1: number };

/** Default blade-offset values per test circle (mm). */
export const BLADE_OFFSET_STEPS_MM: readonly number[] = [0, 0.15, 0.25, 0.35, 0.45, 0.6];
/** Default overcut values per test circle (mm). */
export const OVERCUT_STEPS_MM: readonly number[] = [0, 0.1, 0.2, 0.3, 0.5];
/** Nominal side lengths offered for the distance-calibration box (mm). */
export const CAL_BOX_SIZES_MM: readonly number[] = [50, 100, 200];
/** The distance box sits this far in from the page's top-left corner. */
export const CAL_BOX_MARGIN_MM = 10;
/** Crosshair arm on each box corner; it reaches this far past the box. */
export const CAL_BOX_ARM_MM = 4;

/** Room a distance-calibration box needs from the page's top-left corner, each
 *  way: the margin, the box, and the crosshair arm past its far corner. A box
 *  that needs more than the page height runs its far crosshair over the origin
 *  line — into the machine's travel limit. */
export function calBoxNeedsMm(sizeMm: number): number {
  return CAL_BOX_MARGIN_MM + sizeMm + CAL_BOX_ARM_MM;
}
/** Ruler lengths offered (mm). */
export const RULER_LENGTHS_MM: readonly number[] = [50, 100, 200];
export const MAX_TEST_CELLS = 8;
/** Sanity ceiling for one typed step value (mm) — a drag-knife offset is < 1 mm. */
export const MAX_STEP_MM = 5;
/** Test cell: Ø20 mm circle, 30 mm pitch, 10 mm in from the page's top-left. */
export const CELL_RADIUS_MM = 10;
export const CELL_PITCH_MM = 30;
const CELL_MARGIN_MM = 10;
/** Circle tessellation: 5° chords (0.87 mm) — well under the 15° corner
 *  threshold, so blade-offset compensation adds no loops to the circle. */
const CIRCLE_SEGMENTS = 72;

/** Parse a "0, 0.15, 0.25" style list into test values (mm). Non-numeric,
 *  negative, absurd and duplicate entries are dropped; an empty result falls
 *  back to `fallback`. Order is kept as typed; at most MAX_TEST_CELLS. */
export function parseSteps(text: string, fallback: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_STEP_MM) continue;
    const v = Math.round(n * 1000) / 1000;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return (out.length > 0 ? out : fallback).slice(0, MAX_TEST_CELLS);
}

const userScale = (opts: PlotterOptions): number => (opts.unit === 'mm' ? 1 : 1 / 25.4);
/** Page height expressed in document mm (the unit the patterns are authored in). */
const pageMm = (opts: PlotterOptions): number => opts.paperHeightUnits / userScale(opts);

/** Document mm → machine coordinates: the generator's own mapping
 *  (plotter.ts cutPathsToPlotterPolylines). */
function toMachine(polys: CalPoly[], opts: PlotterOptions): CalPoly[] {
  const scale = userScale(opts);
  return polys.map(p => ({
    closed: p.closed,
    points: p.points.map(([x, y]) => {
      const uy = y * scale;
      return [x * scale, opts.originBottomLeft ? opts.paperHeightUnits - uy : uy];
    }),
  }));
}

/** Inverse of toMachine — the final geometry back in document mm for previews. */
function toDocument(polys: CalPoly[], opts: PlotterOptions): CalPoly[] {
  const scale = userScale(opts);
  return polys.map(p => ({
    closed: p.closed,
    points: p.points.map(([X, Y]) => [
      X / scale,
      opts.originBottomLeft ? (opts.paperHeightUnits - Y) / scale : Y / scale,
    ]),
  }));
}

/** Machine millimetres from the current origin (along the machine's own +X /
 *  +Y axes) → document mm. The origin is the page's top-left corner with a
 *  top-left origin, its bottom-left corner with a bottom-left one. */
function machineFrame(opts: PlotterOptions): (mx: number, my: number) => [number, number] {
  const oy = opts.originBottomLeft ? pageMm(opts) : 0;
  const sy = opts.originBottomLeft ? -1 : 1;
  return (mx, my) => [mx, oy + sy * my];
}

/** Compensation for one group of paths, already in user units. */
interface Comp {
  reverse: boolean;
  overcut: number;
  bladeOffset: number;
}
const NO_COMP: Comp = { reverse: false, overcut: 0, bladeOffset: 0 };

/** Run ONE group through the real post-process chain (plotter.ts postProcess):
 *  reverse → overcut → blade offset. Order optimisation and inside-first are
 *  left off so the cells stay in their authored sequence; mirroring is applied
 *  once to the whole pattern by `finish`, as the last step, like a real job. */
function postGroup(group: CalPoly[], comp: Comp): CalPoly[] {
  return postProcess(group, {
    optimize: false,
    insideFirst: false,
    reverse: comp.reverse,
    overcutMm: comp.overcut,
    bladeOffsetMm: comp.bladeOffset,
    mirror: false,
  });
}

export interface CalibrationPattern {
  /** Machine code, exactly what goes over the link. */
  code: string;
  /** Final geometry (compensated and mirrored) in document mm — the card preview. */
  doc: CalPoly[];
  /** Document-mm area the pattern occupies. */
  extent: CalBbox;
}

/** Bounding box of a polyline set (document mm); null when empty. */
export function calBounds(polys: readonly CalPoly[]): CalBbox | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p.points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** Emit machine code for a test pattern. Never carries ARMS (calibration runs
 *  on scrap, not on printed marks) and never ejects the sheet: the origin the
 *  operator just set has to survive the test. For the same reason the HP-GL
 *  header has no `IN;` — on an HP-GL-compliant plotter it resets the scaling
 *  points, i.e. that very origin. */
function emit(format: CalFormat, polys: CalPoly[], opts: PlotterOptions): string {
  const base: PlotterOptions = { ...opts, arms: undefined, ejectAfter: false, initialize: false };
  return format === 'gcode' ? generateGCode(polys, base) : generateHPGL(polys, base);
}

function finish(groups: CalPoly[][], comp: Comp, mirror: boolean, opts: PlotterOptions, format: CalFormat): CalibrationPattern {
  const machine = groups.flatMap(g => postGroup(g, comp));
  const final = mirror ? mirrorPolys(machine, 'h') : machine;
  const doc = toDocument(final, opts);
  return { code: emit(format, final, opts), doc, extent: calBounds(doc) ?? { x0: 0, y0: 0, x1: 0, y1: 0 } };
}

/* ---- Shared cell shapes (document mm) ---- */

/** Centre of test cell `i` (0-based): cells run left → right, 30 mm apart. */
export function cellCenter(i: number): [number, number] {
  return [CELL_MARGIN_MM + CELL_RADIUS_MM + i * CELL_PITCH_MM, CELL_MARGIN_MM + CELL_RADIUS_MM];
}

/**
 * Closed circle with an explicit closing vertex, cut clockwise, seam on
 * 12 o'clock — away from the serial-number ticks underneath.
 *
 * `reSeamed` = the real `applyBladeOffset` will rotate this ring's seam to
 * the midpoint of its longest chord, so edge 0 is made the longest (2.2
 * chords, 11°) and straddles 12 o'clock: the seam then lands exactly on top,
 * its cut direction exactly horizontal. Both halves of that chord (0.96 mm)
 * and every other chord (0.86 mm) stay longer than any sensible offset, so
 * `mergeCornerClusters` leaves the ring alone. Without it (offset 0) the ring
 * is regular and simply STARTS on 12 o'clock.
 */
function circlePolyline(cx: number, cy: number, r: number, reSeamed: boolean): CalPoly {
  const n = CIRCLE_SEGMENTS;
  const step = (2 * Math.PI) / n;
  const first = reSeamed ? step * 2.2 : step;
  const rest = (2 * Math.PI - first) / (n - 1);
  const a0 = reSeamed ? -Math.PI / 2 - first / 2 : -Math.PI / 2;
  const pts: Array<[number, number]> = [];
  let a = a0;
  for (let k = 0; k < n; k++) {
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    a += k === 0 ? first : rest;
  }
  pts.push(pts[0]);
  return { points: pts, closed: true };
}

/** Closed equilateral triangle inscribed in the cell (r = 8 mm): three 60°
 *  corners, the part of blade-offset compensation the circle cannot show. */
function trianglePolyline(cx: number, cy: number, r = 8): CalPoly {
  const a = -Math.PI / 2;
  const step = (2 * Math.PI) / 3;
  const pts: Array<[number, number]> = [0, 1, 2].map(k => [cx + r * Math.cos(a + k * step), cy + r * Math.sin(a + k * step)]);
  pts.push(pts[0]);
  return { points: pts, closed: true };
}

/** `count` short vertical ticks under the cell — the cell's serial number,
 *  no font needed. */
function tickMarks(cx: number, cy: number, count: number): CalPoly[] {
  const y0 = cy + CELL_RADIUS_MM + 3;
  const pitch = 2.5;
  return Array.from({ length: count }, (_, k) => {
    const x = cx + (k - (count - 1) / 2) * pitch;
    return { closed: false, points: [[x, y0], [x, y0 + 3]] as Array<[number, number]> };
  });
}

/** Straight tangential extension of `length` from a finished ring's seam,
 *  along the seam's own cut direction. An OPEN path: the pipeline never loops
 *  its endpoints, so it stays exactly `length` long. */
function tangentLine(ring: CalPoly, length: number): CalPoly {
  const s = ring.points[0];
  const n = ring.points[1];
  const d = Math.hypot(n[0] - s[0], n[1] - s[1]) || 1;
  return {
    closed: false,
    points: [s, [s[0] + ((n[0] - s[0]) / d) * length, s[1] + ((n[1] - s[1]) / d) * length]],
  };
}

/* ---- a. Blade ---- */

/**
 * Blade-offset test: one row of Ø20 mm circles (10 mm apart), cell `i` cut
 * with blade-offset compensation `steps[i]` mm.
 *
 * Per cell — triangle, circle, seam extension, `i + 1` ticks:
 *   • triangle + circle go through the real `applyBladeOffset` at that value
 *     (the triangle's corners get the corner loops, the smooth circle none);
 *   • the circle's seam gets a tangential extension of the same length (the
 *     drag knife trails by one offset, so the tip only reaches the seam when
 *     the pivot travels one offset past it). It is a separate open path
 *     rather than `overcutMm`: with overcut AND blade offset set, the real
 *     chain folds the retrace into a spike and `mergeCornerClusters` collapses
 *     it — the extension would silently vanish. Overcut stays 0 here so the
 *     seam is compensated exactly once.
 */
export function buildBladeOffsetTest(steps: readonly number[], opts: PlotterOptions, format: CalFormat): CalibrationPattern {
  const scale = userScale(opts);
  const groups = steps.map((stepMm, i) => {
    const v = stepMm * scale;
    const comp: Comp = { reverse: opts.reverse, overcut: 0, bladeOffset: v };
    const [cx, cy] = cellCenter(i);
    const triangle = postGroup(toMachine([trianglePolyline(cx, cy)], opts), comp);
    const ring = postGroup(toMachine([circlePolyline(cx, cy, CELL_RADIUS_MM, v > 0)], opts), comp)[0];
    const tangent = v > 0 ? [tangentLine(ring, v)] : [];
    return [...triangle, ring, ...tangent, ...toMachine(tickMarks(cx, cy, i + 1), opts)];
  });
  return finish(groups, NO_COMP, opts.mirror, opts, format);
}

/**
 * Overcut test: the same cells, each cut with overcut `steps[i]` mm through
 * the real `applyOvercut` (a retrace past the start of every closed path).
 * The dialog's current blade-offset value rides along unchanged, exactly as
 * it would in a job.
 */
export function buildOvercutTest(steps: readonly number[], opts: PlotterOptions, format: CalFormat): CalibrationPattern {
  const scale = userScale(opts);
  const base: Comp = { reverse: opts.reverse, overcut: 0, bladeOffset: (opts.bladeOffsetMm ?? 0) * scale };
  const groups = steps.map((stepMm, i) => {
    const [cx, cy] = cellCenter(i);
    const shapes = toMachine([trianglePolyline(cx, cy), circlePolyline(cx, cy, CELL_RADIUS_MM, base.bladeOffset > 0)], opts);
    return [...postGroup(shapes, { ...base, overcut: stepMm * scale }), ...toMachine(tickMarks(cx, cy, i + 1), opts)];
  });
  return finish(groups, NO_COMP, opts.mirror, opts, format);
}

/**
 * Suggested blade offset from a measured seam: `gap` mm of uncut material at
 * the closure means the offset is too small, `overlap` mm of overcut means it
 * is too large. Clamped at 0, rounded to 0.01 mm.
 */
export function suggestBladeOffset(currentMm: number, gapMm: number, overlapMm: number): number {
  return Math.round(Math.max(0, currentMm + gapMm - overlapMm) * 100) / 100;
}

/* ---- b. Distance ---- */

/**
 * Distance-calibration box: a nominal `sizeMm` × `sizeMm` square, 10 mm in
 * from the page's top-left, with a crosshair centred on each corner (4 mm
 * arms, reaching outside the box). Cut raw — no overcut, no blade offset — so
 * its edges measure the machine's own travel and nothing else.
 */
export function buildCalibrationBox(sizeMm: number, opts: PlotterOptions, format: CalFormat): CalibrationPattern {
  const m = CAL_BOX_MARGIN_MM;
  const arm = CAL_BOX_ARM_MM;
  const x0 = m, y0 = m, x1 = m + sizeMm, y1 = m + sizeMm;
  const box: CalPoly = { closed: true, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] };
  const crosses: CalPoly[] = [];
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const) {
    crosses.push({ closed: false, points: [[cx - arm, cy], [cx + arm, cy]] });
    crosses.push({ closed: false, points: [[cx, cy - arm], [cx, cy + arm]] });
  }
  return finish([toMachine([box], opts), toMachine(crosses, opts)], NO_COMP, opts.mirror, opts, format);
}

/** Signed size error of a measured length against its nominal, in percent
 *  (positive = the machine cut LONGER). Null for unusable input. */
export function scaleErrorPercent(nominalMm: number, measuredMm: number): number | null {
  if (!(nominalMm > 0) || !(measuredMm > 0)) return null;
  return Math.round(((measuredMm - nominalMm) / nominalMm) * 10000) / 100;
}

/** grbl steps/mm that makes the axis travel the nominal length:
 *  new = current × nominal ÷ measured. Null for unusable input. */
export function suggestGrblSteps(currentSteps: number, nominalMm: number, measuredMm: number): number | null {
  if (!(currentSteps > 0) || !(nominalMm > 0) || !(measuredMm > 0)) return null;
  return Math.round(((currentSteps * nominalMm) / measuredMm) * 100) / 100;
}

/**
 * Axis squareness error in degrees from the box's two diagonals: A–C joins
 *  the corners the +X and +Y sides leave, B–D the other pair. A perfect
 *  square gives equal diagonals; a parallelogram with sides `L` at angle
 *  (90° − θ) has d(AC)² − d(BD)² = 4 L² sin θ. Positive = the angle between
 *  the axes exceeds 90°. Null until both diagonals are known.
 */
export function skewFromDiagonals(nominalMm: number, diagonalAcMm: number | null, diagonalBdMm: number | null): number | null {
  if (!(nominalMm > 0) || diagonalAcMm === null || diagonalBdMm === null) return null;
  const s = (diagonalAcMm ** 2 - diagonalBdMm ** 2) / (4 * nominalMm ** 2);
  if (!(Math.abs(s) < 1)) return null;
  return Math.round((Math.asin(s) * 180 * 100) / Math.PI) / 100;
}

/* ---- c. Positioning ---- */

export interface DryRunOptions {
  penUpZ: number;
  travelRate: number;
  unit: 'mm' | 'in';
}

type MmBox = { minX: number; minY: number; maxX: number; maxY: number };

/** The dry run could not be made tool-up for certain — the payload puts the
 *  tool down in a form the rewrite does not know. Nothing must be sent. */
export class DryRunUnsafeError extends Error {
  readonly format: CalFormat;
  constructor(format: CalFormat) {
    super(`dry run refused: the ${format} payload still marks after rewriting`);
    this.name = 'DryRunUnsafeError';
    this.format = format;
  }
}

/** Extents of what the BLADE marks in a payload (operator units) — the
 *  pen-down polylines only, never the travel that parks the head at 0,0. */
function cutBounds(format: CalFormat, payload: string, unit: 'mm' | 'in'): MmBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cut of simulateMachineCode(format, payload, unit).cuts) {
    for (const [x, y] of cut) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
}

/* The Code page is editable, files can be imported, and cutters take lower
 * case as readily as upper — so the rewrites below match either spelling and
 * a mnemonic may follow a number directly, as HP-GL allows. */

/** Pen-down, wherever it starts an instruction. */
const HPGL_PEN_DOWN = /(?<![A-Za-z])PD(?![A-Za-z])/gi;
/** `PA` / `PR` and their whole argument run (numbers, separators, the
 *  instruction's `;`), stopping at the next mnemonic. */
const HPGL_PLOT = /(?<![A-Za-z])(P[AR])((?:\s|[-+.\d;,])*)/gi;
/** A number, the instruction terminator, or a run of separators. */
const HPGL_TOKEN = /[-+]?\d*\.?\d+|[;]|(\s+)/g;
/** Roland's sheet eject — it would feed the origin away before the real cut. */
const HPGL_EJECT = /(?<![A-Za-z0-9])!PG[^;\n]*;?/g;
/** Spindle / laser on, off and stop. */
const GCODE_SPINDLE = /(?<![A-Za-z])M[345](?![\d.])/i;
/** Every height word. */
const GCODE_HEIGHT = /(?<![A-Za-z])Z\s*[-+]?\d*\.?\d+/gi;
/** A feed move that is exactly `G1 X… Y… F…` — becomes a rapid. */
const GCODE_FEED_MOVE = /^\s*G0?1(\s+X[-+\d.]+\s+Y[-+\d.]+)\s+F[-+\d.]+\s*$/i;

/** Force every pen selector of a `PA` / `PR` argument run to 0. Coordinates
 *  come as x,y[,pen] triples, so every third number is the selector;
 *  everything else keeps its place, the `;` included. */
function penUpPlot(mnemonic: string, args: string): string {
  let k = 0;
  const text = args.replace(HPGL_TOKEN, (token: string, space: string | undefined) => {
    if (token === ';') { k = 0; return token; }
    if (space !== undefined) return token;
    const selector = k % 3 === 2 && (token === '0' || token === '1');
    k++;
    return selector ? '0' : token;
  });
  return mnemonic.toUpperCase() + text;
}

/** True when a payload still marks somewhere — replayed through the machine
 *  simulator, in operator units. What decides whether a dry run may be sent. */
export function payloadMarks(format: CalFormat, payload: string, unit: 'mm' | 'in'): boolean {
  return cutBounds(format, payload, unit) !== null;
}

/**
 * Dry run: the REAL job's machine code with every tool-down removed, so the
 * head walks the exact geometry, origin, mirroring and order it will cut —
 * after first travelling the pen-down bounding rectangle of the job (right
 * after the header). Derived from the very payload the Output page would
 * send, so it cannot drift from it.
 *   • HP-GL: every `PD` becomes `PU`, a pen-down selector on `PA`/`PR` becomes
 *     pen-up, and the Roland sheet eject (`!PG`) is dropped so the origin
 *     survives for the real cut.
 *   • G-code: every Z becomes the pen-up height, cut moves become rapids at the
 *     travel rate, spindle / laser commands (M3/M4/M5) are removed.
 * The result is then replayed: a dry run that still marks anywhere is refused
 * with `DryRunUnsafeError` rather than returned — the caller must not send.
 */
export function buildDryRun(format: CalFormat, payload: string, o: DryRunOptions): string {
  const out = format === 'gcode' ? dryRunGcode(payload, o) : dryRunHpgl(payload, o);
  if (payloadMarks(format, out, o.unit)) throw new DryRunUnsafeError(format);
  return out;
}

function dryRunHpgl(payload: string, o: DryRunOptions): string {
  const safe = payload
    .replace(HPGL_PEN_DOWN, 'PU')
    .replace(HPGL_PLOT, (_m, mnemonic: string, args: string) => penUpPlot(mnemonic, args))
    .replace(HPGL_EJECT, '');
  const lines = safe.split('\n');
  const bbox = cutBounds('hpgl', payload, o.unit);
  let at = lines.findIndex(l => /^\s*PU\s*[-+\d]/i.test(l));
  if (at < 0) at = Math.min(1, lines.length);
  const rect: string[] = [];
  if (bbox) {
    const U = (v: number) => Math.round(v * (o.unit === 'in' ? 1016 : 40));
    rect.push(
      `PU${U(bbox.minX)},${U(bbox.minY)};`,
      `PU${U(bbox.maxX)},${U(bbox.minY)};`,
      `PU${U(bbox.maxX)},${U(bbox.maxY)};`,
      `PU${U(bbox.minX)},${U(bbox.maxY)};`,
      `PU${U(bbox.minX)},${U(bbox.minY)};`,
    );
  }
  return [...lines.slice(0, at), ...rect, ...lines.slice(at)].join('\n');
}

function dryRunGcode(payload: string, o: DryRunOptions): string {
  const up = o.penUpZ.toFixed(3);
  const lines: Array<string | null> = payload.split('\n').map((line) => {
    if (GCODE_SPINDLE.test(line)) return null;
    const lifted = line.replace(GCODE_HEIGHT, `Z${up}`);
    return lifted.replace(GCODE_FEED_MOVE, 'G0$1');
  });
  const bbox = cutBounds('gcode', payload, o.unit);
  let at = lines.findIndex(l => l !== null && /^\s*G0\s+Z/.test(l));
  if (at < 0) at = lines.findIndex(l => l !== null && /^\s*G90\b/.test(l));
  const rect: string[] = [];
  if (bbox) {
    const p = (x: number, y: number) => `G0 X${x.toFixed(3)} Y${y.toFixed(3)}`;
    rect.push(p(bbox.minX, bbox.minY), p(bbox.maxX, bbox.minY), p(bbox.maxX, bbox.maxY), p(bbox.minX, bbox.maxY), p(bbox.minX, bbox.minY));
  }
  const head = lines.slice(0, at + 1).filter((l): l is string => l !== null);
  const tail = lines.slice(at + 1).filter((l): l is string => l !== null);
  return [...head, ...rect, ...tail].join('\n');
}

/**
 * Origin mark: a corner bracket with 10 mm arms along the machine's +X and
 *  +Y axes from the current origin, plus a 1.5 mm "origin dot" square whose
 *  corner IS the origin. Everything stays in the non-negative quadrant — a
 *  centred cross would need negative coordinates, which some controllers
 *  refuse. Not mirrored: it marks the origin itself.
 */
export function buildOriginMark(opts: PlotterOptions, format: CalFormat, armMm = 10): CalibrationPattern {
  const P = machineFrame(opts);
  const dot = 1.5;
  const corner: CalPoly = { closed: false, points: [P(armMm, 0), P(0, 0), P(0, armMm)] };
  const originDot: CalPoly = { closed: true, points: [P(0, 0), P(dot, 0), P(dot, dot), P(0, dot), P(0, 0)] };
  return finish([toMachine([corner], opts), toMachine([originDot], opts)], NO_COMP, false, opts, format);
}

/**
 * Ruler from the origin along the machine's +X and +Y axes: a baseline per
 *  axis, a tick every `stepMm` (5 mm, lengthened to 8 mm every 50 mm) pointing
 *  inwards, and an arrowhead where each axis ends. Direction, origin corner
 *  and scale are readable at a glance. Origin-anchored, never mirrored.
 */
export function buildRuler(lengthMm: number, opts: PlotterOptions, format: CalFormat, stepMm = 10): CalibrationPattern {
  const P = machineFrame(opts);
  const L = lengthMm;
  const head = 5;
  const polys: CalPoly[] = [
    { closed: false, points: [P(0, 0), P(L, 0)] },
    { closed: false, points: [P(0, 0), P(0, L)] },
    { closed: true, points: [P(L - head, 0), P(L, 0), P(L - head, 2.5), P(L - head, 0)] },
    { closed: true, points: [P(0, L - head), P(0, L), P(2.5, L - head), P(0, L - head)] },
  ];
  for (let d = stepMm; d <= L + 1e-9; d += stepMm) {
    const len = Math.round(d) % 50 === 0 ? 8 : 5;
    polys.push({ closed: false, points: [P(d, 0), P(d, len)] });
    polys.push({ closed: false, points: [P(0, d), P(len, d)] });
  }
  return finish([toMachine(polys, opts)], NO_COMP, false, opts, format);
}

export interface CalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Positioning-mark rectangle for a job: its document bounding box grown by
 *  `padMm` on every side, kept on the page (never left of / above the page
 *  origin). No job → a 100 × 100 mm square 10 mm in. */
export function cornerRectFromBbox(bbox: CalBbox | null, padMm = 10): CalRect {
  if (!bbox) return { x: 10, y: 10, w: 100, h: 100 };
  const x = Math.max(0, bbox.x0 - padMm);
  const y = Math.max(0, bbox.y0 - padMm);
  return { x, y, w: Math.max(10, bbox.x1 + padMm - x), h: Math.max(10, bbox.y1 + padMm - y) };
}

/**
 * Positioning marks: a corner bracket (8 mm arms, pointing inwards) on each
 * corner of a document-space rectangle, plus a short diagonal on the
 * rectangle's top-left corner. With mirroring on, the whole set flips about
 * its own centre and the diagonal moves to the top-right — one look tells
 * whether the job will come out mirrored, and the brackets show the region
 * and, with the origin, which way it is oriented.
 */
export function buildCornerMarks(rect: CalRect, opts: PlotterOptions, format: CalFormat): CalibrationPattern {
  const a = 8;
  const { x, y, w, h } = rect;
  const x1 = x + w;
  const y1 = y + h;
  const polys: CalPoly[] = [
    { closed: false, points: [[x + a, y], [x, y], [x, y + a]] },
    { closed: false, points: [[x1 - a, y], [x1, y], [x1, y + a]] },
    { closed: false, points: [[x1, y1 - a], [x1, y1], [x1 - a, y1]] },
    { closed: false, points: [[x, y1 - a], [x, y1], [x + a, y1]] },
    { closed: false, points: [[x, y], [x + 5, y + 5]] },
  ];
  return finish([toMachine(polys, opts)], NO_COMP, opts.mirror, opts, format);
}

/**
 * Drift test: a vertical reference line 10 mm in from the page's left edge
 *  and two identical rows of crosses — one 20 mm below the page's top edge,
 *  one 20 mm above its bottom. How far the bottom row sits from the top row
 *  (against a steel rule on the reference line) is the drift to enter in the
 *  Cut settings; see `suggestDrift`.
 */
export function buildDriftTest(opts: PlotterOptions, format: CalFormat): CalibrationPattern {
  const m = 10;
  const inset = 20;
  const page = pageMm(opts);
  const polys: CalPoly[] = [{ closed: false, points: [[m, m], [m, page - m]] }];
  for (const cy of [inset, page - inset]) {
    for (const cx of [40, 80, 120]) {
      polys.push({ closed: false, points: [[cx - 5, cy], [cx + 5, cy]] });
      polys.push({ closed: false, points: [[cx, cy - 5], [cx, cy + 5]] });
    }
  }
  return finish([toMachine(polys, opts)], NO_COMP, false, opts, format);
}

/** Drift-compensation values for the Cut settings, from the measured offsets
 *  of the two drift-test rows relative to their targets (right / down
 *  positive — the same sign convention as `PlotterOptions.drift`). All four
 *  zero → null (compensation off). */
export function suggestDrift(
  topDx: number, topDy: number, bottomDx: number, bottomDy: number,
): { topDxMm: number; topDyMm: number; bottomDxMm: number; bottomDyMm: number } | null {
  const round = (v: number) => Math.round(v * 100) / 100;
  const drift = { topDxMm: round(topDx), topDyMm: round(topDy), bottomDxMm: round(bottomDx), bottomDyMm: round(bottomDy) };
  return Object.values(drift).every(v => v === 0) ? null : drift;
}
