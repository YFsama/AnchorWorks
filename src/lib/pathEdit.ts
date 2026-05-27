/**
 * Direct-select (path anchor) editor.
 *
 * Given a fabric.Path, displays small handles at each anchor point so the
 * user can drag individual anchors to reshape the path. Handles are overlay
 * objects (excludeFromExport, not selectable) added to the same canvas.
 *
 * Usage:
 *   enterPathEdit(canvas, path)   // begin editing this path
 *   exitPathEdit(canvas)          // remove all handles & detach listeners
 */

import * as fabric from 'fabric';
import { readToken } from './tokens';

type FabricObject = fabric.FabricObject;

// Per-handle metadata stored on the handle object itself.
type AnchorHandle = fabric.Circle & {
  _pathEdit?: {
    role: 'anchor';
    cmdIndex: number;     // index into path.path
    xKey: number;         // index in command array of the X value to mutate
    yKey: number;         // index in command array of the Y value to mutate
  };
};
type TangentHandle = fabric.Rect & {
  _pathEdit?: {
    role: 'tangent';
    cmdIndex: number;     // index into path.path (the C command)
    xKey: number;         // 1 (cp1.x) or 3 (cp2.x)
    yKey: number;         // 2 (cp1.y) or 4 (cp2.y)
  };
};
type AnyHandle = AnchorHandle | TangentHandle;
type GuideLine = fabric.Line & { _isPathEditGuide?: boolean };

interface EditState {
  path: fabric.Path;
  handles: AnyHandle[];
  guides: GuideLine[];
  prevSelectable: boolean;
  prevEvented: boolean;
  onModified: () => void;
  /** Canvas-level mouse:down listener for add-anchor-on-path. */
  uninstallAddAnchor: () => void;
}

let state: EditState | null = null;

const HANDLE_STROKE = '#ffffff';
const HANDLE_RADIUS = 4;

/**
 * Pull anchor endpoints out of a Path command. Each SVG path command has its
 * "end point" at the last (x,y) pair; we record the indices of those values
 * so dragging can mutate them in-place.
 *
 * Returns null for commands with no anchor (e.g. Z).
 */
function commandAnchor(cmd: (string | number)[]): { xKey: number; yKey: number } | null {
  const c = cmd[0] as string;
  switch (c) {
    case 'M':
    case 'L':
    case 'T':
      // M x y / L x y / T x y → end at indices 1,2
      return { xKey: 1, yKey: 2 };
    case 'H':
      // H x  (we treat it but flat path data from makePathSimpler doesn't keep H)
      return null;
    case 'V':
      return null;
    case 'Q':
      // Q cx cy x y → end at 3,4
      return { xKey: 3, yKey: 4 };
    case 'C':
      // C c1x c1y c2x c2y x y → end at 5,6
      return { xKey: 5, yKey: 6 };
    case 'S':
      // S c2x c2y x y
      return { xKey: 3, yKey: 4 };
    case 'A':
      // A rx ry rot large sweep x y → end at 6,7
      return { xKey: 6, yKey: 7 };
    case 'Z':
    case 'z':
      return null;
    default:
      return null;
  }
}

/**
 * Convert an anchor point from path-local (uncentered) coordinates to absolute
 * canvas coordinates, taking into account the path's transform and its
 * pathOffset (Path stores commands centered around pathOffset internally).
 */
function pathPointToCanvas(path: fabric.Path, x: number, y: number): { x: number; y: number } {
  // Path commands are stored in untransformed local space. The visible center
  // of the path in local space is pathOffset; the Fabric object's transform
  // maps the center to canvas space. So the canvas position for a raw command
  // point (x,y) is: transformMatrix * (x - pathOffset.x, y - pathOffset.y)
  const m = path.calcTransformMatrix();
  const px = x - path.pathOffset.x;
  const py = y - path.pathOffset.y;
  return {
    x: m[0] * px + m[2] * py + m[4],
    y: m[1] * px + m[3] * py + m[5],
  };
}

/**
 * Inverse: given an absolute canvas point, return the raw command-space (x,y)
 * we should store into the path.
 */
function canvasPointToPath(path: fabric.Path, x: number, y: number): { x: number; y: number } {
  const m = path.calcTransformMatrix();
  const inv = fabric.util.invertTransform(m);
  const lx = inv[0] * x + inv[2] * y + inv[4];
  const ly = inv[1] * x + inv[3] * y + inv[5];
  return { x: lx + path.pathOffset.x, y: ly + path.pathOffset.y };
}

