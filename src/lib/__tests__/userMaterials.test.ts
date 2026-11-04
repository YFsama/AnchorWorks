import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addUserMaterial, allMaterials, deleteUserMaterial, exportUserMaterialsJson,
  importUserMaterialsJson, loadUserMaterials, saveUserMaterials,
  USER_MATERIALS_SCHEMA, type UserMaterial,
} from '../userMaterials';
import { MATERIAL_PRESETS } from '../plotter';

/**
 * User materials library (userMaterials.ts): persistence round-trips, the
 * fail-soft guarantees (corrupt blobs, quota throws, never-throw import),
 * per-entry import validation with skip counting, id conflict handling, and
 * the built-ins-first merged view.
 */

const KEY = 'vector.userMaterials';

function card(label: string, extra: Partial<UserMaterial> = {}): UserMaterial {
  return {
    id: 'user-x',
    label,
    feedRate: 350,
    force: 90,
    speed: 25,
    overcut: 0.3,
    mirror: false,
    createdAt: 1_700_000_000_000,
    ...extra,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('user materials persistence', () => {
  it('returns [] for empty storage and corrupt JSON', () => {
    expect(loadUserMaterials()).toEqual([]);
    window.localStorage.setItem(KEY, '{{{ not json');
    expect(loadUserMaterials()).toEqual([]);
    window.localStorage.setItem(KEY, '"just a string"');
    expect(loadUserMaterials()).toEqual([]);
  });

  it('drops corrupt rows, keeping valid ones; duplicate stored ids are re-ided (not dropped)', () => {
    window.localStorage.setItem(KEY, JSON.stringify([
      card('Mine', { id: 'user-1' }),
      { label: 'no numbers' },            // required fields missing → dropped
      card('Negative', { id: 'user-2', force: -5 }), // negative → dropped
      card('Dup', { id: 'user-1' }),      // duplicate id → kept under a fresh id (import parity)
      'garbage',
    ]));
    const all = loadUserMaterials();
    expect(all).toHaveLength(2);
    expect(all[0].label).toBe('Mine');
    expect(all[0].id).toBe('user-1');
    expect(all[1].label).toBe('Dup');
    expect(all[1].id).not.toBe('user-1');
    expect(all[1].id).toMatch(/^user-/);
  });

  it('round-trips through saveUserMaterials / loadUserMaterials', () => {
    saveUserMaterials([card('HTV gold', { id: 'user-a', note: 'my FC9000' })]);
    const all = loadUserMaterials();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'user-a', label: 'HTV gold', note: 'my FC9000', force: 90 });
  });

  it('surfaces quota failures on save instead of throwing or faking success', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveUserMaterials([card('Q')])).toBe(false);
    const added = addUserMaterial(card('Q2'));
    expect(added.persisted).toBe(false);
    expect(() => saveUserMaterials([card('Q')])).not.toThrow();
    expect(() => addUserMaterial(card('Q2'))).not.toThrow();
    spy.mockRestore();
  });

  it('deleteUserMaterial reports the persistence outcome', () => {
    addUserMaterial(card('D'));
    expect(deleteUserMaterial('nope-not-there')).toBe(true); // idempotent no-op still persists the unchanged list
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(deleteUserMaterial('whatever')).toBe(false);
    spy.mockRestore();
  });

  it('addUserMaterial assigns id/createdAt, trims the label and persists', () => {
    const { record: rec, persisted } = addUserMaterial({ ...card('  Matte vinyl  '), id: undefined, createdAt: undefined });
    expect(persisted).toBe(true);
    expect(rec.id).toMatch(/^user-/);
    expect(rec.label).toBe('Matte vinyl');
    expect(rec.createdAt).toBeGreaterThan(0);
    const all = loadUserMaterials();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(rec.id);
  });

  it('addUserMaterial regenerates an id that collides with a stored card', () => {
    const { record: first } = addUserMaterial(card('One'));
    const { record: second } = addUserMaterial({ ...card('Two'), id: first.id });
    expect(second.id).not.toBe(first.id);
    expect(loadUserMaterials().map(m => m.label)).toEqual(['One', 'Two']);
  });

  it('addUserMaterial regenerates an id that collides with a built-in preset id', () => {
    const { record } = addUserMaterial({ ...card('Shadow HTV'), id: 'htv' });
    expect(record.id).not.toBe('htv');
    expect(record.id).toMatch(/^user-/);
    expect(loadUserMaterials().every(m => m.id !== 'htv')).toBe(true);
  });

  it('loadUserMaterials regenerates stored ids that shadow a built-in preset', () => {
    localStorage.setItem('vector.userMaterials', JSON.stringify([card('Fake sticker', { id: 'sticker' })]));
    const all = loadUserMaterials();
    expect(all).toHaveLength(1);
    expect(all[0].id).not.toBe('sticker');
    expect(all[0].label).toBe('Fake sticker');
  });

  it('deleteUserMaterial removes only the target and is idempotent', () => {
    const { record: a } = addUserMaterial(card('A'));
    addUserMaterial(card('B'));
    deleteUserMaterial(a.id);
    expect(loadUserMaterials().map(m => m.label)).toEqual(['B']);
    expect(() => deleteUserMaterial(a.id)).not.toThrow();
    expect(loadUserMaterials().map(m => m.label)).toEqual(['B']);
  });
});

