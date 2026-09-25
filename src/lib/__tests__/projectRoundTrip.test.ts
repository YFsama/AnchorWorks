/**
 * Project file round-trip — the P1-5 persistence contract.
 *
 * buildProject gathers the whole editor (canvas objects, doc settings,
 * artboards, symbols, cutPaths) into a versioned envelope; applyProject
 * restores every piece. This test drives the real fabric APIs end to end
 * following variableWidthPersist.test.ts's canvas-stub fidelity pattern:
 * `toJSON()` runs each live object's real `toObject()`, and
 * `loadFromJSON()` dispatches records through fabric's real class registry
 * (Rect.fromObject / Path.fromObject / Group.fromObject with nested
 * enlivening) — exactly what fabric's own revive path does. The "disk" is
 * a JSON.stringify/parse pair so every reference is detached, like a real
 * save→reopen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import {
  applyProject,
  buildProject,
  type ProjectFile,
} from '../projectFile';
import { getCanvas } from '../canvasEngine';
import { useEditor } from '../../store/editor';
import type { Artboard, DocSettings, SymbolEntry } from '../../types';

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

const objectsOnCanvas = () => (getCanvas() as unknown as { getObjects: () => fabric.FabricObject[] }).getObjects();
const resetCanvas = () => { objectsOnCanvas().length = 0; };
/** Simulate the disk: stringify + parse detaches every reference. */
const toDisk = (p: ProjectFile): ProjectFile => JSON.parse(JSON.stringify(p)) as ProjectFile;

const DEFAULT_DOC: DocSettings = { width: 800, height: 600, unit: 'px', dpi: 96, background: '#ffffff' };

const ARTBOARDS: Artboard[] = [
  { id: 'ab-1', name: 'Front', x: 0, y: 0, width: 400, height: 300 },
  { id: 'ab-2', name: 'Back', x: 450, y: 0, width: 400, height: 300 },
];

const SYMBOLS: SymbolEntry[] = [
  { id: 'sym-1', name: 'Star', thumbnail: 'data:image/png;base64,x', objectsJSON: { type: 'Path' }, addedAt: 1700000000000 },
];

/** Populate a rich editor state: 4 objects (incl. a nested group) + doc + cut paths. */
function seedEditor(): void {
  resetCanvas();
  const cnv = getCanvas() as unknown as { add: (o: fabric.FabricObject) => void };
  cnv.add(new fabric.Rect({ left: 10, top: 10, width: 100, height: 50, fill: '#ff0000', strokeWidth: 0 }));
  cnv.add(new fabric.Path('M 0 0 L 200 0 L 200 80 Z', { fill: '#00ff00', stroke: '#111111', strokeWidth: 2, left: 0, top: 0 }));
  cnv.add(new fabric.Circle({ left: 300, top: 40, radius: 25, fill: '#0000ff', strokeWidth: 0 }));
  cnv.add(new fabric.Group([
    new fabric.Rect({ width: 30, height: 30, fill: '#abc', strokeWidth: 0 }),
    new fabric.Path('M 0 0 L 30 30', { stroke: '#333', strokeWidth: 1, left: 0, top: 0 }),
  ]));
  useEditor.getState().setDoc({ width: 1200, height: 800, unit: 'mm', dpi: 300, background: '#123456' });
  useEditor.getState().setCutPaths([
    { id: 'cp-1', points: [[0, 0], [10, 0], [10, 10]], closed: true, kind: 'outline', sourceObjectId: 'obj-9', passes: 2 },
    { id: 'cp-2', points: [[5, 5], [5, 25]], closed: false, kind: 'manual', passes: 1 },
  ]);
  useEditor.getState().setArtboards(ARTBOARDS);
  localStorage.setItem('vector.symbols', JSON.stringify(SYMBOLS));
}

/** Wipe everything so a successful apply is provably a full restore. */
function wipeEditor(): void {
  resetCanvas();
  useEditor.getState().setDoc(DEFAULT_DOC);
  useEditor.getState().setCutPaths([]);
  useEditor.getState().setArtboards([]);
  localStorage.removeItem('vector.artboards');
  localStorage.removeItem('vector.symbols');
}

