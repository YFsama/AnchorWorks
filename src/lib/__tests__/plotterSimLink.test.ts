import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlotterLink, LINK_CHUNK_BYTES, runWithPortProbe } from '../plotterLink';
import { buildJog, buildSetOrigin, parsePageReply, parsePositionReply } from '../hpglDebug';
import { identifyMachine, isRejectReply } from '../plotterIdentify';
import { cutStateFromReply } from '../plotterDiag';
import { buildPlotterOutput, defaultPlotterOptions } from '../plotter';

/* ------------------------------------------------------------------ *
 * The link in rehearsal mode: open({ simulate: true }) talks to the
 * built-in virtual plotter instead of a serial port, through the very
 * status events, pacing, pause gate and rx path a real line uses.
 * ------------------------------------------------------------------ */

const sq = (x: number): Array<[number, number]> => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]];
const squares = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ points: sq(i * 20), closed: true, kind: 'outline' as const }));

/** Animation frames never run by themselves here — fake timers drive the
 *  watchdog interval, which keeps the frames coming whenever a frame is
 *  pending (the frame callbacks themselves are collected, never fired). */
let frames: FrameRequestCallback[];
let rafSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  rafSpy = vi.fn((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, writable: true, value: rafSpy });
  Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Await a settle under fake timers: the poll loop runs on the fake clock. */
async function settles(link: PlotterLink, ms = 2000): Promise<boolean> {
  const pending = link.whenSimSettled();
  await vi.advanceTimersByTimeAsync(ms);
  return pending;
}

