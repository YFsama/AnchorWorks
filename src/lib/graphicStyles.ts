import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { pushHistory } from './historyOps';
import { useEditor } from '../store/editor';
import { updateSelection } from './selectionApply';

export const GRAPHIC_STYLES_KEY = 'vector.graphicStyles';

export const DEFAULT_CLEARED_APPEARANCE: GraphicStyle = {
  id: 'clear-appearance',
  name: 'Clear Appearance',
  fill: '#ffffff',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  blendMode: 'source-over',
  strokeDashArray: [],
  strokeLineCap: 'butt',
  strokeLineJoin: 'miter',
  shadow: null,
};

export type GraphicStyle = {
  id: string;
  name: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  strokeDashArray: number[];
  strokeLineCap: CanvasLineCap;
  strokeLineJoin: CanvasLineJoin;
  shadow: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  } | null;
};

const DEFAULT_GRAPHIC_STYLES: GraphicStyle[] = [
  {
    id: 'poster-blue',
    name: 'Poster Blue',
    fill: '#3d9bff',
    stroke: '#111827',
    strokeWidth: 2,
    opacity: 1,
    blendMode: 'source-over',
    strokeDashArray: [],
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    shadow: { color: 'rgba(0,0,0,0.28)', blur: 10, offsetX: 3, offsetY: 4 },
  },
  {
    id: 'cut-outline',
    name: 'Cut Outline',
    fill: '',
    stroke: '#ff3d7a',
    strokeWidth: 1,
    opacity: 1,
    blendMode: 'source-over',
    strokeDashArray: [],
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    shadow: null,
  },
  {
    id: 'soft-badge',
    name: 'Soft Badge',
    fill: '#ffffff',
    stroke: '#3d9bff',
    strokeWidth: 4,
    opacity: 0.92,
    blendMode: 'source-over',
    strokeDashArray: [],
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    shadow: { color: 'rgba(61,155,255,0.45)', blur: 14, offsetX: 0, offsetY: 0 },
  },
];

function safePaint(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeBlendMode(value: unknown): GlobalCompositeOperation {
  return typeof value === 'string' && value ? value as GlobalCompositeOperation : 'source-over';
}

function cloneStyle(style: GraphicStyle): GraphicStyle {
  return {
    ...style,
    strokeDashArray: [...style.strokeDashArray],
    shadow: style.shadow ? { ...style.shadow } : null,
  };
}

function parseStyle(value: unknown, fallbackId: string): GraphicStyle | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<GraphicStyle>;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Graphic Style',
    fill: safePaint(raw.fill),
    stroke: safePaint(raw.stroke),
    strokeWidth: Number.isFinite(raw.strokeWidth) ? Number(raw.strokeWidth) : 1,
    opacity: Number.isFinite(raw.opacity) ? Math.max(0, Math.min(1, Number(raw.opacity))) : 1,
    blendMode: safeBlendMode(raw.blendMode),
    strokeDashArray: Array.isArray(raw.strokeDashArray) ? raw.strokeDashArray.map(Number).filter(Number.isFinite) : [],
    strokeLineCap: (raw.strokeLineCap === 'round' || raw.strokeLineCap === 'square') ? raw.strokeLineCap : 'butt',
    strokeLineJoin: (raw.strokeLineJoin === 'round' || raw.strokeLineJoin === 'bevel') ? raw.strokeLineJoin : 'miter',
    shadow: raw.shadow && typeof raw.shadow === 'object'
      ? {
        color: safePaint(raw.shadow.color) || 'rgba(0,0,0,0.35)',
        blur: Number.isFinite(raw.shadow.blur) ? Number(raw.shadow.blur) : 8,
        offsetX: Number.isFinite(raw.shadow.offsetX) ? Number(raw.shadow.offsetX) : 3,
        offsetY: Number.isFinite(raw.shadow.offsetY) ? Number(raw.shadow.offsetY) : 3,
      }
      : null,
  };
}

export function defaultGraphicStyles(): GraphicStyle[] {
  return DEFAULT_GRAPHIC_STYLES.map(cloneStyle);
}

export function loadGraphicStyles(storage: Pick<Storage, 'getItem'> = localStorage): GraphicStyle[] {
  try {
    const raw = storage.getItem(GRAPHIC_STYLES_KEY);
    if (!raw) return defaultGraphicStyles();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultGraphicStyles();
    const styles = parsed.map((item, index) => parseStyle(item, `style-${index}`)).filter((item): item is GraphicStyle => !!item);
    return styles.length ? styles : defaultGraphicStyles();
  } catch {
    return defaultGraphicStyles();
  }
}

