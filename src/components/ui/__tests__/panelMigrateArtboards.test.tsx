import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ArtboardsPanel } from '../../ArtboardsPanel';
import { useEditor } from '../../../store/editor';
import { t } from '../../../lib/i18n';
import { resizeArtboard } from '../../../lib/artboards';
import { zoomToArtboard } from '../../../lib/canvasEngine';
import { toast } from '../../../lib/toast';
import type { Artboard } from '../../../types';

/**
 * Freeze-then-migrate suite for ArtboardsPanel (dialog-kit migration).
 *
 * The frozen strings and behavior snapshots below were captured from the
 * pre-migration handwritten implementation (git HEAD), which owns four inline
 * roving handlers:
 *
 *   1. the artboard LIST (role="list" container, [data-artboard-row] rows) —
 *      vertical ArrowUp/Down + Home/End, clamped (no wrap), with an
 *      interactive-descendant guard so arrows typed inside a row's inputs and
 *      buttons keep their native meaning; the review announcer follows focus
 *      (row onFocus → setFocusedArtboardId), not the key handler;
 *   2. the SEARCH action toolbar ([data-artboard-search-action]) — wrapping
 *      arrows, skipDisabled, Math.max(0, findIndex) fallback, review announce
 *      from data-artboard-search-action-review with text-content fallback;
 *   3. the per-row ORDER and FIT toolbars ([data-artboard-action]) — wrapping
 *      arrows, no disabled filtering, review announce from
 *      data-artboard-action-review with text fallback into the row's SHARED
 *      live region (rendered inside the presets toolbar);
 *   4. the per-row SIZE PRESET toolbar — same roving as (3) plus "landing on
 *      a preset button applies it" (dataset.sizePreset lookup, resize +
 *      toast + local W/H field sync).
 *
 * The migration swaps the four handlers for makeRovingKeys (axis:'vertical'
 * for the list) and the search toolbar for SearchableListActions; the row
 * toolbars' containers become ActionToolbar (externalStatus for order/fit —
 * the live region physically lives in the presets toolbar). The list
 * container stays hand-rendered: it is role="list", which ActionToolbar
 * cannot express (same precedent as TemplatesDialog's role="grid").
 * Everything frozen here must keep passing.
 */

vi.mock('../../../lib/canvasEngine', () => ({ zoomToArtboard: vi.fn() }));
vi.mock('../../../lib/artboards', () => ({
  createArtboard: vi.fn(() => null),
  createArtboardFromSelection: vi.fn(() => null),
  deleteArtboard: vi.fn(),
  duplicateArtboard: vi.fn(async () => null),
  duplicateArtboardFrame: vi.fn(() => null),
  promptRearrangeArtboards: vi.fn(() => null),
  renameArtboard: vi.fn(),
  renumberArtboardsByPosition: vi.fn(() => false),
  reorderArtboard: vi.fn(() => false),
  sortArtboardsByPosition: vi.fn(() => false),
  moveArtboard: vi.fn(),
  resizeArtboard: vi.fn(),
  exportArtboardsByIdAsFiles: vi.fn(async () => 0),
  exportArtboardsByIdAsPNG: vi.fn(() => 0),
  exportArtboardPNG: vi.fn(() => null),
  exportArtboardSVGAsync: vi.fn(async () => null),
}));
vi.mock('../../../lib/fitArtboard', () => ({ fitArtboardToContent: vi.fn(() => false) }));
vi.mock('../../../lib/toast', () => ({
  toast: { success: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn(), show: vi.fn() },
}));
vi.mock('../../../lib/confirm', () => ({ showConfirm: vi.fn(async () => false) }));
vi.mock('../../../lib/io', () => ({ download: vi.fn(), downloadDataURL: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ARTBOARDS: Artboard[] = [
  { id: 'ab-1', name: 'Cover', x: 0, y: 0, width: 800, height: 600 },
  { id: 'ab-2', name: 'Back Cover', x: 850, y: 0, width: 300, height: 250 },
];

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  act(() => useEditor.setState({ artboards: ARTBOARDS }));
  vi.mocked(zoomToArtboard).mockClear();
  vi.mocked(resizeArtboard).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
});

function mountPanel(): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<ArtboardsPanel />));
  return container;
}

