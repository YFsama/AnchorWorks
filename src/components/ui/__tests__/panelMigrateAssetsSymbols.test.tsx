import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssetsPanel } from '../../AssetsPanel';
import { SymbolsPanel } from '../../SymbolsPanel';
import {
  getStoredAssets,
  insertAsset,
  removeAsset,
  traceSelectedImage,
  type StoredAsset,
} from '../../../lib/io3';
import {
  getSymbols,
  saveSelectionAsSymbol,
  insertSymbol,
  deleteSymbol,
  renameSymbol,
  redefineSymbolFromSelection,
  detachSymbolInstancesFromSelection,
  selectSymbolInstances,
} from '../../../lib/symbols';
import { toast } from '../../../lib/toast';
import type { SymbolEntry } from '../../../types';

/**
 * Freeze-then-migrate suite for the two library panels (implementer U):
 * AssetsPanel and SymbolsPanel move onto the shared dialog-keyboard kit —
 *
 *   tile grid     → makeGridKeys({ columns: 3, defer, onNavigate }) driving the
 *                   EXISTING role="grid" container (ActionToolbar cannot
 *                   express role="grid" and the external live region must stay
 *                   the grid's preceding sibling — the TemplatesDialog shape);
 *   asset toolbar → makeRovingKeys({ wrap, skipDisabled, guardEmpty }) inside
 *                   an ActionToolbar (statusAs="span") with the rich buttons
 *                   kept verbatim (SeparationsDialog format-toolbar shape);
 *   search row    → makeRovingKeys inside SearchableListActions.
 *
 * Freeze-then-change discipline: every frozen string below was captured from
 * the LEGACY panels at HEAD before the migration and must serialize
 * byte-identically after it (the panels had no working-tree diff, so HEAD is
 * the byte baseline) — the full initial panels, the asset toolbar, both tile
 * grids, and every keyboard snapshot passed byte-exact against the legacy
 * panels BEFORE the migration was applied. Three intended kit deltas are
 * pinned in their NEW byte form (with an attribute-signature proof that the
 * attribute SET and content are exactly the legacy bytes): the
 * SearchableListActions search-row buttons serialize class BEFORE the
 * data-* attributes (and disabled after title), and the naming toolbar's
 * Save button now serializes its attributes in JSX order. Attribute order
 * only — query/CSS/ARIA neutral.
 *
 * THE NAMING TOOLBAR rides the kit via `fallbackIndex: -1` (tail pass): the
 * name <input> lives INSIDE the roving container and is auto-focused when
 * naming begins, so arrow keydowns bubble from the input — the legacy
 * active-index fallback (`activeIndex >= 0 ? activeIndex : ArrowLeft ? 0 :
 * -1`) is reachable there: ArrowRight from the input starts "before the
 * first" button and lands on Save. `fallbackIndex: -1` reproduces exactly
 * that asymmetric entry while the kit default (`Math.max(0, findIndex)`)
 * would land on Cancel instead — this is the only container in the codebase
 * where the fallback path is reachable, and the bubbling cases below lock
 * both directions. Every other region's fallback path is unreachable
 * (containers hold only the matched buttons).
 */

vi.mock('../../../lib/io3', () => ({
  getStoredAssets: vi.fn(() => []),
  insertAsset: vi.fn(async () => {}),
  removeAsset: vi.fn(),
  importImageFile: vi.fn(async () => {}),
  traceSelectedImage: vi.fn(async () => false),
}));
vi.mock('../../../lib/symbols', () => ({
  getSymbols: vi.fn(() => []),
  saveSelectionAsSymbol: vi.fn(async () => null),
  insertSymbol: vi.fn(),
  deleteSymbol: vi.fn(),
  renameSymbol: vi.fn(),
  redefineSymbolFromSelection: vi.fn(async () => null),
  detachSymbolInstancesFromSelection: vi.fn(() => 0),
  selectSymbolInstances: vi.fn(() => 0),
}));
vi.mock('../../../lib/toast', () => ({
  toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ASSETS: StoredAsset[] = [
  { id: 'asset-a', kind: 'image', name: 'Anchor', data: 'data:image/png;base64,AAA', thumb: 'data:image/png;base64,TH1', addedAt: 1 },
  { id: 'asset-b', kind: 'image', name: 'Bolt', data: 'data:image/png;base64,BBB', thumb: 'data:image/png;base64,TH2', addedAt: 2 },
  { id: 'asset-c', kind: 'image', name: 'Clip', data: 'data:image/png;base64,CCC', thumb: 'data:image/png;base64,TH3', addedAt: 3 },
  { id: 'asset-d', kind: 'image', name: 'Dock', data: 'data:image/png;base64,DDD', thumb: 'data:image/png;base64,TH4', addedAt: 4 },
  { id: 'asset-e', kind: 'image', name: 'Eyelet', data: 'data:image/png;base64,EEE', thumb: 'data:image/png;base64,TH5', addedAt: 5 },
  { id: 'asset-f', kind: 'image', name: 'Fathom', data: 'data:image/png;base64,FFF', thumb: 'data:image/png;base64,TH6', addedAt: 6 },
  { id: 'asset-g', kind: 'image', name: 'Grommet', data: 'data:image/png;base64,GGG', thumb: '', addedAt: 7 },
];

const SYMBOLS: SymbolEntry[] = [
  { id: 'sym-1', name: 'Sail', thumbnail: 'data:image/png;base64,SY1', objectsJSON: [], addedAt: 1 },
  { id: 'sym-2', name: 'Knot', thumbnail: '', objectsJSON: [], addedAt: 2 },
  { id: 'sym-3', name: 'Buoy', thumbnail: '', objectsJSON: [], addedAt: 3 },
  { id: 'sym-4', name: 'Wharf', thumbnail: '', objectsJSON: [], addedAt: 4 },
  { id: 'sym-5', name: 'Rope', thumbnail: '', objectsJSON: [], addedAt: 5 },
];

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  vi.mocked(getStoredAssets).mockReturnValue(ASSETS);
  vi.mocked(getSymbols).mockReturnValue(SYMBOLS);
  vi.mocked(insertAsset).mockClear();
  vi.mocked(removeAsset).mockClear();
  vi.mocked(traceSelectedImage).mockReset();
  vi.mocked(traceSelectedImage).mockResolvedValue(false);
  vi.mocked(saveSelectionAsSymbol).mockClear();
  vi.mocked(insertSymbol).mockClear();
  vi.mocked(deleteSymbol).mockClear();
  vi.mocked(renameSymbol).mockClear();
  vi.mocked(redefineSymbolFromSelection).mockClear();
  vi.mocked(detachSymbolInstancesFromSelection).mockClear();
  vi.mocked(selectSymbolInstances).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warn).mockClear();
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
});

