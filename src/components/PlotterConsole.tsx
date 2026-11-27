import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  ChevronDown, ChevronRight, Terminal, Trash2, Copy, Download, HelpCircle,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair, Plug, Unplug, Loader2, RefreshCw,
  Move, FlaskConical, Zap,
} from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { download } from '../lib/io';
import { PlotterLink, lineRateBytesPerSec, runWithPortProbe, toHex, type FlowControl } from '../lib/plotterLink';
import type { NativeSerialPort } from '../lib/plotter';
import { QUICK_COMMANDS, buildForceSpeed, buildJog, buildMoveTo, buildSetOrigin, decodeReply, isQueryCommand, parsePageReply, parsePositionReply, parseTravelReply, type MachinePosition, type QuickCommand } from '../lib/hpglDebug';
import { buildDiagnosticsReport, probeBaud, runConnectionSelfTest, type DiagStep } from '../lib/plotterDiag';
import { runAutoSetup, parseGrblSettings, type AutoSetupResult, type GrblSetting } from '../lib/plotterAutoSetup';
import { chipForPort, identifyMachine, type IdentifyResult } from '../lib/plotterIdentify';
import { SIM_PORT, WEB_PORT, autoProbeBauds, loadLastLink, markAutoProbed, pickScanBaud, pickScanPort, planNativeScan, planWebScan, saveLastLink, wasAutoProbed, type ScanPlan, type WebPortInfo } from '../lib/plotterScan';
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
/** Press-and-hold jog: first move on pointer-down, repeats start after this
 *  delay and then run at this interval (ms). */
const JOG_HOLD_DELAY_MS = 420;
const JOG_REPEAT_MS = 170;
/** Quick commands promoted onto the Position & test card (pen / media). */
const PEN_MEDIA_COMMANDS: Array<QuickCommand['id']> = ['pen-up', 'blade-tap', 'feed', 'eject'];
/** Focus inside any of these owns its arrow keys (roving tablists, segmented
 *  controls, text fields) — the keyboard jog must never steal them. */
const ARROW_KEY_WIDGETS = [
  'input', 'textarea', 'select', '[contenteditable="true"]', 'a[href]',
  '[role="tablist"]', '[role="tab"]', '[role="group"]', '[role="toolbar"]',
  '[role="listbox"]', '[role="menu"]', '[role="menuitem"]', '[role="tree"]',
  '[role="slider"]', '[role="spinbutton"]', '[data-value]',
].join(',');
const MAX_ENTRIES = 400;

/** The automatic identify waits this long after 'connected' before it
 *  queries, so the connect sequence's own working-area query is over. */
const AUTO_IDENTIFY_DELAY_MS = 1500;
/** Upper bound of that identify (its queries each have their own timeout). */
const AUTO_IDENTIFY_TIMEOUT_MS = 8000;
/** How long the rehearsal read-out waits for a virtual move to land. */
const SIM_SETTLE_MS = 6000;

interface Entry {
  id: number;
  ts: number;
  dir: 'tx' | 'rx' | 'info' | 'err' | 'warn';
  text: string;
  bytes?: number;
  raw?: Uint8Array;
}

/** Loaded working area, if the machine reported one (HP-GL `OH;` page limits
 *  or grbl `$130` / `$131` travel). Powers the off-page jog warning. */
export interface PlotterPageLimits { x0: number; y0: number; x1: number; y1: number }


/**
 * One arrow of the jog pad. A pointer press moves once and then repeats
 * while held (see JOG_HOLD_DELAY_MS); the click that ends a hold is ignored
 * so that move is not sent twice. Keyboard Enter / Space arrives as a
 * click with `detail === 0` — a plain single move.
 */
function JogKey({ Icon, label, disabled, onStart, onEnd, jog }: {
  Icon: typeof ArrowUp;
  label: string;
  disabled: boolean;
  onStart: (event: ReactPointerEvent<HTMLButtonElement>, dx: number, dy: number) => void;
  onEnd: () => void;
  jog: (dx: number, dy: number) => void;
}) {
  const dx = Icon === ArrowLeft ? -1 : Icon === ArrowRight ? 1 : 0;
  const dy = Icon === ArrowUp ? 1 : Icon === ArrowDown ? -1 : 0;
  return (
    <button
      type="button"
      className="btn p-1! flex items-center justify-center select-none touch-none"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(event) => onStart(event, dx, dy)}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onLostPointerCapture={onEnd}
      onClick={(event) => { if (event.detail === 0) jog(dx, dy); }}
    >
      <Icon size={11} aria-hidden="true" />
    </button>
  );
}

export interface PlotterConsoleProps {
  link: PlotterLink;
  format: 'gcode' | 'hpgl';
  /** Switch the output format (auto-detect applies the machine's language). */
  setFormat: (f: 'gcode' | 'hpgl') => void;
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
  /** Machine-name prefill from the dialog's auto-detect (model / chip). */
  machineNameHint?: string;
  /** Machine setup (profile / output format / dialect / …), owned by the
   *  dialog. Rendered between the positioning card and the diagnostics. */
  settings?: ReactNode;
  /** One-click auto-detect (native only), owned by the dialog. Rendered as
   *  the connection card's last row so scan and connect sit together. */
  setupActions?: ReactNode;
  /** Opens AND primes the link. Dialog-owned so the Connect button and the
   *  dialog's connect-on-demand gate prime the machine identically. Rejects
   *  with a classified LinkOpenError (plotterLink.ts) when nothing opened.
   *  `simulate` opens the built-in virtual plotter instead of a port. */
  onConnect: (opts?: { simulate?: boolean; portPath?: string; baud?: number }) => Promise<boolean>;
  /** The virtual plotter was (un)selected in the port list — lets the dialog route an implicit Send / Test cut to it. */
  onSimulateChange?: (simulate: boolean) => void;
  /** A failed open, reported to the operator by the dialog (it owns the
   *  wording; the raw transport text is never shown). */
  onOpenError?: (error: unknown) => void;
  /** The footer's test actions, mirrored next to the jog pad. A missing
   *  handler renders no button (e.g. no Force test under G-code). */
  onTestCut?: () => void;
  onForceTest?: () => void;
  onLaserTest?: () => void;
  onCornerTour?: () => void;
  /** True while the dialog streams a job or test cut (its `busy` flag). */
  jobBusy?: boolean;
}

let entrySeq = 1;
/** Timestamp helper kept at module scope — the React compiler purity rule
 *  flags direct `Date.now()` calls inside component-scope functions. */
const nowMs = (): number => Date.now();

/** The promise, or null once `ms` has passed — the caller decides what a
 *  late answer is worth. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    p.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      () => { window.clearTimeout(timer); resolve(null); },
    );
  });
}

/** Is the link up? A function so code that runs after an await gets a fresh
 *  answer — the compiler keeps an earlier narrowing of `link.status` across
 *  the await and would otherwise reject the comparison. */
const isUp = (link: PlotterLink): boolean => link.status === 'connected';

/** Wait for the query in flight (usually the auto-poll's) to finish. Every
 *  pending query is handed the same reply text, so a query sent on top of
 *  another would read THAT reply as its own — an identify that started
 *  next to a position poll would take "123,456,0" for a model string. */
