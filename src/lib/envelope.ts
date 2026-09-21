/**
 * Envelope Distort — Make with Top Object (Illustrator
 * Object → Envelope Distort → Make with Top Object).
 *
 * Select the artwork plus one vector shape stacked ON TOP of it, then run:
 * every other selected object is reshaped to fill the top object's outline —
 * the sign-shop staple for arching text into banners, badges and panels.
 *
 * Mapping (horizontal-slice): the targets' combined bounding box is the
 * source frame. A source point at normalized (u, v) lands at
 * (xLeft + u·(xRight − xLeft), top + v·height), where [xLeft, xRight] is the
 * widest even-odd x-interval of the top shape's rings cut by the horizontal
 * line at that row. A rectangle top object is therefore a plain
 * translate+scale (near-identity when the two boxes coincide), while
 * circles, arcs and banner shapes read correctly row by row.
 *
 * Rebuild pipeline mirrors the other distort effects (warp / roughen /
 * boolean ops): rings come from `objectToRings` (px, canvas space, ~1px
 * flattening, group transforms already composed by fabric's
 * calcTransformMatrix), source edges are densified, every point is mapped,
 * and closed rings run through `ringToBezierPathD` so curved envelopes stay
 * curves instead of stair-stepping. Text targets are raster-traced into
 * outline paths first (same supersampled technique as textToOutline.ts —
 * that module keeps its tracer private, so the pipeline is mirrored here).
 * Raster images are skipped and counted for the caller's toast. The top
 * object itself is consumed (removed), exactly like Illustrator.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { objectToRings } from './booleanOps';
import { ringToBezierPathD } from './pathOps';
import { traceBitmap } from './cutContour';

const MM_TO_PX = 3.7795;              // shared cutter-pipeline dpi convention
const DENSIFY_SPACING = 4;            // px — same densify step as warp.ts
const ROW_BUCKETS = 2048;             // cached horizontal-slice rows (sub-px at sign sizes)
const TEXT_SUPERSAMPLE = 4;           // text trace supersampling factor

type Pt = [number, number];
type Ring = Pt[];

const TOP_TYPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon']);
const TEXT_TYPES = new Set(['i-text', 'text', 'textbox']);

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/* ----------------------------- scanline core ------------------------------- */

/**
 * Even-odd x-intervals where the rings cross the horizontal line at `y`.
 * Crossings from every ring are pooled, sorted and paired; an unpaired
 * (numerically tangent) crossing is dropped instead of mis-pairing, so
 * callers see either a clean set of [left, right] spans or none.
 */
