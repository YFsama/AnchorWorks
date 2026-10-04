import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { PresetRow } from '../PresetRow';
import { ReviewedFooter } from '../ReviewedFooter';
import { makeRovingKeys } from '../useRovingActions';

/**
 * Gap-A extensions for the house dialog kit: `disabled` + `aria-label`
 * passthrough on `PresetItem` (PresetRow) and `FooterAction` (ReviewedFooter).
 *
 * Contract bars:
 *
 * - Default output is frozen: rendering WITHOUT the new props must serialize
 *   exactly like the pre-gap kit (the strings below were captured from the
 *   components before these fields existed; dialogKitEquivalence and
 *   dialogKitBatchA additionally byte-pin that shape against legacy DOM).
 * - `disabled` is the native attribute only — no injected styling. Buttons on
 *   the shared `btn` classes pick up the global `.btn:disabled` rules from
 *   index.css, custom chips keep their own `disabled:` utilities in
 *   `className`. jsdom does not dispatch click on a disabled button, so the
 *   handler stays unreachable, which is what roving + activation rely on.
 * - `aria-label` passes through verbatim (icon-only / rich chips).
 * - `PresetItem.disabled` composes with `makeRovingKeys({ skipDisabled })`
 *   the same way SearchableListActions' first action always has.
 */

// ---- shared test scaffolding -------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onKeys = (_event: ReactKeyboardEvent<HTMLDivElement>) => undefined;
const setReviewed = (_value: string) => undefined;

let host: HTMLDivElement;
let roots: Root[];

function renderElement(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  const first = container.firstElementChild;
  expect(first, `rendered nothing for ${element.type}`).toBeTruthy();
  return first as HTMLElement;
}

// ---- baseline props (no new props — the frozen default-output bar) ------------

function BaselinePresetRow() {
  return (
    <PresetRow
      statusId="gap-a-preset-status"
      className="grid grid-cols-2 gap-1"
      label="Gap A presets"
      title="Use arrow keys to review presets"
      onKeyDown={onKeys}
      reviewingLabel="Reviewing"
      fallback="Gap A presets"
      actionAttr="data-gap-a-preset-action"
      setReviewed={setReviewed}
      items={[
        { key: 'one', className: 'btn', pressed: true, onClick: () => undefined, title: 'Preset one', data: { review: 'Preset one review' }, children: 'One' },
        { key: 'two', className: 'btn', onClick: () => undefined, data: { review: 'Preset two review' }, children: 'Two' },
      ]}
    />
  );
}

function BaselineFooter() {
  return (
    <ReviewedFooter
      statusId="gap-a-footer-status"
      className="flex justify-end gap-2"
      label="Gap A footer actions"
      title="Use arrow keys to review actions"
      onKeyDown={onKeys}
      reviewingLabel="Reviewing"
      fallback="Gap A footer actions"
      actionAttr="data-gap-a-action"
      setReviewed={setReviewed}
      actions={[
        { children: 'Cancel', review: 'Cancel changes', className: 'btn', onClick: () => undefined },
        { children: 'Apply', review: 'Apply changes', className: 'btn-primary', onClick: () => undefined, title: 'Apply now' },
      ]}
    />
  );
}

const FROZEN_PRESET_ROW_HTML =
  '<div class="grid grid-cols-2 gap-1" role="toolbar" aria-label="Gap A presets" aria-describedby="gap-a-preset-status" title="Use arrow keys to review presets">'
  + '<div id="gap-a-preset-status" class="sr-only" aria-live="polite">Reviewing Gap A presets</div>'
  + '<button type="button" data-gap-a-preset-action="true" data-review="Preset one review" class="btn" aria-pressed="true" title="Preset one">One</button>'
  + '<button type="button" data-gap-a-preset-action="true" data-review="Preset two review" class="btn">Two</button>'
  + '</div>';

const FROZEN_FOOTER_HTML =
  '<div class="flex justify-end gap-2" role="toolbar" aria-label="Gap A footer actions" aria-describedby="gap-a-footer-status" title="Use arrow keys to review actions">'
  + '<span id="gap-a-footer-status" class="sr-only" aria-live="polite">Reviewing Gap A footer actions</span>'
  + '<button type="button" data-gap-a-action="true" data-gap-a-action-review="Cancel changes" class="btn">Cancel</button>'
  + '<button type="button" data-gap-a-action="true" data-gap-a-action-review="Apply changes" class="btn-primary" title="Apply now">Apply</button>'
  + '</div>';

// ---- the suite ----------------------------------------------------------------

