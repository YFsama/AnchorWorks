import { beforeEach, describe, expect, it, vi } from 'vitest';

// A JSON file that reached the app without the project picker (dropped on the
// window, or picked by a generic "Open SVG / JSON" dialog) must open as a
// project when it is one. Handed to the raw canvas loader it used to clear the
// canvas and restore nothing.

const loadFromJSON = vi.fn(async (_json: Record<string, unknown>): Promise<void> => {});
const fakeCanvas = (objects: unknown[]) => ({
  getObjects: () => objects,
  loadFromJSON,
  requestRenderAll: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,AAAA'),
});

vi.mock('../canvasEngine', () => ({
  getCanvas: vi.fn(),
  resizeCanvas: vi.fn(),
  setBackground: vi.fn(),
  pushHistory: vi.fn(),
}));
vi.mock('../artboards', () => ({ getArtboards: () => [] }));
vi.mock('../symbols', () => ({ getSymbols: () => [] }));
vi.mock('../io', () => ({ download: vi.fn() }));
vi.mock('../toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../recentFiles', () => ({ addRecent: vi.fn() }));
vi.mock('../runtime', () => ({ isTauri: () => false, callNative: vi.fn() }));
vi.mock('../autosave', () => ({ getChangeSeq: () => 0, markProjectSaved: vi.fn() }));
vi.mock('../variableWidth', () => ({ restoreVariableWidthOnCanvas: vi.fn() }));
vi.mock('../io2', () => ({ loadCanvasJSON: vi.fn(async () => {}) }));
vi.mock('../confirm', () => ({ showConfirm: vi.fn(async () => true) }));

import { getCanvas, resizeCanvas } from '../canvasEngine';
import { toast } from '../toast';
import { addRecent } from '../recentFiles';
import { markProjectSaved } from '../autosave';
import { loadCanvasJSON } from '../io2';
import { showConfirm } from '../confirm';
import { registerBuiltInFormats } from '../formatRegistration';
import { getFormat } from '../formats';
import { useEditor } from '../../store/editor';
import { openJsonFile, getCurrentProjectName } from '../projectFile';

const rect = (left: number) => ({ type: 'rect', left, top: 100, width: 80, height: 60, fill: '#f00' });
const canvasState = (objects: unknown[]) => ({ version: '7.0.0', objects, background: '#fff' });
const envelope = (objects: unknown[]) => JSON.stringify({
  kind: 'anchorworks-project',
  version: 2,
  createdAt: 0,
  doc: { width: 900, height: 700, background: '#202020', dpi: 96, unit: 'px' },
  canvas: canvasState(objects),
  artboards: [],
  symbols: [],
  cutPaths: [],
});
const jsonFile = (name: string, body: unknown): File => new File([typeof body === 'string' ? body : JSON.stringify(body)], name, { type: 'application/json' });
const setCanvas = (objects: unknown[]) => vi.mocked(getCanvas).mockReturnValue(fakeCanvas(objects) as never);

