import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';

// io3's heavyweight neighbours are stubbed: the drag-drop section only needs
// getCanvas (drop placement), toast (outcome reporting) and the format
// registry (per-extension dispatch). The trace-worker `?worker` import is
// replaced so the module can load under vitest at all.
vi.mock('../canvasEngine', () => ({ getCanvas: vi.fn(), pushHistory: vi.fn() }));
vi.mock('../io', () => ({ exportSVG: vi.fn(() => ''), importSVGString: vi.fn() }));
vi.mock('../printer', () => ({ printHtmlDocument: vi.fn() }));
vi.mock('../toast', () => ({
  toast: { success: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn(), show: vi.fn(), update: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('../formats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../formats')>()),
  findFormatByExt: vi.fn(),
  listImporters: vi.fn((): unknown[] => []),
}));
vi.mock('../workers/trace.worker.ts?worker', () => ({ default: class { postMessage() {} } }));

import { attachDragDrop, importDroppedFiles } from '../io3';
import { getCanvas } from '../canvasEngine';
import { toast } from '../toast';
import { findFormatByExt, listImporters, type FormatHandler } from '../formats';

type Rect = { left: number; top: number; width: number; height: number };

/** A fabric canvas stand-in: 1000×800 at 2× zoom, panned so scene (450, 300) is the viewport centre. */
function fakeCanvas(extra: Partial<Record<string, unknown>> = {}) {
  return {
    getWidth: () => 1000,
    getHeight: () => 800,
    viewportTransform: [2, 0, 0, 2, -400, -200],
    upperCanvasEl: { getBoundingClientRect: (): Rect => ({ left: 100, top: 50, width: 1000, height: 800 }) },
    add: vi.fn(),
    setActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    getActiveObject: () => null,
    ...extra,
  };
}

interface DragOptions { files?: File[]; types?: string[]; clientX?: number; clientY?: number }

/** jsdom has no DataTransfer — a DragEvent-shaped Event with the fields io3 reads. */
function drag(type: string, target: Element, opts: DragOptions = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: {
      value: {
        types: opts.types ?? (opts.files ? ['Files'] : []),
        items: [],
        files: opts.files ?? [],
        dropEffect: 'none',
      },
    },
    clientX: { value: opts.clientX ?? 0 },
    clientY: { value: opts.clientY ?? 0 },
  });
  target.dispatchEvent(event);
  return event;
}

const png = (name = 'photo.png', type = 'image/png') => new File(['x'], name, { type });
const overlay = () => document.body.querySelector(':scope > div[aria-hidden="true"]');
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function fakeImage(width: number, height: number) {
  return {
    width,
    height,
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    scale: vi.fn(),
    set: vi.fn(function (this: Record<string, unknown>, props: Record<string, unknown>) { Object.assign(this, props); }),
  };
}

let host: HTMLDivElement;
let canvasChild: HTMLCanvasElement;
let panel: HTMLElement;

beforeAll(() => {
  // jsdom never decodes images: fire onload on the next tick and keep the
  // thumbnail canvas inert, so importImageFile's asset-library step resolves.
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('Image', StubImage);
  if (!window.requestAnimationFrame) {
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 0));
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-applied every test: afterEach restores all mocks.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
});

afterEach(() => {
  vi.restoreAllMocks();
  host?.remove();
  panel?.remove();
  document.body.innerHTML = '';
  localStorage.clear();
});

function mount() {
  host = document.createElement('div');
  host.className = 'canvas-host';
  canvasChild = document.createElement('canvas');
  host.appendChild(canvasChild);
  panel = document.createElement('aside');
  document.body.append(host, panel);
}

