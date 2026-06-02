/**
 * Cut bridges / tabs (SignMaster "Bridge", stencil/weeding aid).
 *
 * Breaks a closed cut path into several open arcs, leaving small uncut gaps
 * (bridges) so the cut-out piece — or a stencil island like the centre of an
 * "O" — stays attached to the surrounding material instead of falling out.
 * Pure mm-space geometry; the dialog applies it to the store's cut paths.
 */
import type { CutPath } from '../store/editor';

type Pt = [number, number];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Split one closed polyline into `count` open segments, each pair separated by a
 * `gapMm` uncut bridge at evenly-spaced arc-length positions (one of them at the
 * start, so the closing seam is also bridged). Densifies to ~`stepMm` first so
 * the gaps land cleanly regardless of vertex spacing.
 */
export function bridgePolyline(pts: Pt[], count: number, gapMm: number, stepMm = 0.5): Pt[][] {
  if (count < 1 || pts.length < 2) return [pts.slice()];

  // Densify with running arc length.
  const dense: Array<{ p: Pt; s: number }> = [{ p: pts[0], s: 0 }];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / stepMm));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      s += len / n;
      dense.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], s });
    }
  }
  const L = s;
  if (L < gapMm * count) return [pts.slice()]; // too small to bridge

  const half = gapMm / 2;
  const centers = Array.from({ length: count }, (_, k) => (k * L) / count);
  const inGap = (pos: number) => centers.some((c) => {
    let d = Math.abs(pos - c);
    d = Math.min(d, L - d); // circular distance
    return d < half;
  });

  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const { p, s: pos } of dense) {
    if (inGap(pos)) { if (cur.length > 1) segs.push(cur); cur = []; }
    else cur.push(p);
  }
  if (cur.length > 1) segs.push(cur);
  return segs.length ? segs : [pts.slice()];
}

/**
 * Apply bridges to every closed cut path, returning a new cut-path list with
 * each closed path replaced by its open bridged segments. Reg marks and
 * already-open paths pass through untouched.
 */
export function addBridges(cutPaths: CutPath[], count: number, gapMm: number): CutPath[] {
  const out: CutPath[] = [];
  for (const cp of cutPaths) {
    if (cp.kind === 'regmark' || !cp.closed || cp.points.length < 4) { out.push(cp); continue; }
    const segs = bridgePolyline(cp.points, count, gapMm);
    if (segs.length === 1 && segs[0] === cp.points) { out.push(cp); continue; }
    segs.forEach((seg, i) => out.push({
      id: `${cp.id}-b${i}`,
      points: seg,
      closed: false,
      kind: cp.kind,
      passes: cp.passes,
      color: cp.color,
    }));
  }
  return out;
}