describe('dialog kit gap A: disabled + aria-label passthrough', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
  });

  it('PresetRow without the new props serializes exactly like the pre-gap kit', () => {
    expect(renderElement(<BaselinePresetRow />).outerHTML).toBe(FROZEN_PRESET_ROW_HTML);
  });

  it('ReviewedFooter without the new props serializes exactly like the pre-gap kit', () => {
    expect(renderElement(<BaselineFooter />).outerHTML).toBe(FROZEN_FOOTER_HTML);
  });

  it('PresetItem.disabled renders the native attribute and keeps onClick unreachable', async () => {
    const onActivate = vi.fn();
    const onOtherActivate = vi.fn();
    const toolbar = renderElement(
      <PresetRow
        statusId="gap-a-preset-status"
        className="grid grid-cols-2 gap-1"
        label="Gap A presets"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Gap A presets"
        actionAttr="data-gap-a-preset-action"
        setReviewed={setReviewed}
        items={[
          { key: 'one', className: 'btn', pressed: true, onClick: onActivate, title: 'Preset one', data: { review: 'Preset one review' }, children: 'One', 'aria-label': 'Apply preset one', disabled: true },
          { key: 'two', className: 'btn', onClick: onOtherActivate, data: { review: 'Preset two review' }, children: 'Two' },
        ]}
      />,
    );
    const [disabledButton, enabledButton] = toolbar.querySelectorAll<HTMLButtonElement>('button');
    expect(disabledButton.disabled).toBe(true);
    expect(disabledButton.hasAttribute('disabled')).toBe(true);
    expect(disabledButton.outerHTML).toBe(
      '<button type="button" data-gap-a-preset-action="true" data-review="Preset one review" class="btn" aria-pressed="true" title="Preset one" aria-label="Apply preset one" disabled="">One</button>',
    );
    // jsdom never dispatches click on a disabled button — activation is blocked
    // by the browser contract, not by a guard the kit would have to maintain.
    await act(async () => disabledButton.click());
    expect(onActivate).not.toHaveBeenCalled();
    await act(async () => enabledButton.click());
    expect(onOtherActivate).toHaveBeenCalledTimes(1);
  });

  it('FooterAction.disabled renders the native attribute and keeps onClick unreachable', async () => {
    const onReplaceAll = vi.fn();
    const onCancel = vi.fn();
    const toolbar = renderElement(
      <ReviewedFooter
        statusId="gap-a-footer-status"
        className="flex justify-end gap-2"
        label="Gap A footer actions"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Gap A footer actions"
        actionAttr="data-gap-a-action"
        setReviewed={setReviewed}
        actions={[
          { children: 'Cancel', review: 'Cancel find & replace', className: 'btn', onClick: onCancel },
          { children: 'Replace All', review: 'Replace all matches', className: 'btn-primary', onClick: onReplaceAll, 'aria-label': 'Replace all matches', disabled: true },
        ]}
      />,
    );
    const [enabledButton, disabledButton] = toolbar.querySelectorAll<HTMLButtonElement>('button');
    expect(disabledButton.disabled).toBe(true);
    expect(disabledButton.outerHTML).toBe(
      '<button type="button" data-gap-a-action="true" data-gap-a-action-review="Replace all matches" class="btn-primary" aria-label="Replace all matches" disabled="">Replace All</button>',
    );
    await act(async () => disabledButton.click());
    expect(onReplaceAll).not.toHaveBeenCalled();
    await act(async () => enabledButton.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('aria-label passes through independently of disabled on both components', () => {
    const presetToolbar = renderElement(
      <PresetRow
        statusId="gap-a-preset-status"
        className="grid"
        label="Gap A presets"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Gap A presets"
        actionAttr="data-gap-a-preset-action"
        setReviewed={setReviewed}
        items={[{ key: 'swap', className: 'btn', onClick: () => undefined, data: { review: 'Swap fields' }, children: '⇄', 'aria-label': 'Swap width and height' }]}
      />,
    );
    const presetButton = presetToolbar.querySelector<HTMLButtonElement>('button')!;
    expect(presetButton.disabled).toBe(false);
    expect(presetButton.getAttribute('aria-label')).toBe('Swap width and height');

    const footer = renderElement(
      <ReviewedFooter
        statusId="gap-a-footer-status"
        className="flex"
        label="Gap A footer actions"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Gap A footer actions"
        actionAttr="data-gap-a-action"
        setReviewed={setReviewed}
        actions={[{ children: '✕', review: 'Clear filters', className: 'btn', onClick: () => undefined, 'aria-label': 'Clear filters' }]}
      />,
    );
    const footerButton = footer.querySelector<HTMLButtonElement>('button')!;
    expect(footerButton.disabled).toBe(false);
    expect(footerButton.getAttribute('aria-label')).toBe('Clear filters');
  });

  it('PresetItem.disabled is skipped by makeRovingKeys with skipDisabled', () => {
    const setReview = vi.fn();
    const toolbar = renderElement(
      <PresetRow
        statusId="gap-a-roving-status"
        className="grid grid-cols-3 gap-1"
        label="Gap A roving presets"
        onKeyDown={makeRovingKeys({ selector: '[data-gap-a-preset-action]', skipDisabled: true, setReview })}
        reviewingLabel="Reviewing"
        fallback="Gap A roving presets"
        actionAttr="data-gap-a-preset-action"
        setReviewed={setReviewed}
        items={[
          { key: 'a', className: 'btn', onClick: () => undefined, data: { review: 'Review A' }, children: 'A' },
          { key: 'b', className: 'btn', onClick: () => undefined, data: { review: 'Review B' }, children: 'B', disabled: true },
          { key: 'c', className: 'btn', onClick: () => undefined, data: { review: 'Review C' }, children: 'C' },
        ]}
      />,
    );
    const buttons = toolbar.querySelectorAll<HTMLButtonElement>('button');
    act(() => buttons[0].focus());
    // ArrowRight over [A, C] (B filtered): index 0 -> 1 = C
    act(() => toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(buttons[2]);
    expect(setReview).toHaveBeenCalledWith('Review C');
    // ArrowLeft from C lands back on A — the disabled B is transparent to roving
    act(() => toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(document.activeElement).toBe(buttons[0]);
    expect(setReview).toHaveBeenLastCalledWith('Review A');
  });
});
