import { describe, it, expect } from 'vitest';
import { autoDetectCutter, chipForVidPid, chipForPort, identifyMachine, suggestProfileFromModel, rankCutterPorts } from '../plotterIdentify';
import type { NativeSerialPort } from '../plotter';
import type { LinkStatus } from '../plotterLink';

const port = (path: string, vid?: number, pid?: number, kind: NativeSerialPort['kind'] = 'usb'): NativeSerialPort =>
  ({ path, kind, vid, pid });

describe('chipForVidPid', () => {
  it('recognises the CH340 inside Chinese cutter clones as high-likelihood', () => {
    const chip = chipForVidPid(0x1a86, 0x7523);
    expect(chip).not.toBeNull();
    expect(chip!.chip).toContain('CH340');
    expect(chip!.likelihood).toBe('high');
    expect(chip!.probeBaud).toBe(9600);
  });

  it('recognises FTDI / Prolific / CP2102 as medium-likelihood', () => {
    expect(chipForVidPid(0x0403, 0x6001)!.likelihood).toBe('medium');
    expect(chipForVidPid(0x067b, 0x2303)!.chip).toBe('PL2303');
    expect(chipForVidPid(0x10c4, 0xea60)!.probeBaud).toBe(115200); // grbl convention
  });

  it('falls back to a maker guess on an unknown PID from a known vendor', () => {
    const chip = chipForVidPid(0x0403, 0xffff);
    expect(chip!.maker).toBe('FTDI');
    expect(chip!.chip).toContain('FTDI');
  });

  it('returns null for unknown vendors and missing vids', () => {
    expect(chipForVidPid(0xabcd, 0x1234)).toBeNull();
    expect(chipForVidPid(undefined, undefined)).toBeNull();
  });

  it('works through chipForPort', () => {
    expect(chipForPort(port('COM3', 0x1a86, 0x7523))!.chip).toContain('CH340');
    expect(chipForPort(port('COM3'))).toBeNull();
  });
});

describe('suggestProfileFromModel', () => {
  it('maps known model strings to profiles', () => {
    expect(suggestProfileFromModel('GX-24')).toBe('roland-camm1');
    expect(suggestProfileFromModel('CAMM-1 GS-24')).toBe('roland-camm1');
    expect(suggestProfileFromModel('PNC-950')).toBe('roland-pnc');
    expect(suggestProfileFromModel('CE6000-60')).toBe('graphtec-fc');
    expect(suggestProfileFromModel('FC9000')).toBe('graphtec-fc');
    expect(suggestProfileFromModel('Craft Robo CC200')).toBe('graphtec-ce');
    expect(suggestProfileFromModel('CG-60SL')).toBe('mimaki-cg');
    expect(suggestProfileFromModel('SummaCut D60')).toBe('summa');
    expect(suggestProfileFromModel('GCC Puma II')).toBe('gcc');
    expect(suggestProfileFromModel('HP7475A')).toBe('generic-hpgl');
  });

  it('recognises the Chinese clone families', () => {
    expect(suggestProfileFromModel('Creation PCut')).toBe('china-clone');
    expect(suggestProfileFromModel('LIYU SC631')).toBe('china-clone');
    expect(suggestProfileFromModel('Redsail RS720')).toBe('china-clone');
  });

  it('returns null for silence or unknown models', () => {
    expect(suggestProfileFromModel('')).toBeNull();
    expect(suggestProfileFromModel('   ')).toBeNull();
    expect(suggestProfileFromModel('SomeThingElse')).toBeNull();
  });
});

describe('rankCutterPorts', () => {
  it('ranks CH340 ports above generic USB, drops bluetooth/pci', () => {
    const ranked = rankCutterPorts([
      port('COM9', undefined, undefined, 'bluetooth'),
      port('COM1', 0x1234, 0x5678),
      port('COM7', 0x0403, 0x6001),
      port('COM5', 0x1a86, 0x7523),
    ]);
    expect(ranked.map(r => r.port.path)).toEqual(['COM5', 'COM7', 'COM1']);
    expect(ranked[0].chip!.likelihood).toBe('high');
  });
});