describe('openJsonFile — a project envelope opens as a project, anything else as a canvas state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditor.getState().setDoc({ width: 1000, height: 800, background: '#111111' });
  });

  it('a project envelope goes through applyProject — never the raw canvas loader', async () => {
    setCanvas([]);
    const file = jsonFile('job.vstudio.json', envelope([rect(10), rect(200)]));
    await expect(openJsonFile(file)).resolves.toBe(true);
    expect(loadFromJSON).toHaveBeenCalledTimes(1);
    expect(loadFromJSON.mock.calls[0][0]).toEqual(canvasState([rect(10), rect(200)]));
    // The document came along: size, background, and the "nothing unsaved" credit.
    expect(resizeCanvas).toHaveBeenCalledWith(900, 700);
    expect(useEditor.getState().doc.background).toBe('#202020');
    expect(markProjectSaved).toHaveBeenCalled();
    expect(loadCanvasJSON).not.toHaveBeenCalled();
  });

  it('the opened file becomes the current project, by name only — the next save asks where to put it', async () => {
    setCanvas([]);
    await openJsonFile(jsonFile('poster.awk.json', envelope([rect(0)])));
    expect(getCurrentProjectName()).toBe('poster.awk.json');
    expect(addRecent).toHaveBeenCalledWith('poster.awk.json', expect.any(String));
    expect(toast.success).toHaveBeenCalledWith('Opened poster.awk.json');
  });

  it('a plain canvas state replaces the objects and is not mistaken for a project', async () => {
    setCanvas([]);
    const state = canvasState([rect(40)]);
    const nameBefore = getCurrentProjectName(); // module state — earlier cases may have opened a project
    await expect(openJsonFile(jsonFile('export.json', state))).resolves.toBe(true);
    expect(loadCanvasJSON).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadCanvasJSON).mock.calls[0][0]).toEqual(state);
    expect(loadFromJSON).not.toHaveBeenCalled();
    expect(getCurrentProjectName()).toBe(nameBefore);
    expect(addRecent).not.toHaveBeenCalled();
    expect(resizeCanvas).not.toHaveBeenCalled();
  });

  it('asks before replacing a design that holds objects — and a decline changes nothing', async () => {
    setCanvas([rect(1), rect(2)]);
    const nameBefore = getCurrentProjectName();
    vi.mocked(showConfirm).mockResolvedValueOnce(false);
    await expect(openJsonFile(jsonFile('job.vstudio.json', envelope([rect(10)])))).resolves.toBe(false);
    expect(showConfirm).toHaveBeenCalledTimes(1);
    const ask = vi.mocked(showConfirm).mock.calls[0][0];
    expect(ask.title).toBe('Open project');
    expect(ask.message).toBe('“job.vstudio.json” replaces the design that is open now — artboards and symbols included.');
    expect(ask.confirmLabel).toBe('Open');
    expect(loadFromJSON).not.toHaveBeenCalled();
    expect(loadCanvasJSON).not.toHaveBeenCalled();
    expect(getCurrentProjectName()).toBe(nameBefore);
    expect(useEditor.getState().doc.background).toBe('#111111');
  });

  it('a canvas state asks too, with a message that promises less', async () => {
    setCanvas([rect(1)]);
    await expect(openJsonFile(jsonFile('export.json', canvasState([rect(9)])))).resolves.toBe(true);
    const ask = vi.mocked(showConfirm).mock.calls[0][0];
    expect(ask.title).toBe('Import JSON');
    expect(ask.message).toBe('“export.json” replaces the objects on the canvas.');
    expect(ask.confirmLabel).toBe('Import');
    expect(loadCanvasJSON).toHaveBeenCalledTimes(1);
  });

  it('an empty canvas is not worth a question', async () => {
    setCanvas([]);
    await openJsonFile(jsonFile('job.vstudio.json', envelope([rect(10)])));
    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('a damaged file rejects instead of touching the canvas', async () => {
    setCanvas([rect(1)]);
    await expect(openJsonFile(jsonFile('broken.vstudio.json', '{'))).rejects.toBeInstanceOf(SyntaxError);
    expect(loadFromJSON).not.toHaveBeenCalled();
    expect(loadCanvasJSON).not.toHaveBeenCalled();
  });
});

describe('the format registry JSON importer', () => {
  beforeEach(() => { vi.clearAllMocks(); registerBuiltInFormats(); });

  it('hands a JSON file to openJsonFile and passes a decline back as false', async () => {
    setCanvas([rect(1)]);
    vi.mocked(showConfirm).mockResolvedValueOnce(false);
    const file = jsonFile('job.vstudio.json', envelope([rect(10)]));
    await expect(getFormat('json')?.import?.(file)).resolves.toBe(false);
    expect(loadFromJSON).not.toHaveBeenCalled();
  });

  it('ignores text input (it only takes files)', async () => {
    await expect(getFormat('json')?.import?.('{"kind":"anchorworks-project"}')).resolves.toBeUndefined();
    expect(loadFromJSON).not.toHaveBeenCalled();
  });
});