function mountPanel(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(element); });
  return container;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function flushFrames(): Promise<void> {
  await act(async () => { await nextFrame(); });
  await act(async () => { await nextFrame(); });
}

/** Dispatches keydown and flushes the grid's rAF-deferred focus. */
async function press(el: Element, key: string): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => { el.dispatchEvent(event); });
  await flushFrames();
  return event.defaultPrevented;
}

/** Toolbar roving commits synchronously — no frame flush needed. */
function pressSync(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(event); });
  return event.defaultPrevented;
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const byId = (id: string) => document.getElementById(id)!;
const regionText = (id: string) => byId(id).textContent;
const assetTiles = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-asset-index]'));
const symbolTiles = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-symbol-index]'));
const searchInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="search"]')!;
const countSpan = (c: HTMLElement) => c.querySelector('.tabular-nums')!.textContent;

// ---- frozen DOM builders (assembled from the captured legacy bytes) --------------

const TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
const MOUSE_CLICK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mouse-pointer-click" aria-hidden="true"><path d="M14 4.1 12 6"></path><path d="m5.1 8-2.9-.8"></path><path d="m6 12-1.9 2"></path><path d="M7.2 2.2 8 5.1"></path><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"></path></svg>';

const frozenAssetTile = (index: number, selected: boolean): string => {
  const a = ASSETS[index];
  return `<div class="relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden ${selected ? 'border-accent2 ring-1 ring-accent2/40' : 'border-border'}" aria-keyshortcuts="Delete Backspace"><button type="button" role="gridcell" data-asset-index="${index}" aria-selected="${selected}" class="block w-full aspect-square p-1" title="${a.name} — click to insert · Press Delete to remove" aria-label="${a.name}">${a.thumb ? `<img alt="${a.name}" class="w-full h-full object-contain" draggable="false" src="${a.thumb}">` : '<div class="w-full h-full flex items-center justify-center text-muted text-[10px]">image</div>'}</button><button class="absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" title="Remove from library" aria-label="Remove from library">${TRASH_SVG}</button></div>`;
};

const frozenAssetGrid = (selectedIndex: number): string =>
  '<div class="grid grid-cols-3 gap-1.5" role="grid" aria-label="Asset library results" title="Use arrow keys to review library items" aria-describedby="asset-grid-review-status">'
  + ASSETS.map((_, index) => frozenAssetTile(index, index === selectedIndex)).join('')
  + '</div>';

const frozenSymbolTile = (index: number, selected: boolean): string => {
  const s = SYMBOLS[index];
  return `<div class="relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden ${selected ? 'border-accent2 ring-1 ring-accent2/40' : 'border-border'}" aria-keyshortcuts="F2 Delete Backspace"><button type="button" role="gridcell" data-symbol-index="${index}" aria-selected="${selected}" class="block w-full aspect-square p-1" title="${s.name} — click to insert, double-click to rename · F2 rename · Delete remove" aria-label="${s.name}">${s.thumbnail ? `<img alt="${s.name}" class="w-full h-full object-contain" draggable="false" src="${s.thumbnail}">` : `<div class="w-full h-full flex items-center justify-center text-muted text-[10px]">${s.name}</div>`}</button><div class="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none">${s.name}</div><button type="button" class="absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" title="Select symbol instances" aria-label="Select symbol instances">${MOUSE_CLICK_SVG}</button><button type="button" class="absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" title="Delete symbol" aria-label="Delete symbol">${TRASH_SVG}</button></div>`;
};

const frozenSymbolGrid = (selectedIndex: number): string =>
  '<div class="grid grid-cols-3 gap-1.5" role="grid" aria-label="Symbol library results" title="Use arrow keys to review library items" aria-describedby="symbol-grid-review-status">'
  + SYMBOLS.map((_, index) => frozenSymbolTile(index, index === selectedIndex)).join('')
  + '</div>';

