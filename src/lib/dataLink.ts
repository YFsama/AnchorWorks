/**
 * Graphtec Data-Link protocol layer (networked cutters, TCP 9100).
 *
 * The cutter is the listener; the app connects out and drives the
 * ESC.d1–d6 Data-Link handoff documented in
 * open-graphtec-server server/app/protocol.py (the hardware-validated reference) and mirrored from
 * open-graphtec-server's `protocol.py` (FC9000-validated):
 *
 *   ESC.d1:               status poll → int status (2 = requesting job list)
 *   ESC.d2:               scanned barcode link info → string
 *   ESC.d3<STX>n1<RS>n2<ETX>   job list (≤8 names) → int ack
 *   ESC.d4:               selected job index → int (empty = nothing picked)
 *   ESC.d5;0;fx;fy;rx;ry: registration vector, 0.1 mm units → int ack
 *   ESC.d6;<n>:           command type (0 = GP-GL, 1 = HP-GL) → int ack
 *   <payload><ETX>        the machine-code job itself (no reply)
 *
 * Replies are ETX-terminated. Everything here is pure string/byte logic
 * except `connectDataLink`, which routes through runtime.ts's `callNative`
 * (tcp_connect / tcp_write / tcp_read / tcp_close in src-tauri/src/lib.rs)
 * exactly like plotterLink.ts's serial link — returning null under the
 * web/PWA runtime where raw sockets don't exist.
 */

import { callNative, isTauri } from './runtime';

/** Protocol framing bytes (see the module header). */
export const DL = { STX: '\x02', ETX: '\x03', RS: '\x1e', ESC: '\x1b' } as const;

/** Default Data-Link port — Graphtec cutters listen on raw TCP 9100. */
export const DATA_LINK_PORT = 9100;

/** Spec limit: one job list carries at most 8 names. */
export const MAX_JOBS_PER_LIST = 8;
/** Spec limit: a job name is at most 25 printable-ASCII characters. */
export const MAX_JOB_NAME_LENGTH = 25;

/** One named job offered to the cutter via ESC.d3. `payload` is the
 *  machine code streamed after the operator picks this job. */
export interface DataLinkJob {
  /** ≤25 printable ASCII characters, first character not 'G' (reserved). */
  name: string;
  payload: string;
}

/** Spec check for one job name. Returns null when valid, else a
 *  human-readable reason (English — callers wrap it in their own i18n). */
export function validateJobName(name: string): string | null {
  if (!name) return 'Job name must not be empty.';
  if (name.length > MAX_JOB_NAME_LENGTH) {
    return `Job name must be at most ${MAX_JOB_NAME_LENGTH} characters (got ${name.length}).`;
  }
  if (name[0] === 'G') return "Job name must not start with 'G' (reserved prefix).";
  // 0x20 (space) through 0x7E — control characters would corrupt the
  // STX/RS/ETX framing of ESC.d3 and shift the selection index.
  if (!/^[\x20-\x7e]+$/.test(name)) return 'Job name must contain only printable ASCII characters.';
  return null;
}

/** ESC.d3 job-list command: `ESC.d3<STX>name1<RS>name2<ETX>` (an empty
 *  list is still sent, as ETX alone — required by the spec). Throws on an
 *  invalid name or more than 8 jobs, mirroring open-graphtec-server. */
export function buildJobList(jobs: DataLinkJob[]): string {
  if (jobs.length > MAX_JOBS_PER_LIST) {
    throw new Error(`Data-Link supports up to ${MAX_JOBS_PER_LIST} jobs in one list (got ${jobs.length}).`);
  }
  for (const job of jobs) {
    const err = validateJobName(job.name);
    if (err) throw new Error(err);
  }
  const body = jobs.map(job => job.name).join(DL.RS);
  return `${DL.ESC}.d3${body ? DL.STX + body + DL.ETX : DL.ETX}`;
}

/** Build the ESC.d5 registration-vector command from 0.1 mm wire units.
 *  The vector is the print-side offset from the Start Mark's scan-start
 *  corner to registration mark 1 (see regMarkGeometry.ts's barcode band). */
