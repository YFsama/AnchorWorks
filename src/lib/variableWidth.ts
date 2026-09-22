import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;

type Pt = [number, number];
export type { Pt };
export type WidthProfile = 'uniform' | 'taper-start' | 'taper-end' | 'taper-both' | 'bulge' | 'hourglass';

export const WIDTH_PROFILES: WidthProfile[] = ['uniform', 'taper-start', 'taper-end', 'taper-both', 'bulge', 'hourglass'];

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function normalAt(points: Pt[], index: number): Pt {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next[0] - prev[0];
  const dy = next[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

export function widthScaleAt(t: number, profile: WidthProfile): number {
  const u = Math.max(0, Math.min(1, t));
  switch (profile) {
    case 'taper-start': return 0.08 + 0.92 * u;
    case 'taper-end': return 1 - 0.92 * u;
    case 'taper-both': return 0.08 + 0.92 * Math.sin(Math.PI * u);
    case 'bulge': return 0.55 + 0.75 * Math.sin(Math.PI * u);
    case 'hourglass': return 0.35 + 0.65 * Math.abs(2 * u - 1);
    default: return 1;
  }
}

export function buildVariableWidthOutline(points: Pt[], baseWidth: number, profile: WidthProfile): Pt[] {
  if (points.length < 2 || baseWidth <= 0) return [];
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) lengths[i] = lengths[i - 1] + dist(points[i - 1], points[i]);
  const total = lengths[lengths.length - 1] || 1;
  const left: Pt[] = [];
  const right: Pt[] = [];
  points.forEach((point, index) => {
    const t = lengths[index] / total;
    const half = (baseWidth * widthScaleAt(t, profile)) / 2;
    const [nx, ny] = normalAt(points, index);
    left.push([point[0] + nx * half, point[1] + ny * half]);
    right.push([point[0] - nx * half, point[1] - ny * half]);
  });
  return [...left, ...right.reverse()];
}

function longestOpenPolyline(obj: fabric.FabricObject): Pt[] | null {
  const cuts = buildOutlineCutPaths([obj], 0, 1).filter(cut => !cut.closed && cut.points.length >= 2);
  if (!cuts.length) return null;
  let best = cuts[0];
  for (const cut of cuts) if (cut.points.length > best.points.length) best = cut;
  return best.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
}

export function applyWidthProfileToObject(canvas: fabric.Canvas, object: fabric.FabricObject, profile: WidthProfile): fabric.Path | null {
  if ((object.strokeWidth ?? 0) <= 0 || typeof object.stroke !== 'string') return null;
  const points = longestOpenPolyline(object);
  if (!points) return null;
  const outline = buildVariableWidthOutline(points, object.strokeWidth ?? 1, profile);
  if (outline.length < 3) return null;
  const path = new fabric.Path(pointsToD(outline), {
    fill: object.stroke as string,
    stroke: '',
    strokeWidth: 0,
    opacity: object.opacity ?? 1,
    name: `Width Profile: ${profile}`,
  });
  // Tag with station metadata so the interactive Width tool can re-edit
  // menu-applied profiles (fresh path → command space == scene space).
  (path as MetaCarrier).variableWidth = {
    stations: stationsFromProfile(points, object.strokeWidth ?? 1, profile),
    centerline: points.map(p => [p[0], p[1]] as Pt),
    baseWidth: object.strokeWidth ?? 1,
  };
  object.set({ stroke: '', strokeWidth: 0 });
  object.setCoords();
  canvas.add(path);
  return path;
}

export function applyWidthProfileToSelection(profile: WidthProfile): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  const created: fabric.FabricObject[] = [];
  for (const obj of objs) {
    const path = applyWidthProfileToObject(canvas, obj, profile);
    if (path) created.push(path);
  }
  if (created.length > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return created.length;
}

/* ======================================================================
 * Interactive Width tool — station model.
 *
 * The fixed profiles above are one-shot menu transforms; the Width tool
 * (Shift+W) lets the user drag width "stations" onto a stroked path. A
 * station is a (t, width) pair where `t` is the normalised arc-length
 * position along the path's centreline (0 = start, 1 = end) and `width`
 * is the local stroke diameter in scene px. Between stations the width
 * is interpolated with a monotone cubic Hermite spline (Fritsch–Butland
 * tangents) — smooth like the profile curves but guaranteed free of the
 * overshoot that would pinch a cutter-bound outline.
 *
 * Commit semantics (same contract as the profile menu): the stroked
 * path's stroke is emptied and a filled outline path is added beside it.
 * The outline carries a `variableWidth` metadata record (stations +
 * centreline + base width) so the tool can re-edit its own output; the
 * centreline is stored in raw path-command space, which stays correct
 * after the outline is moved / scaled / rotated. Unlike `patternSpec`,
 * the metadata round-trips through serialisation: the key is registered
 * in Fabric's static `customProperties` allow-list (see the persistence
 * section at the bottom of this file), so every `toObject()` / `toJSON()`
 * consumer — project files, undo snapshots, clipboard — carries it.
 * ====================================================================== */

/** One width station: `t` ∈ [0,1] arc-length position, `width` in px. */
export interface WidthStation {
  t: number;
  width: number;
}

/** Widest / narrowest local width a station may take (scene px). The floor
 *  is 0 — tapering to a point is the whole point of hand-lettered art. */
export const MIN_STATION_WIDTH = 0;
export const MAX_STATION_WIDTH = 1000;

/** Stations closer than this in `t` are considered the same station. */
const STATION_T_EPS = 1e-4;

/** Clamp a station width into the legal range (also sanitises NaN/∞). */
export function clampStationWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_STATION_WIDTH;
  return Math.max(MIN_STATION_WIDTH, Math.min(MAX_STATION_WIDTH, width));
}

