import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEditor } from '../../../store/editor';
import { t } from '../../../lib/i18n';
import { VariableDataDialog } from '../../VariableDataDialog';

/**
 * Migration freeze for VariableDataDialog (implementer S): the nine roving
 * regions move onto the shared dialog kit —
 *
 *   footer        → ReviewedFooter + makeRovingKeys({ clamp, fallbackToText });
 *   mode tablist  → makeSegmentKeys (Seg gains data-value; Seg is file-local
 *                   to VariableDataDialog — grep confirmed no other consumer);
 *   token chips   → ActionToolbar + PresetRow + makeRovingKeys({ wrap }) —
 *                   chips already carry data-review, so zero DOM delta;
 *   fill order    → makeSegmentKeys (same Seg change);
 *   column presets→ ActionToolbar + PresetRow + makeRovingKeys({ wrap,
 *                   skipDisabled, onNavigate applies cols });
 *   gap X/Y       → the shared dual-axis handler becomes a per-axis
 *                   makeRovingKeys({ wrap, skipDisabled, onNavigate applies
 *                   via setGapValue }) built inside GapField, so the linked
 *                   X↔Y coupling keeps living in one place;
 *   layout        → handler-only swap (SeparationsDialog listbox precedent):
 *                   the container has NO aria-describedby today and publishes
 *                   into the LIST region's shared reviewedListAction state —
 *                   ActionToolbar would add a dangling describedby, so the
 *                   container and buttons stay byte-identical legacy;
 *   serial presets→ ActionToolbar + PresetRow + makeRovingKeys({ wrap,
 *                   onNavigate applies the preset });
 *   list actions  → ActionToolbar + PresetRow + makeRovingKeys({ wrap,
 *                   skipDisabled, reviewKey=variableDataListActionReview,
 *                   fallbackToText }).
 *
 * The computed review texts (serial/column/gap) are not in the legacy DOM, so
 * the migration renders them as data-review on the preset buttons — the kit's
 * canonical announcement source. Freeze discipline (DocSettings pattern):
 * every frozen string below was captured from the LEGACY dialog and must
 * serialize byte-identically after stripping exactly those intended additions
 * (data-value on Seg tabs, data-review on serial/column/gap preset buttons);
 * every other region compares byte-identical outright. The keyboard snapshots
 * (key → preventDefault → apply → review → focus, including the dual-axis gap
 * linkage and the tablists' rAF-deferred focus) ran green against the legacy
 * handlers first. The layout region's arrows WRAP, matching the HEAD baseline
 * this migration must be equivalent to (a review round briefly flagged them
 * as clamp on a misread; the main agent re-verified HEAD and confirmed wrap —
 * the layout snapshots below pin the wrap semantics).
 */

vi.mock('../../../lib/canvasEngine', () => ({ getCanvas: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_CSV = 'Name,Room\n"Alice Chen",101\n"Bob Li",102';

/** Mirrors the dialog's serial-preset review template byte-for-byte. */
const serialReview = (preset: { label: string; start: number; step: number; count: number; pad: number; cols: number }): string =>
  `${t(preset.label)} · ${t('Start')} ${preset.start}, ${t('Step')} ${preset.step}, ${t('Count')} ${preset.count}, ${t('Pad')} ${preset.pad}, ${t('Columns')} ${preset.cols}`;

const gapReview = (axis: 'X' | 'Y', value: number, linked: boolean): string =>
  `${t('Gap')} ${axis} ${value} mm${linked ? ` · ${t('Link gaps')}` : ''}`;

const announce = (reviewed: string, fallback: string): string => `${t('Reviewing')} ${reviewed || fallback}`;

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  act(() => useEditor.setState({ showVariableData: false }));
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  act(() => useEditor.setState({ showVariableData: false }));
});

async function openDialog(): Promise<HTMLElement> {
  act(() => useEditor.setState({ showVariableData: true }));
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<VariableDataDialog />));
  const overlay = container.firstElementChild as HTMLElement | null;
  expect(overlay, 'dialog overlay rendered').toBeTruthy();
  return overlay!;
}

function modeTab(overlay: HTMLElement, value: 'number' | 'list' | 'csv'): HTMLButtonElement {
  return overlay.querySelector<HTMLButtonElement>(`#variable-mode-${value}`)!;
}

function fillTab(overlay: HTMLElement, value: 'rows' | 'columns'): HTMLButtonElement {
  return overlay.querySelector<HTMLButtonElement>(`#variable-fill-${value}`)!;
}

function setTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openListMode(values: string | null): Promise<HTMLElement> {
  const overlay = await openDialog();
  await act(async () => { modeTab(overlay, 'list').click(); });
  if (values !== null) setTextarea(overlay.querySelector<HTMLTextAreaElement>('textarea')!, values);
  return overlay;
}

async function openCsvMode(csv: string | null): Promise<HTMLElement> {
  const overlay = await openDialog();
  await act(async () => { modeTab(overlay, 'csv').click(); });
  if (csv !== null) setTextarea(overlay.querySelector<HTMLTextAreaElement>('textarea')!, csv);
  return overlay;
}

// ---- region / button getters ---------------------------------------------------

const modeRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[role="tablist"][aria-label="Variable Data modes"]')!;
const fillRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[role="tablist"][aria-label="Variable Data fill order"]')!;
const serialRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[aria-describedby="variable-data-serial-preset-review-status"]')!;
const columnRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[aria-describedby="variable-data-column-preset-review-status"]')!;
const gapRegion = (o: HTMLElement, axis: 'X' | 'Y') => o.querySelector<HTMLElement>(`[aria-describedby="variable-data-gap-${axis.toLowerCase()}-preset-review-status"]`)!;
const listRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[aria-describedby="variable-data-list-action-review-status"]');
const chipsRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[aria-describedby="variable-data-token-review-status"]')!;
const layoutRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[aria-label="Variable Data layout actions"]')!;
const footerRegion = (o: HTMLElement) => o.querySelector<HTMLElement>('[aria-describedby="variable-data-action-review-status"]')!;

const serialButtons = (o: HTMLElement) => Array.from(serialRegion(o).querySelectorAll<HTMLButtonElement>('[data-variable-data-preset]'));
const columnButtons = (o: HTMLElement) => Array.from(columnRegion(o).querySelectorAll<HTMLButtonElement>('[data-variable-data-column-preset]'));
const gapButtons = (o: HTMLElement, axis: 'X' | 'Y') => Array.from(gapRegion(o, axis).querySelectorAll<HTMLButtonElement>('[data-variable-data-gap-preset]'));
const listButtons = (o: HTMLElement) => Array.from(listRegion(o)!.querySelectorAll<HTMLButtonElement>('[data-variable-data-list-action]'));
const chipsButtons = (o: HTMLElement) => Array.from(chipsRegion(o).querySelectorAll<HTMLButtonElement>('[data-variable-data-token]'));
const layoutButtons = (o: HTMLElement) => Array.from(layoutRegion(o).querySelectorAll<HTMLButtonElement>('[data-variable-data-layout-action]'));
const footerButtons = (o: HTMLElement) => Array.from(footerRegion(o).querySelectorAll<HTMLButtonElement>('[data-variable-data-action]'));

/** The numeric input sharing the Field with a preset toolbar. */
const fieldInput = (region: HTMLElement): HTMLInputElement => region.closest('label')!.querySelector('input')!;

const reviewText = (statusId: string): string | null => document.getElementById(statusId)?.textContent ?? null;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
}

/**
 * Serializes a region after removing the intended migration additions
 * (data-value on Seg tabs; data-review on serial/column/gap preset buttons),
 * so the frozen legacy strings keep guarding byte-identity through the change.
 */
function stripIntendedDeltas(region: HTMLElement): string {
  const clone = region.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button[data-value]').forEach((button) => button.removeAttribute('data-value'));
  clone.querySelectorAll('button[data-review]').forEach((button) => button.removeAttribute('data-review'));
  return clone.outerHTML;
}

// ---- frozen DOM (captured from the legacy dialog) --------------------------------

const FROZEN_MODE_TABLIST =
  '<div class="flex gap-1" role="tablist" aria-label="Variable Data modes" title="Use arrow keys to switch modes">'
  + '<button id="variable-mode-number" type="button" role="tab" aria-selected="true" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-[#ff2e9a] text-ink bg-panel2">Numbers</button>'
  + '<button id="variable-mode-list" type="button" role="tab" aria-selected="false" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-border text-muted hover:text-ink">List</button>'
  + '<button id="variable-mode-csv" type="button" role="tab" aria-selected="false" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-border text-muted hover:text-ink">CSV</button>'
  + '</div>';

const FROZEN_FILL_TABLIST =
  '<div class="flex gap-1" role="tablist" aria-label="Variable Data fill order" title="Use arrow keys to switch fill order">'
  + '<button id="variable-fill-rows" type="button" role="tab" aria-selected="true" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-[#ff2e9a] text-ink bg-panel2">Rows</button>'
  + '<button id="variable-fill-columns" type="button" role="tab" aria-selected="false" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-border text-muted hover:text-ink">Cols</button>'
  + '</div>';

const FROZEN_SERIAL_TOOLBAR =
  '<div class="grid grid-cols-4 gap-1" role="toolbar" aria-label="Variable Data serial presets" aria-describedby="variable-data-serial-preset-review-status" title="Use arrow keys to review serial presets">'
  + '<span id="variable-data-serial-preset-review-status" class="sr-only" aria-live="polite">Reviewing Serial presets</span>'
  + '<button type="button" data-variable-data-preset="badges-10" class="btn !py-1 !px-1.5 !text-[10px] " aria-pressed="false" title="Badges 10 · Start 1, Step 1, Count 10, Pad 2">Badges 10</button>'
  + '<button type="button" data-variable-data-preset="badges-50" class="btn !py-1 !px-1.5 !text-[10px] " aria-pressed="false" title="Badges 50 · Start 1, Step 1, Count 50, Pad 3">Badges 50</button>'
  + '<button type="button" data-variable-data-preset="odds-25" class="btn !py-1 !px-1.5 !text-[10px] " aria-pressed="false" title="Odd 25 · Start 1, Step 2, Count 25, Pad 2">Odd 25</button>'
  + '<button type="button" data-variable-data-preset="tickets-100" class="btn !py-1 !px-1.5 !text-[10px] " aria-pressed="false" title="Tickets 100 · Start 1, Step 1, Count 100, Pad 3">Tickets 100</button>'
  + '</div>';

const FROZEN_COLUMN_TOOLBAR =
  '<div class="mt-1 grid grid-cols-5 gap-1" role="toolbar" aria-label="Variable Data column presets" aria-describedby="variable-data-column-preset-review-status" title="Use arrow keys to review column presets">'
  + '<span id="variable-data-column-preset-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data column presets</span>'
  + '<button type="button" data-variable-data-column-preset="2" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">2</button>'
  + '<button type="button" data-variable-data-column-preset="3" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">3</button>'
  + '<button type="button" data-variable-data-column-preset="4" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">4</button>'
  + '<button type="button" data-variable-data-column-preset="5" class="btn !py-0.5 !px-1 !text-[10px] ring-1 ring-accent" aria-pressed="true">5</button>'
  + '<button type="button" data-variable-data-column-preset="10" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">10</button>'
  + '</div>';

