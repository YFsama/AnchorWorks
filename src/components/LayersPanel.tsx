import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Trash2, MousePointerClick, EyeIcon,
  Square, Circle, Slash, Pentagon, Spline, Type as TypeIcon,
  Image as ImageIcon, Group as GroupIcon, BoxSelect, Shapes,
  GripVertical, Search, Copy, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown, ArrowUpDown,
} from 'lucide-react';
import { getCanvas, pushHistory, selectVisibleObjects, selectUnlockedObjects, hideOthers, showAll, unlockAll } from '../lib/canvasEngine';
import * as fabric from 'fabric';
import { useT } from '../lib/i18n';
import { useEditor } from '../store/editor';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';
import { loadGraphicStyles } from '../lib/graphicStyles';
import type { FreeDistortCorners } from '../lib/freeDistort';
import { LAYER_BLEND_MODES, addAnchorsToLayerObjectsById, applyGraphicStyleToLayerObjectsById, changeLayerObjectNameCaseById, cleanLayerObjectNamesById, cleanUpLayerObjectsById, clearLayerObjectAppearanceById, clearLayerObjectGradientFillById, clearLayerObjectImageFiltersById, clearLayerObjectPatternFillById, detachLayerSymbolInstancesById, expandLayerObjectAppearanceById, expandLayerObjectClippingMasksById, blendLayerObjectsById, flattenLayerObjectTransparencyById, freeDistortLayerObjectsById, grommetLayerObjectsById, groupLayerObjectsById, knifeSplitLayerObjectsById, makeLayerCompoundPathById, moveLayerObjectsById, multiOutlineLayerObjectsById, normalizeLayerBlendMode, offsetLayerObjectsById, outlineLayerObjectStrokesById, puckerLayerObjectsById, roughenLayerObjectsById, zigzagLayerObjectsById, twistLayerObjectsById, normalizeLayerBoolean, normalizeLayerDash, normalizeLayerPaint, normalizeLayerStrokeCap, normalizeLayerStrokeJoin, renumberLayerObjectsById, releaseLayerCompoundPathsById, releaseLayerObjectClippingMasksById, replaceLayerObjectNamesById, rhinestoneLayerObjectsById, reverseLayerObjectsById, roundCornersLayerObjectsById, scissorsSplitLayerObjectsById, selectSameLayerAppearanceById, selectSameLayerAssetById, selectSameLayerComplexAppearanceById, selectSameLayerGeometryById, selectSameLayerObjectById, selectSameLayerProductionById, selectSameLayerTextById, setLayerObjectBlendModeById, setLayerObjectDashById, setLayerObjectGeometryById, setLayerObjectGeometryPairById, setLayerObjectMiterLimitById, setLayerObjectOpacityById, setLayerObjectOverprintById, setLayerObjectPaintById, setLayerObjectPrintMarkKindById, setLayerObjectShadowById, setLayerObjectStrokeStyleById, setLayerObjectStrokeUniformById, setLayerObjectStrokeWidthById, setLayerObjectTextStyleById, simplifyLayerObjectsById, smoothLayerObjectsById, splitLayerObjectsIntoGridById, targetLayerObjectsById, ungroupLayerObjectsById, variableWidthLayerObjectsById, warpLayerObjectsById, type LayerGeometryPairSetTarget, type LayerGeometrySetTarget, type LayerNameCaseMode, type LayerOverprintTarget, type LayerPaintTarget, type LayerStackDestination, type LayerSameAppearanceTarget, type LayerSameAssetTarget, type LayerSameComplexAppearanceTarget, type LayerSameGeometryTarget, type LayerSameObjectTarget, type LayerSameProductionTarget, type LayerSameTextTarget, type LayerStrokeStyleTarget, type LayerTextStyleTarget } from '../lib/layerOps';

interface ObjRow {
  id: string;
  type: string;
  visible: boolean;
  locked: boolean;
  name: string | null;
  thumb: string;
  hash: string;
}

const TYPE_META: Record<string, { icon: typeof Square; label: string }> = {
  rect:            { icon: Square,    label: 'Rect' },
  circle:          { icon: Circle,    label: 'Circle' },
  ellipse:         { icon: Circle,    label: 'Ellipse' },
  line:            { icon: Slash,     label: 'Line' },
  polygon:         { icon: Pentagon,  label: 'Polygon' },
  polyline:        { icon: Spline,    label: 'Polyline' },
  path:            { icon: Spline,    label: 'Path' },
  'i-text':        { icon: TypeIcon,  label: 'Text' },
  text:            { icon: TypeIcon,  label: 'Text' },
  textbox:         { icon: TypeIcon,  label: 'Text' },
  image:           { icon: ImageIcon, label: 'Image' },
  group:           { icon: GroupIcon, label: 'Group' },
  activeselection: { icon: BoxSelect, label: 'Selection' },
};
function metaFor(type: string) {
  return TYPE_META[type] ?? { icon: Shapes, label: type || 'Object' };
}

// Module-scope thumbnail cache keyed by `${id}|${hash}`. We keep this outside
// React state so we don't trigger renders when caching — the row's `hash`
// changes only when the object's shape/position/style actually changes.
const thumbCache: Map<string, string> = new Map();

function hashOf(o: fabric.FabricObject): string {
  return [
    o.type ?? '',
    (o.left ?? 0) | 0,
    (o.top ?? 0) | 0,
    ((o.width ?? 0) * (o.scaleX ?? 1)) | 0,
    ((o.height ?? 0) * (o.scaleY ?? 1)) | 0,
    (o.angle ?? 0) | 0,
    (o.fill as string) ?? '',
    (o.stroke as string) ?? '',
    o.visible === false ? '0' : '1',
  ].join('x');
}

