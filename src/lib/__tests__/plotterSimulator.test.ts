import { describe, expect, it } from 'vitest';
import { PlotterSimulator } from '../plotterSimulator';
import {
  QUICK_COMMANDS, buildAbortSnippet, buildCornerTour, buildForceSpeed, buildJog, buildLaserTest, buildMoveTo,
  buildSetOrigin, decodeReply, isQueryCommand, parsePageReply, parsePositionReply, parseTravelReply,
} from '../hpglDebug';
import { parseGrblSettings, runAutoSetup, type AutoSetupLink } from '../plotterAutoSetup';
import { identifyMachine, suggestProfileFromModel } from '../plotterIdentify';
import { cutStateFromReply, runConnectionSelfTest } from '../plotterDiag';
import {
  buildForceTest, buildPlotterOutput, buildTestCut, defaultPlotterOptions, generateGCode, generateHPGL,
  type NativeSerialPort, type PlotterOptions,
} from '../plotter';
import type { CutPath } from '../../store/editor';

/**
 * Virtual plotter tests. The simulator's replies are always checked with the
 * project's OWN parsers (parsePositionReply / parsePageReply / decodeReply /
 * parseGrblSettings / identifyMachine) — if those cannot read a reply, the
 * simulator is wrong, not the test.
 */

const hpgl = (opts: Partial<ConstructorParameters<typeof PlotterSimulator>[0]> = {}) =>
  new PlotterSimulator({ format: 'hpgl', ...opts });
const gcode = (opts: Partial<ConstructorParameters<typeof PlotterSimulator>[0]> = {}) =>
  new PlotterSimulator({ format: 'gcode', ...opts });

/** write + flush: what a host that sends whole commands would see back. */
function feed(sim: PlotterSimulator, text: string): string[] {
  return [...sim.write(text), ...sim.flush()];
}

/** Feed the text in fixed-size chunks (as the serial link does) — must behave like one write(). */
function chunked(sim: PlotterSimulator, text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(...sim.write(text.slice(i, i + size)));
  out.push(...sim.flush());
  return out;
}

const OK = 'ok\r\n';

/** 50 × 30 mm rectangle, 10 mm in from the document corner (closed ring, 5 points). */
const RECT = { points: [[10, 10], [60, 10], [60, 40], [10, 40], [10, 10]] as Array<[number, number]>, closed: true };
const CUT_OPTS: PlotterOptions = { ...defaultPlotterOptions, optimize: false, dialect: 'bare' };
/** The same rectangle as a store cut path — what the plotter dialog ships. */
const RECT_PATH: CutPath = { id: 'rect', points: RECT.points, closed: true, kind: 'outline' };
/** The real job text: buildPlotterOutput applies the unit / origin mapping the dialog sends. */
const job = (format: 'hpgl' | 'gcode', opts: PlotterOptions = CUT_OPTS): string => buildPlotterOutput(format, opts, [RECT_PATH]);

/** Link stub that routes every query / send through a simulator. */
function fakeLink(sim: PlotterSimulator): AutoSetupLink {
  const link = {
    status: 'idle' as 'idle' | 'connected',
    baud: 0,
    async open(o: { baud: number }) { link.status = 'connected'; link.baud = o.baud; },
    async close() { link.status = 'idle'; },
    async query(text: string) { return feed(sim, text).join(''); },
    async send(text: string) { feed(sim, text); },
  };
  return link as unknown as AutoSetupLink;
}

/** Fake link whose auto-detect ignores grbl "error:" answers to the HP-GL probe. */
function errorAwareLink(sim: PlotterSimulator): AutoSetupLink {
  const link = fakeLink(sim);
  const inner = (link as unknown as { query: (t: string) => Promise<string> }).query.bind(link);
  (link as unknown as { query: (t: string) => Promise<string> }).query = async (text: string) => {
    const reply = await inner(text);
    return text.trim() === 'OI;' && /^error/i.test(reply.trim()) ? '' : reply;
  };
  return link;
}

describe('HP-GL position tracking', () => {
  it('tracks PU / PA / PD moves in plotter units and builds cut runs', () => {
    const sim = hpgl();
    expect(feed(sim, 'PU;PA400,800;PD400,1200,800,1200,800,800;PU0,0;')).toEqual([]);
    const cut = sim.segments.filter(s => s.penDown);
    expect(cut).toHaveLength(1);
    expect(cut[0].points).toEqual([[10, 20], [10, 30], [20, 30], [20, 20]]);
    expect(sim.stats.cutLengthMm).toBeCloseTo(30, 9);
    expect(sim.stats.penDownMoves).toBe(3);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
  });

  it('treats PA as absolute and PR as relative', () => {
    const sim = hpgl();
    feed(sim, 'PR400,200;PR400,200;');
    expect(sim.position).toMatchObject({ x: 20, y: 10 });
    feed(sim, 'PA400,200;');
    expect(sim.position).toMatchObject({ x: 10, y: 5 });
  });

  it('reads PU / PD coordinates in the current plotting mode (HP-GL semantics)', () => {
    const sim = hpgl();
    feed(sim, 'PR;PU400,200;');
    expect(sim.position).toMatchObject({ x: 10, y: 5 });
    feed(sim, 'PU400,200;');
    expect(sim.position).toMatchObject({ x: 20, y: 10 });
    feed(sim, 'PA;PU400,200;');
    expect(sim.position).toMatchObject({ x: 10, y: 5 });
  });

  it('keeps a blade tap (PD;PU;) as a single-point cut', () => {
    const sim = hpgl();
    feed(sim, 'PU400,200;PD;PU;');
    expect(sim.segments.filter(s => s.penDown)).toEqual([{ points: [[10, 5]], penDown: true }]);
    expect(sim.position.penDown).toBe(false);
    expect(sim.stats.cutLengthMm).toBe(0);
  });

  it('stores FS / VS and SP values', () => {
    const sim = hpgl();
    feed(sim, 'FS30;VS20;SP1;');
    expect([sim.force, sim.speed, sim.pen]).toEqual([30, 20, 1]);
    feed(sim, 'IN;');
    expect([sim.force, sim.speed, sim.pen]).toEqual([0, 0, 0]);
  });

  it('is unaffected by the inch setting — plotter units stay 40 per mm', () => {
    const sim = hpgl({ unit: 'in' });
    const reply = feed(sim, 'PU1016,0;OA;')[0];
    expect(parsePositionReply('hpgl', reply, 'in')).toEqual({ x: 1, y: 0, penDown: false });
    expect(sim.machinePosition.x).toBeCloseTo(25.4, 9);
  });
});

