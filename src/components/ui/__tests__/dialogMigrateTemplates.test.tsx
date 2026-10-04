import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TemplatesDialog } from '../../TemplatesDialog';
import { useEditor } from '../../../store/editor';

/**
 * Freeze-then-migrate suite for TemplatesDialog (dialog-kit migration).
 *
 * The frozen strings and behavior snapshots below were captured from the
 * pre-migration handwritten implementation (four inline roving handlers —
 * 2-D grid ±columns clamp, search wrap+skipDisabled, category wrap with an
 * onNavigate category-commit side effect, empty-state wrap — plus three
 * hand-rolled review toolbars, the grid-EXTERNAL live region, and the match
 * count live span). They pin:
 *
 * - the full initial panel DOM byte-for-byte (inline SVG thumbnails
 *   normalized to src="<SVG-THUMB>"; everything else exact), each toolbar's
 *   outerHTML across its state variants, and the Business 1-tile grid;
 * - the grid contract: ±1 freely crossing row boundaries, ±3 vertical rows,
 *   clamp at both ends (including the short-tail row), Home/End absolute,
 *   unrelated keys passed through, focus deferred to rAF, aria-selected +
 *   highlight class + external region text following reviewIndex — including
 *   via plain focus (Tab), not just keyboard moves;
 * - the search input shortcuts (Enter picks first / ArrowDown focuses the
 *   first tile / Escape closes via the capture-phase closer);
 * - the search toolbar wrap + skipDisabled contract, the category toolbar's
 *   every-move APPLIES the category (onNavigate), and the empty-state
 *   toolbar's conditional composition and recovery clicks.
 *
 * The migration swaps the four handlers for makeGridKeys/makeRovingKeys and
 * the search/category/empty toolbars for SearchableListActions/PresetRow/
 * ReviewedFooter (the grid container and its external live region stay
 * hand-rendered: the container is role="grid", which ActionToolbar cannot
 * express, and the region must remain its preceding sibling). Everything
 * frozen here must keep passing. The one intended DOM delta — the category
 * and empty-state buttons now serialize their class attribute AFTER the
 * data-* attributes (the kit rows' JSX order; behavior- and query-neutral) —
 * is baked into the frozen builders and pinned explicitly in the last
 * describe.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let roots: Root[];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function flushFrames(): Promise<void> {
  await act(async () => { await nextFrame(); });
  await act(async () => { await nextFrame(); });
}

/**
 * Mounts the dialog AND flushes the open effect's rAF (search input focus)
 * before returning, so that frame can never steal focus from later moves.
 */
async function mountDialog(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    useEditor.setState({ showTemplates: true });
    root.render(<TemplatesDialog />);
  });
  await flushFrames();
  return container;
}

/** Dispatches keydown (rAF-deferred grid focus is flushed) and returns defaultPrevented. */
async function press(el: Element, key: string): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => { el.dispatchEvent(event); });
  await flushFrames();
  return event.defaultPrevented;
}

/** Sibling of `press` for the non-deferred toolbars (no frame flush needed). */
function pressSync(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => el.dispatchEvent(event));
  return event.defaultPrevented;
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// ---- frozen DOM helpers (assembled exactly as the legacy bytes captured) -------

const normalizeThumbs = (html: string) => html.replace(/src="data:image\/svg\+xml;utf8,[^"]*"/g, 'src="<SVG-THUMB>"');

const searchInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="search"]')!;
const countSpan = (c: HTMLElement) => c.querySelector('.tabular-nums')!.textContent;
const gridRegionText = (c: HTMLElement) => c.querySelector('#template-grid-review-status')!.textContent;
const grid = (c: HTMLElement) => c.querySelector('[role="grid"]')!;
const tiles = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-template-index]'));
const searchToolbar = (c: HTMLElement) => c.querySelector('[aria-describedby="template-search-action-review-status"]')!;
const searchActions = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-template-search-action]'));
const categoryToolbar = (c: HTMLElement) => c.querySelector('[aria-describedby="template-category-action-review-status"]')!;
const categoryActions = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-template-category-action]'));
const emptyToolbar = (c: HTMLElement) => c.querySelector('[aria-describedby="template-empty-action-review-status"]')!;
const emptyActions = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-template-empty-action]'));

