import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlotterDialog } from '../PlotterDialog';
import { useEditor, type CutPath } from '../../store/editor';
import { toast } from '../../lib/toast';

/**
 * Wiring tests for the plotter dialog's drag-knife / ARMS surfaces (the lib
 * behaviour itself is covered by src/lib/__tests__/plotter.test.ts):
 *
 *  - Blade offset: preset chips + numeric input flow into the "Ready to
 *    output" summary as "blade offset X mm" only when > 0.
 *  - ARMS: the section stays visible on non-Graphtec dialects but disabled
 *    (with the reason as a hint); enabling it under the Graphtec dialect
 *    reveals arm / mark-type / rect controls with the 20 / type-2 / 200x150
 *    defaults, lights "ARMS 4-mark" in the summary, and Auto fills the
 *    expected rectangle from the cut-path bounding box (mm).
 *  - Dialect mismatch: ARMS armed + dialect switched away makes the code
 *    preview build throw — the dialog catches it and toasts the exact
 *    generateHPGL message instead of crashing.
 *  - Material presets: the new fields surface in the card hint ("60° blade",
 *    "2 passes") and defaultOvercutMm lands in the overcut input.
 *
 * Mounting follows the dialogMigrate conventions: real component on a fresh
 * root, store state driven through useEditor.setState.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let roots: Root[];

function mountDialog(): HTMLDivElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    useEditor.setState({ showPlotter: true });
    root.render(<PlotterDialog />);
  });
  return container;
}

const armsCheckbox = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    .find(cb => cb.closest('label')?.textContent?.includes('ARMS registration'))!;

const dialectButton = (c: HTMLElement, value: string) =>
  c.querySelector<HTMLButtonElement>(`div[aria-label="Cutter dialect"] button[data-value="${value}"]`)!;

const bladeOffsetGroup = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('div[aria-label="Blade offset presets"]')!;

const summaryText = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('span')).find(s => s.textContent?.includes('Ready to output'))?.parentElement?.textContent ?? '';

const inputByAriaLabel = (c: HTMLElement, label: string) =>
  c.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function typeNumber(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** A 100 × 60 mm rectangle cut path (CutPath coords are mm). */
function rectCutPath(): CutPath {
  return {
    id: 'test-rect',
    points: [[10, 10], [110, 10], [110, 70], [10, 70], [10, 10]],
    closed: true,
    kind: 'outline',
  };
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  window.localStorage.clear();
  useEditor.setState({ cutPaths: [], showPlotter: false });
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});

describe('PlotterDialog blade offset', () => {
  it('preset chips flow into the options state and the summary (only when > 0)', () => {
    const c = mountDialog();
    expect(summaryText(c)).not.toContain('blade offset');

    click(bladeOffsetGroup(c).querySelector('button[data-value="0.25"]')!);
    expect(summaryText(c)).toContain('blade offset 0.25 mm');
    expect(bladeOffsetGroup(c).querySelector('button[data-value="0.25"]')!.getAttribute('aria-pressed')).toBe('true');

    // Back to 0 — the summary entry disappears again.
    click(bladeOffsetGroup(c).querySelector('button[data-value="0"]')!);
    expect(summaryText(c)).not.toContain('blade offset');
  });

  it('the numeric input carries the drag-knife hint and clamps into 0–5', () => {
    const c = mountDialog();
    const input = c.querySelector<HTMLInputElement>('input[title="Drag-knife swivel compensation — 0.25 mm typical for a 45° blade"]')!;
    expect(input).toBeTruthy();
    expect(input.value).toBe('0');
    typeNumber(input, '9');
    expect(input.value).toBe('5');
  });
});

