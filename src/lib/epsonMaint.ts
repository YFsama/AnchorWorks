/**
 * Epson inkjet maintenance toolkit — frontend side.
 *
 * The desktop shell talks to USB inkjet printers through WinSpool RAW
 * jobs (src-tauri/src/epsonprint.rs): WritePrinter sends ESC sequences,
 * ReadPrinter brings replies back. This module provides:
 *
 *  - the printer list / transact wrappers (callNative),
 *  - a catalogue of maintenance ACTIONS with safety tiers: documented
 *    ESC/P2 sequences (init, head cleaning, nozzle check) vs
 *    EXPERIMENTAL queries whose reply formats vary per model family,
 *  - a hex workbench (parse/format/reply hints) for pasting community
 *    maintenance templates — counter resets are model-specific and NOT
 *    built in; the workbench sends what the operator provides, clearly
 *    labelled.
 */

import { callNative } from './runtime';
import { EPSON_MODELS, type EpsonModelEntry } from './epsonModels';

export interface EpsonPrinter {
  name: string;
  port: string;
  driver: string;
  isEpson: boolean;
}

/** Installed printers as the spooler sees them. Empty on non-desktop. */
export async function listEpsonPrinters(): Promise<EpsonPrinter[]> {
  const ports = await callNative<EpsonPrinter[]>('epson_list_printers', undefined, async () => []);
  return ports ?? [];
}

/** One RAW send + read cycle. Returns reply bytes (may be empty). */
export async function epsonTransact(printer: string, hex: string, readMs = 700): Promise<Uint8Array> {
  const replyHex = await callNative<string>(
    'epson_raw_transact',
    { printer, hex: hex.replace(/[\s,:-]+/g, ''), readMs, maxRead: 4096 },
    async () => { throw new Error('Epson maintenance needs the Windows desktop app.'); },
  );
  if (!replyHex) return new Uint8Array(0);
  return parseHex(replyHex);
}

/* ------------------------------------------------------------------ *
 * Hex workbench helpers
 */

/** Parse "1b 40", "1B40", "1b-40" (separators: space/tab/-/:/,) → bytes.
 *  Throws on odd length or any non-hex character. */
export function parseHex(text: string): Uint8Array {
  const clean = text.replace(/[\s,:-]+/g, '');
  if (clean.length === 0) throw new Error('hex payload is empty');
  if (clean.length % 2 !== 0) throw new Error('hex payload must have an even number of digits');
  if (/[^\da-fA-F]/.test(clean)) throw new Error('hex payload contains non-hex characters');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
}

/** Bytes for an ASCII command like "ESC @"-style plain text. */
export function asciiBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Turn a reply into something readable: known status fragments decoded,
 * everything else shown as hex + printable characters. Printer status
 * layouts differ per family, so unknown bytes are surfaced, never hidden.
 */
export function explainEpsonReply(bytes: Uint8Array): string {
  if (bytes.length === 0) return '(no reply — many models only answer proprietary queries)';
  const hex = toHex(bytes);
  const printable = [...bytes].map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '·').join('');
  const notes: string[] = [];
  // Common Epson status bytes: a leading 0x00/0x01 + "I"/"S" style magic.
  for (const [i, b] of bytes.entries()) {
    if (b === 0x06 && i === 0) notes.push('ACK');
    if (b === 0x15) notes.push('NAK');
    if (b === 0xff) notes.push(`byte ${i}: 0xff (often a "not available" marker)`);
  }
  return `${hex}  |${printable}|${notes.length > 0 ? `  · ${[...new Set(notes)].join(', ')}` : ''}`;
}

/* ------------------------------------------------------------------ *
 * Action catalogue
 */

export type EpsonActionSafety = 'documented' | 'experimental' | 'custom';

export interface EpsonAction {
  id: string;
  label: string;
  /** Hex payload to send. */
  hex: string;
  description: string;
  safety: EpsonActionSafety;
  /** Wait for a reply afterwards. */
  expectsReply: boolean;
}