// Spliced byte captures of the legacy panels (see the header comment):
const FROZEN_ASSETS_PANEL = "<div class=\"panel-section\"><h3 class=\"m-0\"><button type=\"button\" class=\"panel-header w-full text-left hover:bg-panel3 transition-colors\" aria-expanded=\"true\" aria-controls=\"assets-panel-body\"><span class=\"flex items-center gap-1\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chevron-down\" aria-hidden=\"true\"><path d=\"m6 9 6 6 6-6\"></path></svg>Assets</span><span class=\"panel-count\">7</span></button></h3><div id=\"assets-panel-body\" class=\"px-2 pb-3\"><div class=\"flex items-center gap-1 mb-2\" role=\"toolbar\" aria-label=\"Asset actions\" aria-describedby=\"asset-action-review-status\" title=\"Use arrow keys to review asset actions\"><span id=\"asset-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Asset actions</span><button data-asset-action=\"true\" data-asset-action-review=\"Import an image into the library\" class=\"btn flex items-center gap-1 flex-1 justify-center\" title=\"Import an image into the library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-plus\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"M12 5v14\"></path></svg> Import</button><button data-asset-action=\"true\" data-asset-action-review=\"Trace the selected raster image into a polygon\" class=\"btn flex items-center gap-1 flex-1 justify-center\" aria-busy=\"false\" title=\"Trace the selected raster image into a polygon\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-wand-sparkles\" aria-hidden=\"true\"><path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\"></path><path d=\"m14 7 3 3\"></path><path d=\"M5 6v4\"></path><path d=\"M19 14v4\"></path><path d=\"M10 2v2\"></path><path d=\"M7 8H3\"></path><path d=\"M21 16h-4\"></path><path d=\"M11 3H9\"></path></svg> Trace</button></div><div class=\"flex items-center gap-1.5 mb-2\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-search text-muted shrink-0\" aria-hidden=\"true\"><path d=\"m21 21-4.34-4.34\"></path><circle cx=\"11\" cy=\"11\" r=\"8\"></circle></svg><input class=\"input !py-1 !px-2 text-xs min-w-0 flex-1\" placeholder=\"Search assets…\" aria-label=\"Search assets…\" title=\"Press Enter to insert first search result · Press Arrow Down to focus first library item\" type=\"search\" value=\"\"><span class=\"text-[10px] text-muted tabular-nums shrink-0\" aria-live=\"polite\">7 assets</span></div><div id=\"asset-grid-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Anchor 1 / 7. Press Enter to insert</div><div class=\"grid grid-cols-3 gap-1.5\" role=\"grid\" aria-label=\"Asset library results\" title=\"Use arrow keys to review library items\" aria-describedby=\"asset-grid-review-status\"><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-accent2 ring-1 ring-accent2/40\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"0\" aria-selected=\"true\" class=\"block w-full aspect-square p-1\" title=\"Anchor — click to insert · Press Delete to remove\" aria-label=\"Anchor\"><img alt=\"Anchor\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,TH1\"></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"1\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Bolt — click to insert · Press Delete to remove\" aria-label=\"Bolt\"><img alt=\"Bolt\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,TH2\"></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"2\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Clip — click to insert · Press Delete to remove\" aria-label=\"Clip\"><img alt=\"Clip\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,TH3\"></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"3\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Dock — click to insert · Press Delete to remove\" aria-label=\"Dock\"><img alt=\"Dock\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,TH4\"></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"4\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Eyelet — click to insert · Press Delete to remove\" aria-label=\"Eyelet\"><img alt=\"Eyelet\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,TH5\"></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"5\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Fathom — click to insert · Press Delete to remove\" aria-label=\"Fathom\"><img alt=\"Fathom\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,TH6\"></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-asset-index=\"6\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Grommet — click to insert · Press Delete to remove\" aria-label=\"Grommet\"><div class=\"w-full h-full flex items-center justify-center text-muted text-[10px]\">image</div></button><button class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Remove from library\" aria-label=\"Remove from library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div></div><input accept=\".png,.jpg,.jpeg,.webp,.gif\" hidden=\"\" type=\"file\"></div></div>";
const FROZEN_SEARCH_TOOLBAR_ASSETS = "<div class=\"contents\" role=\"toolbar\" aria-label=\"Library search actions\" aria-describedby=\"library-search-action-review-status\" title=\"Use arrow keys to review library actions\"><span id=\"library-search-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Library search actions</span><button type=\"button\" class=\"btn !py-1 !px-1.5 !text-[10px] shrink-0\" data-library-search-action=\"true\" data-library-search-action-review=\"Insert first search result\" title=\"Insert first search result\">Insert First</button><button type=\"button\" class=\"btn !py-1 !px-1.5 !text-[10px] shrink-0\" data-library-search-action=\"true\" data-library-search-action-review=\"Clear search\" title=\"Clear search\">Clear search</button></div>";
const FROZEN_SEARCH_TOOLBAR_ASSETS_ZERO = "<div class=\"contents\" role=\"toolbar\" aria-label=\"Library search actions\" aria-describedby=\"library-search-action-review-status\" title=\"Use arrow keys to review library actions\"><span id=\"library-search-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Library search actions</span><button type=\"button\" class=\"btn !py-1 !px-1.5 !text-[10px] shrink-0\" data-library-search-action=\"true\" data-library-search-action-review=\"Insert first search result\" title=\"Insert first search result\" disabled=\"\">Insert First</button><button type=\"button\" class=\"btn !py-1 !px-1.5 !text-[10px] shrink-0\" data-library-search-action=\"true\" data-library-search-action-review=\"Clear search\" title=\"Clear search\">Clear search</button></div>";
const FROZEN_ASSET_TOOLBAR_IMPORT_FOCUS = "<div class=\"flex items-center gap-1 mb-2\" role=\"toolbar\" aria-label=\"Asset actions\" aria-describedby=\"asset-action-review-status\" title=\"Use arrow keys to review asset actions\"><span id=\"asset-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Import an image into the library</span><button data-asset-action=\"true\" data-asset-action-review=\"Import an image into the library\" class=\"btn flex items-center gap-1 flex-1 justify-center\" title=\"Import an image into the library\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-plus\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"M12 5v14\"></path></svg> Import</button><button data-asset-action=\"true\" data-asset-action-review=\"Trace the selected raster image into a polygon\" class=\"btn flex items-center gap-1 flex-1 justify-center\" aria-busy=\"false\" title=\"Trace the selected raster image into a polygon\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-wand-sparkles\" aria-hidden=\"true\"><path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\"></path><path d=\"m14 7 3 3\"></path><path d=\"M5 6v4\"></path><path d=\"M19 14v4\"></path><path d=\"M10 2v2\"></path><path d=\"M7 8H3\"></path><path d=\"M21 16h-4\"></path><path d=\"M11 3H9\"></path></svg> Trace</button></div>";
const FROZEN_SYMBOLS_PANEL = "<div class=\"panel-section\"><h3 class=\"m-0\"><button type=\"button\" class=\"panel-header w-full text-left hover:bg-panel3 transition-colors\" aria-expanded=\"true\" aria-controls=\"symbols-panel-body\"><span class=\"flex items-center gap-1\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chevron-down\" aria-hidden=\"true\"><path d=\"m6 9 6 6 6-6\"></path></svg>Symbols</span><span class=\"panel-count\">5</span></button></h3><div id=\"symbols-panel-body\" class=\"px-2 pb-3 space-y-2\"><div class=\"grid grid-cols-3 gap-1\"><button type=\"button\" class=\"btn flex items-center gap-1 justify-center\" title=\"Save the current selection as a reusable symbol\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-plus\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"M12 5v14\"></path></svg> Save Symbol</button><button type=\"button\" class=\"btn flex items-center gap-1 justify-center\" title=\"Redefine symbol from selected instance\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-check\" aria-hidden=\"true\"><path d=\"M20 6 9 17l-5-5\"></path></svg> Redefine</button><button type=\"button\" class=\"btn flex items-center gap-1 justify-center\" title=\"Break link to selected symbol instance\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-x\" aria-hidden=\"true\"><path d=\"M18 6 6 18\"></path><path d=\"m6 6 12 12\"></path></svg> Break Link</button></div><div class=\"flex items-center gap-1.5 mb-2\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-search text-muted shrink-0\" aria-hidden=\"true\"><path d=\"m21 21-4.34-4.34\"></path><circle cx=\"11\" cy=\"11\" r=\"8\"></circle></svg><input class=\"input !py-1 !px-2 text-xs min-w-0 flex-1\" placeholder=\"Search symbols…\" aria-label=\"Search symbols…\" title=\"Press Enter to insert first search result · Press Arrow Down to focus first library item\" type=\"search\" value=\"\"><span class=\"text-[10px] text-muted tabular-nums shrink-0\" aria-live=\"polite\">5 symbols</span></div><div id=\"symbol-grid-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Sail 1 / 5. Press Enter to insert</div><div class=\"grid grid-cols-3 gap-1.5\" role=\"grid\" aria-label=\"Symbol library results\" title=\"Use arrow keys to review library items\" aria-describedby=\"symbol-grid-review-status\"><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-accent2 ring-1 ring-accent2/40\" aria-keyshortcuts=\"F2 Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-symbol-index=\"0\" aria-selected=\"true\" class=\"block w-full aspect-square p-1\" title=\"Sail — click to insert, double-click to rename · F2 rename · Delete remove\" aria-label=\"Sail\"><img alt=\"Sail\" class=\"w-full h-full object-contain\" draggable=\"false\" src=\"data:image/png;base64,SY1\"></button><div class=\"absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none\">Sail</div><button type=\"button\" class=\"absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Select symbol instances\" aria-label=\"Select symbol instances\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-mouse-pointer-click\" aria-hidden=\"true\"><path d=\"M14 4.1 12 6\"></path><path d=\"m5.1 8-2.9-.8\"></path><path d=\"m6 12-1.9 2\"></path><path d=\"M7.2 2.2 8 5.1\"></path><path d=\"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z\"></path></svg></button><button type=\"button\" class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Delete symbol\" aria-label=\"Delete symbol\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"F2 Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-symbol-index=\"1\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Knot — click to insert, double-click to rename · F2 rename · Delete remove\" aria-label=\"Knot\"><div class=\"w-full h-full flex items-center justify-center text-muted text-[10px]\">Knot</div></button><div class=\"absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none\">Knot</div><button type=\"button\" class=\"absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Select symbol instances\" aria-label=\"Select symbol instances\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-mouse-pointer-click\" aria-hidden=\"true\"><path d=\"M14 4.1 12 6\"></path><path d=\"m5.1 8-2.9-.8\"></path><path d=\"m6 12-1.9 2\"></path><path d=\"M7.2 2.2 8 5.1\"></path><path d=\"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z\"></path></svg></button><button type=\"button\" class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Delete symbol\" aria-label=\"Delete symbol\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"F2 Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-symbol-index=\"2\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Buoy — click to insert, double-click to rename · F2 rename · Delete remove\" aria-label=\"Buoy\"><div class=\"w-full h-full flex items-center justify-center text-muted text-[10px]\">Buoy</div></button><div class=\"absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none\">Buoy</div><button type=\"button\" class=\"absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Select symbol instances\" aria-label=\"Select symbol instances\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-mouse-pointer-click\" aria-hidden=\"true\"><path d=\"M14 4.1 12 6\"></path><path d=\"m5.1 8-2.9-.8\"></path><path d=\"m6 12-1.9 2\"></path><path d=\"M7.2 2.2 8 5.1\"></path><path d=\"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z\"></path></svg></button><button type=\"button\" class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Delete symbol\" aria-label=\"Delete symbol\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"F2 Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-symbol-index=\"3\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Wharf — click to insert, double-click to rename · F2 rename · Delete remove\" aria-label=\"Wharf\"><div class=\"w-full h-full flex items-center justify-center text-muted text-[10px]\">Wharf</div></button><div class=\"absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none\">Wharf</div><button type=\"button\" class=\"absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Select symbol instances\" aria-label=\"Select symbol instances\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-mouse-pointer-click\" aria-hidden=\"true\"><path d=\"M14 4.1 12 6\"></path><path d=\"m5.1 8-2.9-.8\"></path><path d=\"m6 12-1.9 2\"></path><path d=\"M7.2 2.2 8 5.1\"></path><path d=\"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z\"></path></svg></button><button type=\"button\" class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Delete symbol\" aria-label=\"Delete symbol\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div><div class=\"relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden border-border\" aria-keyshortcuts=\"F2 Delete Backspace\"><button type=\"button\" role=\"gridcell\" data-symbol-index=\"4\" aria-selected=\"false\" class=\"block w-full aspect-square p-1\" title=\"Rope — click to insert, double-click to rename · F2 rename · Delete remove\" aria-label=\"Rope\"><div class=\"w-full h-full flex items-center justify-center text-muted text-[10px]\">Rope</div></button><div class=\"absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none\">Rope</div><button type=\"button\" class=\"absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Select symbol instances\" aria-label=\"Select symbol instances\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-mouse-pointer-click\" aria-hidden=\"true\"><path d=\"M14 4.1 12 6\"></path><path d=\"m5.1 8-2.9-.8\"></path><path d=\"m6 12-1.9 2\"></path><path d=\"M7.2 2.2 8 5.1\"></path><path d=\"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z\"></path></svg></button><button type=\"button\" class=\"absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity\" title=\"Delete symbol\" aria-label=\"Delete symbol\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trash2 lucide-trash-2\" aria-hidden=\"true\"><path d=\"M10 11v6\"></path><path d=\"M14 11v6\"></path><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"></path><path d=\"M3 6h18\"></path><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg></button></div></div></div></div>";
const FROZEN_NAMING_TOOLBAR = "<div class=\"flex items-center gap-1\" role=\"toolbar\" aria-label=\"Symbol naming actions\" aria-describedby=\"symbol-action-review-status\" title=\"Use arrow keys to review symbol actions\"><span id=\"symbol-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Symbol naming actions</span><input class=\"input-num flex-1\" placeholder=\"Symbol name\" aria-label=\"Symbol name\" type=\"text\" value=\"\"><button type=\"button\" data-symbol-naming-action=\"true\" data-symbol-naming-action-review=\"Save symbol\" class=\"btn p-1\" aria-label=\"Save symbol\" title=\"Save (Enter)\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-check\" aria-hidden=\"true\"><path d=\"M20 6 9 17l-5-5\"></path></svg></button><button type=\"button\" data-symbol-naming-action=\"true\" data-symbol-naming-action-review=\"Cancel\" class=\"btn p-1\" aria-label=\"Cancel\" title=\"Cancel (Esc)\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-x\" aria-hidden=\"true\"><path d=\"M18 6 6 18\"></path><path d=\"m6 6 12 12\"></path></svg></button></div>";
const FROZEN_NAMING_TOOLBAR_SAVE_FOCUS = "<div class=\"flex items-center gap-1\" role=\"toolbar\" aria-label=\"Symbol naming actions\" aria-describedby=\"symbol-action-review-status\" title=\"Use arrow keys to review symbol actions\"><span id=\"symbol-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Save symbol</span><input class=\"input-num flex-1\" placeholder=\"Symbol name\" aria-label=\"Symbol name\" type=\"text\" value=\"\"><button type=\"button\" data-symbol-naming-action=\"true\" data-symbol-naming-action-review=\"Save symbol\" class=\"btn p-1\" aria-label=\"Save symbol\" title=\"Save (Enter)\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-check\" aria-hidden=\"true\"><path d=\"M20 6 9 17l-5-5\"></path></svg></button><button type=\"button\" data-symbol-naming-action=\"true\" data-symbol-naming-action-review=\"Cancel\" class=\"btn p-1\" aria-label=\"Cancel\" title=\"Cancel (Esc)\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-x\" aria-hidden=\"true\"><path d=\"M18 6 6 18\"></path><path d=\"m6 6 12 12\"></path></svg></button></div>";
const FROZEN_SEARCH_TOOLBAR_SYMBOLS = "<div class=\"contents\" role=\"toolbar\" aria-label=\"Library search actions\" aria-describedby=\"symbol-library-search-action-review-status\" title=\"Use arrow keys to review library actions\"><span id=\"symbol-library-search-action-review-status\" class=\"sr-only\" aria-live=\"polite\">Reviewing Library search actions</span><button type=\"button\" class=\"btn !py-1 !px-1.5 !text-[10px] shrink-0\" data-library-search-action=\"true\" data-library-search-action-review=\"Insert first search result\" title=\"Insert first search result\">Insert First</button><button type=\"button\" class=\"btn !py-1 !px-1.5 !text-[10px] shrink-0\" data-library-search-action=\"true\" data-library-search-action-review=\"Clear search\" title=\"Clear search\">Clear search</button></div>";


