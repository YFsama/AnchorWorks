import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Usb, Unplug, Plug, Pause, Play, Square, ArrowUp, Scissors, History, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEditor } from '../store/editor';
import { getSharedPlotterLink, type LinkEvent } from '../lib/plotterLink';
import { formatBytes as fmtBytes, jobActive, jobPct, plotterJobMonitor, usePlotterJob, type PlotterJobSnapshot } from '../lib/plotterJobMonitor';
import { loadPlotterPrefs } from '../lib/plotter';
import { listJobLog, type JobLogEntry } from '../lib/plotterRecords';
import { decodeReply } from '../lib/hpglDebug';
import { isTauri } from '../lib/runtime';

/** Ticks once a second while `active`, for "elapsed" readouts. */
function useJobClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { window.clearInterval(id); };
  }, [active]);
  return now;
}

/** What an `alarm` job is: the machine stopped mid-job — NOT a finished cut. */
function alarmLine(job: PlotterJobSnapshot, t: (k: string) => string): string {
  switch (job.alarm) {
    case 'door': return t('Machine door open — job stopped, NOT finished');
    case 'hold': return t('Machine on hold — job stopped, NOT finished');
    case 'travel-limit': return t('Virtual plotter ran past its travel limit — job NOT finished');
    default: return t('Machine alarm — job NOT finished');
  }
}

/**
 * The plotter dialog footer's job card: transfer progress, then the machine
 * phase — never "complete" just because the bytes went out.
 */