async function queriesSettled(link: PlotterLink, maxMs: number): Promise<void> {
  const t0 = Date.now();
  while (link.querying && Date.now() - t0 < maxMs) {
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 30); });
  }
}

export function PlotterConsole(props: PlotterConsoleProps) {
  const {
    link, format, setFormat, unit, native, webSerial, sending,
    nativePorts, selectedPort, setSelectedPort, refreshPorts, portsLoading, portsError,
    baud, setBaud, flow, setFlow, force, speed, feedRate,
    profile, connectInit, forceSpeedCommand, snapshotConfig, applyConfig, jobLogVersion, applyProfile, machineNameHint,
    settings, setupActions, onConnect, onSimulateChange, onOpenError, onTestCut, onForceTest, onLaserTest, onCornerTour, jobBusy = false,
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
  // Last diagnostic context for the downloadable report (plotterDiag):
  // identify result, self-test steps and the grbl $$ snapshot.
  const [lastIdentify, setLastIdentify] = useState<IdentifyResult | null>(null);
  const [lastSelfTest, setLastSelfTest] = useState<DiagStep[] | null>(null);
  const [lastGrblSettings, setLastGrblSettings] = useState<GrblSetting[] | null>(null);
  // "Virtual plotter" picked in the port list. Console-local on purpose: the
  // dialog's selectedPort is persisted as a real OS path.
  const [simSelected, setSimSelected] = useState(false);
  // Keep the dialog in sync: when the virtual plotter is the chosen "port", an
  // implicit Send / Test cut from the footer must rehearse, not reach for a
  // real serial port.
  const chooseSim = (on: boolean) => { setSimSelected(on); onSimulateChange?.(on); };
  // Automatic scan (plotterScan.ts). Web shell: what navigator.serial.getPorts()
  // last returned (null = not scanned). Native: the dialog's nativePorts.
  const [webPorts, setWebPorts] = useState<WebPortInfo[] | null>(null);
  /** Path of the port the active identification is probing ('' = none). */
  const [scanIdentifying, setScanIdentifying] = useState('');
  const [scanNote, setScanNote] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanFound, setScanFound] = useState<AutoSetupResult | null>(null);
  /** Bumped on every 'connected' event — the once-per-connection trigger. */
  const [connSeq, setConnSeq] = useState(0);
  const [autoIdentifying, setAutoIdentifying] = useState(false);
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

  // Auto-detect name prefill (model / chip from the dialog's scan), as a
  // derived value rather than an effect: the save-machine input shows the
  // hint until the operator types or loads a record, and saves pick it
  // up untouched. (Removing a record may re-reveal the hint — harmless.)
  const machineNameValue = machineName || machineNameHint || '';

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
          setLastIdentify(null);
          setIdentified('');
          connNo.current += 1;
          setConnSeq(n => n + 1);
          push({ ts: nowMs(), dir: 'info', text: `${t('Connected')} — ${link.describe()} ${flow.toUpperCase() === 'NONE' ? '' : flow}` });
          // Remember where a REAL link last succeeded: the next scan preselects it.
          const port = link.simulated ? '' : native ? link.detail.split('@')[0].trim() : WEB_PORT;
          if (port) saveLastLink({ port, baud: link.baud });
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
  }, [link, t, flow, native]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, autoScroll, hexView, open]);

  // Periodic machine poll — proves the link is alive and shows live
  // carriage state without flooding the traffic log. Suspended while the
  // machine is being identified: two queries in flight share one reply.
  useEffect(() => {
    if (!connected || !autoPoll || sending || autoIdentifying) return;
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
  }, [connected, autoPoll, sending, autoIdentifying, format, unit, link]);


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

  /** Diagnostic steps → traffic log, one entry each (self-test format). */
  const pushSteps = (steps: DiagStep[]) => {
    for (const s of steps) {
      const mark = s.status === 'pass' ? '✓' : s.status === 'fail' ? '✕' : '·';
      push({
        ts: nowMs(),
        dir: s.status === 'fail' ? 'err' : 'info',
        text: `${mark} ${s.label}${s.ms !== undefined ? ` (${s.ms} ms)` : ''} ${s.detail}`,
      });
    }
  };

  /** grbl machines have no OH; page query — their work area comes from
   *  the $130/$131 max-travel settings (single-line replies, so the
   *  link's query() gets them reliably). Read both once; silence just
   *  leaves the off-page jog warning without limits (skipped, no error). */
  const fetchTravelPage = async () => {
    try {
      const x = await link.query('$130', 900).catch(() => '');
      const y = await link.query('$131', 900).catch(() => '');
      const travel = parseTravelReply(`${x}\n${y}`);
      if (travel) {
        setPage({ x0: 0, y0: 0, x1: travel.x, y1: travel.y });
        push({ ts: nowMs(), dir: 'info', text: `${t('Loaded page')}: ${Math.round(travel.x)} × ${Math.round(travel.y)} ${unit} ($130/$131)` });
      }
    } catch { /* no $$-class settings → the jog warning stays without limits */ }
  };

  /** True while this console's own Connect sequence is in flight. */
  const connectingRef = useRef(false);

  /** Working area of the machine that was just linked — powers the page-size
   *  readout next to the position chip and the off-page jog warning. Best
   *  effort: a machine that ignores the query just leaves the readout hidden. */
  const loadConnectedPage = async (): Promise<void> => {
    if (link.status !== 'connected') return;
    if (format === 'gcode') { await fetchTravelPage(); return; }
    const parsed = parsePageReply(await link.query('OH;', 1000).catch(() => ''), unit);
    if (!parsed || link.status !== 'connected') return;
    setPage(parsed);
    push({
      ts: nowMs(),
      dir: 'info',
      text: `${t('Loaded page')}: ${Math.round(parsed.x1 - parsed.x0)} × ${Math.round(parsed.y1 - parsed.y0)} ${unit}`,
    });
  };

  /** Coalesces read-outs: a held jog fires a move every JOG_REPEAT_MS, and
   *  they all share ONE position re-read once the head has stopped. */
  const simRefresh = useRef({ running: false, again: false });

  /** Rehearsal mode only: re-read the carriage once the virtual head has
   *  finished moving, so the read-out shows where a jog landed rather than
   *  where the head was passing through. A real machine is left alone —
   *  its position comes from Auto status, as before. */
  const refreshSimPosition = async (): Promise<void> => {
    if (!link.simulated) return;
    const state = simRefresh.current;
    if (state.running) { state.again = true; return; }
    state.running = true;
    try {
      do {
        state.again = false;
        await link.whenSimSettled(SIM_SETTLE_MS);
        if (link.status !== 'connected' || !link.simulated) return;
        const reply = await link.query(format === 'hpgl' ? 'OA;' : '?', 1500).catch(() => '');
        if (link.status !== 'connected') return;
        const pos = parsePositionReply(format, reply, unit);
        if (pos) setPosition(pos);
      } while (state.again);
    } finally {
      state.running = false;
    }
  };

  const connect = async () => {
    connectingRef.current = true;
    setBusy(true);
    try {
      const ok = await onConnect(simSelected ? { simulate: true } : undefined);
      if (!ok) return;
      if (simSelected && !link.simulated && isUp(link)) {
        // The contract says `simulate` opens the virtual plotter. If a real
        // port went open in the name of rehearsal instead, undo it at once —
        // "nothing is sent to a real device" is the whole promise.
        await link.close();
        push({
          ts: nowMs(),
          dir: 'err',
          text: t('Rehearsal mode was requested, but the virtual plotter was not opened — the connection was closed.'),
        });
        return;
      }
      // Prime the machine per the selected brand profile (IN + force/speed).
      if (connectInit) {
        push({ ts: nowMs(), dir: 'info', text: `${t('Profile init sent')}: ${connectInit}` });
      }
      await loadConnectedPage();
      await refreshSimPosition();
      // A connection made from here identifies itself; the timer in the
      // effect below only covers connections opened elsewhere (Send, Test cut).
      if (!sending && !jobBusy) await identifyOnce();
    } catch (e) {
      // The link already logged the raw reason; the operator gets the
      // dialog's readable hint (e.g. "Port selection cancelled").
      onOpenError?.(e);
    } finally {
      connectingRef.current = false;
      setBusy(false);
      forceTick();
    }
  };

  const disconnect = async () => {
    await link.close();
    forceTick();
  };

  /** Send machine text; awaits + decodes the reply for query commands.
   *  `follow` re-reads the carriage afterwards (rehearsal mode only). */
  const exec = async (text: string, expectsReply = false, follow = false) => {
    if (!text) return;
    if (!connected) { toast.warn(t('Connect the cutter first.'), { title: t('Not connected') }); return; }
    try {
      if (expectsReply || isQueryCommand(format, text)) {
        const reply = await link.query(text);
        push({ ts: nowMs(), dir: 'info', text: `→ ${decodeReply(format, text, reply, unit)}` });
        // Keep the diagnostics report's $$ snapshot fresh when the
        // operator re-reads the grbl settings by hand.
        if (format === 'gcode' && text.trim() === '$$') setLastGrblSettings(parseGrblSettings(reply));
      } else {
        await link.send(text);
      }
      if (follow) await refreshSimPosition();
    } catch (e) {
      push({ ts: nowMs(), dir: 'err', text: (e as Error).message });
    }
  };

  /** A carriage move or a panel command: on a real machine just the send it
   *  always was; in rehearsal mode the position read-out follows it. */
  const execMove = (text: string, expectsReply = false) => {
    void exec(text, expectsReply, true);
  };

  // Keyboard jog — arrow keys move the carriage while the Position & test
  // card is on screen (i.e. whenever the link is up); plain arrows use the
  // selected step, Shift+arrows do a 1-unit fine trim, and the key's own
  // auto-repeat gives a held move. Skipped whenever focus sits in a control
  // that owns its arrow keys (text fields, tab strips, segmented presets, the
  // step buttons) so a jog can never double as a UI navigation key.
  useEffect(() => {
    if (!connected || sending || jobBusy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      // The pad's own buttons are the one place arrows always jog (they sit
      // in a role="group" themselves, and key auto-repeat then gives a hold).
      const owner = target.closest(ARROW_KEY_WIDGETS);
      if (owner && !owner.closest('[data-jog-pad]')) return;
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      execMove(buildJog(format, dir[0] * (e.shiftKey ? 1 : jogStep), dir[1] * (e.shiftKey ? 1 : jogStep), unit, feedRate));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, sending, jobBusy, format, unit, feedRate, jogStep]);

  const runQuick = (cmd: QuickCommand) => {
    const text = cmd.id === 'force-speed' ? (forceSpeedCommand || buildForceSpeed(force, speed)) : cmd.command;
    if (!text) {
      if (cmd.id === 'force-speed') toast.info(t('This machine sets force/speed on its panel — nothing to send.'));
      return;
    }
    execMove(text, cmd.expectsReply);
  };

  /** Diagnostics — see plotterDiag.ts. Results land in the traffic log. */
  const selfTest = async () => {
    if (!connected) return;
    setBusy(true);
    push({ ts: nowMs(), dir: 'info', text: `— ${t('Connection self-test')} —` });
    try {
      const steps = await runConnectionSelfTest(link, format);
      setLastSelfTest(steps);
      pushSteps(steps);
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

  /** Identify the machine: OI; (HP-GL) / $I (grbl) query when connected,
   *  the full auto-setup scan when not (port probe → identify → $$
   *  snapshot → self-test, see plotterAutoSetup.ts). Suggests the matching
   *  brand profile with a one-click apply toast and switches the output
   *  format to the machine's language (grbl → G-code). */
  const identify = async () => {
    setBusy(true);
    push({ ts: nowMs(), dir: 'info', text: `— ${t('Identify machine')} —` });
    try {
      if (link.status === 'connected') {
        // Let a position poll in flight finish first — it would otherwise be
        // read back as this query's reply.
        await queriesSettled(link, 2500);
        if (link.status !== 'connected') return;
        const r = await identifyMachine(link, format);
        setIdentified(r.model);
        setLastIdentify(r);
        push({ ts: nowMs(), dir: r.model ? 'info' : 'warn', text: r.summary });
        offerProfile(r.suggestedProfileId);
      } else if (native && nativePorts.length > 0) {
        const result = await runAutoSetup(link, nativePorts, {
          flowControl: flow,
          currentFormat: format,
          onLog: (line) => push({ ts: nowMs(), dir: 'info', text: line }),
        });
        if (result.grblSettings.length > 0) setLastGrblSettings(result.grblSettings);
        pushSteps(result.steps);
        if (result.found || result.suspectedClone) {
          setSelectedPort(result.port);
          setBaud(result.baud);
          if (result.format !== format) {
            setFormat(result.format);
            push({ ts: nowMs(), dir: 'info', text: `${t('Format set to')} ${result.format === 'gcode' ? 'G-code' : 'HP-GL'}` });
          }
          setIdentified(result.model || result.grblBuild);
          const chip = result.chip ? ` (${result.chip.chip})` : '';
          push({
            ts: nowMs(),
            dir: result.found ? 'info' : 'warn',
            text: result.found
              ? `${t('Cutter found')}: ${result.port}${chip} @ ${result.baud}${result.model ? ` — ${result.model}` : result.grblBuild ? ` — ${result.grblBuild}` : ''}`
              : `${result.port}${chip} — ${t('No reply — suspected Chinese clone (they ignore queries). Try 9600 + a test cut.')}`,
          });
          offerProfile(result.profileId);
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

  /* ------------------------------------------------------------------
   * Automatic scan + identify (plotterScan.ts), and identify-after-connect.
   * ------------------------------------------------------------------ */
  const connNo = useRef(0);
  const identifiedConn = useRef(-1);
  const probeAbort = useRef<AbortController | null>(null);
  const scanSeq = useRef(0);
  const preselected = useRef(false);
  const refreshPortsRef = useRef(refreshPorts);
  useEffect(() => { refreshPortsRef.current = refreshPorts; }, [refreshPorts]);

  /** The scan plan for what is on screen right now (null: not scanned yet). */
  const currentScanPlan = (): ScanPlan | null =>
    native ? planNativeScan(nativePorts) : webPorts ? planWebScan(webPorts) : null;

  /** Identify the connected machine, once per connection, only while no
   *  brand profile is selected (a chosen profile is the operator's word).
   *  Two entry points, one run: this card's Connect sequence calls it once
   *  its own queries are done; the timer below covers connections opened
   *  elsewhere (Send / Test cut) and skips those Connect is still busy with. */
  const identifyOnce = async (): Promise<void> => {
    const seq = connNo.current;
    // Never in the middle of a job: a query cut into the stream is a command
    // the machine did not ask for. The effect below offers again once it ends.
    if (seq === 0 || profile || identifiedConn.current === seq || sendingRef.current || jobBusyRef.current) return;
    identifiedConn.current = seq;
    if (!isUp(link)) return;
    setAutoIdentifying(true);
    try {
      // Not on top of a position poll, and not before the connect sequence
      // is done asking its own questions.
      await queriesSettled(link, AUTO_IDENTIFY_TIMEOUT_MS);
      if (!isUp(link) || sendingRef.current || jobBusyRef.current) return;
      const r = await withTimeout(identifyMachine(link, format), AUTO_IDENTIFY_TIMEOUT_MS);
      if (!r || link.status !== 'connected') return;
      setIdentified(r.model);
      setLastIdentify(r);
      push({ ts: nowMs(), dir: r.model ? 'info' : 'warn', text: `— ${t('Identify machine')}: ${r.summary}` });
    } finally {
      setAutoIdentifying(false);
    }
  };

  // Connections opened elsewhere get the same identify — after the connect
  // sequence's own working-area query, so the two never share a reply, and
  // never while a job is streaming (it is offered again once that is over).
  useEffect(() => {
    if (connSeq === 0 || !connected || sending) return;
    const timer = window.setTimeout(() => {
      if (connectingRef.current) return;
      void identifyOnce();
    }, link.simulated ? 300 : AUTO_IDENTIFY_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connSeq, sending]);

  /** What a detection selects — profile, machine language and line
   *  settings, exactly what the Auto-detect button applies — never a link.
   *  Only ever run from the Connect beside the detection: the scan itself
   *  is unattended, and its guess (a silent CH340 is "suspected clone") must
   *  not quietly replace what the operator set. */
  const applyDetection = (result: AutoSetupResult) => {
    if (result.profileId) applyProfile(result.profileId);
    setFormat(result.format);
    setBaud(result.baud); // the live-detected rate wins over the profile default
    chooseSim(false);
    if (native) setSelectedPort(result.port);
  };
  // That Connect applies the detection and connects — once the settings have
  // reached this component. They live in the dialog above, so the connect
  // waits for the render that carries them (the ticket changes once).
  const [appliedDetection, setAppliedDetection] = useState(0);
  useEffect(() => {
    if (!appliedDetection) return;
    // One tick out: `connect` reports "connecting" at once, which an effect
    // must not do synchronously. The closure is the committed render's, so it
    // already sees the applied port, baud and format.
    const timer = window.setTimeout(() => { void connect(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedDetection]);

  /** Active identification of the plan's candidate ports: probe → identify →
   *  light self-test (runAutoSetup). Runs on a PRIVATE link: the shared one
   *  stays honestly "not connected" the whole time, and a Connect pressed
   *  meanwhile simply waits for the probe (plotterLink's port-probe lease).
   *  The result is offered, never applied — see `applyDetection`. */
  const identifyPorts = async (plan: ScanPlan): Promise<void> => {
    if (link.status === 'connected' || probeAbort.current || plan.probePorts.length === 0) return;
    const seq = ++scanSeq.current;
    const abort = new AbortController();
    probeAbort.current = abort;
    setScanIdentifying(plan.probePorts[0].path);
    setScanNote('');
    setScanError('');
    setScanFound(null);
    // Only the bauds that plausibly work — an unattended probe must not rake
    // a silent machine with every rate (the Auto-detect button still does).
    const last = loadLastLink();
    const bauds = autoProbeBauds(plan.candidates[0]?.chip ?? null, [baud, ...(last ? [last.baud] : [])]);
    try {
      const result = await runWithPortProbe(
        () => abort.abort(),
        () => runAutoSetup(new PlotterLink().asPortProbe(), plan.probePorts, {
          flowControl: flow,
          currentFormat: format,
          bauds,
          signal: abort.signal,
          onLog: (line) => { if (seq === scanSeq.current) setScanNote(line); },
        }),
      );
      // Superseded, cancelled, or the operator linked meanwhile: not ours to show.
      // (isUp() rather than `link.status`: the early return above narrowed
      // the status for the compiler, but an await has passed since.)
      if (seq !== scanSeq.current || isUp(link)) return;
      setScanFound(result);
      if (result.grblSettings.length > 0) setLastGrblSettings(result.grblSettings);
      pushSteps(result.steps);
    } catch (e) {
      if (seq === scanSeq.current) setScanError((e as Error).message);
    } finally {
      if (probeAbort.current === abort) probeAbort.current = null;
      if (seq === scanSeq.current) setScanIdentifying('');
    }
  };

  // Leaving the page abandons a probe in flight (it lets go of the ports
  // after the attempt that is running).
  useEffect(() => () => { probeAbort.current?.abort(); scanSeq.current += 1; }, []);

  /** The card's "Scan & identify" button: identify what is listed, now. */
  const identifyCandidates = (): void => {
    const plan = currentScanPlan();
    if (plan) void identifyPorts(plan);
  };

  // Entering the Machine tab unlinked = scan. Native: a fresh port list (the
  // cutter may have been plugged in since). Web: the ports this origin is
  // already authorized to open. `refreshPorts` is a new function every
  // dialog render, hence the ref — the scan must run once per entry.
  useEffect(() => {
    if (connected) return;
    if (native) {
      const timer = window.setTimeout(() => { refreshPortsRef.current(); }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!webSerial) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const serial = (navigator as Navigator & { serial?: { getPorts?: () => Promise<Array<{ getInfo?: () => WebPortInfo }>> } }).serial;
        const granted = ((await serial?.getPorts?.().catch(() => [])) ?? []).map((port) => port.getInfo?.() ?? {});
        if (!cancelled) setWebPorts(granted);
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [connected, native, webSerial]);

  // Few enough candidates → identify them without asking (plotterScan.ts
  // decides what "few" is). Once per distinct port list, for the whole
  // session: a disconnect or a mere re-list — or leaving the tab and coming
  // back, which remounts this pane — does not open the machine again.
  useEffect(() => {
    if (connected) return;
    const plan = currentScanPlan();
    if (!plan?.autoIdentify) return;
    const key = plan.probePorts.map((p) => p.path).join('|');
    const timer = window.setTimeout(() => {
      if (wasAutoProbed(key)) return;
      markAutoProbed(key);
      void identifyPorts(plan);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, native, nativePorts, webPorts]);

  // Preselect the port + baud of the last link that reached "connected".
  useEffect(() => {
    if (connected || preselected.current) return;
    const plan = currentScanPlan();
    if (!plan || plan.candidates.length === 0 || (native && portsLoading)) return;
    preselected.current = true;
    const timer = window.setTimeout(() => {
      const last = loadLastLink();
      if (!last) return;
      if (!native) { setBaud(pickScanBaud(WEB_PORT, last, baud)); return; }
      const port = pickScanPort(plan.candidates, last, selectedPort);
      if (port !== selectedPort) setSelectedPort(port);
      setBaud(pickScanBaud(port, last, baud));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, native, nativePorts, webPorts, portsLoading]);

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
      identify: lastIdentify,
      selfTestSteps: lastSelfTest ?? undefined,
      ...(lastGrblSettings ? { grblSettings: lastGrblSettings } : {}),
      jobs: jobHistory.slice(0, 20),
      logLines: plainLog().split('\n').slice(-200),
    });
    download('plotter-diagnostics.txt', report, 'text/plain');
    toast.success(t('Diagnostics report downloaded'));
  };

  /** Saved-machine rows — one record per physical cutter. */
  const saveMachineAsNew = () => {
    const name = machineNameValue.trim();
    if (!name) { toast.warn(t('Enter a machine name first.'), { title: t('Saved machines') }); return; }
    const rec = saveMachine({ ...snapshotConfig(), name });
    setSelectedMachineId(rec.id);
    setMachines(listMachines());
    toast.success(t('Machine saved'));
  };

  const updateSelectedMachine = () => {
    if (!selectedMachine) return;
    saveMachine({ ...snapshotConfig(), id: selectedMachine.id, name: machineNameValue.trim() || selectedMachine.name });
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
    // grbl has no OH; page query — fetch the $130/$131 travel limits
    // lazily so later jogs get the same off-page warning (skipped, not
    // an error, when the controller doesn't answer them).
    if (format === 'gcode' && position && !page) void fetchTravelPage();
    execMove(buildJog(format, dx * jogStep, dy * jogStep, unit, feedRate));
  };

  // Press-and-hold jog (pointer): the first move goes out on pointer-down,
  // then a repeat loop takes over after JOG_HOLD_DELAY_MS. The refs carry
  // the timers and the live "may we still move" flags into that loop.
  const holdRef = useRef<{ delay: number; repeat: number } | null>(null);
  const sendingRef = useRef(sending);
  const jobBusyRef = useRef(jobBusy);
  useEffect(() => {
    sendingRef.current = sending;
    jobBusyRef.current = jobBusy;
  }, [sending, jobBusy]);
  useEffect(() => {
    const held = holdRef;
    return () => {
      const h = held.current;
      if (h) { window.clearTimeout(h.delay); window.clearInterval(h.repeat); held.current = null; }
    };
  }, []);

  const stopHold = () => {
    const h = holdRef.current;
    if (!h) return;
    window.clearTimeout(h.delay);
    window.clearInterval(h.repeat);
    holdRef.current = null;
  };

  const startHold = (event: ReactPointerEvent<HTMLButtonElement>, dx: number, dy: number) => {
    // Primary pointer press only; keyboard activation arrives as a click.
    if (event.button !== 0) return;
    stopHold();
    jog(dx, dy);
    const held: { delay: number; repeat: number } = { delay: 0, repeat: 0 };
    held.delay = window.setTimeout(() => {
      held.repeat = window.setInterval(() => {
        if (link.status !== 'connected' || sendingRef.current || jobBusyRef.current) { stopHold(); return; }
        execMove(buildJog(format, dx * jogStep, dy * jogStep, unit, feedRate));
      }, JOG_REPEAT_MS);
    }, JOG_HOLD_DELAY_MS);
    holdRef.current = held;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
  };

  /** Absolute positioning: parse "X,Y" and move there with the blade up. */
  const submitMoveTo = () => {
    const m = moveTo.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) { toast.warn(t('Enter coordinates as X,Y — e.g. 25,10.'), { title: t('Move to coordinates') }); return; }
    execMove(buildMoveTo(format, Number(m[1]), Number(m[2]), unit, feedRate));
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
    // Optional-chain first: `navigator.clipboard` is undefined on insecure
    // origins (http://LAN-IP previews), and the property access itself throws
    // synchronously — route that through the catch's toast instead.
    try {
      await navigator.clipboard?.writeText(plainLog());
      toast.success(t('Console log copied'));
    } catch { toast.error(t('Clipboard copy failed')); }
  };

  const simulated = link.simulated;
  const rehearsal = t('Rehearsal mode — nothing is sent to a real device');
  const statusText = simulated ? rehearsal : connected ? link.describe() : t(link.status === 'connecting' ? 'Connecting…' : link.status === 'error' ? 'Connection error' : 'Not connected');
  const statusColor = connected ? 'bg-success' : link.status === 'connecting' ? 'bg-warning' : link.status === 'error' ? 'bg-danger' : 'bg-muted';

  // ---- Automatic scan, as the connection card tells it ----
  const scanPlan = connected ? null : currentScanPlan();
  const scanScanning = !connected && (native ? portsLoading : webSerial && webPorts === null);
  const webAuthorized = webPorts?.length ?? 0;
  // Web shell: the one already-authorized port opens without the chooser,
  // so the primary action is a plain Connect.
  const webDirect = !native && webAuthorized === 1;
  const portLabel = (path: string): string => (path === WEB_PORT ? t('authorized serial port') : path);
  const detectionName = (r: AutoSetupResult): string =>
    r.model || r.grblBuild || (r.suspectedClone ? t('no reply — suspected clone') : '');
  /** Operator's own pick stands: a detection that lands after it changes nothing. */
  const detectionApplies = scanFound?.found || scanFound?.suspectedClone;
  const candidates = scanPlan?.candidates ?? [];
  const chipTag = (chip: { chip: string; likelihood: 'high' | 'medium' | 'unknown' } | null): string =>
    chip ? ` (${chip.chip}${chip.likelihood === 'high' ? ` ★${t('cutter')}` : ''})` : '';

  /** One line under the line settings: what the scan knows, and the next step. */
  const scanLine = (): ReactNode => {
    if (connected || (!native && !webSerial)) return null;
    if (scanIdentifying) {
      return (
        <span className="flex flex-wrap items-center gap-1.5 text-[10px]" role="status" data-testid="plotter-scan-status">
          <Loader2 size={11} className="animate-spin" aria-hidden="true" />
          <span className="text-ink">{t('Identifying')} {portLabel(scanIdentifying)}…</span>
          {scanNote && <span className="text-muted">{scanNote}</span>}
        </span>
      );
    }
    if (scanScanning) {
      return (
        <span className="flex items-center gap-1.5 text-[10px] text-muted" role="status" data-testid="plotter-scan-status">
          <Loader2 size={11} className="animate-spin" aria-hidden="true" />
          {t('Scanning serial ports…')}
        </span>
      );
    }
    const found = scanFound;
    if (scanError) {
      return <span className="text-[10px] text-danger" role="alert" data-testid="plotter-scan-status">{scanError}</span>;
    }
    // Something answered (or sat behind a clone chip and stayed silent):
    // say what and where, with the one-click Connect right next to it.
    if (found && detectionApplies) {
      return (
        <span className="flex flex-wrap items-center gap-1.5 text-[10px]" data-testid="plotter-scan-status" data-detected={found.found ? 'true' : 'suspected'}>
          <span className={found.found ? 'text-success' : 'text-warning'}>
            {t('Detected')}: {detectionName(found)} · {portLabel(found.port)} · {found.baud}
          </span>
          <button
            type="button"
            className="btn-primary py-0.5! px-2! text-[10px]!"
              onClick={() => { applyDetection(found); setAppliedDetection((n) => n + 1); }}
              disabled={busy || sending}
              data-testid="plotter-scan-connect"
          >
            {t('Connect')}
          </button>
        </span>
      );
    }
    if (found) {
      return (
        <span className="text-[10px] text-warning" data-testid="plotter-scan-status">
          {t('No cutter answered on any port — check power / cable, or connect manually and run the self-test.')}
        </span>
      );
    }
    if (candidates.length === 0) {
      if (!native) {
        return webAuthorized > 1
          ? (
            <span className="text-[10px] text-muted" data-testid="plotter-scan-status">
              {webAuthorized} {t('serial ports authorized — the browser asks which one to use.')}
            </span>
          )
          : null; // nothing authorized yet: the hint above already says what happens
      }
      return (
        <span className="flex flex-wrap items-center gap-1.5 text-[10px]" data-testid="plotter-scan-status">
          <span className="text-warning">{t('No serial ports detected — plug in the plotter and try again.')}</span>
          <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={refreshPorts} disabled={portsLoading}>
            <RefreshCw size={11} className={portsLoading ? 'animate-spin' : ''} aria-hidden="true" />
            {t('Rescan serial ports')}
          </button>
        </span>
      );
    }
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[10px]" data-testid="plotter-scan-status">
        <span className="text-muted">
          {candidates.length} {t('possible cutter ports')}:{candidates.map((c) => `${c.path}${chipTag(c.chip)}`).join(' · ')}
        </span>
        <button
          type="button"
          className="btn py-0.5! px-1.5! text-[10px]!"
          onClick={identifyCandidates}
          disabled={busy || sending}
          title={t('Probe these ports for a cutter or engraver and identify it. Nothing stays connected.')}
          data-testid="plotter-scan-identify"
        >
          {t('Scan & identify')}
        </button>
      </span>
    );
  };

  /** Connected: the machine the link is talking to, and its profile suggestion. */
  const identifyLine = (): ReactNode => {
    if (!connected || (!lastIdentify && !autoIdentifying)) return null;
    const suggested = lastIdentify?.suggestedProfileId ? getMachineProfile(lastIdentify.suggestedProfileId) : null;
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[10px]" data-testid="plotter-identify-result">
        {lastIdentify ? (
          <>
            <span className="text-muted">{t('Machine')}:</span>
            {lastIdentify.model
              ? <span className="font-mono text-ink">{lastIdentify.model}</span>
              : <span className="text-warning">{t('No reply — very common for Chinese clones (they ignore status queries). Judge the link by a test cut.')}</span>}
            {suggested && suggested.id !== profile?.id && (
              <span className="flex items-center gap-1">
                <span className="text-muted">{t('Suggested profile')}: {suggested.label}</span>
                <button
                  type="button"
                  className="btn py-0.5! px-1.5! text-[10px]!"
                  onClick={() => applyProfile(suggested.id)}
                  data-testid="plotter-apply-profile"
                >
                  {t('Apply')}
                </button>
              </span>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-muted" role="status">
            <Loader2 size={11} className="animate-spin" aria-hidden="true" />
            {t('Identifying the machine…')}
          </span>
        )}
      </span>
    );
  };
  // Unlinked: the scan's story. Linked: which machine answered.
  const machineLine = connected ? identifyLine() : scanLine();

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
    <>
      {/* ---- Connection card: always visible, never collapsed. Port picker,
           line settings and the Connect action live on the Machine tab's
           first screen — every "connect the cutter first" hint sends the
           operator here. ---- */}
      <section
        id="plotter-connect-card"
        tabIndex={-1}
        className="rounded border border-border bg-panel2/60 p-2 text-[11px] outline-hidden"
        role="region"
        aria-labelledby="plotter-connect-title"
        data-plotter-card="connect"
        data-plotter-sim={simulated ? 'true' : undefined}
        aria-busy={busy || link.status === 'connecting'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span id="plotter-connect-title" className="flex items-center gap-1.5 font-medium text-ink">
            <Plug size={12} aria-hidden="true" className="text-[#ff2e9a]" />
            {t('Connection')}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted tabular-nums" title={link.detail} role="status">
            <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} aria-hidden="true" />
            {statusText}
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
          {connected ? (
            <button
              type="button"
              id="plotter-connect-primary"
              className="btn py-1! px-2! text-[10px]! flex items-center gap-1"
              onClick={() => { void disconnect(); }}
              disabled={busy || sending}
            >
              <Unplug size={11} aria-hidden="true" />{t('Disconnect')}
            </button>
          ) : (
            <button
              type="button"
              id="plotter-connect-primary"
              className="btn-primary py-1! px-2.5! text-[10px]! flex items-center gap-1"
              onClick={() => { void connect(); }}
              disabled={busy || sending || !(simSelected || canConnect) || (!simSelected && native && nativePorts.length === 0 && !selectedPort)}
              aria-busy={busy}
              title={simSelected
                ? t('Open the virtual plotter: rehearse jogging, test cuts and jobs without a machine — nothing reaches a real device.')
                : native && nativePorts.length === 0
                  ? t('No serial ports detected — plug in the cutter and refresh.')
                  : t(native || webDirect
                    ? 'Open the selected serial port and keep it open for jogging, test cuts and jobs.'
                    : 'Pick the cutter’s serial port in the browser chooser and keep it open for jogging, test cuts and jobs.')}
            >
              {busy ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Plug size={11} aria-hidden="true" />}
              {busy ? t('Connecting…') : simSelected || native || webDirect ? t('Connect') : t('Choose serial port…')}
            </button>
          )}
        </div>

        {/* Line settings — the knobs Send / Test cut share. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1">
            <select
              className="input py-0.5! text-[10px]! w-44!"
              value={simSelected ? SIM_PORT : selectedPort}
              onChange={(e) => {
                if (e.target.value === SIM_PORT) { chooseSim(true); return; }
                chooseSim(false);
                setSelectedPort(e.target.value);
              }}
              disabled={connected || portsLoading}
              aria-label={t('Cutter port')}
              data-testid="plotter-port-select"
            >
              {/* First on purpose: rehearsal needs no machine and works in every shell. */}
              <option value={SIM_PORT}>{t('Virtual plotter (rehearsal mode)')}</option>
              {native ? (
                nativePorts.length === 0
                  ? <option value="">{t('No serial ports detected')}</option>
                  : <option value="">{t('Auto-select USB port')}</option>
              ) : (
                <option value="">{t('A serial port (browser chooser)')}</option>
              )}
              {nativePorts.map((p) => {
                const chip = chipForPort(p);
                return (
                  <option key={p.path} value={p.path}>
                    {p.path}{p.product || p.manufacturer ? ` — ${p.product ?? p.manufacturer}` : ''}{chip ? ` · ${chip.chip}${chip.likelihood === 'high' ? ` ★${t('cutter')}` : ''}` : ''}
                  </option>
                );
              })}
            </select>
            {native && (
              <button
                type="button"
                className="btn py-1! px-1.5! text-[10px]!"
                onClick={refreshPorts}
                disabled={portsLoading || connected}
                title={t('Rescan serial ports')}
              >
                <RefreshCw size={11} className={portsLoading ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            )}
          </span>
          {!native && !simulated && (
            <span className="text-[10px] text-muted" title={t('Web Serial needs a user gesture per port — browsers cannot scan silently.')}>
              {webDirect
                ? `${t('Last used serial port')} — ${t('Serial port authorized — connecting will not open the browser chooser.')}`
                : t('The browser asks which port to use when you connect.')}
            </span>
          )}
          <label className="flex items-center gap-1 text-[10px] text-muted">
            {t('Baud')}
            <select
              className="input py-0.5! text-[10px]!"
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
              className="input py-0.5! text-[10px]!"
              value={flow}
              onChange={(e) => setFlow(e.target.value as FlowControl)}
              disabled={connected}
              aria-label={t('Flow control')}
              title={t('"None" paces the stream below the line rate — safest for cutters without RTS/CTS wiring.')}
            >
              {FLOW_OPTIONS.map((f) => <option key={f.value} value={f.value}>{t(f.label)}</option>)}
            </select>
          </label>
          {!canConnect && (
            <span className="text-[10px] text-muted">{t('Direct connection needs the desktop app or Chrome/Edge over HTTPS / localhost.')}</span>
          )}
          {portsError && (
            <span className="text-[10px] text-danger" role="alert">{portsError}</span>
          )}
        </div>

        {/* Automatic scan (unlinked) / the machine on the line (linked). */}
        {machineLine && <div className="mt-1.5">{machineLine}</div>}

        {/* One-click auto-detect (native) — supplied by the dialog. */}
        {setupActions && <div className="mt-1.5">{setupActions}</div>}
      </section>

      {/* ---- Position & test card: the everyday connected-state controls.
           Shown only once a link is up — there is nothing to jog otherwise. ---- */}
      {connected && (
        <section
          id="plotter-jog-card"
          tabIndex={-1}
          className="mt-3 rounded border border-border bg-panel2/60 p-2 text-[11px] outline-hidden"
          role="region"
          aria-labelledby="plotter-jog-title"
          data-plotter-card="jog"
          data-plotter-sim={simulated ? 'true' : undefined}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span id="plotter-jog-title" className="flex items-center gap-1.5 font-medium text-ink">
              <Move size={12} aria-hidden="true" className="text-[#ff2e9a]" />
              {t('Position & test')}
            </span>
            {simulated && (
              <span
                className="rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning"
                data-testid="plotter-rehearsal-badge"
              >
                {rehearsal}
              </span>
            )}
            <span className="text-[10px] text-muted" title={t('Move the carriage with the blade up. Step is in the output unit.')}>
              {t('Move the carriage with the blade up. Step is in the output unit.')}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              className={`btn py-0.5! px-1.5! text-[10px]! ${autoPoll ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
              onClick={() => { setPollStats({ n: 0, min: Infinity, avg: 0, max: 0 }); setAutoPoll(!autoPoll); }}
              disabled={sending}
              aria-pressed={autoPoll}
              title={t('Poll the machine every 2.5 s (OA; / ?) and show the live reply.')}
            >
              {t('Auto status')}
            </button>
            {jobBusy && <Loader2 size={12} className="animate-spin text-accent2" aria-hidden="true" aria-label={t('Sending…')} />}
          </div>

          <div className="mt-1.5 flex flex-wrap items-start gap-x-4 gap-y-2">
            {/* Jog pad + step */}
            <div className="flex items-center gap-2.5">
              <span className="grid grid-cols-3 gap-0.5" role="group" aria-label={t('Jog controls')} data-jog-pad>
                <span />
                <JogKey Icon={ArrowUp} label={t('Move up')} disabled={sending || jobBusy} onStart={startHold} onEnd={stopHold} jog={jog} />
                <span />
                <JogKey Icon={ArrowLeft} label={t('Move left')} disabled={sending || jobBusy} onStart={startHold} onEnd={stopHold} jog={jog} />
                <button type="button" className="btn p-1! flex items-center justify-center" onClick={() => execMove(buildSetOrigin(format))} disabled={sending || jobBusy} title={t('Set the current carriage position as origin')} aria-label={t('Set origin')}><Crosshair size={11} aria-hidden="true" /></button>
                <JogKey Icon={ArrowRight} label={t('Move right')} disabled={sending || jobBusy} onStart={startHold} onEnd={stopHold} jog={jog} />
                <span />
                <JogKey Icon={ArrowDown} label={t('Move down')} disabled={sending || jobBusy} onStart={startHold} onEnd={stopHold} jog={jog} />
                <span />
              </span>
              <div>
                <div className="text-[10px] text-muted">{t('Jog step')}</div>
                <span className="flex flex-wrap items-center gap-0.5" role="group" aria-label={t('Jog step')}>
                  {JOG_STEPS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rounded border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${jogStep === s ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink'}`}
                      onClick={() => setJogStep(s)}
                      aria-pressed={jogStep === s}
                    >
                      {s}{unit}
                    </button>
                  ))}
                </span>
                <div className="mt-1 text-[9px] text-muted" title={t('Keyboard jog')}>
                  {t('Keyboard jog')}: ↑↓←→ {jogStep}{unit} · Shift+↑↓←→ 1{unit}
                </div>
              </div>
            </div>

            {/* Origin / absolute moves + pen & media */}
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  className="input py-0.5! text-[10px]! font-mono w-20!"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitMoveTo(); }
                  }}
                  placeholder="X,Y"
                  aria-label={t('Move to coordinates')}
                  disabled={sending || jobBusy}
                  title={t('Absolute move with the blade up — park the carriage at X,Y (output unit).')}
                />
                <button
                  type="button"
                  className="btn py-0.5! px-1.5! text-[10px]!"
                  onClick={submitMoveTo}
                  disabled={sending || jobBusy || !moveTo.trim()}
                  title={t('Move the carriage to the X,Y coordinates.')}
                >
                  {t('Go')}
                </button>
                <button
                  type="button"
                  className="btn py-0.5! px-1.5! text-[10px]!"
                  onClick={() => { void exec(buildMoveTo(format, 0, 0, unit, feedRate)); }}
                  disabled={sending || jobBusy}
                  title={t('Return the carriage to the origin (0,0).')}
                >
                  {t('Home')}
                </button>
              </span>
              <span className="flex flex-wrap items-center gap-1" role="group" aria-label={t('Pen & media')}>
                {PEN_MEDIA_COMMANDS.map((id) => {
                  const cmd = quickCommands.find((c) => c.id === id);
                  if (!cmd) return null;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      className={`btn py-0.5! px-1.5! text-[10px]! ${cmd.id === 'pen-up' ? 'border-accent2 text-accent2' : ''}`}
                      onClick={() => runQuick(cmd)}
                      disabled={sending || jobBusy}
                      title={t(cmd.description)}
                    >
                      {t(cmd.label)}
                    </button>
                  );
                })}
              </span>
            </div>

            {/* Test cuts — the same actions as the pinned footer, next to the pad. */}
            {(onTestCut || onForceTest || onLaserTest || onCornerTour) && (
              <span className="flex flex-wrap items-center gap-1" role="group" aria-label={t('Test cuts')}>
                <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={onTestCut} disabled={sending || jobBusy} title={t('Cut a small calibration pattern on scrap to dial in force / offset.')}>
                  <FlaskConical size={11} aria-hidden="true" />{t('Test cut')}
                </button>
                {onForceTest && (
                  <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={onForceTest} disabled={sending || jobBusy} title={t('Cut a strip of 5 squares at increasing force to find the right blade pressure in one pass.')}>
                    <FlaskConical size={11} aria-hidden="true" />{t('Force test')}
                  </button>
                )}
                {onLaserTest && (
                  <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={onLaserTest} disabled={sending || jobBusy} title={t('Burn a strip of 5 short segments at 10–50% power to find the working laser setting in one pass.')}>
                    <Zap size={11} aria-hidden="true" />{t('Laser test')}
                  </button>
                )}
                <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={onCornerTour} disabled={sending || jobBusy} title={t('Visit the corners of a 100×100 mm square and tap the centre, blade up — proves the port and axis mapping before any real job.')}>
                  <Crosshair size={11} aria-hidden="true" />{t('Corner tour')}
                </button>
              </span>
            )}
          </div>
        </section>
      )}

      {/* ---- Machine setup (profile / format / dialect / …) — owned by the
           dialog and slotted in between positioning and diagnostics. ---- */}
      {settings && <div className="mt-3">{settings}</div>}

      {/* ---- Diagnostics & console: collapsed by default. Self-test, machine
           identification, baud probing, quick commands, raw traffic, saved
           machines and job history — everything was in the old "Debug
           console", unchanged. ---- */}
      <div
        className="mt-3 rounded border border-border bg-panel2/60 p-2 text-[11px]"
        role="region"
        aria-label={t('Diagnostics & console')}
        data-plotter-card="diagnostics"
        data-open={open ? 'true' : 'false'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="plotter-diagnostics-toggle"
            className="flex items-center gap-1 font-medium text-ink hover:text-accent2 transition-colors"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="plotter-diagnostics-body"
            title={t('Self-test, identify the machine, quick commands, raw traffic log and job history.')}
          >
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            <Terminal size={12} aria-hidden="true" className="text-[#ff2e9a]" />
            {t('Diagnostics & console')}
          </button>
          {!open && (
            <span className="text-[10px] text-muted">
              {t('Self-test')} · {t('Identify machine')} · {t('Detect baud')} · {t('Serial traffic')} · {t('Job history')}
            </span>
          )}
        </div>
        {open && (
          <div id="plotter-diagnostics-body">
        <>
          {/* Control lines — the classic "unfreeze a silent plotter" levers. */}
          {connected && (
            <span className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label={t('Control lines & poll')}>
              <button
                type="button"
                className={`btn py-0.5! px-1.5! text-[10px]! ${signals.dtr ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                onClick={() => { void toggleSignal('dtr'); }}
                disabled={sending}
                aria-pressed={signals.dtr}
                title={t('Toggle the DTR line — revives plotters that wait for it before talking.')}
              >
                DTR
              </button>
              <button
                type="button"
                className={`btn py-0.5! px-1.5! text-[10px]! ${signals.rts ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                onClick={() => { void toggleSignal('rts'); }}
                disabled={sending}
                aria-pressed={signals.rts}
                title={t('Toggle the RTS line (with hardware flow control this may pause the device).')}
              >
                RTS
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

          {/* Quick machine commands */}
          <div className="mt-2 flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('Quick machine commands')}>
            {quickCommands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                className="btn py-0.5! px-1.5! text-[10px]!"
                onClick={() => runQuick(cmd)}
                disabled={!connected || sending}
                title={`${t(cmd.description)}${cmd.expectsReply ? ` ${t('(awaits reply)')}` : ''}`}
              >
                {t(cmd.label)}
              </button>
            ))}
            <button
              type="button"
              className={`btn py-0.5! px-1! text-[10px]! ${refOpen ? 'border-accent2 text-accent2' : ''}`}
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
              className="btn py-0.5! px-1.5! text-[10px]!"
              onClick={() => { void selfTest(); }}
              disabled={!connected || sending || busy}
              title={t('Ping the machine with harmless status queries and measure round-trip latency.')}
            >
              {t('Self-test')}
            </button>
            <button
              type="button"
              className="btn py-0.5! px-1.5! text-[10px]!"
              onClick={() => { void detectBaud(); }}
              disabled={sending || busy || !canConnect}
              title={t('Reconnect at each common baud rate and watch for a reply. The link is restored afterwards.')}
            >
              {t('Detect baud')}
            </button>
            <button
              type="button"
              className="btn py-0.5! px-1.5! text-[10px]!"
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
              className="btn py-0.5! px-1.5! text-[10px]!"
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
              className="input py-0.5! text-[10px]! w-40!"
              value={selectedMachineId}
              onChange={(e) => loadMachine(e.target.value)}
              aria-label={t('Saved machines')}
            >
              <option value="">{t('— none —')}</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input
              type="text"
              className="input py-0.5! text-[10px]! w-28!"
              value={machineNameValue}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder={t('Machine name')}
              aria-label={t('Machine name')}
            />
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={saveMachineAsNew} title={t('Save the current setup as a new machine.')}>{t('Save machine')}</button>
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={updateSelectedMachine} disabled={!selectedMachine} title={t('Overwrite the selected machine with the current setup.')}>{t('Update machine')}</button>
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={removeSelectedMachine} disabled={!selectedMachine} title={t('Delete the selected machine record.')}>{t('Delete machine')}</button>
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
                className={`btn py-0.5! px-1! text-[10px]! ${dirFilter === f ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                onClick={() => setDirFilter(f)}
                aria-pressed={dirFilter === f}
                title={t('Filter the traffic log by direction.')}
              >
                {t(f === 'all' ? 'All' : f === 'tx' ? 'TX' : f === 'rx' ? 'RX' : 'Notices')}
              </button>
            ))}
            <button type="button" className={`btn py-0.5! px-1.5! text-[10px]! ${hexView ? 'border-accent2 text-accent2' : ''}`} onClick={() => setHexView(!hexView)} aria-pressed={hexView} title={t('Toggle HEX / ASCII view')}>HEX</button>
            <button type="button" className={`btn py-0.5! px-1.5! text-[10px]! ${autoScroll ? 'border-accent2 text-accent2' : ''}`} onClick={() => setAutoScroll(!autoScroll)} aria-pressed={autoScroll} title={t('Follow new traffic automatically')}>{t('Auto')}</button>
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={() => { void copyLog(); }} title={t('Copy console log')}><Copy size={11} aria-hidden="true" /></button>
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={() => download('plotter-console.log', plainLog(), 'text/plain')} title={t('Download console log')}><Download size={11} aria-hidden="true" /></button>
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]!" onClick={() => setEntries([])} title={t('Clear console')}><Trash2 size={11} aria-hidden="true" /></button>
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
              className="input py-1! text-[10px]! font-mono flex-1"
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
              className="btn py-1! px-2! text-[10px]!"
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
                      className="btn py-0.5! px-1.5! text-[10px]! mt-1"
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
        </div>
      )}
      </div>
    </>
  );
}