const CATEGORIES: Array<[name: string, count: number]> = [
  ['All', 6], ['Business', 1], ['Social', 1], ['Logo', 1], ['Print', 2], ['Stickers', 1],
];

const TEMPLATES_BY_INDEX: Array<[name: string, description: string]> = [
  ['Business Card', '90×54 mm card with name, title and accent corner.'],
  ['Square Social Post', '600×600 layout with bold headline and decorative shapes.'],
  ['Mountain Logo', 'Two-tone mountain monogram, centered.'],
  ['Poster A4', 'A4 poster with big headline, subhead and accent block.'],
  ['Sticker Pack', 'A grid of six colorful sticker discs with emoji labels.'],
  ['Flyer', 'Header strip, body block and footer info on letter-ish size.'],
];

const frozenTile = (index: number, selected: boolean): string => {
  const [name, description] = TEMPLATES_BY_INDEX[index];
  return `<button role="gridcell" data-template-index="${index}" aria-selected="${selected}" title="${name} — Press Enter to use template" class="text-left bg-panel2 border rounded-lg overflow-hidden hover:border-accent2 hover:shadow-md focus:border-accent2 focus:ring-1 focus:ring-accent2/60 outline-none transition-all group ${selected ? 'border-accent2 shadow-md ring-1 ring-accent2/40' : 'border-border'}"><div class="aspect-[4/3] bg-white flex items-center justify-center overflow-hidden"><img alt="${name}" draggable="false" class="w-full h-full object-contain group-hover:scale-[1.02] transition-transform" src="<SVG-THUMB>"></div><div class="p-3"><h4 class="text-ink text-xs font-semibold mb-0.5">${name}</h4><div class="text-muted text-[10px] leading-snug">${description}</div></div></button>`;
};

/** `indexes` are positions in TEMPLATES_BY_INDEX (render order); `selectedIndex` is a tile position. */
const frozenGrid = (indexes: number[], selectedIndex: number): string =>
  `<div class="grid grid-cols-3 gap-4" role="grid" aria-label="Template results" title="Use arrow keys to review templates" aria-describedby="template-grid-review-status">`
  + indexes.map((templateIndex, tilePosition) => frozenTile(templateIndex, tilePosition === selectedIndex)).join('')
  + `</div>`;

// INTENDED KIT DELTA vs the pre-migration bytes: PresetRow renders the button
// className AFTER the data-* attributes (legacy wrote class first). Attribute
// order only — see the "intended kit deltas" describe at the bottom.
const frozenCategoryButton = (name: string, count: number, pressed: boolean): string =>
  `<button type="button" data-template-category-action="true" data-template-category="${name}" data-template-category-review="${name} ${count} templates" class="btn !py-1 !px-2 text-xs ${pressed ? 'border-accent2 text-accent2 bg-accent2/10' : ''}" aria-pressed="${pressed}" title="${name} ${count} templates">${name} <span class="text-muted tabular-nums">${count}</span></button>`;

const frozenCategoryToolbar = (pressed: string, reviewText: string): string =>
  `<div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Template category filters" aria-describedby="template-category-action-review-status" title="Use arrow keys to review template categories"><span id="template-category-action-review-status" class="sr-only" aria-live="polite">Reviewing ${reviewText}</span>`
  + CATEGORIES.map(([name, count]) => frozenCategoryButton(name, count, name === pressed)).join('')
  + `</div>`;

// INTENDED KIT DELTA vs the pre-migration bytes: ReviewedFooter renders the
// button className AFTER the data-* attributes (legacy wrote class first).
const frozenEmptyButton = (className: string, review: string, label: string): string =>
  `<button type="button" data-template-empty-action="true" data-template-empty-action-review="${review}" class="${className}">${label}</button>`;

