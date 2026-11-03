import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';

/**
 * Data-safety feedback — regression tests for the "protective feature fails
 * silently" class of bug. Each suite drives a real failure down one of the
 * formerly-empty catch paths and asserts the failure becomes visible:
 *
 *   1. autosave quota failure  → errorLog entry every tick + one toast.warn
 *      per session (never a toast storm), autosave keeps running.
 *   2. artboard persist failure → errorLog entry + one toast.warn per
 *      session; in-memory artboards keep working.
 *   3. cutContour union failure → console.warn + errorLog entry, raw offset
 *      ring still returned (behavior preserved).
 *   4. ai context capture failure → errorLog entries + a short note inside
 *      the outgoing request so the model knows a context was dropped.
 *   5. embed linked images → Detailed() variants separate embedded/failed so
 *      the menu can warn about CORS-tainted images instead of lumping them
 *      with "nothing to embed".
 *
 * The autosave/artboards/ai suites re-import their module graph fresh via
 * vi.resetModules() because those modules keep once-per-session toast
 * latches (and shared stores) as module state.
 */

type AutoSaveModule = typeof import('../autosave');
type ArtboardsModule = typeof import('../artboards');
type AiModule = typeof import('../ai');
type ErrorLogModule = typeof import('../errorLog');
type ToastModule = typeof import('../toast');
type EditorModule = typeof import('../../store/editor');
type CanvasEngineModule = typeof import('../canvasEngine');
type IoModule = typeof import('../io');

// File-wide: cutContour's polygon-clipping dependency throws on every union
// call so the offsetPolyline catch path can be exercised deterministically.
vi.mock('polygon-clipping', () => ({
  default: {
    union: vi.fn(() => {
      throw new Error('synthetic degenerate geometry');
    }),
  },
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ---------------------------------------------------------------------- */
/* 1. autosave                                                            */
/* ---------------------------------------------------------------------- */

describe('autosave persistence failure feedback', () => {
  function makeCanvasStub() {
    return {
      toJSON: () => ({ objects: [{ type: 'rect' }] }),
      on: vi.fn(),
      off: vi.fn(),
    };
  }

  it('toasts once and records every failure when the storage quota is exceeded', async () => {
    vi.resetModules();
    const canvasEngine: CanvasEngineModule = await import('../canvasEngine');
    const autosave: AutoSaveModule = await import('../autosave');
    const errorLog: ErrorLogModule = await import('../errorLog');
    const toastMod: ToastModule = await import('../toast');
    const warnSpy = vi.spyOn(toastMod.toast, 'warn').mockImplementation(() => 't1');

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvasStub() as never);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('mock quota exceeded', 'QuotaExceededError');
    });

    vi.useFakeTimers();
    try {
      autosave.startAutoSave(1000);
      vi.advanceTimersByTime(2100); // two autosave ticks, both failing

      expect(setItem).toHaveBeenCalledTimes(2);
      // Exactly one warn toast for the whole session — no per-tick storm.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('Autosave failed');
      // Every failing tick still lands in the error log (deduped to count 2).
      const entries = errorLog.getErrors().filter((e) => e.message.startsWith('autosave:'));
      expect(entries).toHaveLength(1);
      expect(entries[0].count).toBe(2);
      // Status feed reflects that nothing was saved.
      const s = autosave.getAutoSaveStatus();
      expect(s.lastSavedAt).toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('keeps the normal path silent and saves successfully when storage works', async () => {
    vi.resetModules();
    const canvasEngine: CanvasEngineModule = await import('../canvasEngine');
    const autosave: AutoSaveModule = await import('../autosave');
    const errorLog: ErrorLogModule = await import('../errorLog');
    const toastMod: ToastModule = await import('../toast');
    const warnSpy = vi.spyOn(toastMod.toast, 'warn').mockImplementation(() => 't1');

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvasStub() as never);

    vi.useFakeTimers();
    try {
      autosave.startAutoSave(1000);
      vi.advanceTimersByTime(1100);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorLog.getErrors()).toHaveLength(0);
      expect(autosave.getAutoSaveStatus().lastSavedAt).not.toBeNull();
      const raw = localStorage.getItem('vector.autosave');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).json).toEqual({ objects: [{ type: 'rect' }] });
    } finally {
      autosave.stopAutoSave();
    }
  });
});

/* ---------------------------------------------------------------------- */
/* 2. artboards persist                                                   */
/* ---------------------------------------------------------------------- */