/* ------------------------------------------------------------------ *
 * Verified protocol layer — sequences and reply parsers extracted from
 * escputil (gutenprint, GPL-2+, © Robert Krawitz) and the ST2 status
 * field table from epson_print_conf (Ircama, EUPL-1.2). Sources:
 *   - gutenprint src/escputil.c (remote header/trailer, CH/VI/NC/ST,
 *     @EJL ID, D4 entry, ink reply records)
 *   - epson_print_conf status_parser (@BDC ST2 TLV field map)
 * The D4 packet payloads ("st\1\0\1" etc.) are identical to escputil's
 * new-printer mode, which is itself the USB/IEEE-1284.4 transport the
 * community resetters (reinkpy, ez-reset) build on.
 */

/** escputil: "\033@\033(R\010\000\000REMOTE1" */
const REMOTE_HDR = [0x1b, 0x40, 0x1b, 0x28, 0x52, 0x08, 0x00, 0x00, 0x52, 0x45, 0x4d, 0x4f, 0x54, 0x45, 0x31];
/** escputil: "\033\000\000\000\033\000" */
const REMOTE_TRAILER = [0x1b, 0x00, 0x00, 0x00, 0x1b, 0x00];
/** escputil ends every print job with "\f\033\000\033\000" */
const JOB_END = [0x0c, 0x1b, 0x00, 0x1b, 0x00];
/** escputil D4 exit/init: "\000\000\000\033\001@EJL 1284.4\n@EJL \n\033@" */
const D4_ENTER = [
  0x00, 0x00, 0x00, 0x1b, 0x01, 0x40, 0x45, 0x4a, 0x4c, 0x20, 0x31, 0x32, 0x38, 0x34, 0x2e, 0x34, 0x0a,
  0x40, 0x45, 0x4a, 0x4c, 0x20, 0x0a, 0x1b, 0x40,
];

function hexOf(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
}

/** One EPSON-CTRL command block: 2-letter name + LE16 arg count + 1-byte args
 *  (escputil do_remote_cmd wire format). */
export function epsonCtrlBytes(cmd: string, ...args: number[]): number[] {
  const out = [cmd.charCodeAt(0), cmd.charCodeAt(1), args.length & 0xff, (args.length >> 8) & 0xff];
  for (const a of args) out.push(a & 0xff);
  return out;
}

/** Full escputil REMOTE1 frame for classic Stylus models. */
export function buildRemoteCommand(cmd: string, ...args: number[]): string {
  return hexOf([...REMOTE_HDR, ...epsonCtrlBytes(cmd, ...args), ...REMOTE_TRAILER, ...JOB_END]);
}

/** escputil new-printer mode: D4 entry followed by bare EPSON-CTRL packets. */
export function buildD4Command(cmd: string, ...args: number[]): string {
  return hexOf([...D4_ENTER, ...epsonCtrlBytes(cmd, ...args)]);
}

/** "@EJL ID" — IEEE-1284-style identity request (escputil init_str). */
export function buildEjlIdRequest(): string {
  return hexOf([0x1b, 0x01, 0x40, 0x45, 0x4a, 0x4c, 0x20, 0x49, 0x44, 0x0d, 0x0a]);
}

/* ---------------- ST2 status reply (per epson_print_conf) ------------- */

export interface St2InkEntry {
  /** ST2 colour_ids name, e.g. "Black" / "Cyan". */
  cartridge: string;
  /** ink_color_ids name (physical ink colour). */
  color: string;
  /** 0–100 percent. */
  level: number;
}

export interface St2MaintenanceBox {
  /** 0 = not full, 1 = near full, 2 = full (ST2 type 0x37). */
  level: number;
  /** Present on wide-format models (2-byte entries). */
  resetCount?: number;
}

export interface St2Status {
  status?: string;
  errors: string[];
  warnings: string[];
  ink: St2InkEntry[];
  maintenanceBoxes: St2MaintenanceBox[];
  serial?: string;
  serialInfo?: string;
  /** type 0x36 — five LE-int32 counters. */
  paperCount?: { normal: number; page: number; color: number; mono: number; blank: number };
  inkReplacementCounter?: string;
  maintenanceBoxReplacementCounter?: number;
  unknown: Array<{ type: number; hex: string }>;
}

