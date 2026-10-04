import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { ActionToolbar } from '../ActionToolbar';
import { ReviewedFooter } from '../ReviewedFooter';
import { SearchableListActions } from '../SearchableListActions';
import { actionReviewKey, makeRovingKeys, makeSegmentKeys } from '../useRovingActions';

/**
 * DocSettingsDialog → house dialog kit migration contract.
 *
 * The LEGACY fixtures below are verbatim copies of the pre-migration
 * DocSettingsDialog regions (three action-review toolbars + the external
 * match-count live span). The KIT fixtures use exactly the wiring the
 * migrated DocSettingsDialog renders (ActionToolbar / ReviewedFooter /
 * SearchableListActions + makeRovingKeys / makeSegmentKeys). `t` is the
 * identity, as in dialogKitEquivalence.
 *
 * Bars:
 * - DOM: canonical equality everywhere (tags, text, sorted attributes); the
 *   footer / search toolbars additionally serialize byte-identical; the
 *   orientation toolbar is byte-identical after stripping its two new
 *   `data-value` attributes (the one intentional DOM delta, see the case).
 * - Keyboard: an identical key script run against the legacy handler wiring
 *   and the kit handler wiring must produce identical observable traces
 *   (key → preventDefault → review text → focus → side effects), pinning
 *   the footer clamp+fallbackToText, search wrap+skipDisabled, and
 *   orientation Home/End→toggle with synchronous review + rAF focus timing.
 */

// ---- shared test scaffolding -------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onKeys = (_event: ReactKeyboardEvent<HTMLDivElement>) => undefined;
const setReviewed = (_value: string) => undefined;

let host: HTMLDivElement;
let roots: Root[];

/** Renders into a fresh container and returns the CONTAINER (queries survive re-renders that replace the root element). */
function renderInto(element: ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container;
}

function firstChild(container: HTMLDivElement): HTMLElement {
  const first = container.firstElementChild;
  expect(first, `rendered nothing for ${elementName(container)}`).toBeTruthy();
  return first as HTMLElement;
}

function elementName(container: HTMLDivElement): string {
  return container.firstElementChild?.tagName ?? 'nothing';
}

