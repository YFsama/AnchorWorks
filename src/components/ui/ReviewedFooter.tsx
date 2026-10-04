import type { ReactNode } from 'react';
import { ActionToolbar, type ActionToolbarProps } from './ActionToolbar';

/**
 * The Cancel/Reset/Apply dialog footer: an ActionToolbar whose buttons share
 * a `data-<name>-action` attribute (the roving selector), carry the review
 * announcement in `data-<name>-action-review`, and publish it on focus.
 * Order and labels are fully caller-controlled — FreeDistort puts Reset
 * first, PrintDialog mixes in icon actions, Shortcuts uses two text buttons
 * with no container classes.
 */
export interface FooterAction {
  /** Visible content (label and optional icon). */
  children: ReactNode;
  /** Review announcement — rendered as data-<name>-action-review and set on focus. */
  review: string;
  /** Button classes ('btn', 'btn-primary', …). */
  className: string;
  onClick: () => void;
  title?: string;
  /**
   * Native disabled attribute, passed through verbatim — no injected classes:
   * `btn` / `btn-primary` footers get the global `:disabled` rules, custom
   * ones keep their own `disabled:` utilities in `className`. Roving handlers
   * skip it via `skipDisabled`.
   */
  disabled?: boolean;
  /** Accessible name, passed through verbatim (icon-only actions). */
  'aria-label'?: string;
  /**
   * In-progress flag, passed through verbatim — no styling of its own: busy
   * actions keep the spinner swap and any `disabled:` utilities in
   * `className`, exactly as they did as handwritten buttons (AIPanel's
   * send/MCP Test/Refresh precedent).
   */
  'aria-busy'?: boolean;
}

export interface ReviewedFooterProps extends Omit<ActionToolbarProps, 'children'> {
  /** Shared action attribute, e.g. 'data-simplify-action'. */
  actionAttr: string;
  actions: FooterAction[];
  /** Review publisher wired to each button's onFocus. */
  setReviewed: (value: string) => void;
}

export function ReviewedFooter({ actionAttr, actions, setReviewed, statusAs = 'span', ...toolbar }: ReviewedFooterProps) {
  const reviewAttr = `${actionAttr}-review`;
  return (
    <ActionToolbar {...toolbar} statusAs={statusAs}>
      {actions.map((action, index) => (
        <button
          key={index}
          type="button"
          {...{ [actionAttr]: true }}
          {...{ [reviewAttr]: action.review }}
          className={action.className}
          onClick={action.onClick}
          onFocus={() => setReviewed(action.review)}
          title={action.title}
          aria-label={action['aria-label']}
          aria-busy={action['aria-busy']}
          disabled={action.disabled}
        >
          {action.children}
        </button>
      ))}
    </ActionToolbar>
  );
}

export interface ActionButtonProps {
  /** Visible content (label and optional icon). */
  children: ReactNode;
  /** Button classes ('btn', 'btn-primary', …). */
  className: string;
  /** Shared data-* action attribute (the roving selector), e.g. 'data-ai-action'. */
  actionAttr?: string;
  onClick?: () => void;
  title?: string;
  /** Native disabled attribute, passed through verbatim. */
  disabled?: boolean;
  /** Accessible name, passed through verbatim (icon-only actions). */
  'aria-label'?: string;
  /** In-progress flag, passed through verbatim (async actions). */
  'aria-busy'?: boolean;
}

/**
 * A FooterAction-shaped kit button for hand-rolled containers — the escape
 * hatch for toolbars whose container must NOT become an ActionToolbar
 * because it predates the review live region (AIPanel's eight
 * `[data-ai-action]` toolbars: moving them onto ActionToolbar would add an
 * aria-describedby/live region legacy never had, so the containers stay
 * handwritten while their async buttons — send / MCP Test / Refresh, which
 * carry `aria-busy` — render through the kit).
 *
 * The attribute order is frozen to the AIPanel bytes: action attribute,
 * `disabled`, `class`, `title`, `aria-label`, `aria-busy`, with omitted
 * props leaving no trace — first renders match the handwritten buttons
 * byte-for-byte (the frozen suites pin those strings), and later
 * `disabled` false→true flips append the attribute at the DOM's end, the
 * identical serialization the handwritten buttons produced on the same
 * transitions. Two deliberate omissions, both HEAD-equivalence decisions:
 * no `type="button"` (the AIPanel buttons never carried one and sit inside
 * no form) and no review attribute / onFocus wiring (these containers
 * announce nothing).
 */
export function ActionButton({
  children,
  className,
  actionAttr,
  onClick,
  title,
  disabled,
  'aria-label': ariaLabel,
  'aria-busy': ariaBusy,
}: ActionButtonProps) {
  return (
    <button
      {...(actionAttr ? { [actionAttr]: true } : {})}
      disabled={disabled}
      className={className}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
    >
      {children}
    </button>
  );
}
