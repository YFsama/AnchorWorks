/**
 * Persistent serial link to a plotter / vinyl cutter.
 *
 * Replaces the old one-shot `open → dump → close` sending for every
 * operation. A `PlotterLink` keeps the port open so the operator can:
 *
 *   - see what the cutter sends back (HP-GL status replies like `OE;`),
 *   - jog the carriage, tap the blade, query status between jobs,
 *   - stream a job with live progress and a working Cancel button,
 *   - pick the baud rate — most Chinese HP-GL cutters speak 9600, not
 *     the 115200 the old code hard-coded for grbl-style machines.
 *
 * Two transports behind one interface:
 *
 *   - Tauri native: `serial_open` / `serial_write` / `serial_read` /
 *     `serial_close` keep the OS handle alive in a Rust-side registry.
 *   - Web Serial: the port object + a read-loop is held in JS.
 *
 * Buffer-overrun protection: cheap cutters often don't wire RTS/CTS, so
 * with flow control "none" the writer paces itself below the line rate
 * (see `computeChunkDelayMs`). With hardware/software flow control the
 * driver throttles for us and no artificial delay is inserted.
 */

export type FlowControl = 'none' | 'hardware' | 'software';
export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** Who issued a send: the operator's output (`send()`), or a question the
 *  link itself put on the line (`query()`). */
export type LinkSendSource = 'send' | 'query';

export type LinkEvent =
  | { type: 'status'; status: LinkStatus; detail?: string }
  | { type: 'tx'; text: string; bytes: number; ts: number; raw: Uint8Array }
  | { type: 'rx'; text: string; bytes: number; ts: number; raw: Uint8Array }
  | { type: 'progress'; sent: number; total: number; jobId?: number; source?: LinkSendSource }
  | { type: 'flow'; paused: boolean }
  | { type: 'done'; sent: number; total: number; aborted: boolean; error?: string; ms?: number; jobId?: number; source?: LinkSendSource };

/** Internal marker on the options `query()` hands to `send()`: this send is
 *  a question, never operator output. Symbol-keyed so no caller sets it by
 *  accident; it reaches subscribers as `source: 'query'` on the events. */
const IS_QUERY: unique symbol = Symbol('plotterLink.query');

export interface LinkOpenOptions {
  /** OS port path (native only). Web Serial shows its own chooser. */
  portPath?: string;
  baud: number;
  flowControl?: FlowControl;
  /** Rehearsal mode: no serial port is touched — the link talks to the
   *  built-in virtual plotter (plotterSimulator.ts) in every shell. */
  simulate?: boolean;
  /** Simulation only: what the virtual machine speaks and how far it
   *  travels. The baud above still paces the stream like a real line. */
  format?: 'hpgl' | 'gcode';
  unit?: 'mm' | 'in';
  paperHeightMm?: number;
  plotWidthMm?: number;
}

export interface SendOptions {
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  /** Skip the pause gate — used by control snippets (blade lift, feed
   *  hold, cycle resume) that must go out WHILE a job send is paused. */
  pauseImmune?: boolean;
  /** Identifies the stream this send belongs to — echoed on its `progress`
   *  and `done` events, so a listener can tell ONE job's transfer from
   *  everything else that shares the link (queries, jogs, flow-control
   *  characters). The job monitor hands the id out (`plotterJobMonitor.start`)
   *  and accepts a `done` as "transfer finished" only when it carries it. */
  jobId?: number;
  /** @internal set by `query()`. */
  [IS_QUERY]?: true;
}

export interface NativeLinkPortInfo {
  path: string;
  kind: 'usb' | 'bluetooth' | 'pci' | 'unknown';
  manufacturer?: string;
  vid?: number;
  pid?: number;
  product?: string;
}

export class AbortedError extends Error {
  constructor() {
    super('Transfer cancelled');
    this.name = 'AbortError';
  }
}

/** Why an `open()` attempt did not end in a connection. The dialog turns the
 *  code into an actionable hint instead of echoing a raw DOMException string
 *  such as "Failed to execute 'requestPort' on 'Serial': No port selected". */
export type LinkOpenErrorCode =
  /** The operator dismissed the browser's port chooser. */
  | 'cancelled'
  /** Native shell: the OS lists no serial port at all. */
  | 'no-port'
  /** Native shell: several ports exist and none was picked. */
  | 'pick-port'
  /** This shell has no serial API (or it is blocked by policy). */
  | 'unavailable'
  /** A port was chosen but could not be opened. */
  | 'open-failed';

export class LinkOpenError extends Error {
  readonly code: LinkOpenErrorCode;
  constructor(code: LinkOpenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LinkOpenError';
    this.code = code;
  }
}