function rebuildHandles() {
  if (!state) return;
  const { path, handles, guides } = state;
  // Update positions of existing handles to match the current path.
  for (const h of handles) {
    const meta = h._pathEdit!;
    const cmd = path.path[meta.cmdIndex] as unknown as (string | number)[];
    const x = cmd[meta.xKey] as number;
    const y = cmd[meta.yKey] as number;
    const p = pathPointToCanvas(path, x, y);
    h.set({ left: p.x, top: p.y });
    h.setCoords();
  }
  // Refresh tangent guidelines — they link each tangent diamond to its
  // anchor so the user can see which tangent belongs to which anchor.
  rebuildGuides(guides);
}

function rebuildGuides(guides: GuideLine[]) {
  if (!state) return;
  const { path } = state;
  // Mutate the guide list in place: clear, then re-populate from the
  // current command list. We track each `C` command's cp1 ↔ start-anchor
  // and cp2 ↔ end-anchor pairings.
  const canvas = path.canvas;
  if (!canvas) return;
  for (const g of guides) canvas.remove(g);
  guides.length = 0;
  for (let i = 0; i < path.path.length; i++) {
    const cmd = path.path[i] as unknown as (string | number)[];
    if (cmd[0] !== 'C') continue;
    const prev = path.path[i - 1] as unknown as (string | number)[] | undefined;
    if (!prev) continue;
    const prevAnchor = commandAnchor(prev);
    if (!prevAnchor) continue;
    const startA = pathPointToCanvas(path, prev[prevAnchor.xKey] as number, prev[prevAnchor.yKey] as number);
    const endA = pathPointToCanvas(path, cmd[5] as number, cmd[6] as number);
    const cp1 = pathPointToCanvas(path, cmd[1] as number, cmd[2] as number);
    const cp2 = pathPointToCanvas(path, cmd[3] as number, cmd[4] as number);
    guides.push(makeGuide(startA, cp1));
    guides.push(makeGuide(endA, cp2));
  }
  for (const g of guides) canvas.add(g);
  for (const g of guides) canvas.sendObjectToBack(g);
  for (const h of state.handles) canvas.bringObjectToFront(h);
}

function makeGuide(from: { x: number; y: number }, to: { x: number; y: number }): GuideLine {
  const g = new fabric.Line([from.x, from.y, to.x, to.y], {
    stroke: readToken('--color-accent2', '#5ac8d8'),
    strokeWidth: 1,
    strokeDashArray: [2, 3],
    selectable: false,
    evented: false,
    excludeFromExport: true,
    objectCaching: false,
    opacity: 0.6,
  }) as GuideLine;
  g._isPathEditGuide = true;
  return g;
}

/**
 * Begin direct-select on a single path. Any prior edit session is exited first.
 */
export function enterPathEdit(canvas: fabric.Canvas, path: fabric.Path) {
  if (state) exitPathEdit(canvas);

  const handles: AnyHandle[] = [];
  for (let i = 0; i < path.path.length; i++) {
    const cmd = path.path[i] as unknown as (string | number)[];
    const anchor = commandAnchor(cmd);
    if (anchor) {
      const x = cmd[anchor.xKey] as number;
      const y = cmd[anchor.yKey] as number;
      if (typeof x === 'number' && typeof y === 'number') {
        const handle = makeAnchorHandle(canvas, path, i, anchor.xKey, anchor.yKey, { x, y });
        handles.push(handle);
        canvas.add(handle);
      }
    }
    // Tangent handles — one per control point of each C command. Q
    // commands also have a single control point; we render it the same
    // way so the user can grab and reshape quadratic curves too.
    if (cmd[0] === 'C') {
      handles.push(makeTangentHandle(canvas, path, i, 1, 2));
      handles.push(makeTangentHandle(canvas, path, i, 3, 4));
    } else if (cmd[0] === 'Q') {
      handles.push(makeTangentHandle(canvas, path, i, 1, 2));
    }
  }
  for (const h of handles) {
    if (h._pathEdit?.role === 'tangent') canvas.add(h);
  }

  const guides: GuideLine[] = [];

  // Make sure handles render above the path.
  for (const h of handles) canvas.bringObjectToFront(h);

  const onModified = () => rebuildHandles();
  path.on('modified', onModified);
  path.on('moving', onModified);
  path.on('scaling', onModified);
  path.on('rotating', onModified);

  const uninstallAddAnchor = installAddAnchorListener(canvas, path);

  state = {
    path,
    handles,
    guides,
    prevSelectable: path.selectable !== false,
    prevEvented: path.evented !== false,
    onModified,
    uninstallAddAnchor,
  };

  rebuildGuides(guides);
  canvas.requestRenderAll();
}