describe('G-code position tracking', () => {
  const job = 'G21\nG90\nG0 Z5\nG0 X10 Y20\nG1 Z-1 F600\nG1 X20 Y20\nG0 Z5\n';

  it('tracks G0 / G1 and the Z pen model', () => {
    const sim = gcode();
    const replies = feed(sim, job);
    expect(replies).toEqual(Array(7).fill(OK));
    expect(sim.position).toEqual({ x: 20, y: 20, penDown: false });
    expect(sim.segments).toEqual([
      { points: [[0, 0], [10, 20]], penDown: false },
      { points: [[10, 20], [20, 20]], penDown: true },
    ]);
    expect(sim.stats.cutLengthMm).toBeCloseTo(10, 9);
    expect(sim.z).toBe(5);
  });

  it('honours G90 / G91 and G21 / G20', () => {
    const sim = gcode();
    feed(sim, 'G91\nG0 X10 Y0\nG0 X10 Y5\n');
    expect(sim.position).toMatchObject({ x: 20, y: 5 });
    feed(sim, 'G90 G20\nG0 X1 Y2\n');
    expect(sim.position).toMatchObject({ x: 25.4, y: 50.8 });
    feed(sim, 'G21\nG0 X10 Y0\n');
    expect(sim.position).toMatchObject({ x: 10, y: 0 });
    const inches = gcode({ unit: 'in' });
    feed(inches, 'G0 X1 Y1\n');
    expect(inches.position).toMatchObject({ x: 25.4, y: 25.4 });
  });

  it('drops the blade only at or below the pen-down Z', () => {
    const sim = gcode();
    feed(sim, 'G0 Z-0.5\n');
    expect(sim.position.penDown).toBe(false);
    feed(sim, 'G0 Z-1\n');
    expect(sim.position.penDown).toBe(true);
    feed(sim, 'G0 Z5\n');
    expect(sim.position.penDown).toBe(false);
    const custom = gcode({ penDownZ: 2, penUpZ: 8 });
    expect(custom.z).toBe(8);
    feed(custom, 'G0 Z1\n');
    expect(custom.position.penDown).toBe(true);
  });

  it('treats G1 as cutting while M3 is on, even with Z up; G0 never marks', () => {
    const sim = gcode();
    const replies = feed(sim, 'M3 S800\nG1 X10 Y0 F600\nG0 X20 Y0\nM5\nG1 X30 Y0\n');
    expect(replies).toEqual(Array(5).fill(OK));
    // Cut run, then one travel run that keeps growing through the rapid and
    // the feed move made with the spindle off.
    expect(sim.segments.map(s => s.penDown)).toEqual([true, false]);
    expect(sim.segments[0].points).toEqual([[0, 0], [10, 0]]);
    expect(sim.segments[1].points).toEqual([[10, 0], [20, 0], [30, 0]]);
    expect([sim.force, sim.spindleOn]).toEqual([800, false]);
    expect(sim.stats.cutLengthMm).toBeCloseTo(10, 9);
  });

  it('rejects a feed move with no feed rate and does not move', () => {
    const sim = gcode();
    expect(feed(sim, 'G1 X10 Y0\n')).toEqual(['error:22\r\n']);
    expect(sim.position).toMatchObject({ x: 0, y: 0 });
  });

  it('answers grbl error codes for malformed / unsupported blocks', () => {
    const sim = gcode();
    expect(feed(sim, 'G0 X10 Y\n')).toEqual(['error:2\r\n']);
    expect(feed(sim, 'G0 10\n')).toEqual(['error:1\r\n']);
    expect(feed(sim, 'G99\n')).toEqual(['error:20\r\n']);
    expect(feed(sim, '$foo\n')).toEqual(['error:3\r\n']);
    expect(feed(sim, 'G0 G1 X10\n')).toEqual(['error:21\r\n']);
  });
});

describe('commands split across write() chunks', () => {
  it('buffers a half HP-GL statement until its terminator', () => {
    const sim = hpgl();
    expect(sim.write('PU40')).toEqual([]);
    expect(sim.position).toMatchObject({ x: 0, y: 0 });
    sim.write('0,800;');
    expect(sim.position).toMatchObject({ x: 10, y: 20 });
    expect(sim.write('O')).toEqual([]);
    expect(sim.write('A;')).toEqual(['400,800,0\r\n']);
  });

  it('buffers a half G-code line until its line feed', () => {
    const sim = gcode();
    expect(sim.write('G0 X1')).toEqual([]);
    expect(sim.position.x).toBe(0);
    expect(sim.write('0 Y20\n')).toEqual([OK]);
    expect(sim.position).toMatchObject({ x: 10, y: 20 });
  });

  it('runs a generated HP-GL job identically in 7-character chunks', () => {
    const code = generateHPGL([RECT], CUT_OPTS);
    const whole = hpgl();
    feed(whole, code);
    const pieces = hpgl();
    const replies = chunked(pieces, code, 7);
    expect(replies).toEqual([]);
    expect(pieces.segments).toEqual(whole.segments);
    expect(pieces.stats).toEqual(whole.stats);
    expect(pieces.position).toEqual(whole.position);
  });

  it('runs a generated G-code job identically in 5-character chunks (words and CRLF cut)', () => {
    const code = generateGCode([RECT], CUT_OPTS).replace(/\n/g, '\r\n');
    const whole = gcode();
    const expected = chunked(whole, code, code.length);
    const pieces = gcode();
    const replies = chunked(pieces, code, 5);
    expect(replies).toEqual(expected);
    expect(pieces.segments).toEqual(whole.segments);
    expect(pieces.stats).toEqual(whole.stats);
    // 12 non-comment lines answer "ok" ("G21 ; mm" is a command with a
    // trailing comment, not a comment line); comment-only lines stay silent.
    expect(expected).toEqual(Array(12).fill(OK));
  });

  it('closes a stand-alone G-code command on flush() / endOfMessage', () => {
    const sim = gcode();
    expect(sim.write('G92 X0 Y0')).toEqual([]);
    expect(sim.flush()).toEqual([OK]);
    expect(sim.write('G0 X10 Y10', true)).toEqual([OK]);
    expect(sim.position).toMatchObject({ x: 10, y: 10 });
  });

  it('runs a "$" command typed after a job and closes the block the job left open', () => {
    // generateGCode ends with "M30 ; end" and no "\n". Like a real grbl, that
    // block waits for a line feed; a system command still starts a new one.
    const sim = gcode();
    sim.write('G0 X10 Y10\nM30 ; end');
    expect(sim.write('$H')).toEqual([OK, OK]);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
  });

  it('endOfMessage closes the job\'s last line so the next typed command is not swallowed', () => {
    const sim = gcode();
    expect(sim.write('G0 X10 Y10\nM30 ; end', true)).toEqual([OK, OK]);
    expect(sim.write('G92 X0 Y0', true)).toEqual([OK]);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(sim.machinePosition).toEqual({ x: 10, y: 10 });
    // Without that signal the next line-based command shares the open block —
    // the "M30 ; end" comment eats it, exactly as on a real grbl.
    const naive = gcode();
    naive.write('G0 X10 Y10\nM30 ; end');
    expect(naive.write('G92 X0 Y0')).toEqual([]);
    expect(naive.write('\n')).toEqual([OK]);
    expect(naive.position).toMatchObject({ x: 10, y: 10 });
  });

  it('flush() closes an unterminated HP-GL statement', () => {
    const sim = hpgl();
    expect(sim.write('PU400,800')).toEqual([]);
    expect(sim.flush()).toEqual([]);
    expect(sim.position).toMatchObject({ x: 10, y: 20 });
  });
});