beforeEach(() => {
  wipeEditor();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('buildProject envelope', () => {
  it('gathers canvas, doc, artboards, symbols and cutPaths into a v2 envelope', () => {
    seedEditor();
    const p = buildProject();
    expect(p.kind).toBe('anchorworks-project');
    expect(p.version).toBe(2);
    expect(p.doc).toEqual({ width: 1200, height: 800, unit: 'mm', dpi: 300, background: '#123456' });
    expect((p.canvas as { objects: unknown[] }).objects).toHaveLength(4);
    expect(p.artboards).toEqual(ARTBOARDS);
    expect(p.symbols).toEqual(SYMBOLS);
    expect(p.cutPaths).toEqual(useEditor.getState().cutPaths);
    expect(typeof p.createdAt).toBe('number');
  });

  it('snapshots artboards/symbols (no live references into the store)', () => {
    seedEditor();
    const p = buildProject();
    expect(p.artboards).not.toBe(useEditor.getState().cutPaths); // sanity: distinct graphs
    const ab = p.artboards as Artboard[];
    const before = JSON.stringify(ab);
    useEditor.getState().setArtboards([]);
    expect(JSON.stringify(p.artboards)).toBe(before);
    expect(ab).toHaveLength(2);
  });
});

describe('buildProject → disk → applyProject round trip', () => {
  it('restores the full object tree with types, geometry and styles', async () => {
    seedEditor();
    const disk = toDisk(buildProject());

    wipeEditor();
    expect(objectsOnCanvas()).toHaveLength(0);
    await applyProject(disk);

    const objs = objectsOnCanvas();
    expect(objs).toHaveLength(4);
    const types = objs.map(o => o.type);
    expect(types).toEqual(['rect', 'path', 'circle', 'group']);

    const rect = objs[0] as fabric.Rect;
    expect(rect.fill).toBe('#ff0000');
    expect(rect.width).toBeCloseTo(100, 5);
    expect(rect.height).toBeCloseTo(50, 5);

    const path = objs[1] as fabric.Path;
    expect(path.fill).toBe('#00ff00');
    expect(path.stroke).toBe('#111111');
    expect(path.strokeWidth).toBe(2);
    // Path data survives the trip (3 anchors + close).
    expect((path.path as unknown as unknown[]).length).toBe(4);

    const circle = objs[2] as fabric.Circle;
    expect(circle.radius).toBeCloseTo(25, 5);

    const group = objs[3] as fabric.Group;
    expect(group.getObjects()).toHaveLength(2);
    expect(group.getObjects()[0].type).toBe('rect');
    expect(group.getObjects()[1].type).toBe('path');
  });

  it('restores doc settings into the store', async () => {
    seedEditor();
    const disk = toDisk(buildProject());
    wipeEditor();
    await applyProject(disk);
    expect(useEditor.getState().doc).toEqual({ width: 1200, height: 800, unit: 'mm', dpi: 300, background: '#123456' });
  });

  it('restores cutPaths into the store', async () => {
    seedEditor();
    const disk = toDisk(buildProject());
    wipeEditor();
    useEditor.getState().setCutPaths([{ id: 'stale', points: [[1, 1]], closed: true, kind: 'manual' }]);
    await applyProject(disk);
    expect(useEditor.getState().cutPaths.map(c => c.id)).toEqual(['cp-1', 'cp-2']);
    expect(useEditor.getState().cutPaths[0].passes).toBe(2);
    expect(useEditor.getState().cutPaths[0].closed).toBe(true);
  });

  it('mirrors artboards into the store AND localStorage, symbols into localStorage', async () => {
    seedEditor();
    const disk = toDisk(buildProject());
    wipeEditor();
    await applyProject(disk);

    expect(useEditor.getState().artboards).toEqual(ARTBOARDS);
    expect(JSON.parse(localStorage.getItem('vector.artboards')!)).toEqual(ARTBOARDS);
    expect(JSON.parse(localStorage.getItem('vector.symbols')!)).toEqual(SYMBOLS);
  });

  it('re-serialises an applied project to an equivalent envelope (idempotence)', async () => {
    seedEditor();
    const disk = toDisk(buildProject());
    wipeEditor();
    await applyProject(disk);
    const again = toDisk(buildProject());
    // Canvas/doc/artboards/cutPaths survive a second generation untouched.
    expect(again.doc).toEqual(disk.doc);
    expect(again.artboards).toEqual(disk.artboards);
    expect(again.symbols).toEqual(disk.symbols);
    expect(again.cutPaths).toEqual(disk.cutPaths);
    expect((again.canvas as { objects: unknown[] }).objects).toHaveLength(
      (disk.canvas as { objects: unknown[] }).objects.length,
    );
  });
});

describe('applyProject — schema handling', () => {
  it('accepts v1 files (cutPaths omitted) by clearing existing cut paths', async () => {
    seedEditor();
    const p = buildProject();
    const v1 = { ...p, version: 1 } as ProjectFile & { cutPaths?: unknown };
    delete v1.cutPaths;
    await applyProject(toDisk(v1));
    expect(useEditor.getState().cutPaths).toEqual([]);
    // The rest still applied.
    expect(objectsOnCanvas()).toHaveLength(4);
  });

  it('drops malformed cutPath entries and keeps valid ones', async () => {
    seedEditor();
    const p = buildProject();
    // Deliberately ill-typed entries — applyProject must filter them out.
    const malformed = [
      { id: 'bad-kind', points: [[0, 0]], closed: true, kind: 'laser' },
      { id: 'no-points', closed: true, kind: 'manual' },
      { points: [[0, 0]], closed: true, kind: 'manual' },
    ] as unknown as NonNullable<ProjectFile['cutPaths']>;
    p.cutPaths = [...p.cutPaths!, ...malformed];
    await applyProject(toDisk(p));
    expect(useEditor.getState().cutPaths.map(c => c.id)).toEqual(['cp-1', 'cp-2']);
  });

  it('rejects non-project payloads and unsupported versions', async () => {
    await expect(applyProject({} as ProjectFile)).rejects.toThrow('Not a Anchorworks project file');
    await expect(applyProject('not an object' as unknown as ProjectFile)).rejects.toThrow('Not a Anchorworks project file');
    await expect(applyProject({ kind: 'anchorworks-project', version: 3, doc: {}, canvas: {} } as unknown as ProjectFile))
      .rejects.toThrow('Unsupported project version: 3');
  });

  it('seeds a history entry so the open is undoable', async () => {
    seedEditor();
    const disk = toDisk(buildProject());
    wipeEditor();
    await applyProject(disk);
    // pushHistory is mocked through the canvasEngine mock — assert it ran.
    const { pushHistory } = await import('../canvasEngine');
    expect(vi.mocked(pushHistory)).toHaveBeenCalled();
  });
});
