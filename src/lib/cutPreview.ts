/**
 * Canvas cut preview — the data CutPathLayer draws over the document while
 * the Plotter dialog is open: the cut lines of the job as it currently
 * stands, plus where the machine origin sits, the material band and the
 * job's size / offset from the origin.
 *
 * `computeCanvasCutPreview` picks the SAME paths the dialog's preview and
 * stats use (PlotterDialog `previewPaths`): the colour-active cut paths when
 * the store has any, otherwise the exported canvas SVG run through the
 * plotter's own flattener — the job the plotter falls back to when no contour
 * was generated. The dialog can call this instead of duplicating the rule, so
 * the canvas overlay and the dialog's preview can never drift apart.
 * `toCanvasCutPreview` pairs the result with the Plotter settings into the
 * store's `canvasCutPreview`.
 *
 * `previewGeometry` turns a preview plus the three Plotter settings into the
 * pure geometry the overlay needs. It follows the generator's mapping
 * (plotter.ts cutPathsToPlotterPolylines + mirrorPolys):
 *
 *   machine Y = originBottomLeft ? paperHeight − doc Y : doc Y
 *   machine X = mirror ? (bbox.x0 + bbox.x1) − doc X : doc X
 *
 * Document space is mm with Y down (the CutPath convention); machine space is
 * mm with the origin at (0, 0), X right, Y up.
 */

import { getCanvas } from './canvasEngine';
import { exportSVG } from './io';
import { applyDriftToPolylines, defaultPlotterOptions, svgToPolylines, type PlotterOptions } from './plotter';
import { useEditor, type CanvasCutPreview, type CutPath } from '../store/editor';

/** Axis-aligned rectangle in mm. */
export interface MmBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where the preview's paths came from. */
export type CanvasCutPreviewSource = 'cutPaths' | 'canvas';

/** Result of `computeCanvasCutPreview` (the store's `canvasCutPreview` is built from it). */
export interface CanvasCutPreviewResult {
  paths: CutPath[];
  /** Bounding box of `paths` in document mm; null when there is nothing to cut. */
  bboxMm: MmBbox | null;
  /** 'cutPaths' = the store's colour-active cut paths; 'canvas' = the exported canvas, flattened. */
  source: CanvasCutPreviewSource;
}

/** The three Plotter settings the overlay needs alongside the paths. */
export type CanvasCutPreviewSettings = Pick<CanvasCutPreview, 'originBottomLeft' | 'paperHeightMm' | 'mirror'>;

export interface CanvasCutPreviewOptions {
  /** Colours muted in the dialog's cut-by-colour list; paths carrying one are dropped. */
  mutedColors?: Iterable<string>;
  /** Plotter "curve tolerance" (px) for flattening curves. Default: defaultPlotterOptions. */
  curveTolerance?: number;
  /** Drift compensation from the Plotter settings — applied like the dialog's preview. */
  drift?: PlotterOptions['drift'];
  /** Canvas to read when the store has no cut paths. Defaults to the live fabric canvas. */
  canvas?: { toSVG: () => string } | null;
}

/** Everything the canvas overlay draws, in document mm unless the name says otherwise. */
export interface CutPreviewGeometry {
  /** Job bounding box in document mm. */
  bboxMm: MmBbox | null;
  /** The same box in machine mm (origin at 0,0): its lower-left corner is the job's offset from the origin. */
  machineBboxMm: MmBbox | null;
  /** Where the machine origin sits in the document. */
  originMm: { x: number; y: number };
  /** Direction the machine's +X axis points in the document: right, or left when mirrored. */
  xSign: 1 | -1;
  /** Top edge of the material band in document mm (always the document's y = 0). */
  materialTopMm: number;
  /** Bottom edge of the material band in document mm. */
  materialBottomMm: number;
  /** Per path: true when a point lands outside the material band or left of
   *  the origin (negative machine X). Mirroring flips the job about its own
   *  centre, so the bounding box — and this test — is the same either way. */
  outside: boolean[];
  /** Mirrored copy of the paths (where the blade really goes), or null when mirroring is off. */
  ghostPaths: CutPath[] | null;
}

const OUTSIDE_EPS = 1e-6;

/**
 * Rewrite SVG `transform` attributes into the grammar `new DOMMatrix()`
 * accepts (CSS): fabric emits the space-separated SVG form
 * `matrix(1 0 0 1 x y)` / `translate(x y)`, which DOMMatrix rejects — and
 * plotter.ts's svgToPolylines swallows that rejection, dropping every
 * object's position. Pure string rewrite.
 *
 * Same function as PlotterDialog's private `toCssTransforms` (not exported
 * there): when the dialog calls computeCanvasCutPreview, one of the two
 * copies can go.
 */
