import type { ReactNode } from 'react';

/**
 * The shared "action review" toolbar container used by every house dialog:
 * a role="toolbar" (or "group") div whose first child is an sr-only
 * aria-live="polite" status element announcing `Reviewing <action>` for
 * screen readers, wired to the container via aria-describedby. PresetRow,
 * ReviewedFooter, and SearchableListActions render their buttons inside it.
 */
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
  role?: 'toolbar' | 'group';
  /** Element used for the review status live region. */
  statusAs?: 'div' | 'span';
  /** Localized "Reviewing" prefix — pass t('Reviewing'). */
  reviewingLabel: string;
  /** Last reviewed action text; '' announces the fallback instead. */
  reviewed?: string;
  /** Announced before any action has been reviewed. */
  fallback: string;
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
  reviewingLabel,
  reviewed = '',
  fallback,
  children,
}: ActionToolbarProps) {
  const Status = statusAs;
  return (
    <div className={className} role={role} aria-label={label} aria-describedby={statusId} title={title} onKeyDown={onKeyDown}>
      <Status id={statusId} className="sr-only" aria-live="polite">
        {`${reviewingLabel} ${reviewed || fallback}`}
      </Status>
      {children}
    </div>
  );
}
