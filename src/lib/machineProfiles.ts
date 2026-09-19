/**
 * Machine profiles — per-brand compatibility layer for HP-GL cutters.
 *
 * A profile bundles everything that differs between cutter brands beyond
 * the three dialects the HP-GL generator already knows (bare /
 * roland-camm / graphtec-fc): the recommended serial knobs (most Chinese
 * clones ONLY work at 9600 with no flow control), brand force/speed
 * commands, what to send right after connecting, the eject command, and
 * operator notes ("quirks") from the field.
 *
 * Honesty rule: only commands that are broadly documented go in here.
 * Machines whose force/speed can't be set reliably over HP-GL carry
 * `panelOnly: true` — the UI then says "set force on the machine panel"
 * instead of emitting a guess that silently does nothing.
 *
 * Everything a profile sets is a starting point the operator can override
 * in the dialog; picking a profile just loads sane defaults + notes.
 */

import type { HpglDialect } from './plotter';
import type { FlowControl } from './plotterLink';

export interface MachineProfile {
  id: string;
  /** Brand shown in the picker. */
  brand: string;
  /** Short label, e.g. "CAMM-1 GX series". */
  label: string;
  /** Representative models — search bait for the operator. */
  models: string;
  dialect: HpglDialect;
  baud: number;
  flowControl: FlowControl;
  /** Sane force (gf) / speed (cm/s) starting points for sign vinyl. */
  defaultForce: number;
  defaultSpeed: number;
  /** Force command in grams-force. Undefined → set on the panel. */
  forceCommand?: (gf: number) => string;
  /** Speed command in cm/s. Undefined → set on the panel. */
  speedCommand?: (cmSec: number) => string;
  /** Statements sent right after a successful connect (before any job). */
  connectInit?: (force: number, speed: number) => string;
  /** Sheet eject / feed command, shown as a quick action tip. */
  eject?: string;
  /** Whether OE / OH / OA status queries are known to be answered. */
  statusQueries: boolean;
  /** Operator notes rendered under the profile picker. */
  quirks: string[];
  /** True when force/speed must be dialed in on the machine's panel. */
  panelOnly: boolean;
}

const graphtecForce = (gf: number) => (gf > 0 ? `FS${Math.round(gf)};` : '');
const graphtecSpeed = (cmSec: number) => (cmSec > 0 ? `VS${Math.round(cmSec)};` : '');

