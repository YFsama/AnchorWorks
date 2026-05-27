import { useCallback } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { resizeCanvas, setBackground, zoomFit } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

export function DocSettingsDialog() {
  const t = useT();
  const open = useEditor(s => s.showDocSettings);
  const close = useCallback(() => useEditor.getState().setModal('showDocSettings', false), []);
  const doc = useEditor(s => s.doc);
  const setDoc = useEditor(s => s.setDoc);

  // Escape closes — capture phase mirrors HelpCenter/AIPanel/Shortcuts pattern.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-settings-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="doc-settings-title" className="dialog-title">{t('Document Settings')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
        <Field label={t('Width (px)')}>
          <input type="number" className="input-num" value={doc.width} onChange={(e) => setDoc({ width: +e.target.value })} />
        </Field>
        <Field label={t('Height (px)')}>
          <input type="number" className="input-num" value={doc.height} onChange={(e) => setDoc({ height: +e.target.value })} />
        </Field>
        <Field label={t('DPI')}>
          <input type="number" className="input-num" value={doc.dpi} onChange={(e) => setDoc({ dpi: +e.target.value })} />
        </Field>
        <Field label={t('Background')}>
          <input
            type="color"
            value={doc.background}
            onChange={(e) => setDoc({ background: e.target.value })}
            className="input-num p-0.5 h-7 w-12 cursor-pointer"
            aria-label={t('Background')}
          />
        </Field>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => { resizeCanvas(doc.width, doc.height); setBackground(doc.background); zoomFit(); close(); }}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
