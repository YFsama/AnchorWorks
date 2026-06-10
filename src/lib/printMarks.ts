import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { useEditor } from '../store/editor';

const MM_TO_PX = 3.7795;
const CROP_MARK_OFFSET_MM = 3;
const CROP_MARK_LENGTH_MM = 5;
const REGISTRATION_MARK_OFFSET_MM = 4;
const REGISTRATION_MARK_OUTER_RADIUS_MM = 3;
const REGISTRATION_MARK_INNER_RADIUS_MM = 1.5;
const REGISTRATION_CROSSHAIR_MM = 4;
const MARK_STROKE_MM = 0.25;

type MarkKind = 'crop' | 'registration' | 'bleed' | 'page-info';

type PrintMarkObject = fabric.FabricObject & {
  name?: string;
  printMarkKind?: MarkKind;
};

export type PrintMarkOptions = {
  cropMarks?: boolean;
  registrationMarks?: boolean;
  bleedIndicator?: boolean;
  pageInfo?: boolean;
  bleedMm?: number;
};

export const defaultPrintMarkOptions: Required<PrintMarkOptions> = {
  cropMarks: true,
  registrationMarks: true,
  bleedIndicator: true,
  pageInfo: true,
  bleedMm: 3,
};

function mm(value: number): number {
  return value * MM_TO_PX;
}

function markObject<T extends PrintMarkObject>(object: T, kind: MarkKind): T {
  object.name = `Print Mark — ${kind}`;
  object.printMarkKind = kind;
  object.excludeFromExport = false;
  object.selectable = true;
  object.evented = true;
  return object;
}

function makeLine(x1: number, y1: number, x2: number, y2: number, kind: MarkKind): fabric.Line {
  return markObject(new fabric.Line([x1, y1, x2, y2], {
    stroke: '#000000',
    strokeWidth: mm(MARK_STROKE_MM),
    strokeLineCap: 'butt',
    fill: '',
  }), kind);
}

function makeCircle(cx: number, cy: number, radius: number): fabric.Circle {
  return markObject(new fabric.Circle({
    left: cx - radius,
    top: cy - radius,
    radius,
    fill: '',
    stroke: '#000000',
    strokeWidth: mm(MARK_STROKE_MM),
  }), 'registration');
}

function makeText(text: string, left: number, top: number): fabric.FabricText {
  return markObject(new fabric.FabricText(text, {
    left,
    top,
    fill: '#000000',
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: mm(3),
  }), 'page-info');
}

export function createPrintMarkObjects(bounds: { left: number; top: number; width: number; height: number }, options: PrintMarkOptions = {}): fabric.FabricObject[] {
  const config = { ...defaultPrintMarkOptions, ...options };
  const left = bounds.left;
  const top = bounds.top;
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  const objects: fabric.FabricObject[] = [];

  if (config.cropMarks) {
    const offset = mm(CROP_MARK_OFFSET_MM);
    const length = mm(CROP_MARK_LENGTH_MM);
    objects.push(
      makeLine(left - offset - length, top, left - offset, top, 'crop'),
      makeLine(left, top - offset - length, left, top - offset, 'crop'),
      makeLine(right + offset, top, right + offset + length, top, 'crop'),
      makeLine(right, top - offset - length, right, top - offset, 'crop'),
      makeLine(left - offset - length, bottom, left - offset, bottom, 'crop'),
      makeLine(left, bottom + offset, left, bottom + offset + length, 'crop'),
      makeLine(right + offset, bottom, right + offset + length, bottom, 'crop'),
      makeLine(right, bottom + offset, right, bottom + offset + length, 'crop'),
    );
  }

  if (config.registrationMarks) {
    const offset = mm(REGISTRATION_MARK_OFFSET_MM);
    const outer = mm(REGISTRATION_MARK_OUTER_RADIUS_MM);
    const inner = mm(REGISTRATION_MARK_INNER_RADIUS_MM);
    const cross = mm(REGISTRATION_CROSSHAIR_MM);
    const targets: Array<[number, number]> = [
      [left + bounds.width / 2, top - offset - outer],
      [left + bounds.width / 2, bottom + offset + outer],
      [left - offset - outer, top + bounds.height / 2],
      [right + offset + outer, top + bounds.height / 2],
    ];
    for (const [cx, cy] of targets) {
      objects.push(
        makeCircle(cx, cy, outer),
        makeCircle(cx, cy, inner),
        makeLine(cx - cross, cy, cx + cross, cy, 'registration'),
        makeLine(cx, cy - cross, cx, cy + cross, 'registration'),
      );
    }
  }

  if (config.bleedIndicator && config.bleedMm > 0) {
    objects.push(markObject(new fabric.Rect({
      left: left - mm(config.bleedMm),
      top: top - mm(config.bleedMm),
      width: bounds.width + mm(config.bleedMm * 2),
      height: bounds.height + mm(config.bleedMm * 2),
      fill: '',
      stroke: '#e11d48',
      strokeWidth: mm(MARK_STROKE_MM),
      strokeDashArray: [mm(1.5), mm(1.5)],
    }), 'bleed'));
  }

  if (config.pageInfo) {
    const widthMm = bounds.width / MM_TO_PX;
    const heightMm = bounds.height / MM_TO_PX;
    const info = `trim ${widthMm.toFixed(1)}mm × ${heightMm.toFixed(1)}mm${config.bleedMm > 0 ? `  bleed ${config.bleedMm.toFixed(1)}mm` : ''}`;
    objects.push(makeText(info, left, bottom + mm(10)));
  }

  return objects;
}

function firstArtboardBounds(): { left: number; top: number; width: number; height: number } | null {
  const artboard = useEditor.getState().artboards[0];
  return artboard ? { left: artboard.x, top: artboard.y, width: artboard.width, height: artboard.height } : null;
}

export function addPrintMarksToArtboard(options: PrintMarkOptions = {}): number {
  const canvas = getCanvas();
  const bounds = firstArtboardBounds();
  if (!canvas || !bounds) return 0;
  const marks = createPrintMarkObjects(bounds, options);
  if (!marks.length) return 0;
  for (const mark of marks) canvas.add(mark);
  canvas.discardActiveObject();
  canvas.setActiveObject(marks.length === 1 ? marks[0] : new fabric.ActiveSelection(marks, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return marks.length;
}

export function clearPrintMarks(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const marks = canvas.getObjects().filter((object) => typeof (object as { printMarkKind?: unknown }).printMarkKind === 'string');
  if (!marks.length) return 0;
  for (const mark of marks) canvas.remove(mark);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  pushHistory();
  return marks.length;
}
