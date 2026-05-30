import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { CanvasView } from './components/CanvasView';
import { PropertiesPanel } from './components/PropertiesPanel';
import { AlignPanel } from './components/AlignPanel';
import { ArtboardsPanel } from './components/ArtboardsPanel';
import { SymbolsPanel } from './components/SymbolsPanel';
import { LayersPanel } from './components/LayersPanel';
import { InspectPanel } from './components/InspectPanel';
import { AssetsPanel } from './components/AssetsPanel';
import { StatusBar } from './components/StatusBar';
import { QuickHelp } from './components/QuickHelp';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Onboarding } from './components/Onboarding';
import { hasOnboarded } from './lib/onboarding';
import { Loading } from './components/Loading';
import { useEditor } from './store/editor';
import { useT, useI18n } from './lib/i18n';
import { announce, setLiveRegion } from './lib/a11y';
import { getFormat } from './lib/formats';
import { saveProjectQuick, applyProject, subscribeCurrentProjectName } from './lib/projectFile';
import { setNativeWindowTitle } from './lib/runtime';
import { installNativeMenuListener } from './lib/tauriMenu';
import { useResizableWidth } from './lib/hooks/useResizableWidth';
import { initUpdaterOnBoot } from './lib/updater';

// Code-split the heaviest dialogs / panels — they only load when opened.
const AIPanel = lazy(() => import('./components/AIPanel').then(m => ({ default: m.AIPanel })));
const PlotterDialog = lazy(() => import('./components/PlotterDialog').then(m => ({ default: m.PlotterDialog })));
const CutContourDialog = lazy(() => import('./components/CutContourDialog').then(m => ({ default: m.CutContourDialog })));
const PrintDialog = lazy(() => import('./components/PrintDialog').then(m => ({ default: m.PrintDialog })));
const TemplatesDialog = lazy(() => import('./components/TemplatesDialog').then(m => ({ default: m.TemplatesDialog })));
const RecoveryDialog = lazy(() => import('./components/RecoveryDialog').then(m => ({ default: m.RecoveryDialog })));
const DebugPanel = lazy(() => import('./components/DebugPanel').then(m => ({ default: m.DebugPanel })));
const DocSettingsDialog = lazy(() => import('./components/DocSettingsDialog').then(m => ({ default: m.DocSettingsDialog })));
const RepeatDialog = lazy(() => import('./components/RepeatDialog').then(m => ({ default: m.RepeatDialog })));
const HelpCenter = lazy(() => import('./components/HelpCenter').then(m => ({ default: m.HelpCenter })));
const PreferencesDialog = lazy(() => import('./components/PreferencesDialog').then(m => ({ default: m.PreferencesDialog })));
const KeymapEditor = lazy(() => import('./components/KeymapEditor').then(m => ({ default: m.KeymapEditor })));
import {
  undo, redo, deleteSelection, duplicateSelection, nudgeSelection, zoomBy, zoomFit, zoomToPoint,
  alignSelection, distributeSelection, applyStyleToSelection, groupSelection, ungroupSelection,
  resizeCanvas, setBackground,
  bringForward, sendBackward, bringToFront, sendToBack,
  type AlignAxis, type DistributeDir,
} from './lib/canvasEngine';
import {
  applyShadowToSelection, applyGradientToSelection,
  type GradientStop, type GradientType,
} from './lib/effects';
import { booleanOp, type BoolOp } from './lib/booleanOps';
import { repeatGrid, repeatRadial, repeatMirror } from './lib/repeat';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from './lib/masks';
import { setOutlineMode, isOutlineMode } from './lib/outlineView';
import { applyStrokeAlign, type StrokeAlign } from './lib/strokeAlign';
import { registerSkill } from './lib/mcp';
import { registerBuiltInFormats } from './lib/formatRegistration';
import { registerBuiltInTools } from './lib/tools/registerTools';
import { penEscape, penEnter } from './lib/tools/penPolyTool';
import { listTools } from './lib/tools/types';

// Wire the four core formats (SVG / PNG / JPG / JSON) into the format
// registry as a module-level side-effect — matches the registerSkill calls
// below in shape. Heavier formats (PDF, DXF, G-code) opt in later cycles.
registerBuiltInFormats();
// Tool registry — descriptor-only today; engine still drives the per-tool
// switch-case in canvasEngine.setTool / mouse handlers. Migration is one
// tool at a time once a consumer (next-gen Toolbar, CommandPalette tool
// commands, the Tauri T2 native menu) starts reading from listTools().
registerBuiltInTools();
import { logger } from './lib/debug';
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './lib/canvasEngine';
import { startAutoSave, stopAutoSave, subscribeAutoSaveStatus } from './lib/autosave';
import { ToastHost } from './components/ToastHost';
import { TooltipHost } from './components/TooltipHost';
import { ConfirmHost } from './components/ConfirmHost';
import { OfflineBanner } from './components/OfflineBanner';
import { CanvasContextMenu } from './components/CanvasContextMenu';
import { copySelection, cutSelection, pasteFromClipboard } from './lib/clipboard';
import { CommandPalette } from './components/CommandPalette';
import { getBinding as getKeyBinding, comboMatchesEvent } from './lib/keymap';
import { showConfirm } from './lib/confirm';
import { importImageFile } from './lib/io3';
import { importSVGSmart } from './lib/svgImport';
import { toast, type ToastKind } from './lib/toast';