function makeAnchorHandle(
  canvas: fabric.Canvas,
  path: fabric.Path,
  cmdIndex: number,
  xKey: number,
  yKey: number,
  p: { x: number; y: number },
): AnchorHandle {
  const canvasP = pathPointToCanvas(path, p.x, p.y);
  const handle = new fabric.Circle({
    left: canvasP.x,
    top: canvasP.y,
    radius: HANDLE_RADIUS,
    fill: readToken('--color-accent2', '#5ac8d8'),
    stroke: HANDLE_STROKE,
    strokeWidth: 1,
    originX: 'center',
    originY: 'center',
    hasControls: false,
    hasBorders: false,
    selectable: false,
    evented: true,
    hoverCursor: 'pointer',
    excludeFromExport: true,
    objectCaching: false,
  }) as AnchorHandle;
  handle._pathEdit = { role: 'anchor', cmdIndex, xKey, yKey };
  (handle as unknown as { _isPathEditHandle: boolean })._isPathEditHandle = true;
  attachHandleDragLogic(canvas, path, handle, () => {
    // Alt-click to delete the anchor — drops the command for this anchor
    // (and stitches the next command to the prior anchor when removing
    // the middle of a path). The very first M anchor is the path's
    // origin; removing it would orphan the rest of the commands so we
    // refuse the deletion in that case.
    return cmdIndex !== 0;
  }, () => {
    removeAnchor(path, cmdIndex);
    rebuildEditOverlay(canvas, path);
  });
  // Double-click toggles smooth ↔ corner for this anchor. "Smooth" means
  // any C/Q segment whose start- or end-anchor is this one keeps its
  // control points; "corner" means converting those segments to L by
  // dropping the control points. Re-emit the path on toggle.
  handle.on('mousedblclick', () => {
    toggleAnchorSmoothCorner(path, cmdIndex);
    rebuildEditOverlay(canvas, path);
  });
  return handle;
}

/** Strip the command at `cmdIndex` from the path. The previous anchor's
 *  outgoing segment becomes the predecessor of whatever command followed
 *  (commonly: M…L A L B L C with B removed becomes M…L A L C). When the
 *  removed command was a C, the cp1/cp2 are dropped with it. */
function removeAnchor(path: fabric.Path, cmdIndex: number) {
  if (cmdIndex <= 0 || cmdIndex >= path.path.length) return;
  // Splice out the command; the next segment now connects directly back
  // to the prior anchor. No need to rewrite the next command — its end
  // anchor stays where it was, just becomes the next adjacency.
  path.path.splice(cmdIndex, 1);
  path.dirty = true;
  path.setBoundingBox(true);
  path.setCoords();
}

function makeTangentHandle(
  canvas: fabric.Canvas,
  path: fabric.Path,
  cmdIndex: number,
  xKey: number,
  yKey: number,
): TangentHandle {
  const cmd = path.path[cmdIndex] as unknown as (string | number)[];
  const p = pathPointToCanvas(path, cmd[xKey] as number, cmd[yKey] as number);
  const handle = new fabric.Rect({
    left: p.x,
    top: p.y,
    width: HANDLE_RADIUS * 1.8,
    height: HANDLE_RADIUS * 1.8,
    fill: '#ffffff',
    stroke: readToken('--color-accent2', '#5ac8d8'),
    strokeWidth: 1,
    originX: 'center',
    originY: 'center',
    angle: 45, // diamond
    hasControls: false,
    hasBorders: false,
    selectable: false,
    evented: true,
    hoverCursor: 'pointer',
    excludeFromExport: true,
    objectCaching: false,
  }) as TangentHandle;
  handle._pathEdit = { role: 'tangent', cmdIndex, xKey, yKey };
  (handle as unknown as { _isPathEditHandle: boolean })._isPathEditHandle = true;
  attachHandleDragLogic(canvas, path, handle);
  return handle;
}