const ST2_STATUS_IDS: Record<number, string> = {
  0x00: 'Error', 0x01: 'Self printing', 0x02: 'Busy', 0x03: 'Waiting',
  0x04: 'Idle (ready)', 0x05: 'Paused', 0x07: 'Cleaning', 0x08: 'Factory state',
  0x0a: 'Shutdown', 0x0f: 'Nozzle check', 0x11: 'Ink charging',
};

const ST2_ERROR_IDS: Record<number, string> = {
  0x00: 'Fatal error', 0x02: 'Cover open', 0x04: 'Paper jam', 0x05: 'Ink out',
  0x06: 'Paper out', 0x0c: 'Paper size/type/path error',
  0x10: 'Waste ink pad counter overflow', 0x1a: 'Cartridge cover open',
  0x22: 'Maintenance cartridge missing', 0x41: 'Maintenance request',
  0x47: 'Printing disabled', 0x4a: 'Maintenance box near end', 0x4b: 'Driver mismatch',
};

const ST2_CARTRIDGE_IDS: Record<number, string> = {
  0x01: 'Black', 0x03: 'Cyan', 0x04: 'Magenta', 0x05: 'Yellow',
  0x06: 'Light Cyan', 0x07: 'Light Magenta', 0x0a: 'Light Black',
  0x0b: 'Matte Black', 0x0f: 'Light Light Black', 0x10: 'Orange', 0x11: 'Green',
};

const ST2_INK_COLOR_IDS: Record<number, string> = {
  0x00: 'Black', 0x01: 'Cyan', 0x02: 'Magenta', 0x03: 'Yellow',
  0x04: 'Light Cyan', 0x05: 'Light Magenta', 0x06: 'Dark Yellow', 0x07: 'Grey',
  0x08: 'Light Black', 0x09: 'Red', 0x0a: 'Blue', 0x0b: 'Gloss Optimizer',
  0x0c: 'Light Grey', 0x0d: 'Orange',
};

const le32 = (b: Uint8Array, at: number): number =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

const ascii = (b: Uint8Array): string => new TextDecoder().decode(b).replace(/\0+$/, '').trim();

/**
 * Parse an "@BDC ST2" status reply: 11-byte header, LE16 payload length,
 * then a [type][len][item] TLV stream. Returns null when the bytes are
 * not an ST2 reply. Field map per epson_print_conf's status_parser.
 */
export function parseSt2Status(bytes: Uint8Array): St2Status | null {
  const at = bytes.findIndex((b, i) =>
    b === 0x40 && i + 9 < bytes.length &&
    bytes[i + 1] === 0x42 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x43 &&
    bytes[i + 4] === 0x20 && bytes[i + 5] === 0x53 && bytes[i + 6] === 0x54 &&
    bytes[i + 7] === 0x32 && bytes[i + 8] === 0x0d && bytes[i + 9] === 0x0a);
  if (at < 0) return null;
  const base = Math.max(0, at - 1); // usually the leading NUL of "\0@BDC ST2\r\n"
  const lenP = bytes[base + 11] | (bytes[base + 12] << 8);
  const payloadStart = base + 13;
  const payloadEnd = Math.min(bytes.length, payloadStart + lenP);
  const out: St2Status = { errors: [], warnings: [], ink: [], maintenanceBoxes: [], unknown: [] };
  let i = payloadStart;
  while (i + 1 < payloadEnd) {
    const type = bytes[i];
    const len = bytes[i + 1];
    const item = bytes.subarray(i + 2, Math.min(i + 2 + len, payloadEnd));
    i += 2 + Math.max(len, 1);
    switch (type) {
      case 0x01:
        if (item.length > 0) out.status = ST2_STATUS_IDS[item[0]] ?? `code 0x${item[0].toString(16)}`;
        break;
      case 0x02:
        for (const b of item) out.errors.push(ST2_ERROR_IDS[b] ?? `error 0x${b.toString(16)}`);
        break;
      case 0x04:
        for (const b of item) {
          if (b >= 0x10 && b <= 0x17) out.warnings.push(`Ink low (slot ${b - 0x10})`);
          else if (b === 0x44) out.warnings.push('Black print mode');
          else if (b >= 0x51 && b <= 0x54) out.warnings.push(`Cleaning disabled (slot ${b - 0x51})`);
          else if (b !== 0) out.warnings.push(`warning 0x${b.toString(16)}`);
        }
        break;
      case 0x0f: {
        // Ink information: item[0] = bytes per entry, then
        // [cartridgeId, colorId, level] triplets (escputil 0x0f record).
        const stride = item[0];
        if (stride > 0 && item.length >= 1 + stride) {
          for (let k = 1; k + stride <= item.length; k += stride) {
            out.ink.push({
              cartridge: ST2_CARTRIDGE_IDS[item[k]] ?? `cartridge 0x${item[k].toString(16)}`,
              color: ST2_INK_COLOR_IDS[item[k + 1]] ?? `0x${item[k + 1].toString(16)}`,
              level: item[k + 2] ?? 0,
            });
          }
        }
        break;
      }
      case 0x37: {
        // Maintenance box: item[0] = bytes per entry; entry = [level]
        // or [level, resetCount].
        const stride = item[0];
        if (stride > 0) {
          for (let k = 1; k < item.length; k += stride) {
            const box: St2MaintenanceBox = { level: item[k] };
            if (stride > 1 && k + 1 < item.length) box.resetCount = item[k + 1];
            out.maintenanceBoxes.push(box);
          }
        }
        break;
      }
      case 0x1f:
        out.serial = ascii(item);
        break;
      case 0x40:
        out.serialInfo = ascii(item);
        break;
      case 0x36:
        if (item.length === 20) {
          out.paperCount = {
            normal: le32(item, 0), page: le32(item, 4), color: le32(item, 8),
            mono: le32(item, 12), blank: le32(item, 16),
          };
        }
        break;
      case 0x45:
        out.inkReplacementCounter = hexOf([...item]);
        break;
      case 0x46:
        if (item.length > 0) out.maintenanceBoxReplacementCounter = item[0];
        break;
      default:
        out.unknown.push({ type, hex: hexOf([...item]) });
        break;
    }
  }
  return out;
}

