/**
 * One-click plotter / engraver auto-setup.
 *
 * Everything the pieces in plotterIdentify.ts / plotterDiag.ts could do
 * individually, strung into the sequence an operator actually wants when
 * a machine is plugged in for the first time:
 *
 *   rank ports → probe each (OI; + ? over the chip-suggested and common
 *   bauds) → reopen the winner → identify (OI; on HP-GL, $I on grbl) →
 *   read the grbl $$ table when it's a grbl (laser mode $32 picks the
 *   laser profile) → suggest a machine profile → run the light
 *   connection self-test.
 *
 * Every step lands in `steps` as a DiagStep so the UI can show exactly
 * what happened without re-running anything.
 *
 * Silence handling: most Chinese clones never answer any query. When the
 * top-ranked port sits behind a high-likelihood clone chip (CH340 …) and
 * everything stayed silent, the result carries a "suspected clone"
 * suggestion (china-clone profile, keep the current format) instead of a
 * dead end.
 *
 * Connection policy: the probe may close a connection that was open when
 * the scan started. On success the link is left connected at the winner
 * settings ONLY when it was connected before; otherwise it is closed at
 * the end — auto-detect never auto-connects, the operator presses
 * Connect.
 */

import type { NativeSerialPort } from './plotter';
import type { FlowControl, PlotterLink } from './plotterLink';
import { autoDetectCutter, identifyMachine, rankCutterPorts, suggestProfileFromModel, type ChipInfo } from './plotterIdentify';
import { runConnectionSelfTest, type DiagStep } from './plotterDiag';

/** Minimal link surface auto-setup needs — stub-friendly for unit tests. */
export type AutoSetupLink = Pick<PlotterLink, 'status' | 'baud' | 'open' | 'close' | 'query' | 'send'>;

export interface GrblSetting {
  /** Setting key including the '$', e.g. '$32'. */
  key: string;
  value: string;
}

export interface AutoSetupResult {
  /** True when a machine answered a probe (OI; model or grbl status). */
  found: boolean;
  /** True when nothing answered but the top port looks like a clone adapter. */
  suspectedClone: boolean;
  /** Winning port path ('' when nothing was found). */
  port: string;
  baud: number;
  /** Machine language the app should switch to. */
  format: 'gcode' | 'hpgl';
  /** Suggested machine profile id (machineProfiles.ts), null = none. */
  profileId: string | null;
  /** HP-GL OI; model string ('' for grbl). */
  model: string;
  chip: ChipInfo | null;
  /** True when the responder answered like grbl. */
  grbl: boolean;
  /** grbl $I firmware build string when available. */
  grblBuild: string;
  /** grbl $$ snapshot ($key=value pairs) when the controller answered. */
  grblSettings: GrblSetting[];
  /** What happened, step by step. */
  steps: DiagStep[];
}

export interface AutoSetupOptions {
  flowControl?: FlowControl;
  /** Pin the probe baud list (defaults: chip suggestion + common rates). */
  bauds?: number[];
  /** Format to keep when everything stays silent (default 'hpgl'). */
  currentFormat?: 'gcode' | 'hpgl';
  onLog?: (line: string) => void;
  /** Stop between steps (the operator pressed Connect, or left the page):
   *  the port probes end after the attempt in flight and the identify /
   *  self-test leg is skipped — the result still says what was found. */
  signal?: AbortSignal;
}

/** Parse a grbl $$ reply into $key=value pairs. */
export function parseGrblSettings(reply: string): GrblSetting[] {
  const out: GrblSetting[] = [];
  for (const m of reply.matchAll(/\$(\d+)=([^\r\n]*)/g)) {
    out.push({ key: `$${m[1]}`, value: m[2].trim() });
  }
  return out;
}

const emptyResult = (steps: DiagStep[]): AutoSetupResult => ({
  found: false,
  suspectedClone: false,
  port: '',
  baud: 0,
  format: 'hpgl',
  profileId: null,
  model: '',
  chip: null,
  grbl: false,
  grblBuild: '',
  grblSettings: [],
  steps,
});

