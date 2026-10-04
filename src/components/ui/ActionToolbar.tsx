import type { ReactNode } from 'react';

/**
 * The shared "action review" toolbar container used by every house dialog:
 * a role="toolbar" (or "group") div whose first child is an sr-only
 * aria-live="polite" status element announcing `Reviewing <action>` for
 * screen readers, wired to the container via aria-describedby. PresetRow,
 * ReviewedFooter, and SearchableListActions render their buttons inside it.
 *
 * Two opt-outs cover the shapes that don't fit "region as first child":
 * `externalStatus` keeps aria-describedby pointing at `statusId` but leaves
 * rendering the live region to the consumer (outside the container, or in a
 * different container altogether), and `statusContent` replaces the default
 * announcement so index-derived composite review text stays in the kit.
 */

/** The exact inputs of the default announcement, handed to `statusContent`. */
export interface ActionToolbarStatus {
  /** Localized "Reviewing" prefix (the `reviewingLabel` prop). */
  reviewingLabel: string;
  /** Last reviewed action text ('' until something has been reviewed). */
  reviewed: string;
  /** Announced before any action has been reviewed (the `fallback` prop). */
  fallback: string;
}

export interface ActionToolbarProps {
  /** id of the sr-only live region; also wired to aria-describedby. */
  statusId: string;
  /** aria-label of the toolbar/group. */
  label: string;
  /** Keyboard hint shown on hover (title). */
  title?: string;
  /** Roving keydown handler (see makeRovingKeys / makeSegmentKeys). */
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Container layout classes. */
  className?: string;
  /** ARIA role of the container. */
  role?: 'toolbar' | 'group' | 'radiogroup';
  /** Element used for the review status live region. */
  statusAs?: 'div' | 'span';
  /**
   * Render the live region yourself instead of as the container's first
   * child: the built-in region is omitted and aria-describedby keeps
   * pointing at `statusId`, wherever the consumer renders it (e.g. as a
   * preceding sibling of the container, or inside another container that
   * already owns the region).
   */
  externalStatus?: boolean;
  /** Localized "Reviewing" prefix — pass t('Reviewing'). */
  reviewingLabel: string;
  /** Last reviewed action text; '' announces the fallback instead. */
  reviewed?: string;
  /** Announced before any action has been reviewed. */
  fallback: string;
  /**
   * Overrides the default `Reviewing <action>` announcement — e.g. to append
   * an index/total (`1 / 3`) or a follow-up sentence derived from state.
   * Receives exactly the inputs of the default template so overrides can
   * reuse the prefix and fallback behavior.
   */
  statusContent?: (status: ActionToolbarStatus) => ReactNode;
  /** Roving buttons (PresetRow / ReviewedFooter / SearchableListActions render them for you). */
  children?: ReactNode;
}

export function ActionToolbar({
  statusId,
  label,
  title,
  onKeyDown,
  className,
  role = 'toolbar',
  statusAs = 'div',
  externalStatus = false,
  reviewingLabel,
  reviewed = '',
  fallback,
  statusContent,
  children,
}: ActionToolbarProps) {
  const Status = statusAs;
  return (
    <div className={className} role={role} aria-label={label} aria-describedby={statusId} title={title} onKeyDown={onKeyDown}>
      {!externalStatus && (
        <Status id={statusId} className="sr-only" aria-live="polite">
          {statusContent ? statusContent({ reviewingLabel, reviewed, fallback }) : `${reviewingLabel} ${reviewed || fallback}`}
        </Status>
      )}
      {children}
    </div>
  );
}