/** Classify any value thrown by an `open()` attempt. Errors already carrying
 *  a code pass through; `fallback` names the code for unrecognised values
 *  (`web` / `native` picks the better guess for an anonymous failure). */
export function toLinkOpenError(e: unknown, shell: 'web' | 'native' = 'web'): LinkOpenError {
  if (e instanceof LinkOpenError) return e;
  const message = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error ? e : undefined;
  if (shell === 'web') {
    const name = (e as { name?: unknown } | null)?.name;
    // Chrome rejects requestPort() with NotFoundError when the chooser is
    // dismissed, and with SecurityError when the API is blocked by policy.
    if (name === 'NotFoundError') return new LinkOpenError('cancelled', message, { cause });
    if (name === 'SecurityError') return new LinkOpenError('unavailable', message, { cause });
  }
  return new LinkOpenError('open-failed', message, { cause });
}

/** Milliseconds to sleep after writing `chunkBytes` at `baud` so we stay
 *  just under the wire rate. 10 bits per byte (8N1 + start/stop), plus a
 *  20% safety margin for USB-serial adapter jitter. Flow control other
 *  than "none" means the driver throttles writes for us → 0 delay. */
export function computeChunkDelayMs(baud: number, chunkBytes: number, flow: FlowControl): number {
  if (flow !== 'none') return 0;
  if (!Number.isFinite(baud) || baud <= 0) return 0;
  return Math.ceil((chunkBytes * 10 * 1000) / baud * 1.2);
}

export const LINK_CHUNK_BYTES = 256;

/** Rough line throughput in bytes/s at a given baud (8N1). Used for the
 *  console's transfer-time estimate. */
export function lineRateBytesPerSec(baud: number, flow: FlowControl): number {
  if (flow !== 'none') return baud / 10 * 4; // driver-limited, show conservative 4× headroom
  return baud / 10;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Lossy ASCII rendering of device bytes for the console (control chars
 *  become ·, high bytes become their hex shorthand). */
export function toDisplayAscii(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0x0a) out += '\n';
    else if (b === 0x0d) out += '\r';
    else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else out += '·';
  }
  return out;
}

export { toHex } from './hex';
import { isTauri, callNative } from './runtime';
import { PlotterSimulator } from './plotterSimulator';

type Listener = (ev: LinkEvent) => void;

/** A `query()` waiting for its reply. Identified by object identity so a
 *  query whose send fails can take back exactly its own waiter. */
interface RxWaiter {
  resolve: (s: string) => void;
  /** Recognises the answer to THIS question (null: anything terminated goes). */
  accepts: ((reply: string) => boolean) | null;
  /** What came back that was no answer to this question — the late `ok`s of
   *  a job's last lines, a boot banner. Kept aside while the question stays
   *  on the line, and handed over if nothing better turns up. */
  passed: string;
}

/* ---- Reply matching ----------------------------------------------------- *
 * A question is only answered by something that looks like ITS answer.
 * Right after a job's transfer the line is still delivering the machine's
 * `ok` for the job's last lines; a status poll used to harvest those and
 * take them for "no answer". Commands whose answer shape is unknown keep
 * the old rule: the first terminated data is the reply.
 * ------------------------------------------------------------------------ */

const NUMBER = '-?\\d+(?:\\.\\d+)?';
/** ETX — the terminator a few HP-GL cutters use instead of CR/LF; a line break here. */
const ETX = '\x03';