function attachHandleDragLogic(
  canvas: fabric.Canvas,
  path: fabric.Path,
  handle: AnyHandle,
  canDelete: () => boolean = () => false,
  onDelete: () => void = () => {},
) {
  handle.on('mousedown', (opt) => {
    if (opt.e) (opt.e as Event).stopPropagation?.();
    // Alt-click handler — short-circuits the drag flow and removes the
    // anchor (or no-ops when the caller refuses the deletion, e.g. the
    // path's first M anchor).
    const native = opt.e as MouseEvent | TouchEvent;
    if ((native as MouseEvent).altKey && canDelete()) {
      onDelete();
      return;
    }
    const move = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (!state) return;
      const sp = canvas.getScenePoint(e.e);
      const local = canvasPointToPath(path, sp.x, sp.y);
      const meta = handle._pathEdit!;
      const cmd = path.path[meta.cmdIndex] as unknown as (string | number)[];
      cmd[meta.xKey] = local.x;
      cmd[meta.yKey] = local.y;
      handle.set({ left: sp.x, top: sp.y });
      handle.setCoords();
      path.dirty = true;
      canvas.requestRenderAll();
      // Tangent drags also have to refresh the dashed guide lines so the
      // anchor↔tangent visual link stays connected to the diamond.
      if (state) rebuildGuides(state.guides);
    };
    const up = () => {
      canvas.off('mouse:move', move);
      canvas.off('mouse:up', up);
      path.setBoundingBox(true);
      path.setCoords();
      rebuildHandles();
      canvas.fire('object:modified', { target: path });
      canvas.requestRenderAll();
    };
    canvas.on('mouse:move', move);
    canvas.on('mouse:up', up);
  });
}

/** Toggle the anchor at `cmdIndex` between smooth (curve segments retained)
 *  and corner (curve segments collapsed to lines). When converting corner
 *  → smooth, we synthesise default tangents that point one-third of the
 *  way to the neighbouring anchors so the visual change is gentle. */
function toggleAnchorSmoothCorner(path: fabric.Path, cmdIndex: number) {
  const cmd = path.path[cmdIndex] as unknown as (string | number)[];
  const anchor = commandAnchor(cmd);
  if (!anchor) return;
  const ax = cmd[anchor.xKey] as number;
  const ay = cmd[anchor.yKey] as number;

  const isCurrentlySmooth = cmd[0] === 'C' || cmd[0] === 'Q';
  const next = path.path[cmdIndex + 1] as unknown as (string | number)[] | undefined;
  const isNextSmooth = next && (next[0] === 'C' || next[0] === 'Q');

  if (isCurrentlySmooth || isNextSmooth) {
    // Smooth → corner: rewrite incoming + outgoing curve commands as L.
    if (isCurrentlySmooth) {
      path.path[cmdIndex] = ['L', ax, ay] as unknown as (typeof path.path)[number];
    }
    if (isNextSmooth && next) {
      const nextAnchor = commandAnchor(next);
      if (nextAnchor) {
        const nx = next[nextAnchor.xKey] as number;
        const ny = next[nextAnchor.yKey] as number;
        path.path[cmdIndex + 1] = ['L', nx, ny] as unknown as (typeof path.path)[number];
      }
    }
  } else {
    // Corner → smooth: rewrite incoming segment as C with default cp1
    // halfway from prev anchor to this anchor, cp2 1/3 of the way back.
    const prev = path.path[cmdIndex - 1] as unknown as (string | number)[] | undefined;
    if (prev && cmd[0] === 'L') {
      const prevAnchor = commandAnchor(prev);
      if (prevAnchor) {
        const px = prev[prevAnchor.xKey] as number;
        const py = prev[prevAnchor.yKey] as number;
        const cp1x = px + (ax - px) * 0.33;
        const cp1y = py + (ay - py) * 0.33;
        const cp2x = px + (ax - px) * 0.66;
        const cp2y = py + (ay - py) * 0.66;
        path.path[cmdIndex] = ['C', cp1x, cp1y, cp2x, cp2y, ax, ay] as unknown as (typeof path.path)[number];
      }
    }
  }
  path.dirty = true;
}

function rebuildEditOverlay(canvas: fabric.Canvas, path: fabric.Path) {
  exitPathEdit(canvas);
  enterPathEdit(canvas, path);
}

const ADD_HIT_PX = 6;
const SEGMENT_SAMPLES = 32;