export function saveGraphicStyles(styles: GraphicStyle[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(GRAPHIC_STYLES_KEY, JSON.stringify(styles.map(cloneStyle)));
}

export function saveGraphicStyleFromSelection(name?: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): GraphicStyle | null {
  const styles = loadGraphicStyles(storage);
  const style = captureGraphicStyleFromSelection(name || `Style ${styles.length + 1}`);
  if (!style) return null;
  saveGraphicStyles([...styles, style], storage);
  return style;
}

export function removeGraphicStyle(id: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): number {
  const styles = loadGraphicStyles(storage);
  const next = styles.filter(style => style.id !== id);
  if (next.length === styles.length) return 0;
  saveGraphicStyles(next, storage);
  return styles.length - next.length;
}

export function applyGraphicStyleById(id: string, storage: Pick<Storage, 'getItem'> = localStorage): number {
  const style = loadGraphicStyles(storage).find(item => item.id === id);
  return style ? applyGraphicStyleToSelection(style) : 0;
}

export function selectObjectsUsingGraphicStyleId(id: string, storage: Pick<Storage, 'getItem'> = localStorage): number {
  const style = loadGraphicStyles(storage).find(item => item.id === id);
  return style ? selectObjectsUsingGraphicStyle(style) : 0;
}

export function captureGraphicStyleFromObject(obj: fabric.FabricObject, name = 'Graphic Style'): GraphicStyle {
  const shadow = obj.shadow as fabric.Shadow | null | undefined;
  return {
    id: `style-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    fill: safePaint(obj.fill),
    stroke: safePaint(obj.stroke),
    strokeWidth: obj.strokeWidth ?? 0,
    opacity: obj.opacity ?? 1,
    blendMode: safeBlendMode(obj.globalCompositeOperation),
    strokeDashArray: Array.isArray(obj.strokeDashArray) ? obj.strokeDashArray.slice() : [],
    strokeLineCap: obj.strokeLineCap ?? 'butt',
    strokeLineJoin: obj.strokeLineJoin ?? 'miter',
    shadow: shadow
      ? {
        color: shadow.color,
        blur: shadow.blur,
        offsetX: shadow.offsetX,
        offsetY: shadow.offsetY,
      }
      : null,
  };
}

export function captureGraphicStyleFromSelection(name?: string): GraphicStyle | null {
  const active = getCanvas()?.getActiveObject();
  if (!active) return null;
  return captureGraphicStyleFromObject(active, name || (active as { name?: string }).name || 'Graphic Style');
}

export function applyGraphicStyleToObject(obj: fabric.FabricObject, style: GraphicStyle): void {
  obj.set({
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    strokeDashArray: style.strokeDashArray.length ? style.strokeDashArray : null,
    strokeLineCap: style.strokeLineCap,
    strokeLineJoin: style.strokeLineJoin,
  });
  obj.globalCompositeOperation = style.blendMode;
  obj.shadow = style.shadow ? new fabric.Shadow(style.shadow) : null;
  obj.setCoords();
}


function styleShadowSignature(style: GraphicStyle): string {
  return style.shadow ? `${style.shadow.color.trim().toLowerCase()}|${style.shadow.blur.toFixed(3)}|${style.shadow.offsetX.toFixed(3)}|${style.shadow.offsetY.toFixed(3)}` : '';
}

export function graphicStyleSignature(style: GraphicStyle): string {
  return [
    `fill:${style.fill.trim().toLowerCase()}`,
    `stroke:${style.stroke.trim().toLowerCase()}`,
    `strokeWidth:${style.strokeWidth.toFixed(3)}`,
    `opacity:${style.opacity.toFixed(3)}`,
    `blend:${style.blendMode}`,
    `dash:${style.strokeDashArray.map((n) => n.toFixed(3)).join(',')}`,
    `cap:${style.strokeLineCap}`,
    `join:${style.strokeLineJoin}`,
    `shadow:${styleShadowSignature(style)}`,
  ].join('|');
}

export function objectMatchesGraphicStyle(obj: fabric.FabricObject, style: GraphicStyle): boolean {
  return graphicStyleSignature(captureGraphicStyleFromObject(obj, style.name)) === graphicStyleSignature(style);
}

export function applyGraphicStyleToSelection(style: GraphicStyle): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return 0;
  objs.forEach(obj => applyGraphicStyleToObject(obj, style));
  canvas.requestRenderAll();
  pushHistory();
  updateSelection();
  useEditor.getState().setStyle({ fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, opacity: style.opacity });
  return objs.length;
}

export function clearAppearanceFromObject(obj: fabric.FabricObject): void {
  applyGraphicStyleToObject(obj, DEFAULT_CLEARED_APPEARANCE);
}

export function clearAppearanceFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return 0;
  objs.forEach(clearAppearanceFromObject);
  canvas.requestRenderAll();
  pushHistory();
  updateSelection();
  useEditor.getState().setStyle({
    fill: DEFAULT_CLEARED_APPEARANCE.fill,
    stroke: DEFAULT_CLEARED_APPEARANCE.stroke,
    strokeWidth: DEFAULT_CLEARED_APPEARANCE.strokeWidth,
    opacity: DEFAULT_CLEARED_APPEARANCE.opacity,
  });
  return objs.length;
}

export function selectObjectsUsingGraphicStyle(style: GraphicStyle): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = canvas.getObjects().filter((object) => {
    if ((object as { excludeFromExport?: boolean }).excludeFromExport) return false;
    return objectMatchesGraphicStyle(object, style);
  });
  if (!matches.length) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(matches.length === 1 ? matches[0] : new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  updateSelection();
  return matches.length;
}