const EMPTY_CLEAR = frozenEmptyButton('btn !py-1.5 !px-2 text-xs', 'Clear search', 'Clear search');
const EMPTY_ALL_CATEGORIES = frozenEmptyButton('btn !py-1.5 !px-2 text-xs', 'Show all categories', 'Show all categories');
const EMPTY_RESET = frozenEmptyButton('btn-primary !py-1.5 !px-2 text-xs', 'Reset template filters', 'Reset filters');

const frozenEmptyToolbar = (reviewText: string, buttons: string): string =>
  `<div class="flex items-center justify-center gap-2 mt-4" role="toolbar" aria-label="Template empty-result actions" aria-describedby="template-empty-action-review-status" title="Use arrow keys to review empty-result actions"><span id="template-empty-action-review-status" class="sr-only" aria-live="polite">Reviewing ${reviewText}</span>${buttons}</div>`;

const frozenSearchToolbar = (reviewText: string, useFirstDisabled: boolean): string =>
  `<div class="flex items-center gap-2 shrink-0" role="toolbar" aria-label="Template search actions" aria-describedby="template-search-action-review-status" title="Use arrow keys to review template search actions"><span id="template-search-action-review-status" class="sr-only" aria-live="polite">Reviewing ${reviewText}</span><button type="button" class="btn !py-1.5 !px-2 text-xs shrink-0" data-template-search-action="true" data-template-search-action-review="Use first search result"${useFirstDisabled ? ' disabled=""' : ''} title="Use first search result">Use First</button><button type="button" class="btn !py-1.5 !px-2 text-xs shrink-0" data-template-search-action="true" data-template-search-action-review="Clear search" title="Clear search">Clear search</button></div>`;

const frozenPanel = (): string =>
  '<div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="templates-dialog-title">'
  + '<div class="bg-panel border border-border rounded-lg shadow-2xl w-[760px] max-h-[80vh] overflow-hidden flex flex-col">'
  + '<div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2"><h2 id="templates-dialog-title" class="dialog-title">New from Template</h2><button class="btn-dialog-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>'
  + '<div class="px-5 py-3 border-b border-border bg-panel/80"><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search text-muted shrink-0" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg><input class="input text-sm min-w-0 flex-1" placeholder="Search templates…" aria-label="Search templates…" title="Press Enter to use first search result · Press Arrow Down to focus first template" type="search" value=""><span class="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">6 templates</span></div></div>'
  + `<div class="px-5 py-2.5 border-b border-border bg-panel2/50">${frozenCategoryToolbar('All', 'Template category filters')}</div>`
  + '<div class="p-5 overflow-y-auto">'
  + '<div id="template-grid-review-status" class="sr-only" aria-live="polite">Reviewing Business Card 1 / 6. Press Enter to use template</div>'
  + frozenGrid([0, 1, 2, 3, 4, 5], 0)
  + '</div></div></div>';

// ---- the suite ----------------------------------------------------------------

