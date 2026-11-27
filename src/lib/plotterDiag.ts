/**
 * Plotter diagnostics — the tools the console's "自检 / 探测" buttons run.
 *
 *  - runConnectionSelfTest: pings the machine with harmless status queries
 *    (HP-GL OE/OH/OA, grbl ?/$I), decodes each answer and measures the
 *    round-trip latency. IMPORTANT: many cutters (most Chinese clones,
 *    older Rolands) simply don't answer status queries, so a silent reply
 *    is reported as info, never as a failure — only link-level errors fail.
 *
 *  - probeBaud: reopens the link at each candidate baud rate and watches
 *    for a reply to a status query. The first baud that answers wins and
 *    the link is reconnected at it. When nothing answers (again: common
 *    and not necessarily an error), the previous connection is restored.
 *
 *  - estimateTransferSeconds: transfer-time preview for a job of `bytes`
 *    at the current serial knobs, so the operator knows a 2 MB PLT at
 *    9600 baud means ~25 s of streaming before the blade even moves.
 */

import { lineRateBytesPerSec, type FlowControl } from './plotterLink';
import type { PlotterLink } from './plotterLink';
import { decodeReply, type OutputFormat } from './hpglDebug';

export interface DiagStep {
  label: string;
  status: 'pass' | 'fail' | 'info';
  detail: string;
  /** Round-trip milliseconds for query steps. */
  ms?: number;
}

/** Minimal link surface the diagnostics need — keeps the functions
 *  unit-testable with a stub. */
export type DiagLink = Pick<PlotterLink, 'status' | 'send' | 'query'>;

export async function runConnectionSelfTest(link: DiagLink, format: OutputFormat): Promise<DiagStep[]> {
  const steps: DiagStep[] = [];
  if (link.status !== 'connected') {
    return [{ label: 'Link', status: 'fail', detail: 'Not connected — open the connection first.' }];
  }

  const ask = async (cmd: string): Promise<DiagStep> => {
    const t0 = Date.now();
    try {
      const reply = await link.query(cmd, 1000);
      const ms = Date.now() - t0;
      if (reply.trim()) {
        return { label: cmd, status: 'pass', detail: decodeReply(format, cmd, reply), ms };
      }
      return {
        label: cmd,
        status: 'info',
        detail: 'No reply — many cutters ignore status queries; this alone does not indicate a fault.',
        ms,
      };
    } catch (e) {
      return { label: cmd, status: 'fail', detail: (e as Error).message };
    }
  };

  if (format === 'hpgl') {
    steps.push(await ask('OE;'));
    steps.push(await ask('OH;'));
    steps.push(await ask('OA;'));
  } else {
    steps.push(await ask('?'));
    steps.push(await ask('$I'));
  }

  const answered = steps.some(s => s.status === 'pass');
  steps.unshift({
    label: 'Link',
    status: 'pass',
    detail: answered
      ? 'Connected and the machine answers queries.'
      : 'Connected. The machine stays silent on queries — check baud rate, or it may simply not support them.',
  });
  return steps;
}

export interface ProbeBaudOptions {
  portPath?: string;
  candidates?: number[];
  flowControl?: FlowControl;
  format?: OutputFormat;
  /** Progress line per candidate, fed into the console log. */
  onLog?: (text: string) => void;
}

export type ProbeLink = Pick<PlotterLink, 'status' | 'baud' | 'open' | 'close' | 'query'>;

export const PROBE_BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

/** Scan candidate baud rates for one the machine answers on. Returns the
 *  winning rate, or null when none replied. The link is reconnected at
 *  the winner (or at its original baud when nothing answered and it had
 *  been open). */
export async function probeBaud(link: ProbeLink, opts: ProbeBaudOptions = {}): Promise<number | null> {
  const candidates = opts.candidates ?? PROBE_BAUD_RATES;
  const flow = opts.flowControl ?? 'none';
  const format = opts.format ?? 'hpgl';
  const probe = format === 'gcode' ? '?' : 'OE;';
  const log = opts.onLog ?? (() => {});

  const wasConnected = link.status === 'connected';
  const originalBaud = link.baud;
  if (wasConnected) await link.close();

  let winner: number | null = null;
  for (const baud of candidates) {
    try {
      await link.open({ portPath: opts.portPath, baud, flowControl: flow });
    } catch (e) {
      log(`${baud} baud — open failed: ${(e as Error).message}`);
      continue;
    }
    const t0 = Date.now();
    const reply = await link.query(probe, 700).catch(() => '');
    await link.close();
    if (reply.trim()) {
      const ms = Date.now() - t0;
      log(`${baud} baud — machine replied in ${ms} ms ✓`);
      winner = baud;
      break;
    }
    log(`${baud} baud — no reply`);
  }

  if (winner !== null) {
    try {
      await link.open({ portPath: opts.portPath, baud: winner, flowControl: flow });
    } catch { /* caller sees idle status and can reconnect manually */ }
  } else if (wasConnected) {
    try {
      await link.open({ portPath: opts.portPath, baud: originalBaud, flowControl: flow });
    } catch { /* best effort restore */ }
  }
  return winner;
}