const FROZEN_GAP_X_TOOLBAR =
  '<div class="mt-1 grid grid-cols-5 gap-1" role="toolbar" aria-label="Variable Data gap X presets" aria-describedby="variable-data-gap-x-preset-review-status" title="Use arrow keys to review gap presets">'
  + '<span id="variable-data-gap-x-preset-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data gap X presets</span>'
  + '<button type="button" data-variable-data-gap-preset="5" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">5</button>'
  + '<button type="button" data-variable-data-gap-preset="10" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">10</button>'
  + '<button type="button" data-variable-data-gap-preset="20" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">20</button>'
  + '<button type="button" data-variable-data-gap-preset="40" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] ring-1 ring-accent" aria-pressed="true">40</button>'
  + '<button type="button" data-variable-data-gap-preset="80" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">80</button>'
  + '</div>';

const FROZEN_GAP_X_TOOLBAR_LINKED =
  '<div class="mt-1 grid grid-cols-5 gap-1" role="toolbar" aria-label="Variable Data gap X presets" aria-describedby="variable-data-gap-x-preset-review-status" title="Linked gaps: presets update both axes">'
  + '<span id="variable-data-gap-x-preset-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data gap X presets</span>'
  + '<button type="button" data-variable-data-gap-preset="5" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">5</button>'
  + '<button type="button" data-variable-data-gap-preset="10" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">10</button>'
  + '<button type="button" data-variable-data-gap-preset="20" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">20</button>'
  + '<button type="button" data-variable-data-gap-preset="40" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] ring-1 ring-accent" aria-pressed="true">40</button>'
  + '<button type="button" data-variable-data-gap-preset="80" data-variable-data-gap-axis="X" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">80</button>'
  + '</div>';

const FROZEN_GAP_Y_TOOLBAR =
  '<div class="mt-1 grid grid-cols-5 gap-1" role="toolbar" aria-label="Variable Data gap Y presets" aria-describedby="variable-data-gap-y-preset-review-status" title="Use arrow keys to review gap presets">'
  + '<span id="variable-data-gap-y-preset-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data gap Y presets</span>'
  + '<button type="button" data-variable-data-gap-preset="5" data-variable-data-gap-axis="Y" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">5</button>'
  + '<button type="button" data-variable-data-gap-preset="10" data-variable-data-gap-axis="Y" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">10</button>'
  + '<button type="button" data-variable-data-gap-preset="20" data-variable-data-gap-axis="Y" class="btn !py-0.5 !px-1 !text-[10px] ring-1 ring-accent" aria-pressed="true">20</button>'
  + '<button type="button" data-variable-data-gap-preset="40" data-variable-data-gap-axis="Y" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">40</button>'
  + '<button type="button" data-variable-data-gap-preset="80" data-variable-data-gap-axis="Y" class="btn !py-0.5 !px-1 !text-[10px] " aria-pressed="false">80</button>'
  + '</div>';

const FROZEN_LAYOUT_TOOLBAR =
  '<div class="mt-2 flex justify-end gap-1" role="toolbar" aria-label="Variable Data layout actions" title="Use arrow keys to review layout actions">'
  + '<button type="button" data-variable-data-layout-action="true" class="btn !py-1 !px-2 !text-[10px]">Auto gap</button>'
  + '<button type="button" data-variable-data-layout-action="true" class="btn !py-1 !px-2 !text-[10px] " aria-pressed="false">Link gaps</button>'
  + '</div>';

const FROZEN_FOOTER =
  '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="Variable Data actions" aria-describedby="variable-data-action-review-status" title="Use arrow keys to review dialog actions">'
  + '<span id="variable-data-action-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data actions</span>'
  + '<button type="button" data-variable-data-action="true" data-variable-data-action-review="Cancel" class="btn">Cancel</button>'
  + '<button type="button" data-variable-data-action="true" data-variable-data-action-review="Generate" class="btn-primary">Generate</button>'
  + '</div>';

const FROZEN_LIST_TOOLBAR_EMPTY =
  '<div class="grid grid-cols-3 gap-1 mt-1 mb-2" role="toolbar" aria-label="Variable Data list actions" aria-describedby="variable-data-list-action-review-status" title="Use arrow keys to review list actions">'
  + '<span id="variable-data-list-action-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data list actions</span>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Sample list" class="btn !py-1 !px-1.5 !text-[10px]">Sample list</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Clean list" class="btn !py-1 !px-1.5 !text-[10px]" disabled="">Clean list</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Dedupe" class="btn !py-1 !px-1.5 !text-[10px]" disabled="">Dedupe</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Sort A-Z" class="btn !py-1 !px-1.5 !text-[10px]" disabled="">Sort A-Z</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Reverse" class="btn !py-1 !px-1.5 !text-[10px]" disabled="">Reverse</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Clear list" class="btn !py-1 !px-1.5 !text-[10px]" disabled="">Clear list</button>'
  + '</div>';