// Register a built-in "Skill" so the AI can call it as a tool.
registerSkill({
  name: 'align_selection',
  description: 'Align currently selected objects on the canvas (left, right, top, bottom, center-h, center-v).',
  input_schema: { type: 'object', properties: { axis: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'centerH', 'centerV'] } }, required: ['axis'] },
  handler: ({ axis }) => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    const objs = c.getActiveObjects();
    if (objs.length < 2) return 'need 2+ selection';
    const bounds = objs.map(o => o.getBoundingRect());
    const minLeft = Math.min(...bounds.map(b => b.left));
    const maxRight = Math.max(...bounds.map(b => b.left + b.width));
    const minTop = Math.min(...bounds.map(b => b.top));
    const maxBottom = Math.max(...bounds.map(b => b.top + b.height));
    objs.forEach((o, i) => {
      const b = bounds[i];
      const dx = axis === 'left' ? minLeft - b.left
        : axis === 'right' ? maxRight - (b.left + b.width)
        : axis === 'centerH' ? (minLeft + maxRight) / 2 - (b.left + b.width / 2)
        : 0;
      const dy = axis === 'top' ? minTop - b.top
        : axis === 'bottom' ? maxBottom - (b.top + b.height)
        : axis === 'centerV' ? (minTop + maxBottom) / 2 - (b.top + b.height / 2)
        : 0;
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      o.setCoords();
    });
    c.requestRenderAll();
    pushHistory();
    return `aligned on ${axis}`;
  },
});

// Distribute selected objects along an axis with equal spacing (needs 3+ objects).
registerSkill({
  name: 'distribute_objects',
  description: 'Distribute 3+ selected objects with equal spacing horizontally or vertically.',
  input_schema: {
    type: 'object',
    properties: { direction: { type: 'string', enum: ['horizontal', 'vertical'] } },
    required: ['direction'],
  },
  handler: ({ direction }) => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (c.getActiveObjects().length < 3) return 'need 3+ selection';
    distributeSelection(direction as DistributeDir);
    return `distributed ${direction}`;
  },
});

// Run a boolean operation on the top two selected shapes.
registerSkill({
  name: 'boolean_op',
  description: 'Run a boolean Pathfinder operation (union/subtract/intersect/exclude) on the top two selected shapes.',
  input_schema: {
    type: 'object',
    properties: { op: { type: 'string', enum: ['union', 'subtract', 'intersect', 'exclude'] } },
    required: ['op'],
  },
  handler: async ({ op }) => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (c.getActiveObjects().length < 2) return 'need 2+ selection';
    const path = await booleanOp(op as BoolOp);
    return path ? `boolean ${op} ok` : `boolean ${op} produced no geometry`;
  },
});

// Clip-mask + compound-path skills (Illustrator-parity Pathfinder extensions).
registerSkill({
  name: 'apply_clip_mask',
  description: 'Use the top-most selected object as a clipping mask for the others (requires 2+ selection).',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (c.getActiveObjects().length < 2) return 'need 2+ selection';
    return applyClipMask() ? 'clip mask applied' : 'clip mask could not be applied';
  },
});

registerSkill({
  name: 'release_clip_mask',
  description: 'Strip clip masks from the currently selected objects (or their descendants).',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    return releaseClipMask() ? 'clip mask released' : 'nothing to release';
  },
});

registerSkill({
  name: 'make_compound_path',
  description: 'Combine 2+ selected paths/shapes into a single compound path with even-odd fill rule.',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (c.getActiveObjects().length < 2) return 'need 2+ selection';
    return makeCompoundPath() ? 'compound path created' : 'compound path could not be created';
  },
});

registerSkill({
  name: 'release_compound_path',
  description: 'Split a compound fabric.Path (multiple M commands) back into individual paths.',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    return releaseCompoundPath() ? 'compound path released' : 'nothing to release';
  },
});

// Programmatic alignment alias (kept alongside align_selection for AI clarity).
registerSkill({
  name: 'align_objects',
  description: 'Align 2+ selected objects (alias of align_selection): left, right, top, bottom, centerH, centerV.',
  input_schema: {
    type: 'object',
    properties: { axis: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'centerH', 'centerV'] } },
    required: ['axis'],
  },
  handler: ({ axis }) => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (c.getActiveObjects().length < 2) return 'need 2+ selection';
    alignSelection(axis as AlignAxis);
    return `aligned on ${axis}`;
  },
});

// ----- Additional fine-grained skills the AI can call -----

registerSkill({
  name: 'nudge_selection',
  description: 'Move the active selection by (dx, dy) pixels.',
  input_schema: {
    type: 'object',
    properties: { dx: { type: 'number' }, dy: { type: 'number' } },
    required: ['dx', 'dy'],
  },
  handler: ({ dx, dy }) => {
    if (typeof dx !== 'number' || typeof dy !== 'number') throw new Error('dx and dy must be numbers');
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    nudgeSelection(dx, dy);
    return `nudged by (${dx}, ${dy})`;
  },
});

registerSkill({
  name: 'set_fill',
  description: 'Set the fill color of the current selection (CSS color string).',
  input_schema: {
    type: 'object',
    properties: { color: { type: 'string' } },
    required: ['color'],
  },
  handler: ({ color }) => {
    if (typeof color !== 'string' || !color) throw new Error('color is required');
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    applyStyleToSelection({ fill: color });
    return `fill set to ${color}`;
  },
});

registerSkill({
  name: 'set_stroke',
  description: 'Set stroke color (and optional width) on the current selection.',
  input_schema: {
    type: 'object',
    properties: { color: { type: 'string' }, width: { type: 'number' } },
    required: ['color'],
  },
  handler: ({ color, width }) => {
    if (typeof color !== 'string' || !color) throw new Error('color is required');
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    const patch: { stroke: string; strokeWidth?: number } = { stroke: color };
    if (typeof width === 'number') patch.strokeWidth = width;
    applyStyleToSelection(patch);
    return `stroke set to ${color}${typeof width === 'number' ? ` @ ${width}px` : ''}`;
  },
});

