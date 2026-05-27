/**
 * Clipping masks and compound paths.
 *
 * Two pro-parity features missing from the Pathfinder set:
 *
 *  - Clipping mask: the top-most selected object becomes a "window" through
 *    which the underlying selected objects are visible. The mask's outline
 *    clips each clipped object's rendering, then we group the clipped objects
 *    so they move as one unit (Illustrator's "Make Clipping Mask").
 *
 *  - Compound path: 2+ selected paths/shapes are merged into a single
 *    `fabric.Path` whose `d` is the concatenation of subpaths
 *    (`M ... Z M ... Z ...`). With `fillRule: 'evenodd'` overlapping
 *    subpaths produce holes (Illustrator's "Make Compound Path").
 *
 * The release variants undo each operation in-place.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { logger } from './debug';

type FabricObject = fabric.FabricObject;

/* --------------------------- helpers --------------------------- */

/**
 * Sort selected objects so [0] is the bottom-most and the last entry is the
 * top-most in z-order. We rely on Fabric's canvas-object-list ordering rather
 * than selection order (which depends on click sequence).
 */
function sortByZIndex(objs: FabricObject[]): FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [...objs];
  const all = canvas.getObjects();
  return [...objs].sort((a, b) => all.indexOf(a) - all.indexOf(b));
}

/**
 * Walk into Group children (recursively) and collect all leaf FabricObjects.
 * For clip-release we want to inspect everything that might carry a clipPath.
 */
function collectLeaves(obj: FabricObject): FabricObject[] {
  if (obj.type === 'group') {
    const out: FabricObject[] = [];
    (obj as fabric.Group).getObjects().forEach((child) => {
      out.push(...collectLeaves(child as FabricObject));
    });
    return out;
  }
  return [obj];
}

/**
 * Convert any Fabric object into a `fabric.Path` whose geometry matches the
 * object's outline in scene (canvas) coordinates. Used to build the clipPath
 * geometry and to assemble compound path data.
 *
 * Returns null if we can't reduce the object to path data.
 */
