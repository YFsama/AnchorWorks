import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProductionPreviewDialog } from '../ProductionPreviewDialog';
import { useEditor, type CutPath } from '../../store/editor';
import { toast } from '../../lib/toast';
import type { ProductionPreviewResult } from '../../lib/productionPreview';

/**
 * Wiring tests for the Production Preview dialog (the composition itself is
 * covered by src/lib/__tests__/productionPreview.test.ts):
 *
 *  - Open-guard: no selection → warn toast + re-close (MakeSticker pattern).
 *  - Live preview: debounced build renders the sheet image + stats line;
 *    clicking a roll preset rebuilds with sheetHeightMm undefined.
 *  - Apply: inserts the sheet image at the document origin with scale
 *    1/multiplier, REPLACES the store's cut paths with the proposed ones,
 *    pushes exactly one history entry, toasts, and closes. With no existing
 *    cut paths it first hints that only registration marks will cut.
 *
 * Mounting follows the dialogMigrate conventions: real component on a fresh
 * root, store state driven through useEditor.setState. getCanvas/pushHistory
 * are module-mocked (canvasEngine), fabric.FabricImage.fromURL returns a
 * stub image, and buildProductionPreview is swapped for a fixed-result mock
 * (vi.mock of the lib, keeping the real SHEET_PRESETS constant).
 */

const { canvasStub, pushHistoryMock, buildPreviewMock, fromURLMock, imageStub, downloadDataURLMock, printImageMock } = vi.hoisted(() => ({
  canvasStub: {
    getActiveObjects: vi.fn<() => unknown[]>(() => []),
    add: vi.fn(),
    requestRenderAll: vi.fn(),
  },
  pushHistoryMock: vi.fn(),
  buildPreviewMock: vi.fn(),
  fromURLMock: vi.fn(),
  imageStub: { set: vi.fn(), setCoords: vi.fn() },
  downloadDataURLMock: vi.fn(),
  printImageMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  FabricImage: { fromURL: fromURLMock },
}));
vi.mock('../../lib/canvasEngine', () => ({
  getCanvas: () => canvasStub,
  pushHistory: pushHistoryMock,
}));
vi.mock('../../lib/io', () => ({
  downloadDataURL: downloadDataURLMock,
}));
vi.mock('../../lib/printer', () => ({
  printImageAtSize: printImageMock,
}));
vi.mock('../../lib/productionPreview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/productionPreview')>();
  return { ...actual, buildProductionPreview: buildPreviewMock };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXED_A: ProductionPreviewResult = {
  url: 'data:image/png;base64,fixed-a',
  pxPerMm: 11.3385, // 3 × 3.7795 (raster multiplier 3)
  sheetW: 210,
  sheetH: 297,
  placements: [{ x: 0, y: 0, rotation: 0, itemIndex: 0 }],
  items: [{ objectId: 'a', copies: 12 }],
  copies: 12,
  utilization: 0.78,
  cutPaths: [
    { id: 'outline-1-c0', points: [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]], closed: true, kind: 'outline' },
    { id: 'regmark-tl', points: [[3, 13], [3, 3], [13, 3]], closed: false, kind: 'regmark' },
  ],
  bleedUsed: true,
};

const FIXED_B: ProductionPreviewResult = {
  ...FIXED_A,
  url: 'data:image/png;base64,fixed-b',
  sheetW: 300,
  sheetH: 62,
  copies: 8,
  utilization: 0.51,
};

/** A non-regmark store cut path so the dialog skips the "only regmarks" hint. */
function outlineCutPath(): CutPath {
  return { id: 'outline-1', points: [[0, 0], [60, 0], [60, 40], [0, 40], [0, 0]], closed: true, kind: 'outline' };
}

let host: HTMLDivElement;
let roots: Root[];

function mountDialog(): HTMLDivElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    useEditor.setState({ showProductionPreview: true });
    root.render(<ProductionPreviewDialog />);
  });
  return container;
}

async function settlePreview(ms = 300): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

const applyButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Apply')!;

const statsLine = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('div')).find(d => d.textContent?.includes('material used'))?.textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  window.localStorage.clear();
  useEditor.setState({ cutPaths: [], cutPathsVisible: false, showProductionPreview: false });
  canvasStub.getActiveObjects.mockReset().mockReturnValue([{ id: 'a' }]);
  canvasStub.add.mockReset();
  canvasStub.requestRenderAll.mockReset();
  pushHistoryMock.mockReset();
  imageStub.set.mockClear();
  fromURLMock.mockReset().mockResolvedValue(imageStub);
  buildPreviewMock.mockReset().mockResolvedValue(FIXED_A);
  downloadDataURLMock.mockReset();
  printImageMock.mockReset().mockReturnValue(true);
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProductionPreviewDialog open-guard', () => {
  it('warns and re-closes with no selection', () => {
    canvasStub.getActiveObjects.mockReturnValue([]);
    const warnSpy = vi.spyOn(toast, 'warn');
    mountDialog();
    expect(warnSpy).toHaveBeenCalledWith('Select something first.', expect.anything());
    expect(useEditor.getState().showProductionPreview).toBe(false);
  });
});