registerSkill({
  name: 'apply_shadow',
  description: 'Apply (or remove) a drop shadow on the current selection. Pass { remove: true } to clear.',
  input_schema: {
    type: 'object',
    properties: {
      color: { type: 'string' },
      blur: { type: 'number' },
      offsetX: { type: 'number' },
      offsetY: { type: 'number' },
      remove: { type: 'boolean' },
    },
  },
  handler: (input) => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    if (input.remove) {
      applyShadowToSelection(null);
      return 'shadow removed';
    }
    const { color, blur, offsetX, offsetY } = input as { color?: string; blur?: number; offsetX?: number; offsetY?: number };
    if (typeof color !== 'string' || typeof blur !== 'number' || typeof offsetX !== 'number' || typeof offsetY !== 'number') {
      throw new Error('color, blur, offsetX, offsetY are all required unless remove=true');
    }
    applyShadowToSelection({ color, blur, offsetX, offsetY });
    return `shadow applied (${color}, blur ${blur})`;
  },
});

registerSkill({
  name: 'apply_gradient',
  description: 'Apply a linear or radial gradient fill to the current selection.',
  input_schema: {
    type: 'object',
    properties: {
      stops: {
        type: 'array',
        items: {
          type: 'object',
          properties: { offset: { type: 'number' }, color: { type: 'string' } },
          required: ['offset', 'color'],
        },
      },
      type: { type: 'string', enum: ['linear', 'radial'] },
      angle: { type: 'number' },
    },
    required: ['stops', 'type'],
  },
  handler: (input) => {
    const { stops, type, angle } = input as { stops?: GradientStop[]; type?: GradientType; angle?: number };
    if (!Array.isArray(stops) || stops.length < 2) throw new Error('stops must be an array of at least 2 {offset,color}');
    if (type !== 'linear' && type !== 'radial') throw new Error('type must be "linear" or "radial"');
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    applyGradientToSelection(stops, type, typeof angle === 'number' ? angle : 0);
    return `gradient (${type}) applied with ${stops.length} stops`;
  },
});

registerSkill({
  name: 'resize_canvas',
  description: 'Resize the document canvas to the given width/height in pixels.',
  input_schema: {
    type: 'object',
    properties: { width: { type: 'number' }, height: { type: 'number' } },
    required: ['width', 'height'],
  },
  handler: ({ width, height }) => {
    if (typeof width !== 'number' || typeof height !== 'number') throw new Error('width and height must be numbers');
    if (width < 1 || height < 1) throw new Error('width/height must be positive');
    resizeCanvas(width, height);
    useEditor.getState().setDoc({ width, height });
    pushHistory();
    return `canvas resized to ${width}x${height}`;
  },
});

registerSkill({
  name: 'set_background',
  description: 'Set the canvas background color (CSS color).',
  input_schema: {
    type: 'object',
    properties: { color: { type: 'string' } },
    required: ['color'],
  },
  handler: ({ color }) => {
    if (typeof color !== 'string' || !color) throw new Error('color is required');
    const c = getCanvas();
    if (!c) return 'no canvas';
    setBackground(color);
    useEditor.getState().setDoc({ background: color });
    pushHistory();
    return `background set to ${color}`;
  },
});

registerSkill({
  name: 'select_all',
  description: 'Select all objects on the canvas.',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    const objs = c.getObjects().filter((o) => !(o as { excludeFromExport?: boolean }).excludeFromExport);
    if (!objs.length) return 'nothing to select';
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(objs, { canvas: c });
    c.setActiveObject(sel);
    c.requestRenderAll();
    return `selected ${objs.length} object(s)`;
  },
});

registerSkill({
  name: 'delete_selection',
  description: 'Delete the currently selected objects.',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    const n = c.getActiveObjects().length;
    if (!n) return 'no selection';
    deleteSelection();
    return `deleted ${n} object(s)`;
  },
});

registerSkill({
  name: 'group_selection',
  description: 'Group the currently selected objects (requires an active multi-selection).',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    const active = c.getActiveObject();
    if (!active || active.type !== 'activeselection') return 'select 2+ objects first';
    groupSelection();
    pushHistory();
    return 'grouped';
  },
});

registerSkill({
  name: 'ungroup_selection',
  description: 'Ungroup the currently selected group.',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    const active = c.getActiveObject();
    if (!active || active.type !== 'group') return 'select a group first';
    ungroupSelection();
    pushHistory();
    return 'ungrouped';
  },
});

registerSkill({
  name: 'duplicate_selection',
  description: 'Duplicate the currently selected objects, optionally offset by dx/dy.',
  input_schema: {
    type: 'object',
    properties: { dx: { type: 'number' }, dy: { type: 'number' } },
  },
  handler: ({ dx, dy }) => {
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    duplicateSelection();
    // duplicateSelection has a built-in +20/+20 offset; if caller supplied a
    // custom dx/dy, apply it as an additional nudge after the async clone.
    if (typeof dx === 'number' || typeof dy === 'number') {
      // Use a microtask to wait for the cloned object to land.
      setTimeout(() => {
        const extraDx = (typeof dx === 'number' ? dx : 0) - 20;
        const extraDy = (typeof dy === 'number' ? dy : 0) - 20;
        if (extraDx || extraDy) nudgeSelection(extraDx, extraDy);
      }, 50);
    }
    return 'duplicated';
  },
});

registerSkill({
  name: 'zoom_fit',
  description: 'Fit the canvas content to the viewport.',
  input_schema: { type: 'object', properties: {} },
  handler: () => {
    zoomFit();
    return 'zoomed to fit';
  },
});