export function ringIntervalsAtY(rings: readonly Ring[], y: number): Array<[number, number]> {
  const xs: number[] = [];
  for (const ring of rings) {
    const n = ring.length;
    if (n < 2) continue;
    // objectToRings closes rings with a duplicated final point; open input
    // rings are treated as closed anyway (envelope shapes are closed outlines).
    const closed = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
    const edges = closed ? n - 1 : n;
    for (let i = 0; i < edges; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const y1 = a[1], y2 = b[1];
      // Half-open rule [min, max): a vertex exactly on the line counts once.
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(a[0] + ((y - y1) * (b[0] - a[0])) / (y2 - y1));
      }
    }
  }
  if (xs.length < 2) return [];
  xs.sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  const pairs = xs.length - (xs.length % 2);
  for (let i = 0; i < pairs; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/** A flattened top object: its rings (canvas px) plus its bounding frame. */
export interface EnvelopeShape {
  rings: Ring[];
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Build an envelope from outline rings; null for empty/degenerate geometry. */
export function createEnvelopeShape(rings: readonly Ring[]): EnvelopeShape | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, count = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      count++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (count < 3) return null;
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return null;
  const width = right - left;
  const height = bottom - top;
  if (!(width > 0) || !(height > 0)) return null;
  return { rings: rings.map(r => r.slice()), left, top, width, height };
}

/**
 * Widest even-odd x-interval at normalized row v ∈ [0,1]. Rows with no width
 * (the exact tangent top of a circle, for instance) borrow the nearest row
 * that has one, so the mapping stays continuous instead of snapping to the
 * bounding box.
 */
export function envelopeRowInterval(shape: EnvelopeShape, vRaw: number): [number, number] {
  const v = clamp01(vRaw);
  const widestAt = (vv: number): [number, number] | null => {
    const y = shape.top + vv * shape.height;
    let best: [number, number] | null = null;
    for (const iv of ringIntervalsAtY(shape.rings, y)) {
      if (iv[1] - iv[0] > 0.5 && (!best || iv[1] - iv[0] > best[1] - best[0])) best = [iv[0], iv[1]];
    }
    return best;
  };
  const direct = widestAt(v);
  if (direct) return direct;
  const step = 1 / 64;
  for (let k = 1; k <= 64; k++) {
    const up = widestAt(Math.min(1, v + k * step));
    if (up) return up;
    const down = widestAt(Math.max(0, v - k * step));
    if (down) return down;
  }
  return [shape.left, shape.left + shape.width];
}

/** Map a normalized source coordinate (u, v) onto the envelope. */
export function envelopeMapPoint(shape: EnvelopeShape, uRaw: number, vRaw: number): Pt {
  const u = clamp01(uRaw);
  const v = clamp01(vRaw);
  const [xl, xr] = envelopeRowInterval(shape, v);
  return [xl + u * (xr - xl), shape.top + v * shape.height];
}

/** Point mapper from source-frame px coordinates into the envelope. */
export type EnvelopeMapper = (x: number, y: number) => Pt;

/**
 * Cached per-row mapper: rows are quantized to ROW_BUCKETS buckets and the
 * widest-interval scan runs once per bucket, so mapping thousands of
 * densified points stays cheap. Y positions stay exact (only the row's
 * x-extent is read from the nearest bucket).
 */
export function createEnvelopeMapper(
  shape: EnvelopeShape,
  src: { left: number; top: number; width: number; height: number },
): EnvelopeMapper {
  const srcLeft = src.left;
  const srcTop = src.top;
  const srcW = Math.max(1, src.width);
  const srcH = Math.max(1, src.height);
  const rowCache = new Map<number, [number, number]>();
  return (x: number, y: number): Pt => {
    const v = clamp01((y - srcTop) / srcH);
    const bucket = Math.round(v * ROW_BUCKETS);
    let iv = rowCache.get(bucket);
    if (!iv) {
      iv = envelopeRowInterval(shape, bucket / ROW_BUCKETS);
      rowCache.set(bucket, iv);
    }
    const u = clamp01((x - srcLeft) / srcW);
    return [iv[0] + u * (iv[1] - iv[0]), shape.top + v * shape.height];
  };
}

/* ------------------------------ selection ---------------------------------- */

/** Split items into the top-most (max z) and the rest, keeping array order. */
export function splitTopmostByZ<T>(items: readonly T[], zOf: (item: T) => number): { top: T | null; rest: T[] } {
  if (items.length === 0) return { top: null, rest: [] };
  let topIdx = 0;
  for (let i = 1; i < items.length; i++) {
    if (zOf(items[i]) >= zOf(items[topIdx])) topIdx = i; // ties: later item wins
  }
  return { top: items[topIdx], rest: items.filter((_, i) => i !== topIdx) };
}

/** Only real vector shapes can be the envelope (the top object). */
export function canEnvelopeTopObject(obj: fabric.FabricObject): boolean {
  return TOP_TYPES.has(obj.type ?? '');
}

/** Vector shapes, groups (recursed) and live text (traced) can be targets. */
export function canEnvelopeTargetObject(obj: fabric.FabricObject): boolean {
  const t = obj.type ?? '';
  return TOP_TYPES.has(t) || t === 'polyline' || t === 'group' || TEXT_TYPES.has(t);
}

/* ---------------------------- rebuild helpers ------------------------------ */

function toD(pts: Pt[], closed: boolean): string {
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return closed ? `${d} Z` : d;
}

/** Same 4px densify pass as warp.ts so curved envelopes don't facet. */
function densify(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / DENSIFY_SPACING));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Flatten a group tree into its leaf objects (rings come back in canvas
 *  space because fabric's calcTransformMatrix already composes ancestors). */
function gatherMembers(obj: fabric.FabricObject, out: fabric.FabricObject[]): void {
  if (obj.type === 'group') {
    for (const child of (obj as fabric.Group).getObjects()) gatherMembers(child, out);
  } else {
    out.push(obj);
  }
}

/** Map every ring point and refit: closed rings through ringToBezierPathD
 *  (smooth runs become C segments, corners stay L), open rings stay polylines. */
function mapRingsToD(rings: Ring[], map: EnvelopeMapper): string {
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 2) continue;
    const mapped = densify(ring).map(([x, y]) => map(x, y));
    if (mapped.length < 2) continue;
    const n = mapped.length;
    const closed = mapped[0][0] === mapped[n - 1][0] && mapped[0][1] === mapped[n - 1][1];
    if (closed) {
      const body = mapped.slice(0, n - 1); // strip the duplicated closing point
      const d = body.length >= 3 ? ringToBezierPathD(body) : toD(mapped, true);
      if (d) parts.push(d);
    } else {
      parts.push(toD(mapped, false));
    }
  }
  return parts.join(' ');
}

