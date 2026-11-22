import { describe, it, expect } from 'vitest';
import { parseGrblSettings, runAutoSetup, type AutoSetupLink } from '../plotterAutoSetup';
import type { NativeSerialPort } from '../plotter';
import type { LinkStatus } from '../plotterLink';

const port = (path: string, vid?: number, pid?: number, kind: NativeSerialPort['kind'] = 'usb'): NativeSerialPort =>
  ({ path, kind, vid, pid });

/* ------------------------------------------------------------------ *
 * Stub link — same shape the diagnostics tests use (plotterDiag.test.ts):
 * open/close flip `status`, `query` answers from a per-(port, baud, cmd)
 * resolver so tests can make machines answer only at the right baud.
 */
type ReplyFn = (cmd: string, portPath: string, baud: number) => string;

function stubLink(reply: ReplyFn): AutoSetupLink & { openCalls: Array<{ portPath?: string; baud: number }> } {
  let portPath = '';
  const link: AutoSetupLink & { openCalls: Array<{ portPath?: string; baud: number }> } = {
    status: 'idle' as LinkStatus,
    baud: 0,
    openCalls: [],
    async open(o) {
      link.openCalls.push({ portPath: o.portPath, baud: o.baud });
      portPath = o.portPath ?? '';
      link.baud = o.baud;
      link.status = 'connected';
    },
    async close() { link.status = 'idle'; },
    async send() { /* unused by auto-setup */ },
    async query(cmd) { return reply(cmd, portPath, link.baud); },
  };
  return link;
}

describe('parseGrblSettings', () => {
  it('parses $key=value pairs and ignores the ok terminator', () => {
    expect(parseGrblSettings('$0=10\r\n$32=1\r\n$130=300.000\r\nok')).toEqual([
      { key: '$0', value: '10' },
      { key: '$32', value: '1' },
      { key: '$130', value: '300.000' },
    ]);
    expect(parseGrblSettings('ok')).toEqual([]);
    expect(parseGrblSettings('')).toEqual([]);
  });
});

