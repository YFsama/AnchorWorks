import { useCallback, useState } from 'react';
import { X, Download, Send, Loader2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { Scissors } from 'lucide-react';
import { buildPlotterOutput, defaultPlotterOptions, sendOverSerial, type HpglDialect, type PlotterOptions } from '../lib/plotter';
import { download } from '../lib/io';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

export function PlotterDialog() {
  const t = useT();
  const open = useEditor(s => s.showPlotter);
  const close = useCallback(() => useEditor.getState().setModal('showPlotter', false), []);
  const [opts, setOpts] = useState<PlotterOptions>(defaultPlotterOptions);
  const [format, setFormat] = useState<'gcode' | 'hpgl'>('gcode');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  // Surface which data source the dialog is going to ship. When cut paths
  // are present, buildPlotterOutput routes through them instead of the
  // canvas SVG — give the user a visible signal so they don't wonder why
  // the dialog ships geometry that doesn't match the visible objects.
  const cutPathCount = useEditor(s => s.cutPaths.length);

  // Escape close — capture phase, consistent with other dialogs.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  // Web Serial gate — `navigator.serial` is undefined on Safari, on non-HTTPS
  // pages, and inside many embedded-webviews. Detecting it here lets us
  // disable the "Send via USB" button proactively instead of letting the
  // user click and watch a toast error fire after the fact. Read once per
  // render; the API surface is binary-stable for the lifetime of the page.
  const isSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const generate = () => setPreview(buildPlotterOutput(format, opts));

  const send = async () => {
    setBusy(true);
    try {
      const out = preview || buildPlotterOutput(format, opts);
      await sendOverSerial(out);
      toast.success(t('✅ Sent to plotter'));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plotter-dialog-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[640px] max-w-[95%] shadow-2xl overflow-hidden">
        {/* Title row — consistent with Print / Templates dialogs. */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="plotter-dialog-title" className="dialog-title">{t('Send to Plotter / Cutter')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Field label={t('Format')}>
              <select className="input-num" value={format} onChange={(e) => setFormat(e.target.value as 'gcode' | 'hpgl')}>
                <option value="gcode">{t('G-code (CNC / pen plotter)')}</option>
                <option value="hpgl">{t('HP-GL / PLT (vinyl cutter)')}</option>
              </select>
            </Field>
            {format === 'hpgl' && (
              <Field label={t('Cutter dialect')}>
                <select
                  className="input-num"
                  value={opts.dialect}
                  onChange={(e) => setOpts({ ...opts, dialect: e.target.value as HpglDialect })}
                  title={t('Picks the wrapper commands. Bare = generic; Roland adds TB/CT/!PG; Graphtec adds FS/VS.')}
                >
                  <option value="bare">{t('Bare HP-GL (generic)')}</option>
                  <option value="roland-camm">{t('Roland CAMM (TB / CT / !PG)')}</option>
                  <option value="graphtec-fc">{t('Graphtec FC (FS / VS)')}</option>
                </select>
              </Field>
            )}
            <Field label={t('Unit')}>
              <select className="input-num" value={opts.unit} onChange={(e) => setOpts({ ...opts, unit: e.target.value as 'mm' | 'in', pxPerUnit: e.target.value === 'mm' ? 3.7795 : 96 })}>
                <option value="mm">{t('mm')}</option><option value="in">{t('inches')}</option>
              </select>
            </Field>
            <Field label={`${t('Feed rate')} (${opts.unit}/min)`}>
              <input type="number" className="input-num" value={opts.feedRate} onChange={(e) => setOpts({ ...opts, feedRate: +e.target.value })} />
            </Field>
            <Field label={`${t('Travel rate')} (${opts.unit}/min)`}>
              <input type="number" className="input-num" value={opts.travelRate} onChange={(e) => setOpts({ ...opts, travelRate: +e.target.value })} />
            </Field>
            <Field label={t('Pen down Z')}>
              <input type="number" step={0.1} className="input-num" value={opts.penDownZ} onChange={(e) => setOpts({ ...opts, penDownZ: +e.target.value })} />
            </Field>
            <Field label={t('Pen up Z')}>
              <input type="number" step={0.1} className="input-num" value={opts.penUpZ} onChange={(e) => setOpts({ ...opts, penUpZ: +e.target.value })} />
            </Field>
            <Field label={`${t('Paper height')} (${opts.unit})`}>
              <input type="number" className="input-num" value={opts.paperHeightUnits} onChange={(e) => setOpts({ ...opts, paperHeightUnits: +e.target.value })} />
            </Field>
            <Field label={t('Curve tolerance (px)')}>
              <input type="number" step={0.1} className="input-num" value={opts.curveTolerance} onChange={(e) => setOpts({ ...opts, curveTolerance: +e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 col-span-2 text-xs text-ink mt-1 cursor-pointer">
              <input type="checkbox" checked={opts.originBottomLeft} onChange={(e) => setOpts({ ...opts, originBottomLeft: e.target.checked })} />
              {t('Origin at bottom-left (CNC convention)')}
            </label>
          </div>

          {/* Output preview */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="field-label !mb-0">{t('Preview')}</h3>
              {cutPathCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-[#ff2e9a]" title={t('Output will use cut paths instead of canvas SVG.')}>
                  <Scissors size={10} aria-hidden="true" />
                  {cutPathCount} {t('cut paths')}
                </span>
              )}
            </div>
            <pre className="bg-panel2 border border-border rounded-sm p-2 h-44 overflow-auto text-[10px] font-mono text-ink/85">
              {preview || t('(click Generate Preview)')}
            </pre>
            <div className="text-[10px] text-muted mt-2">
              {t('USB serial works in Chrome/Edge over HTTPS or localhost via the Web Serial API.')}
            </div>
          </div>

          {/* Footer — Cancel on the left, then secondary, then primary on the far right. */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
            <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
            <div className="flex-1" />
            <button type="button" className="btn" onClick={generate}>{t('Generate Preview')}</button>
            <button
              type="button"
              className="btn flex items-center gap-1"
              onClick={() => download(
                // Roland-flavoured output ships as .plt by convention (matches what
                // cutter driver software expects); bare/Graphtec also typically use
                // .plt in the wild. Keep .hpgl as a fallback for the academic case.
                `design.${format === 'gcode' ? 'gcode' : (opts.dialect !== 'bare' ? 'plt' : 'hpgl')}`,
                preview || buildPlotterOutput(format, opts), 'text/plain',
              )}
            >
              <Download size={12} aria-hidden="true" />{t('Save File')}
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-1"
              onClick={send}
              disabled={busy || !isSerialSupported}
              aria-busy={busy}
              title={isSerialSupported
                ? undefined
                : t('USB serial works in Chrome/Edge over HTTPS or localhost via the Web Serial API.')}
            >
              {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Send size={12} aria-hidden="true" />}
              {/* Verb-tense change reinforces the in-progress state — needed
               *  under prefers-reduced-motion where the spinner is frozen. */}
              {busy ? t('Sending…') : t('Send via USB')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="field-label">{label}</div>
      {children}
    </label>
  );
}
