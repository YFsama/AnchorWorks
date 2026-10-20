import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildJobList,
  connectDataLink,
  dataLinkHandshake,
  DL,
  parseLinkInfoReply,
  parseRegVector,
  parseSelectedIndex,
  validateJobName,
  type DataLinkHandle,
  type DataLinkJob,
} from '../dataLink';

/**
 * Unit tests for the Graphtec Data-Link protocol layer (dataLink.ts).
 * Byte pins mirror open-graphtec-server's `protocol.py` (FC9000-validated)
 * and docs/research-sticker-printcut-2026-10.md §2: TCP 9100, ESC.d1–d6,
 * ETX-terminated replies, 0.1 mm registration-vector units.
 *
 * The handshake tests drive a FAKE handle whose `read`s are scripted
 * replies — no sockets involved; connectDataLink's web-runtime branch is
 * checked with a mocked runtime module.
 */

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, isTauri: vi.fn(() => false) };
});

/** Scriptable fake cutter: every send is recorded; every read drains the
 *  next scripted reply ('' once the script runs dry). */
class FakeHandle implements DataLinkHandle {
  readonly sent: string[] = [];
  closed = false;
  private queue: string[];
  constructor(replies: string[] = []) {
    this.queue = [...replies];
  }
  async send(data: string): Promise<void> {
    this.sent.push(data);
  }
  async read(): Promise<string> {
    return this.queue.shift() ?? '';
  }
  close(): void {
    this.closed = true;
  }
}

describe('validateJobName', () => {
  it('accepts valid names', () => {
    expect(validateJobName('ANCHOR01')).toBeNull();
    expect(validateJobName('A')).toBeNull();
    expect(validateJobName('x'.repeat(25))).toBeNull();
  });

  it('rejects the reserved G prefix, >25 chars, non-printable and empty names', () => {
    expect(validateJobName('GRAPE')).toMatch(/G/);
    expect(validateJobName('x'.repeat(26))).toMatch(/25/);
    expect(validateJobName('job\nname')).toMatch(/printable ASCII/);
    expect(validateJobName('job\x02name')).toMatch(/printable ASCII/);
    expect(validateJobName('')).toMatch(/empty/);
  });
});

describe('buildJobList byte framing', () => {
  it('pins ESC.d3 + STX names RS-separated + ETX', () => {
    const jobs: DataLinkJob[] = [
      { name: 'JOB1', payload: 'PU;' },
      { name: 'JOB2', payload: 'PD;' },
    ];
    expect(buildJobList(jobs)).toBe(`${DL.ESC}.d3${DL.STX}JOB1${DL.RS}JOB2${DL.ETX}`);
    // Framing bytes are exactly the spec control characters.
    expect(buildJobList(jobs)).toBe('\x1b.d3\x02JOB1\x1eJOB2\x03');
    expect(buildJobList([{ name: 'SOLO', payload: '' }])).toBe('\x1b.d3\x02SOLO\x03');
  });

  it('sends an empty list as ETX alone (required by the spec)', () => {
    expect(buildJobList([])).toBe('\x1b.d3\x03');
  });

  it('throws past 8 jobs or on an invalid name', () => {
    const nine = Array.from({ length: 9 }, (_, i): DataLinkJob => ({ name: `J${i}`, payload: '' }));
    expect(() => buildJobList(nine)).toThrow(/8 jobs/);
    expect(() => buildJobList([{ name: 'G9', payload: '' }])).toThrow(/G/);
    expect(() => buildJobList([{ name: 'x'.repeat(26), payload: '' }])).toThrow(/25/);
  });
});

describe('reply parsers', () => {
  it('parseLinkInfoReply: names out of an ETX-framed reply, null on silence', () => {
    expect(parseLinkInfoReply('ANCHOR01\x03')).toEqual(['ANCHOR01']);
    expect(parseLinkInfoReply('JOB1\x1eJOB2\x03')).toEqual(['JOB1', 'JOB2']);
    expect(parseLinkInfoReply('\r\nJOB1\r\n\x03')).toEqual(['JOB1']);
    expect(parseLinkInfoReply('')).toBeNull();
    expect(parseLinkInfoReply('\x03')).toBeNull();
  });

  it('parseSelectedIndex: ints (incl. 0 and negatives), null on empty/garbage', () => {
    expect(parseSelectedIndex('1\x03')).toBe(1);
    expect(parseSelectedIndex('0\x03')).toBe(0); // 0 is a valid selection
    expect(parseSelectedIndex('-1\x03')).toBe(-1); // cutter error code
    expect(parseSelectedIndex('')).toBeNull();
    expect(parseSelectedIndex('\x03')).toBeNull();
    expect(parseSelectedIndex('pick one\x03')).toBeNull();
  });

  it('parseRegVector: parses the ESC.d5 command and converts 0.1 mm to mm', () => {
    expect(parseRegVector('\x1b.d5;0;10;20;30;40:')).toEqual({ fx: 1, fy: 2, rx: 3, ry: 4 });
    // Raw '10' → 1.0 mm (the unit contract).
    expect(parseRegVector('\x1b.d5;0;10;0;0;0:')?.fx).toBe(1);
    expect(parseRegVector('\x1b.d5;0;-10;20;30;40:')).toEqual({ fx: -1, fy: 2, rx: 3, ry: 4 });
    // Malformed: missing field, wrong prefix, garbage → null.
    expect(parseRegVector('\x1b.d5;0;10;20;30:')).toBeNull();
    expect(parseRegVector('\x1b.d6;0;10;20;30;40:')).toBeNull();
    expect(parseRegVector('nope')).toBeNull();
    expect(parseRegVector('')).toBeNull();
  });
});