export function svgTransformsToCss(svg: string): string {
  return svg.replace(/\btransform="([^"]*)"/g, (_m, value: string) => `transform="${value.replace(/([a-zA-Z]+)\(([^)]*)\)/g, (whole: string, name: string, args: string) => {
    const parts = args.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length === 0 || parts.some((p) => !/^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(p))) return whole;
    // translate() is the only one CSS measures in px rather than unitless.
    const list = parts.map((p) => (name === 'translate' ? `${p}px` : p));
    return `${name}(${list.join(', ')})`;
  })}"`);
}

/** Bounding box of cut paths in their own (document mm) coordinates. */
export function cutPathBBox(paths: ReadonlyArray<Pick<CutPath, 'points'>>): MmBbox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const path of paths) {
    for (const [x, y] of path.points) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** "Paper height" from the Plotter settings (in its unit) converted to mm. */
export function paperHeightToMm(paperHeightUnits: number, unit: 'mm' | 'in'): number {
  return unit === 'in' ? paperHeightUnits * 25.4 : paperHeightUnits;
}

/**
 * The cut lines the plotter would follow right now — the dialog's
 * `previewPaths` rule, lifted out so the canvas overlay shares it.
 *
 * With cut paths in the store they are used verbatim (minus muted colours).
 * With none, the exported canvas SVG is flattened exactly as for a job
 * (canonical mm, top-left document space): objects the pipeline does not cut
 * (text, images) draw nothing, and polylines with non-finite coordinates
 * (e.g. the canvas background) are dropped. The canvas branch re-reads the
 * canvas on every call, so callers recompute when objects move.
 */
export function computeCanvasCutPreview(opts: CanvasCutPreviewOptions = {}): CanvasCutPreviewResult {
  const stored = useEditor.getState().cutPaths;
  if (stored.length > 0) {
    const muted = new Set(opts.mutedColors ?? []);
    const paths = stored.filter(p => !p.color || !muted.has(p.color));
    return { paths, bboxMm: cutPathBBox(paths), source: 'cutPaths' };
  }
  const empty: CanvasCutPreviewResult = { paths: [], bboxMm: null, source: 'canvas' };
  try {
    const svg = opts.canvas === undefined ? (getCanvas() ? exportSVG() : '') : opts.canvas ? opts.canvas.toSVG() : '';
    if (!svg) return empty;
    const canon: PlotterOptions = {
      ...defaultPlotterOptions,
      curveTolerance: opts.curveTolerance ?? defaultPlotterOptions.curveTolerance,
      unit: 'mm',
      pxPerUnit: 3.7795,
      originBottomLeft: false,
    };
    let polylines = svgToPolylines(svgTransformsToCss(svg), canon);
    if (opts.drift) polylines = applyDriftToPolylines(polylines, opts.drift, canon);
    const paths = polylines
      .filter(p => p.points.length >= 2 && p.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))
      .map((p, i): CutPath => ({ id: `canvas-${i}`, points: p.points, closed: p.closed, kind: 'outline' }));
    return { paths, bboxMm: cutPathBBox(paths), source: 'canvas' };
  } catch {
    return empty; // no DOMMatrix (non-browser environment) — nothing to preview
  }
}

/** The store payload for `canvasCutPreview`: a result plus the Plotter settings. */
export function toCanvasCutPreview(result: CanvasCutPreviewResult, settings: CanvasCutPreviewSettings): CanvasCutPreview {
  return {
    paths: result.paths,
    originBottomLeft: settings.originBottomLeft,
    paperHeightMm: settings.paperHeightMm,
    mirror: settings.mirror,
  };
}

/** Overlay geometry for a preview, following the generator's document → machine mapping. */
export function previewGeometry(preview: CanvasCutPreviewSettings & Pick<CanvasCutPreviewResult, 'paths'>): CutPreviewGeometry {
  const { paths, originBottomLeft, paperHeightMm, mirror } = preview;
  const bboxMm = cutPathBBox(paths);
  const axis = bboxMm ? bboxMm.x0 + bboxMm.x1 : 0;
  const toX = (x: number): number => (mirror ? axis - x : x);
  const toY = (y: number): number => (originBottomLeft ? paperHeightMm - y : y);
  const span = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];
  const machineBboxMm = bboxMm
    ? (() => {
        const [mx0, mx1] = span(toX(bboxMm.x0), toX(bboxMm.x1));
        const [my0, my1] = span(toY(bboxMm.y0), toY(bboxMm.y1));
        return { x0: mx0, y0: my0, x1: mx1, y1: my1 };
      })()
    : null;
  const outside = paths.map(path => path.points.some(([x, y]) =>
    x < -OUTSIDE_EPS || y < -OUTSIDE_EPS || y > paperHeightMm + OUTSIDE_EPS,
  ));
  return {
    bboxMm,
    machineBboxMm,
    originMm: { x: 0, y: originBottomLeft ? paperHeightMm : 0 },
    xSign: mirror ? -1 : 1,
    materialTopMm: 0,
    materialBottomMm: paperHeightMm,
    outside,
    ghostPaths: mirror
      ? paths.map(path => ({ ...path, id: `${path.id}#mirror`, points: path.points.map(([x, y]) => [axis - x, y] as [number, number]) }))
      : null,
  };
}
