import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PrintDialog } from '../PrintDialog';
import { useEditor } from '../../store/editor';

/**
 * Wiring tests for the Print Prep vendor surfaces (geometry itself is
 * covered by src/lib/__tests__/printPrep.test.ts):
 *
 *  - Registration mark style: segmented control defaults to Generic; a
 *    vendor style reveals arm/stroke inputs pre-filled with that style's
 *    defaults (Graphtec 20/0.7, Roland 25/0.5, Silhouette 10/0.25), which
 *    follow the style until hand-edited; the "Style default" chip restores
 *    them.
 *  - Scale check toggle adds a "Scale check" summary entry.
 *  - The operator note ("Print at 100% …") appears for any vendor style or
 *    the scale check, and never for plain generic prep.
 *  - The extended Sticker prep preset bundles silhouette marks + scale
 *    check, and only lights up when the whole bundle is in effect.
 *  - Plumbing: the summary reflects vendor style next to the registration
 *    marks entry, and PrintPreview grows its page (scale-check margin)
 *    exactly like printer.ts's prepMarkMarginMm.
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
    useEditor.setState({ showPrint: true, openPrintPrep: true });
    root.render(<PrintDialog />);
  });
  return container;
}

const styleGroup = (c: HTMLElement) => c.querySelector<HTMLElement>('div[aria-label="Registration mark style"]')!;

const styleButton = (c: HTMLElement, value: string) =>
  styleGroup(c).querySelector<HTMLButtonElement>(`button[data-value="${value}"]`)!;

const armInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[aria-label="Registration mark arm (mm)"]')!;

const strokeInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[aria-label="Registration mark stroke (mm)"]')!;

const scaleCheck = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLInputElement>('#print-prep-body input[type="checkbox"]'))
    .find(cb => cb.closest('label')?.textContent?.includes('Scale check'))!;

const regMarks = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLInputElement>('#print-prep-body input[type="checkbox"]'))
    .find(cb => cb.closest('label')?.textContent === 'Registration marks')!;

const summaryText = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('span')).find(s => s.textContent?.includes('Ready to print'))?.parentElement?.textContent ?? '';

const stickerChip = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('#print-prep-body button'))
    .find(b => b.textContent === 'Sticker')!;

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

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  useEditor.setState({ showPrint: false, openPrintPrep: false });
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  host.remove();
});

describe('PrintDialog registration mark style', () => {
  it('defaults to Generic with no extra inputs, note, or summary entries', () => {
    const c = mountDialog();
    expect(styleButton(c, 'generic').getAttribute('aria-pressed')).toBe('true');
    expect(armInput(c)).toBeNull();
    expect(c.querySelector('#print-prep-body [role="note"]')).toBeNull();
    expect(summaryText(c)).toContain('· None');
  });

  it('reveals arm/stroke inputs pre-filled per style, following style switches', () => {
    const c = mountDialog();
    click(styleButton(c, 'graphtec-arms'));
    expect(styleButton(c, 'graphtec-arms').getAttribute('aria-pressed')).toBe('true');
    expect(armInput(c).value).toBe('20');
    expect(strokeInput(c).value).toBe('0.7');
    expect(c.querySelector('#print-prep-body [role="note"]')!.textContent)
      .toBe('Print at 100% / Actual size. Measure the check block before cutting.');

    click(styleButton(c, 'roland'));
    expect(armInput(c).value).toBe('25');
    expect(strokeInput(c).value).toBe('0.5');

    click(styleButton(c, 'silhouette'));
    expect(armInput(c).value).toBe('10');
    expect(strokeInput(c).value).toBe('0.25');

    // Back to Generic drops the overrides again.
    click(styleButton(c, 'generic'));
    expect(armInput(c)).toBeNull();
    expect(c.querySelector('#print-prep-body [role="note"]')).toBeNull();
  });

  it('keeps hand-edited values across style switches; Style default restores', () => {
    const c = mountDialog();
    click(styleButton(c, 'graphtec-arms'));
    typeNumber(armInput(c), '15');
    click(styleButton(c, 'roland'));
    expect(armInput(c).value).toBe('15');

    const reset = Array.from(c.querySelectorAll<HTMLButtonElement>('#print-prep-body button'))
      .find(b => b.textContent === 'Style default')!;
    click(reset);
    expect(armInput(c).value).toBe('25');
    expect(strokeInput(c).value).toBe('0.5');
    // Defaults follow the style again after the reset.
    click(styleButton(c, 'silhouette'));
    expect(armInput(c).value).toBe('10');
  });

  it('names the vendor style in the summary next to the registration marks', () => {
    const c = mountDialog();
    click(regMarks(c));
    expect(summaryText(c)).toContain('Registration marks');
    expect(summaryText(c)).not.toContain('Graphtec ARMS');

    click(styleButton(c, 'graphtec-arms'));
    expect(summaryText(c)).toContain('Registration marks · Graphtec ARMS');
  });
});

describe('PrintDialog scale check', () => {
  it('toggles the summary entry, the note, and the preview page size', () => {
    const c = mountDialog();
    const preview = () => c.querySelector('svg[aria-label="Print preview"]')!.getAttribute('viewBox');
    expect(preview()).toBe('0 0 210 297'); // plain A4 page, no prep growth

    click(scaleCheck(c));
    expect(scaleCheck(c).checked).toBe(true);
    expect(summaryText(c)).toContain('Scale check');
    expect(c.querySelector('#print-prep-body [role="note"]')).toBeTruthy();
    // prepMarkMarginMm grows to 25 for the scale-check block (24 mm reach + 1).
    expect(preview()).toBe('0 0 260 347');

    click(scaleCheck(c));
    expect(summaryText(c)).not.toContain('Scale check');
    expect(preview()).toBe('0 0 210 297');
  });

  it('prints the 50 × 9 mm block hint under the toggle', () => {
    const c = mountDialog();
    expect(c.querySelector('#print-prep-body')!.textContent)
      .toContain('Prints a 50 × 9 mm block — measure it to verify 100% scale before cutting');
  });
});

describe('PrintDialog Sticker prep preset (extended bundle)', () => {
  it('bundles silhouette marks + scale check and only lights up as a whole', () => {
    const c = mountDialog();
    click(stickerChip(c));
    expect(stickerChip(c).getAttribute('aria-pressed')).toBe('true');
    expect(regMarks(c).checked).toBe(true);
    expect(styleButton(c, 'silhouette').getAttribute('aria-pressed')).toBe('true');
    expect(armInput(c).value).toBe('10'); // preset carries no overrides → style default
    expect(scaleCheck(c).checked).toBe(true);
    expect(summaryText(c)).toContain('Registration marks · Silhouette · Scale check');

    // Flip one bundled field off — the chip must unlight (whole-bundle match).
    click(scaleCheck(c));
    expect(stickerChip(c).getAttribute('aria-pressed')).toBe('false');
  });
});