/** Sort by `t`, clamp `t` into [0,1], clamp widths, and drop near-duplicate
 *  `t`s (first one wins). Returns a fresh array; input is untouched. */
export function normalizeStations(stations: WidthStation[]): WidthStation[] {
  const out: WidthStation[] = stations
    .filter(s => Number.isFinite(s.t) && Number.isFinite(s.width))
    .map(s => ({ t: Math.max(0, Math.min(1, s.t)), width: clampStationWidth(s.width) }))
    .sort((a, b) => a.t - b.t);
  const deduped: WidthStation[] = [];
  for (const s of out) {
    if (deduped.length && s.t - deduped[deduped.length - 1].t < STATION_T_EPS) continue;
    deduped.push(s);
  }
  return deduped;
}

/**
 * Local width at arc-length fraction `t`, interpolated across stations with
 * a monotone cubic Hermite spline (Fritsch–Butland weighted-harmonic
 * tangents). Exact at every station, reproduces straight-line data exactly,
 * and never overshoots between monotone stations — the property that keeps
 * tapered lettering smooth instead of wobbly. `t` outside [0,1] clamps.
 */
export function widthAtT(stations: WidthStation[], t: number): number {
  if (stations.length === 0) return 0;
  if (stations.length === 1) return stations[0].width;
  const u = Math.max(0, Math.min(1, t));
  if (u <= stations[0].t) return stations[0].width;
  if (u >= stations[stations.length - 1].t) return stations[stations.length - 1].width;
  let i = 0;
  while (i < stations.length - 2 && u > stations[i + 1].t) i++;
  const a = stations[i];
  const b = stations[i + 1];
  const dt = b.t - a.t;
  if (dt <= 0) return b.width;
  const d = (b.width - a.width) / dt;
  // Neighbouring segment slopes for the tangent estimates.
  const dPrev = i > 0 ? (a.width - stations[i - 1].width) / (a.t - stations[i - 1].t || dt) : d;
  const dNext = i + 1 < stations.length - 1
    ? (stations[i + 2].width - b.width) / (stations[i + 2].t - b.t || dt)
    : d;
  const m0 = monotoneTangent(dPrev, d);
  const m1 = monotoneTangent(d, dNext);
  const h = (u - a.t) / dt;
  const h2 = h * h;
  const h3 = h2 * h;
  return (
    (2 * h3 - 3 * h2 + 1) * a.width +
    (h3 - 2 * h2 + h) * dt * m0 +
    (-2 * h3 + 3 * h2) * b.width +
    (h3 - h2) * dt * m1
  );
}

/**
 * Fritsch–Butland tangent from two adjacent segment slopes: zero when the
 * slopes disagree in sign (local extremum), else the weighted harmonic mean
 * — bounded by both slopes, so the spline stays monotone where the data is.
 */
function monotoneTangent(d1: number, d2: number): number {
  if (d1 * d2 <= 0) return 0;
  return (2 * d1 * d2) / (d1 + d2);
}

