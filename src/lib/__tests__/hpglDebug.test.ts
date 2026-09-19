import { describe, it, expect } from 'vitest';
import {
  buildJog,
  buildSetOrigin,
  buildAbortSnippet,
  buildForceSpeed,
  isQueryCommand,
  decodeReply,
  lintJob,
  simulateMachineCode,
  explainStep,
  parsePositionReply,
  parsePageReply,
  sniffFormat,
  QUICK_COMMANDS,
} from '../hpglDebug';

describe('buildJog', () => {
  it('emits a pen-up relative move in HP-GL plotter units (mm)', () => {
    expect(buildJog('hpgl', 10, 5, 'mm')).toBe('PU;PR400,200;');
  });

  it('converts inches to 1016 units per inch', () => {
    expect(buildJog('hpgl', 1, -1, 'in')).toBe('PU;PR1016,-1016;');
  });

  it('emits a grbl incremental jog for gcode', () => {
    expect(buildJog('gcode', 10, 5, 'mm', 1500)).toBe('$J=G91 G21 X10.00 Y5.00 F1500');
  });

  it('uses G20 when the unit is inches', () => {
    expect(buildJog('gcode', 1, 0, 'in', 1500)).toBe('$J=G91 G20 X1.000 Y0.000 F1500');
  });
});

describe('machine snippets', () => {
  it('builds origin-set commands per format', () => {
    expect(buildSetOrigin('hpgl')).toBe('IP;');
    expect(buildSetOrigin('gcode')).toBe('G92 X0 Y0');
  });

  it('builds abort snippets that stop the machine safely', () => {
    expect(buildAbortSnippet('hpgl')).toBe('PU;');
    expect(buildAbortSnippet('gcode')).toBe('!');
  });

  it('builds Graphtec force/speed statements, skipping zeros', () => {
    expect(buildForceSpeed(30, 20)).toBe('FS30;VS20;');
    expect(buildForceSpeed(0, 20)).toBe('VS20;');
    expect(buildForceSpeed(45, 0)).toBe('FS45;');
    expect(buildForceSpeed(0, 0)).toBe('');
  });
});

describe('isQueryCommand', () => {
  it('recognises HP-GL output commands', () => {
    expect(isQueryCommand('hpgl', 'OE;')).toBe(true);
    expect(isQueryCommand('hpgl', 'PA0,0;OH;')).toBe(true);
    expect(isQueryCommand('hpgl', 'IN;')).toBe(false);
    expect(isQueryCommand('hpgl', 'PD100,100;')).toBe(false);
  });

  it('recognises grbl report requests', () => {
    expect(isQueryCommand('gcode', '?')).toBe(true);
    expect(isQueryCommand('gcode', '$I')).toBe(true);
    expect(isQueryCommand('gcode', 'G0 X10')).toBe(false);
  });
});

describe('decodeReply', () => {
  it('decodes the HP-GL no-error code', () => {
    expect(decodeReply('hpgl', 'OE;', '0\r\n')).toBe('Error code 0: No error');
  });

  it('decodes the parity error code with the baud-rate hint', () => {
    expect(decodeReply('hpgl', 'OE;', '3')).toContain('baud rate');
  });

  it('decodes unknown vendor codes without crashing', () => {
    expect(decodeReply('hpgl', 'OE;', '99')).toContain('99');
  });

  it('decodes OH page limits into mm', () => {
    const out = decodeReply('hpgl', 'OH;', '0,0,11280,7920\r\n', 'mm');
    expect(out).toContain('282.00');
    expect(out).toContain('282 × 198 mm');
  });

  it('decodes OA position with pen state', () => {
    expect(decodeReply('hpgl', 'OA;', '400,200,0\r')).toBe('Position: (10.00, 5.00) mm · pen up');
    expect(decodeReply('hpgl', 'OA;', '400,200,1\r')).toContain('pen DOWN');
  });

  it('converts plotter units to inches when asked', () => {
    expect(decodeReply('hpgl', 'OA;', '1016,0,0\r', 'in')).toContain('(1.000, 0.000) in');
  });

  it('decodes grbl replies', () => {
    expect(decodeReply('gcode', '?', 'ok')).toBe('ok');
    expect(decodeReply('gcode', '?', 'error:9')).toContain('Locked');
    expect(decodeReply('gcode', '?', '<Idle|MPos:0.000,0.000,0.000|FS:0,0>')).toBe('State: Idle');
  });

  it('flags silence instead of an empty string', () => {
    expect(decodeReply('hpgl', 'OE;', '')).toBe('(no reply)');
    expect(decodeReply('hpgl', 'OE;', '\r\n')).toBe('(no reply)');
  });

  it('decodes the OS machine status word', () => {
    expect(decodeReply('hpgl', 'OS;', '1')).toBe('Machine status 1: Ready');
    expect(decodeReply('hpgl', 'OS;', '99')).toContain('99');
  });

  it('strips the ETX terminator some firmwares use', () => {
    expect(decodeReply('hpgl', 'OE;', '0\x03')).toBe('Error code 0: No error');
  });
});

