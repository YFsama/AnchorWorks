import { afterEach, describe, expect, it } from 'vitest';
import { getSharedPlotterLink } from '../plotterLink';
import { generateGCode, generateHPGL, defaultPlotterOptions } from '../plotter';
import {
  grblWorkPosition, jobActive, jobOver, plotterJobMonitor,
  type PlotterJobPhase, type PlotterJobSnapshot,
} from '../plotterJobMonitor';

/**
 * Job monitor over a fake Web Serial line (no hardware).
 *
 *   • "Transfer finished" belongs to the job's OWN send. The monitor's
 *     position polls (`?` / `OA;`), any other query, a jog or a flow-control
 *     character share the link while the job streams — none of them may end
 *     the transfer. On a real grbl board a `?` used to do exactly that: the
 *     phase left "sending" a few milliseconds in, Pause / Stop vanished and
 *     "Cut finished" popped while the head was still cutting.
 *   • A busy machine is never "finished": the status is the LAST complete
 *     reply, one idle reply alone does not end the watch, and position and
 *     status questions are never on the wire together.
 *   • Alarm / Door / Hold (grbl) and the virtual plotter's travel alarm are
 *     an `alarm`, never a `done`.
 */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/* ---- fake Web Serial line + machines ------------------------------------- */

interface Machine {
  onChar(ch: string): void;
  /** Where the machine sends its replies (the fake line's rx). */
  attach(reply: (text: string) => void): void;
}

/** A Web Serial port whose far end is `machine`. Bytes are delivered one character at a time. */
function fakeSerial(machine: Machine) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let push: (b: Uint8Array) => void = () => undefined;
  let open = false;
  const rx = { bytes: 0 };
  const readable = new ReadableStream<Uint8Array>({ start: (c) => { push = (b) => { c.enqueue(b); }; } });
  const reply = (text: string): void => { setTimeout(() => { if (open) push(enc.encode(text)); }, 0); };
  const port = {
    open: async (): Promise<void> => { open = true; },
    close: async (): Promise<void> => { open = false; },
    readable,
    writable: new WritableStream<Uint8Array>({
      write: async (chunk: Uint8Array): Promise<void> => { rx.bytes += chunk.length; for (const ch of dec.decode(chunk)) machine.onChar(ch); },
    }),
  };
  Object.defineProperty(window.navigator, 'serial', { value: { getPorts: async () => [port], requestPort: async () => port }, configurable: true });
  machine.attach(reply);
  return rx;
}

/** A grbl controller: `ok` per line, `?` answered with a status report. It is
 *  `busyMs` "busy" after every motion line. `report` shapes the answer to `?`. */
function grblMachine(opts: { busyMs?: number; report?: (state: string) => string } = {}): Machine & {
  st: { asked: number; isBusy(): boolean };
} {
  const st = { asked: 0, busyUntil: 0, isBusy: () => Date.now() < st.busyUntil };
  let line = '';
  let reply: (text: string) => void = () => undefined;
  return {
    st,
    attach: (r) => { reply = r; },
    onChar: (ch) => {
      if (ch === '?') {
        st.asked += 1;
        const state = st.isBusy() ? 'Run' : 'Idle';
        reply(opts.report ? opts.report(state) : `<${state}|MPos:10.000,20.000,5.000|FS:0,0>\r\n`);
        return;
      }
      if (ch === '\n') {
        const bare = line.split(';')[0].trim();
        line = '';
        if (!bare) return;
        if (/^G[0-3](?![0-9])/.test(bare) && /[XYZ]/.test(bare)) st.busyUntil = Date.now() + (opts.busyMs ?? 400);
        reply('ok\r\n');
        return;
      }
      if (ch >= ' ') line += ch;
    },
  };
}

/** An HP-GL plotter: answers OA; (position), OS; (status), OH; (page). PD
 *  makes it busy for `busyMs`. Replies take `latencyMs` — long enough that two
 *  questions on the line together WOULD read each other's answer. `status`
 *  shapes the OS; answers (several strings = a reply in several pieces). */
