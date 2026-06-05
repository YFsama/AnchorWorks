import { useState, type KeyboardEvent } from 'react';
import { MousePointer2, Move, Hash, Magnet, Crosshair, Target, Maximize2, ChevronLeft, ChevronRight, Scissors } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { zoomToArtboard, zoomToPercent } from '../lib/canvasEngine';
import { getTool } from '../lib/tools/types';
import { toast } from '../lib/toast';

export function StatusBar() {
  const t = useT();
  const tool = useEditor(s => s.tool);
  const cursorX = useEditor(s => s.cursorX);
  const cursorY = useEditor(s => s.cursorY);
  const zoom = useEditor(s => s.zoom);
  const objectCount = useEditor(s => s.objectCount);
  const selectionIds = useEditor(s => s.selectionIds);
  const summary = useEditor(s => s.selectionSummary);
  const dimUnit = useEditor(s => s.dimUnit);
  const gridVisible = useEditor(s => s.gridVisible);
  const snapEnabled = useEditor(s => s.snapEnabled);
  const smartGuides = useEditor(s => s.smartGuidesEnabled);
  const anchorSnap = useEditor(s => s.anchorSnapEnabled);
  const artboards = useEditor(s => s.artboards);
  const cutPathCount = useEditor(s => s.cutPaths.length);
  const setModal = useEditor(s => s.setModal);
  const clearCutPaths = useEditor(s => s.clearCutPaths);
  const setGridVisible = useEditor(s => s.setGridVisible);
  const setSnapEnabled = useEditor(s => s.setSnapEnabled);
  const setSmartGuidesEnabled = useEditor(s => s.setSmartGuidesEnabled);
  const setAnchorSnapEnabled = useEditor(s => s.setAnchorSnapEnabled);
  // Index of the artboard the user is "on". Independent of any store flag —
  // tracks the cycle of the prev/next buttons. Stays stable across re-renders
  // unless the artboards list itself changes length.
  const [activeIdx, setActiveIdxLocal] = useState(0);
  const visibleIdx = artboards.length === 0 ? 0 : Math.min(activeIdx, artboards.length - 1);
  const focusArtboard = (idx: number) => {
    if (artboards.length === 0) return;
    const next = ((idx % artboards.length) + artboards.length) % artboards.length;
    setActiveIdxLocal(next);
    const a = artboards[next];
    zoomToArtboard({ x: a.x, y: a.y, width: a.width, height: a.height });
  };

  const handleStatusActionKeys = (event: KeyboardEvent<HTMLDivElement | HTMLSpanElement>) => {
    if (event.defaultPrevented) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-status-action]'))
      .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (buttons.length === 0) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  // Tool label + icon flow from the registry descriptor (registerTools.ts)
  // so adding a new tool doesn't require updating a parallel map here. Falls
  // through to the raw id + the default mouse-pointer icon when a tool isn't
  // registered — should never happen but keeps the status bar legible.
  const toolHandler = getTool(tool);
  const toolLabel = t(toolHandler?.label ?? tool);
  const ToolIcon = toolHandler?.icon ?? MousePointer2;

  // Selection dimensions follow the inspector's mm/px unit (shared store flag).
  const dim = (px: number) => (dimUnit === 'mm' ? Math.round((px / 3.7795) * 100) / 100 : px);

  const handleCutPathStatusClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) {
      clearCutPaths();
      toast.success(t('Cut paths cleared'), { title: t('Cut prep') });
      return;
    }
    setModal(event.shiftKey || event.altKey ? 'showCutContour' : 'showPlotter', true);
  };

  return (
    // The status bar is a landmark (`contentinfo`-like) — labelled but NOT a
    // live region. With role="status" the whole bar would default to
    // aria-live="polite", and the cursor X/Y span re-renders on every mouse
    // move, which screen readers would announce continuously and drown
    // everything else out. Each child below carries its own role="status"
    // only on values that change meaningfully (zoom, object count, selection).
    // The cursor coords are aria-hidden — sighted users see them update live
    // but screen readers don't get a chatter stream.
    <div
      className="statusbar h-7 flex items-center px-3 gap-3 text-[10px] text-muted select-none"
      role="group"
      aria-label={t('Editor status')}
    >
      <span className="flex items-center gap-1 text-ink" aria-label={`${t('Active tool')}: ${toolLabel}`}>
        <ToolIcon size={11} aria-hidden="true" />
        <span>{toolLabel}</span>
      </span>
      <Sep />
      <span className="flex items-center gap-1 tabular-nums" aria-hidden="true">
        <Move size={11} aria-hidden="true" />
        X <span className="text-ink">{dim(cursorX)}</span>
        <span className="ml-1">Y</span> <span className="text-ink">{dim(cursorY)}</span>
        <span className="ml-0.5">{dimUnit}</span>
      </span>
      <Sep />
      <ZoomField zoom={zoom} label={t('Zoom')} />
      <Sep />
      <span className="tabular-nums" aria-label={`${t('Objects')} ${objectCount}`}>{t('Objects')} <span className="text-ink">{objectCount}</span></span>
      <Sep />
      <span className="tabular-nums" aria-label={`${t('Selected')} ${selectionIds.length}`}>{t('Selected')} <span className="text-ink">{selectionIds.length}</span></span>
      {summary && selectionIds.length === 1 && (
        <>
          <Sep />
          <span className="flex items-center gap-1 tabular-nums" aria-label={`${t('Width')} ${dim(summary.width)} ${dimUnit}, ${t('Height')} ${dim(summary.height)} ${dimUnit}${summary.angle !== 0 ? `, ${t('Angle')} ${summary.angle}°` : ''}`} title={`${dim(summary.width)} × ${dim(summary.height)} ${dimUnit} @ ${dim(summary.left)}, ${dim(summary.top)}`}>
            <Maximize2 size={11} aria-hidden="true" />
            <span className="text-ink">{dim(summary.width)}</span>
            <span className="text-muted" aria-hidden="true">×</span>
            <span className="text-ink">{dim(summary.height)}</span>
            <span className="text-muted ml-1" aria-hidden="true">{dimUnit}</span>
            {summary.angle !== 0 && (
              <>
                <span className="text-muted ml-2" aria-hidden="true">∠</span>
                <span className="text-ink" aria-hidden="true">{summary.angle}°</span>
              </>
            )}
          </span>
        </>
      )}

      <div
        className="ml-auto flex items-center gap-3"
        role="toolbar"
        aria-label={t('Status actions')}
        title={t('Use arrow keys to review status actions')}
        onKeyDown={handleStatusActionKeys}
      >
        {artboards.length > 1 && (
          <span
            className="flex items-center gap-0.5 px-1 rounded bg-panel2 border border-border"
            role="navigation"
            aria-label={t('Artboard navigation')}
            title={t('Use arrow keys to review status actions')}
            onKeyDown={handleStatusActionKeys}
          >
            <button
              type="button"
              data-status-action
              onClick={() => focusArtboard(visibleIdx - 1)}
              className="p-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors"
              aria-label={t('Previous artboard')}
              title={t('Previous artboard')}
            >
              <ChevronLeft size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-status-action
              onClick={() => focusArtboard(visibleIdx)}
              className="px-1 rounded text-[10px] tabular-nums text-ink hover:bg-panel3 transition-colors"
              title={artboards[visibleIdx]?.name ?? ''}
              aria-label={`${artboards[visibleIdx]?.name ?? ''} (${visibleIdx + 1} ${t('of')} ${artboards.length})`}
            >
              {visibleIdx + 1}/{artboards.length}
            </button>
            <button
              type="button"
              data-status-action
              onClick={() => focusArtboard(visibleIdx + 1)}
              className="p-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors"
              aria-label={t('Next artboard')}
              title={t('Next artboard')}
            >
              <ChevronRight size={11} aria-hidden="true" />
            </button>
          </span>
        )}
        {cutPathCount > 0 && (
          <button
            type="button"
            data-status-action
            onClick={handleCutPathStatusClick}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-panel2 transition-colors"
            style={{ color: '#ff2e9a' }}
            title={t('Open Send to Plotter (Shift-click: Cut Contour, Ctrl-click: Clear cut paths)')}
            aria-label={`${cutPathCount} ${t('cut paths')} — ${t('Open Send to Plotter')}. ${t('Ctrl-click: Clear cut paths')}`}
          >
            <Scissors size={11} aria-hidden="true" />
            <span className="tabular-nums">{cutPathCount}</span>
          </button>
        )}
        <Badge active={gridVisible} icon={<Hash size={11} aria-hidden="true" />} label={t('GRID')} onToggle={() => setGridVisible(!gridVisible)} />
        <Badge active={snapEnabled} icon={<Magnet size={11} aria-hidden="true" />} label={t('SNAP')} onToggle={() => setSnapEnabled(!snapEnabled)} />
        <Badge active={smartGuides} icon={<Crosshair size={11} aria-hidden="true" />} label={t('GUIDES')} onToggle={() => setSmartGuidesEnabled(!smartGuides)} />
        <Badge active={anchorSnap} icon={<Target size={11} aria-hidden="true" />} label={t('ANCHOR')} onToggle={() => setAnchorSnapEnabled(!anchorSnap)} />
        <Sep />
        {/* Always-visible build version — opens About for full credits. */}
        <button
          type="button"
          data-status-action
          onClick={() => useEditor.getState().setModal('showHelpCenter', true)}
          className="tabular-nums text-muted hover:text-ink transition-colors"
          title={`Anchorworks v${__APP_VERSION__}`}
          aria-label={`Anchorworks ${t('Version')} ${__APP_VERSION__}`}
        >
          v{__APP_VERSION__}
        </button>
      </div>
    </div>
  );
}

