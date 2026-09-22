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
        >
          {action.children}
        </button>
      ))}
    </ActionToolbar>
  );
}