// ---- AssetsPanel ------------------------------------------------------------------

describe('AssetsPanel migration — frozen legacy DOM (byte-exact)', () => {
  it('renders the full initial panel byte-identically; region precedes the grid', () => {
    const c = mountPanel(<AssetsPanel />);
    expect((c.firstElementChild as HTMLElement).outerHTML).toBe(FROZEN_ASSETS_PANEL);
    expect(countSpan(c)).toBe('7 assets');
    const grid = c.querySelector('[role="grid"]')!;
    expect(grid.previousElementSibling!.id).toBe('asset-grid-review-status');
    expect(regionText('asset-grid-review-status')).toBe('Reviewing Anchor 1 / 7. Press Enter to insert');
    expect(grid.outerHTML).toBe(frozenAssetGrid(0));
  });

  it('action toolbar announces the focused Import action byte-identically', () => {
    const c = mountPanel(<AssetsPanel />);
    act(() => c.querySelector<HTMLElement>('[data-asset-action]')!.focus());
    expect(c.querySelector('[aria-describedby="asset-action-review-status"]')!.outerHTML).toBe(FROZEN_ASSET_TOOLBAR_IMPORT_FOCUS);
    expect(regionText('asset-action-review-status')).toBe('Reviewing Import an image into the library');
  });

  it('search toolbar bytes: matches and zero-matches variants (pinned kit form)', () => {
    const c = mountPanel(<AssetsPanel />);
    type(searchInput(c), 'o');
    expect(countSpan(c)).toBe('5 / 7 matches');
    expect(c.querySelector('[aria-describedby="library-search-action-review-status"]')!.outerHTML).toBe(FROZEN_SEARCH_TOOLBAR_ASSETS);
    type(searchInput(c), 'zzz');
    expect(countSpan(c)).toBe('0 / 7 matches');
    expect(c.querySelector('[aria-describedby="library-search-action-review-status"]')!.outerHTML).toBe(FROZEN_SEARCH_TOOLBAR_ASSETS_ZERO);
    expect(c.querySelector('[role="grid"]')).toBeNull();
    expect(c.querySelector('#asset-grid-review-status')).toBeNull();
    expect(c.textContent).toContain('No assets found.');
  });
});

