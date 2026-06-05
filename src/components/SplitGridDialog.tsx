import { useCallback, useState } from 'react';
import { X, Grid3x3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { splitIntoGrid } from '../lib/splitGrid';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const GRID_PRESETS: Array<{ label: string; rows: number; cols: number }> = [
  { label: '1×2', rows: 1, cols: 2 },
  { label: '2×1', rows: 2, cols: 1 },
  { label: '2×2', rows: 2, cols: 2 },
  { label: '3×2', rows: 3, cols: 2 },
  { label: '3×3', rows: 3, cols: 3 },
];

const GRID_RECIPE_PRESETS: Array<{ label: string; rows: number; cols: number; gutter: number; title: string }> = [
  { label: 'Sticker sheet', rows: 3, cols: 3, gutter: 2, title: '3×3 cells with a light kiss-cut gap.' },
  { label: 'Yard sign', rows: 1, cols: 2, gutter: 5, title: 'Two horizontal panels with assembly space.' },
  { label: 'Banner panels', rows: 1, cols: 3, gutter: 10, title: 'Three wide panels with larger sewing or overlap gaps.' },
  { label: 'Tile proof', rows: 2, cols: 2, gutter: 0, title: 'Four no-gap proof panels.' },
];

/**
 * Split Into Grid (Illustrator Object→Path→Split Into Grid) — divide the selected
 * object's bounds into a rows×cols grid of rectangles with an optional gutter.
 */
export function SplitGridDialog() {
  const t = useT();
  const open = useEditor(s => s.showSplitGrid);
  const close = useCallback(() => useEditor.getState().setModal('showSplitGrid', false), []);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [gutter, setGutter] = useState(0);
  const [reviewedRecipePreset, setReviewedRecipePreset] = useState('');
  const [reviewedGridPreset, setReviewedGridPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const activeRecipe = GRID_RECIPE_PRESETS.find((preset) => rows === preset.rows && cols === preset.cols && Math.abs(gutter - preset.gutter) < 0.001)?.label ?? '';

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = splitIntoGrid(rows, cols, gutter);
    if (n > 0) toast.success(`${n} ${t('cells created')}`, { title: t('Split Into Grid') });
    else toast.warn(t('Select a single object first.'), { title: t('Split Into Grid') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-split-grid-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.splitGridActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>, onReview?: (button?: HTMLButtonElement | null) => void) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-split-grid-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextRows = Number(actions[nextIndex]?.dataset.rows);
    const nextCols = Number(actions[nextIndex]?.dataset.cols);
    const nextGutter = Number(actions[nextIndex]?.dataset.gutter);
    if (Number.isFinite(nextRows) && Number.isFinite(nextCols)) {
      setRows(nextRows);
      setCols(nextCols);
      if (Number.isFinite(nextGutter)) setGutter(nextGutter);
    }
    requestAnimationFrame(() => {
      onReview?.(actions[nextIndex]);
      actions[nextIndex]?.focus();
    });
  };

  const applyPreset = (preset: { rows: number; cols: number }) => {
    setRows(preset.rows);
    setCols(preset.cols);
  };

  const applyRecipePreset = (preset: { label: string; rows: number; cols: number; gutter: number }) => {
    setRows(preset.rows);
    setCols(preset.cols);
    setGutter(preset.gutter);
  };

  const resetSplitGridSettings = () => {
    const stickerSheet = GRID_RECIPE_PRESETS[0];
    applyRecipePreset(stickerSheet);
    setReviewedRecipePreset(`${t(stickerSheet.label)} · ${stickerSheet.rows} ${t('Rows')} × ${stickerSheet.cols} ${t('Columns')} · ${stickerSheet.gutter.toFixed(1)} ${t('Gutter (mm)')}`);
    setReviewedGridPreset(`${stickerSheet.rows}×${stickerSheet.cols} · ${stickerSheet.rows} ${t('Rows')} × ${stickerSheet.cols} ${t('Columns')}`);
    setReviewedFooterAction(t('Reset split grid settings'));
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="splitgrid-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="splitgrid-title" className="dialog-title flex items-center gap-2">
            <Grid3x3 size={14} aria-hidden="true" /> {t('Split Into Grid')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Rows')}</span><span className="text-ink tabular-nums">{rows}</span></div>
            <input type="range" min={1} max={20} step={1} value={rows} onChange={(e) => setRows(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Rows')} />
          </label>
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Columns')}</span><span className="text-ink tabular-nums">{cols}</span></div>
            <input type="range" min={1} max={20} step={1} value={cols} onChange={(e) => setCols(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Columns')} />
          </label>
        </div>
        <label className="block mt-2">
          <div className="field-label flex items-center justify-between"><span>{t('Gutter (mm)')}</span><span className="text-ink tabular-nums">{gutter.toFixed(1)}</span></div>
          <input type="range" min={0} max={20} step={0.5} value={gutter} onChange={(e) => setGutter(parseFloat(e.target.value))} className="w-full" aria-label={t('Gutter (mm)')} />
        </label>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Split recipes')}</div>
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Split grid recipe actions')}
            aria-describedby="split-grid-recipe-review-status"
            title={t('Use arrow keys to review split grid recipes')}
            onKeyDown={(event) => handlePresetActionKeys(event, (button) => setReviewedRecipePreset(button?.dataset.review ?? ''))}
          >
            <div id="split-grid-recipe-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedRecipePreset || `${rows} ${t('Rows')} × ${cols} ${t('Columns')}, ${gutter.toFixed(1)} ${t('Gutter (mm)')}`}`}
            </div>
            {GRID_RECIPE_PRESETS.map((preset) => {
              const active = activeRecipe === preset.label;
              const review = `${t(preset.label)} · ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')} · ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-split-grid-preset-action
                  data-rows={preset.rows}
                  data-cols={preset.cols}
                  data-gutter={preset.gutter}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onFocus={(event) => setReviewedRecipePreset(event.currentTarget.dataset.review ?? '')}
                  onClick={() => applyRecipePreset(preset)}
                  aria-pressed={active}
                  title={`${t(preset.title)} ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}, ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}`}
                >
                  {t(preset.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Grid presets')}</div>
          <div
            className="grid grid-cols-5 gap-1"
            role="toolbar"
            aria-label={t('Split grid preset actions')}
            aria-describedby="split-grid-preset-review-status"
            title={t('Use arrow keys to review split grid presets')}
            onKeyDown={(event) => handlePresetActionKeys(event, (button) => setReviewedGridPreset(button?.dataset.review ?? ''))}
          >
            <div id="split-grid-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedGridPreset || `${rows} ${t('Rows')} × ${cols} ${t('Columns')}`}`}
            </div>
            {GRID_PRESETS.map((preset) => {
              const active = rows === preset.rows && cols === preset.cols;
              const review = `${preset.label} · ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-split-grid-preset-action
                  data-rows={preset.rows}
                  data-cols={preset.cols}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onFocus={(event) => setReviewedGridPreset(event.currentTarget.dataset.review ?? '')}
                  onClick={() => applyPreset(preset)}
                  aria-pressed={active}
                  title={`${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Split Into Grid actions')}
          aria-describedby="split-grid-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="split-grid-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Split Into Grid actions')}`}
          </span>
          <button type="button" data-split-grid-action data-split-grid-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-split-grid-action data-split-grid-action-review={t('Reset split grid settings')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset split grid settings'))} onClick={resetSplitGridSettings} title={t('Reset split grid settings')}>{t('Reset')}</button>
          <button type="button" data-split-grid-action data-split-grid-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
