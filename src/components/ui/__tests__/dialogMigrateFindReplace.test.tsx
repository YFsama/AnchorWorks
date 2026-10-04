import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FindReplaceDialog } from '../../FindReplaceDialog';
import { useEditor } from '../../../store/editor';

/**
 * Freeze-then-migrate suite for FindReplaceDialog (dialog-kit migration, batch N).
 *
 * The frozen strings and behavior snapshots below were captured from the
 * pre-migration handwritten implementation (three inline roving handlers +
 * three hand-rolled review-status toolbars). They pin:
 *
 * - the full initial panel DOM byte-for-byte (state A), and each roving
 *   toolbar's outerHTML across the states where it changes (field buttons
 *   enabled/disabled, Replace All disabled, recipe index/active variants,
 *   Reset announcement);
 * - every roving region's keyboard contract: key -> focus move -> review
 *   text, clamp vs wrap, disabled-button transparency, and the recipe
 *   region's onNavigate side effect (the recipe is APPLIED on every move,
 *   not just focused);
 * - Reset, apply/close (click + Enter on the Find field with retained
 *   state), the ArrowDown/ArrowUp cross-field focus jumps, and the
 *   match-case checkbox.
 *
 * The migration swaps the three handlers for makeRovingKeys and the three
 * toolbars for ReviewedFooter/PresetRow(ActionToolbar) with a statusContent
 * override for the recipe region's index-composite announcement. Everything
 * frozen here must keep passing unchanged; the one intended delta (a
 * synthetic keydown on an all-disabled field toolbar is now preventDefault-ed
 * before guardEmpty bails — unreachable via a real keyboard because the
 * container is not focusable) is pinned explicitly in the last describe.
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
    useEditor.setState({ showFindReplace: true });
    root.render(<FindReplaceDialog />);
  });
  return container;
}

const region = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[aria-describedby="${id}"]`)!;
const footerToolbar = (c: HTMLElement) => region(c, 'find-replace-action-review-status');
const fieldToolbar = (c: HTMLElement) => region(c, 'find-replace-field-action-review-status');
const recipeToolbar = (c: HTMLElement) => region(c, 'find-replace-recipe-review-status');
const footerStatus = (c: HTMLElement) => c.querySelector('#find-replace-action-review-status')!.textContent;
const fieldStatus = (c: HTMLElement) => c.querySelector('#find-replace-field-action-review-status')!.textContent;
const recipeStatus = (c: HTMLElement) => c.querySelector('#find-replace-recipe-review-status')!.textContent;
const footerButtons = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-find-replace-action]'));
const fieldButtons = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-find-replace-field-action]'));
const recipeButtons = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('[data-find-replace-recipe-action]'));
const findInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[aria-label="Find"]')!;
const replaceInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[aria-label="Replace with"]')!;
const matchCaseBox = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

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

// ---- frozen DOM (captured from the legacy implementation) ----------------------

const FROZEN_PANEL_INITIAL =
  '<div class="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="findreplace-title">'
  + '<div class="bg-panel border border-border rounded-lg w-[340px] p-4 shadow-2xl">'
  + '<div class="flex items-center justify-between mb-3">'
  + '<h2 id="findreplace-title" class="dialog-title flex items-center gap-2">'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg> Find &amp; Replace</h2>'
  + '<button class="btn-dialog-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>'
  + '<label class="block mb-2"><div class="field-label">Find</div><input class="input-num w-full" aria-label="Find" title="Press Enter to replace all matches · Press Arrow Down to focus Replace" type="text" value=""></label>'
  + '<label class="block mb-2"><div class="field-label">Replace with</div><input class="input-num w-full" aria-label="Replace with" title="Press Enter to replace all matches · Press Arrow Up to focus Find" type="text" value=""></label>'
  + '<div class="flex items-center justify-between mt-1"><label class="flex items-center gap-2 text-xs text-muted cursor-pointer"><input type="checkbox"><span>Match case</span></label><span class="text-xs text-muted tabular-nums" aria-live="polite"></span></div>'
  + '<div class="mt-3"><div class="field-label !mb-1">Find replace recipes</div>'
  + '<div class="grid grid-cols-2 gap-1" role="toolbar" aria-label="Find replace recipe actions" aria-describedby="find-replace-recipe-review-status" title="Use arrow keys to review find replace recipes">'
  + '<div id="find-replace-recipe-review-status" class="sr-only" aria-live="polite">Reviewing Double spaces 1 / 4. Collapse accidental double spaces in imported copy.</div>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="0" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Collapse accidental double spaces in imported copy.">Double spaces</button>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="1" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Convert double hyphens into an em dash.">Dash cleanup</button>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="2" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Replace serial placeholders with a starting number.">Number token</button>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="3" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Convert typed trademark markers into the symbol.">Brand mark</button></div></div>'
  + '<div class="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Find &amp; Replace field actions" aria-describedby="find-replace-field-action-review-status" title="Use arrow keys to review find and replace field actions">'
  + '<span id="find-replace-field-action-review-status" class="sr-only" aria-live="polite">Reviewing Find &amp; Replace field actions</span>'
  + '<button type="button" data-find-replace-field-action="true" data-find-replace-field-action-review="Clear fields" class="btn flex items-center gap-1" disabled="">'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg> Clear fields</button>'
  + '<button type="button" data-find-replace-field-action="true" data-find-replace-field-action-review="Swap find/replace" class="btn flex items-center gap-1" disabled="">'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down" aria-hidden="true"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg> Swap find/replace</button></div>'
  + '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="Find &amp; Replace actions" aria-describedby="find-replace-action-review-status" title="Use arrow keys to review dialog actions">'
  + '<span id="find-replace-action-review-status" class="sr-only" aria-live="polite">Reviewing Find &amp; Replace actions</span>'
  + '<button type="button" data-find-replace-action="true" data-find-replace-action-review="Cancel" class="btn">Cancel</button>'
  + '<button type="button" data-find-replace-action="true" data-find-replace-action-review="Reset" class="btn">Reset</button>'
  + '<button type="button" data-find-replace-action="true" data-find-replace-action-review="Replace All" class="btn-primary" disabled="">Replace All</button></div>'
  + '</div></div>';

const RECIPE_BUTTONS_TAIL =
  '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="0" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Collapse accidental double spaces in imported copy.">Double spaces</button>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="1" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Convert double hyphens into an em dash.">Dash cleanup</button>';

const FROZEN_RECIPE_INITIAL =
  '<div class="grid grid-cols-2 gap-1" role="toolbar" aria-label="Find replace recipe actions" aria-describedby="find-replace-recipe-review-status" title="Use arrow keys to review find replace recipes">'
  + '<div id="find-replace-recipe-review-status" class="sr-only" aria-live="polite">Reviewing Double spaces 1 / 4. Collapse accidental double spaces in imported copy.</div>'
  + RECIPE_BUTTONS_TAIL
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="2" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Replace serial placeholders with a starting number.">Number token</button>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="3" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Convert typed trademark markers into the symbol.">Brand mark</button></div>';

const FROZEN_RECIPE_INDEX2_ACTIVE =
  '<div class="grid grid-cols-2 gap-1" role="toolbar" aria-label="Find replace recipe actions" aria-describedby="find-replace-recipe-review-status" title="Use arrow keys to review find replace recipes">'
  + '<div id="find-replace-recipe-review-status" class="sr-only" aria-live="polite">Reviewing Number token 3 / 4. Replace serial placeholders with a starting number.</div>'
  + RECIPE_BUTTONS_TAIL
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="2" class="btn !py-1 !px-1 !text-[10px] border-accent2 text-accent2 bg-accent2/10" aria-pressed="true" title="Replace serial placeholders with a starting number.">Number token</button>'
  + '<button type="button" data-find-replace-recipe-action="true" data-recipe-index="3" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" title="Convert typed trademark markers into the symbol.">Brand mark</button></div>';

const FIELD_BUTTONS =
  '<button type="button" data-find-replace-field-action="true" data-find-replace-field-action-review="Clear fields" class="btn flex items-center gap-1"<DISABLED>>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg> Clear fields</button>'
  + '<button type="button" data-find-replace-field-action="true" data-find-replace-field-action-review="Swap find/replace" class="btn flex items-center gap-1"<DISABLED>>'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down" aria-hidden="true"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg> Swap find/replace</button>';

const FIELD_OPEN =
  '<div class="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Find &amp; Replace field actions" aria-describedby="find-replace-field-action-review-status" title="Use arrow keys to review find and replace field actions">'
  + '<span id="find-replace-field-action-review-status" class="sr-only" aria-live="polite">';

const FROZEN_FIELD_DISABLED = FIELD_OPEN + 'Reviewing Find &amp; Replace field actions</span>' + FIELD_BUTTONS.replaceAll('<DISABLED>', ' disabled=""') + '</div>';

const FROZEN_FIELD_ENABLED = FIELD_OPEN + 'Reviewing Find &amp; Replace field actions</span>' + FIELD_BUTTONS.replaceAll('<DISABLED>', '') + '</div>';

const FROZEN_FIELD_REVIEWED_SWAP = FIELD_OPEN + 'Reviewing Swap find/replace</span>' + FIELD_BUTTONS.replaceAll('<DISABLED>', '') + '</div>';

const FOOTER_BUTTONS = (
  '<button type="button" data-find-replace-action="true" data-find-replace-action-review="Cancel" class="btn">Cancel</button>'
  + '<button type="button" data-find-replace-action="true" data-find-replace-action-review="Reset" class="btn">Reset</button>'
  + '<button type="button" data-find-replace-action="true" data-find-replace-action-review="Replace All" class="btn-primary"'
);

const FOOTER_OPEN =
  '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="Find &amp; Replace actions" aria-describedby="find-replace-action-review-status" title="Use arrow keys to review dialog actions">'
  + '<span id="find-replace-action-review-status" class="sr-only" aria-live="polite">';

const FROZEN_FOOTER_FALLBACK_DISABLED = `${FOOTER_OPEN}Reviewing Find &amp; Replace actions</span>${FOOTER_BUTTONS} disabled="">Replace All</button></div>`;
const FROZEN_FOOTER_RESET_DISABLED = `${FOOTER_OPEN}Reviewing Reset</span>${FOOTER_BUTTONS} disabled="">Replace All</button></div>`;
const FROZEN_FOOTER_FALLBACK_ENABLED = `${FOOTER_OPEN}Reviewing Find &amp; Replace actions</span>${FOOTER_BUTTONS}>Replace All</button></div>`;

// ---- the suite ----------------------------------------------------------------

describe('FindReplaceDialog migration — frozen legacy DOM (byte-exact)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showFindReplace: false }));
  });

  it('renders the full initial panel byte-identically (state A)', () => {
    const c = mountDialog();
    expect(c.firstElementChild!.outerHTML).toBe(FROZEN_PANEL_INITIAL);
    // autoFocus lands on the Find input on mount.
    expect(document.activeElement).toBe(findInput(c));
  });

  it('recipe toolbar: initial index-0 composite status, then index-2 active variant', () => {
    const c = mountDialog();
    expect(recipeToolbar(c).outerHTML).toBe(FROZEN_RECIPE_INITIAL);
    const recipes = recipeButtons(c);
    act(() => recipes[0].focus());
    expect(press(recipes[0], 'ArrowRight')).toBe(true);
    expect(press(document.activeElement!, 'ArrowRight')).toBe(true);
    expect(findInput(c).value).toBe('###');
    expect(replaceInput(c).value).toBe('001');
    expect(recipeToolbar(c).outerHTML).toBe(FROZEN_RECIPE_INDEX2_ACTIVE);
  });

  it('field toolbar: disabled while empty, enabled after typing', () => {
    const c = mountDialog();
    expect(fieldToolbar(c).outerHTML).toBe(FROZEN_FIELD_DISABLED);
    type(findInput(c), 'tm');
    type(replaceInput(c), 'x');
    expect(fieldToolbar(c).outerHTML).toBe(FROZEN_FIELD_ENABLED);
    expect(c.querySelector('.tabular-nums')!.textContent).toBe('0 matches');
  });

  it('footer toolbar: fallback+disabled initially, Reset announcement after reset, enabled with find', () => {
    const c = mountDialog();
    expect(footerToolbar(c).outerHTML).toBe(FROZEN_FOOTER_FALLBACK_DISABLED);
    type(findInput(c), 'tm');
    expect(footerToolbar(c).outerHTML).toBe(FROZEN_FOOTER_FALLBACK_ENABLED);
    act(() => footerButtons(c)[1].click());
    expect(footerToolbar(c).outerHTML).toBe(FROZEN_FOOTER_RESET_DISABLED);
  });

  it('field toolbar publishes the focused action review (Swap) without touching buttons', () => {
    const c = mountDialog();
    type(findInput(c), 'tm');
    const [, swap] = fieldButtons(c);
    act(() => swap.focus());
    expect(fieldToolbar(c).outerHTML).toBe(FROZEN_FIELD_REVIEWED_SWAP);
  });
});

describe('FindReplaceDialog migration — keyboard behavior snapshots (legacy-frozen)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showFindReplace: false }));
  });

  it('footer roving: clamped arrows, Home/End, review published even when focus stays on a disabled target', () => {
    const c = mountDialog();
    const buttons = footerButtons(c);
    act(() => buttons[0].focus());
    expect(document.activeElement).toBe(buttons[0]);
    expect(footerStatus(c)).toBe('Reviewing Cancel');

    expect(press(buttons[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(footerStatus(c)).toBe('Reviewing Reset');

    // Replace All is disabled with an empty find: the review still announces,
    // but the focus move onto the disabled button is a no-op.
    expect(press(buttons[1], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(footerStatus(c)).toBe('Reviewing Replace All');

    expect(press(buttons[1], 'End')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(footerStatus(c)).toBe('Reviewing Replace All');

    expect(press(buttons[1], 'Home')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(footerStatus(c)).toBe('Reviewing Cancel');

    // Clamped at the first action.
    expect(press(buttons[0], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(footerStatus(c)).toBe('Reviewing Cancel');

    // Unrelated keys pass through untouched.
    expect(press(buttons[0], 'z')).toBe(false);
    expect(document.activeElement).toBe(buttons[0]);
    expect(footerStatus(c)).toBe('Reviewing Cancel');

    // With text in Find, Replace All is focusable and ArrowLeft steps back.
    type(findInput(c), 'tm');
    act(() => buttons[2].focus());
    expect(footerStatus(c)).toBe('Reviewing Replace All');
    expect(press(buttons[2], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(footerStatus(c)).toBe('Reviewing Reset');
  });

  it('field roving: wrap on both arrows, Home/End, skipDisabled, Swap/Clear clicks', () => {
    const c = mountDialog();
    // Both buttons share the same disabled predicate: with empty fields the
    // toolbar has no focusable action, so only the status fallback renders.
    expect(fieldButtons(c).every((b) => b.disabled)).toBe(true);
    expect(fieldStatus(c)).toBe('Reviewing Find & Replace field actions');

    type(findInput(c), 'tm');
    type(replaceInput(c), 'x');
    const buttons = fieldButtons(c);
    expect(buttons.every((b) => !b.disabled)).toBe(true);

    act(() => buttons[0].focus());
    expect(fieldStatus(c)).toBe('Reviewing Clear fields');
    expect(press(buttons[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(fieldStatus(c)).toBe('Reviewing Swap find/replace');
    // Wrapping arrows.
    expect(press(buttons[1], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(fieldStatus(c)).toBe('Reviewing Clear fields');
    expect(press(buttons[0], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(fieldStatus(c)).toBe('Reviewing Swap find/replace');
    expect(press(buttons[1], 'End')).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(fieldStatus(c)).toBe('Reviewing Swap find/replace');
    expect(press(buttons[1], 'Home')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(fieldStatus(c)).toBe('Reviewing Clear fields');

    // Clicks: swap then clear.
    act(() => buttons[1].click());
    expect(findInput(c).value).toBe('x');
    expect(replaceInput(c).value).toBe('tm');
    act(() => buttons[0].click());
    expect(findInput(c).value).toBe('');
    expect(replaceInput(c).value).toBe('');
    expect(fieldButtons(c).every((b) => b.disabled)).toBe(true);
    expect(c.querySelector('.tabular-nums')!.textContent).toBe('');
  });

  it('recipe roving: clamped arrows + Home/End, every move APPLIES the recipe and updates the composite status', () => {
    const c = mountDialog();
    const recipes = recipeButtons(c);
    act(() => recipes[0].focus());
    expect(recipeStatus(c)).toBe('Reviewing Double spaces 1 / 4. Collapse accidental double spaces in imported copy.');

    expect(press(recipes[0], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(recipes[1]);
    expect(recipeStatus(c)).toBe('Reviewing Dash cleanup 2 / 4. Convert double hyphens into an em dash.');
    expect(findInput(c).value).toBe('--');
    expect(replaceInput(c).value).toBe('—');
    expect(matchCaseBox(c).checked).toBe(false);

    expect(press(recipes[1], 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(recipes[2]);
    expect(recipeStatus(c)).toBe('Reviewing Number token 3 / 4. Replace serial placeholders with a starting number.');
    expect(findInput(c).value).toBe('###');
    expect(replaceInput(c).value).toBe('001');
    expect(recipes[2].getAttribute('aria-pressed')).toBe('true');
    expect(recipes[1].getAttribute('aria-pressed')).toBe('false');

    expect(press(recipes[2], 'End')).toBe(true);
    expect(document.activeElement).toBe(recipes[3]);
    expect(recipeStatus(c)).toBe('Reviewing Brand mark 4 / 4. Convert typed trademark markers into the symbol.');
    expect(findInput(c).value).toBe('(tm)');
    expect(replaceInput(c).value).toBe('™');

    expect(press(recipes[3], 'Home')).toBe(true);
    expect(document.activeElement).toBe(recipes[0]);
    expect(recipeStatus(c)).toBe('Reviewing Double spaces 1 / 4. Collapse accidental double spaces in imported copy.');
    expect(findInput(c).value).toBe('  ');
    expect(replaceInput(c).value).toBe(' ');
    expect(recipes[0].getAttribute('aria-pressed')).toBe('true');

    // Clamped at index 0.
    expect(press(recipes[0], 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(recipes[0]);
    expect(recipeStatus(c)).toBe('Reviewing Double spaces 1 / 4. Collapse accidental double spaces in imported copy.');

    // Clicking applies + focuses the composite status on that recipe…
    act(() => recipes[3].click());
    expect(recipeStatus(c)).toBe('Reviewing Brand mark 4 / 4. Convert typed trademark markers into the symbol.');
    expect(findInput(c).value).toBe('(tm)');
    expect(recipes[3].getAttribute('aria-pressed')).toBe('true');
    // …and plain focus (Tab) reviews without applying: fields unchanged.
    type(findInput(c), 'keepme');
    act(() => recipes[2].focus());
    expect(recipeStatus(c)).toBe('Reviewing Number token 3 / 4. Replace serial placeholders with a starting number.');
    expect(findInput(c).value).toBe('keepme');
  });

  it('Reset clears fields, match case and recipe focus, announces "Reset", and focuses Find', () => {
    const c = mountDialog();
    type(findInput(c), 'tm');
    type(replaceInput(c), 'x');
    act(() => matchCaseBox(c).click());
    expect(matchCaseBox(c).checked).toBe(true);
    const recipes = recipeButtons(c);
    act(() => recipes[0].focus());
    press(recipes[0], 'ArrowRight');
    expect(findInput(c).value).toBe('--');

    act(() => footerButtons(c)[1].click());
    expect(findInput(c).value).toBe('');
    expect(replaceInput(c).value).toBe('');
    expect(matchCaseBox(c).checked).toBe(false);
    expect(recipeStatus(c)).toBe('Reviewing Double spaces 1 / 4. Collapse accidental double spaces in imported copy.');
    expect(fieldStatus(c)).toBe('Reviewing Find & Replace field actions');
    expect(footerStatus(c)).toBe('Reviewing Reset');
    expect(document.activeElement).toBe(findInput(c));
  });

  it('Replace All click and the Enter shortcut close the dialog; Enter on an empty fresh Find does not', () => {
    const c = mountDialog();
    type(findInput(c), 'zzz');
    expect(c.querySelector('.tabular-nums')!.textContent).toBe('0 matches');
    act(() => footerButtons(c)[2].click());
    expect(useEditor.getState().showFindReplace).toBe(false);
    expect(c.innerHTML).toBe('');

    // Reopening keeps the hook state (find survives close/reopen) — Enter applies.
    act(() => useEditor.setState({ showFindReplace: true }));
    expect(findInput(c).value).toBe('zzz');
    expect(press(findInput(c), 'Enter')).toBe(true);
    expect(useEditor.getState().showFindReplace).toBe(false);

    // A freshly mounted dialog with an empty Find ignores Enter.
    const fresh = mountDialog();
    expect(press(findInput(fresh), 'Enter')).toBe(false);
    expect(useEditor.getState().showFindReplace).toBe(true);
  });

  it('ArrowDown/ArrowUp cross-focus the Find/Replace fields; the checkbox toggles', () => {
    const c = mountDialog();
    expect(press(findInput(c), 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(replaceInput(c));
    expect(press(replaceInput(c), 'ArrowUp')).toBe(true);
    expect(document.activeElement).toBe(findInput(c));
    act(() => matchCaseBox(c).click());
    expect(matchCaseBox(c).checked).toBe(true);
  });
});

describe('FindReplaceDialog migration — intended kit deltas (pinned new forms)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showFindReplace: false }));
  });

  it('all-disabled field toolbar: synthetic keydown is preventDefault-ed (guardEmpty semantics), review untouched', () => {
    // Legacy bailed before preventDefault when the skipDisabled filter emptied
    // the action list; makeRovingKeys preventDefaults first, then guardEmpty
    // returns. Unreachable via a real keyboard: the container is not
    // focusable and both buttons are disabled, so no keydown can bubble from
    // inside. Only the defaultPrevented bit differs — no review, no focus.
    const c = mountDialog();
    expect(press(fieldToolbar(c), 'ArrowRight')).toBe(true);
    expect(fieldStatus(c)).toBe('Reviewing Find & Replace field actions');
    expect(fieldButtons(c).every((b) => b.disabled)).toBe(true);
  });
});