describe('reply formats read by the project parsers', () => {
  it('OA; carries position and pen state for parsePositionReply / decodeReply', () => {
    const sim = hpgl();
    const up = feed(sim, 'PU;PR400,200;OA;')[0];
    expect(parsePositionReply('hpgl', up)).toEqual({ x: 10, y: 5, penDown: false });
    expect(decodeReply('hpgl', 'OA;', up)).toBe('Position: (10.00, 5.00) mm · pen up');
    const down = feed(sim, 'PD;OA;')[0];
    expect(parsePositionReply('hpgl', down)).toEqual({ x: 10, y: 5, penDown: true });
    expect(decodeReply('hpgl', 'OA;', down)).toBe('Position: (10.00, 5.00) mm · pen DOWN');
  });

  it('? carries a grbl status report for parsePositionReply / decodeReply', () => {
    const sim = gcode();
    feed(sim, 'G0 X10 Y20\n');
    const reply = sim.write('?')[0];
    expect(parsePositionReply('gcode', reply)).toEqual({ x: 10, y: 20, state: 'Idle' });
    expect(decodeReply('gcode', '?', reply)).toBe('State: Idle');
    expect(cutStateFromReply('gcode', reply)).toBe('idle');
  });

  it('OH; reports the hard-clip limits in the current frame for parsePageReply', () => {
    const sim = hpgl();
    expect(parsePageReply(feed(sim, 'OH;')[0])).toEqual({ x0: 0, y0: 0, x1: 720, y1: 210 });
    feed(sim, 'PU4000,2000;IP;');
    const shifted = feed(sim, 'OH;')[0];
    expect(parsePageReply(shifted)).toEqual({ x0: -100, y0: -50, x1: 620, y1: 160 });
    expect(decodeReply('hpgl', 'OH;', shifted)).toBe('Page: (-100.00, -50.00) to (620.00, 160.00) mm — 720 × 210 mm');
  });

  it('$$ answers a settings table parseGrblSettings can read', () => {
    const sim = gcode();
    const settings = Object.fromEntries(parseGrblSettings(feed(sim, '$$')[0]).map(s => [s.key, s.value]));
    expect(settings).toMatchObject({
      $32: '0', $130: '720.000', $131: '210.000', $30: '1000.000', $100: '80.000', $101: '80.000',
    });
    expect(Object.keys(settings).length).toBeGreaterThan(20);
    expect(decodeReply('gcode', '$$', feed(gcode(), '$$')[0])).toContain('settings');
  });

  it('$130 / $131 / $32 answer one line each and feed parseTravelReply', () => {
    const sim = gcode({ laserMode: true });
    expect(feed(sim, '$130')).toEqual(['$130=720.000\r\n' + OK]);
    expect(feed(sim, '$131')).toEqual(['$131=210.000\r\n' + OK]);
    expect(feed(sim, '$32')).toEqual(['$32=1\r\n' + OK]);
    expect(parseTravelReply(`${feed(gcode(), '$130')[0]}\n${feed(gcode(), '$131')[0]}`)).toEqual({ x: 720, y: 210 });
  });

  it('$I reports a build string identifyMachine reads as grbl', async () => {
    const sim = gcode({ grblBuild: 'Bench plotter' });
    const reply = feed(sim, '$I')[0];
    expect(reply).toContain('[VER:');
    expect(reply).toContain('Bench plotter');
    expect(reply.endsWith(OK)).toBe(true);
    const id = await identifyMachine(fakeLink(gcode()), 'gcode');
    expect(id.suggestedProfileId).toBe('grbl-generic');
    expect(id.model).toContain('[VER:');
    expect(id.summary).toContain('grbl firmware');
  });

  it('OI; answers a model string that identifyMachine treats as an unknown machine, not an error', async () => {
    const sim = hpgl();
    const reply = feed(sim, 'OI;')[0];
    expect(reply).toMatch(/^SIMULATED-PLOTTER,[A-Z]+,\d+x\d+mm\r\n$/);
    const id = await identifyMachine(fakeLink(sim), 'hpgl');
    expect(id.model.startsWith('SIMULATED-PLOTTER')).toBe(true);
    expect(suggestProfileFromModel(id.model)).toBeNull();
    expect(id.suggestedProfileId).toBeNull();
    expect(id.error).toBe('0');
    expect(id.page).toBe('0,0,28800,8400');
    expect(id.summary).toContain('model "SIMULATED-PLOTTER');
    // A caller can impersonate a real brand to rehearse the profile suggestion.
    const roland = await identifyMachine(fakeLink(hpgl({ identify: 'GX-24' })), 'hpgl');
    expect(roland.suggestedProfileId).toBe('roland-camm1');
  });

  it('$# and $G report parameters and parser state', () => {
    const sim = gcode();
    feed(sim, 'G0 X30 Y40\nG92 X10 Y20\n');
    expect(sim.position).toMatchObject({ x: 10, y: 20 });
    expect(feed(sim, '$#')[0]).toContain('[G92:20.000,20.000,0.000]');
    feed(sim, 'G20 G91 F600 M3 S700\n');
    expect(feed(sim, '$G')[0]).toBe('[GC:G0 G54 G17 G20 G91 G94 M0 M3 M9 T0 S700 F600]\r\n' + OK);
    expect(feed(sim, 'G92.1\n')).toEqual([OK]);
    expect(sim.position).toMatchObject({ x: 30, y: 40 });
  });

  it('OE; / OS; decode through decodeReply', () => {
    const sim = hpgl();
    expect(decodeReply('hpgl', 'OE;', feed(sim, 'OE;')[0])).toBe('Error code 0: No error');
    // Fresh machine: "powered on / just initialised" until it first moves.
    expect(decodeReply('hpgl', 'OS;', feed(sim, 'OS;')[0])).toBe('Machine status 0: Powered on / just initialised');
    feed(sim, 'PU400,0;');
    expect(decodeReply('hpgl', 'OS;', feed(sim, 'OS;')[0])).toBe('Machine status 1: Ready');
  });

  it('every quick command gets exactly the reply the console expects', () => {
    for (const cmd of QUICK_COMMANDS) {
      const format = cmd.formats?.includes('gcode') ? 'gcode' : 'hpgl';
      const sim = format === 'gcode' ? gcode() : hpgl();
      const text = cmd.id === 'force-speed' ? buildForceSpeed(30, 20) : cmd.command;
      const replies = feed(sim, text);
      if (cmd.expectsReply || isQueryCommand(format, text)) {
        expect(replies.length, cmd.id).toBeGreaterThan(0);
        expect(decodeReply(format, text, replies.join('')), cmd.id).not.toBe('(no reply)');
      } else if (format === 'hpgl') {
        expect(replies, cmd.id).toEqual([]);
      } else {
        for (const r of replies) expect(decodeReply(format, text, r), cmd.id).not.toBe('(no reply)');
      }
    }
  });
});

