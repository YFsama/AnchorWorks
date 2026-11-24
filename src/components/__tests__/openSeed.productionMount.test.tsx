import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Suspense, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RecolorDialog } from '../RecolorDialog';
import { VariableDataDialog } from '../VariableDataDialog';
import { DocSettingsDialog } from '../DocSettingsDialog';
import { PlotterDialog } from '../PlotterDialog';
import { useEditor } from '../../store/editor';
import { getSharedPlotterLink } from '../../lib/plotterLink';
import { estimateVariableDataGaps } from '../../lib/variableData';
import { PAPER_PRESETS, matchPreset, presetToPx } from '../../lib/paperSizes';

/**
 * Open-time seeding under the PRODUCTION mount condition.
 *
 * App.tsx mounts its dialogs conditionally — `{showX && <Suspense><XDialog
 * /></Suspense>}` — so every open is a fresh mount with the store flag
 * already true. The codebase's "re-seed on open transition" idiom (the
 * prevOpen reconciliation performed during render) never fires in that case:
 * on a first mount `open === prevOpen`. A dialog whose ONLY seed lives in
 * that block therefore opens unseeded, and no test that mounts the component
 * first and flips the flag afterwards can see it. These tests mount each
 * dialog exactly like App.tsx does — flag set BEFORE the first render — so
 * the class of bug fails here the way it fails for users.
 *
 * What it had let through (all present in the released 0.18.0):
 *  - Recolor Artwork opened with zero colours — "No solid colors in the
 *    selection to recolor", Reset/Apply disabled — for EVERY selection.
 *  - Variable Data never estimated its grid gaps from the selected text.
 *  - Document Settings always opened on Custom / Portrait.
 */

const { collectMock, recolorMock, canvasStub } = vi.hoisted(() => ({
  collectMock: vi.fn<() => string[]>(() => []),
  recolorMock: vi.fn<() => number>(() => 0),
  canvasStub: {
    getActiveObjects: vi.fn<() => unknown[]>(() => []),
    getObjects: vi.fn<() => unknown[]>(() => []),
    add: vi.fn(),
    requestRenderAll: vi.fn(),
  },
}));

vi.mock('../../lib/selectionApply', () => ({
  collectSelectionColors: collectMock,
  recolorSelection: recolorMock,
}));
vi.mock('../../lib/canvasEngine', () => ({
  getCanvas: () => canvasStub,
  pushHistory: vi.fn(),
  resizeCanvas: vi.fn(),
  setBackground: vi.fn(),
  zoomFit: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type StoreState = ReturnType<typeof useEditor.getState>;
const DEFAULT_DOC = { ...useEditor.getState().doc };

let host: HTMLDivElement;
let roots: Root[];

/** Mount exactly the way App.tsx does: the store flag flips before the
 *  component's first render, inside a Suspense boundary. */
function mountLikeApp(ui: ReactElement, store: Partial<StoreState>): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    useEditor.setState(store);
    root.render(<Suspense fallback={null}>{ui}</Suspense>);
  });
  return container;
}

function unmountAll(): void {
  for (const root of roots) act(() => root.unmount());
  roots = [];
}

const recolorButton = (c: HTMLElement, name: string) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('[aria-label="Recolor Artwork actions"] button'))
    .find((b) => b.textContent?.trim() === name)!;

const recolorRows = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLInputElement>('input[type="color"]'));

/** The number input of the "Gap X (mm)" / "Gap Y (mm)" field. */
function gapInput(c: HTMLElement, axis: 'X' | 'Y'): HTMLInputElement {
  const label = Array.from(c.querySelectorAll('label'))
    .find((l) => l.querySelector('.field-label')?.textContent?.trim().startsWith(`Gap ${axis}`));
  return label!.querySelector<HTMLInputElement>('input[type="number"]')!;
}

const selectedPlotterTab = (c: HTMLElement) =>
  c.querySelector('[role="tab"][aria-selected="true"]')?.id.replace('plotter-tab-', '');

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
});

afterEach(() => {
  unmountAll();
  host.remove();
  collectMock.mockReset();
  collectMock.mockReturnValue([]);
  canvasStub.getActiveObjects.mockReset();
  canvasStub.getActiveObjects.mockReturnValue([]);
  act(() => {
    useEditor.setState({
      showRecolor: false, showVariableData: false, showDocSettings: false, showPlotter: false,
      doc: { ...DEFAULT_DOC },
    });
  });
});

