/**
 * Virtual plotter / engraver — a pure-logic stand-in for a real cutter.
 *
 * Feed it exactly the text the host would write to the serial port (HP-GL/2
 * or grbl-flavoured G-code, in any chunking) and it answers with the replies
 * the machine would send back. Every reply is shaped so THIS project's own
 * decoders read it without changes:
 *
 *   OA; / ?   → parsePositionReply      OH;   → parsePageReply
 *   $$        → parseGrblSettings       OI;   → plotterIdentify model match
 *   all       → decodeReply
 *
 * No DOM, no timers, no serial — `write()` is synchronous and returns the
 * replies in order; the caller decides when each one reaches the link.
 *
 * Coordinates
 *   - Internally everything is mm in the MATERIAL frame: origin = material
 *     bottom-left corner, X right, Y up, travel limited to
 *     plotWidthMm × paperHeightMm. `segments` / `machinePosition` use it.
 *   - `position` is what the machine REPORTS (OA; / ? numbers): the same
 *     point in the operator's frame, which starts identical to the material
 *     frame and is re-based by `setOrigin()` (HP-GL `IP;`, G-code `G92`).
 *   - HP-GL coordinates are plotter units (40/mm) whatever `unit` says — the
 *     host divides by 1016 itself for inches. G-code coordinates follow
 *     `unit` and the G20/G21 words.
 *
 * Execution model
 *   - Default: every move completes the moment it is parsed (ideal for
 *     assertions and for "what would this job cut" rehearsal).
 *   - `realtime: true`: moves join a timeline and only advance when the
 *     caller pumps `advance(dt)`; `status` then goes running → idle, `?`
 *     reports Run and `OS;` reports 2 (busy) — enough for an offline progress
 *     bar and a completion signal (`done`, `progress`).
 *   - Either way `progress` separates lines RECEIVED from lines EXECUTED
 *     (they differ while the machine is on hold or still catching up).
 *
 * Out of travel: the move is clipped at the limit, the head stops there and
 * the machine alarms — HP-GL answers the next OE; with 2, grbl answers
 * error:15, reports <Alarm|…> and locks motion until $X / $H / ctrl-X.
 */

import { flattenArcPoints, type OutputFormat } from './hpglDebug';

export type PlotterSimStatus = 'idle' | 'running' | 'paused' | 'alarm';

export interface PlotterSimSegment {
  /** Material-frame polyline in mm (see the header for the frame). */
  points: Array<[number, number]>;
  penDown: boolean;
}

export interface PlotterSimProgress {
  /** G-code lines / HP-GL statements received so far. */
  received: number;
  /** Of those, how many have been fully executed (aborted lines count as closed). */
  executed: number;
  /** Motion time played / planned, in seconds at the programmed feed rates. */
  secondsExecuted: number;
  secondsTotal: number;
}

export interface PlotterSimulatorOptions {
  format: OutputFormat;
  /** Unit of the coordinates the host sends (default mm). HP-GL is always plotter units. */
  unit?: 'mm' | 'in';
  /** X travel in mm (default 720 — a 720 mm roll cutter). */
  plotWidthMm?: number;
  /** Y travel in mm (default 210). Mirrors the dialog's "Paper height". */
  paperHeightMm?: number;
  /** G-code: Z at or below this counts as blade down (default −1, the dialog default). */
  penDownZ?: number;
  /** G-code: Z the head parks / homes at (default 5). */
  penUpZ?: number;
  /** G-code: laser mode ($32=1) — spindle-on feed moves mark even with Z up. */
  laserMode?: boolean;
  /** G-code: $30 maximum spindle speed (default 1000). */
  spindleMaxRpm?: number;
  /** HP-GL: string OI; answers (default "SIMULATED-PLOTTER,…", which no machine profile matches). */
  identify?: string;
  /** G-code: machine name stored in the $I build info. */
  grblBuild?: string;
  /** HP-GL: IN; also moves the origin back to the material corner (HP-GL semantics, default true). */
  inResetsOrigin?: boolean;
  /** Pace motion through `advance()` instead of executing instantly (default false). */
  realtime?: boolean;
  /** Fallback speeds for the timeline: HP-GL cutting when no VS was sent, and every pen-up / G0 move. */
  timing?: { cutMmPerS?: number; travelMmPerS?: number };
}

/** One queued motion. Zero-duration entries only change pen/hold state. */
interface SimEvent {
  x: number;
  y: number;
  z: number;
  /** True while the tool marks, false for pen-up travel, null for marker-only events. */
  cut: boolean | null;
  sec: number;
  clipped: boolean;
  hold: 0 | 1 | null;
}

interface GrblSetting { key: string; value: number; int: boolean }

const PU_PER_MM = 40;
const EPS = 1e-9;
const CRLF = '\r\n';
const ETX = '\x03';
const ESC = '\x1b';
const CTRL_X = '\x18';
const DEFAULT_WIDTH_MM = 720;
const DEFAULT_HEIGHT_MM = 210;
const DEFAULT_CUT_MM_S = 200;
const DEFAULT_TRAVEL_MM_S = 300;
const SIM_GRBL_VERSION = '1.1sim';
const SIM_GRBL_OPTS = '[OPT:V,15,128]';
const GRBL_HELP = "[HLP:$$ $# $G $I $N $x=val $Nx=line $J=line $SLP $C $X $H ~ ! ? ctrl-x]";

/** HP-GL statements accepted but with no effect on a cutter simulation (CT / TB are Roland / Graphtec vendor statements). */
const HPGL_SILENT = new Set([
  'SC', 'ES', 'TL', 'LT', 'PW', 'SM', 'UL', 'SI', 'SR', 'SL', 'DI', 'DR', 'DV', 'CP', 'BL',
  'EA', 'RA', 'RR', 'WG', 'ER', 'EW', 'FT', 'AC', 'PM', 'EP', 'NP', 'FR', 'IM', 'CB', 'MC', 'PT',
  'CT', 'TB',
]);