describe('real generator output', () => {
  it('cuts a closed rectangle from generateHPGL: four edges, ends where it started', () => {
    const sim = hpgl();
    chunked(sim, job('hpgl'), 16);
    const cut = sim.segments.filter(s => s.penDown);
    expect(cut).toHaveLength(1);
    // originBottomLeft: document y maps to 210 − y.
    expect(cut[0].points).toEqual([[10, 200], [60, 200], [60, 170], [10, 170], [10, 200]]);
    const [start] = cut[0].points;
    expect(cut[0].points.at(-1)).toEqual(start);
    expect(sim.stats.cutLengthMm).toBeCloseTo(160, 6);
    expect(sim.stats.penDownMoves).toBe(4);
    expect(sim.segments.map(s => s.penDown)).toEqual([false, true, false]);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(sim.status).toBe('idle');
  });

  it('cuts the same rectangle from generateGCode', () => {
    const sim = gcode();
    chunked(sim, job('gcode'), 11);
    const cut = sim.segments.filter(s => s.penDown);
    expect(cut).toHaveLength(1);
    expect(cut[0].points).toEqual([[10, 200], [60, 200], [60, 170], [10, 170], [10, 200]]);
    expect(Math.abs(sim.stats.cutLengthMm - 160)).toBeLessThan(0.5);
    expect(sim.segments.map(s => s.penDown)).toEqual([false, true, false]);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
  });

  it('top-left origin output stays inside the same material', () => {
    const sim = gcode();
    feed(sim, job('gcode', { ...CUT_OPTS, originBottomLeft: false }));
    expect(sim.segments.filter(s => s.penDown)[0].points).toEqual(RECT.points);
    expect(Math.abs(sim.stats.cutLengthMm - 160)).toBeLessThan(0.5);
  });

  it('accepts the Roland header / eject and the Graphtec ARMS block without raising an error', () => {
    const roland = hpgl();
    feed(roland, job('hpgl', { ...CUT_OPTS, dialect: 'roland-camm' }));
    expect(roland.status).toBe('idle');
    expect(feed(roland, 'OE;')[0]).toBe('0\r\n');
    expect([roland.force, roland.speed]).toEqual([30, 20]);
    expect(Math.abs(roland.stats.cutLengthMm - 160)).toBeLessThan(0.5);
    // !PG parks the head on the material corner after the job.
    expect(roland.machinePosition).toEqual({ x: 0, y: 0 });
    expect(roland.position.penDown).toBe(false);

    const graphtec = hpgl();
    feed(graphtec, job('hpgl', { ...CUT_OPTS, dialect: 'graphtec-fc', arms: { armMm: 20, type: 2, rectW: 200, rectH: 150 } }));
    expect(graphtec.status).toBe('idle');
    expect(feed(graphtec, 'OE;')[0]).toBe('0\r\n');
    expect(Math.abs(graphtec.stats.cutLengthMm - 160)).toBeLessThan(0.5);
  });

  it('vendor statements are harmless; only a truly unknown mnemonic raises OE; = 1', () => {
    const sim = hpgl();
    feed(sim, 'TB25;11280,7920;CT1;!PG;&1,2,3;@@;^FG;ES;');
    expect(sim.status).toBe('idle');
    feed(sim, 'XX12;');
    expect(feed(sim, 'OE;')[0]).toBe('1\r\n');
    expect(feed(sim, 'OE;')[0]).toBe('0\r\n');
  });

  it('answers a lone Roland "!" with three status digits + CR + ETX', () => {
    const sim = hpgl();
    expect(sim.write('!')).toEqual(['111\r\x03']);
    feed(sim, 'PD;');
    expect(sim.write('!\r')).toEqual(['011\r\x03']);
    expect(decodeReply('hpgl', '!', '011\r\x03')).toBe('011');
  });

  it('runs buildJog / buildMoveTo / buildSetOrigin in mm and inches on both formats', () => {
    const sim = hpgl();
    feed(sim, buildJog('hpgl', 10, 5, 'mm'));
    expect(sim.position).toMatchObject({ x: 10, y: 5, penDown: false });
    feed(sim, buildJog('hpgl', 1, 0, 'in'));
    expect(sim.position.x).toBeCloseTo(35.4, 9);
    feed(sim, buildSetOrigin('hpgl'));
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(sim.machinePosition.x).toBeCloseTo(35.4, 9);
    expect(sim.machinePosition.y).toBeCloseTo(5, 9);
    feed(sim, buildMoveTo('hpgl', 20, 30, 'mm'));
    // buildJog leaves an HP-GL machine in PR mode, so the absolute-looking
    // PU x,y of buildMoveTo is relative — what a real plotter would do too.
    expect(sim.position).toMatchObject({ x: 20, y: 30 });
    expect(sim.machinePosition.x).toBeCloseTo(55.4, 9);
    expect(sim.machinePosition.y).toBeCloseTo(35, 9);

    const g = gcode();
    feed(g, buildJog('gcode', 10, 5, 'mm', 1500));
    expect(g.position).toMatchObject({ x: 10, y: 5 });
    feed(g, buildJog('gcode', 1, 0, 'in', 1500));
    expect(g.position.x).toBeCloseTo(35.4, 9);
    feed(g, buildMoveTo('gcode', 2, 3, 'in'));
    expect(g.position.x).toBeCloseTo(50.8, 9);
    expect(g.position.y).toBeCloseTo(76.2, 9);
    // A target past the paper height is refused, exactly like a real jog.
    expect(feed(g, buildMoveTo('gcode', 20, 30, 'in'))).toEqual(['error:15\r\n']);
    expect(g.position.x).toBeCloseTo(50.8, 9);
    feed(g, buildMoveTo('gcode', 20, 30, 'mm'));
    expect(g.position).toMatchObject({ x: 20, y: 30 });
    feed(g, buildSetOrigin('gcode'));
    expect(g.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(g.machinePosition).toEqual({ x: 20, y: 30 });
    // A jog right after Set origin is relative to the new origin.
    feed(g, buildJog('gcode', 5, 0, 'mm', 1500));
    expect(g.position).toMatchObject({ x: 5, y: 0 });
  });

  it('runs the corner-location tour on both formats: travels, one centre tap, back to origin', () => {
    for (const sim of [hpgl(), gcode()]) {
      const replies = feed(sim, buildCornerTour(sim.format));
      if (sim.format === 'gcode') expect(replies).toEqual(Array(11).fill(OK));
      else expect(replies).toEqual([]);
      const cuts = sim.segments.filter(s => s.penDown);
      expect(cuts).toHaveLength(1);
      expect(cuts[0].points).toEqual([[50, 50]]);
      expect(sim.position).toMatchObject({ x: 0, y: 0 });
      expect(sim.stats.travelLengthMm).toBeGreaterThan(300);
      expect(sim.stats.cutLengthMm).toBe(0);
    }
  });

  it('runs the test cut, force test and laser strip inside the material', () => {
    const sim = hpgl();
    feed(sim, buildTestCut('hpgl', CUT_OPTS));
    expect(sim.segments.filter(s => s.penDown)).toHaveLength(2);
    // 20 mm square (80) + isosceles triangle with base 10 and height 10.
    expect(sim.stats.cutLengthMm).toBeCloseTo(80 + 10 + 2 * Math.hypot(5, 10), 6);

    const force = hpgl();
    feed(force, buildForceTest('hpgl', CUT_OPTS, 30, 10, 5));
    expect(force.segments.filter(s => s.penDown)).toHaveLength(5);
    expect(force.force).toBe(30);
    expect(force.status).toBe('idle');

    const laser = gcode();
    const replies = feed(laser, buildLaserTest(10, { maxPower: 1000, count: 2 }));
    expect(replies.every(r => r === OK)).toBe(true);
    expect(laser.segments.filter(s => s.penDown)).toHaveLength(2);
    expect(laser.stats.cutLengthMm).toBeCloseTo(20, 6);
    expect(laser.force).toBe(100);
    expect(laser.position).toMatchObject({ x: 0, y: 0 });
  });

  it('buildAbortSnippet lifts the blade / holds the feed', () => {
    const sim = hpgl();
    feed(sim, 'PD;');
    expect(sim.position.penDown).toBe(true);
    feed(sim, buildAbortSnippet('hpgl'));
    expect(sim.position.penDown).toBe(false);
    const g = gcode();
    g.write(buildAbortSnippet('gcode'));
    expect(g.status).toBe('paused');
  });
});

describe('out of travel', () => {
  it('HP-GL clips an X overrun at the limit, alarms and answers OE; = 2', () => {
    const sim = hpgl();
    feed(sim, 'PU0,0;PD30000,0;'); // 750 mm on a 720 mm machine
    expect(sim.position).toEqual({ x: 720, y: 0, penDown: true });
    expect(sim.status).toBe('alarm');
    expect(sim.segments.filter(s => s.penDown)[0].points.at(-1)).toEqual([720, 0]);
    expect(sim.stats.cutLengthMm).toBeCloseTo(720, 6);
    expect(sim.alarmReason).toContain('travel limit');
    // Reading the error clears it; the next OE; is clean.
    expect(feed(sim, 'OE;')[0]).toBe('2\r\n');
    expect(sim.status).toBe('idle');
    expect(feed(sim, 'OE;')[0]).toBe('0\r\n');
  });

  it('HP-GL clips a move below the material and reports coordinates relative to the operator origin', () => {
    const sim = hpgl();
    feed(sim, 'PU0,0;PR0,-400;');
    expect(sim.machinePosition).toEqual({ x: 0, y: 0 });
    expect(sim.status).toBe('alarm');
    expect(feed(sim, 'OE;')[0]).toBe('2\r\n');
    // Origin re-based 100 mm up the material: the head stopped at the
    // material edge again, which now reads −100 in the operator's frame.
    feed(sim, 'PU4000,8000;PR0,-4000;IP;PR0,-8000;');
    expect(sim.machinePosition).toEqual({ x: 100, y: 0 });
    expect(sim.position).toEqual({ x: 0, y: -100, penDown: false });
    expect(sim.status).toBe('alarm');
    expect(feed(sim, 'OA;')[0]).toBe('0,-4000,0\r\n');
  });

  it('grbl answers error:15, reports <Alarm|…>, locks motion until $X', () => {
    const sim = gcode();
    expect(feed(sim, 'G0 X800\n')).toEqual(['error:15\r\n']);
    expect(sim.machinePosition).toEqual({ x: 720, y: 0 });
    expect(sim.status).toBe('alarm');
    const alarm = sim.write('?')[0];
    expect(parsePositionReply('gcode', alarm)).toEqual({ x: 720, y: 0, state: 'Alarm' });
    expect(decodeReply('gcode', '?', alarm)).toBe('State: Alarm');
    expect(feed(sim, 'G0 X10\n')).toEqual(['error:9\r\n']);
    expect(feed(sim, '$X')).toEqual(['[MSG:Caution: Unlocked]\r\n' + OK]);
    expect(parsePositionReply('gcode', sim.write('?')[0])?.state).toBe('Idle');
    expect(feed(sim, 'G0 X10\n')).toEqual([OK]);
    expect(sim.position.x).toBe(10);
  });

  it('refuses a jog past the travel without moving or alarming (grbl soft-limit jog rule)', () => {
    const sim = gcode();
    expect(feed(sim, buildMoveTo('gcode', 800, 0, 'mm'))).toEqual(['error:15\r\n']);
    expect(sim.machinePosition).toEqual({ x: 0, y: 0 });
    expect(sim.status).toBe('idle');
  });

  it('uses the configured plot width / paper height', () => {
    const sim = gcode({ plotWidthMm: 300, paperHeightMm: 150 });
    expect(sim.travelLimits).toEqual({ widthMm: 300, heightMm: 150 });
    feed(sim, 'G0 X290 Y140\n');
    expect(sim.status).toBe('idle');
    expect(feed(sim, 'G0 Y160\n')).toEqual(['error:15\r\n']);
    expect(parsePageReply(feed(hpgl({ plotWidthMm: 300, paperHeightMm: 150 }), 'OH;')[0])).toEqual({ x0: 0, y0: 0, x1: 300, y1: 150 });
  });
});

describe('reset behaviour', () => {
  it('IN; restores HP-GL defaults (mode, pen, force / speed, origin, error)', () => {
    const sim = hpgl();
    feed(sim, 'PU400,200;IP;FS30;VS20;SP1;PR;PD;');
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: true });
    feed(sim, 'IN;');
    expect([sim.isRelative, sim.pen, sim.force, sim.speed]).toEqual([false, 0, 0, 0]);
    expect(sim.position).toEqual({ x: 10, y: 5, penDown: false });
    expect(sim.status).toBe('idle');
    feed(sim, 'PU800,0;');
    expect(sim.position).toMatchObject({ x: 20, y: 0 });
  });

  it('can keep the operator origin across IN; (inResetsOrigin: false)', () => {
    const sim = hpgl({ inResetsOrigin: false });
    feed(sim, 'PU400,200;IP;IN;');
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(sim.machinePosition).toEqual({ x: 10, y: 5 });
  });

  it('$H and G28 bring a grbl machine home with the blade up', () => {
    const sim = gcode();
    feed(sim, 'G0 Z-1\nG0 X20 Y30\n');
    expect(sim.position.penDown).toBe(true);
    expect(feed(sim, '$H')).toEqual([OK]);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(sim.z).toBe(5);
    feed(sim, 'G0 X20 Y30\nG28\n');
    expect(sim.position).toMatchObject({ x: 0, y: 0 });
    feed(sim, 'G0 X20 Y30\nG28.1\nG0 X5 Y5\nG28\n');
    expect(sim.position).toMatchObject({ x: 20, y: 30 });
  });

  it('reset() returns everything to power-on state', () => {
    for (const sim of [hpgl(), gcode()]) {
      feed(sim, sim.format === 'hpgl' ? 'PD400,400;VS20;' : 'G0 X10 Y10\nG1 Z-1 F300\nM3 S500\n');
      sim.reset();
      expect(sim.segments).toEqual([]);
      expect(sim.stats).toEqual({ cutLengthMm: 0, travelLengthMm: 0, penDownMoves: 0 });
      expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
      expect([sim.force, sim.speed, sim.status]).toEqual([0, 0, 'idle']);
      expect(sim.progress).toEqual({ received: 0, executed: 0, secondsExecuted: 0, secondsTotal: 0 });
    }
  });
});

