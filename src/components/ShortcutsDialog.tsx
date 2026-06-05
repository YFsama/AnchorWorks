import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { getBinding, subscribeKeymap } from '../lib/keymap';

interface Shortcut {
  keys?: string;
  bindingIds?: string[];
  shiftedBindingIds?: string[];
  labelKey: string;
}

const SHORTCUT_SEARCH_RECIPES: Array<{ label: string; query: string; title: string }> = [
  { label: 'Text keys', query: 'text', title: 'Filter to text creation, sizing, and editing shortcuts.' },
  { label: 'Output keys', query: 'print|cut|plotter|export', title: 'Filter to print, cut contour, plotter, and export shortcuts.' },
  { label: 'View keys', query: 'zoom', title: 'Filter to zoom, outline, theme, and view shortcuts.' },
  { label: 'Edit keys', query: 'paste', title: 'Filter to common edit, paste, duplicate, and selection shortcuts.' },
];

const TOOLS: Shortcut[] = [
  { bindingIds: ['tool.select'], labelKey: 'Select' },
  { bindingIds: ['tool.rect'], labelKey: 'Rectangle' },
  { bindingIds: ['tool.ellipse'], labelKey: 'Ellipse' },
  { bindingIds: ['tool.line'], labelKey: 'Line' },
  { bindingIds: ['tool.polygon'], labelKey: 'Polygon' },
  { bindingIds: ['tool.pen'], labelKey: 'Pen' },
  { bindingIds: ['tool.pencil'], labelKey: 'Pencil' },
  { bindingIds: ['tool.eraser'], labelKey: 'Eraser' },
  { bindingIds: ['tool.text'], labelKey: 'Text' },
  { bindingIds: ['tool.hand'], labelKey: 'Hand' },
  { bindingIds: ['tool.zoom'], labelKey: 'Zoom' },
  { bindingIds: ['tool.measure'], labelKey: 'Measure' },
  { bindingIds: ['tool.eyedropper'], labelKey: 'Eyedropper' },
  { keys: 'M, then Enter', labelKey: 'Pin measurement as dimension' },
  { keys: 'Space (hold)', labelKey: 'Temporary Hand (pan)' },
];

const ACTIONS: Shortcut[] = [
  { bindingIds: ['edit.undo'], labelKey: 'Undo' },
  { bindingIds: ['edit.redo', 'edit.redoShift'], labelKey: 'Redo' },
  { bindingIds: ['edit.selectAll', 'edit.deselectAll'], labelKey: 'Select / Deselect All' },
  { bindingIds: ['edit.selectInverse'], labelKey: 'Select Inverse' },
  { keys: 'Esc', labelKey: 'Deselect' },
  { bindingIds: ['edit.duplicate'], labelKey: 'Duplicate selection' },
  { bindingIds: ['edit.copy', 'edit.cut', 'edit.paste'], labelKey: 'Copy / Cut / Paste' },
  { bindingIds: ['edit.pasteInPlace', 'edit.pasteInFront', 'edit.pasteInBack'], labelKey: 'Paste in Place / Front / Back' },
  { bindingIds: ['edit.swapFillStroke', 'edit.defaultColors'], labelKey: 'Swap / Default Fill & Stroke' },
  { bindingIds: ['edit.group', 'edit.ungroup'], labelKey: 'Group / Ungroup' },
  { bindingIds: ['edit.clipMask', 'edit.releaseClip'], labelKey: 'Make / Release Clipping Mask' },
  { bindingIds: ['edit.compoundPath', 'edit.releaseCompound'], labelKey: 'Make / Release Compound Path' },
  { bindingIds: ['edit.transformAgain'], labelKey: 'Transform Again' },
  { bindingIds: ['edit.flipH', 'edit.flipV'], labelKey: 'Flip Horizontal / Vertical' },
  { bindingIds: ['edit.lockSelection', 'edit.unlockAll'], labelKey: 'Lock Selection / Unlock All' },
  { bindingIds: ['edit.hideSelection', 'edit.showAll'], labelKey: 'Hide Selection / Show All' },
  { bindingIds: ['edit.join'], labelKey: 'Join Paths' },
  { bindingIds: ['path.averageAnchors'], labelKey: 'Average Anchor Points' },
  { bindingIds: ['object.isolation'], labelKey: 'Isolation Mode' },
  { bindingIds: ['text.fontSizeUp', 'text.fontSizeDown'], labelKey: 'Increase / Decrease Font Size' },
  { bindingIds: ['arrange.forwardFront', 'arrange.backwardBack'], labelKey: 'Bring Forward / Send Backward' },
  { shiftedBindingIds: ['arrange.forwardFront', 'arrange.backwardBack'], labelKey: 'Bring to Front / Send to Back' },
  { keys: 'Delete / Backspace', labelKey: 'Delete selection' },
  { keys: '← ↑ → ↓', labelKey: 'Nudge selection (1 px)' },
  { keys: 'Shift+Arrows', labelKey: 'Nudge selection (10 px)' },
];


