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
    hex: '1b 28 4b 02 00 00 01',
    description: 'ESC ( K head-cleaning request, normal level. Prints nothing; the printer runs its cleaning cycle.',
    safety: 'documented',
    expectsReply: false,
  },
  {
    id: 'clean-deep',
    label: 'Head cleaning (deep)',
    hex: '1b 28 4b 02 00 00 03',
    description: 'ESC ( K cleaning request, heavier level — uses more ink. Try normal first.',
    safety: 'experimental',
    expectsReply: false,
  },
  {
    id: 'nozzle',
    label: 'Nozzle check',
    hex: '1b 28 4b 02 00 01 01',
    description: 'ESC ( K nozzle-check pattern request — prints the diagnostic grid so clogged nozzles show up.',
    safety: 'experimental',
    expectsReply: false,
  },
  {
    id: 'status-poll',
    label: 'Status query (probe)',
    hex: '1b 40 10 04 01',
    description: 'Initialize then an ESC/POS-style real-time status request. Many inkjets stay silent; a reply proves a bidirectional channel.',
    safety: 'experimental',
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
    id: 'identify',
    label: 'Model / ID probe (experimental)',
    hex: '1b 40 1b 28 53 01 00 00',
    description: 'Some firmware families answer an identification request after init — reply contents vary by generation.',
  },
];

/* ------------------------------------------------------------------ *
 * Persisted preferences — which printer, last custom command.
 */

export interface EpsonPrefs {
  printer: string;
  lastCustomHex: string;
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