/**
 * Trace a text object into an outline fabric.Path — the same supersampled
 * StaticCanvas + traceBitmap pipeline textToOutline.ts uses (kept private
 * there, mirrored here). Returns null if nothing traceable.
 */
async function traceTextToOutlinePath(text: fabric.FabricObject): Promise<fabric.Path | null> {
  const r = text.getBoundingRect();
  if (r.width < 1 || r.height < 1) return null;

  const SS = TEXT_SUPERSAMPLE;
  const W = Math.min(4096, Math.max(8, Math.ceil(r.width * SS)));
  const H = Math.min(4096, Math.max(8, Math.ceil(r.height * SS)));
  const el = document.createElement('canvas');
  el.width = W; el.height = H;
  const sc = new fabric.StaticCanvas(el, { width: W, height: H, renderOnAddRemove: false, enableRetinaScaling: false });

  let paths: Pt[][];
  try {
    const clone = await text.clone();
    clone.set({
      left: 0, top: 0, originX: 'left', originY: 'top', angle: 0,
      scaleX: (text.scaleX ?? 1) * SS, scaleY: (text.scaleY ?? 1) * SS,
      fill: '#000000', stroke: '', shadow: null,
    });
    clone.setCoords();
    sc.add(clone);
    sc.renderAll();
    const ctx = el.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, W, H);
    const pixelSizeMm = (r.width / MM_TO_PX) / W; // mm per raster pixel
    paths = traceBitmap(img, { useAlpha: true, threshold: 64, simplifyTolerance: 1.2, pixelSizeMm });
  } finally {
    sc.dispose();
  }
  if (paths.length === 0) return null;

  // Trace coords are mm relative to the text's top-left; offset to the page
  // and convert to px so the traced path lands where the text was.
  const offX = r.left / MM_TO_PX;
  const offY = r.top / MM_TO_PX;
  const d = paths
    .map(c => c
      .map(([x, y]) => [(x + offX) * MM_TO_PX, (y + offY) * MM_TO_PX] as Pt)
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ') + ' Z')
    .join(' ');

  return new fabric.Path(d, {
    fill: (text.fill as string) ?? '#000000',
    fillRule: 'evenodd',
    stroke: '',
    strokeWidth: 0,
    opacity: text.opacity ?? 1,
  });
}

/* ------------------------------- public op --------------------------------- */

export interface EnvelopeOutcome {
  /** Top-level objects that were reshaped into the envelope. */
  reshaped: number;
  /** Selected objects that could not participate (raster images, empties). */
  skipped: number;
}

/**
 * Reshape `targets` to fill `top`'s outline (Illustrator "Make with Top
 * Object"). Groups are recursed and rebuilt as groups; live text is traced
 * into outline paths first. The top object is consumed (removed). History is
 * NOT pushed here — callers push once around the whole selection op.
 * Returns null when the op can't run (no canvas, non-vector top, degenerate
 * geometry); otherwise a reshaped/skipped count.
 */
