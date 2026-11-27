/**
 * Shared job monitor for the plotter — ONE state for the in-flight job,
 * read by the plotter dialog's progress card and by the status-bar chip (the
 * dialog closes, the chip stays). No React component here: a tiny external
 * store (subscribe / getSnapshot) plus the `usePlotterJob` hook.
 *
 * The monitor itself used to live in PlotterStatusChip.tsx; it only moved so
 * that the chip file keeps exporting components alone
 * (react-refresh/only-export-components).
 */

import { useSyncExternalStore } from 'react';
import { getSharedPlotterLink, sleep, type LinkEvent, type LinkSendSource } from './plotterLink';
import { estimateEtaSeconds, lastCompleteLine, watchCutCompletion, type WatchCutHandle } from './plotterDiag';
import { parsePositionReply } from './hpglDebug';

/* ------------------------------------------------------------------ *
 * Job monitor
 * A job is a sequence of phases, and "transfer finished" is
 * only the middle of it:
 *
 *   sending → sent → busy → done            real machine that answers polls
 *   sending → sent → unwatched              real machine that stays silent
 *   sending → sent/busy → done              virtual plotter (simulator.done)
 *   sending → sent/busy → alarm             halted mid-job: grbl Alarm / Hold /
 *                                           Door, or the virtual plotter ran
 *                                           past its travel — NOT a finish
 *   sending → failed                        stopped / link lost / send error
 *
 * Nothing ever reports "cut complete" on the transfer alone: `done` needs
 * the machine to report idle (watchCutCompletion) or the virtual plotter to
 * have executed every move.
 *
 * "Transfer finished" belongs to ONE send. `start()` hands out a job id; the
 * sender passes it to `link.send(payload, { jobId })`, and only the progress
 * / done events carrying that id move the job. Everything else that touches
 * the link meanwhile — this monitor's own position polls, any other query, a
 * jog, a flow-control character — is ignored. (A sender that passes no id
 * keeps the old contract: its untagged send counts, queries never do.)
 * ------------------------------------------------------------------ */

export type PlotterJobPhase = 'idle' | 'sending' | 'sent' | 'busy' | 'done' | 'unwatched' | 'failed' | 'alarm';

/** Why a job ended in `alarm` (none of these is a finished cut):
 *   alarm         — grbl reported `Alarm` (motion locked; the rest will not run)
 *   door / hold   — grbl reported `Door` / `Hold` (stopped mid-job; the rest
 *                   is still queued in the machine)
 *   travel-limit  — the virtual plotter was clipped at its travel limit */
export type PlotterJobAlarm = 'alarm' | 'door' | 'hold' | 'travel-limit';

/** Which origin `position` is measured from: the one the job was written
 *  in (work), or the machine's own zero when the report allows no better. */
export type PlotterJobPositionFrame = 'work' | 'machine';

/** True once nothing more will happen on its own — the verdict is in (done,
 *  unwatched, failed, alarm) and only a dismiss is left. */
export const jobOver = (phase: PlotterJobPhase): boolean =>
  phase === 'done' || phase === 'unwatched' || phase === 'failed' || phase === 'alarm';

export type JobPoint = readonly [number, number];

export interface PlotterJobSnapshot {
  phase: PlotterJobPhase;
  kind: 'job' | 'test-cut';
  format: 'gcode' | 'hpgl';
  unit: 'mm' | 'in';
  /** Bytes handed to the link so far / the whole payload. */
  sent: number;
  total: number;
  /** Wall-clock start and end of the transfer (ms). */
  startedAt: number;
  endedAt: number | null;
  /** Remaining transfer time from the measured pace (plotterDiag.estimateEtaSeconds). */
  etaSeconds: number | null;
  paused: boolean;
  /** Pen-down paths in the payload, and the 1-based one under the head when a position is known. */
  pathsTotal: number;
  pathIndex: number | null;
  /** Last reported head position, operator units. `positionFrame` says from
   *  which origin. */
  position: { x: number; y: number } | null;
  /** Origin of `position`: the job's own (work) or the machine's zero.
   *  Null while no position was reported. */
  positionFrame?: PlotterJobPositionFrame | null;
  /** Virtual plotter only: share of the programmed motion time executed (0–100). */
  execPct: number | null;
  error: string | null;
  /** `alarm` phase only — what halted the job (see PlotterJobAlarm); null otherwise. */
  alarm?: PlotterJobAlarm | null;
  /** `alarm` phase only — the machine's own words for the operator (grbl
   *  state word, virtual plotter reason); null otherwise. */
  alarmReason?: string | null;
}

