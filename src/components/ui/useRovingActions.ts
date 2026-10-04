import { useState } from 'react';

/**
 * House dialog keyboard conventions, extracted from the 51-dialog boilerplate
 * audit (OPTIMIZATION_BACKLOG P1). Two handler factories cover every roving
 * shape in the codebase:
 *
 * - `makeRovingKeys` — ArrowLeft/Right/Home/End move focus across the buttons
 *   matching a `[data-…]` selector inside the container, publishing a
 *   screen-reader "action review" announcement along the way. Option flags
 *   reproduce each legacy variant exactly: clamped vs wrapping arrows,
 *   immediate vs requestAnimationFrame-deferred commit, disabled-button
 *   filtering, and footer (action-review attribute + text fallback) vs preset
 *   (`data-review`) announcement sources. `axis: 'vertical'` swaps the arrow
 *   pair for ArrowUp/ArrowDown (listbox rows, panel lists, tablists).
 * - `makeGridKeys` — 2-D grid roving: horizontal arrows step ±1, vertical
 *   arrows step ±`columns`, every move clamps inside the tile list
 *   (TemplatesDialog/AssetsPanel/SymbolsPanel tile grids).
 * - `makeSegmentKeys` — value-array roving for `role="group"` segment
 *   controls whose buttons carry `data-value={value}` (PrintDialog margin /
 *   bleed / orientation / scaling / prep groups).
 *
 * Both factories are plain functions called during render (mirroring the
 * inline handlers they replace), so their closures are as fresh as the
 * originals' — no stale-state risk and no hook-order constraints.
 */

/** Keys the horizontal roving variants respond to (Home/End jump, arrows step). */
const ROVING_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'] as const;

/** Vertical counterpart: ArrowUp/ArrowDown step; Left/Right are ignored. */
const ROVING_KEYS_VERTICAL = ['ArrowUp', 'ArrowDown', 'Home', 'End'] as const;

/** Keys the 2-D grid variant responds to (arrows step by 1 or by a row). */
const GRID_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const;

export type RovingEvent = React.KeyboardEvent<HTMLDivElement>;

export interface RovingKeysOptions {
  /**
   * CSS selector matching the roving buttons inside the container,
   * e.g. '[data-simplify-action]'.
   */
  selector: string;
  /** dataset key read for the review announcement (default 'review'). */
  reviewKey?: string;
  /**
   * Fall back to the button's trimmed text content when the review dataset
   * key is missing — the Cancel/Apply footer convention.
   */
  fallbackToText?: boolean;
  /** Wrap ArrowLeft/ArrowRight at the row ends instead of clamping. */
  wrap?: boolean;
  /**
   * Roving axis (default 'horizontal'): 'vertical' answers ArrowUp/ArrowDown
   * instead of ArrowLeft/ArrowRight (SeparationsDialog plate listbox and the
   * FontPicker/KeymapEditor/HelpCenter/ArtboardsPanel/PreferencesDialog
   * vertical lists, which all ignore the perpendicular pair), so ArrowDown
   * steps forward and ArrowUp steps back while Home/End keep their meaning.
   */
  axis?: 'horizontal' | 'vertical';
  /** Skip disabled / aria-disabled buttons entirely. */
  skipDisabled?: boolean;
  /**
   * Active-index fallback when focus is on none of the matched buttons
   * (default 0 = the house `Math.max(0, findIndex)` convention: arrows
   * start AT the first button). `-1` reproduces the SymbolsPanel naming
   * toolbar's asymmetric legacy entry: the backward arrow starts at the
   * first button (wrapping onto the last) while the forward arrow starts
   * "before" it and lands on the first. Only reachable when focus sits on
   * a non-button element inside the container — e.g. the auto-focused name
   * `<input>` bubbling arrow keys into the roving set — and only the
   * no-focus branch changes; a matched focus index is always used as-is.
   */
  fallbackIndex?: 0 | -1;
  /** Bail out (after preventDefault) when no buttons match. */
  guardEmpty?: boolean;
  /** Invoked with the next button before the review/focus commit. */
  onNavigate?: (button: HTMLButtonElement | undefined, index: number) => void;
  /** Publishes the review announcement. */
  setReview: (text: string) => void;
  /** Commit review + focus on the next animation frame (preset convention). */
  defer?: boolean;
}

/** Dataset camelCase key for a `data-<name>-action-review` attribute. */
export function actionReviewKey(actionAttr: string): string {
  return `${actionAttr}-review`
    .replace(/^data-/, '')
    .replace(/-([a-z])/g, (chunk) => chunk[1].toUpperCase());
}

/**
 * Roving keydown handler factory. See RovingKeysOptions for the variant
 * flags; the produced handler resolves the buttons synchronously (so the
 * requestAnimationFrame commit can never observe a mutated DOM), mirrors the
 * legacy `Math.max(0, findIndex(activeElement))` active-index fallback
 * (overridable to the -1/forward asymmetric entry via `fallbackIndex`), and
 * publishes the review text before moving focus.
 */
