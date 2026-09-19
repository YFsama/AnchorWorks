/**
 * Debug / operations toolkit for cutters & pen plotters.
 *
 * The Plotter console uses these to turn one click into the right machine
 * language for the selected format:
 *
 *   - quick commands (initialize, status query, page limits, pen up/down),
 *   - jog moves in mm for both HP-GL (`PU;PR x,y;` in plotter units) and
 *     grbl-style G-code (`$J=G91 …`),
 *   - reply decoders that turn raw bytes into operator-readable text —
 *     HP-GL `OE` error codes, `OH` hard-clip page limits, `OA` position,
 *     and grbl `error:N` / `<Idle|MPos:…>` status reports.
 *
 * HP-GL plotter-unit facts used throughout: 40 units/mm (1016/inch).
 */

export type OutputFormat = 'gcode' | 'hpgl';

export interface QuickCommand {
  id: string;
  label: string;
  /** Machine text to send. */
  command: string;
  description: string;
  /** True when the device answers and the console should await a reply. */
  expectsReply: boolean;
  formats?: Array<OutputFormat>;
}

/** One-click machine commands for the console toolbar. */
export const QUICK_COMMANDS: QuickCommand[] = [
  { id: 'init', label: 'Initialize', command: 'IN;', description: 'Reset the machine to power-on defaults (IN).', expectsReply: false, formats: ['hpgl'] },
  { id: 'pen-up', label: 'Pen up', command: 'PU;', description: 'Raise the pen / blade immediately.', expectsReply: false, formats: ['hpgl'] },
  { id: 'blade-tap', label: 'Blade tap', command: 'PD;PU;', description: 'Lower the blade for a moment to mark the current spot — the classic way to find origin on scrap.', expectsReply: false, formats: ['hpgl'] },
  { id: 'error', label: 'Error status', command: 'OE;', description: 'Ask the machine for its last HP-GL error code (OE).', expectsReply: true, formats: ['hpgl'] },
  { id: 'page', label: 'Page limits', command: 'OH;', description: 'Ask for the loaded page size in plotter units (OH).', expectsReply: true, formats: ['hpgl'] },
  { id: 'position', label: 'Position', command: 'OA;', description: 'Ask for the carriage position and pen state (OA).', expectsReply: true, formats: ['hpgl'] },
  { id: 'force-speed', label: 'Apply force/speed', command: '', description: 'Push the dialog\'s Graphtec force (FS) and speed (VS) settings to the cutter now.', expectsReply: false, formats: ['hpgl'] },
  { id: 'unlock', label: 'Unlock', command: '$X', description: 'Clear the grbl alarm lock so the machine accepts motion.', expectsReply: false, formats: ['gcode'] },
  { id: 'status', label: 'Status', command: '?', description: 'Request a grbl status report.', expectsReply: true, formats: ['gcode'] },
  { id: 'build', label: 'Build info', command: '$I', description: 'Ask grbl for firmware version info.', expectsReply: true, formats: ['gcode'] },
  { id: 'home', label: 'Home', command: '$H', description: 'Run the grbl homing cycle (needs limit switches).', expectsReply: false, formats: ['gcode'] },
  { id: 'feed-hold', label: 'Pause', command: '!', description: 'Feed hold — decelerate and pause motion (grbl).', expectsReply: false, formats: ['gcode'] },
  { id: 'resume', label: 'Resume', command: '~', description: 'Cycle resume — continue after a feed hold (grbl).', expectsReply: false, formats: ['gcode'] },
  { id: 'machine-status', label: 'Machine status', command: 'OS;', description: 'Ask for the HP-GL machine status word (OS).', expectsReply: true, formats: ['hpgl'] },
  { id: 'feed', label: 'Feed 50 mm', command: 'PU;PR0,-2000;', description: 'Advance media 50 mm toward the operator with the blade up.', expectsReply: false, formats: ['hpgl'] },
  { id: 'eject', label: 'Eject', command: '!PG;', description: 'Eject / advance the sheet (Roland CAMM !PG).', expectsReply: false, formats: ['hpgl'] },
];

/** Jog the carriage by `dx`/`dy` in the operator's unit (Y up). Pen stays up. */
export function buildJog(format: OutputFormat, dx: number, dy: number, unit: 'mm' | 'in', feedMmMin = 3000): string {
  if (format === 'hpgl') {
    const per = unit === 'mm' ? 40 : 1016; // HP-GL plotter units per unit
    return `PU;PR${Math.round(dx * per)},${Math.round(dy * per)};`;
  }
  const feed = Math.max(100, Math.round(feedMmMin));
  const modal = unit === 'mm' ? 'G21' : 'G20';
  return `$J=G91 ${modal} X${dx.toFixed(unit === 'mm' ? 2 : 3)} Y${dy.toFixed(unit === 'mm' ? 2 : 3)} F${feed}`;
}

