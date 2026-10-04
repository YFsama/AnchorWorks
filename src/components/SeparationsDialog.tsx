import { useCallback, useEffect, useState } from 'react';
import { X, Layers, Eye, EyeOff, RotateCw } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { collectDocumentColors, exportPlates, isolatePlate, restorePlateIsolation, type PlateExportFormat, type PlateInfo, type PlateKind, type PlateSkipReason } from '../lib/separations';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ActionToolbar } from './ui/ActionToolbar';
import { ReviewedFooter } from './ui/ReviewedFooter';

const KIND_BADGE_CLASS: Record<PlateKind, string> = {
  spot: 'border-[#ff2e9a] text-[#ff2e9a]',
  process: 'border-border text-muted',
  gradient: 'border-border text-muted',
};

/**
 * Separations — per-plate inventory, isolation preview, and per-plate export.
 * Every color in the document (spot + process) becomes a plate row; toggling
 * the eye isolates that ink on the live canvas (restored on close), and the
 * footer exports one file per plate through the shared download plumbing.
 */
export function SeparationsDialog() {
  const t = useT();
  const open = useEditor(s => s.showSeparations);
  const close = useCallback(() => useEditor.getState().setModal('showSeparations', false), []);
  const [plates, setPlates] = useState<PlateInfo[]>([]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [format, setFormat] = useState<PlateExportFormat>('svg');
  const [reviewedPlate, setReviewedPlate] = useReviewedAction();
  const [reviewedFormat, setReviewedFormat] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);

  // Inventory on open; drop preview state (and canvas isolation) on close.
  // The scan waits a tick (RecoveryDialog pattern) so the canvas settles and
  // setState stays out of the effect body; cleanup cancels a stale scan.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setPlates(collectDocumentColors(getCanvas()));
    }, 0);
    return () => {
      window.clearTimeout(id);
      restorePlateIsolation();
      setPreviewKey(null);
      setSelectedKey(null);
    };
  }, [open]);

  // Live per-plate preview: isolatePlate hides non-plate objects and restores
  // the previous isolation itself, so this effect only names the current one.
  useEffect(() => {
    if (!open) return;
    isolatePlate(getCanvas(), previewKey);
  }, [open, previewKey]);

  // Unmount safety — never leave the canvas isolated behind the dialog.
  useEffect(() => () => restorePlateIsolation(), []);

  if (!open) return null;

  const kindLabel = (kind: PlateKind): string =>
    kind === 'spot' ? t('Spot') : kind === 'process' ? t('Process') : t('Gradient');

  const rescan = () => {
    setPlates(collectDocumentColors(getCanvas()));
    setPreviewKey(null);
    setSelectedKey(null);
  };

  const togglePreview = (plate: PlateInfo) => {
    setSelectedKey(plate.key);
    setPreviewKey(previous => previous === plate.key ? null : plate.key);
  };

  // Roving keyboard conventions live in ui/useRovingActions. The plate listbox
  // is vertical (ArrowUp/Down, clamped; Left/Right ignored) with its rich
  // role="option" rows kept verbatim below — the kit drives only the keys.
  const handlePlateKeys = makeRovingKeys({
    selector: '[data-separations-plate-action]',
    axis: 'vertical',
    guardEmpty: true,
    setReview: setReviewedPlate,
  });

  // Format toolbar: wrapping arrows that apply the next format synchronously
  // (onNavigate) and defer the review + focus commit to the next frame.
  const handleFormatKeys = makeRovingKeys({
    selector: '[data-separations-format-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedFormat,
    onNavigate: (option) => {
      const nextFormat = option?.dataset.format as PlateExportFormat | undefined;
      if (nextFormat === 'svg' || nextFormat === 'png') setFormat(nextFormat);
    },
  });

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-separations-action]',
    reviewKey: actionReviewKey('data-separations-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const skipReasonText = (reason: PlateSkipReason): string => {
    if (reason === 'not-found') return t('Plate no longer exists — rescan the document.');
    if (reason === 'not-exportable') return t('Gradients and patterns are process-only.');
    return t('No objects on this plate.');
  };

  const reportResults = (results: ReturnType<typeof exportPlates>) => {
    const exported = results.filter((result) => result.status === 'exported');
    const skipped = results.filter((result) => result.status === 'skipped');
    if (exported.length === 1) toast.success(`${exported.length} ${t('plate exported')}`, { title: t('Separations') });
    else if (exported.length > 1) toast.success(`${exported.length} ${t('plates exported')}`, { title: t('Separations') });
    if (skipped.length) toast.warn(skipReasonText(skipped[0].reason ?? 'empty'), { title: t('Separations') });
  };

  const exportCurrentPlate = () => {
    const key = selectedKey ?? previewKey;
    if (!key) { toast.warn(t('Select a plate first.'), { title: t('Separations') }); return; }
    reportResults(exportPlates([key], format));
  };

  const exportAllPlates = () => {
    const keys = plates.filter((plate) => plate.exportable).map((plate) => plate.key);
    if (!keys.length) { toast.warn(t('No exportable plates.'), { title: t('Separations') }); return; }
    reportResults(exportPlates(keys, format));
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="separations-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[380px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h2 id="separations-title" className="dialog-title flex items-center gap-2">
            <Layers size={14} aria-hidden="true" /> {t('Separations')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
        <p className="text-[10px] text-muted mb-2">{t('Each color prints its own plate: preview isolates the ink on canvas, export writes one file per plate.')}</p>

        <div className="flex items-center justify-between mb-1">
          <div className="field-label !mb-0">{plates.length} {t('plates')}</div>
          <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={rescan} title={t('Rescan')}>
            <span className="flex items-center gap-1"><RotateCw size={10} aria-hidden="true" /> {t('Rescan')}</span>
          </button>
        </div>
        <div
          className="max-h-[260px] overflow-y-auto rounded border border-border"
          role="listbox"
          aria-label={t('Separations plates')}
          aria-describedby="separations-plate-review-status"
          title={t('Use arrow keys to review separations plates')}
          onKeyDown={handlePlateKeys}
        >
          <div id="separations-plate-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedPlate || t('Separations plates')}`}
          </div>
          {plates.length === 0 && (
            <div className="p-3 text-[11px] text-muted">{t('No separable colors yet. Add spot or process colors, then rescan.')}</div>
          )}
          {plates.map((plate) => {
            const previewing = previewKey === plate.key;
            const review = `${plate.name} · ${kindLabel(plate.kind)} · ${plate.objects} ${t('objects')}`;
            return (
              <button
                key={plate.key}
                type="button"
                role="option"
                aria-selected={selectedKey === plate.key}
                aria-pressed={previewing}
                data-separations-plate-action
                data-review={review}
                onClick={() => togglePreview(plate)}
                onFocus={(event) => { setReviewedPlate(event.currentTarget.dataset.review ?? ''); setSelectedKey(plate.key); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors ${previewing ? 'bg-accent2/10' : 'hover:bg-panel3'} ${selectedKey === plate.key ? 'outline outline-1 outline-accent2' : ''}`}
                title={review}
              >
                <span className="w-4 h-4 rounded-sm border border-border shrink-0" style={{ backgroundColor: plate.hex }} aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate text-[11px] text-ink">{plate.name}</span>
                <span className={`px-1 rounded-sm border text-[9px] shrink-0 ${KIND_BADGE_CLASS[plate.kind]}`}>{kindLabel(plate.kind)}</span>
                <span className="text-[10px] text-muted tabular-nums shrink-0">{plate.objects}</span>
                {previewing
                  ? <Eye size={12} aria-hidden="true" className="text-accent2 shrink-0" />
                  : <EyeOff size={12} aria-hidden="true" className="text-muted shrink-0" />}
                <span className="sr-only">{t('Toggle plate preview')}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Export format')}</div>
          <ActionToolbar
            statusId="separations-format-review-status"
            className="flex gap-1"
            label={t('Separations export format')}
            title={t('Use arrow keys to review export formats')}
            onKeyDown={handleFormatKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedFormat}
            fallback={format.toUpperCase()}
          >
            {(['svg', 'png'] as const).map((value) => {
              const active = format === value;
              const label = value.toUpperCase();
              return (
                <button key={value} type="button"
                  data-separations-format-action
                  data-format={value}
                  data-review={label}
                  onFocus={(event) => setReviewedFormat(event.currentTarget.dataset.review ?? '')}
                  onClick={() => setFormat(value)}
                  aria-pressed={active}
                  className={`flex-1 px-2 py-0.5 rounded-sm border text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}>
                  {label}
                </button>
              );
            })}
          </ActionToolbar>
        </div>

        <p className="mt-2 text-[9px] leading-snug text-muted">
          {t('Gradients and patterns print as process — export them from the composite via File → Export.')}
          <br />
          {t('Raster images are not separated; they remain in the composite.')}
        </p>

        <ReviewedFooter
          statusId="separations-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Separations actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Separations actions')}
          actionAttr="data-separations-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Close'), review: t('Close'), className: 'btn', onClick: close },
            { children: t('Export Plate'), review: t('Export Plate'), className: 'btn', onClick: exportCurrentPlate },
            { children: t('Export All Plates'), review: t('Export All Plates'), className: 'btn-primary', onClick: exportAllPlates },
          ]}
        />
      </div>
    </div>
  );
}
