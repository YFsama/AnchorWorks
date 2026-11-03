/**
 * User materials library — LightBurn-style saved material cards.
 *
 * The 9 built-in presets in plotter.ts (MATERIAL_PRESETS) are read-only
 * research values; every shop's own machine / blade / vinyl batch needs its
 * own dialled-in numbers. This module persists user-authored material cards
 * to localStorage (`vector.userMaterials`) and provides the JSON
 * import/export envelope shops use to share settings (the .lbvendor-style
 * workflow: export, email, import).
 *
 * Everything is fail-soft, following the plotterRecords conventions: corrupt
 * blobs load as [], quota failures never throw, and every entry (loaded or
 * imported) is sanitised entry-by-entry so a hand-edited file can't wedge
 * the dialog.
 */

import { MATERIAL_PRESETS, type MaterialPreset } from './plotter';

const STORAGE_KEY = 'vector.userMaterials';
export const USER_MATERIALS_SCHEMA = 'anchorworks-materials';
export const USER_MATERIALS_VERSION = 1;

/** Built-in preset ids are reserved: a user card with one of these ids would
 *  shadow the preset in allMaterials (built-ins are found first), applying
 *  the wrong physical parameters when clicked. */
const BUILT_IN_MATERIAL_IDS = new Set(MATERIAL_PRESETS.map(p => p.id));

/**
 * A user-saved material card. Field names mirror MaterialPreset (label /
 * feedRate / force / speed / overcut / mirror / bladeAngleDeg / passes) so a
 * card applies to the machine fields exactly like a built-in preset; `note`
 * is free-form operator memory ("my FC9000, fresh 45° blade, 2026-10").
 */
export interface UserMaterial {
  /** 'user-' + timestamp/seq. Regenerated on import conflicts. */
  id: string;
  label: string;
  feedRate: number;   // mm/min
  force: number;      // Graphtec FS, gf
  speed: number;      // Graphtec VS, cm/s
  overcut: number;    // mm
  mirror?: boolean;
  bladeAngleDeg?: number;
  passes?: number;
  note?: string;
  createdAt: number;
}

/** What addUserMaterial takes — id/createdAt are filled in when absent. */
export type UserMaterialDraft = Omit<UserMaterial, 'id' | 'createdAt'> & { id?: string; createdAt?: number };

/**
 * Merged library entry the dialog renders: the MaterialPreset shape plus a
 * `userMaterial` flag distinguishing user cards (deletable, badged) from
 * built-ins, and the user card's optional note.
 */
export interface LibraryMaterial extends MaterialPreset {
  userMaterial: boolean;
  note?: string;
}

