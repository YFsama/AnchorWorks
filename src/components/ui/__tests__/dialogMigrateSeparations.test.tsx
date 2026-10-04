import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEditor } from '../../../store/editor';
import { t } from '../../../lib/i18n';
import { collectDocumentColors, exportPlates, type PlateInfo } from '../../../lib/separations';
import { SeparationsDialog } from '../../SeparationsDialog';

/**
 * Migration freeze for SeparationsDialog (implementer P): the dialog's three
 * review regions move onto the shared dialog kit —
 *
 *   plate listbox  → makeRovingKeys({ axis: 'vertical', guardEmpty }) driving
 *                    the EXISTING role="listbox"/option rows (PresetRow has no
 *                    option semantics, so the rich rows stay verbatim — only
 *                    the keydown handler is swapped);
 *   format toolbar → makeRovingKeys({ wrap, defer, onNavigate }) inside an
 *                    ActionToolbar (dynamic fallback = format.toUpperCase());
 *   action footer  → makeRovingKeys({ reviewKey, fallbackToText }) inside a
 *                    ReviewedFooter.
 *
 * Freeze-then-change discipline: every frozen string below was captured from
 * the LEGACY dialog before the migration and must serialize byte-identically
 * after it. The keyboard snapshots (key → focus → review → side effect,
 * including the format region's rAF-deferred commit) likewise ran green
 * against the legacy handlers first.
 */

vi.mock('../../../lib/canvasEngine', () => ({ getCanvas: () => null }));
vi.mock('../../../lib/separations', () => ({
  collectDocumentColors: vi.fn(() => []),
  isolatePlate: vi.fn(() => ({ plateKey: null, restore: () => undefined })),
  restorePlateIsolation: vi.fn(),
  exportPlates: vi.fn(() => []),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PLATES: PlateInfo[] = [
  { key: 'spot:pantone 185 c', kind: 'spot', name: 'PANTONE 185 C', hex: '#ff2e9a', objects: 3, exportable: true },
  { key: 'process:#000000', kind: 'process', name: '#000000', hex: '#000000', objects: 7, exportable: true },
  { key: 'special:gradient', kind: 'gradient', name: 'Gradients & patterns', hex: '#9ca3af', objects: 2, exportable: false },
];

const kindLabel = (kind: PlateInfo['kind']): string =>
  kind === 'spot' ? t('Spot') : kind === 'process' ? t('Process') : t('Gradient');

/** Mirrors the dialog's row-level review template byte-for-byte. */
const plateReview = (plate: PlateInfo): string =>
  `${plate.name} · ${kindLabel(plate.kind)} · ${plate.objects} ${t('objects')}`;

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  act(() => useEditor.setState({ showSeparations: false }));
  vi.mocked(collectDocumentColors).mockReturnValue(PLATES);
  vi.mocked(exportPlates).mockClear();
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  act(() => useEditor.setState({ showSeparations: false }));
});

/** Render the dialog with the store flag already open, then flush the 0ms plate scan. */
async function openDialog(): Promise<HTMLElement> {
  act(() => useEditor.setState({ showSeparations: true }));
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<SeparationsDialog />));
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  const overlay = container.firstElementChild as HTMLElement | null;
  expect(overlay, 'dialog overlay rendered').toBeTruthy();
  return overlay!;
}

const plateRegion = (overlay: HTMLElement) =>
  overlay.querySelector<HTMLElement>('[aria-describedby="separations-plate-review-status"]')!;
const formatRegion = (overlay: HTMLElement) =>
  overlay.querySelector<HTMLElement>('[aria-describedby="separations-format-review-status"]')!;
const footerRegion = (overlay: HTMLElement) =>
  overlay.querySelector<HTMLElement>('[aria-describedby="separations-action-review-status"]')!;

const plateRows = (overlay: HTMLElement) =>
  Array.from(plateRegion(overlay).querySelectorAll<HTMLButtonElement>('[data-separations-plate-action]'));
const formatOptions = (overlay: HTMLElement) =>
  Array.from(formatRegion(overlay).querySelectorAll<HTMLButtonElement>('[data-separations-format-action]'));
