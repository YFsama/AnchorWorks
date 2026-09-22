import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actionReviewKey, makeRovingKeys, makeSegmentKeys, type RovingEvent } from '../useRovingActions';

/**
 * Unit tests for the pure roving-handler logic behind the house dialog
 * keyboard conventions. Handlers run against a real jsdom container so
 * focus, dataset, and disabled filtering behave exactly as in the app.
 */

interface ButtonSpec {
  label: string;
  review?: string;
  actionReview?: string;
  value?: string;
  disabled?: boolean;
  ariaDisabled?: string;
  className?: string;
}

function makeContainer(buttons: ButtonSpec[]): HTMLDivElement {
  const container = document.createElement('div');
  for (const spec of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = spec.label;
    if (spec.review !== undefined) button.setAttribute('data-review', spec.review);
    if (spec.actionReview !== undefined) button.setAttribute('data-x-action-review', spec.actionReview);
    if (spec.value !== undefined) button.setAttribute('data-value', spec.value);
    if (spec.disabled) button.disabled = true;
    if (spec.ariaDisabled !== undefined) button.setAttribute('aria-disabled', spec.ariaDisabled);
    if (spec.className) button.className = spec.className;
    container.appendChild(button);
  }
  document.body.appendChild(container);
  return container;
}

function keyEvent(container: HTMLElement, key: string): RovingEvent {
  return { key, preventDefault: vi.fn(), currentTarget: container } as unknown as RovingEvent;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let containers: HTMLDivElement[] = [];

beforeEach(() => {
  containers = [];
});

afterEach(() => {
  for (const container of containers) container.remove();
});

function track(container: HTMLDivElement) {
  containers.push(container);
  return container;
}

describe('actionReviewKey', () => {
  it('camelCases data-<name>-action into the dataset key for its review attribute', () => {
    expect(actionReviewKey('data-simplify-action')).toBe('simplifyActionReview');
    expect(actionReviewKey('data-grommets-action')).toBe('grommetsActionReview');
    expect(actionReviewKey('data-free-distort-action')).toBe('freeDistortActionReview');
    expect(actionReviewKey('data-shortcut-footer-action')).toBe('shortcutFooterActionReview');
    expect(actionReviewKey('data-page-search-action')).toBe('pageSearchActionReview');
    expect(actionReviewKey('data-print-output-action')).toBe('printOutputActionReview');
  });
});

describe('makeRovingKeys (footer convention: clamped, immediate, text fallback)', () => {
  it('ignores keys outside the roving set without preventing default', () => {
    const container = track(makeContainer([{ label: 'Cancel' }, { label: 'Apply' }]));
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', fallbackToText: true, setReview });
    const event = keyEvent(container, 'ArrowDown');
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(setReview).not.toHaveBeenCalled();
  });

  it('moves right, publishes the action-review attribute, and focuses immediately', () => {
    const container = track(makeContainer([
      { label: 'Cancel', actionReview: 'Cancel review' },
      { label: 'Apply', actionReview: 'Apply review' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', fallbackToText: true, setReview });
    handler(keyEvent(container, 'ArrowRight'));
    expect(setReview).toHaveBeenCalledWith('Apply review');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('falls back to the trimmed text content when the review attribute is missing', () => {
    const container = track(makeContainer([{ label: '  Cancel  ' }, { label: 'Apply' }]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', fallbackToText: true, setReview })(keyEvent(container, 'ArrowRight'));
    expect(setReview).toHaveBeenCalledWith('Apply');
  });

  it('clamps at both ends (Simplify/footer convention)', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const buttons = container.querySelectorAll('button');
    buttons[2].focus();
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview });
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[2]);
    buttons[0].focus();
    handler(keyEvent(container, 'ArrowLeft'));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('jumps with Home and End', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const buttons = container.querySelectorAll('button');
    buttons[1].focus();
    const handler = makeRovingKeys({ selector: 'button', setReview: vi.fn() });
    handler(keyEvent(container, 'Home'));
    expect(document.activeElement).toBe(buttons[0]);
    handler(keyEvent(container, 'End'));
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('treats a container with no focused button as active index 0', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }]));
    const buttons = container.querySelectorAll('button');
    container.focus();
    const handler = makeRovingKeys({ selector: 'button', setReview: vi.fn() });
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[1]);
  });
});

describe('makeRovingKeys (preset convention: wrap, deferred, data-review)', () => {
  it('wraps ArrowRight at the end and ArrowLeft at the start', async () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const buttons = container.querySelectorAll('button');
    buttons[2].focus();
    const handler = makeRovingKeys({ selector: 'button', setReview: vi.fn(), wrap: true, guardEmpty: true, defer: true });
    handler(keyEvent(container, 'ArrowRight'));
    await nextFrame();
    expect(document.activeElement).toBe(buttons[0]);
    handler(keyEvent(container, 'ArrowLeft'));
    await nextFrame();
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('applies the value synchronously but defers review + focus to the next frame', async () => {
    const container = track(makeContainer([
      { label: 'A', review: 'Review A' },
      { label: 'B', review: 'Review B' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    const onNavigate = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, defer: true, onNavigate });
    handler(keyEvent(container, 'ArrowRight'));
    expect(onNavigate).toHaveBeenCalledWith(buttons[1], 1);
    expect(setReview).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(buttons[0]);
    await nextFrame();
    expect(setReview).toHaveBeenCalledWith('Review B');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('skips disabled and aria-disabled buttons (search/output convention)', () => {
    const container = track(makeContainer([
      { label: 'Use First', disabled: true },
      { label: 'Aria', ariaDisabled: 'true' },
      { label: 'Clear', review: 'Clear search' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[2].focus();
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, skipDisabled: true, guardEmpty: true, wrap: true });
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[2]);
    expect(setReview).toHaveBeenCalledWith('Clear search');
  });

  it('bails after preventDefault when guardEmpty finds nothing (empty search row)', () => {
    const container = track(makeContainer([{ label: 'Use First', disabled: true }]));
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, skipDisabled: true, guardEmpty: true });
    const event = keyEvent(container, 'ArrowRight');
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setReview).not.toHaveBeenCalled();
  });

  it('reads the preset review from data-review without a text fallback', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    makeRovingKeys({ selector: 'button', setReview })(keyEvent(container, 'ArrowRight'));
    expect(setReview).toHaveBeenCalledWith('');
  });
});

describe('makeSegmentKeys (PrintDialog segment groups)', () => {
  const VALUES = ['0', '3', '5', '10', '15', '25'];

  function segmentContainer() {
    return track(makeContainer(VALUES.map((value) => ({ label: value, value, review: `Margin ${value} mm` }))));
  }

  it('applies the next value and focuses its data-value button on the next frame', async () => {
    const container = segmentContainer();
    const buttons = container.querySelectorAll('button');
    buttons[2].focus();
    const apply = vi.fn();
    const onReview = vi.fn();
    const handler = makeSegmentKeys({ values: VALUES, current: '5', apply, onReview });
    handler(keyEvent(container, 'ArrowRight'));
    expect(apply).toHaveBeenCalledWith('10');
    await nextFrame();
    expect(document.activeElement).toBe(buttons[3]);
    expect(onReview).toHaveBeenCalledWith(buttons[3]);
  });

  it('wraps around the value list', () => {
    const container = segmentContainer();
    const apply = vi.fn();
    const handler = makeSegmentKeys({ values: VALUES, current: '25', apply });
    handler(keyEvent(container, 'ArrowRight'));
    expect(apply).toHaveBeenCalledWith('0');
    handler(keyEvent(container, 'ArrowLeft'));
    handler(keyEvent(container, 'ArrowLeft'));
    expect(apply).toHaveBeenLastCalledWith('15');
  });

  it('starts from the first value on ArrowRight and the last on ArrowLeft when current is unset', () => {
    const container = segmentContainer();
    const apply = vi.fn();
    const handler = makeSegmentKeys({ values: VALUES, current: '', apply });
    handler(keyEvent(container, 'ArrowRight'));
    expect(apply).toHaveBeenCalledWith('0');
    handler(keyEvent(container, 'ArrowLeft'));
    expect(apply).toHaveBeenCalledWith('25');
  });

  it('jumps with Home and End', () => {
    const container = segmentContainer();
    const apply = vi.fn();
    const handler = makeSegmentKeys({ values: VALUES, current: '5', apply });
    handler(keyEvent(container, 'Home'));
    expect(apply).toHaveBeenCalledWith('0');
    handler(keyEvent(container, 'End'));
    expect(apply).toHaveBeenCalledWith('25');
  });

  it('still finds the button after the synthetic event target would be gone', async () => {
    const container = segmentContainer();
    const buttons = container.querySelectorAll('button');
    const onReview = vi.fn();
    const handler = makeSegmentKeys({ values: VALUES, current: '0', apply: vi.fn(), onReview });
    const event = keyEvent(container, 'ArrowRight');
    handler(event);
    // React nulls event.currentTarget after dispatch; the factory must have
    // captured the container synchronously.
    (event as unknown as { currentTarget: HTMLElement | null }).currentTarget = null;
    await nextFrame();
    expect(document.activeElement).toBe(buttons[1]);
    expect(onReview).toHaveBeenCalledWith(buttons[1]);
  });
});
