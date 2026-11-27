/**
 * Cutter identification — "which of these serial ports is my machine,
 * and what is it?"
 *
 * Two complementary signals:
 *
 *  1. USB bridge chips. The USB-serial adapter a cutter uses is a strong
 *     fingerprint: Chinese Roland-compatible clones (Liyu / Rabbit /
 *     Teneth / Redsail / Creation …) virtually always sit behind a WCH
 *     CH340/CH341, older brand machines behind FTDI or Prolific, grbl
 *     pen plotters behind CP2102 or an STM32 CDC port. Knowing the chip
 *     also means knowing what to try first (clones: 9600, grbl: 115200).
 *
 *  2. The machine's own answer. HP-GL has a standard identification
 *     query — `OI;` (Output Identification) — that makes cutters reply
 *     with their model string ("GX-24", "CE6000-60", …). Combined with
 *     the chip hint we can suggest the right machine profile, including
 *     the no-reply case: a CH340 port that stays silent on OI; is very
 *     likely a clone that ignores status queries (they mostly do).
 */

import type { NativeSerialPort } from './plotter';
import type { PlotterLink } from './plotterLink';
import { PROBE_BAUD_RATES } from './plotterDiag';

export interface ChipInfo {
  chip: string;
  maker: string;
  /** How likely this adapter belongs to a cutter/plotter. */
  likelihood: 'high' | 'medium' | 'unknown';
  /** Suggested first baud for probing. */
  probeBaud: number;
}

interface ChipEntry extends ChipInfo {
  vid: number;
  pid?: number;
}

const CHIP_DB: ChipEntry[] = [
  // WCH — the defacto standard inside Chinese cutter clones.
  { vid: 0x1a86, pid: 0x7523, chip: 'CH340/CH341', maker: 'WCH', likelihood: 'high', probeBaud: 9600 },
  { vid: 0x1a86, pid: 0x55d4, chip: 'CH9102', maker: 'WCH', likelihood: 'high', probeBaud: 9600 },
  { vid: 0x1a86, pid: 0x5523, chip: 'CH549 USB', maker: 'WCH', likelihood: 'high', probeBaud: 9600 },
  // FTDI — brand-name cutters and good-quality adapters.
  { vid: 0x0403, pid: 0x6001, chip: 'FT232R', maker: 'FTDI', likelihood: 'medium', probeBaud: 9600 },
  { vid: 0x0403, pid: 0x6015, chip: 'FT231X', maker: 'FTDI', likelihood: 'medium', probeBaud: 9600 },
  // Prolific — older Roland/Graphtec serial cables.
  { vid: 0x067b, pid: 0x2303, chip: 'PL2303', maker: 'Prolific', likelihood: 'medium', probeBaud: 9600 },
  // SiLabs — grbl pen plotters, laser machines, some clone boards.
  { vid: 0x10c4, pid: 0xea60, chip: 'CP2102', maker: 'Silicon Labs', likelihood: 'medium', probeBaud: 115200 },
  // STM32 native CDC — grbl HAL / Marlin boards.
  { vid: 0x0483, pid: 0x5740, chip: 'STM32 CDC', maker: 'ST', likelihood: 'medium', probeBaud: 115200 },
];

/** Identify the USB-serial bridge chip behind a port (best effort). */
export function chipForVidPid(vid: number | undefined, pid: number | undefined): ChipInfo | null {
  if (vid === undefined) return null;
  const exact = pid === undefined ? undefined : CHIP_DB.find(c => c.vid === vid && c.pid === pid);
  if (exact) return { ...exact };
  const byVid = CHIP_DB.find(c => c.vid === vid);
  return byVid
    ? { chip: `${byVid.maker} USB-serial`, maker: byVid.maker, likelihood: byVid.likelihood, probeBaud: byVid.probeBaud }
    : null;
}

/** Chip info for a listed serial port. */
export function chipForPort(port: NativeSerialPort): ChipInfo | null {
  return chipForVidPid(port.vid, port.pid);
}

/** Match a machine model string (HP-GL OI; reply) to a profile id. */
export function suggestProfileFromModel(model: string): string | null {
  const m = model.trim().toUpperCase();
  if (!m) return null;
  if (/(PCUT|CREATION|LIYU|RABBIT|TENETH|REDSAIL|SAGA|UKCUTTER|ANJC|MEIHUA|文泰)/.test(m)) return 'china-clone';
  if (/\b(GX|GS)\s?-?\d/.test(m) || /CAMM/.test(m)) return 'roland-camm1';
  if (/PNC/.test(m)) return 'roland-pnc';
  if (/(CRAFT\s?ROBO|CE\s?LITE)/.test(m)) return 'graphtec-ce';
  if (/\b(CE|FC|CF)\s?-?\d/.test(m)) return 'graphtec-fc';
  if (/MIMAKI/.test(m) || /^CG\s?-?\d/.test(m)) return 'mimaki-cg';
  if (/SUMMA/.test(m)) return 'summa';
  if (/(PUMA|EXPERT|JAGUAR|GCC)/.test(m)) return 'gcc';
  if (/(7475|7550|7585|DRAFTMASTER|DRAFTPRO)/.test(m)) return 'generic-hpgl';
  return null;
}