const IDLE: PlotterJobSnapshot = {
  phase: 'idle', kind: 'job', format: 'hpgl', unit: 'mm', sent: 0, total: 0, startedAt: 0, endedAt: null,
  etaSeconds: null, paused: false, pathsTotal: 0, pathIndex: null, position: null, positionFrame: null, execPct: null, error: null,
  alarm: null, alarmReason: null,
};

/** How long a finished job's verdict stays on screen before it clears itself. */
export const JOB_DISMISS_MS = 30_000;
/** Watchdog past watchCutCompletion's own 15-minute timeout: never linger in "sent" forever. */
const JOB_WATCHDOG_MS = 16 * 60 * 1000;
/** Cadence of the position read-out, and how long one of its questions may wait for an answer. */
const POSITION_POLL_MS = 1500;
const POSITION_QUERY_MS = 1200;

let snapshot: PlotterJobSnapshot = IDLE;
const listeners = new Set<(s: PlotterJobSnapshot) => void>();
let jobCuts: ReadonlyArray<ReadonlyArray<JobPoint>> = [];
let watch: WatchCutHandle | null = null;
let listening = false;
let simTimer: number | null = null;
let dismissTimer: number | null = null;
let watchdogTimer: number | null = null;
/** Id of the job whose transfer is in flight (0 = none), and whether a link
 *  event carrying it has been seen — once one has, only those count. */
let jobId = 0;
let jobSeen = false;
let jobSeq = 0;
/** Bumped to end the position-poll loop: a loop still asleep or still
 *  waiting for a reply compares its own number against it and exits. */
let positionRun = 0;
/** grbl work-coordinate offset, from the last status report that carried one. */
let lastWco: { x: number; y: number } | null = null;

const publish = (patch: Partial<PlotterJobSnapshot>): void => {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l(snapshot);
};

const clearTimer = (which: 'sim' | 'dismiss' | 'watchdog'): void => {
  const current = which === 'sim' ? simTimer : which === 'dismiss' ? dismissTimer : watchdogTimer;
  if (current !== null) window.clearInterval(current);
  if (which === 'sim') simTimer = null;
  else if (which === 'dismiss') dismissTimer = null;
  else watchdogTimer = null;
};

const stopWatching = (): void => {
  watch?.cancel();
  watch = null;
  positionRun += 1;
  clearTimer('sim');
  clearTimer('watchdog');
};

/** 1-based index of the cut path nearest to a reported head position, when
 *  the head is within `tolerance` of one (between paths it is travelling). */
export function locatePath(
  cuts: ReadonlyArray<ReadonlyArray<JobPoint>>, x: number, y: number, tolerance = 3,
): number | null {
  let best: number | null = null;
  let bestD = tolerance;
  cuts.forEach((cut, i) => {
    for (const [px, py] of cut) {
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = i + 1; }
    }
  });
  return best;
}

const reportPosition = (x: number, y: number, frame: PlotterJobPositionFrame): void => {
  publish({ position: { x, y }, positionFrame: frame, pathIndex: locatePath(jobCuts, x, y) });
};

