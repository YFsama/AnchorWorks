import { describe, it, expect, beforeEach } from 'vitest';
import type { NativeSerialPort } from '../plotter';
import {
  AUTO_IDENTIFY_MAX,
  SIM_PORT,
  WEB_PORT,
  autoProbeBauds,
  loadLastLink,
  pickScanBaud,
  pickScanPort,
  planNativeScan,
  planWebScan,
  saveLastLink,
} from '../plotterScan';

const CH340 = { vid: 0x1a86, pid: 0x7523 }; // the clone cutter adapter
const CP2102 = { vid: 0x10c4, pid: 0xea60 }; // grbl pen plotter / laser
const FTDI = { vid: 0x0403, pid: 0x6001 };

const usb = (path: string, ids?: { vid: number; pid: number }): NativeSerialPort => ({ path, kind: 'usb', ...(ids ?? {}) });

beforeEach(() => {
  window.localStorage.clear();
});

describe('planNativeScan — ranking', () => {
  it('ranks known cutter chips first, then other known adapters, then plain USB', () => {
    const plan = planNativeScan([
      usb('COM9'),                 // plain USB serial
      usb('COM5', CP2102),        // medium
      usb('COM3', CH340),         // high
      usb('COM7', FTDI),          // medium
    ]);
    expect(plan.shell).toBe('native');
    expect(plan.candidates.map((c) => c.path)).toEqual(['COM3', 'COM5', 'COM7', 'COM9']);
    expect(plan.candidates.map((c) => c.score)).toEqual([3, 2, 2, 1]);
    expect(plan.candidates[0].chip?.chip).toBe('CH340/CH341');
    expect(plan.unlisted).toBe(0);
  });

  it('hands the probe real descriptors, in the ranked order', () => {
    const plan = planNativeScan([usb('COM9'), usb('COM5', CP2102), usb('COM3', CH340)]);
    expect(plan.autoIdentify).toBe(true);
    expect(plan.probePorts).toEqual([
      expect.objectContaining({ path: 'COM3', vid: CH340.vid }),
      expect.objectContaining({ path: 'COM5', vid: CP2102.vid }),
      expect.objectContaining({ path: 'COM9' }),
    ]);
  });

  it('keeps the input order among equals (a stable, predictable list)', () => {
    const plan = planNativeScan([usb('COM8'), usb('COM2'), usb('COM5')]);
    expect(plan.candidates.map((c) => c.path)).toEqual(['COM8', 'COM2', 'COM5']);
  });

  it('leaves out ports that are no USB serial adapters (Bluetooth, PCI)', () => {
    const plan = planNativeScan([
      { path: 'COM1', kind: 'pci' },
      { path: 'COM4', kind: 'bluetooth' },
      usb('COM3', CH340),
    ]);
    expect(plan.candidates.map((c) => c.path)).toEqual(['COM3']);
  });

  it('an empty list is an empty plan — nothing to probe, nothing to say', () => {
    const plan = planNativeScan([]);
    expect(plan.candidates).toEqual([]);
    expect(plan.autoIdentify).toBe(false);
    expect(plan.probePorts).toEqual([]);
  });
});

describe('candidate-count threshold', () => {
  const ports = (n: number) => Array.from({ length: n }, (_, i) => usb(`COM${i + 3}`));

  it('identifies automatically with 1 candidate', () => {
    const plan = planNativeScan(ports(1));
    expect(plan.autoIdentify).toBe(true);
    expect(plan.probePorts).toHaveLength(1);
  });

  it(`identifies automatically up to ${AUTO_IDENTIFY_MAX} candidates`, () => {
    expect(AUTO_IDENTIFY_MAX).toBe(3);
    const plan = planNativeScan(ports(AUTO_IDENTIFY_MAX));
    expect(plan.autoIdentify).toBe(true);
    expect(plan.probePorts).toHaveLength(AUTO_IDENTIFY_MAX);
  });

  it('asks first beyond the threshold — no port is probed unattended', () => {
    const plan = planNativeScan(ports(AUTO_IDENTIFY_MAX + 1));
    expect(plan.candidates).toHaveLength(AUTO_IDENTIFY_MAX + 1); // still listed, best first
    expect(plan.autoIdentify).toBe(false);
    expect(plan.probePorts).toEqual([]);
  });

  it('never identifies with no candidate', () => {
    expect(planNativeScan(ports(0)).autoIdentify).toBe(false);
  });
});