function shiftedCombo(combo: string): string {
  const parts = combo.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === 'shift')) return combo;
  const key = parts.pop();
  if (!key) return combo;
  return [...parts, 'Shift', key].join('+');
}

function shortcutKeys(item: Shortcut): string {
  if (item.shiftedBindingIds) return item.shiftedBindingIds.map((id) => shiftedCombo(getBinding(id))).join(' / ');
  return item.bindingIds?.map((id) => getBinding(id)).join(' / ') ?? item.keys ?? '';
}

const FILE_VIEW: Shortcut[] = [
  { bindingIds: ['file.open'], labelKey: 'Open SVG / JSON…' },
  { bindingIds: ['file.saveProject'], labelKey: 'Save Project' },
  { bindingIds: ['file.exportSvg'], labelKey: 'Export SVG' },
  { bindingIds: ['file.print'], labelKey: 'Print…' },
  { bindingIds: ['window.cutContour'], labelKey: 'Cut Contour…' },
  { bindingIds: ['view.zoomIn'], labelKey: 'Zoom in' },
  { bindingIds: ['view.zoomOut'], labelKey: 'Zoom out' },
  { bindingIds: ['view.zoomFit'], labelKey: 'Zoom fit' },
  { bindingIds: ['view.actualSize'], labelKey: 'Actual Size' },
  { bindingIds: ['view.zoomSelection'], labelKey: 'Zoom to Selection' },
  { bindingIds: ['window.plotter'], labelKey: 'Send to Plotter…' },
  { bindingIds: ['view.outline'], labelKey: 'Outline View' },
  { bindingIds: ['view.toggleTheme'], labelKey: 'Toggle Theme' },
  { bindingIds: ['window.commandPalette'], labelKey: 'Command Palette' },
  { bindingIds: ['window.preferences'], labelKey: 'Preferences…' },
  { bindingIds: ['help.helpCenter'], labelKey: 'Help Center' },
  { bindingIds: ['help.shortcuts'], labelKey: 'Show this dialog' },
];

