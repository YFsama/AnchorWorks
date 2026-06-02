/**
 * Join paths (Illustrator Ctrl+J). With two open paths selected, connects the
 * nearest pair of endpoints into one continuous path. With a single open path,
 * closes it. Geometry is flattened to polylines (the cutter-friendly route the
 * rest of the path tooling uses), then rebuilt as a new fabric.Path in absolute
 * space so position is preserved.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;

type Pt = [number, number];

/** Longest polyline of an object, in absolute px (or null if none). */
function firstPolyPx(obj: fabric.FabricObject): { points: Pt[]; closed: boolean } | null {
  const cuts = buildOutlineCutPaths([obj], 0, 1);
  if (cuts.length === 0) return null;
  let best = cuts[0];
  for (const c of cuts) if (c.points.length > best.points.length) best = c;
  return { points: best.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt), closed: best.closed };
}

function toD(pts: Pt[], closed: boolean): string {
  const parts = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Concatenate two open polylines at their nearest endpoints. */
function joinTwo(a: Pt[], b: Pt[]): Pt[] {
  const aS = a[0], aE = a[a.length - 1], bS = b[0], bE = b[b.length - 1];
  const cases = [
    { d: dist(aE, bS), pts: () => [...a, ...b] },
    { d: dist(aE, bE), pts: () => [...a, ...b.slice().reverse()] },
    { d: dist(aS, bS), pts: () => [...a.slice().reverse(), ...b] },
    { d: dist(aS, bE), pts: () => [...a.slice().reverse(), ...b.slice().reverse()] },
  ];
  cases.sort((x, y) => x.d - y.d);
  return cases[0].pts();
}

export function canJoin(): boolean {
  const c = getCanvas();
  if (!c) return false;
  const n = c.getActiveObjects().filter(o => o.type === 'path').length;
  return n === 1 || n === 2;
}

/** Join (2 paths) or close (1 path) the selection. Returns true on success. */
export function joinSelection(): boolean {
  const c = getCanvas();
  if (!c) return false;
  const paths = c.getActiveObjects().filter(o => o.type === 'path');
  if (paths.length !== 1 && paths.length !== 2) return false;

  const styleFrom = paths[0];
  const style = {
    fill: (styleFrom.fill as string) ?? '',
    stroke: (styleFrom.stroke as string) ?? '#111',
    strokeWidth: styleFrom.strokeWidth ?? 1,
    opacity: styleFrom.opacity ?? 1,
  };

  let d: string;
  if (paths.length === 1) {
    const p = firstPolyPx(paths[0]);
    if (!p || p.closed || p.points.length < 2) return false;
    d = toD(p.points, true); // close it
  } else {
    const a = firstPolyPx(paths[0]);
    const b = firstPolyPx(paths[1]);
    if (!a || !b || a.points.length < 2 || b.points.length < 2) return false;
    d = toD(joinTwo(a.points, b.points), false);
  }

  const np = new fabric.Path(d, style);
  for (const p of paths) c.remove(p);
  c.add(np);
  c.setActiveObject(np);
  c.requestRenderAll();
  pushHistory();
  return true;
}