registerSkill({
  name: 'set_eraser_size',
  description: 'Set the eraser brush size in document pixels (clamped to 2..400).',
  input_schema: {
    type: 'object',
    properties: { size: { type: 'number' } },
    required: ['size'],
  },
  handler: ({ size }) => {
    if (typeof size !== 'number' || !isFinite(size)) throw new Error('size must be a number');
    useEditor.getState().setEraserSize(size);
    const applied = useEditor.getState().eraserSize;
    return `eraser size set to ${applied}px`;
  },
});

// Surface a non-blocking toast notification to the user.
registerSkill({
  name: 'show_toast',
  description: 'Show a non-blocking toast notification to the user. kind: info|success|warn|error.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['info', 'success', 'warn', 'error'] },
      title: { type: 'string' },
      message: { type: 'string' },
    },
    required: ['kind', 'message'],
  },
  handler: ({ kind, title, message }) => {
    const k = (kind as ToastKind);
    if (k !== 'info' && k !== 'success' && k !== 'warn' && k !== 'error') {
      throw new Error('kind must be info|success|warn|error');
    }
    if (typeof message !== 'string' || !message) throw new Error('message is required');
    const id = toast.show({
      kind: k,
      message,
      ...(typeof title === 'string' && title ? { title } : {}),
    });
    return `toast shown (${id})`;
  },
});

// Smart SVG import — lets the AI ingest model-generated SVG markup directly
// onto the canvas (with gradient / <style> preservation). Returns a summary
// of objects added and any unsupported features dropped.
registerSkill({
  name: 'import_svg',
  description: 'Import an SVG string onto the canvas with smart pre-processing (preserves gradients, inline <style> blocks, currentColor). Returns count of objects added and any warnings about dropped features (filter/mask/use/foreignObject/embedded fonts).',
  input_schema: {
    type: 'object',
    properties: { svg: { type: 'string' } },
    required: ['svg'],
  },
  handler: async ({ svg }) => {
    if (typeof svg !== 'string' || !svg.trim()) throw new Error('svg must be a non-empty string');
    const res = await importSVGSmart(svg);
    const warn = res.warnings.length ? ` warnings: ${res.warnings.join(' | ')}` : '';
    return `imported svg (${res.added} object${res.added === 1 ? '' : 's'}).${warn}`;
  },
});

// Array transform skills — Illustrator "Object > Repeat" analogue. Each
// clones the selection across a regular pattern and pushes one history step.
registerSkill({
  name: 'repeat_grid',
  description: 'Repeat the current selection in a cols × rows grid, offset by (dx, dy) pixels per step.',
  input_schema: {
    type: 'object',
    properties: {
      cols: { type: 'number' },
      rows: { type: 'number' },
      dx: { type: 'number' },
      dy: { type: 'number' },
    },
    required: ['cols', 'rows', 'dx', 'dy'],
  },
  handler: async ({ cols, rows, dx, dy }) => {
    if (typeof cols !== 'number' || typeof rows !== 'number' || typeof dx !== 'number' || typeof dy !== 'number') {
      throw new Error('cols, rows, dx, dy must all be numbers');
    }
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    const n = await repeatGrid({ cols, rows, dx, dy });
    return `grid repeat: +${n}`;
  },
});

registerSkill({
  name: 'repeat_radial',
  description: 'Repeat the current selection N times around a circle of the given radius (in pixels).',
  input_schema: {
    type: 'object',
    properties: {
      count: { type: 'number' },
      radius: { type: 'number' },
    },
    required: ['count', 'radius'],
  },
  handler: async ({ count, radius }) => {
    if (typeof count !== 'number' || typeof radius !== 'number') {
      throw new Error('count and radius must be numbers');
    }
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    const n = await repeatRadial({ count, radius });
    return `radial repeat: +${n}`;
  },
});

registerSkill({
  name: 'repeat_mirror',
  description: 'Mirror the current selection across an axis (horizontal | vertical | both).',
  input_schema: {
    type: 'object',
    properties: {
      axis: { type: 'string', enum: ['horizontal', 'vertical', 'both'] },
    },
    required: ['axis'],
  },
  handler: async ({ axis }) => {
    if (axis !== 'horizontal' && axis !== 'vertical' && axis !== 'both') {
      throw new Error('axis must be horizontal | vertical | both');
    }
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    const n = await repeatMirror({ axis });
    return `mirror repeat: +${n}`;
  },
});

// Toggle Illustrator-style "Outline view" — renders every object as a thin
// wireframe (no fill, no shadow). Pass { on: true|false } to set explicitly,
// or omit `on` to flip the current state.
registerSkill({
  name: 'toggle_outline_view',
  description: 'Toggle Illustrator-style Outline view (thin wireframe rendering of every object). Pass { on: true|false } to set explicitly, or omit `on` to flip the current state.',
  input_schema: {
    type: 'object',
    properties: { on: { type: 'boolean' } },
  },
  handler: ({ on }) => {
    const next = typeof on === 'boolean' ? on : !isOutlineMode();
    setOutlineMode(next);
    return `outline view ${next ? 'on' : 'off'}`;
  },
});

// Stroke alignment — Illustrator/Figma "inside / center / outside" stroke
// placement. Visual approximation on top of Fabric (see src/lib/strokeAlign.ts
// for caveats).
registerSkill({
  name: 'set_stroke_align',
  description: 'Set stroke alignment on the current selection: center (default Fabric behaviour), inside (clipPath trick), or outside (width-doubled approximation).',
  input_schema: {
    type: 'object',
    properties: { align: { type: 'string', enum: ['center', 'inside', 'outside'] } },
    required: ['align'],
  },
  handler: ({ align }) => {
    if (align !== 'center' && align !== 'inside' && align !== 'outside') {
      throw new Error('align must be center | inside | outside');
    }
    const c = getCanvas();
    if (!c) return 'no canvas';
    if (!c.getActiveObjects().length) return 'no selection';
    applyStrokeAlign(align as StrokeAlign);
    return `stroke align: ${align}`;
  },
});