export function ShortcutsDialog() {
  const t = useT();
  const open = useEditor(s => s.showShortcuts);
  const setModal = useEditor(s => s.setModal);
  const [query, setQuery] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedSearchAction, setReviewedSearchAction] = useState('');
  const [reviewedRecipeAction, setReviewedRecipeAction] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const [, setKeymapTick] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstShortcutRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setModal('showShortcuts', false), [setModal]);
  const openKeymapEditor = useCallback(() => {
    setModal('showShortcuts', false);
    setModal('showKeymapEditor', true);
  }, [setModal]);
  const allShortcuts = useMemo(() => [
    { title: t('Tools'), items: TOOLS },
    { title: t('Actions'), items: ACTIONS },
    { title: t('File / View'), items: FILE_VIEW },
  ], [t]);
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = useMemo(
    () => normalizedQuery.split('|').map((token) => token.trim()).filter(Boolean),
    [normalizedQuery],
  );
  const columns = useMemo(() => {
    if (queryTokens.length === 0) return allShortcuts;
    return allShortcuts
      .map((column) => ({
        ...column,
        items: column.items.filter((item) => {
          const haystack = `${shortcutKeys(item)} ${item.labelKey} ${t(item.labelKey)} ${column.title}`.toLowerCase();
          return queryTokens.some((token) => haystack.includes(token));
        }),
      }))
      .filter((column) => column.items.length > 0);
  }, [allShortcuts, queryTokens, t]);
  const totalShortcuts = TOOLS.length + ACTIONS.length + FILE_VIEW.length;
  const visibleShortcuts = columns.reduce((sum, column) => sum + column.items.length, 0);
  const currentReviewIndex = Math.min(reviewIndex, Math.max(0, visibleShortcuts - 1));
  const visibleShortcutItems = columns.flatMap((column) => column.items);
  const focusShortcutCard = (index: number) => {
    setReviewIndex(index);
    requestAnimationFrame(() => {
      document.querySelector<HTMLDivElement>(`[data-shortcut-index="${index}"]`)?.focus();
    });
  };
  const handleShortcutGridKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const activeIndex = Number((document.activeElement as HTMLElement | null)?.dataset.shortcutIndex ?? 0);
    const lastIndex = visibleShortcuts - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : Math.max(0, Math.min(lastIndex, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    focusShortcutCard(nextIndex);
  };
  const handleSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-shortcut-search-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    event.preventDefault();
    const nextAction = actions[nextIndex];
    setReviewedSearchAction(nextAction?.dataset.shortcutSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handleRecipeActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-shortcut-recipe-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    const recipeIndex = Number(nextAction?.dataset.recipeIndex);
    const recipe = Number.isInteger(recipeIndex) ? SHORTCUT_SEARCH_RECIPES[recipeIndex] : undefined;
    if (recipe) setQuery(recipe.query);
    setReviewedRecipeAction(nextAction?.dataset.shortcutRecipeActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  const editFirstShortcut = useCallback(() => {
    if (visibleShortcuts === 0) return;
    if (normalizedQuery && typeof window !== 'undefined') {
      window.sessionStorage.setItem('anchorworks.keymapSearch', query);
      window.sessionStorage.setItem('anchorworks.keymapEditFirst', '1');
    }
    openKeymapEditor();
  }, [normalizedQuery, openKeymapEditor, query, visibleShortcuts]);

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-shortcut-footer-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.shortcutFooterActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  // Escape close — capture phase mirrors HelpCenter/AIPanel pattern so it works
  // even if focus lands inside an interactive child.
  useEscapeClose(open, close);
  useFocusRestore(open);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
    }
  }
  useEffect(() => subscribeKeymap(() => setKeymapTick((n) => n + 1)), []);
  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
    >
      <div
        className="w-[760px] max-w-[95vw] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="shortcuts-dialog-title" className="dialog-title">{t('Keyboard Shortcuts')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-border bg-panel2/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="field-label !mb-0">{t('Shortcut search recipes')}</span>
            <div
              className="flex flex-wrap items-center gap-1"
              role="toolbar"
              aria-label={t('Shortcut search recipe actions')}
              aria-describedby="shortcut-recipe-action-review-status"
              title={t('Use arrow keys to review shortcut search recipes')}
              onKeyDown={handleRecipeActionKeys}
            >
              <span id="shortcut-recipe-action-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedRecipeAction || t('Shortcut search recipe actions')}`}
              </span>
              {SHORTCUT_SEARCH_RECIPES.map((recipe, index) => {
                const active = query === recipe.query;
                return (
                  <button
                    key={recipe.label}
                    type="button"
                    data-shortcut-recipe-action
                    data-shortcut-recipe-action-review={`${t(recipe.label)} · ${t(recipe.title)}`}
                    data-recipe-index={index}
                    className={`btn !py-1 !px-2 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                    onClick={() => { setReviewIndex(0); setQuery(recipe.query); searchRef.current?.focus(); }}
                    onFocus={(event) => setReviewedRecipeAction(event.currentTarget.dataset.shortcutRecipeActionReview ?? '')}
                    aria-pressed={active}
                    title={t(recipe.title)}
                  >
                    {t(recipe.label)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2 border-b border-border bg-panel2/60">
          <div className="input-num flex items-center gap-1.5 px-2 py-1 flex-1 min-w-0 focus-within:border-accent2">
            <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              className="flex-1 min-w-0 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70"
              placeholder={t('Search shortcuts…')}
              value={query}
              onChange={(event) => { setReviewIndex(0); setQuery(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && visibleShortcuts > 0) {
                  event.preventDefault();
                  editFirstShortcut();
                  return;
                }
                if (event.key === 'ArrowDown' && visibleShortcuts > 0) {
                  event.preventDefault();
                  focusShortcutCard(0);
                  return;
                }
                if (event.key === 'Escape' && query) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery('');
                }
              }}
              aria-label={t('Search shortcuts…')}
              title={`${t('Press Enter to edit first search result')} · ${t('Press Arrow Down to focus first shortcut')}`}
            />
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
            <span>{normalizedQuery ? `${visibleShortcuts} / ${totalShortcuts} ${t('matches')}` : `${totalShortcuts} ${t('shortcuts')}`}</span>
            {query && (
              <div
                className="flex items-center gap-2"
                role="toolbar"
                aria-label={t('Shortcut search actions')}
                aria-describedby="shortcut-search-action-review-status"
                title={t('Use arrow keys to review shortcut search actions')}
                onKeyDown={handleSearchActionKeys}
              >
                <span id="shortcut-search-action-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedSearchAction || t('Shortcut search actions')}`}
                </span>
                {visibleShortcuts > 0 && (
                  <button
                    type="button"
                    className="hover:text-ink underline-offset-2 hover:underline transition-colors"
                    data-shortcut-search-action
                    data-shortcut-search-action-review={t('Edit first search result')}
                    onFocus={() => setReviewedSearchAction(t('Edit first search result'))}
                    onClick={editFirstShortcut}
                    title={t('Edit first search result')}
                  >
                    {t('Edit First')}
                  </button>
                )}
                <button
                  type="button"
                  className="hover:text-ink underline-offset-2 hover:underline transition-colors"
                  data-shortcut-search-action
                  data-shortcut-search-action-review={t('Clear search')}
                  onFocus={() => setReviewedSearchAction(t('Clear search'))}
                  onClick={() => {
                    setReviewIndex(0);
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  title={t('Clear search')}
                >
                  {t('Clear search')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div id="shortcut-review-status" className="sr-only" aria-live="polite">
          {visibleShortcutItems[currentReviewIndex]
            ? `${t('Reviewing')} ${t(visibleShortcutItems[currentReviewIndex].labelKey)} ${currentReviewIndex + 1} / ${visibleShortcuts}. ${t('Press Enter to edit first search result')}`
            : t('No shortcuts found.')}
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 p-4 md:p-5 max-h-[70vh] overflow-y-auto"
          role="listbox"
          aria-label={t('Shortcut results')}
          aria-describedby="shortcut-review-status"
          title={t('Use arrow keys to review shortcuts')}
          onKeyDown={handleShortcutGridKeys}
        >
          {columns.length > 0 ? (
            columns.map((column, columnIndex) => {
              const startIndex = columns.slice(0, columnIndex).reduce((sum, item) => sum + item.items.length, 0);
              return <Column key={column.title} title={column.title} items={column.items} startIndex={startIndex} currentReviewIndex={currentReviewIndex} onReview={setReviewIndex} firstShortcutRef={columnIndex === 0 ? firstShortcutRef : undefined} />;
            })
          ) : (
            <div className="sm:col-span-2 md:col-span-3 flex flex-col items-center justify-center text-center py-8">
              <div className="text-xs text-ink/90 mb-1">{t('No shortcuts found.')}</div>
              <div className="type-caption leading-relaxed max-w-[260px]">
                {t('Try a shorter or different keyword.')}
              </div>
              {query && (
                <button
                  type="button"
                  className="btn !py-1 !px-2 text-[10px] mt-2"
                  onClick={() => { setReviewIndex(0); setQuery(''); searchRef.current?.focus(); }}
                >
                  {t('Clear search')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 border-t border-border bg-panel2 text-[10px] text-muted">
          <span className="text-center sm:text-left">
            {t('Press')} <kbd className="kbd-inline">?</kbd> {t('anytime to open this dialog.')}
          </span>
          <div
            role="toolbar"
            aria-label={t('Keyboard Shortcuts actions')}
            aria-describedby="shortcut-footer-action-review-status"
            title={t('Use arrow keys to review dialog actions')}
            onKeyDown={handleFooterActionKeys}
          >
            <span id="shortcut-footer-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedFooterAction || t('Keyboard Shortcuts actions')}`}
            </span>
            <button
              type="button"
              data-shortcut-footer-action
              data-shortcut-footer-action-review={t('Close')}
              className="btn !py-1 !px-2 !text-[10px]"
              onFocus={() => setReviewedFooterAction(t('Close'))}
              onClick={close}
            >
              {t('Close')}
            </button>
            <button
              type="button"
              data-shortcut-footer-action
              data-shortcut-footer-action-review={t('Customize Shortcuts…')}
              className="btn !py-1 !px-2 !text-[10px]"
              onFocus={() => setReviewedFooterAction(t('Customize Shortcuts…'))}
              onClick={openKeymapEditor}
            >
              {t('Customize Shortcuts…')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({
  title,
  items,
  startIndex,
  currentReviewIndex,
  onReview,
  firstShortcutRef,
}: {
  title: string;
  items: Shortcut[];
  startIndex: number;
  currentReviewIndex: number;
  onReview: (index: number) => void;
  firstShortcutRef?: React.Ref<HTMLDivElement>;
}) {
  const t = useT();
  return (
    <div>
      <h3 className="field-label mb-2 font-semibold">{title}</h3>
      <div className="space-y-1">
        {items.map((it, index) => {
          const absoluteIndex = startIndex + index;
          const selected = absoluteIndex === currentReviewIndex;
          return (
            <div
              key={it.labelKey + shortcutKeys(it)}
              ref={index === 0 ? firstShortcutRef : undefined}
              tabIndex={0}
              role="option"
              aria-selected={selected}
              data-shortcut-index={absoluteIndex}
              onFocus={() => onReview(absoluteIndex)}
              className={`flex items-center justify-between gap-3 text-sm py-1 px-2 rounded hover:bg-panel3/50 focus-visible:bg-panel3/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent2/70 transition-colors ${selected ? 'bg-accent2/10 ring-1 ring-accent2/40' : ''}`}
            >
              <span className="text-ink/90 min-w-0 truncate">{t(it.labelKey)}</span>
              <kbd className="shrink-0 px-2 py-0.5 rounded bg-panel3 border border-border text-[11px] font-mono text-ink">{shortcutKeys(it)}</kbd>
            </div>
          );
        })}
      </div>
    </div>
  );
}