/** Dispatches keydown inside act; returns defaultPrevented. */
function pressSync(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(event); });
  return event.defaultPrevented;
}

const focus = (el: HTMLElement) => act(() => { el.focus(); });

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// ---- locators -------------------------------------------------------------------

const listRegion = (c: HTMLElement) => c.querySelector<HTMLElement>('[aria-describedby="artboards-review-status"]')!;
const rows = (c: HTMLElement) => Array.from(listRegion(c).querySelectorAll<HTMLElement>('[data-artboard-row]'));
const listStatusText = () => document.getElementById('artboards-review-status')!.textContent!;
const searchInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="search"]')!;
const searchToolbar = (c: HTMLElement) => c.querySelector<HTMLElement>('[aria-describedby="artboard-search-action-review-status"]')!;
const searchActions = (c: HTMLElement) => Array.from(searchToolbar(c).querySelectorAll<HTMLButtonElement>('[data-artboard-search-action]'));
const searchStatusText = () => document.getElementById('artboard-search-action-review-status')!.textContent!;
const orderToolbar = (c: HTMLElement) => c.querySelector<HTMLElement>(`[aria-label="${t('Artboard order')}"]`)!;
const presetToolbar = (c: HTMLElement) => c.querySelector<HTMLElement>(`[aria-label="${t('Artboard size presets')}"]`)!;
const fitToolbar = (c: HTMLElement) => c.querySelector<HTMLElement>(`[aria-label="${t('Fit artboard')}"]`)!;
const orderActions = (c: HTMLElement) => Array.from(orderToolbar(c).querySelectorAll<HTMLButtonElement>('[data-artboard-action]'));
const presetActions = (c: HTMLElement) => Array.from(presetToolbar(c).querySelectorAll<HTMLButtonElement>('[data-artboard-action]'));
const fitActions = (c: HTMLElement) => Array.from(fitToolbar(c).querySelectorAll<HTMLButtonElement>('[data-artboard-action]'));
const rowStatusText = () => document.getElementById('artboard-row-action-review-ab-1')!.textContent!;
const nameInput = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([type="number"]):not([type="search"])')!;
const widthInput = (row: HTMLElement) => row.querySelectorAll<HTMLInputElement>('input[type="number"]')[2];

const review = (name: string, index: number, size: string) =>
  `${t('Reviewing')} ${name} ${index} / 2. ${size}`;

// ---- frozen DOM (captured byte-for-byte from the legacy panel) --------------------

const FROZEN_ORDER_TOOLBAR_HTML =
  '<div class="grid grid-cols-4 gap-1" role="toolbar" aria-label="Artboard order" aria-describedby="artboard-row-action-review-ab-1" title="Use arrow keys to review artboard row actions">'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Move this artboard to first" class="btn !py-1 !px-1.5 !text-[10px]" title="Move this artboard to first">First</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Move this artboard earlier" class="btn !py-1 !px-1.5 !text-[10px]" title="Move this artboard earlier">Earlier</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Move this artboard later" class="btn !py-1 !px-1.5 !text-[10px]" title="Move this artboard later">Later</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Move this artboard to last" class="btn !py-1 !px-1.5 !text-[10px]" title="Move this artboard to last">Last</button>'
  + '</div>';

const FROZEN_PRESET_TOOLBAR_HTML =
  '<div class="flex flex-wrap gap-1" role="toolbar" aria-label="Artboard size presets" aria-describedby="artboard-row-action-review-ab-1" title="Use arrow keys to review artboard row actions">'
  + '<span id="artboard-row-action-review-ab-1" class="sr-only" aria-live="polite">Reviewing Artboard size presets</span>'
  + '<button type="button" data-artboard-action="true" data-artboard-size-preset-action="true" data-size-preset="A4" data-artboard-action-review="Apply artboard size preset A4" class="btn !py-1 !px-1.5 !text-[10px]" title="Apply artboard size preset">A4</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-size-preset-action="true" data-size-preset="Letter" data-artboard-action-review="Apply artboard size preset Letter" class="btn !py-1 !px-1.5 !text-[10px]" title="Apply artboard size preset">Letter</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-size-preset-action="true" data-size-preset="24×12 in" data-artboard-action-review="Apply artboard size preset 24×12 in" class="btn !py-1 !px-1.5 !text-[10px]" title="Apply artboard size preset">24×12 in</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Swap artboard width and height" class="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" title="Swap artboard width and height"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-cw" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg> Swap W/H</button>'
  + '</div>';