/** Render a parsed ST2 status as operator-readable summary lines. */
export function formatSt2Summary(st: St2Status): string[] {
  const lines: string[] = [];
  if (st.status) lines.push(`Status: ${st.status}`);
  if (st.serial) lines.push(`Serial: ${st.serial}`);
  if (st.serialInfo && st.serialInfo !== st.serial) lines.push(`Serial info: ${st.serialInfo}`);
  for (const e of st.errors) lines.push(`ERROR: ${e}`);
  for (const w of st.warnings) lines.push(`Warning: ${w}`);
  for (const ink of st.ink) lines.push(`Ink ${ink.cartridge}${ink.color !== ink.cartridge ? ` (${ink.color})` : ''}: ${ink.level}%`);
  st.maintenanceBoxes.forEach((box, i) => {
    const label = box.level === 0 ? 'not full' : box.level === 1 ? 'NEAR FULL' : box.level === 2 ? 'FULL' : `level ${box.level}`;
    lines.push(`Maintenance box ${i + 1}: ${label}${box.resetCount !== undefined ? ` · reset count ${box.resetCount}` : ''}`);
  });
  if (st.maintenanceBoxReplacementCounter !== undefined) {
    lines.push(`Maintenance box replacements: ${st.maintenanceBoxReplacementCounter}`);
  }
  if (st.paperCount) {
    lines.push(`Pages: ${st.paperCount.page} (color ${st.paperCount.color} / mono ${st.paperCount.mono})`);
  }
  for (const u of st.unknown) lines.push(`Unknown field 0x${u.type.toString(16)}: ${u.hex}`);
  return lines;
}

/* ---------------- classic (old-protocol) reply parsing ---------------- */

/** Parse an "@EJL ID" reply: "…@EJL ID\r\n…MODEL:XP-XXXX …" → the ID line. */
export function parseEjlIdReply(bytes: Uint8Array): string | null {
  const text = new TextDecoder().decode(bytes);
  const m = text.match(/@EJL ID\r?\n([^\r\n]*)/);
  return m ? m[1].trim() : null;
}

/** Parse old escputil ink replies: `IQ:` groups of ASCII-hex per-cartridge
 *  percentages (2 digits each), semicolon-separated. Positional colour
 *  fallback: Black, Cyan, Magenta, Yellow, Light Cyan, Light Magenta. */