const footerButtons = (overlay: HTMLElement) =>
  Array.from(footerRegion(overlay).querySelectorAll<HTMLButtonElement>('[data-separations-action]'));

const reviewText = (statusId: string) =>
  document.getElementById(statusId)!.textContent;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function pressRaw(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Dispatch a keydown inside act so synchronous handler state updates flush. */
function press(target: HTMLElement, key: string): KeyboardEvent {
  let event!: KeyboardEvent;
  act(() => { event = pressRaw(target, key); });
  return event;
}

// ---- frozen DOM (captured from the legacy dialog) --------------------------------

const FROZEN_PLATE_INITIAL_HTML =
  '<div class="max-h-[260px] overflow-y-auto rounded border border-border" role="listbox" aria-label="Separations plates" aria-describedby="separations-plate-review-status" title="Use arrow keys to review separations plates">'
  + '<div id="separations-plate-review-status" class="sr-only" aria-live="polite">Reviewing Separations plates'
  + '</div>'
  + '<button type="button" role="option" aria-selected="false" aria-pressed="false" data-separations-plate-action="true" data-review="PANTONE 185 C · Spot · 3 objects" class="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors hover:bg-panel3 " title="PANTONE 185 C · Spot · 3 objects">'
  + '<span class="w-4 h-4 rounded-sm border border-border shrink-0" style="background-color: rgb(255, 46, 154);" aria-hidden="true">'
  + '</span>'
  + '<span class="flex-1 min-w-0 truncate text-[11px] text-ink">PANTONE 185 C'
  + '</span>'
  + '<span class="px-1 rounded-sm border text-[9px] shrink-0 border-[#ff2e9a] text-[#ff2e9a]">Spot'
  + '</span>'
  + '<span class="text-[10px] text-muted tabular-nums shrink-0">3'
  + '</span>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off text-muted shrink-0" aria-hidden="true">'
  + '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49">'
  + '</path>'
  + '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242">'
  + '</path>'
  + '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143">'
  + '</path>'
  + '<path d="m2 2 20 20">'
  + '</path>'
  + '</svg>'
  + '<span class="sr-only">Toggle plate preview'
  + '</span>'
  + '</button>'
  + '<button type="button" role="option" aria-selected="false" aria-pressed="false" data-separations-plate-action="true" data-review="#000000 · Process · 7 objects" class="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors hover:bg-panel3 " title="#000000 · Process · 7 objects">'
  + '<span class="w-4 h-4 rounded-sm border border-border shrink-0" style="background-color: rgb(0, 0, 0);" aria-hidden="true">'
  + '</span>'
  + '<span class="flex-1 min-w-0 truncate text-[11px] text-ink">#000000'
  + '</span>'
  + '<span class="px-1 rounded-sm border text-[9px] shrink-0 border-border text-muted">Process'
  + '</span>'
  + '<span class="text-[10px] text-muted tabular-nums shrink-0">7'
  + '</span>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off text-muted shrink-0" aria-hidden="true">'
  + '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49">'
  + '</path>'
  + '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242">'
  + '</path>'
  + '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143">'
  + '</path>'
  + '<path d="m2 2 20 20">'
  + '</path>'
  + '</svg>'
  + '<span class="sr-only">Toggle plate preview'
  + '</span>'
  + '</button>'
  + '<button type="button" role="option" aria-selected="false" aria-pressed="false" data-separations-plate-action="true" data-review="Gradients &amp; patterns · Gradient · 2 objects" class="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors hover:bg-panel3 " title="Gradients &amp; patterns · Gradient · 2 objects">'
  + '<span class="w-4 h-4 rounded-sm border border-border shrink-0" style="background-color: rgb(156, 163, 175);" aria-hidden="true">'
  + '</span>'
  + '<span class="flex-1 min-w-0 truncate text-[11px] text-ink">Gradients &amp; patterns'
  + '</span>'
  + '<span class="px-1 rounded-sm border text-[9px] shrink-0 border-border text-muted">Gradient'
  + '</span>'
  + '<span class="text-[10px] text-muted tabular-nums shrink-0">2'
  + '</span>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off text-muted shrink-0" aria-hidden="true">'
  + '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49">'
  + '</path>'
  + '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242">'
  + '</path>'
  + '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143">'
  + '</path>'
  + '<path d="m2 2 20 20">'
  + '</path>'
  + '</svg>'
  + '<span class="sr-only">Toggle plate preview'
  + '</span>'
  + '</button>'
  + '</div>';

const FROZEN_PLATE_SELECTED_HTML =
  '<div class="max-h-[260px] overflow-y-auto rounded border border-border" role="listbox" aria-label="Separations plates" aria-describedby="separations-plate-review-status" title="Use arrow keys to review separations plates">'
  + '<div id="separations-plate-review-status" class="sr-only" aria-live="polite">Reviewing Separations plates'
  + '</div>'
  + '<button type="button" role="option" aria-selected="true" aria-pressed="true" data-separations-plate-action="true" data-review="PANTONE 185 C · Spot · 3 objects" class="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors bg-accent2/10 outline outline-1 outline-accent2" title="PANTONE 185 C · Spot · 3 objects">'
  + '<span class="w-4 h-4 rounded-sm border border-border shrink-0" style="background-color: rgb(255, 46, 154);" aria-hidden="true">'
  + '</span>'
  + '<span class="flex-1 min-w-0 truncate text-[11px] text-ink">PANTONE 185 C'
  + '</span>'
  + '<span class="px-1 rounded-sm border text-[9px] shrink-0 border-[#ff2e9a] text-[#ff2e9a]">Spot'
  + '</span>'
  + '<span class="text-[10px] text-muted tabular-nums shrink-0">3'
  + '</span>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye text-accent2 shrink-0" aria-hidden="true">'
  + '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0">'
  + '</path>'
  + '<circle cx="12" cy="12" r="3">'
  + '</circle>'
  + '</svg>'
  + '<span class="sr-only">Toggle plate preview'
  + '</span>'
  + '</button>'
  + '<button type="button" role="option" aria-selected="false" aria-pressed="false" data-separations-plate-action="true" data-review="#000000 · Process · 7 objects" class="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors hover:bg-panel3 " title="#000000 · Process · 7 objects">'
  + '<span class="w-4 h-4 rounded-sm border border-border shrink-0" style="background-color: rgb(0, 0, 0);" aria-hidden="true">'
  + '</span>'
  + '<span class="flex-1 min-w-0 truncate text-[11px] text-ink">#000000'
  + '</span>'
  + '<span class="px-1 rounded-sm border text-[9px] shrink-0 border-border text-muted">Process'
  + '</span>'
  + '<span class="text-[10px] text-muted tabular-nums shrink-0">7'
  + '</span>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off text-muted shrink-0" aria-hidden="true">'
  + '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49">'
  + '</path>'
  + '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242">'
  + '</path>'
  + '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143">'
  + '</path>'
  + '<path d="m2 2 20 20">'
  + '</path>'
  + '</svg>'
  + '<span class="sr-only">Toggle plate preview'
  + '</span>'
  + '</button>'
  + '<button type="button" role="option" aria-selected="false" aria-pressed="false" data-separations-plate-action="true" data-review="Gradients &amp; patterns · Gradient · 2 objects" class="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-border last:border-b-0 transition-colors hover:bg-panel3 " title="Gradients &amp; patterns · Gradient · 2 objects">'
  + '<span class="w-4 h-4 rounded-sm border border-border shrink-0" style="background-color: rgb(156, 163, 175);" aria-hidden="true">'
  + '</span>'
  + '<span class="flex-1 min-w-0 truncate text-[11px] text-ink">Gradients &amp; patterns'
  + '</span>'
  + '<span class="px-1 rounded-sm border text-[9px] shrink-0 border-border text-muted">Gradient'
  + '</span>'
  + '<span class="text-[10px] text-muted tabular-nums shrink-0">2'
  + '</span>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off text-muted shrink-0" aria-hidden="true">'
  + '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49">'
  + '</path>'
  + '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242">'
  + '</path>'
  + '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143">'
  + '</path>'
  + '<path d="m2 2 20 20">'
  + '</path>'
  + '</svg>'
  + '<span class="sr-only">Toggle plate preview'
  + '</span>'
  + '</button>'
  + '</div>';

const FROZEN_FORMAT_SVG_HTML =
  '<div class="flex gap-1" role="toolbar" aria-label="Separations export format" aria-describedby="separations-format-review-status" title="Use arrow keys to review export formats">'
  + '<div id="separations-format-review-status" class="sr-only" aria-live="polite">Reviewing SVG'
  + '</div>'
  + '<button type="button" data-separations-format-action="true" data-format="svg" data-review="SVG" aria-pressed="true" class="flex-1 px-2 py-0.5 rounded-sm border text-[10px] transition-colors border-[#ff2e9a] text-ink bg-[#ff2e9a]/10">SVG'
  + '</button>'
  + '<button type="button" data-separations-format-action="true" data-format="png" data-review="PNG" aria-pressed="false" class="flex-1 px-2 py-0.5 rounded-sm border text-[10px] transition-colors border-border text-muted hover:text-ink">PNG'
  + '</button>'
  + '</div>';

const FROZEN_FORMAT_PNG_HTML =
  '<div class="flex gap-1" role="toolbar" aria-label="Separations export format" aria-describedby="separations-format-review-status" title="Use arrow keys to review export formats">'
  + '<div id="separations-format-review-status" class="sr-only" aria-live="polite">Reviewing PNG'
  + '</div>'
  + '<button type="button" data-separations-format-action="true" data-format="svg" data-review="SVG" aria-pressed="false" class="flex-1 px-2 py-0.5 rounded-sm border text-[10px] transition-colors border-border text-muted hover:text-ink">SVG'
  + '</button>'
  + '<button type="button" data-separations-format-action="true" data-format="png" data-review="PNG" aria-pressed="true" class="flex-1 px-2 py-0.5 rounded-sm border text-[10px] transition-colors border-[#ff2e9a] text-ink bg-[#ff2e9a]/10">PNG'
  + '</button>'
  + '</div>';

const FROZEN_FOOTER_HTML =
  '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="Separations actions" aria-describedby="separations-action-review-status" title="Use arrow keys to review dialog actions">'
  + '<span id="separations-action-review-status" class="sr-only" aria-live="polite">Reviewing Separations actions'
  + '</span>'
  + '<button type="button" data-separations-action="true" data-separations-action-review="Close" class="btn">Close'
  + '</button>'
  + '<button type="button" data-separations-action="true" data-separations-action-review="Export Plate" class="btn">Export Plate'
  + '</button>'
  + '<button type="button" data-separations-action="true" data-separations-action-review="Export All Plates" class="btn-primary">Export All Plates'
  + '</button>'
  + '</div>';

describe('SeparationsDialog migration — frozen DOM', () => {
  it('plate listbox serializes byte-identically (initial, 3 plates)', async () => {
    const overlay = await openDialog();
    expect(plateRows(overlay)).toHaveLength(3);
    expect(plateRegion(overlay).outerHTML).toBe(FROZEN_PLATE_INITIAL_HTML);
  });

  it('plate listbox serializes byte-identically after clicking the first row (selected + previewing)', async () => {
    const overlay = await openDialog();
    await act(async () => { plateRows(overlay)[0].click(); });
    expect(plateRegion(overlay).outerHTML).toBe(FROZEN_PLATE_SELECTED_HTML);
  });

  it('format toolbar serializes byte-identically (svg active)', async () => {
    const overlay = await openDialog();
    expect(formatRegion(overlay).outerHTML).toBe(FROZEN_FORMAT_SVG_HTML);
  });

  it('format toolbar serializes byte-identically after switching to png', async () => {
    const overlay = await openDialog();
    await act(async () => { formatOptions(overlay)[1].click(); });
    expect(formatRegion(overlay).outerHTML).toBe(FROZEN_FORMAT_PNG_HTML);
  });

  it('action footer serializes byte-identically', async () => {
    const overlay = await openDialog();
    expect(footerRegion(overlay).outerHTML).toBe(FROZEN_FOOTER_HTML);
  });
});

describe('plate listbox — vertical roving (ArrowUp/Down, clamped, immediate)', () => {
  it('ArrowDown moves focus to the next row and publishes its review immediately', async () => {
    const overlay = await openDialog();
    const rows = plateRows(overlay);
    act(() => rows[1].focus());
    const event = press(rows[1], 'ArrowDown');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rows[2]);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${plateReview(PLATES[2])}`);
  });

  it('ArrowUp moves focus to the previous row', async () => {
    const overlay = await openDialog();
    const rows = plateRows(overlay);
    act(() => rows[2].focus());
    press(rows[2], 'ArrowUp');
    expect(document.activeElement).toBe(rows[1]);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${plateReview(PLATES[1])}`);
  });

  it('clamps ArrowUp at the first row and ArrowDown at the last (no wrap)', async () => {
    const overlay = await openDialog();
    const rows = plateRows(overlay);
    act(() => rows[0].focus());
    press(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(rows[0]);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${plateReview(PLATES[0])}`);
    act(() => rows[2].focus());
    press(rows[2], 'ArrowDown');
    expect(document.activeElement).toBe(rows[2]);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${plateReview(PLATES[2])}`);
  });

  it('Home jumps to the first row and End to the last', async () => {
    const overlay = await openDialog();
    const rows = plateRows(overlay);
    act(() => rows[1].focus());
    press(rows[1], 'Home');
    expect(document.activeElement).toBe(rows[0]);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${plateReview(PLATES[0])}`);
    act(() => rows[1].focus());
    press(rows[1], 'End');
    expect(document.activeElement).toBe(rows[2]);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${plateReview(PLATES[2])}`);
  });

  it('ignores ArrowLeft/ArrowRight without preventing default (vertical key set)', async () => {
    const overlay = await openDialog();
    const rows = plateRows(overlay);
    act(() => rows[1].focus());
    const before = reviewText('separations-plate-review-status');
    const left = press(rows[1], 'ArrowLeft');
    expect(left.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(rows[1]);
    const right = press(rows[1], 'ArrowRight');
    expect(right.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(rows[1]);
    expect(reviewText('separations-plate-review-status')).toBe(before);
  });

  it('guards the empty plate list: ArrowDown still prevents default but publishes nothing', async () => {
    vi.mocked(collectDocumentColors).mockReturnValue([]);
    const overlay = await openDialog();
    expect(plateRows(overlay)).toHaveLength(0);
    const event = press(plateRegion(overlay), 'ArrowDown');
    expect(event.defaultPrevented).toBe(true);
    expect(reviewText('separations-plate-review-status')).toBe(`${t('Reviewing')} ${t('Separations plates')}`);
  });
});