const FROZEN_FIT_TOOLBAR_HTML =
  '<div class="grid grid-cols-2 gap-1" role="toolbar" aria-label="Fit artboard" aria-describedby="artboard-row-action-review-ab-1" title="Use arrow keys to review artboard row actions">'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Fit this artboard to selection" class="btn !py-1 !px-1.5 !text-[10px]" title="Fit this artboard to selection">Fit Selection</button>'
  + '<button type="button" data-artboard-action="true" data-artboard-action-review="Fit this artboard to artwork" class="btn !py-1 !px-1.5 !text-[10px]" title="Fit this artboard to artwork">Fit Artwork</button>'
  + '</div>';

const frozenSearchToolbar = (targetFirstDisabled: boolean): string =>
  '<div class="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label="Artboard search actions" aria-describedby="artboard-search-action-review-status" title="Use arrow keys to review artboard search actions">'
  + '<span id="artboard-search-action-review-status" class="sr-only" aria-live="polite">Reviewing Artboard search actions</span>'
  + '<button type="button" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" data-artboard-search-action="true" data-artboard-search-action-review="Zoom to first search result"'
  + (targetFirstDisabled ? ' disabled=""' : '')
  + ' title="Zoom to first search result">Target First</button>'
  + '<button type="button" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" data-artboard-search-action="true" data-artboard-search-action-review="Clear search" title="Clear search">Clear search</button>'
  + '</div>';

// One full frozen row, parameterized exactly as the legacy bytes came out.
const frozenRow = (a: Artboard, selected: boolean): string => {
  const rowClass = selected
    ? 'border-accent2 bg-accent/10 shadow-[0_0_0_1px_rgba(var(--color-accent2),0.25)]'
    : 'border-border bg-panel2';
  const icon = (name: string, size: number, inner: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}" aria-hidden="true">${inner}</svg>`;
  return `<div class="rounded border p-2 space-y-1.5 focus-within:border-accent2 focus:outline-none focus:ring-1 focus:ring-accent2/60 transition-colors ${rowClass}" tabindex="0" data-artboard-row="true" role="listitem"${selected ? ' aria-current="true"' : ''} aria-label="Artboard row: ${a.name}" aria-keyshortcuts="Enter Control+D Meta+D Delete Backspace R">`
    + '<div class="flex items-center gap-1">'
    + `<input class="shrink-0" aria-label="Select artboard ${a.name}" title="Select artboard" type="checkbox">`
    + '<input class="flex-1 bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors" aria-label="Artboard name" value="' + a.name + '">'
    + `<button class="p-1 text-muted hover:text-ink transition-colors" title="Focus this artboard" aria-label="Focus this artboard">${icon('target', 12, '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>')}</button>`
    + `<button class="p-1 text-muted hover:text-ink transition-colors" title="Duplicate this artboard" aria-label="Duplicate this artboard">${icon('copy', 12, '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>')}</button>`
    + `<button class="p-1 text-muted hover:text-ink transition-colors" title="Duplicate this artboard frame only" aria-label="Duplicate this artboard frame only">${icon('frame', 12, '<line x1="22" x2="2" y1="6" y2="6"></line><line x1="22" x2="2" y1="18" y2="18"></line><line x1="6" x2="6" y1="2" y2="22"></line><line x1="18" x2="18" y1="2" y2="22"></line>')}</button>`
    + `<button class="p-1 text-muted hover:text-danger transition-colors" title="Delete artboard" aria-label="Delete artboard">${icon('trash2 lucide-trash-2', 12, '<path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>')}</button>`
    + '</div>'
    + '<div class="grid grid-cols-4 gap-1 items-center">'
    + `<label class="flex flex-col gap-0.5"><span class="field-label !mb-0">X</span><input class="bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors w-full" type="number" value="${a.x}"></label>`
    + `<label class="flex flex-col gap-0.5"><span class="field-label !mb-0">Y</span><input class="bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors w-full" type="number" value="${a.y}"></label>`
    + `<label class="flex flex-col gap-0.5"><span class="field-label !mb-0">W</span><input class="bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors w-full" type="number" value="${a.width}"></label>`
    + `<label class="flex flex-col gap-0.5"><span class="field-label !mb-0">H</span><input class="bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors w-full" type="number" value="${a.height}"></label>`
    + '</div>'
    + '<div><div class="field-label !mb-1">Artboard order</div>'
    + FROZEN_ORDER_TOOLBAR_HTML.replace(/artboard-row-action-review-ab-1/g, `artboard-row-action-review-${a.id}`)
    + '</div>'
    + '<div><div class="field-label !mb-1">Artboard size presets</div>'
    + FROZEN_PRESET_TOOLBAR_HTML.replace(/artboard-row-action-review-ab-1/g, `artboard-row-action-review-${a.id}`)
    + '</div>'
    + '<div><div class="field-label !mb-1">Fit artboard</div>'
    + FROZEN_FIT_TOOLBAR_HTML.replace(/artboard-row-action-review-ab-1/g, `artboard-row-action-review-${a.id}`)
    + '</div>'
    + '<div class="flex gap-1">'
    + `<button class="btn flex items-center gap-1 flex-1 justify-center" title="Export this artboard as PNG">${icon('file-image', 11, '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><circle cx="10" cy="12" r="2"></circle><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"></path>')} PNG</button>`
    + `<button class="btn flex items-center gap-1 flex-1 justify-center" title="Export this artboard as SVG">${icon('file-code', 11, '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M10 12.5 8 15l2 2.5"></path><path d="m14 12.5 2 2.5-2 2.5"></path>')} SVG</button>`
    + '</div></div>';
};

