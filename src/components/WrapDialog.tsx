import { useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { X, Cylinder } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import { cylinderWrap, coneSector, sphereGore, SURFACE_WRAP_PRESETS, type CylinderWrap, type ConeWrap, type SphereGore } from '../lib/surfaceWrap';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

const MM_TO_PX = 3.7795; // 96dpi — the cutter/print pipeline's shared factor

type WrapKind = 'cylinder' | 'cone' | 'gore';
type WrapResult = CylinderWrap | ConeWrap | SphereGore;

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-xs cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * Surface Wrap (曲面贴花/涂装): unwrap a cylinder, cone frustum, or sphere
 * into the flat development you actually cut — a π·D label strip, an annular
 * sector, or one sphere gore. The math lives in lib/surfaceWrap; Apply draws
 * the development as a dashed guide on the canvas and/or adds it as a manual
 * cut path sized in document mm.
 */
export function WrapDialog() {
  const t = useT();
  const open = useEditor(s => s.showSurfaceWrap);
  const close = useCallback(() => useEditor.getState().setModal('showSurfaceWrap', false), []);
  const [kind, setKind] = useState<WrapKind>('cylinder');
  // Cylinder (defaults = straight-bottle preset).
  const [cylDiameter, setCylDiameter] = useState(70);
  const [cylHeight, setCylHeight] = useState(160);
  const [cylOverlap, setCylOverlap] = useState(5);
  // Cone / frustum.
  const [coneBottom, setConeBottom] = useState(95);
  const [coneTop, setConeTop] = useState(82);
  const [coneSlant, setConeSlant] = useState(110);
  const [coneOverlapDeg, setConeOverlapDeg] = useState(0);
  // Sphere gore.
  const [goreDiameter, setGoreDiameter] = useState(80);
  const [goreSegments, setGoreSegments] = useState(12);
  const [addCut, setAddCut] = useState(true);
  const [addGuide, setAddGuide] = useState(true);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  /** Run the unwrap math for the current fields; null when the dims are
   *  invalid (coneSector throws when bottom Ø ≤ top Ø, etc.). */
  const computeWrap = (): WrapResult | null => {
    try {
      if (kind === 'cylinder') return cylinderWrap(cylDiameter, cylHeight, { overlapMm: cylOverlap });
      if (kind === 'gore') return sphereGore(goreDiameter, goreSegments);
      return coneSector(coneBottom, coneTop, coneSlant, { overlapDeg: coneOverlapDeg });
    } catch {
      return null;
    }
  };

  const applyPreset = (preset: { kind: WrapKind; dims: Record<string, number> }) => {
    setKind(preset.kind);
    if (preset.kind === 'cylinder') {
      setCylDiameter(preset.dims.diameter ?? cylDiameter);
      setCylHeight(preset.dims.height ?? cylHeight);
      setCylOverlap(preset.dims.overlap ?? 0);
    } else if (preset.kind === 'gore') {
      setGoreDiameter(preset.dims.diameter ?? goreDiameter);
      setGoreSegments(preset.dims.segments ?? goreSegments);
    } else {
      setConeBottom(preset.dims.bottomDiameter ?? coneBottom);
      setConeTop(preset.dims.topDiameter ?? coneTop);
      setConeSlant(preset.dims.slantHeight ?? coneSlant);
      setConeOverlapDeg(0);
    }
  };

  const resetWrapSettings = () => {
    applyPreset(SURFACE_WRAP_PRESETS[0]);
    setAddCut(true);
    setAddGuide(true);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset wrap settings'));
  };

  const apply = () => {
    const c = getCanvas();
    if (!c) return;
    const result = computeWrap();
    if (!result) {
      toast.warn(t('Bottom diameter must exceed top diameter.'), { title: t('Surface Wrap') });
      return;
    }

    if (addGuide) {
      // mm → px, then one dashed guide path centered on the document (doc
      // center minus half the outline bbox — the template placement
      // convention) so the development lands where the user is looking.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of result.outline) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const f = (v: number) => String(Math.round(v * MM_TO_PX * 1000) / 1000);
      const d = result.outline
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${f(x)} ${f(y)}`)
        .join(' ') + ' Z';
      const doc = useEditor.getState().doc;
      const guide = new fabric.Path(d, {
        fill: null,
        stroke: '#ff2e9a',
        strokeWidth: 1,
        strokeDashArray: [8, 6],
        selectable: true,
        objectCaching: false,
      });
      guide.set({
        left: doc.width / 2 - (maxX - minX) * MM_TO_PX / 2 - minX * MM_TO_PX,
        top: doc.height / 2 - (maxY - minY) * MM_TO_PX / 2 - minY * MM_TO_PX,
      });
      guide.setCoords();
      c.add(guide);
    }

    if (addCut) {
      useEditor.getState().addCutPaths([{
        id: `wrap-${Date.now().toString(36)}-0`,
        points: result.outline,
        closed: true,
        kind: 'manual',
        passes: 1,
      }]);
      useEditor.getState().setCutPathsVisible(true);
    }

    c.requestRenderAll();
    pushHistory();
    toast.success(t('Surface wrap added'), { title: t('Surface Wrap') });
    close();
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-wrap-action]',
    reviewKey: actionReviewKey('data-wrap-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-wrap-preset-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (_button, index) => {
      const preset = SURFACE_WRAP_PRESETS[index];
      if (preset) applyPreset(preset);
    },
  });

  const WRAP_TYPES: { id: WrapKind; label: string }[] = [
    { id: 'cylinder', label: t('Cylinder') },
    { id: 'cone', label: t('Cone (frustum)') },
    { id: 'gore', label: t('Sphere gore') },
  ];

  // Live readout per wrap type — "—" when the current dims don't unwrap.
  const result = computeWrap();
  const readout = kind === 'cylinder'
    ? (result?.type === 'cylinder'
      ? `${t('Flat size')} ${result.widthMm.toFixed(1)} × ${result.heightMm.toFixed(1)} mm`
      : '—')
    : kind === 'gore'
      ? (result?.type === 'gore'
        ? `${t('Gore height')} ${result.heightMm.toFixed(1)} mm · ${t('max width')} ${result.maxWidthMm.toFixed(1)} mm`
        : '—')
      : (result?.type === 'cone'
        ? `R ${result.RMm.toFixed(1)} · r ${result.rMm.toFixed(1)} · θ ${result.thetaDeg.toFixed(1)}°`
        : t('Bottom diameter must exceed top diameter.'));

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wrap-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[380px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="wrap-title" className="dialog-title flex items-center gap-2">
            <Cylinder size={14} aria-hidden="true" /> {t('Surface Wrap')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="flex gap-1 mb-3" role="radiogroup" aria-label={t('Wrap type')}>
          {WRAP_TYPES.map(wt => (
            <button
              key={wt.id}
              type="button"
              role="radio"
              aria-checked={kind === wt.id}
              className={`flex-1 ${kind === wt.id ? 'btn-primary' : 'btn'}`}
              onClick={() => setKind(wt.id)}
            >
              {wt.label}
            </button>
          ))}
        </div>

        {kind === 'cylinder' && (
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <div className="field-label">{t('Diameter (mm)')}</div>
              <input type="number" min={1} step={1} value={cylDiameter} onChange={(e) => setCylDiameter(Math.max(1, +e.target.value || 1))} className="input-num w-full" aria-label={t('Diameter (mm)')} />
            </label>
            <label className="block">
              <div className="field-label">{t('Height (mm)')}</div>
              <input type="number" min={1} step={1} value={cylHeight} onChange={(e) => setCylHeight(Math.max(1, +e.target.value || 1))} className="input-num w-full" aria-label={t('Height (mm)')} />
            </label>
            <label className="block">
              <div className="field-label">{t('Overlap (mm)')}</div>
              <input type="number" min={0} max={30} step={1} value={cylOverlap} onChange={(e) => setCylOverlap(Math.max(0, Math.min(30, +e.target.value || 0)))} className="input-num w-full" aria-label={t('Overlap (mm)')} />
            </label>
          </div>
        )}

        {kind === 'cone' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="field-label">{t('Bottom Ø (mm)')}</div>
              <input type="number" min={1} step={1} value={coneBottom} onChange={(e) => setConeBottom(Math.max(1, +e.target.value || 1))} className="input-num w-full" aria-label={t('Bottom Ø (mm)')} />
            </label>
            <label className="block">
              <div className="field-label">{t('Top Ø (mm)')}</div>
              <input type="number" min={0} step={1} value={coneTop} onChange={(e) => setConeTop(Math.max(0, +e.target.value || 0))} className="input-num w-full" aria-label={t('Top Ø (mm)')} />
            </label>
            <label className="block">
              <div className="field-label">{t('Slant height (mm)')}</div>
              <input type="number" min={1} step={1} value={coneSlant} onChange={(e) => setConeSlant(Math.max(1, +e.target.value || 1))} className="input-num w-full" aria-label={t('Slant height (mm)')} />
            </label>
            <label className="block">
              <div className="field-label">{t('Overlap (°)')}</div>
              <input type="number" min={0} max={30} step={1} value={coneOverlapDeg} onChange={(e) => setConeOverlapDeg(Math.max(0, Math.min(30, +e.target.value || 0)))} className="input-num w-full" aria-label={t('Overlap (°)')} />
            </label>
          </div>
        )}

        {kind === 'gore' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="field-label">{t('Sphere Ø (mm)')}</div>
              <input type="number" min={1} step={1} value={goreDiameter} onChange={(e) => setGoreDiameter(Math.max(1, +e.target.value || 1))} className="input-num w-full" aria-label={t('Sphere Ø (mm)')} />
            </label>
            <label className="block">
              <div className="field-label">{t('Segments (4–24)')}</div>
              <input type="number" min={4} max={24} step={1} value={goreSegments} onChange={(e) => setGoreSegments(Math.max(4, Math.min(24, Math.round(+e.target.value || 4))))} className="input-num w-full" aria-label={t('Segments (4–24)')} />
            </label>
          </div>
        )}

        {/* Live readout — the flat development the current dims produce. */}
        <div className="mt-2 text-[10px] text-muted tabular-nums" aria-live="polite">{readout}</div>
        {kind === 'cone' && (
          <div className="mt-1 type-caption text-muted">{t('Cut test-fit vinyl before the final wrap.')}</div>
        )}

        <div className="mt-3">
          <div className="field-label">{t('Wrap presets')}</div>
          <PresetRow
            statusId="wrap-preset-review-status"
            className="grid grid-cols-2 gap-1"
            label={t('Wrap preset actions')}
            title={t('Use arrow keys to review wrap presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPreset}
            fallback={`${t('Wrap type')} ${t(kind === 'cylinder' ? 'Cylinder' : kind === 'cone' ? 'Cone (frustum)' : 'Sphere gore')}`}
            actionAttr="data-wrap-preset-action"
            setReviewed={setReviewedPreset}
            items={SURFACE_WRAP_PRESETS.map((preset) => {
              const active = kind === preset.kind
                && (preset.kind !== 'cylinder' || (cylDiameter === preset.dims.diameter && cylHeight === preset.dims.height && cylOverlap === preset.dims.overlap))
                && (preset.kind !== 'cone' || (coneBottom === preset.dims.bottomDiameter && coneTop === preset.dims.topDiameter && coneSlant === preset.dims.slantHeight))
                && (preset.kind !== 'gore' || (goreDiameter === preset.dims.diameter && goreSegments === preset.dims.segments));
              const typeLabel = preset.kind === 'cylinder' ? t('Cylinder') : preset.kind === 'cone' ? t('Cone (frustum)') : t('Sphere gore');
              return {
                key: preset.id,
                className: `px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`,
                pressed: active,
                onClick: () => applyPreset(preset),
                title: t(preset.label),
                data: { review: `${t(preset.label)} · ${typeLabel}` },
                children: (
                  <>
                    <span className="block font-medium">{t(preset.label)}</span>
                    <span className="block">{typeLabel}</span>
                  </>
                ),
              };
            })}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <ToggleRow label={t('Add as cut path')} checked={addCut} onChange={setAddCut} />
          <ToggleRow label={t('Guide outline on canvas')} checked={addGuide} onChange={setAddGuide} />
        </div>

        <ReviewedFooter
          statusId="wrap-action-review-status"
          className="flex justify-end gap-2 mt-4"
          label={t('Surface Wrap actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Surface Wrap actions')}
          actionAttr="data-wrap-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset wrap settings'), className: 'btn', onClick: resetWrapSettings, title: t('Reset wrap settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply, disabled: !addCut && !addGuide },
          ]}
        />
      </div>
    </div>
  );
}
