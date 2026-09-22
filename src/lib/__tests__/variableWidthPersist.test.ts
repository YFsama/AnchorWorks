/**
 * VariableWidth persistence — round-trip through native project files.
 *
 * The `variableWidth` re-edit record (stations / centreline / base width)
 * rides inside each Fabric object record: `variableWidth.ts` registers its
 * key in Fabric's static `customProperties` allow-list, so every
 * `toObject()` / `toJSON()` serialises it and `loadFromJSON` re-attaches
 * it (the constructor's `setOptions` assigns unknown record props back
 * onto the instance). These tests pin that contract end to end:
 *
 * - object-level: toObject/toJSON carry the exact record
 * - project-level: buildProject → JSON disk → applyProject preserves it
 * - re-edit: the Width tool's in-place commit works on a restored outline
 * - fail-soft: corrupted / partial records are dropped, never throw
 * - undo/redo: the real History class (same toJSON/loadFromJSON pair as
 *   projectFile) keeps the metadata too
 *
 * Canvas stub: a real fabric.Canvas needs a 2D context jsdom can't give,
 * so canvasEngine.getCanvas is mocked with a minimal StaticCanvas
 * stand-in. Fidelity is kept at the seams that matter — `toJSON()` calls
 * each live object's real `toObject()`, and `loadFromJSON()` dispatches
 * each record through the real class registry (`Path.fromObject` etc.),
 * which is exactly what fabric's own enliven path does.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fabric from 'fabric';
import {
  applyWidthStationsToObject,
  readVariableWidthMeta,
  restoreVariableWidth,
  restoreVariableWidthOnCanvas,
  serializeVariableWidth,
} from '../variableWidth';
import { buildProject, applyProject, type ProjectFile } from '../projectFile';
import { History } from '../history';
import { getCanvas } from '../canvasEngine';

/** Capability needed to revive one serialized record (fabric's own dispatch). */
type RevivableClass = { fromObject: (record: Record<string, unknown>) => Promise<fabric.FabricObject> };

vi.mock('../canvasEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canvasEngine')>();
  const fabric = await import('fabric');
  const objects: fabric.FabricObject[] = [];
  const fakeCanvas = {
    add: (o: fabric.FabricObject) => { objects.push(o); return fakeCanvas; },
    getObjects: () => objects,
    toJSON: () => ({ version: '6.9.1', objects: objects.map(o => o.toObject()) }),
    loadFromJSON: async (json: unknown) => {
      const rec = json as { objects?: Array<Record<string, unknown>> };
      objects.length = 0;
      for (const o of rec.objects ?? []) {
        const cls = fabric.classRegistry.getClass<RevivableClass>(String(o.type));
        objects.push(await cls.fromObject(o));
      }
    },
    requestRenderAll: () => {},
    renderAll: () => {},
  };
  return {
    ...actual,
    getCanvas: () => fakeCanvas,
    resizeCanvas: vi.fn(),
    setBackground: vi.fn(),
    pushHistory: vi.fn(),
  };
});

/* The mocked canvas, retyped for the calls the tests make. */
const cnv = () => getCanvas() as unknown as fabric.Canvas;
const objectsOnCanvas = () => (getCanvas() as unknown as { getObjects: () => fabric.FabricObject[] }).getObjects();
const resetCanvas = () => { objectsOnCanvas().length = 0; };

/** Commit a taper via the Width tool's own entry point (fake canvas add). */
function makeTaper(): fabric.Path {
  const src = new fabric.Path('M 0 0 L 100 0', { stroke: '#123456', strokeWidth: 4 });
  const out = applyWidthStationsToObject(
    cnv(), src,
    [{ t: 0, width: 4 }, { t: 0.5, width: 24 }, { t: 1, width: 4 }],
    [[0, 0], [100, 0]],
  );
  expect(out).not.toBeNull();
  return out!;
}

/** Envelope wrapper: current editor state + one hand-built object record. */
function projectWith(record: Record<string, unknown>): ProjectFile {
  const base = buildProject();
  return { ...base, canvas: { objects: [record] } } as ProjectFile;
}

