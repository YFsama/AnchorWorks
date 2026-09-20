import { describe, expect, it } from 'vitest';
import {
  EPSON_ACTIONS, EPSON_TEMPLATES,
  buildD4Command, buildEjlIdRequest, buildRemoteCommand,
  formatSt2Summary, parseEjlIdReply, parseOldInkReply, parseSt2Status,
  asciiBytes, explainEpsonReply, parseHex, toHex,
  loadEpsonPrefs, saveEpsonPrefs,
  caesarShift, eepromReadFrame, eepromWriteFrame,
  parseEepromReads, parseEepromStatus, wastePercent,
  rwResetFrame, parseRwReply, sha1Bytes,
  guessEpsonModel,
  d4Packet, d4CtrlPacket, parseD4Packets, extractD4CtrlPayloads, buildD4SessionSteps,
  makeEepromBackup, parseEepromBackup, bigEndianValue,
} from '../epsonMaint';
import { EPSON_MODELS } from '../epsonModels';

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

  it('builds the escputil sequences exactly', () => {
    expect(EPSON_ACTIONS.find(a => a.id === 'init')!.hex).toBe('1b 40');
    // REMOTE1 header + CH 2 0 0 + trailer + job end (per escputil).
    expect(EPSON_ACTIONS.find(a => a.id === 'clean-basic')!.hex)
      .toBe('1b 40 1b 28 52 08 00 00 52 45 4d 4f 54 45 31 43 48 02 00 00 00 1b 00 00 00 1b 00 0c 1b 00 1b 00');
    // D4 entry + st 01 00 01.
    expect(EPSON_ACTIONS.find(a => a.id === 'status-st2')!.hex.endsWith('73 74 01 00 01')).toBe(true);
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

describe('verified protocol layer (escputil / epson_print_conf)', () => {
  it('builds the REMOTE1 frame exactly as escputil does', () => {
    // header + "CH" 02 00 00 00 + trailer + job end
    expect(buildRemoteCommand('CH', 0, 0))
      .toBe('1b 40 1b 28 52 08 00 00 52 45 4d 4f 54 45 31 43 48 02 00 00 00 1b 00 00 00 1b 00 0c 1b 00 1b 00');
    // ST 2 0 1 → "ST" 02 00 00 01
    expect(buildRemoteCommand('ST', 0, 1)).toContain('53 54 02 00 00 01');
    // Multi-arg: NC 2 0 0x10
    expect(buildRemoteCommand('NC', 0, 0x10)).toContain('4e 43 02 00 00 10');
  });

  it('builds D4-mode packets with the @EJL 1284.4 entry', () => {
    const out = buildD4Command('st', 1);
    expect(out.startsWith('00 00 00 1b 01 40 45 4a 4c 20 31 32 38 34 2e 34 0a')).toBe(true);
    expect(out.endsWith('73 74 01 00 01')).toBe(true);
    expect(buildD4Command('di', 1).endsWith('64 69 01 00 01')).toBe(true);
  });

  it('encodes the @EJL ID request', () => {
    expect(buildEjlIdRequest()).toBe('1b 01 40 45 4a 4c 20 49 44 0d 0a');
  });
});

describe('parseSt2Status', () => {
  const buildReply = (tlv: number[]): Uint8Array => {
    const header = [0x00, 0x40, 0x42, 0x44, 0x43, 0x20, 0x53, 0x54, 0x32, 0x0d, 0x0a];
    const len = tlv.length;
    return new Uint8Array([...header, len & 0xff, (len >> 8) & 0xff, ...tlv]);
  };

  it('decodes status, errors, serial, ink, maintenance box and page counters', () => {
    const enc = (s: string) => [...s].map(c => c.charCodeAt(0));
    const tlv = [
      // 0x01 status = 0x04 (idle)
      0x01, 0x01, 0x04,
      // 0x02 error = 0x4a (maintenance box near end)
      0x02, 0x01, 0x4a,
      // 0x1f serial
      0x1f, 0x08, ...enc('XJ123456'),
      // 0x0f ink: stride 3 → [cartId, colorId, level]
      0x0f, 0x07, 0x03, 0x01, 0x00, 0x64, 0x03, 0x01, 0x2a,
      // 0x37 maintenance box: stride 2 → [level=1, resetCount=3]
      0x37, 0x03, 0x02, 0x01, 0x03,
      // 0x36 paper count: 5 × LE32 (10, 10, 6, 4, 0)
      0x36, 0x14,
      10, 0, 0, 0, 10, 0, 0, 0, 6, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0,
    ];
    const st = parseSt2Status(buildReply(tlv));
    expect(st).not.toBeNull();
    expect(st!.status).toBe('Idle (ready)');
    expect(st!.errors).toEqual(['Maintenance box near end']);
    expect(st!.serial).toBe('XJ123456');
    expect(st!.ink).toEqual([
      { cartridge: 'Black', color: 'Black', level: 100 },
      { cartridge: 'Cyan', color: 'Cyan', level: 42 },
    ]);
    expect(st!.maintenanceBoxes).toEqual([{ level: 1, resetCount: 3 }]);
    expect(st!.paperCount).toEqual({ normal: 10, page: 10, color: 6, mono: 4, blank: 0 });
  });

  it('maps waste-ink overflow and unknown field types', () => {
    const tlv = [
      0x02, 0x01, 0x10, // waste ink pad overflow
      0x7f, 0x02, 0xaa, 0x55, // unknown type
    ];
    const st = parseSt2Status(buildReply(tlv));
    expect(st!.errors).toEqual(['Waste ink pad counter overflow']);
    expect(st!.unknown).toEqual([{ type: 0x7f, hex: 'aa 55' }]);
  });

  it('returns null for non-ST2 replies', () => {
    expect(parseSt2Status(new Uint8Array([0x06]))).toBeNull();
    expect(parseSt2Status(new Uint8Array())).toBeNull();
  });

  it('formats a summary with ink and maintenance box lines', () => {
    const tlv = [0x01, 0x01, 0x07, 0x0f, 0x04, 0x03, 0x01, 0x00, 0x55, 0x37, 0x02, 0x01, 0x02];
    const lines = formatSt2Summary(parseSt2Status(buildReply(tlv))!);
    expect(lines.some(l => l.includes('Cleaning'))).toBe(true);
    expect(lines.some(l => l === 'Ink Black: 85%')).toBe(true);
    expect(lines.some(l => l.includes('Maintenance box 1: FULL'))).toBe(true);
  });
});

describe('parseEjlIdReply / parseOldInkReply', () => {
  it('extracts the model line from an @EJL ID reply', () => {
    const text = '\x00@EJL ID\r\nMFG:EPSON;CMD:ESCPL2;MDL:XP-15000;\r\n';
    expect(parseEjlIdReply(new TextEncoder().encode(text))).toBe('MFG:EPSON;CMD:ESCPL2;MDL:XP-15000;');
  });

  it('parses classic IQ: hex percentages positionally', () => {
    // Black 0x64=100%, Cyan 0x2a=42%, Magenta 0x0a=10%
    const text = '\x00st;IQ:642a0a;ST:OK;';
    const inks = parseOldInkReply(new TextEncoder().encode(text));
    expect(inks).toEqual([
      { color: 'Black', level: 100 },
      { color: 'Cyan', level: 42 },
      { color: 'Magenta', level: 10 },
    ]);
  });

  it('returns null when no IQ data is present', () => {
    expect(parseOldInkReply(new TextEncoder().encode('ST:OK;'))).toBeNull();
  });
});

describe('EEPROM "||" frames (epson_print_conf golden bytes)', () => {
  const hexOf = (bytes: number[]) => bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');

  it('rebuilds the documented golden write frame byte for byte', () => {
    // Sample frame from epson_print_conf: readKey 73/8, write op 'B',
    // addr 0x30, value 0x1A, writeKey 'Arantifo' Caesar-shifted on the wire.
    expect(hexOf(eepromWriteFrame([73, 8], 'Arantifo', 48, 26)))
      .toBe('7c 7c 10 00 49 08 42 bd 21 30 00 1a 42 73 62 6f 75 6a 67 70');
  });

  it('builds read frames with the A/check/rotate triple', () => {
    expect(hexOf(eepromReadFrame([16, 8], 24))).toBe('7c 7c 07 00 10 08 41 be a0 18 00');
    // addresses above 0xff split little-endian: 1604 = 0x0644
    expect(hexOf(eepromReadFrame([129, 8], 1604))).toBe('7c 7c 07 00 81 08 41 be a0 44 06');
  });

  it('Caesar-shifts the write key +1', () => {
    expect(String.fromCharCode(...caesarShift('Sinabung'))).toBe('Tjobcvoh');
    expect(String.fromCharCode(...caesarShift('Arantifo'))).toBe('Bsboujgp');
  });
});

describe('EEPROM reply parsing', () => {
  it('extracts every EE:aavv pair in order', () => {
    const reply = new TextEncoder().encode('@BDC PS\r\nEE:0030AC;\r\nEE:001F00;');
    expect(parseEepromReads(reply)).toEqual([
      { addr: 0x30, value: 0xac },
      { addr: 0x1f, value: 0x00 },
    ]);
  });

  it('counts :OK; and :NA; acknowledgement tokens', () => {
    const reply = new TextEncoder().encode('||:OK;EE:003000;:OK;:NA;');
    expect(parseEepromStatus(reply)).toEqual({ ok: 2, na: 1 });
    expect(parseEepromStatus(new Uint8Array())).toEqual({ ok: 0, na: 0 });
  });
});

describe('wastePercent', () => {
  it('treats the oids as a big-endian counter (most significant byte last)', () => {
    // epson_print_conf: int(''.join(reversed(hex bytes)), 16) / divider
    expect(wastePercent([0x5a, 0x00, 0x00], 62.07)).toBe(1.45);
    expect(wastePercent([0x63, 0x01], 63.46)).toBe(5.59);
    expect(wastePercent([0x00, 0x00], 24.2)).toBe(0);
  });

  it('returns null when any address went unanswered', () => {
    expect(wastePercent([null, 0x00], 62.07)).toBeNull();
    expect(wastePercent([undefined], 1)).toBeNull();
  });
});

describe('rw temporary reset', () => {
  const digest = Array.from({ length: 20 }, (_, i) => i + 1);

  it('frames mode 1 + SHA-1 payload after the rw command', () => {
    const frame = rwResetFrame(digest);
    expect(frame.slice(0, 6)).toEqual([0x72, 0x77, 0x16, 0x00, 0x01, 0x00]);
    expect(frame).toHaveLength(26);
    expect(frame.slice(6)).toEqual(digest);
  });

  it('recognises the rw:xx:OK token and rejects NA or silence', () => {
    expect(parseRwReply(new TextEncoder().encode('rw:01:OK;')).ok).toBe(true);
    expect(parseRwReply(new TextEncoder().encode('rw:01:NA;')).ok).toBe(false);
    expect(parseRwReply(new Uint8Array()).ok).toBe(false);
  });

  it('hashes serials with SHA-1 via Web Crypto', async () => {
    const d = await sha1Bytes('abc');
    expect(d.map(b => b.toString(16).padStart(2, '0')).join(''))
      .toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('EPSON_MODELS database', () => {
  it('covers a broad model range with well-formed entries', () => {
    const names = Object.keys(EPSON_MODELS);
    expect(names.length).toBeGreaterThanOrEqual(100);
    for (const entry of Object.values(EPSON_MODELS)) {
      expect(entry.readKey).toHaveLength(2);
      expect(entry.writeKey).toHaveLength(8);
      expect(entry.mainWaste.oids.length).toBeGreaterThan(0);
      expect(entry.mainWaste.divider).toBeGreaterThan(0);
      expect(Object.keys(entry.rawReset).length).toBeGreaterThan(0);
    }
  });

  it('keeps per-model data distinct after alias/same-as expansion', () => {
    expect(EPSON_MODELS['L386'].readKey).toEqual([16, 8]);
    expect(EPSON_MODELS['L386'].writeKey).toBe('Sinabung');
    expect(EPSON_MODELS['L386'].rawReset['46']).toBe(94);
    expect(EPSON_MODELS['ET-4700'].mainWaste).toEqual({ oids: [48, 49, 47], divider: 63.46 });
    // XP-205 is same-as XP-315 but its own readKey wins (epc merge semantics).
    expect(EPSON_MODELS['XP-205'].readKey).toEqual([25, 7]);
  });
});

describe('guessEpsonModel', () => {
  it('matches the MDL field of an @EJL ID reply', () => {
    expect(guessEpsonModel('EPSON USB Printer', 'MFG:EPSON;CMD:ESCPL2;MDL:ET-2720;')).toBe('ET-2720');
    expect(guessEpsonModel('x', 'MDL:XP-205 Series')).toBe('XP-205');
  });

  it('matches inside Windows printer names, longest name winning', () => {
    expect(guessEpsonModel('EPSON ET-2720 Series')).toBe('ET-2720');
    // 'ET-2801' must beat any shorter overlapping database name.
    expect(guessEpsonModel('EPSON ET-2801 Series')).toBe('ET-2801');
  });

  it('returns null when nothing matches', () => {
    expect(guessEpsonModel('HP DeskJet 2130', 'MFG:HP;MDL:2130;')).toBeNull();
  });
});

describe('IEEE 1284.4 session layer (reinkpy cross-reference)', () => {
  const hexOf = (bytes: number[]) => bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');

  it('wraps payloads in the >BBHBB packet header with BE16 total length', () => {
    // Init(rev 0x20) on the transaction channel: len = 6 + 2 = 8.
    expect(hexOf(d4Packet(0, 0, [0x00, 0x20]))).toBe('00 00 00 08 01 00 00 20');
    // EPSON-CTRL channel packet: len = 6 + 5 = 11.
    expect(hexOf(d4CtrlPacket([0x73, 0x74, 0x01, 0x00, 0x01]))).toBe('02 02 00 0b 01 00 73 74 01 00 01');
  });

  it('splits reply streams into packets by length and keeps only channel 2/2', () => {
    const stream = new Uint8Array([
      ...d4Packet(0, 0, [0x80, 0x00, 0x20]),        // InitReply on TX channel
      ...d4CtrlPacket([0x40, 0x42, 0x44, 0x43]),    // data on 2/2
      ...d4CtrlPacket([0x45, 0x45]),                // more data on 2/2
    ]);
    const packets = parseD4Packets(stream);
    expect(packets).toHaveLength(3);
    expect(packets[0]).toEqual({ psid: 0, ssid: 0, payload: [0x80, 0x00, 0x20] });
    expect(extractD4CtrlPayloads([stream])).toEqual([0x40, 0x42, 0x44, 0x43, 0x45, 0x45]);
  });

  it('builds the full session: enter, Init, OpenChannel(2,2), frames, Exit', () => {
    const steps = buildD4SessionSteps([[0x73, 0x74, 0x01, 0x00, 0x01]]);
    expect(steps).toHaveLength(5);
    // reinkpy CMD_ENTER_D4: two bare @EJL lines, no trailing ESC @.
    expect(steps[0].hex.startsWith('00 00 00 1b 01 40 45 4a 4c 20 31 32 38 34 2e 34 0a')).toBe(true);
    expect(steps[0].hex.endsWith('40 45 4a 4c 0a 40 45 4a 4c 0a')).toBe(true);
    // Init(0x20) then OpenChannel with sid 2/2, maxPTS/maxSTP 0x0100.
    expect(steps[1].hex).toBe('00 00 00 08 01 00 00 20');
    expect(steps[2].hex).toBe('00 00 00 0f 01 00 01 02 02 01 00 01 00 00 00');
    // The data frame rides the 2/2 channel; the session ends with Exit (0x08).
    expect(steps[3].hex).toBe('02 02 00 0b 01 00 73 74 01 00 01');
    expect(steps[4].hex).toBe('00 00 00 07 01 00 08');
  });
});

describe('EEPROM backup files', () => {
  it('round-trips values through makeEepromBackup and parseEepromBackup', () => {
    const values = new Map([[24, 0x5a], [25, 0], [46, 94]]);
    const backup = makeEepromBackup('L386', values, 'XJ123456');
    expect(backup.values).toEqual({ '24': 90, '25': 0, '46': 94 });
    const parsed = parseEepromBackup(JSON.stringify(backup));
    expect(parsed.model).toBe('L386');
    expect(parsed.serial).toBe('XJ123456');
    expect(parsed.values['46']).toBe(94);
  });

  it('rejects foreign files and unknown models', () => {
    expect(() => parseEepromBackup('{"hello":"world"}')).toThrow(/not an AnchorWorks/);
    const bogus = JSON.stringify({ app: 'AnchorWorks', kind: 'epson-eeprom', model: 'NOT-A-MODEL', values: {} });
    expect(() => parseEepromBackup(bogus)).toThrow(/unknown model/);
  });
});

describe('bigEndianValue (stats counters)', () => {
  it('treats the first address as the most significant byte', () => {
    // epson_print_conf: total = (total << 8) + byte, list order preserved.
    expect(bigEndianValue([0x01, 0x00])).toBe(256);
    expect(bigEndianValue([167, 166, 165, 164].map(() => 0x01))).toBe(0x01010101);
    expect(bigEndianValue([0, 0])).toBe(0);
  });

  it('returns null when an address went unanswered', () => {
    expect(bigEndianValue([1, undefined])).toBeNull();
    expect(bigEndianValue([null])).toBeNull();
  });
});