export async function runAutoSetup(
  link: AutoSetupLink,
  ports: NativeSerialPort[],
  opts: AutoSetupOptions = {},
): Promise<AutoSetupResult> {
  const flow = opts.flowControl ?? 'none';
  const log = opts.onLog ?? (() => {});
  const keepFormat = opts.currentFormat ?? 'hpgl';
  const steps: DiagStep[] = [];

  const ranked = rankCutterPorts(ports);
  steps.push({
    label: 'Ports',
    status: ranked.length > 0 ? 'info' : 'fail',
    detail: ranked.length > 0
      ? `${ranked.length} candidate port(s); best: ${ranked[0].port.path}${ranked[0].chip ? ` (${ranked[0].chip.chip})` : ''}`
      : 'No USB serial ports to probe — plug the machine in and rescan.',
  });
  if (ranked.length === 0) return emptyResult(steps);

  const wasConnected = link.status === 'connected';
  const found = await autoDetectCutter(link, ports, {
    flowControl: flow,
    ...(opts.bauds ? { bauds: opts.bauds } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    onLog: log,
  });

  if (!found) {
    const top = ranked[0];
    if (top.chip?.likelihood === 'high') {
      steps.push({
        label: 'Scan',
        status: 'info',
        detail: `No reply on any port — ${top.port.path} sits behind a ${top.chip.chip}, the classic Chinese clone adapter. They ignore status queries; suggested the clone profile.`,
      });
      return {
        found: false,
        suspectedClone: true,
        port: top.port.path,
        baud: top.chip.probeBaud,
        format: keepFormat,
        profileId: 'china-clone',
        model: '',
        chip: top.chip,
        grbl: false,
        grblBuild: '',
        grblSettings: [],
        steps,
      };
    }
    steps.push({
      label: 'Scan',
      status: 'info',
      detail: 'No port answered — check power / cable, then connect manually and run the self-test.',
    });
    return emptyResult(steps);
  }

  steps.push({
    label: 'Scan',
    status: 'pass',
    detail: `${found.portPath} @ ${found.baud}${found.chip ? ` (${found.chip.chip})` : ''} — ${found.grbl ? 'grbl controller' : `answered "${found.model}"`}`,
  });
  if (opts.signal?.aborted) {
    // Cancelled after the probe: report what it learned, skip the rest.
    steps.push({ label: 'Identify', status: 'info', detail: 'Stopped — the scan was cancelled after the probe.' });
    return {
      found: true,
      suspectedClone: false,
      port: found.portPath,
      baud: found.baud,
      format: found.grbl ? 'gcode' : 'hpgl',
      profileId: found.suggestedProfileId,
      model: found.model,
      chip: found.chip,
      grbl: found.grbl,
      grblBuild: found.grblBuild ?? '',
      grblSettings: [],
      steps,
    };
  }

  let model = found.model;
  let grblBuild = found.grblBuild ?? '';
  let profileId = found.suggestedProfileId;
  const grblSettings: GrblSetting[] = [];

  // Reopen the winner for the identify / $$ / self-test leg.
  try {
    await link.open({ portPath: found.portPath, baud: found.baud, flowControl: flow });
    if (found.grbl) {
      const id = await identifyMachine(link, 'gcode');
      grblBuild = id.model || grblBuild;
      steps.push({
        label: '$I',
        status: grblBuild ? 'pass' : 'info',
        detail: grblBuild || 'No build string — the controller may be locked ($X unlocks it).',
      });
      // Settings snapshot. `$$` is multi-line and a link's query() may
      // resolve on the first terminated line, so the load-bearing key
      // ($32 laser mode) is re-read with a single-line query when the
      // bulk read didn't deliver it.
      const ssReply = await link.query('$$', 1500).catch(() => '');
      grblSettings.push(...parseGrblSettings(ssReply));
      const settingValue = async (key: string): Promise<string> => {
        const hit = grblSettings.find(s => s.key === key)?.value;
        if (hit !== undefined) return hit;
        const single = await link.query(key, 900).catch(() => '');
        const m = single.match(new RegExp(`\\${key}=([^\\r\\n]*)`));
        const v = m ? m[1].trim() : '';
        if (v) grblSettings.push({ key, value: v });
        return v;
      };
      const laser = (await settingValue('$32')) === '1';
      if (grblSettings.length > 0) {
        steps.push({
          label: '$$',
          status: 'pass',
          detail: `${grblSettings.length} settings read${laser ? ' — laser mode $32=1' : ''}`,
        });
      }
      profileId = laser ? 'grbl-laser' : 'grbl-generic';
      steps.push(...await runConnectionSelfTest(link, 'gcode'));
    } else {
      const id = await identifyMachine(link, 'hpgl');
      model = id.model || found.model;
      profileId = id.suggestedProfileId ?? suggestProfileFromModel(model) ?? found.suggestedProfileId;
      steps.push({
        label: 'OI;',
        status: model ? 'pass' : 'info',
        detail: id.summary,
      });
      steps.push(...await runConnectionSelfTest(link, 'hpgl'));
    }
  } catch (e) {
    steps.push({ label: 'Identify', status: 'fail', detail: (e as Error).message });
  } finally {
    // Never leave a new connection behind unless one was open before the
    // scan — the operator decides when to connect.
    if (!wasConnected) await link.close().catch(() => undefined);
  }

  steps.push({
    label: 'Profile',
    status: profileId ? 'pass' : 'info',
    detail: profileId ?? 'No profile suggestion — pick one manually.',
  });

  return {
    found: true,
    suspectedClone: false,
    port: found.portPath,
    baud: found.baud,
    format: found.grbl ? 'gcode' : 'hpgl',
    profileId,
    model,
    chip: found.chip,
    grbl: found.grbl,
    grblBuild,
    grblSettings,
    steps,
  };
}