describe('artboards persistence failure feedback', () => {
  it('toasts once and records the failure while keeping in-memory artboards working', async () => {
    vi.resetModules();
    const artboards: ArtboardsModule = await import('../artboards');
    const editor: EditorModule = await import('../../store/editor');
    const errorLog: ErrorLogModule = await import('../errorLog');
    const toastMod: ToastModule = await import('../toast');
    const warnSpy = vi.spyOn(toastMod.toast, 'warn').mockImplementation(() => 't1');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('mock quota exceeded', 'QuotaExceededError');
    });

    const before = editor.useEditor.getState().artboards.length;
    artboards.createArtboard('Persist Fail Board');
    expect(editor.useEditor.getState().artboards.length).toBe(before + 1);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Artboard');
    expect(errorLog.getErrors().some((e) => e.message.startsWith('artboards.persist:'))).toBe(true);

    // A second failing commit must not re-toast (session latch)…
    artboards.renameArtboard(artboards.getArtboards()[artboards.getArtboards().length - 1].id, 'Renamed');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // …but each failure is still recorded.
    const entries = errorLog.getErrors().filter((e) => e.message.startsWith('artboards.persist:'));
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(2);
  });

  it('stays silent when persistence works', async () => {
    vi.resetModules();
    const artboards: ArtboardsModule = await import('../artboards');
    const errorLog: ErrorLogModule = await import('../errorLog');
    const toastMod: ToastModule = await import('../toast');
    const warnSpy = vi.spyOn(toastMod.toast, 'warn').mockImplementation(() => 't1');

    artboards.createArtboard('Persist OK Board');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorLog.getErrors()).toHaveLength(0);
    expect(localStorage.getItem('vector.artboards')).toContain('Persist OK Board');
  });
});

/* ---------------------------------------------------------------------- */
/* 3. cutContour union fallback                                           */
/* ---------------------------------------------------------------------- */

describe('cutContour union failure feedback', () => {
  it('warns and records while still returning the raw offset ring', async () => {
    vi.resetModules();
    const { offsetPolyline } = await import('../cutContour');
    const errorLog: ErrorLogModule = await import('../errorLog');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const out = offsetPolyline(square, 10, true);

    // Behavior preserved: one raw ring (no crash, no empty result).
    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThan(3);
    // The degradation is now visible in both channels.
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0].join(' ')).toContain('polygon-clipping');
    expect(errorLog.getErrors().some((e) => e.message.startsWith('cutContour.offsetPolyline:'))).toBe(true);
  });
});

/* ---------------------------------------------------------------------- */
/* 4. ai context capture                                                  */
/* ---------------------------------------------------------------------- */