function hpglMachine(opts: { busyMs?: number; latencyMs?: number; status?: (busy: boolean, nth: number) => string[] } = {}): Machine & {
  st: { x: number; y: number; oa: number; os: number; inFlight: number; maxInFlight: number };
} {
  const st = { x: 0, y: 0, busyUntil: 0, oa: 0, os: 0, inFlight: 0, maxInFlight: 0 };
  let stmt = '';
  let reply: (text: string) => void = () => undefined;
  const latency = opts.latencyMs ?? 40;
  /** Answer in the given pieces, one latency apart — as a real line delivers them. */
  const answer = (pieces: string[]): void => {
    st.inFlight += 1;
    st.maxInFlight = Math.max(st.maxInFlight, st.inFlight);
    const next = (): void => {
      const piece = pieces.shift();
      if (piece === undefined) { st.inFlight -= 1; return; }
      setTimeout(() => { reply(piece); next(); }, latency);
    };
    next();
  };
  return {
    st,
    attach: (r) => { reply = r; },
    onChar: (ch) => {
      if (ch === '\r' || ch === '\n') return;
      if (ch !== ';') { stmt += ch; return; }
      const s = stmt.trim();
      stmt = '';
      if (!s) return;
      const up = s.toUpperCase();
      if (up.startsWith('OA')) { st.oa += 1; answer([`${st.x},${st.y},0\r\n`]); return; }
      if (up.startsWith('OS')) {
        st.os += 1;
        const busy = Date.now() < st.busyUntil;
        answer(opts.status ? opts.status(busy, st.os) : [busy ? '2\r\n' : '0\r\n']);
        return;
      }
      if (up.startsWith('OH')) { answer(['0,0,8000,8000\r\n']); return; }
      const nums = (s.replace(/^[A-Za-z]+/, '').match(/-?\d+/g) ?? []).map(Number);
      if (up.startsWith('PD')) st.busyUntil = Date.now() + (opts.busyMs ?? 0);
      if ((up.startsWith('PU') || up.startsWith('PD') || up.startsWith('PA')) && nums.length >= 2) { st.x = nums[0]; st.y = nums[1]; }
    },
  };
}

/* ---- helpers ------------------------------------------------------------- */

type Poly = { points: Array<[number, number]>; closed: boolean };
function squares(n: number): Poly[] {
  const out: Poly[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i % 10) * 20;
    const y = Math.floor(i / 10) * 20;
    out.push({ closed: true, points: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]] });
  }
  return out;
}
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const GCODE = generateGCode(squares(20), { ...defaultPlotterOptions, originBottomLeft: false }); // ~13 chunks at 38400 baud
const HPGL = generateHPGL(squares(40), { ...defaultPlotterOptions, originBottomLeft: false });

/** Every phase the monitor goes through, in order (no repeats). */
function track(): { phases: PlotterJobPhase[]; un(): void } {
  const phases: PlotterJobPhase[] = [];
  const un = plotterJobMonitor.subscribe((s) => { if (phases.at(-1) !== s.phase) phases.push(s.phase); });
  return { phases, un };
}
const phaseNow = (): PlotterJobPhase => plotterJobMonitor.getSnapshot().phase;
/** Resolve with the first moment the phase is one of `wanted`, or null after `ms`. */
async function waitPhase(wanted: PlotterJobPhase[], ms: number): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (wanted.includes(phaseNow())) return Date.now() - t0;
    await sleep(40);
  }
  return wanted.includes(phaseNow()) ? Date.now() - t0 : null;
}
/** Wait until a predicate on the snapshot holds, or give up after `ms`. */
async function waitUntil(test: (s: PlotterJobSnapshot) => boolean, ms: number): Promise<PlotterJobSnapshot | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = plotterJobMonitor.getSnapshot();
    if (test(s)) return s;
    await sleep(40);
  }
  return null;
}

/** Sends started by a test, so a failing test cannot leak a rejecting promise into the next one. */
const inFlight: Array<Promise<unknown>> = [];
const launch = <T>(p: Promise<T>): Promise<T> => { inFlight.push(p.catch(() => undefined)); return p; };