function thumbFor(o: fabric.FabricObject, id: string): string {
  const h = hashOf(o);
  const key = `${id}|${h}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  try {
    const url = o.toDataURL({ multiplier: 0.2, format: 'png' });
    thumbCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

type NameHolder = { name?: string | null };

export function LayersPanel() {
  const t = useT();
  const [rows, setRows] = useState<ObjRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; pos: 'above' | 'below' } | null>(null);
  const [layerQuery, setLayerQuery] = useState('');
  const [reviewedLayerAction, setReviewedLayerAction] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Roving-focus index inside the listbox — null when the panel has never
  // been focused; otherwise the index in the displayed (reversed) `rows`
  // array. We mirror it into `aria-activedescendant` and into the canvas
  // active object so the row highlight and canvas selection stay in lock-
  // step as the user arrows through the list.
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  // Subscribe to selection ids so rows can light up the corresponding row
  // when an object is selected on the canvas — previously the panel only
  // refreshed on `selection:created/updated` but had no per-row indicator,
  // so users had to look at the canvas to know which row matched the
  // current selection.
  const selectionIds = useEditor(s => s.selectionIds);
  const selectedSet = new Set(selectionIds);

  const normalizedLayerQuery = layerQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return rows
      .map((row, index) => {
        const meta = metaFor(row.type);
        const displayName = row.name ?? t(meta.label);
        return { row, index, meta, displayName };
      })
      .filter(({ row, meta, displayName }) => {
        if (!normalizedLayerQuery) return true;
        return [
          displayName,
          row.name ?? '',
          row.type,
          meta.label,
          t(meta.label),
          row.id,
        ].some((value) => value.toLowerCase().includes(normalizedLayerQuery));
      });
  }, [normalizedLayerQuery, rows, t]);
  const focusedFilteredIndex = focusIdx === null ? -1 : filteredRows.findIndex(({ index }) => index === focusIdx);
  const focusedLayer = focusedFilteredIndex >= 0 ? filteredRows[focusedFilteredIndex] : filteredRows[0];
  const layerMatchCounts = useMemo(() => {
    const objects = getCanvas()?.getObjects().slice().reverse() ?? [];
    return filteredRows.reduce((counts, { index }) => {
      const obj = objects[index];
      if (!obj) return counts;
      if (obj.visible !== false && !obj.lockMovementX) counts.selectable += 1;
      if (obj.visible !== false) counts.visible += 1;
      if (obj.visible === false) counts.hidden += 1;
      if (!obj.lockMovementX) counts.unlocked += 1;
      if (obj.lockMovementX || obj.lockMovementY || obj.lockScalingX || obj.lockScalingY || obj.lockRotation) counts.locked += 1;
      if (obj.type === 'group') counts.groups += 1;
      counts.total += 1;
      return counts;
    }, { selectable: 0, visible: 0, hidden: 0, unlocked: 0, locked: 0, groups: 0, total: 0 });
  }, [filteredRows]);

  useEffect(() => {
    const refresh = () => {
      const c = getCanvas(); if (!c) return;
      const objs = c.getObjects().slice().reverse();
      setRows(objs.map((o, i) => {
        const id = (o as { _id?: string })._id ?? `i${i}`;
        const hash = hashOf(o);
        return {
          id,
          type: o.type ?? '',
          visible: o.visible !== false,
          locked: !!(o as fabric.FabricObject).lockMovementX,
          name: (o as NameHolder).name ?? null,
          thumb: thumbFor(o, id),
          hash,
        };
      }));
    };
    refresh();
    const c = getCanvas();
    c?.on('object:added', refresh);
    c?.on('object:removed', refresh);
    c?.on('object:modified', refresh);
    c?.on('selection:created', refresh);
    c?.on('selection:updated', refresh);
    return () => {
      c?.off('object:added', refresh);
      c?.off('object:removed', refresh);
      c?.off('object:modified', refresh);
    };
  }, []);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const getObjs = () => getCanvas()?.getObjects().slice().reverse() ?? [];

  const refreshNow = () => {
    const c = getCanvas(); if (!c) return;
    const objs = c.getObjects().slice().reverse();
    setRows(objs.map((o, i) => {
      const id = (o as { _id?: string })._id ?? `i${i}`;
      const hash = hashOf(o);
      return {
        id,
        type: o.type ?? '',
        visible: o.visible !== false,
        locked: !!(o as fabric.FabricObject).lockMovementX,
        name: (o as NameHolder).name ?? null,
        thumb: thumbFor(o, id),
        hash,
      };
    }));
  };

  const toggleVisible = (i: number) => {
    const o = getObjs()[i]; if (!o) return;
    o.visible = !o.visible;
    getCanvas()?.requestRenderAll();
    pushHistory();
    refreshNow();
  };
  const toggleLock = (i: number) => {
    const o = getObjs()[i]; if (!o) return;
    const lock = !o.lockMovementX;
    o.set({ lockMovementX: lock, lockMovementY: lock, lockScalingX: lock, lockScalingY: lock, lockRotation: lock, hasControls: !lock });
    pushHistory();
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, locked: lock } : r));
  };
  const remove = (i: number) => {
    const c = getCanvas();
    const o = getObjs()[i]; if (!c || !o) return;
    c.remove(o);
    c.requestRenderAll();
    pushHistory();
    refreshNow();
  };
  const duplicate = async (i: number) => {
    const c = getCanvas();
    const o = getObjs()[i];
    if (!c || !o) return;
    const clone = await o.clone();
    clone.set({ left: (o.left ?? 0) + 12, top: (o.top ?? 0) + 12 });
    const sourceName = (o as NameHolder).name;
    if (sourceName) (clone as NameHolder).name = `${sourceName} copy`;
    c.add(clone);
    const sourceCanvasIndex = c.getObjects().indexOf(o);
    if (sourceCanvasIndex >= 0) c.moveObjectTo(clone, sourceCanvasIndex + 1);
    c.setActiveObject(clone);
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(t('Layer duplicated'));
  };
  const select = (i: number) => {
    const o = getObjs()[i]; if (!o) return;
    getCanvas()?.setActiveObject(o);
    getCanvas()?.requestRenderAll();
  };


  const selectVisibleFromPanel = () => {
    const n = selectVisibleObjects();
    if (n) toast.success(`${n} ${t('selected')}`);
    else toast.warn(t('No visible unlocked objects.'));
  };
  const selectUnlockedFromPanel = () => {
    const n = selectUnlockedObjects();
    if (n) toast.success(`${n} ${t('selected')}`);
    else toast.warn(t('No unlocked objects.'));
  };
  const hideOthersFromPanel = () => {
    const n = hideOthers();
    if (n) { toast.success(`${n} ${t('hidden')}`); refreshNow(); }
    else toast.warn(t('Select something first.'));
  };
  const showAllFromPanel = () => {
    const n = showAll();
    if (n) { toast.success(`${n} ${t('revealed')}`); refreshNow(); }
    else toast.warn(t('No hidden objects.'));
  };
  const unlockAllFromPanel = () => {
    const n = unlockAll();
    if (n) { toast.success(`${n} ${t('unlocked')}`); refreshNow(); }
    else toast.warn(t('No locked objects.'));
  };
  const selectLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    const matches = filteredRows
      .map(({ index }) => objs[index])
      .filter((obj): obj is fabric.FabricObject => !!obj && obj.visible !== false && !obj.lockMovementX);
    if (matches.length === 0) {
      toast.warn(t('No visible unlocked matches.'));
      return;
    }
    c.discardActiveObject();
    c.setActiveObject(matches.length === 1 ? matches[0] : new fabric.ActiveSelection(matches, { canvas: c }));
    c.requestRenderAll();
    toast.success(`${matches.length} ${t('selected')}`);
  };
  const targetLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const result = targetLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (result.selected === 0) {
      toast.warn(t('No matching layers.'));
      return;
    }
    refreshNow();
    const details = [
      result.revealed ? `${result.revealed} ${t('revealed')}` : '',
      result.unlocked ? `${result.unlocked} ${t('unlocked')}` : '',
    ].filter(Boolean);
    toast.success(`${result.selected} ${t('targeted')}${details.length ? ` · ${details.join(' · ')}` : ''}`);
  };
  const selectFirstLayerMatchFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    const first = filteredRows.find(({ index }) => {
      const obj = objs[index];
      return !!obj && obj.visible !== false && !obj.lockMovementX;
    });
    if (!first) {
      toast.warn(t('No visible unlocked matches.'));
      return;
    }
    select(first.index);
    setFocusIdx(first.index);
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row-idx="${first.index}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    toast.success(`1 ${t('selected')}`);
  };
  const soloLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    const matches = filteredRows
      .map(({ index }) => objs[index])
      .filter((obj): obj is fabric.FabricObject => !!obj);
    if (matches.length === 0) {
      toast.warn(t('No matching layers.'));
      return;
    }
    const matchSet = new Set(matches);
    let changed = 0;
    for (const obj of objs) {
      const shouldShow = matchSet.has(obj);
      if (obj.visible !== shouldShow) {
        obj.visible = shouldShow;
        changed++;
      }
    }
    if (!changed) {
      toast.warn(t('Matching layers already isolated.'));
      return;
    }
    c.discardActiveObject();
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${matches.length} ${t('matching layers isolated')}`);
  };
  const hideLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    let count = 0;
    for (const { index } of filteredRows) {
      const obj = objs[index];
      if (obj && obj.visible !== false) {
        obj.visible = false;
        count++;
      }
    }
    if (!count) {
      toast.warn(t('No visible matches.'));
      return;
    }
    c.discardActiveObject();
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${count} ${t('hidden')}`);
  };
  const lockLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    let count = 0;
    for (const { index } of filteredRows) {
      const obj = objs[index];
      if (obj && !obj.lockMovementX) {
        obj.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false });
        count++;
      }
    }
    if (!count) {
      toast.warn(t('No unlocked matches.'));
      return;
    }
    c.discardActiveObject();
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${count} ${t('locked')}`);
  };
  const showLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    let count = 0;
    for (const { index } of filteredRows) {
      const obj = objs[index];
      if (obj && obj.visible === false) {
        obj.visible = true;
        count++;
      }
    }
    if (!count) {
      toast.warn(t('No hidden matches.'));
      return;
    }
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${count} ${t('revealed')}`);
  };
  const unlockLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    let count = 0;
    for (const { index } of filteredRows) {
      const obj = objs[index];
      if (obj && (obj.lockMovementX || obj.lockMovementY || obj.lockScalingX || obj.lockScalingY || obj.lockRotation)) {
        obj.set({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false, hasControls: true });
        count++;
      }
    }
    if (!count) {
      toast.warn(t('No locked matches.'));
      return;
    }
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${count} ${t('unlocked')}`);
  };
  const renameLayerMatchesFromPanel = () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    const matches = filteredRows
      .map(({ index }) => objs[index])
      .filter((obj): obj is fabric.FabricObject => !!obj);
    if (matches.length === 0) {
      toast.warn(t('No matching layers.'));
      return;
    }
    const nextName = window.prompt(t('Object name'), normalizedLayerQuery);
    if (nextName == null) return;
    const trimmed = nextName.trim();
    for (const obj of matches) {
      (obj as NameHolder).name = trimmed.length ? trimmed : null;
    }
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${matches.length} ${t('objects renamed')}`);
  };
  const renumberLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const prefix = window.prompt(t('Layer name prefix'), normalizedLayerQuery || t('Layer'));
    if (prefix == null) return;
    const startRaw = window.prompt(t('Start number'), '1');
    if (startRaw == null) return;
    const start = Number(startRaw.trim());
    if (!Number.isFinite(start)) {
      toast.warn(t('Invalid start number.'));
      return;
    }
    const n = renumberLayerObjectsById(filteredRows.map(({ row }) => row.id), { prefix, start });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects renamed')}`);
    } else {
      toast.warn(t('No matching layers.'));
    }
  };
  const replaceLayerMatchNamesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const find = window.prompt(t('Find in layer names'), normalizedLayerQuery);
    if (find == null) return;
    const replace = window.prompt(t('Replace with'), '');
    if (replace == null) return;
    const n = replaceLayerObjectNamesById(filteredRows.map(({ row }) => row.id), { find, replace });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects renamed')}`);
    } else {
      toast.warn(t('No layer names changed.'));
    }
  };
  const changeLayerMatchNameCaseFromPanel = (mode: LayerNameCaseMode) => {
    if (!normalizedLayerQuery) return;
    const n = changeLayerObjectNameCaseById(filteredRows.map(({ row }) => row.id), mode);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects renamed')}`);
    } else {
      toast.warn(t('No layer names changed.'));
    }
  };
  const cleanLayerMatchNamesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = cleanLayerObjectNamesById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects renamed')}`);
    } else {
      toast.warn(t('No layer names changed.'));
    }
  };
  const setLayerMatchOpacityFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer opacity'), '100%');
    if (raw == null) return;
    const trimmed = raw.trim();
    const value = Number(trimmed.replace(/%$/, ''));
    if (!Number.isFinite(value)) {
      toast.warn(t('Invalid opacity.'));
      return;
    }
    const opacity = trimmed.endsWith('%') || value > 1 ? value / 100 : value;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      toast.warn(t('Invalid opacity.'));
      return;
    }
    const n = setLayerObjectOpacityById(filteredRows.map(({ row }) => row.id), { opacity });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('opacity updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchBlendModeFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer blend mode'), LAYER_BLEND_MODES.join(', '));
    if (raw == null) return;
    const blendMode = normalizeLayerBlendMode(raw);
    if (!blendMode) {
      toast.warn(t('Invalid blend mode.'));
      return;
    }
    const n = setLayerObjectBlendModeById(filteredRows.map(({ row }) => row.id), { blendMode });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('blend modes updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchPaintFromPanel = (target: LayerPaintTarget) => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(target === 'fill' ? t('Set matching layer fill') : t('Set matching layer stroke'), target === 'fill' ? '#3d9bff' : '#111827');
    if (raw == null) return;
    const paint = normalizeLayerPaint(raw);
    if (paint == null) {
      toast.warn(t('Invalid color.'));
      return;
    }
    const n = setLayerObjectPaintById(filteredRows.map(({ row }) => row.id), { target, paint });
    if (n) {
      refreshNow();
      toast.success(`${n} ${target === 'fill' ? t('fills updated') : t('strokes updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchStrokeWidthFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer stroke width'), '1');
    if (raw == null) return;
    const value = Number(raw.trim().replace(/px$/i, ''));
    if (!Number.isFinite(value) || value < 0) {
      toast.warn(t('Invalid stroke width.'));
      return;
    }
    const n = setLayerObjectStrokeWidthById(filteredRows.map(({ row }) => row.id), { strokeWidth: value });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('stroke widths updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchStrokeStyleFromPanel = (target: LayerStrokeStyleTarget) => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(target === 'cap' ? t('Set matching layer line cap') : t('Set matching layer line join'), target === 'cap' ? 'butt, round, square' : 'miter, round, bevel');
    if (raw == null) return;
    const value = target === 'cap' ? normalizeLayerStrokeCap(raw) : normalizeLayerStrokeJoin(raw);
    if (!value) {
      toast.warn(target === 'cap' ? t('Invalid line cap.') : t('Invalid line join.'));
      return;
    }
    const n = setLayerObjectStrokeStyleById(filteredRows.map(({ row }) => row.id), { target, value });
    if (n) {
      refreshNow();
      toast.success(`${n} ${target === 'cap' ? t('line caps updated') : t('line joins updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchDashFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer dash'), 'solid, dashed, dotted, or 10 5');
    if (raw == null) return;
    const dash = normalizeLayerDash(raw);
    if (!dash) {
      toast.warn(t('Invalid dash pattern.'));
      return;
    }
    const n = setLayerObjectDashById(filteredRows.map(({ row }) => row.id), { dash });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('dash patterns updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchMiterLimitFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer miter limit'), '4');
    if (raw == null) return;
    const value = Number(raw.trim());
    if (!Number.isFinite(value) || value < 0) {
      toast.warn(t('Invalid miter limit.'));
      return;
    }
    const n = setLayerObjectMiterLimitById(filteredRows.map(({ row }) => row.id), { miterLimit: value });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('miter limits updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const setLayerMatchShadowFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const ids = filteredRows.map(({ row }) => row.id);
    const raw = window.prompt(t('Set matching layer shadow'), '#000000 8 4 4, or none');
    if (raw == null) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'none') {
      const n = setLayerObjectShadowById(ids, { color: null });
      if (n) {
        refreshNow();
        toast.success(`${n} ${t('shadows updated')}`);
      } else {
        toast.warn(t('No matching layers changed.'));
      }
      return;
    }
    const [color, blurRaw = '0', offsetXRaw = '0', offsetYRaw = '0'] = trimmed.split(/\s+/);
    const blur = Number(blurRaw);
    const offsetX = Number(offsetXRaw);
    const offsetY = Number(offsetYRaw);
    if (!color || !Number.isFinite(blur) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      toast.warn(t('Invalid shadow value.'));
      return;
    }
    const n = setLayerObjectShadowById(ids, { color, blur, offsetX, offsetY });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('shadows updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const setLayerMatchOverprintFromPanel = (target: LayerOverprintTarget) => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer overprint'), 'on/off');
    if (raw == null) return;
    const overprint = normalizeLayerBoolean(raw);
    if (overprint == null) {
      toast.warn(t('Invalid overprint value.'));
      return;
    }
    const n = setLayerObjectOverprintById(filteredRows.map(({ row }) => row.id), { target, overprint });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('overprint flags updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchPrintMarkKindFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching layer print mark kind'), 'crop, registration, bleed, page-info, or none');
    if (raw == null) return;
    const trimmed = raw.trim();
    const printMarkKind = /^(none|clear|off)$/i.test(trimmed) ? null : trimmed;
    const n = setLayerObjectPrintMarkKindById(filteredRows.map(({ row }) => row.id), { printMarkKind });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('print mark kinds updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchTextStyleFromPanel = (target: LayerTextStyleTarget) => {
    if (!normalizedLayerQuery) return;
    const defaults: Record<LayerTextStyleTarget, string> = {
      fontFamily: 'Inter',
      fontSize: '16',
      fontWeight: '400',
      fontStyle: 'normal',
      textAlign: 'left, center, right, justify',
      underline: 'on/off',
      linethrough: 'on/off',
      overline: 'on/off',
      charSpacing: '0',
      lineHeight: '1.2',
    };
    const raw = window.prompt(t('Set matching layer text style'), defaults[target]);
    if (raw == null) return;
    const value = target === 'fontFamily' || target === 'fontWeight' || target === 'fontStyle' || target === 'textAlign' || target === 'underline' || target === 'linethrough' || target === 'overline'
      ? raw.trim()
      : Number(raw.trim().replace(/px$/i, ''));
    if ((typeof value === 'string' && !value) || (typeof value === 'number' && !Number.isFinite(value))) {
      toast.warn(t('Invalid text style.'));
      return;
    }
    const n = setLayerObjectTextStyleById(filteredRows.map(({ row }) => row.id), { target, value });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('text styles updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchGeometryFromPanel = (target: LayerGeometrySetTarget) => {
    if (!normalizedLayerQuery) return;
    const defaults: Record<LayerGeometrySetTarget, string> = {
      x: '0',
      y: '0',
      centerX: '0',
      centerY: '0',
      right: '100',
      bottom: '100',
      width: '100',
      height: '100',
      rotation: '0',
      scaleX: '1',
      scaleY: '1',
      skewX: '0',
      skewY: '0',
    };
    const raw = window.prompt(t('Set matching layer geometry'), defaults[target]);
    if (raw == null) return;
    const value = Number(raw.trim().replace(/(?:px|°|deg)$/i, ''));
    if (!Number.isFinite(value) || ((target === 'width' || target === 'height' || target === 'scaleX' || target === 'scaleY') && value <= 0)) {
      toast.warn(t('Invalid geometry value.'));
      return;
    }
    const n = setLayerObjectGeometryById(filteredRows.map(({ row }) => row.id), { target, value });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('geometry updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchGeometryPairFromPanel = (target: LayerGeometryPairSetTarget) => {
    if (!normalizedLayerQuery) return;
    const defaults: Record<LayerGeometryPairSetTarget, string> = {
      position: '0, 0',
      center: '0, 0',
      size: '100, 100',
      scale: '1, 1',
      skew: '0, 0',
      bounds: '0, 0, 100, 100',
    };
    const raw = window.prompt(t('Set matching layer geometry'), defaults[target]);
    if (raw == null) return;
    const values = raw.trim().replace(/(?:px|°|deg)/gi, '').split(/[\s,]+/).map(Number);
    const valid = values.every(Number.isFinite)
      && ((target === 'bounds' && values.length >= 4 && values[2] > values[0] && values[3] > values[1])
        || (target !== 'bounds' && values.length >= 2 && (!(target === 'size' || target === 'scale') || (values[0] > 0 && values[1] > 0))));
    if (!valid) {
      toast.warn(t('Invalid geometry value.'));
      return;
    }
    const n = setLayerObjectGeometryPairById(filteredRows.map(({ row }) => row.id), { target, values });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('geometry updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };







  const selectSameLayerComplexAppearanceFromPanel = (target: LayerSameComplexAppearanceTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerComplexAppearanceById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
















  const grommetLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Grommet inset spacing and diameter'), '20, 500, 10');
    if (raw == null) return;
    const values = raw.split(/[\s,;/]+/).map(Number).filter(Number.isFinite);
    const insetMm = values[0];
    const maxSpacingMm = values[1] ?? 500;
    const diameterMm = values[2] ?? 10;
    if (!Number.isFinite(insetMm) || !Number.isFinite(maxSpacingMm) || !Number.isFinite(diameterMm) || insetMm < 0 || maxSpacingMm <= 0 || diameterMm <= 0) {
      toast.warn(t('Invalid grommet values.'));
      return;
    }
    const paths = grommetLayerObjectsById(filteredRows.map(({ row }) => row.id), { insetMm, maxSpacingMm, diameterMm });
    if (paths.length) {
      const editor = useEditor.getState();
      editor.addCutPaths(paths);
      editor.setCutPathsVisible(true);
      refreshNow();
      toast.success(`${paths.length} ${t('grommets added')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const rhinestoneLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Rhinestone spacing and diameter'), '4, 2.8');
    if (raw == null) return;
    const values = raw.split(/[\s,;/]+/).map(Number).filter(Number.isFinite);
    const spacingMm = values[0];
    const diameterMm = values[1] ?? 2.8;
    if (!Number.isFinite(spacingMm) || !Number.isFinite(diameterMm) || spacingMm <= 0 || diameterMm <= 0) {
      toast.warn(t('Invalid rhinestone values.'));
      return;
    }
    const paths = rhinestoneLayerObjectsById(filteredRows.map(({ row }) => row.id), { spacingMm, diameterMm });
    if (paths.length) {
      const editor = useEditor.getState();
      editor.addCutPaths(paths);
      editor.setCutPathsVisible(true);
      refreshNow();
      toast.success(`${paths.length} ${t('stones placed')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const blendLayerMatchesFromPanel = async () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Blend steps and options'), '5 steps page');
    if (raw == null) return;
    const parts = raw.trim().split(/[\s,;/]+/).filter(Boolean);
    const steps = Number(parts[0]);
    const spacingToken = (parts[1] ?? 'steps').toLowerCase();
    const orientationToken = (parts[2] ?? 'page').toLowerCase();
    const spacingMode = spacingToken === 'distance' ? 'specifiedDistance' : spacingToken === 'smooth' || spacingToken === 'smoothcolor' ? 'smoothColor' : spacingToken === 'steps' ? 'specifiedSteps' : null;
    const orientation = orientationToken === 'path' ? 'path' : orientationToken === 'page' ? 'page' : null;
    if (!Number.isFinite(steps) || steps < 1 || !spacingMode || !orientation) {
      toast.warn(t('Invalid blend values.'));
      return;
    }
    const n = await blendLayerObjectsById(filteredRows.map(({ row }) => row.id), { steps: Math.round(steps), spacingMode, orientation });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('blend steps created')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const variableWidthLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Variable Width profile'), 'bulge');
    if (raw == null) return;
    const profileMap: Record<string, 'uniform' | 'taper-start' | 'taper-end' | 'taper-both' | 'bulge' | 'hourglass'> = {
      uniform: 'uniform',
      'taper-start': 'taper-start',
      'taper start': 'taper-start',
      start: 'taper-start',
      'taper-end': 'taper-end',
      'taper end': 'taper-end',
      end: 'taper-end',
      'taper-both': 'taper-both',
      'taper both': 'taper-both',
      both: 'taper-both',
      bulge: 'bulge',
      hourglass: 'hourglass',
    };
    const profile = profileMap[raw.trim().toLowerCase().replace(/[_]+/g, '-')];
    if (!profile) {
      toast.warn(t('Invalid variable width profile.'));
      return;
    }
    const n = variableWidthLayerObjectsById(filteredRows.map(({ row }) => row.id), { profile });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('width profiles applied')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const multiOutlineLayerMatchesFromPanel = async () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Multi-outline width and colors'), '2, #ffffff, #000000');
    if (raw == null) return;
    const parts = raw.split(/[\s,;/]+/).map((part) => part.trim()).filter(Boolean);
    const widthMm = Number(parts[0]?.replace(/mm$/i, ''));
    const colors = parts.slice(1).filter((color) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) || /^(?:rgb|rgba|hsl|hsla)\(/i.test(color));
    if (!Number.isFinite(widthMm) || widthMm <= 0 || colors.length === 0) {
      toast.warn(t('Invalid multi-outline values.'));
      return;
    }
    const n = await multiOutlineLayerObjectsById(filteredRows.map(({ row }) => row.id), { colors, widthMm });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('outline(s) added')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const warpLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Warp bend and style'), '50 arc');
    if (raw == null) return;
    const parts = raw.trim().split(/[\s,;/]+/).filter(Boolean);
    const bendPct = Number(parts[0]?.replace(/%$/i, ''));
    const style = (parts[1] ?? 'arc').toLowerCase();
    if (!Number.isFinite(bendPct) || bendPct === 0 || !['arc', 'rise', 'flag', 'wave'].includes(style)) {
      toast.warn(t('Invalid warp values.'));
      return;
    }
    const n = warpLayerObjectsById(filteredRows.map(({ row }) => row.id), { bendPct, style: style as 'arc' | 'rise' | 'flag' | 'wave' });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects warped')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const freeDistortLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Free Distort preset or offsets'), 'left perspective');
    if (raw == null) return;
    const normalized = raw.trim().toLowerCase().replace(/[-_]+/g, ' ');
    const presets: Record<string, FreeDistortCorners> = {
      left: { tl: [18, -16], tr: [0, 0], br: [0, 0], bl: [18, 16] },
      'left perspective': { tl: [18, -16], tr: [0, 0], br: [0, 0], bl: [18, 16] },
      right: { tl: [0, 0], tr: [-18, -16], br: [-18, 16], bl: [0, 0] },
      'right perspective': { tl: [0, 0], tr: [-18, -16], br: [-18, 16], bl: [0, 0] },
      skew: { tl: [12, 0], tr: [12, 0], br: [-12, 0], bl: [-12, 0] },
      'top taper': { tl: [14, 8], tr: [-14, 8], br: [0, 0], bl: [0, 0] },
      'bottom taper': { tl: [0, 0], tr: [0, 0], br: [-14, -8], bl: [14, -8] },
      flag: { tl: [0, -10], tr: [10, 6], br: [0, 10], bl: [-10, -6] },
      'flag wave': { tl: [0, -10], tr: [10, 6], br: [0, 10], bl: [-10, -6] },
    };
    const values = normalized.split(/[\s,;/]+/).map(Number).filter(Number.isFinite);
    const offsets = presets[normalized] ?? (values.length >= 8
      ? { tl: [values[0] * 3.7795, values[1] * 3.7795], tr: [values[2] * 3.7795, values[3] * 3.7795], br: [values[4] * 3.7795, values[5] * 3.7795], bl: [values[6] * 3.7795, values[7] * 3.7795] } as FreeDistortCorners
      : null);
    if (!offsets) {
      toast.warn(t('Invalid free distort values.'));
      return;
    }
    const n = freeDistortLayerObjectsById(filteredRows.map(({ row }) => row.id), { offsets });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects free-distorted')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const roundCornersLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Round Corners radius'), '2');
    if (raw == null) return;
    const radiusMm = Number(raw.trim().replace(/mm$/i, ''));
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) {
      toast.warn(t('Invalid round corners radius.'));
      return;
    }
    const n = roundCornersLayerObjectsById(filteredRows.map(({ row }) => row.id), { radiusMm });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects rounded')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const twistLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Twist angle'), '45');
    if (raw == null) return;
    const angleDeg = Number(raw.trim().replace(/°$/u, ''));
    if (!Number.isFinite(angleDeg) || angleDeg === 0) {
      toast.warn(t('Invalid twist angle.'));
      return;
    }
    const n = twistLayerObjectsById(filteredRows.map(({ row }) => row.id), { angleDeg });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects twisted')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const zigzagLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Zig Zag size ridges and style'), '1, 8, corner');
    if (raw == null) return;
    const parts = raw.split(/[\s,;/]+/).map((part) => part.trim()).filter(Boolean);
    const sizeMm = Number(parts[0]);
    const ridges = Number(parts[1] ?? 8);
    const style = (parts[2] ?? 'corner').toLowerCase();
    const smooth = /^(smooth|sine|wave|wavy)$/i.test(style);
    const corner = /^(corner|sharp|zigzag|zig-zag)$/i.test(style);
    if (!Number.isFinite(sizeMm) || !Number.isFinite(ridges) || sizeMm <= 0 || ridges < 1 || (!smooth && !corner)) {
      toast.warn(t('Invalid zig zag values.'));
      return;
    }
    const n = zigzagLayerObjectsById(filteredRows.map(({ row }) => row.id), { sizeMm, ridges, smooth });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects zig-zagged')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const roughenLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Roughen size and detail'), '1, 2');
    if (raw == null) return;
    const values = raw.split(/[\s,;/]+/).map(Number).filter(Number.isFinite);
    const sizeMm = values[0];
    const detailMm = values[1] ?? 2;
    if (!Number.isFinite(sizeMm) || !Number.isFinite(detailMm) || sizeMm <= 0 || detailMm <= 0) {
      toast.warn(t('Invalid roughen values.'));
      return;
    }
    const n = roughenLayerObjectsById(filteredRows.map(({ row }) => row.id), { sizeMm, detailMm });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects roughened')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const puckerLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching Pucker & Bloat amount'), '25%');
    if (raw == null) return;
    const trimmed = raw.trim();
    const value = Number(trimmed.replace(/%$/i, ''));
    const amount = trimmed.endsWith('%') || Math.abs(value) > 1 ? value / 100 : value;
    if (!Number.isFinite(amount) || amount < -1 || amount > 1 || amount === 0) {
      toast.warn(t('Invalid pucker value.'));
      return;
    }
    const n = puckerLayerObjectsById(filteredRows.map(({ row }) => row.id), { amount });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects puckered')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const knifeSplitLayerMatchesFromPanel = (axis: 'horizontal' | 'vertical') => {
    if (!normalizedLayerQuery) return;
    const n = knifeSplitLayerObjectsById(filteredRows.map(({ row }) => row.id), axis);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('objects knife-split')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const scissorsSplitLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = scissorsSplitLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('paths split')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const splitLayerMatchesIntoGridFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Split matching layer objects into grid'), '2 2 0');
    if (raw == null) return;
    const values = raw.trim().split(/[\s,×x]+/).map(Number).filter(Number.isFinite);
    const [rows, cols, gutterMm = 0] = values;
    if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1 || !Number.isFinite(gutterMm) || gutterMm < 0) {
      toast.warn(t('Invalid split grid value.'));
      return;
    }
    const n = splitLayerObjectsIntoGridById(filteredRows.map(({ row }) => row.id), { rows, cols, gutterMm });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('cells created')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const cleanUpLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = cleanUpLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('stray objects removed')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const addAnchorsToLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = addAnchorsToLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('paths subdivided')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const reverseLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = reverseLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('paths reversed')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const simplifyLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Simplify matching layer paths (px tolerance)'), '1.5');
    if (raw == null) return;
    const tolerancePx = Number(raw.trim().replace(/px$/i, ''));
    if (!Number.isFinite(tolerancePx) || tolerancePx < 0.1) {
      toast.warn(t('Invalid simplify value.'));
      return;
    }
    const n = simplifyLayerObjectsById(filteredRows.map(({ row }) => row.id), { tolerancePx });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('paths simplified')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const smoothLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Smooth matching layer paths'), '1');
    if (raw == null) return;
    const iterations = Number(raw.trim());
    if (!Number.isFinite(iterations) || iterations < 1 || iterations > 5) {
      toast.warn(t('Invalid smooth value.'));
      return;
    }
    const n = smoothLayerObjectsById(filteredRows.map(({ row }) => row.id), { iterations });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('paths smoothed')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const offsetLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Offset matching layer paths (mm)'), '2');
    if (raw == null) return;
    const offsetMm = Number(raw.trim().replace(/mm$/i, ''));
    if (!Number.isFinite(offsetMm) || offsetMm === 0) {
      toast.warn(t('Invalid offset value.'));
      return;
    }
    const n = offsetLayerObjectsById(filteredRows.map(({ row }) => row.id), { offsetMm });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('offset paths added')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const outlineLayerMatchStrokesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = outlineLayerObjectStrokesById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('strokes outlined')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const makeLayerMatchCompoundPathFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = makeLayerCompoundPathById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('compound paths made')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const releaseLayerMatchCompoundPathsFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = releaseLayerCompoundPathsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('compound paths released')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const expandLayerMatchClippingMasksFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = expandLayerObjectClippingMasksById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('clip masks expanded')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const releaseLayerMatchClippingMasksFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = releaseLayerObjectClippingMasksById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('clipping masks released')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const selectSameLayerTextFromPanel = (target: LayerSameTextTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerTextById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const detachLayerMatchSymbolsFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = detachLayerSymbolInstancesById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('symbol instances detached')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const selectSameLayerAssetFromPanel = (target: LayerSameAssetTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerAssetById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };


  const clearLayerMatchComplexAppearanceFromPanel = (target: 'gradientFill' | 'pattern') => {
    if (!normalizedLayerQuery) return;
    const ids = filteredRows.map(({ row }) => row.id);
    const n = target === 'gradientFill' ? clearLayerObjectGradientFillById(ids) : clearLayerObjectPatternFillById(ids);
    if (n) {
      refreshNow();
      toast.success(`${n} ${target === 'gradientFill' ? t('gradient fills cleared') : t('pattern fills cleared')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const clearLayerMatchImageFiltersFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = clearLayerObjectImageFiltersById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('image filters cleared')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const selectSameLayerProductionFromPanel = (target: LayerSameProductionTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerProductionById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const selectSameLayerGeometryFromPanel = (target: LayerSameGeometryTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerGeometryById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const selectSameLayerObjectFromPanel = (target: LayerSameObjectTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerObjectById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const selectSameLayerAppearanceFromPanel = (target: LayerSameAppearanceTarget) => {
    if (!normalizedLayerQuery) return;
    const n = selectSameLayerAppearanceById(filteredRows.map(({ row }) => row.id), target);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('selected')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };


  const expandLayerMatchAppearanceFromPanel = async () => {
    if (!normalizedLayerQuery) return;
    const n = await expandLayerObjectAppearanceById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('appearances expanded')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const flattenLayerMatchTransparencyFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = flattenLayerObjectTransparencyById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('transparencies flattened')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };

  const applyGraphicStyleToLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const styles = loadGraphicStyles();
    if (styles.length === 0) {
      toast.warn(t('No graphic styles available.'));
      return;
    }
    const raw = window.prompt(
      t('Apply graphic style to matching layers'),
      styles.map((style, index) => `${index + 1}. ${style.name}`).join(' · '),
    );
    if (raw == null) return;
    const query = raw.trim().toLowerCase();
    const numericIndex = Number.parseInt(query, 10);
    const style = Number.isFinite(numericIndex) && String(numericIndex) === query
      ? styles[numericIndex - 1]
      : styles.find((item) => item.id.toLowerCase() === query || item.name.toLowerCase() === query);
    if (!style) {
      toast.warn(t('Graphic style not found.'));
      return;
    }
    const n = applyGraphicStyleToLayerObjectsById(filteredRows.map(({ row }) => row.id), style);
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('graphic styles applied')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const clearLayerMatchAppearanceFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = clearLayerObjectAppearanceById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('appearances cleared')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const setLayerMatchStrokeUniformFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const raw = window.prompt(t('Set matching constant stroke width'), 'on/off');
    if (raw == null) return;
    const strokeUniform = normalizeLayerBoolean(raw);
    if (strokeUniform == null) {
      toast.warn(t('Invalid on/off value.'));
      return;
    }
    const n = setLayerObjectStrokeUniformById(filteredRows.map(({ row }) => row.id), { strokeUniform });
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('constant stroke widths updated')}`);
    } else {
      toast.warn(t('No matching layers changed.'));
    }
  };
  const duplicateLayerMatchesFromPanel = async () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    const matches = filteredRows
      .map(({ index }) => objs[index])
      .filter((obj): obj is fabric.FabricObject => !!obj);
    if (matches.length === 0) {
      toast.warn(t('No matching layers.'));
      return;
    }
    const clones: fabric.FabricObject[] = [];
    for (const obj of matches) {
      const clone = await obj.clone();
      clone.set({ left: (obj.left ?? 0) + 12, top: (obj.top ?? 0) + 12 });
      const sourceName = (obj as NameHolder).name;
      if (sourceName) (clone as NameHolder).name = `${sourceName} copy`;
      c.add(clone);
      const sourceCanvasIndex = c.getObjects().indexOf(obj);
      if (sourceCanvasIndex >= 0) c.moveObjectTo(clone, sourceCanvasIndex + 1);
      clones.push(clone);
    }
    c.discardActiveObject();
    if (clones.length === 1) c.setActiveObject(clones[0]);
    else c.setActiveObject(new fabric.ActiveSelection(clones, { canvas: c }));
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${clones.length} ${t('duplicated')}`);
  };
  const deleteLayerMatchesFromPanel = async () => {
    const c = getCanvas();
    if (!c || !normalizedLayerQuery) return;
    const objs = getObjs();
    const matches = filteredRows
      .map(({ index }) => objs[index])
      .filter((obj): obj is fabric.FabricObject => !!obj);
    if (matches.length === 0) {
      toast.warn(t('No matching layers.'));
      return;
    }
    const ok = await showConfirm({
      title: t('Delete matching layers?'),
      message: `${t('Delete')} ${matches.length} ${t('matching layers')}?`,
      confirmLabel: t('Delete Matches'),
      danger: true,
    });
    if (!ok) return;
    c.discardActiveObject();
    for (const obj of matches) c.remove(obj);
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    toast.success(`${matches.length} ${t('deleted')}`);
  };
  const moveLayerMatchesStackFromPanel = (destination: LayerStackDestination) => {
    if (!normalizedLayerQuery) return;
    const ids = filteredRows.map(({ row }) => row.id);
    const n = moveLayerObjectsById(ids, destination);
    if (n) {
      refreshNow();
      const label = destination === 'front'
        ? t('moved to front')
        : destination === 'back'
          ? t('moved to back')
          : destination === 'forward'
            ? t('moved forward')
            : destination === 'backward'
              ? t('moved backward')
              : t('reversed');
      toast.success(`${n} ${label}`);
    } else {
      toast.warn(t('No matching layers.'));
    }
  };
  const groupLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = groupLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('grouped')}`);
    } else {
      toast.warn(t('Select at least two matching layers.'));
    }
  };
  const ungroupLayerMatchesFromPanel = () => {
    if (!normalizedLayerQuery) return;
    const n = ungroupLayerObjectsById(filteredRows.map(({ row }) => row.id));
    if (n) {
      refreshNow();
      toast.success(`${n} ${t('groups ungrouped')}`);
    } else {
      toast.warn(t('No matching groups.'));
    }
  };

  // ---------- Keyboard navigation (Up/Down/Home/End/F2/Enter/Delete/Ctrl+D/V/L)
  // The container is `role="listbox"` with `aria-activedescendant`; we keep
  // tabIndex 0 on the listbox itself so the rest of the keyboard handlers in
  // the app (the global ones in App.tsx) still see focus there, not on the
  // rows. Arrow events stop propagation so they don't double-fire the global
  // arrow-nudge handler.
  const moveFocus = (next: number) => {
    if (!filteredRows.length) return;
    const clamped = Math.max(0, Math.min(filteredRows.length - 1, next));
    const rowIndex = filteredRows[clamped]?.index;
    if (rowIndex === undefined) return;
    setFocusIdx(rowIndex);
    select(rowIndex);
    // Bring the row into view if it scrolled off — `aria-activedescendant`
    // doesn't automatically scroll the way real DOM focus does.
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-row-idx="${rowIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  };
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingId) return; // rename input owns the keys while editing
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moveFocus((focusedFilteredIndex >= 0 ? focusedFilteredIndex : -1) + 1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); e.stopPropagation(); moveFocus((focusedFilteredIndex >= 0 ? focusedFilteredIndex : filteredRows.length) - 1); return; }
    if (e.key === 'Home')      { e.preventDefault(); e.stopPropagation(); moveFocus(0); return; }
    if (e.key === 'End')       { e.preventDefault(); e.stopPropagation(); moveFocus(filteredRows.length - 1); return; }
    if (focusIdx === null || focusedFilteredIndex === -1) return;
    const r = rows[focusIdx]; if (!r) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault(); e.stopPropagation();
      void duplicate(focusIdx);
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault(); e.stopPropagation();
      toggleVisible(focusIdx);
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'l') {
      e.preventDefault(); e.stopPropagation();
      toggleLock(focusIdx);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      remove(focusIdx);
      return;
    }
    if (e.key === 'F2' || (e.key === 'Enter' && !e.nativeEvent.isComposing)) {
      e.preventDefault(); e.stopPropagation();
      beginEdit(r.id, r.name ?? '');
    }
  };

  // ---------- Renaming
  const beginEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingValue(currentName);
  };
  const commitEdit = () => {
    if (!editingId) return;
    const idx = rows.findIndex(r => r.id === editingId);
    if (idx === -1) { setEditingId(null); return; }
    const o = getObjs()[idx];
    if (o) {
      const trimmed = editingValue.trim();
      (o as NameHolder).name = trimmed.length ? trimmed : null;
      pushHistory();
      refreshNow();
    }
    setEditingId(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const handleActionToolbarKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-layer-action]')).filter((button) => !button.disabled);
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const currentIndex = activeIndex >= 0 ? activeIndex : event.key === 'ArrowLeft' ? 0 : -1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    const nextButton = buttons[nextIndex];
    setReviewedLayerAction(nextButton?.dataset.layerActionReview ?? nextButton?.textContent?.trim() ?? '');
    nextButton?.focus();
  };

  // ---------- Drag reorder
  // List row index N corresponds to canvas object index (objects.length - 1 - N),
  // because we display the reversed array (topmost on top).
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers require some data to fire `drop`.
    try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
  };
  const onDragOver = (e: React.DragEvent, id: string) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const pos: 'above' | 'below' = e.clientY < midpoint ? 'above' : 'below';
    setDropAt(prev => (prev && prev.id === id && prev.pos === pos) ? prev : { id, pos });
  };
  const onDragLeave = (e: React.DragEvent, id: string) => {
    // Only clear if we actually leave the row (not just enter a child).
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDropAt(prev => (prev && prev.id === id) ? null : prev);
  };
  const finishDrag = () => {
    setDragId(null);
    setDropAt(null);
  };
  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragId;
    const drop = dropAt;
    if (!sourceId || sourceId === targetId) { finishDrag(); return; }
    const c = getCanvas(); if (!c) { finishDrag(); return; }

    const rowsSnapshot = rows;
    const fromRow = rowsSnapshot.findIndex(r => r.id === sourceId);
    const toRow = rowsSnapshot.findIndex(r => r.id === targetId);
    if (fromRow === -1 || toRow === -1) { finishDrag(); return; }

    // Compute the target row index in the displayed (reversed) list.
    let displayDest = toRow + (drop?.pos === 'below' ? 1 : 0);
    // If we're moving downward in the displayed list, account for the row
    // being lifted out (which shifts subsequent indices up by one).
    if (fromRow < displayDest) displayDest -= 1;

    const total = rowsSnapshot.length;
    // Convert displayed-index -> canvas-index. The displayed list is reversed,
    // so display row 0 == canvas index (total - 1). Inserting at display
    // position P means landing at canvas index (total - 1 - P) for the moved
    // object's final resting place.
    const canvasIndex = Math.max(0, Math.min(total - 1, total - 1 - displayDest));

    const objs = c.getObjects();
    const draggedObj = objs.find(o => ((o as { _id?: string })._id ?? '') === sourceId);
    if (!draggedObj) { finishDrag(); return; }

    c.moveObjectTo(draggedObj, canvasIndex);
    c.requestRenderAll();
    pushHistory();
    refreshNow();
    finishDrag();
  };

  return (
    <div className="panel-section">
      <div className="panel-header"><h3 className="contents">{t('Layers')}</h3><span className="panel-count">{rows.length}</span></div>
      <div
        className="px-2 pb-2 flex flex-wrap gap-1"
        role="toolbar"
        aria-label={t('Layer quick actions')}
        aria-describedby="layer-action-review-status"
        title={t('Use arrow keys to review layer actions')}
        onKeyDown={handleActionToolbarKeys}
      >
        <span id="layer-action-review-status" className="sr-only" aria-live="polite">
          {`${t('Reviewing')} ${reviewedLayerAction || t('Layer quick actions')}`}
        </span>
        <button type="button" data-layer-action data-layer-action-review={t('Select Visible Objects')} className="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" onFocus={() => setReviewedLayerAction(t('Select Visible Objects'))} onClick={selectVisibleFromPanel} title={t('Select Visible Objects')}>
          <MousePointerClick size={11} aria-hidden="true" />{t('Visible')}
        </button>
        <button type="button" data-layer-action data-layer-action-review={t('Select Unlocked Objects')} className="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" onFocus={() => setReviewedLayerAction(t('Select Unlocked Objects'))} onClick={selectUnlockedFromPanel} title={t('Select Unlocked Objects')}>
          <Unlock size={11} aria-hidden="true" />{t('Unlocked')}
        </button>
        <button type="button" data-layer-action data-layer-action-review={t('Hide Others')} className="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" onFocus={() => setReviewedLayerAction(t('Hide Others'))} onClick={hideOthersFromPanel} title={t('Hide Others')}>
          <EyeOff size={11} aria-hidden="true" />{t('Others')}
        </button>
        <button type="button" data-layer-action data-layer-action-review={t('Show All')} className="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" onFocus={() => setReviewedLayerAction(t('Show All'))} onClick={showAllFromPanel} title={t('Show All')}>
          <EyeIcon size={11} aria-hidden="true" />{t('Show All')}
        </button>
        <button type="button" data-layer-action data-layer-action-review={t('Unlock All')} className="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" onFocus={() => setReviewedLayerAction(t('Unlock All'))} onClick={unlockAllFromPanel} title={t('Unlock All')}>
          <Unlock size={11} aria-hidden="true" />{t('Unlock All')}
        </button>
      </div>
      {rows.length > 0 && (
        <div className="px-2 pb-2 flex items-center gap-1.5">
          <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
          <input
            type="search"
            className="input !py-1 !px-2 text-xs min-w-0 flex-1"
            placeholder={t('Search layers…')}
            value={layerQuery}
            onChange={(event) => setLayerQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && filteredRows.length > 0) {
                event.preventDefault();
                selectFirstLayerMatchFromPanel();
                return;
              }
              if (event.key === 'ArrowDown' && filteredRows.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                moveFocus(0);
                listRef.current?.focus();
                return;
              }
              if (event.key === 'Escape' && layerQuery) {
                event.preventDefault();
                event.stopPropagation();
                setLayerQuery('');
              }
            }}
            aria-label={t('Search layers…')}
            title={`${t('Press Enter to select first search result')} · ${t('Press Arrow Down to focus first layer')}`}
          />
          <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
            {normalizedLayerQuery ? `${filteredRows.length} / ${rows.length} ${t('matches')}` : `${rows.length} ${t('objects')}`}
          </span>
          {layerQuery && (
            <div
              className="contents"
              role="toolbar"
              aria-label={t('Layer search actions')}
              aria-describedby="layer-action-review-status"
              title={t('Use arrow keys to review layer actions')}
              onKeyDown={handleActionToolbarKeys}
            >
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select first visible unlocked layer match')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={selectFirstLayerMatchFromPanel}
                onFocus={() => setReviewedLayerAction(t('Select first visible unlocked layer match'))}
                disabled={layerMatchCounts.selectable === 0}
                title={t('Select first visible unlocked layer match')}
              >
                {t('Select First')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select matching visible unlocked layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={selectLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Select matching visible unlocked layers'))}
                disabled={layerMatchCounts.selectable === 0}
                title={t('Select matching visible unlocked layers')}
              >
                {t('Select Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Target matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={targetLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Target matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Show, unlock, and select matching layers')}
              >
                {t('Target Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Solo matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={soloLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Solo matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Show only matching layers')}
              >
                {t('Solo Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Hide matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={hideLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Hide matching layers'))}
                disabled={layerMatchCounts.visible === 0}
                title={t('Hide matching layers')}
              >
                {t('Hide Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Lock matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={lockLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Lock matching layers'))}
                disabled={layerMatchCounts.unlocked === 0}
                title={t('Lock matching layers')}
              >
                {t('Lock Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Show matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={showLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Show matching layers'))}
                disabled={layerMatchCounts.hidden === 0}
                title={t('Show matching layers')}
              >
                {t('Show Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Unlock matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={unlockLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Unlock matching layers'))}
                disabled={layerMatchCounts.locked === 0}
                title={t('Unlock matching layers')}
              >
                {t('Unlock Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Rename matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={renameLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Rename matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Rename matching layers')}
              >
                {t('Rename Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Renumber matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={renumberLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Renumber matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Renumber matching layers')}
              >
                {t('Renumber Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Find and replace matching layer names')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={replaceLayerMatchNamesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Find and replace matching layer names'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Find and replace matching layer names')}
              >
                {t('Replace Names')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('UPPERCASE')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => changeLayerMatchNameCaseFromPanel('upper')}
                onFocus={() => setReviewedLayerAction(t('UPPERCASE'))}
                disabled={layerMatchCounts.total === 0}
                title={t('UPPERCASE')}
              >
                {t('UPPERCASE')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('lowercase')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => changeLayerMatchNameCaseFromPanel('lower')}
                onFocus={() => setReviewedLayerAction(t('lowercase'))}
                disabled={layerMatchCounts.total === 0}
                title={t('lowercase')}
              >
                {t('lowercase')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Title Case')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => changeLayerMatchNameCaseFromPanel('title')}
                onFocus={() => setReviewedLayerAction(t('Title Case'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Title Case')}
              >
                {t('Title Case')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Sentence case')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => changeLayerMatchNameCaseFromPanel('sentence')}
                onFocus={() => setReviewedLayerAction(t('Sentence case'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Sentence case')}
              >
                {t('Sentence case')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clean matching layer names')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={cleanLayerMatchNamesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Clean matching layer names'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Trim and collapse spaces in matching layer names')}
              >
                {t('Clean Names')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer opacity')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchOpacityFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer opacity'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer opacity')}
              >
                {t('Set Opacity')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer blend mode')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchBlendModeFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer blend mode'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer blend mode')}
              >
                {t('Set Blend')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer fill')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchPaintFromPanel('fill')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer fill'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer fill')}
              >
                {t('Set Fill')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer stroke')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchPaintFromPanel('stroke')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer stroke'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer stroke')}
              >
                {t('Set Stroke')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer stroke width')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchStrokeWidthFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer stroke width'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer stroke width')}
              >
                {t('Set Stroke W')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer line cap')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchStrokeStyleFromPanel('cap')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer line cap'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer line cap')}
              >
                {t('Set Cap')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer line join')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchStrokeStyleFromPanel('join')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer line join'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer line join')}
              >
                {t('Set Join')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer dash')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchDashFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer dash'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer dash')}
              >
                {t('Set Dash')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer miter limit')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchMiterLimitFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer miter limit'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer miter limit')}
              >
                {t('Set Miter')}
              </button>




              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer overprint')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchOverprintFromPanel('both')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer overprint'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer overprint')}
              >
                {t('Set Overprint')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer print mark kind')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchPrintMarkKindFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer print mark kind'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer print mark kind')}
              >
                {t('Set Print Mark')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer font family')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('fontFamily')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer font family'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer font family')}
              >
                {t('Set Font')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer font size')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('fontSize')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer font size'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer font size')}
              >
                {t('Set Font Size')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer font weight')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('fontWeight')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer font weight'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer font weight')}
              >
                {t('Set Weight')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer font style')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('fontStyle')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer font style'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer font style')}
              >
                {t('Set Italic')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer text alignment')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('textAlign')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer text alignment'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer text alignment')}
              >
                {t('Set Align')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer underline')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('underline')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer underline'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer underline')}
              >
                {t('Set Underline')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer strikethrough')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('linethrough')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer strikethrough'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer strikethrough')}
              >
                {t('Set Strike')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer overline')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('overline')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer overline'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer overline')}
              >
                {t('Set Overline')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer tracking')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('charSpacing')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer tracking'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer tracking')}
              >
                {t('Set Tracking')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer leading')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchTextStyleFromPanel('lineHeight')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer leading'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer leading')}
              >
                {t('Set Leading')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer x position')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('x')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer x position'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer x position')}
              >
                {t('Set X')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer y position')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('y')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer y position'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer y position')}
              >
                {t('Set Y')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer center x')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('centerX')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer center x'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer center x')}
              >
                {t('Set Center X')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer center y')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('centerY')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer center y'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer center y')}
              >
                {t('Set Center Y')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer right edge')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('right')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer right edge'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer right edge')}
              >
                {t('Set Right')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer bottom edge')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('bottom')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer bottom edge'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer bottom edge')}
              >
                {t('Set Bottom')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer position')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryPairFromPanel('position')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer position'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer position')}
              >
                {t('Set Position')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer center')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryPairFromPanel('center')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer center'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer center')}
              >
                {t('Set Center')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer bounds')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryPairFromPanel('bounds')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer bounds'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer bounds')}
              >
                {t('Set Bounds')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer width')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('width')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer width'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer width')}
              >
                {t('Set Width')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer height')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('height')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer height'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer height')}
              >
                {t('Set Height')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer size')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryPairFromPanel('size')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer size'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer size')}
              >
                {t('Set Size')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer rotation')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('rotation')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer rotation'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer rotation')}
              >
                {t('Set Rotate')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer horizontal scale')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('scaleX')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer horizontal scale'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer horizontal scale')}
              >
                {t('Set Scale X')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer vertical scale')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('scaleY')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer vertical scale'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer vertical scale')}
              >
                {t('Set Scale Y')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer scale')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryPairFromPanel('scale')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer scale'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer scale')}
              >
                {t('Set Scale')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer horizontal skew')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('skewX')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer horizontal skew'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer horizontal skew')}
              >
                {t('Set Skew X')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer vertical skew')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryFromPanel('skewY')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer vertical skew'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer vertical skew')}
              >
                {t('Set Skew Y')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer skew')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => setLayerMatchGeometryPairFromPanel('skew')}
                onFocus={() => setReviewedLayerAction(t('Set matching layer skew'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer skew')}
              >
                {t('Set Skew')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same object type in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerObjectFromPanel('type')}
                onFocus={() => setReviewedLayerAction(t('Select same object type in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same object type in matching layers')}
              >
                {t('Same Type')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same visibility in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerObjectFromPanel('visibility')}
                onFocus={() => setReviewedLayerAction(t('Select same visibility in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same visibility in matching layers')}
              >
                {t('Same Visibility')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same lock state in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerObjectFromPanel('lock')}
                onFocus={() => setReviewedLayerAction(t('Select same lock state in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same lock state in matching layers')}
              >
                {t('Same Lock')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same named state in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerObjectFromPanel('named')}
                onFocus={() => setReviewedLayerAction(t('Select same named state in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same named state in matching layers')}
              >
                {t('Same Named')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same name prefix in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerObjectFromPanel('namePrefix')}
                onFocus={() => setReviewedLayerAction(t('Select same name prefix in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same name prefix in matching layers')}
              >
                {t('Same Prefix')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same width in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('width')}
                onFocus={() => setReviewedLayerAction(t('Select same width in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same width in matching layers')}
              >
                {t('Same Width')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same height in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('height')}
                onFocus={() => setReviewedLayerAction(t('Select same height in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same height in matching layers')}
              >
                {t('Same Height')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same size in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('size')}
                onFocus={() => setReviewedLayerAction(t('Select same size in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same size in matching layers')}
              >
                {t('Same Size')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same area in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('area')}
                onFocus={() => setReviewedLayerAction(t('Select same area in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same area in matching layers')}
              >
                {t('Same Area')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same aspect ratio in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('aspectRatio')}
                onFocus={() => setReviewedLayerAction(t('Select same aspect ratio in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same aspect ratio in matching layers')}
              >
                {t('Same Aspect')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same rotation in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('rotation')}
                onFocus={() => setReviewedLayerAction(t('Select same rotation in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same rotation in matching layers')}
              >
                {t('Same Rotation')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same scale in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('scale')}
                onFocus={() => setReviewedLayerAction(t('Select same scale in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same scale in matching layers')}
              >
                {t('Same Scale')}
              </button>


              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same right edge in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('right')}
                onFocus={() => setReviewedLayerAction(t('Select same right edge in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same right edge in matching layers')}
              >
                {t('Same Right')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same bottom edge in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('bottom')}
                onFocus={() => setReviewedLayerAction(t('Select same bottom edge in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same bottom edge in matching layers')}
              >
                {t('Same Bottom')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same x position in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('x')}
                onFocus={() => setReviewedLayerAction(t('Select same x position in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same x position in matching layers')}
              >
                {t('Same X')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same y position in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('y')}
                onFocus={() => setReviewedLayerAction(t('Select same y position in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same y position in matching layers')}
              >
                {t('Same Y')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same position in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('position')}
                onFocus={() => setReviewedLayerAction(t('Select same position in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same position in matching layers')}
              >
                {t('Same Position')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same center in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('center')}
                onFocus={() => setReviewedLayerAction(t('Select same center in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same center in matching layers')}
              >
                {t('Same Center')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same bounds in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('bounds')}
                onFocus={() => setReviewedLayerAction(t('Select same bounds in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same bounds in matching layers')}
              >
                {t('Same Bounds')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same skew in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerGeometryFromPanel('skew')}
                onFocus={() => setReviewedLayerAction(t('Select same skew in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same skew in matching layers')}
              >
                {t('Same Skew')}
              </button>


              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clear matching gradient fills')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => clearLayerMatchComplexAppearanceFromPanel('gradientFill')}
                onFocus={() => setReviewedLayerAction(t('Clear matching gradient fills'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Clear matching gradient fills')}
              >
                {t('Clear Gradients')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same gradient fill in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerComplexAppearanceFromPanel('gradientFill')}
                onFocus={() => setReviewedLayerAction(t('Select same gradient fill in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same gradient fill in matching layers')}
              >
                {t('Same Gradient')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clear matching pattern fills')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => clearLayerMatchComplexAppearanceFromPanel('pattern')}
                onFocus={() => setReviewedLayerAction(t('Clear matching pattern fills'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Clear matching pattern fills')}
              >
                {t('Clear Patterns')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same pattern in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerComplexAppearanceFromPanel('pattern')}
                onFocus={() => setReviewedLayerAction(t('Select same pattern in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same pattern in matching layers')}
              >
                {t('Same Pattern')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Grommet matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={grommetLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Grommet matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Grommet matching objects')}
              >
                {t('Grommet')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Rhinestone matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={rhinestoneLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Rhinestone matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Rhinestone matching objects')}
              >
                {t('Rhinestone')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Blend matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => { void blendLayerMatchesFromPanel(); }}
                onFocus={() => setReviewedLayerAction(t('Blend matching objects'))}
                disabled={layerMatchCounts.total < 2}
                title={t('Blend matching objects')}
              >
                {t('Blend')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Variable Width matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={variableWidthLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Variable Width matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Variable Width matching objects')}
              >
                {t('Width profile')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Multi-outline matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => { void multiOutlineLayerMatchesFromPanel(); }}
                onFocus={() => setReviewedLayerAction(t('Multi-outline matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Multi-outline matching objects')}
              >
                {t('Multi-outline')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Warp matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={warpLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Warp matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Warp matching objects')}
              >
                {t('Arc Warp')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Free Distort matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={freeDistortLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Free Distort matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Free Distort matching objects')}
              >
                {t('Free Distort')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Round corners matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={roundCornersLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Round corners matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Round corners matching objects')}
              >
                {t('Round Corners')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Twist matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={twistLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Twist matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Twist matching objects')}
              >
                {t('Twist')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Zig Zag matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={zigzagLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Zig Zag matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Zig Zag matching objects')}
              >
                {t('Zig Zag')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Roughen matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={roughenLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Roughen matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Roughen matching objects')}
              >
                {t('Roughen')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Pucker or bloat matching objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={puckerLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Pucker or bloat matching objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Pucker or bloat matching objects')}
              >
                {t('Pucker/Bloat')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Knife split matching objects horizontally')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => knifeSplitLayerMatchesFromPanel('horizontal')}
                onFocus={() => setReviewedLayerAction(t('Knife split matching objects horizontally'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Knife split matching objects horizontally')}
              >
                {t('Knife H')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Knife split matching objects vertically')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => knifeSplitLayerMatchesFromPanel('vertical')}
                onFocus={() => setReviewedLayerAction(t('Knife split matching objects vertically'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Knife split matching objects vertically')}
              >
                {t('Knife V')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Split matching open paths at midpoint')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={scissorsSplitLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Split matching open paths at midpoint'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Split matching open paths at midpoint')}
              >
                {t('Scissors')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Split matching objects into grid')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={splitLayerMatchesIntoGridFromPanel}
                onFocus={() => setReviewedLayerAction(t('Split matching objects into grid'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Split matching objects into grid')}
              >
                {t('Split Grid')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clean up matching stray objects')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={cleanUpLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Clean up matching stray objects'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Clean up matching stray objects')}
              >
                {t('Clean Up')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Add anchors to matching paths')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={addAnchorsToLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Add anchors to matching paths'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Add anchors to matching paths')}
              >
                {t('Add Anchors')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Reverse matching path direction')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={reverseLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Reverse matching path direction'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Reverse matching path direction')}
              >
                {t('Reverse Path')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Simplify matching layer paths')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={simplifyLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Simplify matching layer paths'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Simplify matching layer paths')}
              >
                {t('Simplify Path')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Smooth matching layer paths')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={smoothLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Smooth matching layer paths'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Smooth matching layer paths')}
              >
                {t('Smooth Path')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Offset matching layer paths')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={offsetLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Offset matching layer paths'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Offset matching layer paths')}
              >
                {t('Offset Path')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Outline strokes in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={outlineLayerMatchStrokesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Outline strokes in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Outline strokes in matching layers')}
              >
                {t('Outline Stroke')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Make matching compound path')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={makeLayerMatchCompoundPathFromPanel}
                onFocus={() => setReviewedLayerAction(t('Make matching compound path'))}
                disabled={layerMatchCounts.total < 2}
                title={t('Make matching compound path')}
              >
                {t('Make Compound')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Release matching compound paths')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={releaseLayerMatchCompoundPathsFromPanel}
                onFocus={() => setReviewedLayerAction(t('Release matching compound paths'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Release matching compound paths')}
              >
                {t('Release Compound')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Expand matching clipping masks')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={expandLayerMatchClippingMasksFromPanel}
                onFocus={() => setReviewedLayerAction(t('Expand matching clipping masks'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Expand matching clipping masks')}
              >
                {t('Expand Clips')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Release matching clipping masks')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={releaseLayerMatchClippingMasksFromPanel}
                onFocus={() => setReviewedLayerAction(t('Release matching clipping masks'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Release matching clipping masks')}
              >
                {t('Release Clips')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same clipping mask in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerComplexAppearanceFromPanel('clipPath')}
                onFocus={() => setReviewedLayerAction(t('Select same clipping mask in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same clipping mask in matching layers')}
              >
                {t('Same Clip')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same font family in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerTextFromPanel('fontFamily')}
                onFocus={() => setReviewedLayerAction(t('Select same font family in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same font family in matching layers')}
              >
                {t('Same Font')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same font size in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerTextFromPanel('fontSize')}
                onFocus={() => setReviewedLayerAction(t('Select same font size in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same font size in matching layers')}
              >
                {t('Same Font Size')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same text appearance in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerTextFromPanel('textAppearance')}
                onFocus={() => setReviewedLayerAction(t('Select same text appearance in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same text appearance in matching layers')}
              >
                {t('Same Text Style')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Break matching symbol links')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={detachLayerMatchSymbolsFromPanel}
                onFocus={() => setReviewedLayerAction(t('Break matching symbol links'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Break matching symbol links')}
              >
                {t('Break Symbols')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same symbol in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAssetFromPanel('symbol')}
                onFocus={() => setReviewedLayerAction(t('Select same symbol in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same symbol in matching layers')}
              >
                {t('Same Symbol')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same image source in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAssetFromPanel('imageSource')}
                onFocus={() => setReviewedLayerAction(t('Select same image source in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same image source in matching layers')}
              >
                {t('Same Image')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clear matching image filters')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={clearLayerMatchImageFiltersFromPanel}
                onFocus={() => setReviewedLayerAction(t('Clear matching image filters'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Clear matching image filters')}
              >
                {t('Clear Image FX')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same image filters in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAssetFromPanel('imageFilters')}
                onFocus={() => setReviewedLayerAction(t('Select same image filters in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same image filters in matching layers')}
              >
                {t('Same Image FX')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same overprint in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerProductionFromPanel('overprint')}
                onFocus={() => setReviewedLayerAction(t('Select same overprint in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same overprint in matching layers')}
              >
                {t('Same Overprint')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same print mark type in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerProductionFromPanel('printMarkKind')}
                onFocus={() => setReviewedLayerAction(t('Select same print mark type in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same print mark type in matching layers')}
              >
                {t('Same Print Mark')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same appearance in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('appearance')}
                onFocus={() => setReviewedLayerAction(t('Select same appearance in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same appearance in matching layers')}
              >
                {t('Select Same Style')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same fill in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('fill')}
                onFocus={() => setReviewedLayerAction(t('Select same fill in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same fill in matching layers')}
              >
                {t('Same Fill')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same stroke in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('stroke')}
                onFocus={() => setReviewedLayerAction(t('Select same stroke in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same stroke in matching layers')}
              >
                {t('Same Stroke')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same stroke width in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('strokeWidth')}
                onFocus={() => setReviewedLayerAction(t('Select same stroke width in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same stroke width in matching layers')}
              >
                {t('Same Stroke W')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same line cap in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('strokeCap')}
                onFocus={() => setReviewedLayerAction(t('Select same line cap in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same line cap in matching layers')}
              >
                {t('Same Cap')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same line join in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('strokeJoin')}
                onFocus={() => setReviewedLayerAction(t('Select same line join in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same line join in matching layers')}
              >
                {t('Same Join')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same dash in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('dash')}
                onFocus={() => setReviewedLayerAction(t('Select same dash in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same dash in matching layers')}
              >
                {t('Same Dash')}
              </button>

              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same miter limit in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('miterLimit')}
                onFocus={() => setReviewedLayerAction(t('Select same miter limit in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same miter limit in matching layers')}
              >
                {t('Same Miter')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same constant stroke in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('strokeUniform')}
                onFocus={() => setReviewedLayerAction(t('Select same constant stroke in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same constant stroke in matching layers')}
              >
                {t('Same Constant Stroke')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching layer shadow')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchShadowFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching layer shadow'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching layer shadow')}
              >
                {t('Set Shadow')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same shadow in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('shadow')}
                onFocus={() => setReviewedLayerAction(t('Select same shadow in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same shadow in matching layers')}
              >
                {t('Same Shadow')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same opacity in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('opacity')}
                onFocus={() => setReviewedLayerAction(t('Select same opacity in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same opacity in matching layers')}
              >
                {t('Same Opacity')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Select same blend mode in matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => selectSameLayerAppearanceFromPanel('blendMode')}
                onFocus={() => setReviewedLayerAction(t('Select same blend mode in matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Select same blend mode in matching layers')}
              >
                {t('Same Blend')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Expand matching appearance')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => { void expandLayerMatchAppearanceFromPanel(); }}
                onFocus={() => setReviewedLayerAction(t('Expand matching appearance'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Expand matching appearance')}
              >
                {t('Expand Appearance')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Flatten matching transparency')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={flattenLayerMatchTransparencyFromPanel}
                onFocus={() => setReviewedLayerAction(t('Flatten matching transparency'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Flatten matching transparency')}
              >
                {t('Flatten Transparency')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Apply graphic style to matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={applyGraphicStyleToLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Apply graphic style to matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Apply graphic style to matching layers')}
              >
                {t('Apply Style')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clear matching layer appearance')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={clearLayerMatchAppearanceFromPanel}
                onFocus={() => setReviewedLayerAction(t('Clear matching layer appearance'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Clear matching layer appearance')}
              >
                {t('Clear Appearance')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Set matching constant stroke width')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={setLayerMatchStrokeUniformFromPanel}
                onFocus={() => setReviewedLayerAction(t('Set matching constant stroke width'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Set matching constant stroke width')}
              >
                {t('Set Constant Stroke')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Duplicate matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={() => { void duplicateLayerMatchesFromPanel(); }}
                onFocus={() => setReviewedLayerAction(t('Duplicate matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Duplicate matching layers')}
              >
                {t('Duplicate Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Group matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={groupLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Group matching layers'))}
                disabled={layerMatchCounts.total < 2}
                title={t('Group matching layers')}
              >
                {t('Group Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Ungroup matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onClick={ungroupLayerMatchesFromPanel}
                onFocus={() => setReviewedLayerAction(t('Ungroup matching layers'))}
                disabled={layerMatchCounts.groups === 0}
                title={t('Ungroup matching layers')}
              >
                {t('Ungroup Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Delete matching layers')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0 text-danger hover:border-danger/60"
                onClick={() => { void deleteLayerMatchesFromPanel(); }}
                onFocus={() => setReviewedLayerAction(t('Delete matching layers'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Delete matching layers')}
              >
                {t('Delete Matches')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Move matching layers forward')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0 inline-flex items-center gap-1"
                onClick={() => moveLayerMatchesStackFromPanel('forward')}
                onFocus={() => setReviewedLayerAction(t('Move matching layers forward'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Move matching layers forward')}
              >
                <ChevronUp size={10} aria-hidden="true" /> {t('Forward')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Move matching layers to front')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0 inline-flex items-center gap-1"
                onClick={() => moveLayerMatchesStackFromPanel('front')}
                onFocus={() => setReviewedLayerAction(t('Move matching layers to front'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Move matching layers to front')}
              >
                <ChevronsUp size={10} aria-hidden="true" /> {t('To Front')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Move matching layers backward')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0 inline-flex items-center gap-1"
                onClick={() => moveLayerMatchesStackFromPanel('backward')}
                onFocus={() => setReviewedLayerAction(t('Move matching layers backward'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Move matching layers backward')}
              >
                <ChevronDown size={10} aria-hidden="true" /> {t('Backward')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Reverse matching layer order')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0 inline-flex items-center gap-1"
                onClick={() => moveLayerMatchesStackFromPanel('reverse')}
                onFocus={() => setReviewedLayerAction(t('Reverse matching layer order'))}
                disabled={layerMatchCounts.total < 2}
                title={t('Reverse matching layer order')}
              >
                <ArrowUpDown size={10} aria-hidden="true" /> {t('Reverse')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Move matching layers to back')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0 inline-flex items-center gap-1"
                onClick={() => moveLayerMatchesStackFromPanel('back')}
                onFocus={() => setReviewedLayerAction(t('Move matching layers to back'))}
                disabled={layerMatchCounts.total === 0}
                title={t('Move matching layers to back')}
              >
                <ChevronsDown size={10} aria-hidden="true" /> {t('To Back')}
              </button>
              <button
                type="button"
                data-layer-action
                data-layer-action-review={t('Clear search')}
                className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
                onFocus={() => setReviewedLayerAction(t('Clear search'))}
                onClick={() => setLayerQuery('')}
                title={t('Clear search')}
              >
                {t('Clear search')}
              </button>
            </div>
          )}
        </div>
      )}
      <div
        ref={listRef}
        // Only carry the listbox role when there are options to put under
        // it — axe (correctly) flags an empty listbox as a WCAG 1.3.1
        // violation ("required children role not present"). The empty
        // state is a single hint card, not a list; dropping the role
        // there is the right semantic.
        role={filteredRows.length ? 'listbox' : undefined}
        aria-label={filteredRows.length ? t('Layer list') : undefined}
        aria-describedby={filteredRows.length ? 'layer-list-hint layer-review-status' : undefined}
        aria-activedescendant={focusIdx !== null && rows[focusIdx] ? `layer-row-${rows[focusIdx].id}` : undefined}
        tabIndex={filteredRows.length ? 0 : -1}
        onKeyDown={filteredRows.length ? onListKeyDown : undefined}
        onFocus={() => { if (filteredRows.length && focusedFilteredIndex === -1) setFocusIdx(filteredRows[0].index); }}
        className="max-h-60 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-accent2/50 rounded-sm"
      >
        {filteredRows.length > 0 && <div id="layer-list-hint" className="sr-only">{t('Use arrow keys to navigate, F2 to rename, Ctrl+D to duplicate, V to show or hide, L to lock or unlock, Delete to remove.')}</div>}
        {filteredRows.length > 0 && (
          <div id="layer-review-status" className="sr-only" aria-live="polite">
            {focusedLayer
              ? `${t('Reviewing')} ${focusedLayer.displayName} ${Math.max(0, focusedFilteredIndex) + 1} / ${filteredRows.length}. ${focusedLayer.row.visible === false ? t('Hidden') : t('Visible')} · ${focusedLayer.row.locked ? t('Locked') : t('Unlocked')}`
              : t('No layers found.')}
          </div>
        )}
        {rows.length === 0 && (
          <div className="px-3 pb-4 flex flex-col items-center text-center">
            {/* Two stacked rectangles + a faint third — "layers" idea in line art. */}
            <svg width="48" height="40" viewBox="0 0 48 40" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
              <rect x="10.5" y="6.5" width="27" height="11" rx="1.5" stroke="rgb(var(--color-accent2))" strokeOpacity="0.55" strokeWidth="1" />
              <rect x="6.5" y="14.5" width="35" height="11" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" />
              <rect x="10.5" y="22.5" width="27" height="11" rx="1.5" stroke="rgb(var(--color-accent))" strokeWidth="1.2" />
            </svg>
            <div className="text-xs text-ink/90 mb-1">{t('No objects yet')}</div>
            <div className="type-caption leading-relaxed max-w-[180px]">
              {t('Draw something with the toolbar — each shape will appear here.')}
            </div>
          </div>
        )}
        {rows.length > 0 && filteredRows.length === 0 && (
          <div className="px-3 pb-4 flex flex-col items-center text-center">
            <div className="text-xs text-ink/90 mb-1">{t('No layers found.')}</div>
            <div className="type-caption leading-relaxed max-w-[180px]">
              {t('Try a layer name, type, or object id.')}
            </div>
            {layerQuery && (
              <button
                type="button"
                className="btn !py-1 !px-2 text-[10px] mt-2"
                onClick={() => { setLayerQuery(''); setFocusIdx(null); }}
              >
                {t('Clear search')}
              </button>
            )}
          </div>
        )}
        {filteredRows.map(({ row: r, index: i, meta, displayName }) => {
          const Icon = meta.icon;
          const isEditing = editingId === r.id;
          const isDragging = dragId === r.id;
          const isSelected = selectedSet.has(r.id);
          const showAbove = dropAt?.id === r.id && dropAt.pos === 'above';
          const showBelow = dropAt?.id === r.id && dropAt.pos === 'below';
          const isFocused = focusIdx === i;
          return (
            <div key={r.id} className="relative">
              {showAbove && <div className="absolute left-0 right-0 -top-px h-0.5 bg-accent2 pointer-events-none z-10" aria-hidden="true" />}
              <div
                id={`layer-row-${r.id}`}
                data-row-idx={i}
                role="option"
                aria-selected={isSelected}
                draggable={!isEditing}
                onDragStart={(e) => onDragStart(e, r.id)}
                onDragOver={(e) => onDragOver(e, r.id)}
                onDragLeave={(e) => onDragLeave(e, r.id)}
                onDrop={(e) => onDrop(e, r.id)}
                onDragEnd={finishDrag}
                className={`flex items-center gap-1.5 px-1.5 py-1 text-xs transition-colors group cursor-pointer ${
                  isSelected ? 'bg-accent/15 hover:bg-accent/20' : 'hover:bg-panel3'
                } ${isFocused ? 'ring-1 ring-inset ring-accent2/60' : ''} ${r.visible ? '' : 'opacity-50'} ${isDragging ? 'opacity-40' : ''}`}
                onClick={() => { if (!isEditing) { select(i); setFocusIdx(i); } }}
                title={`${displayName} #${r.id}`}
              >
                <GripVertical size={12} className="text-muted/70 shrink-0 cursor-grab" aria-hidden="true" />
                <button onClick={(e) => { e.stopPropagation(); toggleVisible(i); }} className="text-muted hover:text-ink transition-colors" title={r.visible ? t('Hide') : t('Show')} aria-label={r.visible ? t('Hide') : t('Show')} aria-pressed={!r.visible}>{r.visible ? <Eye size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />}</button>
                <button onClick={(e) => { e.stopPropagation(); toggleLock(i); }} className="text-muted hover:text-ink transition-colors" title={r.locked ? t('Unlock') : t('Lock')} aria-label={r.locked ? t('Unlock') : t('Lock')} aria-pressed={r.locked}>{r.locked ? <Lock size={12} aria-hidden="true" /> : <Unlock size={12} aria-hidden="true" />}</button>
                {r.thumb ? (
                  <img
                    src={r.thumb}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="w-6 h-6 rounded-sm bg-panel2 border border-border object-contain shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-sm bg-panel2 border border-border shrink-0" aria-hidden="true" />
                )}
                <Icon size={12} className="text-muted shrink-0" aria-hidden="true" />
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      // IME guard — see AIPanel for the same fix.
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commitEdit(); }
                      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                    }}
                    aria-label={t('Layer name')}
                    className="flex-1 min-w-0 bg-panel2 border border-accent2/60 rounded-sm px-1 py-0 text-xs text-ink outline-none"
                  />
                ) : (
                  <span
                    className="flex-1 truncate text-ink/90 select-none"
                    onDoubleClick={(e) => { e.stopPropagation(); beginEdit(r.id, r.name ?? ''); }}
                  >
                    {displayName}
                  </span>
                )}
                <span className={`text-muted text-[10px] tabular-nums shrink-0 opacity-60 group-hover:opacity-100 transition-opacity ${isSelected || isFocused ? 'opacity-100' : ''}`} aria-hidden="true">#{r.id}</span>
                <button onClick={(e) => { e.stopPropagation(); void duplicate(i); }} className={`${isSelected || isFocused ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-ink transition-all`} title={t('Duplicate layer object')} aria-label={t('Duplicate layer object')}><Copy size={12} aria-hidden="true" /></button>
                <button onClick={(e) => { e.stopPropagation(); remove(i); }} className={`${isSelected || isFocused ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all`} title={t('Delete')} aria-label={t('Delete')}><Trash2 size={12} aria-hidden="true" /></button>
              </div>
              {showBelow && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent2 pointer-events-none z-10" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