describe('PlotterLink — rehearsal mode (virtual plotter)', () => {
  it('opens with no serial capability at all: no Web Serial, no desktop bridge', async () => {
    const link = new PlotterLink();
    const statuses: string[] = [];
    link.subscribe((ev) => { if (ev.type === 'status') statuses.push(ev.status); });
    await link.open({ simulate: true, baud: 9600, format: 'hpgl', unit: 'mm', paperHeightMm: 210, plotWidthMm: 720 });
    expect(link.status).toBe('connected');
    expect(link.simulated).toBe(true);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(link.simulator?.travelLimits).toEqual({ widthMm: 720, heightMm: 210 });
    expect(link.describe()).toBe('Virtual plotter @ 9600');
    // The working-area query a real cutter answers on connect.
    const page = parsePageReply(await link.query('OH;'), 'mm');
    expect(page).not.toBeNull();
    expect(page!.x1).toBeGreaterThan(0);
    expect(link.rxBytes).toBeGreaterThan(0);
    expect(link.txBytes).toBeGreaterThan(0);
    await link.close();
  });

  it('defaults to an HP-GL machine in mm when nothing else is said', async () => {
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 9600 });
    expect(link.simulator?.format).toBe('hpgl');
    expect(link.simulator?.unit).toBe('mm');
    expect(link.simulator?.travelLimits.heightMm).toBe(210);
    await link.close();
  });

  it('jog → OA; reports the landed position on the read side; Set origin zeroes it; close resets', async () => {
    const link = new PlotterLink();
    const rx: string[] = [];
    link.subscribe((ev) => { if (ev.type === 'rx') rx.push(ev.text); });
    await link.open({ simulate: true, baud: 9600, format: 'hpgl' });
    const sim = link.simulator!;

    await link.send(buildJog('hpgl', 10, 20, 'mm'));
    // Motion takes time: read straight away and the head is still at the corner.
    expect(parsePositionReply('hpgl', await link.query('OA;'), 'mm')).toMatchObject({ x: 0, y: 0 });
    expect(await settles(link)).toBe(true);
    const landed = parsePositionReply('hpgl', await link.query('OA;'), 'mm');
    expect(landed).toMatchObject({ x: 10, y: 20, penDown: false });
    // …and the raw reply is in the ordinary rx stream, as a console would log it.
    expect(rx.some((text) => text.includes('400,800'))).toBe(true);

    await link.send(buildSetOrigin('hpgl'));
    expect(parsePositionReply('hpgl', await link.query('OA;'), 'mm')).toMatchObject({ x: 0, y: 0 });
    expect(sim.machinePosition).toEqual({ x: 10, y: 20 }); // the head did not move — only the origin did

    await link.close();
    expect(link.simulated).toBe(false);
    expect(link.simulator).toBeNull();
    expect(link.status).toBe('idle');
    // A handle kept across the close sees a machine back at power-on defaults.
    expect(sim.machinePosition).toEqual({ x: 0, y: 0 });
    expect(sim.progress).toEqual({ received: 0, executed: 0, secondsExecuted: 0, secondsTotal: 0 });
  });

  it('a real job drives the virtual machine to 100% and done, frame by frame', async () => {
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 115200, flowControl: 'hardware', format: 'hpgl', unit: 'mm' });
    const sim = link.simulator!;
    const job = buildPlotterOutput('hpgl', { ...defaultPlotterOptions, optimize: false }, squares(8));
    expect(job.length).toBeGreaterThan(LINK_CHUNK_BYTES); // really spans several chunks

    const progress: Array<[number, number]> = [];
    await link.send(job, { onProgress: (sent, total) => { progress.push([sent, total]); } });
    expect(progress.at(-1)).toEqual([job.length, job.length]);
    expect(progress.length).toBeGreaterThan(1);

    // Received in full, executed in real time: the machine is still moving…
    expect(sim.progress.received).toBeGreaterThan(8);
    expect(sim.busy).toBe(true);
    expect(sim.done).toBe(false);
    expect(rafSpy).toHaveBeenCalled(); // …and asked for animation frames to move by
    expect(sim.segments.some((s) => s.penDown)).toBe(false);

    // …until the simulated motion time has played.
    const total = sim.progress.secondsTotal;
    expect(total).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(Math.ceil(total * 1000) + 500);
    expect(sim.progress.executed).toBe(sim.progress.received);
    expect(sim.done).toBe(true);
    expect(sim.status).toBe('idle');
    expect(sim.segments.filter((s) => s.penDown)).toHaveLength(8);
    expect(sim.stats.cutLengthMm).toBeCloseTo(8 * 40, 5);
    expect(sim.machinePosition).toEqual({ x: 0, y: 0 }); // the job's park move landed
    await link.close();
  });

  it('pause holds the virtual head (and the sender between chunks); resume continues', async () => {
    const link = new PlotterLink();
    // 9600 baud without flow control paces the stream — the pause gate has chunks to park between.
    await link.open({ simulate: true, baud: 9600, flowControl: 'none', format: 'hpgl' });
    const sim = link.simulator!;
    const job = buildPlotterOutput('hpgl', { ...defaultPlotterOptions, optimize: false }, squares(8));
    const flows: boolean[] = [];
    link.subscribe((ev) => { if (ev.type === 'flow') flows.push(ev.paused); });

    const sending = link.send(job);
    await vi.advanceTimersByTimeAsync(0); // first chunk is out
    const firstChunk = sim.progress.received;
    link.pause();
    expect(flows).toEqual([true]);
    expect(sim.status).toBe('paused');
    await vi.advanceTimersByTimeAsync(3000);
    // Nothing moved on either side: no more statements, no motion played.
    expect(sim.progress.received).toBe(firstChunk);
    expect(sim.progress.secondsExecuted).toBe(0);
    expect(sim.done).toBe(false);

    link.resume();
    expect(flows).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(60_000);
    await sending;
    expect(sim.done).toBe(true);
    expect(sim.progress.executed).toBe(sim.progress.received);
    await link.close();
  });

  it('identifies the virtual machine and suggests no brand profile for it', async () => {
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 9600, format: 'hpgl' });
    const r = await identifyMachine(link, 'hpgl');
    expect(r.model).toContain('SIMULATED-PLOTTER');
    expect(r.page).not.toBeNull();
    expect(r.suggestedProfileId).toBeNull();
    await link.close();
  });
});