export default function App() {
  const t = useT();
  const lang = useI18n((s) => s.lang);

  // Keep <html lang> in sync with the active locale — screen readers, browser
  // spell-check, and Google's "Translate this page" prompt all consult it.
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const [showAI, setShowAI] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasOnboarded());
  // Delay-mount RecoveryDialog so its chunk loads lazily after first paint.
  const [recoveryMounted, setRecoveryMounted] = useState(false);
  const [mobileAsideOpen, setMobileAsideOpen] = useState(false);

  // Right sidebar width. Drag the strip on its left edge to widen/narrow;
  // value persists to localStorage so a wider panel survives reloads.
  // Clamp: 240 (Properties' minimum readable width) … 560 (anything more
  // eats the canvas on a standard 1440-wide window).
  const {
    width: rightPanelWidth,
    onMouseDown: onRightPanelResizeStart,
    reset: resetRightPanelWidth,
  } = useResizableWidth({
    storageKey: 'vs:right-panel-w',
    edge: 'left',
    min: 240,
    max: 560,
    initial: 288, // matches the previous static w-72
  });
  const setTool = useEditor(s => s.setTool);
  const setModal = useEditor(s => s.setModal);
  const showPlotter = useEditor(s => s.showPlotter);
  const showCutContour = useEditor(s => s.showCutContour);
  const showPrint = useEditor(s => s.showPrint);
  const showDocSettings = useEditor(s => s.showDocSettings);
  const showTemplates = useEditor(s => s.showTemplates);
  const showRepeat = useEditor(s => s.showRepeat);
  const showPreferences = useEditor(s => s.showPreferences);
  const showKeymapEditor = useEditor(s => s.showKeymapEditor);
  const highContrast = useEditor(s => s.highContrast);
  const liveRef = useRef<HTMLDivElement>(null);
  // Hidden file inputs driven by the command palette (the menu bar has its
  // own copies for menu-driven flows). Mirrors MenuBar's onFile/onImage.
  const paletteOpenRef = useRef<HTMLInputElement>(null);
  const paletteImageRef = useRef<HTMLInputElement>(null);

  // Register the aria-live region with the global a11y helper.
  useEffect(() => {
    setLiveRegion(liveRef.current);
    return () => setLiveRegion(null);
  }, []);

  // Kick off the in-app updater workflow once per app mount. No-ops in
  // the PWA build (handled inside initUpdaterOnBoot via isTauri()).
  useEffect(() => { initUpdaterOnBoot(); }, []);

  // Apply high-contrast theme via a data attribute on <html> and persist the
  // choice to localStorage so subsequent loads honour the user's selection
  // (the boot script reads `vs:hc` for the splash paint). Mirrors the theme
  // useEffect pattern so direct `setState` calls also persist.
  useEffect(() => {
    document.documentElement.setAttribute('data-high-contrast', highContrast ? 'true' : 'false');
    try { window.localStorage.setItem('vs:hc', highContrast ? 'true' : 'false'); }
    catch { /* localStorage may be blocked — ignore */ }
    announce(t(highContrast ? 'High contrast enabled' : 'High contrast disabled'));
  }, [highContrast]);

  // Light / dark theme — applied via `data-theme` on <html>; persisted to
  // localStorage so the choice survives reloads. High-contrast still wins
  // visually thanks to the `!important` overrides in index.css.
  const theme = useEditor(s => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('vs:theme', theme); }
    catch { /* localStorage may be blocked (private mode, file://) — ignore */ }
    announce(t(theme === 'light' ? 'Light theme enabled' : 'Dark theme enabled'));
  }, [theme]);

  // Toggle a body class to drive the mobile slide-over CSS.
  useEffect(() => {
    document.body.classList.toggle('aside-mobile-open', mobileAsideOpen);
    return () => document.body.classList.remove('aside-mobile-open');
  }, [mobileAsideOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const cmd = e.ctrlKey || e.metaKey;
      // Resolve a shortcut id against the user's customised keymap.
      // Keeps each branch's shape identical to the original hardcoded ifs.
      const match = (id: string) => comboMatchesEvent(getKeyBinding(id), e);
      // Cmd/Ctrl+K — toggle the global command palette. Checked early so it
      // wins over single-letter tool shortcuts that share the same key.
      if (match('window.commandPalette')) {
        e.preventDefault();
        const { showCommandPalette, setModal: m } = useEditor.getState();
        m('showCommandPalette', !showCommandPalette);
        return;
      }
      // Preferences — Mac convention Cmd+, , registered in the keymap so users
      // can rebind it via Customize Shortcuts.
      if (match('window.preferences')) {
        e.preventDefault();
        const { showPreferences, setModal: m } = useEditor.getState();
        m('showPreferences', !showPreferences);
        return;
      }
      // Cut Contour — fast access to the offset/trace/regmark dialog. Bound
      // to Ctrl+Shift+C; plain Ctrl+C stays as the canvas Copy action.
      if (match('window.cutContour')) {
        e.preventDefault();
        const { showCutContour, setModal: m } = useEditor.getState();
        m('showCutContour', !showCutContour);
        return;
      }
      // Legacy Ctrl+Z block also routes Ctrl+Shift+Z → Redo; we keep that
      // fork by checking the dedicated redo-shift binding before plain undo.
      if (match('edit.redoShift')) { e.preventDefault(); redo(); announce(t('Redo')); return; }
      if (match('edit.undo')) { e.preventDefault(); undo(); announce(t('Undo')); return; }
      // Ctrl/Cmd+Alt+Y toggles Outline View. We deliberately don't claim plain
      // Ctrl+Y (Illustrator's mac shortcut) because Ctrl+Y is Redo on
      // Windows/Linux and we don't want to fight the existing Redo binding.
      if (match('view.outline')) {
        e.preventDefault();
        const next = !isOutlineMode();
        setOutlineMode(next);
        announce(t(next ? 'Outline View on' : 'Outline View off'));
        return;
      }
      if (match('edit.redo')) { e.preventDefault(); redo(); announce(t('Redo')); return; }
      if (match('edit.duplicate')) { e.preventDefault(); duplicateSelection(); announce(t('Duplicate')); return; }
      // Clipboard: copy/cut/paste go through the in-app clipboard exported by
      // CanvasContextMenu — the system clipboard can't carry Fabric objects.
      if (match('edit.copy')) { e.preventDefault(); if (copySelection()) announce(t('Copy')); return; }
      if (match('edit.cut')) { e.preventDefault(); if (cutSelection()) announce(t('Cut')); return; }
      if (match('edit.paste')) { e.preventDefault(); pasteFromClipboard().then((ok) => { if (ok) announce(t('Paste')); }); return; }
      // Cmd+Shift+G must be checked before plain Cmd+G so the shift modifier
      // routes to ungroup. Both bypass the lowercase tool map (which requires
      // !cmd) so we don't collide with the "g" polygon-tool shortcut.
      if (match('edit.ungroup')) { e.preventDefault(); ungroupSelection(); pushHistory(); announce(t('Ungroup')); return; }
      if (match('edit.group')) { e.preventDefault(); groupSelection(); pushHistory(); announce(t('Group')); return; }
      if (match('view.zoomIn')) { e.preventDefault(); zoomBy(1.25); announce(t('Zoom In')); return; }
      if (match('view.zoomOut')) { e.preventDefault(); zoomBy(1 / 1.25); announce(t('Zoom Out')); return; }
      if (match('view.zoomFit')) { e.preventDefault(); zoomFit(); announce(t('Fit to Page')); return; }
      if (match('view.actualSize')) {
        e.preventDefault();
        const c = getCanvas();
        if (c) zoomToPoint(c.getWidth() / 2, c.getHeight() / 2, 1);
        announce(t('Actual Size'));
        return;
      }
      if (match('file.saveProject')) {
        e.preventDefault();
        void saveProjectQuick();
        announce(t('Save Project'));
        return;
      }
      if (match('view.toggleTheme')) {
        e.preventDefault();
        const s = useEditor.getState();
        s.setTheme(s.theme === 'light' ? 'dark' : 'light');
        announce(t('Toggle Theme'));
        return;
      }
      if (match('file.open')) {
        e.preventDefault();
        paletteOpenRef.current?.click();
        announce(t('Open SVG / JSON…'));
        return;
      }
      if (match('file.exportSvg')) {
        e.preventDefault();
        // Routes through the format registry — same path as the File menu and
        // CommandPalette's Export SVG entry. Toast + error surfacing kept at
        // the call site because the keyboard shortcut wants the toast to fire
        // *and* the screen-reader announcement, while the registry handler
        // alone doesn't carry the announcement.
        try { void getFormat('svg')?.export?.(); toast.success(`${t('Exported')} SVG`); }
        catch (err) { toast.error((err as Error).message); }
        announce(t('Export SVG'));
        return;
      }
      if (match('file.print')) {
        e.preventDefault();
        setModal('showPrint', true);
        announce(t('Print'));
        return;
      }
      if (match('arrange.forwardFront')) {
        e.preventDefault();
        if (e.shiftKey) { bringToFront(); announce(t('Bring to Front')); }
        else { bringForward(); announce(t('Bring Forward')); }
        return;
      }
      if (match('arrange.backwardBack')) {
        e.preventDefault();
        if (e.shiftKey) { sendToBack(); announce(t('Send to Back')); }
        else { sendBackward(); announce(t('Send Backward')); }
        return;
      }
      if (match('edit.selectAll')) {
        e.preventDefault();
        const c = getCanvas();
        if (c) {
          const objs = c.getObjects().filter((o) => !(o as { excludeFromExport?: boolean }).excludeFromExport);
          if (objs.length) {
            c.discardActiveObject();
            const sel = new fabric.ActiveSelection(objs, { canvas: c });
            c.setActiveObject(sel);
            c.requestRenderAll();
            announce(t('Select All'));
          }
        }
        return;
      }
      // Excluded from BINDINGS: Delete/Backspace are two equivalent keys for
      // one action — a single combo can't model that alias cleanly.
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); announce(t('Delete')); return; }
      // Pen tool first crack at Esc / Enter — Esc finishes an open bezier
      // path, Enter closes it. Both no-op when the pen has nothing in
      // flight so the existing Escape-deselect / Enter-default-button
      // semantics keep working.
      if (e.key === 'Escape' && useEditor.getState().tool === 'pen') {
        if (penEscape()) { e.preventDefault(); announce(t('Finish path')); return; }
      }
      if (e.key === 'Enter' && useEditor.getState().tool === 'pen' && !e.isComposing) {
        if (penEnter()) { e.preventDefault(); announce(t('Close path')); return; }
      }
      // Excluded from BINDINGS: Escape has conditional preventDefault so dialog
      // close handlers still see the key when nothing is selected.
      if (e.key === 'Escape') {
        const c = getCanvas();
        if (c && c.getActiveObjects().length > 0) {
          e.preventDefault();
          c.discardActiveObject();
          c.requestRenderAll();
          announce(t('Deselect'));
          return;
        }
        // No selection — fall through (don't preventDefault) so dialogs / inline
        // editors that listen for Escape can still close themselves.
      }
      if (match('help.shortcuts')) { e.preventDefault(); setModal('showShortcuts', true); return; }
      // F1 toggles the in-app Help Center — additive; everything else stays
      // untouched. Skipped while typing in inputs (the early-return above).
      if (match('help.helpCenter')) {
        e.preventDefault();
        const { showHelpCenter, setModal: m } = useEditor.getState();
        m('showHelpCenter', !showHelpCenter);
        return;
      }
      // Ctrl+Shift+D — hidden developer affordance. Same toggle the Help
      // submenu "Debug Panel" entry uses; the chord matches every browser /
      // editor's dev-tools convention so power users discover it naturally.
      if (match('help.debugPanel')) {
        e.preventDefault();
        setShowDebug(v => !v);
        return;
      }
      // Excluded from BINDINGS: arrow nudge — four keys + Shift multiplier
      // can't be expressed as a single rebindable combo.
      const arrowMap: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrowMap[e.key]) { e.preventDefault(); const [dx, dy] = arrowMap[e.key]; const step = e.shiftKey ? 10 : 1; nudgeSelection(dx * step, dy * step); return; }
      // Tool shortcuts — each is its own binding so users can rebind them.
      // Wrapped in !cmd to preserve the original "letter tool requires no
      // modifier" rule (otherwise Ctrl+S etc. would also hit 's').
      if (!cmd) {
        // Single-key tool shortcuts (V/R/E/L/G/P/B/X/T/H/Z) — iterate the
        // registry so adding a new toolbar tool registers its shortcut here
        // for free. `match` checks the current keybinding for `tool.<id>`;
        // bindings live in keymap.ts and are user-customisable.
        for (const h of listTools()) {
          if (!h.icon) continue; // skip non-toolbar tools (directSelect)
          if (match(`tool.${h.id}`)) {
            setTool(h.id);
            announce(t(h.label));
            return;
          }
        }
      }
    };
    // Spacebar = temporary Hand tool (Photoshop/Illustrator/Figma convention).
    // Holds the previous tool ID and restores it on key-up so users can pan
    // momentarily without losing their selection / pen / brush context.
    let spaceHeld = false;
    let prevTool: ReturnType<typeof useEditor.getState>['tool'] | null = null;
    const onSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || spaceHeld) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const currentTool = useEditor.getState().tool;
      if (currentTool === 'hand') return; // already panning
      e.preventDefault();
      spaceHeld = true;
      prevTool = currentTool;
      setTool('hand');
    };
    const onSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceHeld) return;
      e.preventDefault();
      spaceHeld = false;
      if (prevTool) { setTool(prevTool); prevTool = null; }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onSpaceDown);
    window.addEventListener('keyup', onSpaceUp);
    logger.info('app', 'Anchorworks ready. Press V/R/E/L/G/P/B/X/T/H/Z to switch tools. Hold Space to pan.');
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onSpaceDown);
      window.removeEventListener('keyup', onSpaceUp);
    };
  }, [setTool, setModal, t]);

  // Avoid duplicate fabric noise
  useEffect(() => { fabric.config.NUM_FRACTION_DIGITS = 3; }, []);

  // Auto-save canvas to localStorage on a fixed interval.
  useEffect(() => {
    startAutoSave();
    return () => stopAutoSave();
  }, []);

  // Sync document.title with autosave dirty state + open project name.
  // VSCode-style "●" prefix when there are unsaved changes; project name
  // (when one is open) is prepended so users browsing tabs / window list
  // can tell which design they're looking at.
  useEffect(() => {
    const APP = 'Anchorworks';
    // Strip `.vstudio.json` (or any trailing `.ext`/`.ext.ext`) for display.
    // Browser tabs are width-constrained; the filename without machine-
    // readable extension is what users actually recognise.
    const stripExt = (n: string) => n.replace(/\.vstudio(\.json)?$|\.[^./]+$/i, '');
    let dirty = false;
    let projectName: string | null = null;
    const update = () => {
      const base = projectName ? `${stripExt(projectName)} — ${APP}` : APP;
      const title = dirty ? `● ${base}` : base;
      document.title = title;
      // Under Tauri, also push to the OS window title — without this the
      // native window stays on its statically-configured tauri.conf.json
      // "Anchorworks" label even after the user opens / edits a project.
      void setNativeWindowTitle(title);
    };
    const unsubA = subscribeAutoSaveStatus((s) => { dirty = s.dirty; update(); });
    const unsubB = subscribeCurrentProjectName((n) => { projectName = n; update(); });
    return () => { unsubA(); unsubB(); };
  }, []);

  // Defer mounting the RecoveryDialog so its chunk is fetched after the
  // initial paint completes — keeps the critical render path lean.
  useEffect(() => {
    const id = window.setTimeout(() => setRecoveryMounted(true), 250);
    return () => window.clearTimeout(id);
  }, []);

  // Under Tauri, hook up the native menu listener so File / Edit / View
  // picks dispatch to the same handlers as the DOM MenuBar. No-op in PWA.
  useEffect(() => { void installNativeMenuListener(); }, []);

  return (
    <div className="h-full w-full flex flex-col bg-[rgb(var(--color-app-bg))] relative">
      {/* Skip-to-canvas link: invisible until keyboard-focused. */}
      <a
        href="#main-canvas"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          const el = document.getElementById('main-canvas');
          if (el) {
            el.focus();
            el.scrollIntoView({ block: 'nearest' });
          }
        }}
      >
        {t('Skip to canvas')}
      </a>

      {/* Polite aria-live region populated by announce() helper. */}
      <div
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <MenuBar
        onToggleAI={() => setShowAI(v => !v)}
        onToggleDebug={() => setShowDebug(v => !v)}
        onShowOnboarding={() => setShowOnboarding(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <Toolbar />
        <main className="flex-1 flex flex-col relative" aria-label={t('Canvas workspace')}>
          <CanvasView />
          <QuickHelp />
          <StatusBar />
          {showDebug && (
            <Suspense fallback={null}>
              <DebugPanel onClose={() => setShowDebug(false)} />
            </Suspense>
          )}
        </main>
        {/* Drag handle: a 4px-wide hit strip on the LEFT edge of the right
            aside. CSS positions it as a sibling so the cursor + hover tint
            don't bleed into the aside content. Hidden on mobile (≤ 900px)
            where the slide-over takes over. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('Resize right panel')}
          tabIndex={-1}
          className="aside-resize-handle"
          onMouseDown={onRightPanelResizeStart}
          onDoubleClick={resetRightPanelWidth}
          title={t('Drag to resize · double-click to reset')}
        />
        <aside
          className="aside-right shrink-0 bg-panel border-l border-border overflow-y-auto flex flex-col"
          style={{ width: `${rightPanelWidth}px` }}
          aria-label={t('Properties and panels')}
        >
          <PropertiesPanel />
          <AlignPanel />
          <ArtboardsPanel />
          <SymbolsPanel />
          <LayersPanel />
          <InspectPanel />
          <AssetsPanel />
        </aside>
        {showAI && (
          <Suspense fallback={<Loading overlay label={t('Loading AI…')} />}>
            <AIPanel onClose={() => setShowAI(false)} />
          </Suspense>
        )}
      </div>

      {/* Mobile / tablet: floating button toggles the right sidebar slide-over.
          The CSS rule sets `position: fixed` only at ≤ 900px; outside that
          range we hide it inline via the .aside-mobile-toggle styles. */}
      <button
        type="button"
        className="aside-mobile-toggle"
        aria-label={t('Panels')}
        aria-expanded={mobileAsideOpen}
        onClick={() => setMobileAsideOpen(v => !v)}
      >
        {t('Panels')}
      </button>
      {showPlotter && (
        <Suspense fallback={null}>
          <PlotterDialog />
        </Suspense>
      )}
      {showCutContour && (
        <Suspense fallback={null}>
          <CutContourDialog />
        </Suspense>
      )}
      {showPrint && (
        <Suspense fallback={null}>
          <PrintDialog />
        </Suspense>
      )}
      {showDocSettings && (
        <Suspense fallback={null}>
          <DocSettingsDialog />
        </Suspense>
      )}
      {showTemplates && (
        <Suspense fallback={null}>
          <TemplatesDialog />
        </Suspense>
      )}
      {showRepeat && (
        <Suspense fallback={null}>
          <RepeatDialog />
        </Suspense>
      )}
      {showPreferences && (
        <Suspense fallback={null}>
          <PreferencesDialog />
        </Suspense>
      )}
      {showKeymapEditor && (
        <Suspense fallback={null}>
          <KeymapEditor />
        </Suspense>
      )}
      {recoveryMounted && (
        <Suspense fallback={null}>
          <RecoveryDialog />
        </Suspense>
      )}
      <ShortcutsDialog />
      <Suspense fallback={useEditor.getState().showHelpCenter ? <Loading overlay label={t('Loading Help Center…')} /> : null}>
        <HelpCenter />
      </Suspense>
      <Onboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <ToastHost />
      <TooltipHost />
      <ConfirmHost />
      <OfflineBanner />
      <CanvasContextMenu />
      <CommandPalette
        onToggleAI={() => setShowAI(v => !v)}
        onToggleDebug={() => setShowDebug(v => !v)}
        onShowOnboarding={() => setShowOnboarding(true)}
        onNewDocument={async () => {
          if (await showConfirm({ title: t('New document'), message: t('Clear canvas?'), confirmLabel: t('Clear'), danger: true })) {
            location.reload();
          }
        }}
        onOpenFile={() => paletteOpenRef.current?.click()}
        onImportImage={() => paletteImageRef.current?.click()}
      />
      <input
        ref={paletteOpenRef}
        type="file"
        accept=".svg,.json,.vstudio.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const ext = f.name.split('.').pop()?.toLowerCase();
          try {
            if (ext === 'svg') {
              // Routes through the format registry — same smart-import +
              // warning-toast surface as the File-menu picker and drag-drop.
              await getFormat('svg')?.import?.(f);
            } else if (ext === 'json') {
              // Sniff for a `.vstudio.json` project envelope; fall back to raw
              // Fabric canvas JSON. This lets Cmd+O open both formats without
              // requiring the user to find the dedicated "Open Project…" menu.
              const text = await f.text();
              const parsed = JSON.parse(text);
              if (parsed && parsed.kind === 'anchorworks-project') {
                await applyProject(parsed);
                // Past-tense + filename to match the other Open/Save toasts
                // (`Opened MyDesign.vstudio.json`). The previous toast echoed
                // the imperative menu label `Open Project…` (with ellipsis),
                // which reads as "still waiting for input" rather than "done".
                toast.success(`${t('Opened')} ${f.name}`);
              } else {
                const c = getCanvas();
                if (c) { await c.loadFromJSON(parsed); c.renderAll(); pushHistory(); }
              }
            }
          } catch (err) {
            toast.error((err as Error).message);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={paletteImageRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          await importImageFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