describe('grbl streaming protocol', () => {
  it('answers "ok" per executed line and stays silent on comments / blank lines', () => {
    const sim = gcode();
    expect(feed(sim, '; title\n\n   \nG21\n(comment) G90\n')).toEqual([OK, OK]);
    expect(sim.progress.received).toBe(2);
  });

  it('feed hold pauses at the current point and cycle start runs what was queued', () => {
    const sim = gcode();
    feed(sim, 'G0 X10 Y0\n');
    expect(sim.write('!')).toEqual([]);
    expect(sim.status).toBe('paused');
    const held = sim.write('?')[0];
    expect(parsePositionReply('gcode', held)).toEqual({ x: 10, y: 0, state: 'Hold' });
    expect(decodeReply('gcode', '?', held)).toBe('State: Hold');
    expect(feed(sim, 'G0 X20 Y0\n')).toEqual([OK]);
    expect(sim.position.x).toBe(10);
    expect(sim.progress).toMatchObject({ received: 2, executed: 1 });
    expect(feed(sim, '$H')).toEqual(['error:8\r\n']);
    expect(sim.write('~')).toEqual([]);
    expect(sim.status).toBe('idle');
    expect(sim.position.x).toBe(20);
    // The refused $H counts as a closed line too.
    expect(sim.progress).toMatchObject({ received: 3, executed: 3 });
    // Resume without a hold is ignored.
    expect(sim.write('~')).toEqual([]);
    expect(sim.status).toBe('idle');
  });

  it('M0 / M1 pause until cycle start; M2 / M30 stop the spindle', () => {
    const sim = gcode();
    expect(feed(sim, 'M3 S700\nG0 X5 Y0\nM0\n')).toEqual(Array(3).fill(OK));
    expect(parsePositionReply('gcode', sim.write('?')[0])).toEqual({ x: 5, y: 0, state: 'Hold' });
    expect(sim.status).toBe('paused');
    feed(sim, 'G0 X10 Y0\n');
    expect(sim.position.x).toBe(5);
    sim.write('~');
    expect(sim.position.x).toBe(10);
    expect(feed(sim, 'M30\n')).toEqual([OK]);
    expect(sim.spindleOn).toBe(false);
    expect(sim.force).toBe(700);
  });

  it('ctrl-X is a soft reset that scraps queued motion and the G92 offset', () => {
    const sim = gcode({ realtime: true });
    feed(sim, 'G0 X10 Y0\nG92 X0 Y0\nG0 X100 Y0\n');
    expect(sim.status).toBe('running');
    expect(sim.write('\x18')).toEqual([]);
    expect(sim.status).toBe('idle');
    expect(sim.done).toBe(true);
    expect(sim.progress).toMatchObject({ received: 3, executed: 3 });
    expect(sim.progress.secondsTotal).toBe(0);
    const x0 = sim.machinePosition.x;
    feed(sim, 'G91 G0 X5\n');
    sim.advance(1);
    expect(sim.machinePosition.x).toBeCloseTo(x0 + 5, 9);
    // The G92 offset died with the reset: reported and material frames agree again.
    expect(sim.position.x).toBeCloseTo(x0 + 5, 9);
  });

  it('flips laser mode through $32 and clamps S to $30', () => {
    const sim = gcode();
    expect(sim.laserMode).toBe(false);
    expect(feed(sim, '$32=1\n')).toEqual([OK]);
    expect(sim.laserMode).toBe(true);
    expect(feed(sim, '$30=500\nM3 S900\n')).toEqual([OK, OK]);
    expect(sim.force).toBe(500);
    expect(gcode({ laserMode: true }).laserMode).toBe(true);
  });
});

