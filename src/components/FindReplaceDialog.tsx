import { useCallback, useRef, useState } from 'react';
import { X, Search, ArrowUpDown } from 'lucide-react';
import { useEditor } from '../store/editor';
import { replaceAllText, countTextMatches } from '../lib/findReplace';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

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
  // The recipe region announces index-derived composite text, so its review
  // state carries the focused recipe index (as a string; '' = index 0).
  const [reviewedRecipeIndex, setReviewedRecipeIndex] = useReviewedAction();
  const [reviewedFieldAction, setReviewedFieldAction] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const matches = find ? countTextMatches(find, matchCase) : 0;
  const recipeIndex = Number(reviewedRecipeIndex);
  const focusedRecipeIndex = recipeIndex >= 0 && recipeIndex < FIND_REPLACE_RECIPES.length ? recipeIndex : 0;
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
    setReviewedRecipeIndex('');
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

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-find-replace-action]',
    reviewKey: actionReviewKey('data-find-replace-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handleFieldActionKeys = makeRovingKeys({
    selector: '[data-find-replace-field-action]',
    reviewKey: actionReviewKey('data-find-replace-field-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedFieldAction,
  });

  const handleRecipeActionKeys = makeRovingKeys({
    selector: '[data-find-replace-recipe-action]',
    reviewKey: 'recipeIndex',
    setReview: setReviewedRecipeIndex,
    onNavigate: (button) => {
      const recipeIndex = Number(button?.dataset.recipeIndex);
      const recipe = Number.isInteger(recipeIndex) ? FIND_REPLACE_RECIPES[recipeIndex] : undefined;
      if (recipe) applyRecipe(recipe);
    },
  });

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
          <PresetRow
            statusId="find-replace-recipe-review-status"
            className="grid grid-cols-2 gap-1"
            label={t('Find replace recipe actions')}
            title={t('Use arrow keys to review find replace recipes')}
            onKeyDown={handleRecipeActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedRecipeIndex}
            fallback={t('Find replace recipes')}
            statusContent={({ reviewingLabel }) => `${reviewingLabel} ${t(focusedRecipe.label)} ${focusedRecipeIndex + 1} / ${FIND_REPLACE_RECIPES.length}. ${t(focusedRecipe.title)}`}
            actionAttr="data-find-replace-recipe-action"
            setReviewed={setReviewedRecipeIndex}
            items={FIND_REPLACE_RECIPES.map((recipe, index) => {
              const active = find === recipe.find && replace === recipe.replace && matchCase === recipe.matchCase;
              return {
                key: recipe.label,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                pressed: active,
                onClick: () => { setReviewedRecipeIndex(String(index)); applyRecipe(recipe); },
                title: t(recipe.title),
                focusReviewKey: 'recipeIndex',
                data: { 'recipe-index': index },
                children: t(recipe.label),
              };
            })}
          />
        </div>

        <ReviewedFooter
          statusId="find-replace-field-action-review-status"
          className="mt-3 flex flex-wrap items-center gap-2"
          label={t('Find & Replace field actions')}
          title={t('Use arrow keys to review find and replace field actions')}
          onKeyDown={handleFieldActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFieldAction}
          fallback={t('Find & Replace field actions')}
          actionAttr="data-find-replace-field-action"
          setReviewed={setReviewedFieldAction}
          actions={[
            { children: <><X size={12} aria-hidden="true" /> {t('Clear fields')}</>, review: t('Clear fields'), className: 'btn flex items-center gap-1', onClick: clearFields, disabled: !find && !replace },
            { children: <><ArrowUpDown size={12} aria-hidden="true" /> {t('Swap find/replace')}</>, review: t('Swap find/replace'), className: 'btn flex items-center gap-1', onClick: swapFields, disabled: !find && !replace },
          ]}
        />

        <ReviewedFooter
          statusId="find-replace-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Find & Replace actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Find & Replace actions')}
          actionAttr="data-find-replace-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset'), className: 'btn', onClick: resetFields },
            { children: t('Replace All'), review: t('Replace All'), className: 'btn-primary', onClick: apply, disabled: !find },
          ]}
        />
      </div>
    </div>
  );
}