/** Exact stations for one of the fixed profiles, evaluated at every
 *  centreline vertex — lets the Width tool re-edit menu-applied profiles
 *  (the outline polyline already interpolates linearly between vertices,
 *  so these stations reproduce it exactly). */
export function stationsFromProfile(points: Pt[], baseWidth: number, profile: WidthProfile): WidthStation[] {
  const lens = cumulativeLengths(points);
  const total = lens[lens.length - 1] || 1;
  return points.map((_, i) => ({
    t: lens[i] / total,
    width: clampStationWidth(baseWidth * widthScaleAt(lens[i] / total, profile)),
  }));
}

/** Cumulative arc length at each polyline vertex (index 0 = 0). */
export function cumulativeLengths(points: Pt[]): number[] {
  const lens: number[] = [0];
  for (let i = 1; i < points.length; i++) lens[i] = lens[i - 1] + dist(points[i - 1], points[i]);
  return lens;
}

/** Point on the polyline at arc-length fraction `t` (clamped), linearly
 *  interpolated between the two bracketing vertices. */
export function pointAtT(points: Pt[], t: number): Pt {
  const u = Math.max(0, Math.min(1, t));
  const lens = cumulativeLengths(points);
  const total = lens[lens.length - 1] || 1;
  const target = u * total;
  let i = 0;
  while (i < points.length - 2 && lens[i + 1] < target) i++;
  const seg = lens[i + 1] - lens[i];
  const k = seg > 0 ? (target - lens[i]) / seg : 0;
  return [
    points[i][0] + (points[i + 1][0] - points[i][0]) * k,
    points[i][1] + (points[i + 1][1] - points[i][1]) * k,
  ];
}

/**
 * Outline polygon for a centreline + station set: the centreline is walked
 * left and right at ±width(t)/2 along the local normal (same construction
 * as `buildVariableWidthOutline`). Evaluation happens at the union of the
 * centreline vertices' t values, the station t values, and one refinement
 * midpoint between consecutive evaluation sites so the Hermite width curve
 * reads as smooth, not faceted. Returns [] when there is nothing to draw.
 */
