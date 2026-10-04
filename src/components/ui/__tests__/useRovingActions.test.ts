import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actionReviewKey, makeGridKeys, makeRovingKeys, makeSegmentKeys, type RovingEvent } from '../useRovingActions';

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

describe('makeRovingKeys (axis: vertical — SeparationsDialog plate listbox)', () => {
  it('answers ArrowUp/ArrowDown but ignores ArrowLeft/ArrowRight without preventing default', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }]));
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, axis: 'vertical' });
    const left = keyEvent(container, 'ArrowLeft');
    handler(left);
    expect(left.preventDefault).not.toHaveBeenCalled();
    expect(setReview).not.toHaveBeenCalled();
    const down = keyEvent(container, 'ArrowDown');
    handler(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(setReview).toHaveBeenCalled();
  });

  it('moves down forward and up backward with immediate review + focus', () => {
    const container = track(makeContainer([
      { label: 'Cyan', review: 'Cyan plate' },
      { label: 'Magenta', review: 'Magenta plate' },
      { label: 'Yellow', review: 'Yellow plate' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[1].focus();
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, axis: 'vertical' });
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[2]);
    expect(setReview).toHaveBeenCalledWith('Yellow plate');
    handler(keyEvent(container, 'ArrowUp'));
    handler(keyEvent(container, 'ArrowUp'));
    expect(document.activeElement).toBe(buttons[0]);
    expect(setReview).toHaveBeenLastCalledWith('Cyan plate');
  });

  it('clamps ArrowUp at the first row and ArrowDown at the last', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const handler = makeRovingKeys({ selector: 'button', setReview: vi.fn(), axis: 'vertical' });
    handler(keyEvent(container, 'ArrowUp'));
    expect(document.activeElement).toBe(buttons[0]);
    buttons[2].focus();
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('jumps with Home and End', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const buttons = container.querySelectorAll('button');
    buttons[1].focus();
    const handler = makeRovingKeys({ selector: 'button', setReview: vi.fn(), axis: 'vertical' });
    handler(keyEvent(container, 'Home'));
    expect(document.activeElement).toBe(buttons[0]);
    handler(keyEvent(container, 'End'));
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('composes with skipDisabled, stepping over disabled rows', () => {
    const container = track(makeContainer([
      { label: 'A' },
      { label: 'Locked', disabled: true },
      { label: 'C', review: 'Row C' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, axis: 'vertical', skipDisabled: true });
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[2]);
    expect(setReview).toHaveBeenCalledWith('Row C');
  });

  it('wraps vertically when wrap is set', () => {
    const container = track(makeContainer([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const buttons = container.querySelectorAll('button');
    buttons[2].focus();
    const handler = makeRovingKeys({ selector: 'button', setReview: vi.fn(), axis: 'vertical', wrap: true });
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[0]);
    handler(keyEvent(container, 'ArrowUp'));
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('composes with onNavigate synchronously and defer for review + focus', async () => {
    const container = track(makeContainer([
      { label: 'A', review: 'Review A' },
      { label: 'B', review: 'Review B' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    const onNavigate = vi.fn();
    const handler = makeRovingKeys({ selector: 'button', setReview, onNavigate, axis: 'vertical', defer: true });
    handler(keyEvent(container, 'ArrowDown'));
    expect(onNavigate).toHaveBeenCalledWith(buttons[1], 1);
    expect(setReview).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(buttons[0]);
    await nextFrame();
    expect(setReview).toHaveBeenCalledWith('Review B');
    expect(document.activeElement).toBe(buttons[1]);
  });
});

describe('makeGridKeys (TemplatesDialog/AssetsPanel/SymbolsPanel tile grids)', () => {
  // grid-cols-3 layout with a short last row, like the template tile grid.
  function gridContainer(count = 8) {
    return track(makeContainer(
      Array.from({ length: count }, (_, index) => ({ label: `Tile ${index}`, review: `Tile ${index} review` })),
    ));
  }

  it('ignores keys outside the grid set without preventing default', () => {
    const container = gridContainer();
    const setReview = vi.fn();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview });
    for (const key of ['Enter', 'PageDown', 'a']) {
      const event = keyEvent(container, key);
      handler(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(setReview).not.toHaveBeenCalled();
  });

  it('steps ±1 with ArrowRight/ArrowLeft, crossing row boundaries freely', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[2].focus();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn() });
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[3]);
    handler(keyEvent(container, 'ArrowLeft'));
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('steps ±columns with ArrowDown/ArrowUp', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[1].focus();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn() });
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[4]);
    handler(keyEvent(container, 'ArrowUp'));
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('clamps every arrow instead of wrapping (the tile grids never wrap)', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn() });
    handler(keyEvent(container, 'ArrowUp'));
    expect(document.activeElement).toBe(buttons[0]);
    handler(keyEvent(container, 'ArrowLeft'));
    expect(document.activeElement).toBe(buttons[0]);
    buttons[7].focus();
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[7]);
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[7]);
  });

  it('clamps ArrowDown from a partial last row onto the last tile', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[5].focus();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn() });
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[7]);
  });

  it('jumps with Home and End to the absolute first/last tile, not the row ends', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[5].focus();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn() });
    handler(keyEvent(container, 'Home'));
    expect(document.activeElement).toBe(buttons[0]);
    handler(keyEvent(container, 'End'));
    expect(document.activeElement).toBe(buttons[7]);
  });

  it('treats a container with no focused tile as active index 0 (dataset ?? 0 fallback)', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    container.focus();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn() });
    handler(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[3]);
  });

  it('skips disabled tiles, keeping the ±columns arithmetic over the filtered list', () => {
    const container = track(makeContainer([
      { label: 'Tile 0', review: 'Tile 0' },
      { label: 'Tile 1', disabled: true },
      { label: 'Tile 2', review: 'Tile 2' },
      { label: 'Tile 3', review: 'Tile 3' },
    ]));
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview, skipDisabled: true });
    handler(keyEvent(container, 'ArrowDown'));
    // Filtered list is [0, 2, 3]; 0 + 3 clamps onto its last tile.
    expect(document.activeElement).toBe(buttons[3]);
    expect(setReview).toHaveBeenCalledWith('Tile 3');
  });

  it('bails after preventDefault when guardEmpty finds nothing', () => {
    const container = track(makeContainer([{ label: 'Tile', disabled: true }]));
    const setReview = vi.fn();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview, skipDisabled: true, guardEmpty: true });
    const event = keyEvent(container, 'ArrowDown');
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setReview).not.toHaveBeenCalled();
  });

  it('publishes the tile review and focuses immediately (setReview commit)', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const setReview = vi.fn();
    makeGridKeys({ selector: 'button', columns: 3, setReview })(keyEvent(container, 'ArrowRight'));
    expect(setReview).toHaveBeenCalledWith('Tile 1 review');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('invokes onNavigate synchronously with the next tile and its index', () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[0].focus();
    const onNavigate = vi.fn();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview: vi.fn(), onNavigate });
    handler(keyEvent(container, 'ArrowDown'));
    expect(onNavigate).toHaveBeenCalledWith(buttons[3], 3);
    expect(document.activeElement).toBe(buttons[3]);
  });

  it('defers review + focus to the next frame while onNavigate stays synchronous', async () => {
    const container = gridContainer();
    const buttons = container.querySelectorAll('button');
    buttons[3].focus();
    const setReview = vi.fn();
    const onNavigate = vi.fn();
    const handler = makeGridKeys({ selector: 'button', columns: 3, setReview, onNavigate, defer: true });
    handler(keyEvent(container, 'ArrowUp'));
    expect(onNavigate).toHaveBeenCalledWith(buttons[0], 0);
    expect(setReview).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(buttons[3]);
    await nextFrame();
    expect(setReview).toHaveBeenCalledWith('Tile 0 review');
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('makeRovingKeys (fallbackIndex: -1 — SymbolsPanel naming-toolbar entry)', () => {
  /** The naming-toolbar shape: an auto-focused <input> before the roving buttons. */
  function containerWithInput() {
    const container = track(makeContainer([
      { label: 'Save', actionReview: 'Save symbol' },
      { label: 'Cancel', actionReview: 'Cancel' },
    ]));
    const input = document.createElement('input');
    container.prepend(input);
    return { container, input };
  }

  it('keeps the index-0 default for unmatched focus without the option (ArrowRight → second button)', () => {
    const { container, input } = containerWithInput();
    const buttons = container.querySelectorAll('button');
    input.focus();
    const setReview = vi.fn();
    makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', wrap: true, setReview })(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[1]);
    expect(setReview).toHaveBeenCalledWith('Cancel');
  });

  it('starts before the first button on the forward arrow: input ArrowRight lands on Save', () => {
    const { container, input } = containerWithInput();
    const buttons = container.querySelectorAll('button');
    input.focus();
    const setReview = vi.fn();
    makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', wrap: true, fallbackIndex: -1, setReview })(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[0]);
    expect(setReview).toHaveBeenCalledWith('Save symbol');
  });

  it('starts at the first button on the backward arrow: input ArrowLeft wraps onto Cancel', () => {
    const { container, input } = containerWithInput();
    const buttons = container.querySelectorAll('button');
    input.focus();
    const setReview = vi.fn();
    makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', wrap: true, fallbackIndex: -1, setReview })(keyEvent(container, 'ArrowLeft'));
    expect(document.activeElement).toBe(buttons[1]);
    expect(setReview).toHaveBeenCalledWith('Cancel');
  });

  it('clamps instead of wrapping when wrap is off: both arrows from unmatched focus stay on the first button', () => {
    const { container, input } = containerWithInput();
    const buttons = container.querySelectorAll('button');
    const handler = makeRovingKeys({ selector: 'button', fallbackIndex: -1, setReview: vi.fn() });
    input.focus();
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[0]);
    input.focus();
    handler(keyEvent(container, 'ArrowLeft'));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('never touches matched focus: button-index navigation is identical with the option', () => {
    const { container } = containerWithInput();
    const buttons = container.querySelectorAll('button');
    const handler = makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', wrap: true, fallbackIndex: -1, setReview: vi.fn() });
    buttons[0].focus();
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[1]);
    handler(keyEvent(container, 'ArrowRight'));
    expect(document.activeElement).toBe(buttons[0]); // wrap at the end
    handler(keyEvent(container, 'ArrowLeft'));
    expect(document.activeElement).toBe(buttons[1]); // wrap back
  });

  it('Home/End from unmatched focus jump to the absolute ends regardless of the option', () => {
    const { container, input } = containerWithInput();
    const buttons = container.querySelectorAll('button');
    const handler = makeRovingKeys({ selector: 'button', wrap: true, fallbackIndex: -1, setReview: vi.fn() });
    input.focus();
    handler(keyEvent(container, 'Home'));
    expect(document.activeElement).toBe(buttons[0]);
    input.focus();
    handler(keyEvent(container, 'End'));
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('mirrors the asymmetric entry on the vertical axis (ArrowDown lands on the first row)', () => {
    const container = track(makeContainer([
      { label: 'Save', actionReview: 'Save symbol' },
      { label: 'Cancel', actionReview: 'Cancel' },
    ]));
    const input = document.createElement('input');
    container.prepend(input);
    const buttons = container.querySelectorAll('button');
    input.focus();
    const setReview = vi.fn();
    makeRovingKeys({ selector: 'button', reviewKey: 'xActionReview', axis: 'vertical', wrap: true, fallbackIndex: -1, setReview })(keyEvent(container, 'ArrowDown'));
    expect(document.activeElement).toBe(buttons[0]);
    expect(setReview).toHaveBeenCalledWith('Save symbol');
  });
});
