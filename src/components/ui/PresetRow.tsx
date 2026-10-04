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
  /**
   * Native disabled attribute, passed through verbatim — the kit injects no
   * styling of its own: buttons on the shared `btn` classes pick up the
   * global `.btn:disabled` rules, custom chips keep their own `disabled:`
   * utilities in `className`. Roving handlers skip it via `skipDisabled`.
   */
  disabled?: boolean;
  /** Accessible name, passed through verbatim (icon-only or rich chips). */
  'aria-label'?: string;
  /**
   * In-progress flag, passed through verbatim — no styling of its own: busy
   * chips keep the spinner swap and any `disabled:` utilities in
   * `className`, exactly as they did as handwritten buttons (AIPanel's
   * send/MCP Test/Refresh precedent).
   */
  'aria-busy'?: boolean;
  /**
   * Radiogroup member semantics: render role="radio" with
   * aria-checked={pressed} — the pressed state doubles as the checked
   * state — and suppress aria-pressed. Pair with a container passing
   * role="radiogroup" (ActionToolbar/PresetRow already accept it);
   * group-level ARIA (aria-required and friends) stays consumer-owned.
   */
  radio?: boolean;
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
          {...(item.radio ? { role: 'radio' as const, 'aria-checked': item.pressed } : {})}
          className={item.className}
          onClick={item.onClick}
          onFocus={(event) => setReviewed(event.currentTarget.dataset[item.focusReviewKey ?? 'review'] ?? '')}
          aria-pressed={item.radio ? undefined : item.pressed}
          title={item.title}
          aria-label={item['aria-label']}
          aria-busy={item['aria-busy']}
          disabled={item.disabled}
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