export function parseOldInkReply(bytes: Uint8Array): Array<{ color: string; level: number }> | null {
  const text = new TextDecoder().decode(bytes);
  const m = text.match(/IQ:([0-9A-Fa-f;]*)/);
  if (!m) return null;
  const digits = m[1].replace(/;/g, '');
  if (digits.length < 2) return null;
  const fallback = ['Black', 'Cyan', 'Magenta', 'Yellow', 'Light Cyan', 'Light Magenta'];
  const out: Array<{ color: string; level: number }> = [];
  for (let i = 0; i + 1 < digits.length; i += 2) {
    out.push({ color: fallback[i / 2] ?? `Slot ${i / 2}`, level: parseInt(digits.slice(i, i + 2), 16) });
  }
  return out;
}

/* ---------------- EEPROM access ("||" command family) ----------------- *
 * Wire format verified against epson_print_conf (Ircama, EUPL-1.2) and
 * reinkpy (AGPL, protocol cross-reference only): an EPSON-CTRL command
 * named "||" (0x7C 0x7C) whose payload is
 *   [readKey LE16]['A'|'B'][~cmd][rot(cmd)][addr LE16]        (read)
 *   [readKey LE16]['B'][~'B'][rot('B')][addr LE16][value]     (write)
 *   … + writeKey with every byte Caesar-shifted +1             (write)
 * Replies carry "EE:xxxxxx;" (4 hex address + 2 hex value) and ":OK;" /
 * ":NA;" status tokens. The golden sample frame from epson_print_conf
 * (7C 7C 10 00 49 08 42 BD 21 30 00 1A 42 73 62 6F 75 6A 67 70 — readKey
 * 73/8, write "Arantifo") is covered by the tests byte for byte.
 */

/** (c >> 1 & 0x7f) | (c << 7 & 0x80) — the rotate check byte epson_print_conf sends. */
function eepromRot(c: number): number {
  return ((c >> 1) & 0x7f) | ((c << 7) & 0x80);
}

/** writeKey bytes as they travel: each byte +1 (epson_print_conf `caesar`). */
export function caesarShift(key: string): number[] {
  return [...key].map(ch => {
    const b = ch.charCodeAt(0) & 0xff;
    return b === 0 ? 0 : (b + 1) & 0xff;
  });
}

/** Read frame for one EEPROM address (little-endian split at 0x100). */
export function eepromReadFrame(readKey: readonly number[], addr: number): number[] {
  const lsb = addr & 0xff;
  const msb = (addr >> 8) & 0xff;
  const payload = [readKey[0] & 0xff, readKey[1] & 0xff, 0x41, (~0x41) & 0xff, eepromRot(0x41), lsb, msb];
  return [0x7c, 0x7c, payload.length & 0xff, (payload.length >> 8) & 0xff, ...payload];
}

/** Write frame for one EEPROM address/value, authenticated by the model's writeKey. */
export function eepromWriteFrame(readKey: readonly number[], writeKey: string, addr: number, value: number): number[] {
  const lsb = addr & 0xff;
  const msb = (addr >> 8) & 0xff;
  const payload = [
    readKey[0] & 0xff, readKey[1] & 0xff,
    0x42, (~0x42) & 0xff, eepromRot(0x42),
    lsb, msb, value & 0xff,
    ...caesarShift(writeKey),
  ];
  return [0x7c, 0x7c, payload.length & 0xff, (payload.length >> 8) & 0xff, ...payload];
}

export interface EepromReadResult {
  addr: number;
  value: number;
}

/** All "EE:aavv;" occurrences in a reply, in order (read answers). */
export function parseEepromReads(bytes: Uint8Array): EepromReadResult[] {
  const text = new TextDecoder('latin1').decode(bytes);
  const out: EepromReadResult[] = [];
  const re = /EE:([0-9A-Fa-f]{6});?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ addr: parseInt(m[1].slice(0, 4), 16), value: parseInt(m[1].slice(4), 16) });
  }
  return out;
}

/** Status tokens: ':OK;' count (write acknowledged) and ':NA;' count (denied). */
export function parseEepromStatus(bytes: Uint8Array): { ok: number; na: number } {
  const text = new TextDecoder('latin1').decode(bytes);
  return {
    ok: (text.match(/:OK;/g) ?? []).length,
    na: (text.match(/:NA;/g) ?? []).length,
  };
}

