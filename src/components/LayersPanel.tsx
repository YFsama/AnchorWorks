import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Trash2, MousePointerClick, EyeIcon,
  Square, Circle, Slash, Pentagon, Spline, Type as TypeIcon,
  Image as ImageIcon, Group as GroupIcon, BoxSelect, Shapes,
  GripVertical, Search, Copy,
} from 'lucide-react';
import { getCanvas, pushHistory, selectVisibleObjects, selectUnlockedObjects, hideOthers, showAll, unlockAll } from '../lib/canvasEngine';
import * as fabric from 'fabric';
import { useT } from '../lib/i18n';
import { useEditor } from '../store/editor';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';

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
      counts.total += 1;
      return counts;
    }, { selectable: 0, visible: 0, hidden: 0, unlocked: 0, locked: 0, total: 0 });
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
