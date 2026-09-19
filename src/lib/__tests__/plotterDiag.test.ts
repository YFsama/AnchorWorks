import { describe, it, expect } from 'vitest';
import { estimateTransferSeconds, probeBaud, runConnectionSelfTest } from '../plotterDiag';
import type { LinkStatus } from '../plotterLink';

describe('estimateTransferSeconds', () => {
  it('matches the line rate at 9600 baud with no flow control', () => {
    // 960 bytes at 960 bytes/s = 1.0 s
    expect(estimateTransferSeconds(960, 9600, 'none')).toBe(1);
  });

  it('scales with payload and baud', () => {
    expect(estimateTransferSeconds(1920, 9600, 'none')).toBe(2);
    expect(estimateTransferSeconds(1920, 19200, 'none')).toBe(1);
  });

  it('never returns zero-time for non-empty payloads', () => {
    expect(estimateTransferSeconds(1, 9600, 'none')).toBeGreaterThanOrEqual(0.1);
    expect(estimateTransferSeconds(0, 9600, 'none')).toBe(0);
  });
});

/* ---------------- probeBaud with a stubbed link ---------------- */

interface StubbedLink {
  status: LinkStatus;
  baud: number;
  openCalls: Array<{ baud: number }>;
  open: (o: { baud: number }) => Promise<void>;
  close: () => Promise<void>;
  query: (cmd: string) => Promise<string>;
}

function stubLink(replies: Record<number, string>, openError?: Error): StubbedLink {
  const link: StubbedLink = {
    status: 'idle',
    baud: 0,
    openCalls: [],
    async open(o) {
      if (openError) throw openError;
      link.openCalls.push({ baud: o.baud });
      link.baud = o.baud;
      link.status = 'connected';
    },
    async close() { link.status = 'idle'; },
    async query() { return replies[link.baud] ?? ''; },
  };
  return link;
}

describe('probeBaud', () => {
  it('returns the baud the machine answers on and reconnects there', async () => {
    const link = stubLink({ 38400: '0\r\n' });
    const winner = await probeBaud(link, { candidates: [9600, 38400] });
    expect(winner).toBe(38400);
    // 9600 tried and failed, 38400 answered, then reconnected at the winner
    expect(link.openCalls.map(c => c.baud)).toEqual([9600, 38400, 38400]);
    expect(link.status).toBe('connected');
  });

  it('returns null and stays disconnected when nothing answers', async () => {
    const link = stubLink({});
    const winner = await probeBaud(link, { candidates: [9600, 19200] });
    expect(winner).toBeNull();
    expect(link.status).toBe('idle');
  });

  it('restores the original baud when a previously-open link finds no answer', async () => {
    const link = stubLink({});
    // simulate an open link at 19200
    await link.open({ baud: 19200 });
    const winner = await probeBaud(link, { candidates: [9600] });
    expect(winner).toBeNull();
    expect(link.status).toBe('connected');
    expect(link.baud).toBe(19200);
  });

  it('skips candidates whose open fails', async () => {
    const link = stubLink({}, new Error('busy'));
    const logs: string[] = [];
    const winner = await probeBaud(link, { candidates: [9600], onLog: (l) => logs.push(l) });
    expect(winner).toBeNull();
    expect(logs[0]).toContain('open failed');
  });
});

/* ---------------- runConnectionSelfTest with a stubbed link ---------------- */

describe('runConnectionSelfTest', () => {
  it('fails fast when not connected', async () => {
    const steps = await runConnectionSelfTest({ status: 'idle', send: async () => {}, query: async () => '' }, 'hpgl');
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('fail');
  });

  it('reports answered queries as pass with decoded details', async () => {
    const replies: Record<string, string> = { 'OE;': '0\r\n', 'OH;': '0,0,11280,7920\r\n', 'OA;': '400,200,0\r' };
    const steps = await runConnectionSelfTest({
      status: 'connected',
      send: async () => {},
      query: async (cmd) => replies[cmd] ?? '',
    }, 'hpgl');
    const oe = steps.find(s => s.label === 'OE;')!;
    expect(oe.status).toBe('pass');
    expect(oe.detail).toContain('No error');
    expect(oe.ms).toBeGreaterThanOrEqual(0);
    expect(steps[0].status).toBe('pass'); // summary
  });

  it('treats silence as info, never as a fault', async () => {
    const steps = await runConnectionSelfTest({
      status: 'connected',
      send: async () => {},
      query: async () => '',
    }, 'hpgl');
    expect(steps.some(s => s.status === 'fail')).toBe(false);
    expect(steps.filter(s => s.status === 'info').length).toBeGreaterThanOrEqual(3);
    expect(steps[0].detail).toContain('silent');
  });

  it('uses grbl queries for gcode format', async () => {
    const replies: Record<string, string> = { '?': '<Idle|MPos:0.000,0.000,0.000>', $I: 'ok' };
    const seen: string[] = [];
    const steps = await runConnectionSelfTest({
      status: 'connected',
      send: async () => {},
      query: async (cmd) => { seen.push(cmd); return replies[cmd] ?? ''; },
    }, 'gcode');
    expect(seen).toEqual(['?', '$I']);
    expect(steps.find(s => s.label === '?')!.detail).toBe('State: Idle');
  });

  it('propagates link errors as fail steps', async () => {
    const steps = await runConnectionSelfTest({
      status: 'connected',
      send: async () => {},
      query: async () => { throw new Error('device unplugged'); },
    }, 'hpgl');
    expect(steps.find(s => s.label === 'OE;')!.status).toBe('fail');
    expect(steps.find(s => s.label === 'OE;')!.detail).toContain('unplugged');
  });
});

