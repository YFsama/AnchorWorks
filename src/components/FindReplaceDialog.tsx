import { useCallback, useRef, useState } from 'react';
import { X, Search, ArrowUpDown } from 'lucide-react';
import { useEditor } from '../store/editor';
import { replaceAllText, countTextMatches } from '../lib/findReplace';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const FIND_REPLACE_RECIPES: Array<{ label: string; find: string; replace: string; matchCase: boolean; title: string }> = [
  { label: 'Double spaces', find: '  ', replace: ' ', matchCase: false, title: 'Collapse accidental double spaces in imported copy.' },
  { label: 'Dash cleanup', find: '--', replace: '—', matchCase: false, title: 'Convert double hyphens into an em dash.' },
  { label: 'Number token', find: '###', replace: '001', matchCase: false, title: 'Replace serial placeholders with a starting number.' },
  { label: 'Brand mark', find: '(tm)', replace: '™', matchCase: false, title: 'Convert typed trademark markers into the symbol.' },
];

/**
 * Find & Replace (Illustrator Edit→Find and Replace) — replace every occurrence
 * of a string across all text objects on the canvas, with a case-sensitive
 * toggle and a live match count.
 */
export function FindReplaceDialog() {
  const t = useT();
  const open = useEditor(s => s.showFindReplace);
  const close = useCallback(() => useEditor.getState().setModal('showFindReplace', false), []);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [focusedRecipeIndex, setFocusedRecipeIndex] = useState(0);
  const [reviewedFieldAction, setReviewedFieldAction] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const matches = find ? countTextMatches(find, matchCase) : 0;
  const focusedRecipe = FIND_REPLACE_RECIPES[focusedRecipeIndex] ?? FIND_REPLACE_RECIPES[0];

  const clearFields = () => {
    setFind('');
    setReplace('');
  };

  const swapFields = () => {
    setFind(replace);
    setReplace(find);
  };

  const resetFields = () => {
    setFind('');
    setReplace('');
    setMatchCase(false);
    setFocusedRecipeIndex(0);
    setReviewedFieldAction('');
    setReviewedFooterAction(t('Reset'));
    findRef.current?.focus();
  };

  const applyRecipe = (recipe: { find: string; replace: string; matchCase: boolean }) => {
    setFind(recipe.find);
    setReplace(recipe.replace);
    setMatchCase(recipe.matchCase);
  };

  const apply = () => {
    if (!find) return;
    const n = replaceAllText(find, replace, matchCase);
    if (n > 0) toast.success(`${n} ${t('replacements made')}`, { title: t('Find & Replace') });
    else toast.warn(t('No matches found.'), { title: t('Find & Replace') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-find-replace-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.findReplaceActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  const handleFieldActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-find-replace-field-action]'))
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
    setReviewedFieldAction(nextAction?.dataset.findReplaceFieldActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handleRecipeActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-find-replace-recipe-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const recipeIndex = Number(actions[nextIndex]?.dataset.recipeIndex);
    const recipe = Number.isInteger(recipeIndex) ? FIND_REPLACE_RECIPES[recipeIndex] : undefined;
    if (recipe) {
      setFocusedRecipeIndex(recipeIndex);
      applyRecipe(recipe);
    }
    actions[nextIndex]?.focus();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="findreplace-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[340px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="findreplace-title" className="dialog-title flex items-center gap-2">
            <Search size={14} aria-hidden="true" /> {t('Find & Replace')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label">{t('Find')}</div>
          <input
            ref={findRef}
            type="text"
            autoFocus
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && find) { e.preventDefault(); apply(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); replaceRef.current?.focus(); replaceRef.current?.select(); }
            }}
            className="input-num w-full"
            aria-label={t('Find')}
            title={`${t('Press Enter to replace all matches')} · ${t('Press Arrow Down to focus Replace')}`}
          />
        </label>
        <label className="block mb-2">
          <div className="field-label">{t('Replace with')}</div>
          <input
            ref={replaceRef}
            type="text"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && find) { e.preventDefault(); apply(); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); findRef.current?.focus(); findRef.current?.select(); }
            }}
            className="input-num w-full"
            aria-label={t('Replace with')}
            title={`${t('Press Enter to replace all matches')} · ${t('Press Arrow Up to focus Find')}`}
          />
        </label>

        <div className="flex items-center justify-between mt-1">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            <span>{t('Match case')}</span>
          </label>
          <span className="text-xs text-muted tabular-nums" aria-live="polite">{find ? `${matches} ${t('matches')}` : ''}</span>
        </div>

        <div className="mt-3">
          <div className="field-label !mb-1">{t('Find replace recipes')}</div>
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Find replace recipe actions')}
            aria-describedby="find-replace-recipe-review-status"
            title={t('Use arrow keys to review find replace recipes')}
            onKeyDown={handleRecipeActionKeys}
          >
            <div id="find-replace-recipe-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${t(focusedRecipe.label)} ${focusedRecipeIndex + 1} / ${FIND_REPLACE_RECIPES.length}. ${t(focusedRecipe.title)}`}
            </div>
            {FIND_REPLACE_RECIPES.map((recipe, index) => {
              const active = find === recipe.find && replace === recipe.replace && matchCase === recipe.matchCase;
              return (
                <button
                  key={recipe.label}
                  type="button"
                  data-find-replace-recipe-action
                  data-recipe-index={index}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onFocus={() => setFocusedRecipeIndex(index)}
                  onClick={() => { setFocusedRecipeIndex(index); applyRecipe(recipe); }}
                  aria-pressed={active}
                  title={t(recipe.title)}
                >
                  {t(recipe.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label={t('Find & Replace field actions')}
          aria-describedby="find-replace-field-action-review-status"
          title={t('Use arrow keys to review find and replace field actions')}
          onKeyDown={handleFieldActionKeys}
        >
          <span id="find-replace-field-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFieldAction || t('Find & Replace field actions')}`}
          </span>
          <button type="button" data-find-replace-field-action data-find-replace-field-action-review={t('Clear fields')} onFocus={() => setReviewedFieldAction(t('Clear fields'))} className="btn flex items-center gap-1" disabled={!find && !replace} onClick={clearFields}>
            <X size={12} aria-hidden="true" /> {t('Clear fields')}
          </button>
          <button type="button" data-find-replace-field-action data-find-replace-field-action-review={t('Swap find/replace')} onFocus={() => setReviewedFieldAction(t('Swap find/replace'))} className="btn flex items-center gap-1" disabled={!find && !replace} onClick={swapFields}>
            <ArrowUpDown size={12} aria-hidden="true" /> {t('Swap find/replace')}
          </button>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Find & Replace actions')}
          aria-describedby="find-replace-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="find-replace-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Find & Replace actions')}`}
          </span>
          <button type="button" data-find-replace-action data-find-replace-action-review={t('Cancel')} onFocus={() => setReviewedFooterAction(t('Cancel'))} className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" data-find-replace-action data-find-replace-action-review={t('Reset')} onFocus={() => setReviewedFooterAction(t('Reset'))} className="btn" onClick={resetFields}>{t('Reset')}</button>
          <button type="button" data-find-replace-action data-find-replace-action-review={t('Replace All')} onFocus={() => setReviewedFooterAction(t('Replace All'))} className="btn-primary" disabled={!find} onClick={apply}>{t('Replace All')}</button>
        </div>
      </div>
    </div>
  );
}