export interface IdentifyResult {
  /** Model string from OI; ('' when the machine stayed silent). */
  model: string;
  /** Last HP-GL error code (OE;) when answered. */
  error: string | null;
  /** Machine page from OH; when answered. */
  page: string | null;
  /** Suggested machine-profile id (see machineProfiles.ts), or null. */
  suggestedProfileId: string | null;
  /** One-line operator summary. */
  summary: string;
}

/** grbl's answer to `$I`, reduced to its build string. The buffer a query
 *  harvests often has the controller's boot banner in front (it is printed
 *  when the port opens) and always ends in `ok` — neither is the build. */
export function cleanGrblBuild(reply: string): string {
  return reply
    .split(/[\r\n]+/)
    .map(s => s.trim())
    .filter(s => s && !/^ok$/i.test(s) && !/^grbl\b/i.test(s))
    .join(' ');
}

/** Query a connected machine for its identity: OI; (model), OE; (error),
 *  OH; (page) — or $I (firmware build) on grbl. Silent replies are normal
 *  for clones — the summary says so instead of claiming a fault. */
export async function identifyMachine(link: Pick<PlotterLink, 'status' | 'query'>, format: 'gcode' | 'hpgl'): Promise<IdentifyResult> {
  if (format === 'gcode') {
    const build = cleanGrblBuild(await link.query('$I', 1200).catch(() => ''));
    return {
      model: build,
      error: null,
      page: null,
      suggestedProfileId: build ? 'grbl-generic' : null,
      summary: build
        ? `grbl firmware: ${build}`
        : 'No reply — the controller may be locked (try Unlock) or the baud is wrong.',
    };
  }
  const oiRaw = await link.query('OI;', 1200).catch(() => '');
  const oiReply = oiRaw.replace(/[\r\n;]+/g, '').trim();
  // Same guard as autoDetectCutter: `error:N` to OI; means "not an HP-GL
  // plotter" (a grbl controller), so identify it as grbl instead of
  // reporting an HP-GL machine whose model is the error text. The raw reply
  // is tested: a controller's boot banner sits in front of the first answer.
  if (isRejectReply(oiRaw)) {
    const build = cleanGrblBuild(await link.query('$I', 1200).catch(() => ''));
    return {
      model: build,
      error: null,
      page: null,
      suggestedProfileId: build ? 'grbl-generic' : null,
      summary: build
        ? `grbl firmware: ${build} — switch the output format to G-code`
        : `Not an HP-GL plotter: it answered OI; with "${oiReply}" (a grbl-style error) but stayed silent to $I.`,
    };
  }
  const model = oiReply;
  const errReply = (await link.query('OE;', 800).catch(() => '')).replace(/[\r\n;]+/g, '').trim();
  const pageReply = (await link.query('OH;', 800).catch(() => '')).replace(/[\r\n;]+/g, '').trim();
  const suggested = suggestProfileFromModel(model);
  const parts: string[] = [];
  if (model) parts.push(`model "${model}"`);
  if (errReply) parts.push(`error ${errReply}`);
  if (pageReply) parts.push(`page ${pageReply}`);
  const summary = model
    ? `Machine answered: ${parts.join(' · ')}${suggested ? ' — profile suggested' : ''}`
    : 'No reply to OI; — very common for Chinese clones (they ignore status queries). Judge the link by the self-test and a test cut instead.';
  return { model, error: errReply || null, page: pageReply || null, suggestedProfileId: suggested, summary };
}

/** A reply that is a protocol rejection rather than data — grbl answers any
 *  statement it does not understand with `error:N`. The line is looked for
 *  anywhere in the reply: whatever was in the buffer in front of it (the
 *  boot banner a controller prints when the port opens) must not hide it. */
export function isRejectReply(reply: string): boolean {
  return /(?:^|[\r\n])\s*error\s*:\s*\d+/i.test(reply.trim());
}

export interface DetectedCutter {
  portPath: string;
  chip: ChipInfo | null;
  /** Model string when the machine answered OI;. */
  model: string;
  /** True when it answered like a grbl controller. */
  grbl: boolean;
  /** Machine language to switch the app to: grbl → G-code, else HP-GL. */
  format: 'gcode' | 'hpgl';
  /** grbl $I build string when the controller answered it. */
  grblBuild?: string;
  baud: number;
  suggestedProfileId: string | null;
}