/** Simulate the disk: JSON stringify + parse detaches every reference. */
function toDisk(project: ProjectFile): ProjectFile {
  return JSON.parse(JSON.stringify(project)) as ProjectFile;
}

beforeEach(() => {
  resetCanvas();
  localStorage.clear();
});

/* ---------------------- serialization seam ---------------------- */

describe('variableWidth serialization', () => {
  it('toObject carries the exact record (customProperties registration)', () => {
    const outline = makeTaper();
    const record = outline.toObject() as unknown as Record<string, unknown>;
    expect(record.variableWidth).toEqual({
      stations: [{ t: 0, width: 4 }, { t: 0.5, width: 24 }, { t: 1, width: 4 }],
      centerline: [[0, 0], [100, 0]],
      baseWidth: 4,
    });
    // The record is JSON-plain: survives stringify/parse byte-for-byte.
    expect(JSON.parse(JSON.stringify(record)).variableWidth).toEqual(record.variableWidth);
    // serializeVariableWidth returns the same shape independently.
    expect(serializeVariableWidth(outline)).toEqual(record.variableWidth);
  });

  it('objects without metadata emit no key at all', () => {
    const plain = new fabric.Rect({ fill: '#000', width: 10, height: 10 });
    expect('variableWidth' in plain.toObject()).toBe(false);
    expect(serializeVariableWidth(plain)).toBeUndefined();
    expect(readVariableWidthMeta(plain)).toBeNull();
  });
});

/* ------------------- project file round-trip ------------------- */

describe('project file round-trip', () => {
  it('buildProject → disk → applyProject preserves stations/centerline/baseWidth exactly', async () => {
    const outline = makeTaper();
    const rect = new fabric.Rect({ fill: '#abc', width: 10, height: 10 });
    cnv().add(rect);
    const metaBefore = serializeVariableWidth(outline)!;

    const project = buildProject();
    const records = (project.canvas as { objects: Array<Record<string, unknown>> }).objects;
    expect(records).toHaveLength(2);
    expect(records[0].variableWidth).toEqual(metaBefore);
    expect('variableWidth' in records[1]).toBe(false);

    resetCanvas();
    await applyProject(toDisk(project));

    const restored = objectsOnCanvas();
    expect(restored).toHaveLength(2);
    expect(serializeVariableWidth(restored[0])).toEqual(metaBefore);
    // The plain object is untouched by the restore machinery.
    expect(serializeVariableWidth(restored[1])).toBeUndefined();
    expect((restored[1] as fabric.Rect).fill).toBe('#abc');
  });

  it('the Width tool can re-edit a restored outline in place', async () => {
    makeTaper();
    const disk = toDisk(buildProject());
    resetCanvas();
    await applyProject(disk);
    const restored = objectsOnCanvas()[0] as fabric.Path;
    const centerlineBefore = serializeVariableWidth(restored)!.centerline;

    const reedited = applyWidthStationsToObject(
      cnv(), restored,
      [{ t: 0, width: 2 }, { t: 0.5, width: 12 }, { t: 1, width: 2 }],
    );

    expect(reedited).toBe(restored);           // same object identity — in-place
    expect(objectsOnCanvas()).toHaveLength(1); // nothing new added
    const meta = readVariableWidthMeta(restored)!;
    expect(meta.stations.map(s => s.width)).toEqual([2, 12, 2]);
    // Restored command-space centreline survived the rebuild (float-safe).
    meta.centerline.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(centerlineBefore[i][0], 6);
      expect(p[1]).toBeCloseTo(centerlineBefore[i][1], 6);
    });
  });
});

/* ----------------------- fail-soft restore ----------------------- */