export function buildRegVectorCommand(v: { fx: number; fy: number; rx: number; ry: number }): string {
  return `${DL.ESC}.d5;0;${v.fx};${v.fy};${v.rx};${v.ry}:`;
}

/** Strip reply framing (ETX / CR / LF) and trim — the shared cleanup for
 *  every reply parser (open-graphtec-server `clean_response`). */
function cleanResponse(raw: string): string {
  // eslint-disable-next-line no-control-regex -- ETX/CR/LF ARE the framing being stripped
  return raw.replace(/\x03/g, '').replace(/[\r\n]/g, '').trim();
}

/** Parse an ESC.d2 reply into the job names it carries. The reply body is
 *  the scanned link info; multiple records arrive RS-separated. Returns
 *  null when nothing was scanned (empty/garbage framing only). */
export function parseLinkInfoReply(raw: string): string[] | null {
  const cleaned = cleanResponse(raw);
  if (!cleaned) return null;
  const names = cleaned.split(DL.RS).map(part => part.trim()).filter(Boolean);
  return names.length > 0 ? names : null;
}

/** Parse an ESC.d4 reply into the selected job index. Empty or non-numeric
 *  replies → null ("nothing picked yet" / "user picked a job we didn't
 *  send"); the parsed int otherwise (negatives are cutter error codes the
 *  caller checks). */
export function parseSelectedIndex(raw: string): number | null {
  const cleaned = cleanResponse(raw);
  if (!/^[+-]?\d+$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 10);
}

/** Parse an `ESC.d5;0;fx;fy;rx;ry:` command string into millimetres — the
 *  wire form carries 0.1 mm steps, so `10` parses to 1.0 mm. Null when the
 *  string isn't a well-formed vector command. */
export function parseRegVector(raw: string): { fx: number; fy: number; rx: number; ry: number } | null {
  // eslint-disable-next-line no-control-regex -- \x1b is the ESC byte of the ESC.d5 command being parsed
  const m = raw.match(/^\x1b\.d5;0;(-?\d+);(-?\d+);(-?\d+);(-?\d+):$/);
  if (!m) return null;
  const mm = (s: string) => Number.parseInt(s, 10) / 10;
  return { fx: mm(m[1]), fy: mm(m[2]), rx: mm(m[3]), ry: mm(m[4]) };
}

/** One open Data-Link connection. `send` writes raw protocol strings,
 *  `read` returns whatever arrived (latin1-decoded; '' on silence — poll
 *  semantics), `close` tears the transport down. */
export interface DataLinkHandle {
  send(data: string): Promise<void>;
  read(timeoutMs: number, maxBytes?: number): Promise<string>;
  close(): void;
}

/** Latin1 (ISO-8859-1) byte → string: Data-Link traffic is ASCII, but
 *  latin1 round-trips every byte 1:1 so nothing is ever lost to UTF-8
 *  replacement characters. */
function latin1Decode(bytes: number[] | Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.slice(i, i + CHUNK));
  }
  return out;
}

/** Latin1 string → bytes for the IPC bridge (Vec<u8> travels as a JSON
 *  number array, same shape as fs_save_bytes). */