/** Transfer-time preview at the current knobs. With flow control "none"
 *  the paced sender targets ~80% of the line rate, which is already what
 *  lineRateBytesPerSec returns; hardware/software flow is shown with a
 *  conservative multiplier since driver buffers vary. */
export function estimateTransferSeconds(bytes: number, baud: number, flow: FlowControl): number {
  if (bytes <= 0) return 0;
  const rate = lineRateBytesPerSec(baud, flow);
  return Math.max(0.1, Math.round((bytes / rate) * 10) / 10);
}

/* ------------------------------------------------------------------ *
 * One-file "what happened" bundle for support / forums: connection
 * state, serial knobs, throughput, job history and the raw traffic log
 * in a single plain-text report the operator can attach.
 */

export interface DiagReportInput {
  shell: 'desktop' | 'web';
  linkStatus: string;
  linkDescription: string;
  baud: number;
  flow: FlowControl;
  txBytes: number;
  rxBytes: number;
  lastTransfer: { bps: number; pct: number | null } | null;
  format: OutputFormat;
  dialect?: string;
  unit: string;
  profileLabel?: string;
  machineCount: number;
  /** Result of the last machine identification (OI; / $I), when one ran. */
  identify?: { model: string; summary: string } | null;
  /** Steps of the last connection self-test, when one ran. */
  selfTestSteps?: DiagStep[];
  /** grbl $$ settings snapshot ($key=value pairs), when one was read. */
  grblSettings?: Array<{ key: string; value: string }>;
  jobs: Array<{ ts: number; kind: string; target: string; format: string; baud: number; paths: number; bytes: number; seconds: number; result: string }>;
  /** Pre-formatted console lines (most recent last). */
  logLines: string[];
  /** Override for tests / deterministic output. */
  now?: Date;
}

export function buildDiagnosticsReport(input: DiagReportInput): string {
  const stamp = (input.now ?? new Date()).toISOString();
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const lines: string[] = [
    'AnchorWorks plotter diagnostics',
    '================================',
    `Generated: ${stamp}`,
    `Shell: ${input.shell}`,
    '',
    'Connection',
    `- Status: ${input.linkStatus}`,
    `- Link: ${input.linkDescription || '—'}`,
    `- Baud / flow: ${input.baud} / ${input.flow}`,
    `- Traffic: TX ${input.txBytes} B · RX ${input.rxBytes} B`,
  ];
  if (input.lastTransfer) {
    const pct = input.lastTransfer.pct !== null && input.lastTransfer.pct > 0
      ? ` (${Math.round(input.lastTransfer.pct * 100)}% of line rate)`
      : '';
    lines.push(`- Last transfer: ${input.lastTransfer.bps.toFixed(0)} B/s${pct}`);
  } else {
    lines.push('- Last transfer: —');
  }
  lines.push(
    '',
    'Job settings',
    `- Format: ${input.format}${input.dialect ? ` (${input.dialect})` : ''} · unit ${input.unit}`,
  );
  if (input.profileLabel) lines.push(`- Machine profile: ${input.profileLabel}`);
  lines.push(`- Saved machines: ${input.machineCount}`, '');

  if (input.identify) {
    lines.push('Machine identification');
    lines.push(`- Model: ${input.identify.model || '—'}`);
    lines.push(`- Summary: ${input.identify.summary}`, '');
  }
  if (input.grblSettings && input.grblSettings.length > 0) {
    lines.push(`grbl settings (last $$ snapshot, ${input.grblSettings.length} keys)`);
    for (const s of input.grblSettings) lines.push(`  ${s.key}=${s.value}`);
    lines.push('');
  }
  if (input.selfTestSteps && input.selfTestSteps.length > 0) {
    lines.push(`Connection self-test (${input.selfTestSteps.length} steps)`);
    for (const s of input.selfTestSteps) {
      lines.push(`  [${s.status}] ${s.label}${s.ms !== undefined ? ` (${s.ms} ms)` : ''} — ${s.detail}`);
    }
    lines.push('');
  }

  lines.push(`Job history (last ${input.jobs.length})`);
  if (input.jobs.length === 0) lines.push('- none');
  for (const j of input.jobs) {
    lines.push(
      `- ${new Date(j.ts).toLocaleString()} [${j.result}] ${j.kind} → ${j.target} · ${j.format} · ${j.baud} baud · ${j.paths} paths · ${kb(j.bytes)} · ${j.seconds}s`,
    );
  }
  lines.push('', `Console log (last ${input.logLines.length} lines)`);
  if (input.logLines.length === 0) lines.push('  (empty)');
  for (const l of input.logLines) lines.push(`  ${l}`);
  return lines.join('\n');
}