describe('plotterJobMonitor', () => {
  afterEach(async () => {
    plotterJobMonitor.dismiss();
    await getSharedPlotterLink().close().catch(() => undefined);
    await Promise.allSettled(inFlight.splice(0));
    Object.defineProperty(window.navigator, 'serial', { value: undefined, configurable: true });
  });

  it('real grbl, tagged job: only the job’s own send moves the phase — its ? polls and other sends never end the transfer', async () => {
    // MPos is the machine frame; the report also carries the G92 offset (work = machine − offset).
    const machine = grblMachine({ report: (state) => `<${state}|MPos:110.000,70.000,5.000|FS:0,0|WCO:100.000,50.000,0.000>\r\n` });
    const rx = fakeSerial(machine);
    const link = getSharedPlotterLink();
    await link.open({ baud: 38400, flowControl: 'none' });
    const { phases, un } = track();
    const jobId = plotterJobMonitor.start({ total: bytes(GCODE), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
    const sending = launch(link.send(GCODE, { jobId }));

    await sleep(300);
    let s = plotterJobMonitor.getSnapshot();
    expect(s.phase).toBe('sending'); // the first ? poll has been answered already
    expect(s.total).toBe(bytes(GCODE)); // not the 1 byte of that question
    expect(s.sent).toBeGreaterThan(0);
    expect(s.position).toEqual({ x: 10, y: 20 }); // work coordinates
    expect(s.positionFrame).toBe('work');

    await sleep(400);
    // A feed hold and a jog go out on the same link, in the middle of the stream.
    await link.send('!');
    await link.send('$J=G91 G21 X1 F3000\n');
    s = plotterJobMonitor.getSnapshot();
    expect(s.phase).toBe('sending');
    expect(s.total).toBe(bytes(GCODE));
    expect(s.sent).toBeGreaterThan(0);
    expect(s.sent).toBeLessThan(bytes(GCODE));
    // Pause / Stop are exactly the "sending" phase: still there, mid-transfer.
    expect(jobActive(s.phase)).toBe(true);
    expect(phases).toEqual(['sending']); // nothing else so far — no "finished" anywhere

    await sending;
    await sleep(250);
    expect(phaseNow()).toBe('busy'); // the machine is still moving: NOT done

    // Idle has to be seen twice before the cut is called finished.
    expect(await waitPhase(['done'], 9000)).not.toBeNull();
    expect(phases).toEqual(['sending', 'sent', 'busy', 'done']);
    un();

    // Over: nothing is asked any more.
    const rxAfter = rx.bytes;
    await sleep(1300);
    expect(rx.bytes).toBe(rxAfter);
  }, 20000);

  it('legacy sender (no job id): the untagged job send still drives the monitor, a query on top of it does not', async () => {
    const machine = grblMachine();
    fakeSerial(machine);
    const link = getSharedPlotterLink();
    await link.open({ baud: 38400, flowControl: 'none' });
    plotterJobMonitor.start({ total: bytes(GCODE), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
    const sending = launch(link.send(GCODE));
    await sleep(150);
    expect(phaseNow()).toBe('sending');
    await link.query('?'); // a question on top of the transfer — never "the job is sent"
    expect(phaseNow()).toBe('sending');
    expect(plotterJobMonitor.getSnapshot().total).toBe(bytes(GCODE));
    await sending;
    expect(['sent', 'busy']).toContain(phaseNow());
  }, 10000);

  it('a paused stream is not asked for its position', async () => {
    const machine = grblMachine();
    fakeSerial(machine);
    const link = getSharedPlotterLink();
    await link.open({ baud: 38400, flowControl: 'none' });
    const jobId = plotterJobMonitor.start({ total: bytes(GCODE), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
    const sending = launch(link.send(GCODE, { jobId }));
    await sleep(200);
    const asked = machine.st.asked;
    link.pause();
    await sleep(1100);
    expect(phaseNow()).toBe('sending');
    expect(plotterJobMonitor.getSnapshot().paused).toBe(true);
    expect(machine.st.asked).toBe(asked); // no ? while the stream is parked
    link.resume();
    await sending;
    expect(['sent', 'busy']).toContain(phaseNow());
  }, 10000);

  it.each([
    ['Alarm', 'alarm', '<Alarm|MPos:0.000,0.000,-1.000|FS:0,0>'],
    ['Door', 'door', '<Door:2|WPos:1.000,2.000,5.000>'],
    ['Hold', 'hold', '<Hold:0|MPos:1.000,2.000,-1.000>'],
  ] as const)('real grbl reporting %s after the transfer → phase "alarm" (%s), never "done"', async (_name, alarm, report) => {
    const machine = grblMachine({ report: () => `${report}\r\n` });
    fakeSerial(machine);
    const link = getSharedPlotterLink();
    await link.open({ baud: 115200, flowControl: 'hardware' });
    const { phases, un } = track();
    const jobId = plotterJobMonitor.start({ total: bytes(GCODE), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
    await link.send(GCODE, { jobId });
    expect(await waitPhase(['alarm'], 1500)).not.toBeNull();
    const s = plotterJobMonitor.getSnapshot();
    expect(s.phase).toBe('alarm');
    expect(s.alarm).toBe(alarm);
    expect(s.alarmReason).toBe(report.match(/^<(\w+(?::\d+)?)/)?.[1]);
    expect(s.endedAt).not.toBeNull();
    expect(s.error).toBeNull();
    expect(jobActive(s.phase)).toBe(false);
    expect(jobOver(s.phase)).toBe(true);
    expect(phases).not.toContain('done');
    un();
    // A later disconnect does not repaint an alarm as something else.
    await link.close();
    expect(plotterJobMonitor.getSnapshot()).toMatchObject({ phase: 'alarm', alarm });
  }, 8000);

  it('virtual plotter that runs past its travel → "alarm" / travel-limit, not "done"', async () => {
    const link = getSharedPlotterLink();
    await link.open({ simulate: true, format: 'gcode', unit: 'mm', paperHeightMm: 50, baud: 115200, flowControl: 'hardware' });
    const code = generateGCode([{ closed: true, points: [[0, 0], [5, 0], [5, 80], [0, 80], [0, 0]] }], { ...defaultPlotterOptions, originBottomLeft: false, feedRate: 6000, travelRate: 6000 });
    const { phases, un } = track();
    const jobId = plotterJobMonitor.start({ total: bytes(code), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
    await link.send(code, { jobId });
    expect(await waitPhase(['alarm'], 5000)).not.toBeNull();
    const s = plotterJobMonitor.getSnapshot();
    expect(s.phase).toBe('alarm');
    expect(s.alarm).toBe('travel-limit');
    expect(s.alarmReason).toContain('travel limit');
    expect(jobActive(s.phase)).toBe(false);
    expect(phases).not.toContain('done');
    un();
  }, 10000);

  it('HP-GL: a busy plotter is never "finished", and position / status questions are never on the line together', async () => {
    const machine = hpglMachine({ busyMs: 1500 });
    fakeSerial(machine);
    const link = getSharedPlotterLink();
    await link.open({ baud: 115200, flowControl: 'none' });
    const { phases, un } = track();
    const jobId = plotterJobMonitor.start({ total: bytes(HPGL), kind: 'job', format: 'hpgl', unit: 'mm', cuts: [] });
    await link.send(HPGL, { jobId });
    await link.send('PU400,800;'); // park the (fake) head at 10, 20 mm so OA; has something to say

    await sleep(400);
    expect(phaseNow()).toBe('busy'); // first OS; poll: 2 = drawing
    await sleep(3200); // the poll at ~3 s saw ONE idle (the plotter stopped at ~1.7 s)…
    expect(phaseNow()).not.toBe('done'); // …which is not a finish yet
    expect(plotterJobMonitor.getSnapshot().position).toEqual({ x: 10, y: 20 }); // OA; read its own answer
    expect(plotterJobMonitor.getSnapshot().positionFrame).toBe('work');

    expect(await waitPhase(['done'], 6000)).not.toBeNull(); // the second idle confirms it
    expect(phases).toEqual(['sending', 'sent', 'busy', 'done']);
    expect(machine.st.maxInFlight).toBe(1); // never two questions waiting at once
    expect(machine.st.oa).toBeGreaterThanOrEqual(3);
    expect(machine.st.os).toBeGreaterThanOrEqual(3);
    un();
  }, 20000);

  it('HP-GL: a lone stale "0" harvested where the answer should be is not a finish', async () => {
    // A plotter that is BUSY (it is still cutting for 8 s). Its first status
    // answer arrives as a stale "0" on its own; the real "2" trails behind it.
    const machine = hpglMachine({ busyMs: 8000, latencyMs: 60, status: (busy, nth) => (nth === 1 ? ['0\r\n', '2\r\n'] : [busy ? '2\r\n' : '0\r\n']) });
    fakeSerial(machine);
    const link = getSharedPlotterLink();
    await link.open({ baud: 115200, flowControl: 'none' });
    const { phases, un } = track();
    const jobId = plotterJobMonitor.start({ total: bytes(HPGL), kind: 'job', format: 'hpgl', unit: 'mm', cuts: [] });
    await link.send(HPGL, { jobId });
    await link.send('PU400,800;');
    await sleep(1000);
    expect(phaseNow()).toBe('sent'); // one idle answer: unconfirmed, so nothing was called
    // The trailing "2" stayed in the buffer; the next OA; still read its own answer.
    const s = await waitUntil((x) => x.position !== null, 2000);
    expect(s?.position).toEqual({ x: 10, y: 20 });
    expect(await waitPhase(['busy'], 5000)).not.toBeNull(); // the next status poll reads the real state
    expect(phases).not.toContain('done');
    un();
  }, 12000);

  it('start() hands out a fresh id per job and the new read-outs start empty', () => {
    const a = plotterJobMonitor.start({ total: 1, kind: 'test-cut', format: 'hpgl', unit: 'mm', cuts: [] });
    const b = plotterJobMonitor.start({ total: 1, kind: 'test-cut', format: 'hpgl', unit: 'mm', cuts: [] });
    expect(b).toBe(a + 1);
    expect(plotterJobMonitor.getSnapshot()).toMatchObject({ phase: 'sending', position: null, positionFrame: null, alarm: null, alarmReason: null, error: null });
    plotterJobMonitor.dismiss();
    expect(plotterJobMonitor.getSnapshot().phase).toBe('idle');
    expect(jobActive('alarm')).toBe(false);
    expect(jobActive('busy')).toBe(true);
    expect(jobOver('alarm')).toBe(true);
    expect(jobOver('busy')).toBe(false);
  });

  it('grblWorkPosition: WPos is work; MPos needs the offset — from this report or the last one seen', () => {
    expect(grblWorkPosition('ok\r\n', null)).toBeNull();
    expect(grblWorkPosition('<Idle|WPos:1.500,2.500,5.000|FS:0,0>\r\n', null)).toEqual({ x: 1.5, y: 2.5, frame: 'work', wco: null });
    expect(grblWorkPosition('<Idle|MPos:10.000,20.000,5.000>\r\n', null)).toEqual({ x: 10, y: 20, frame: 'machine', wco: null });
    // A G92 origin at machine (100, 50): the job's (10, 20) is machine (110, 70).
    expect(grblWorkPosition('<Run|MPos:110.000,70.000,-1.000|FS:1500,0|WCO:100.000,50.000,0.000>\r\n', null))
      .toEqual({ x: 10, y: 20, frame: 'work', wco: { x: 100, y: 50 } });
    // The next reports carry no WCO — the last one seen still applies.
    expect(grblWorkPosition('<Run|MPos:120.000,70.000,-1.000|FS:1500,0>\r\n', { x: 100, y: 50 }))
      .toEqual({ x: 20, y: 20, frame: 'work', wco: { x: 100, y: 50 } });
    // The LAST report is the current one.
    expect(grblWorkPosition('<Run|WPos:1,1,0>\r\nok\r\n<Idle|WPos:3,4,0>\r\n', null)).toMatchObject({ x: 3, y: 4 });
    expect(grblWorkPosition('<Run|MPos:1,1,0>\r\nok\r\n<Alarm|MPos:1,1,-1>\r\n', null)).toMatchObject({ x: 1, y: 1, frame: 'machine' });
  });
});