function latin1Encode(text: string): number[] {
  const out = new Array<number>(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Open the TCP Data-Link connection. Returns null under the web/PWA
 * runtime (no raw sockets — the caller toasts the desktop-build hint);
 * under Tauri the handle wraps the four tcp_* Rust commands.
 *
 * The connection is NOT kept across calls by design: Graphtec cutters
 * refuse a second concurrent connection, so a handshake should connect,
 * transact and close promptly (open-graphtec-server even opens a fresh
 * connection per command — persistent-connection behaviour against real
 * hardware is validation-pending).
 */
export async function connectDataLink(host: string, port = DATA_LINK_PORT): Promise<DataLinkHandle | null> {
  if (!isTauri()) return null;
  await callNative<void>('tcp_connect', { host, port, timeoutMs: 4000 }, async () => {
    throw new Error('tcp_connect is only available in the desktop app.');
  });
  return {
    send: async (data: string) => {
      await callNative<void>('tcp_write', { data: latin1Encode(data) }, async () => {
        throw new Error('tcp_write is only available in the desktop app.');
      });
    },
    read: async (timeoutMs: number, maxBytes = 4096) => {
      const bytes = await callNative<number[]>('tcp_read', { timeoutMs, maxBytes }, async () => [] as number[]);
      return latin1Decode(bytes ?? []);
    },
    close: () => {
      void callNative<void>('tcp_close', undefined, async () => undefined).catch(() => undefined);
    },
  };
}

/** Result of a Data-Link handoff attempt — `selected` is -1 when the
 *  cutter never reported a pick (no barcode scanned / nothing chosen),
 *  `reg` is null when no registration vector was supplied or applied. */
export interface DataLinkHandshakeResult {
  /** Job names reported by the ESC.d2 link-info read (the scanned sheet). */
  jobs: string[];
  /** Index into the offered job list, or -1 when nothing was selected. */
  selected: number;
  reg: { fx: number; fy: number; rx: number; ry: number } | null;
  /** True when the selected job's payload actually went out. */
  sent: boolean;
  /** Human-readable protocol trace — one line per step (bytes + values). */
  log: string[];
}

export interface DataLinkHandshakeOptions {
  /** Sleep between polls (default 500 ms). */
  pollMs?: number;
  /** Max polls per waiting stage (default 20). */
  maxPolls?: number;
  /** Registration vector in 0.1 mm wire units (print-side: Start Mark
   *  scan-start corner → mark 1). Absent for pre-scan jobs — the ESC.d5
   *  step is then skipped (mark-1-based jobs only need the payload). */
  regVector?: { fx: number; fy: number; rx: number; ry: number };
  /** Command type for ESC.d6: 0 = GP-GL, 1 = HP-GL (default 1 — the app's
   *  Data-Link payload is its bare HP-GL dialect). */
  commandType?: 0 | 1;
  /** Live log tap — fired once per line as it is appended. */
  onLog?: (line: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Framing bytes → readable names for the handshake log. */
const FRAME_NAMES: Record<string, string> = { '\x1b': 'ESC', '\x02': 'STX', '\x03': 'ETX', '\x1e': 'RS' };

/** Lossy rendering of protocol bytes for the log (control chars visible). */
function frame(text: string): string {
  // eslint-disable-next-line no-control-regex -- ESC/STX/ETX/RS are the protocol framing being rendered
  return text.replace(/[\x1b\x02\x03\x1e]/g, ch => FRAME_NAMES[ch] ?? ch);
}

/** Read one ETX-terminated reply (polls `handle.read` until ETX arrives
 *  or `timeoutMs` passes; resolves '' on silence). */
async function readReply(handle: DataLinkHandle, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let out = '';
  while (Date.now() < deadline) {
    const chunk = await handle.read(Math.max(1, deadline - Date.now()));
    if (chunk) {
      out += chunk;
      if (chunk.includes(DL.ETX)) break;
    } else {
      await sleep(10); // silence — idle the loop instead of hot-spinning
    }
  }
  return out;
}

/**
 * Drive the full Data-Link handoff over an open handle:
 *
 *   1. poll ESC.d1 until the cutter leaves the scanning state (or the
 *      poll budget runs out — nothing was scanned),
 *   2. read the scanned link info (ESC.d2),
 *   3. send the job list (ESC.d3),
 *   4. poll ESC.d4 until the operator's pick arrives as an index,
 *   5. send the registration vector (ESC.d5, skipped when absent),
 *   6. set the command type (ESC.d6), stream the selected job's payload
 *      + ETX and drain the read side.
 *
 * Throws only on transport errors (send/read failures); protocol-level
 * absence — no barcode scanned, no job picked — resolves with
 * `selected: -1`, `sent: false` and the log explaining what happened.
 */
export async function dataLinkHandshake(
  handle: DataLinkHandle,
  jobs: DataLinkJob[],
  payload: string,
  opts: DataLinkHandshakeOptions = {},
): Promise<DataLinkHandshakeResult> {
  const pollMs = opts.pollMs ?? 500;
  const maxPolls = opts.maxPolls ?? 20;
  const commandType = opts.commandType ?? 1;
  const log: string[] = [];
  const push = (line: string) => {
    log.push(line);
    opts.onLog?.(line);
  };
  // Per-reply budget: a LAN cutter answers well inside one poll interval;
  // the floor just keeps a fast pollMs from zeroing the window.
  const replyTimeout = Math.max(pollMs, 100);

  // 1 — status poll. Status 1 = still scanning the barcode; 2 = requesting
  // the job list (proceed); anything else after a poll or two means the
  // sheet wasn't scanned (0 = stopped, 5 = cutting, …).
  let ready = false;
  for (let i = 0; i < maxPolls; i++) {
    await handle.send(`${DL.ESC}.d1:`);
    const reply = await readReply(handle, replyTimeout);
    const status = parseSelectedIndex(reply);
    push(`d1 status → ${status === null ? 'no reply' : status}`);
    if (status === 2 || status === 3 || status === 4) { ready = true; break; }
    if (status !== null && status !== 1 && status !== 0) break; // error / busy state — stop early
    await sleep(pollMs);
  }
  if (!ready) {
    push('no barcode scan reported — nothing to hand off');
    return { jobs: [], selected: -1, reg: null, sent: false, log };
  }

  // 2 — scanned link info (which names this sheet wants).
  await handle.send(`${DL.ESC}.d2:`);
  const linkReply = await readReply(handle, replyTimeout);
  const linkNames = parseLinkInfoReply(linkReply);
  push(`d2 link info → ${linkNames === null ? 'none' : linkNames.join(' | ')}`);

  // 3 — the job list.
  const listCmd = buildJobList(jobs);
  await handle.send(listCmd);
  const listReply = await readReply(handle, replyTimeout);
  const listAck = parseSelectedIndex(listReply);
  push(`d3 job list ${frame(listCmd)} → ${listAck === null ? 'no reply' : listAck}`);
  if (listAck === null || listAck < 0) {
    push('job list rejected by the cutter');
    return { jobs: linkNames ?? [], selected: -1, reg: null, sent: false, log };
  }

  // 4 — poll until the operator picks a job on the machine panel. An empty
  // reply keeps meaning "not picked yet"; a pick outside our list stays
  // empty forever, so the poll budget is the way out.
  let selected = -1;
  for (let i = 0; i < maxPolls; i++) {
    await handle.send(`${DL.ESC}.d4:`);
    const reply = await readReply(handle, replyTimeout);
    const idx = parseSelectedIndex(reply);
    push(`d4 selected → ${idx === null ? 'no pick' : idx}`);
    if (idx !== null && idx >= 0) { selected = idx; break; }
    await sleep(pollMs);
  }
  if (selected < 0 || selected >= jobs.length) {
    push('no job selected on the cutter — payload not sent');
    return { jobs: linkNames ?? [], selected: -1, reg: null, sent: false, log };
  }

  // 5 — registration vector (absent pre-scan: jobs without the mark-frame
  // handoff skip ESC.d5 entirely).
  let reg: DataLinkHandshakeResult['reg'] = null;
  if (opts.regVector) {
    const cmd = buildRegVectorCommand(opts.regVector);
    await handle.send(cmd);
    const reply = await readReply(handle, replyTimeout);
    reg = parseRegVector(cmd);
    push(`d5 reg vector ${frame(cmd)} → ${cleanResponse(reply) || 'no reply'} (${reg ? `${reg.fx},${reg.fy},${reg.rx},${reg.ry} mm` : 'unparsed'})`);
  } else {
    push('d5 reg vector skipped — none supplied (pre-scan job)');
  }

  // 6 — command type, then the job itself. The payload is terminated with
  // ETX and never answered; drain the socket afterwards.
  await handle.send(`${DL.ESC}.d6;${commandType}:`);
  const d6Reply = await readReply(handle, replyTimeout);
  push(`d6 command type ${commandType} → ${cleanResponse(d6Reply) || 'no reply'}`);
  await handle.send(payload + DL.ETX);
  push(`payload ${jobs[selected].name} sent (${payload.length} chars)`);
  const drain = await handle.read(replyTimeout);
  push(`drain ← ${drain.length} chars`);

  return { jobs: linkNames ?? [], selected, reg, sent: true, log };
}