/** Remaining-time estimate for an in-flight transfer, from the measured
 *  pace so far: elapsed × remaining/sent. Linear — pacing is constant per
 *  baud, so this tracks reality well. Returns null before 1% is sent. */
export function estimateEtaSeconds(sent: number, total: number, elapsedMs: number): number | null {
  if (sent <= 0 || total <= 0 || elapsedMs <= 0) return null;
  if (sent / total < 0.01) return null;
  return Math.max(0, Math.round(((elapsedMs / 1000) * (total - sent)) / sent));
}

/* ------------------------------------------------------------------ *
 * Cut-completion watch — the last leg of job monitoring.
 *
 * Transfer finishing ≠ cutting finished: after the last byte is handed
 * to the machine, the blade keeps running for minutes. Cutters that
 * answer status queries let us close that loop: HP-GL `OS;` reports the
 * machine state word (2 = busy), grbl `?` reports `<Run|…>`. Machines
 * that stay silent (most Chinese clones) simply can't be watched — the
 * watcher gives up quietly after two silent polls instead of nagging.
 * ------------------------------------------------------------------ */

export type CutState =
  /** Working on the job (or otherwise moving). */
  | 'cutting'
  /** Finished — nothing moving, tool up. */
  | 'idle'
  /** No usable answer. */
  | 'unknown'
  /** grbl `Alarm`: motion is locked, the rest of the job will not run. */
  | 'alarm'
  /** grbl `Hold` / `Door`: stopped in the middle of the job, not finished. */
  | 'held';

/** ETX — the terminator a few cutters use instead of CR/LF; a line break here. */
const ETX = '\x03';

/** The LAST complete line of a reply — the one the final line break (CR, LF
 *  or ETX) has closed. Earlier lines are older answers still sitting in the
 *  buffer and are skipped. A reply without any break is taken whole (the
 *  link also hands over what it has when a question times out).
 *
 *  Returns null when an UNFINISHED line follows the last closed one: the
 *  newest data is incomplete and the closed line before it is already
 *  superseded, so neither may be trusted (least of all with "finished"). */
export function lastCompleteLine(reply: string): string | null {
  const text = reply.replaceAll(ETX, '\n');
  let end = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) { end = i; break; }
  }
  if (end < 0) return text.trim();
  if (text.slice(end + 1).trim()) return null;
  const lines = text.slice(0, end + 1).split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

/** State word of the LAST grbl status report in the buffer, as the
 *  controller wrote it ('Run', 'Idle', 'Hold:0', 'Alarm', 'Door:2'…).
 *  '' when there is no report. */
export function lastGrblStateWord(reply: string): string {
  return [...reply.matchAll(/<(\w+(?::\d+)?)/g)].pop()?.[1] ?? '';
}

/** Classify a machine's answer to a status poll — by its LAST complete
 *  reply, never by something that merely sits in front of it in the buffer. */