let idSeq = 1;
function newId(): string {
  return `user-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
}

// Numeric bands mirror plotter.ts's sanitizePlotterOptions so a saved card
// can never push the machine fields out of range when re-applied.
const BANDS = {
  feedRate: [1, 100_000],
  force: [0, 500],
  speed: [0, 200],
  overcut: [0, 10],
  bladeAngleDeg: [0, 90],
} as const;

/** Required numeric field: present, finite, non-negative → clamped into band. */
function requiredNum(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.min(max, Math.max(min, v));
}

/** Optional numeric field: absent → undefined; invalid → dropped (entry kept). */
function optionalNum(v: unknown, min: number, max: number): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined;
  return Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
}

/**
 * Validate/normalise one card. Returns null when a required field is bad
 * (no label, missing/negative/non-finite feedRate/force/speed/overcut) —
 * the caller counts it as skipped. Optional fields (bladeAngleDeg, passes,
 * note) that fail validation are dropped, not fatal.
 */
function sanitizeUserMaterial(raw: unknown): Omit<UserMaterial, 'id'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== 'string' || !r.label.trim()) return null;
  const feedRate = requiredNum(r.feedRate, BANDS.feedRate[0], BANDS.feedRate[1]);
  const force = requiredNum(r.force, BANDS.force[0], BANDS.force[1]);
  const speed = requiredNum(r.speed, BANDS.speed[0], BANDS.speed[1]);
  const overcut = requiredNum(r.overcut, BANDS.overcut[0], BANDS.overcut[1]);
  if (feedRate === null || force === null || speed === null || overcut === null) return null;
  const bladeAngleDeg = optionalNum(r.bladeAngleDeg, BANDS.bladeAngleDeg[0], BANDS.bladeAngleDeg[1]);
  // Pass count is integral by meaning: <1 / fractional / non-finite drops
  // the field (clamping 0 up to 1 would silently change the user's card).
  const passes = typeof r.passes === 'number' && Number.isFinite(r.passes) && r.passes >= 1
    ? Math.min(12, Math.round(r.passes))
    : undefined;
  return {
    label: r.label.trim().slice(0, 80),
    feedRate,
    force,
    speed,
    overcut,
    mirror: r.mirror === true,
    ...(bladeAngleDeg !== undefined ? { bladeAngleDeg } : {}),
    ...(passes !== undefined ? { passes } : {}),
    ...(typeof r.note === 'string' && r.note.trim() ? { note: r.note.trim().slice(0, 300) } : {}),
    createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt >= 0 ? r.createdAt : Date.now(),
  };
}

/** Load + sanitise. Corrupt JSON or bad rows → dropped, never throws.
 *  Ids colliding with a built-in preset id are regenerated — a user card
 *  that shadowed 'htv' / 'sticker' would apply the BUILT-IN force/speed when
 *  clicked (allMaterials finds the built-in first), a physical-output
 *  parameter mismatch on a cutter. */
export function loadUserMaterials(): UserMaterial[] {
  if (typeof window === 'undefined') return [];
  let arr: unknown;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: UserMaterial[] = [];
  for (const raw of arr) {
    const m = sanitizeUserMaterial(raw);
    if (!m) continue;
    const rawId = typeof (raw as Record<string, unknown>).id === 'string' ? (raw as Record<string, unknown>).id as string : '';
    const id = rawId && !out.some(x => x.id === rawId) && !BUILT_IN_MATERIAL_IDS.has(rawId)
      ? rawId
      : newId();
    out.push({ ...m, id });
  }
  return out;
}

/** Persist the whole list. Returns false when the write failed (quota /
 *  private mode) so callers can warn instead of toasting a false success —
 *  never throws: the in-memory library keeps working regardless. */
export function saveUserMaterials(list: UserMaterial[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export interface AddUserMaterialResult {
  record: UserMaterial;
  /** false → the card was NOT persisted (quota / private mode); the caller
   *  must not report success or select the phantom card. */
  persisted: boolean;
}

/** Append a card (id/createdAt filled in; a conflicting id is regenerated). */
export function addUserMaterial(draft: UserMaterialDraft): AddUserMaterialResult {
  const sanitized = sanitizeUserMaterial(draft) ?? {
    label: String((draft as { label?: unknown }).label ?? '').trim().slice(0, 80) || 'Material',
    feedRate: 1, force: 0, speed: 0, overcut: 0, createdAt: Date.now(),
  };
  const existing = loadUserMaterials();
  const wantsId = typeof draft.id === 'string' && draft.id && !BUILT_IN_MATERIAL_IDS.has(draft.id) ? draft.id : null;
  const id = wantsId && !existing.some(m => m.id === wantsId) ? wantsId : newId();
  const record: UserMaterial = { ...sanitized, id };
  const persisted = saveUserMaterials([...existing, record]);
  return { record, persisted };
}

/** Remove one card by id. Idempotent; returns whether the (possibly empty)
 *  result was actually persisted. */
export function deleteUserMaterial(id: string): boolean {
  return saveUserMaterials(loadUserMaterials().filter(m => m.id !== id));
}

/* ------------------------------------------------------------------ *
 * JSON import / export — the share-a-library workflow. Export always
 * writes the versioned envelope; import leniently accepts the envelope
 * OR a bare array (hand-assembled files), skipping bad entries and
 * counting them so the UI can report "N imported / M skipped".
 * ------------------------------------------------------------------ */

export interface UserMaterialsExport {
  schema: typeof USER_MATERIALS_SCHEMA;
  version: number;
  exportedAt: string;
  materials: UserMaterial[];
}

export function exportUserMaterialsJson(list: UserMaterial[]): string {
  const envelope: UserMaterialsExport = {
    schema: USER_MATERIALS_SCHEMA,
    version: USER_MATERIALS_VERSION,
    exportedAt: new Date().toISOString(),
    materials: list,
  };
  return JSON.stringify(envelope, null, 2);
}

export interface ImportResult {
  materials: UserMaterial[];
  /** Entries that failed validation (bad label / negative / non-finite). */
  skipped: number;
}

/**
 * Lenient import. NEVER throws — a completely unparseable file returns
 * `{ materials: [], skipped: 0 }` (the UI treats that as "nothing usable").
 * Ids that are missing, duplicated within the file, or already in the
 * stored library are regenerated so the result can be appended as-is.
 */
export function importUserMaterialsJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { materials: [], skipped: 0 };
  }
  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { materials?: unknown }).materials)
      ? (parsed as { materials: unknown[] }).materials
      : [];
  const stored = loadUserMaterials();
  const takenIds = new Set<string>([...BUILT_IN_MATERIAL_IDS, ...stored.map(m => m.id)]);
  const materials: UserMaterial[] = [];
  let skipped = 0;
  for (const raw of entries) {
    const m = sanitizeUserMaterial(raw);
    if (!m) { skipped++; continue; }
    const rawId = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).id : undefined;
    const id = typeof rawId === 'string' && rawId && !takenIds.has(rawId) ? rawId : newId();
    takenIds.add(id);
    materials.push({ ...m, id });
  }
  return { materials, skipped };
}

/**
 * Merged view for the dialog: built-in presets first, user cards after,
 * each entry flagged so the UI can badge / make user cards deletable.
 * Pass an explicit list (dialog state) or omit to read storage.
 */
export function allMaterials(userMaterials?: UserMaterial[]): LibraryMaterial[] {
  const users = (userMaterials ?? loadUserMaterials()).map(m => ({
    id: m.id,
    label: m.label,
    feedRate: m.feedRate,
    force: m.force,
    speed: m.speed,
    overcut: m.overcut,
    defaultOvercutMm: m.overcut,
    ...(m.mirror ? { mirror: true } : {}),
    ...(m.bladeAngleDeg !== undefined ? { bladeAngleDeg: m.bladeAngleDeg } : {}),
    ...(m.passes !== undefined ? { passes: m.passes } : {}),
    ...(m.note !== undefined ? { note: m.note } : {}),
    userMaterial: true,
  }));
  return [...MATERIAL_PRESETS.map(p => ({ ...p, userMaterial: false })), ...users];
}