export const MACHINE_PROFILES: MachineProfile[] = [
  {
    id: 'generic-hpgl',
    brand: 'Generic',
    label: 'Generic HP-GL (unknown cutter)',
    models: 'HP 7475-style pen plotters, unlisted cutters',
    dialect: 'bare',
    baud: 9600,
    flowControl: 'none',
    defaultForce: 0,
    defaultSpeed: 0,
    eject: 'PG;',
    statusQueries: true,
    panelOnly: true,
    quirks: [
      'Vanilla IN; SP1; PU/PD output — start here when the brand is unknown.',
      'Force and speed are set on the machine panel (no HP-GL commands).',
    ],
  },
  {
    id: 'roland-camm1',
    brand: 'Roland',
    label: 'CAMM-1 GX / GS series',
    models: 'GX-24, GX-400/500/640, GS-24',
    dialect: 'roland-camm',
    baud: 9600,
    flowControl: 'none',
    defaultForce: 50,
    defaultSpeed: 30,
    forceCommand: graphtecForce,   // CAMM-1 accepts FS/VS like the driver emits
    speedCommand: graphtecSpeed,
    connectInit: (f, s) => `IN;PA;${graphtecForce(f)}${graphtecSpeed(s)}`,
    eject: '!PG;',
    statusQueries: true,
    panelOnly: false,
    quirks: [
      'Job files start with the page-size number statement + CT1 (cut mode) — the Roland dialect does this automatically.',
      'Overcut is set with TB (already exposed in the machine options as Roland overcut units).',
      'Serial is 9600 8N1; hardware flow control is not wired on the GX serial port.',
    ],
  },
  {
    id: 'roland-pnc',
    brand: 'Roland',
    label: 'CAMM-1 PNC (legacy)',
    models: 'PNC-950/1000/1100/1410',
    dialect: 'roland-camm',
    baud: 9600,
    flowControl: 'none',
    defaultForce: 45,
    defaultSpeed: 20,
    forceCommand: graphtecForce,
    speedCommand: graphtecSpeed,
    connectInit: (f, s) => `IN;${graphtecForce(f)}${graphtecSpeed(s)}`,
    eject: '!PG;',
    statusQueries: false,
    panelOnly: false,
    quirks: [
      'Older firmware: keep speed ≤ 20 cm/s and avoid very long single statements.',
      'Often ignores status queries — a silent console log is normal on these.',
    ],
  },
  {
    id: 'graphtec-ce',
    brand: 'Graphtec',
    label: 'CE Lite / Craft Robo / CE3000',
    models: 'CE3000-4, CE Lite-50, Craft Robo CC200',
    dialect: 'graphtec-fc',
    baud: 9600,
    flowControl: 'software',
    defaultForce: 40,
    defaultSpeed: 25,
    forceCommand: graphtecForce,
    speedCommand: graphtecSpeed,
    connectInit: (f, s) => `IN;PA;${graphtecForce(f)}${graphtecSpeed(s)}`,
    statusQueries: true,
    panelOnly: false,
    quirks: [
      'Prefers PA (absolute plot) mode — the Graphtec dialect header includes it.',
      'Serial wants XON/XOFF software flow control; the driver default is 9600.',
    ],
  },
  {
    id: 'graphtec-fc',
    brand: 'Graphtec',
    label: 'FC / CE Pro / CE7000 series',
    models: 'FC8000, FC9000, CE5000, CE6000, CE7000',
    dialect: 'graphtec-fc',
    baud: 19200,
    flowControl: 'software',
    defaultForce: 55,
    defaultSpeed: 30,
    forceCommand: graphtecForce,
    speedCommand: graphtecSpeed,
    connectInit: (f, s) => `IN;PA;${graphtecForce(f)}${graphtecSpeed(s)}`,
    statusQueries: true,
    panelOnly: false,
    quirks: [
      'Condition (force/speed) can also be set per-slot on the panel; FS/VS here override the active slot.',
      'USB shows up as a virtual COM port — baud is whatever the Graphtec driver exposes (often 19200/38400).',
    ],
  },
  {
    id: 'china-clone',
    brand: 'Roland-compatible (China)',
    label: 'Liyu / Rabbit / Teneth / Redsail / Creation / Saga…',
    models: '文泰/Artcut/Rabbit/Liyu SC/Teneth LA/Redsail/Creation PCut/Saga/UKCutter',
    dialect: 'roland-camm',
    baud: 9600,
    flowControl: 'none',
    defaultForce: 60,
    defaultSpeed: 25,
    forceCommand: graphtecForce,
    speedCommand: graphtecSpeed,
    connectInit: (f, s) => `IN;${graphtecForce(f)}${graphtecSpeed(s)}`,
    eject: '!PG;',
    statusQueries: false,
    panelOnly: false,
    quirks: [
      'This is the 文泰/Artcut ecosystem: Roland CAMM flavour at 9600 baud, no flow-control wiring.',
      'Tiny receive buffers — keep flow control on "none (paced)" so the app throttles itself; raw dumping drops bytes mid-job.',
      'Most clones ignore OE/OH status queries; judge the connection by the self-test echo instead.',
      'If corners lift, raise the TB overcut; if vinyl tears, drop force 10 gf at a time.',
    ],
  },
  {
    id: 'mimaki-cg',
    brand: 'Mimaki',
    label: 'CG series',
    models: 'CG-60SL, CG-130FX',
    dialect: 'bare',
    baud: 9600,
    flowControl: 'hardware',
    defaultForce: 0,
    defaultSpeed: 0,
    eject: 'PG;',
    statusQueries: true,
    panelOnly: true,
    quirks: [
      'Speaks standard HP-GL for geometry; cutting conditions live on the panel (no reliable FS/VS).',
      'Prefers hardware handshaking when the cable supports it.',
    ],
  },
  {
    id: 'summa',
    brand: 'Summa',
    label: 'SummaCut / S series',
    models: 'SummaCut D60/S140',
    dialect: 'bare',
    baud: 9600,
    flowControl: 'none',
    defaultForce: 0,
    defaultSpeed: 0,
    eject: 'PG;',
    statusQueries: false,
    panelOnly: true,
    quirks: [
      'HP-GL geometry works with the bare dialect; force/speed/offset are panel settings.',
      'USB models expose a virtual COM port — 9600 works even when the label says otherwise.',
    ],
  },
  {
    id: 'gcc',
    brand: 'GCC',
    label: 'Puma / Expert / Jaguar',
    models: 'GCC Puma II, Expert II LX',
    dialect: 'bare',
    baud: 19200,
    flowControl: 'none',
    defaultForce: 0,
    defaultSpeed: 0,
    eject: 'PG;',
    statusQueries: false,
    panelOnly: true,
    quirks: [
      'GCC defaults to 19200 8N1 on serial; check Communication in the panel if jobs stall.',
      'Force/speed/offset are set from the machine panel or GCC AAS software.',
    ],
  },
];

export function getMachineProfile(id: string | undefined): MachineProfile | null {
  if (!id) return null;
  return MACHINE_PROFILES.find(p => p.id === id) ?? null;
}

/** Force+speed statement for the profile's dialect (may be empty when
 *  the machine is panel-only). Falls back to the generic FS/VS pair. */
export function profileForceSpeed(profile: MachineProfile | null, force: number, speed: number): string {
  if (!profile) return (force > 0 ? `FS${Math.round(force)};` : '') + (speed > 0 ? `VS${Math.round(speed)};` : '');
  const f = profile.forceCommand?.(force) ?? '';
  const s = profile.speedCommand?.(speed) ?? '';
  return f + s;
}

/** Post-connect statement (IN + force/speed) or '' when the machine has
 *  nothing special to prime. */
export function profileConnectInit(profile: MachineProfile | null, force: number, speed: number): string {
  if (!profile) return '';
  if (profile.connectInit) return profile.connectInit(force, speed);
  if (profile.panelOnly) return 'IN;';
  return `IN;${profileForceSpeed(profile, force, speed)}`;
}