/** Sample a single segment at `n` evenly-spaced parameter values. Returns
 *  the closest sample to `pt` and the parameter `t` at which it occurs.
 *  Used by the click-on-path-to-add-anchor gesture to pinpoint where the
 *  user wants to subdivide. */
function closestPointOnSegment(
  start: { x: number; y: number },
  cmd: (string | number)[],
  end: { x: number; y: number },
  pt: { x: number; y: number },
  n = SEGMENT_SAMPLES,
): { t: number; dist: number; x: number; y: number } {
  let best = { t: 0, dist: Infinity, x: start.x, y: start.y };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = sampleSegment(start, cmd, end, t);
    const dx = s.x - pt.x;
    const dy = s.y - pt.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.dist) best = { t, dist: d2, x: s.x, y: s.y };
  }
  best.dist = Math.sqrt(best.dist);
  return best;
}

function sampleSegment(
  start: { x: number; y: number },
  cmd: (string | number)[],
  end: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const c = cmd[0] as string;
  if (c === 'L' || c === 'M') {
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  }
  if (c === 'C') {
    const cp1 = { x: cmd[1] as number, y: cmd[2] as number };
    const cp2 = { x: cmd[3] as number, y: cmd[4] as number };
    return bezierCubic(start, cp1, cp2, end, t);
  }
  if (c === 'Q') {
    const cp = { x: cmd[1] as number, y: cmd[2] as number };
    const u = 1 - t;
    return {
      x: u * u * start.x + 2 * u * t * cp.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * cp.y + t * t * end.y,
    };
  }
  return start;
}

function bezierCubic(
  p0: { x: number; y: number }, p1: { x: number; y: number },
  p2: { x: number; y: number }, p3: { x: number; y: number }, t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const uu = u * u, uuu = uu * u;
  const tt = t * t, ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/** De Casteljau split — returns the two cubic-bezier control polygons
 *  for `B(s) = original B(s*t)` (left) and `B(s) = original B(t + s*(1-t))`
 *  (right). Used by the path-subdivide gesture so curves stay visually
 *  identical after an anchor is inserted at parameter t. */
function splitCubic(
  p0: { x: number; y: number }, p1: { x: number; y: number },
  p2: { x: number; y: number }, p3: { x: number; y: number }, t: number,
): { leftCp1: { x: number; y: number }; leftCp2: { x: number; y: number };
     mid: { x: number; y: number };
     rightCp1: { x: number; y: number }; rightCp2: { x: number; y: number } } {
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({
    x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k,
  });
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const mid = lerp(r0, r1, t);
  return { leftCp1: q0, leftCp2: r0, mid, rightCp1: r1, rightCp2: q2 };
}

/** Install a canvas-level mouse:down listener that adds an anchor when
 *  the user clicks on (but not too close to) the path. Returns the
 *  unsubscribe function so `exitPathEdit` can clean up. */
function installAddAnchorListener(canvas: fabric.Canvas, path: fabric.Path): () => void {
  const onDown = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
    // Skip if the click landed on one of the edit handles — those have
    // their own mousedown logic and we don't want to insert an anchor
    // every time the user grabs a tangent.
    const target = e.target as { _isPathEditHandle?: boolean; _isPathEditGuide?: boolean } | undefined;
    if (target && (target._isPathEditHandle || target._isPathEditGuide)) return;
    const sp = canvas.getScenePoint(e.e);
    const local = canvasPointToPath(path, sp.x, sp.y);
    // Walk segments, find the closest one within ADD_HIT_PX (in canvas
    // coords — convert by sampling in path-local then comparing in path-
    // local; the threshold is rough but matches user expectation since
    // the path is shown at its on-screen scale).
    let bestSegIdx = -1;
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 1; i < path.path.length; i++) {
      const cmd = path.path[i] as unknown as (string | number)[];
      const prev = path.path[i - 1] as unknown as (string | number)[];
      const prevAnchor = commandAnchor(prev);
      const thisAnchor = commandAnchor(cmd);
      if (!prevAnchor || !thisAnchor) continue;
      const start = { x: prev[prevAnchor.xKey] as number, y: prev[prevAnchor.yKey] as number };
      const end = { x: cmd[thisAnchor.xKey] as number, y: cmd[thisAnchor.yKey] as number };
      const got = closestPointOnSegment(start, cmd, end, local);
      if (got.dist < bestDist) { bestDist = got.dist; bestSegIdx = i; bestT = got.t; }
    }
    if (bestSegIdx === -1) return;
    // The hit threshold is in path-local space. Convert ADD_HIT_PX (canvas)
    // through the path's inverse-transform scale so the threshold tracks
    // zoom — a 6px halo on screen feels right at any zoom level.
    const m = path.calcTransformMatrix();
    const scale = Math.hypot(m[0], m[1]); // length of basis vector
    const threshold = scale > 0 ? ADD_HIT_PX / scale : ADD_HIT_PX;
    if (bestDist > threshold) return;
    subdivideSegment(path, bestSegIdx, bestT);
    rebuildEditOverlay(canvas, path);
  };
  canvas.on('mouse:down', onDown);
  return () => canvas.off('mouse:down', onDown);
}