/** Vendor request characters that may arrive without a terminator (Roland "!" …). */
const VENDOR_ONLY = /^[!^&@#%]+$/;

const NUMBER_RE = /[-+]?\d*\.?\d+/g;
const WORD_RE = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

function positive(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

function numbers(text: string): number[] {
  return (text.match(NUMBER_RE) ?? []).map(Number);
}

/** grbl-shaped 3-decimal value without a "-0.000". */
function f3(v: number): string {
  return (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
}

/** Motion duration for `len` mm at `rate` mm/s (0 for a missing/zero rate). */
function duration(len: number, rate: number): number {
  return len > 0 && Number.isFinite(rate) && rate > 0 ? len / rate : 0;
}

/** Parameter where the segment from p0 (inside) toward p1 leaves [0, max]. */
function exitT(p0: number, p1: number, max: number): number {
  const d = p1 - p0;
  if (d > 0) return (max - p0) / d;
  if (d < 0) return -p0 / d;
  return Infinity;
}

/** Comment-stripped body of a G-code block. */
function stripGcodeComments(line: string): string {
  const semi = line.indexOf(';');
  const noSemi = semi >= 0 ? line.slice(0, semi) : line;
  const noParen = noSemi.replace(/\([^)]*\)/g, ' ');
  const open = noParen.indexOf('(');
  return (open >= 0 ? noParen.slice(0, open) : noParen).trim();
}

/** Word list of a G-code block, or the grbl error code for malformed text:
 *  2 = known letter without a number, 20 = letter grbl has no word for, 1 = number without a letter. */
function parseGcodeWords(line: string): Array<[string, number]> | number {
  const junk = line.replace(WORD_RE, '').trim();
  if (junk) {
    if (!/^[A-Za-z]/.test(junk)) return 1;
    return 'GMTFSPXYZIJRNL'.includes(junk[0].toUpperCase()) ? 2 : 20;
  }
  const words: Array<[string, number]> = [];
  for (const m of line.matchAll(WORD_RE)) words.push([m[1].toUpperCase(), Number(m[2])]);
  return words;
}

function defaultSettings(widthMm: number, heightMm: number, spindleMax: number, laser: boolean): GrblSetting[] {
  const i = (key: string, value: number): GrblSetting => ({ key, value, int: true });
  const f = (key: string, value: number): GrblSetting => ({ key, value, int: false });
  return [
    i('$0', 10), i('$1', 25), i('$2', 0), i('$3', 0), i('$4', 0), i('$5', 0), i('$6', 0),
    // $10=2: status reports carry WPos, so G92 (Set origin) is visible in the poll.
    i('$10', 2), f('$11', 0.01), f('$12', 0.002), i('$13', 0),
    i('$20', 0), i('$21', 0), i('$22', 1), i('$23', 0), f('$24', 25), f('$25', 500), i('$26', 250), f('$27', 1),
    f('$30', spindleMax), f('$31', 0), i('$32', laser ? 1 : 0),
    f('$100', 80), f('$101', 80), f('$102', 80),
    f('$110', 10000), f('$111', 10000), f('$112', 10000),
    f('$120', 500), f('$121', 500), f('$122', 500),
    f('$130', widthMm), f('$131', heightMm), f('$132', 40),
  ];
}

export class PlotterSimulator {
  readonly format: OutputFormat;
  readonly unit: 'mm' | 'in';
  /** True when motion is paced by `advance()` instead of completing instantly. */
  readonly realtime: boolean;
  /** Text the real controller prints when the port opens ('' for HP-GL machines). */
  readonly bootBanner: string;

  private readonly widthMm: number;
  private readonly heightMm: number;
  private readonly penDownZ: number;
  private readonly penUpZ: number;
  private readonly cutRate: number;
  private readonly travelRate: number;
  private readonly identify: string;
  private readonly inResetsOrigin: boolean;
  private readonly laserOpt: boolean;
  private readonly spindleMaxOpt: number;
  private spindleMax = 1000;
  private build: string;

  // Travel limits (mm) and grbl settings.
  private plotW = 0;
  private plotH = 0;
  private laser = false;
  private homing = true;
  private settings: GrblSetting[] = [];

  // ---- planned state: the machine once everything received so far has run ----
  private mx = 0;
  private my = 0;
  private mz = 0;
  /** Origin of the REPORTED frame, material mm (HP-GL P1 / G92 offset). */
  private offX = 0;
  private offY = 0;
  // HP-GL modal state
  private relative = false;
  private penDownP = false;
  private penNo = 0;
  private forceN = 0;
  private speedN = 0;
  // G-code modal state
  private gInch = false;
  private absolute = true;
  private ijAbs = false;
  private feedProg = 0;
  private spindleOnP = false;
  private spindleRpm = 0;
  private g28x = 0;
  private g28y = 0;
  private g30x = 0;
  private g30y = 0;
  // Flags
  private holdKind: 0 | 1 | null = null;
  private alarm = false;
  /** G-code only: an out-of-travel move is queued, further blocks are locked out. */
  private lock = false;
  private lastError = 0;
  private justInit = true;
  private alarmText: string | null = null;

  // ---- played state: what the head has physically done ----
  private px = 0;
  private py = 0;
  private pz = 0;
  private pCut = false;
  private track: PlotterSimSegment[] = [];
  private curCut: PlotterSimSegment | null = null;
  private curTravel: PlotterSimSegment | null = null;
  private cutLength = 0;
  private travelLength = 0;
  private penDownMoves = 0;
  private timeline: SimEvent[] = [];
  private playIdx = 0;
  private remain = 0;
  private playedSec = 0;
  private totalSec = 0;
  private lineEnds: number[] = [];
  private linesPlayed = 0;
  private received = 0;

  /** Partial line (G-code) / statement (HP-GL) carried across write() calls. */
  private buf = '';

  constructor(opts: PlotterSimulatorOptions) {
    const timing = opts.timing ?? {};
    this.format = opts.format;
    this.unit = opts.unit ?? 'mm';
    this.realtime = opts.realtime === true;
    this.widthMm = positive(opts.plotWidthMm, DEFAULT_WIDTH_MM);
    this.heightMm = positive(opts.paperHeightMm, DEFAULT_HEIGHT_MM);
    this.penDownZ = opts.penDownZ ?? -1;
    this.penUpZ = opts.penUpZ ?? 5;
    this.cutRate = positive(timing.cutMmPerS, DEFAULT_CUT_MM_S);
    this.travelRate = positive(timing.travelMmPerS, DEFAULT_TRAVEL_MM_S);
    this.identify = opts.identify ?? `SIMULATED-PLOTTER,${this.format === 'hpgl' ? 'HPGL' : 'GCODE'},${this.widthMm}x${this.heightMm}mm`;
    this.inResetsOrigin = opts.inResetsOrigin !== false;
    this.laserOpt = opts.laserMode === true;
    this.spindleMaxOpt = positive(opts.spindleMaxRpm, 1000);
    this.build = opts.grblBuild ?? 'AnchorWorks virtual plotter';
    this.bootBanner = this.format === 'gcode' ? `${CRLF}Grbl ${SIM_GRBL_VERSION} ['$' for help]${CRLF}` : '';
    this.reset();
  }

  /** Back to power-on defaults (position, modal state, settings, timeline, statistics). */
  reset(): void {
    this.plotW = this.widthMm;
    this.plotH = this.heightMm;
    this.laser = this.laserOpt;
    this.homing = true;
    this.spindleMax = this.spindleMaxOpt;
    this.settings = defaultSettings(this.plotW, this.plotH, this.spindleMax, this.laser);
    this.mx = 0;
    this.my = 0;
    this.mz = this.penUpZ;
    this.offX = 0;
    this.offY = 0;
    this.relative = false;
    this.penDownP = false;
    this.penNo = 0;
    this.forceN = 0;
    this.speedN = 0;
    this.gInch = this.unit === 'in';
    this.absolute = true;
    this.ijAbs = false;
    this.feedProg = 0;
    this.spindleOnP = false;
    this.spindleRpm = 0;
    this.g28x = 0;
    this.g28y = 0;
    this.g30x = 0;
    this.g30y = 0;
    this.holdKind = null;
    this.alarm = false;
    this.lock = false;
    this.lastError = 0;
    this.justInit = true;
    this.alarmText = null;
    this.px = 0;
    this.py = 0;
    this.pz = this.penUpZ;
    this.pCut = false;
    this.track = [];
    this.curCut = null;
    this.curTravel = null;
    this.cutLength = 0;
    this.travelLength = 0;
    this.penDownMoves = 0;
    this.timeline = [];
    this.playIdx = 0;
    this.remain = 0;
    this.playedSec = 0;
    this.totalSec = 0;
    this.lineEnds = [];
    this.linesPlayed = 0;
    this.received = 0;
    this.buf = '';
  }

  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */

  /**
   * Feed one piece of output text. Commands may be cut anywhere between
   * calls — partial lines / statements are buffered until their terminator.
   * Returns the replies, in order, each one terminated (CRLF, or CR + ETX
   * for Roland vendor replies); a multi-line grbl report is a single element.
   *
   * `endOfMessage` marks the last piece of one host send() (the job's final
   * line carries no line feed): the pending block / statement is closed.
   * Pass it per command, or call `flush()` once the link reports a send done.
   */
  write(text: string, endOfMessage = false): string[] {
    const out: string[] = [];
    if (this.format === 'hpgl') this.feedHpgl(text, out);
    else this.feedGcode(text, out);
    if (endOfMessage) out.push(...this.flush());
    return out;
  }

  /** Treat the pending unterminated line / statement as complete. */
  flush(): string[] {
    const out: string[] = [];
    const tail = this.buf.trim();
    this.buf = '';
    if (!tail) return out;
    if (this.format === 'hpgl') this.statement(tail, out);
    else this.block(tail, out);
    return out;
  }

  private feedHpgl(text: string, out: string[]): void {
    const startedEmpty = this.buf.trim() === '';
    for (let n = 0; n < text.length; n++) {
      const ch = text[n];
      if (ch === ';' || ch === ETX) this.statement(this.buf, out);
      else if (ch === '\r' || ch === '\n') {
        // Line breaks are padding inside HP-GL statements, except that the
        // Roland "!" family is terminated by CR rather than ";".
        if (VENDOR_ONLY.test(this.buf.trim())) this.statement(this.buf, out);
        else this.buf += ' ';
      } else if (ch === ESC || ch >= ' ') this.buf += ch;
    }
    // A whole write() that is nothing but "!" is the Roland status request
    // sent without its CR. Anything longer waits for its terminator — HP-GL
    // coordinate lists legitimately span many chunks with no ";" in sight.
    if (this.buf.trim() && startedEmpty && VENDOR_ONLY.test(text.trim())) this.statement(this.buf, out);
  }

  private feedGcode(text: string, out: string[]): void {
    // A grbl system command can never continue an open block, so "$…" always
    // starts a new one — this also runs the block a finished job left open
    // (this app's G-code ends without a line feed) exactly as a real grbl
    // would on the next newline.
    if (this.buf.trim() && /^\s*\$/.test(text)) this.block(this.buf, out);
    for (let n = 0; n < text.length; n++) {
      const ch = text[n];
      if (ch === '?') { out.push(this.statusReport()); continue; }
      if (ch === '!') { this.feedHold(); continue; }
      if (ch === '~') { this.cycleStart(); continue; }
      if (ch === CTRL_X) { this.softReset(); continue; }
      if (ch === '\n' || ch === '\r') this.block(this.buf, out);
      else if (ch >= ' ') this.buf += ch;
    }
    // A "$…" system command sent without its line feed ($H, $I, a jog) is
    // complete as it stands — the only unterminated block this app types.
    if (this.buf.trim().startsWith('$')) this.block(this.buf, out);
  }

  /* ------------------------------------------------------------------ *
   * HP-GL
   * ------------------------------------------------------------------ */

  private statement(stmt: string, out: string[]): void {
    const s = stmt.trim();
    this.buf = '';
    if (!s) return;
    this.received++;
    try {
      this.execHpgl(s, out);
    } finally {
      this.lineDone();
    }
  }

  private execHpgl(s: string, out: string[]): void {
    const head = s[0];
    if (head === '!') {
      if (s.length === 1) {
        // Roland status: pen (0 down / 1 up), motion (0 moving / 1 idle), error (0 / 1).
        out.push(`${this.pCut ? 0 : 1}${this.status === 'running' ? 0 : 1}${this.lastError ? 0 : 1}\r${ETX}`);
        return;
      }
      if (/^!PG/i.test(s)) this.eject();
      return; // other Roland "!" extensions: no reply
    }
    if ('^&@#%'.includes(head) || head === ESC) return; // Roland ^…, Graphtec GP-GL, ESC sequences
    if (/^[-+\d.]/.test(head)) return; // Roland bare page-size statement (e.g. "11280,7920")

    const m = s.match(/^([A-Za-z]{2})(.*)$/);
    if (!m) {
      this.noteError(1);
      return;
    }
    const mn = m[1].toUpperCase();
    const args = numbers(m[2]);
    switch (mn) {
      case 'IN':
        this.setPen(false);
        this.relative = false;
        this.penNo = 0;
        this.forceN = 0;
        this.speedN = 0;
        this.lastError = 0;
        this.alarm = false;
        this.justInit = true;
        if (this.inResetsOrigin) {
          this.offX = 0;
          this.offY = 0;
        }
        break;
      case 'SP':
        this.setPen(false);
        this.penNo = args[0] ?? 0;
        break;
      case 'PU':
        this.setPen(false);
        this.hpglMoves(args);
        break;
      case 'PD':
        this.setPen(true);
        this.hpglMoves(args);
        break;
      case 'PA':
        this.relative = false;
        this.hpglMoves(args);
        break;
      case 'PR':
        this.relative = true;
        this.hpglMoves(args);
        break;
      case 'FS':
        this.forceN = args[0] ?? 0;
        break;
      case 'VS':
        this.speedN = args[0] ?? 0;
        break;
      case 'IP':
        if (args.length >= 2) {
          this.offX = args[0] / PU_PER_MM;
          this.offY = args[1] / PU_PER_MM;
        } else {
          this.setOrigin();
        }
        break;
      case 'OA':
      case 'OB':
      case 'OC':
      case 'OD': {
        const p = this.position;
        out.push(`${Math.round(p.x * PU_PER_MM)},${Math.round(p.y * PU_PER_MM)},${p.penDown ? 1 : 0}${CRLF}`);
        break;
      }
      case 'OE':
        out.push(`${this.lastError}${CRLF}`);
        this.lastError = 0;
        this.alarm = false;
        break;
      case 'OH': {
        const r = (mm: number) => Math.round(mm * PU_PER_MM);
        out.push(`${r(-this.offX)},${r(-this.offY)},${r(this.plotW - this.offX)},${r(this.plotH - this.offY)}${CRLF}`);
        break;
      }
      case 'OI':
        out.push(`${this.identify}${CRLF}`);
        break;
      case 'OS':
        out.push(`${this.status === 'running' ? 2 : this.justInit ? 0 : 1}${CRLF}`);
        break;
      case 'PG':
        this.eject();
        break;
      case 'AA':
      case 'AR':
      case 'CI':
        this.hpglArc(mn, args);
        break;
      default:
        // Anything outside the list above is a command error (OE; → 1).
        if (!HPGL_SILENT.has(mn)) this.noteError(1);
    }
  }

  private hpglMoves(args: number[]): void {
    for (let k = 0; k + 1 < args.length; k += 2) this.hpglMove(args[k], args[k + 1]);
  }

  /** Plotter-unit coordinates in the current plotting mode (PA absolute / PR relative). */
  private hpglMove(u: number, v: number): void {
    const k = 1 / PU_PER_MM;
    const tx = this.relative ? this.mx + u * k : u * k + this.offX;
    const ty = this.relative ? this.my + v * k : v * k + this.offY;
    this.planMove(tx, ty, this.mz, this.penDownP, this.penDownP ? this.cutSpeed() : this.travelRate, this.travelRate);
  }

  /**
   * Arcs with the same geometry as hpglDebug.simulateMachineCode, so imported
   * PLT files replay identically in both (CI closes the first chord that the
   * offline replay leaves out, so the circle is really closed).
   */
  private hpglArc(mn: string, args: number[]): void {
    const k = 1 / PU_PER_MM;
    const rate = this.penDownP ? this.cutSpeed() : this.travelRate;
    if (mn === 'CI') {
      const cx = this.mx;
      const cy = this.my;
      const radius = (args[0] ?? 0) * k;
      // Pen at the centre: out to the 0° point, round, back to the centre.
      this.planMove(cx + radius, cy, this.mz, this.penDownP, rate, rate);
      for (const [ax, ay] of flattenArcPoints(cx, cy, radius, 0, args[1] ?? 360)) {
        this.planMove(ax, ay, this.mz, this.penDownP, rate, rate);
      }
      this.planMove(cx, cy, this.mz, this.penDownP, rate, rate);
      return;
    }
    const cx = (mn === 'AR' ? this.mx : this.offX) + (args[0] ?? 0) * k;
    const cy = (mn === 'AR' ? this.my : this.offY) + (args[1] ?? 0) * k;
    const radius = Math.hypot(cx - this.mx, cy - this.my);
    const a0 = Math.atan2(this.my - cy, this.mx - cx);
    for (const [ax, ay] of flattenArcPoints(cx, cy, radius, a0, args[2] ?? 360)) {
      this.planMove(ax, ay, this.mz, this.penDownP, rate, rate);
    }
  }

  private setPen(down: boolean): void {
    if (down === this.penDownP) return;
    this.penDownP = down;
    this.emit({ x: this.mx, y: this.my, z: this.mz, cut: down, sec: 0, clipped: false, hold: null });
  }

  private eject(): void {
    this.setPen(false);
    this.planMove(0, 0, this.mz, false, this.travelRate, this.travelRate);
  }

  private noteError(code: number): void {
    if (!this.lastError) this.lastError = code;
  }

  /** HP-GL cutting speed: VS (cm/s) when the host sent one, else the timing fallback. */
  private cutSpeed(): number {
    return this.format === 'hpgl' && this.speedN > 0 ? this.speedN * 10 : this.cutRate;
  }

  /* ------------------------------------------------------------------ *
   * G-code / grbl
   * ------------------------------------------------------------------ */

  private block(raw: string, out: string[]): void {
    const text = raw.trim();
    this.buf = '';
    if (!text) return;
    const bare = stripGcodeComments(text);
    // Like grbl, a comment-only line is dropped without an "ok" — and that
    // silence is what lets auto-detect tell a G-code controller from an
    // HP-GL machine when it probes with "OI;".
    if (!bare) return;
    if (bare[0] === '$') {
      this.execSys(bare, out);
      return;
    }
    this.received++;
    try {
      if (this.alarm || this.lock) {
        out.push(`error:9${CRLF}`);
        return;
      }
      const words = parseGcodeWords(bare);
      const err = typeof words === 'number' ? words : this.runGcode(words);
      out.push(err === null ? `ok${CRLF}` : `error:${err}${CRLF}`);
    } finally {
      this.lineDone();
    }
  }

  private execSys(cmd: string, out: string[]): void {
    this.received++;
    try {
      const c = cmd.toUpperCase();
      const eq = c.indexOf('=');
      const head = eq < 0 ? c : c.slice(0, eq);
      const arg = eq < 0 ? '' : cmd.slice(eq + 1).trim();
      if (c === '$$') { out.push(this.settings.map(s => `${s.key}=${s.int ? s.value : f3(s.value)}`).join(CRLF) + `${CRLF}ok${CRLF}`); return; }
      if (c === '$') { out.push(`${GRBL_HELP}${CRLF}`); return; }
      if (c === '$#') {
        const g54to59 = [54, 55, 56, 57, 58, 59].map(n => `[G${n}:0.000,0.000,0.000]`);
        const xy = (x: number, y: number): string => `${f3(x)},${f3(y)},0.000`;
        out.push([
          ...g54to59,
          `[G28:${xy(this.g28x, this.g28y)}]`, `[G30:${xy(this.g30x, this.g30y)}]`, `[G92:${xy(this.offX, this.offY)}]`,
          '[TLO:0.000]', '[PRB:0.000,0.000,0.000:0]', 'ok',
        ].join(CRLF) + CRLF);
        return;
      }
      if (c === '$G') {
        const state = [
          'G0', 'G54', 'G17', this.gInch ? 'G20' : 'G21', this.absolute ? 'G90' : 'G91', 'G94', 'M0',
          this.spindleOnP ? 'M3' : 'M5', 'M9', 'T0', `S${Math.round(this.spindleRpm)}`, `F${Number.isInteger(this.feedProg) ? this.feedProg : this.feedProg.toFixed(1)}`,
        ];
        out.push(`[GC:${state.join(' ')}]${CRLF}ok${CRLF}`);
        return;
      }
      if (head === '$I') {
        if (eq >= 0) this.build = arg;
        out.push(`[VER:${SIM_GRBL_VERSION}.20261125:${this.build}]${CRLF}${SIM_GRBL_OPTS}${CRLF}ok${CRLF}`);
        return;
      }
      if (c === '$X') {
        if (this.holdKind !== null) { out.push(`error:8${CRLF}`); return; }
        const was = this.alarm || this.lock;
        this.alarm = false;
        this.lock = false;
        out.push(`${was ? '[MSG:Caution: Unlocked]' + CRLF : ''}ok${CRLF}`);
        return;
      }
      if (c === '$H') {
        if (this.status !== 'idle' && this.status !== 'alarm') { out.push(`error:8${CRLF}`); return; }
        if (!this.homing) { out.push(`error:5${CRLF}`); return; }
        this.home();
        out.push(`ok${CRLF}`);
        return;
      }
      if (head === '$J') {
        const err = this.jog(arg);
        out.push(err === null ? `ok${CRLF}` : `error:${err}${CRLF}`);
        return;
      }
      const m = c.match(/^\$(\d+)(=([-+]?\d*\.?\d+))?$/);
      const setting = m ? this.settings.find(s => s.key === `$${m[1]}`) : undefined;
      if (!m || !setting) { out.push(`error:3${CRLF}`); return; }
      if (m[2] === undefined) {
        out.push(`${setting.key}=${setting.int ? setting.value : f3(setting.value)}${CRLF}ok${CRLF}`);
        return;
      }
      this.writeSetting(setting, Number(m[3]));
      out.push(`ok${CRLF}`);
    } finally {
      this.lineDone();
    }
  }

  private writeSetting(setting: GrblSetting, value: number): void {
    setting.value = value;
    switch (setting.key) {
      case '$22': this.homing = value === 1; break;
      case '$30': this.spindleMax = Math.max(1, value); break;
      case '$32': this.laser = value === 1; break;
      case '$130': this.plotW = Math.max(0, value); break;
      case '$131': this.plotH = Math.max(0, value); break;
      default: break;
    }
  }

  /** `$J=` jog. Returns the grbl error code, or null when the jog ran. */
  private jog(arg: string): number | null {
    if (this.alarm || this.lock) return 9;
    if (this.status !== 'idle') return 8;
    const words = parseGcodeWords(arg);
    if (typeof words === 'number') return words;
    let inch: boolean | null = null;
    let absolute: boolean | null = null;
    let machine = false;
    let x: number | null = null;
    let y: number | null = null;
    let z: number | null = null;
    let feed: number | null = null;
    for (const [letter, v] of words) {
      if (letter === 'G') {
        if (v === 20) inch = true;
        else if (v === 21) inch = false;
        else if (v === 90) absolute = true;
        else if (v === 91) absolute = false;
        else if (v === 53) machine = true;
        else return 16;
      } else if (letter === 'X') x = v;
      else if (letter === 'Y') y = v;
      else if (letter === 'Z') z = v;
      else if (letter === 'F') {
        if (v <= 0) return 22;
        feed = v;
      } else return 16;
    }
    if (x === null && y === null && z === null) return 33;
    if (feed === null) return 22;
    const k = (inch ?? this.gInch) ? 25.4 : 1;
    const abs = absolute ?? this.absolute;
    const tx = x === null ? this.mx : machine ? x * k : abs ? x * k + this.offX : this.mx + x * k;
    const ty = y === null ? this.my : machine ? y * k : abs ? y * k + this.offY : this.my + y * k;
    const tz = z === null ? this.mz : z * k;
    // Soft limits: a jog past the travel is refused outright — no move, no alarm.
    if (tx < -EPS || tx > this.plotW + EPS || ty < -EPS || ty > this.plotH + EPS) return 15;
    const rate = (feed * k) / 60;
    this.planMove(tx, ty, tz, this.zDown(tz), rate, rate);
    return null;
  }

  /** Execute one parsed block. Returns the grbl error code, or null for "ok". */
  private runGcode(words: Array<[string, number]>): number | null {
    let inch: boolean | null = null;
    let absolute: boolean | null = null;
    let ijAbs: boolean | null = null;
    let machine = false;
    let motion: number | null = null;
    let nonModal: number | null = null;
    let x: number | null = null;
    let y: number | null = null;
    let z: number | null = null;
    let i: number | null = null;
    let j: number | null = null;
    let r: number | null = null;
    let feed: number | null = null;
    let s: number | null = null;
    let spindle: number | null = null;
    let flow: number | null = null;
    for (const [letter, v] of words) {
      if (letter === 'G') {
        if (v === 20) inch = true;
        else if (v === 21) inch = false;
        else if (v === 90) absolute = true;
        else if (v === 91) absolute = false;
        else if (v === 90.1) ijAbs = true;
        else if (v === 91.1) ijAbs = false;
        else if (v === 53) machine = true;
        else if (v === 0 || v === 1 || v === 2 || v === 3) {
          if (motion !== null) return 21;
          motion = v;
        } else if (v === 28 || v === 28.1 || v === 30 || v === 30.1 || v === 92 || v === 92.1 || v === 10 || v === 4) {
          if (nonModal !== null || motion !== null) return 24;
          nonModal = v;
        } else if (v === 80) motion = null;
        else if (v !== 17 && v !== 40 && v !== 49 && v !== 94 && !(v >= 54 && v <= 59)) return 20;
      } else if (letter === 'M') {
        if (v === 3 || v === 4 || v === 5) spindle = v;
        else if (v === 0 || v === 1 || v === 2 || v === 30) flow = v;
        else if (v !== 7 && v !== 8 && v !== 9) return 20;
      } else if (letter === 'X') x = v;
      else if (letter === 'Y') y = v;
      else if (letter === 'Z') z = v;
      else if (letter === 'I') i = v;
      else if (letter === 'J') j = v;
      else if (letter === 'R') r = v;
      else if (letter === 'F') {
        if (v <= 0) return 22;
        feed = v;
      } else if (letter === 'S') {
        if (v < 0) return 4;
        s = v;
      } else if (letter !== 'T' && letter !== 'N' && letter !== 'P' && letter !== 'L') return 20;
    }
    if ((motion === 1 || motion === 2 || motion === 3) && (feed ?? this.feedProg) <= 0) return 22;

    // Same order grbl applies words: settings, spindle, feed, motion, program flow.
    if (inch !== null) this.gInch = inch;
    if (absolute !== null) this.absolute = absolute;
    if (ijAbs !== null) this.ijAbs = ijAbs;
    if (s !== null) this.spindleRpm = Math.min(s, this.spindleMax);
    if (spindle !== null) this.spindleOnP = spindle === 3 || spindle === 4;
    if (feed !== null) this.feedProg = feed;

    const k = this.gInch ? 25.4 : 1;
    const along = (v: number, cur: number, off: number): number => machine ? v * k : this.absolute ? v * k + off : cur + v * k;
    const tx = x === null ? this.mx : along(x, this.mx, this.offX);
    const ty = y === null ? this.my : along(y, this.my, this.offY);
    const tz = z === null ? this.mz : machine || this.absolute ? z * k : this.mz + z * k;

    if (nonModal !== null) {
      if (nonModal === 92) {
        if (x !== null) this.offX = this.mx - x * k;
        if (y !== null) this.offY = this.my - y * k;
      } else if (nonModal === 92.1) {
        this.offX = 0;
        this.offY = 0;
      } else if (nonModal === 28 || nonModal === 30) {
        // Through the given intermediate point, then home the named axes
        // (all of them when none are named) to the stored G28 / G30 position.
        const named = x !== null || y !== null || z !== null;
        if (named) this.rapid(tx, ty, tz);
        const hx = nonModal === 28 ? this.g28x : this.g30x;
        const hy = nonModal === 28 ? this.g28y : this.g30y;
        this.rapid(!named || x !== null ? hx : this.mx, !named || y !== null ? hy : this.my, !named || z !== null ? this.penUpZ : this.mz);
      } else if (nonModal === 28.1) {
        this.g28x = this.mx;
        this.g28y = this.my;
      } else if (nonModal === 30.1) {
        this.g30x = this.mx;
        this.g30y = this.my;
      }
      // G10 offsets and G4 dwells have no effect on a 2-axis cutter.
      return null;
    }

    let clipped = false;
    if (motion !== null && (x !== null || y !== null || z !== null)) {
      if (motion <= 1) {
        const down = this.zDown(tz);
        const rate = motion === 1 ? this.feedRate() : this.travelRate;
        clipped = this.planMove(tx, ty, tz, motion === 1 ? down || this.spindleOnP : down, rate, rate);
      } else {
        const err = this.arc(motion === 3, tx, ty, i, j, r, k);
        if (err !== null) return err;
      }
    }

    if (flow === 0 || flow === 1) {
      this.emit({ x: this.mx, y: this.my, z: this.mz, cut: null, sec: 0, clipped: false, hold: flow });
    } else if (flow === 2 || flow === 30) {
      this.spindleOnP = false;
      this.absolute = true;
    }
    return clipped ? 15 : null;
  }

  /** G2 / G3 arc flattened into chords. Returns the grbl error code, or null. */
  private arc(ccw: boolean, tx: number, ty: number, i: number | null, j: number | null, r: number | null, k: number): number | null {
    const sx = this.mx;
    const sy = this.my;
    let cx: number;
    let cy: number;
    if (i !== null || j !== null) {
      cx = (this.ijAbs ? 0 : sx) + (i ?? 0) * k;
      cy = (this.ijAbs ? 0 : sy) + (j ?? 0) * k;
    } else if (r !== null && r !== 0) {
      const dx = tx - sx;
      const dy = ty - sy;
      const d = Math.hypot(dx, dy);
      const rr = Math.abs(r) * k;
      if (d < EPS || rr < d / 2) return 33;
      const h = Math.sqrt(rr * rr - (d / 2) * (d / 2));
      // Positive R takes the short way round, negative R the long way.
      const side = (ccw ? 1 : -1) * (r >= 0 ? 1 : -1);
      cx = (sx + tx) / 2 - (side * h * dy) / d;
      cy = (sy + ty) / 2 + (side * h * dx) / d;
    } else {
      return 33;
    }
    const radius = Math.hypot(sx - cx, sy - cy);
    if (radius < EPS || Math.abs(Math.hypot(tx - cx, ty - cy) - radius) > 0.5) return 33;
    const a0 = Math.atan2(sy - cy, sx - cx);
    let sweep = Math.atan2(ty - cy, tx - cx) - a0;
    if (ccw ? sweep <= 1e-9 : sweep >= -1e-9) sweep += ccw ? 2 * Math.PI : -2 * Math.PI;
    const rate = this.feedRate();
    const cut = this.zDown(this.mz) || this.spindleOnP;
    let clipped = false;
    for (const [ax, ay] of flattenArcPoints(cx, cy, radius, a0, (sweep * 180) / Math.PI)) {
      if (this.planMove(ax, ay, this.mz, cut, rate, rate)) clipped = true;
    }
    return clipped ? 15 : null;
  }

  private zDown(z: number): boolean {
    return z <= this.penDownZ + 1e-6;
  }

  /** Current feed in mm/s (F is modal and follows G20/G21). */
  private feedRate(): number {
    return (this.feedProg * (this.gInch ? 25.4 : 1)) / 60;
  }

  /** Pen-up move at the travel rate with the tool state left as it is. */
  private rapid(tx: number, ty: number, tz: number): boolean {
    return this.planMove(tx, ty, tz, this.zDown(tz), this.travelRate, this.travelRate);
  }

  private statusReport(): string {
    const state = this.status === 'running' ? 'Run' : this.status === 'paused' ? `Hold:${this.holdKind ?? 0}` : this.status === 'alarm' ? 'Alarm' : 'Idle';
    const p = this.position;
    const fs = `${this.status === 'running' ? Math.round(this.feedRate() * 60) : 0},${this.spindleOnP ? Math.round(this.spindleRpm) : 0}`;
    return `<${state}|WPos:${f3(p.x)},${f3(p.y)},${f3(this.pz)}|FS:${fs}>${CRLF}`;
  }

  private feedHold(): void {
    if (this.holdKind === null && !this.alarm) this.holdKind = 0;
  }

  private cycleStart(): void {
    this.holdKind = null;
    if (!this.realtime) this.advance(Infinity);
  }

  private softReset(): void {
    this.dropPending();
    this.holdKind = null;
    this.alarm = false;
    this.lock = false;
    this.offX = 0;
    this.offY = 0;
    this.absolute = true;
    this.feedProg = 0;
    this.spindleOnP = false;
    this.spindleRpm = 0;
    this.justInit = true;
    this.buf = '';
  }

  /* ------------------------------------------------------------------ *
   * Timeline
   * ------------------------------------------------------------------ */

  private planMove(tx: number, ty: number, tz: number, cut: boolean | null, mmPerS: number, zPerS: number): boolean {
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return false;
    const x0 = this.mx;
    const y0 = this.my;
    const t = Math.max(0, Math.min(1, exitT(x0, tx, this.plotW), exitT(y0, ty, this.plotH)));
    const x = x0 + (tx - x0) * t;
    const y = y0 + (ty - y0) * t;
    const sec = Math.max(duration(Math.hypot(x - x0, y - y0), mmPerS), duration(Math.abs(tz - this.mz), zPerS));
    const clipped = t < 1 - 1e-12;
    this.emit({ x, y, z: tz, cut, sec, clipped, hold: null });
    this.mx = x;
    this.my = y;
    this.mz = tz;
    if (clipped) this.limitHit(tx, ty);
    return clipped;
  }

  private limitHit(tx: number, ty: number): void {
    if (this.format === 'hpgl') this.noteError(2);
    else this.lock = true;
    this.alarmText = `Move clipped at the travel limit — target (${tx.toFixed(1)}, ${ty.toFixed(1)}) mm, travel ${this.plotW} × ${this.plotH} mm`;
  }

  private emit(ev: SimEvent): void {
    this.timeline.push(ev);
    this.totalSec += ev.sec;
    this.justInit = false;
    if (!this.realtime && this.holdKind === null) this.advance(Infinity);
  }

  /**
   * Pump simulated motion time (seconds). Realtime mode only — instant mode
   * plays every move as it is parsed. No time passes while the machine is on
   * a feed hold / program pause.
   */
  advance(dtSeconds: number): void {
    let budget = dtSeconds;
    while (this.holdKind === null && budget > 0 && this.playIdx < this.timeline.length) {
      const ev = this.timeline[this.playIdx];
      const need = this.remain > 0 ? this.remain : ev.sec;
      if (need > budget) {
        const f = budget / need;
        if (ev.cut !== null) this.headTo(this.px + (ev.x - this.px) * f, this.py + (ev.y - this.py) * f, ev.cut);
        this.pz += (ev.z - this.pz) * f;
        this.remain = need - budget;
        this.playedSec += budget;
        return;
      }
      budget -= need;
      this.remain = 0;
      this.applyEvent(ev, need);
    }
  }

  private applyEvent(ev: SimEvent, sec: number): void {
    if (ev.cut !== null) this.headTo(ev.x, ev.y, ev.cut);
    this.pz = ev.z;
    this.playIdx++;
    // `sec` is what THIS step still had to play. A move split across pump ticks
    // has already booked its earlier parts in `advance`; adding the event's
    // whole time again ran the played total past the planned one (a blade
    // offset test read "150%") and pushed the progress bar ahead of the head.
    this.playedSec += sec;
    if (ev.hold !== null) this.holdKind = ev.hold;
    if (ev.clipped) {
      // The head has reached the travel limit: alarm. grbl also scraps
      // everything still queued; an HP-GL plotter keeps clipping.
      this.alarm = true;
      if (this.format === 'gcode') this.dropPending();
    }
    this.syncLines();
  }

  private headTo(x: number, y: number, cut: boolean): void {
    const d = Math.hypot(x - this.px, y - this.py);
    let run: PlotterSimSegment | null = null;
    if (cut) {
      this.pCut = true;
      this.curTravel = null;
      this.curCut ??= this.openRun(true);
      run = this.curCut;
    } else {
      this.pCut = false;
      this.curCut = null;
      if (d > EPS) {
        this.curTravel ??= this.openRun(false);
        run = this.curTravel;
      } else {
        this.curTravel = null;
      }
    }
    if (d > EPS && run) {
      run.points.push([x, y]);
      if (cut) {
        this.cutLength += d;
        this.penDownMoves++;
      } else {
        this.travelLength += d;
      }
    }
    this.px = x;
    this.py = y;
  }

  private openRun(cut: boolean): PlotterSimSegment {
    const run: PlotterSimSegment = { points: [[this.px, this.py]], penDown: cut };
    this.track.push(run);
    return run;
  }

  /** Scrap every queued move (soft reset, or after a grbl limit alarm). */
  private dropPending(): void {
    this.timeline.length = this.playIdx;
    this.totalSec = this.playedSec;
    this.mx = this.px;
    this.my = this.py;
    this.mz = this.pz;
    this.penDownP = this.pCut;
    this.linesPlayed = this.lineEnds.length;
  }

  private lineDone(): void {
    this.lineEnds.push(this.timeline.length);
    if (this.linesPlayed > 4096 && this.linesPlayed * 2 > this.lineEnds.length) {
      this.lineEnds = this.lineEnds.slice(this.linesPlayed);
      this.linesPlayed = 0;
    }
    this.syncLines();
  }

  private syncLines(): void {
    while (this.linesPlayed < this.lineEnds.length && this.lineEnds[this.linesPlayed] <= this.playIdx) this.linesPlayed++;
  }

  /* ------------------------------------------------------------------ *
   * Operator panel actions
   * ------------------------------------------------------------------ */

  /** "Set origin" at the head's current point: it reports (0, 0) from now on. */
  setOrigin(): void {
    this.offX = this.mx;
    this.offY = this.my;
  }

  /** Homing cycle: blade up, back to the material corner, alarm cleared. */
  home(): void {
    this.setPen(false);
    this.planMove(0, 0, this.penUpZ, false, this.travelRate, this.travelRate);
    this.alarm = false;
    this.lock = false;
  }

  /** Operator-panel feed hold — what the link's Pause presses, in either
   *  language (the same effect as grbl's `!`). */
  hold(): void {
    this.feedHold();
  }

  /** Operator-panel cycle start — the link's Resume (grbl's `~`). */
  start(): void {
    this.cycleStart();
  }

  /* ------------------------------------------------------------------ *
   * Read-outs
   * ------------------------------------------------------------------ */

  /** Where the head is in the REPORTED frame (mm) — the numbers OA; / ? carry. */
  get position(): { x: number; y: number; penDown: boolean } {
    return { x: this.px - this.offX, y: this.py - this.offY, penDown: this.pCut };
  }

  /** Where the head is on the material (mm, origin = material bottom-left). */
  get machinePosition(): { x: number; y: number } {
    return { x: this.px, y: this.py };
  }

  /** Toolpath walked so far, material frame mm — one entry per continuous cut / travel. */
  get segments(): PlotterSimSegment[] {
    return this.track;
  }

  get stats(): { cutLengthMm: number; travelLengthMm: number; penDownMoves: number } {
    return { cutLengthMm: this.cutLength, travelLengthMm: this.travelLength, penDownMoves: this.penDownMoves };
  }

  /** HP-GL FS force, or the grbl spindle speed S. */
  get force(): number {
    return this.format === 'hpgl' ? this.forceN : this.spindleRpm;
  }

  /** HP-GL VS speed (cm/s), or the grbl feed rate (mm/min). */
  get speed(): number {
    return this.format === 'hpgl' ? this.speedN : this.feedRate() * 60;
  }

  get status(): PlotterSimStatus {
    if (this.alarm) return 'alarm';
    if (this.holdKind !== null) return 'paused';
    return this.playIdx < this.timeline.length ? 'running' : 'idle';
  }

  /** True while moves are still queued (realtime mode only). */
  get busy(): boolean {
    return this.status === 'running';
  }

  /** True once every line received so far has been executed and nothing is moving or held. */
  get done(): boolean {
    return this.playIdx >= this.timeline.length && this.holdKind === null;
  }

  get progress(): PlotterSimProgress {
    return {
      received: this.received,
      executed: this.linesPlayed,
      secondsExecuted: this.playedSec,
      secondsTotal: this.totalSec,
    };
  }

  /** Why the machine alarmed, or null. */
  get alarmReason(): string | null {
    return this.alarmText;
  }

  get travelLimits(): { widthMm: number; heightMm: number } {
    return { widthMm: this.plotW, heightMm: this.plotH };
  }

  /** G-code: current tool height in mm. */
  get z(): number {
    return this.pz;
  }

  /** G-code: M3 / M4 spindle (or laser) energised. */
  get spindleOn(): boolean {
    return this.spindleOnP;
  }

  /** G-code: laser mode ($32=1) as `$$` reports it. */
  get laserMode(): boolean {
    return this.laser;
  }

  /** HP-GL: true while PR (relative plotting) mode is active — a jog leaves it on. */
  get isRelative(): boolean {
    return this.relative;
  }

  /** HP-GL: pen selected by SP. */
  get pen(): number {
    return this.penNo;
  }
}