describe('corrupted / partial metadata fails soft', () => {
  const badRecords: unknown[] = [
    null,
    'nope',
    42,
    [],
    { centerline: [[0, 0], [100, 0]], baseWidth: 4 },                                  // missing stations
    { stations: [], centerline: [[0, 0], [100, 0]], baseWidth: 4 },                     // empty stations
    { stations: { t: 0, width: 5 }, centerline: [[0, 0], [100, 0]], baseWidth: 4 },     // stations not an array
    { stations: [{ t: 0, width: 5 }, 'junk'], centerline: [[0, 0], [100, 0]], baseWidth: 4 }, // mixed garbage
    { stations: [{ t: 0, width: 5 }, { t: 1, width: 5 }], baseWidth: 4 },               // missing centreline
    { stations: [{ t: 0, width: 5 }, { t: 1, width: 5 }], centerline: [[0, 0]], baseWidth: 4 },        // too short
    { stations: [{ t: 0, width: 5 }, { t: 1, width: 5 }], centerline: [[0, 0], ['x', 5]], baseWidth: 4 }, // bad point
    { stations: [{ t: 0, width: 5 }, { t: 1, width: 5 }], centerline: [[0, 0], [100, 0]], baseWidth: '4' }, // wrong type
    { stations: [{ t: 0, width: 5 }, { t: 1, width: 5 }], centerline: [[0, 0], [100, 0]], baseWidth: 0 },   // non-positive
  ];

  it('applyProject drops broken records without throwing', async () => {
    for (const bad of badRecords) {
      const record = new fabric.Path('M 0 0 L 100 0', { fill: '#111' }).toObject() as unknown as Record<string, unknown>;
      record.variableWidth = bad;
      resetCanvas();
      await expect(applyProject(toDisk(projectWith(record)))).resolves.toBeUndefined();
      const restored = objectsOnCanvas();
      expect(restored).toHaveLength(1);
      // Dropped, not left dangling: no metadata, but the path itself is intact.
      expect((restored[0] as { variableWidth?: unknown }).variableWidth).toBeUndefined();
      expect(readVariableWidthMeta(restored[0])).toBeNull();
      expect((restored[0] as fabric.Path).fill).toBe('#111');
    }
  });

  it('restoreVariableWidth reports success/failure and never throws', () => {
    for (const bad of badRecords) {
      const object = new fabric.Path('M 0 0 L 10 0', {});
      (object as { variableWidth?: unknown }).variableWidth = bad;
      expect(() => restoreVariableWidth(object, bad)).not.toThrow();
      expect(restoreVariableWidth(object, bad)).toBe(false);
      expect('variableWidth' in object).toBe(false);
    }
  });

  it('normalises well-typed but out-of-range numeric records', () => {
    const object = new fabric.Path('M 0 0 L 10 0', {});
    const ok = restoreVariableWidth(object, {
      stations: [{ t: 1.5, width: 5000 }, { t: -1, width: 3 }],
      centerline: [[0, 0], [10, 0]],
      baseWidth: 2,
    });
    expect(ok).toBe(true);
    expect(readVariableWidthMeta(object)!.stations).toEqual([{ t: 0, width: 3 }, { t: 1, width: 1000 }]);
    expect(readVariableWidthMeta(object)!.baseWidth).toBe(2);
  });

  it('restoreVariableWidthOnCanvas recurses into groups and counts kept records', () => {
    const outline = makeTaper();
    const group = new fabric.Group([outline], { left: 5, top: 5 });
    const bare = new fabric.Rect({});
    const count = restoreVariableWidthOnCanvas({ getObjects: () => [group, bare] });
    expect(count).toBe(1);
    expect(readVariableWidthMeta(group.getObjects()[0])).not.toBeNull();
    expect(readVariableWidthMeta(bare)).toBeNull();
  });
});

/* ------------------- undo / redo (history.ts) ------------------- */

describe('undo/redo preserves the metadata', () => {
  it('the real History snapshot/restore pair keeps re-edit data', async () => {
    const history = new History({ limit: 10 });
    history.init(cnv());
    expect(history.canUndo()).toBe(false);

    makeTaper(); // the edit: outline committed to the canvas
    history.capture(cnv());
    const metaBefore = serializeVariableWidth(objectsOnCanvas()[0])!;
    expect(metaBefore).toBeDefined();

    resetCanvas(); // the user deletes the outline
    history.capture(cnv());
    expect(history.canUndo()).toBe(true);

    await history.undo(cnv()); // back to the state WITH the taper
    const objects = objectsOnCanvas();
    expect(objects).toHaveLength(1);
    expect(serializeVariableWidth(objects[0])).toEqual(metaBefore);

    await history.redo(cnv()); // forward to the deleted state again
    expect(objectsOnCanvas()).toHaveLength(0);
  });
});