describe('ProductionPreviewDialog live preview', () => {
  it('debounces a build, renders the sheet image + stats, and rebuilds on a roll preset', async () => {
    buildPreviewMock.mockResolvedValueOnce(FIXED_A).mockResolvedValueOnce(FIXED_B);
    const c = mountDialog();

    // No result yet (build debounce pending) → Apply stays disabled.
    expect(c.querySelector('img')).toBeNull();
    expect(applyButton(c).disabled).toBe(true);

    await settlePreview();
    // A4 default: fixed sheet, gap 2, bleed 1.6 ring, 50 copies, marks + lines.
    expect(buildPreviewMock).toHaveBeenCalledTimes(1);
    const [objects, cutPaths, opts] = buildPreviewMock.mock.calls[0] as unknown[];
    expect(objects).toEqual([{ id: 'a' }]);
    expect(cutPaths).toEqual([]);
    expect(opts).toMatchObject({ sheetWidthMm: 210, sheetHeightMm: 297, gapMm: 2, bleedMm: 1.6, bleedMode: 'ring', copies: 50, allowRotation: true, showCutLines: true, showMarks: true });

    expect(c.querySelector('img')?.getAttribute('src')).toBe(FIXED_A.url);
    expect(statsLine(c)).toContain('12 copies');
    expect(statsLine(c)).toContain('210×297 mm');
    expect(statsLine(c)).toContain('78% material used');
    expect(applyButton(c).disabled).toBe(false);

    // Roll 300 preset: rebuild with height undefined (auto) + new stats.
    const roll = Array.from(c.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('Roll 300 mm'))!;
    click(roll);
    await settlePreview();
    expect(buildPreviewMock).toHaveBeenCalledTimes(2);
    expect(buildPreviewMock.mock.calls[1][2]).toMatchObject({ sheetWidthMm: 300, sheetHeightMm: undefined });
    expect(c.querySelector('img')?.getAttribute('src')).toBe(FIXED_B.url);
    expect(statsLine(c)).toContain('8 copies');
    expect(statsLine(c)).toContain('300×62 mm');
  });

  it('shows the failure caption when the build returns null', async () => {
    buildPreviewMock.mockResolvedValue(null);
    const c = mountDialog();
    await settlePreview();
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toContain('Preview failed — try Ring bleed mode or a smaller sheet.');
    expect(applyButton(c).disabled).toBe(true);
  });
});

describe('ProductionPreviewDialog apply', () => {
  it('inserts the sheet at the document origin, replaces cut paths, pushes one history entry, closes', async () => {
    useEditor.setState({ cutPaths: [outlineCutPath()] });
    const c = mountDialog();
    await settlePreview();

    const successSpy = vi.spyOn(toast, 'success');
    await act(async () => {
      applyButton(c).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Sheet image: loaded from the preview PNG, placed at (0,0) with scale
    // 3.7795/pxPerMm = 1/3 (the raster multiplier), added to the canvas.
    expect(fromURLMock).toHaveBeenCalledWith(FIXED_A.url, { crossOrigin: null });
    expect(imageStub.set).toHaveBeenCalledTimes(1);
    const placed = imageStub.set.mock.calls[0][0] as { left: number; top: number; scaleX: number };
    expect(placed.left).toBe(0);
    expect(placed.top).toBe(0);
    expect(placed.scaleX).toBeCloseTo(1 / 3, 6);
    expect(canvasStub.add).toHaveBeenCalledWith(imageStub);
    expect(canvasStub.requestRenderAll).toHaveBeenCalled();

    // Cut paths REPLACED by the proposed layout; overlay turned on.
    expect(useEditor.getState().cutPaths).toBe(FIXED_A.cutPaths);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(pushHistoryMock).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith('Production layout applied', expect.anything());
    expect(useEditor.getState().showProductionPreview).toBe(false);
  });

  it('hints when the store had no cut paths (only registration marks will cut)', async () => {
    const c = mountDialog();
    await settlePreview();
    const infoSpy = vi.spyOn(toast, 'info');
    await act(async () => {
      applyButton(c).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(infoSpy).toHaveBeenCalledWith('No cut paths found — sheet cut carries only registration marks.', expect.anything());
    expect(useEditor.getState().cutPaths).toBe(FIXED_A.cutPaths);
  });
});

describe('ProductionPreviewDialog save/print', () => {
  const savePngButton = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Save PNG'))!;
  const printButton = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Print'))!;

  it('Save PNG downloads the composed sheet under a dated production-sheet name', async () => {
    const c = mountDialog();
    await settlePreview();
    click(savePngButton(c));
    expect(downloadDataURLMock).toHaveBeenCalledTimes(1);
    const [name, url] = downloadDataURLMock.mock.calls[0] as [string, string];
    expect(name).toMatch(/^production-sheet-\d{4}-\d{2}-\d{2}\.png$/);
    expect(url).toBe(FIXED_A.url);
  });

  it('Print sends the sheet at its exact size and toasts (warn when unavailable)', async () => {
    // First click: transport unavailable → warn. Second: sent → success.
    printImageMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const c = mountDialog();
    await settlePreview();
    const warnSpy = vi.spyOn(toast, 'warn');
    const successSpy = vi.spyOn(toast, 'success');

    click(printButton(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(printImageMock).toHaveBeenCalledWith(FIXED_A.url, FIXED_A.sheetW, FIXED_A.sheetH);
    expect(warnSpy).toHaveBeenCalledWith('Printing is unavailable in this environment.', expect.anything());

    click(printButton(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(printImageMock).toHaveBeenCalledTimes(2);
    expect(successSpy).toHaveBeenCalledWith('Sheet sent to the printer — print at 100% / Actual size.', expect.anything());
  });

  it('keeps Save PNG and Print disabled while there is no result', async () => {
    buildPreviewMock.mockResolvedValue(null);
    const c = mountDialog();
    // Pre-settle (build pending) and post-settle (build failed) both lock them.
    expect(savePngButton(c).disabled).toBe(true);
    expect(printButton(c).disabled).toBe(true);
    await settlePreview();
    expect(savePngButton(c).disabled).toBe(true);
    expect(printButton(c).disabled).toBe(true);
  });
});
