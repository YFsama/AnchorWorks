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
