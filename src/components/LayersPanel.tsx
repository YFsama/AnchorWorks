import { useEffect, useRef, useState } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Trash2,
  Square, Circle, Slash, Pentagon, Spline, Type as TypeIcon,
  Image as ImageIcon, Group as GroupIcon, BoxSelect, Shapes,
  GripVertical,
} from 'lucide-react';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import * as fabric from 'fabric';
import { useT } from '../lib/i18n';
import { useEditor } from '../store/editor';

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
    const o = getObjs()[i]; if (!o) return;
    getCanvas()?.remove(o);
    getCanvas()?.requestRenderAll();
  };
  const select = (i: number) => {
    const o = getObjs()[i]; if (!o) return;
    getCanvas()?.setActiveObject(o);
    getCanvas()?.requestRenderAll();
  };

  // ---------- Keyboard navigation (Up/Down/Home/End/F2/Enter)
  // The container is `role="listbox"` with `aria-activedescendant`; we keep
  // tabIndex 0 on the listbox itself so the rest of the keyboard handlers in
  // the app (the global ones in App.tsx) still see focus there, not on the
  // rows. Arrow events stop propagation so they don't double-fire the global
  // arrow-nudge handler.
  const moveFocus = (next: number) => {
    if (!rows.length) return;
    const clamped = Math.max(0, Math.min(rows.length - 1, next));
    setFocusIdx(clamped);
    select(clamped);
    // Bring the row into view if it scrolled off — `aria-activedescendant`
    // doesn't automatically scroll the way real DOM focus does.
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-row-idx="${clamped}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  };
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingId) return; // rename input owns the keys while editing
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moveFocus((focusIdx ?? -1) + 1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); e.stopPropagation(); moveFocus((focusIdx ?? rows.length) - 1); return; }
    if (e.key === 'Home')      { e.preventDefault(); e.stopPropagation(); moveFocus(0); return; }
    if (e.key === 'End')       { e.preventDefault(); e.stopPropagation(); moveFocus(rows.length - 1); return; }
    if (e.key === 'F2' || (e.key === 'Enter' && !e.nativeEvent.isComposing)) {
      if (focusIdx === null) return;
      const r = rows[focusIdx]; if (!r) return;
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
        ref={listRef}
        // Only carry the listbox role when there are options to put under
        // it — axe (correctly) flags an empty listbox as a WCAG 1.3.1
        // violation ("required children role not present"). The empty
        // state is a single hint card, not a list; dropping the role
        // there is the right semantic.
        role={rows.length ? 'listbox' : undefined}
        aria-label={rows.length ? t('Layer list') : undefined}
        aria-describedby={rows.length ? 'layer-list-hint' : undefined}
        aria-activedescendant={focusIdx !== null && rows[focusIdx] ? `layer-row-${rows[focusIdx].id}` : undefined}
        tabIndex={rows.length ? 0 : -1}
        onKeyDown={rows.length ? onListKeyDown : undefined}
        onFocus={() => { if (focusIdx === null && rows.length) setFocusIdx(0); }}
        className="max-h-60 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-accent2/50 rounded-sm"
      >
        {rows.length > 0 && <div id="layer-list-hint" className="sr-only">{t('Use arrow keys to navigate, F2 to rename, Delete to remove.')}</div>}
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
        {rows.map((r, i) => {
          const meta = metaFor(r.type);
          const Icon = meta.icon;
          const isEditing = editingId === r.id;
          const isDragging = dragId === r.id;
          const isSelected = selectedSet.has(r.id);
          const showAbove = dropAt?.id === r.id && dropAt.pos === 'above';
          const showBelow = dropAt?.id === r.id && dropAt.pos === 'below';
          const displayName = r.name ?? t(meta.label);
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
                <span className="text-muted text-[10px] tabular-nums shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden="true">#{r.id}</span>
                <button onClick={(e) => { e.stopPropagation(); remove(i); }} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all" title={t('Delete')} aria-label={t('Delete')}><Trash2 size={12} aria-hidden="true" /></button>
              </div>
              {showBelow && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent2 pointer-events-none z-10" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