export function makeRovingKeys(options: RovingKeysOptions): (event: RovingEvent) => void {
  const {
    selector,
    reviewKey = 'review',
    fallbackToText = false,
    wrap = false,
    skipDisabled = false,
    guardEmpty = false,
    axis = 'horizontal',
    fallbackIndex = 0,
    onNavigate,
    setReview,
    defer = false,
  } = options;
  const rovingKeys = axis === 'vertical' ? ROVING_KEYS_VERTICAL : ROVING_KEYS;
  // The arrow that steps forward; vertical roving swaps Left/Right for Up/Down.
  const forwardKey = axis === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  return (event) => {
    if (!(rovingKeys as readonly string[]).includes(event.key)) return;
    event.preventDefault();
    let actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
    if (skipDisabled) {
      actions = actions.filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    }
    if (guardEmpty && actions.length === 0) return;
    const focusIndex = actions.findIndex((button) => button === document.activeElement);
    // Unmatched focus falls back to index 0, or "before the first" (-1) for
    // the forward arrow under fallbackIndex: -1 — the naming-toolbar entry.
    const activeIndex = focusIndex >= 0
      ? focusIndex
      : fallbackIndex === -1 && event.key === forwardKey ? -1 : 0;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : wrap
          ? event.key === forwardKey
            ? (activeIndex + 1) % actions.length
            : (activeIndex - 1 + actions.length) % actions.length
          : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === forwardKey ? 1 : -1)));
    const nextAction = actions[nextIndex];
    onNavigate?.(nextAction, nextIndex);
    const commit = () => {
      const review = nextAction
        ? nextAction.dataset[reviewKey] ?? (fallbackToText ? nextAction.textContent?.trim() : undefined) ?? ''
        : '';
      setReview(review);
      nextAction?.focus();
    };
    if (defer) requestAnimationFrame(commit);
    else commit();
  };
}

export interface GridKeysOptions extends Omit<RovingKeysOptions, 'wrap' | 'axis' | 'fallbackIndex'> {
  /**
   * Column count of the grid (the `grid-cols-N` value): ArrowDown/ArrowUp
   * step by one whole row, i.e. ±`columns` indices.
   */
  columns: number;
}

/**
 * 2-D grid keydown handler factory, aligned move-for-move with the live
 * TemplatesDialog/AssetsPanel/SymbolsPanel tile-grid contract
 * (`handleTemplateGridKeys` & co.): ArrowRight/Left step ±1 (crossing row
 * boundaries freely), ArrowDown/Up step ±`columns`, and every move clamps
 * to [0, lastIndex] — those grids never wrap. Home/End jump to the absolute
 * first/last tile, not to the row ends. The focused-tile lookup mirrors the
 * kit convention (identity match inside the container, index 0 fallback)
 * which lands on the same index as the legacy `dataset.<name>Index ?? 0`
 * read because tiles render in index order.
 */
export function makeGridKeys(options: GridKeysOptions): (event: RovingEvent) => void {
  const {
    selector,
    columns,
    reviewKey = 'review',
    fallbackToText = false,
    skipDisabled = false,
    guardEmpty = false,
    onNavigate,
    setReview,
    defer = false,
  } = options;
  return (event) => {
    if (!(GRID_KEYS as readonly string[]).includes(event.key)) return;
    event.preventDefault();
    let tiles = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
    if (skipDisabled) {
      tiles = tiles.filter((tile) => !tile.disabled && tile.getAttribute('aria-disabled') !== 'true');
    }
    if (guardEmpty && tiles.length === 0) return;
    const activeIndex = Math.max(0, tiles.findIndex((tile) => tile === document.activeElement));
    const lastIndex = tiles.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : Math.max(0, Math.min(lastIndex, activeIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : -columns)));
    const nextTile = tiles[nextIndex];
    onNavigate?.(nextTile, nextIndex);
    const commit = () => {
      const review = nextTile
        ? nextTile.dataset[reviewKey] ?? (fallbackToText ? nextTile.textContent?.trim() : undefined) ?? ''
        : '';
      setReview(review);
      nextTile?.focus();
    };
    if (defer) requestAnimationFrame(commit);
    else commit();
  };
}

export interface SegmentKeysOptions<T extends string> {
  /** Ordered values of the segment group; buttons carry data-value={value}. */
  values: readonly T[];
  /** Currently selected value ('' when nothing matches). */
  current: T;
  /** Applies the next value. */
  apply: (next: T) => void;
  /** Optional review callback invoked with the next button (may be null). */
  onReview?: (button: HTMLButtonElement | null) => void;
}

/**
 * Segment-group keydown handler factory (PrintDialog's handleSegmentKeys).
 * Arrows wrap around the value list; when `current` is not among `values`,
 * ArrowRight restarts from the first value and ArrowLeft from the last.
 * The container is captured before the deferred commit because React nulls
 * `event.currentTarget` once dispatch returns — the pre-kit code read it
 * inside the frame and crashed there.
 */
export function makeSegmentKeys<T extends string>(options: SegmentKeysOptions<T>): (event: RovingEvent) => void {
  const { values, current, apply, onReview } = options;
  return (event) => {
    if (!(ROVING_KEYS as readonly string[]).includes(event.key)) return;
    event.preventDefault();
    const index = values.indexOf(current);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
        : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
    apply(next);
    const container = event.currentTarget;
    requestAnimationFrame(() => {
      const button = container.querySelector<HTMLButtonElement>(`[data-value="${next}"]`);
      onReview?.(button);
      button?.focus();
    });
  };
}

/**
 * Review-state machine behind the "action review status" live region: an
 * empty string means nothing has been reviewed yet (the toolbar announces
 * its fallback label); any other string is announced verbatim after the
 * localized "Reviewing" prefix.
 */
export function useReviewedAction(): [string, (value: string) => void] {
  return useState('');
}