describe('PlotterDialog ARMS section', () => {
  it('is visible but disabled with the reason on non-Graphtec dialects', () => {
    const c = mountDialog();
    // Default dialect is 'bare'.
    expect(c.textContent).toContain('ARMS registration (print & cut)');
    expect(c.textContent).toContain('ARMS registration marks require the Graphtec dialect.');
    expect(armsCheckbox(c).disabled).toBe(true);
    expect(c.querySelector('input[aria-label="ARMS arm length (mm)"]')).toBeNull();
  });

  it('enables under the Graphtec dialect, shows defaults and the summary entry', () => {
    const c = mountDialog();
    click(dialectButton(c, 'graphtec-fc'));
    expect(armsCheckbox(c).disabled).toBe(false);
    expect(c.textContent).not.toContain('ARMS registration marks require the Graphtec dialect.');

    click(armsCheckbox(c));
    expect(armsCheckbox(c).checked).toBe(true);
    expect(summaryText(c)).toContain('ARMS 4-mark');

    // Defaults: 20 mm arms, type-2 square marks, 200 × 150 rect.
    expect(inputByAriaLabel(c, 'ARMS arm length (mm)').value).toBe('20');
    expect(inputByAriaLabel(c, 'ARMS rectangle width (mm)').value).toBe('200');
    expect(inputByAriaLabel(c, 'ARMS rectangle height (mm)').value).toBe('150');
    const typeGroup = c.querySelector<HTMLElement>('span[aria-label="ARMS mark type"]')!;
    expect(typeGroup.textContent).toContain('2 (square)');
    const square = Array.from(typeGroup.querySelectorAll('button')).find(b => b.textContent === '2 (square)')!;
    expect(square.getAttribute('aria-pressed')).toBe('true');

    // Toggling off removes the block (controls + summary entry).
    click(armsCheckbox(c));
    expect(c.querySelector('input[aria-label="ARMS arm length (mm)"]')).toBeNull();
    expect(summaryText(c)).not.toContain('ARMS 4-mark');
  });

  it('Auto fills the expected rectangle from the cut-path bounding box (mm)', () => {
    useEditor.setState({ cutPaths: [rectCutPath()] });
    const c = mountDialog();
    click(dialectButton(c, 'graphtec-fc'));
    click(armsCheckbox(c));

    const auto = Array.from(c.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent === 'Auto')!;
    click(auto);
    expect(inputByAriaLabel(c, 'ARMS rectangle width (mm)').value).toBe('100');
    expect(inputByAriaLabel(c, 'ARMS rectangle height (mm)').value).toBe('60');
  });

  it('strips stale-enabled ARMS when the dialect can no longer emit it (preview builds, no TB block, no toast)', () => {
    // Cut paths route buildPlotterOutput through the cut-path branch — the
    // canvas-SVG fallback needs DOMMatrix, which jsdom lacks.
    useEditor.setState({ cutPaths: [rectCutPath()] });
    const errorSpy = vi.spyOn(toast, 'error');
    const c = mountDialog();
    click(dialectButton(c, 'graphtec-fc'));
    click(armsCheckbox(c));
    // Stale-enabled ARMS: switch the dialect away, then build the preview.
    // effectiveOpts strips the block (the toggle is disabled under 'bare'),
    // so the job builds without the ARMS handshake instead of throwing.
    click(dialectButton(c, 'bare'));
    click(c.querySelector('#plotter-preview-tab-code')!);
    expect(errorSpy).not.toHaveBeenCalled();
    const code = c.querySelector('#plotter-code-view')?.textContent
      ?? c.textContent ?? '';
    expect(code).not.toContain('TB99');
    expect(code).toContain('PU');
  });
});

describe('PlotterDialog material preset new fields', () => {
  it('shows blade angle / passes in the card hint and applies defaultOvercutMm', () => {
    const c = mountDialog();
    const glitter = c.querySelector<HTMLButtonElement>('#plotter-material-glitter-htv')!;
    expect(glitter.textContent).toContain('60° blade');
    expect(glitter.textContent).toContain('2 passes');
    click(glitter);
    const overcut = c.querySelector<HTMLInputElement>('input[title="Extend closed cuts slightly past the start so corners fully release."]')!;
    expect(overcut.value).toBe('0.5');
  });
});
