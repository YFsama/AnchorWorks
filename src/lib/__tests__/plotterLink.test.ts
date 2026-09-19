import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PlotterLink,
  computeChunkDelayMs,
  lineRateBytesPerSec,
  toDisplayAscii,
  toHex,
  LINK_CHUNK_BYTES,
} from '../plotterLink';

describe('computeChunkDelayMs', () => {
  it('paces 256-byte chunks just under the line rate at 9600 baud', () => {
    // 256 bytes × 10 bits / 9600 baud = 266.7 ms × 1.2 margin = 320 ms
    expect(computeChunkDelayMs(9600, 256, 'none')).toBe(320);
  });

  it('is shorter at higher baud', () => {
    expect(computeChunkDelayMs(115200, 256, 'none')).toBeLessThanOrEqual(30);
  });

  it('adds no artificial delay when flow control handles backpressure', () => {
    expect(computeChunkDelayMs(9600, 256, 'hardware')).toBe(0);
    expect(computeChunkDelayMs(9600, 256, 'software')).toBe(0);
  });

  it('never divides by zero', () => {
    expect(computeChunkDelayMs(0, 256, 'none')).toBe(0);
    expect(computeChunkDelayMs(Number.NaN, 256, 'none')).toBe(0);
  });
});

describe('lineRateBytesPerSec', () => {
  it('is baud/10 with no flow control', () => {
    expect(lineRateBytesPerSec(9600, 'none')).toBe(960);
  });
});

describe('byte formatting helpers', () => {
  it('renders printable ASCII and marks control bytes', () => {
    expect(toDisplayAscii(new Uint8Array([0x41, 0x0d, 0x42, 0x00]))).toBe('A\rB·');
  });

  it('renders hex with byte padding', () => {
    expect(toHex(new Uint8Array([0x0a, 0xff, 0x1]))).toBe('0a ff 01');
  });
});

/* ------------------------------------------------------------------ *
 * PlotterLink behaviour over a fake Web Serial port. The fake port
 * captures writes into an array and lets the test push RX bytes through
 * a ReadableStream controller — enough to exercise pacing, progress,
 * abort, query-terminate and close without any hardware.
 * ------------------------------------------------------------------ */

interface FakePort {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  setSignals: ReturnType<typeof vi.fn>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  written: number[];
}

function makeFakePort(): FakePort & { enqueueRx: (bytes: Uint8Array) => void } {
  const written: number[] = [];
  let rxController!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start(c) { rxController = c; },
  });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) { written.push(...chunk); },
  });
  const port = {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    setSignals: vi.fn(async () => {}),
    readable,
    writable,
    written,
    enqueueRx(bytes: Uint8Array) { rxController.enqueue(bytes); },
  };
  return port;
}

function installSerial(fake: FakePort) {
  Object.defineProperty(window.navigator, 'serial', {
    value: { getPorts: async () => [fake], requestPort: async () => fake },
    configurable: true,
  });
}