const FROZEN_LIST_HTML =
  '<div class="space-y-2" role="list" aria-label="Artboards" aria-describedby="artboards-review-status" title="Use arrow keys to review artboards">'
  + frozenRow(ARTBOARDS[0], true)
  + frozenRow(ARTBOARDS[1], false)
  + '</div>';

// ---- the suite -------------------------------------------------------------------

describe('ArtboardsPanel migration — frozen legacy DOM (byte-exact)', () => {
  it('the artboard list serializes byte-identically (2 rows, first reviewed)', () => {
    const c = mountPanel();
    expect(rows(c)).toHaveLength(2);
    expect(listRegion(c).outerHTML).toBe(FROZEN_LIST_HTML);
  });

  it('the three ab-1 row toolbars serialize byte-identically', () => {
    const c = mountPanel();
    expect(orderToolbar(c).outerHTML).toBe(FROZEN_ORDER_TOOLBAR_HTML);
    expect(presetToolbar(c).outerHTML).toBe(FROZEN_PRESET_TOOLBAR_HTML);
    expect(fitToolbar(c).outerHTML).toBe(FROZEN_FIT_TOOLBAR_HTML);
  });

  it('the search action toolbar serializes byte-identically (enabled and disabled first action)', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'cover');
    expect(searchToolbar(c).outerHTML).toBe(frozenSearchToolbar(false));
    // Fresh mount for the disabled variant: the toolbar mounts with
    // disabled=true already set (attribute order = JSX order; a later
    // false→true flip would append `disabled=""` after `title` instead).
    const c2 = mountPanel();
    typeInto(searchInput(c2), 'zzz');
    expect(searchToolbar(c2).outerHTML).toBe(frozenSearchToolbar(true));
  });

  it('the initial review announcers carry their fallbacks', () => {
    mountPanel();
    expect(listStatusText()).toBe(review('Cover', 1, '800×600 px'));
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Artboard size presets')}`);
  });
});

