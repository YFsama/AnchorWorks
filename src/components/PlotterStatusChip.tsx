import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Usb, Unplug, Plug, Pause, Play, Square, ArrowUp, Scissors, History, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEditor } from '../store/editor';
import { getSharedPlotterLink, type LinkEvent } from '../lib/plotterLink';
import { loadPlotterPrefs } from '../lib/plotter';
import { estimateEtaSeconds, watchCutCompletion, type WatchCutHandle } from '../lib/plotterDiag';
import { listJobLog, type JobLogEntry } from '../lib/plotterRecords';
import { decodeReply } from '../lib/hpglDebug';
import { isTauri } from '../lib/runtime';

/**
 * Always-visible plotter monitor in the status bar.
 *
 * The Send-to-Plotter dialog owns the full console, but during a real job
 * the operator is watching the canvas, not a modal. This chip surfaces the
 * link state and the in-flight job (progress %, ETA, pause / stop) in the
 * status bar — where the eye already sits — and a compact popover carries
 * the quick operations (connect / disconnect, blade lift, pause, stop),
 * live byte counters, and the last few jobs from the history.
 *
 * Everything is derived from the shared link singleton + localStorage
 * prefs, so it works with the dialog closed and even mid-send.
 */
export function PlotterStatusChip() {
  const t = useT();
  const link = getSharedPlotterLink();
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const [open, setOpen] = useState(false);
  // In-flight job derived from link events (works with the dialog closed).
  const [job, setJob] = useState<{ sent: number; total: number; eta: number | null } | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const startTsRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  // Cut-completion watch: after the transfer ends, poll the machine until
  // it reports idle (see watchCutCompletion). cutting=true while watching.
  const [cutting, setCutting] = useState(false);
  const cutWatchRef = useRef<WatchCutHandle | null>(null);
  const wasConnectedRef = useRef(false);
  // Live position readout for the popover (refreshed while it is open).
  const [positionLine, setPositionLine] = useState('');

  const native = isTauri();
  const webSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const canConnect = native || webSerial;
  const connected = link.status === 'connected';

  /** After a successful job transfer, poll the machine until it reports
   *  idle — "transfer done" is not "cut done". Machines that never answer
   *  status polls (most clones) get one honest notice, then silence. */
  const startCutWatch = useCallback(() => {
    cutWatchRef.current?.cancel();
    const prefs = loadPlotterPrefs();
    const format = prefs.format === 'gcode' ? 'gcode' : 'hpgl';
    setCutting(true);
    cutWatchRef.current = watchCutCompletion(getSharedPlotterLink(), {
      format,
      onDone: () => {
        setCutting(false);
        cutWatchRef.current = null;
        toast.success(t('🎉 Cut finished — machine reports idle'));
      },
      onUnsupported: () => {
        setCutting(false);
        cutWatchRef.current = null;
        toast.info(t('This machine does not report status — cut watch off. Judge completion visually or by the machine beeping.'));
      },
    });
  }, [t]);

  useEffect(() => {
    return link.subscribe((ev: LinkEvent) => {
      if (ev.type === 'progress') {
        if (startTsRef.current === null) startTsRef.current = Date.now();
        setJob({ sent: ev.sent, total: ev.total, eta: estimateEtaSeconds(ev.sent, ev.total, Date.now() - startTsRef.current) });
      } else if (ev.type === 'tx') {
        if (ev.bytes > 1024) startTsRef.current = ev.ts; // a job-sized payload
      } else if (ev.type === 'done') {
        const wasJob = startTsRef.current !== null;
        startTsRef.current = null;
        setJob(null);
        setPaused(false);
        setHistoryVersion(v => v + 1); // the dialog logs the job around now
        // Close the monitoring loop: watch the machine until it goes idle.
        if (wasJob && !ev.aborted && !ev.error) startCutWatch();
      } else if (ev.type === 'flow') {
        setPaused(ev.paused);
      } else if (ev.type === 'status') {
        if (ev.status === 'error' && wasConnectedRef.current) {
          toast.error(ev.detail || t('Connection lost'));
        }
        if (ev.status !== 'connected') {
          cutWatchRef.current?.cancel();
          cutWatchRef.current = null;
          setCutting(false);
        }
        wasConnectedRef.current = ev.status === 'connected';
        forceTick();
      }
    });
  }, [link, t, startCutWatch]);

  // Close the popover on outside clicks.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // historyVersion is a deliberate cache-buster: the callback reads only
  // the external log store, so exhaustive-deps can't see why it matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo<JobLogEntry[]>(() => (open ? listJobLog().slice(0, 5) : []), [open, historyVersion]);

  // Cancel the cut watch when a new job starts or on unmount.
  useEffect(() => () => { cutWatchRef.current?.cancel(); }, []);

  // Live position readout while the popover is open (3 s cadence — the
  // console's auto-poll stays the richer tool). Stale values are hidden
  // by the render guard below instead of cleared in the effect body.
  useEffect(() => {
    if (!open || !connected) return;
    let stopped = false;
    const prefs = loadPlotterPrefs();
    const format = prefs.format === 'gcode' ? 'gcode' : 'hpgl';
    const cmd = format === 'gcode' ? '?' : 'OA;';
    const tick = async () => {
      if (stopped || link.status !== 'connected') return;
      try {
        const reply = await link.query(cmd, 1200);
        if (!stopped) setPositionLine(decodeReply(format, cmd, reply));
      } catch { /* transient */ }
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [open, connected, link]);

  const openDialog = () => {
    useEditor.getState().setModal('showPlotter', true);
    setOpen(false);
  };

  const connect = async () => {
    const prefs = loadPlotterPrefs();
    setBusy(true);
    try {
      await link.open({
        portPath: native ? (prefs.lastPort || undefined) : undefined,
        baud: prefs.baud ?? 9600,
        flowControl: prefs.flowControl ?? 'none',
      });
      toast.success(`${t('Connected')} — ${link.describe()}`);
    } catch { /* status event carries the error */ }
    finally { setBusy(false); forceTick(); }
  };

  /** Lift the blade RIGHT NOW — the safety button. Best-effort, works
   *  mid-pause via pauseImmune. */
  const bladeUp = async () => {
    if (!connected) return;
    try { await link.send('PU;', { pauseImmune: true }); toast.success(t('Blade up')); }
    catch (e) { toast.error((e as Error).message); }
  };

  const togglePause = () => {
    if (!job) return;
    if (paused) {
      link.resume();
      setPaused(false);
    } else {
      link.pause();
      setPaused(true);
    }
  };

  const stopJob = () => {
    if (!job) return;
    link.activeJobSignal?.abort();
  };

  const pct = job ? Math.floor((job.sent / Math.max(1, job.total)) * 100) : 0;
  const dot = connected ? 'bg-success' : link.status === 'connecting' ? 'bg-warning animate-pulse' : link.status === 'error' ? 'bg-danger' : 'bg-muted';
  const label = connected
    ? link.describe()
    : t(link.status === 'connecting' ? 'Connecting…' : link.status === 'error' ? 'Connection error' : 'Plotter');

  const fmtBytes = (n: number): string =>
    n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        data-status-action
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] hover:bg-panel2 transition-colors tabular-nums"
        title={t('Plotter link, live job progress, quick operations and recent jobs')}
        aria-label={t('Plotter monitor')}
        aria-expanded={open}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <Usb size={11} aria-hidden="true" className="text-muted" />
        <span className={connected ? '' : 'text-muted'}>{label}</span>
        {cutting && (
          <span className="text-warning animate-pulse" title={t('Transfer done — the machine is still cutting (polled from its status replies).')}>
            {t('Cutting…')}
          </span>
        )}
        {job && (
          <span className={`flex items-center gap-1 ${paused ? 'text-warning' : 'text-accent2'}`}>
            <span className="inline-block h-1 w-10 rounded bg-border overflow-hidden" aria-hidden="true">
              <span className={`block h-full ${paused ? 'bg-warning' : 'bg-accent2'}`} style={{ width: `${pct}%` }} />
            </span>
            {pct}%{job.eta !== null ? ` ~${job.eta}s` : ''}
            {paused ? <Pause size={10} aria-hidden="true" /> : null}
          </span>
        )}
        {open ? <ChevronDown size={10} aria-hidden="true" /> : <ChevronUp size={10} aria-hidden="true" />}
      </button>

      {open && (
        <span className="absolute bottom-full mb-1.5 left-0 z-50 block w-72 rounded border border-border bg-panel shadow-2xl p-2 text-[10px]">
          {/* Connection */}
          <span className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
            <span className="font-medium text-ink">{connected ? link.describe() : t('Not connected')}</span>
            <span className="flex-1" />
            {canConnect && (
              connected ? (
                <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px] flex items-center gap-1" onClick={() => { void link.close(); }} disabled={busy || !!job}>
                  <Unplug size={10} aria-hidden="true" />{t('Disconnect')}
                </button>
              ) : (
                <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px] flex items-center gap-1" onClick={() => { void connect(); }} disabled={busy || !canConnect}>
                  <Plug size={10} aria-hidden="true" />{t('Connect')}
                </button>
              )
            )}
          </span>
          {connected && (
            <span className="mt-1 flex items-center gap-2 text-muted tabular-nums" title={t('Lifetime bytes over this connection')}>
              TX {fmtBytes(link.txBytes)} · RX {fmtBytes(link.rxBytes)}
            </span>
          )}
          {open && connected && positionLine && (
            <span className="mt-0.5 block text-ink/80 tabular-nums" title={t('Live machine position (polled while this panel is open).')}>
              📍 {positionLine}
            </span>
          )}

          {/* Live job */}
          {job ? (
            <span className="mt-1.5 block rounded border border-border bg-panel2/60 p-1.5">
              <span className={`flex items-center gap-1.5 ${paused ? 'text-warning' : 'text-accent2'}`}>
                <span className="font-medium">{paused ? t('Paused') : t('Sending')}</span>
                <span className="tabular-nums">{pct}% · {fmtBytes(job.sent)}/{fmtBytes(job.total)}{job.eta !== null ? ` · ETA ~${job.eta}s` : ''}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="btn !py-0.5 !px-1.5 !text-[10px]"
                  onClick={togglePause}
                  title={t('Hold the stream between chunks — the machine drains its buffer and stops.')}
                >
                  {paused ? <Play size={10} aria-hidden="true" /> : <Pause size={10} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="btn !py-0.5 !px-1.5 !text-[10px] text-danger"
                  onClick={stopJob}
                  title={t('Abort the transfer and lift the blade.')}
                >
                  <Square size={10} aria-hidden="true" />
                </button>
              </span>
              <span className="mt-1 block h-1.5 rounded bg-border overflow-hidden" aria-hidden="true">
                <span className={`block h-full transition-[width] duration-150 ${paused ? 'bg-warning' : 'bg-accent2'}`} style={{ width: `${pct}%` }} />
              </span>
            </span>
          ) : null}

          {/* Quick ops */}
          <span className="mt-1.5 flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('Quick operations')}>
            <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px] flex items-center gap-1" onClick={() => { void bladeUp(); }} disabled={!connected} title={t('Raise the pen / blade immediately.')}>
              <ArrowUp size={10} aria-hidden="true" />{t('Pen up')}
            </button>
            <button
              type="button"
              className="btn !py-0.5 !px-1.5 !text-[10px] flex items-center gap-1"
              onClick={() => { setOpen(false); openDialog(); }}
              title={t('Open the full dialog for test cuts, jog, and the console.')}
            >
              <Scissors size={10} aria-hidden="true" />{t('Open plotter dialog')}
            </button>
          </span>

          {/* Recent jobs */}
          <span className="mt-1.5 flex items-center gap-1 text-muted">
            <History size={10} aria-hidden="true" />
            <span className="uppercase tracking-wide">{t('Recent jobs')}</span>
            <span className="flex-1" />
            <button type="button" className="underline-offset-2 hover:underline" onClick={openDialog} title={t('Full history lives in the plotter dialog console.')}>
              {t('View all')}
            </button>
          </span>
          {history.length === 0 ? (
            <span className="block text-muted">{t('No jobs recorded yet.')}</span>
          ) : (
            history.map((e) => (
              <span key={e.ts} className="mt-0.5 flex items-center gap-1.5 tabular-nums">
                <span className={e.result === 'ok' ? 'text-success' : e.result === 'aborted' ? 'text-warning' : 'text-danger'}>
                  {e.result === 'ok' ? '✓' : e.result === 'aborted' ? '⏹' : '✕'}
                </span>
                <span className="text-muted/70">{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>
                <span>{e.kind === 'test-cut' ? t('Test cut') : t('Job')}</span>
                <span className="text-muted min-w-0 truncate">{e.target} · {e.format.toUpperCase()} · {e.paths} {t('paths')} · {e.seconds}s</span>
              </span>
            ))
          )}
        </span>
      )}
    </span>
  );
}