describe('open-time seeding under the production (conditional) mount', () => {
  describe('Recolor Artwork', () => {
    it('harvests the selection colours and enables Reset / Apply', () => {
      collectMock.mockReturnValue(['#ff3d3d', '#3dff7a']);
      const c = mountLikeApp(<RecolorDialog />, { showRecolor: true });

      expect(collectMock).toHaveBeenCalledTimes(1);
      const rows = recolorRows(c);
      expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Recolor #ff3d3d', 'Recolor #3dff7a']);
      // Each target starts mapped to its own source.
      expect(rows.map((r) => r.value)).toEqual(['#ff3d3d', '#3dff7a']);
      expect(recolorButton(c, 'Reset').disabled).toBe(false);
      expect(recolorButton(c, 'Apply').disabled).toBe(false);
      expect(c.textContent).not.toContain('No solid colors in the selection');
    });

    it('still shows the empty state when the selection has no solid colours', () => {
      collectMock.mockReturnValue([]);
      const c = mountLikeApp(<RecolorDialog />, { showRecolor: true });

      expect(recolorRows(c)).toHaveLength(0);
      expect(c.textContent).toContain('No solid colors in the selection to recolor.');
      expect(recolorButton(c, 'Reset').disabled).toBe(true);
      expect(recolorButton(c, 'Apply').disabled).toBe(true);
    });
  });

  describe('Variable Data', () => {
    it('seeds the grid gaps from the selected text object', () => {
      canvasStub.getActiveObjects.mockReturnValue([
        { type: 'i-text', getBoundingRect: () => ({ width: 600, height: 100 }) },
      ]);
      const expected = estimateVariableDataGaps(600, 100);
      // The assertion below is only meaningful when the estimate moves the
      // fields off their hard-coded fallback.
      expect([expected.gapX, expected.gapY]).not.toEqual([40, 20]);

      const c = mountLikeApp(<VariableDataDialog />, { showVariableData: true });

      expect(gapInput(c, 'X').value).toBe(String(expected.gapX));
      expect(gapInput(c, 'Y').value).toBe(String(expected.gapY));
    });

    it('falls back to the default gaps without a selected text object', () => {
      const c = mountLikeApp(<VariableDataDialog />, { showVariableData: true });

      expect(gapInput(c, 'X').value).toBe('40');
      expect(gapInput(c, 'Y').value).toBe('20');
    });
  });

  describe('Document Settings', () => {
    it('reverse-matches the document into a preset and the landscape orientation', () => {
      const preset = PAPER_PRESETS[0];
      const px = presetToPx(preset, DEFAULT_DOC.dpi, true);
      // Precondition: this document really is that preset, landscape.
      expect(matchPreset(px.width, px.height, DEFAULT_DOC.dpi)).toEqual({ id: preset.id, landscape: true });

      const c = mountLikeApp(<DocSettingsDialog />, {
        showDocSettings: true,
        doc: { ...DEFAULT_DOC, width: px.width, height: px.height },
      });

      expect(c.querySelector<HTMLSelectElement>('select')?.value).toBe(preset.id);
      expect(c.querySelector('[data-value="landscape"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(c.querySelector('[data-value="portrait"]')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('opens a non-preset landscape document on Custom + Landscape', () => {
      const c = mountLikeApp(<DocSettingsDialog />, {
        showDocSettings: true,
        doc: { ...DEFAULT_DOC, width: 1000, height: 700 },
      });

      expect(c.querySelector<HTMLSelectElement>('select')?.value).toBe('custom');
      expect(c.querySelector('[data-value="landscape"]')?.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('Plotter', () => {
    it('lands on Machine while nothing is linked and on Output once connected', () => {
      const link = getSharedPlotterLink();
      const realStatus = link.status;
      try {
        link.status = 'connected';
        const connected = mountLikeApp(<PlotterDialog />, { showPlotter: true });
        expect(selectedPlotterTab(connected)).toBe('output');
      } finally {
        link.status = realStatus;
      }

      unmountAll();
      const idle = mountLikeApp(<PlotterDialog />, { showPlotter: true });
      expect(selectedPlotterTab(idle)).toBe('machine');
    });
  });
});
