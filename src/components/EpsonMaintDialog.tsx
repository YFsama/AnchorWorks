/**
 * Epson inkjet maintenance workbench.
 *
 * Picks an installed printer (spooler list), then runs maintenance
 * actions over RAW spooler jobs: initialize, head cleaning, nozzle
 * check, test print — plus a hex workbench for pasting model-specific
 * community templates (counter resets are model-specific and NOT built
 * in; every custom send is labelled and logged). All TX/RX traffic
 * lands in a hex console for evidence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Printer, Send, Trash2, AlertTriangle, FlaskConical } from 'lucide-react';
import { useEditor } from '../store/editor';
import { isTauri } from '../lib/runtime';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import {
  EPSON_ACTIONS, EPSON_TEMPLATES, epsonTransact, explainEpsonReply,
  listEpsonPrinters, loadEpsonPrefs, saveEpsonPrefs,
  type EpsonAction, type EpsonPrinter,
} from '../lib/epsonMaint';

interface LogEntry {
  id: number;
  ts: number;
  dir: 'tx' | 'rx' | 'info' | 'err';
  text: string;
}

let logSeq = 1;
const nowMs = (): number => Date.now();

export default function EpsonMaintDialog() {
  const t = useT();
  const open = useEditor(s => s.showEpsonMaint);
  const close = useCallback(() => useEditor.getState().setModal('showEpsonMaint', false), []);
  const native = isTauri();

  const [printers, setPrinters] = useState<EpsonPrinter[]>([]);
  const [printer, setPrinter] = useState(loadEpsonPrefs().printer ?? '');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [customHex, setCustomHex] = useState(loadEpsonPrefs().lastCustomHex ?? '');
  const [expectReply, setExpectReply] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => printers.find(p => p.name === printer) ?? null, [printers, printer]);
  const epsonPrinters = useMemo(() => printers.filter(p => p.isEpson), [printers]);
  const others = useMemo(() => printers.filter(p => !p.isEpson), [printers]);

  const push = (dir: LogEntry['dir'], text: string) => {
    setEntries(prev => [...prev.slice(-199), { id: logSeq++, ts: nowMs(), dir, text }]);
  };

  const refresh = useCallback(async () => {
    if (!native) return;
    setLoading(true);
    try {
      const list = await listEpsonPrinters();
      setPrinters(list);
      if (list.length > 0 && !list.some(p => p.name === printer)) {
        const first = list.find(p => p.isEpson) ?? list[0];
        setPrinter(first.name);
      }
      if (list.length === 0) push('info', t('No printers found — install the printer driver first.'));
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [native, printer, t]);

  useEffect(() => {
    if (!open || !native) return;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, native]);

  useEffect(() => { saveEpsonPrefs({ printer }); }, [printer]);
  useEffect(() => { saveEpsonPrefs({ lastCustomHex: customHex }); }, [customHex]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const run = async (label: string, hex: string, wantsReply: boolean) => {
    if (!printer) { toast.warn(t('Pick a printer first.'), { title: t('Epson maintenance') }); return; }
    if (!hex.trim()) { toast.warn(t('The command is empty.')); return; }
    setBusy(true);
    push('tx', `${label} · ${hex.replace(/\s+/g, ' ')}`);
    try {
      const reply = await epsonTransact(printer, hex, wantsReply ? 800 : 250);
      if (reply.length > 0) push('rx', explainEpsonReply(reply));
      else if (wantsReply) push('info', t('No reply (see the warning above about model-specific queries).'));
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action: EpsonAction) => { void run(action.label, action.hex, action.expectsReply); };

  const applyTemplate = (id: string) => {
    const tpl = EPSON_TEMPLATES.find(x => x.id === id);
    if (tpl) setCustomHex(tpl.hex);
  };

  const safetyClass = (safety: string) =>
    safety === 'documented' ? 'text-success' : safety === 'experimental' ? 'text-warning' : 'text-muted';

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="epson-maint-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[560px] max-w-[96%] max-h-[92%] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="epson-maint-title" className="dialog-title flex items-center gap-2">
            <Printer size={14} aria-hidden="true" className="text-[#ff2e9a]" />
            {t('Epson maintenance')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-3 text-xs">
          {!native && (
            <div className="mb-2 rounded border border-warning/50 bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
              {t('Epson maintenance needs the Windows desktop app (RAW spooler jobs).')}
            </div>
          )}

          {/* Printer picker */}
          <div className="flex items-center gap-1.5">
            <select
              className="input flex-1"
              value={printer}
              onChange={(e) => setPrinter(e.target.value)}
              disabled={loading}
              aria-label={t('Printer')}
            >
              {epsonPrinters.length > 0 && (
                <optgroup label="Epson">
                  {epsonPrinters.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={t('Other printers')}>
                  {others.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </optgroup>
              )}
              {printers.length === 0 && <option value="">{loading ? t('Loading…') : t('No printers found')}</option>}
            </select>
            <button type="button" className="btn flex items-center gap-1" onClick={() => { void refresh(); }} disabled={loading || !native}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              {t('Refresh')}
            </button>
          </div>
          {selected && (
            <div className="mt-1 text-[10px] text-muted tabular-nums">
              {selected.driver} · {selected.port}
            </div>
          )}

          {/* Safety banner */}
          <div className="mt-2 flex items-start gap-1.5 rounded border border-warning/50 bg-warning/10 px-2 py-1.5 text-[10px] text-warning leading-relaxed">
            <AlertTriangle size={12} aria-hidden="true" className="mt-px shrink-0" />
            <span>
              {t('Maintenance commands go straight to the printer. "Documented" actions come from public Epson references; "experimental" ones vary by model — expect silence rather than damage. Counter resets are NOT built in: paste your model\'s community sequence in the workbench below.')}
            </span>
          </div>

          {/* Action grid */}
          <div className="mt-2 field-label">{t('Maintenance actions')}</div>
          <div className="grid grid-cols-2 gap-1">
            {EPSON_ACTIONS.map(action => (
              <button
                key={action.id}
                type="button"
                className="btn !justify-start flex items-center gap-1.5 text-left"
                onClick={() => runAction(action)}
                disabled={busy || !printer}
                title={action.description}
              >
                <FlaskConical size={12} aria-hidden="true" className={safetyClass(action.safety)} />
                <span className="truncate">{t(action.label)}</span>
              </button>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-muted">
            <span className="text-success">●</span> {t('documented')} · <span className="text-warning">●</span> {t('experimental')}
          </div>

          {/* Custom command workbench */}
          <div className="mt-3 field-label">{t('Command workbench')}</div>
          <select
            className="input mt-1"
            onChange={(e) => applyTemplate(e.target.value)}
            defaultValue=""
            aria-label={t('Command templates')}
          >
            {EPSON_TEMPLATES.map(tpl => (
              <option key={tpl.id} value={tpl.id} disabled={tpl.hex === '' && tpl.id !== 'blank'}>
                {t(tpl.label)}{tpl.description ? ` — ${tpl.description}` : ''}
              </option>
            ))}
          </select>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="text"
              className="input font-mono flex-1"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              placeholder="1b 28 …"
              aria-label={t('Hex command')}
            />
            <label className="flex items-center gap-1 text-[10px] text-muted shrink-0">
              <input type="checkbox" checked={expectReply} onChange={(e) => setExpectReply(e.target.checked)} />
              {t('Await reply')}
            </label>
            <button
              type="button"
              className="btn flex items-center gap-1 shrink-0"
              onClick={() => { void run(t('Custom command'), customHex, expectReply); }}
              disabled={busy || !printer || !customHex.trim()}
            >
              <Send size={12} aria-hidden="true" />
              {t('Send')}
            </button>
          </div>

          {/* Hex console */}
          <div className="mt-3 flex items-center gap-1 text-[10px] text-muted">
            <span className="uppercase tracking-wide">{t('Console')}</span>
            <div className="flex-1" />
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={() => setEntries([])} title={t('Clear console')}>
              <Trash2 size={11} aria-hidden="true" />
            </button>
          </div>
          <div
            ref={logRef}
            className="mt-1 h-36 overflow-y-auto rounded border border-border bg-panel px-2 py-1 font-mono text-[10px] leading-relaxed"
            role="log"
            aria-label={t('Console')}
            aria-live="polite"
          >
            {entries.length === 0 ? (
              <div className="text-muted">{t('No traffic yet — pick a printer and run an action.')}</div>
            ) : entries.map(e => (
              <div key={e.id} className="flex gap-1.5">
                <span className="text-muted/70 tabular-nums shrink-0">
                  {new Date(e.ts).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className={`shrink-0 font-semibold ${e.dir === 'tx' ? 'text-[#5b9cff]' : e.dir === 'rx' ? 'text-success' : e.dir === 'err' ? 'text-danger' : 'text-muted'}`}>
                  {e.dir.toUpperCase()}
                </span>
                <span className={`break-all ${e.dir === 'err' ? 'text-danger' : 'text-ink/90'}`}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
