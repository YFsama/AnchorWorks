import type { ReactNode } from 'react';
import { ActionToolbar, type ActionToolbarProps } from './ActionToolbar';

/**
 * A keyboard-browsable preset row: label conventions, active/pressed state,
 * and per-button review announcements, all inside the shared ActionToolbar
 * container. Rich one-off chips stay local — items carry arbitrary content,
 * class names (with the active/inactive variant computed by the dialog), and
 * ordered data-* attributes, so the kit never needs a per-dialog variant.
 */
export interface PresetItem {
  key: React.Key;
  /** Button content (plain value or rich spans). */
  children: ReactNode;
  /** Full className including the active/inactive variant. */
  className: string;
  /** aria-pressed state. */
  pressed?: boolean;
  onClick?: () => void;
  title?: string;
  /**
   * data-* attributes rendered in insertion order after the shared action
   * attribute — keys omit the `data-` prefix. `review` holds the review
   * announcement (data-review); use a custom key for rows that announce
   * from data-<name>-action-review instead and point `focusReviewKey` at it.
   */
  data?: Record<string, string | number | true>;
  /** dataset key read on focus (default 'review'). */
  focusReviewKey?: string;
}

export interface PresetRowProps extends Omit<ActionToolbarProps, 'children'> {
  /** Shared data-* action attribute, e.g. 'data-simplify-preset-action'. */
  actionAttr?: string;
  items: PresetItem[];
  /** Review publisher wired to each button's onFocus. */
  setReviewed: (value: string) => void;
}

export function PresetRow({ actionAttr, items, setReviewed, ...toolbar }: PresetRowProps) {
  return (
    <ActionToolbar {...toolbar}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          {...(actionAttr ? { [actionAttr]: true } : {})}
          {...dataAttributes(item.data)}
          className={item.className}
          onClick={item.onClick}
          onFocus={(event) => setReviewed(event.currentTarget.dataset[item.focusReviewKey ?? 'review'] ?? '')}
          aria-pressed={item.pressed}
          title={item.title}
        >
          {item.children}
        </button>
      ))}
    </ActionToolbar>
  );
}

function dataAttributes(data: Record<string, string | number | true> | undefined): Record<string, string | number | true> {
  if (!data) return {};
  const attrs: Record<string, string | number | true> = {};
  for (const [key, value] of Object.entries(data)) attrs[`data-${key}`] = value;
  return attrs;
}