function canonical(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `#${JSON.stringify(node.textContent)}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const attrs = Array.from(el.attributes)
    .map((attr) => `${attr.name}=${JSON.stringify(attr.value)}`)
    .sort()
    .join(' ');
  const kids = Array.from(el.childNodes).map(canonical).join('');
  return `<${el.tagName.toLowerCase()} ${attrs}>${kids}</${el.tagName.toLowerCase()}>`;
}

/** Dispatches a real keydown through React's synthetic pipeline. */
function press(target: HTMLElement, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event.defaultPrevented;
}

function focusOn(element: HTMLElement) {
  act(() => { element.focus(); });
}

function resetFocus() {
  act(() => { (document.activeElement as HTMLElement | null)?.blur(); });
}

async function flushFrame() {
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
}

// ---- DOM fixtures: footer (Cancel/Reset/Apply, clamped roving) ----------------

function LegacyDocSettingsFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2 mt-3"
      role="toolbar"
      aria-label="Document Settings actions"
      aria-describedby="doc-settings-action-review-status"
      title="Use arrow keys to review dialog actions"
      onKeyDown={onKeys}
    >
      <span id="doc-settings-action-review-status" className="sr-only" aria-live="polite">
        {`Reviewing ${props.reviewed || 'Document Settings actions'}`}
      </span>
      <button type="button" data-doc-settings-action data-doc-settings-action-review="Cancel" className="btn" onFocus={() => setReviewed('Cancel')} onClick={() => undefined}>Cancel</button>
      <button type="button" data-doc-settings-action data-doc-settings-action-review="Reset" className="btn" onFocus={() => setReviewed('Reset')} onClick={() => undefined}>Reset</button>
      <button type="button" data-doc-settings-action data-doc-settings-action-review="Apply" className="btn-primary" onFocus={() => setReviewed('Apply')} onClick={() => undefined}>Apply</button>
    </div>
  );
}

function KitDocSettingsFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="doc-settings-action-review-status"
      className="flex justify-end gap-2 mt-3"
      label="Document Settings actions"
      title="Use arrow keys to review dialog actions"
      onKeyDown={onKeys}
      reviewingLabel="Reviewing"
      reviewed={props.reviewed}
      fallback="Document Settings actions"
      actionAttr="data-doc-settings-action"
      setReviewed={setReviewed}
      actions={[
        { children: 'Cancel', review: 'Cancel', className: 'btn', onClick: () => undefined },
        { children: 'Reset', review: 'Reset', className: 'btn', onClick: () => undefined },
        { children: 'Apply', review: 'Apply', className: 'btn-primary', onClick: () => undefined },
      ]}
    />
  );
}

const FROZEN_FOOTER_HTML =
  '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="Document Settings actions" aria-describedby="doc-settings-action-review-status" title="Use arrow keys to review dialog actions">'
  + '<span id="doc-settings-action-review-status" class="sr-only" aria-live="polite">Reviewing Document Settings actions</span>'
  + '<button type="button" data-doc-settings-action="true" data-doc-settings-action-review="Cancel" class="btn">Cancel</button>'
  + '<button type="button" data-doc-settings-action="true" data-doc-settings-action-review="Reset" class="btn">Reset</button>'
  + '<button type="button" data-doc-settings-action="true" data-doc-settings-action-review="Apply" class="btn-primary">Apply</button>'
  + '</div>';

// ---- DOM fixtures: preset search actions (Use First + Clear search) -----------

function LegacyPresetSearchActions(props: { reviewed: string; filteredCount: number }) {
  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      role="toolbar"
      aria-label="Document preset search actions"
      aria-describedby="doc-preset-search-action-review-status"
      title="Use arrow keys to review document preset search actions"
      onKeyDown={onKeys}
    >
      <span id="doc-preset-search-action-review-status" className="sr-only" aria-live="polite">
        {`Reviewing ${props.reviewed || 'Document preset search actions'}`}
      </span>
      <button
        type="button"
        className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline"
        data-doc-preset-search-action
        data-doc-preset-search-action-review="Use first search result"
        onClick={() => undefined}
        onFocus={() => setReviewed('Use first search result')}
        disabled={props.filteredCount === 0}
        title="Use first search result"
      >
        Use First
      </button>
      <button
        type="button"
        className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0"
        data-doc-preset-search-action
        data-doc-preset-search-action-review="Clear search"
        onClick={() => undefined}
        onFocus={() => setReviewed('Clear search')}
        title="Clear search"
      >
        Clear search
      </button>
    </div>
  );
}

function KitPresetSearchActions(props: { reviewed: string; filteredCount: number }) {
  return (
    <SearchableListActions
      statusId="doc-preset-search-action-review-status"
      className="flex items-center gap-1.5 shrink-0"
      label="Document preset search actions"
      title="Use arrow keys to review document preset search actions"
      onKeyDown={onKeys}
      reviewingLabel="Reviewing"
      reviewed={props.reviewed}
      fallback="Document preset search actions"
      actionAttr="data-doc-preset-search-action"
      setReviewed={setReviewed}
      first={{
        label: 'Use First',
        review: 'Use first search result',
        title: 'Use first search result',
        className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline',
        onActivate: () => undefined,
        disabled: props.filteredCount === 0,
      }}
      clear={{
        label: 'Clear search',
        review: 'Clear search',
        title: 'Clear search',
        className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0',
        onActivate: () => undefined,
      }}
    />
  );
}

const FROZEN_SEARCH_HTML =
  '<div class="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label="Document preset search actions" aria-describedby="doc-preset-search-action-review-status" title="Use arrow keys to review document preset search actions">'
  + '<span id="doc-preset-search-action-review-status" class="sr-only" aria-live="polite">Reviewing Document preset search actions</span>'
  + '<button type="button" class="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline" data-doc-preset-search-action="true" data-doc-preset-search-action-review="Use first search result" title="Use first search result">Use First</button>'
  + '<button type="button" class="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0" data-doc-preset-search-action="true" data-doc-preset-search-action-review="Clear search" title="Clear search">Clear search</button>'
  + '</div>';

const FROZEN_SEARCH_DISABLED_HTML = FROZEN_SEARCH_HTML.replace(
  'data-doc-preset-search-action-review="Use first search result" title',
  'data-doc-preset-search-action-review="Use first search result" disabled="" title',
);

// ---- DOM fixtures: orientation (mutual portrait/landscape pair) ---------------

function LegacyOrientBtn(props: { id: string; active: boolean; onClick: () => void; onFocus: () => void; label: string }) {
  return (
    <button
      id={props.id}
      type="button"
      onClick={props.onClick}
      onFocus={props.onFocus}
      aria-pressed={props.active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${
        props.active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'
      }`}
    >
      {props.label}
    </button>
  );
}

function LegacyOrientationToolbar(props: { landscape: boolean; reviewed: string }) {
  return (
    <div
      className="flex gap-1"
      role="toolbar"
      aria-label="Document orientation"
      aria-describedby="doc-orientation-review-status"
      title="Use arrow keys to switch orientation"
      onKeyDown={onKeys}
    >
      <span id="doc-orientation-review-status" className="sr-only" aria-live="polite">
        {`Reviewing ${props.reviewed || 'Document orientation'}`}
      </span>
      <LegacyOrientBtn id="doc-orientation-portrait" active={!props.landscape} onClick={() => undefined} onFocus={() => undefined} label="Portrait" />
      <LegacyOrientBtn id="doc-orientation-landscape" active={props.landscape} onClick={() => undefined} onFocus={() => undefined} label="Landscape" />
    </div>
  );
}

