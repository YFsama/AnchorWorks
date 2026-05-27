/**
 * ToolHandler interface + registry — first scaffolding slice for task #18.
 *
 * Today's tool dispatch in canvasEngine.ts is one giant switch-case:
 * `setTool(t)` flips canvas flags (cursor, selectable, drawingMode), and
 * `onMouseDown` / `onMouseMove` / `onMouseUp` each branch on `activeTool` to
 * route to per-tool logic. Adding a new tool means editing types.ts (the
 * ToolId union), canvasEngine.setTool (cursor + state setup), three mouse
 * handlers, the Toolbar (button list), and i18n.ts (label key) — five files.
 *
 * This module declares a `ToolHandler` shape any tool can implement and a
 * tiny registry the engine can consult instead of hard-coding switch arms.
 * Purely additive — no existing call site changes yet. `penPolyTool.ts`
 * already has the right structure for a future migration (private state +
 * named lifecycle functions); the next slice can wrap it in a ToolHandler
 * descriptor and have the engine's onMouseDown call `getTool(activeTool)
 * ?.onMouseDown?.(ctx)` for that one tool first.
 */

import type * as fabric from 'fabric';
import type { LucideIcon } from 'lucide-react';
import type { ToolId } from '../../types';

/** What the engine knows about a mouse event when it routes to a tool. */
export interface ToolMouseCtx {
  /** Scene-space pointer (document coords, post-zoom/pan). */
  sp: { x: number; y: number };
  /** Viewport-space pointer (screen-relative). */
  vp: { x: number; y: number };
  /** Raw Fabric event, kept escape hatch for tools that need modifier keys. */
  raw: fabric.TPointerEventInfo<fabric.TPointerEvent>;
  /** The live canvas, for tools that need to add/remove objects directly. */
  canvas: fabric.Canvas;
}

/**
 * A tool plugs in by implementing some/all of these lifecycle hooks. Every
 * field is optional — the engine still owns the default behaviour for any
 * hook a tool doesn't override (e.g. the built-in selection rectangle).
 */
export interface ToolHandler {
  /** Stable identifier — matches a member of the ToolId union. */
  id: ToolId;
  /** User-visible label (passed through i18n at use sites). */
  label: string;
  /** Toolbar icon. Tools that don't appear in the vertical toolbar (e.g.
   *  `directSelect`, reached via Alt-click in a future iteration) leave
   *  this undefined and the Toolbar skips them. */
  icon?: LucideIcon;
  /** Extra search keywords for fuzzy lookup in the CommandPalette
   *  (e.g. eraser → "rub remove", hand → "pan"). Space-separated. */
  keywords?: string;
  /** Single-character keyboard shortcut. Toolbar shows it in the corner
   *  badge; CommandPalette registers it as `aria-keyshortcuts`. */
  shortcut?: string;
  /** CSS cursor for the canvas while this tool is active. Falls back to
   *  the engine's default if undefined. */
  cursor?: string;
  /** Whether fabric.Canvas.selection should be true while this tool is
   *  active. Most tools want false; select / directSelect want true. */
  selectable?: boolean;
  /** If true, fabric.Canvas.skipTargetFind is set so hover/click don't
   *  pick up existing objects (Hand pan, Eraser). */
  skipTargetFind?: boolean;
  /** If true, the engine flips every canvas object's `selectable` +
   *  `evented` to true while this tool is active (so the user can click on
   *  shapes to select/manipulate them). Currently `select` and
   *  `directSelect` opt in; all others leave objects un-pickable so the
   *  drawing/text/zoom/eraser tools own pointer events exclusively. */
  pickable?: boolean;

  /** Called when this tool becomes active. Engine has already flipped the
   *  cursor / selectable / skipTargetFind flags by the time this fires. */
  onActivate?(canvas: fabric.Canvas): void;
  /** Called when switching away from this tool — last chance to finalise
   *  in-progress shapes (mirrors finishPolyIfAny in penPolyTool today). */
  onDeactivate?(canvas: fabric.Canvas): void;

  onMouseDown?(ctx: ToolMouseCtx): void;
  onMouseMove?(ctx: ToolMouseCtx): void;
  onMouseUp?(ctx: ToolMouseCtx): void;
}

const registry = new Map<ToolId, ToolHandler>();

/** Register a ToolHandler. Last-write-wins on the `id`. */
export function registerTool(h: ToolHandler): void {
  registry.set(h.id, h);
}

/** Lookup by id. Returns undefined if not registered (engine falls back to
 *  its built-in switch-case in that case during the migration period). */
export function getTool(id: ToolId): ToolHandler | undefined {
  return registry.get(id);
}

/** All registered tools, in insertion order. Toolbar can iterate this to
 *  render its button list once the registry is canonical. */
export function listTools(): ToolHandler[] {
  return [...registry.values()];
}

/**
 * Apply a tool descriptor's canvas-level flags + per-object pickability,
 * then fire its `onActivate` hook. Extracted from canvasEngine.setTool so
 * the engine's switch-tool wrapper stays thin (set activeTool + call
 * onDeactivate + call applyToolToCanvas + request render).
 *
 * Pass `handler === undefined` to clear to defaults — useful when the
 * registry hasn't been initialised yet (defensive, shouldn't happen in
 * production since `registerBuiltInTools()` runs at module load).
 */
export function applyToolToCanvas(canvas: fabric.Canvas, handler: ToolHandler | undefined): void {
  const pickable = handler?.pickable ?? false;
  canvas.forEachObject((o) => {
    // Skip overlay objects (like path-edit handles) — they manage their own flags.
    if ((o as { excludeFromExport?: boolean }).excludeFromExport) return;
    o.selectable = pickable;
    o.evented = pickable;
  });
  canvas.defaultCursor = handler?.cursor ?? 'default';
  canvas.selection = handler?.selectable ?? false;
  canvas.skipTargetFind = handler?.skipTargetFind ?? false;
  handler?.onActivate?.(canvas);
}
