/**
 * Measure tool — click-drag to read distance + angle between two points, like
 * Illustrator's Measure tool / SignMaster's dimension readout. The live
 * segment lives in the editor store (`measure`, scene coords) and is drawn by
 * MeasureLayer; the numeric readout is shown on the segment + in the overlay.
 * The live overlay is non-destructive; users can pin it as an editable dimension annotation when needed.
 *
 * Split (2026-09): the ~140 kB proof-sheet builder family moved to
 * ./measureProof.ts (loaded on demand); this file keeps the interaction
 * state, dimension pinning, and annotation operations.
 */
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import { getCanvas, pushHistory } from '../canvasEngine';
import { arrowTriangle } from '../arrowheads';
import { createPrintMarkObjects } from '../printMarks';
import { generateRegMarks, generateWeedBorder, generateWeedLines } from '../cutContour';
import { grommetsFromObjects } from '../grommets';
import { addBridges } from '../bridges';
import { rhinestoneFromSelection } from '../rhinestone';

export const MM_TO_PX = 3.7795;
const MEASURE_ANNOTATION_KIND = 'measure-annotation';

type MeasureAnnotationObject = fabric.FabricObject & { measureAnnotationKind?: string };
function tagMeasureAnnotation<T extends fabric.FabricObject>(object: T): T {
  (object as MeasureAnnotationObject).measureAnnotationKind = MEASURE_ANNOTATION_KIND;
  return object;
}


let dragging = false;
let startX = 0;
let startY = 0;

export function measureBegin(x: number, y: number): void {
  dragging = true;
  startX = x; startY = y;
  useEditor.getState().setMeasure({ x1: x, y1: y, x2: x, y2: y });
}

export function measureUpdate(x: number, y: number): void {
  if (!dragging) return;
  useEditor.getState().setMeasure({ x1: startX, y1: startY, x2: x, y2: y });
}

export function measureEnd(): void {
  dragging = false; // keep the last segment visible until the tool changes
}

/** Tool deactivation — drop the segment so it doesn't linger under other tools. */
export function measureClear(): void {
  dragging = false;
  useEditor.getState().setMeasure(null);
}

/**
 * Commit the live measurement as a persistent dimension annotation — a grouped
 * line + mm label dropped on the canvas (selectable, exportable), so a shop
 * drawing keeps its measurements. Clears the live segment. Returns false when
 * there's nothing to commit.
 */
function dimensionAnnotationObjects(m: { x1: number; y1: number; x2: number; y2: number }, label?: string): fabric.FabricObject[] {
  const distMm = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) / MM_TO_PX;
  if (distMm < 0.1) return [];
  const line = new fabric.Line([m.x1, m.y1, m.x2, m.y2], { stroke: '#22d3ee', strokeWidth: 1 });
  const dir: [number, number] = [m.x2 - m.x1, m.y2 - m.y1];
  const mkHead = (tri: [number, number][]) =>
    new fabric.Polygon(tri.map(([x, y]) => ({ x, y })), { fill: '#22d3ee', stroke: '', strokeWidth: 0 });
  const headEnd = mkHead(arrowTriangle([m.x2, m.y2], dir, 10, 7));
  const headStart = mkHead(arrowTriangle([m.x1, m.y1], [-dir[0], -dir[1]], 10, 7));
  const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const labelObject = new fabric.Text(label ?? `${distMm.toFixed(1)} mm`, {
    left: (m.x1 + m.x2) / 2 + normalX * -12, top: (m.y1 + m.y2) / 2 + normalY * -12,
    originX: 'center', originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
    angle: (angle * 180) / Math.PI,
    fill: '#22d3ee', backgroundColor: 'rgba(11,18,32,0.85)',
  });
  return [line, headStart, headEnd, labelObject];
}


export function selectionBounds(objects: fabric.FabricObject[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  if (objects.length === 0) return null;
  const rects = objects.map((object) => object.getBoundingRect());
  const minX = Math.min(...rects.map((rect) => rect.left));
  const minY = Math.min(...rects.map((rect) => rect.top));
  const maxX = Math.max(...rects.map((rect) => rect.left + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.top + rect.height));
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width / MM_TO_PX < 0.1 || height / MM_TO_PX < 0.1) return null;
  return { minX, minY, maxX, maxY, width, height };
}