describe('AssetsPanel migration — grid keyboard snapshots (legacy-frozen)', () => {
  it('four-way roving: ±1 crosses rows, ±3 jumps rows, clamps, Home/End, region + aria-selected follow', async () => {
    const c = mountPanel(<AssetsPanel />);
    const all = assetTiles(c);
    act(() => all[0].focus());
    await flushFrames();

    expect(await press(all[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(all[1]);
    expect(regionText('asset-grid-review-status')).toBe('Reviewing Bolt 2 / 7. Press Enter to insert');
    expect(all[1].getAttribute('aria-selected')).toBe('true');
    expect(all[0].getAttribute('aria-selected')).toBe('false');
    expect(c.querySelector('[role="grid"]')!.outerHTML).toBe(frozenAssetGrid(1));

    expect(await press(all[1], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[4]);
    expect(regionText('asset-grid-review-status')).toBe('Reviewing Eyelet 5 / 7. Press Enter to insert');
    expect(await press(all[4], 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(all[1]);

    // Clamped at the first tile.
    expect(await press(all[1], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(all[0]);
    expect(await press(all[0], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(all[0]);
    expect(await press(all[0], 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(all[0]);

    // Home/End absolute; clamp past the last tile (7 tiles = 3+3+1 short tail).
    expect(await press(all[0], 'End')).toBe(true);
    expect(document.activeElement).toBe(all[6]);
    expect(regionText('asset-grid-review-status')).toBe('Reviewing Grommet 7 / 7. Press Enter to insert');
    expect(await press(all[6], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(all[6]);
    expect(await press(all[6], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[6]);
    expect(await press(all[6], 'Home')).toBe(true);
    expect(document.activeElement).toBe(all[0]);

    // Row 2 down onto the tail (3+3=6 exact), row 2 end clamps (5+3→6).
    expect(await press(all[0], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[3]);
    expect(await press(all[3], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[6]);
    act(() => all[5].focus()); // moves are read from activeElement, not target
    await flushFrames();
    expect(await press(all[5], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[6]);

    // Unrelated keys pass through untouched.
    expect(await press(all[6], 'z')).toBe(false);
    expect(document.activeElement).toBe(all[6]);
  });

  it('plain focus (Tab) moves the review index without keyboard navigation', async () => {
    const c = mountPanel(<AssetsPanel />);
    const all = assetTiles(c);
    act(() => all[2].focus());
    await flushFrames();
    expect(regionText('asset-grid-review-status')).toBe('Reviewing Clip 3 / 7. Press Enter to insert');
    expect(all.map((tile) => tile.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false', 'false', 'false']);
  });
});

describe('AssetsPanel migration — toolbar + search keyboard snapshots (legacy-frozen)', () => {
  it('action toolbar: wrapping arrows + Home/End with focus review', () => {
    const c = mountPanel(<AssetsPanel />);
    const [importBtn, traceBtn] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-asset-action]'));
    act(() => importBtn.focus());
    expect(regionText('asset-action-review-status')).toBe('Reviewing Import an image into the library');
    expect(pressSync(importBtn, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(traceBtn);
    expect(regionText('asset-action-review-status')).toBe('Reviewing Trace the selected raster image into a polygon');
    expect(pressSync(traceBtn, 'ArrowRight')).toBe(true); // wrap
    expect(document.activeElement).toBe(importBtn);
    expect(pressSync(importBtn, 'ArrowLeft')).toBe(true); // wrap back
    expect(document.activeElement).toBe(traceBtn);
    expect(pressSync(traceBtn, 'End')).toBe(true);
    expect(document.activeElement).toBe(traceBtn);
    expect(pressSync(traceBtn, 'Home')).toBe(true);
    expect(document.activeElement).toBe(importBtn);
    expect(pressSync(importBtn, 'z')).toBe(false);
  });

  it('action toolbar: disabled Trace is skipped entirely while a trace is running', async () => {
    vi.mocked(traceSelectedImage).mockReturnValue(new Promise<boolean>(() => {}));
    const c = mountPanel(<AssetsPanel />);
    const [importBtn, traceBtn] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-asset-action]'));
    await act(async () => { traceBtn.click(); });
    expect(traceBtn.disabled).toBe(true);
    expect(traceBtn.getAttribute('aria-busy')).toBe('true');
    act(() => importBtn.focus());
    expect(pressSync(importBtn, 'ArrowRight')).toBe(true); // skips disabled Trace, wraps
    expect(document.activeElement).toBe(importBtn);
    expect(regionText('asset-action-review-status')).toBe('Reviewing Import an image into the library');
    expect(pressSync(importBtn, 'End')).toBe(true);
    expect(document.activeElement).toBe(importBtn); // last ENABLED button
  });

  it('search toolbar: wrapping arrows + Home/End, skipDisabled keeps roving on Clear at zero matches', () => {
    const c = mountPanel(<AssetsPanel />);
    type(searchInput(c), 'o');
    const [insertFirst, clear] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-library-search-action]'));
    act(() => insertFirst.focus());
    expect(regionText('library-search-action-review-status')).toBe('Reviewing Insert first search result');
    expect(pressSync(insertFirst, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(regionText('library-search-action-review-status')).toBe('Reviewing Clear search');
    expect(pressSync(clear, 'ArrowRight')).toBe(true); // wrap
    expect(document.activeElement).toBe(insertFirst);
    expect(pressSync(insertFirst, 'ArrowLeft')).toBe(true); // wrap back
    expect(document.activeElement).toBe(clear);
    expect(pressSync(clear, 'End')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(pressSync(clear, 'Home')).toBe(true);
    expect(document.activeElement).toBe(insertFirst);
    expect(pressSync(insertFirst, 'z')).toBe(false);

    type(searchInput(c), 'zzz');
    const [disabledFirst, onlyClear] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-library-search-action]'));
    expect(disabledFirst.disabled).toBe(true);
    act(() => onlyClear.focus());
    expect(pressSync(onlyClear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(onlyClear);
    expect(regionText('library-search-action-review-status')).toBe('Reviewing Clear search');

    act(() => onlyClear.click());
    expect(searchInput(c).value).toBe('');
    expect(c.querySelector('[data-library-search-action]')).toBeNull();
    expect(countSpan(c)).toBe('7 assets');
  });

  it('search input: Enter inserts the first match, ArrowDown focuses the first tile, Escape clears', async () => {
    const c = mountPanel(<AssetsPanel />);
    const input = searchInput(c);
    type(input, 'o');
    expect(await press(input, 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(assetTiles(c)[0]);
    expect(regionText('asset-grid-review-status')).toBe('Reviewing Anchor 1 / 5. Press Enter to insert');

    expect(await press(input, 'Enter')).toBe(true);
    expect(insertAsset).toHaveBeenCalledWith(ASSETS[0]);

    // Escape only clears when a query exists.
    type(input, 'zzz');
    expect(await press(input, 'Escape')).toBe(true);
    expect(input.value).toBe('');
    expect(await press(input, 'Escape')).toBe(false);
    expect(await press(input, 'Enter')).toBe(false);
  });

  it('tiles: Delete/Backspace remove, click inserts, remove-button does not insert', () => {
    const c = mountPanel(<AssetsPanel />);
    const all = assetTiles(c);
    act(() => all[0].focus());
    expect(pressSync(all[0], 'Delete')).toBe(true);
    expect(removeAsset).toHaveBeenCalledWith('asset-a');
    expect(toast.success).toHaveBeenCalledWith('Asset removed from library');
    expect(pressSync(all[1], 'Backspace')).toBe(true);
    expect(removeAsset).toHaveBeenCalledWith('asset-b');
    act(() => all[2].click());
    expect(insertAsset).toHaveBeenCalledWith(ASSETS[2]);
    const removeBtn = all[3].parentElement!.querySelector<HTMLButtonElement>('[title="Remove from library"]')!;
    act(() => removeBtn.click());
    expect(removeAsset).toHaveBeenCalledWith('asset-d');
    expect(insertAsset).toHaveBeenCalledTimes(1);
  });
});

// ---- SymbolsPanel ----------------------------------------------------------------

describe('SymbolsPanel migration — frozen legacy DOM (byte-exact)', () => {
  it('renders the full initial panel byte-identically; region precedes the grid', () => {
    const c = mountPanel(<SymbolsPanel />);
    expect((c.firstElementChild as HTMLElement).outerHTML).toBe(FROZEN_SYMBOLS_PANEL);
    expect(countSpan(c)).toBe('5 symbols');
    const grid = c.querySelector('[role="grid"]')!;
    expect(grid.previousElementSibling!.id).toBe('symbol-grid-review-status');
    expect(regionText('symbol-grid-review-status')).toBe('Reviewing Sail 1 / 5. Press Enter to insert');
    expect(grid.outerHTML).toBe(frozenSymbolGrid(0));
  });

  it('naming toolbar bytes: fallback and focused-Save variants (pinned kit form)', () => {
    const c = mountPanel(<SymbolsPanel />);
    const saveBtn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Symbol')!;
    act(() => saveBtn.click());
    const toolbar = c.querySelector('[aria-describedby="symbol-action-review-status"]')!;
    expect(toolbar.outerHTML).toBe(FROZEN_NAMING_TOOLBAR);
    // Opening the naming row focuses the name input.
    expect(document.activeElement).toBe(toolbar.querySelector('input')!);
    act(() => c.querySelector<HTMLElement>('[data-symbol-naming-action]')!.focus());
    expect(c.querySelector('[aria-describedby="symbol-action-review-status"]')!.outerHTML).toBe(FROZEN_NAMING_TOOLBAR_SAVE_FOCUS);
    expect(regionText('symbol-action-review-status')).toBe('Reviewing Save symbol');
  });

  it('search toolbar bytes with matches (pinned kit form)', () => {
    const c = mountPanel(<SymbolsPanel />);
    type(searchInput(c), 'o');
    expect(countSpan(c)).toBe('3 / 5 matches');
    expect(c.querySelector('[aria-describedby="symbol-library-search-action-review-status"]')!.outerHTML).toBe(FROZEN_SEARCH_TOOLBAR_SYMBOLS);
  });
});

describe('SymbolsPanel migration — grid keyboard snapshots (legacy-frozen)', () => {
  it('four-way roving: ±1 crosses rows, ±3 jumps rows, clamps on the 2-tile tail, Home/End', async () => {
    const c = mountPanel(<SymbolsPanel />);
    const all = symbolTiles(c);
    act(() => all[0].focus());
    await flushFrames();

    expect(await press(all[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(all[1]);
    expect(regionText('symbol-grid-review-status')).toBe('Reviewing Knot 2 / 5. Press Enter to insert');
    expect(all[1].getAttribute('aria-selected')).toBe('true');
    expect(c.querySelector('[role="grid"]')!.outerHTML).toBe(frozenSymbolGrid(1));

    expect(await press(all[1], 'ArrowDown')).toBe(true); // 1+3=4 exact
    expect(document.activeElement).toBe(all[4]);
    expect(regionText('symbol-grid-review-status')).toBe('Reviewing Rope 5 / 5. Press Enter to insert');
    expect(await press(all[4], 'ArrowDown')).toBe(true); // clamp
    expect(document.activeElement).toBe(all[4]);
    expect(await press(all[4], 'ArrowRight')).toBe(true); // clamp
    expect(document.activeElement).toBe(all[4]);
    act(() => all[3].focus()); // moves are read from activeElement, not target
    await flushFrames();
    expect(await press(all[3], 'ArrowDown')).toBe(true); // 3+3=6 → 4
    expect(document.activeElement).toBe(all[4]);
    expect(await press(all[4], 'ArrowUp')).toBe(true); // 4-3=1
    expect(document.activeElement).toBe(all[1]);
    expect(await press(all[1], 'ArrowUp')).toBe(true); // clamp at 0
    expect(document.activeElement).toBe(all[0]);
    expect(await press(all[0], 'End')).toBe(true);
    expect(document.activeElement).toBe(all[4]);
    expect(await press(all[4], 'Home')).toBe(true);
    expect(document.activeElement).toBe(all[0]);
    expect(await press(all[0], 'z')).toBe(false);
  });

  it('plain focus (Tab) moves the review index; tile click inserts', async () => {
    const c = mountPanel(<SymbolsPanel />);
    const all = symbolTiles(c);
    act(() => all[3].focus());
    await flushFrames();
    expect(regionText('symbol-grid-review-status')).toBe('Reviewing Wharf 4 / 5. Press Enter to insert');
    expect(all.map((tile) => tile.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    act(() => all[2].click());
    expect(insertSymbol).toHaveBeenCalledWith('sym-3');
  });
});

describe('SymbolsPanel migration — naming + search + tile snapshots (legacy-frozen)', () => {
  function openNaming(c: HTMLElement): HTMLInputElement {
    const saveBtn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Symbol')!;
    act(() => saveBtn.click());
    return c.querySelector<HTMLInputElement>('[aria-describedby="symbol-action-review-status"] input')!;
  }

  it('naming toolbar: wrapping arrows + Home/End from the buttons, Enter commits, Escape cancels', () => {
    const c = mountPanel(<SymbolsPanel />);
    openNaming(c);
    const [save, cancel] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]'));
    act(() => save.focus());
    expect(regionText('symbol-action-review-status')).toBe('Reviewing Save symbol');
    expect(pressSync(save, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(regionText('symbol-action-review-status')).toBe('Reviewing Cancel');
    expect(pressSync(cancel, 'ArrowRight')).toBe(true); // wrap
    expect(document.activeElement).toBe(save);
    expect(pressSync(save, 'ArrowLeft')).toBe(true); // wrap back
    expect(document.activeElement).toBe(cancel);
    expect(pressSync(cancel, 'End')).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(pressSync(cancel, 'Home')).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(pressSync(save, 'z')).toBe(false);

    // Enter commits the typed name; the row returns to the save buttons.
    const input = c.querySelector<HTMLInputElement>('[aria-describedby="symbol-action-review-status"] input')!;
    type(input, 'Buoy 2');
    expect(pressSync(input, 'Enter')).toBe(true);
    expect(saveSelectionAsSymbol).toHaveBeenCalledWith('Buoy 2');
    expect(c.querySelector('[data-symbol-naming-action]')).toBeNull();

    // Empty name falls back to "Symbol".
    openNaming(c);
    const fresh = c.querySelector<HTMLInputElement>('[aria-describedby="symbol-action-review-status"] input')!;
    expect(pressSync(fresh, 'Enter')).toBe(true);
    expect(saveSelectionAsSymbol).toHaveBeenCalledWith('Symbol');

    // Escape cancels without saving.
    openNaming(c);
    const third = c.querySelector<HTMLInputElement>('[aria-describedby="symbol-action-review-status"] input')!;
    type(third, 'Nope');
    expect(pressSync(third, 'Escape')).toBe(true);
    expect(c.querySelector('[data-symbol-naming-action]')).toBeNull();
    expect(saveSelectionAsSymbol).toHaveBeenCalledTimes(2);
  });

  it('naming toolbar: arrows bubbling from the auto-focused name input use the legacy entry point (ArrowRight → Save)', () => {
    const c = mountPanel(<SymbolsPanel />);
    const input = openNaming(c);
    expect(document.activeElement).toBe(input);
    // ArrowRight from the input starts "before the first" button → Save.
    expect(pressSync(input, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(c.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]')[0]);
    expect(regionText('symbol-action-review-status')).toBe('Reviewing Save symbol');
    // Close via Cancel (the naming row is still open), reopen, then ArrowLeft
    // from the input wraps onto Cancel.
    act(() => c.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]')[1].click());
    const again = openNaming(c);
    expect(pressSync(again, 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(c.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]')[1]);
    expect(regionText('symbol-action-review-status')).toBe('Reviewing Cancel');
  });

  it('save-row actions: Redefine and Break Link warn when nothing is selected', async () => {
    const c = mountPanel(<SymbolsPanel />);
    await act(async () => {
      Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Redefine')!.click();
    });
    expect(redefineSymbolFromSelection).toHaveBeenCalledTimes(1);
    expect(toast.warn).toHaveBeenCalledWith('Select a symbol instance first.');
    act(() => {
      Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Break Link')!.click();
    });
    expect(detachSymbolInstancesFromSelection).toHaveBeenCalledTimes(1);
    expect(toast.warn).toHaveBeenCalledWith('Select a symbol instance first.');
  });

  it('search toolbar + input: wrap, zero-match skipDisabled, Enter inserts first match, ArrowDown focuses first tile', async () => {
    const c = mountPanel(<SymbolsPanel />);
    type(searchInput(c), 'o');
    const [insertFirst, clear] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-library-search-action]'));
    act(() => insertFirst.focus());
    expect(regionText('symbol-library-search-action-review-status')).toBe('Reviewing Insert first search result');
    expect(pressSync(insertFirst, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(pressSync(clear, 'ArrowRight')).toBe(true); // wrap
    expect(document.activeElement).toBe(insertFirst);

    type(searchInput(c), 'zzz');
    const onlyClear = c.querySelectorAll<HTMLButtonElement>('[data-library-search-action]')[1];
    act(() => onlyClear.focus());
    expect(pressSync(onlyClear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(onlyClear);

    type(searchInput(c), 'o');
    const input = searchInput(c);
    expect(await press(input, 'Enter')).toBe(true);
    expect(insertSymbol).toHaveBeenCalledWith('sym-2'); // Knot is the first 'o' match
    expect(await press(input, 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(symbolTiles(c)[0]);
    expect(await press(input, 'Escape')).toBe(true);
    expect(input.value).toBe('');
  });

  it('tiles: F2 rename commit/cancel, Delete removes, instance selection warns', () => {
    const c = mountPanel(<SymbolsPanel />);
    const all = symbolTiles(c);
    // F2 → rename input; Enter commits a changed name.
    expect(pressSync(all[0], 'F2')).toBe(true);
    const renameInput = c.querySelector<HTMLInputElement>('input[aria-label="Symbol name"].w-full, input.w-full[aria-label="Symbol name"]');
    expect(renameInput).toBeTruthy();
    type(renameInput!, 'Sloop');
    expect(pressSync(renameInput!, 'Enter')).toBe(true);
    expect(renameSymbol).toHaveBeenCalledWith('sym-1', 'Sloop');

    // F2 → Escape cancels without renaming.
    expect(pressSync(all[1], 'F2')).toBe(true);
    const cancelInput = c.querySelector<HTMLInputElement>('input.w-full[aria-label="Symbol name"]')!;
    expect(pressSync(cancelInput, 'Escape')).toBe(true);
    expect(renameSymbol).toHaveBeenCalledTimes(1);

    // Delete removes the symbol; the instances button warns when none found.
    expect(pressSync(all[2], 'Delete')).toBe(true);
    expect(deleteSymbol).toHaveBeenCalledWith('sym-3');
    expect(toast.success).toHaveBeenCalledWith('Symbol removed from library');
    const instancesBtn = all[0].parentElement!.querySelector<HTMLButtonElement>('[title="Select symbol instances"]')!;
    act(() => instancesBtn.click());
    expect(selectSymbolInstances).toHaveBeenCalledWith('sym-1');
    expect(toast.warn).toHaveBeenCalledWith('No symbol instances found.');
  });
});

describe('intended kit deltas (pinned new forms)', () => {
  /** Parses one button's HTML into a sorted (name=value) signature + inner HTML. */
  const attrSignature = (buttonHtml: string): string => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buttonHtml;
    const button = wrapper.firstElementChild!;
    return `${button.tagName}[${Array.from(button.attributes)
      .map((attr) => `${attr.name}=${attr.value}`)
      .sort()
      .join('|')}]${button.innerHTML}`;
  };

  it('search-row buttons serialize class AFTER type but BEFORE the data-* attributes — attribute order is the only change', () => {
    const c = mountPanel(<AssetsPanel />);
    type(searchInput(c), 'o');
    const [insertFirst] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-library-search-action]'));
    // New kit byte form (class between type and the data-* pair)…
    expect(insertFirst.outerHTML).toBe(
      '<button type="button" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" data-library-search-action="true" data-library-search-action-review="Insert first search result" title="Insert first search result">Insert First</button>',
    );
    // …whose attribute SET and content are exactly the legacy bytes:
    expect(attrSignature(insertFirst.outerHTML)).toBe(attrSignature(
      '<button type="button" data-library-search-action="true" data-library-search-action-review="Insert first search result" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" title="Insert first search result">Insert First</button>',
    ));

    // The disabled variant keeps the disabled attribute (serialized after title).
    type(searchInput(c), 'zzz');
    const [disabledFirst] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-library-search-action]'));
    expect(disabledFirst.outerHTML).toBe(
      '<button type="button" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" data-library-search-action="true" data-library-search-action-review="Insert first search result" title="Insert first search result" disabled="">Insert First</button>',
    );
  });

  it('naming-toolbar Save and Cancel buttons keep their exact byte form', () => {
    const c = mountPanel(<SymbolsPanel />);
    act(() => Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Symbol')!.click());
    const [save] = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]'));
    // Byte-frozen exactly as in HEAD — the container moved to ActionToolbar
    // but the button JSX (and therefore its serialization order) never changed.
    expect(save.outerHTML).toBe(
      '<button type="button" data-symbol-naming-action="true" data-symbol-naming-action-review="Save symbol" class="btn p-1" aria-label="Save symbol" title="Save (Enter)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg></button>',
    );
    // The Cancel button keeps the same byte form.
    const cancel = c.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]')[1];
    expect(cancel.outerHTML.startsWith('<button type="button" data-symbol-naming-action="true" data-symbol-naming-action-review="Cancel" class="btn p-1"')).toBe(true);
  });
});