export async function applyEnvelopeWithTopObject(
  top: fabric.FabricObject,
  targets: readonly fabric.FabricObject[],
  canvas: fabric.Canvas | null = getCanvas(),
): Promise<EnvelopeOutcome | null> {
  if (!canEnvelopeTopObject(top) || targets.length === 0) return null;
  if (!canvas) return null;
  const topShape = createEnvelopeShape(objectToRings(top) ?? []);
  if (!topShape) return null;

  // Expand every target into leaf geometry, tracing text on the way.
  const outcome: EnvelopeOutcome = { reshaped: 0, skipped: 0 };
  type Member = { source: fabric.FabricObject; isTracedText: boolean };
  type Plan = { original: fabric.FabricObject; members: Member[] };
  const plans: Plan[] = [];

  for (const target of targets) {
    if (target === top) continue; // defensive: never reshape the envelope itself
    if (!canEnvelopeTargetObject(target)) { outcome.skipped++; continue; }
    const leaves: fabric.FabricObject[] = [];
    gatherMembers(target, leaves);
    const members: Member[] = [];
    for (const leaf of leaves) {
      if (TEXT_TYPES.has(leaf.type ?? '')) {
        const outline = await traceTextToOutlinePath(leaf);
        if (outline) members.push({ source: outline, isTracedText: true });
        continue; // untraceable (empty) text is dropped
      }
      if ((objectToRings(leaf)?.length ?? 0) > 0) members.push({ source: leaf, isTracedText: false });
    }
    if (members.length === 0) { outcome.skipped++; continue; }
    plans.push({ original: target, members });
  }
  if (plans.length === 0) return outcome;

  // Source frame = combined bbox of every target ring, so the whole selection
  // fills the envelope as one unit (Illustrator behaviour).
  const ringsByMember = new Map<Member, Ring[]>();
  let left = Infinity, right = -Infinity, topY = Infinity, bottomY = -Infinity;
  for (const plan of plans) {
    for (const m of plan.members) {
      const rings = (objectToRings(m.source) ?? []) as Ring[];
      ringsByMember.set(m, rings);
      for (const ring of rings) {
        for (const [x, y] of ring) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < topY) topY = y;
          if (y > bottomY) bottomY = y;
        }
      }
    }
  }
  if (!Number.isFinite(left) || !Number.isFinite(topY) || right <= left || bottomY <= topY) return outcome;
  const map = createEnvelopeMapper(topShape, { left, top: topY, width: right - left, height: bottomY - topY });

  for (const plan of plans) {
    const paths: fabric.Path[] = [];
    for (const m of plan.members) {
      const d = mapRingsToD(ringsByMember.get(m) ?? [], map);
      if (!d) continue;
      paths.push(new fabric.Path(d, {
        fill: (m.source.fill as string) ?? '',
        stroke: (m.source.stroke as string) ?? '',
        strokeWidth: m.source.strokeWidth ?? 0,
        opacity: m.source.opacity ?? 1,
        ...(m.isTracedText ? { fillRule: 'evenodd' as const } : {}),
      }));
    }
    if (paths.length === 0) { outcome.skipped++; continue; }
    // Keep structure: a group target comes back as a group of mapped paths.
    const replacement: fabric.FabricObject = plan.original.type === 'group' && paths.length > 1
      ? new fabric.Group(paths)
      : paths[0];
    canvas.remove(plan.original);
    canvas.add(replacement);
    outcome.reshaped++;
  }

  // The envelope itself is consumed, exactly like Illustrator — but only when
  // the op actually did something, so a failed run leaves the document alone.
  if (outcome.reshaped > 0) canvas.remove(top);
  return outcome;
}

/**
 * Run "Make with Top Object" on the active selection: needs ≥2 objects with
 * the TOP-most being a vector shape; it becomes the envelope, the rest are
 * reshaped into it. Returns null when the guard fails (callers show the
 * explanatory toast), otherwise a reshaped/skipped count. One history push.
 */
export async function envelopeSelection(): Promise<EnvelopeOutcome | null> {
  const canvas = getCanvas();
  if (!canvas) return null;
  const active = canvas.getActiveObjects();
  if (active.length < 2) return null;
  // Top-most = highest z in the canvas stack (fabric keeps active-selection
  // members in place, so indexOf is the real z). Group children sub-selected
  // via subTargetCheck aren't in the stack (-1); ties then fall to array order.
  const { top, rest } = splitTopmostByZ(active, (o) => canvas.getObjects().indexOf(o));
  if (!top || !canEnvelopeTopObject(top) || rest.length === 0) return null;
  const out = await applyEnvelopeWithTopObject(top, rest, canvas);
  if (out && out.reshaped > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return out;
}