describe('artboard list — vertical roving (ArrowUp/Down, clamped, guard)', () => {
  it('ArrowDown moves focus to the next row and republishes the list announcer', () => {
    const c = mountPanel();
    const [row1, row2] = rows(c);
    focus(row1);
    const event = pressSync(row1, 'ArrowDown');
    expect(event).toBe(true);
    expect(document.activeElement).toBe(row2);
    expect(listStatusText()).toBe(review('Back Cover', 2, '300×250 px'));
    expect(row2.getAttribute('aria-current')).toBe('true');
    expect(row1.getAttribute('aria-current')).toBe(null);
  });

  it('ArrowUp moves focus to the previous row', () => {
    const c = mountPanel();
    const [row1, row2] = rows(c);
    focus(row2);
    pressSync(row2, 'ArrowUp');
    expect(document.activeElement).toBe(row1);
    expect(listStatusText()).toBe(review('Cover', 1, '800×600 px'));
  });

  it('clamps ArrowUp at the first row and ArrowDown at the last (no wrap)', () => {
    const c = mountPanel();
    const [row1, row2] = rows(c);
    focus(row1);
    expect(pressSync(row1, 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(row1);
    expect(listStatusText()).toBe(review('Cover', 1, '800×600 px'));
    focus(row2);
    pressSync(row2, 'ArrowDown');
    expect(document.activeElement).toBe(row2);
    expect(listStatusText()).toBe(review('Back Cover', 2, '300×250 px'));
  });

  it('Home jumps to the first row and End to the last', () => {
    const c = mountPanel();
    const [row1, row2] = rows(c);
    focus(row2);
    pressSync(row2, 'Home');
    expect(document.activeElement).toBe(row1);
    focus(row1);
    pressSync(row1, 'End');
    expect(document.activeElement).toBe(row2);
  });

  it('ignores ArrowLeft/ArrowRight without preventing default (vertical key set)', () => {
    const c = mountPanel();
    const [row1] = rows(c);
    focus(row1);
    const before = listStatusText();
    expect(pressSync(row1, 'ArrowLeft')).toBe(false);
    expect(pressSync(row1, 'ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(row1);
    expect(listStatusText()).toBe(before);
  });

  it('keeps arrows native inside a row\'s interactive descendants (guard)', () => {
    const c = mountPanel();
    const [row1] = rows(c);
    const name = nameInput(row1);
    focus(name);
    expect(pressSync(name, 'ArrowDown')).toBe(false);
    expect(pressSync(name, 'ArrowUp')).toBe(false);
    expect(document.activeElement).toBe(name);
    // Buttons inside a row are guarded too (keydown still bubbles to the list).
    const first = orderActions(c)[0];
    focus(first);
    expect(pressSync(first, 'ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(first);
  });
});

describe('search action toolbar — wrapping roving with skipDisabled', () => {
  it('ArrowRight wraps at the end and publishes the landed action review', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'cover');
    const [targetFirst, clear] = searchActions(c);
    expect(searchStatusText()).toBe(`${t('Reviewing')} ${t('Artboard search actions')}`);
    focus(clear);
    expect(searchStatusText()).toBe(`${t('Reviewing')} ${t('Clear search')}`);
    expect(pressSync(clear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(targetFirst);
    expect(searchStatusText()).toBe(`${t('Reviewing')} ${t('Zoom to first search result')}`);
  });

  it('ArrowLeft wraps at the start', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'cover');
    const [targetFirst, clear] = searchActions(c);
    focus(targetFirst);
    pressSync(targetFirst, 'ArrowLeft');
    expect(document.activeElement).toBe(clear);
    expect(searchStatusText()).toBe(`${t('Reviewing')} ${t('Clear search')}`);
  });

  it('Home jumps to the first action and End to the last', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'cover');
    const [targetFirst, clear] = searchActions(c);
    focus(clear);
    pressSync(clear, 'Home');
    expect(document.activeElement).toBe(targetFirst);
    focus(targetFirst);
    pressSync(targetFirst, 'End');
    expect(document.activeElement).toBe(clear);
  });

  it('skips the disabled Target First when the query filters everything out', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'zzz');
    const [targetFirst, clear] = searchActions(c);
    expect(targetFirst.disabled).toBe(true);
    focus(clear);
    // Only Clear search is enabled: every move stays on it.
    pressSync(clear, 'ArrowRight');
    expect(document.activeElement).toBe(clear);
    expect(searchStatusText()).toBe(`${t('Reviewing')} ${t('Clear search')}`);
    pressSync(clear, 'Home');
    expect(document.activeElement).toBe(clear);
  });

  it('Enter in the search input targets the first filtered artboard; ArrowDown focuses the first row; Escape clears', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'back');
    expect(pressSync(searchInput(c), 'Enter')).toBe(true);
    expect(zoomToArtboard).toHaveBeenCalledWith(ARTBOARDS[1]);
    expect(pressSync(searchInput(c), 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(rows(c)[0]);
    focus(searchInput(c));
    expect(pressSync(searchInput(c), 'Escape')).toBe(true);
    expect(searchInput(c).value).toBe('');
    expect(searchToolbar(c)).toBe(null);
  });
});