/* ---------------- identifyMachine ---------------- */

describe('identifyMachine', () => {
  it('suggests grbl-generic when $I answers on gcode format', async () => {
    const r = await identifyMachine({
      status: 'connected',
      query: async (cmd) => (cmd === '$I' ? '[VER:1.1h.20190825:]' : ''),
    }, 'gcode');
    expect(r.model).toContain('1.1h');
    expect(r.suggestedProfileId).toBe('grbl-generic');
    expect(r.summary).toContain('grbl firmware');
  });

  it('keeps gcode silence honest (no suggestion, no fault claim)', async () => {
    const r = await identifyMachine({ status: 'connected', query: async () => '' }, 'gcode');
    expect(r.model).toBe('');
    expect(r.suggestedProfileId).toBeNull();
    expect(r.summary).toContain('No reply');
  });
});

/* ---------------- autoDetectCutter with a stubbed link ---------------- */

type ReplyFn = (cmd: string, baud: number) => string;

function detectStubLink(reply: ReplyFn): Parameters<typeof autoDetectCutter>[0] & { openCalls: Array<{ baud: number }> } {
  const link = {
    status: 'idle' as LinkStatus,
    baud: 0,
    openCalls: [] as Array<{ baud: number }>,
    async open(o: { baud: number }) {
      link.openCalls.push({ baud: o.baud });
      link.baud = o.baud;
      link.status = 'connected' as const;
    },
    async close() { link.status = 'idle' as const; },
    async query(cmd: string) { return reply(cmd, link.baud); },
  };
  return link;
}

describe('autoDetectCutter', () => {
  it('detects a grbl responder: format gcode, $I build captured, grbl-generic suggested', async () => {
    const link = detectStubLink((cmd) => {
      if (cmd === '?') return '<Idle|MPos:0.000,0.000,0.000>';
      if (cmd === '$I') return '[VER:1.1h.20190825:]\r\nok';
      return '';
    });
    const found = await autoDetectCutter(link, [port('COM5', 0x10c4, 0xea60)], { bauds: [115200] });
    expect(found).not.toBeNull();
    expect(found!.grbl).toBe(true);
    expect(found!.format).toBe('gcode');
    expect(found!.grblBuild).toContain('1.1h');
    expect(found!.model).toBe(''); // grbl: the build lives in grblBuild, not OI;
    expect(found!.suggestedProfileId).toBe('grbl-generic');
  });

  it('reports hpgl format for an OI; responder with its model', async () => {
    const link = detectStubLink((cmd) => (cmd === 'OI;' ? 'GX-24\r\n' : ''));
    const found = await autoDetectCutter(link, [port('COM3', 0x0403, 0x6001)], { bauds: [9600] });
    expect(found).not.toBeNull();
    expect(found!.grbl).toBe(false);
    expect(found!.format).toBe('hpgl');
    expect(found!.model).toBe('GX-24');
    expect(found!.suggestedProfileId).toBe('roland-camm1');
  });

  it('default bauds = chip suggestion + common rates, deduped in chip-first order', async () => {
    // Machine only answers OI; at 38400 — the extended default list must
    // reach it (previously only 9600/115200 were tried).
    const link = detectStubLink((cmd, baud) => (cmd === 'OI;' && baud === 38400 ? 'CE6000-60\r\n' : ''));
    const found = await autoDetectCutter(link, [port('COM3', 0x1a86, 0x7523)]);
    expect(found).not.toBeNull();
    expect(found!.baud).toBe(38400);
    // 9600 (chip) → 115200 (the other convention) → 19200 → 38400: no repeats.
    expect(link.openCalls.map(c => c.baud)).toEqual([9600, 115200, 19200, 38400]);
  });

  it('returns null when every port stays silent', async () => {
    const link = detectStubLink(() => '');
    const found = await autoDetectCutter(link, [port('COM3', 0x1a86, 0x7523)], { bauds: [9600] });
    expect(found).toBeNull();
  });
});
