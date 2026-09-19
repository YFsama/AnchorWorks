/**
 * Plotter configuration records & job history.
 *
 * Two persisted collections in localStorage:
 *
 *  - Machines (`vector.plotter.machines`): named, saved snapshots of the
 *    full cutter setup (profile, dialect, force/speed, baud, flow, port,
 *    material, notes). Sign shops run several physical cutters; "one row
 *    per machine, named" beats re-dialing every knob after switching.
 *
 *  - Job log (`vector.plotter.joblog`): the last 50 sends — what went
 *    out, at which settings, how long it took, and whether it completed.
 *    The record to check when yesterday's job cut fine and today's doesn't.
 *
 * Both blobs are sanitised on load; corrupt or hand-edited entries are
 * dropped rather than wedging the dialog.
 */

import type { PlotterOptions } from './plotter';
import type { FlowControl } from './plotterLink';

const MACHINES_KEY = 'vector.plotter.machines';
const JOBLOG_KEY = 'vector.plotter.joblog';
export const JOB_LOG_LIMIT = 50;

export interface MachineRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  profileId: string;
  format: 'gcode' | 'hpgl';
  opts: PlotterOptions;
  materialId: string;
  baud: number;
  flowControl: FlowControl;
  portPath: string;
  notes: string;
}

export type MachineDraft = Omit<MachineRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

let idSeq = 1;
function newId(): string {
  return `machine-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota / private mode — records just won't persist */ }
}

function isFiniteNum(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function sanitizeMachine(raw: unknown): MachineRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MachineRecord>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  if (!r.opts || typeof r.opts !== 'object') return null;
  if (r.format !== 'gcode' && r.format !== 'hpgl') return null;
  return {
    id: r.id,
    name: r.name.trim().slice(0, 60),
    createdAt: isFiniteNum(r.createdAt, 0, 8.64e15) ? r.createdAt : Date.now(),
    updatedAt: isFiniteNum(r.updatedAt, 0, 8.64e15) ? r.updatedAt : Date.now(),
    profileId: typeof r.profileId === 'string' ? r.profileId : '',
    format: r.format,
    opts: r.opts,
    materialId: typeof r.materialId === 'string' ? r.materialId : '',
    baud: isFiniteNum(r.baud, 300, 1_000_000) ? Math.round(r.baud) : 9600,
    flowControl: r.flowControl === 'hardware' || r.flowControl === 'software' ? r.flowControl : 'none',
    portPath: typeof r.portPath === 'string' ? r.portPath.slice(0, 120) : '',
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 2000) : '',
  };
}

/** Saved machines, oldest first. Corrupt rows are dropped. */
export function listMachines(): MachineRecord[] {
  if (typeof window === 'undefined') return [];
  const arr = readJson<unknown[]>(MACHINES_KEY);
  if (!Array.isArray(arr)) return [];
  const out: MachineRecord[] = [];
  for (const raw of arr) {
    const m = sanitizeMachine(raw);
    if (m && !out.some(x => x.id === m.id)) out.push(m);
  }
  return out;
}

/** Create or update (when `draft.id` matches an existing row). */
export function saveMachine(draft: MachineDraft): MachineRecord {
  const machines = listMachines();
  const existing = draft.id ? machines.find(m => m.id === draft.id) : undefined;
  const now = Date.now();
  const record: MachineRecord = {
    ...(existing ?? {}),
    ...draft,
    id: existing?.id ?? newId(),
    name: draft.name.trim().slice(0, 60) || existing?.name || 'Machine',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  } as MachineRecord;
  const next = existing ? machines.map(m => (m.id === record.id ? record : m)) : [...machines, record];
  writeJson(MACHINES_KEY, next);
  return record;
}

export function deleteMachine(id: string): void {
  writeJson(MACHINES_KEY, listMachines().filter(m => m.id !== id));
}

/* ------------------------------------------------------------------ */

export interface JobLogEntry {
  ts: number;
  kind: 'job' | 'test-cut';
  /** Where it went — link description or port path. */
  target: string;
  profileId: string;
  format: 'gcode' | 'hpgl';
  baud: number;
  paths: number;
  bytes: number;
  seconds: number;
  result: 'ok' | 'aborted' | 'error';
  materialId: string;
}

function sanitizeEntry(raw: unknown): JobLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<JobLogEntry>;
  if (r.kind !== 'job' && r.kind !== 'test-cut') return null;
  if (r.format !== 'gcode' && r.format !== 'hpgl') return null;
  if (r.result !== 'ok' && r.result !== 'aborted' && r.result !== 'error') return null;
  return {
    ts: isFiniteNum(r.ts, 0, 8.64e15) ? r.ts : Date.now(),
    kind: r.kind,
    target: typeof r.target === 'string' ? r.target.slice(0, 120) : '',
    profileId: typeof r.profileId === 'string' ? r.profileId : '',
    format: r.format,
    baud: isFiniteNum(r.baud, 300, 1_000_000) ? Math.round(r.baud) : 0,
    paths: isFiniteNum(r.paths, 0, 1e6) ? Math.round(r.paths) : 0,
    bytes: isFiniteNum(r.bytes, 0, 1e9) ? Math.round(r.bytes) : 0,
    seconds: isFiniteNum(r.seconds, 0, 8.64e7) ? Math.round(r.seconds * 10) / 10 : 0,
    result: r.result,
    materialId: typeof r.materialId === 'string' ? r.materialId : '',
  };
}

/** Newest first, capped at JOB_LOG_LIMIT. */
export function listJobLog(): JobLogEntry[] {
  if (typeof window === 'undefined') return [];
  const arr = readJson<unknown[]>(JOBLOG_KEY);
  if (!Array.isArray(arr)) return [];
  const out: JobLogEntry[] = [];
  for (const raw of arr) {
    const e = sanitizeEntry(raw);
    if (e) out.push(e);
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, JOB_LOG_LIMIT);
}

export function addJobLog(entry: Omit<JobLogEntry, 'ts'>): void {
  if (typeof window === 'undefined') return;
  const next = [{ ...entry, ts: Date.now() }, ...listJobLog()].slice(0, JOB_LOG_LIMIT);
  writeJson(JOBLOG_KEY, next);
}

export function clearJobLog(): void {
  writeJson(JOBLOG_KEY, []);
}
