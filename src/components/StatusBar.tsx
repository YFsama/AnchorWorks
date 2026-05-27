import { useState } from 'react';
import { MousePointer2, Move, Hash, Magnet, Crosshair, Target, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { zoomToArtboard } from '../lib/canvasEngine';
import { getTool } from '../lib/tools/types';

export function StatusBar() {
  const t = useT();
  const tool = useEditor(s => s.tool);
  const cursorX = useEditor(s => s.cursorX);
  const cursorY = useEditor(s => s.cursorY);
  const zoom = useEditor(s => s.zoom);
  const objectCount = useEditor(s => s.objectCount);
  const selectionIds = useEditor(s => s.selectionIds);
  const summary = useEditor(s => s.selectionSummary);
  const gridVisible = useEditor(s => s.gridVisible);
  const snapEnabled = useEditor(s => s.snapEnabled);
  const smartGuides = useEditor(s => s.smartGuidesEnabled);
  const anchorSnap = useEditor(s => s.anchorSnapEnabled);
  const artboards = useEditor(s => s.artboards);
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

  // Tool label + icon flow from the registry descriptor (registerTools.ts)
  // so adding a new tool doesn't require updating a parallel map here. Falls
  // through to the raw id + the default mouse-pointer icon when a tool isn't
  // registered — should never happen but keeps the status bar legible.
  const toolHandler = getTool(tool);
  const toolLabel = t(toolHandler?.label ?? tool);
  const ToolIcon = toolHandler?.icon ?? MousePointer2;

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
      className="h-6 bg-panel border-t border-border flex items-center px-3 gap-4 text-[10px] text-muted select-none"
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
        X <span className="text-ink">{cursorX}</span>
        <span className="ml-1">Y</span> <span className="text-ink">{cursorY}</span>
      </span>
      <Sep />
      <span className="tabular-nums" aria-label={`${t('Zoom')} ${Math.round(zoom * 100)}%`}>{t('Zoom')} <span className="text-ink">{Math.round(zoom * 100)}%</span></span>
      <Sep />
      <span className="tabular-nums" aria-label={`${t('Objects')} ${objectCount}`}>{t('Objects')} <span className="text-ink">{objectCount}</span></span>
      <Sep />
      <span className="tabular-nums" aria-label={`${t('Selected')} ${selectionIds.length}`}>{t('Selected')} <span className="text-ink">{selectionIds.length}</span></span>
      {summary && selectionIds.length === 1 && (
        <>
          <Sep />
          <span className="flex items-center gap-1 tabular-nums" aria-label={`${t('Width')} ${summary.width}, ${t('Height')} ${summary.height}${summary.angle !== 0 ? `, ${t('Angle')} ${summary.angle}°` : ''}`} title={`${summary.width} × ${summary.height} px @ ${summary.left}, ${summary.top}`}>
            <Maximize2 size={11} aria-hidden="true" />
            <span className="text-ink">{summary.width}</span>
            <span className="text-muted" aria-hidden="true">×</span>
            <span className="text-ink">{summary.height}</span>
            <span className="text-muted ml-1" aria-hidden="true">px</span>
            {summary.angle !== 0 && (
              <>
                <span className="text-muted ml-2" aria-hidden="true">∠</span>
                <span className="text-ink" aria-hidden="true">{summary.angle}°</span>
              </>
            )}
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {artboards.length > 1 && (
          <span className="flex items-center gap-0.5 px-1 rounded bg-panel2 border border-border" role="navigation" aria-label={t('Artboard navigation')}>
            <button
              type="button"
              onClick={() => focusArtboard(visibleIdx - 1)}
              className="p-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors"
              aria-label={t('Previous artboard')}
              title={t('Previous artboard')}
            >
              <ChevronLeft size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => focusArtboard(visibleIdx)}
              className="px-1 rounded text-[10px] tabular-nums text-ink hover:bg-panel3 transition-colors"
              title={artboards[visibleIdx]?.name ?? ''}
              aria-label={`${artboards[visibleIdx]?.name ?? ''} (${visibleIdx + 1} ${t('of')} ${artboards.length})`}
            >
              {visibleIdx + 1}/{artboards.length}
            </button>
            <button
              type="button"
              onClick={() => focusArtboard(visibleIdx + 1)}
              className="p-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors"
              aria-label={t('Next artboard')}
              title={t('Next artboard')}
            >
              <ChevronRight size={11} aria-hidden="true" />
            </button>
          </span>
        )}
        <Badge active={gridVisible} icon={<Hash size={11} aria-hidden="true" />} label={t('GRID')} />
        <Badge active={snapEnabled} icon={<Magnet size={11} aria-hidden="true" />} label={t('SNAP')} />
        <Badge active={smartGuides} icon={<Crosshair size={11} aria-hidden="true" />} label={t('GUIDES')} />
        <Badge active={anchorSnap} icon={<Target size={11} aria-hidden="true" />} label={t('ANCHOR')} />
      </div>
    </div>
  );
}

function Sep() { return <span className="text-border" aria-hidden="true">|</span>; }

function Badge({ active, icon, label }: { active: boolean; icon: React.ReactNode; label: string }) {
  const t = useT();
  // axe color-contrast: bare `text-accent2` (#5ac8d8) on the panel surface
  // falls to ~1.8:1 in light theme, and `text-muted opacity-60` lands at
  // ~2.4:1. Use `badge-active` / `badge-inactive` so we can drive the colour
  // via index.css (which already knows the active theme).
  const state = t(active ? 'on' : 'off');
  return (
    <span
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${active ? 'badge-active' : 'badge-inactive'}`}
      title={`${label} ${state}`}
      role="status"
      aria-label={`${label} ${state}`}
    >
      {icon}
      {label}
    </span>
  );
}