describe('runAutoSetup', () => {
  it('CP2102 + grbl → gcode format, grbl-generic profile, $I build, $$ snapshot', async () => {
    const link = stubLink((cmd, _p, baud) => {
      if (baud !== 115200) return '';
      if (cmd === '?') return '<Idle|MPos:0.000,0.000,0.000>';
      if (cmd === '$I') return '[VER:1.1h.20190825:]\r\nok';
      if (cmd === '$$') return '$0=10\r\n$32=0\r\n$130=300.000\r\n$131=210.000\r\nok';
      return '';
    });
    const result = await runAutoSetup(link, [port('COM4', 0x10c4, 0xea60)], { bauds: [9600, 115200] });
    expect(result.found).toBe(true);
    expect(result.grbl).toBe(true);
    expect(result.format).toBe('gcode');
    expect(result.profileId).toBe('grbl-generic');
    expect(result.port).toBe('COM4');
    expect(result.baud).toBe(115200);
    expect(result.grblBuild).toContain('1.1h');
    expect(result.grblSettings.find(s => s.key === '$130')?.value).toBe('300.000');
    // steps: ports → scan → $I → $$ → self-test → profile
    const labels = result.steps.map(s => s.label);
    expect(labels).toContain('Scan');
    expect(labels).toContain('$I');
    expect(labels).toContain('$$');
    expect(labels).toContain('Profile');
    expect(result.steps.find(s => s.label === 'Scan')!.status).toBe('pass');
    // The link was idle at entry → auto-setup must NOT leave it connected.
    expect(link.status).toBe('idle');
  });

  it('grbl with $32=1 suggests the laser profile', async () => {
    const link = stubLink((cmd) => {
      if (cmd === '?') return '<Idle|MPos:0.000,0.000,0.000>';
      if (cmd === '$I') return '[VER:1.1h.20190825:]';
      // $$ truncated to its first line (the link resolves on the first
      // terminator) — the $32 fallback query must still classify laser.
      if (cmd === '$$') return '$0=10\r\n';
      if (cmd === '$32') return '$32=1';
      return '';
    });
    const result = await runAutoSetup(link, [port('COM6', 0x0483, 0x5740)], { bauds: [115200] });
    expect(result.found).toBe(true);
    expect(result.format).toBe('gcode');
    expect(result.profileId).toBe('grbl-laser');
    expect(result.grblSettings.find(s => s.key === '$32')?.value).toBe('1');
  });

  it('OI; answering "GX-24" → hpgl format + roland-camm1', async () => {
    const link = stubLink((cmd, _p, baud) => {
      if (baud !== 9600) return '';
      if (cmd === 'OI;') return 'GX-24\r\n';
      if (cmd === 'OE;') return '0\r\n';
      return '';
    });
    const result = await runAutoSetup(link, [port('COM3', 0x0403, 0x6001)], { bauds: [9600] });
    expect(result.found).toBe(true);
    expect(result.grbl).toBe(false);
    expect(result.format).toBe('hpgl');
    expect(result.model).toBe('GX-24');
    expect(result.profileId).toBe('roland-camm1');
    expect(result.steps.find(s => s.label === 'OI;')!.status).toBe('pass');
  });

  it('FTDI + OI; "CE6000-60" suggests the graphtec-fc profile', async () => {
    const link = stubLink((cmd) => (cmd === 'OI;' ? 'CE6000-60\r\n' : ''));
    const result = await runAutoSetup(link, [port('COM9', 0x0403, 0x6001)], { bauds: [9600] });
    expect(result.found).toBe(true);
    expect(result.profileId).toBe('graphtec-fc');
  });

  it('silent CH340 → suspected china-clone on the current format, not "found"', async () => {
    const link = stubLink(() => '');
    const result = await runAutoSetup(link, [port('COM5', 0x1a86, 0x7523)], { bauds: [9600], currentFormat: 'hpgl' });
    expect(result.found).toBe(false);
    expect(result.suspectedClone).toBe(true);
    expect(result.profileId).toBe('china-clone');
    expect(result.format).toBe('hpgl');
    expect(result.port).toBe('COM5');
    expect(result.baud).toBe(9600); // the chip's probe baud
    expect(link.status).toBe('idle');
  });

  it('silent ports with no cutter chip → no suggestion, no crash', async () => {
    const link = stubLink(() => '');
    const result = await runAutoSetup(link, [port('COM1')], { bauds: [9600] });
    expect(result.found).toBe(false);
    expect(result.suspectedClone).toBe(false);
    expect(result.profileId).toBeNull();
    expect(result.port).toBe('');
    expect(result.steps.some(s => s.status === 'fail')).toBe(false);
  });

  it('reports no candidate ports without probing', async () => {
    const link = stubLink(() => {
      throw new Error('should not be called');
    });
    const result = await runAutoSetup(link, [port('COM2', 1, 2, 'bluetooth')]);
    expect(result.found).toBe(false);
    expect(result.steps[0].status).toBe('fail');
    expect(link.openCalls).toHaveLength(0);
  });

  it('survives a failed reopen during the identify leg (fail step, still suggests)', async () => {
    const link = stubLink((cmd) => (cmd === 'OI;' ? 'MIMAKI CG60' : ''));
    let opens = 0;
    const realOpen = link.open.bind(link);
    link.open = async (o) => {
      opens += 1;
      // First open = the scan probe; the post-scan reopen fails.
      if (opens > 1) throw new Error('port busy');
      await realOpen(o);
    };
    const result = await runAutoSetup(link, [port('COM7', 0x0403, 0x6001)], { bauds: [9600] });
    expect(result.found).toBe(true);
    expect(result.steps.some(s => s.status === 'fail')).toBe(true);
    expect(result.steps.find(s => s.label === 'Identify')!.detail).toContain('port busy');
    // The scan's model-based suggestion survives the failed identify leg.
    expect(result.profileId).toBe('mimaki-cg');
    expect(link.status).toBe('idle');
  });
});