const FROZEN_LIST_TOOLBAR_FILLED =
  '<div class="grid grid-cols-3 gap-1 mt-1 mb-2" role="toolbar" aria-label="Variable Data list actions" aria-describedby="variable-data-list-action-review-status" title="Use arrow keys to review list actions">'
  + '<span id="variable-data-list-action-review-status" class="sr-only" aria-live="polite">Reviewing Variable Data list actions</span>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Sample list" class="btn !py-1 !px-1.5 !text-[10px]">Sample list</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Clean list" class="btn !py-1 !px-1.5 !text-[10px]">Clean list</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Dedupe" class="btn !py-1 !px-1.5 !text-[10px]">Dedupe</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Sort A-Z" class="btn !py-1 !px-1.5 !text-[10px]">Sort A-Z</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Reverse" class="btn !py-1 !px-1.5 !text-[10px]">Reverse</button>'
  + '<button type="button" data-variable-data-list-action="true" data-variable-data-list-action-review="Clear list" class="btn !py-1 !px-1.5 !text-[10px]">Clear list</button>'
  + '</div>';

const FROZEN_CHIPS_TOOLBAR =
  '<div class="flex flex-wrap gap-1 mb-1.5" role="toolbar" aria-label="Column token chips" aria-describedby="variable-data-token-review-status" title="Use arrow keys to review token chips">'
  + '<span id="variable-data-token-review-status" class="sr-only" aria-live="polite">Reviewing Column token chips</span>'
  + '<button type="button" data-variable-data-token="Name" data-review="Insert token {{Name}}" class="btn !py-0.5 !px-1.5 !text-[10px] font-mono" title="Copy the {{token}} for this column to the clipboard. — {{Name}}">{{Name}}</button>'
  + '<button type="button" data-variable-data-token="Room" data-review="Insert token {{Room}}" class="btn !py-0.5 !px-1.5 !text-[10px] font-mono" title="Copy the {{token}} for this column to the clipboard. — {{Room}}">{{Room}}</button>'
  + '</div>';

const FROZEN_CHIPS_TOOLBAR_EMPTY =
  '<div class="flex flex-wrap gap-1 mb-1.5" role="toolbar" aria-label="Column token chips" aria-describedby="variable-data-token-review-status" title="Use arrow keys to review token chips">'
  + '<span id="variable-data-token-review-status" class="sr-only" aria-live="polite">Reviewing Column token chips</span>'
  + '</div>';

const FROZEN_CSV_SUMMARY =
  '<span id="variable-data-csv-summary" class="text-muted tabular-nums" aria-live="polite">2 records · 2 columns</span>';

const FROZEN_PREVIEW_STATUS =
  '<div class="mt-2 rounded-md border border-border bg-panel2/60 p-2" role="status" aria-live="polite" aria-atomic="true" aria-label="Generation preview: Numbers. 10 values. Grid: 2 × 5. 1, 2, 3">'
  + '<div class="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted"><span>Generation preview</span><span>10 values</span></div>'
  + '<div class="mt-1 text-[10px] text-muted">Grid: 2 × 5 · 10 cells</div>'
  + '<div class="mt-1 flex flex-wrap gap-1">'
  + '<span class="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink">1</span>'
  + '<span class="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink">2</span>'
  + '<span class="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink">3</span>'
  + '<span class="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink">4</span>'
  + '<span class="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink">5</span>'
  + '<span class="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">+5</span>'
  + '</div>'
  + '</div>';