describe('user materials export', () => {
  it('writes the versioned envelope with the materials payload', () => {
    const list = [card('Mine', { id: 'user-a' })];
    const parsed = JSON.parse(exportUserMaterialsJson(list)) as {
      schema: string; version: number; exportedAt: string; materials: UserMaterial[];
    };
    expect(parsed.schema).toBe(USER_MATERIALS_SCHEMA);
    expect(parsed.schema).toBe('anchorworks-materials');
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.materials).toEqual(list);
  });
});

describe('user materials import', () => {
  it('accepts the export envelope', () => {
    const text = exportUserMaterialsJson([card('Shared', { id: 'user-a' })]);
    const { materials, skipped } = importUserMaterialsJson(text);
    expect(skipped).toBe(0);
    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({ label: 'Shared', force: 90, speed: 25, overcut: 0.3 });
  });

  it('accepts a bare array', () => {
    const text = JSON.stringify([card('Bare 1'), card('Bare 2')]);
    const { materials, skipped } = importUserMaterialsJson(text);
    expect(skipped).toBe(0);
    expect(materials.map(m => m.label)).toEqual(['Bare 1', 'Bare 2']);
  });

  it('skips invalid entries and counts them', () => {
    const text = JSON.stringify([
      card('Good'),
      { ...card('No label'), label: '   ' },        // blank label → skip
      card('Neg force', { force: -1 }),             // negative → skip
      card('Neg overcut', { overcut: -0.1 }),       // negative → skip
      { ...card('No feedRate'), feedRate: undefined }, // missing required → skip
      'garbage',                                    // not an object → skip
    ]);
    const { materials, skipped } = importUserMaterialsJson(text);
    expect(materials.map(m => m.label)).toEqual(['Good']);
    expect(skipped).toBe(5);
  });

  it('never throws: unparseable text and non-collection JSON give an empty result', () => {
    expect(importUserMaterialsJson('not json at all')).toEqual({ materials: [], skipped: 0 });
    expect(importUserMaterialsJson('42')).toEqual({ materials: [], skipped: 0 });
    expect(importUserMaterialsJson('{"schema":"other","no":"materials"}')).toEqual({ materials: [], skipped: 0 });
  });

  it('regenerates missing, in-file duplicate, stored-conflicting and built-in-shadowing ids', () => {
    addUserMaterial({ ...card('Stored'), id: 'user-taken' });
    const text = JSON.stringify([
      card('Missing id', { id: undefined }),
      card('Dup A', { id: 'user-dup' }),
      card('Dup B', { id: 'user-dup' }),
      card('Conflicts with stored', { id: 'user-taken' }),
      card('Shadows a built-in', { id: 'htv' }),
    ]);
    const { materials, skipped } = importUserMaterialsJson(text);
    expect(skipped).toBe(0);
    expect(materials).toHaveLength(5);
    const ids = materials.map(m => m.id);
    expect(new Set(ids).size).toBe(5);                     // all unique
    expect(ids.filter(id => id === 'user-dup')).toHaveLength(1); // first dup kept, second regenerated
    expect(ids).not.toContain('user-taken');               // clashes with stored → regenerated
    expect(ids).not.toContain('htv');                      // built-in preset id → regenerated
    expect(ids.every(id => id.startsWith('user-'))).toBe(true);
  });

  it('keeps optional fields when valid and drops them when invalid (entry survives)', () => {
    const text = JSON.stringify([
      card('Full', { bladeAngleDeg: 60, passes: 2, note: ' slow head ' }),
      card('Bad optionals', { bladeAngleDeg: -45, passes: 0, note: '  ' }),
    ]);
    const { materials } = importUserMaterialsJson(text);
    expect(materials[0]).toMatchObject({ bladeAngleDeg: 60, passes: 2, note: 'slow head' });
    expect(materials[1].bladeAngleDeg).toBeUndefined();
    expect(materials[1].passes).toBeUndefined();
    expect(materials[1].note).toBeUndefined();
  });

  it('keeps accelMmS2 / headUpS when valid, clamps out-of-band, drops invalid', () => {
    const text = JSON.stringify([
      card('Physics', { accelMmS2: 1500, headUpS: 0.15 }),
      card('Clamped low', { accelMmS2: 1, headUpS: 0.001 }),
      card('Clamped high', { accelMmS2: 1e9, headUpS: 99 }),
      card('Bad accel', { accelMmS2: -500 }),
      card('Bad head', { headUpS: 'slow' as unknown as number }),
    ]);
    const { materials, skipped } = importUserMaterialsJson(text);
    expect(skipped).toBe(0); // invalid optionals drop the field, not the card
    expect(materials[0]).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
    expect(materials[1]).toMatchObject({ accelMmS2: 100, headUpS: 0.05 });
    expect(materials[2]).toMatchObject({ accelMmS2: 10_000, headUpS: 1 });
    expect(materials[3].accelMmS2).toBeUndefined();
    expect(materials[4].headUpS).toBeUndefined();
  });

  it('round-trips accelMmS2 / headUpS through export → import', () => {
    const exported = exportUserMaterialsJson([
      card('Accel card', { id: 'user-a', accelMmS2: 800, headUpS: 0.35 }),
    ]);
    const { materials } = importUserMaterialsJson(exported);
    expect(materials[0]).toMatchObject({ label: 'Accel card', accelMmS2: 800, headUpS: 0.35 });
    // And the persistence round-trip keeps them too.
    saveUserMaterials(materials);
    const loaded = loadUserMaterials();
    expect(loaded[0]).toMatchObject({ accelMmS2: 800, headUpS: 0.35 });
  });

  it('clamps out-of-band values into the plotter bands instead of rejecting', () => {
    const text = JSON.stringify([card('Hot', { feedRate: 1e9, speed: 5e3 })]);
    const { materials } = importUserMaterialsJson(text);
    expect(materials[0].feedRate).toBe(100_000);
    expect(materials[0].speed).toBe(200);
  });

  it('re-importing the same file counts every entry as a duplicate and returns none', () => {
    const text = exportUserMaterialsJson([card('Shared A', { id: 'user-a' }), card('Shared B', { id: 'user-b' })]);
    const first = importUserMaterialsJson(text);
    expect(first.materials).toHaveLength(2);
    expect(first.duplicates).toBeUndefined();
    // What the dialog does between the two imports: persist the result.
    saveUserMaterials(first.materials);
    const second = importUserMaterialsJson(text);
    expect(second.materials).toHaveLength(0);
    expect(second.skipped).toBe(0);
    expect(second.duplicates).toBe(2);
  });

  it('counts entries duplicated WITHIN a file as duplicates (first one kept)', () => {
    const text = JSON.stringify([
      card('Twin'),                       // kept
      card('Twin'),                       // same content → duplicate
      { ...card('Twin'), id: 'user-x' },  // different id, same content → duplicate
      card('Twin', { force: 200 }),       // different force → NOT a duplicate
    ]);
    const { materials, skipped, duplicates } = importUserMaterialsJson(text);
    expect(skipped).toBe(0);
    expect(duplicates).toBe(2);
    expect(materials.map(m => m.label)).toEqual(['Twin', 'Twin']);
    expect(materials[0].force).toBe(90);
    expect(materials[1].force).toBe(200);
  });

  it('treats mirror as part of the content fingerprint', () => {
    saveUserMaterials([card('HTV mine', { mirror: true })]);
    const { materials, duplicates } = importUserMaterialsJson(JSON.stringify([
      card('HTV mine', { mirror: true }),   // identical → duplicate
      card('HTV mine', { mirror: false }),  // mirror differs → new card
    ]));
    expect(duplicates).toBe(1);
    expect(materials).toHaveLength(1);
    expect(materials[0].mirror).toBe(false);
  });

  it('flags newerVersion when the envelope version is above USER_MATERIALS_VERSION', () => {
    const v2 = JSON.stringify({
      schema: USER_MATERIALS_SCHEMA, version: 2, exportedAt: '2030-01-01T00:00:00Z',
      materials: [card('From the future')],
    });
    const { materials, newerVersion } = importUserMaterialsJson(v2);
    expect(newerVersion).toBe(true);
    expect(materials).toHaveLength(1); // still imported leniently

    const v1 = exportUserMaterialsJson([card('Present day')]);
    expect(importUserMaterialsJson(v1).newerVersion).toBeUndefined();
    // Bare arrays carry no version — no flag either.
    expect(importUserMaterialsJson(JSON.stringify([card('Bare')])).newerVersion).toBeUndefined();
  });
});