export function PlotterJobProgress({ onTogglePause, onStop }: { onTogglePause: () => void; onStop: () => void }) {
  const t = useT();
  const job = usePlotterJob();
  const now = useJobClock(job.phase === 'sending');
  if (job.phase === 'idle') return null;
  const pct = jobPct(job);
  const elapsed = Math.max(0, Math.round(((job.endedAt ?? now) - job.startedAt) / 1000));
  const where = job.position
    ? ` · X ${job.position.x.toFixed(1)} Y ${job.position.y.toFixed(1)} ${job.unit}`
    : '';
  const paths = job.pathsTotal > 0 ? ` · ${job.pathIndex ?? '–'}/${job.pathsTotal} ${t('paths')}` : '';
  let head: string;
  let detail = '';
  if (job.phase === 'sending') {
    head = job.paused ? t('Paused') : '';
    detail = `${t('Sending')} ${job.sent}/${job.total} B (${pct}%)${job.etaSeconds !== null ? ` · ETA ~${job.etaSeconds}s` : ''} · ${elapsed} s ${t('elapsed')}${paths}${where}`;
  } else if (job.phase === 'sent') {
    head = t('Sent — the machine may still be running');
  } else if (job.phase === 'busy') {
    head = job.execPct !== null ? `${t('Virtual plotter running')} · ${job.execPct}%` : t('Still cutting — the machine reports busy');
  } else if (job.phase === 'done') {
    head = t('Cut complete — the machine reports idle');
  } else if (job.phase === 'unwatched') {
    head = t('Sent — this machine does not report status. Judge completion visually or by its beep.');
  } else if (job.phase === 'alarm') {
    head = alarmLine(job, t);
    detail = job.alarmReason ?? '';
  } else {
    head = job.error === 'aborted' ? t('Job cancelled — blade raised') : `${t('Send failed')}${job.error ? `: ${job.error}` : ''}`;
  }
  const failed = job.phase === 'failed' || job.phase === 'alarm';
  return (
    <div
      className={`mb-2 rounded border px-2 py-1.5 text-[10px] tabular-nums ${failed ? 'border-danger/40 bg-danger/10 text-danger' : 'border-accent2/40 bg-accent2/10 text-accent2'}`}
      role="status"
      aria-live="polite"
      data-plotter-job={job.phase}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-medium ${failed ? 'text-danger' : job.phase === 'unwatched' ? 'text-warning' : job.phase === 'done' ? 'text-success' : job.paused ? 'text-warning' : ''}`}>
          {head}
        </span>
        {detail && <span className="text-muted">{detail}</span>}
        <span className="flex-1" />
        {job.phase === 'sending' && (
          <>
            <button
              type="button"
              className="btn py-1! px-2! text-[10px]! shrink-0"
              onClick={onTogglePause}
              title={t('Hold the stream between chunks — the machine drains its buffer and stops. grbl also gets a feed hold.')}
            >
              {job.paused ? t('Resume') : t('Pause')}
            </button>
            <button type="button" className="btn py-1! px-2! text-[10px]! text-danger shrink-0" onClick={onStop}>
              {t('Stop job')}
            </button>
          </>
        )}
        {job.phase !== 'sending' && (
          <button
            type="button"
            className="btn py-0.5! px-1.5! text-[10px]! shrink-0 flex items-center gap-1"
            onClick={() => { plotterJobMonitor.dismiss(); }}
            aria-label={t('Dismiss')}
            title={t('Dismiss')}
          >
            <X size={10} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded bg-border" aria-hidden="true">
        <div
          className={`h-full transition-[width] duration-150 ${job.paused || job.phase === 'unwatched' ? 'bg-warning' : failed ? 'bg-danger' : job.phase === 'done' ? 'bg-success' : 'bg-accent2'}`}
          style={{ width: `${job.phase === 'busy' && job.execPct !== null ? Math.max(pct, job.execPct) : pct}%` }}
        />
      </div>
    </div>
  );
}

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
 * Job state comes from the shared monitor above, so the chip and the dialog
 * always tell the same story, dialog open or closed.
 */
export function PlotterStatusChip() {
  const t = useT();
  const link = getSharedPlotterLink();
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const job = usePlotterJob();
  const [historyVersion, setHistoryVersion] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const wasConnectedRef = useRef(false);
  const seenPhaseRef = useRef(job.phase);
  // Live position readout for the popover (refreshed while it is open).
  const [positionLine, setPositionLine] = useState('');

  const native = isTauri();
  const webSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const canConnect = native || webSerial;
  const connected = link.status === 'connected';

  // The dialog writes the job history as the transfer ends; re-read it once per phase change.
  const jobPhase = job.phase;
  const jobEndedAt = job.endedAt;
  const bumpHistory = useCallback(() => { setHistoryVersion(v => v + 1); }, []);
  useEffect(() => plotterJobMonitor.subscribe((s) => {
    const previous = seenPhaseRef.current;
    seenPhaseRef.current = s.phase;
    if (s.phase === previous) return;
    if (s.phase === 'sent' || s.phase === 'failed' || s.phase === 'alarm') bumpHistory();
    if (s.phase === 'done') toast.success(t('🎉 Cut finished — machine reports idle'));
    else if (s.phase === 'alarm') {
      // Never a "finished": the machine stopped mid-job (alarm / door / hold).
      toast.error(`${alarmLine(s, t)}${s.alarmReason ? ` — ${s.alarmReason}` : ''}`, { title: t('Plotter alarm') });
    } else if (s.phase === 'unwatched') toast.info(t('This machine does not report status — cut watch off. Judge completion visually or by the machine beeping.'));
  }), [bumpHistory, t]);

  useEffect(() => link.subscribe((ev: LinkEvent) => {
    if (ev.type !== 'status') return;
    if (ev.status === 'error' && wasConnectedRef.current) {
      toast.error(ev.detail || t('Connection lost'));
    }
    wasConnectedRef.current = ev.status === 'connected';
    forceTick();
  }), [link, t]);

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
  const history = useMemo<JobLogEntry[]>(() => (open ? listJobLog().slice(0, 5) : []), [open, historyVersion, jobPhase, jobEndedAt]);

  // Live position readout while the popover is open (3 s cadence — the
  // console's auto-poll stays the richer tool). Stale values are hidden
  // by the render guard below instead of cleared in the effect body.
  // It stands in line with every other question on the link (queries are
  // serialised there), one at a time — and it keeps quiet while a job's own
  // stream is on the wire: on an HP-GL machine a question spliced into a
  // half-sent statement corrupts it.
  const streaming = job.phase === 'sending';
  useEffect(() => {
    if (!open || !connected) return;
    let stopped = false;
    const prefs = loadPlotterPrefs();
    const format = prefs.format === 'gcode' ? 'gcode' : 'hpgl';
    const cmd = format === 'gcode' ? '?' : 'OA;';
    let timer: number | null = null;
    const tick = async () => {
      if (stopped || streaming || link.status !== 'connected' || link.simulated) return;
      try {
        const reply = await link.query(cmd, 1200);
        if (!stopped) setPositionLine(decodeReply(format, cmd, reply));
      } catch { /* transient */ }
      if (!stopped) timer = window.setTimeout(() => { void tick(); }, 3000);
    };
    void tick();
    return () => { stopped = true; if (timer !== null) window.clearTimeout(timer); };
  }, [open, connected, streaming, link]);

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

  const sending = job.phase === 'sending';
  const togglePause = () => {
    if (!sending) return;
    if (job.paused) link.resume();
    else link.pause();
  };

  const stopJob = () => {
    if (!sending) return;
    link.resume(); // unblock the sender so abort can take effect
    link.activeJobSignal?.abort();
  };

  const pct = jobPct(job);
  const dot = connected ? 'bg-success' : link.status === 'connecting' ? 'bg-warning animate-pulse' : link.status === 'error' ? 'bg-danger' : 'bg-muted';
  const label = connected
    ? link.describe()
    : t(link.status === 'connecting' ? 'Connecting…' : link.status === 'error' ? 'Connection error' : 'Plotter');

  // An `alarm` job is over, but NOT finished — shown as an alarm, never as a cut complete.
  const halted = job.phase === 'alarm';
  const jobHead = job.phase === 'sent' ? t('Cutting…')
    : job.phase === 'busy' ? t('Cutting…')
      : job.phase === 'done' ? t('Cut complete')
        : job.phase === 'unwatched' ? t('Sent — watch by eye')
          : halted ? t('Alarm')
            : job.phase === 'failed' ? t('Stopped') : '';
  const jobDetail = job.phase === 'sent' ? t('Sent — the machine may still be running')
    : job.phase === 'busy' ? (job.execPct !== null ? `${t('Virtual plotter running')} · ${job.execPct}%` : t('Still cutting — the machine reports busy'))
      : job.phase === 'done' ? t('Cut complete — the machine reports idle')
        : job.phase === 'unwatched' ? t('Sent — this machine does not report status. Judge completion visually or by its beep.')
          : halted ? `${alarmLine(job, t)}${job.alarmReason ? ` · ${job.alarmReason}` : ''}`
            : job.phase === 'failed' ? (job.error === 'aborted' ? t('Job cancelled — blade raised') : `${t('Send failed')}${job.error ? `: ${job.error}` : ''}`)
              : '';

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        data-status-action
        data-plotter-job={job.phase === 'idle' ? undefined : job.phase}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] hover:bg-panel2 transition-colors tabular-nums"
        title={t('Plotter link, live job progress, quick operations and recent jobs')}
        aria-label={t('Plotter monitor')}
        aria-expanded={open}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <Usb size={11} aria-hidden="true" className="text-muted" />
        <span className={connected ? '' : 'text-muted'}>{label}</span>
        {(job.phase === 'sent' || job.phase === 'busy') && (
          <span className="text-warning animate-pulse" title={jobDetail}>
            {jobHead}{job.execPct !== null && job.phase === 'busy' ? ` ${job.execPct}%` : ''}
          </span>
        )}
        {job.phase === 'done' && <span className="text-success" title={jobDetail}>{jobHead}</span>}
        {job.phase === 'unwatched' && <span className="text-warning" title={jobDetail}>{jobHead}</span>}
        {job.phase === 'failed' && <span className="text-danger" title={jobDetail}>{jobHead}</span>}
        {halted && <span className="text-danger" title={jobDetail}>{jobHead}</span>}
        {sending && (
          <span className={`flex items-center gap-1 ${job.paused ? 'text-warning' : 'text-accent2'}`}>
            <span className="inline-block h-1 w-10 rounded bg-border overflow-hidden" aria-hidden="true">
              <span className={`block h-full ${job.paused ? 'bg-warning' : 'bg-accent2'}`} style={{ width: `${pct}%` }} />
            </span>
            {pct}%{job.etaSeconds !== null ? ` ~${job.etaSeconds}s` : ''}
            {job.paused ? <Pause size={10} aria-hidden="true" /> : null}
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
                <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={() => { void link.close(); }} disabled={busy || sending}>
                  <Unplug size={10} aria-hidden="true" />{t('Disconnect')}
                </button>
              ) : (
                <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={() => { void connect(); }} disabled={busy || !canConnect}>
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
          {job.phase !== 'idle' && (
            <span className="mt-1.5 block rounded border border-border bg-panel2/60 p-1.5">
              <span className={`flex items-center gap-1.5 ${job.phase === 'failed' || halted ? 'text-danger' : job.phase === 'unwatched' ? 'text-warning' : job.phase === 'done' ? 'text-success' : job.paused ? 'text-warning' : 'text-accent2'}`}>
                <span className="font-medium">{jobHead}</span>
                {sending && (
                  <span className="tabular-nums">{pct}% · {fmtBytes(job.sent)}/{fmtBytes(job.total)}{job.etaSeconds !== null ? ` · ETA ~${job.etaSeconds}s` : ''}</span>
                )}
                {job.phase === 'busy' && job.execPct !== null && <span className="tabular-nums">{job.execPct}%</span>}
                <span className="flex-1" />
                {sending && (
                  <>
                    <button
                      type="button"
                      className="btn py-0.5! px-1.5! text-[10px]!"
                      onClick={togglePause}
                      title={t('Hold the stream between chunks — the machine drains its buffer and stops.')}
                    >
                      {job.paused ? <Play size={10} aria-hidden="true" /> : <Pause size={10} aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className="btn py-0.5! px-1.5! text-[10px]! text-danger"
                      onClick={stopJob}
                      title={t('Abort the transfer and lift the blade.')}
                    >
                      <Square size={10} aria-hidden="true" />
                    </button>
                  </>
                )}
                {job.phase !== 'sending' && (
                  <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={() => { plotterJobMonitor.dismiss(); }} title={t('Dismiss')} aria-label={t('Dismiss')}>
                    <X size={10} aria-hidden="true" />
                  </button>
                )}
              </span>
              <span className="mt-0.5 block text-muted tabular-nums">
                {jobDetail}
                {job.pathsTotal > 0 && jobActive(job.phase) ? ` · ${job.pathIndex ?? '–'}/${job.pathsTotal} ${t('paths')}` : ''}
                {job.position && jobActive(job.phase) ? ` · X ${job.position.x.toFixed(1)} Y ${job.position.y.toFixed(1)} ${job.unit}` : ''}
              </span>
              <span className="mt-1 block h-1.5 rounded bg-border overflow-hidden" aria-hidden="true">
                <span
                  className={`block h-full transition-[width] duration-150 ${job.paused || job.phase === 'unwatched' ? 'bg-warning' : job.phase === 'failed' || halted ? 'bg-danger' : job.phase === 'done' ? 'bg-success' : 'bg-accent2'}`}
                  style={{ width: `${job.phase === 'busy' && job.execPct !== null ? Math.max(pct, job.execPct) : pct}%` }}
                />
              </span>
            </span>
          )}

          {/* Quick ops */}
          <span className="mt-1.5 flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('Quick operations')}>
            <button type="button" className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1" onClick={() => { void bladeUp(); }} disabled={!connected} title={t('Raise the pen / blade immediately.')}>
              <ArrowUp size={10} aria-hidden="true" />{t('Pen up')}
            </button>
            <button
              type="button"
              className="btn py-0.5! px-1.5! text-[10px]! flex items-center gap-1"
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
