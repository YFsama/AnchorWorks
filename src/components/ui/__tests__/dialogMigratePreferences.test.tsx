import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PreferencesDialog } from '../../PreferencesDialog';
import { useEditor } from '../../../store/editor';
import { actionReviewKey } from '../useRovingActions';

/**
 * Freeze-then-migrate suite for PreferencesDialog (dialog-kit migration).
 *
 * This is the most regression-protected dialog in the app — the axe a11y e2e
 * (tests/e2e/a11y.spec.ts, incl. the tablist aria-required-children rule the
 * :320 source comment calls out) and the behaviour e2e
 * (tests/e2e/preferences-wheel.spec.ts: tab/group/button roles + aria-pressed
 * + Apply) both anchor it. The frozen strings and behaviour snapshots below
 * were captured from the pre-migration handwritten implementation:
 *
 * - byte-exact outerHTML for every region the migration touches or anchors
 *   on: the recipe toolbar, the Cancel/Reset/Apply/Save footer, the search
 *   action toolbar + its aria-live match-count wrapper (all three query
 *   states), and the vertical tablist (initial / arrow-moved / filtered /
 *   empty) plus the tabpanel wiring;
 * - keyboard contracts: footer clamp + skipDisabled + action-review-with-
 *   text-fallback, search wrap roving, recipe clamp roving whose every move
 *   APPLIES the recipe and flips to the Workspace tab, and the WAI-ARIA
 *   vertical tablist (ArrowUp/Down wrap, Home/End, selection+focus sync,
 *   ArrowLeft/Right ignored);
 * - the e2e anchors mirrored in jsdom: dialog role/name, tablist owning only
 *   role=tab children, the Editor-tab Mouse wheel group's aria-pressed pair,
 *   and the footer Apply/Save buttons.
 *
 * The migration swaps the four inline handlers for makeRovingKeys (the
 * tablist via axis: 'vertical' + wrap + onNavigate), the review useState trio
 * for useReviewedAction, the recipe toolbar for PresetRow, and the footer for
 * ReviewedFooter. The search toolbar stays hand-written: both of its buttons
 * are per-button conditional (`prefQuery && …`), which SearchableListActions
 * cannot express — its Clear button always renders — so only its keydown
 * handler moves to the kit. Everything frozen here must keep passing;
 * intended kit deltas are pinned explicitly in the last describe:
 * - the recipe buttons' `aria-pressed` now serializes before `title`
 *   (PresetRow's render order; legacy wrote title first — same attributes,
 *   same values, attribute order only);
 * - a synthetic keydown on an EMPTY search toolbar is now preventDefault-ed
 *   before guardEmpty bails (legacy returned before preventing) — unreachable
 *   via a real keyboard because the toolbar is not focusable and renders no
 *   buttons without a query.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let roots: Root[];

async function mountDialog(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    useEditor.setState({ showPreferences: true });
    root.render(<PreferencesDialog />);
  });
  // The dialog focuses the search input on the next animation frame; flush it
  // up front so it can never steal focus mid-script.
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  return container;
}

// ---- region getters ------------------------------------------------------------

const recipeToolbar = (c: HTMLElement) => c.querySelector('[aria-describedby="preferences-recipe-action-review-status"]') as HTMLDivElement;
const footerToolbar = (c: HTMLElement) => c.querySelector('[aria-describedby="preferences-action-review-status"]') as HTMLDivElement;
const searchToolbar = (c: HTMLElement) => c.querySelector('[aria-describedby="preferences-search-action-review-status"]') as HTMLDivElement;
const countLive = (c: HTMLElement) => searchToolbar(c).parentElement as HTMLDivElement;
const tablist = (c: HTMLElement) => c.querySelector('nav[role="tablist"]') as HTMLElement;
const tabs = (c: HTMLElement) => Array.from(tablist(c).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const tabPanel = (c: HTMLElement) => c.querySelector('#pref-tab-panel') as HTMLElement;
const searchInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="search"]')!;
const footerButtons = (c: HTMLElement) => Array.from(footerToolbar(c).querySelectorAll<HTMLButtonElement>('[data-pref-action]'));
const recipeButtons = (c: HTMLElement) => Array.from(recipeToolbar(c).querySelectorAll<HTMLButtonElement>('[data-pref-recipe-action]'));
const searchActionButtons = (c: HTMLElement) => Array.from(searchToolbar(c).querySelectorAll<HTMLButtonElement>('[data-pref-search-action]'));
const footerStatus = (c: HTMLElement) => c.querySelector('#preferences-action-review-status')!.textContent!;
const recipeStatus = (c: HTMLElement) => c.querySelector('#preferences-recipe-action-review-status')!.textContent!;
const searchStatus = (c: HTMLElement) => c.querySelector('#preferences-search-action-review-status')!.textContent!;

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => el.dispatchEvent(event));
  return event.defaultPrevented;
}

async function flushFrame(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
}

// ---- frozen DOM (captured from the legacy implementation) ----------------------

const RECIPE_LABELS = ['Design focus', 'Production prep', 'Presentation'] as const;
const RECIPE_TITLES = [
  'Dark workspace with smart snapping for layout and drawing.',
  'High contrast workspace with every snap aid enabled for cutter prep.',
  'Light low-distraction workspace with snapping aids off.',
] as const;
const RECIPE_REVIEWS = RECIPE_LABELS.map((label, i) => `${label} · ${RECIPE_TITLES[i]}`);

const RECIPE_OPEN =
  '<div class="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Preference recipe actions" aria-describedby="preferences-recipe-action-review-status" title="Use arrow keys to review preference recipes">'
  + '<span id="preferences-recipe-action-review-status" class="sr-only" aria-live="polite">';

function frozenRecipeButton(index: number, active: boolean): string {
  const cls = `btn !py-1 !px-2 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`;
  // Kit order: aria-pressed serializes before title (PresetRow render order);
  // legacy wrote title first — the one pinned attribute-order delta.
  return `<button type="button" data-pref-recipe-action="true" data-pref-recipe-action-review="${RECIPE_REVIEWS[index]}" data-recipe-index="${index}" class="${cls}" aria-pressed="${active}" title="${RECIPE_TITLES[index]}">${RECIPE_LABELS[index]}</button>`;
}

function frozenRecipeToolbar(reviewed: string, activeIndex: number | null): string {
  return `${RECIPE_OPEN}Reviewing ${reviewed || 'Preference recipe actions'}</span>`
    + frozenRecipeButton(0, activeIndex === 0)
    + frozenRecipeButton(1, activeIndex === 1)
    + frozenRecipeButton(2, activeIndex === 2)
    + '</div>';
}

const FOOTER_OPEN =
  '<div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-panel2 shrink-0" role="toolbar" aria-label="Preferences actions" aria-describedby="preferences-action-review-status" title="Use arrow keys to review dialog actions">'
  + '<span id="preferences-action-review-status" class="sr-only" aria-live="polite">';
const FOOTER_BUTTONS =
  '<button type="button" data-pref-action="true" data-pref-action-review="Cancel" class="btn">Cancel</button>'
  + '<button type="button" data-pref-action="true" data-pref-action-review="Reset" class="btn">Reset</button>'
  + '<button type="button" data-pref-action="true" data-pref-action-review="Apply" class="btn">Apply</button>'
  + '<button type="button" data-pref-action="true" data-pref-action-review="Save" class="btn-primary">Save</button>';

const frozenFooter = (reviewed: string) =>
  `${FOOTER_OPEN}Reviewing ${reviewed || 'Preferences actions'}</span>${FOOTER_BUTTONS}</div>`;

const SEARCH_OPEN =
  '<div class="flex items-center gap-2" role="toolbar" aria-label="Preferences search actions" aria-describedby="preferences-search-action-review-status" title="Use arrow keys to review preferences search actions">'
  + '<span id="preferences-search-action-review-status" class="sr-only" aria-live="polite">';
const SEARCH_GO_FIRST =
  '<button type="button" class="hover:text-ink underline-offset-2 hover:underline transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:no-underline" data-pref-search-action="true" data-pref-search-action-review="Go to first search result" title="Go to first search result">Go First</button>';
const SEARCH_CLEAR =
  '<button type="button" class="hover:text-ink underline-offset-2 hover:underline transition-colors" data-pref-search-action="true" data-pref-search-action-review="Clear search" title="Clear search">Clear search</button>';

const frozenCountLive = (count: string, buttons: string, reviewed = 'Preferences search actions') =>
  `<div class="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted tabular-nums" aria-live="polite"><span>${count}</span>`
  + `${SEARCH_OPEN}Reviewing ${reviewed}</span>${buttons}</div></div>`;

const FROZEN_COUNT_EMPTY = frozenCountLive('4 sections', '');
const FROZEN_COUNT_THEME = frozenCountLive('2 / 4 matches', SEARCH_GO_FIRST + SEARCH_CLEAR);
const FROZEN_COUNT_NOMATCH = frozenCountLive('0 / 4 matches', SEARCH_CLEAR);

const TAB_SVGS = {
  general: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  ai: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles" aria-hidden="true"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path><path d="M20 2v4"></path><path d="M22 4h-4"></path><circle cx="4" cy="20" r="2"></circle></svg>',
  editor: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pen-tool" aria-hidden="true"><path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"></path><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"></path><path d="m2.3 2.3 7.286 7.286"></path><circle cx="11" cy="11" r="2"></circle></svg>',
  workspace: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>',
} as const;

const TABLIST_OPEN = '<nav class="flex flex-col" role="tablist" aria-label="Preferences" aria-orientation="vertical">';

function frozenTab(id: keyof typeof TAB_SVGS, label: string, active: boolean): string {
  return `<button id="pref-tab-${id}" role="tab" aria-selected="${active}" aria-controls="pref-tab-panel" tabindex="${active ? 0 : -1}" class="flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${active ? 'bg-panel3 text-ink border-l-2 border-accent2 pl-[10px]' : 'text-muted hover:text-ink hover:bg-panel3/60'}">${TAB_SVGS[id]}<span>${label}</span></button>`;
}

const FROZEN_TABLIST_INITIAL = TABLIST_OPEN
  + frozenTab('general', 'General', true) + frozenTab('ai', 'AI', false)
  + frozenTab('editor', 'Editor', false) + frozenTab('workspace', 'Workspace', false) + '</nav>';
const FROZEN_TABLIST_AFTER_DOWN = TABLIST_OPEN
  + frozenTab('general', 'General', false) + frozenTab('ai', 'AI', true)
  + frozenTab('editor', 'Editor', false) + frozenTab('workspace', 'Workspace', false) + '</nav>';
const FROZEN_TABLIST_THEME = TABLIST_OPEN
  + frozenTab('general', 'General', true) + frozenTab('workspace', 'Workspace', false) + '</nav>';
const FROZEN_TABLIST_EMPTY = TABLIST_OPEN + '</nav>';

// ---- the suite ------------------------------------------------------------------

describe('PreferencesDialog migration — frozen legacy DOM (byte-exact)', () => {
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showPreferences: false }));
  });

  it('dialog chrome: role=dialog + aria-modal + labelledby the Preferences h2', async () => {
    const c = await mountDialog();
    const overlay = c.firstElementChild as HTMLElement;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-labelledby')).toBe('prefs-dialog-title');
    expect(c.querySelector('#prefs-dialog-title')!.textContent).toBe('Preferences');
  });

  it('recipe toolbar: initial bytes (no recipe active on the default draft)', async () => {
    const c = await mountDialog();
    expect(recipeToolbar(c).outerHTML).toBe(frozenRecipeToolbar('', null));
  });

  it('footer toolbar: fallback and reviewed announcements byte-exact', async () => {
    const c = await mountDialog();
    expect(footerToolbar(c).outerHTML).toBe(frozenFooter(''));
    act(() => footerButtons(c)[1].focus());
    expect(footerToolbar(c).outerHTML).toBe(frozenFooter('Reset'));
  });

  it('search count live region: empty query / 2 matches / 0 matches byte-exact', async () => {
    const c = await mountDialog();
    expect(countLive(c).outerHTML).toBe(FROZEN_COUNT_EMPTY);
    type(searchInput(c), 'theme');
    expect(countLive(c).outerHTML).toBe(FROZEN_COUNT_THEME);
    type(searchInput(c), 'zzzz');
    expect(countLive(c).outerHTML).toBe(FROZEN_COUNT_NOMATCH);
  });

  it('search input keeps its own aria contract (untouched region)', async () => {
    const c = await mountDialog();
    const input = searchInput(c);
    expect(input.getAttribute('aria-label')).toBe('Search preferences…');
    expect(input.getAttribute('title')).toBe('Press Enter to go to first search result · Press Arrow Down to focus first section');
    expect(input.getAttribute('placeholder')).toBe('Search preferences…');
  });

  it('tablist: initial, arrow-moved, filtered and empty states byte-exact', async () => {
    const c = await mountDialog();
    expect(tablist(c).outerHTML).toBe(FROZEN_TABLIST_INITIAL);
    act(() => tabs(c)[0].focus());
    press(tabs(c)[0], 'ArrowDown');
    expect(tablist(c).outerHTML).toBe(FROZEN_TABLIST_AFTER_DOWN);
    type(searchInput(c), 'theme');
    expect(tablist(c).outerHTML).toBe(FROZEN_TABLIST_THEME);
    type(searchInput(c), 'zzzz');
    expect(tablist(c).outerHTML).toBe(FROZEN_TABLIST_EMPTY);
  });

  it('tabpanel wiring: role/id/tabIndex + aria-labelledby tracks the active tab (null when none)', async () => {
    const c = await mountDialog();
    const panel = tabPanel(c);
    expect(panel.id).toBe('pref-tab-panel');
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('tabindex')).toBe('0');
    expect(panel.getAttribute('aria-labelledby')).toBe('pref-tab-general');
    act(() => tabs(c)[2].click());
    expect(panel.getAttribute('aria-labelledby')).toBe('pref-tab-editor');
    type(searchInput(c), 'zzzz');
    expect(panel.getAttribute('aria-labelledby')).toBeNull();
    expect(panel.textContent).toContain('No preferences found.');
  });

  it('axe anchor: the tablist owns only role=tab buttons, each controlling the panel', async () => {
    const c = await mountDialog();
    const nav = tablist(c);
    const kids = Array.from(nav.children);
    expect(kids.length).toBe(4);
    expect(kids.every((el) => el.tagName === 'BUTTON' && el.getAttribute('role') === 'tab')).toBe(true);
    expect(kids.map((el) => el.id)).toEqual(['pref-tab-general', 'pref-tab-ai', 'pref-tab-editor', 'pref-tab-workspace']);
    kids.forEach((el) => expect(el.getAttribute('aria-controls')).toBe('pref-tab-panel'));
    // The search cluster deliberately stays OUTSIDE the nav (source comment
    // :320 — aria-required-children). The nav's parent owns both as siblings.
    expect(nav.previousElementSibling!.className).toContain('px-2 pb-2');
  });
});

describe('PreferencesDialog migration — keyboard behavior snapshots (legacy-frozen)', () => {
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showPreferences: false }));
  });

  it('footer roving: clamped arrows, Home/End, focus publishes review, unrelated keys pass through', async () => {
    const c = await mountDialog();
    const [cancel, reset, apply, save] = footerButtons(c);
    act(() => cancel.focus());
    expect(footerStatus(c)).toBe('Reviewing Cancel');

    expect(press(cancel, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(reset);
    expect(footerStatus(c)).toBe('Reviewing Reset');
    expect(press(reset, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(apply);
    expect(press(apply, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(save);
    // Clamped at Save.
    expect(press(save, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(footerStatus(c)).toBe('Reviewing Save');
    expect(press(save, 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(apply);
    expect(press(apply, 'Home')).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(press(cancel, 'End')).toBe(true);
    expect(document.activeElement).toBe(save);
    // Vertical arrows and plain keys are not the footer's business.
    expect(press(save, 'ArrowDown')).toBe(false);
    expect(press(save, 'z')).toBe(false);
    expect(document.activeElement).toBe(save);
    expect(footerStatus(c)).toBe('Reviewing Save');
  });

  it('footer clicks: Cancel closes the dialog', async () => {
    const c = await mountDialog();
    act(() => footerButtons(c)[0].click());
    expect(useEditor.getState().showPreferences).toBe(false);
    expect(c.innerHTML).toBe('');
  });

  it('search roving: wrapping arrows + Home/End across Go First / Clear search', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'theme');
    const [goFirst, clear] = searchActionButtons(c);
    expect(searchActionButtons(c).length).toBe(2);
    act(() => goFirst.focus());
    expect(searchStatus(c)).toBe('Reviewing Go to first search result');
    expect(press(goFirst, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(searchStatus(c)).toBe('Reviewing Clear search');
    // Wraps in both directions.
    expect(press(clear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(goFirst);
    expect(press(goFirst, 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(press(clear, 'Home')).toBe(true);
    expect(document.activeElement).toBe(goFirst);
    expect(press(goFirst, 'End')).toBe(true);
    expect(document.activeElement).toBe(clear);
    // Vertical arrows pass through.
    expect(press(clear, 'ArrowDown')).toBe(false);

    // Go First: selects the first visible tab and focuses it on the next frame.
    act(() => goFirst.click());
    await flushFrame();
    expect(document.activeElement?.id).toBe('pref-tab-general');
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBe('pref-tab-general');

    // Clear search: empties the query and the toolbar buttons with it; the
    // last review announcement persists (legacy keeps the reviewed state).
    act(() => clear.click());
    expect(searchInput(c).value).toBe('');
    expect(countLive(c).outerHTML).toBe(frozenCountLive('4 sections', '', 'Clear search'));
  });

  it('search roving: single Clear button on a no-match query wraps onto itself', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'zzzz');
    const [clear] = searchActionButtons(c);
    expect(searchActionButtons(c).length).toBe(1);
    act(() => clear.focus());
    expect(press(clear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(searchStatus(c)).toBe('Reviewing Clear search');
  });

  it('recipe roving: clamped arrows + Home/End; every move APPLIES the recipe and flips to the Workspace tab', async () => {
    const c = await mountDialog();
    const recipes = recipeButtons(c);
    act(() => recipes[0].focus());
    expect(recipeStatus(c)).toBe(`Reviewing ${RECIPE_REVIEWS[0]}`);

    expect(press(recipes[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(recipes[1]);
    expect(recipeStatus(c)).toBe(`Reviewing ${RECIPE_REVIEWS[1]}`);
    // The move applied recipe 1 to the draft and switched to Workspace.
    expect(recipes[1].getAttribute('aria-pressed')).toBe('true');
    expect(recipes[0].getAttribute('aria-pressed')).toBe('false');
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBe('pref-tab-workspace');
    expect(tablist(c).querySelector('#pref-tab-workspace')!.getAttribute('aria-selected')).toBe('true');

    expect(press(recipes[1], 'ArrowRight')).toBe(true);
    expect(recipes[2].getAttribute('aria-pressed')).toBe('true');
    expect(recipeStatus(c)).toBe(`Reviewing ${RECIPE_REVIEWS[2]}`);
    // Clamped at the last recipe.
    expect(press(recipes[2], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(recipes[2]);
    expect(recipeStatus(c)).toBe(`Reviewing ${RECIPE_REVIEWS[2]}`);

    expect(press(recipes[2], 'Home')).toBe(true);
    expect(document.activeElement).toBe(recipes[0]);
    expect(recipes[0].getAttribute('aria-pressed')).toBe('true');
    expect(recipes[2].getAttribute('aria-pressed')).toBe('false');
    expect(press(recipes[0], 'End')).toBe(true);
    expect(recipes[2].getAttribute('aria-pressed')).toBe('true');
    expect(recipeStatus(c)).toBe(`Reviewing ${RECIPE_REVIEWS[2]}`);

    // A plain click applies + stays on the Workspace tab.
    act(() => recipes[0].click());
    expect(recipes[0].getAttribute('aria-pressed')).toBe('true');
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBe('pref-tab-workspace');
  });

  it('recipe toolbar bytes after an arrow move (review announced, recipe 1 active)', async () => {
    const c = await mountDialog();
    const recipes = recipeButtons(c);
    act(() => recipes[0].focus());
    press(recipes[0], 'ArrowRight');
    expect(recipeToolbar(c).outerHTML).toBe(frozenRecipeToolbar(RECIPE_REVIEWS[1], 1));
  });

  it('tablist roving: vertical wrap, Home/End, selection + focus + roving tabIndex sync', async () => {
    const c = await mountDialog();
    act(() => tabs(c)[0].focus());
    expect(document.activeElement).toBe(tabs(c)[0]);

    expect(press(tabs(c)[0], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[1]);
    expect(tabs(c)[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs(c)[1].tabIndex).toBe(0);
    expect(tabs(c)[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs(c)[0].tabIndex).toBe(-1);
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBe('pref-tab-ai');

    expect(press(tabs(c)[1], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[2]);
    expect(press(tabs(c)[2], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[3]);
    // Wraps at the bottom…
    expect(press(tabs(c)[3], 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[0]);
    // …and at the top.
    expect(press(tabs(c)[0], 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[3]);
    expect(press(tabs(c)[3], 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[2]);

    expect(press(tabs(c)[2], 'Home')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[0]);
    expect(press(tabs(c)[0], 'End')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[3]);

    // Home while already on the first tab: prevented, but a full no-op.
    expect(press(tabs(c)[3], 'Home')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[0]);
    expect(press(tabs(c)[0], 'Home')).toBe(true);
    expect(document.activeElement).toBe(tabs(c)[0]);
    expect(tabs(c)[0].getAttribute('aria-selected')).toBe('true');

    // Horizontal arrows are not the vertical tablist's business.
    expect(press(tabs(c)[0], 'ArrowRight')).toBe(false);
    expect(press(tabs(c)[0], 'ArrowLeft')).toBe(false);
    expect(document.activeElement).toBe(tabs(c)[0]);
  });

  it('tablist on an empty (filtered-out) result set: keydown prevented, nothing selected', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'zzzz');
    // Synthetic dispatch on the nav itself — no focusable children exist.
    expect(press(tablist(c), 'ArrowDown')).toBe(true);
    expect(tablist(c).children.length).toBe(0);
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBeNull();
  });

  it('search input shortcuts: Enter and ArrowDown focus the first visible tab on the next frame', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'theme');
    expect(press(searchInput(c), 'Enter')).toBe(true);
    await flushFrame();
    expect(document.activeElement?.id).toBe('pref-tab-general');
    expect(tabs(c)[0].getAttribute('aria-selected')).toBe('true');

    expect(press(searchInput(c), 'ArrowDown')).toBe(true);
    await flushFrame();
    expect(document.activeElement?.id).toBe('pref-tab-general');
  });

  it('Reset: clears the query, returns to the General tab, resets all three review states, announces "Reset"', async () => {
    const c = await mountDialog();
    type(searchInput(c), 'theme');
    act(() => searchActionButtons(c)[0].focus());
    expect(searchStatus(c)).toBe('Reviewing Go to first search result');
    const recipes = recipeButtons(c);
    act(() => recipes[0].focus());
    press(recipes[0], 'ArrowRight');
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBe('pref-tab-workspace');

    act(() => footerButtons(c)[1].click());
    expect(searchInput(c).value).toBe('');
    expect(countLive(c).outerHTML).toBe(FROZEN_COUNT_EMPTY);
    expect(tabPanel(c).getAttribute('aria-labelledby')).toBe('pref-tab-general');
    expect(footerStatus(c)).toBe('Reviewing Reset');
    expect(searchStatus(c)).toBe('Reviewing Preferences search actions');
    expect(recipeStatus(c)).toBe('Reviewing Preference recipe actions');
    expect(recipeButtons(c).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('e2e anchor: Editor tab Mouse wheel group keeps the aria-pressed pan/zoom pair', async () => {
    const c = await mountDialog();
    act(() => tabs(c)[2].click());
    const wheel = c.querySelector('[role="group"][aria-label="Mouse wheel"]') as HTMLElement;
    expect(wheel).toBeTruthy();
    const [scrollBtn, zoomBtn] = Array.from(wheel.querySelectorAll('button'));
    expect(scrollBtn.textContent).toBe('Scroll (Ctrl+wheel zooms)');
    expect(zoomBtn.textContent).toBe('Zoom (Ctrl+wheel scrolls)');
    expect(scrollBtn.getAttribute('aria-pressed')).toBe('true');
    expect(zoomBtn.getAttribute('aria-pressed')).toBe('false');
    act(() => zoomBtn.click());
    expect(zoomBtn.getAttribute('aria-pressed')).toBe('true');
    expect(scrollBtn.getAttribute('aria-pressed')).toBe('false');
    // Apply persists the draft (Preferences wheel e2e contract) — but do NOT
    // click it here: it writes the live store. Cancel instead.
    const apply = footerButtons(c).find((b) => b.textContent === 'Apply')!;
    expect(apply).toBeTruthy();
    act(() => footerButtons(c)[0].click());
    expect(useEditor.getState().showPreferences).toBe(false);
  });
});

describe('PreferencesDialog migration — intended kit deltas (pinned new forms)', () => {
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showPreferences: false }));
  });

  it('actionReviewKey resolves the two review dataset keys used by the dialog', () => {
    expect(actionReviewKey('data-pref-action')).toBe('prefActionReview');
    expect(actionReviewKey('data-pref-recipe-action')).toBe('prefRecipeActionReview');
    expect(actionReviewKey('data-pref-search-action')).toBe('prefSearchActionReview');
  });

  it('empty search toolbar: synthetic keydown IS prevented (guardEmpty semantics), review untouched', async () => {
    // Legacy bailed BEFORE preventDefault when the toolbar held no buttons;
    // makeRovingKeys preventDefaults first, then guardEmpty returns.
    // Unreachable via a real keyboard — the toolbar is not focusable and
    // renders no buttons without a query. Only the defaultPrevented bit
    // differs — no review, no focus.
    const c = await mountDialog();
    expect(press(searchToolbar(c), 'ArrowRight')).toBe(true);
    expect(searchStatus(c)).toBe('Reviewing Preferences search actions');
    expect(searchActionButtons(c).length).toBe(0);
  });
});