describe('row order toolbar — wrapping roving into the shared row region', () => {
  it('ArrowRight steps and ArrowLeft wraps First → Last', () => {
    const c = mountPanel();
    const [first, earlier, , last] = orderActions(c);
    focus(first);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Move this artboard to first')}`);
    expect(pressSync(first, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(earlier);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Move this artboard earlier')}`);
    focus(first);
    pressSync(first, 'ArrowLeft');
    expect(document.activeElement).toBe(last);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Move this artboard to last')}`);
    focus(last);
    pressSync(last, 'ArrowRight');
    expect(document.activeElement).toBe(first);
  });

  it('Home and End jump absolutely (container-dispatch included)', () => {
    const c = mountPanel();
    const [first, , , last] = orderActions(c);
    focus(last);
    pressSync(last, 'Home');
    expect(document.activeElement).toBe(first);
    focus(first);
    pressSync(first, 'End');
    expect(document.activeElement).toBe(last);
    // Dispatched on the toolbar container itself (unreachable by real keyboard
    // — the container is not focusable): BOTH the toolbar handler and the list
    // handler run on the same bubbled event, and the list handler wins focus.
    expect(pressSync(orderToolbar(c), 'Home')).toBe(true);
    expect(document.activeElement).toBe(rows(c)[0]);
  });
});

describe('size preset toolbar — wrapping roving that applies the landed preset', () => {
  it('ArrowRight A4 → Letter applies the Letter preset (resize + toast + W/H fields)', () => {
    const c = mountPanel();
    const [a4, letter] = presetActions(c);
    focus(a4);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Apply artboard size preset')} A4`);
    expect(pressSync(a4, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(letter);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Apply artboard size preset')} Letter`);
    expect(resizeArtboard).toHaveBeenCalledWith('ab-1', 816, 1054);
    expect(toast.success).toHaveBeenCalledWith(t('Artboard resized'));
    expect(widthInput(rows(c)[0]).value).toBe('816');
  });

  it('wrapping onto Swap W/H does NOT apply any preset', () => {
    const c = mountPanel();
    const [, , inch, swap] = presetActions(c);
    const before = vi.mocked(resizeArtboard).mock.calls.length;
    focus(inch);
    expect(pressSync(inch, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(swap);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Swap artboard width and height')}`);
    expect(vi.mocked(resizeArtboard).mock.calls.length).toBe(before);
  });

  it('Home from Swap applies A4; End from A4 lands on Swap without applying', () => {
    const c = mountPanel();
    const [a4, , , swap] = presetActions(c);
    focus(swap);
    pressSync(swap, 'Home');
    expect(document.activeElement).toBe(a4);
    expect(resizeArtboard).toHaveBeenCalledWith('ab-1', 794, 1123);
    const before = vi.mocked(resizeArtboard).mock.calls.length;
    focus(a4);
    pressSync(a4, 'End');
    expect(document.activeElement).toBe(swap);
    expect(vi.mocked(resizeArtboard).mock.calls.length).toBe(before);
  });
});

describe('fit toolbar shares the row review region', () => {
  it('ArrowRight Fit Selection → Fit Artwork updates the same live region', () => {
    const c = mountPanel();
    const [fitSelection, fitArtwork] = fitActions(c);
    focus(fitSelection);
    expect(pressSync(fitSelection, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(fitArtwork);
    expect(rowStatusText()).toBe(`${t('Reviewing')} ${t('Fit this artboard to artwork')}`);
  });
});
