import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { resizeCanvas, setBackground, zoomFit } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import {
  PAPER_PRESETS, CATEGORY_LABELS, type PaperCategory,
  presetToPx, matchPreset, pxToMm,
} from '../lib/paperSizes';

const CATEGORY_ORDER: PaperCategory[] = ['print', 'card', 'sticker', 'screen'];

export function DocSettingsDialog() {
  const t = useT();
  const open = useEditor(s => s.showDocSettings);
  const close = useCallback(() => useEditor.getState().setModal('showDocSettings', false), []);
  const doc = useEditor(s => s.doc);
  const setDoc = useEditor(s => s.setDoc);

  // Preset selection is local UI state — the source of truth stays the px
  // width/height on `doc`. We seed the dropdown by reverse-matching the
  // current size so re-opening the dialog reflects reality instead of
  // snapping back to "Custom".
  const [presetId, setPresetId] = useState<string>('custom');
  const [landscape, setLandscape] = useState(false);

  // Re-seed the dropdown from the current size exactly once per open
  // transition. React's documented "adjust state when a prop changes"
  // pattern: store the previous `open` in state and reconcile during
  // render — no effect (which would fight the user on every width tweak)
  // and no ref access.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const m = matchPreset(doc.width, doc.height, doc.dpi);
      setPresetId(m?.id ?? 'custom');
      setLandscape(m?.landscape ?? doc.width > doc.height);
    }
  }

  // Escape closes — capture phase mirrors HelpCenter/AIPanel/Shortcuts pattern.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  const applyPreset = (id: string, land: boolean) => {
    setPresetId(id);
    setLandscape(land);
    if (id === 'custom') return;
    const preset = PAPER_PRESETS.find(p => p.id === id);
    if (!preset) return;
    const { width, height } = presetToPx(preset, doc.dpi, land);
    setDoc({ width, height });
  };

  // Live mm readout so the user understands the physical print size of
  // whatever px dimensions are in the fields. Screen presets render a large
  // mm figure (1080px ≈ huge at 96dpi) — that's expected and harmless.
  const wMm = pxToMm(doc.width, doc.dpi);
  const hMm = pxToMm(doc.height, doc.dpi);

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-settings-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[380px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="doc-settings-title" className="dialog-title">{t('Document Settings')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <Field label={t('Preset size')}>
          <select
            className="input-num"
            value={presetId}
            onChange={(e) => applyPreset(e.target.value, landscape)}
          >
            <option value="custom">{t('Custom')}</option>
            {CATEGORY_ORDER.map(cat => (
              <optgroup key={cat} label={t(CATEGORY_LABELS[cat])}>
                {PAPER_PRESETS.filter(p => p.category === cat).map(p => (
                  <option key={p.id} value={p.id}>{t(p.label)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {/* Orientation — disabled for square / custom where it's a no-op. */}
        <Field label={t('Orientation')}>
          <div className="flex gap-1">
            <OrientBtn active={!landscape} onClick={() => applyPreset(presetId, false)} label={t('Portrait')} />
            <OrientBtn active={landscape} onClick={() => applyPreset(presetId, true)} label={t('Landscape')} />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Width (px)')}>
            <input
              type="number" className="input-num" value={doc.width}
              onChange={(e) => { setDoc({ width: +e.target.value }); setPresetId('custom'); }}
            />
          </Field>
          <Field label={t('Height (px)')}>
            <input
              type="number" className="input-num" value={doc.height}
              onChange={(e) => { setDoc({ height: +e.target.value }); setPresetId('custom'); }}
            />
          </Field>
        </div>

        {/* Physical-size readout — the bridge between px authoring and the
            print/cut workflow that thinks in millimetres. */}
        <div className="text-[10px] text-muted -mt-1 mb-2 tabular-nums">
          ≈ {wMm.toFixed(1)} × {hMm.toFixed(1)} mm @ {doc.dpi} DPI
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('DPI')}>
            <input
              type="number" className="input-num" value={doc.dpi}
              onChange={(e) => setDoc({ dpi: +e.target.value })}
            />
          </Field>
          <Field label={t('Background')}>
            <input
              type="color"
              value={doc.background}
              onChange={(e) => setDoc({ background: e.target.value })}
              className="input-num p-0.5 h-7 w-full cursor-pointer"
              aria-label={t('Background')}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => { resizeCanvas(doc.width, doc.height); setBackground(doc.background); zoomFit(); close(); }}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}

function OrientBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${
        active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