describe('dataLinkHandshake (fake handle)', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('full happy path: d1 ready → d2 link info → d3 list → d4 pick → d5 vector → payload + ETX', async () => {
    const handle = new FakeHandle([
      '2\x03',        // d1 → status 2 (requesting job list)
      'A12345678\x03', // d2 → scanned link info
      '0\x03',        // d3 → list accepted
      '1\x03',        // d4 → operator picked index 1
      '0\x03',        // d5 → vector accepted
      '0\x03',        // d6 → command type accepted
    ]);
    const jobs: DataLinkJob[] = [
      { name: 'JOB0', payload: 'PU0,0;' },
      { name: 'JOB1', payload: 'PD100,100;PU;' },
    ];
    const onLog = vi.fn();
    const result = await dataLinkHandshake(handle, jobs, jobs[1].payload, {
      pollMs: 1,
      maxPolls: 2,
      regVector: { fx: 10, fy: 20, rx: 30, ry: 40 },
      onLog,
    });

    expect(result.sent).toBe(true);
    expect(result.selected).toBe(1);
    expect(result.jobs).toEqual(['A12345678']);
    expect(result.reg).toEqual({ fx: 1, fy: 2, rx: 3, ry: 4 }); // 0.1 mm → mm
    expect(result.log.length).toBeGreaterThanOrEqual(5);
    expect(onLog).toHaveBeenCalledTimes(result.log.length);

    // Wire order + byte-exact commands.
    expect(handle.sent).toEqual([
      '\x1b.d1:',
      '\x1b.d2:',
      '\x1b.d3\x02JOB0\x1eJOB1\x03',
      '\x1b.d4:',
      '\x1b.d5;0;10;20;30;40:',
      '\x1b.d6;1:',
      'PD100,100;PU;\x03', // the SELECTED job's payload, ETX-terminated
    ]);
  });

  it('happy path without a reg vector skips d5 and logs why', async () => {
    const handle = new FakeHandle(['2\x03', 'A1\x03', '0\x03', '0\x03', '0\x03']);
    const result = await dataLinkHandshake(handle, [{ name: 'JOB0', payload: 'PU;' }], 'PU;', { pollMs: 1, maxPolls: 2 });
    expect(result.sent).toBe(true);
    expect(result.reg).toBeNull();
    expect(handle.sent).not.toContain('\x1b.d5;0;0;0;0;0:');
    expect(result.log.some(l => l.includes('d5 reg vector skipped'))).toBe(true);
  });

  it('no-barcode path: d4 never answers → selected −1, payload NOT sent', async () => {
    const handle = new FakeHandle([
      '2\x03',    // d1 ready
      'A1\x03',   // d2
      '0\x03',    // d3 accepted
      // d4 always answered with silence (the fake's dry queue).
    ]);
    const result = await dataLinkHandshake(handle, [{ name: 'JOB0', payload: 'PU;' }], 'PU;', { pollMs: 1, maxPolls: 2 });
    expect(result.selected).toBe(-1);
    expect(result.sent).toBe(false);
    expect(handle.sent).not.toContain('PU;\x03');
    expect(handle.sent.filter(c => c === '\x1b.d4:').length).toBe(2); // both poll budget rounds
    expect(result.log.some(l => l.includes('no job selected'))).toBe(true);
  });

  it('nothing-scanned path: d1 stuck scanning → early out with an explanatory log', async () => {
    const handle = new FakeHandle(['1\x03', '1\x03']);
    const result = await dataLinkHandshake(handle, [{ name: 'JOB0', payload: 'PU;' }], 'PU;', { pollMs: 1, maxPolls: 2 });
    expect(result.sent).toBe(false);
    expect(result.selected).toBe(-1);
    expect(handle.sent).toEqual(['\x1b.d1:', '\x1b.d1:']);
    expect(result.log.some(l => l.includes('no barcode scan'))).toBe(true);
  });

  it('transport errors propagate', async () => {
    const handle: DataLinkHandle = {
      send: () => Promise.reject(new Error('connection reset')),
      read: async () => '',
      close: () => undefined,
    };
    await expect(dataLinkHandshake(handle, [{ name: 'J', payload: 'P' }], 'P', { pollMs: 1 })).rejects.toThrow('connection reset');
  });
});

describe('connectDataLink runtime gate', () => {
  it('returns null under the web/PWA runtime (no raw sockets)', async () => {
    const { isTauri } = await import('../runtime');
    vi.mocked(isTauri).mockReturnValue(false);
    expect(await connectDataLink('192.168.0.100', 9100)).toBeNull();
  });
});
