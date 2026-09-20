/**
 * Epson inkjet maintenance workbench.
 *
 * Picks an installed printer (spooler list), then runs maintenance
 * actions over RAW spooler jobs: initialize, head cleaning, nozzle
 * check, test print. The waste-ink section is fully built in: model
 * database (EEPROM keys + counter addresses from the open-source
 * epson_print_conf project), one-click counter read, serial-
 * authenticated temporary reset and the factory EEPROM reset. A hex
 * workbench covers everything else; all TX/RX traffic lands in a hex
 * console for evidence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Printer, Send, Trash2, AlertTriangle, FlaskConical, Recycle, Timer, HardDriveDownload, Save, Upload, BarChart3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { isTauri } from '../lib/runtime';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import {
  EPSON_ACTIONS, EPSON_TEMPLATES, epsonTransact, explainEpsonReply,
  formatSt2Summary, listEpsonPrinters, parseEjlIdReply, parseOldInkReply, parseSt2Status,
  saveEpsonPrefs, loadEpsonPrefs,
  epsonReadWaste, epsonResetWastePermanent, epsonResetWasteTemporary, guessEpsonModel,
  epsonDumpEeprom, epsonRestoreBackup, epsonReadStats, makeEepromBackup, parseEepromBackup,
  type EpsonAction, type EpsonPrinter, type EpsonStatReading, type EpsonTransport,
  type St2Status, type WasteReadResult,
} from '../lib/epsonMaint';
import { EPSON_MODELS } from '../lib/epsonModels';
import { download } from '../lib/io';

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
  // Waste-counter section: selected model, serial, last reading.
  const [model, setModel] = useState(loadEpsonPrefs().model ?? '');
  const [serialText, setSerialText] = useState(loadEpsonPrefs().serial ?? '');
  const [waste, setWaste] = useState<WasteReadResult | null>(null);
  const [transport, setTransport] = useState<EpsonTransport>(loadEpsonPrefs().transport ?? 'bare');
  const [stats, setStats] = useState<EpsonStatReading[] | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  // Structured readouts from the last status/identity action.
  const [st2, setSt2] = useState<St2Status | null>(null);
  const [identity, setIdentity] = useState('');
  const [oldInk, setOldInk] = useState<Array<{ color: string; level: number }> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => printers.find(p => p.name === printer) ?? null, [printers, printer]);
  const epsonPrinters = useMemo(() => printers.filter(p => p.isEpson), [printers]);
  const others = useMemo(() => printers.filter(p => !p.isEpson), [printers]);
  const modelNames = useMemo(() => Object.keys(EPSON_MODELS).sort(), []);
  const modelEntry = useMemo(() => (model ? EPSON_MODELS[model] ?? null : null), [model]);

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
        if (!model) {
          const g = guessEpsonModel(first.name, identity);
          if (g) setModel(g);
        }
      }
      if (list.length === 0) push('info', t('No printers found — install the printer driver first.'));
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setLoading(false);
    }
    // Auto-model-guess reads identity/model on purpose; the dialog re-runs
    // refresh only on open/printer changes anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, printer, t]);

  useEffect(() => {
    if (!open || !native) return;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, native]);

  useEffect(() => { saveEpsonPrefs({ printer }); }, [printer]);
  useEffect(() => { saveEpsonPrefs({ lastCustomHex: customHex }); }, [customHex]);
  useEffect(() => { saveEpsonPrefs({ model }); }, [model]);
  useEffect(() => { saveEpsonPrefs({ serial: serialText }); }, [serialText]);
  useEffect(() => { saveEpsonPrefs({ transport }); }, [transport]);

  // Adopt the serial the printer reports in its ST2 status block.
  const adoptSerial = (st: St2Status) => {
    const s = st.serial ?? st.serialInfo;
    if (s && !s.includes('?') && s !== serialText) setSerialText(s);
  };

  // Auto-pick the model from the freshly decoded identity when none was chosen.
  const adoptModelFromIdentity = (id: string) => {
    if (model || !id) return;
    const guess = guessEpsonModel(printer, id);
    if (guess) setModel(guess);
  };

  const choosePrinter = (name: string) => {
    setPrinter(name);
    if (!model) {
      const guess = guessEpsonModel(name, identity);
      if (guess) setModel(guess);
    }
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const run = async (label: string, hex: string, wantsReply: boolean, actionId?: string) => {
    if (!printer) { toast.warn(t('Pick a printer first.'), { title: t('Epson maintenance') }); return; }
    if (!hex.trim()) { toast.warn(t('The command is empty.')); return; }
    setBusy(true);
    setSt2(null);
    setIdentity('');
    setOldInk(null);
    push('tx', `${label} · ${hex.replace(/\s+/g, ' ')}`);
    try {
      const reply = await epsonTransact(printer, hex, wantsReply ? 1200 : 250);
      if (reply.length > 0) {
        push('rx', explainEpsonReply(reply));
        // Structured decoding per action: ST2 status card, @EJL identity,
        // classic IQ: ink table. Fall back to the raw hex above.
        if (actionId === 'status-st2') {
          const st = parseSt2Status(reply);
          if (st) {
            setSt2(st);
            adoptSerial(st);
            push('info', formatSt2Summary(st).join(' · '));
          } else {
            push('info', t('Reply was not an ST2 block — try the classic ink query.'));
          }
        } else if (actionId === 'identify') {
          const id = parseEjlIdReply(reply);
          if (id) { setIdentity(id); adoptModelFromIdentity(id); push('info', id); }
        } else if (actionId === 'status-old') {
          const inks = parseOldInkReply(reply);
          if (inks && inks.length > 0) {
            setOldInk(inks);
            push('info', inks.map(i => `${i.color} ${i.level}%`).join(' · '));
          } else {
            push('info', t('No IQ: ink data in the reply — try the ST2 query for newer models.'));
          }
        }
      } else if (wantsReply) {
        push('info', t('No reply (see the warning above about model-specific queries).'));
      }
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action: EpsonAction) => { void run(action.label, action.hex, action.expectsReply, action.id); };

  const runWasteRead = async () => {
    if (!printer || !modelEntry) { toast.warn(t('Pick a printer and model first.'), { title: t('Epson maintenance') }); return; }
    setBusy(true);
    setWaste(null);
    try {
      const result = await epsonReadWaste(printer, modelEntry, push, transport);
      setWaste(result);
      if (result.readings.every(r => r.percent === null)) {
        push('info', t('No EEPROM answers — check the model choice; a wrong read key keeps the printer silent.'));
      }
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runTempReset = async () => {
    if (!printer) { toast.warn(t('Pick a printer first.'), { title: t('Epson maintenance') }); return; }
    const serial = serialText.trim();
    if (!serial) {
      toast.warn(t('Serial number unknown — run the ST2 status query once, or type the serial.'), { title: t('Epson maintenance') });
      return;
    }
    if (!window.confirm(t('Temporary reset clears the waste-ink error until the printer is power-cycled. Continue?'))) return;
    setBusy(true);
    try {
      const r = await epsonResetWasteTemporary(printer, serial, push, transport);
      push(r.ok ? 'info' : 'err', r.ok
        ? t('Temporary reset acknowledged (rw:OK).')
        : t('The printer denied the reset (NA) or stayed silent — wrong serial or unsupported firmware.'));
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runFactoryReset = async () => {
    if (!printer || !modelEntry) { toast.warn(t('Pick a printer and model first.'), { title: t('Epson maintenance') }); return; }
    const n = Object.keys(modelEntry.rawReset).length;
    const first = window.confirm(
      `${t('Factory reset permanently writes the waste-counter EEPROM for this model. Run it ONLY right after replacing the waste ink pads or maintenance box — it cannot be undone.')}\n\n${model} · ${n} ${t('bytes')}`
    );
    if (!first) return;
    if (!window.confirm(t('Really write to the EEPROM now?'))) return;
    setBusy(true);
    try {
      const r = await epsonResetWastePermanent(printer, modelEntry, push, transport);
      push(r.ok ? 'info' : 'err', `${t('Writes acknowledged')}: ${r.okCount}/${r.total}${r.naCount > 0 ? ` · NA ${r.naCount}` : ''}`);
      if (r.ok) toast.success(t('Waste counters reset. Read them back to verify.'));
      else push('err', t('Not every write was acknowledged — verify the model choice and try reading the counters.'));
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runStats = async () => {
    if (!printer || !modelEntry) { toast.warn(t('Pick a printer and model first.'), { title: t('Epson maintenance') }); return; }
    setBusy(true);
    setStats(null);
    try {
      const result = await epsonReadStats(printer, modelEntry, push, transport);
      setStats(result);
      if (result.every(s => s.value === null)) {
        push('info', t('No EEPROM answers — check the model choice; a wrong read key keeps the printer silent.'));
      }
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runBackup = async () => {
    if (!printer || !modelEntry) { toast.warn(t('Pick a printer and model first.'), { title: t('Epson maintenance') }); return; }
    if (!window.confirm(t('Back up the EEPROM now? This only reads — nothing is modified.'))) return;
    setBusy(true);
    try {
      // Counters and stats all live in 0..511; add the serial range when
      // the model keeps it higher (e.g. ET series near 1604).
      const addrs = new Set<number>();
      for (let a = 0; a <= 511; a++) addrs.add(a);
      for (const a of modelEntry.serial ?? []) addrs.add(a);
      const dump = await epsonDumpEeprom(printer, modelEntry, [...addrs], { transport, log: push });
      if (dump.answered === 0) {
        push('info', t('No EEPROM answers — check the model choice; a wrong read key keeps the printer silent.'));
        return;
      }
      const backup = makeEepromBackup(model!, dump.values, serialText.trim() || undefined);
      const stamp = new Date().toISOString().slice(0, 10);
      download(`epson-${model.replace(/[^\w-]+/g, '_')}-eeprom-${stamp}.json`, JSON.stringify(backup, null, 1), 'application/json');
      push('info', `${t('Backup saved')}: ${dump.answered}/${dump.requested}`);
      toast.success(`${t('Backup saved')}: ${dump.answered}/${dump.requested}`);
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRestoreFile = async (file: File) => {
    if (!printer || !modelEntry) { toast.warn(t('Pick a printer and model first.'), { title: t('Epson maintenance') }); return; }
    try {
      const text = await file.text();
      const backup = parseEepromBackup(text);
      if (backup.model !== model) {
        toast.warn(`${t('The backup is for model')} ${backup.model} — ${t('current selection')}: ${model}`, { title: t('Epson maintenance') });
        if (!window.confirm(`${t('The backup is for model')} ${backup.model}, ${t('current selection')}: ${model}. ${t('Restore anyway?')}`)) return;
      }
      const n = Object.keys(backup.values).length;
      if (!window.confirm(`${t('Restore writes')} ${n} ${t('EEPROM bytes from the backup. Continue?')} (${backup.savedAt})`)) return;
      setBusy(true);
      const r = await epsonRestoreBackup(printer, modelEntry, backup, { transport, log: push });
      push(r.ok ? 'info' : 'err', `${t('Writes acknowledged')}: ${r.okCount}/${r.total}${r.naCount > 0 ? ` · NA ${r.naCount}` : ''}`);
    } catch (e) {
      push('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
              onChange={(e) => choosePrinter(e.target.value)}
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
              {t('Maintenance commands go straight to the printer. "Documented" actions come from public Epson references; "experimental" ones vary by model. The waste-ink section below is built in from the open-source epson_print_conf project — reading is safe; resets rewrite persistent counters.')}
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

          {/* Waste ink counters — model database + one-click read/reset */}
          <div className="mt-3 pt-2 border-t border-border">
            <div className="field-label">{t('Waste ink counters')}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <select
                className="input flex-1"
                value={model}
                onChange={(e) => { setModel(e.target.value); setWaste(null); }}
                aria-label={t('Model')}
              >
                <option value="">{t('Select model…')}</option>
                {modelNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                type="button"
                className="btn shrink-0"
                disabled={busy || !printer}
                onClick={() => {
                  const guess = guessEpsonModel(printer, identity);
                  if (guess) { setModel(guess); setWaste(null); }
                  else toast.warn(t('Could not guess the model — the printer name and ID reply hold no known model.'));
                }}
                title={t('Match the Windows printer name / ID reply against the model database')}
              >
                {t('Guess')}
              </button>
            </div>
            {modelEntry && (
              <div className="mt-1 text-[10px] text-muted tabular-nums">
                {t('read key')} {modelEntry.readKey[0]}/{modelEntry.readKey[1]} · {t('main counter')} {modelEntry.mainWaste.oids.join(',')} ÷ {modelEntry.mainWaste.divider}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                className="input font-mono flex-1"
                value={serialText}
                onChange={(e) => setSerialText(e.target.value)}
                placeholder={t('Serial number (filled from ST2 status)')}
                aria-label={t('Serial number')}
                spellCheck={false}
              />
              <select
                className="input w-36 shrink-0"
                value={transport}
                onChange={(e) => setTransport(e.target.value as EpsonTransport)}
                aria-label={t('Transport')}
                title={t('escputil-style bare packets vs the full IEEE 1284.4 handshake session')}
              >
                <option value="bare">{t('Simple transport')}</option>
                <option value="d4">{t('1284.4 handshake')}</option>
              </select>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              <button type="button" className="btn !justify-start flex items-center gap-1.5 text-left" disabled={busy || !printer || !modelEntry} onClick={() => { void runWasteRead(); }}>
                <HardDriveDownload size={12} aria-hidden="true" className="text-success" />
                <span className="truncate">{t('Read counters')}</span>
              </button>
              <button type="button" className="btn !justify-start flex items-center gap-1.5 text-left" disabled={busy || !printer} onClick={() => { void runTempReset(); }} title={t('Clears the error until power-off; needs only the serial')}>
                <Timer size={12} aria-hidden="true" className="text-warning" />
                <span className="truncate">{t('Temporary reset')}</span>
              </button>
              <button type="button" className="btn !justify-start flex items-center gap-1.5 text-left !border-danger/40 hover:!border-danger" disabled={busy || !printer || !modelEntry} onClick={() => { void runFactoryReset(); }} title={t('Rewrites the EEPROM counters to factory state')}>
                <Recycle size={12} aria-hidden="true" className="text-danger" />
                <span className="truncate">{t('Factory reset')}</span>
              </button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <button type="button" className="btn !justify-start flex items-center gap-1.5 text-left" disabled={busy || !printer || !modelEntry} onClick={() => { void runBackup(); }} title={t('Reads the EEPROM counters and saves a JSON backup you can restore later')}>
                <Save size={12} aria-hidden="true" className="text-[#5b9cff]" />
                <span className="truncate">{t('Back up EEPROM')}</span>
              </button>
              <button type="button" className="btn !justify-start flex items-center gap-1.5 text-left" disabled={busy || !printer || !modelEntry} onClick={() => restoreInputRef.current?.click()} title={t('Writes a previously saved backup back to the EEPROM')}>
                <Upload size={12} aria-hidden="true" className="text-[#5b9cff]" />
                <span className="truncate">{t('Restore backup')}</span>
              </button>
              <button type="button" className="btn !justify-start flex items-center gap-1.5 text-left" disabled={busy || !printer || !modelEntry} onClick={() => { void runStats(); }} title={t('Page, cleaning and usage counters from the EEPROM')}>
                <BarChart3 size={12} aria-hidden="true" className="text-[#5b9cff]" />
                <span className="truncate">{t('Read statistics')}</span>
              </button>
            </div>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onRestoreFile(file);
              }}
            />
            {waste && (
              <div className="mt-1.5 rounded border border-border bg-panel2 px-2 py-1.5 text-[10px]" role="status">
                {waste.readings.map((r, i) => (
                  <div key={i} className="mb-1 last:mb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">{t(r.label)}</span>
                      <span className={`tabular-nums font-semibold ${r.percent === null ? 'text-muted' : r.percent >= 90 ? 'text-danger' : r.percent >= 70 ? 'text-warning' : 'text-success'}`}>
                        {r.percent === null ? '—' : `${r.percent}%`}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded bg-border overflow-hidden">
                      <div
                        className={`h-full ${r.percent === null ? 'bg-border' : r.percent >= 90 ? 'bg-danger' : r.percent >= 70 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${Math.min(100, Math.max(0, r.percent ?? 0))}%` }}
                      />
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-muted">
                      {r.oids.map(a => `#${a}=${waste.values.get(a) !== undefined ? waste.values.get(a)!.toString(16).padStart(2, '0') : '??'}`).join(' ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stats && stats.length > 0 && (
              <div className="mt-1.5 rounded border border-border bg-panel2 px-2 py-1.5 text-[10px]" role="status">
                <div className="field-label !mb-1">{t('Statistics')}</div>
                {stats.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted">{s.name}</span>
                    <span className="shrink-0 tabular-nums">{s.value === null ? '—' : s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Structured readout card — parsed from the last status action. */}
          {(st2 || identity || oldInk) && (
            <div className="mt-2 rounded border border-border bg-panel2 px-2 py-1.5 text-[10px]" role="status">
              <div className="field-label !mb-1">{t('Printer readout')}</div>
              {identity && (
                <div className="mb-1 font-mono text-ink/90 break-all">{identity}</div>
              )}
              {st2 && formatSt2Summary(st2).slice(0, 3).map((line, i) => (
                <div key={i} className="mb-0.5 text-ink/85">{line}</div>
              ))}
              {st2?.errors.map((e, i) => (
                <div key={`e${i}`} className="mb-0.5 font-medium text-danger">✕ {e}</div>
              ))}
              {st2?.warnings.map((w, i) => (
                <div key={`w${i}`} className="mb-0.5 text-warning">! {w}</div>
              ))}
              {(st2?.ink.length ?? 0) > 0 && (
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {st2!.ink.map((ink, i) => (
                    <div key={`ink${i}`} className="flex items-center gap-1.5" title={`${ink.cartridge} (${ink.color})`}>
                      <span className="w-20 shrink-0 truncate text-muted">{ink.cartridge}</span>
                      <div className="h-1.5 min-w-0 flex-1 rounded bg-border overflow-hidden">
                        <div
                          className={`h-full ${ink.level <= 10 ? 'bg-danger' : ink.level <= 25 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${Math.min(100, Math.max(0, ink.level))}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums">{ink.level}%</span>
                    </div>
                  ))}
                </div>
              )}
              {oldInk && (
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {oldInk.map((ink, i) => (
                    <div key={`oi${i}`} className="flex items-center gap-1.5">
                      <span className="w-20 shrink-0 truncate text-muted">{ink.color}</span>
                      <div className="h-1.5 min-w-0 flex-1 rounded bg-border overflow-hidden">
                        <div
                          className={`h-full ${ink.level <= 10 ? 'bg-danger' : ink.level <= 25 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${Math.min(100, Math.max(0, ink.level))}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums">{ink.level}%</span>
                    </div>
                  ))}
                </div>
              )}
              {(st2?.maintenanceBoxes.length ?? 0) > 0 && (
                <div className="mt-1 text-ink/85">
                  {st2!.maintenanceBoxes.map((box, i) => {
                    const label = box.level === 0 ? t('not full') : box.level === 1 ? t('near full') : box.level === 2 ? t('FULL') : `level ${box.level}`;
                    return (
                      <div key={`mb${i}`}>
                        {t('Maintenance box')} {i + 1}: <span className={box.level === 2 ? 'text-danger font-semibold' : box.level === 1 ? 'text-warning' : 'text-success'}>{label}</span>
                        {box.resetCount !== undefined && <span className="text-muted"> · {t('resets')}: {box.resetCount}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {st2?.paperCount && (
                <div className="mt-1 text-muted tabular-nums">
                  {t('Pages')}: {st2.paperCount.page} · {t('color')} {st2.paperCount.color} · {t('mono')} {st2.paperCount.mono}
                </div>
              )}
              {st2 && st2.errors.length === 0 && st2.maintenanceBoxes.length === 0 && (
                <div className="mt-1 text-[9px] text-muted">{t('Field availability depends on the model — unknown fields stay in the console log.')}</div>
              )}
            </div>
          )}

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
