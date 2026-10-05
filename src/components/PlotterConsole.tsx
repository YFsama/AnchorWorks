import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Terminal, Trash2, Copy, Download, HelpCircle,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair, Plug, Unplug, Loader2, RefreshCw,
} from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { download } from '../lib/io';
import type { FlowControl, PlotterLink } from '../lib/plotterLink';
import { lineRateBytesPerSec, toHex } from '../lib/plotterLink';
import type { NativeSerialPort } from '../lib/plotter';
import { QUICK_COMMANDS, buildForceSpeed, buildJog, buildMoveTo, buildSetOrigin, decodeReply, isQueryCommand, parsePageReply, parsePositionReply, type MachinePosition, type QuickCommand } from '../lib/hpglDebug';
import { buildDiagnosticsReport, probeBaud, runConnectionSelfTest } from '../lib/plotterDiag';
import { autoDetectCutter, chipForPort, identifyMachine } from '../lib/plotterIdentify';
import { clearJobLog, deleteMachine, listJobLog, listMachines, saveMachine, type MachineDraft, type MachineRecord } from '../lib/plotterRecords';
import type { MachineProfile } from '../lib/machineProfiles';
import { getMachineProfile } from '../lib/machineProfiles';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 250000];
const FLOW_OPTIONS: Array<{ value: FlowControl; label: string }> = [
  { value: 'none', label: 'None (paced)' },
  { value: 'hardware', label: 'Hardware RTS/CTS' },
  { value: 'software', label: 'Software XON/XOFF' },
];
const JOG_STEPS = [1, 5, 10, 25, 50];
const MAX_ENTRIES = 400;

interface Entry {
  id: number;
  ts: number;
  dir: 'tx' | 'rx' | 'info' | 'err' | 'warn';
  text: string;
  bytes?: number;
  raw?: Uint8Array;
}

export interface PlotterConsoleProps {
  link: PlotterLink;
  format: 'gcode' | 'hpgl';
  unit: 'mm' | 'in';
  /** True under the Tauri desktop shell (OS port picker available). */
  native: boolean;
  /** True when Web Serial is available (browser connect path). */
  webSerial: boolean;
  /** A job is currently streaming — jog/quick commands must wait. */
  sending: boolean;
  nativePorts: NativeSerialPort[];
  selectedPort: string;
  setSelectedPort: (path: string) => void;
  refreshPorts: () => void;
  portsLoading: boolean;
  portsError: string;
  baud: number;
  setBaud: (b: number) => void;
  flow: FlowControl;
  setFlow: (f: FlowControl) => void;
  /** Graphtec FS force / VS speed from the machine options (HP-GL only). */
  force: number;
  speed: number;
  /** Feed rate for G-code jog moves. */
  feedRate: number;
  /** Selected brand profile (machineProfiles.ts) — null when generic. */
  profile: MachineProfile | null;
  /** Post-connect init statement from the profile ('' = nothing). */
  connectInit: string;
  /** Profile-aware force/speed statement ('' when the machine is panel-only). */
  forceSpeedCommand: string;
  /** Capture the dialog's full current setup for the saved-machine rows. */
  snapshotConfig: () => MachineDraft;
  /** Restore a saved machine row into the dialog. */
  applyConfig: (rec: MachineRecord) => void;
  /** Bumped by the dialog after each job-log entry. */
  jobLogVersion: number;
  /** Apply a machine profile id (used by identify's suggestion). */
  applyProfile: (id: string) => void;
}

let entrySeq = 1;
/** Timestamp helper kept at module scope — the React compiler purity rule
 *  flags direct `Date.now()` calls inside component-scope functions. */
const nowMs = (): number => Date.now();