describe('TemplatesDialog migration — frozen legacy DOM (byte-exact)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showTemplates: false }));
  });

  it('renders the full initial panel byte-identically; the grid region is the grid\'s preceding sibling', async () => {
    const c = await mountDialog();
    expect(normalizeThumbs((c.firstElementChild as HTMLElement).outerHTML)).toBe(frozenPanel());
    // The open effect focuses the search input after one frame.
    expect(document.activeElement).toBe(searchInput(c));
    // External live region: immediately before the grid, same parent, id wired via aria-describedby.
    expect(grid(c).previousElementSibling!.id).toBe('template-grid-review-status');
    expect(grid(c).parentElement).toBe(c.querySelector('#template-grid-review-status')!.parentElement);
    expect(grid(c).getAttribute('aria-describedby')).toBe('template-grid-review-status');
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 6. Press Enter to use template');
  });

  it('search toolbar: fallback initially with query, focused review, and Use First disabled at zero matches', async () => {
    const c = await mountDialog();
    expect(searchToolbar(c)).toBeNull();
    type(searchInput(c), 'a');
    expect(countSpan(c)).toBe('6 / 6 matches');
    expect(searchToolbar(c).outerHTML).toBe(frozenSearchToolbar('Template search actions', false));
    act(() => searchActions(c)[0].focus());
    expect(searchToolbar(c).outerHTML).toBe(frozenSearchToolbar('Use first search result', false));
    type(searchInput(c), '');
    type(searchInput(c), 'zzz');
    expect(countSpan(c)).toBe('0 / 6 matches');
    // Use First is disabled now, but its review announcement persists (typing
    // does not reset the reviewed action) — the frozen legacy behavior.
    expect(searchToolbar(c).outerHTML).toBe(frozenSearchToolbar('Use first search result', true));
  });

  it('category toolbar: fallback initial, Business-pressed variant, focused review text', async () => {
    const c = await mountDialog();
    expect(categoryToolbar(c).outerHTML).toBe(frozenCategoryToolbar('All', 'Template category filters'));
    act(() => categoryActions(c)[1].click());
    expect(categoryToolbar(c).outerHTML).toBe(frozenCategoryToolbar('Business', 'Template category filters'));
    expect(countSpan(c)).toBe('1 templates · Business');
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 1. Press Enter to use template');
    act(() => categoryActions(c)[1].focus());
    expect(categoryToolbar(c).outerHTML).toBe(frozenCategoryToolbar('Business', 'Business 1 templates'));
  });

  it('Business grid renders one selected tile byte-identically', async () => {
    const c = await mountDialog();
    act(() => categoryActions(c)[1].click());
    expect(normalizeThumbs(grid(c).outerHTML)).toBe(frozenGrid([0], 0));
  });

  it('empty state: query-only (2 actions), query+category (3 actions), focused review', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'zzz');
    expect(c.querySelector('[role="grid"]')).toBeNull();
    expect(c.querySelector('#template-grid-review-status')).toBeNull();
    expect(emptyToolbar(c).outerHTML).toBe(frozenEmptyToolbar('Template empty-result actions', EMPTY_CLEAR + EMPTY_RESET));
    act(() => categoryActions(c)[5].click()); // Stickers + zzz → still empty, three actions.
    expect(emptyToolbar(c).outerHTML).toBe(frozenEmptyToolbar('Template empty-result actions', EMPTY_CLEAR + EMPTY_ALL_CATEGORIES + EMPTY_RESET));
    act(() => emptyActions(c)[2].focus());
    expect(emptyToolbar(c).outerHTML).toBe(frozenEmptyToolbar('Reset template filters', EMPTY_CLEAR + EMPTY_ALL_CATEGORIES + EMPTY_RESET));
  });
});