/** Head position in the LAST grbl status report of a reply, in WORK
 *  coordinates — the ones the job was written in — whenever the report
 *  allows. grbl reports `WPos` (already work) or `MPos` (machine), and a
 *  `WCO` offset only on some reports: work = machine − offset, so an offset
 *  from an earlier report (`lastWco`) is used when this one carries none.
 *  `frame: 'machine'` means no offset was ever seen and the numbers are the
 *  machine's own (after a "Set origin" they are NOT where the job thinks it is). */
export function grblWorkPosition(
  reply: string,
  lastWco: { x: number; y: number } | null,
): { x: number; y: number; frame: PlotterJobPositionFrame; wco: { x: number; y: number } | null } | null {
  const report = [...reply.matchAll(/<[^<>]*>/g)].pop()?.[0];
  if (!report) return null;
  const fields = report.slice(1, -1).split('|');
  const pair = (key: string): { x: number; y: number } | null => {
    const field = fields.find(f => f.startsWith(`${key}:`));
    if (!field) return null;
    const [a, b] = field.slice(key.length + 1).split(',');
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  const wco = pair('WCO') ?? lastWco;
  const work = pair('WPos');
  if (work) return { x: work.x, y: work.y, frame: 'work', wco };
  const machine = pair('MPos');
  if (!machine) return null;
  if (!wco) return { x: machine.x, y: machine.y, frame: 'machine', wco: null };
  return { x: machine.x - wco.x, y: machine.y - wco.y, frame: 'work', wco };
}

/** Turn one status answer into the read-out. */
const reportReply = (format: 'gcode' | 'hpgl', reply: string, unit: 'mm' | 'in'): void => {
  if (format === 'gcode') {
    const work = grblWorkPosition(reply, lastWco);
    if (work?.wco) lastWco = work.wco;
    if (work) { reportPosition(work.x, work.y, work.frame); return; }
  }
  // HP-GL OA; reports in the plotter's current frame — the one the job uses.
  // Read its LAST complete line: an earlier answer still sitting in the
  // buffer ("2\r\n400,800,0") would otherwise spoil the split. A reply that
  // is still coming in gives no position for this round.
  const line = format === 'hpgl' ? lastCompleteLine(reply) : reply;
  const pos = line === null ? null : parsePositionReply(format, line, unit);
  if (pos) reportPosition(pos.x, pos.y, format === 'hpgl' ? 'work' : 'machine');
};

/** Read the head position while a job runs. The virtual plotter is read
 *  straight from its state; a real machine is asked — except an HP-GL one
 *  mid-transfer, where a query spliced into a half-sent statement would
 *  corrupt the job, and never while the stream is paused.
 *
 *  One question at a time: the loop waits for its answer (or the timeout)
 *  before asking again, and `link.query()` puts that question in line behind
 *  the completion watch's `OS;` poll — the two are never on the wire together.
 *  No interval timer: a loop that has been told to stop (positionRun bumped)
 *  exits as soon as it next wakes. */
const startPositionPolling = (): void => {
  const run = ++positionRun;
  const link = getSharedPlotterLink();
  const step = async (): Promise<void> => {
    while (run === positionRun) {
      const s = snapshot;
      if (s.phase !== 'sending' && s.phase !== 'sent' && s.phase !== 'busy') return;
      const sim = link.simulator;
      if (sim) {
        reportPosition(sim.position.x, sim.position.y, 'work');
      } else if (link.status === 'connected' && !s.paused && !(s.phase === 'sending' && s.format === 'hpgl')) {
        try {
          const reply = await link.query(s.format === 'gcode' ? '?' : 'OA;', POSITION_QUERY_MS);
          if (run !== positionRun) return; // stopped while the answer was on its way
          reportReply(s.format, reply, s.unit);
        } catch {
          // the link went down under the question — the phase change ends this loop
        }
      }
      await sleep(POSITION_POLL_MS);
    }
  };
  void step();
};

const scheduleDismiss = (): void => {
  clearTimer('dismiss');
  dismissTimer = window.setTimeout(() => {
    dismissTimer = null;
    if (jobOver(snapshot.phase)) reset();
  }, JOB_DISMISS_MS);
};

const reset = (): void => {
  stopWatching();
  clearTimer('dismiss');
  jobCuts = [];
  lastWco = null;
  publish({ ...IDLE });
};

/** The machine stopped mid-job and will not finish it on its own: a final,
 *  non-success phase — the opposite of `done`. */
const halt = (alarm: PlotterJobAlarm, reason: string | null): void => {
  publish({ phase: 'alarm', alarm, alarmReason: reason, error: null, endedAt: snapshot.endedAt ?? Date.now() });
  stopWatching();
  scheduleDismiss();
};

/** After the transfer: wait for the MACHINE to say it is finished. */
const beginCompletionWatch = (): void => {
  const link = getSharedPlotterLink();
  const sim = link.simulator;
  clearTimer('watchdog');
  watchdogTimer = window.setTimeout(() => {
    watchdogTimer = null;
    if (snapshot.phase === 'sent' || snapshot.phase === 'busy') {
      publish({ phase: 'unwatched' });
      stopWatching();
      scheduleDismiss();
    }
  }, JOB_WATCHDOG_MS);
  if (sim) {
    const tick = (): void => {
      if (snapshot.phase !== 'sent' && snapshot.phase !== 'busy') return;
      // The virtual head ran past its travel: it is ALARMED and scrapped the
      // rest of the job. That is not a finished cut, whatever `done` says.
      if (sim.status === 'alarm') { halt('travel-limit', sim.alarmReason); return; }
      const progress = sim.progress;
      const pct = sim.done ? 100 : progress.secondsTotal > 0 ? Math.min(100, (progress.secondsExecuted / progress.secondsTotal) * 100) : 100;
      const pos = sim.position;
      publish({
        phase: sim.done ? 'done' : 'busy',
        execPct: Math.round(pct),
        position: { x: pos.x, y: pos.y },
        pathIndex: locatePath(jobCuts, pos.x, pos.y),
      });
      if (sim.done) {
        clearTimer('sim');
        stopWatching();
        scheduleDismiss();
      }
    };
    tick();
    // The very first look can already be the verdict (a short job, an alarm).
    if (snapshot.phase !== 'sent' && snapshot.phase !== 'busy') return;
    if (simTimer !== null) window.clearInterval(simTimer);
    simTimer = window.setInterval(tick, 400);
    return;
  }
  watch = watchCutCompletion(link, {
    format: snapshot.format,
    onDone: () => {
      watch = null;
      publish({ phase: 'done' });
      stopWatching();
      scheduleDismiss();
    },
    onUnsupported: () => {
      watch = null;
      publish({ phase: 'unwatched' });
      stopWatching();
      scheduleDismiss();
    },
    // Alarm / Hold / Door end the watch too — as a halt, never as a finish.
    onHalt: (state, word) => halt(state === 'alarm' ? 'alarm' : /^door/i.test(word) ? 'door' : 'hold', word),
    // The watcher only reports the three end states; its "still busy" log
    // line is the one signal that the machine answered and is still moving.
    onLog: (line: string) => { if (/busy/i.test(line)) publish({ phase: 'busy' }); },
  });
};

/** Is this link event about THE job's transfer? Only its own `progress` /
 *  `done` may move the phase — see the note at the top of the file. */
const isJobEvent = (ev: { jobId?: number; source?: LinkSendSource }): boolean => {
  // A question the link put on the line (this monitor's position poll, any
  // other query) is never operator output.
  if (ev.source === 'query') return false;
  if (ev.jobId !== undefined) {
    if (ev.jobId !== jobId) return false;
    jobSeen = true;
    return true;
  }
  // Untagged. Legacy contract for a sender that did not take the id: it still
  // counts — until a tagged event shows the sender DID take it, from where on
  // only tagged events do (jogs, flow-control characters, … no longer count).
  return !jobSeen;
};

const listenToLink = (): void => {
  if (listening) return;
  listening = true;
  getSharedPlotterLink().subscribe((ev: LinkEvent) => {
    if (ev.type === 'progress') {
      if (snapshot.phase !== 'sending' || !isJobEvent(ev)) return; // not our job (a query, a jog, an init line…)
      const eta = estimateEtaSeconds(ev.sent, ev.total, Date.now() - snapshot.startedAt);
      publish({ sent: ev.sent, total: ev.total, etaSeconds: eta && eta > 0 ? eta : null });
    } else if (ev.type === 'flow') {
      if (snapshot.phase === 'sending') publish({ paused: ev.paused });
    } else if (ev.type === 'done') {
      if (snapshot.phase !== 'sending' || !isJobEvent(ev)) return;
      publish({ sent: ev.total, endedAt: Date.now(), etaSeconds: 0 });
      // The link fills `error` with a "0.5 KB in 0.1 s" summary on SUCCESS and
      // throws at the sender on failure — so only `aborted` means "stopped"
      // here; a real failure comes back through `fail()` from the sender.
      if (ev.aborted) {
        publish({ phase: 'failed', error: 'aborted' });
        stopWatching();
        scheduleDismiss();
      } else {
        publish({ phase: 'sent' });
        beginCompletionWatch();
      }
    } else if (ev.type === 'status') {
      if (ev.status !== 'connected' && snapshot.phase !== 'idle' && !jobOver(snapshot.phase)) {
        lastWco = null; // a new line is a new machine frame
        publish({ phase: 'failed', error: 'Connection lost', endedAt: snapshot.endedAt ?? Date.now() });
        stopWatching();
        scheduleDismiss();
      }
    }
  });
};

/** The shared job monitor. `start` is called by the dialog's streamJob — the
 *  one send entry — right before the payload goes out. It returns the job
 *  id to pass to that send: `link.send(payload, { jobId, … })`. */
export const plotterJobMonitor = {
  start(job: {
    total: number;
    kind: 'job' | 'test-cut';
    format: 'gcode' | 'hpgl';
    unit: 'mm' | 'in';
    /** Pen-down paths of the payload in operator units (simulateMachineCode().cuts). */
    cuts: ReadonlyArray<ReadonlyArray<JobPoint>>;
  }): number {
    listenToLink();
    stopWatching();
    clearTimer('dismiss');
    jobCuts = job.cuts;
    lastWco = null;
    const id = ++jobSeq;
    jobId = id;
    jobSeen = false;
    publish({
      ...IDLE,
      phase: 'sending',
      kind: job.kind,
      format: job.format,
      unit: job.unit,
      total: job.total,
      pathsTotal: job.cuts.length,
      pathIndex: null,
      startedAt: Date.now(),
    });
    startPositionPolling();
    return id;
  },
  /** The sender caught a transport error for the running job. */
  fail: (reason: string): void => {
    if (snapshot.phase === 'idle') return;
    publish({ phase: 'failed', error: reason, endedAt: snapshot.endedAt ?? Date.now() });
    stopWatching();
    scheduleDismiss();
  },
  /** Clear a finished / failed job from the screen. */
  dismiss: (): void => { reset(); },
  subscribe(listener: (s: PlotterJobSnapshot) => void): () => void {
    listenToLink();
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: (): PlotterJobSnapshot => snapshot,
};

export function usePlotterJob(): PlotterJobSnapshot {
  return useSyncExternalStore(plotterJobMonitor.subscribe, plotterJobMonitor.getSnapshot, plotterJobMonitor.getSnapshot);
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

/** Transfer progress in whole percent (bytes handed to the link). */
export const jobPct = (job: PlotterJobSnapshot): number => Math.floor((job.sent / Math.max(1, job.total)) * 100);
/** True while a job still occupies the machine (transfer or execution). An
 *  `alarm` job does not: nothing more will move on its own. */
export const jobActive = (phase: PlotterJobPhase): boolean => phase === 'sending' || phase === 'sent' || phase === 'busy';