export function PlotterConsole(props: PlotterConsoleProps) {
  const {
    link, format, unit, native, webSerial, sending,
    nativePorts, selectedPort, setSelectedPort, refreshPorts, portsLoading, portsError,
    baud, setBaud, flow, setFlow, force, speed, feedRate,
    profile, connectInit, forceSpeedCommand, snapshotConfig, applyConfig, jobLogVersion, applyProfile,
  } = props;
  const t = useT();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hexView, setHexView] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [input, setInput] = useState('');
  const [jogStep, setJogStep] = useState(10);
  // Absolute move-to target (comma-separated X,Y in the output unit).
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  // Control-line toggles + periodic machine poll (debug liveness probes).
  const [signals, setSignals] = useState({ dtr: false, rts: false });
  const [autoPoll, setAutoPoll] = useState(false);
  const [lastPoll, setLastPoll] = useState('');
  // Round-trip latency stats for the auto-poll (reset on toggle).  
  const [pollStats, setPollStats] = useState<{ n: number; min: number; avg: number; max: number }>({ n: 0, min: Infinity, avg: 0, max: 0 });
  // Structured live position (from auto-poll) + page limits (from OH;).
  const [position, setPosition] = useState<MachinePosition | null>(null);
  const [page, setPage] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Command-reference panel + last-transfer throughput analysis.
  const [refOpen, setRefOpen] = useState(false);
  const [lastTransfer, setLastTransfer] = useState<{ bps: number; pct: number | null } | null>(null);
  // Traffic-log direction filter (chips above the log).
  const [dirFilter, setDirFilter] = useState<'all' | 'tx' | 'rx' | 'notice'>('all');
  // Raw-command history for terminal-style ↑/↓ recall.
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  // Saved machine configs + job history (plotterRecords).
  const [machines, setMachines] = useState<MachineRecord[]>(() => listMachines());
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [machineName, setMachineName] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  // Model string reported by the last identify run (OI; reply).
  const [identified, setIdentified] = useState('');
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const connected = link.status === 'connected';
  const canConnect = native || webSerial;
  const selectedMachine = machines.find(m => m.id === selectedMachineId) ?? null;

  // The dialog bumps jobLogVersion after every logged job — recompute the
  // derived list then. Pure derivation keyed on the version (plus a local
  // refresh tick for open/clear), so no state-sync-in-render dance.
  const [logRefresh, setLogRefresh] = useState(0);
  // The deps are deliberate cache-buster keys: the callback reads only the
  // external log store, so exhaustive-deps can't see why they matter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jobHistory = useMemo(() => listJobLog(), [jobLogVersion, logRefresh]);

  const fmtBytes = (n: number): string =>
    n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

  const push = (entry: Omit<Entry, 'id'>) => {
    setEntries(prev => {
      const next = [...prev, { ...entry, id: entrySeq++ }];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  };

  // Mirror every link event into the console log.
  useEffect(() => {
    return link.subscribe(ev => {
      if (ev.type === 'tx') push({ ts: ev.ts, dir: 'tx', text: ev.text, bytes: ev.bytes, raw: ev.raw });
      else if (ev.type === 'rx') push({ ts: ev.ts, dir: 'rx', text: ev.text, bytes: ev.bytes, raw: ev.raw });
      else if (ev.type === 'status') {
        forceTick();
        if (ev.status === 'error') push({ ts: nowMs(), dir: 'err', text: ev.detail ?? 'error' });
        else if (ev.status === 'connected') {
          setSignals({ dtr: false, rts: false });
          setLastPoll('');
          setPosition(null);
          push({ ts: nowMs(), dir: 'info', text: `${t('Connected')} — ${link.describe()} ${flow.toUpperCase() === 'NONE' ? '' : flow}` });
        }
        else if (ev.status === 'idle') {
          setPosition(null);
          push({ ts: nowMs(), dir: 'info', text: t('Disconnected') });
        }
      } else if (ev.type === 'done') {
        forceTick();
        // Effective throughput vs theoretical line rate — tells the
        // operator whether pacing/flow settings leave bandwidth on the
        // table (or the buffer is overrun-risky).
        if (!ev.aborted && !ev.error && ev.ms && ev.ms > 0) {
          const bps = ev.total / (ev.ms / 1000);
          const line = lineRateBytesPerSec(link.baud, link.flowControl);
          setLastTransfer({ bps, pct: line > 0 ? bps / line : null });
        }
        if (ev.aborted) push({ ts: nowMs(), dir: 'warn', text: `${t('Transfer cancelled')} — ${ev.sent}/${ev.total} B` });
        else if (ev.error) push({ ts: nowMs(), dir: 'err', text: ev.error });
        else push({ ts: nowMs(), dir: 'info', text: `${t('Transfer finished')} — ${ev.error ?? ''}` });
      }
    });
  }, [link, t, flow]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, autoScroll, hexView, open]);

  // Periodic machine poll — proves the link is alive and shows live
  // carriage state without flooding the traffic log.
  useEffect(() => {
    if (!connected || !autoPoll || sending) return;
    let stopped = false;
    const cmd = format === 'hpgl' ? 'OA;' : '?';
    const tick = async () => {
      if (stopped || link.status !== 'connected') return;
      const t0 = Date.now();
      try {
        const reply = await link.query(cmd, 1500);
        if (!stopped) {
          setLastPoll(decodeReply(format, cmd, reply, unit));
          const pos = parsePositionReply(format, reply, unit);
          if (pos) setPosition(pos);
          // Round-trip latency stats — a drifting max means the machine (or
          // the USB stack) is struggling before it outright fails.
          const ms = Date.now() - t0;
          setPollStats(p => ({
            n: p.n + 1,
            min: Math.min(p.min, ms),
            avg: Math.round(((p.avg * p.n) + ms) / (p.n + 1)),
            max: Math.max(p.max, ms),
          }));
        }
      } catch { /* the query attempt is already visible in the log */ }
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 2500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [connected, autoPoll, sending, format, unit, link]);


  const toggleSignal = async (line: 'dtr' | 'rts') => {
    const next = !signals[line];
    setSignals(s => ({ ...s, [line]: next }));
    try {
      await link.setSignals({ [line]: next });
      push({ ts: nowMs(), dir: 'info', text: `${line.toUpperCase()} → ${next ? 'ON' : 'OFF'}` });
    } catch (e) {
      setSignals(s => ({ ...s, [line]: !next }));
      push({ ts: nowMs(), dir: 'err', text: (e as Error).message });
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      await link.open({
        portPath: native ? (selectedPort || undefined) : undefined,
        baud,
        flowControl: flow,
      });
      // Prime the machine per the selected brand profile (IN + force/speed).
      if (connectInit && link.status === 'connected') {
        await link.send(connectInit);
        push({ ts: nowMs(), dir: 'info', text: `${t('Profile init sent')}: ${connectInit}` });
      }
      // Ask an HP-GL machine for its loaded page limits (OH;) — powers
      // the page-size readout next to the position chip. Many cutters
      // ignore it; that's fine, the readout just stays hidden.
      if (format === 'hpgl' && link.status === 'connected') {
        const reply = await link.query('OH;', 1000).catch(() => '');
        const parsed = parsePageReply(reply, unit);
        if (parsed) {
          setPage(parsed);
          push({ ts: nowMs(), dir: 'info', text: `${t('Loaded page')}: ${Math.round(parsed.x1 - parsed.x0)} × ${Math.round(parsed.y1 - parsed.y0)} ${unit}` });
        }
      }
    } catch {
      /* status event already logged the message */
    } finally {
      setBusy(false);
      forceTick();
    }
  };

  const disconnect = async () => {
    await link.close();
    forceTick();
  };

  /** Send machine text; awaits + decodes the reply for query commands. */
  const exec = async (text: string, expectsReply = false) => {
    if (!text) return;
    if (!connected) { toast.warn(t('Connect the cutter first.'), { title: t('Not connected') }); return; }
    try {
      if (expectsReply || isQueryCommand(format, text)) {
        const reply = await link.query(text);
        push({ ts: nowMs(), dir: 'info', text: `→ ${decodeReply(format, text, reply, unit)}` });
      } else {
        await link.send(text);
      }
    } catch (e) {
      push({ ts: nowMs(), dir: 'err', text: (e as Error).message });
    }
  };

  // Keyboard jog — arrow keys move the carriage while the console is open;
  // plain arrows use the selected step, Shift+arrows do a 1-unit fine trim.
  // Skipped whenever focus is in an editable control so typing stays safe.
  useEffect(() => {
    if (!open || !connected || sending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      void exec(buildJog(format, dir[0] * (e.shiftKey ? 1 : jogStep), dir[1] * (e.shiftKey ? 1 : jogStep), unit, feedRate));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connected, sending, format, unit, feedRate, jogStep]);

  const runQuick = (cmd: QuickCommand) => {
    const text = cmd.id === 'force-speed' ? (forceSpeedCommand || buildForceSpeed(force, speed)) : cmd.command;
    if (!text) {
      if (cmd.id === 'force-speed') toast.info(t('This machine sets force/speed on its panel — nothing to send.'));
      return;
    }
    void exec(text, cmd.expectsReply);
  };

  /** Diagnostics — see plotterDiag.ts. Results land in the traffic log. */
  const selfTest = async () => {
    if (!connected) return;
    setBusy(true);
    push({ ts: nowMs(), dir: 'info', text: `— ${t('Connection self-test')} —` });
    try {
      const steps = await runConnectionSelfTest(link, format);
      for (const s of steps) {
        const mark = s.status === 'pass' ? '✓' : s.status === 'fail' ? '✕' : '·';
        push({
          ts: nowMs(),
          dir: s.status === 'fail' ? 'err' : 'info',
          text: `${mark} ${s.label}${s.ms !== undefined ? ` (${s.ms} ms)` : ''} ${s.detail}`,
        });
      }
    } finally { setBusy(false); }
  };

  const detectBaud = async () => {
    if (!canConnect || sending) return;
    setBusy(true);
    push({ ts: nowMs(), dir: 'info', text: `— ${t('Baud detection')} —` });
    try {
      const winner = await probeBaud(link, {
        portPath: native ? (selectedPort || undefined) : undefined,
        flowControl: flow,
        format,
        onLog: (text) => push({ ts: nowMs(), dir: 'info', text }),
      });
      if (winner) {
        setBaud(winner);
        push({ ts: nowMs(), dir: 'info', text: `${t('Baud rate set to')} ${winner}` });
      } else {
        push({ ts: nowMs(), dir: 'warn', text: t('No baud got a reply — many cutters ignore status queries. Try 9600 manually and run a test cut.') });
      }
    } finally {
      setBusy(false);
      forceTick();
    }
  };

  /** Identify the machine: OI; query when connected, port scan when not.
   *  Suggests the matching brand profile with a one-click apply toast. */
  const identify = async () => {
    setBusy(true);
    push({ ts: nowMs(), dir: 'info', text: `— ${t('Identify machine')} —` });
    try {
      if (link.status === 'connected') {
        const r = await identifyMachine(link, format);
        setIdentified(r.model);
        push({ ts: nowMs(), dir: r.model ? 'info' : 'warn', text: r.summary });
        offerProfile(r.suggestedProfileId);
      } else if (native && nativePorts.length > 0) {
        const found = await autoDetectCutter(link, nativePorts, {
          flowControl: flow,
          onLog: (line) => push({ ts: nowMs(), dir: 'info', text: line }),
        });
        if (found) {
          setSelectedPort(found.portPath);
          setBaud(found.baud);
          setIdentified(found.model);
          const chip = found.chip ? ` (${found.chip.chip})` : '';
          push({ ts: nowMs(), dir: 'info', text: `${t('Cutter found')}: ${found.portPath}${chip} @ ${found.baud}${found.model ? ` — ${found.model}` : ''}` });
          offerProfile(found.suggestedProfileId);
        } else {
          push({ ts: nowMs(), dir: 'warn', text: t('No cutter answered on any port — check power / cable, or connect manually and run the self-test.') });
        }
      } else {
        toast.warn(t('Connect the cutter first (browsers cannot scan ports).'), { title: t('Identify machine') });
      }
    } finally {
      setBusy(false);
      forceTick();
    }
  };

  const offerProfile = (profileId: string | null) => {
    if (!profileId) return;
    const p = getMachineProfile(profileId);
    if (!p) return;
    toast.info(`${t('Suggested profile')}: ${p.label}`, {
      title: t('Identify machine'),
      action: { label: t('Apply'), onClick: () => applyProfile(profileId) },
    });
  };

  /** Everything an operator might be asked for on a support forum, in one
   *  plain-text file — see buildDiagnosticsReport in plotterDiag.ts. */
  const downloadReport = () => {
    const report = buildDiagnosticsReport({
      shell: native ? 'desktop' : 'web',
      linkStatus: link.status,
      linkDescription: connected ? link.describe() : link.detail,
      baud,
      flow,
      txBytes: link.txBytes,
      rxBytes: link.rxBytes,
      lastTransfer,
      format,
      unit,
      profileLabel: profile?.label,
      machineCount: machines.length,
      jobs: jobHistory.slice(0, 20),
      logLines: plainLog().split('\n').slice(-200),
    });
    download('plotter-diagnostics.txt', report, 'text/plain');
    toast.success(t('Diagnostics report downloaded'));
  };

  /** Saved-machine rows — one record per physical cutter. */
  const saveMachineAsNew = () => {
    const name = machineName.trim();
    if (!name) { toast.warn(t('Enter a machine name first.'), { title: t('Saved machines') }); return; }
    const rec = saveMachine({ ...snapshotConfig(), name });
    setSelectedMachineId(rec.id);
    setMachines(listMachines());
    toast.success(t('Machine saved'));
  };

  const updateSelectedMachine = () => {
    if (!selectedMachine) return;
    saveMachine({ ...snapshotConfig(), id: selectedMachine.id, name: machineName.trim() || selectedMachine.name });
    setMachines(listMachines());
    toast.success(t('Machine updated'));
  };

  const removeSelectedMachine = () => {
    if (!selectedMachine) return;
    deleteMachine(selectedMachine.id);
    setSelectedMachineId('');
    setMachineName('');
    setMachines(listMachines());
    toast.success(t('Machine deleted'));
  };

  const loadMachine = (id: string) => {
    setSelectedMachineId(id);
    const rec = machines.find(m => m.id === id);
    if (rec) {
      applyConfig(rec);
      setMachineName(rec.name);
      toast.success(`${t('Loaded')}: ${rec.name}`);
    }
  };

  const jog = (dx: number, dy: number) => {
    warnIfJogExitsPage(dx, dy);
    void exec(buildJog(format, dx * jogStep, dy * jogStep, unit, feedRate));
  };

  /** Absolute positioning: parse "X,Y" and move there with the blade up. */
  const submitMoveTo = () => {
    const m = moveTo.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) { toast.warn(t('Enter coordinates as X,Y — e.g. 25,10.'), { title: t('Move to coordinates') }); return; }
    void exec(buildMoveTo(format, Number(m[1]), Number(m[2]), unit, feedRate));
  };

  /** Soft guard: when the live position and page limits are known (auto
   *  status + OH; on connect), warn before jogging off the material. */
  const warnIfJogExitsPage = (dx: number, dy: number) => {
    if (!position || !page) return;
    const nx = position.x + dx * jogStep;
    const ny = position.y + dy * jogStep;
    if (nx < page.x0 || nx > page.x1 || ny < page.y0 || ny > page.y1) {
      toast.warn(t('Jog would leave the page area.'), { title: t('Jog') });
    }
  };

  const submitInput = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setHistory(h => (h[h.length - 1] === text ? h : [...h, text].slice(-50)));
    setHistIdx(-1);
    void exec(text);
  };

  /** Terminal-style ↑/↓ recall of previously sent raw commands. */
  const recallHistory = (dir: 1 | -1, current: string) => {
    if (history.length === 0) return null;
    let idx = histIdx === -1 && dir === -1 ? history.length - 1 : histIdx + dir;
    idx = Math.max(0, Math.min(history.length - 1, idx));
    setHistIdx(idx);
    return history[idx] ?? current;
  };

  const plainLog = () => entries.map(e => {
    const stamp = new Date(e.ts).toLocaleTimeString([], { hour12: false }) + '.' + String(e.ts % 1000).padStart(3, '0');
    const dir = e.dir.toUpperCase().padEnd(4, ' ');
    const body = hexView && e.raw ? toHex(e.raw) : (e.text || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    return `${stamp} ${dir} ${e.bytes !== undefined ? `${e.bytes} B  ` : ''}${body}`;
  }).join('\n');

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(plainLog());
      toast.success(t('Console log copied'));
    } catch { toast.error(t('Clipboard copy failed')); }
  };

  const statusColor = connected ? 'bg-success' : link.status === 'connecting' ? 'bg-warning' : link.status === 'error' ? 'bg-danger' : 'bg-muted';
  const quickCommands = QUICK_COMMANDS.filter(cmd => !cmd.formats || cmd.formats.includes(format));
  // Direction-filtered view of the log (the copy/download exports stay full).
  const filteredEntries = dirFilter === 'all'
    ? entries
    : entries.filter(e => (dirFilter === 'tx' && e.dir === 'tx') || (dirFilter === 'rx' && e.dir === 'rx') || (dirFilter === 'notice' && e.dir !== 'tx' && e.dir !== 'rx'));

  const fmtEntry = (e: Entry) => {
    if (hexView && e.raw) return toHex(e.raw);
    return (e.text || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  };

  return (
    <div className="mb-3 rounded border border-border bg-panel2/60 p-2 text-[11px]">
      {/* Header: collapse toggle + live status + connect/disconnect */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 font-medium text-ink hover:text-accent2 transition-colors"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title={t('Show the serial console: raw traffic, quick machine commands, and jog controls.')}
        >
          {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
          <Terminal size={12} aria-hidden="true" className="text-[#ff2e9a]" />
          {t('Debug console')}
        </button>
        <span className="flex items-center gap-1.5 text-[10px] text-muted tabular-nums" title={link.detail}>
          <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} aria-hidden="true" />
          {connected ? link.describe() : t(link.status === 'connecting' ? 'Connecting…' : link.status === 'error' ? 'Connection error' : 'Not connected')}
        </span>
        {connected && position && (
          <span
            className="flex items-center gap-1 rounded border border-border bg-panel px-1.5 py-0.5 text-[10px] tabular-nums"
            title={t('Live carriage position from the status poll (enable Auto status).')}
          >
            <Crosshair size={10} aria-hidden="true" className="text-accent2" />
            X {position.x.toFixed(1)} · Y {position.y.toFixed(1)} {unit}
            {position.penDown !== undefined && (
              <span className={position.penDown ? 'font-semibold text-[#ff2e9a]' : 'text-muted'} aria-hidden="true">
                {position.penDown ? '▼' : '△'}
              </span>
            )}
            {position.state && <span className="text-muted">{position.state}</span>}
            {page && (
              <span className="text-muted/70" title={t('Loaded page size (OH;)')}>
                · {Math.round(page.x1 - page.x0)}×{Math.round(page.y1 - page.y0)}
              </span>
            )}
          </span>
        )}
        <div className="flex-1" />
        {canConnect && (
          connected ? (
            <button type="button" className="btn !py-1 !px-2 !text-[10px] flex items-center gap-1" onClick={() => { void disconnect(); }} disabled={busy || sending}>
              <Unplug size={11} aria-hidden="true" />{t('Disconnect')}
            </button>
          ) : (
            <button
              type="button"
              className="btn !py-1 !px-2 !text-[10px] flex items-center gap-1"
              onClick={() => { void connect(); }}
              disabled={busy || sending || !canConnect || (native && nativePorts.length === 0 && !selectedPort)}
              title={native && nativePorts.length === 0 ? t('No serial ports detected — plug in the cutter and refresh.') : undefined}
            >
              {busy ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Plug size={11} aria-hidden="true" />}
              {busy ? t('Connecting…') : t('Connect')}
            </button>
          )
        )}
      </div>

      {/* Connection strip — the knobs Send/Test cut share. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {native ? (
          <span className="flex items-center gap-1">
            <select
              className="input !py-0.5 !text-[10px] !w-44"
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={connected || portsLoading}
              aria-label={t('Cutter port')}
            >
              <option value="">{nativePorts.length === 0 ? t('No serial ports detected') : t('Auto-select USB port')}</option>
              {nativePorts.map((p) => {
                const chip = chipForPort(p);
                return (
                  <option key={p.path} value={p.path}>
                    {p.path}{p.product || p.manufacturer ? ` — ${p.product ?? p.manufacturer}` : ''}{chip ? ` · ${chip.chip}${chip.likelihood === 'high' ? ` ★${t('cutter')}` : ''}` : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="btn !py-1 !px-1.5 !text-[10px]"
              onClick={refreshPorts}
              disabled={portsLoading || connected}
              title={t('Rescan serial ports')}
            >
              <RefreshCw size={11} className={portsLoading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <label className="flex items-center gap-1 text-[10px] text-muted">
          {t('Baud')}
          <select
            className="input !py-0.5 !text-[10px]"
            value={baud}
            onChange={(e) => setBaud(Number(e.target.value))}
            disabled={connected}
            aria-label={t('Baud rate')}
            title={t('Most HP-GL vinyl cutters use 9600; grbl pen plotters usually 115200.')}
          >
            {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted">
          {t('Flow control')}
          <select
            className="input !py-0.5 !text-[10px]"
            value={flow}
            onChange={(e) => setFlow(e.target.value as FlowControl)}
            disabled={connected}
            aria-label={t('Flow control')}
            title={t('"None" paces the stream below the line rate — safest for cutters without RTS/CTS wiring.')}
          >
            {FLOW_OPTIONS.map((f) => <option key={f.value} value={f.value}>{t(f.label)}</option>)}
          </select>
        </label>
        {connected && (
          <span className="flex items-center gap-1" role="group" aria-label={t('Control lines & poll')}>
            <button
              type="button"
              className={`btn !py-0.5 !px-1.5 !text-[10px] ${signals.dtr ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
              onClick={() => { void toggleSignal('dtr'); }}
              disabled={sending}
              aria-pressed={signals.dtr}
              title={t('Toggle the DTR line — revives plotters that wait for it before talking.')}
            >
              DTR
            </button>
            <button
              type="button"
              className={`btn !py-0.5 !px-1.5 !text-[10px] ${signals.rts ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
              onClick={() => { void toggleSignal('rts'); }}
              disabled={sending}
              aria-pressed={signals.rts}
              title={t('Toggle the RTS line (with hardware flow control this may pause the device).')}
            >
              RTS
            </button>
            <button
              type="button"
              className={`btn !py-0.5 !px-1.5 !text-[10px] ${autoPoll ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
              onClick={() => { setPollStats({ n: 0, min: Infinity, avg: 0, max: 0 }); setAutoPoll(!autoPoll); }}
              disabled={sending}
              aria-pressed={autoPoll}
              title={t('Poll the machine every 2.5 s (OA; / ?) and show the live reply.')}
            >
              {t('Auto status')}
            </button>
            {autoPoll && lastPoll && (
              <span className="text-[10px] text-ink/80 tabular-nums" title={t('Latest machine poll reply')}>{lastPoll}</span>
            )}
            {autoPoll && pollStats.n >= 2 && (
              <span
                className="text-[10px] text-muted tabular-nums"
                title={t('Round-trip latency of the status polls — a rising max hints at link trouble before it fails.')}
              >
                ⏱ {pollStats.min}/{pollStats.avg}/{pollStats.max} ms
              </span>
            )}
          </span>
        )}
        {!canConnect && (
          <span className="text-[10px] text-muted">{t('Direct connection needs the desktop app or Chrome/Edge over HTTPS / localhost.')}</span>
        )}
        {portsError && (
          <span className="text-[10px] text-danger" role="alert">{portsError}</span>
        )}
      </div>

      {open && (
        <>
          {/* Quick machine commands */}
          <div className="mt-2 flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('Quick machine commands')}>
            {quickCommands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                className="btn !py-0.5 !px-1.5 !text-[10px]"
                onClick={() => runQuick(cmd)}
                disabled={!connected || sending}
                title={`${t(cmd.description)}${cmd.expectsReply ? ` ${t('(awaits reply)')}` : ''}`}
              >
                {t(cmd.label)}
              </button>
            ))}
            <button
              type="button"
              className={`btn !py-0.5 !px-1 !text-[10px] ${refOpen ? 'border-accent2 text-accent2' : ''}`}
              onClick={() => setRefOpen(!refOpen)}
              aria-pressed={refOpen}
              aria-expanded={refOpen}
              title={t('Show what each command sends and what it means.')}
            >
              <HelpCircle size={11} aria-hidden="true" />
            </button>
          </div>

          {/* Command reference — the quick buttons' tooltips, readable. */}
          {refOpen && (
            <div className="mt-1 rounded border border-border bg-panel px-2 py-1 text-[10px]">
              <div className="mb-1 text-muted">
                {t('Commands for')} {format === 'hpgl' ? 'HP-GL' : 'grbl G-code'} ·
                {' '}{t('Type raw text below; queries automatically wait for the reply.')}
              </div>
              <div className="max-h-32 overflow-y-auto divide-y divide-border/40">
                {quickCommands.map((cmd) => (
                  <div key={cmd.id} className="flex flex-wrap items-baseline gap-x-2 py-0.5">
                    <span className="w-24 shrink-0 font-medium text-ink/90">{t(cmd.label)}</span>
                    <code className="shrink-0 rounded bg-panel2 px-1 font-mono text-[#5b9cff]">
                      {cmd.id === 'force-speed' ? (forceSpeedCommand || 'FS..;VS..;') : cmd.command}
                    </code>
                    <span className="min-w-0 flex-1 text-muted">
                      {t(cmd.description)}{cmd.expectsReply ? ` ${t('(awaits reply)')}` : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-muted">
                {t('Keyboard jog')}: ↑↓←→ {jogStep}{unit} · Shift+↑↓←→ 1{unit}
              </div>
            </div>
          )}

          {/* Diagnostics */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('Diagnostics')}>
            <span className="text-[10px] text-muted">{t('Diagnostics')}</span>
            <button
              type="button"
              className="btn !py-0.5 !px-1.5 !text-[10px]"
              onClick={() => { void selfTest(); }}
              disabled={!connected || sending || busy}
              title={t('Ping the machine with harmless status queries and measure round-trip latency.')}
            >
              {t('Self-test')}
            </button>
            <button
              type="button"
              className="btn !py-0.5 !px-1.5 !text-[10px]"
              onClick={() => { void detectBaud(); }}
              disabled={sending || busy || !canConnect}
              title={t('Reconnect at each common baud rate and watch for a reply. The link is restored afterwards.')}
            >
              {t('Detect baud')}
            </button>
            <button
              type="button"
              className="btn !py-0.5 !px-1.5 !text-[10px]"
              onClick={() => { void identify(); }}
              disabled={sending || busy}
              title={t('Ask the machine for its model (OI;) or scan ports for a cutter, then suggest the right profile.')}
            >
              {t('Identify machine')}
            </button>
            {identified && (
              <span className="text-[10px] text-success" title={t('Model reported by the machine')}>{identified}</span>
            )}
            <button
              type="button"
              className="btn !py-0.5 !px-1.5 !text-[10px]"
              onClick={downloadReport}
              title={t('Download a plain-text bundle: connection state, serial knobs, throughput, job history and the traffic log.')}
            >
              {t('Download report')}
            </button>
            {profile && (
              <span className="text-[10px] text-muted" title={t('Active brand profile')}>
                {t('Profile')}: {t(profile.label)}
              </span>
            )}
          </div>

          {/* Saved machines — one row per physical cutter. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className="text-[10px] text-muted"
              title={t('Save the full setup (profile, dialect, force/speed, baud, flow, port, material) under a machine name.')}
            >
              {t('Saved machines')}
            </span>
            <select
              className="input !py-0.5 !text-[10px] !w-40"
              value={selectedMachineId}
              onChange={(e) => loadMachine(e.target.value)}
              aria-label={t('Saved machines')}
            >
              <option value="">{t('— none —')}</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input
              type="text"
              className="input !py-0.5 !text-[10px] !w-28"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder={t('Machine name')}
              aria-label={t('Machine name')}
            />
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={saveMachineAsNew} title={t('Save the current setup as a new machine.')}>{t('Save machine')}</button>
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={updateSelectedMachine} disabled={!selectedMachine} title={t('Overwrite the selected machine with the current setup.')}>{t('Update machine')}</button>
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={removeSelectedMachine} disabled={!selectedMachine} title={t('Delete the selected machine record.')}>{t('Delete machine')}</button>
          </div>

          {/* Jog pad */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted" title={t('Move the carriage with the blade up. Step is in the output unit.')}>
              {t('Jog')}
            </span>
            <span className="flex items-center gap-0.5" role="group" aria-label={t('Jog step')}>
              {JOG_STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`rounded border px-1 py-0.5 text-[10px] tabular-nums transition-colors ${jogStep === s ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink'}`}
                  onClick={() => setJogStep(s)}
                  aria-pressed={jogStep === s}
                >
                  {s}{unit}
                </button>
              ))}
            </span>
            <span className="grid grid-cols-3 gap-0.5" role="group" aria-label={t('Jog controls')}>
              <span />
              <button type="button" className="btn !p-1 flex items-center justify-center" onClick={() => jog(0, 1)} disabled={!connected || sending} title={t('Move up')} aria-label={t('Move up')}><ArrowUp size={11} aria-hidden="true" /></button>
              <span />
              <button type="button" className="btn !p-1 flex items-center justify-center" onClick={() => jog(-1, 0)} disabled={!connected || sending} title={t('Move left')} aria-label={t('Move left')}><ArrowLeft size={11} aria-hidden="true" /></button>
              <button type="button" className="btn !p-1 flex items-center justify-center" onClick={() => { void exec(buildSetOrigin(format)); }} disabled={!connected || sending} title={t('Set the current carriage position as origin')} aria-label={t('Set origin')}><Crosshair size={11} aria-hidden="true" /></button>
              <button type="button" className="btn !p-1 flex items-center justify-center" onClick={() => jog(1, 0)} disabled={!connected || sending} title={t('Move right')} aria-label={t('Move right')}><ArrowRight size={11} aria-hidden="true" /></button>
              <span />
              <button type="button" className="btn !p-1 flex items-center justify-center" onClick={() => jog(0, -1)} disabled={!connected || sending} title={t('Move down')} aria-label={t('Move down')}><ArrowDown size={11} aria-hidden="true" /></button>
              <span />
            </span>
            <span className="flex items-center gap-1">
              <input
                type="text"
                className="input !py-0.5 !text-[10px] font-mono !w-20"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitMoveTo(); }
                }}
                placeholder="X,Y"
                aria-label={t('Move to coordinates')}
                disabled={!connected || sending}
                title={t('Absolute move with the blade up — park the carriage at X,Y (output unit).')}
              />
              <button
                type="button"
                className="btn !py-0.5 !px-1.5 !text-[10px]"
                onClick={submitMoveTo}
                disabled={!connected || sending || !moveTo.trim()}
                title={t('Move the carriage to the X,Y coordinates.')}
              >
                {t('Go')}
              </button>
              <button
                type="button"
                className="btn !py-0.5 !px-1.5 !text-[10px]"
                onClick={() => { void exec(buildMoveTo(format, 0, 0, unit, feedRate)); }}
                disabled={!connected || sending}
                title={t('Return the carriage to the origin (0,0).')}
              >
                {t('Home')}
              </button>
            </span>
          </div>

          {/* Traffic log */}
          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted">
            <span className="uppercase tracking-wide">{t('Serial traffic')}</span>
            <span className="tabular-nums" title={t('Lifetime bytes sent / received over this connection')}>
              TX {fmtBytes(link.txBytes)} · RX {fmtBytes(link.rxBytes)}
            </span>
            {lastTransfer && (
              <span
                className="tabular-nums"
                title={t('Effective throughput of the last transfer vs the theoretical line rate.')}
              >
                · {t('Last transfer')} {fmtBytes(lastTransfer.bps)}/s
                {lastTransfer.pct !== null && lastTransfer.pct > 0 ? ` (${Math.round(lastTransfer.pct * 100)}% ${t('of line rate')})` : ''}
              </span>
            )}
            <div className="flex-1" />
            {(['all', 'tx', 'rx', 'notice'] as const).map(f => (
              <button
                key={f}
                type="button"
                className={`btn !py-0.5 !px-1 !text-[10px] ${dirFilter === f ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                onClick={() => setDirFilter(f)}
                aria-pressed={dirFilter === f}
                title={t('Filter the traffic log by direction.')}
              >
                {t(f === 'all' ? 'All' : f === 'tx' ? 'TX' : f === 'rx' ? 'RX' : 'Notices')}
              </button>
            ))}
            <button type="button" className={`btn !py-0.5 !px-1.5 !text-[10px] ${hexView ? 'border-accent2 text-accent2' : ''}`} onClick={() => setHexView(!hexView)} aria-pressed={hexView} title={t('Toggle HEX / ASCII view')}>HEX</button>
            <button type="button" className={`btn !py-0.5 !px-1.5 !text-[10px] ${autoScroll ? 'border-accent2 text-accent2' : ''}`} onClick={() => setAutoScroll(!autoScroll)} aria-pressed={autoScroll} title={t('Follow new traffic automatically')}>{t('Auto')}</button>
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={() => { void copyLog(); }} title={t('Copy console log')}><Copy size={11} aria-hidden="true" /></button>
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={() => download('plotter-console.log', plainLog(), 'text/plain')} title={t('Download console log')}><Download size={11} aria-hidden="true" /></button>
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={() => setEntries([])} title={t('Clear console')}><Trash2 size={11} aria-hidden="true" /></button>
          </div>
          {/* Timeline strip — TX above / RX below the axis, errors full
              height; a glance at reply latency and burst patterns. */}
          {(() => {
            const recent = entries.slice(-160);
            if (recent.length < 2) return null;
            const t1 = recent[recent.length - 1].ts;
            const t0 = Math.min(recent[0].ts, t1 - 1000);
            const span = Math.max(1, t1 - t0);
            const X = (ts: number) => ((ts - t0) / span) * 100;
            const FILLS: Record<Entry['dir'], string> = { tx: '#5b9cff', rx: '#22c55e', err: '#ef4444', warn: '#f59e0b', info: '#6b7280' };
            return (
              <svg
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                className="mt-1 h-6 w-full rounded border border-border bg-panel"
                role="img"
                aria-label={t('Traffic timeline')}
              >
                <line x1="0" y1="12" x2="100" y2="12" strokeWidth="0.3" stroke="#4b5563" />
                {recent.map(e => {
                  const x = X(e.ts);
                  if (e.dir === 'tx') return <rect key={e.id} x={x} y="2" width="0.7" height="8" fill={FILLS.tx} />;
                  if (e.dir === 'rx') return <rect key={e.id} x={x} y="14" width="0.7" height="8" fill={FILLS.rx} />;
                  if (e.dir === 'err') return <rect key={e.id} x={x} y="1" width="0.7" height="22" fill={FILLS.err} />;
                  return <rect key={e.id} x={x} y="10" width="0.7" height="4" fill={FILLS[e.dir]} opacity="0.7" />;
                })}
              </svg>
            );
          })()}
          <div
            ref={scrollRef}
            className="mt-1 h-40 overflow-y-auto rounded border border-border bg-panel px-2 py-1 font-mono text-[10px] leading-relaxed"
            role="log"
            aria-label={t('Serial traffic')}
            aria-live="polite"
          >
            {filteredEntries.length === 0 ? (
              <div className="text-muted">{entries.length === 0 ? t('No serial traffic yet — connect the cutter, then use the quick commands or jog pad.') : t('No entries match this filter.')}</div>
            ) : filteredEntries.map((e) => (
              <div key={e.id} className="flex gap-1.5">
                <span className="text-muted/70 tabular-nums shrink-0">
                  {new Date(e.ts).toLocaleTimeString([], { hour12: false })}.{String(e.ts % 1000).padStart(3, '0')}
                </span>
                <span
                  className={`shrink-0 font-semibold ${e.dir === 'tx' ? 'text-[#5b9cff]' : e.dir === 'rx' ? 'text-success' : e.dir === 'err' ? 'text-danger' : e.dir === 'warn' ? 'text-warning' : 'text-muted'}`}
                  title={e.dir}
                >
                  {e.dir === 'tx' ? 'TX' : e.dir === 'rx' ? 'RX' : '··'}
                </span>
                <span className={`break-all ${e.dir === 'err' ? 'text-danger' : e.dir === 'warn' ? 'text-warning' : 'text-ink/90'}`}>
                  {e.bytes !== undefined ? <span className="text-muted tabular-nums mr-1">{e.bytes}B</span> : null}
                  {fmtEntry(e)}
                </span>
              </div>
            ))}
          </div>

          {/* Raw command input */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="text"
              className="input !py-1 !text-[10px] font-mono flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitInput(); }
                else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.nativeEvent.isComposing && history.length > 0) {
                  e.preventDefault();
                  const recalled = recallHistory(e.key === 'ArrowUp' ? -1 : 1, input);
                  if (recalled !== null) setInput(recalled);
                  // Returning past the newest entry drops back to free typing.
                  if (e.key === 'ArrowDown' && histIdx === history.length - 1) setHistIdx(-1);
                }
              }}
              placeholder={format === 'hpgl' ? 'IN; SP1; VS10; OE;' : '$I ? $X G0 X10'}
              aria-label={t('Raw command')}
              disabled={!connected}
            />
            <button
              type="button"
              className="btn !py-1 !px-2 !text-[10px]"
              onClick={submitInput}
              disabled={!connected || !input.trim()}
              title={t('Send raw machine text. Query commands (OE;, ?, $I…) automatically await the reply.')}
            >
              {t('Send')}
            </button>
          </div>

          {/* Job history — what went out, on which settings. */}
          <div className="mt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-muted hover:text-ink transition-colors"
              onClick={() => { const next = !historyOpen; setHistoryOpen(next); if (next) setLogRefresh(v => v + 1); }}
              aria-expanded={historyOpen}
              title={t('The last 50 sends with their settings and results.')}
            >
              {historyOpen ? <ChevronDown size={10} aria-hidden="true" /> : <ChevronRight size={10} aria-hidden="true" />}
              {t('Job history')} ({jobHistory.length})
            </button>
            {historyOpen && (
              <div className="mt-1 rounded border border-border bg-panel px-2 py-1">
                {jobHistory.length === 0 ? (
                  <div className="text-[10px] text-muted">{t('No jobs recorded yet.')}</div>
                ) : (
                  <>
                    <div className="max-h-28 overflow-y-auto divide-y divide-border/50">
                      {jobHistory.map((e) => (
                        <div key={e.ts} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 text-[10px] tabular-nums">
                          <span className="text-muted/70 shrink-0">{new Date(e.ts).toLocaleString()}</span>
                          <span
                            className={`shrink-0 font-semibold ${e.result === 'ok' ? 'text-success' : e.result === 'aborted' ? 'text-warning' : 'text-danger'}`}
                            title={e.result}
                          >
                            {e.result === 'ok' ? '✓' : e.result === 'aborted' ? '⏹' : '✕'}
                          </span>
                          <span className="shrink-0">{e.kind === 'test-cut' ? t('Test cut') : t('Job')}</span>
                          <span className="text-muted min-w-0 truncate">{e.target} · {e.format.toUpperCase()} · {e.baud} baud</span>
                          <span className="text-muted">{e.paths} {t('paths')} · {fmtBytes(e.bytes)} · {e.seconds}s</span>
                          {e.materialId && <span className="text-muted/70">{e.materialId}</span>}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn !py-0.5 !px-1.5 !text-[10px] mt-1"
                      onClick={() => { clearJobLog(); setLogRefresh(v => v + 1); }}
                      title={t('Delete all job history entries.')}
                    >
                      {t('Clear history')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
