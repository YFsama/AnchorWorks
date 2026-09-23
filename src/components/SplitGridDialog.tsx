import { useCallback, useState } from 'react';
import { X, Grid3x3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { splitIntoGrid } from '../lib/splitGrid';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

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
  const [reviewedRecipePreset, setReviewedRecipePreset] = useReviewedAction();
  const [reviewedGridPreset, setReviewedGridPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
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

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-split-grid-action]',
    reviewKey: actionReviewKey('data-split-grid-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const applyPresetFromButton = (button?: HTMLButtonElement) => {
    const nextRows = Number(button?.dataset.rows);
    const nextCols = Number(button?.dataset.cols);
    const nextGutter = Number(button?.dataset.gutter);
    if (Number.isFinite(nextRows) && Number.isFinite(nextCols)) {
      setRows(nextRows);
      setCols(nextCols);
      if (Number.isFinite(nextGutter)) setGutter(nextGutter);
    }
  };

  const handleRecipePresetKeys = makeRovingKeys({
    selector: '[data-split-grid-preset-action]',
    defer: true,
    setReview: setReviewedRecipePreset,
    onNavigate: applyPresetFromButton,
  });

  const handleGridPresetKeys = makeRovingKeys({
    selector: '[data-split-grid-preset-action]',
    defer: true,
    setReview: setReviewedGridPreset,
    onNavigate: applyPresetFromButton,
  });

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
          <PresetRow
            statusId="split-grid-recipe-review-status"
            className="grid grid-cols-2 gap-1"
            label={t('Split grid recipe actions')}
            title={t('Use arrow keys to review split grid recipes')}
            onKeyDown={handleRecipePresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedRecipePreset}
            fallback={`${rows} ${t('Rows')} × ${cols} ${t('Columns')}, ${gutter.toFixed(1)} ${t('Gutter (mm)')}`}
            actionAttr="data-split-grid-preset-action"
            setReviewed={setReviewedRecipePreset}
            items={GRID_RECIPE_PRESETS.map((preset) => {
              const active = activeRecipe === preset.label;
              return {
                key: preset.label,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                pressed: active,
                onClick: () => applyRecipePreset(preset),
                title: `${t(preset.title)} ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}, ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}`,
                data: { rows: preset.rows, cols: preset.cols, gutter: preset.gutter, review: `${t(preset.label)} · ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')} · ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}` },
                children: t(preset.label),
              };
            })}
          />
        </div>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Grid presets')}</div>
          <PresetRow
            statusId="split-grid-preset-review-status"
            className="grid grid-cols-5 gap-1"
            label={t('Split grid preset actions')}
            title={t('Use arrow keys to review split grid presets')}
            onKeyDown={handleGridPresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedGridPreset}
            fallback={`${rows} ${t('Rows')} × ${cols} ${t('Columns')}`}
            actionAttr="data-split-grid-preset-action"
            setReviewed={setReviewedGridPreset}
            items={GRID_PRESETS.map((preset) => {
              const active = rows === preset.rows && cols === preset.cols;
              return {
                key: preset.label,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                pressed: active,
                onClick: () => applyPreset(preset),
                title: `${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}`,
                data: { rows: preset.rows, cols: preset.cols, review: `${preset.label} · ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}` },
                children: preset.label,
              };
            })}
          />
        </div>

        <ReviewedFooter
          statusId="split-grid-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Split Into Grid actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Split Into Grid actions')}
          actionAttr="data-split-grid-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset split grid settings'), className: 'btn', onClick: resetSplitGridSettings, title: t('Reset split grid settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}
