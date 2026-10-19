import { useEditor } from '../store/editor';
import { addBridges } from './bridges';
import { generateRegMarks, generateWeedBorder, generateWeedLines, type RegMarkStyle } from './cutContour';
import { grommetsFromSelection } from './grommets';
import { getCanvas, pushHistory } from './canvasEngine';
import { rhinestoneFromSelection } from './rhinestone';
import { download, exportSVG } from './io';
import { nestPolygons } from './nesting';
import { nestPolygonsRaster } from './rasterNest';
import { buildTestCut, defaultPlotterOptions } from './plotter';
import { toast } from './toast';

const MM_TO_PX = 3.7795;

type T = (key: string) => string;
type Bounds = { x: number; y: number; w: number; h: number };

function boundsFromCutPaths(expandMm = 0, excludeWeed = false): Bounds | null {
  const editor = useEditor.getState();
  const geom = editor.cutPaths.filter(p => p.kind !== 'regmark' && (!excludeWeed || !p.id.startsWith('weed-')));
  if (!geom.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const path of geom) {
    for (const [x, y] of path.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return {
    x: minX - expandMm,
    y: minY - expandMm,
    w: maxX - minX + expandMm * 2,
    h: maxY - minY + expandMm * 2,
  };
}

function fallbackBounds(): Bounds {
  const editor = useEditor.getState();
  if (editor.artboards.length) {
    const artboard = editor.artboards[0];
    return {
      x: artboard.x / MM_TO_PX,
      y: artboard.y / MM_TO_PX,
      w: artboard.width / MM_TO_PX,
      h: artboard.height / MM_TO_PX,
    };
  }
  return { x: 0, y: 0, w: 297, h: 210 };
}

export function addPlotterRegistrationMarks(t: T, style: RegMarkStyle = 'L', armLength = 10, inset = 5) {
  const editor = useEditor.getState();
  const bounds = boundsFromCutPaths(5) ?? fallbackBounds();
  editor.clearCutPaths('regmark');
  editor.addCutPaths(generateRegMarks({ bounds, armLength, inset, style }));
  const styleLabel = style === 'L' ? t('L corner') : style === 'cross' ? t('cross') : style === 'square' ? t('square') : t('circle');
  toast.success(`${t('4-corner registration marks added.')} ${bounds.w.toFixed(0)}×${bounds.h.toFixed(0)} mm · ${styleLabel} ${armLength} mm`, { title: t('Reg marks') });
}

export function addPlotterWeedBorder(t: T, rows = 0, cols = 0) {
  const editor = useEditor.getState();
  const bounds = boundsFromCutPaths(0, true) ?? fallbackBounds();
  const paths = [generateWeedBorder(bounds, 5)];
  if (rows > 0 || cols > 0) paths.push(...generateWeedLines(bounds, rows, cols, 5));
  editor.addCutPaths(paths);
  toast.success(t('Weed border added.'), { title: t('Weeding') });
}



export function addPlotterGrommets(t: T, insetMm = 20, maxSpacingMm = 500, diameterMm = 10) {
  const paths = grommetsFromSelection(insetMm, maxSpacingMm, diameterMm);
  if (!paths.length) {
    toast.warn(t('Select something first.'), { title: t('Banner Grommets') });
    return 0;
  }
  const editor = useEditor.getState();
  editor.addCutPaths(paths);
  editor.setCutPathsVisible(true);
  toast.success(`${paths.length} ${t('grommets added')}`, { title: t('Banner Grommets') });
  return paths.length;
}



export function addPlotterRhinestones(t: T, diameterMm = 2.8, spacingMm = 4) {
  const objects = getCanvas()?.getActiveObjects() ?? [];
  if (!objects.length) {
    toast.warn(t('Select one or more shapes first.'), { title: t('Rhinestone Template') });
    return 0;
  }
  const paths = rhinestoneFromSelection(objects, spacingMm, diameterMm);
  if (!paths.length) {
    toast.warn(t('No outline to place stones on.'), { title: t('Rhinestone Template') });
    return 0;
  }
  const editor = useEditor.getState();
  editor.addCutPaths(paths);
  editor.setCutPathsVisible(true);
  toast.success(`${paths.length} ${t('stones placed')}`, { title: t('Rhinestone Template') });
  return paths.length;
}


export function addPlotterBridges(t: T, count = 4, gapMm = 1) {
  if (count < 1) {
    toast.warn(t('Choose a bridge preset first.'), { title: t('Bridges') });
    return 0;
  }
  const editor = useEditor.getState();
  const closed = editor.cutPaths.filter(path => path.closed && path.kind !== 'regmark');
  if (!closed.length) {
    toast.warn(t('No closed cut paths to bridge.'), { title: t('Bridges') });
    return 0;
  }
  editor.setCutPaths(addBridges(editor.cutPaths, count, gapMm));
  toast.success(`${closed.length} ${t('paths bridged')}`, { title: t('Bridges') });
  return closed.length;
}


export function clearPlotterBridges(t: T) {
  const editor = useEditor.getState();
  const restored = new Set<string>();
  const paths = [];
  let removed = 0;

  for (const path of editor.cutPaths) {
    if (path.bridgeOriginal && path.bridgeSourceId) {
      removed += 1;
      if (!restored.has(path.bridgeSourceId)) {
        paths.push(path.bridgeOriginal);
        restored.add(path.bridgeSourceId);
      }
    } else {
      paths.push(path);
    }
  }

  if (!removed) {
    toast.warn(t('No bridges to clear.'), { title: t('Bridges') });
    return 0;
  }

  editor.setCutPaths(paths);
  toast.success(`${restored.size} ${t('bridged paths restored')}`, { title: t('Bridges') });
  return restored.size;
}


export function clearPlotterRegistrationMarks(t: T) {
  const editor = useEditor.getState();
  const count = editor.cutPaths.filter(path => path.kind === 'regmark').length;
  if (!count) {
    toast.warn(t('No positioning marks to clear.'), { title: t('Reg marks') });
    return 0;
  }
  editor.clearCutPaths('regmark');
  toast.success(`${count} ${t('positioning marks cleared')}`, { title: t('Reg marks') });
  return count;
}

export function clearPlotterWeedBorders(t: T) {
  const editor = useEditor.getState();
  const count = editor.cutPaths.filter(path => path.id.startsWith('weed-')).length;
  if (!count) {
    toast.warn(t('No weed borders to clear.'), { title: t('Weeding') });
    return 0;
  }
  editor.setCutPaths(editor.cutPaths.filter(path => !path.id.startsWith('weed-')));
  toast.success(`${count} ${t('weed border paths cleared')}`, { title: t('Weeding') });
  return count;
}

export function savePlotterTestCut(t: T) {
  const format = 'hpgl';
  download('test-cut.plt', buildTestCut(format, defaultPlotterOptions), 'text/plain');
  toast.success(t('Test cut file saved.'), { title: t('Test cut') });
}

/**
 * Export-with-cut-layer variants shared by the File menu and the command
 * palette (print-then-cut RIP handoff). Same download path as the plain
 * SVG export — `download('design.svg', …)` from io.ts — but with the
 * store's cut paths appended as a CutContour spot layer.
 */
export function exportSvgWithCutLayer(t: T) {
  const hasCuts = useEditor.getState().cutPaths.length > 0;
  download('design.svg', exportSVG({ includeCutPaths: true }), 'image/svg+xml');
  if (!hasCuts) toast.info(t('No cut paths — exported without a cut layer.'), { title: t('Export SVG') });
}

/** Vector PDF with the magenta CutContour overlay (io2's exportPDFReal). */
export async function exportPdfWithCutLayer(t: T) {
  const hasCuts = useEditor.getState().cutPaths.length > 0;
  const { exportPDFReal } = await import('./io2');
  await exportPDFReal({ includeCutPaths: true });
  if (!hasCuts) toast.info(t('No cut paths — exported without a cut layer.'), { title: t('Export PDF') });
}

/*
 * ── Vinyl nesting ───────────────────────────────────────────────────────────
 */

/**
 * One-click vinyl nesting — repositions the CUT GEOMETRY ONLY.
 *
 * Packs the store's cut paths with `nestPolygons` (convex-hull skyline
 * packer) onto the material sheet to minimise offcut. This is the vinyl /
 * decal workflow where the CUT SHAPE IS THE PRODUCT: only cut paths move,
 * the printed art on the canvas is NOT touched — use `nestSelection` when
 * canvas objects should move with the layout. Registration marks are
 * excluded from the packing and appended unchanged (regenerate them around
 * the packed area if the sheet needs them).
 *
 * Sheet width defaults to the document width in mm (but at least 150 mm —
 * the narrowest common plotter/transfer-tape span); the 2 mm default gap
 * sits in the kiss-cut sweet spot (sheets 2–3 mm, rolls 1–2 mm).
 */
export function nestCutPathsVinyl(t: T, opts?: { sheetWidthMm?: number; gapMm?: number }): number {
  const editor = useEditor.getState();
  const packable = editor.cutPaths.filter(p => p.kind !== 'regmark');
  if (packable.length < 2) {
    toast.warn(t('Need at least two cut paths to nest.'), { title: t('Vinyl nesting — cut geometry only') });
    return 0;
  }

  const sheetWidthMm = opts?.sheetWidthMm ?? Math.max(150, editor.doc.width / MM_TO_PX);
  const gapMm = opts?.gapMm ?? 2;
  const nest = nestPolygons(packable.map(p => ({ id: p.id, points: p.points })), sheetWidthMm, gapMm);

  // Rebuild every packable path at its placement. Rotation 90 turns a point
  // [x, y] into [-y, x] about the origin; the rotated cloud is then
  // translated so its AABB min lands exactly at the placement's (x, y) —
  // the placement IS the top-left of the (possibly rotated) geometry. All
  // other CutPath fields (kind, color, passes, bridge metadata, …) survive
  // untouched; unfit overhang rows land at the bottom of the pack. Output
  // order is sheet reading order (top row first, left to right).
  const byId = new Map(packable.map(p => [p.id, p]));
  const packed = nest.placements
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(placement => {
      const path = byId.get(placement.id);
      if (!path) return [];
      const rotated = path.points.map(([px, py]) =>
        (placement.rotation === 90 ? [-py, px] : [px, py]) as [number, number]);
      let minX = Infinity;
      let minY = Infinity;
      for (const [x, y] of rotated) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
      return [{
        ...path,
        points: rotated.map(([x, y]) => [x - minX + placement.x, y - minY + placement.y] as [number, number]),
      }];
    });

  const regmarks = editor.cutPaths.filter(p => p.kind === 'regmark');
  editor.setCutPaths([...packed, ...regmarks]);
  pushHistory(); // one undo step for the whole re-layout
  const utilPct = Math.round(nest.utilization * 100);
  toast.success(`${packed.length} ${t('cut paths nested')} · ${utilPct}% ${t('material used')}`, { title: t('Vinyl nesting — cut geometry only') });
  return packed.length;
}

/**
 * One-click raster true-shape nesting — repositions the CUT GEOMETRY ONLY.
 *
 * Concavity-aware sibling of `nestCutPathsVinyl`: packs the store's cut
 * paths with `nestPolygonsRaster` (bitmap occupancy grid + distance
 * transform, the "raster penetration map" from
 * docs/research-sticker-printcut-2026-10.md §nesting) instead of convex-hull
 * AABBs, so interleaving / irregular shapes (Ls, C-channels, lettering with
 * counters) interlock into each other's concavities instead of wasting the
 * material a hull footprint would lock away. Same contract otherwise: only
 * cut paths move — the printed art on the canvas is NOT touched — and
 * registration marks are excluded from the packing and appended unchanged.
 *
 * Sheet width defaults to the document width in mm (but at least 150 mm —
 * the narrowest common plotter/transfer-tape span); the 2 mm default gap
 * sits in the kiss-cut sweet spot (sheets 2–3 mm, rolls 1–2 mm).
 */
export function nestCutPathsRaster(t: T, opts?: { sheetWidthMm?: number; gapMm?: number }): number {
  const editor = useEditor.getState();
  const packable = editor.cutPaths.filter(p => p.kind !== 'regmark');
  if (packable.length < 2) {
    toast.warn(t('Need at least two cut paths to nest.'), { title: t('Raster true-shape nesting — cut geometry only') });
    return 0;
  }

  const sheetWidthMm = opts?.sheetWidthMm ?? Math.max(150, editor.doc.width / MM_TO_PX);
  const gapMm = opts?.gapMm ?? 2;
  const nest = nestPolygonsRaster(packable.map(p => ({ id: p.id, points: p.points })), sheetWidthMm, gapMm);

  // Rebuild every packable path at its placement — the SAME transform
  // convention nestCutPathsVinyl uses: rotation 90 turns a point [x, y] into
  // [-y, x] about the origin; the rotated cloud is then translated so its
  // AABB min lands exactly at the placement's (x, y) — the placement IS the
  // top-left of the (possibly rotated) geometry. All other CutPath fields
  // (kind, color, passes, bridge metadata, …) survive untouched; unfit
  // overhang rows land at the bottom of the pack. Output order is sheet
  // reading order (top row first, left to right).
  const byId = new Map(packable.map(p => [p.id, p]));
  const packed = nest.placements
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(placement => {
      const path = byId.get(placement.id);
      if (!path) return [];
      const rotated = path.points.map(([px, py]) =>
        (placement.rotation === 90 ? [-py, px] : [px, py]) as [number, number]);
      let minX = Infinity;
      let minY = Infinity;
      for (const [x, y] of rotated) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
      return [{
        ...path,
        points: rotated.map(([x, y]) => [x - minX + placement.x, y - minY + placement.y] as [number, number]),
      }];
    });

  const regmarks = editor.cutPaths.filter(p => p.kind === 'regmark');
  editor.setCutPaths([...packed, ...regmarks]);
  pushHistory(); // one undo step for the whole re-layout
  const utilPct = Math.round(nest.utilization * 100);
  toast.success(`${packed.length} ${t('cut paths nested')} · ${utilPct}% ${t('material used')}`, { title: t('Raster true-shape nesting — cut geometry only') });
  return packed.length;
}