/** Lift the blade / stop motion — sent when the operator cancels a job. */
export function buildAbortSnippet(format: OutputFormat): string {
  return format === 'hpgl' ? 'PU;' : '!';
}

/** Set the current carriage position as origin. */
export function buildSetOrigin(format: OutputFormat): string {
  return format === 'hpgl' ? 'IP;' : 'G92 X0 Y0';
}

/** The FS/VS values the dialog collected, as an immediate HP-GL statement. */
export function buildForceSpeed(force: number, speed: number): string {
  const parts: string[] = [];
  if (force > 0) parts.push(`FS${Math.round(force)};`);
  if (speed > 0) parts.push(`VS${Math.round(speed)};`);
  return parts.join('');
}

/** Does this machine text expect a reply we should wait for? */
export function isQueryCommand(format: OutputFormat, text: string): boolean {
  if (format === 'hpgl') return /\b(OE|OH|OA|OC|OS|OF|OP|OD)\s*;/i.test(text);
  return /^\s*(\?|\$I|\$#|\$G|\$SS?)/i.test(text);
}

const HPGL_ERRORS: Record<number, string> = {
  0: 'No error',
  1: 'Command error — the machine did not recognise a command',
  2: 'Operand error — a parameter was out of range',
  3: 'Unintelligible command — line noise / parity problem (check baud rate!)',
  4: 'Unrecognised parameter',
};

/** HP-GL OS (Output Status) machine-state words. */
const HPGL_STATUS: Record<number, string> = {
  0: 'Powered on / just initialised',
  1: 'Ready',
  2: 'Busy — drawing or moving',
};

const GRBL_ERRORS: Record<number, string> = {
  1: 'Expected command letter',
  2: 'Bad number format',
  3: 'Invalid $ statement',
  4: 'Negative value rejected',
  5: 'Homing not enabled',
  8: 'Not idle — command needs a still machine',
  9: 'Locked — run $X to unlock',
  15: 'Travel exceeded',
  20: 'Unsupported command',
  22: 'Undefined feed rate',
};

function parseLeadingInt(s: string): number | null {
  const m = s.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

const ETX = String.fromCharCode(3);

/**
 * Turn a raw reply into operator-readable text. `unit` converts plotter
 * units to the operator's unit. Unknown replies pass through verbatim.
 */
export function decodeReply(format: OutputFormat, command: string, reply: string, unit: 'mm' | 'in' = 'mm'): string {
  const raw = reply.replace(/[\r\n;]+$/g, '').replaceAll(ETX, '').trim();
  if (!raw) return '(no reply)';
  if (format === 'gcode') return decodeGrbl(raw);

  const cmd = command.trim().toUpperCase();
  const perUnit = unit === 'mm' ? 40 : 1016;
  const toUnit = (v: number) => unit === 'mm' ? (v / 40).toFixed(2) : (v / 1016).toFixed(3);

  if (cmd.startsWith('OE')) {
    const code = parseLeadingInt(raw);
    if (code === null) return raw;
    const meaning = HPGL_ERRORS[code] ?? `Device-specific code ${code} (see the cutter manual)`;
    return `Error code ${code}: ${meaning}`;
  }
  if (cmd.startsWith('OS')) {
    const code = parseLeadingInt(raw);
    if (code === null) return raw;
    const meaning = HPGL_STATUS[code] ?? `status word ${code} (see the cutter manual)`;
    return `Machine status ${code}: ${meaning}`;
  }
  if (cmd.startsWith('OH')) {
    const nums = raw.split(',').map(Number);
    if (nums.length >= 4 && nums.every(n => Number.isFinite(n))) {
      const [x0, y0, x1, y1] = nums;
      const w = (x1 - x0) / perUnit, h = (y1 - y0) / perUnit;
      return `Page: (${toUnit(x0)}, ${toUnit(y0)}) to (${toUnit(x1)}, ${toUnit(y1)}) ${unit} — ${w.toFixed(0)} × ${h.toFixed(0)} ${unit}`;
    }
    return raw;
  }
  if (cmd.startsWith('OA') || cmd.startsWith('O')) {
    const nums = raw.split(',').map(Number);
    if (nums.length >= 2 && nums.slice(0, 2).every(n => Number.isFinite(n))) {
      const pen = nums.length >= 3 ? (nums[2] ? 'pen DOWN' : 'pen up') : '';
      return `Position: (${toUnit(nums[0])}, ${toUnit(nums[1])}) ${unit}${pen ? ` · ${pen}` : ''}`;
    }
    return raw;
  }
  return raw;
}

function decodeGrbl(raw: string): string {
  if (/^ok/i.test(raw)) return 'ok';
  const err = raw.match(/^error:(\d+)/i);
  if (err) {
    const code = Number(err[1]);
    return `error:${code} — ${GRBL_ERRORS[code] ?? 'see the grbl error list'}`;
  }
  const state = raw.match(/^<(\w+)/);
  if (state) return `State: ${state[1]}`;
  if (/^\[MSG:/i.test(raw)) return raw;
  return raw;
}

/* ------------------------------------------------------------------ *
 * Preflight job linter — a dry-run check of the generated machine code
 * BEFORE it goes to a blade. Catches the classic footguns (empty jobs,
 * plots taller than the page, negative coordinates from a misplaced
 * origin, cut moves with no feed rate) and reports plot extents so the
 * operator can eyeball them against the loaded media.
 */

export interface JobIssue {
  severity: 'error' | 'warn' | 'info';
  message: string;
}

export interface LintStats {
  /** HP-GL statements / G-code motion lines parsed. */
  statements: number;
  /** Pen-down moves that will actually mark/cut. */
  penDownMoves: number;
  /** Pen-down plot extents in the operator's unit, when there are any. */
  plot: { w: number; h: number } | null;
}

export interface LintResult {
  issues: JobIssue[];
  stats: LintStats;
  /** True when no error/warn issues were found. */
  ok: boolean;
}

export interface LintOptions {
  unit?: 'mm' | 'in';
  originBottomLeft?: boolean;
  /** Declared page height in the operator's unit (HP-GL page check). */
  paperHeightUnits?: number;
  penDownZ?: number;
  penUpZ?: number;
}

/** HP-GL mnemonics Anchorworks emits or accepts. Anything else in a job
 *  is flagged — either a vendor extension or a typo worth a look. */
const HPGL_KNOWN = new Set([
  'IN', 'SP', 'PU', 'PD', 'PA', 'PR', 'FS', 'VS', 'IP', 'SC',
  'OA', 'OB', 'OC', 'OD', 'OE', 'OF', 'OH', 'OI', 'OK', 'OL',
  'OP', 'OS', 'OT', 'OW', 'TL', 'LT', 'AC', 'CT', 'TB', 'PG',
  'NP', 'FR', 'DW', 'MC', 'IM', 'CB', 'PT', 'SM', 'EA', 'RA',
]);

function lintHpgl(code: string, ctx: LintOptions, issues: JobIssue[], stats: LintStats): void {
  const per = ctx.unit === 'in' ? 1016 : 40;
  // Statements are ';'-terminated; the generator also separates with
  // newlines. Trim noise so `PU10,20\n` and `PU 10,20` both parse.
  const stmts = code
    .split(';')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  stats.statements = stmts.length;

  let penDown = false;
  let x = 0, y = 0; // tracked position in plotter units
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  stmts.forEach((stmt, i) => {
    if (stmt.startsWith('!')) return; // vendor control (!PG)
    if (/^[-\d.,]/.test(stmt)) return; // bare page-size statement (Roland)

    const m = stmt.match(/^([A-Za-z]{2})\s*(.*)$/);
    if (!m) {
      if (i > 0) issues.push({ severity: 'warn', message: `Unintelligible HP-GL statement: “${stmt.slice(0, 40)}”` });
      return;
    }
    const mnemonic = m[1].toUpperCase();
    if (!HPGL_KNOWN.has(mnemonic)) {
      issues.push({ severity: 'warn', message: `Unknown HP-GL statement “${stmt.slice(0, 40)}” — vendor extension or typo.` });
      return;
    }
    const args = m[2].split(',').map(Number).filter(n => Number.isFinite(n));

    if (mnemonic === 'PU' || mnemonic === 'PD') {
      const newDown = mnemonic === 'PD';
      if (newDown && !penDown) {
        // The pen drops at the CURRENT position before the listed moves —
        // that point is part of the plot extents too.
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      penDown = newDown;
    }
    if (mnemonic === 'PR' || mnemonic === 'PA' || mnemonic === 'PU' || mnemonic === 'PD') {
      const relative = mnemonic === 'PR';
      // Even index = X, odd = Y. A trailing lone X is applied alone.
      for (let k = 0; k + 1 < args.length; k += 2) {
        if (relative) { x += args[k]; y += args[k + 1]; }
        else { x = args[k]; y = args[k + 1]; }
        stats.penDownMoves += penDown ? 1 : 0;
        if (penDown) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
  });

  if (stats.penDownMoves > 0) {
    stats.plot = { w: (maxX - minX) / per, h: (maxY - minY) / per };
  }

  if (stmts.length === 0) {
    issues.push({ severity: 'error', message: 'The job is empty — nothing would be sent.' });
    return;
  }
  if (stats.penDownMoves === 0) {
    issues.push({ severity: 'error', message: 'No pen-down moves — the machine would travel but never cut.' });
  }
  if (!/^IN/i.test(stmts[0])) {
    issues.push({ severity: 'info', message: 'The job does not start with IN — force/speed from the previous job may still apply.' });
  }
  if (minX < -20 || minY < -20) {
    issues.push({
      severity: 'warn',
      message: `The plot extends ${(Math.max(-minX, -minY) / per).toFixed(1)} ${ctx.unit ?? 'mm'} left/below the origin — check media position and the origin setting.`,
    });
  }
  if (ctx.paperHeightUnits && stats.plot && stats.plot.h > ctx.paperHeightUnits) {
    issues.push({
      severity: 'warn',
      message: `The plot is ${stats.plot.h.toFixed(0)} ${ctx.unit ?? 'mm'} tall but the page is ${ctx.paperHeightUnits} — the cutter may refuse or clip it.`,
    });
  }
  const longest = Math.max(...stmts.map(s => s.length));
  if (longest > 4000) {
    issues.push({ severity: 'info', message: `Longest statement is ${longest} characters — some cutter buffers choke on huge single statements (raise curve tolerance to split points).` });
  }
}

function lintGcode(code: string, ctx: LintOptions, issues: JobIssue[], stats: LintStats): void {
  const lines = code.split('\n').map(l => l.trim());
  let absolute = true;
  let unitSeen = false;
  let feedSeen = false;
  let programEnd = false;
  let x = 0, y = 0;
  const penDownZ = ctx.penDownZ ?? -1;
  const penUpZ = ctx.penUpZ ?? 5;
  let penDown = false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const line of lines) {
    const bare = line.replace(/;.*$/, '').replace(/\([^)]*\)/g, '').trim();
    if (!bare) { if (/M(30|2)\b/.test(line)) programEnd = true; continue; }
    if (/^\$\$?$/.test(bare) || /^\$\d+=/.test(bare)) {
      issues.push({ severity: 'warn', message: `“${bare}” writes grbl settings — not a plotting move.` });
      continue;
    }
    const words: Array<[string, number]> = [];
    for (const w of bare.matchAll(/([A-Za-z])([-+]?\d*\.?\d+)/g)) words.push([w[1].toUpperCase(), Number(w[2])]);
    let motion = false;
    let hasXY = false;
    for (const [letter, value] of words) {
      switch (letter) {
        case 'G':
          if (value === 90) absolute = true;
          else if (value === 91) absolute = false;
          else if (value === 20 || value === 21) unitSeen = true;
          else if (value === 0 || value === 1 || value === 2 || value === 3) motion = true;
          break;
        case 'F': feedSeen = true; break;
        case 'X': hasXY = true; x = absolute ? value : x + value; break;
        case 'Y': hasXY = true; y = absolute ? value : y + value; break;
        case 'Z': {
          const down = value <= Math.min(penDownZ, penUpZ) + 0.01;
          if (down && !penDown) {
            // The pen drops at the CURRENT position — part of the plot.
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
          penDown = down;
          break;
        }
        case 'M': if (value === 30 || value === 2) programEnd = true; break;
      }
    }
    if (motion) stats.statements++;
    if (motion && hasXY) {
      if (penDown) {
        stats.penDownMoves++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      if (penDown && !feedSeen) {
        issues.push({ severity: 'error', message: `Cutting move with no feed rate set: “${line.slice(0, 40)}”.` });
      }
    }
  }

  if (stats.penDownMoves > 0) {
    stats.plot = { w: maxX - minX, h: maxY - minY };
  }

  if (stats.statements === 0) {
    issues.push({ severity: 'error', message: 'The job is empty — no motion commands.' });
    return;
  }
  if (!unitSeen) {
    issues.push({ severity: 'warn', message: 'No G20/G21 unit selection — the machine default applies.' });
  }
  if (minX < -0.01 || minY < -0.01) {
    issues.push({
      severity: 'warn',
      message: `The plot reaches negative coordinates (${minX.toFixed(1)}, ${minY.toFixed(1)}) — usually a wrong origin or mirror setting.`,
    });
  }
  if (!programEnd) {
    issues.push({ severity: 'info', message: 'No M30/M2 program end — grbl just stops after the last line.' });
  }
}

/** Dry-run check of generated machine code. Pure function — safe to run
 *  on every preview refresh. */
export function lintJob(format: OutputFormat, code: string, ctx: LintOptions = {}): LintResult {
  const stats: LintStats = { statements: 0, penDownMoves: 0, plot: null };
  const issues: JobIssue[] = [];
  if (!code.trim()) {
    issues.push({ severity: 'error', message: 'The job is empty — nothing would be sent.' });
    return { issues, stats, ok: false };
  }
  if (format === 'hpgl') lintHpgl(code, ctx, issues, stats);
  else lintGcode(code, ctx, issues, stats);
  return { issues, stats, ok: !issues.some(i => i.severity !== 'info') };
}