/** Rank ports: known cutter chips first (high → medium), then other USB. */
export function rankCutterPorts(ports: NativeSerialPort[]): Array<{ port: NativeSerialPort; chip: ChipInfo | null; score: number }> {
  return ports
    .filter(p => p.kind === 'usb' || p.kind === 'unknown')
    .map(port => {
      const chip = chipForPort(port);
      const score = chip?.likelihood === 'high' ? 3 : chip?.likelihood === 'medium' ? 2 : port.kind === 'usb' ? 1 : 0;
      return { port, chip, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);
}

export interface AutoDetectOptions {
  flowControl?: 'none' | 'hardware' | 'software';
  onLog?: (line: string) => void;
  /** Extra bauds to try per port (defaults cover clones + grbl). */
  bauds?: number[];
  /** Stop between attempts — the operator pressed Connect, or left the page.
   *  The port being probed right now is still closed cleanly. */
  signal?: AbortSignal;
}

/**
 * Scan ranked ports for something that answers like a cutter. For each
 * candidate: open at the chip-suggested baud, then the remaining probe
 * rates (chip suggestion + PROBE_BAUD_RATES, deduped — callers can pin
 * the list with `opts.bauds`), send `OI;` and `?`, wait briefly, close.
 * A grbl responder also gets a `$I` build query while the port is still
 * open. Restores any connection that was open when the scan started.
 * Returns the first responder, or null.
 *
 * Native (Tauri) only — Web Serial cannot enumerate ports.
 */
export async function autoDetectCutter(
  link: Pick<PlotterLink, 'status' | 'baud' | 'open' | 'close' | 'query'>,
  ports: NativeSerialPort[],
  opts: AutoDetectOptions = {},
): Promise<DetectedCutter | null> {
  const flow = opts.flowControl ?? 'none';
  const log = opts.onLog ?? (() => {});
  const wasConnected = link.status === 'connected';
  const originalBaud = link.baud;
  if (wasConnected) await link.close();

  let found: DetectedCutter | null = null;
  outer:
  for (const { port, chip } of rankCutterPorts(ports)) {
    const chipName = chip ? chip.chip : 'USB serial';
    const defaultBauds = [
      chip?.probeBaud ?? 9600,
      ...(chip?.probeBaud === 9600 ? [115200] : [9600]),
      ...PROBE_BAUD_RATES,
    ];
    const bauds = opts.bauds ?? [...new Set(defaultBauds)];
    for (const baud of bauds) {
      if (opts.signal?.aborted) break outer;
      try {
        await link.open({ portPath: port.path, baud, flowControl: flow });
      } catch {
        log(`${port.path} (${chipName}) @ ${baud} — open failed`);
        continue;
      }
      const oiRaw = await link.query('OI;', 700).catch(() => '');
      const oiReply = oiRaw.replace(/[\r\n;]+/g, '').trim();
      // A grbl controller rejects the HP-GL probe with `error:N`. That is a
      // protocol rejection, not a model string: count it as "no reply" so the
      // `?` probe below gets its chance. (It used to be taken for an HP-GL
      // machine called "error:20", and the controller was never recognised.)
      const model = isRejectReply(oiRaw) ? '' : oiReply;
      let grbl = false;
      let grblBuild = '';
      if (!model) {
        // A status report on any of its lines counts — the boot banner may
        // still be sitting in front of it on a real controller.
        const q = await link.query('?', 700).catch(() => '');
        grbl = q.split(/[\r\n]+/).some(line => line.trim().startsWith('<'));
        // Firmware build while the port is open — feeds the identify
        // report and the grbl profile suggestion.
        if (grbl) {
          grblBuild = cleanGrblBuild(await link.query('$I', 900).catch(() => ''));
        }
      }
      await link.close();
      if (model || grbl) {
        log(`${port.path} (${chipName}) @ ${baud} — ${model ? `answered "${model}"` : 'grbl controller'} ✓`);
        found = {
          portPath: port.path,
          chip,
          model,
          grbl,
          format: grbl ? 'gcode' : 'hpgl',
          ...(grblBuild ? { grblBuild } : {}),
          baud,
          suggestedProfileId: model
            ? suggestProfileFromModel(model)
            : (grbl ? 'grbl-generic' : chip?.likelihood === 'high' ? 'china-clone' : null),
        };
        break outer;
      }
      log(`${port.path} (${chipName}) @ ${baud} — no reply`);
    }
  }

  if (!found && wasConnected) {
    try { await link.open({ baud: originalBaud, flowControl: flow }); } catch { /* best effort */ }
  }
  return found;
}