describe('attachDragDrop — window-level drop target', () => {
  it('shows the canvas affordance over the canvas host and the full-window overlay over the panels', () => {
    mount();
    const detach = attachDragDrop(host);
    const enter = drag('dragenter', canvasChild, { files: [png()] });
    expect(enter.defaultPrevented).toBe(true);
    expect(host.classList.contains('dragging-files')).toBe(true);
    expect(overlay()).toBeNull();

    // Same drag, pointer moves onto the right panel.
    drag('dragover', panel, { files: [png()] });
    expect(host.classList.contains('dragging-files')).toBe(false);
    expect(overlay()?.textContent).toContain('Release to import');

    // Back over the canvas: ring again, overlay gone.
    drag('dragover', canvasChild, { files: [png()] });
    expect(host.classList.contains('dragging-files')).toBe(true);
    expect(overlay()).toBeNull();

    drag('drop', canvasChild, { files: [png()] });
    expect(host.classList.contains('dragging-files')).toBe(false);
    detach();
  });

  it('leaves non-file drags (text, internal layer reorder) to the browser', () => {
    mount();
    const detach = attachDragDrop(host);
    const over = drag('dragover', panel, { types: ['text/plain'] });
    const drop = drag('drop', panel, { types: ['text/plain'] });
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(overlay()).toBeNull();
    expect(getCanvas).not.toHaveBeenCalled();
    detach();
  });

  it('ignores drops another in-app drop target already accepted', () => {
    mount();
    const detach = attachDragDrop(host);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      dataTransfer: { value: { types: ['Files'], items: [], files: [png()] } },
      clientX: { value: 10 },
      clientY: { value: 10 },
    });
    drop.preventDefault(); // the Gang Sheet Builder intake does this
    canvasChild.dispatchEvent(drop);
    expect(getCanvas).not.toHaveBeenCalled();
    expect(toast.warn).not.toHaveBeenCalled();
    detach();
  });

  it('clears the affordance when the drag leaves the window, but not when it moves between children', async () => {
    mount();
    const detach = attachDragDrop(host);
    drag('dragenter', panel, { files: [png()] });
    expect(overlay()).not.toBeNull();

    // dragleave(old) then dragenter(new) in the same frame: still dragging.
    drag('dragleave', panel, { files: [png()] });
    drag('dragenter', canvasChild, { files: [png()] });
    await nextFrame();
    expect(host.classList.contains('dragging-files')).toBe(true);

    // dragleave with nothing following it: the drag left the window.
    drag('dragleave', canvasChild, { files: [png()] });
    await nextFrame();
    expect(host.classList.contains('dragging-files')).toBe(false);
    expect(overlay()).toBeNull();
    detach();
  });

  it('clears a drag that goes silent (watchdog) and tears down cleanly', () => {
    vi.useFakeTimers();
    try {
      mount();
      const detach = attachDragDrop(host);
      drag('dragover', panel, { files: [png()] });
      expect(overlay()).not.toBeNull();
      vi.advanceTimersByTime(2000);
      expect(overlay()).toBeNull();

      detach();
      const after = drag('dragover', canvasChild, { files: [png()] });
      expect(after.defaultPrevented).toBe(false);
      expect(host.classList.contains('dragging-files')).toBe(false);
      expect(overlay()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('importDroppedFiles — placement', () => {
  it('places a raster dropped on the canvas under the cursor', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    const img = fakeImage(200, 120);
    vi.spyOn(fabric.FabricImage, 'fromURL').mockResolvedValue(img as never);
    // Client (500, 300) → canvas-local (400, 250) → scene (400, 225).
    const result = await importDroppedFiles([png()], { clientX: 500, clientY: 300 }, true);
    expect(result).toEqual({ imported: 1, failed: 0, unsupported: 0 });
    expect(canvas.add).toHaveBeenCalledOnce();
    expect(img.left).toBe(300); // 400 − 200/2
    expect(img.top).toBe(165); // 225 − 120/2
  });

  it('places a raster dropped outside the canvas on the centre of the current view', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    const img = fakeImage(200, 120);
    vi.spyOn(fabric.FabricImage, 'fromURL').mockResolvedValue(img as never);
    // The pointer was over the right panel (client 1300, 20) — ignored.
    await importDroppedFiles([png()], { clientX: 1300, clientY: 20 }, false);
    // Viewport centre: canvas-local (500, 400) → scene (450, 300).
    expect(img.left).toBe(350); // 450 − 100
    expect(img.top).toBe(240); // 300 − 60
  });

  it('cascades multiple rasters and confirms the batch with one toast', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    const first = fakeImage(200, 120);
    const second = fakeImage(200, 120);
    const queue = [first, second];
    vi.spyOn(fabric.FabricImage, 'fromURL').mockImplementation(() => Promise.resolve(queue.shift() as never));
    const result = await importDroppedFiles([png('a.png'), png('b.png')], { clientX: 500, clientY: 300 }, true);
    expect(result.imported).toBe(2);
    expect(second.left).toBe(308); // +16 client px = +8 scene px at 2× zoom
    expect(second.top).toBe(173);
    // No failure toast — the batch gets one short confirmation.
    expect(toast.warn).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe('2 files imported');
  });
});

describe('importDroppedFiles — failures are visible, never raw', () => {
  it('reports an unsupported file type by name and leaves the canvas untouched', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    vi.mocked(findFormatByExt).mockReturnValue(undefined);
    vi.mocked(listImporters).mockReturnValue([
      { id: 'svg', label: 'SVG', ext: 'svg', mode: 'both' } as FormatHandler,
    ]);
    const result = await importDroppedFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })], { clientX: 500, clientY: 300 }, true);
    expect(result).toEqual({ imported: 0, failed: 0, unsupported: 1 });
    expect(canvas.add).not.toHaveBeenCalled();
    expect(toast.warn).toHaveBeenCalledTimes(1);
    const message = vi.mocked(toast.warn).mock.calls[0][0];
    expect(message).toContain('"notes.txt"');
    expect(message).toContain('Unsupported file type.');
    expect(message).toContain('Supported: PNG, JPG, JPEG, WEBP, GIF, SVG');
  });

  it('reports an image that will not decode without leaking the decoder error', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    vi.mocked(findFormatByExt).mockReturnValue(undefined);
    vi.spyOn(fabric.FabricImage, 'fromURL').mockRejectedValue(new Error('loadImage: <raw internal stack>'));
    const result = await importDroppedFiles([png('broken.png')], { clientX: 500, clientY: 300 }, true);
    expect(result).toEqual({ imported: 0, failed: 1, unsupported: 0 });
    expect(canvas.add).not.toHaveBeenCalled();
    const message = vi.mocked(toast.error).mock.calls[0][0];
    expect(message).toContain('"broken.png"');
    expect(message).toContain('The file may be damaged or not a valid image.');
    expect(message).not.toContain('raw internal stack');
  });

  it('routes registry formats through their importer and names the file when it throws', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    const importer = vi.fn(async (file: File) => {
      if (file.name === 'bad.json') throw new Error('Unexpected token < in JSON');
    });
    vi.mocked(findFormatByExt).mockImplementation((ext) => (ext === 'json' ? ({ id: 'json', ext: 'json', mode: 'both', import: importer } as unknown as FormatHandler) : undefined));
    const good = new File(['{}'], 'good.json', { type: 'application/json' });
    const bad = new File(['{'], 'bad.json', { type: 'application/json' });
    const result = await importDroppedFiles([good, bad], { clientX: 10, clientY: 10 }, false);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(importer).toHaveBeenNthCalledWith(1, good);
    expect(importer).toHaveBeenNthCalledWith(2, bad);
    expect(result).toEqual({ imported: 1, failed: 1, unsupported: 0 });
    const message = vi.mocked(toast.warn).mock.calls[0][0];
    expect(message).toContain('"bad.json"');
    expect(message).not.toContain('Unexpected token');
    expect(toast.success).toHaveBeenCalledWith('1 / 2 files imported', { title: 'Import' });
  });

  it('does not count a file the user declined to import (importer resolves false)', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    // What projectFile.openJsonFile resolves when "replace the open design?" is answered with Cancel.
    const importer = vi.fn(async (_file: File): Promise<false> => false);
    vi.mocked(findFormatByExt).mockImplementation((ext) => (ext === 'json' ? ({ id: 'json', ext: 'json', mode: 'both', import: importer } as unknown as FormatHandler) : undefined));
    const result = await importDroppedFiles([new File(['{}'], 'job.vstudio.json', { type: 'application/json' })], { clientX: 10, clientY: 10 }, false);
    expect(result).toEqual({ imported: 0, failed: 0, unsupported: 0 });
    // Nothing happened, so nothing is claimed either: no tally, no warning.
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warn).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('opens a saved project before the other files of the same drop, so they land inside it', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    const order: string[] = [];
    const handler = (id: string): FormatHandler => ({ id, ext: id, mode: 'both', import: async (f: File) => { order.push(f.name); } } as unknown as FormatHandler);
    vi.mocked(findFormatByExt).mockImplementation((ext) => (ext === 'json' || ext === 'svg' ? handler(ext) : undefined));
    const logo = new File(['x'], 'a-logo.svg', { type: 'image/svg+xml' });
    const project = new File(['{}'], 'job.vstudio.json', { type: 'application/json' });
    const notes = new File(['x'], 'z-notes.svg', { type: 'image/svg+xml' });
    const result = await importDroppedFiles([logo, project, notes], { clientX: 10, clientY: 10 }, false);
    expect(order).toEqual(['job.vstudio.json', 'a-logo.svg', 'z-notes.svg']); // the rest keep their order
    expect(result.imported).toBe(3);
  });

  it('imports an image with no extension when its MIME type says raster', async () => {
    const canvas = fakeCanvas();
    vi.mocked(getCanvas).mockReturnValue(canvas as never);
    vi.mocked(findFormatByExt).mockReturnValue(undefined);
    const img = fakeImage(64, 64);
    vi.spyOn(fabric.FabricImage, 'fromURL').mockResolvedValue(img as never);
    const result = await importDroppedFiles([new File(['x'], 'image', { type: 'image/webp' })], { clientX: 500, clientY: 300 }, true);
    expect(result.imported).toBe(1);
    expect(toast.warn).not.toHaveBeenCalled();
  });
});