export function buildVariableWidthOutlineFromStations(points: Pt[], stations: WidthStation[]): Pt[] {
  if (points.length < 2 || stations.length === 0) return [];
  const lens = cumulativeLengths(points);
  const total = lens[lens.length - 1] || 1;
  const vertexTs = lens.map(l => l / total);
  const ts = [...vertexTs, ...stations.map(s => Math.max(0, Math.min(1, s.t)))].sort((a, b) => a - b);
  const refined: number[] = [ts[0]];
  for (let i = 1; i < ts.length; i++) {
    // Skip near-duplicate t values (station sitting exactly on a vertex).
    if (ts[i] - refined[refined.length - 1] > STATION_T_EPS) {
      refined.push((ts[i] + refined[refined.length - 1]) / 2);
      refined.push(ts[i]);
    }
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (const t of refined) {
    const point = pointAtT(points, t);
    // Exact-vertex normals use the polyline neighbour rule (normalAt);
    // mid-curve points derive the tangent from the bracketing vertices.
    const vIdx = nearestVertexIndex(vertexTs, t);
    const onVertex = Math.abs(vertexTs[vIdx] - t) < STATION_T_EPS;
    let nx: number;
    let ny: number;
    if (onVertex) {
      [nx, ny] = normalAt(points, vIdx);
    } else {
      const a = points[Math.max(0, vIdx)];
      const b = points[Math.min(points.length - 1, vIdx + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    }
    const half = widthAtT(stations, t) / 2;
    left.push([point[0] + nx * half, point[1] + ny * half]);
    right.push([point[0] - nx * half, point[1] - ny * half]);
  }
  if (left.length < 2) return [];
  return [...left, ...right.reverse()];
}

function nearestVertexIndex(vertexTs: number[], t: number): number {
  let best = 0;
  for (let i = 1; i < vertexTs.length; i++) {
    if (Math.abs(vertexTs[i] - t) < Math.abs(vertexTs[best] - t)) best = i;
  }
  return best;
}

/** Serialise outline points as a closed M/L path string (exported for the
 *  Width tool's live preview, which draws the same polygon on an overlay). */
export function pointsToD(points: Pt[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
}

/* ------------------------- metadata + commit ------------------------- */

/** Re-edit record stored on outline paths produced by the profile menu or
 *  the Width tool. `centerline` is in raw path-command space of the outline
 *  object (re-read through its current transform on re-edit). */
export interface VariableWidthMeta {
  stations: WidthStation[];
  centerline: Pt[];
  baseWidth: number;
}

type MetaCarrier = fabric.FabricObject & { variableWidth?: VariableWidthMeta };

/** The object's variable-width record, or null when it isn't tool output. */
export function readVariableWidthMeta(object: fabric.FabricObject): VariableWidthMeta | null {
  const meta = (object as MetaCarrier).variableWidth;
  return meta && Array.isArray(meta.stations) && meta.stations.length > 0 ? meta : null;
}

/** Map raw path-command-space points of a Path to scene coordinates
 *  (transform + pathOffset — same math as pathEdit's handle placement). */
export function pathSpaceToScene(object: fabric.FabricObject, pts: Pt[]): Pt[] {
  const path = object as fabric.Path;
  const m = object.calcTransformMatrix();
  return pts.map(([x, y]) => {
    const px = x - path.pathOffset.x;
    const py = y - path.pathOffset.y;
    return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]] as Pt;
  });
}

/** Inverse of `pathSpaceToScene` — scene points to raw command space. */
export function sceneToPathSpace(object: fabric.FabricObject, pts: Pt[]): Pt[] {
  const path = object as fabric.Path;
  const inv = fabric.util.invertTransform(object.calcTransformMatrix());
  return pts.map(([x, y]) => {
    const lx = inv[0] * x + inv[2] * y + inv[4];
    const ly = inv[1] * x + inv[3] * y + inv[5];
    return [lx + path.pathOffset.x, ly + path.pathOffset.y] as Pt;
  });
}

/**
 * Commit a station set onto an object (the Width tool's pointer-up action).
 *
 * - Object already carries `variableWidth` metadata (an outline the tool or
 *   the profile menu produced): the outline is rebuilt IN PLACE — object
 *   identity, stacking order and style are preserved, metadata refreshed.
 * - Plain stroked object: mirrors `applyWidthProfileToObject` — builds the
 *   filled outline path, empties the original's stroke, adds the outline
 *   beside it, and tags the new path with metadata for later re-editing.
 *
 * `centerline` (scene px) overrides the metadata centreline, which is what
 * lets the tool feed its freshly sampled bezier-faithful polyline in.
 * Returns the outline path, or null when nothing could be applied.
 */
export function applyWidthStationsToObject(
  canvas: fabric.Canvas,
  object: fabric.FabricObject,
  stations: WidthStation[],
  centerline?: Pt[],
): fabric.Path | null {
  const meta = readVariableWidthMeta(object);
  const normalized = normalizeStations(stations);
  if (normalized.length === 0) return null;

  if (meta) {
    // In-place refresh: work in scene space (centreline + widths), then map
    // the rebuilt outline back into command space so the object's transform
    // repositions it exactly as before.
    const line = centerline ?? pathSpaceToScene(object, meta.centerline);
    const outline = buildVariableWidthOutlineFromStations(line, normalized);
    if (outline.length < 3) return null;
    const localOutline = sceneToPathSpace(object, outline);
    const outlinePath = object as fabric.Path;
    outlinePath.set({ path: new fabric.Path(pointsToD(localOutline)).path });
    outlinePath.dirty = true;
    outlinePath.setBoundingBox(true);
    outlinePath.setCoords();
    (object as MetaCarrier).variableWidth = {
      stations: normalized.map(s => ({ ...s })),
      centerline: sceneToPathSpace(object, line),
      baseWidth: meta.baseWidth,
    };
    return outlinePath;
  }

  if ((object.strokeWidth ?? 0) <= 0 || typeof object.stroke !== 'string' || object.stroke === '') return null;
  const line = centerline ?? [];
  if (line.length < 2) return null;
  const outline = buildVariableWidthOutlineFromStations(line, normalized);
  if (outline.length < 3) return null;
  const path = new fabric.Path(pointsToD(outline), {
    fill: object.stroke as string,
    stroke: '',
    strokeWidth: 0,
    opacity: object.opacity ?? 1,
    name: 'Width Tool',
  });
  (path as MetaCarrier).variableWidth = {
    stations: normalized.map(s => ({ ...s })),
    // Fresh path sits at identity transform, so command space == scene.
    centerline: line.map(p => [p[0], p[1]] as Pt),
    baseWidth: object.strokeWidth ?? 1,
  };
  object.set({ stroke: '', strokeWidth: 0 });
  object.setCoords();
  canvas.add(path);
  return path;
}

/* ----------------------------- persistence ----------------------------- */

/** Key under which the re-edit record rides in Fabric JSON output. */
const VARIABLE_WIDTH_KEY = 'variableWidth';

// Fabric v6 keeps a static allow-list of extra property names that every
// `toObject()` / `toJSON()` call serialises — no per-call
// `propertiesToInclude` plumbing needed at any call site. Registering our
// key here is the entire save-side mechanism: project files
// (`projectFile.buildProject` → `canvas.toJSON()`), undo/redo snapshots
// (`history.ts` → `canvas.toJSON()`), clipboard, and symbols all carry the
// record for free. The revive side is equally automatic: `loadFromJSON`
// routes each record through the class constructor's `setOptions`, which
// assigns unknown props (ours included) back onto the instance verbatim —
// which is why `applyProject` still runs a fail-soft validation pass after
// loading (files can be hand-edited or written by other tools).
if (!fabric.FabricObject.customProperties.includes(VARIABLE_WIDTH_KEY)) {
  fabric.FabricObject.customProperties.push(VARIABLE_WIDTH_KEY);
}

/** Plain, JSON-safe deep copy of the object's re-edit record — the shape
 *  that lands in the serialised envelope. Undefined when the object is not
 *  Width-tool output. */
export function serializeVariableWidth(object: fabric.FabricObject): VariableWidthMeta | undefined {
  const meta = readVariableWidthMeta(object);
  if (!meta) return undefined;
  return {
    stations: meta.stations.map(s => ({ t: s.t, width: s.width })),
    centerline: meta.centerline.map(p => [p[0], p[1]] as Pt),
    baseWidth: meta.baseWidth,
  };
}

/** Strictly parse an untrusted station list: every entry must be a finite
 *  `{t, width}` pair, else the whole record is rejected (mixed garbage
 *  usually means schema drift, not a salvageable station set). */
function parseStations(value: unknown): WidthStation[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: WidthStation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const t = (entry as Record<string, unknown>).t;
    const width = (entry as Record<string, unknown>).width;
    if (typeof t !== 'number' || !Number.isFinite(t)) return null;
    if (typeof width !== 'number' || !Number.isFinite(width)) return null;
    out.push({ t, width });
  }
  return normalizeStations(out);
}

/** Strictly parse an untrusted centreline: ≥2 `[number, number]` pairs. */
function parseCenterline(value: unknown): Pt[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const pts: Pt[] = [];
  for (const p of value) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p;
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
    if (typeof y !== 'number' || !Number.isFinite(y)) return null;
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Validate untrusted `variableWidth` data and attach it to `object` as a
 * clean, normalised record (deep-cloned — never shares references with the
 * parsed file). Corrupted or partial metadata — missing/empty stations,
 * wrong entry types, a malformed centreline, a non-positive base width —
 * fails soft: the property is dropped and false is returned, but the
 * outline itself is left untouched as a plain filled path. Never throws.
 */
export function restoreVariableWidth(object: fabric.FabricObject, data: unknown): boolean {
  const carrier = object as MetaCarrier;
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const stations = record ? parseStations(record.stations) : null;
  const centerline = record ? parseCenterline(record.centerline) : null;
  const baseWidth = record ? record.baseWidth : undefined;
  if (
    !stations || !centerline ||
    typeof baseWidth !== 'number' || !Number.isFinite(baseWidth) || baseWidth <= 0
  ) {
    delete carrier.variableWidth;
    return false;
  }
  carrier.variableWidth = { stations, centerline, baseWidth };
  return true;
}

/**
 * Post-load sanitiser for a whole canvas: `loadFromJSON` has already
 * re-attached every `variableWidth` record found in the file verbatim, so
 * this walks the restored tree (groups included) and validates each one —
 * clean records are normalised in place, garbage is dropped. Returns the
 * number of usable records kept.
 */
export function restoreVariableWidthOnCanvas(canvas: { getObjects(): fabric.FabricObject[] }): number {
  let restored = 0;
  const walk = (objects: fabric.FabricObject[]): void => {
    for (const object of objects) {
      if (object instanceof fabric.Group) walk(object.getObjects());
      const raw = (object as MetaCarrier).variableWidth;
      if (raw === undefined) continue;
      if (restoreVariableWidth(object, raw)) restored++;
    }
  };
  walk(canvas.getObjects());
  return restored;
}