function selectionDimensionObjects(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.FabricObject[] {
  const { minX, minY, maxX, maxY, width, height } = bounds;
  const offset = 24;
  const tick = 8;
  const horizontalY = maxY + offset;
  const verticalX = maxX + offset;
  return [
    new fabric.Line([minX, maxY, minX, horizontalY + tick], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([maxX, maxY, maxX, horizontalY + tick], { stroke: '#22d3ee', strokeWidth: 1 }),
    ...dimensionAnnotationObjects({ x1: minX, y1: horizontalY, x2: maxX, y2: horizontalY }, `W ${(width / MM_TO_PX).toFixed(1)} mm`),
    new fabric.Line([maxX, minY, verticalX + tick, minY], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([maxX, maxY, verticalX + tick, maxY], { stroke: '#22d3ee', strokeWidth: 1 }),
    ...dimensionAnnotationObjects({ x1: verticalX, y1: maxY, x2: verticalX, y2: minY }, `H ${(height / MM_TO_PX).toFixed(1)} mm`),
  ];
}

function selectionAreaLabelObject(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.Text {
  const areaMm2 = (bounds.width / MM_TO_PX) * (bounds.height / MM_TO_PX);
  const perimeterMm = 2 * ((bounds.width / MM_TO_PX) + (bounds.height / MM_TO_PX));
  return new fabric.Text(`Area ${areaMm2.toFixed(1)} mm²\nPerim ${perimeterMm.toFixed(1)} mm`, {
    left: (bounds.minX + bounds.maxX) / 2,
    top: (bounds.minY + bounds.maxY) / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.15,
    fill: '#22d3ee',
    backgroundColor: 'rgba(11,18,32,0.85)',
  });
}

function selectionCenterMarkObjects(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.FabricObject[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const arm = 10;
  return [
    new fabric.Line([cx - arm, cy, cx + arm, cy], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([cx, cy - arm, cx, cy + arm], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Circle({ left: cx, top: cy, radius: 3, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Text(`C ${ (cx / MM_TO_PX).toFixed(1)}, ${(cy / MM_TO_PX).toFixed(1)} mm`, {
      left: cx + 12,
      top: cy - 14,
      originX: 'left',
      originY: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      fill: '#22d3ee',
      backgroundColor: 'rgba(11,18,32,0.85)',
    }),
  ];
}

function selectionCornerMarkObjects(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.FabricObject[] {
  const leg = 12;
  const corners: Array<[number, number, number, number]> = [
    [bounds.minX, bounds.minY, 1, 1],
    [bounds.maxX, bounds.minY, -1, 1],
    [bounds.maxX, bounds.maxY, -1, -1],
    [bounds.minX, bounds.maxY, 1, -1],
  ];
  return corners.flatMap(([x, y, sx, sy]) => [
    new fabric.Line([x, y, x + sx * leg, y], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([x, y, x, y + sy * leg], { stroke: '#22d3ee', strokeWidth: 1 }),
  ]);
}

export function commitDimension(): boolean {
  const m = useEditor.getState().measure;
  const canvas = getCanvas();
  if (!m || !canvas) return false;
  const objects = dimensionAnnotationObjects(m);
  if (objects.length === 0) return false;
  const group = tagMeasureAnnotation(new fabric.Group(objects));
  canvas.add(group);
  canvas.setActiveObject(group);
  useEditor.getState().setMeasure(null);
  dragging = false;
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

export function addSelectionDimensions(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects();
  if (objects.length === 0) return 0;
  const bounds = selectionBounds(objects);
  if (!bounds) return 0;
  const group = tagMeasureAnnotation(new fabric.Group(selectionDimensionObjects(bounds)));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return 2;
}

export function addSelectionAreaLabel(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const label = tagMeasureAnnotation(selectionAreaLabelObject(bounds));
  canvas.add(label);
  canvas.setActiveObject(label);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}


export function addSelectionCenterMark(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const group = tagMeasureAnnotation(new fabric.Group(selectionCenterMarkObjects(bounds)));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}


export function addSelectionCornerMarks(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const group = tagMeasureAnnotation(new fabric.Group(selectionCornerMarkObjects(bounds)));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

export function addSelectionProductionMarks(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return 0;
  const group = tagMeasureAnnotation(new fabric.Group([
    ...selectionDimensionObjects(bounds),
    selectionAreaLabelObject(bounds),
    ...selectionCenterMarkObjects(bounds),
    ...selectionCornerMarkObjects(bounds),
  ]));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return 4;
}


export function addSelectionMarginFrame(marginMm = 5): boolean {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(marginMm) || marginMm < 0) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const marginPx = marginMm * MM_TO_PX;
  const frame = new fabric.Rect({
    left: bounds.minX - marginPx,
    top: bounds.minY - marginPx,
    width: bounds.width + marginPx * 2,
    height: bounds.height + marginPx * 2,
    fill: 'transparent',
    stroke: '#22d3ee',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    objectCaching: false,
  });
  const label = new fabric.Text(`Margin ${marginMm.toFixed(1)} mm`, {
    left: bounds.minX - marginPx,
    top: bounds.minY - marginPx - 14,
    originX: 'left',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fill: '#22d3ee',
    backgroundColor: 'rgba(11,18,32,0.85)',
  });
  const group = tagMeasureAnnotation(new fabric.Group([frame, label]));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}


export function addSelectionInsetFrame(insetMm = 5): boolean {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(insetMm) || insetMm < 0) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const insetPx = insetMm * MM_TO_PX;
  const width = bounds.width - insetPx * 2;
  const height = bounds.height - insetPx * 2;
  if (width / MM_TO_PX < 0.1 || height / MM_TO_PX < 0.1) return false;
  const frame = new fabric.Rect({
    left: bounds.minX + insetPx,
    top: bounds.minY + insetPx,
    width,
    height,
    fill: 'transparent',
    stroke: '#22d3ee',
    strokeWidth: 1,
    strokeDashArray: [3, 3],
    objectCaching: false,
  });
  const label = new fabric.Text(`Inset ${insetMm.toFixed(1)} mm`, {
    left: bounds.minX + insetPx,
    top: bounds.minY + insetPx + 14,
    originX: 'left',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fill: '#22d3ee',
    backgroundColor: 'rgba(11,18,32,0.85)',
  });
  const group = tagMeasureAnnotation(new fabric.Group([frame, label]));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

export function measureAnnotationObjects(): fabric.FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  return canvas.getObjects().filter((object) => (object as MeasureAnnotationObject).measureAnnotationKind === MEASURE_ANNOTATION_KIND);
}

function setMeasureAnnotationsLocked(locked: boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    object.set({
      selectable: !locked,
      evented: !locked,
      hasControls: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
    });
  }
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

function setMeasureAnnotationsVisible(visible: boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) object.set({ visible });
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function bringMeasureAnnotationsToFront(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  for (const object of matches) canvas.bringObjectToFront(object);
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function proofMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    object.set({
      visible: true,
      selectable: false,
      evented: false,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
    canvas.bringObjectToFront(object);
  }
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function editMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    object.set({
      visible: true,
      selectable: true,
      evented: true,
      hasControls: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    });
    canvas.bringObjectToFront(object);
  }
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export async function duplicateMeasureAnnotationsToSelection(): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const activeObjects = canvas.getActiveObjects();
  const targets = activeObjects.filter((object) => (object as MeasureAnnotationObject).measureAnnotationKind !== MEASURE_ANNOTATION_KIND);
  const bounds = selectionBounds(targets);
  const matches = measureAnnotationObjects();
  if (!bounds || matches.length === 0) return 0;
  const sourceBounds = selectionBounds(matches);
  if (!sourceBounds) return 0;
  const dx = bounds.minX + bounds.width / 2 - (sourceBounds.minX + sourceBounds.width / 2);
  const dy = bounds.minY + bounds.height / 2 - (sourceBounds.minY + sourceBounds.height / 2);
  const clones = await Promise.all(matches.map((object) => object.clone() as Promise<fabric.FabricObject>));
  if (clones.length === 0) return 0;
  canvas.discardActiveObject();
  for (const clone of clones) {
    tagMeasureAnnotation(clone);
    clone.set({
      left: (clone.left ?? 0) + dx,
      top: (clone.top ?? 0) + dy,
      visible: true,
      selectable: true,
      evented: true,
      hasControls: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    });
    clone.setCoords();
    canvas.add(clone);
    canvas.bringObjectToFront(clone);
  }
  if (clones.length === 1) canvas.setActiveObject(clones[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(clones, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return clones.length;
}
export function makeMeasureAnnotationGuides(includeBounds: boolean, includeCenter: boolean, marginMm = 0): number {
  if (!Number.isFinite(marginMm) || marginMm < 0) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0 || (!includeBounds && !includeCenter)) return 0;
  const marginPx = marginMm * MM_TO_PX;
  const addGuide = useEditor.getState().addUserGuide;
  let count = 0;
  for (const object of matches) {
    const rect = object.getBoundingRect();
    if (includeBounds) {
      addGuide('v', rect.left - marginPx);
      addGuide('v', rect.left + rect.width + marginPx);
      addGuide('h', rect.top - marginPx);
      addGuide('h', rect.top + rect.height + marginPx);
      count += 4;
    }
    if (includeCenter) {
      addGuide('v', rect.left + rect.width / 2);
      addGuide('h', rect.top + rect.height / 2);
      count += 2;
    }
  }
  return count;
}

export function makeGuidesFromMeasureAnnotations(): number {
  return makeMeasureAnnotationGuides(true, false);
}

export function makeMarginGuidesFromMeasureAnnotations(marginMm: number): number {
  return makeMeasureAnnotationGuides(true, false, marginMm);
}

export function makeCenterGuidesFromMeasureAnnotations(): number {
  return makeMeasureAnnotationGuides(false, true);
}

export function makeFullGuidesFromMeasureAnnotations(): number {
  return makeMeasureAnnotationGuides(true, true);
}

export function makeMarginFullGuidesFromMeasureAnnotations(marginMm: number): number {
  return makeMeasureAnnotationGuides(true, true, marginMm);
}

export function addPrintMarksFromMeasureAnnotations(bleedMm = 3): number {
  if (!Number.isFinite(bleedMm) || bleedMm < 0) return 0;
  const canvas = getCanvas();
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!canvas || !bounds) return 0;
  const marks = createPrintMarkObjects({ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }, { bleedMm });
  if (marks.length === 0) return 0;
  canvas.discardActiveObject();
  for (const mark of marks) canvas.add(mark);
  canvas.setActiveObject(marks.length === 1 ? marks[0] : new fabric.ActiveSelection(marks, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return marks.length;
}

export function addCutContourFromMeasureAnnotations(offsetMm = 0, passes = 1): number {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(passes) || passes < 1) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const left = bounds.minX / MM_TO_PX - offsetMm;
  const top = bounds.minY / MM_TO_PX - offsetMm;
  const right = bounds.maxX / MM_TO_PX + offsetMm;
  const bottom = bounds.maxY / MM_TO_PX + offsetMm;
  if (right <= left || bottom <= top) return 0;
  const state = useEditor.getState();
  state.addCutPaths([{
    id: `measure-contour-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]],
    closed: true,
    kind: 'outline',
    passes: Math.max(1, Math.round(passes)),
    color: '#ff00ff',
  }]);
  state.setCutPathsVisible(true);
  pushHistory();
  return 1;
}

export function addBridgedCutContourFromMeasureAnnotations(offsetMm = 0, bridgeCount = 4, gapMm = 1, passes = 1): number {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(bridgeCount) || bridgeCount < 1 || !Number.isFinite(gapMm) || gapMm <= 0 || !Number.isFinite(passes) || passes < 1) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const left = bounds.minX / MM_TO_PX - offsetMm;
  const top = bounds.minY / MM_TO_PX - offsetMm;
  const right = bounds.maxX / MM_TO_PX + offsetMm;
  const bottom = bounds.maxY / MM_TO_PX + offsetMm;
  if (right <= left || bottom <= top) return 0;
  const source = {
    id: `measure-contour-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] as Array<[number, number]>,
    closed: true,
    kind: 'outline' as const,
    passes: Math.max(1, Math.round(passes)),
    color: '#ff00ff',
  };
  const paths = addBridges([source], Math.floor(bridgeCount), gapMm);
  if (paths.length === 0 || (paths.length === 1 && paths[0].closed)) return 0;
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function addRegistrationMarksFromMeasureAnnotations(offsetMm = 5, armLengthMm = 10, insetMm = 5): number {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(armLengthMm) || armLengthMm <= 0 || !Number.isFinite(insetMm) || insetMm < 0) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const regBounds = {
    x: bounds.minX / MM_TO_PX - offsetMm,
    y: bounds.minY / MM_TO_PX - offsetMm,
    w: bounds.width / MM_TO_PX + offsetMm * 2,
    h: bounds.height / MM_TO_PX + offsetMm * 2,
  };
  if (regBounds.w <= 0 || regBounds.h <= 0) return 0;
  const state = useEditor.getState();
  state.clearCutPaths('regmark');
  state.addCutPaths(generateRegMarks({ bounds: regBounds, armLength: armLengthMm, inset: insetMm }));
  state.setCutPathsVisible(true);
  pushHistory();
  return 4;
}

export function addWeedBorderFromMeasureAnnotations(marginMm = 5, rows = 0, cols = 0): number {
  if (!Number.isFinite(marginMm) || marginMm < 0 || !Number.isFinite(rows) || rows < 0 || !Number.isFinite(cols) || cols < 0) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const weedBounds = {
    x: bounds.minX / MM_TO_PX,
    y: bounds.minY / MM_TO_PX,
    w: bounds.width / MM_TO_PX,
    h: bounds.height / MM_TO_PX,
  };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return 0;
  const roundedRows = Math.floor(rows);
  const roundedCols = Math.floor(cols);
  const paths = [generateWeedBorder(weedBounds, marginMm)];
  if (roundedRows > 0 || roundedCols > 0) paths.push(...generateWeedLines(weedBounds, roundedRows, roundedCols, marginMm));
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function addGrommetsFromMeasureAnnotations(insetMm = 20, maxSpacingMm = 500, diameterMm = 10): number {
  const matches = measureAnnotationObjects();
  const paths = grommetsFromObjects(matches, insetMm, maxSpacingMm, diameterMm);
  if (paths.length === 0) return 0;
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function addRhinestonesFromMeasureAnnotations(spacingMm = 4, diameterMm = 2.8): number {
  if (!Number.isFinite(spacingMm) || spacingMm <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0) return 0;
  const matches = measureAnnotationObjects();
  const paths = rhinestoneFromSelection(matches, spacingMm, diameterMm);
  if (paths.length === 0) return 0;
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function preparePrintAndCutFromMeasureAnnotations(bleedMm = 3, contourOffsetMm = 0, regOffsetMm = 5, weedMarginMm = 5): { printMarks: number; cutPaths: number; guides: number } | null {
  if (!Number.isFinite(bleedMm) || bleedMm < 0 || !Number.isFinite(contourOffsetMm) || contourOffsetMm < 0 || !Number.isFinite(regOffsetMm) || regOffsetMm < 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0) return null;
  const canvas = getCanvas();
  const matches = measureAnnotationObjects();
  const bounds = selectionBounds(matches);
  if (!canvas || !bounds) return null;
  const printMarks = createPrintMarkObjects({ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }, { bleedMm });
  const left = bounds.minX / MM_TO_PX - contourOffsetMm;
  const top = bounds.minY / MM_TO_PX - contourOffsetMm;
  const right = bounds.maxX / MM_TO_PX + contourOffsetMm;
  const bottom = bounds.maxY / MM_TO_PX + contourOffsetMm;
  if (right <= left || bottom <= top) return null;
  const contour = {
    id: `measure-contour-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] as Array<[number, number]>,
    closed: true,
    kind: 'outline' as const,
    passes: 1,
    color: '#ff00ff',
  };
  const regBounds = {
    x: bounds.minX / MM_TO_PX - regOffsetMm,
    y: bounds.minY / MM_TO_PX - regOffsetMm,
    w: bounds.width / MM_TO_PX + regOffsetMm * 2,
    h: bounds.height / MM_TO_PX + regOffsetMm * 2,
  };
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  const cutPaths = [contour, ...generateRegMarks({ bounds: regBounds, armLength: 10, inset: 5 }), generateWeedBorder(weedBounds, weedMarginMm)];
  canvas.discardActiveObject();
  for (const mark of printMarks) canvas.add(mark);
  if (printMarks.length === 1) canvas.setActiveObject(printMarks[0]);
  else if (printMarks.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(printMarks, { canvas }));
  const state = useEditor.getState();
  state.clearCutPaths('regmark');
  state.addCutPaths(cutPaths);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, bleedMm);
  canvas.requestRenderAll();
  pushHistory();
  return { printMarks: printMarks.length, cutPaths: cutPaths.length, guides };
}

export function prepareBannerFinishingFromMeasureAnnotations(insetMm = 20, maxSpacingMm = 500, diameterMm = 10, weedMarginMm = 5, rows = 0, cols = 0): { grommets: number; weedPaths: number; guides: number } | null {
  if (!Number.isFinite(insetMm) || insetMm < 0 || !Number.isFinite(maxSpacingMm) || maxSpacingMm <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0 || !Number.isFinite(rows) || rows < 0 || !Number.isFinite(cols) || cols < 0) return null;
  const matches = measureAnnotationObjects();
  const bounds = selectionBounds(matches);
  if (!bounds) return null;
  const grommets = grommetsFromObjects(matches, insetMm, maxSpacingMm, diameterMm);
  if (grommets.length === 0) return null;
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return null;
  const weedPaths = [generateWeedBorder(weedBounds, weedMarginMm)];
  const roundedRows = Math.floor(rows);
  const roundedCols = Math.floor(cols);
  if (roundedRows > 0 || roundedCols > 0) weedPaths.push(...generateWeedLines(weedBounds, roundedRows, roundedCols, weedMarginMm));
  const state = useEditor.getState();
  state.addCutPaths([...grommets, ...weedPaths]);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, weedMarginMm);
  pushHistory();
  return { grommets: grommets.length, weedPaths: weedPaths.length, guides };
}

export function prepareStencilCutFromMeasureAnnotations(offsetMm = 0, bridgeCount = 4, gapMm = 1, weedMarginMm = 5, rows = 0, cols = 0): { bridgedContours: number; weedPaths: number; guides: number } | null {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(bridgeCount) || bridgeCount < 1 || !Number.isFinite(gapMm) || gapMm <= 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0 || !Number.isFinite(rows) || rows < 0 || !Number.isFinite(cols) || cols < 0) return null;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return null;
  const left = bounds.minX / MM_TO_PX - offsetMm;
  const top = bounds.minY / MM_TO_PX - offsetMm;
  const right = bounds.maxX / MM_TO_PX + offsetMm;
  const bottom = bounds.maxY / MM_TO_PX + offsetMm;
  if (right <= left || bottom <= top) return null;
  const source = {
    id: `measure-stencil-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] as Array<[number, number]>,
    closed: true,
    kind: 'outline' as const,
    passes: 1,
    color: '#ff00ff',
  };
  const bridgedContours = addBridges([source], Math.floor(bridgeCount), gapMm);
  if (bridgedContours.length === 0 || (bridgedContours.length === 1 && bridgedContours[0].closed)) return null;
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return null;
  const weedPaths = [generateWeedBorder(weedBounds, weedMarginMm)];
  const roundedRows = Math.floor(rows);
  const roundedCols = Math.floor(cols);
  if (roundedRows > 0 || roundedCols > 0) weedPaths.push(...generateWeedLines(weedBounds, roundedRows, roundedCols, weedMarginMm));
  const state = useEditor.getState();
  state.addCutPaths([...bridgedContours, ...weedPaths]);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, weedMarginMm);
  pushHistory();
  return { bridgedContours: bridgedContours.length, weedPaths: weedPaths.length, guides };
}

export function prepareRhinestoneTemplateFromMeasureAnnotations(spacingMm = 4, diameterMm = 2.8, weedMarginMm = 5): { stones: number; weedPaths: number; guides: number } | null {
  if (!Number.isFinite(spacingMm) || spacingMm <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0) return null;
  const matches = measureAnnotationObjects();
  const bounds = selectionBounds(matches);
  if (!bounds) return null;
  const stones = rhinestoneFromSelection(matches, spacingMm, diameterMm);
  if (stones.length === 0) return null;
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return null;
  const weedPaths = [generateWeedBorder(weedBounds, weedMarginMm)];
  const state = useEditor.getState();
  state.addCutPaths([...stones, ...weedPaths]);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, weedMarginMm);
  pushHistory();
  return { stones: stones.length, weedPaths: weedPaths.length, guides };
}

function measureAnnotationArtboardBounds(marginMm: number): { x: number; y: number; width: number; height: number; centerX: number; centerY: number } | null {
  if (!Number.isFinite(marginMm) || marginMm < 0) return null;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return null;
  const marginPx = marginMm * MM_TO_PX;
  return {
    x: bounds.minX - marginPx,
    y: bounds.minY - marginPx,
    width: bounds.width + marginPx * 2,
    height: bounds.height + marginPx * 2,
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
  };
}

function addMeasureAnnotationArtboard(marginMm: number): boolean {
  const nextBounds = measureAnnotationArtboardBounds(marginMm);
  if (!nextBounds) return false;
  const state = useEditor.getState();
  const artboards = state.artboards;
  const index = artboards.length + 1;
  state.setArtboards([
    ...artboards,
    {
      id: `ab-measure-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: marginMm > 0 ? `Measure Proof ${index} +${marginMm.toFixed(1)}mm` : `Measure Proof ${index}`,
      x: nextBounds.x,
      y: nextBounds.y,
      width: nextBounds.width,
      height: nextBounds.height,
    },
  ]);
  pushHistory();
  return true;
}

export function makeArtboardFromMeasureAnnotations(): boolean {
  return addMeasureAnnotationArtboard(0);
}

export function makeMarginArtboardFromMeasureAnnotations(marginMm: number): boolean {
  return addMeasureAnnotationArtboard(marginMm);
}

export function resizeArtboardToMeasureAnnotations(marginMm = 0): boolean {
  const nextBounds = measureAnnotationArtboardBounds(marginMm);
  if (!nextBounds) return false;
  const state = useEditor.getState();
  const artboards = state.artboards;
  if (artboards.length === 0) return false;
  const targetIndex = artboards.findIndex((artboard) => (
    nextBounds.centerX >= artboard.x
    && nextBounds.centerX <= artboard.x + artboard.width
    && nextBounds.centerY >= artboard.y
    && nextBounds.centerY <= artboard.y + artboard.height
  ));
  const index = targetIndex >= 0 ? targetIndex : 0;
  state.setArtboards(artboards.map((artboard, artboardIndex) => (artboardIndex === index
    ? { ...artboard, x: nextBounds.x, y: nextBounds.y, width: nextBounds.width, height: nextBounds.height }
    : artboard
  )));
  pushHistory();
  return true;
}


export function selectFabricObjects(objects: fabric.FabricObject[]): number {
  const canvas = getCanvas();
  if (!canvas || objects.length === 0) return 0;
  canvas.discardActiveObject();
  if (objects.length === 1) canvas.setActiveObject(objects[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
  canvas.requestRenderAll();
  return objects.length;
}
export function selectMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}

export function clearMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) canvas.remove(object);
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}


export function lockMeasureAnnotations(): number {
  return setMeasureAnnotationsLocked(true);
}

export function unlockMeasureAnnotations(): number {
  return setMeasureAnnotationsLocked(false);
}

export function hideMeasureAnnotations(): number {
  return setMeasureAnnotationsVisible(false);
}

export function showMeasureAnnotations(): number {
  return setMeasureAnnotationsVisible(true);
}