function Sep() { return <span className="statusbar-sep" aria-hidden="true" />; }

/** Click-to-edit zoom percentage — type a number + Enter to jump to that zoom
 *  (Illustrator / SignMaster status-bar zoom field), centred on the viewport. */
function ZoomField({ zoom, label }: { zoom: number; label: string }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const pct = Math.round(zoom * 100);

  const commit = () => {
    const v = parseFloat(draft);
    if (Number.isFinite(v) && v > 0) zoomToPercent(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        defaultValue={String(pct)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(String(pct)); e.target.select(); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }}
        className="w-12 px-1 text-[10px] tabular-nums text-ink bg-panel2 border border-accent rounded outline-none"
        aria-label={t('Set zoom percentage')}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="tabular-nums hover:text-ink transition-colors"
      title={t('Set zoom percentage')}
      aria-label={`${label} ${pct}%`}
    >
      {label} <span className="text-ink">{pct}%</span>
    </button>
  );
}

function Badge({ active, icon, label, onToggle }: { active: boolean; icon: React.ReactNode; label: string; onToggle?: () => void }) {
  const t = useT();
  // axe color-contrast: bare `text-accent2` (#5ac8d8) on the panel surface
  // falls to ~1.8:1 in light theme, and `text-muted opacity-60` lands at
  // ~2.4:1. Use `badge-active` / `badge-inactive` so we can drive the colour
  // via index.css (which already knows the active theme).
  const state = t(active ? 'on' : 'off');
  const className = `flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${active ? 'badge-active' : 'badge-inactive'}`;
  if (onToggle) {
    return (
      <button
        type="button"
        data-status-action
        onClick={onToggle}
        className={`${className} hover:bg-panel2`}
        title={`${label} ${state} — ${t('Toggle')}`}
        aria-label={`${label} ${state}`}
        aria-pressed={active}
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <span
      className={className}
      title={`${label} ${state}`}
      role="status"
      aria-label={`${label} ${state}`}
    >
      {icon}
      {label}
    </span>
  );
}