describe('realtime mode — execution progress and completion', () => {
  it('walks a G-code job through running → idle as time is pumped', () => {
    const sim = gcode({ realtime: true });
    const replies = sim.write('G21\nG90\nG0 Z5 F3000\nG0 X100 Y0 F3000\nG1 Z-1 F600\nG1 X200 Y0\nG0 Z5\nG0 X0 Y0\n');
    expect(replies).toEqual(Array(8).fill(OK));
    expect(sim.busy).toBe(true);
    expect(sim.done).toBe(false);
    // Everything is received; only the two motion-less setup lines count as executed.
    expect(sim.progress).toMatchObject({ received: 8, executed: 2 });
    expect(sim.progress.secondsTotal).toBeCloseTo(0.33333 + 0.6 + 10 + 0.02 + 0.66667, 4);
    const run = sim.write('?')[0];
    expect(parsePositionReply('gcode', run)).toEqual({ x: 0, y: 0, state: 'Run' });
    expect(decodeReply('gcode', '?', run)).toBe('State: Run');
    expect(cutStateFromReply('gcode', run)).toBe('cutting');

    // 0.5 s: the 100 mm rapid (0.333 s) is done, the blade is part-way down.
    sim.advance(0.5);
    expect(sim.position.x).toBeCloseTo(100, 9);
    expect(sim.position.penDown).toBe(true);
    expect(sim.z).toBeCloseTo(3.3333, 3);
    expect(sim.segments.map(s => s.penDown)).toEqual([false, true]);
    expect(sim.progress.executed).toBe(4);

    sim.advance(5);
    expect(sim.status).toBe('running');
    expect(sim.position.x).toBeCloseTo(145.6667, 3);
    expect(sim.stats.cutLengthMm).toBeCloseTo(45.6667, 3);

    sim.advance(100);
    expect(sim.status).toBe('idle');
    expect(sim.busy).toBe(false);
    expect(sim.done).toBe(true);
    expect(sim.position).toEqual({ x: 0, y: 0, penDown: false });
    expect(sim.progress).toMatchObject({ received: 8, executed: 8 });
    expect(sim.stats.cutLengthMm).toBeCloseTo(100, 9);
    expect(sim.segments.map(s => s.penDown)).toEqual([false, true, false]);
    expect(cutStateFromReply('gcode', sim.write('?')[0])).toBe('idle');
  });

  it('played time never runs ahead of planned time, however finely the pump splits a move', () => {
    const sim = hpgl({ realtime: true });
    feed(sim, 'IN;VS20;PU400,2000;PD400,400;PU600,600;PD1600,600;PU0,0;');
    const total = sim.progress.secondsTotal;
    expect(total).toBeGreaterThan(0);
    // A display refresh is finer than a move: pump in 16 ms ticks and read the share every time.
    while (!sim.done) {
      sim.advance(0.016);
      const { secondsExecuted, secondsTotal } = sim.progress;
      expect(secondsExecuted).toBeLessThanOrEqual(secondsTotal + 1e-9);
    }
    expect(sim.progress.secondsExecuted).toBeCloseTo(total, 6);
  });

  it('reports OS; = 2 (busy) on an HP-GL machine until the motion has run', () => {
    const sim = hpgl({ realtime: true });
    feed(sim, 'IN;VS20;PU400,2000;PD400,400;');
    expect(sim.status).toBe('running');
    const busy = feed(sim, 'OS;')[0];
    expect(decodeReply('hpgl', 'OS;', busy)).toBe('Machine status 2: Busy — drawing or moving');
    expect(cutStateFromReply('hpgl', busy)).toBe('cutting');
    expect(feed(sim, 'OA;')[0]).toBe('0,0,0\r\n');
    sim.advance(0.1);
    const moving = parsePositionReply('hpgl', feed(sim, 'OA;')[0]);
    // OA; reports whole plotter units, so allow one unit (0.025 mm) of rounding.
    expect(Math.abs(moving!.x - 10 * (0.1 / 0.169967))).toBeLessThan(0.013);
    expect(Math.abs(moving!.y - 5 * moving!.x)).toBeLessThan(0.07);
    sim.advance(10);
    expect(sim.done).toBe(true);
    expect(feed(sim, 'OS;')[0]).toBe('1\r\n');
    expect(cutStateFromReply('hpgl', feed(sim, 'OS;')[0])).toBe('idle');
    expect(sim.position).toEqual({ x: 10, y: 10, penDown: true });
    // 4 job statements + the 5 status queries made above, all executed.
    expect(sim.progress).toMatchObject({ received: 9, executed: 9 });
    expect(sim.progress.secondsTotal).toBeCloseTo(0.169967 + 0.2, 5);
  });

  it('freezes on a feed hold and resumes; the timeline keeps what is left', () => {
    const sim = gcode({ realtime: true });
    feed(sim, 'G0 X100 Y0 F3000\n');
    sim.advance(0.1);
    const held = sim.position.x;
    sim.write('!');
    expect(sim.status).toBe('paused');
    sim.advance(5);
    expect(sim.position.x).toBe(held);
    sim.write('~');
    expect(sim.status).toBe('running');
    sim.advance(5);
    expect(sim.done).toBe(true);
    expect(sim.position.x).toBe(100);
  });
});

