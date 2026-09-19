import { describe, it, expect } from 'vitest';
import {
  buildJog,
  buildSetOrigin,
  buildAbortSnippet,
  buildForceSpeed,
  isQueryCommand,
  decodeReply,
  lintJob,
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