/** The migrated OrientBtn — identical to legacy plus data-value (the segment convention). */
function KitOrientBtn(props: { id: string; value: 'portrait' | 'landscape'; active: boolean; onClick: () => void; onFocus: () => void; label: string }) {
  return (
    <button
      id={props.id}
      type="button"
      data-value={props.value}
      onClick={props.onClick}
      onFocus={props.onFocus}
      aria-pressed={props.active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${
        props.active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'
      }`}
    >
      {props.label}
    </button>
  );
}

function KitOrientationToolbar(props: { landscape: boolean; reviewed: string }) {
  return (
    <ActionToolbar
      statusId="doc-orientation-review-status"
      className="flex gap-1"
      label="Document orientation"
      title="Use arrow keys to switch orientation"
      onKeyDown={onKeys}
      statusAs="span"
      reviewingLabel="Reviewing"
      reviewed={props.reviewed}
      fallback="Document orientation"
    >
      <KitOrientBtn id="doc-orientation-portrait" value="portrait" active={!props.landscape} onClick={() => undefined} onFocus={() => undefined} label="Portrait" />
      <KitOrientBtn id="doc-orientation-landscape" value="landscape" active={props.landscape} onClick={() => undefined} onFocus={() => undefined} label="Landscape" />
    </ActionToolbar>
  );
}

const FROZEN_ORIENTATION_HTML =
  '<div class="flex gap-1" role="toolbar" aria-label="Document orientation" aria-describedby="doc-orientation-review-status" title="Use arrow keys to switch orientation">'
  + '<span id="doc-orientation-review-status" class="sr-only" aria-live="polite">Reviewing Document orientation</span>'
  + '<button id="doc-orientation-portrait" type="button" data-value="portrait" aria-pressed="true" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-[#ff2e9a] text-ink bg-panel2">Portrait</button>'
  + '<button id="doc-orientation-landscape" type="button" data-value="landscape" aria-pressed="false" class="flex-1 px-2 py-1 rounded-sm border text-xs transition-colors border-border text-muted hover:text-ink">Landscape</button>'
  + '</div>';

// ---- DOM fixtures: external match-count live span (NOT migrated) --------------

function MatchCountSpan(props: { filteredCount: number | null; total: number }) {
  return (
    <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
      {props.filteredCount !== null ? `${props.filteredCount} / ${props.total} matches` : `${props.total} presets`}
    </span>
  );
}

const FROZEN_COUNT_SPAN_IDLE = '<span class="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">25 presets</span>';
const FROZEN_COUNT_SPAN_MATCHING = '<span class="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">3 / 25 matches</span>';

// ---- keyboard harnesses -------------------------------------------------------

interface Trace { events: string[] }

function LegacyFooterHarness({ trace }: { trace: Trace }) {
  const [reviewed, setReviewedFooterAction] = useState('');
  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-doc-settings-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.docSettingsActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  return (
    <div
      className="flex justify-end gap-2 mt-3"
      role="toolbar"
      aria-label="Document Settings actions"
      aria-describedby="doc-settings-action-review-status"
      title="Use arrow keys to review dialog actions"
      onKeyDown={handleFooterActionKeys}
    >
      <span id="doc-settings-action-review-status" className="sr-only" aria-live="polite">
        {`Reviewing ${reviewed || 'Document Settings actions'}`}
      </span>
      <button type="button" data-doc-settings-action data-doc-settings-action-review="Cancel" className="btn" onFocus={() => setReviewedFooterAction('Cancel')} onClick={() => trace.events.push('cancel')}>Cancel</button>
      <button type="button" data-doc-settings-action data-doc-settings-action-review="Reset" className="btn" onFocus={() => setReviewedFooterAction('Reset')} onClick={() => trace.events.push('reset')}>Reset</button>
      <button type="button" data-doc-settings-action data-doc-settings-action-review="Apply" className="btn-primary" onFocus={() => setReviewedFooterAction('Apply')} onClick={() => trace.events.push('apply')}>Apply</button>
    </div>
  );
}

function KitFooterHarness({ trace }: { trace: Trace }) {
  const [reviewed, setReviewedFooterAction] = useState('');
  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-doc-settings-action]',
    reviewKey: actionReviewKey('data-doc-settings-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });
  return (
    <ReviewedFooter
      statusId="doc-settings-action-review-status"
      className="flex justify-end gap-2 mt-3"
      label="Document Settings actions"
      title="Use arrow keys to review dialog actions"
      onKeyDown={handleFooterActionKeys}
      reviewingLabel="Reviewing"
      reviewed={reviewed}
      fallback="Document Settings actions"
      actionAttr="data-doc-settings-action"
      setReviewed={setReviewedFooterAction}
      actions={[
        { children: 'Cancel', review: 'Cancel', className: 'btn', onClick: () => trace.events.push('cancel') },
        { children: 'Reset', review: 'Reset', className: 'btn', onClick: () => trace.events.push('reset') },
        { children: 'Apply', review: 'Apply', className: 'btn-primary', onClick: () => trace.events.push('apply') },
      ]}
    />
  );
}

function footerKeyScript(container: HTMLDivElement, trace: Trace): string[] {
  resetFocus();
  const root = firstChild(container);
  const status = () => root.querySelector('span[aria-live="polite"]')!.textContent!;
  const focus = () => document.activeElement?.getAttribute('data-doc-settings-action-review') ?? 'none';
  const out: string[] = [`init|${status()}|${focus()}`];
  const step = (key: string) => out.push(`${key}|p=${press(root, key)}|${status()}|${focus()}`);
  focusOn(root.querySelector<HTMLButtonElement>('[data-doc-settings-action-review="Cancel"]')!);
  out.push(`focus-cancel|${status()}|${focus()}`);
  step('ArrowRight');
  step('ArrowRight');
  step('ArrowRight');
  step('ArrowLeft');
  step('ArrowLeft');
  step('ArrowLeft');
  step('End');
  step('Home');
  step('ArrowDown');
  act(() => { root.querySelector<HTMLButtonElement>('[data-doc-settings-action-review="Apply"]')!.click(); });
  out.push(`click-apply|${status()}|${focus()}|${trace.events.join(',')}`);
  return out;
}

const FROZEN_FOOTER_TRACE = [
  'init|Reviewing Document Settings actions|none',
  'focus-cancel|Reviewing Cancel|Cancel',
  'ArrowRight|p=true|Reviewing Reset|Reset',
  'ArrowRight|p=true|Reviewing Apply|Apply',
  'ArrowRight|p=true|Reviewing Apply|Apply',
  'ArrowLeft|p=true|Reviewing Reset|Reset',
  'ArrowLeft|p=true|Reviewing Cancel|Cancel',
  'ArrowLeft|p=true|Reviewing Cancel|Cancel',
  'End|p=true|Reviewing Apply|Apply',
  'Home|p=true|Reviewing Cancel|Cancel',
  'ArrowDown|p=false|Reviewing Cancel|Cancel',
  'click-apply|Reviewing Cancel|Cancel|apply',
];

function LegacySearchHarness(props: { trace: Trace; filteredCount: number }) {
  const [reviewed, setReviewedPresetSearchAction] = useState('');
  const [query, setPresetSearch] = useState('a4');
  const handlePresetSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-doc-preset-search-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    event.preventDefault();
    const nextAction = actions[nextIndex];
    setReviewedPresetSearchAction(nextAction?.dataset.docPresetSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  if (!query) return <div data-search-cleared />;
  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      role="toolbar"
      aria-label="Document preset search actions"
      aria-describedby="doc-preset-search-action-review-status"
      title="Use arrow keys to review document preset search actions"
      onKeyDown={handlePresetSearchActionKeys}
    >
      <span id="doc-preset-search-action-review-status" className="sr-only" aria-live="polite">
        {`Reviewing ${reviewed || 'Document preset search actions'}`}
      </span>
      <button
        type="button"
        className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline"
        data-doc-preset-search-action
        data-doc-preset-search-action-review="Use first search result"
        onClick={() => { if (props.filteredCount > 0) props.trace.events.push('use-first:a3'); }}
        onFocus={() => setReviewedPresetSearchAction('Use first search result')}
        disabled={props.filteredCount === 0}
        title="Use first search result"
      >
        Use First
      </button>
      <button
        type="button"
        className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0"
        data-doc-preset-search-action
        data-doc-preset-search-action-review="Clear search"
        onClick={() => { props.trace.events.push('clear'); setPresetSearch(''); }}
        onFocus={() => setReviewedPresetSearchAction('Clear search')}
        title="Clear search"
      >
        Clear search
      </button>
    </div>
  );
}

function KitSearchHarness(props: { trace: Trace; filteredCount: number }) {
  const [reviewed, setReviewedPresetSearchAction] = useState('');
  const [query, setPresetSearch] = useState('a4');
  const handlePresetSearchActionKeys = makeRovingKeys({
    selector: '[data-doc-preset-search-action]',
    reviewKey: actionReviewKey('data-doc-preset-search-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedPresetSearchAction,
  });
  if (!query) return <div data-search-cleared />;
  return (
    <SearchableListActions
      statusId="doc-preset-search-action-review-status"
      className="flex items-center gap-1.5 shrink-0"
      label="Document preset search actions"
      title="Use arrow keys to review document preset search actions"
      onKeyDown={handlePresetSearchActionKeys}
      reviewingLabel="Reviewing"
      reviewed={reviewed}
      fallback="Document preset search actions"
      actionAttr="data-doc-preset-search-action"
      setReviewed={setReviewedPresetSearchAction}
      first={{
        label: 'Use First',
        review: 'Use first search result',
        title: 'Use first search result',
        className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline',
        onActivate: () => { if (props.filteredCount > 0) props.trace.events.push('use-first:a3'); },
        disabled: props.filteredCount === 0,
      }}
      clear={{
        label: 'Clear search',
        review: 'Clear search',
        title: 'Clear search',
        className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0',
        onActivate: () => { props.trace.events.push('clear'); setPresetSearch(''); },
      }}
    />
  );
}

function searchKeyScript(container: HTMLDivElement, trace: Trace): string[] {
  resetFocus();
  const root = firstChild(container);
  const toolbar = root; // the harness root element IS the role="toolbar" container
  const status = () => root.querySelector('span[aria-live="polite"]')?.textContent ?? 'gone';
  const focus = () => document.activeElement?.getAttribute('data-doc-preset-search-action-review') ?? 'none';
  const out: string[] = [`init|${status()}|${focus()}`];
  const step = (key: string) => out.push(`${key}|p=${press(toolbar, key)}|${status()}|${focus()}`);
  focusOn(root.querySelector<HTMLButtonElement>('[data-doc-preset-search-action-review="Use first search result"]')!);
  out.push(`focus-first|${status()}|${focus()}`);
  step('ArrowRight');
  step('ArrowRight');
  step('ArrowLeft');
  step('Home');
  step('End');
  step('ArrowUp');
  act(() => { root.querySelector<HTMLButtonElement>('[data-doc-preset-search-action-review="Use first search result"]')!.click(); });
  out.push(`click-first|${status()}|${focus()}|${trace.events.join(',')}`);
  act(() => { root.querySelector<HTMLButtonElement>('[data-doc-preset-search-action-review="Clear search"]')!.click(); });
  // Query the live container: after the toolbar unmounts, React reuses the root
  // div in the legacy branch but swaps the whole subtree in the kit branch.
  out.push(`click-clear|${trace.events.join(',')}|unmounted=${container.querySelector('[data-doc-preset-search-action]') === null}`);
  return out;
}

const FROZEN_SEARCH_TRACE = [
  'init|Reviewing Document preset search actions|none',
  'focus-first|Reviewing Use first search result|Use first search result',
  'ArrowRight|p=true|Reviewing Clear search|Clear search',
  'ArrowRight|p=true|Reviewing Use first search result|Use first search result',
  'ArrowLeft|p=true|Reviewing Clear search|Clear search',
  'Home|p=true|Reviewing Use first search result|Use first search result',
  'End|p=true|Reviewing Clear search|Clear search',
  'ArrowUp|p=false|Reviewing Clear search|Clear search',
  'click-first|Reviewing Clear search|Clear search|use-first:a3',
  'click-clear|use-first:a3,clear|unmounted=true',
];

function searchDisabledScript(container: HTMLDivElement, trace: Trace): string[] {
  resetFocus();
  const root = firstChild(container);
  const toolbar = root; // the harness root element IS the role="toolbar" container
  const status = () => root.querySelector('span[aria-live="polite"]')!.textContent!;
  const focus = () => document.activeElement?.getAttribute('data-doc-preset-search-action-review') ?? 'none';
  const useFirstDisabled = root.querySelector<HTMLButtonElement>('[data-doc-preset-search-action-review="Use first search result"]')!.disabled;
  const out: string[] = [`init|disabled=${useFirstDisabled}|${status()}|${focus()}`];
  const step = (key: string) => out.push(`${key}|p=${press(toolbar, key)}|${status()}|${focus()}`);
  focusOn(root.querySelector<HTMLButtonElement>('[data-doc-preset-search-action-review="Clear search"]')!);
  out.push(`focus-clear|${status()}|${focus()}`);
  step('ArrowRight');
  step('ArrowLeft');
  step('Home');
  step('End');
  act(() => { root.querySelector<HTMLButtonElement>('[data-doc-preset-search-action-review="Use first search result"]')!.click(); });
  out.push(`click-first|${status()}|${focus()}|${trace.events.join(',')}`);
  return out;
}

const FROZEN_SEARCH_DISABLED_TRACE = [
  'init|disabled=true|Reviewing Document preset search actions|none',
  'focus-clear|Reviewing Clear search|Clear search',
  'ArrowRight|p=true|Reviewing Clear search|Clear search',
  'ArrowLeft|p=true|Reviewing Clear search|Clear search',
  'Home|p=true|Reviewing Clear search|Clear search',
  'End|p=true|Reviewing Clear search|Clear search',
  'click-first|Reviewing Clear search|Clear search|',
];

function LegacyOrientationHarness({ trace }: { trace: Trace }) {
  const [landscape, setLandscape] = useState(false);
  const [reviewed, setReviewedOrientation] = useState('');
  const applyOrientation = (land: boolean) => {
    trace.events.push(`apply:${land ? 'landscape' : 'portrait'}`);
    setLandscape(land);
  };
  const focusOrientation = (nextLandscape: boolean) => {
    applyOrientation(nextLandscape);
    setReviewedOrientation(nextLandscape ? 'Landscape' : 'Portrait');
    requestAnimationFrame(() => document.getElementById(nextLandscape ? 'doc-orientation-landscape' : 'doc-orientation-portrait')?.focus());
  };
  const handleOrientationKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextLandscape = event.key === 'Home'
      ? false
      : event.key === 'End'
        ? true
        : !landscape;
    focusOrientation(nextLandscape);
  };
  return (
    <div
      className="flex gap-1"
      role="toolbar"
      aria-label="Document orientation"
      aria-describedby="doc-orientation-review-status"
      title="Use arrow keys to switch orientation"
      onKeyDown={handleOrientationKeys}
    >
      <span id="doc-orientation-review-status" className="sr-only" aria-live="polite">
        {`Reviewing ${reviewed || 'Document orientation'}`}
      </span>
      <LegacyOrientBtn id="doc-orientation-portrait" active={!landscape} onClick={() => { applyOrientation(false); setReviewedOrientation('Portrait'); }} onFocus={() => setReviewedOrientation('Portrait')} label="Portrait" />
      <LegacyOrientBtn id="doc-orientation-landscape" active={landscape} onClick={() => { applyOrientation(true); setReviewedOrientation('Landscape'); }} onFocus={() => setReviewedOrientation('Landscape')} label="Landscape" />
    </div>
  );
}

function KitOrientationHarness({ trace }: { trace: Trace }) {
  const [landscape, setLandscape] = useState(false);
  const [reviewed, setReviewedOrientation] = useState('');
  const applyOrientation = (land: boolean) => {
    trace.events.push(`apply:${land ? 'landscape' : 'portrait'}`);
    setLandscape(land);
  };
  const handleOrientationKeys = makeSegmentKeys({
    values: ['portrait', 'landscape'] as const,
    current: landscape ? 'landscape' : 'portrait',
    apply: (next) => {
      const nextLandscape = next === 'landscape';
      applyOrientation(nextLandscape);
      setReviewedOrientation(nextLandscape ? 'Landscape' : 'Portrait');
    },
  });
  return (
    <ActionToolbar
      statusId="doc-orientation-review-status"
      className="flex gap-1"
      label="Document orientation"
      title="Use arrow keys to switch orientation"
      onKeyDown={handleOrientationKeys}
      statusAs="span"
      reviewingLabel="Reviewing"
      reviewed={reviewed}
      fallback="Document orientation"
    >
      <KitOrientBtn id="doc-orientation-portrait" value="portrait" active={!landscape} onClick={() => { applyOrientation(false); setReviewedOrientation('Portrait'); }} onFocus={() => setReviewedOrientation('Portrait')} label="Portrait" />
      <KitOrientBtn id="doc-orientation-landscape" value="landscape" active={landscape} onClick={() => { applyOrientation(true); setReviewedOrientation('Landscape'); }} onFocus={() => setReviewedOrientation('Landscape')} label="Landscape" />
    </ActionToolbar>
  );
}

async function orientationKeyScript(container: HTMLDivElement, trace: Trace): Promise<string[]> {
  resetFocus();
  const root = firstChild(container);
  const toolbar = root; // the harness root element IS the role="toolbar" container
  const status = () => root.querySelector('span[aria-live="polite"]')!.textContent!;
  const focus = () => document.activeElement?.id || 'none';
  const portraitBtn = () => root.querySelector<HTMLButtonElement>('button[id="doc-orientation-portrait"]')!;
  const landscapeBtn = () => root.querySelector<HTMLButtonElement>('button[id="doc-orientation-landscape"]')!;
  const pressed = () => `P=${portraitBtn().getAttribute('aria-pressed')},L=${landscapeBtn().getAttribute('aria-pressed')}`;
  const out: string[] = [`init|${status()}|${focus()}|${pressed()}`];
  const step = async (key: string) => {
    const prevented = press(toolbar, key);
    const sync = `${key}|p=${prevented}|${status()}|preFrame=${focus()}`;
    await flushFrame();
    out.push(`${sync}|postFrame=${focus()}|${pressed()}|${trace.events.join(',')}`);
  };
  focusOn(portraitBtn());
  out.push(`focus-portrait|${status()}|${focus()}|${pressed()}`);
  await step('ArrowRight');
  await step('ArrowLeft');
  await step('End');
  await step('End');
  await step('Home');
  await step('Home');
  await step('ArrowDown');
  act(() => { landscapeBtn().click(); });
  out.push(`click-landscape|${status()}|${focus()}|${pressed()}|${trace.events.join(',')}`);
  return out;
}

const FROZEN_ORIENTATION_TRACE = [
  'init|Reviewing Document orientation|none|P=true,L=false',
  'focus-portrait|Reviewing Portrait|doc-orientation-portrait|P=true,L=false',
  'ArrowRight|p=true|Reviewing Landscape|preFrame=doc-orientation-portrait|postFrame=doc-orientation-landscape|P=false,L=true|apply:landscape',
  'ArrowLeft|p=true|Reviewing Portrait|preFrame=doc-orientation-landscape|postFrame=doc-orientation-portrait|P=true,L=false|apply:landscape,apply:portrait',
  'End|p=true|Reviewing Landscape|preFrame=doc-orientation-portrait|postFrame=doc-orientation-landscape|P=false,L=true|apply:landscape,apply:portrait,apply:landscape',
  'End|p=true|Reviewing Landscape|preFrame=doc-orientation-landscape|postFrame=doc-orientation-landscape|P=false,L=true|apply:landscape,apply:portrait,apply:landscape,apply:landscape',
  'Home|p=true|Reviewing Portrait|preFrame=doc-orientation-landscape|postFrame=doc-orientation-portrait|P=true,L=false|apply:landscape,apply:portrait,apply:landscape,apply:landscape,apply:portrait',
  'Home|p=true|Reviewing Portrait|preFrame=doc-orientation-portrait|postFrame=doc-orientation-portrait|P=true,L=false|apply:landscape,apply:portrait,apply:landscape,apply:landscape,apply:portrait,apply:portrait',
  'ArrowDown|p=false|Reviewing Portrait|preFrame=doc-orientation-portrait|postFrame=doc-orientation-portrait|P=true,L=false|apply:landscape,apply:portrait,apply:landscape,apply:landscape,apply:portrait,apply:portrait',
  'click-landscape|Reviewing Landscape|doc-orientation-portrait|P=false,L=true|apply:landscape,apply:portrait,apply:landscape,apply:landscape,apply:portrait,apply:portrait,apply:landscape',
];

// ---- the suite ----------------------------------------------------------------

describe('DocSettingsDialog migration: DOM equivalence', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
  });

  it('actionReviewKey resolves the two review dataset keys used by the dialog', () => {
    expect(actionReviewKey('data-doc-settings-action')).toBe('docSettingsActionReview');
    expect(actionReviewKey('data-doc-preset-search-action')).toBe('docPresetSearchActionReview');
  });

  it('Cancel/Reset/Apply footer: kit DOM equals legacy DOM byte for byte (fallback announcement)', () => {
    const legacy = firstChild(renderInto(<LegacyDocSettingsFooter reviewed="" />));
    const kit = firstChild(renderInto(<KitDocSettingsFooter reviewed="" />));
    expect(canonical(kit)).toBe(canonical(legacy));
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(FROZEN_FOOTER_HTML);
  });

  it('Cancel/Reset/Apply footer: reviewed announcement matches too', () => {
    const legacy = firstChild(renderInto(<LegacyDocSettingsFooter reviewed="Reset" />));
    const kit = firstChild(renderInto(<KitDocSettingsFooter reviewed="Reset" />));
    expect(canonical(kit)).toBe(canonical(legacy));
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(FROZEN_FOOTER_HTML.replace('Reviewing Document Settings actions', 'Reviewing Reset'));
  });

  it('preset search actions: kit DOM equals legacy DOM byte for byte (Use First enabled)', () => {
    const legacy = firstChild(renderInto(<LegacyPresetSearchActions reviewed="" filteredCount={2} />));
    const kit = firstChild(renderInto(<KitPresetSearchActions reviewed="" filteredCount={2} />));
    expect(canonical(kit)).toBe(canonical(legacy));
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(FROZEN_SEARCH_HTML);
  });

  it('preset search actions: Use First disabled state matches byte for byte', () => {
    const legacy = firstChild(renderInto(<LegacyPresetSearchActions reviewed="Clear search" filteredCount={0} />));
    const kit = firstChild(renderInto(<KitPresetSearchActions reviewed="Clear search" filteredCount={0} />));
    expect(canonical(kit)).toBe(canonical(legacy));
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(FROZEN_SEARCH_DISABLED_HTML.replace('Reviewing Document preset search actions', 'Reviewing Clear search'));
  });

  it('orientation toolbar: kit DOM equals legacy DOM except the two new data-value attributes', () => {
    const legacy = firstChild(renderInto(<LegacyOrientationToolbar landscape={false} reviewed="" />));
    const kit = firstChild(renderInto(<KitOrientationToolbar landscape={false} reviewed="" />));
    // Byte-identical once the intentional data-value additions are stripped.
    expect(kit.outerHTML.replace(/ data-value="(portrait|landscape)"/g, '')).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(FROZEN_ORIENTATION_HTML);
  });

  it('orientation toolbar: landscape-active variant matches the same way', () => {
    const legacy = firstChild(renderInto(<LegacyOrientationToolbar landscape={true} reviewed="Landscape" />));
    const kit = firstChild(renderInto(<KitOrientationToolbar landscape={true} reviewed="Landscape" />));
    expect(kit.outerHTML.replace(/ data-value="(portrait|landscape)"/g, '')).toBe(legacy.outerHTML);
    expect(canonical(kit)).toContain('aria-pressed="false"');
  });

  it('external match-count live span stays exactly as before (not migrated)', () => {
    expect(firstChild(renderInto(<MatchCountSpan filteredCount={null} total={25} />)).outerHTML).toBe(FROZEN_COUNT_SPAN_IDLE);
    expect(firstChild(renderInto(<MatchCountSpan filteredCount={3} total={25} />)).outerHTML).toBe(FROZEN_COUNT_SPAN_MATCHING);
  });
});

describe('DocSettingsDialog migration: keyboard behavior snapshots', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
  });

  it('footer roving (clamp + action-review + text fallback) produces the frozen trace', () => {
    const legacyTrace: Trace = { events: [] };
    const legacy = renderInto(<LegacyFooterHarness trace={legacyTrace} />);
    const kitTrace: Trace = { events: [] };
    const kit = renderInto(<KitFooterHarness trace={kitTrace} />);
    const legacyOut = footerKeyScript(legacy, legacyTrace);
    const kitOut = footerKeyScript(kit, kitTrace);
    expect(kitOut).toEqual(legacyOut);
    expect(kitOut).toEqual(FROZEN_FOOTER_TRACE);
  });

  it('search action roving (wrap + skipDisabled) produces the frozen trace', () => {
    const legacyTrace: Trace = { events: [] };
    const legacy = renderInto(<LegacySearchHarness trace={legacyTrace} filteredCount={2} />);
    const kitTrace: Trace = { events: [] };
    const kit = renderInto(<KitSearchHarness trace={kitTrace} filteredCount={2} />);
    const legacyOut = searchKeyScript(legacy, legacyTrace);
    const kitOut = searchKeyScript(kit, kitTrace);
    expect(kitOut).toEqual(legacyOut);
    expect(kitOut).toEqual(FROZEN_SEARCH_TRACE);
  });

  it('search action roving skips a disabled Use First and its click is a no-op', () => {
    const legacyTrace: Trace = { events: [] };
    const legacy = renderInto(<LegacySearchHarness trace={legacyTrace} filteredCount={0} />);
    const kitTrace: Trace = { events: [] };
    const kit = renderInto(<KitSearchHarness trace={kitTrace} filteredCount={0} />);
    const legacyOut = searchDisabledScript(legacy, legacyTrace);
    const kitOut = searchDisabledScript(kit, kitTrace);
    expect(kitOut).toEqual(legacyOut);
    expect(kitOut).toEqual(FROZEN_SEARCH_DISABLED_TRACE);
  });

  it('orientation keys keep the Home/End→toggle contract with sync review + rAF focus', async () => {
    const legacyTrace: Trace = { events: [] };
    const legacy = renderInto(<LegacyOrientationHarness trace={legacyTrace} />);
    const legacyOut = await orientationKeyScript(legacy, legacyTrace);
    const kitTrace: Trace = { events: [] };
    const kit = renderInto(<KitOrientationHarness trace={kitTrace} />);
    const kitOut = await orientationKeyScript(kit, kitTrace);
    expect(kitOut).toEqual(legacyOut);
    expect(kitOut).toEqual(FROZEN_ORIENTATION_TRACE);
  });
});
