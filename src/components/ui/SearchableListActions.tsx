import { ActionToolbar, type ActionToolbarProps } from './ActionToolbar';

/**
 * The searchable-list recovery row rendered next to a filtered list's match
 * counter: a first action that jumps to the top result (PrintDialog renders
 * "Use First" disabled when empty; ShortcutsDialog hides "Edit First") plus
 * "Clear search". The parent keeps the `{query && …}` conditional — this
 * component is only the toolbar itself.
 */
export interface SearchableFirstAction {
  label: string;
  /** Review announcement — rendered as data-<name>-action-review and set on focus. */
  review: string;
  title: string;
  className: string;
  onActivate: () => void;
  /** Render the first button as disabled (Use First convention). */
  disabled?: boolean;
  /** Omit the first button entirely (Edit First convention). */
  hidden?: boolean;
}

export interface SearchableClearAction {
  label: string;
  review: string;
  title: string;
  className: string;
  onActivate: () => void;
}

export interface SearchableListActionsProps extends Omit<ActionToolbarProps, 'children'> {
  /** Shared action attribute, e.g. 'data-page-search-action'. */
  actionAttr: string;
  setReviewed: (value: string) => void;
  first: SearchableFirstAction;
  clear: SearchableClearAction;
}

export function SearchableListActions({ actionAttr, setReviewed, first, clear, statusAs = 'span', ...toolbar }: SearchableListActionsProps) {
  const reviewAttr = `${actionAttr}-review`;
  return (
    <ActionToolbar {...toolbar} statusAs={statusAs}>
      {!first.hidden && (
        <button
          type="button"
          className={first.className}
          {...{ [actionAttr]: true }}
          {...{ [reviewAttr]: first.review }}
          onFocus={() => setReviewed(first.review)}
          onClick={first.onActivate}
          disabled={first.disabled}
          title={first.title}
        >
          {first.label}
        </button>
      )}
      <button
        type="button"
        className={clear.className}
        {...{ [actionAttr]: true }}
        {...{ [reviewAttr]: clear.review }}
        onFocus={() => setReviewed(clear.review)}
        onClick={clear.onActivate}
        title={clear.title}
      >
        {clear.label}
      </button>
    </ActionToolbar>
  );
}
