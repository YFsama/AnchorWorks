/**
 * Eyedropper tool — Illustrator's "I" appearance-sampler.
 *
 * On tool activation we remember the objects that were selected (the
 * recipients). Each click then samples the appearance (fill / stroke /
 * stroke-width / opacity) of the object under the cursor and applies it to
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

/** Appearance properties an eyedropper transfers. */
type Appearance = Pick<fabric.FabricObject, 'fill' | 'stroke' | 'strokeWidth' | 'opacity'>;

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
function readAppearance(source: fabric.FabricObject): Appearance {
  let leaf = source;
  for (const o of walk(source)) {
    if (o.fill || o.stroke) { leaf = o; break; }
  }
  return {
    fill: leaf.fill,
    stroke: leaf.stroke,
    strokeWidth: leaf.strokeWidth,
    opacity: leaf.opacity,
  };
}

/** Paint a set of objects (descending groups) with one appearance. */
function paint(objs: fabric.FabricObject[], look: Appearance): void {
  for (const r of objs) {
    for (const o of walk(r)) {
      o.set(look);
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
    paint([source], readAppearance(live[0]));
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

  paint(targets, readAppearance(source));
  canvas.discardActiveObject();
  canvas.setActiveObject(
    targets.length === 1 ? targets[0] : new fabric.ActiveSelection(targets, { canvas }),
  );
  canvas.requestRenderAll();
  pushHistory();
  toast.success(t('Appearance copied'));
}
