import { describe, it, expect } from 'vitest';
import { chipForVidPid, chipForPort, suggestProfileFromModel, rankCutterPorts } from '../plotterIdentify';
import type { NativeSerialPort } from '../plotter';

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
