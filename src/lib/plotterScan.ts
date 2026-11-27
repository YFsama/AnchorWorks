/**
 * Serial-port scan — the decisions behind the connection card's automatic
 * "which port is the cutter?" pass, kept free of DOM, Tauri and the link so
 * they unit-test in the plain (plotterScan.test.ts).
 *
 * What runs when the Machine tab is shown without a link:
 *
 *   shell     list                       candidates        active identify
 *   native    serial_list_ports          ranked USB ports  1–3 of them, automatic
 *   web       navigator.serial.getPorts  the ONE already-   only when there is
 *                                        authorized port   exactly one (the
 *                                                           browser opens it
 *                                                           without a chooser)
 *
 * Two guards matter:
 *
 *  - AUTO_IDENTIFY_MAX. Probing opens a port and talks to it, so it is only
 *    unattended when the candidate list is short enough to read at a glance;
 *    beyond that the card offers a "Scan & identify" button instead.
 *  - The web shell can never open a port silently unless exactly one is
 *    authorized — with two or more `open()` would raise the browser chooser,
 *    which needs a user gesture.
 */

import type { NativeSerialPort } from './plotter';
import { chipForVidPid, rankCutterPorts, type ChipInfo } from './plotterIdentify';

/** Option value of the "Virtual plotter" entry — never a real OS path. */
export const SIM_PORT = 'virtual:simulated-plotter';
/** Stand-in path for the browser's one authorized port (Web Serial has no OS path). */
export const WEB_PORT = 'web:authorized-serial';
/** Candidate ports at or below this number are identified without asking. */
export const AUTO_IDENTIFY_MAX = 3;

/* ---- Unattended-probe memory ----------------------------------------------
 * The Machine pane of the plotter dialog remounts on every visit, so "this
 * list was already probed" cannot live in the component: a component ref
 * forgot it each time, and the ports were opened — the machine questioned —
 * again on every visit. */

let probedList = '';

/** Remember `signature` (the probed port paths, joined) as probed unattended. */
export function markAutoProbed(signature: string): void { probedList = signature; }

/** True when exactly this list was the last one probed unattended. */
export function wasAutoProbed(signature: string): boolean { return probedList === signature; }

/** Forget the probe history (tests; a new session surface). */
export function resetAutoProbeMemory(): void { probedList = ''; }

export type ScanShell = 'native' | 'web';

export interface ScanCandidate {
  /** OS path (native) or WEB_PORT (web shell). */
  path: string;
  chip: ChipInfo | null;
  /** 3 known cutter chip · 2 other known adapter chip · 1 any other USB port. */
  score: number;
  /** Descriptor to hand the probe — null when the shell opens by itself (web). */
  port: NativeSerialPort | null;
}

export interface ScanPlan {
  shell: ScanShell;
  /** Ranked candidates, most likely cutter first. Empty = nothing to connect to. */
  candidates: ScanCandidate[];
  /** Ports the shell found but will not probe (web shell, 2+ authorized). */
  unlisted: number;
  /** Probe automatically: few enough candidates, and every one opens silently. */
  autoIdentify: boolean;
  /** Descriptors for `runAutoSetup` (empty when nothing can be probed silently). */
  probePorts: NativeSerialPort[];
}

/** Where `getInfo()` of a Web Serial port bottoms out. */
export interface WebPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

const finishPlan = (shell: ScanShell, candidates: ScanCandidate[], unlisted: number): ScanPlan => {
  const autoIdentify = candidates.length > 0 && candidates.length <= AUTO_IDENTIFY_MAX;
  const probePorts = autoIdentify ? candidates.map(c => c.port).filter((p): p is NativeSerialPort => p !== null) : [];
  return { shell, candidates, unlisted, autoIdentify, probePorts };
};

/** Native shell: every USB / unknown-kind port, known cutter chips first. */
export function planNativeScan(ports: NativeSerialPort[]): ScanPlan {
  const candidates = rankCutterPorts(ports).map(({ port, chip, score }) => ({ path: port.path, chip, score, port }));
  return finishPlan('native', candidates, 0);
}

/**
 * Web shell. `granted` is what `navigator.serial.getPorts()` returned — the
 * ports this origin is already allowed to open. Exactly one is the only case
 * the browser opens without its chooser; two or more are reported as
 * `unlisted` and left to the chooser.
 */
export function planWebScan(granted: readonly WebPortInfo[]): ScanPlan {
  if (granted.length !== 1) return finishPlan('web', [], granted.length);
  const info = granted[0];
  const chip = chipForVidPid(info.usbVendorId, info.usbProductId);
  // A stand-in descriptor: the link opens the single authorized port by
  // itself on this shell, so the "path" only has to be unique and obviously
  // not an OS one — it is never handed to a driver.
  const port: NativeSerialPort = {
    path: WEB_PORT,
    kind: 'usb',
    ...(info.usbVendorId !== undefined ? { vid: info.usbVendorId } : {}),
    ...(info.usbProductId !== undefined ? { pid: info.usbProductId } : {}),
  };
  const candidates: ScanCandidate[] = [{ path: WEB_PORT, chip, score: chip ? (chip.likelihood === 'high' ? 3 : 2) : 1, port }];
  return finishPlan('web', candidates, 0);
}

/**
 * Bauds the AUTOMATIC probe may try on a port. Deliberately short: an
 * unattended probe must not rake a silent machine with every rate (the
 * manual Auto-detect still does). What already worked on this port comes
 * first, then the chip's usual rate, then the two that cover nearly every
 * cutter and controller.
 */
export function autoProbeBauds(chip: ChipInfo | null, known: readonly number[] = []): number[] {
  const wanted = [...known, chip?.probeBaud ?? 9600, 9600, 115200];
  return [...new Set(wanted.filter(b => Number.isFinite(b) && b > 0))];
}

export interface LastLink {
  /** OS path of the port, or WEB_PORT when the link was made in the browser. */
  port: string;
  baud: number;
}

/**
 * Port the card should show selected: the operator's own pick while it still
 * exists, else the port of the last successful link, else the best-ranked
 * candidate. '' when there is nothing to select.
 */
export function pickScanPort(candidates: readonly ScanCandidate[], lastLink: LastLink | null, current: string): string {
  const paths = new Set(candidates.map(c => c.path));
  if (current && paths.has(current)) return current;
  if (lastLink && paths.has(lastLink.port)) return lastLink.port;
  return candidates[0]?.path ?? '';
}

/** Baud to show for that port: the one the last successful link used on it, else the current choice. */
export function pickScanBaud(port: string, lastLink: LastLink | null, currentBaud: number): number {
  return lastLink && lastLink.port === port && Number.isFinite(lastLink.baud) && lastLink.baud > 0 ? lastLink.baud : currentBaud;
}

const LAST_LINK_KEY = 'vector.plotter.lastLink';

/** Port + baud of the last link that reached `connected` (null: never, or unreadable). */
export function loadLastLink(): LastLink | null {
  try {
    const raw = window.localStorage.getItem(LAST_LINK_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LastLink>;
    if (typeof p.port !== 'string' || !p.port || typeof p.baud !== 'number' || !Number.isFinite(p.baud) || p.baud <= 0) return null;
    return { port: p.port, baud: p.baud };
  } catch {
    return null;
  }
}

export function saveLastLink(link: LastLink): void {
  try {
    window.localStorage.setItem(LAST_LINK_KEY, JSON.stringify(link));
  } catch { /* quota / private mode — the next scan just has no memory */ }
}