describe('ai context capture failure feedback', () => {
  function stubFetch(): ReturnType<typeof vi.fn> {
    return vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'model says hi' }] }),
    }));
  }

  interface RequestShape {
    messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
  }

  function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): RequestShape {
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    return JSON.parse(init.body) as RequestShape;
  }

  it('annotates the request and records when vision and SVG capture both fail', async () => {
    vi.resetModules();
    const ai: AiModule = await import('../ai');
    const io: IoModule = await import('../io');
    const errorLog: ErrorLogModule = await import('../errorLog');

    vi.spyOn(io, 'exportPNG').mockImplementation(() => {
      throw new Error('tainted canvas');
    });
    vi.spyOn(io, 'exportSVG').mockImplementation(() => {
      throw new Error('svg capture boom');
    });
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock as never);

    const result = await ai.chatWithClaude(
      [],
      'hello',
      { apiKey: 'k', model: 'm', baseUrl: 'https://api.test', enableVision: true },
      { includeImage: true, includeSVG: true },
    );

    expect(result.text).toBe('model says hi');
    const body = lastRequestBody(fetchMock);
    const lastContent = body.messages[body.messages.length - 1].content;
    const texts = lastContent.filter((b) => b.type === 'text').map((b) => b.text ?? '');
    // Both dropped contexts leave a trace in the outgoing request…
    expect(texts.some((t) => t.includes('canvas snapshot unavailable'))).toBe(true);
    expect(texts.some((t) => t.includes('SVG markup unavailable'))).toBe(true);
    // …and in the error log.
    expect(errorLog.getErrors().some((e) => e.message.startsWith('ai.vision:'))).toBe(true);
    expect(errorLog.getErrors().some((e) => e.message.startsWith('ai.svg:'))).toBe(true);
    // No image block made it out.
    expect(lastContent.some((b) => b.type === 'image')).toBe(false);
  });

  it('sends the real contexts and no notes when capture succeeds', async () => {
    vi.resetModules();
    const ai: AiModule = await import('../ai');
    const io: IoModule = await import('../io');
    const errorLog: ErrorLogModule = await import('../errorLog');

    vi.spyOn(io, 'exportPNG').mockReturnValue('data:image/png;base64,QUJD');
    vi.spyOn(io, 'exportSVG').mockReturnValue('<svg><rect/></svg>');
    const fetchMock = stubFetch();
    vi.stubGlobal('fetch', fetchMock as never);

    await ai.chatWithClaude(
      [],
      'hello',
      { apiKey: 'k', model: 'm', baseUrl: 'https://api.test', enableVision: true },
      { includeImage: true, includeSVG: true },
    );

    const body = lastRequestBody(fetchMock);
    const lastContent = body.messages[body.messages.length - 1].content;
    expect(lastContent.some((b) => b.type === 'image')).toBe(true);
    expect(lastContent.some((b) => b.type === 'text' && (b.text ?? '').includes('unavailable'))).toBe(false);
    expect(errorLog.getErrors()).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------- */
/* 5. embed linked images — detailed result                               */
/* ---------------------------------------------------------------------- */

import {
  embedLinkedImageObjects,
  embedLinkedImageObjectsDetailed,
  embedLinkedImageActiveArtboardObjects,
  embedLinkedImageActiveArtboardObjectsDetailed,
} from '../selectionOps';
import * as canvasEngine from '../canvasEngine';
import { useEditor } from '../../store/editor';

describe('embed linked images detailed result', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeImageObject = (extra: Record<string, unknown> = {}) => {
    const object = new fabric.Rect({ width: 10, height: 10 });
    Object.defineProperty(object, 'type', { value: 'image', configurable: true });
    return Object.assign(object, extra) as fabric.FabricObject & Record<string, unknown>;
  };

  it('separates embedded from failed (cross-origin / unserializable) images', () => {
    const embeddable = makeImageObject({
      _src: '/assets/photo.png',
      getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }),
    });
    const cors = makeImageObject({
      _src: 'https://cdn.test/cors.png',
      getElement: () => ({ toDataURL: () => 'not-a-data-url' }),
    });
    const missing = makeImageObject({
      _src: '/assets/missing.png',
      missing: true,
      getElement: () => ({ toDataURL: () => 'data:image/png;base64,MISSING' }),
    });
    const alreadyEmbedded = makeImageObject({ _src: 'data:image/png;base64,AAAA' });
    const canvas = {
      getObjects: () => [embeddable, cors, missing, alreadyEmbedded],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    const detailed = embedLinkedImageObjectsDetailed();
    expect(detailed).toEqual({ embedded: 1, failed: 1 });
    // Legacy wrapper keeps its number contract (CommandPalette call site).
    expect(embedLinkedImageObjects()).toBe(0); // nothing embeddable left
    expect(embeddable._src).toBe('data:image/png;base64,PHOTO');
    expect(embeddable.anchorworksOriginalLinkSource).toBe('/assets/photo.png');
    expect(cors._src).toBe('https://cdn.test/cors.png'); // untouched, but reported
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('reports both zero when there is nothing to embed', () => {
    const plain = new fabric.Rect({ width: 10, height: 10 });
    const canvas = {
      getObjects: () => [plain],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(embedLinkedImageObjectsDetailed()).toEqual({ embedded: 0, failed: 0 });
  });

  it('separates embedded from failed on the active artboard only', () => {
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const offBoardEmbeddable = makeImageObject({
      left: 10, top: 10, width: 20, height: 20,
      _src: '/off.png',
      getElement: () => ({ toDataURL: () => 'data:image/png;base64,OFF' }),
    });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbeddable = makeImageObject({
      left: 210, top: 10, width: 20, height: 20,
      _src: '/same.png',
      getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }),
    });
    const sameBoardCors = makeImageObject({
      left: 230, top: 10, width: 20, height: 20,
      _src: 'https://cdn.test/cors-same.png',
      getElement: () => ({ toDataURL: () => 'not-a-data-url' }),
    });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [offBoardEmbeddable, active, sameBoardEmbeddable, sameBoardCors],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(embedLinkedImageActiveArtboardObjectsDetailed()).toEqual({ embedded: 1, failed: 1 });
      expect(embedLinkedImageActiveArtboardObjects()).toBe(0); // consumed above
      expect(offBoardEmbeddable._src).toBe('/off.png');
      expect(sameBoardEmbeddable._src).toBe('data:image/png;base64,SAME');
      expect(sameBoardCors._src).toBe('https://cdn.test/cors-same.png');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });
});