describe('VariableDataDialog migration — frozen DOM', () => {
  it('mode tablist serializes byte-identically (number active, modulo new data-value)', async () => {
    const overlay = await openDialog();
    expect(stripIntendedDeltas(modeRegion(overlay))).toBe(FROZEN_MODE_TABLIST);
  });

  it('fill order tablist serializes byte-identically (rows active, modulo new data-value)', async () => {
    const overlay = await openDialog();
    expect(stripIntendedDeltas(fillRegion(overlay))).toBe(FROZEN_FILL_TABLIST);
  });

  it('serial preset toolbar serializes byte-identically (defaults, modulo new data-review)', async () => {
    const overlay = await openDialog();
    expect(stripIntendedDeltas(serialRegion(overlay))).toBe(FROZEN_SERIAL_TOOLBAR);
    expect(reviewText('variable-data-serial-preset-review-status')).toBe(announce('', t('Serial presets')));
  });

  it('column preset toolbar serializes byte-identically (cols=5 pressed, modulo new data-review)', async () => {
    const overlay = await openDialog();
    expect(stripIntendedDeltas(columnRegion(overlay))).toBe(FROZEN_COLUMN_TOOLBAR);
    expect(reviewText('variable-data-column-preset-review-status')).toBe(announce('', t('Variable Data column presets')));
  });

  it('gap X toolbar serializes byte-identically (gapX=40 pressed, unlinked, modulo new data-review)', async () => {
    const overlay = await openDialog();
    expect(stripIntendedDeltas(gapRegion(overlay, 'X'))).toBe(FROZEN_GAP_X_TOOLBAR);
    expect(reviewText('variable-data-gap-x-preset-review-status')).toBe(announce('', t('Variable Data gap X presets')));
  });

  it('gap X toolbar swaps only its title when gaps are linked', async () => {
    const overlay = await openDialog();
    await act(async () => { layoutButtons(overlay)[1].click(); });
    expect(stripIntendedDeltas(gapRegion(overlay, 'X'))).toBe(FROZEN_GAP_X_TOOLBAR_LINKED);
  });

  it('gap Y toolbar serializes byte-identically (gapY=20 pressed, modulo new data-review)', async () => {
    const overlay = await openDialog();
    expect(stripIntendedDeltas(gapRegion(overlay, 'Y'))).toBe(FROZEN_GAP_Y_TOOLBAR);
    expect(reviewText('variable-data-gap-y-preset-review-status')).toBe(announce('', t('Variable Data gap Y presets')));
  });

  it('layout toolbar serializes byte-identically (kept legacy, handler-only swap)', async () => {
    const overlay = await openDialog();
    expect(layoutRegion(overlay).outerHTML).toBe(FROZEN_LAYOUT_TOOLBAR);
  });

  it('action footer serializes byte-identically', async () => {
    const overlay = await openDialog();
    expect(footerRegion(overlay).outerHTML).toBe(FROZEN_FOOTER);
    expect(reviewText('variable-data-action-review-status')).toBe(announce('', t('Variable Data actions')));
  });

  it('list toolbar serializes byte-identically with empty values (5 disabled)', async () => {
    const overlay = await openListMode('');
    expect(listRegion(overlay)!.outerHTML).toBe(FROZEN_LIST_TOOLBAR_EMPTY);
    expect(reviewText('variable-data-list-action-review-status')).toBe(announce('', t('Variable Data list actions')));
  });

  it('list toolbar serializes byte-identically with values (all enabled)', async () => {
    const overlay = await openListMode('Alpha, Beta\nBeta\nGamma');
    expect(listRegion(overlay)!.outerHTML).toBe(FROZEN_LIST_TOOLBAR_FILLED);
  });

  it('token chips toolbar serializes byte-identically (2 columns, no delta)', async () => {
    const overlay = await openCsvMode(SAMPLE_CSV);
    expect(chipsRegion(overlay).outerHTML).toBe(FROZEN_CHIPS_TOOLBAR);
    expect(reviewText('variable-data-token-review-status')).toBe(announce('', t('Column token chips')));
  });

  it('token chips toolbar serializes byte-identically when empty', async () => {
    const overlay = await openCsvMode('');
    expect(chipsRegion(overlay).outerHTML).toBe(FROZEN_CHIPS_TOOLBAR_EMPTY);
  });

  it('CSV summary live span serializes byte-identically (kept legacy)', async () => {
    const overlay = await openCsvMode(SAMPLE_CSV);
    expect(overlay.querySelector('#variable-data-csv-summary')!.outerHTML).toBe(FROZEN_CSV_SUMMARY);
  });

  it('generation preview status region serializes byte-identically (kept legacy)', async () => {
    const overlay = await openDialog();
    expect(overlay.querySelector('[role="status"][aria-atomic="true"]')!.outerHTML).toBe(FROZEN_PREVIEW_STATUS);
  });
});

