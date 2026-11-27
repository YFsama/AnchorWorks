import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PlotterLink,
  computeChunkDelayMs,
  lineRateBytesPerSec,
  toDisplayAscii,
  toHex,
  LINK_CHUNK_BYTES,
  type LinkEvent,
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

  it('cancels a stream mid-way on its job signal and reports the abort', async () => {
    await link.open({ baud: 9600, flowControl: 'none' }); // paced: 320 ms between chunks
    const controller = new AbortController();
    const done: LinkEvent[] = [];
    const off = link.subscribe((ev) => { if (ev.type === 'done') done.push(ev); });
    const sending = link.send('X'.repeat(LINK_CHUNK_BYTES * 4), { jobId: 3, signal: controller.signal });
      await new Promise(r => { setTimeout(r, 400); }); // two chunks out (0 ms, ~320 ms), the third still waiting
      controller.abort();
      await expect(sending).rejects.toMatchObject({ name: 'AbortError' });
      off();
      // One or two chunks out of four; the rest of the job never left.
      expect(fake.written.length).toBeGreaterThanOrEqual(LINK_CHUNK_BYTES);
      expect(fake.written.length).toBeLessThanOrEqual(LINK_CHUNK_BYTES * 2);
      expect(done.at(-1)).toMatchObject({ aborted: true, jobId: 3, source: 'send' });
  });

  /* ------------------------------------------------------------------ *
   * Serialised queries. Two questions are never on the line together, so
   * a reply can only belong to the question that was asked — the job
   * monitor's status poll used to be handed a position poll's answer.
   * ------------------------------------------------------------------ */
  describe('serialised queries', () => {
    let link: PlotterLink;
    let fake: ReturnType<typeof makeFakePort>;
    const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });
    const wire = (): string => new TextDecoder().decode(new Uint8Array(fake.written));
    const say = (text: string): void => fake.enqueueRx(new TextEncoder().encode(text));

    beforeEach(() => {
      link = new PlotterLink();
      fake = makeFakePort();
      installSerial(fake);
    });

    afterEach(async () => {
      await link.close().catch(() => undefined);
      Object.defineProperty(window.navigator, 'serial', { value: undefined, configurable: true });
    });

    it('two overlapping queries each read the answer to their own question — the second is asked only once the first is answered', async () => {
      await link.open({ baud: 9600, flowControl: 'hardware' });
      const position = link.query('OA;', 1500);
      const status = link.query('OS;', 1500);
      await sleep(10);
      expect(wire()).toBe('OA;'); // OS; is still in line
      expect(link.querying).toBe(true);
      say('400,800,0\r\n');
      await expect(position).resolves.toBe('400,800,0\r\n'); // its own answer, not "2"
      await sleep(10);
      expect(wire()).toBe('OA;OS;'); // only now is the status question asked
      say('2\r\n');
      await expect(status).resolves.toBe('2\r\n'); // its own answer, not the position
      expect(link.querying).toBe(false);
    });

    it('the other way round: the status question first, then the position question', async () => {
      await link.open({ baud: 9600, flowControl: 'hardware' });
      const status = link.query('OS;', 1500);
      const position = link.query('OA;', 1500);
      await sleep(10);
      expect(wire()).toBe('OS;');
      say('2\r\n');
      await expect(status).resolves.toBe('2\r\n');
      await sleep(10);
      expect(wire()).toBe('OS;OA;');
      say('400,800,0\r\n');
      await expect(position).resolves.toBe('400,800,0\r\n');
    });

    it('a query standing behind a silent one goes out after that one times out — and its own clock starts then', async () => {
      await link.open({ baud: 9600, flowControl: 'hardware' });
      const silent = link.query('OE;', 60); // nobody answers this one
      const status = link.query('OS;', 500);
      await sleep(30);
      expect(wire()).toBe('OE;');
      await expect(silent).resolves.toBe('');
      await sleep(10);
      expect(wire()).toBe('OE;OS;');
      await sleep(150); // well inside the status query's own 500 ms
      expect(link.querying).toBe(true);
      say('2\r\n');
      await expect(status).resolves.toBe('2\r\n');
    });

    it('progress / done events name their sender: a query is source "query", a job send carries its jobId', async () => {
      await link.open({ baud: 9600, flowControl: 'hardware' });
      const events: LinkEvent[] = [];
      const off = link.subscribe((ev) => { if (ev.type === 'progress' || ev.type === 'done') events.push(ev); });
      await link.send('JOB', { jobId: 7 });
      await link.query('OE;', 20);
      await link.send('JOG'); // an untagged send: neither a job nor a query
      off();
      expect(events.filter((e) => e.type === 'progress')).toEqual([
        { type: 'progress', sent: 3, total: 3, jobId: 7, source: 'send' },
        { type: 'progress', sent: 3, total: 3, source: 'query' },
        { type: 'progress', sent: 3, total: 3, source: 'send' },
      ]);
      const done = events.filter((e) => e.type === 'done');
      expect(done.map((e) => (e as { jobId?: number }).jobId)).toEqual([7, undefined, undefined]);
      expect(done.map((e) => (e as { source?: string }).source)).toEqual(['send', 'query', 'send']);
    });

    it('a query whose send fails takes its waiter back: nothing stays in flight, the next reply is not swallowed', async () => {
      (fake as unknown as { writable: WritableStream<Uint8Array> }).writable = new WritableStream<Uint8Array>({
        write() { return Promise.reject(new Error('port unplugged')); },
      });
      await link.open({ baud: 9600, flowControl: 'hardware' });
      await expect(link.query('OE;', 1500)).rejects.toThrow('port unplugged');
      expect(link.querying).toBe(false);
      // No hang either: the link is down, and the next question is told so at once.
      await expect(link.query('OS;', 100)).rejects.toThrow(/not connected/);
    });

    it('queries still in line when the link closes are dropped — not asked of the next connection', async () => {
      await link.open({ baud: 9600, flowControl: 'hardware' });
      const onTheLine = link.query('OE;', 5000); // asked, nobody answers
      const behind = link.query('OS;', 5000); // waiting its turn
      await sleep(10);
      expect(wire()).toBe('OE;');
      await link.close();
      await expect(onTheLine).resolves.toBe('');
      await expect(behind).resolves.toBe('');
      await link.open({ baud: 9600, flowControl: 'hardware' });
      await sleep(20);
        expect(wire()).toBe('OE;'); // OS; never went out — not before, not after the reopen
      });

      /* ---- Reply matching: a question is answered only by what looks like ITS answer. ---- */

      it('a status poll is not answered by the job’s late "ok" lines — only by a report', async () => {
        await link.open({ baud: 9600, flowControl: 'hardware' });
        const status = link.query('?', 400);
        await sleep(10);
        say('ok\r\n');
        say('ok\r\nok\r\n'); // the acks of a job's last lines, still coming in
        await sleep(20);
        expect(link.querying).toBe(true); // still waiting for ITS answer
        say('<Alarm|MPos:0.000,0.000,-1.000|FS:0,0>\r\n');
        await expect(status).resolves.toBe('<Alarm|MPos:0.000,0.000,-1.000|FS:0,0>\r\n'); // the acks are not even in front of it
      });

      it('when nothing that looks like the answer ever comes, the question still gets everything that did', async () => {
        await link.open({ baud: 9600, flowControl: 'hardware' });
        const status = link.query('?', 120);
        await sleep(10);
        say('ok\r\n');
        await sleep(10);
        say('sure, why not\r\n'); // a controller with ideas of its own
        await expect(status).resolves.toBe('ok\r\nsure, why not\r\n');
        expect(link.querying).toBe(false);
      });

      it('HP-GL: a status poll is not answered by a position reply, nor a position poll by a status word', async () => {
        await link.open({ baud: 9600, flowControl: 'hardware' });
        const status = link.query('OS;', 400);
        await sleep(10);
        say('400,800,0\r\n'); // a late OA; answer
        await sleep(20);
        expect(link.querying).toBe(true);
        say('2\r\n');
        await expect(status).resolves.toBe('2\r\n');
        const position = link.query('OA;', 400);
        await sleep(10);
        say('2\r\n'); // a late status word
        await sleep(20);
        expect(link.querying).toBe(true);
        say('400,800,0\r\n');
        await expect(position).resolves.toBe('400,800,0\r\n');
      });

      it('HP-GL: an ETX-terminated answer, and an echoed command in front of it, are still its answer', async () => {
        await link.open({ baud: 9600, flowControl: 'hardware' });
        const status = link.query('OS;', 300);
        await sleep(10);
        fake.enqueueRx(new TextEncoder().encode('2\x03'));
        await expect(status).resolves.toBe('2\x03');
        const echoed = link.query('oa;', 300);
        await sleep(10);
        say('oa;400, 800, 0\r\n');
        await expect(echoed).resolves.toBe('oa;400, 800, 0\r\n');
      });

      it('a command with no known answer shape keeps the old rule: the first terminated data is the reply', async () => {
        await link.open({ baud: 9600, flowControl: 'hardware' });
        const model = link.query('OI;', 300);
        await sleep(10);
        say('HP7475A\r\n');
        await expect(model).resolves.toBe('HP7475A\r\n');
      });

      it('grbl reads are answered by their data, never by a bare ok; a jog only ever gets its ok', async () => {
        await link.open({ baud: 9600, flowControl: 'hardware' });
        const build = link.query('$I', 400);
        await sleep(10);
        say('ok\r\n'); // the ack of a setting written just before
        await sleep(20);
        expect(link.querying).toBe(true);
        say('[VER:1.1h.20190825:]\r\nok\r\n');
        await expect(build).resolves.toBe('[VER:1.1h.20190825:]\r\nok\r\n');
        const jog = link.query('$J=G91 G21 X1 F3000', 400);
        await sleep(10);
        say('ok\r\n');
        await expect(jog).resolves.toBe('ok\r\n');
      });
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
