import { describe, expect, it } from 'vitest';
import {
  EPSON_ACTIONS, EPSON_TEMPLATES,
  asciiBytes, explainEpsonReply, parseHex, toHex,
  loadEpsonPrefs, saveEpsonPrefs,
} from '../epsonMaint';

describe('parseHex', () => {
  it('accepts spaced, dashed and bare hex', () => {
    expect([...parseHex('1b 40')]).toEqual([0x1b, 0x40]);
    expect([...parseHex('1b-40')]).toEqual([0x1b, 0x40]);
    expect([...parseHex('1B40')]).toEqual([0x1b, 0x40]);
  });

  it('round-trips through toHex', () => {
    const bytes = parseHex('1b 28 4b 02 00 00 01');
    expect(toHex(bytes)).toBe('1b 28 4b 02 00 00 01');
  });

  it('rejects odd-length or non-hex input', () => {
    expect(() => parseHex('1b4')).toThrow(/even/);
    expect(() => parseHex('zz')).toThrow();
  });
});

describe('asciiBytes', () => {
  it('encodes plain text for RAW jobs', () => {
    expect([...asciiBytes('AB')]).toEqual([0x41, 0x42]);
  });
});

describe('explainEpsonReply', () => {
  it('flags silence instead of pretending nothing happened', () => {
    expect(explainEpsonReply(new Uint8Array())).toContain('no reply');
  });

  it('marks ACK/NAK control bytes', () => {
    expect(explainEpsonReply(new Uint8Array([0x06]))).toContain('ACK');
    expect(explainEpsonReply(new Uint8Array([0x15]))).toContain('NAK');
  });

  it('shows hex plus printable characters for opaque replies', () => {
    const out = explainEpsonReply(new Uint8Array([0x1b, 0x40]));
    expect(out).toContain('1b 40');
    expect(out).toContain('·'); // control byte renders as ·
    expect(out).toContain('@'); // printable byte stays visible
  });
});

describe('EPSON_ACTIONS catalogue invariants', () => {
  it('every action has parseable, non-empty hex', () => {
    for (const action of EPSON_ACTIONS) {
      expect(action.hex.trim().length).toBeGreaterThan(0);
      expect(() => parseHex(action.hex)).not.toThrow();
      expect(parseHex(action.hex).length).toBeGreaterThan(0);
    }
  });

  it('every action has a valid safety tier and description', () => {
    for (const action of EPSON_ACTIONS) {
      expect(['documented', 'experimental', 'custom']).toContain(action.safety);
      expect(action.description.length).toBeGreaterThan(10);
    }
  });

  it('contains the core maintenance trio', () => {
    expect(EPSON_ACTIONS.some(a => a.id === 'init')).toBe(true);
    expect(EPSON_ACTIONS.some(a => a.id === 'clean-basic')).toBe(true);
    expect(EPSON_ACTIONS.some(a => a.id === 'nozzle')).toBe(true);
  });

  it('builds the documented sequences exactly', () => {
    expect(EPSON_ACTIONS.find(a => a.id === 'init')!.hex).toBe('1b 40');
    expect(EPSON_ACTIONS.find(a => a.id === 'clean-basic')!.hex).toBe('1b 28 4b 02 00 00 01');
  });
});

describe('EPSON_TEMPLATES', () => {
  it('ships only parseable template hex', () => {
    for (const tpl of EPSON_TEMPLATES) {
      if (tpl.hex === '') continue;
      expect(() => parseHex(tpl.hex)).not.toThrow();
    }
  });
});

describe('epson prefs', () => {
  it('round-trips through localStorage', () => {
    saveEpsonPrefs({ printer: 'EPSON SC-P900', lastCustomHex: '1b 40' });
    const loaded = loadEpsonPrefs();
    expect(loaded.printer).toBe('EPSON SC-P900');
    expect(loaded.lastCustomHex).toBe('1b 40');
    saveEpsonPrefs({ printer: '' });
    expect(loadEpsonPrefs().printer).toBe('');
  });
});
