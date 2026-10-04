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

export type LinkEvent =
  | { type: 'status'; status: LinkStatus; detail?: string }
  | { type: 'tx'; text: string; bytes: number; ts: number; raw: Uint8Array }
  | { type: 'rx'; text: string; bytes: number; ts: number; raw: Uint8Array }
  | { type: 'progress'; sent: number; total: number }
  | { type: 'flow'; paused: boolean }
  | { type: 'done'; sent: number; total: number; aborted: boolean; error?: string; ms?: number };

export interface LinkOpenOptions {
  /** OS port path (native only). Web Serial shows its own chooser. */
  portPath?: string;
  baud: number;
  flowControl?: FlowControl;
}

export interface SendOptions {
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  /** Skip the pause gate — used by control snippets (blade lift, feed
   *  hold, cycle resume) that must go out WHILE a job send is paused. */
  pauseImmune?: boolean;
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

type Listener = (ev: LinkEvent) => void;

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
  private rxWaiters: Array<{ resolve: (s: string) => void }> = [];
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

  /** Human description for status pills, e.g. `COM3 @ 9600`. */
  describe(): string {
    if (this.status !== 'connected') return this.detail || this.status;
    const where = this.webPort ? 'Web Serial' : (this.detail.split('@')[0].trim() || 'port');
    return `${where} @ ${this.baud}`;
  }

  async open(opts: LinkOpenOptions): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.setStatus('connecting', opts.portPath ?? '');
    this.baud = opts.baud;
    this.flowControl = opts.flowControl ?? 'none';
    this.rxBuf = [];
    try {
      if (isTauri()) {
        let path = opts.portPath;
        if (!path) {
          const ports = await callNative<NativeLinkPortInfo[]>('serial_list_ports', undefined, async () => []);
          const usb = ports.filter(p => p.kind === 'usb');
          if (usb.length === 1) path = usb[0].path;
          else if (ports.length === 1) path = ports[0].path;
          else if (ports.length === 0) throw new Error('No serial ports detected. Plug in the plotter and try again.');
          else throw new Error(`Multiple serial ports detected (${ports.map(p => p.path).join(', ')}). Pick one first.`);
        }
        this.nativeId = await callNative<number>('serial_open', {
          path, baud: opts.baud, flow: this.flowControl,
        }, async () => { throw new Error('serial_open is only available in the desktop app.'); });
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
      if (!nav.serial) throw new Error('Web Serial API not available — use the desktop app or Chrome/Edge over HTTPS / localhost.');
      // Reuse a previously granted port when there's exactly one — avoids
      // re-prompting on every connect once the operator has approved it.
      const granted = await nav.serial.getPorts();
      const port = granted.length === 1 ? granted[0] : await nav.serial.requestPort();
      const flowArg = this.flowControl === 'hardware' ? 'hardware' : 'none'; // Web Serial has no XON/XOFF
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
      this.startWebReadLoop();
      this.setStatus('connected', `web @ ${opts.baud}`);
    } catch (e) {
      this.nativeId = undefined;
      this.webPort = null;
      this.setStatus('error', (e as Error).message);
      throw e;
    }
  }

  /** Fire-and-forget bytes — paced, abortable, logs to the console. */
  async send(data: string | Uint8Array, sendOpts: SendOptions = {}): Promise<void> {
    const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const total = payload.length;
    if (total === 0) return;
    const preview = typeof data === 'string' ? data.slice(0, 400) : '';
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
        await this.writeChunk(chunk);
        sent += chunk.length;
        sendOpts.onProgress?.(sent, total);
        this.emit({ type: 'progress', sent, total });
        if (delay > 0 && off + LINK_CHUNK_BYTES < total) await sleep(delay);
      }
      const ms = Date.now() - t0;
      this.emit({ type: 'done', sent, total, aborted: false, error: `${(total / 1024).toFixed(1)} KB in ${(ms / 1000).toFixed(1)} s`, ms });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      // A write that throws hard (device unplugged, driver reset) must not
      // leave the link pretending to be connected — tear it down with the
      // reason instead of silently dropping every later command.
      if (!aborted) await this.fatalError((e as Error).message).catch(() => undefined);
      this.emit({ type: 'done', sent, total, aborted, error: aborted ? undefined : (e as Error).message, ms: Date.now() - t0 });
      throw e;
    }
  }

  /** Pause the active job stream between chunks — the machine drains its
   *  input buffer and stops. Safe any time; affects the running `send()`. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.emit({ type: 'flow', paused: true });
  }

  /** Resume a paused sender and notify listeners. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const r of this.pausedWaiters.splice(0)) r();
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
   *  Resolves with whatever arrived (possibly '') after `timeoutMs`. */
  async query(text: string, timeoutMs = 1200): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    const replyPromise = new Promise<string>(resolve => {
      this.rxWaiters.push({ resolve });
    });
    await this.send(text);
    const timer = setTimeout(() => {
      // Resolve every pending waiter with what we have so far.
      const waiters = this.rxWaiters;
      this.rxWaiters = [];
      for (const w of waiters) w.resolve(this.takeRxText());
    }, Math.max(0, deadline - Date.now()));
    try {
      return await replyPromise;
    } finally {
      clearTimeout(timer);
    }
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
    // A terminator (or any of them) resolves pending query waiters.
    const tail = bytes.slice(-4);
    const terminated = tail.some(b => b === 0x0d || b === 0x0a || b === 0x03);
    if (terminated && this.rxWaiters.length > 0) {
      const waiters = this.rxWaiters;
      this.rxWaiters = [];
      const text = this.takeRxText();
      for (const w of waiters) w.resolve(text);
    }
  }

  private async writeChunk(chunk: Uint8Array): Promise<void> {
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
    this.nativeId = undefined;
    this.webPort = null;
    this.webWriter = null;
    this.stopRxPoll();
    // Release a paused sender so close() never leaves it parked forever.
    if (this.paused) {
      this.paused = false;
      for (const r of this.pausedWaiters.splice(0)) r();
    }
    // Unblock any pending query with what we have.
    const waiters = this.rxWaiters;
    this.rxWaiters = [];
    for (const w of waiters) w.resolve(this.takeRxText());
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
