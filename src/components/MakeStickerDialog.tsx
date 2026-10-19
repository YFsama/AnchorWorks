import { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { X, Sticker } from 'lucide-react';
import { useEditor, type CutPath } from '../store/editor';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import { makeSticker, MAKE_STICKER_PRESETS } from '../lib/makeSticker';
import { buildBleedImage } from '../lib/bleedExpand';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

type UnderlayMode = 'white' | 'none' | 'custom';
type CutKind = Extract<CutPath['kind'], 'outline' | 'kiss' | 'perf'>;

/**
 * Make Sticker (Sticker Mule / Cricut "Create Sticker" workflow): weld the
 * selection, round-join offset it outward by the border width, print the
 * offset ring in white UNDER the art, and cut along the same ring. The
 * geometry comes from lib/makeSticker; this dialog only collects the
 * border / underlay / cut-type / passes options and inserts the result.
 */
export function MakeStickerDialog() {
  const t = useT();
  const open = useEditor(s => s.showMakeSticker);
  const close = useCallback(() => useEditor.getState().setModal('showMakeSticker', false), []);
  const [borderMm, setBorderMm] = useState(2.54);
  const [underlayMode, setUnderlayMode] = useState<UnderlayMode>('white');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [cutKind, setCutKind] = useState<CutKind>('outline');
  const [passes, setPasses] = useState(1);
  const [bleedMm, setBleedMm] = useState(0);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);

  // Guard on open: the sticker workflow needs a selection to weld/offset.
  // Menu/palette/context entries already guard, but the Ctrl+Alt+K keybinding
  // and programmatic opens land here unguarded — mirror the toast + close.
  useEffect(() => {
    if (!open) return;
    if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) {
      toast.warn(t('Select something first.'), { title: t('Make Sticker') });
      close();
    }
  }, [open, t, close]);

  if (!open) return null;

  const underlayForMode = (mode: UnderlayMode): string =>
    mode === 'white' ? 'white' : mode === 'none' ? 'none' : customColor;

  const applyPreset = (preset: { borderMm: number; underlay: 'white' | 'none' | string }) => {
    setBorderMm(preset.borderMm);
    if (preset.underlay === 'white') setUnderlayMode('white');
    else if (preset.underlay === 'none') setUnderlayMode('none');
    else {
      setUnderlayMode('custom');
      setCustomColor(preset.underlay);
    }
  };

  const resetStickerSettings = () => {
    setBorderMm(2.54);
    setUnderlayMode('white');
    setCustomColor('#ffffff');
    setCutKind('outline');
    setPasses(1);
    setBleedMm(0);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset sticker settings'));
  };

  // Live summary — "White border 2.5 mm · round joins · die-cut contour".
  const underlaySummary = underlayMode === 'white'
    ? t('White border')
    : underlayMode === 'none'
      ? t('Border')
      : t('Custom border');
  const cutSummary = cutKind === 'outline'
    ? t('die-cut contour')
    : cutKind === 'kiss'
      ? t('kiss-cut contour')
      : t('perf-cut border');

  const apply = async () => {
    const c = getCanvas();
    const selected = c?.getActiveObjects() ?? [];
    if (!c || !selected.length) {
      toast.warn(t('Select something first.'), { title: t('Make Sticker') });
      return;
    }
    const result = makeSticker(selected, {
      borderMm,
      underlay: underlayForMode(underlayMode),
      cutKind,
      passes,
    });
    if (!result.cutPaths.length) {
      toast.warn(t('No outline to offset — select vector art.'), { title: t('Make Sticker') });
      return;
    }

    // Ink bleed (Cricut-style edge-pixel smear): rasterize the selection and
    // ring-draw it outward by bleedMm. Runs even without an underlay — full-
    // bleed stickers need it most. Raster failure → warn and continue.
    let bleedImg: fabric.FabricImage | null = null;
    if (bleedMm > 0) {
      const bleed = await buildBleedImage(selected, { bleedMm });
      if (bleed) {
        try {
          bleedImg = await fabric.FabricImage.fromURL(bleed.url, { crossOrigin: null });
          // Placement rect is canvas-px but the bitmap is multiplier× larger —
          // scale back down (rasterize.ts's 1/multiplier placement idiom).
          const s = 1 / bleed.multiplier;
          bleedImg.set({ left: bleed.leftPx, top: bleed.topPx, scaleX: s, scaleY: s });
          bleedImg.setCoords();
        } catch {
          bleedImg = null;
        }
      }
      if (!bleedImg) {
        toast.warn(t('Bleed raster failed — sticker created without bleed.'), { title: t('Make Sticker') });
      }
    }

    if (result.underlayD && result.underlayFill) {
      const underlayPath = new fabric.Path(result.underlayD, {
        fill: result.underlayFill,
        selectable: true,
        objectCaching: false,
        stroke: null,
      });
      // Insert DIRECTLY BEHIND the bottom-most selected object — public
      // fabric v6 stack API (same moveObjectTo idiom blend.ts uses), with
      // the insertion index snapshotted before the add shifts the stack.
      // Group-child selections have no top-level index (indexOf -1): fall
      // back to the very back so the underlay still lands behind the art.
      const stack = c.getObjects();
      const indices = selected.map(o => stack.indexOf(o)).filter(i => i >= 0);
      const bottomIndex = indices.length ? Math.min(...indices) : 0;
      const active = c.getActiveObject();
      c.add(underlayPath);
      c.moveObjectTo(underlayPath, bottomIndex);
      // Keep the selection on the art, never on the new underlay ring.
      if (active && c.getActiveObject() !== active) c.setActiveObject(active);
    }

    // Bleed raster goes VERY BACK — inserted AFTER the underlay so index 0
    // always lands it below the underlay (including the group-child fallback
    // case where the underlay itself went to the very back): z-order
    // bleed < underlay < art.
    if (bleedImg) {
      c.add(bleedImg);
      c.moveObjectTo(bleedImg, 0);
    }

    const ed = useEditor.getState();
    ed.addCutPaths(result.cutPaths);
    ed.setCutPathsVisible(true);
    c.requestRenderAll();
    pushHistory();
    toast.success(t('Sticker created — contour added to cut paths'), { title: t('Make Sticker') });
    close();
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-sticker-action]',
    reviewKey: actionReviewKey('data-sticker-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-sticker-preset-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (_button, index) => {
      const preset = MAKE_STICKER_PRESETS[index];
      if (preset) applyPreset(preset);
    },
  });

  const CUT_TYPES: { id: CutKind; label: string; hint: string }[] = [
    { id: 'outline', label: t('Die-cut'), hint: t('Cuts through the full stack along the offset contour.') },
    { id: 'kiss', label: t('Kiss-cut'), hint: t('Cuts the sticker layer only — the carrier sheet stays intact.') },
    { id: 'perf', label: t('Perf border'), hint: t('Through-cut border released last so the sheet stays anchored.') },
  ];
  const activeHint = CUT_TYPES.find(ct => ct.id === cutKind)?.hint ?? '';

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[380px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="sticker-title" className="dialog-title flex items-center gap-2">
            <Sticker size={14} aria-hidden="true" /> {t('Make Sticker')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label">{t('Border (mm)')}</div>
            <input
              type="number" min={0} max={20} step={0.1} value={borderMm}
              onChange={(e) => setBorderMm(Math.max(0, Math.min(20, +e.target.value || 0)))}
              className="input-num w-full" aria-label={t('Border (mm)')}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('Passes')}</div>
            <input
              type="number" min={1} max={5} step={1} value={passes}
              onChange={(e) => setPasses(Math.max(1, Math.min(5, Math.round(+e.target.value || 1))))}
              className="input-num w-full" aria-label={t('Passes')}
            />
          </label>
        </div>

        <label className="mt-3 block">
          <div className="field-label">{t('Bleed (mm)')}</div>
          <input
            type="number" min={0} max={5} step={0.1} value={bleedMm}
            onChange={(e) => setBleedMm(Math.max(0, Math.min(5, +e.target.value || 0)))}
            className="input-num w-full" aria-label={t('Bleed (mm)')}
          />
          <div className="mt-1 type-caption text-muted">
            {t('Print-then-cut ink bleed — edge pixels smeared outward (Cricut-style)')}
          </div>
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Underlay')}</div>
          <div className="flex gap-1" role="radiogroup" aria-label={t('Underlay')}>
            {([
              { id: 'white' as UnderlayMode, label: t('White') },
              { id: 'none' as UnderlayMode, label: t('None') },
              { id: 'custom' as UnderlayMode, label: t('Custom') },
            ]).map(mode => (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={underlayMode === mode.id}
                className={`flex-1 ${underlayMode === mode.id ? 'btn-primary' : 'btn'}`}
                onClick={() => setUnderlayMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {underlayMode === 'custom' && (
            <label className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-6 w-10 rounded border border-border bg-transparent cursor-pointer"
                aria-label={t('Custom underlay colour')}
              />
              <span className="text-[10px] text-muted tabular-nums">{customColor}</span>
            </label>
          )}
        </div>

        <div className="mt-3">
          <div className="field-label">{t('Cut type')}</div>
          <div className="flex gap-1" role="radiogroup" aria-label={t('Cut type')}>
            {CUT_TYPES.map(ct => (
              <button
                key={ct.id}
                type="button"
                role="radio"
                aria-checked={cutKind === ct.id}
                title={ct.hint}
                className={`flex-1 ${cutKind === ct.id ? 'btn-primary' : 'btn'}`}
                onClick={() => setCutKind(ct.id)}
              >
                {ct.label}
              </button>
            ))}
          </div>
          <div className="mt-1 type-caption text-muted" aria-live="polite">{activeHint}</div>
        </div>

        <div className="mt-3">
          <div className="field-label">{t('Sticker presets')}</div>
          <PresetRow
            statusId="sticker-preset-review-status"
            className="grid grid-cols-2 gap-1"
            label={t('Sticker preset actions')}
            title={t('Use arrow keys to review sticker presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPreset}
            fallback={`${t('Border (mm)')} ${borderMm} · ${underlaySummary}`}
            actionAttr="data-sticker-preset-action"
            setReviewed={setReviewedPreset}
            items={MAKE_STICKER_PRESETS.map((preset) => {
              const mode: UnderlayMode = preset.underlay === 'white' ? 'white' : preset.underlay === 'none' ? 'none' : 'custom';
              const active = borderMm === preset.borderMm && underlayMode === mode
                && (mode !== 'custom' || customColor.toLowerCase() === String(preset.underlay).toLowerCase());
              const underlayLabel = mode === 'white' ? t('White') : mode === 'none' ? t('None') : String(preset.underlay);
              return {
                key: preset.id,
                className: `px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`,
                pressed: active,
                onClick: () => applyPreset(preset),
                title: `${t(preset.label)}`,
                data: { review: `${t(preset.label)} · ${t('Border (mm)')} ${preset.borderMm}` },
                children: (
                  <>
                    <span className="block font-medium">{t(preset.label)}</span>
                    <span className="block tabular-nums">{preset.borderMm} mm · {underlayLabel}</span>
                  </>
                ),
              };
            })}
          />
        </div>

        {/* Live summary — reflects every control as the sticker will be built. */}
        <div className="mt-3 text-[10px] text-muted tabular-nums" aria-live="polite">
          {`${underlaySummary} ${borderMm.toFixed(1)} mm · ${t('round joins')} · ${cutSummary}`
            + (bleedMm > 0 ? ` · ${t('bleed')} ${bleedMm.toFixed(1)} mm` : '')}
        </div>

        <ReviewedFooter
          statusId="sticker-action-review-status"
          className="flex justify-end gap-2 mt-4"
          label={t('Make Sticker actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Make Sticker actions')}
          actionAttr="data-sticker-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset sticker settings'), className: 'btn', onClick: resetStickerSettings, title: t('Reset sticker settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}