/** The last line a line break (CR, LF or ETX) has CLOSED in `text` — '' if none. */
function closedLine(text: string): string {
  const normalized = text.replaceAll(ETX, '\n');
  const end = Math.max(normalized.lastIndexOf('\n'), normalized.lastIndexOf('\r'));
  if (end < 0) return '';
  const lines = normalized.slice(0, end + 1).split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

/** Every closed line of `text` (lines a break has terminated), oldest first. */
function closedLines(text: string): string[] {
  const normalized = text.replaceAll(ETX, '\n');
  const end = Math.max(normalized.lastIndexOf('\n'), normalized.lastIndexOf('\r'));
  return (end < 0 ? '' : normalized.slice(0, end + 1)).split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
}

const lineIs = (pattern: RegExp): ((reply: string) => boolean) => (reply) => pattern.test(closedLine(reply));
/** HP-GL answers: the numbers, with the echoed command in front when the
 *  interface echoes what it receives. A status / error word is ONE number —
 *  a position's "x,y,pen" in front of a poll must not pass for it. */
const HPGL_ECHO = '^(?:[A-Z]{2};)?\\s*';
const hpglOneNumber = lineIs(new RegExp(`${HPGL_ECHO}${NUMBER}\\s*$`, 'i'));
const hpglNumbers = (atLeast: number): ((reply: string) => boolean) =>
  lineIs(new RegExp(`${HPGL_ECHO}${NUMBER}(?:\\s*,\\s*${NUMBER}){${atLeast - 1},}\\s*$`, 'i'));

/** What an answer to `text` looks like; null when nothing is known about it. */
function answerMatcher(text: string): ((reply: string) => boolean) | null {
  const q = text.trim().toUpperCase();
  if (!q) return null;
  // grbl's real-time status report: one `<…>` line.
  if (q === '?') return lineIs(/<[^<>\r\n]*>/);
  if (q.startsWith('$')) {
    // Reads answer with their data first ($$ / $130 / $# / $G / $I / plain $), then `ok`.
    const read = /^\$(?:\$|\d+|#|G|I)?$/.test(q);
    if (read) return (reply) => closedLines(reply).some(line => /^(\[|\$)/.test(line));
    // Everything else ($J=, $H, $X, a setting written…) is acknowledged by ok / error.
    return lineIs(/^(OK|ERROR:\d+|\[MSG:)/);
  }
  if (q.startsWith('!')) return null; // Roland vendor request: whatever it sends
  const mnemonic = q.match(/^([A-Z]{2})/);
  if (!mnemonic) return null;
  switch (mnemonic[1]) {
    case 'OS': // status word
    case 'OE': // error word
      return hpglOneNumber;
    case 'OA': // actual position: x,y(,pen)
    case 'OB':
    case 'OC':
    case 'OD':
      return hpglNumbers(2);
    case 'OH': // hard-clip limits: x0,y0,x1,y1
      return hpglNumbers(4);
    default: // OI; model, OF;, OP; … — a line of text
      return (reply) => closedLine(reply) !== '';
  }
}

const SIM_TEXT = new TextEncoder();
/** Virtual-motion safety net: pumps while animation frames are suspended. */
const SIM_PUMP_INTERVAL_MS = 100;
/** Largest step of simulated time one pump may play (a throttled background
 *  tab or a waking laptop must not fast-forward through a whole job). */
const SIM_MAX_STEP_S = 1;
/** Poll period of `whenSimSettled()`. */
const SIM_SETTLE_POLL_MS = 40;

interface WebSerialPortLike {
  open(o: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    flowControl?: string;
    bufferSize?: number;
  }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
}

/**
 * Shared link instance. Deliberately module-scoped so the connection
 * survives the Plotter dialog being closed and reopened — an operator
 * keeps the cutter connected while tweaking the design between jobs.
 */
let shared: PlotterLink | null = null;
export function getSharedPlotterLink(): PlotterLink {
  if (!shared) shared = new PlotterLink();
  return shared;
}

/* ------------------------------------------------------------------ *
 * Port probe lease
 *
 * The automatic "which port is my cutter?" pass opens the candidate ports
 * on a PRIVATE link for a few seconds. While it runs, a real `open()` on
 * any other link would hit a busy port — so every `open()` waits for the
 * probe instead, and asks it to hurry. (The probe never touches the shared
 * link: its status stays honestly 'idle', so nothing can mistake the probe
 * for a connection and stream a job into it.)
 * ------------------------------------------------------------------ */

let portProbe: { abort: () => void; done: Promise<void> } | null = null;

/** Run `run` as the port probe. `abort` must make it let go of the ports. */
export function runWithPortProbe<T>(abort: () => void, run: () => Promise<T>): Promise<T> {
  const started = run();
  const settled = started.then(() => undefined, () => undefined);
  const probe = { abort, done: settled.then(() => { if (portProbe === probe) portProbe = null; }) };
  portProbe = probe;
  return started;
}

/** Wait for the in-flight probe (telling it to wrap up). Returns at once when there is none. */
async function waitForPortProbe(): Promise<void> {
  while (portProbe) {
    const current = portProbe;
    current.abort();
    await current.done;
  }
}

export class PlotterLink {
  status: LinkStatus = 'idle';
  detail = '';
  baud = 115200;
  flowControl: FlowControl = 'none';
  /** Native registry handle; undefined on the Web Serial path. */
  private nativeId: number | undefined;
  private webPort: WebSerialPortLike | null = null;
  private webReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private webWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private webReadLoopRunning = false;
  private rxPollTimer: number | null = null;
  private listeners = new Set<Listener>();
  /** Raw bytes that arrived since the last `query()` harvest. */
  private rxBuf: number[] = [];
  /** The ONE query waiting for its reply (queries are serialised, so there is never a second). */
  private rxWaiters: RxWaiter[] = [];
  /** Tail of the query queue: each `query()` waits for the one before it,
   *  so two questions are never on the line at the same time and a reply
   *  can only belong to the question that was actually asked. */
  private queryTail: Promise<void> = Promise.resolve();
  /** Bumped whenever the line goes down or comes up: a query that stood in
   *  line across that boundary is dropped instead of being asked of a
   *  different connection than the one it was meant for. */
  private session = 0;
  /** Lifetime traffic counters for the console's status line. */
  txBytes = 0;
  rxBytes = 0;
  /** AbortController of the in-flight JOB send (set by the dialog's
   *  streamJob). Exposed so the status-bar chip can Stop a job even when
   *  the plotter dialog is closed. Null while no job is streaming. */
  activeJobSignal: AbortController | null = null;
  /** True while the operator has paused the active job stream. */
  paused = false;
  /** Resolvers for senders parked at the pause gate. */
  private pausedWaiters: Array<() => void> = [];
  /** Consecutive failed rx polls — a streak means the device is gone. */
  private rxErrorStreak = 0;
  /** The virtual plotter while the link is in rehearsal mode, else null. */
  private sim: PlotterSimulator | null = null;
  /** True on the automatic port probe's OWN link: its opens must not wait
   *  for the probe — that would be waiting for itself. */
  private isPortProbe = false;
  private pumpTimer: number | null = null;
  private pumpFrame: number | null = null;
  private pumpAt = 0;

  /** True while connected to the built-in virtual plotter (rehearsal mode). */
  get simulated(): boolean {
    return this.sim !== null;
  }

  /** The virtual plotter in rehearsal mode — its `progress`, `done` and
   *  `segments` describe the job as the machine executes it. Else null. */
  get simulator(): PlotterSimulator | null {
    return this.sim;
  }

  /** Make this the automatic port probe's private link (`runWithPortProbe`):
   *  it opens ports while the probe lease is held, and every OTHER link's
   *  `open()` waits for it instead of finding the ports busy. */
  asPortProbe(): this {
    this.isPortProbe = true;
    return this;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(ev: LinkEvent): void {
    for (const fn of this.listeners) fn(ev);
  }

  private setStatus(status: LinkStatus, detail = ''): void {
    this.status = status;
    this.detail = detail;
    this.emit({ type: 'status', status, detail });
  }

  /** True while connected or mid-open — a method so a caller that already
   *  narrowed `status` still gets a fresh answer after an await. */
  private isUp(): boolean {
    return this.status === 'connected' || this.status === 'connecting';
  }

  /** Human description for status pills, e.g. `COM3 @ 9600`. */
  describe(): string {
    if (this.status !== 'connected') return this.detail || this.status;
    if (this.sim) return `Virtual plotter @ ${this.baud}`;
    const where = this.webPort ? 'Web Serial' : (this.detail.split('@')[0].trim() || 'port');
    return `${where} @ ${this.baud}`;
  }

  async open(opts: LinkOpenOptions): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;
    if (!opts.simulate && !this.isPortProbe && portProbe) {
      // The automatic port scan is holding the ports — it never holds the
      // shared link, so this is the only place the two can meet.
      await waitForPortProbe();
      // A fresh read through a method: the check above narrowed the status
      // for the compiler, but time has passed.
      if (this.isUp()) return;
    }
    this.setStatus('connecting', opts.portPath ?? '');
    this.baud = opts.baud;
    this.flowControl = opts.flowControl ?? 'none';
    this.rxBuf = [];
    // A new line: queries queued for the old one are not asked of this one.
    this.session += 1;
    try {
      if (opts.simulate) {
        // Rehearsal mode: same status events, pacing, pause gate and rx path
        // as a real line — only the far end is replaced.
        const sim = new PlotterSimulator({
          format: opts.format ?? 'hpgl',
          unit: opts.unit ?? 'mm',
          paperHeightMm: opts.paperHeightMm,
          plotWidthMm: opts.plotWidthMm,
          realtime: true,
        });
        this.sim = sim;
        this.setStatus('connected', 'virtual plotter');
        this.startPump();
        // A controller greets the host when the line comes up, before any
        // query is pending — exactly what leaves a banner in front of the
        // first reply on a real port.
        if (sim.bootBanner) this.handleRx(SIM_TEXT.encode(sim.bootBanner));
        return;
      }
      if (isTauri()) {
        let path = opts.portPath;
        if (!path) {
          const ports = await callNative<NativeLinkPortInfo[]>('serial_list_ports', undefined, async () => []);
          const usb = ports.filter(p => p.kind === 'usb');
          if (usb.length === 1) path = usb[0].path;
          else if (ports.length === 1) path = ports[0].path;
          else if (ports.length === 0) throw new LinkOpenError('no-port', 'No serial ports detected. Plug in the plotter and try again.');
          else throw new LinkOpenError('pick-port', `Multiple serial ports detected (${ports.map(p => p.path).join(', ')}). Pick one first.`);
        }
        try {
          this.nativeId = await callNative<number>('serial_open', {
            path, baud: opts.baud, flow: this.flowControl,
          }, async () => { throw new Error('serial_open is only available in the desktop app.'); });
        } catch (e) {
          throw toLinkOpenError(e, 'native');
        }
        this.startRxPoll();
        this.setStatus('connected', `${path} @ ${opts.baud}`);
        return;
      }

      // --- Web Serial ---
      const nav = navigator as Navigator & {
        serial?: {
          getPorts: () => Promise<WebSerialPortLike[]>;
          requestPort: () => Promise<WebSerialPortLike>;
        };
      };
      if (!nav.serial) throw new LinkOpenError('unavailable', 'Web Serial API not available — use the desktop app or Chrome/Edge over HTTPS / localhost.');
      // Reuse a previously granted port when there's exactly one — avoids
      // re-prompting on every connect once the operator has approved it.
      const granted = await nav.serial.getPorts().catch((e: unknown) => {
        throw toLinkOpenError(e, 'web');
      });
      // requestPort() needs a live user gesture; a dismissed chooser rejects
      // with NotFoundError, which classifies as `cancelled` (not an error).
      const port = await (granted.length === 1 ? Promise.resolve(granted[0]) : nav.serial.requestPort())
        .catch((e: unknown) => {
          throw toLinkOpenError(e, 'web');
        });
      const flowArg = this.flowControl === 'hardware' ? 'hardware' : 'none'; // Web Serial has no XON/XOFF
      try {
        await port.open({
          baudRate: opts.baud,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: flowArg,
          bufferSize: 4096,
        });
        this.webPort = port;
        this.webWriter = port.writable.getWriter();
      } catch (e) {
        this.webPort = null;
        this.webWriter = null;
        throw toLinkOpenError(e, 'web');
      }
      this.startWebReadLoop();
      this.setStatus('connected', `web @ ${opts.baud}`);
    } catch (e) {
      this.nativeId = undefined;
      this.webPort = null;
      this.webWriter = null;
      this.sim = null;
      this.stopPump();
      const err = toLinkOpenError(e, isTauri() ? 'native' : 'web');
      // A dismissed chooser is the operator changing their mind, not a fault
      // — drop back to idle so the status pill reads "Not connected" instead
      // of "Connection error".
      if (err.code === 'cancelled') this.setStatus('idle', '');
      else this.setStatus('error', err.message);
      throw err;
    }
  }

  /** Fire-and-forget bytes — paced, abortable, logs to the console. Its
   *  `progress` / `done` events carry the `jobId` it was given (if any) and
   *  whether this is operator output or a link query. */
  async send(data: string | Uint8Array, sendOpts: SendOptions = {}): Promise<void> {
    const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const total = payload.length;
    if (total === 0) return;
    const preview = typeof data === 'string' ? data.slice(0, 400) : '';
    const source: LinkSendSource = sendOpts[IS_QUERY] ? 'query' : 'send';
    const jobId = sendOpts.jobId;
    this.txBytes += total;
    this.emit({ type: 'tx', text: preview, bytes: total, ts: Date.now(), raw: payload });
    let sent = 0;
    const delay = computeChunkDelayMs(this.baud, LINK_CHUNK_BYTES, this.flowControl);
    const t0 = Date.now();
    try {
      for (let off = 0; off < total; off += LINK_CHUNK_BYTES) {
        if (sendOpts.signal?.aborted) throw new AbortedError();
        await this.waitWhilePaused(sendOpts.signal, sendOpts.pauseImmune);
        const chunk = payload.subarray(off, Math.min(off + LINK_CHUNK_BYTES, total));
        await this.writeChunk(chunk, off + LINK_CHUNK_BYTES >= total);
        sent += chunk.length;
        sendOpts.onProgress?.(sent, total);
        this.emit({ type: 'progress', sent, total, ...(jobId !== undefined ? { jobId } : {}), source });
        if (delay > 0 && off + LINK_CHUNK_BYTES < total) await sleep(delay);
      }
      const ms = Date.now() - t0;
      const origin = { ...(jobId !== undefined ? { jobId } : {}), source };
      this.emit({ type: 'done', sent, total, aborted: false, error: `${(total / 1024).toFixed(1)} KB in ${(ms / 1000).toFixed(1)} s`, ms, ...origin });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      // A write that throws hard (device unplugged, driver reset) must not
      // leave the link pretending to be connected — tear it down with the
      // reason instead of silently dropping every later command.
      if (!aborted) await this.fatalError((e as Error).message).catch(() => undefined);
      this.emit({ type: 'done', sent, total, aborted, error: aborted ? undefined : (e as Error).message, ms: Date.now() - t0, ...(jobId !== undefined ? { jobId } : {}), source });
      throw e;
    }
  }

  /** Pause the active job stream between chunks — the machine drains its
   *  input buffer and stops. Safe any time; affects the running `send()`. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    // Rehearsal mode: the virtual head stops too — otherwise it would finish
    // every move already in its buffer while the stream is parked.
    this.sim?.hold();
    this.emit({ type: 'flow', paused: true });
  }

  /** Resume a paused sender and notify listeners. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const r of this.pausedWaiters.splice(0)) r();
    this.sim?.start();
    this.emit({ type: 'flow', paused: false });
  }

  /** Park the sender while `paused` is set. Abort (and close) break
   *  through immediately so a paused job can always be cancelled. */
  private async waitWhilePaused(signal: AbortSignal | undefined, immune?: boolean): Promise<void> {
    if (immune || !this.paused) return;
    while (this.paused) {
      if (signal?.aborted) throw new AbortedError();
      await new Promise<void>(resolve => {
        const wake = () => {
          const i = this.pausedWaiters.indexOf(wake);
          if (i >= 0) this.pausedWaiters.splice(i, 1);
          signal?.removeEventListener('abort', wake);
          resolve();
        };
        this.pausedWaiters.push(wake);
        signal?.addEventListener('abort', wake, { once: true });
      });
      if (signal?.aborted && this.paused) throw new AbortedError();
    }
  }

  /** Send a short query and wait for the device's reply. HP-GL replies are
   *  terminated by CR/LF (a few firmwares use ETX); we also accept `;`.
   *  Resolves with whatever arrived (possibly '') after `timeoutMs`.
   *
   *  Queries are SERIALISED: while one is on the line waiting for its reply,
   *  later ones stand in line and are asked one by one. That way a reply can
   *  only belong to the question that was actually asked — every caller reads
   *  the answer to ITS question, never the one next to it (a status poll used
   *  to be handed a position poll's "x,y,0" and took it for a state word).
   *  `timeoutMs` starts when the question goes out, not when it was queued. */
  async query(text: string, timeoutMs = 1200): Promise<string> {
    const session = this.session;
    const ahead = this.queryTail;
    let release!: () => void;
    this.queryTail = new Promise<void>(resolve => { release = resolve; });
    await ahead;
    try {
      // The line went down (or came back up) while this stood in line:
      // nothing is left to ask.
      if (session !== this.session) return '';
      return await this.ask(text, timeoutMs);
    } finally {
      release();
    }
  }

  /** True while a `query()` is on the line waiting for its reply. (Queries
   *  still in line don't count — they are asked in their turn, so a caller
   *  about to ask its own can simply do so.) */
  get querying(): boolean {
    return this.rxWaiters.length > 0;
  }

  /** Rehearsal mode: resolves once the virtual machine has executed every
   *  move it received — a position read straight after a jog would otherwise
   *  catch the carriage mid-travel, exactly as it would on a real machine.
   *  Resolves at once when nothing is simulated; false when `timeoutMs`
   *  elapses first (or the link changed underneath). */
  whenSimSettled(timeoutMs = 8000): Promise<boolean> {
    const sim = this.sim;
    if (!sim) return Promise.resolve(true);
    return new Promise<boolean>(resolve => {
      const t0 = Date.now();
      const poll = (): void => {
        if (this.sim !== sim) { resolve(false); return; }
        if (sim.done) { resolve(true); return; }
        if (Date.now() - t0 >= timeoutMs) { resolve(false); return; }
        window.setTimeout(poll, SIM_SETTLE_POLL_MS);
      };
      poll();
    });
  }

  /** One question on the line, and only the reply to it. Runs alone: the
   *  queue in `query()` makes sure no other question is outstanding, and
   *  only what looks like THIS question's answer settles it (see
   *  `answerMatcher`). Whatever else turns up first is kept aside and handed
   *  over at the timeout, so nothing the machine said is ever lost. */
  private async ask(text: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    const waiter: RxWaiter = { resolve: () => undefined, accepts: answerMatcher(text), passed: '' };
    const replyPromise = new Promise<string>(resolve => { waiter.resolve = resolve; });
    this.rxWaiters.push(waiter);
    try {
      await this.send(text, { [IS_QUERY]: true });
    } catch (e) {
      // Nothing went out, so no reply will come: take the waiter back rather
      // than leave it to swallow the next question's answer.
      this.dropWaiter(waiter);
      throw e;
    }
    const timer = setTimeout(() => {
      // No recognised answer in time: hand over everything that arrived.
      if (this.dropWaiter(waiter)) waiter.resolve(waiter.passed + this.takeRxText());
    }, Math.max(0, deadline - Date.now()));
    try {
      return await replyPromise;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Take `waiter` out of the line-up. False when it was already settled. */
  private dropWaiter(waiter: RxWaiter): boolean {
    const i = this.rxWaiters.indexOf(waiter);
    if (i < 0) return false;
    this.rxWaiters.splice(i, 1);
    return true;
  }

  private takeRxText(): string {
    const text = new TextDecoder().decode(new Uint8Array(this.rxBuf));
    this.rxBuf = [];
    return text;
  }

  private handleRx(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.rxBytes += bytes.length;
    this.rxBuf.push(...bytes);
    this.emit({ type: 'rx', text: toDisplayAscii(bytes), bytes: bytes.length, ts: Date.now(), raw: bytes });
    // A terminator (or any of them) may hand the reply to the question on the
    // line. Queries are serialised, so that is the one waiter in front.
    const tail = bytes.slice(-4);
    const terminated = tail.some(b => b === 0x0d || b === 0x0a || b === 0x03);
    if (!terminated || this.rxWaiters.length === 0) return;
    const waiter = this.rxWaiters[0];
    const text = this.takeRxText();
    if (waiter.accepts?.(text) ?? true) {
      this.rxWaiters.shift();
      waiter.resolve(text);
      return;
    }
    // Not the answer to THIS question (the `ok`s of a job's last lines still
    // coming in, a banner): the question stays on the line for its own reply.
    waiter.passed += text;
  }

  private async writeChunk(chunk: Uint8Array, lastOfSend: boolean): Promise<void> {
    const sim = this.sim;
    if (sim) {
      // Rehearsal mode: the virtual machine answers synchronously; each reply
      // goes through the ordinary rx path, so the console log, the position
      // read-out, the self-test and identify see what a real port would send.
      const wasBusy = sim.busy;
      for (const reply of sim.write(new TextDecoder().decode(chunk), lastOfSend)) {
        this.handleRx(SIM_TEXT.encode(reply));
      }
      // Motion starts now, not at the last pump: the first frame must not
      // bill the machine for time it was not even moving.
      if (sim.busy && !wasBusy) this.pumpAt = Date.now();
      this.requestFrame();
      return;
    }
    if (this.nativeId !== undefined) {
      const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join('');
      await callNative('serial_write', { id: this.nativeId, hex }, async () => {
        throw new Error('serial_write is only available in the desktop app.');
      });
      return;
    }
    if (!this.webWriter) throw new Error('Link is not connected.');
    await this.webWriter.write(chunk);
  }

  /** A write/read failed hard (device unplugged, driver reset). Tear the
   *  transport down and surface the reason — a wedged 'connected' state
   *  that silently eats every later command is the worst debugging
   *  outcome. The instance stays reusable for a fresh `open()`. */
  private async fatalError(message: string): Promise<void> {
    const hadPort = this.nativeId !== undefined || this.webPort !== null;
    await this.close().catch(() => undefined);
    if (hadPort) this.setStatus('error', message);
  }

  /** Toggle the DTR / RTS control lines — the classic "unfreeze a silent
   *  plotter" lever, since many devices gate their RS-232 driver output
   *  on DTR. Omitted lines are left unchanged. */
  async setSignals(signals: { dtr?: boolean; rts?: boolean }): Promise<void> {
    if (this.sim) return; // no control lines to toggle on a virtual machine
    if (this.nativeId !== undefined) {
      await callNative('serial_set_control', {
        id: this.nativeId, dtr: signals.dtr, rts: signals.rts,
      }, async () => {
        throw new Error('Control-line toggling needs the desktop app.');
      });
      return;
    }
    if (this.webPort?.setSignals) {
      await this.webPort.setSignals({
        dataTerminalReady: signals.dtr,
        requestToSend: signals.rts,
      });
      return;
    }
    throw new Error('Control-line toggling is not available on this connection.');
  }

  private startRxPoll(): void {
    this.stopRxPoll();
    const id = this.nativeId;
    if (id === undefined) return;
    const tick = async () => {
      if (this.nativeId !== id || this.status !== 'connected') return;
      try {
        const bytes = await callNative<number[]>('serial_read', { id, timeoutMs: 60, maxBytes: 4096 }, async () => [] as number[]);
        if (bytes && bytes.length > 0) {
          this.rxErrorStreak = 0;
          this.handleRx(new Uint8Array(bytes));
        }
      } catch {
        // Repeated failures = the port vanished (unplug / driver reset).
        // After a short streak, drop the connection instead of spinning.
        if (++this.rxErrorStreak >= 5) {
          this.rxErrorStreak = 0;
          void this.fatalError('Serial read failed repeatedly — the device may have been unplugged.');
        }
      }
    };
    this.rxPollTimer = window.setInterval(() => { void tick(); }, 200);
  }

  private stopRxPoll(): void {
    if (this.rxPollTimer !== null) {
      window.clearInterval(this.rxPollTimer);
      this.rxPollTimer = null;
    }
  }

  /** Start driving the virtual plotter's motion (rehearsal mode). */
  private startPump(): void {
    this.stopPump();
    this.pumpAt = Date.now();
    this.pumpTimer = window.setInterval(() => this.pump(), SIM_PUMP_INTERVAL_MS);
  }

  private stopPump(): void {
    if (this.pumpFrame !== null) {
      window.cancelAnimationFrame(this.pumpFrame);
      this.pumpFrame = null;
    }
    if (this.pumpTimer !== null) {
      window.clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
  }

  /** Play the simulated time that passed since the last pump. Animation
   *  frames keep the motion smooth while the window is in front; the
   *  interval is the safety net that restarts the frames whenever the
   *  machine is still busy (frames are suspended in a background window,
   *  and do not exist in every test host). */
  private pump(): void {
    const sim = this.sim;
    if (!sim || this.status !== 'connected') return;
    const now = Date.now();
    const dt = Math.min(Math.max(0, now - this.pumpAt) / 1000, SIM_MAX_STEP_S);
    this.pumpAt = now;
    if (dt > 0) sim.advance(dt);
    this.requestFrame();
  }

  /** One animation frame while the virtual machine still has moves to play. */
  private requestFrame(): void {
    if (!this.sim?.busy || this.pumpFrame !== null || typeof window.requestAnimationFrame !== 'function') return;
    this.pumpFrame = window.requestAnimationFrame(() => {
      this.pumpFrame = null;
      this.pump();
    });
  }

  private async startWebReadLoop(): Promise<void> {
    if (this.webReadLoopRunning || !this.webPort) return;
    this.webReadLoopRunning = true;
    try {
      this.webReader = this.webPort.readable.getReader();
      for (;;) {
        const { value, done } = await this.webReader.read();
        if (done) break;
        if (value) this.handleRx(value);
      }
    } catch {
      /* port closed mid-read */
    } finally {
      this.webReadLoopRunning = false;
      try { this.webReader?.releaseLock(); } catch { /* already released */ }
      this.webReader = null;
    }
  }

  async close(): Promise<void> {
    const id = this.nativeId;
    const port = this.webPort;
    const writer = this.webWriter;
    const sim = this.sim;
    this.nativeId = undefined;
    this.webPort = null;
    this.webWriter = null;
    this.sim = null;
    this.stopPump();
    this.stopRxPoll();
    // Leave the rehearsal mode cleanly: a handle someone still holds sees a
    // machine back at its power-on defaults, and the next open() starts afresh.
    sim?.reset();
    // Release a paused sender so close() never leaves it parked forever.
    if (this.paused) {
      this.paused = false;
      for (const r of this.pausedWaiters.splice(0)) r();
    }
    // Unblock the question on the line with everything that came for it (its
    // own answer if one arrived, else whatever else turned up), and forget
    // the ones waiting behind it: this line is gone.
    this.session += 1;
    const waiters = this.rxWaiters;
    this.rxWaiters = [];
    const rest = this.takeRxText();
    waiters.forEach((w, i) => w.resolve(w.passed + (i === 0 ? rest : '')));
    try { this.webReader?.cancel(); } catch { /* already closed */ }
    try { writer?.releaseLock(); } catch { /* already released */ }
    try { await port?.close(); } catch { /* already closed */ }
    if (id !== undefined) {
      try {
        await callNative('serial_close', { id }, async () => undefined);
      } catch { /* registry entry drops with the handle anyway */ }
    }
    this.setStatus('idle', '');
  }
}