describe('format toolbar — wrapping roving with a rAF-deferred commit', () => {
  it('announces the fallback (current format uppercased) before anything is reviewed', async () => {
    await openDialog();
    expect(reviewText('separations-format-review-status')).toBe(`${t('Reviewing')} SVG`);
  });

  it('applies the next format synchronously but defers review + focus to the next frame', async () => {
    const overlay = await openDialog();
    const [svgOption, pngOption] = formatOptions(overlay);
    act(() => svgOption.focus());
    const event = press(svgOption, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    // Synchronous slice (onNavigate): the next format is applied before any frame…
    expect(svgOption.getAttribute('aria-pressed')).toBe('false');
    expect(pngOption.getAttribute('aria-pressed')).toBe('true');
    // …while review + focus still wait for requestAnimationFrame.
    expect(document.activeElement).toBe(svgOption);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(pngOption);
    expect(reviewText('separations-format-review-status')).toBe(`${t('Reviewing')} PNG`);
  });

  it('wraps ArrowRight at the end and ArrowLeft at the start', async () => {
    const overlay = await openDialog();
    const [svgOption, pngOption] = formatOptions(overlay);
    act(() => pngOption.focus());
    press(pngOption, 'ArrowRight');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(svgOption);
    expect(svgOption.getAttribute('aria-pressed')).toBe('true');
    expect(reviewText('separations-format-review-status')).toBe(`${t('Reviewing')} SVG`);

    act(() => svgOption.focus());
    press(svgOption, 'ArrowLeft');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(pngOption);
    expect(pngOption.getAttribute('aria-pressed')).toBe('true');
    expect(reviewText('separations-format-review-status')).toBe(`${t('Reviewing')} PNG`);
  });

  it('Home selects the first format and End the last', async () => {
    const overlay = await openDialog();
    const [svgOption, pngOption] = formatOptions(overlay);
    act(() => pngOption.focus());
    press(pngOption, 'Home');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(svgOption);
    expect(svgOption.getAttribute('aria-pressed')).toBe('true');
    act(() => svgOption.focus());
    press(svgOption, 'End');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(pngOption);
    expect(pngOption.getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores ArrowUp/ArrowDown without preventing default (horizontal key set)', async () => {
    const overlay = await openDialog();
    const [svgOption] = formatOptions(overlay);
    act(() => svgOption.focus());
    const before = reviewText('separations-format-review-status');
    const down = press(svgOption, 'ArrowDown');
    expect(down.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(svgOption);
    const up = press(svgOption, 'ArrowUp');
    expect(up.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(svgOption);
    expect(reviewText('separations-format-review-status')).toBe(before);
  });
});

describe('action footer — clamped roving with action-review announcements', () => {
  it('ArrowRight moves focus and announces the next action immediately', async () => {
    const overlay = await openDialog();
    const buttons = footerButtons(overlay);
    act(() => buttons[0].focus());
    const event = press(buttons[0], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(reviewText('separations-action-review-status')).toBe(`${t('Reviewing')} ${t('Export Plate')}`);
  });

  it('clamps at both ends (never wraps)', async () => {
    const overlay = await openDialog();
    const buttons = footerButtons(overlay);
    act(() => buttons[0].focus());
    const left = press(buttons[0], 'ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(reviewText('separations-action-review-status')).toBe(`${t('Reviewing')} ${t('Close')}`);
    act(() => buttons[2].focus());
    press(buttons[2], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[2]);
    expect(reviewText('separations-action-review-status')).toBe(`${t('Reviewing')} ${t('Export All Plates')}`);
  });

  it('Home jumps to Close and End to Export All Plates', async () => {
    const overlay = await openDialog();
    const buttons = footerButtons(overlay);
    act(() => buttons[1].focus());
    press(buttons[1], 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    expect(reviewText('separations-action-review-status')).toBe(`${t('Reviewing')} ${t('Close')}`);
    act(() => buttons[1].focus());
    press(buttons[1], 'End');
    expect(document.activeElement).toBe(buttons[2]);
    expect(reviewText('separations-action-review-status')).toBe(`${t('Reviewing')} ${t('Export All Plates')}`);
  });
});

describe('action wiring across the migration', () => {
  it('Close click flips the store flag and unmounts the overlay', async () => {
    const overlay = await openDialog();
    await act(async () => { footerButtons(overlay)[0].click(); });
    expect(useEditor.getState().showSeparations).toBe(false);
    expect(overlay.isConnected).toBe(false);
  });

  it('Export All Plates exports every exportable plate in the current format', async () => {
    const overlay = await openDialog();
    await act(async () => { footerButtons(overlay)[2].click(); });
    expect(exportPlates).toHaveBeenCalledWith([PLATES[0].key, PLATES[1].key], 'svg');
  });

  it('clicking a plate row selects and previews it (aria-selected + aria-pressed)', async () => {
    const overlay = await openDialog();
    const rows = plateRows(overlay);
    await act(async () => { rows[0].click(); });
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');
    expect(rows[1].getAttribute('aria-selected')).toBe('false');
    // Clicking again toggles the preview off but keeps the row selected.
    await act(async () => { rows[0].click(); });
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].getAttribute('aria-pressed')).toBe('false');
  });
});