describe('PlotterLink (web serial fake)', () => {
  let link: PlotterLink;
  let fake: ReturnType<typeof makeFakePort>;

  beforeEach(() => {
    link = new PlotterLink();
    fake = makeFakePort();
    installSerial(fake);
  });

  afterEach(async () => {
    await link.close().catch(() => undefined);
    Object.defineProperty(window.navigator, 'serial', { value: undefined, configurable: true });
  });

  it('opens the single granted port and reports connected', async () => {
    await link.open({ baud: 9600, flowControl: 'none' });
    expect(link.status).toBe('connected');
    expect(fake.open).toHaveBeenCalledWith(expect.objectContaining({ baudRate: 9600 }));
    expect(link.describe()).toContain('9600');
  });

  it('rejects when Web Serial is unavailable', async () => {
    Object.defineProperty(window.navigator, 'serial', { value: undefined, configurable: true });
    await expect(link.open({ baud: 9600 })).rejects.toThrow(/Web Serial/);
    expect(link.status).toBe('error');
  });

  it('streams in chunks with progress and a final done event', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' }); // no pacing delays in test
    const progress: Array<{ sent: number; total: number }> = [];
    const doneEvents: Array<{ aborted: boolean }> = [];
    const off = link.subscribe(ev => {
      if (ev.type === 'progress') progress.push(ev);
      if (ev.type === 'done') doneEvents.push(ev);
    });
    const payload = 'A'.repeat(LINK_CHUNK_BYTES * 2 + 100); // 3 chunks
    await link.send(payload);
    off();
    expect(fake.written.length).toBe(payload.length);
    expect(progress.map(e => e.sent)).toEqual([256, 512, 612]);
    expect(progress[0].total).toBe(612);
    expect(doneEvents[0].aborted).toBe(false);
  });

  it('aborts cleanly before the first chunk when the signal pre-fires', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    const controller = new AbortController();
    controller.abort();
    const doneEvents: Array<{ aborted: boolean }> = [];
    const off = link.subscribe(ev => { if (ev.type === 'done') doneEvents.push(ev); });
    await expect(link.send('JOB', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    off();
    expect(fake.written.length).toBe(0);
    expect(doneEvents[0].aborted).toBe(true);
  });

  it('resolves query() when a terminated reply arrives', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    const pending = link.query('OE;', 1500);
    // Device answers a moment later with "0\r\n" (the classic HP-GL OK).
    setTimeout(() => fake.enqueueRx(new TextEncoder().encode('0\r\n')), 30);
    await expect(pending).resolves.toBe('0\r\n');
  });

  it('resolves query() with whatever arrived once the timeout lapses', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    await expect(link.query('OE;', 40)).resolves.toBe('');
  });

  it('closes the port and returns to idle', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    await link.close();
    expect(link.status).toBe('idle');
    expect(fake.close).toHaveBeenCalled();
  });

  it('tracks lifetime tx/rx byte counters', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    fake.enqueueRx(new TextEncoder().encode('ok\r\n'));
    await link.send('AB');
    // Let the web read loop deliver the enqueued bytes.
    await new Promise(r => { setTimeout(r, 20); });
    expect(link.txBytes).toBe(2);
    expect(link.rxBytes).toBe(4);
  });

  it('toggles DTR/RTS through the web port', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    await link.setSignals({ dtr: true, rts: false });
    expect(fake.setSignals).toHaveBeenCalledWith(
      expect.objectContaining({ dataTerminalReady: true, requestToSend: false }),
    );
  });

  it('drops to error status when a write fails hard (device unplugged)', async () => {
    const bad = makeFakePort();
    (bad as unknown as { writable: WritableStream<Uint8Array> }).writable =
      new WritableStream<Uint8Array>({
        write() { return Promise.reject(new Error('port unplugged')); },
      });
    installSerial(bad);
    await link.open({ baud: 9600, flowControl: 'hardware' });
    await expect(link.send('JOBJOB')).rejects.toThrow('port unplugged');
    expect(link.status).toBe('error');
  });
describe('pause / resume gate', () => {
  it('parks the sender between chunks and completes after resume()', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' }); // no pacing delays
    link.pause();
    expect(link.paused).toBe(true);
    let settled = false;
    const p = link.send('A'.repeat(LINK_CHUNK_BYTES + 10)).then(() => { settled = true; });
    await new Promise(r => { setTimeout(r, 30); });
    expect(settled).toBe(false);          // parked before the first chunk
    expect(fake.written.length).toBe(0);
    link.resume();
    await p;
    expect(settled).toBe(true);
    expect(fake.written.length).toBe(LINK_CHUNK_BYTES + 10);
    expect(link.paused).toBe(false);
  });

  it('control snippets with pauseImmune bypass the gate', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    link.pause();
    const job = link.send('B'.repeat(LINK_CHUNK_BYTES * 3));
    await new Promise(r => { setTimeout(r, 20); });
    await link.send('!', { pauseImmune: true });
    expect(fake.written).toContain('!'.charCodeAt(0));
    link.resume();
    await job;
  });

  it('abort breaks through a paused send', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    link.pause();
    const controller = new AbortController();
    const p = link.send('C'.repeat(1024), { signal: controller.signal });
    await new Promise(r => { setTimeout(r, 20); });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    link.resume();
  });

  it('close() releases a paused sender', async () => {
    await link.open({ baud: 9600, flowControl: 'hardware' });
    link.pause();
    const p = link.send('D'.repeat(512));
    await new Promise(r => { setTimeout(r, 20); });
    await link.close();
    await expect(p).rejects.toThrow();
    expect(link.paused).toBe(false);
  });
});
});