export function cutStateFromReply(format: 'gcode' | 'hpgl', reply: string): CutState {
  // Not trimmed: a trailing line break is what makes the last line COMPLETE.
  if (!reply.trim()) return 'unknown';
  if (format === 'gcode') {
    // Leftover `ok` lines / the boot banner sit in front of the report while
    // a job runs — classify by the LAST report in the buffer.
    const state = lastGrblStateWord(reply).toLowerCase().split(':')[0];
    if (!state) return 'unknown';
    if (state === 'run' || state === 'home' || state === 'cycle') return 'cutting';
    if (state === 'idle') return 'idle';
    if (state === 'alarm') return 'alarm';
    if (state === 'hold' || state === 'door') return 'held';
    return 'unknown';
  }
  // The status word is the machine's LAST complete reply. An earlier answer
  // left in front of it ("0\r\n2\r\n": a stale 0, then "busy") must not be
  // read as the state — that is how a busy plotter used to pass for a
  // finished one — and a reply still coming in is no answer at all yet.
  const line = lastCompleteLine(reply);
  if (line === null) return 'unknown';
  const code = line.match(/-?\d+/);
  if (!code) return 'unknown';
  const n = Number(code[0]);
  if (n === 2 || n === 3) return 'cutting';   // moving — pen up (2) or pen down (3)
  if (n === 0 || n === 1) return 'idle';      // powered / ready
  return 'unknown';
}

export interface WatchCutOptions {
  format: 'gcode' | 'hpgl';
  /** Fired once the machine reports idle after the transfer. */
  onDone?: () => void;
  /** Fired when the machine never answers status polls (clones). */
  onUnsupported?: () => void;
  /** Fired once when the machine reports a state that is neither working
   *  nor finished — grbl `Alarm` / `Hold` / `Door`. The job is NOT complete.
   *  `word` is the controller's own state word ('Alarm', 'Hold:0', …). */
  onHalt?: (state: 'alarm' | 'held', word: string) => void;
  /** Progress/log line per poll (fed into the console log). */
  onLog?: (line: string) => void;
  intervalMs?: number;
  timeoutMs?: number;
  /** Consecutive idle polls it takes to call the cut finished (default 2).
   *  One reply alone — a late answer to an earlier question, a machine caught
   *  between two moves — must never end the watch. */
  confirmIdle?: number;
}

export type WatchCutHandle = { cancel: () => void };

/** Poll the machine until it reports idle (cut finished). Returns a
 *  cancel handle. Two consecutive silent polls → unsupported, stop.
 *
 *  One poll at a time: the next one is scheduled when the previous has its
 *  answer, so polls never pile up on the (serialised) link. `Alarm` /
 *  `Hold` / `Door` end the watch through `onHalt` — they are not a finish. */
export function watchCutCompletion(
  link: Pick<PlotterLink, 'status' | 'query'>,
  opts: WatchCutOptions,
): WatchCutHandle {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 15 * 60 * 1000;
  const confirmIdle = Math.max(1, opts.confirmIdle ?? 2);
  const cmd = opts.format === 'gcode' ? '?' : 'OS;';
  const log = opts.onLog ?? (() => {});
  let silent = 0;
  let idle = 0;
  let cancelled = false;
  let timer: number | null = null;
  const startedAt = Date.now();

  const stop = () => {
    cancelled = true;
    if (timer !== null) { window.clearTimeout(timer); timer = null; }
  };

  const poll = async () => {
    if (cancelled) return;
    if (link.status !== 'connected') { stop(); return; }
    if (Date.now() - startedAt > timeout) {
      log('Cut watch timed out — the machine never reported idle.');
      stop();
      return;
    }
    let reply = '';
    try {
      reply = await link.query(cmd, 1200);
    } catch {
      // transient — the next poll retries
    }
    if (cancelled) return;
    const state = cutStateFromReply(opts.format, reply);
    if (state === 'alarm' || state === 'held') {
      const word = lastGrblStateWord(reply) || state;
      log(`Machine reports ${word} — the job is NOT complete.`);
      stop();
      opts.onHalt?.(state, word);
      return;
    }
    if (state === 'unknown') {
      silent += 1;
      idle = 0;
      if (silent >= 2) {
        log('Machine does not answer status polls — cut watch off (this is normal for many cutters).');
        stop();
        opts.onUnsupported?.();
      }
      return;
    }
    silent = 0;
    if (state === 'idle') {
      idle += 1;
      if (idle < confirmIdle) {
        log(`Machine reports idle — confirming (${idle}/${confirmIdle})…`);
        return;
      }
      log('Machine reports idle — cut complete.');
      stop();
      opts.onDone?.();
      return;
    }
    idle = 0;
    log('Machine is busy — still cutting…');
  };

  const tick = async () => {
    await poll();
    if (!cancelled) timer = window.setTimeout(() => { void tick(); }, interval);
  };
  void tick();
  return { cancel: stop };
}