describe('TemplatesDialog migration — grid keyboard snapshots (legacy-frozen)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showTemplates: false }));
  });

  it('four-way roving: ±1 crosses rows, ±3 jumps rows, clamps, Home/End, region + aria-selected follow', async () => {
    const c = await mountDialog();
    const all = tiles(c);
    act(() => all[0].focus());
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 6. Press Enter to use template');

    // Horizontal ±1 crosses row boundaries freely.
    expect(await press(all[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(all[1]);
    expect(gridRegionText(c)).toBe('Reviewing Square Social Post 2 / 6. Press Enter to use template');
    expect(all[1].getAttribute('aria-selected')).toBe('true');
    expect(all[0].getAttribute('aria-selected')).toBe('false');
    expect(all[1].className.endsWith('group border-accent2 shadow-md ring-1 ring-accent2/40')).toBe(true);

    // Vertical ±columns.
    expect(await press(all[1], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[4]);
    expect(gridRegionText(c)).toBe('Reviewing Sticker Pack 5 / 6. Press Enter to use template');
    expect(await press(all[4], 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(all[1]);

    // Clamped at both ends.
    expect(await press(all[1], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(all[0]);
    expect(await press(all[0], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(all[0]);
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 6. Press Enter to use template');

    // Home/End absolute; End from anywhere reaches the last tile; ArrowRight/Down clamp there.
    expect(await press(all[0], 'End')).toBe(true);
    expect(document.activeElement).toBe(all[5]);
    expect(gridRegionText(c)).toBe('Reviewing Flyer 6 / 6. Press Enter to use template');
    expect(await press(all[5], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(all[5]);
    expect(await press(all[5], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[5]);
    expect(await press(all[5], 'Home')).toBe(true);
    expect(document.activeElement).toBe(all[0]);

    // Second row ArrowDown clamps onto the tail (index 3+3=6 → 5).
    expect(await press(all[0], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[3]);
    expect(await press(all[3], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(all[5]);

    // Unrelated keys pass through untouched (focus stays on the last tile).
    expect(await press(all[5], 'z')).toBe(false);
    expect(document.activeElement).toBe(all[5]);
  });

  it('short tail row (Print, 2 tiles): vertical and horizontal moves clamp to the last tile', async () => {
    const c = await mountDialog();
    act(() => categoryActions(c)[4].click()); // Print → Poster A4, Flyer
    const printTiles = tiles(c);
    expect(printTiles).toHaveLength(2);
    act(() => printTiles[0].focus());
    expect(gridRegionText(c)).toBe('Reviewing Poster A4 1 / 2. Press Enter to use template');
    expect(await press(printTiles[0], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(printTiles[1]);
    expect(gridRegionText(c)).toBe('Reviewing Flyer 2 / 2. Press Enter to use template');
    expect(await press(printTiles[1], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(printTiles[1]);
    expect(await press(printTiles[1], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(printTiles[1]);
    expect(await press(printTiles[0], 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(printTiles[0]);
    expect(await press(printTiles[1], 'Home')).toBe(true);
    expect(document.activeElement).toBe(printTiles[0]);
  });

  it('plain focus (Tab) moves the review index without keyboard navigation', async () => {
    const c = await mountDialog();
    const all = tiles(c);
    act(() => all[2].focus());
    await flushFrames();
    expect(gridRegionText(c)).toBe('Reviewing Mountain Logo 3 / 6. Press Enter to use template');
    expect(all.map((tileEl) => tileEl.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false', 'false']);
  });
});

describe('TemplatesDialog migration — search / category / empty keyboard snapshots (legacy-frozen)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showTemplates: false }));
  });

  it('search input: ArrowDown focuses the first tile, Enter picks the first match and closes, Escape closes', async () => {
    const c = await mountDialog();
    const input = searchInput(c);
    type(input, 'a');
    expect(await press(input, 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(tiles(c)[0]);
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 6. Press Enter to use template');

    // Escape is captured at document level and closes the dialog; the query survives.
    expect(await press(input, 'Escape')).toBe(true);
    expect(useEditor.getState().showTemplates).toBe(false);
    act(() => useEditor.setState({ showTemplates: true }));
    expect(searchInput(c).value).toBe('a');

    // Enter picks the first match (no canvas in tests → close).
    expect(await press(searchInput(c), 'Enter')).toBe(true);
    expect(useEditor.getState().showTemplates).toBe(false);

    // Enter with zero matches does nothing.
    const fresh = await mountDialog();
    type(searchInput(fresh), 'zzz');
    expect(await press(searchInput(fresh), 'Enter')).toBe(false);
    expect(useEditor.getState().showTemplates).toBe(true);
  });

  it('search toolbar: wrapping arrows + Home/End, skipDisabled keeps roving on the enabled Clear', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'a');
    const [useFirst, clear] = searchActions(c);
    act(() => useFirst.focus());
    expect(c.querySelector('#template-search-action-review-status')!.textContent).toBe('Reviewing Use first search result');
    expect(pressSync(useFirst, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(c.querySelector('#template-search-action-review-status')!.textContent).toBe('Reviewing Clear search');
    expect(pressSync(clear, 'ArrowRight')).toBe(true); // wrap
    expect(document.activeElement).toBe(useFirst);
    expect(pressSync(useFirst, 'ArrowLeft')).toBe(true); // wrap back
    expect(document.activeElement).toBe(clear);
    expect(pressSync(clear, 'End')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(pressSync(clear, 'Home')).toBe(true);
    expect(document.activeElement).toBe(useFirst);
    expect(pressSync(useFirst, 'z')).toBe(false);

    // Zero matches: Use First is disabled and skipped entirely.
    type(searchInput(c), 'zzz');
    const [disabledUseFirst, onlyClear] = searchActions(c);
    expect(disabledUseFirst.disabled).toBe(true);
    act(() => onlyClear.focus());
    expect(c.querySelector('#template-search-action-review-status')!.textContent).toBe('Reviewing Clear search');
    expect(pressSync(onlyClear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(onlyClear);
    expect(c.querySelector('#template-search-action-review-status')!.textContent).toBe('Reviewing Clear search');

    // Clicks: Use First closes (no canvas), Clear search empties the query.
    type(searchInput(c), 'a');
    act(() => searchActions(c)[0].click());
    expect(useEditor.getState().showTemplates).toBe(false);
    const reopened = await mountDialog();
    type(searchInput(reopened), 'a');
    act(() => searchActions(reopened)[1].click());
    expect(searchInput(reopened).value).toBe('');
    expect(searchToolbar(reopened)).toBeNull();
    expect(countSpan(reopened)).toBe('6 templates');
  });

  it('category toolbar: wrapping arrows + Home/End, every move APPLIES the category and resets the review index', async () => {
    const c = await mountDialog();
    const cats = categoryActions(c);
    act(() => cats[0].focus());
    expect(c.querySelector('#template-category-action-review-status')!.textContent).toBe('Reviewing All 6 templates');

    expect(pressSync(cats[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(cats[1]);
    expect(c.querySelector('#template-category-action-review-status')!.textContent).toBe('Reviewing Business 1 templates');
    expect(cats[1].getAttribute('aria-pressed')).toBe('true');
    expect(cats[0].getAttribute('aria-pressed')).toBe('false');
    expect(tiles(c)).toHaveLength(1);
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 1. Press Enter to use template');
    expect(countSpan(c)).toBe('1 templates · Business');

    expect(pressSync(cats[1], 'ArrowRight')).toBe(true);
    expect(gridRegionText(c)).toBe('Reviewing Square Social Post 1 / 1. Press Enter to use template');

    // Wrap from the first back to the last.
    act(() => cats[0].focus());
    expect(pressSync(cats[0], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(cats[5]);
    expect(c.querySelector('#template-category-action-review-status')!.textContent).toBe('Reviewing Stickers 1 templates');
    expect(gridRegionText(c)).toBe('Reviewing Sticker Pack 1 / 1. Press Enter to use template');

    expect(pressSync(cats[5], 'End')).toBe(true);
    expect(document.activeElement).toBe(cats[5]);
    expect(pressSync(cats[5], 'Home')).toBe(true);
    expect(document.activeElement).toBe(cats[0]);
    expect(tiles(c)).toHaveLength(6);
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 6. Press Enter to use template');

    // Clicking a category resets the review index (Flyer 2/2 → All 1/6).
    act(() => cats[4].click()); // Print
    expect(gridRegionText(c)).toBe('Reviewing Poster A4 1 / 2. Press Enter to use template');
  });

  it('empty toolbar: wrapping arrows across the conditional actions, recovery clicks refocus search', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'zzz');
    act(() => categoryActions(c)[5].click()); // Stickers: 3 actions
    const [clear, allCats, reset] = emptyActions(c);
    act(() => clear.focus());
    expect(c.querySelector('#template-empty-action-review-status')!.textContent).toBe('Reviewing Clear search');
    expect(pressSync(clear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(allCats);
    expect(c.querySelector('#template-empty-action-review-status')!.textContent).toBe('Reviewing Show all categories');
    expect(pressSync(allCats, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(reset);
    expect(c.querySelector('#template-empty-action-review-status')!.textContent).toBe('Reviewing Reset template filters');
    expect(pressSync(reset, 'ArrowRight')).toBe(true); // wrap
    expect(document.activeElement).toBe(clear);
    expect(pressSync(clear, 'ArrowLeft')).toBe(true); // wrap back
    expect(document.activeElement).toBe(reset);
    expect(pressSync(reset, 'End')).toBe(true);
    expect(document.activeElement).toBe(reset);
    expect(pressSync(reset, 'Home')).toBe(true);
    expect(document.activeElement).toBe(clear);

    // Show all categories: back to All, still zero matches, two actions left.
    act(() => emptyActions(c)[1].click());
    expect(useEditor.getState().showTemplates).toBe(true);
    expect(emptyActions(c).map((b) => b.textContent)).toEqual(['Clear search', 'Reset filters']);
    expect(c.querySelector('[data-template-category="All"]')!.getAttribute('aria-pressed')).toBe('true');

    // Clear search: query emptied, grid restored, search input focused.
    act(() => emptyActions(c)[0].click());
    expect(searchInput(c).value).toBe('');
    expect(tiles(c)).toHaveLength(6);
    expect(document.activeElement).toBe(searchInput(c));

    // Reset filters from the 3-action state clears both and focuses search.
    type(searchInput(c), 'zzz');
    act(() => categoryActions(c)[5].click());
    act(() => emptyActions(c)[2].click());
    expect(searchInput(c).value).toBe('');
    expect(c.querySelector('[data-template-category="All"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(tiles(c)).toHaveLength(6);
    expect(document.activeElement).toBe(searchInput(c));
    expect(gridRegionText(c)).toBe('Reviewing Business Card 1 / 6. Press Enter to use template');
  });
});

describe('TemplatesDialog migration — intended kit deltas (pinned new forms)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showTemplates: false }));
  });

  it('category/empty buttons serialize class AFTER the data-* attributes — attribute order is the only change', async () => {
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

    const c = await mountDialog();
    // Category button, new kit byte form (class after the data-* trio)…
    expect(categoryActions(c)[0].outerHTML).toBe(
      '<button type="button" data-template-category-action="true" data-template-category="All" data-template-category-review="All 6 templates" class="btn !py-1 !px-2 text-xs border-accent2 text-accent2 bg-accent2/10" aria-pressed="true" title="All 6 templates">All <span class="text-muted tabular-nums">6</span></button>',
    );
    // …whose attribute SET and content are exactly the legacy bytes:
    expect(attrSignature(categoryActions(c)[0].outerHTML)).toBe(attrSignature(
      '<button type="button" class="btn !py-1 !px-2 text-xs border-accent2 text-accent2 bg-accent2/10" data-template-category-action="true" data-template-category="All" data-template-category-review="All 6 templates" aria-pressed="true" title="All 6 templates">All <span class="text-muted tabular-nums">6</span></button>',
    ));

    type(searchInput(c), 'zzz');
    expect(emptyActions(c)[0].outerHTML).toBe(
      '<button type="button" data-template-empty-action="true" data-template-empty-action-review="Clear search" class="btn !py-1.5 !px-2 text-xs">Clear search</button>',
    );
    expect(attrSignature(emptyActions(c)[0].outerHTML)).toBe(attrSignature(
      '<button type="button" class="btn !py-1.5 !px-2 text-xs" data-template-empty-action="true" data-template-empty-action-review="Clear search">Clear search</button>',
    ));

    // The search toolbar (SearchableListActions) kept the legacy byte form
    // exactly — class stays before the data-* attributes there.
    type(searchInput(c), '');
    type(searchInput(c), 'a');
    expect(searchActions(c)[0].outerHTML.startsWith('<button type="button" class="btn !py-1.5 !px-2 text-xs shrink-0" data-template-search-action="true"')).toBe(true);
  });
});