/**
 * Waste-ink counters are big-endian multi-byte values stored across the
 * model's oids (most significant byte LAST in oid order — epson_print_conf
 * joins the reversed hex strings). Percent = value / divider.
 */
export function wastePercent(values: Array<number | null | undefined>, divider: number): number | null {
  if (values.some(v => v === null || v === undefined)) return null;
  const hex = values.map(v => (v as number).toString(16).padStart(2, '0')).reverse().join('');
  return Math.round((parseInt(hex, 16) / divider) * 100) / 100;
}

/* ---------------- temporary "rw" reset (serial-authenticated) ---------- *
 * epson_print_conf temporary_reset_waste: the "rw" command carries
 * struct.pack('<H', 1) + sha1(serial). Only the serial is needed — no
 * read_key — so it works on firmware that locks the EEPROM interface
 * (L3250 class). The reset survives until the printer is power-cycled.
 */

/** SHA-1 digest of the serial (Web Crypto, 20 bytes). */
export async function sha1Bytes(text: string): Promise<number[]> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(digest)];
}

/** "rw" frame with a precomputed digest (mode byte 1 — must be 0x01 to work). */
export function rwResetFrame(digest: number[], mode = 1): number[] {
  const payload = [mode & 0xff, 0, ...digest];
  return [0x72, 0x77, payload.length & 0xff, (payload.length >> 8) & 0xff, ...payload];
}

/** Did the printer acknowledge an "rw" reset? Token "rw:01:OK;". */
export function parseRwReply(bytes: Uint8Array): { ok: boolean; text: string } {
  const text = new TextDecoder('latin1').decode(bytes);
  return { ok: /rw:\d+:OK;/.test(text), text };
}

/* ---------------- high-level one-click flows -------------------------- */

export type EpsonLogFn = (dir: 'tx' | 'rx' | 'info' | 'err', text: string) => void;

export interface WasteReading {
  label: string;
  percent: number | null;
  /** Raw per-address values that fed the percentage, for the log card. */
  oids: number[];
}

export interface WasteReadResult {
  readings: WasteReading[];
  /** value per EEPROM address actually answered. */
  values: Map<number, number>;
  reply: Uint8Array;
  reads: EepromReadResult[];
}

/**
 * Read the waste-ink counters of one model in a single D4 session: build a
 * read frame for every unique counter address (main + borderless), send the
 * D4 entry followed by all frames in one RAW job, then map "EE:" answers
 * back onto addresses. No state is modified.
 */
export async function epsonReadWaste(printer: string, model: EpsonModelEntry, log?: EpsonLogFn): Promise<WasteReadResult> {
  const oids = [...new Set([...model.mainWaste.oids, ...(model.borderlessWaste?.oids ?? [])])];
  const frames = oids.map(a => eepromReadFrame(model.readKey, a));
  const hex = hexOf([...D4_ENTER, ...frames.flat()]);
  log?.('tx', `EEPROM read ${oids.length} addresses (D4): ${hex.slice(0, 96)}${hex.length > 96 ? ' …' : ''}`);
  const reply = await epsonTransact(printer, hex, 1500);
  log?.('rx', explainEpsonReply(reply));
  const reads = parseEepromReads(reply);
  const values = new Map<number, number>(reads.map(r => [r.addr, r.value]));
  const readings: WasteReading[] = [{
    label: 'Main waste pad',
    percent: wastePercent(model.mainWaste.oids.map(a => values.get(a) ?? null), model.mainWaste.divider),
    oids: model.mainWaste.oids,
  }];
  if (model.borderlessWaste) {
    readings.push({
      label: 'Borderless waste',
      percent: wastePercent(model.borderlessWaste.oids.map(a => values.get(a) ?? null), model.borderlessWaste.divider),
      oids: model.borderlessWaste.oids,
    });
  }
  return { readings, values, reply, reads };
}

/**
 * Permanent waste-ink reset: write the model's factory map (rawReset —
 * counter bytes to 0 plus maintenance-level bytes back to 94) in one D4
 * session. Returns per-address acknowledgement; every write must answer
 * ":OK;" for success.
 */