describe('allMaterials merged view', () => {
  it('lists built-ins first with user cards after, flagged and note-carrying', () => {
    const users = [card('My HTV', { id: 'user-1', mirror: true, note: 'notes here' })];
    const merged = allMaterials(users);
    expect(merged).toHaveLength(MATERIAL_PRESETS.length + 1);
    expect(merged.slice(0, MATERIAL_PRESETS.length).every(m => m.userMaterial === false)).toBe(true);
    const last = merged[merged.length - 1];
    expect(last).toMatchObject({
      id: 'user-1', label: 'My HTV', userMaterial: true, mirror: true, note: 'notes here',
      feedRate: 350, force: 90, speed: 25, overcut: 0.3, defaultOvercutMm: 0.3,
    });
  });

  it('passes accelMmS2 / headUpS through to the merged view (legacy cards stay without)', () => {
    const merged = allMaterials([
      card('Physics card', { id: 'user-p', accelMmS2: 1200, headUpS: 0.2 }),
      card('Legacy card', { id: 'user-l' }),
    ]);
    const physics = merged[merged.length - 2];
    const legacy = merged[merged.length - 1];
    expect(physics).toMatchObject({ id: 'user-p', accelMmS2: 1200, headUpS: 0.2, userMaterial: true });
    expect(legacy.accelMmS2).toBeUndefined();
    expect(legacy.headUpS).toBeUndefined();
    // Built-ins carry their own accel/headUp values untouched by the merge.
    expect(merged[0].accelMmS2).toBe(MATERIAL_PRESETS[0].accelMmS2);
  });

  it('reads from storage when no list is passed', () => {
    addUserMaterial({ ...card('From storage'), id: undefined, createdAt: undefined });
    const merged = allMaterials();
    expect(merged).toHaveLength(MATERIAL_PRESETS.length + 1);
    expect(merged[merged.length - 1].label).toBe('From storage');
    expect(merged[merged.length - 1].userMaterial).toBe(true);
  });
});