describe('arcs', () => {
  it('flattens G2 / G3 arcs (I/J and R forms) into chords of the right length', () => {
    const run = (block: string, code: 'G2' | 'G3' = 'G2'): number => {
      const sim = gcode();
      // Start well inside the material so the long arcs stay on it.
      expect(feed(sim, `G0 X100 Y100\nM3 S1000\n${code} ${block} F600\n`)).toEqual([OK, OK, OK]);
      return sim.stats.cutLengthMm;
    };
    // Quarter circle r = 10 → 15.708; half circle → 31.416.
    expect(run('X110 Y110 I10 J0')).toBeCloseTo(Math.PI * 5, 1);
    expect(run('X120 Y100 I10 J0')).toBeCloseTo(Math.PI * 10, 1);
    expect(run('X120 Y100 R10')).toBeCloseTo(Math.PI * 10, 1);
    expect(run('X110 Y110 R10')).toBeCloseTo(Math.PI * 5, 1);
    // Negative R takes the long way round: 270° → 47.12.
    expect(run('X110 Y110 R-10')).toBeCloseTo(Math.PI * 15, 1);
    // CCW from (100,100) to (110,110) about (100,110) is the short 90°; CW the long 270°.
    expect(run('X110 Y110 J10', 'G3')).toBeCloseTo(Math.PI * 5, 1);
    expect(run('X110 Y110 J10', 'G2')).toBeCloseTo(Math.PI * 15, 1);
    const sim = gcode();
    expect(feed(sim, 'M3 S1000\nG2 X10 Y10 R3 F600\n')).toEqual([OK, 'error:33\r\n']);
    expect(sim.stats.cutLengthMm).toBe(0);
  });

  it('flattens AA / CI with the same conventions as simulateMachineCode', () => {
    const sim = hpgl();
    feed(sim, 'PU0,400;PD;AA400,400,90;'); // centre (10,10), start (0,10)
    expect(sim.stats.cutLengthMm).toBeCloseTo(Math.PI * 5, 1);
    expect(sim.position.penDown).toBe(true);
    const circle = hpgl();
    feed(circle, 'PU400,400;PD;CI400;');
    // radius line out + circle + radius line back to the centre
    expect(circle.stats.cutLengthMm).toBeCloseTo(20 + Math.PI * 20, 1);
    expect(circle.position).toEqual({ x: 10, y: 10, penDown: true });
  });
});