export async function epsonResetWastePermanent(
  printer: string,
  model: EpsonModelEntry,
  log?: EpsonLogFn,
): Promise<{ ok: boolean; okCount: number; naCount: number; total: number; reply: Uint8Array }> {
  const entries = Object.entries(model.rawReset).map(([a, v]) => ({ addr: parseInt(a, 10), value: v }));
  const frames = entries.map(e => eepromWriteFrame(model.readKey, model.writeKey, e.addr, e.value));
  const hex = hexOf([...D4_ENTER, ...frames.flat()]);
  log?.('tx', `EEPROM write ${entries.length} bytes (D4): ${hex.slice(0, 96)}${hex.length > 96 ? ' …' : ''}`);
  const reply = await epsonTransact(printer, hex, 1500);
  log?.('rx', explainEpsonReply(reply));
  const { ok, na } = parseEepromStatus(reply);
  return { ok: entries.length > 0 && ok >= entries.length && na === 0, okCount: ok, naCount: na, total: entries.length, reply };
}

/**
 * Temporary waste-ink reset ("rw", authenticated by SHA-1 of the serial).
 * Needs no model key; clears the error until the next power cycle. The
 * serial comes from the ST2 status block (plaintext) or the operator.
 */
export async function epsonResetWasteTemporary(
  printer: string,
  serial: string,
  log?: EpsonLogFn,
): Promise<{ ok: boolean; reply: Uint8Array }> {
  const digest = await sha1Bytes(serial);
  const frame = rwResetFrame(digest);
  const hex = hexOf([...D4_ENTER, ...frame]);
  log?.('tx', `rw temporary reset (D4): ${hexOf(frame)}`);
  const reply = await epsonTransact(printer, hex, 1200);
  log?.('rx', explainEpsonReply(reply));
  const { ok } = parseRwReply(reply);
  return { ok, reply };
}

/**
 * Guess the database model name from what the spooler and the printer
 * themselves report: the "MDL:" field of an @EJL ID reply first (most
 * precise), then the Windows printer name ("EPSON ET-2720 Series").
 * Longest database name wins so "ET-2720" beats a partial "ET-2".
 */
export function guessEpsonModel(printerName: string, identity = ''): string | null {
  const names = Object.keys(EPSON_MODELS);
  const mdl = identity.match(/MDL:([^;]+)/i)?.[1]?.trim().replace(/\s+Series$/i, '');
  if (mdl) {
    const hit = names.find(n => n.toLowerCase() === mdl.toLowerCase())
      ?? names.find(n => mdl.toLowerCase().includes(n.toLowerCase()));
    if (hit) return hit;
  }
  let best: string | null = null;
  const hay = printerName.toLowerCase();
  for (const n of names) {
    if (hay.includes(n.toLowerCase()) && (best === null || n.length > best.length)) best = n;
  }
  return best;
}

/** Maintenance actions. `documented` = part of public ESC/P2 reference;
 *  `experimental` = command family known, exact reply/behaviour varies
 *  between model generations — sent at the operator's own judgement. */
