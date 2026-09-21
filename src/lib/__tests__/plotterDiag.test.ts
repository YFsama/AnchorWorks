import { describe, it, expect, vi } from 'vitest';
import { buildDiagnosticsReport, cutStateFromReply, estimateEtaSeconds, estimateTransferSeconds, probeBaud, runConnectionSelfTest, watchCutCompletion, type DiagReportInput } from '../plotterDiag';
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


describe('buildDiagnosticsReport', () => {
  const base: DiagReportInput = {
    shell: 'desktop',
    linkStatus: 'connected',
    linkDescription: 'COM3 @ 9600',
    baud: 9600,
    flow: 'none',
    txBytes: 1234,
    rxBytes: 56,
    lastTransfer: { bps: 800, pct: 800 / 960 },
    format: 'hpgl',
    dialect: 'roland-camm',
    unit: 'mm',
    profileLabel: 'Generic HP-GL cutter',
    machineCount: 2,
    jobs: [{
      ts: 1700000000000, kind: 'job', target: 'COM3', format: 'hpgl',
      baud: 9600, paths: 12, bytes: 2048, seconds: 8, result: 'ok',
    }],
    logLines: ['10:00:00.000 TX   12B  IN;'],
    now: new Date('2026-01-01T00:00:00Z'),
  };

  it('renders every section with the given data', () => {
    const report = buildDiagnosticsReport({ ...base });
    expect(report).toContain('AnchorWorks plotter diagnostics');
    expect(report).toContain('2026-01-01T00:00:00.000Z');
    expect(report).toContain('COM3 @ 9600');
    expect(report).toContain('9600 / none');
    expect(report).toContain('83% of line rate');
    expect(report).toContain('roland-camm');
    expect(report).toContain('Generic HP-GL cutter');
    expect(report).toContain('12 paths');
    expect(report).toContain('IN;');
  });

  it('handles an empty history and missing transfer gracefully', () => {
    const report = buildDiagnosticsReport({ ...base, jobs: [], logLines: [], lastTransfer: null });
    expect(report).toContain('- none');
    expect(report).toContain('(empty)');
    expect(report).toContain('- Last transfer: —');
  });
});

describe('estimateEtaSeconds', () => {
  it('returns null before enough data (guards div-by-zero)', () => {
    expect(estimateEtaSeconds(0, 1000, 5000)).toBeNull();
    expect(estimateEtaSeconds(5, 1000, 100)).toBeNull(); // < 1%
    expect(estimateEtaSeconds(500, 0, 1000)).toBeNull();
  });

  it('extrapolates linearly from the measured pace', () => {
    // Halfway after 10 s → 10 s remaining.
    expect(estimateEtaSeconds(500, 1000, 10000)).toBe(10);
    // Quarter after 5 s → 15 s remaining.
    expect(estimateEtaSeconds(250, 1000, 5000)).toBe(15);
    // Complete → 0.
    expect(estimateEtaSeconds(1000, 1000, 20000)).toBe(0);
  });
});

describe('cutStateFromReply', () => {
  it('decodes HP-GL OS status words', () => {
    expect(cutStateFromReply('hpgl', '2\r\n')).toBe('cutting');
    expect(cutStateFromReply('hpgl', '1')).toBe('idle');
    expect(cutStateFromReply('hpgl', '0')).toBe('idle');
    expect(cutStateFromReply('hpgl', '')).toBe('unknown');
    expect(cutStateFromReply('hpgl', 'garbage')).toBe('unknown');
  });

  it('decodes grbl state reports', () => {
    expect(cutStateFromReply('gcode', '<Run|MPos:1,2,0>')).toBe('cutting');
    expect(cutStateFromReply('gcode', '<Home|MPos:0,0,0>')).toBe('cutting');
    expect(cutStateFromReply('gcode', '<Idle|MPos:0,0,0>')).toBe('idle');
    expect(cutStateFromReply('gcode', '<Hold:0|MPos:0,0,0>')).toBe('idle');
    expect(cutStateFromReply('gcode', 'ok')).toBe('unknown');
  });
});

describe('watchCutCompletion', () => {
  function watchStub(replies: string[], onQuery?: () => void) {
    let i = 0;
    return {
      status: 'connected' as const,
      query: async () => { onQuery?.(); return replies[Math.min(i++, replies.length - 1)] ?? ''; },
    };
  }

  it('fires onDone when the machine reports idle', async () => {
    const done = vi.fn();
    const unsupported = vi.fn();
    const handle = watchCutCompletion(watchStub(['2\r\n', '2\r\n', '1\r\n']), {
      format: 'hpgl', intervalMs: 5, onDone: done, onUnsupported: unsupported,
    });
    await new Promise(r => setTimeout(r, 60));
    handle.cancel();
    expect(done).toHaveBeenCalledTimes(1);
    expect(unsupported).not.toHaveBeenCalled();
  });

  it('gives up after two silent polls (clones) via onUnsupported', async () => {
    const done = vi.fn();
    const unsupported = vi.fn();
    const logs: string[] = [];
    const handle = watchCutCompletion(watchStub(['', '']), {
      format: 'hpgl', intervalMs: 5, onDone: done, onUnsupported: unsupported, onLog: l => logs.push(l),
    });
    await new Promise(r => setTimeout(r, 60));
    handle.cancel();
    expect(unsupported).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    expect(logs.some(l => l.includes('does not answer'))).toBe(true);
  });

  it('stops when the link disconnects mid-watch', async () => {
    const done = vi.fn();
    const stub = watchStub(['2\r\n']);
    (stub as { status: string }).status = 'idle'; // simulate drop before first poll lands
    const handle = watchCutCompletion(stub, { format: 'hpgl', intervalMs: 5, onDone: done });
    await new Promise(r => setTimeout(r, 30));
    handle.cancel();
    expect(done).not.toHaveBeenCalled();
  });

  it('cancel() stops polling immediately', async () => {
    let polls = 0;
    const handle = watchCutCompletion(watchStub(['2'], () => { polls += 1; }), {
      format: 'hpgl', intervalMs: 5, onDone: () => {},
    });
    handle.cancel();
    await new Promise(r => setTimeout(r, 30));
    expect(polls).toBeLessThanOrEqual(1);
  });
});