describe('QUICK_COMMANDS', () => {
  it('every command has non-empty text except the composed force/speed one', () => {
    for (const cmd of QUICK_COMMANDS) {
      if (cmd.id !== 'force-speed') expect(cmd.command.length).toBeGreaterThan(0);
      expect(cmd.label.length).toBeGreaterThan(0);
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it('splits cleanly between the two formats', () => {
    const hpgl = QUICK_COMMANDS.filter(c => c.formats?.includes('hpgl'));
    const gcode = QUICK_COMMANDS.filter(c => c.formats?.includes('gcode'));
    expect(hpgl.length).toBeGreaterThan(4);
    expect(gcode.length).toBeGreaterThan(3);
    expect(hpgl.some(c => c.id === 'error')).toBe(true);
    expect(gcode.some(c => c.id === 'status')).toBe(true);
  });
});

describe('lintJob — HP-GL', () => {
  it('accepts a generated-style bare job and reports plot extents', () => {
    const code = ['IN;', 'SP1;', 'PU400,800;', 'PD400,1200,800,1200;', 'PU0,0;', 'SP0;'].join('\n');
    const res = lintJob('hpgl', code, { unit: 'mm' });
    expect(res.ok).toBe(true);
    expect(res.issues).toHaveLength(0);
    expect(res.stats.penDownMoves).toBe(2);
    expect(res.stats.plot).toEqual({ w: 10, h: 10 });
  });

  it('flags an empty job', () => {
    const res = lintJob('hpgl', '   ');
    expect(res.ok).toBe(false);
    expect(res.issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('flags a job with no pen-down moves', () => {
    const res = lintJob('hpgl', 'IN;PU100,100;');
    expect(res.issues.some(i => i.severity === 'error' && i.message.includes('pen-down'))).toBe(true);
  });

  it('warns when the plot runs left/below the origin', () => {
    const res = lintJob('hpgl', 'IN;PD-2000,100;');
    expect(res.issues.some(i => i.severity === 'warn' && i.message.includes('origin'))).toBe(true);
  });

  it('warns when the plot is taller than the declared page', () => {
    const res = lintJob('hpgl', 'IN;PD0,0,0,4000;', { unit: 'mm', paperHeightUnits: 50 });
    expect(res.issues.some(i => i.severity === 'warn' && i.message.includes('page'))).toBe(true);
  });

  it('tolerates Roland page statements and !PG, flags unknown mnemonics', () => {
    const roland = ['TB25;', '11280,7920;', 'CT1;', 'IN;', 'PD100,100;', '!PG;'].join('\n');
    expect(lintJob('hpgl', roland).issues.filter(i => i.message.includes('Unknown'))).toHaveLength(0);
    const dirty = lintJob('hpgl', 'IN;XX12;');
    expect(dirty.issues.some(i => i.severity === 'warn' && i.message.includes('XX12'))).toBe(true);
  });

  it('notes a missing IN as info only (still passes)', () => {
    const res = lintJob('hpgl', 'SP1;PD100,100;');
    expect(res.ok).toBe(true);
    expect(res.issues.every(i => i.severity === 'info')).toBe(true);
  });
});

describe('lintJob — G-code', () => {
  const good = [
    '; Anchorworks — G-code output',
    'G21 ; mm',
    'G90 ; absolute',
    'G0 Z5.000 F3000',
    'G0 X1.000 Y2.000 F3000',
    'G1 Z-1.000 F1500',
    'G1 X10.000 Y2.000 F1500',
    'G0 Z5.000 F3000',
    'M30 ; end',
  ].join('\n');

  it('accepts a generated-style job and reports plot extents', () => {
    const res = lintJob('gcode', good, { penDownZ: -1, penUpZ: 5 });
    expect(res.ok).toBe(true);
    expect(res.issues).toHaveLength(0);
    expect(res.stats.penDownMoves).toBe(1);
    expect(res.stats.plot?.w).toBeCloseTo(9, 3);
  });

  it('errors on cutting moves with no feed rate', () => {
    const res = lintJob('gcode', 'G21\nG90\nG1 Z-1\nG1 X10 Y0\nM30');
    expect(res.issues.some(i => i.severity === 'error' && i.message.includes('feed rate'))).toBe(true);
  });

  it('warns on negative coordinates (wrong origin / mirror)', () => {
    const res = lintJob('gcode', 'G21\nG90\nG0 Z5 F3000\nG0 X-5 Y0 F3000\nG1 Z-1 F1000\nG1 X-1 Y0 F1000\nM30');
    expect(res.issues.some(i => i.severity === 'warn' && i.message.includes('negative'))).toBe(true);
  });

  it('warns on missing unit selection and grbl settings writes', () => {
    const res = lintJob('gcode', 'G90\nG0 Z5 F1000\nG1 X1 F1000\nM30\n$$');
    expect(res.issues.some(i => i.message.includes('G20/G21'))).toBe(true);
    expect(res.issues.some(i => i.message.includes('grbl settings'))).toBe(true);
  });

  it('notes a missing M30 as info only', () => {
    const res = lintJob('gcode', 'G21\nG90\nG0 Z5 F1000\nG1 X1 F1000');
    expect(res.ok).toBe(true);
    expect(res.issues.some(i => i.severity === 'info' && i.message.includes('M30'))).toBe(true);
  });
});

describe('simulateMachineCode — HP-GL', () => {
  const square = ['IN;', 'SP1;', 'PU400,800;', 'PD400,1200,800,1200,800,800;', 'PU0,0;', 'SP0;'].join('\n');

  it('parses pen-down runs including the drop position', () => {
    const run = simulateMachineCode('hpgl', square, 'mm');
    // One cut polyline: (10,20) → (10,30) → (20,30) → (20,20)
    expect(run.cuts).toHaveLength(1);
    expect(run.cuts[0]).toEqual([[10, 20], [10, 30], [20, 30], [20, 20]]);
    expect(run.penDownMoves).toBe(3);
  });

  it('reports cut/travel lengths and the bbox in operator units', () => {
    const run = simulateMachineCode('hpgl', square, 'mm');
    expect(run.cutLen).toBeCloseTo(30, 6); // 10+10+10
    expect(run.travelLen).toBeGreaterThan(0);
    expect(run.bbox).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 30 });
  });

  it('converts to inches at 1016 units', () => {
    const run = simulateMachineCode('hpgl', 'IN;PD1016,0;', 'in');
    expect(run.cutLen).toBeCloseTo(1, 6);
  });

  it('classifies setup / query / vendor statements', () => {
    const run = simulateMachineCode('hpgl', ['TB25;', '11280,7920;', 'CT1;', 'OE;', 'PD400,400;', '!PG;'].join('\n'), 'mm');
    const kinds = Object.fromEntries(run.steps.map(s => [s.stmt, s.kind]));
    expect(kinds['TB25']).toBe('setup');
    expect(kinds['11280,7920']).toBe('setup');
    expect(kinds['CT1']).toBe('setup');
    expect(kinds['OE']).toBe('query');
    expect(kinds['!PG']).toBe('vendor');
  });

  it('returns an empty run for empty code', () => {
    const run = simulateMachineCode('hpgl', '  ');
    expect(run.steps).toHaveLength(0);
    expect(run.bbox).toBeNull();
  });
});

describe('simulateMachineCode — G-code', () => {
  const job = [
    'G21 ; mm',
    'G90 ; absolute',
    'G0 Z5.000 F3000',
    'G0 X1.000 Y2.000 F3000',
    'G1 Z-1.000 F1500',
    'G1 X10.000 Y2.000 F1500',
    'G0 Z5.000 F3000',
    'M30 ; end',
  ].join('\n');

  it('tracks the pen-drop position into the cut run', () => {
    const run = simulateMachineCode('gcode', job);
    expect(run.cuts).toHaveLength(1);
    expect(run.cuts[0]).toEqual([[1, 2], [10, 2]]);
    expect(run.penDownMoves).toBe(1);
    expect(run.cutLen).toBeCloseTo(9, 6);
  });

  it('classifies setup and end lines', () => {
    const run = simulateMachineCode('gcode', job);
    const kinds = Object.fromEntries(run.steps.map(s => [s.stmt, s.kind]));
    expect(kinds['G21 ; mm']).toBe('setup');
    expect(kinds['G90 ; absolute']).toBe('setup');
    expect(kinds['M30 ; end']).toBe('end');
    expect(kinds['G1 X10.000 Y2.000 F1500']).toBe('cut');
    expect(kinds['G0 X1.000 Y2.000 F3000']).toBe('travel');
  });

  it('handles relative mode', () => {
    const run = simulateMachineCode('gcode', 'G91\nG1 Z-1 F500\nG1 X10 Y0 F500\nG1 X0 Y10 F500');
    expect(run.cuts[0]).toEqual([[0, 0], [10, 0], [10, 10]]);
  });
});

describe('explainStep', () => {
  const explain = (stmt: string, format: 'gcode' | 'hpgl' = 'hpgl') => {
    const run = simulateMachineCode(format, stmt.includes(';') ? stmt : stmt, 'mm');
    return run.steps.length > 0 ? explainStep(run.steps[run.steps.length - 1], 'mm') : '';
  };

  it('explains common HP-GL statements in operator units', () => {
    expect(explain('IN;')).toContain('Initialize');
    expect(explain('FS30;')).toContain('30');
    expect(explain('VS20;')).toContain('20');
    expect(explain('PU;')).toContain('Raise');
    expect(explain('PD400,800;')).toContain('(10.00, 20.00)');
    expect(explain('OE;')).toContain('expects a reply');
    expect(explain('!PG;')).toContain('eject');
  });

  it('explains G-code setup and motion lines', () => {
    const pick = (code: string, needle: string) => {
      const run = simulateMachineCode('gcode', code);
      return explainStep(run.steps.find(s => s.stmt.includes(needle))!, 'mm');
    };
    expect(pick('G21', 'G21')).toContain('millimetres');
    expect(pick('G20', 'G20')).toContain('inches');
    expect(pick('G90', 'G90')).toContain('Absolute');
    expect(pick('M30', 'M30')).toContain('End');
  });
});

describe('parsePositionReply', () => {
  it('parses HP-GL OA replies including pen state', () => {
    expect(parsePositionReply('hpgl', '400,800,1\r', 'mm')).toEqual({ x: 10, y: 20, penDown: true });
    expect(parsePositionReply('hpgl', '400,800,0', 'mm')).toEqual({ x: 10, y: 20, penDown: false });
    expect(parsePositionReply('hpgl', '1016,0,1', 'in')).toEqual({ x: 1, y: 0, penDown: true });
  });

  it('parses grbl MPos/WPos status reports with the state word', () => {
    expect(parsePositionReply('gcode', '<Idle|MPos:10.500,20.000,5.000|FS:0,0>')).toEqual({ x: 10.5, y: 20, state: 'Idle' });
    expect(parsePositionReply('gcode', '<Run|WPos:1.0,2.0,0.0>')).toEqual({ x: 1, y: 2, state: 'Run' });
    // Sub-state variants like Hold:0 keep the bare word.
    expect(parsePositionReply('gcode', '<Hold:0|MPos:0.000,0.000,0.000>')?.state).toBe('Hold');
  });

  it('returns null for silence or garbage', () => {
    expect(parsePositionReply('hpgl', '')).toBeNull();
    expect(parsePositionReply('hpgl', '\r\n')).toBeNull();
    expect(parsePositionReply('gcode', 'ok')).toBeNull();
  });
});

describe('parsePageReply', () => {
  it('parses OH hard-clip limits into the operator unit', () => {
    expect(parsePageReply('0,0,11280,7920\r\n', 'mm')).toEqual({ x0: 0, y0: 0, x1: 282, y1: 198 });
    expect(parsePageReply('0,0,10160,10160', 'in')).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
  });

  it('returns null for short or non-numeric replies', () => {
    expect(parsePageReply('')).toBeNull();
    expect(parsePageReply('0,0')).toBeNull();
    expect(parsePageReply('a,b,c,d')).toBeNull();
  });
});

describe('MachineRun.segs — statement tagging', () => {
  it('tags each polyline with the statement that produced it', () => {
    const code = ['IN;', 'PU400,800;', 'PD400,1200,800,1200;', 'PU0,0;'].join('\n');
    const run = simulateMachineCode('hpgl', code, 'mm');
    expect(run.segs.map(s => ({ down: s.penDown, step: s.stepIndex }))).toEqual([
      { down: false, step: 1 }, // PU400,800 travel to the start point
      { down: true, step: 2 },  // PD… (pen drops, then cuts)
      { down: false, step: 3 }, // PU0,0 travel
    ]);
  });

  it('keeps seg points identical to the cuts/travels arrays', () => {
    const code = 'IN;PU400,800;PD400,1200,800,1200;';
    const run = simulateMachineCode('hpgl', code, 'mm');
    expect(run.segs.filter(s => s.penDown).map(s => s.pts)).toEqual(run.cuts);
    expect(run.segs.filter(s => !s.penDown).map(s => s.pts)).toEqual(run.travels);
  });
});

describe('HP-GL arcs — AA / AR / CI', () => {
  it('flattens CI into a full circle with the right length and extents', () => {
    // Center (10,10) mm, r = 10 mm → circle 2π·10 ≈ 62.83 mm plus the
    // drop-to-circle and return-to-center radii (10 + 10 mm).
    const run = simulateMachineCode('hpgl', 'IN;PU400,400;PD;CI400;', 'mm');
    expect(run.cutLen).toBeGreaterThan(80);
    expect(run.cutLen).toBeLessThan(85);
    expect(run.bbox?.minX).toBeCloseTo(0, 1);
    expect(run.bbox?.maxX).toBeCloseTo(20, 1);
    expect(run.bbox?.minY).toBeCloseTo(0, 1);
    // CI ends back at the circle center.
    const last = run.steps[run.steps.length - 1];
    expect(last.to).toEqual([10, 10]);
  });

  it('flattens AA quarter arcs with honest extents', () => {
    // Start (0,0), center (10,0) mm, sweep +90° CCW → arc ends at (10,-10).
    const run = simulateMachineCode('hpgl', 'IN;PU0,0;PD;AA400,0,90;', 'mm');
    expect(run.cutLen).toBeGreaterThan(14);   // π·10/2 ≈ 15.7
    expect(run.cutLen).toBeLessThan(17);
    expect(run.bbox?.minY).toBeCloseTo(-10, 1);
    expect(run.bbox?.maxX).toBeCloseTo(10, 1);
  });

  it('classifies arcs as cut/travel statements, not setup', () => {
    const run = simulateMachineCode('hpgl', 'IN;PD;CI400;', 'mm');
    const ci = run.steps.find(s => s.stmt.startsWith('CI'));
    expect(ci?.kind).toBe('cut');
    expect(ci?.moved).toBe(true);
  });

  it('lint accepts AA/AR/CI without unknown warnings and tracks extents', () => {
    const res = lintJob('hpgl', 'IN;PD;CI400;', { unit: 'mm' });
    expect(res.issues.some(i => i.message.includes('Unknown'))).toBe(false);
    expect(res.stats.plot?.h).toBeCloseTo(20, 1);
    const ar = lintJob('hpgl', 'IN;PD0,0;AR400,0,90;', { unit: 'mm' });
    expect(ar.issues.some(i => i.message.includes('Unknown'))).toBe(false);
  });
});

describe('sniffFormat', () => {
  it('recognises HP-GL by its statement verbs', () => {
    expect(sniffFormat('IN;SP1;PU100,100;PD200,200;')).toBe('hpgl');
    expect(sniffFormat('PU 10 20;PD 30 40;')).toBe('hpgl');
  });

  it('recognises grbl G-code by motion codes and $ commands', () => {
    expect(sniffFormat('; job\nG21\nG90\nG0 Z5\nG1 X10 F1500\nM30')).toBe('gcode');
    expect(sniffFormat('$X\n$H\n?')).toBe('gcode');
  });

  it('falls back to HP-GL for headerless .plt-style content', () => {
    expect(sniffFormat('100,200,300,400\n')).toBe('hpgl');
  });
});