export const EPSON_ACTIONS: EpsonAction[] = [
  {
    id: 'init',
    label: 'Initialize (ESC @)',
    hex: '1b 40',
    description: 'Software initialize — resets the interface buffer. The safest first test that a RAW channel works.',
    safety: 'documented',
    expectsReply: false,
  },
  {
    id: 'clean-basic',
    label: 'Head cleaning (normal)',
    hex: buildRemoteCommand('CH', 0, 0),
    description: 'escputil REMOTE1 "CH" head-cleaning request (gutenprint). Prints nothing; the printer runs its cleaning cycle. Classic Stylus protocol — newer ET/XP models may need the D4 variant from the workbench.',
    safety: 'documented',
    expectsReply: false,
  },
  {
    id: 'clean-d4',
    label: 'Head cleaning (D4 mode)',
    hex: buildD4Command('CH', 0, 0),
    description: 'Same CH command wrapped for new-generation printers: IEEE 1284.4 entry (@EJL 1284.4) then the bare EPSON-CTRL packet — the transport reinkpy/ez-reset use.',
    safety: 'documented',
    expectsReply: false,
  },
  {
    id: 'nozzle',
    label: 'Nozzle check',
    hex: buildRemoteCommand('VI', 0, 0),
    description: 'escputil "VI" nozzle-check request (classic models). Prints the diagnostic grid so clogged nozzles show up.',
    safety: 'documented',
    expectsReply: false,
  },
  {
    id: 'identify',
    label: 'Identify (@EJL ID)',
    hex: buildEjlIdRequest(),
    description: 'IEEE-1284-style identity request (escputil). A reply starting "@EJL ID" names the model family — proves the bidirectional channel and identifies the machine.',
    safety: 'documented',
    expectsReply: true,
  },
  {
    id: 'status-st2',
    label: 'Status + ink + maintenance box (ST2)',
    hex: buildD4Command('st', 1),
    description: 'New-generation status request ("st\\1\\0\\1"). A "\\0@BDC ST2" reply decodes into status, errors, per-colour ink levels, maintenance-box state, serial and page counters — shown as a card when it parses.',
    safety: 'documented',
    expectsReply: true,
  },
  {
    id: 'status-old',
    label: 'Ink levels (classic ST)',
    hex: buildRemoteCommand('ST', 0, 1),
    description: 'escputil "ST 0 1" status/ink request for classic Stylus models. Reply "IQ:" groups decode into per-cartridge percentages.',
    safety: 'documented',
    expectsReply: true,
  },
  {
    id: 'test-text',
    label: 'Test print (text)',
    hex: '1b 40 41 6e 63 68 6f 72 57 6f 72 6b 73 20 74 65 73 74 20 30 31 32 33 34 35 36 37 38 39 20 0c',
    description: 'Initializes, prints one line of text ("AnchorWorks test 0123456789"), then a form feed (0c) ejects the page. Verifies the whole path with paper.',
    safety: 'documented',
    expectsReply: false,
  },
];

/**
 * Community maintenance templates for the custom workbench. Counter
 * resets (waste ink / maintenance box) are MODEL-SPECIFIC — the correct
 * sequence depends on the machine generation and often a handshake the
 * vendor tools implement. We ship placeholders + guidance instead of a
 * wrong guess: paste the sequence for YOUR model from the community
 * tool you trust, review the hex, then send.
 */
export interface EpsonTemplate {
  id: string;
  label: string;
  hex: string;
  description: string;
}

export const EPSON_TEMPLATES: EpsonTemplate[] = [
  {
    id: 'blank',
    label: '— empty —',
    hex: '',
    description: '',
  },
  {
    id: 'sniff-status',
    label: 'Status probe (ESC @ + DLE DC4)',
    hex: '1b 40 10 04 01',
    description: 'Bidirectional-channel probe: initialize, then ask for a real-time status byte.',
  },
  {
    id: 'remote-ch-d4',
    label: 'Remote CH — D4 mode (escputil)',
    hex: buildD4Command('CH', 0, 0),
    description: 'Head cleaning for new-generation models: IEEE 1284.4 entry + bare EPSON-CTRL packet (escputil new-printer mode).',
  },
  {
    id: 'remote-vi-d4',
    label: 'Nozzle check — D4 mode (escputil)',
    hex: buildD4Command('VI', 0, 0),
    description: 'Nozzle-check request for new-generation models (escputil new-printer mode).',
  },
  {
    id: 'remote-st-d4',
    label: 'Status ST — D4 mode (escputil)',
    hex: buildD4Command('ST', 0, 1),
    description: 'Classic ST status request wrapped for D4 printers — reply carries IQ: ink groups on models that speak the old protocol.',
  },
];

/* ------------------------------------------------------------------ *
 * Persisted preferences — which printer, last custom command.
 */

export interface EpsonPrefs {
  printer: string;
  lastCustomHex: string;
  /** Last selected model in the waste-counter section. */
  model?: string;
  /** Last known serial (from ST2 or typed) for the rw temporary reset. */
  serial?: string;
}

const PREFS_KEY = 'vector.epson.prefs';

export function loadEpsonPrefs(): Partial<EpsonPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<EpsonPrefs>) : {};
  } catch {
    return {};
  }
}

export function saveEpsonPrefs(prefs: Partial<EpsonPrefs>): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadEpsonPrefs(), ...prefs }));
  } catch { /* storage unavailable — prefs are a convenience */ }
}
