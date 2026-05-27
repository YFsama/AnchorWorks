import { useCallback, useState } from 'react';
import { X, Printer, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { useEditor } from '../store/editor';
import { printCanvas, type PrintOptions } from '../lib/printer';
import { exportPDFReal } from '../lib/io2';
import { defaultPrintPrep, type PrintPrep } from '../lib/printPrep';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

export function PrintDialog() {
  const t = useT();
  const open = useEditor(s => s.showPrint);
  const close = useCallback(() => useEditor.getState().setModal('showPrint', false), []);
  const [opts, setOpts] = useState<PrintOptions>({ pageSize: 'A4', orientation: 'portrait', fit: 'fit', marginMm: 10 });
  const [prep, setPrep] = useState<PrintPrep>(defaultPrintPrep);
  const [prepOpen, setPrepOpen] = useState(false);

  // Escape close — capture phase, consistent with the rest of the dialog system.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  const prepActive = prep.cropMarks || prep.registrationMarks || prep.pageInfo || prep.bleedMm > 0;
  const handlePrint = () => {
    printCanvas(opts, prepActive ? prep : undefined);
    close();
  };
  const handlePDF = () => {
    void exportPDFReal({ pageSize: opts.pageSize, orientation: opts.orientation, prep: prepActive ? prep : undefined });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-dialog-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="print-dialog-title" className="dialog-title">{t('Print')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
        <Field label={t('Page size')}>
          <select className="input-num" value={opts.pageSize} onChange={(e) => setOpts({ ...opts, pageSize: e.target.value as PrintOptions['pageSize'] })}>
            <option>A4</option><option>A3</option><option>Letter</option><option>Legal</option>
          </select>
        </Field>
        <Field label={t('Orientation')}>
          <select className="input-num" value={opts.orientation} onChange={(e) => setOpts({ ...opts, orientation: e.target.value as PrintOptions['orientation'] })}>
            <option value="portrait">{t('Portrait')}</option><option value="landscape">{t('Landscape')}</option>
          </select>
        </Field>
        <Field label={t('Scaling')}>
          <select className="input-num" value={opts.fit} onChange={(e) => setOpts({ ...opts, fit: e.target.value as PrintOptions['fit'] })}>
            <option value="actual">{t('Actual size')}</option>
            <option value="fit">{t('Fit to page')}</option>
            <option value="fill">{t('Fill page')}</option>
          </select>
        </Field>
        <Field label={t('Margin (mm)')}>
          <input type="number" className="input-num" value={opts.marginMm} onChange={(e) => setOpts({ ...opts, marginMm: +e.target.value })} />
        </Field>

        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setPrepOpen(o => !o)}
            className="w-full flex items-center justify-between field-label !mb-0 text-[11px] hover:text-ink transition-colors"
            aria-expanded={prepOpen}
            aria-controls="print-prep-body"
          >
            <span className="flex items-center gap-1">
              {prepOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
              {t('Print Prep')}
            </span>
            {prepActive && !prepOpen && <span className="text-[10px] text-success normal-case tracking-normal">{t('on')}</span>}
          </button>
          {prepOpen && (
            <div id="print-prep-body" className="mt-2 space-y-2">
              <Field label={t('Bleed (mm)')}>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  className="input-num"
                  value={prep.bleedMm}
                  onChange={(e) => {
                    const v = Math.min(10, Math.max(0, Number(e.target.value) || 0));
                    setPrep({ ...prep, bleedMm: v });
                  }}
                />
              </Field>
              <ToggleRow
                label={t('Crop marks')}
                checked={prep.cropMarks}
                onChange={(v) => setPrep({ ...prep, cropMarks: v })}
              />
              <ToggleRow
                label={t('Registration marks')}
                checked={prep.registrationMarks}
                onChange={(v) => setPrep({ ...prep, registrationMarks: v })}
              />
              <ToggleRow
                label={t('Page info')}
                checked={prep.pageInfo}
                onChange={(v) => setPrep({ ...prep, pageInfo: v })}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button
            type="button"
            className="btn flex items-center gap-1"
            onClick={handlePDF}
            title={t('Save as vector PDF (skips the system print dialog)')}
          ><FileText size={12} aria-hidden="true" /> PDF</button>
          <button type="button" className="btn-primary flex items-center gap-1" onClick={handlePrint}><Printer size={12} aria-hidden="true" /> {t('Print')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-xs cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
