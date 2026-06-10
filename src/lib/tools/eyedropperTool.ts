/**
 * Eyedropper tool — Illustrator's "I" appearance-sampler.
 *
 * On tool activation we remember the objects that were selected (the
 * recipients). Each click then samples the appearance (fill / stroke /
 * stroke-width / opacity / blend / stroke style / shadow / pattern metadata) of the object under the cursor and applies it to
 * every remembered recipient — exactly like Illustrator's Eyedropper, which
 * copies the clicked artwork's look onto the current selection.
 *
 * The browser-EyeDropper swatch in the Properties panel samples a *screen
 * pixel* into a colour field; this is the complementary object→object tool.
 */
import * as fabric from 'fabric';
import { pushHistory } from '../historyOps';
import { toast } from '../toast';
import { t } from '../i18n';
import type { ToolMouseCtx } from './types';

type ShadowSnapshot = { color: string; blur: number; offsetX: number; offsetY: number };
type PatternSnapshot = { kind: string; size: number; color1: string; color2: string };

/** Appearance properties an eyedropper transfers. */
export type EyedropperAppearance = Pick<fabric.FabricObject, 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'strokeLineCap' | 'strokeLineJoin'> & {
  strokeDashArray: number[] | null;
  globalCompositeOperation: GlobalCompositeOperation;
  shadow: ShadowSnapshot | null;
  patternSpec: PatternSnapshot | null;
};

type AppearanceObject = fabric.FabricObject & { patternSpec?: PatternSnapshot; shadow?: fabric.Shadow | ShadowSnapshot | null };

const TEXT_TYPES = new Set(['i-text', 'text', 'textbox']);
const TEXT_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'charSpacing', 'lineHeight', 'textAlign', 'underline', 'linethrough'] as const;
type TextStyle = Record<string, unknown>;

/** Objects that were selected when the tool went active — the paint targets. */
let recipients: fabric.FabricObject[] = [];

/** Walk an object and any nested group children. */
function* walk(obj: fabric.FabricObject): Generator<fabric.FabricObject> {
  yield obj;
  const kids = (obj as unknown as { _objects?: fabric.FabricObject[] })._objects;
  if (kids) for (const k of kids) yield* walk(k);
}

/** Remember the live selection as the paint recipients. The tool descriptor
 *  is `pickable` so objects stay evented (findTarget can hit them), but we
 *  flip every object non-selectable so a click samples instead of dragging. */
export function eyedropperActivate(canvas: fabric.Canvas): void {
  recipients = canvas.getActiveObjects().slice();
  canvas.forEachObject((o) => { o.selectable = false; });
}

export function eyedropperClear(): void {
  recipients = [];
}

/** Read a usable appearance off the source — descend a group to the first
 *  leaf that actually carries a fill/stroke so clicking a group still works. */
export function readEyedropperAppearance(source: fabric.FabricObject): EyedropperAppearance {
  let leaf = source;
  for (const o of walk(source)) {
    if (o.fill || o.stroke) { leaf = o; break; }
  }
  const appearanceLeaf = leaf as AppearanceObject;
  const shadow = appearanceLeaf.shadow;
  const patternSpec = appearanceLeaf.patternSpec;
  return {
    fill: leaf.fill,
    stroke: leaf.stroke,
    strokeWidth: leaf.strokeWidth,
    opacity: leaf.opacity,
    strokeDashArray: Array.isArray(leaf.strokeDashArray) ? leaf.strokeDashArray.slice() : null,
    strokeLineCap: leaf.strokeLineCap,
    strokeLineJoin: leaf.strokeLineJoin,
    globalCompositeOperation: leaf.globalCompositeOperation ?? 'source-over',
    shadow: shadow ? {
      color: typeof shadow.color === 'string' ? shadow.color : 'rgba(0,0,0,0.35)',
      blur: Number.isFinite(shadow.blur) ? Number(shadow.blur) : 0,
      offsetX: Number.isFinite(shadow.offsetX) ? Number(shadow.offsetX) : 0,
      offsetY: Number.isFinite(shadow.offsetY) ? Number(shadow.offsetY) : 0,
    } : null,
    patternSpec: patternSpec ? { ...patternSpec } : null,
  };
}

/** Read type attributes off the first text leaf of `source`, or null if none. */
function readTextStyle(source: fabric.FabricObject): TextStyle | null {
  for (const o of walk(source)) {
    if (TEXT_TYPES.has(o.type ?? '')) {
      const rec = o as unknown as Record<string, unknown>;
      const out: TextStyle = {};
      for (const k of TEXT_KEYS) out[k] = rec[k];
      return out;
    }
  }
  return null;
}

/** Paint a set of objects (descending groups) with one appearance; also copy
 *  `textStyle` onto any text recipients (Illustrator's eyedropper carries type). */
export function applyEyedropperAppearance(objs: fabric.FabricObject[], look: EyedropperAppearance, textStyle: TextStyle | null): void {
  for (const r of objs) {
    for (const o of walk(r)) {
      o.set({
        fill: look.fill,
        stroke: look.stroke,
        strokeWidth: look.strokeWidth,
        opacity: look.opacity,
        strokeDashArray: look.strokeDashArray ? look.strokeDashArray.slice() : null,
        strokeLineCap: look.strokeLineCap,
        strokeLineJoin: look.strokeLineJoin,
      });
      o.globalCompositeOperation = look.globalCompositeOperation;
      o.shadow = look.shadow ? new fabric.Shadow(look.shadow) : null;
      const patterned = o as AppearanceObject;
      if (look.patternSpec) patterned.patternSpec = { ...look.patternSpec };
      else delete patterned.patternSpec;
      if (textStyle && TEXT_TYPES.has(o.type ?? '')) o.set(textStyle);
      o.setCoords();
    }
  }
}

/**
 * Click samples the clicked object's appearance onto the remembered selection.
 * Alt/Option-click does the reverse — applies the current selection's
 * appearance onto the clicked object (Illustrator's eyedropper modifier).
 */
export function eyedropperPick(ctx: ToolMouseCtx): void {
  const { canvas } = ctx;
  const source = canvas.findTarget(ctx.raw.e) as fabric.FabricObject | undefined;
  if (!source) return;
  const alt = (ctx.raw.e as MouseEvent).altKey;

  const live = recipients.filter((r) => canvas.getObjects().includes(r));

  if (alt) {
    // Reverse: copy the selection's look onto the clicked object.
    if (live.length === 0) {
      toast.warn(t('Select objects first, then click one to copy its look.'));
      return;
    }
    applyEyedropperAppearance([source], readEyedropperAppearance(live[0]), readTextStyle(live[0]));
    canvas.requestRenderAll();
    pushHistory();
    toast.success(t('Appearance applied'));
    return;
  }

  const targets = live.filter((r) => r !== source);
  if (targets.length === 0) {
    toast.warn(t('Select objects first, then click one to copy its look.'));
    return;
  }

  applyEyedropperAppearance(targets, readEyedropperAppearance(source), readTextStyle(source));
  canvas.discardActiveObject();
  canvas.setActiveObject(
    targets.length === 1 ? targets[0] : new fabric.ActiveSelection(targets, { canvas }),
  );
  canvas.requestRenderAll();
  pushHistory();
  toast.success(t('Appearance copied'));
}