/** Replace `path.path[segIdx]` with one (L→L+L) or two (C→C+C) commands
 *  that together produce identical geometry but expose a new anchor at
 *  parameter `t` along the original segment. */
function subdivideSegment(path: fabric.Path, segIdx: number, t: number) {
  const cmd = path.path[segIdx] as unknown as (string | number)[];
  const prev = path.path[segIdx - 1] as unknown as (string | number)[];
  const prevAnchor = commandAnchor(prev)!;
  const thisAnchor = commandAnchor(cmd)!;
  const start = { x: prev[prevAnchor.xKey] as number, y: prev[prevAnchor.yKey] as number };
  const end = { x: cmd[thisAnchor.xKey] as number, y: cmd[thisAnchor.yKey] as number };

  if (cmd[0] === 'L') {
    const mid = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    path.path.splice(segIdx, 1,
      ['L', mid.x, mid.y] as unknown as (typeof path.path)[number],
      ['L', end.x, end.y] as unknown as (typeof path.path)[number],
    );
  } else if (cmd[0] === 'C') {
    const cp1 = { x: cmd[1] as number, y: cmd[2] as number };
    const cp2 = { x: cmd[3] as number, y: cmd[4] as number };
    const split = splitCubic(start, cp1, cp2, end, t);
    path.path.splice(segIdx, 1,
      ['C', split.leftCp1.x, split.leftCp1.y, split.leftCp2.x, split.leftCp2.y, split.mid.x, split.mid.y] as unknown as (typeof path.path)[number],
      ['C', split.rightCp1.x, split.rightCp1.y, split.rightCp2.x, split.rightCp2.y, end.x, end.y] as unknown as (typeof path.path)[number],
    );
  } else if (cmd[0] === 'Q') {
    // Convert Q to two L+C approximations: too lossy. For Q we promote
    // the segment to two C's by first converting Q→C (single C with the
    // standard Q→C control-point promotion), then splitting that C.
    const cp = { x: cmd[1] as number, y: cmd[2] as number };
    const cp1 = { x: start.x + 2 / 3 * (cp.x - start.x), y: start.y + 2 / 3 * (cp.y - start.y) };
    const cp2 = { x: end.x + 2 / 3 * (cp.x - end.x), y: end.y + 2 / 3 * (cp.y - end.y) };
    const split = splitCubic(start, cp1, cp2, end, t);
    path.path.splice(segIdx, 1,
      ['C', split.leftCp1.x, split.leftCp1.y, split.leftCp2.x, split.leftCp2.y, split.mid.x, split.mid.y] as unknown as (typeof path.path)[number],
      ['C', split.rightCp1.x, split.rightCp1.y, split.rightCp2.x, split.rightCp2.y, end.x, end.y] as unknown as (typeof path.path)[number],
    );
  }
  path.dirty = true;
  path.setBoundingBox(true);
  path.setCoords();
}

/**
 * Exit any active edit session and remove handles.
 */
export function exitPathEdit(canvas: fabric.Canvas) {
  if (!state) return;
  const { path, handles, guides, onModified, uninstallAddAnchor } = state;
  for (const h of handles) canvas.remove(h as unknown as FabricObject);
  for (const g of guides) canvas.remove(g as unknown as FabricObject);
  uninstallAddAnchor();
  path.off('modified', onModified);
  path.off('moving', onModified);
  path.off('scaling', onModified);
  path.off('rotating', onModified);
  state = null;
  canvas.requestRenderAll();
}

export function isEditingPath(): boolean { return !!state; }
export function getEditingPath(): fabric.Path | null { return state?.path ?? null; }