describe('mode tablist — segment roving (wrap, rAF-deferred focus)', () => {
  it('ArrowRight applies the next mode synchronously and moves focus on the next frame', async () => {
    const overlay = await openDialog();
    const numberTab = modeTab(overlay, 'number');
    const listTab = modeTab(overlay, 'list');
    act(() => numberTab.focus());
    const event = press(numberTab, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(listTab.getAttribute('aria-selected')).toBe('true');
    expect(numberTab.getAttribute('aria-selected')).toBe('false');
    expect(document.activeElement).toBe(numberTab);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(listTab);
  });

  it('wraps ArrowRight at CSV back to Numbers and ArrowLeft at Numbers back to CSV', async () => {
    const overlay = await openDialog();
    await act(async () => { modeTab(overlay, 'csv').click(); });
    act(() => modeTab(overlay, 'csv').focus());
    press(modeTab(overlay, 'csv'), 'ArrowRight');
    await act(async () => { await nextFrame(); });
    expect(modeTab(overlay, 'number').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(modeTab(overlay, 'number'));

    act(() => modeTab(overlay, 'number').focus());
    press(modeTab(overlay, 'number'), 'ArrowLeft');
    await act(async () => { await nextFrame(); });
    expect(modeTab(overlay, 'csv').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(modeTab(overlay, 'csv'));
  });

  it('Home selects Numbers and End selects CSV', async () => {
    const overlay = await openDialog();
    await act(async () => { modeTab(overlay, 'list').click(); });
    act(() => modeTab(overlay, 'list').focus());
    press(modeTab(overlay, 'list'), 'Home');
    await act(async () => { await nextFrame(); });
    expect(modeTab(overlay, 'number').getAttribute('aria-selected')).toBe('true');
    act(() => modeTab(overlay, 'list').focus());
    press(modeTab(overlay, 'list'), 'End');
    await act(async () => { await nextFrame(); });
    expect(modeTab(overlay, 'csv').getAttribute('aria-selected')).toBe('true');
  });
});

describe('fill order tablist — segment roving (wrap, rAF-deferred focus)', () => {
  it('ArrowRight switches rows → columns; ArrowLeft wraps columns → rows → rows switches back', async () => {
    const overlay = await openDialog();
    const rowsTab = fillTab(overlay, 'rows');
    const colsTab = fillTab(overlay, 'columns');
    act(() => rowsTab.focus());
    press(rowsTab, 'ArrowRight');
    expect(colsTab.getAttribute('aria-selected')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(colsTab);

    act(() => colsTab.focus());
    press(colsTab, 'ArrowLeft');
    expect(rowsTab.getAttribute('aria-selected')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(rowsTab);
  });

  it('Home lands on Rows and End on Columns', async () => {
    const overlay = await openDialog();
    act(() => fillTab(overlay, 'columns').focus());
    press(fillTab(overlay, 'columns'), 'Home');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(fillTab(overlay, 'rows'));
    act(() => fillTab(overlay, 'rows').focus());
    press(fillTab(overlay, 'rows'), 'End');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(fillTab(overlay, 'columns'));
  });
});

describe('footer — clamped roving with action-review announcements', () => {
  it('ArrowRight moves focus Cancel → Generate and announces immediately', async () => {
    const overlay = await openDialog();
    const [cancel, generate] = footerButtons(overlay);
    act(() => cancel.focus());
    const event = press(cancel, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(generate);
    expect(reviewText('variable-data-action-review-status')).toBe(announce(t('Generate'), t('Variable Data actions')));
  });

  it('clamps ArrowLeft at Cancel and ArrowRight at Generate', async () => {
    const overlay = await openDialog();
    const [cancel, generate] = footerButtons(overlay);
    act(() => cancel.focus());
    press(cancel, 'ArrowLeft');
    expect(document.activeElement).toBe(cancel);
    expect(reviewText('variable-data-action-review-status')).toBe(announce(t('Cancel'), t('Variable Data actions')));
    act(() => generate.focus());
    press(generate, 'ArrowRight');
    expect(document.activeElement).toBe(generate);
    expect(reviewText('variable-data-action-review-status')).toBe(announce(t('Generate'), t('Variable Data actions')));
  });

  it('Home jumps to Cancel and End to Generate', async () => {
    const overlay = await openDialog();
    const [cancel, generate] = footerButtons(overlay);
    act(() => generate.focus());
    press(generate, 'Home');
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.focus());
    press(cancel, 'End');
    expect(document.activeElement).toBe(generate);
  });
});

describe('token chips — wrapping roving over the CSV columns', () => {
  it('ArrowRight moves Name → Room and announces the insert-token review', async () => {
    const overlay = await openCsvMode(SAMPLE_CSV);
    const [nameChip, roomChip] = chipsButtons(overlay);
    act(() => nameChip.focus());
    const event = press(nameChip, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(roomChip);
    expect(reviewText('variable-data-token-review-status')).toBe(announce(`${t('Insert token')} {{Room}}`, t('Column token chips')));
  });

  it('wraps at both ends and answers Home/End', async () => {
    const overlay = await openCsvMode(SAMPLE_CSV);
    const [nameChip, roomChip] = chipsButtons(overlay);
    act(() => roomChip.focus());
    press(roomChip, 'ArrowRight');
    expect(document.activeElement).toBe(nameChip);
    expect(reviewText('variable-data-token-review-status')).toBe(announce(`${t('Insert token')} {{Name}}`, t('Column token chips')));
    act(() => roomChip.focus());
    press(roomChip, 'Home');
    expect(document.activeElement).toBe(nameChip);
    act(() => nameChip.focus());
    press(nameChip, 'End');
    expect(document.activeElement).toBe(roomChip);
  });

  it('on the empty toolbar ArrowRight still prevents default (kit guardEmpty order — intentional delta)', async () => {
    const overlay = await openCsvMode('');
    const region = chipsRegion(overlay);
    expect(chipsButtons(overlay)).toHaveLength(0);
    // The legacy handler returned before preventDefault when the chip list
    // was empty; the kit's guardEmpty bails AFTER preventing. Nothing inside
    // an empty container is focusable, so the keydown can only arrive here
    // via synthetic dispatch — the delta is unobservable for real users.
    const event = press(region, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(reviewText('variable-data-token-review-status')).toBe(announce('', t('Column token chips')));
  });
});

describe('column presets — wrapping roving that applies the preset', () => {
  it('ArrowRight applies the next column count synchronously and announces it', async () => {
    const overlay = await openDialog();
    const buttons = columnButtons(overlay);
    const input = fieldInput(columnRegion(overlay)) as HTMLInputElement;
    act(() => buttons[3].focus()); // "5" is pressed at cols=5
    const event = press(buttons[3], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[4]);
    expect(input.value).toBe('10');
    expect(buttons[4].getAttribute('aria-pressed')).toBe('true');
    expect(reviewText('variable-data-column-preset-review-status')).toBe(announce(`${t('Columns')} 10`, t('Variable Data column presets')));
  });

  it('wraps 10 → 2 on ArrowRight and 2 → 10 on ArrowLeft', async () => {
    const overlay = await openDialog();
    const buttons = columnButtons(overlay);
    const input = fieldInput(columnRegion(overlay)) as HTMLInputElement;
    act(() => buttons[4].focus());
    press(buttons[4], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    expect(input.value).toBe('2');
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[4]);
    expect(input.value).toBe('10');
  });

  it('Home jumps to the first preset and End to the last', async () => {
    const overlay = await openDialog();
    const buttons = columnButtons(overlay);
    act(() => buttons[2].focus());
    press(buttons[2], 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    act(() => buttons[2].focus());
    press(buttons[2], 'End');
    expect(document.activeElement).toBe(buttons[4]);
  });
});

describe('gap presets — dual-axis roving with linked X↔Y coupling', () => {
  it('ArrowRight on the X axis applies gapX only when unlinked', async () => {
    const overlay = await openDialog();
    const xButtons = gapButtons(overlay, 'X');
    const xInput = fieldInput(gapRegion(overlay, 'X')) as HTMLInputElement;
    const yInput = fieldInput(gapRegion(overlay, 'Y')) as HTMLInputElement;
    act(() => xButtons[3].focus()); // gapX=40 default
    const event = press(xButtons[3], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(xButtons[4]);
    expect(xInput.value).toBe('80');
    expect(yInput.value).toBe('20');
    expect(xButtons[4].getAttribute('aria-pressed')).toBe('true');
    expect(reviewText('variable-data-gap-x-preset-review-status')).toBe(announce(gapReview('X', 80, false), t('Variable Data gap X presets')));
    expect(reviewText('variable-data-gap-y-preset-review-status')).toBe(announce('', t('Variable Data gap Y presets')));
  });

  it('ArrowRight on the X axis applies BOTH axes when gaps are linked', async () => {
    const overlay = await openDialog();
    await act(async () => { layoutButtons(overlay)[1].click(); }); // Link gaps on
    const xButtons = gapButtons(overlay, 'X');
    const xInput = fieldInput(gapRegion(overlay, 'X')) as HTMLInputElement;
    const yInput = fieldInput(gapRegion(overlay, 'Y')) as HTMLInputElement;
    act(() => xButtons[3].focus());
    press(xButtons[3], 'ArrowRight');
    expect(xInput.value).toBe('80');
    expect(yInput.value).toBe('80');
    expect(gapButtons(overlay, 'Y')[4].getAttribute('aria-pressed')).toBe('true');
    expect(reviewText('variable-data-gap-x-preset-review-status')).toBe(announce(gapReview('X', 80, true), t('Variable Data gap X presets')));
    // Legacy semantics: navigating X reviews only the X region; Y stays on its fallback.
    expect(reviewText('variable-data-gap-y-preset-review-status')).toBe(announce('', t('Variable Data gap Y presets')));
  });

  it('the Y container drives only gapY and announces into its own region', async () => {
    const overlay = await openDialog();
    const yButtons = gapButtons(overlay, 'Y');
    const xInput = fieldInput(gapRegion(overlay, 'X')) as HTMLInputElement;
    const yInput = fieldInput(gapRegion(overlay, 'Y')) as HTMLInputElement;
    act(() => yButtons[2].focus()); // gapY=20 default
    press(yButtons[2], 'End');
    expect(document.activeElement).toBe(yButtons[4]);
    expect(yInput.value).toBe('80');
    expect(xInput.value).toBe('40');
    expect(reviewText('variable-data-gap-y-preset-review-status')).toBe(announce(gapReview('Y', 80, false), t('Variable Data gap Y presets')));
  });

  it('wraps 80 → 5 on ArrowRight', async () => {
    const overlay = await openDialog();
    const xButtons = gapButtons(overlay, 'X');
    const xInput = fieldInput(gapRegion(overlay, 'X')) as HTMLInputElement;
    act(() => xButtons[4].focus());
    press(xButtons[4], 'ArrowRight');
    expect(document.activeElement).toBe(xButtons[0]);
    expect(xInput.value).toBe('5');
  });
});

describe('layout actions — wrapping roving that publishes into the shared list review state', () => {
  it('ArrowRight moves Auto gap → Link gaps, announced through the list region (list mode)', async () => {
    const overlay = await openListMode('');
    const [autoGap, linkGaps] = layoutButtons(overlay);
    act(() => autoGap.focus());
    const event = press(autoGap, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(linkGaps);
    expect(reviewText('variable-data-list-action-review-status')).toBe(announce(t('Link gaps'), t('Variable Data list actions')));
  });

  it('wraps ArrowRight at Link gaps back to Auto gap and ArrowLeft at Auto gap forward to Link gaps', async () => {
    const overlay = await openListMode('');
    const [autoGap, linkGaps] = layoutButtons(overlay);
    act(() => linkGaps.focus());
    press(linkGaps, 'ArrowRight');
    expect(document.activeElement).toBe(autoGap);
    expect(reviewText('variable-data-list-action-review-status')).toBe(announce(t('Auto gap'), t('Variable Data list actions')));
    act(() => autoGap.focus());
    press(autoGap, 'ArrowLeft');
    expect(document.activeElement).toBe(linkGaps);
    expect(reviewText('variable-data-list-action-review-status')).toBe(announce(t('Link gaps'), t('Variable Data list actions')));
    act(() => linkGaps.focus());
    press(linkGaps, 'Home');
    expect(document.activeElement).toBe(autoGap);
    act(() => autoGap.focus());
    press(autoGap, 'End');
    expect(document.activeElement).toBe(linkGaps);
  });

  it('outside list mode the shared review region does not exist (legacy semantics)', async () => {
    const overlay = await openDialog();
    const [autoGap] = layoutButtons(overlay);
    act(() => autoGap.focus());
    press(autoGap, 'ArrowRight');
    expect(document.getElementById('variable-data-list-action-review-status')).toBeNull();
  });
});

describe('serial presets — wrapping roving that applies the preset', () => {
  it('ArrowRight applies the next preset synchronously and announces its full description', async () => {
    const overlay = await openDialog();
    const buttons = serialButtons(overlay);
    act(() => buttons[0].focus());
    const event = press(buttons[0], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(reviewText('variable-data-serial-preset-review-status')).toBe(
      announce(serialReview({ label: 'Badges 50', start: 1, step: 1, count: 50, pad: 3, cols: 5 }), t('Serial presets')),
    );
  });

  it('applying a preset updates the number fields (Count input follows the preset)', async () => {
    const overlay = await openDialog();
    const buttons = serialButtons(overlay);
    const countInput = overlay.querySelector<HTMLInputElement>('input[type="number"][min="1"][max="2000"]')!;
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowRight');
    expect(countInput.value).toBe('50');
  });

  it('wraps Tickets 100 → Badges 10 on ArrowRight', async () => {
    const overlay = await openDialog();
    const buttons = serialButtons(overlay);
    act(() => buttons[3].focus());
    press(buttons[3], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute('aria-selected') ?? buttons[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('Home jumps to the first preset and End to the last', async () => {
    const overlay = await openDialog();
    const buttons = serialButtons(overlay);
    act(() => buttons[2].focus());
    press(buttons[2], 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    act(() => buttons[2].focus());
    press(buttons[2], 'End');
    expect(document.activeElement).toBe(buttons[3]);
  });
});

describe('list actions — wrapping roving that skips disabled buttons', () => {
  it('with empty values only Sample list is reachable (roving wraps onto itself)', async () => {
    const overlay = await openListMode('');
    const buttons = listButtons(overlay);
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    expect(reviewText('variable-data-list-action-review-status')).toBe(announce(t('Sample list'), t('Variable Data list actions')));
  });

  it('with values the arrows step through all six actions and wrap', async () => {
    const overlay = await openListMode('Alpha\nBeta');
    const buttons = listButtons(overlay);
    act(() => buttons[1].focus()); // Clean list
    press(buttons[1], 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[0]); // wrapped 1-1+6=6 %6=0
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    expect(reviewText('variable-data-list-action-review-status')).toBe(announce(t('Clean list'), t('Variable Data list actions')));
  });

  it('disabled buttons are skipped from focus (not reachable via Home/End path)', async () => {
    const overlay = await openListMode('');
    const buttons = listButtons(overlay);
    for (const button of buttons.slice(1)) expect(button.disabled).toBe(true);
    act(() => buttons[0].focus());
    press(buttons[0], 'End');
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('intended DOM deltas — attributes the migration adds', () => {
  it('Seg tabs carry data-value so makeSegmentKeys can focus them (Seg is file-local)', async () => {
    const overlay = await openDialog();
    expect(modeTab(overlay, 'number').getAttribute('data-value')).toBe('number');
    expect(modeTab(overlay, 'list').getAttribute('data-value')).toBe('list');
    expect(modeTab(overlay, 'csv').getAttribute('data-value')).toBe('csv');
    expect(fillTab(overlay, 'rows').getAttribute('data-value')).toBe('rows');
    expect(fillTab(overlay, 'columns').getAttribute('data-value')).toBe('columns');
  });

  it('serial preset buttons carry their full description as data-review', async () => {
    const overlay = await openDialog();
    expect(serialButtons(overlay).map((button) => button.getAttribute('data-review'))).toEqual([
      serialReview({ label: 'Badges 10', start: 1, step: 1, count: 10, pad: 2, cols: 5 }),
      serialReview({ label: 'Badges 50', start: 1, step: 1, count: 50, pad: 3, cols: 5 }),
      serialReview({ label: 'Odd 25', start: 1, step: 2, count: 25, pad: 2, cols: 5 }),
      serialReview({ label: 'Tickets 100', start: 1, step: 1, count: 100, pad: 3, cols: 10 }),
    ]);
  });

  it('column preset buttons carry "Columns N" as data-review', async () => {
    const overlay = await openDialog();
    expect(columnButtons(overlay).map((button) => button.getAttribute('data-review'))).toEqual(
      [2, 3, 4, 5, 10].map((preset) => `${t('Columns')} ${preset}`),
    );
  });

  it('gap preset buttons carry the axis review text, gaining the Link gaps suffix when linked', async () => {
    const overlay = await openDialog();
    expect(gapButtons(overlay, 'X').map((button) => button.getAttribute('data-review'))).toEqual(
      [5, 10, 20, 40, 80].map((preset) => gapReview('X', preset, false)),
    );
    expect(gapButtons(overlay, 'Y').map((button) => button.getAttribute('data-review'))).toEqual(
      [5, 10, 20, 40, 80].map((preset) => gapReview('Y', preset, false)),
    );
    await act(async () => { layoutButtons(overlay)[1].click(); });
    expect(gapButtons(overlay, 'X')[0].getAttribute('data-review')).toBe(gapReview('X', 5, true));
    expect(gapButtons(overlay, 'Y')[4].getAttribute('data-review')).toBe(gapReview('Y', 80, true));
  });
});

describe('action wiring across the migration', () => {
  it('Cancel click flips the store flag and unmounts the overlay', async () => {
    const overlay = await openDialog();
    await act(async () => { footerButtons(overlay)[0].click(); });
    expect(useEditor.getState().showVariableData).toBe(false);
    expect(overlay.isConnected).toBe(false);
  });

  it('clicking the CSV mode tab selects it (e2e mirror)', async () => {
    const overlay = await openDialog();
    const csvTab = modeTab(overlay, 'csv');
    await act(async () => { csvTab.click(); });
    expect(csvTab.getAttribute('aria-selected')).toBe('true');
    expect(overlay.querySelector('textarea')).toBeTruthy();
  });

  it('Sample list fills the values textarea', async () => {
    const overlay = await openListMode('');
    await act(async () => { listButtons(overlay)[0].click(); });
    expect(overlay.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('Alice Chen');
  });

  it('Link gaps toggles aria-pressed and its ring class', async () => {
    const overlay = await openDialog();
    const linkGaps = layoutButtons(overlay)[1];
    expect(linkGaps.getAttribute('aria-pressed')).toBe('false');
    await act(async () => { linkGaps.click(); });
    expect(linkGaps.getAttribute('aria-pressed')).toBe('true');
    expect(linkGaps.className).toContain('ring-1');
  });
});