describe('planWebScan — the browser branch', () => {
  it('exactly one authorized port: it is the candidate and is probed', () => {
    const plan = planWebScan([{ usbVendorId: CH340.vid, usbProductId: CH340.pid }]);
    expect(plan.shell).toBe('web');
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].path).toBe(WEB_PORT);
    expect(plan.candidates[0].chip?.chip).toBe('CH340/CH341');
    expect(plan.candidates[0].score).toBe(3);
    expect(plan.autoIdentify).toBe(true);
    expect(plan.probePorts).toEqual([expect.objectContaining({ path: WEB_PORT, vid: CH340.vid, pid: CH340.pid })]);
  });

  it('one authorized port with no USB ids still counts (a built-in serial port)', () => {
    const plan = planWebScan([{}]);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].chip).toBeNull();
    expect(plan.candidates[0].score).toBe(1);
    expect(plan.autoIdentify).toBe(true);
  });

  it('two or more authorized ports: the chooser decides — nothing is probed', () => {
    const plan = planWebScan([{ usbVendorId: 1 }, { usbVendorId: 2 }, {}]);
    expect(plan.candidates).toEqual([]);
    expect(plan.autoIdentify).toBe(false);
    expect(plan.probePorts).toEqual([]);
    expect(plan.unlisted).toBe(3);
  });

  it('nothing authorized yet: an empty plan the card can stay quiet about', () => {
    const plan = planWebScan([]);
    expect(plan.candidates).toEqual([]);
    expect(plan.autoIdentify).toBe(false);
    expect(plan.unlisted).toBe(0);
  });
});

describe('autoProbeBauds — what an unattended probe may try', () => {
  it('always includes 9600 and 115200, the chip rate first', () => {
    const chip = (likelihood: 'high' | 'medium', probeBaud: number) => ({ chip: 'x', maker: 'y', likelihood, probeBaud });
    expect(autoProbeBauds(chip('high', 9600))).toEqual([9600, 115200]);
    expect(autoProbeBauds(chip('medium', 115200))).toEqual([115200, 9600]);
  });

  it('what worked before on this port comes first, and duplicates drop out', () => {
    const chip = { chip: 'CH340/CH341', maker: 'WCH', likelihood: 'high' as const, probeBaud: 9600 };
    expect(autoProbeBauds(chip, [19200, 9600])).toEqual([19200, 9600, 115200]);
    expect(autoProbeBauds(chip, [115200])).toEqual([115200, 9600]);
  });

  it('stays short — never the full probe ladder', () => {
    expect(autoProbeBauds(null, [38400])).toHaveLength(3);
  });

  it('ignores nonsense rates', () => {
    expect(autoProbeBauds(null, [0, Number.NaN])).toEqual([9600, 115200]);
  });
});

describe('preselecting the last successful link', () => {
  const plan = planNativeScan([usb('COM3', CH340), usb('COM7', FTDI), usb('COM9')]);

  it('keeps the operator’s own pick while that port is still there', () => {
    expect(pickScanPort(plan.candidates, { port: 'COM3', baud: 9600 }, 'COM9')).toBe('COM9');
  });

  it('falls back to the port of the last successful link', () => {
    expect(pickScanPort(plan.candidates, { port: 'COM7', baud: 19200 }, '')).toBe('COM7');
    // …even when the pick in the box has vanished since.
    expect(pickScanPort(plan.candidates, { port: 'COM7', baud: 19200 }, 'COM99')).toBe('COM7');
  });

  it('with no history, the best-ranked candidate is the one to offer', () => {
    expect(pickScanPort(plan.candidates, null, '')).toBe('COM3');
    expect(pickScanPort(plan.candidates, { port: 'COM42', baud: 9600 }, '')).toBe('COM3');
  });

  it('nothing to select when there is no candidate', () => {
    expect(pickScanPort([], { port: 'COM3', baud: 9600 }, 'COM3')).toBe('');
  });

  it('restores the baud that worked on that port, and only there', () => {
    const last = { port: 'COM7', baud: 19200 };
    expect(pickScanBaud('COM7', last, 9600)).toBe(19200);
    expect(pickScanBaud('COM3', last, 9600)).toBe(9600);
    expect(pickScanBaud('COM3', null, 115200)).toBe(115200);
  });
});

describe('last-link memory', () => {
  it('round-trips through localStorage and survives a reload', () => {
    expect(loadLastLink()).toBeNull();
    saveLastLink({ port: 'COM3', baud: 9600 });
    expect(loadLastLink()).toEqual({ port: 'COM3', baud: 9600 });
  });

  it('a corrupt or incomplete record reads as "no history"', () => {
    window.localStorage.setItem('vector.plotter.lastLink', '{not json');
    expect(loadLastLink()).toBeNull();
    window.localStorage.setItem('vector.plotter.lastLink', JSON.stringify({ port: 'COM3' }));
    expect(loadLastLink()).toBeNull();
    window.localStorage.setItem('vector.plotter.lastLink', JSON.stringify({ port: '', baud: 9600 }));
    expect(loadLastLink()).toBeNull();
  });

  it('the virtual plotter is never a remembered port', () => {
    expect(SIM_PORT).not.toBe(WEB_PORT);
    expect(SIM_PORT.startsWith('virtual:')).toBe(true);
  });
});