describe('offline auto-scan, identify and self-test', () => {
  it('runAutoSetup identifies the virtual HP-GL cutter behind a CH340 port', async () => {
    const ports: NativeSerialPort[] = [{ path: 'COM7', kind: 'usb', vid: 0x1a86, pid: 0x7523 }];
    const result = await runAutoSetup(fakeLink(hpgl()), ports, {});
    expect(result.found).toBe(true);
    expect(result.format).toBe('hpgl');
    expect(result.model).toBe('SIMULATED-PLOTTER,HPGL,720x210mm');
    expect(result.profileId).toBeNull();
    expect(result.port).toBe('COM7');
    expect(result.baud).toBe(9600);
    const labels = result.steps.map(s => `${s.status}:${s.label}`);
    expect(labels).toContain('pass:Scan');
    expect(labels).toContain('pass:OI;');
    expect(labels).toContain('pass:OE;');
    expect(labels).toContain('pass:OH;');
    expect(labels).toContain('pass:OA;');
    expect(result.steps.find(s => s.label === 'Scan')?.detail).toContain('answered "SIMULATED-PLOTTER,HPGL,720x210mm"');
  });

  it('a G-code controller that answers the HP-GL probe "OI;" with error:20 is recognised as grbl', async () => {
    // A real grbl rejects the HP-GL probe with `error:N`. autoDetectCutter
    // treats that rejection as silence and falls through to the `?` probe.
    // (Before the fix it took the error for a model string and reported an
    // HP-GL plotter named "error:20" — which this test used to pin.)
    const sim = gcode();
    expect(feed(sim, 'OI;')).toEqual(['error:20\r\n']);
    const ports: NativeSerialPort[] = [{ path: 'COM8', kind: 'usb', vid: 0x10c4, pid: 0xea60 }];
    const result = await runAutoSetup(fakeLink(sim), ports, {});
    expect(result.found).toBe(true);
    expect(result.format).toBe('gcode');
    expect(result.grbl).toBe(true);
    expect(result.model).not.toContain('error');
    expect(result.profileId).toBe('grbl-generic');
  });

  it('identifyMachine() on an HP-GL-formatted link reports a grbl rejection as grbl, not as an HP-GL model', async () => {
    const sim = gcode({ grblBuild: 'Bench plotter' });
    const result = await identifyMachine(fakeLink(sim), 'hpgl');
    expect(result.model).toContain('Bench plotter');
    expect(result.suggestedProfileId).toBe('grbl-generic');
    expect(result.error).toBeNull();
    expect(result.summary).not.toMatch(/model "error/);
  });

  it('runAutoSetup recognises the virtual grbl controller and its laser mode once "error:" probes count as silence', async () => {
    const ports: NativeSerialPort[] = [{ path: 'COM8', kind: 'usb', vid: 0x10c4, pid: 0xea60 }];
    const pen = await runAutoSetup(errorAwareLink(gcode({ grblBuild: 'Bench plotter' })), ports, {});
    expect(pen.found).toBe(true);
    expect(pen.format).toBe('gcode');
    expect(pen.grbl).toBe(true);
    expect(pen.grblBuild).toContain('Bench plotter');
    expect(pen.profileId).toBe('grbl-generic');
    expect(pen.baud).toBe(115200);
    expect(Object.fromEntries(pen.grblSettings.map(s => [s.key, s.value]))).toMatchObject({ $32: '0', $130: '720.000', $131: '210.000' });
    const labels = pen.steps.map(s => `${s.status}:${s.label}`);
    expect(labels).toContain('pass:$I');
    expect(labels).toContain('pass:$$');
    expect(labels).toContain('pass:?');

    const laser = await runAutoSetup(errorAwareLink(gcode({ laserMode: true })), ports, {});
    expect(laser.profileId).toBe('grbl-laser');
    expect(laser.steps.find(s => s.label === '$$')?.detail).toContain('laser mode $32=1');
  });

  it('the connection self-test passes on both formats', async () => {
    for (const sim of [hpgl(), gcode()]) {
      const link = fakeLink(sim);
      await link.open({ baud: 9600 });
      const steps = await runConnectionSelfTest(link, sim.format);
      expect(steps[0]).toMatchObject({ label: 'Link', status: 'pass', detail: 'Connected and the machine answers queries.' });
      expect(steps.slice(1).every(s => s.status === 'pass')).toBe(true);
    }
  });
});