describe('port-probe lease — the automatic scan must never be mistaken for a connection', () => {
  /** A Web Serial stack that only records what the link asked of it. */
  function serialLog(events: string[]): void {
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        getPorts: async () => { events.push('getPorts'); return []; },
        requestPort: async () => { events.push('requestPort'); throw new Error('no chooser in this test'); },
      },
    });
  }
  afterEach(() => {
    Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined });
  });

  it('another link’s real open() waits for the probe — and tells it to hurry', async () => {
    const events: string[] = [];
    serialLog(events);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let aborts = 0;
    const probe = runWithPortProbe(() => { aborts++; }, async () => { await gate; events.push('probe done'); });

    const link = new PlotterLink();
    const opening = link.open({ portPath: 'COM3', baud: 9600 }).catch(() => events.push('open failed'));
    await vi.advanceTimersByTimeAsync(50);
    expect(aborts).toBe(1); // the waiting open asked the probe to wrap up
    expect(events).toEqual([]); // …and did not touch the ports before it did
    release();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([probe, opening]);
    // The open only reached the serial stack once the probe had let go.
    expect(events).toEqual(['probe done', 'getPorts', 'requestPort', 'open failed']);
    expect(link.status).toBe('error'); // honest: nothing is connected
  });

  it('the probe’s own link does not wait for itself', async () => {
    const events: string[] = [];
    serialLog(events);
    const probeLink = new PlotterLink().asPortProbe();
    const probe = runWithPortProbe(() => {}, async () => {
      await probeLink.open({ portPath: 'COM3', baud: 9600 }).catch(() => events.push('probe open failed'));
    });
    await vi.advanceTimersByTimeAsync(50);
    await probe;
    expect(events).toEqual(['getPorts', 'requestPort', 'probe open failed']);
  });

  it('a rehearsal open() needs no port and never waits', async () => {
    const events: string[] = [];
    serialLog(events);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let aborts = 0;
    const probe = runWithPortProbe(() => { aborts++; }, async () => { await gate; });
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 9600 });
    expect(link.simulated).toBe(true);
    expect(aborts).toBe(0);
    expect(events).toEqual([]);
    await link.close();
    release();
    await probe;
  });
});

describe('PlotterLink — rehearsal mode with a G-code machine', () => {
  it('the boot banner piles up in front of the first reply; parsers read the last report', async () => {
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 115200, flowControl: 'hardware', format: 'gcode', unit: 'mm' });
    const first = await link.query('$130');
    expect(first).toContain('Grbl'); // the banner was in the buffer, as on a real controller
    expect(first).toMatch(/\$130=720\.000/);

    // What a status poll harvests during a job: `ok` lines in front of the report.
    expect(parsePositionReply('gcode', 'ok\r\nok\r\n<Run|WPos:1.000,2.000,5.000|FS:0,0>\r\n'))
      .toEqual({ x: 1, y: 2, state: 'Run' });
    expect(cutStateFromReply('gcode', 'ok\r\n<Idle|WPos:1.000,2.000,5.000>')).toBe('idle');
    expect(cutStateFromReply('gcode', 'ok\r\nok')).toBe('unknown');
    // The LAST report is the current one.
    expect(parsePositionReply('gcode', '<Run|WPos:1,1,0>\r\nok\r\n<Idle|WPos:3,4,0>'))
      .toMatchObject({ x: 3, y: 4, state: 'Idle' });
    // An HP-GL position reply is untouched by the G-code change.
    expect(parsePositionReply('hpgl', '400,800,1\r\n', 'mm')).toEqual({ x: 10, y: 20, penDown: true });

    // The banner does not become part of the machine's build string.
    const id = await identifyMachine(link, 'gcode');
    expect(id.suggestedProfileId).toBe('grbl-generic');
    expect(id.model).toContain('[VER:');
    expect(id.model).not.toContain('for help');
    await link.close();
  });

  it('a grbl machine probed with OI; is recognised as G-code (isRejectReply path)', async () => {
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 115200, flowControl: 'hardware', format: 'gcode' });
    // The controller's boot banner is in front of the rejection — exactly what
    // a real grbl prints when the port opens and OI; is the first thing sent.
    const rejected = await link.query('OI;');
    expect(rejected).toContain("for help");
    expect(rejected).toContain('error:');
    expect(isRejectReply(rejected)).toBe(true);
    expect(isRejectReply('error:20')).toBe(true);
    expect(isRejectReply('GX-24')).toBe(false);
    const r = await identifyMachine(link, 'hpgl');
    expect(r.model).toContain('[VER:');
    expect(r.suggestedProfileId).toBe('grbl-generic');
    expect(r.summary).toContain('G-code');
    await link.close();
  });

  it('a G-code jog lands and reports through ? after settling', async () => {
    const link = new PlotterLink();
    await link.open({ simulate: true, baud: 115200, flowControl: 'hardware', format: 'gcode', unit: 'mm' });
    await link.send(buildJog('gcode', 10, 0, 'mm', 3000));
    expect(parsePositionReply('gcode', await link.query('?'))).toMatchObject({ state: 'Run', x: 0 });
    expect(await settles(link)).toBe(true);
    expect(parsePositionReply('gcode', await link.query('?'))).toMatchObject({ state: 'Idle', x: 10, y: 0 });
    await link.send(buildSetOrigin('gcode'));
    expect(parsePositionReply('gcode', await link.query('?'))).toMatchObject({ x: 0, y: 0 });
    await link.close();
  });
});