function objectToScenePathD(obj: FabricObject): string | null {
  // Path objects already have command data; just transform it.
  if (obj.type === 'path') {
    const p = obj as fabric.Path;
    const m = p.calcTransformMatrix();
    const ox = p.pathOffset.x;
    const oy = p.pathOffset.y;
    const cmds: string[] = [];
    for (const cmd of p.path as unknown as Array<[string, ...number[]]>) {
      const c = cmd[0];
      const xy = (x: number, y: number): [number, number] => {
        const lx = x - ox;
        const ly = y - oy;
        return [m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5]];
      };
      if (c === 'M') {
        const [x, y] = xy(cmd[1] as number, cmd[2] as number);
        cmds.push(`M ${x} ${y}`);
      } else if (c === 'L') {
        const [x, y] = xy(cmd[1] as number, cmd[2] as number);
        cmds.push(`L ${x} ${y}`);
      } else if (c === 'Q') {
        const [x1, y1] = xy(cmd[1] as number, cmd[2] as number);
        const [x2, y2] = xy(cmd[3] as number, cmd[4] as number);
        cmds.push(`Q ${x1} ${y1} ${x2} ${y2}`);
      } else if (c === 'C') {
        const [x1, y1] = xy(cmd[1] as number, cmd[2] as number);
        const [x2, y2] = xy(cmd[3] as number, cmd[4] as number);
        const [x3, y3] = xy(cmd[5] as number, cmd[6] as number);
        cmds.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`);
      } else if (c === 'Z' || c === 'z') {
        cmds.push('Z');
      }
    }
    return cmds.join(' ');
  }

  // Build a local-space ring then transform — same shape contract as booleanOps.
  const localRing: [number, number][] = [];
  if (obj.type === 'rect') {
    const w = (obj as fabric.Rect).width ?? 0;
    const h = (obj as fabric.Rect).height ?? 0;
    localRing.push([-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]);
  } else if (obj.type === 'ellipse' || obj.type === 'circle') {
    const rx = (obj as fabric.Ellipse).rx ?? (obj as fabric.Circle).radius ?? 0;
    const ry = (obj as fabric.Ellipse).ry ?? (obj as fabric.Circle).radius ?? 0;
    const r = Math.max(rx, ry);
    const steps = Math.max(24, Math.ceil((2 * Math.PI * r) / 1));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      localRing.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
  } else if (obj.type === 'polygon' || obj.type === 'polyline') {
    const pl = obj as fabric.Polygon;
    const pts = pl.points ?? [];
    if (pts.length < 2) return null;
    for (const pt of pts) {
      localRing.push([pt.x - (pl.pathOffset?.x ?? 0), pt.y - (pl.pathOffset?.y ?? 0)]);
    }
  } else {
    // Fallback: bounding box rectangle.
    const w = obj.width ?? 0;
    const h = obj.height ?? 0;
    if (w <= 0 || h <= 0) return null;
    localRing.push([-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]);
  }

  if (localRing.length < 2) return null;
  const m = obj.calcTransformMatrix();
  const tx = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const cmds: string[] = [];
  for (let i = 0; i < localRing.length; i++) {
    const [x, y] = tx(localRing[i][0], localRing[i][1]);
    cmds.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Split a TSimplePathData array into chunks, one per 'M' command.
 * Used by releaseCompoundPath to break a multi-subpath path back into pieces.
 */
function splitSubpaths(commands: Array<[string, ...number[]]>): Array<Array<[string, ...number[]]>> {
  const groups: Array<Array<[string, ...number[]]>> = [];
  let cur: Array<[string, ...number[]]> = [];
  for (const cmd of commands) {
    if (cmd[0] === 'M' && cur.length > 0) {
      groups.push(cur);
      cur = [];
    }
    cur.push(cmd);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/* --------------------------- public API --------------------------- */

/**
 * Make the top-most selected object the clip-mask for the others.
 *
 * Implementation notes:
 *  - We clone the mask shape (preserving its transform) and assign that clone
 *    as `clipPath` on every other selected object, with `absolutePositioned`
 *    true so the mask stays anchored in scene coords regardless of how the
 *    clipped object is later moved.
 *  - The original mask object is removed from the canvas.
 *  - Clipped objects are wrapped in a Group so users can move the masked
 *    composition as a single unit (Illustrator behaviour).
 */
export function applyClipMask(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return false;

  const sorted = sortByZIndex(objs);
  const maskSrc = sorted[sorted.length - 1];
  const clippedSrcs = sorted.slice(0, -1);
  if (clippedSrcs.length === 0) return false;

  // Build async clones for the mask (one per clipped object). Fabric's clone()
  // is promise-based in v6, so we chain promises and then commit synchronously.
  Promise.all(clippedSrcs.map(() => maskSrc.clone())).then((clones: FabricObject[]) => {
    clones.forEach((clone, i) => {
      clone.set({
        absolutePositioned: true,
        inverted: false,
        fill: '',
        stroke: '',
        strokeWidth: 0,
      } as Partial<FabricObject>);
      clippedSrcs[i].set({ clipPath: clone as FabricObject });
      clippedSrcs[i].setCoords();
    });
    canvas.remove(maskSrc);

    // Group the clipped objects so they move together. Match the order the
    // Group constructor expects (bottom-to-top stacking).
    canvas.discardActiveObject();
    if (clippedSrcs.length > 1) {
      // Remove originals from canvas and add as a group.
      clippedSrcs.forEach((o) => canvas.remove(o));
      const group = new fabric.Group(clippedSrcs, { subTargetCheck: true });
      canvas.add(group);
      canvas.setActiveObject(group);
    } else {
      canvas.setActiveObject(clippedSrcs[0]);
    }
    canvas.requestRenderAll();
    pushHistory();
  }).catch((err) => {
    logger.error('mask', `applyClipMask failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  return true;
}

/**
 * Strip the `clipPath` from each selected object (or every descendant if the
 * selection contains groups). Returns true if anything was released.
 */
export function releaseClipMask(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return false;

  let released = 0;
  for (const top of objs) {
    const leaves = collectLeaves(top);
    for (const leaf of leaves) {
      if (leaf.clipPath) {
        leaf.set({ clipPath: undefined } as Partial<FabricObject>);
        leaf.setCoords();
        released++;
      }
    }
    // Top-level object may also carry a clipPath (e.g. a group with mask on it).
    if (top.clipPath && !leaves.includes(top)) {
      top.set({ clipPath: undefined } as Partial<FabricObject>);
      top.setCoords();
      released++;
    }
  }

  if (released === 0) return false;
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

/**
 * Combine 2+ selected paths/closed shapes into one `fabric.Path` with
 * even-odd fill rule. The top-most object's fill/stroke is inherited
 * (matches Illustrator's "Make Compound Path" behaviour).
 */
export function makeCompoundPath(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return false;

  const sorted = sortByZIndex(objs);
  const subpaths: string[] = [];
  for (const o of sorted) {
    const d = objectToScenePathD(o);
    if (d) subpaths.push(d);
  }
  if (subpaths.length < 2) return false;

  // Ensure each subpath is closed — otherwise even-odd fill rules can leak.
  const ensureClosed = (d: string) => (/Z\s*$/i.test(d) ? d : `${d} Z`);
  const combinedD = subpaths.map(ensureClosed).join(' ');

  const topMost = sorted[sorted.length - 1];
  const path = new fabric.Path(combinedD, {
    fill: (topMost.fill as string) ?? '#3d9bff',
    stroke: (topMost.stroke as string) ?? '',
    strokeWidth: topMost.strokeWidth ?? 0,
    opacity: topMost.opacity ?? 1,
    fillRule: 'evenodd',
  });

  // Remove all originals, then add the compound path.
  sorted.forEach((o) => canvas.remove(o));
  canvas.add(path);
  canvas.discardActiveObject();
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

/**
 * Split a compound path (one whose `d` contains multiple `M` commands) back
 * into individual `fabric.Path` objects, each positioned at the same scene
 * location. Returns true if at least one path was split.
 */
export function releaseCompoundPath(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return false;

  let any = false;
  const out: FabricObject[] = [];
  for (const o of objs) {
    if (o.type !== 'path') { out.push(o); continue; }
    const p = o as fabric.Path;
    const commands = p.path as unknown as Array<[string, ...number[]]>;
    const groups = splitSubpaths(commands);
    if (groups.length < 2) { out.push(o); continue; }

    // Capture the transform / offset so each subpath sits in the same scene
    // location as the original. We translate each command into scene coords,
    // build a fresh fabric.Path, and let Fabric recompute the bounding box.
    const m = p.calcTransformMatrix();
    const ox = p.pathOffset.x;
    const oy = p.pathOffset.y;
    const fill = (p.fill as string) ?? '';
    const stroke = (p.stroke as string) ?? '';
    const strokeWidth = p.strokeWidth ?? 0;
    const opacity = p.opacity ?? 1;

    for (const group of groups) {
      const cmds: string[] = [];
      for (const cmd of group) {
        const c = cmd[0];
        const xy = (x: number, y: number): [number, number] => {
          const lx = x - ox;
          const ly = y - oy;
          return [m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5]];
        };
        if (c === 'M' || c === 'L') {
          const [x, y] = xy(cmd[1] as number, cmd[2] as number);
          cmds.push(`${c} ${x} ${y}`);
        } else if (c === 'Q') {
          const [x1, y1] = xy(cmd[1] as number, cmd[2] as number);
          const [x2, y2] = xy(cmd[3] as number, cmd[4] as number);
          cmds.push(`Q ${x1} ${y1} ${x2} ${y2}`);
        } else if (c === 'C') {
          const [x1, y1] = xy(cmd[1] as number, cmd[2] as number);
          const [x2, y2] = xy(cmd[3] as number, cmd[4] as number);
          const [x3, y3] = xy(cmd[5] as number, cmd[6] as number);
          cmds.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`);
        } else if (c === 'Z' || c === 'z') {
          cmds.push('Z');
        }
      }
      if (!cmds.length) continue;
      const piece = new fabric.Path(cmds.join(' '), {
        fill, stroke, strokeWidth, opacity,
      });
      out.push(piece);
    }

    canvas.remove(p);
    any = true;
  }

  if (!any) return false;

  // Add any new paths and rebuild an active selection from the split pieces.
  const added: FabricObject[] = [];
  for (const o of out) {
    if (!canvas.getObjects().includes(o)) {
      canvas.add(o);
      added.push(o);
    }
  }
  canvas.discardActiveObject();
  if (added.length >= 2) {
    const sel = new fabric.ActiveSelection(added, { canvas });
    canvas.setActiveObject(sel);
  } else if (added.length === 1) {
    canvas.setActiveObject(added[0]);
  }
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
