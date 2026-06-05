import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store/editor';
import { TEMPLATES, type Template } from '../lib/templates';
import { getCanvas } from '../lib/canvasEngine';
import { Search, X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { logger } from '../lib/debug';

const TEMPLATE_CATEGORIES = ['All', 'Business', 'Social', 'Logo', 'Print', 'Stickers'] as const;
type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

export function TemplatesDialog() {
  const t = useT();
  const open = useEditor((s) => s.showTemplates);
  const setModal = useEditor((s) => s.setModal);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('All');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedSearchAction, setReviewedSearchAction] = useState('');
  const [reviewedCategoryAction, setReviewedCategoryAction] = useState('');
  const [reviewedEmptyAction, setReviewedEmptyAction] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstTemplateRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setModal('showTemplates', false), [setModal]);

  // Escape close — capture phase, consistent with the rest of the dialog system.
  useEscapeClose(open, close);
  useFocusRestore(open);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const categoryTemplates = useMemo(() => (category === 'All'
    ? TEMPLATES
    : TEMPLATES.filter((template) => template.category === category)), [category]);
  const filteredTemplates = useMemo(() => {
    if (!normalizedQuery) return categoryTemplates;
    return categoryTemplates.filter((template) => [
      template.name,
      t(template.name),
      template.description,
      t(template.description),
      template.category,
      t(template.category),
      template.id,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [categoryTemplates, normalizedQuery, t]);
  const resultSummary = normalizedQuery
    ? `${filteredTemplates.length} / ${categoryTemplates.length} ${t('matches')}`
    : category === 'All'
      ? `${TEMPLATES.length} ${t('templates')}`
      : `${categoryTemplates.length} ${t('templates')} · ${t(category)}`;

  const currentReviewIndex = Math.min(reviewIndex, Math.max(0, filteredTemplates.length - 1));

  if (!open) return null;

  const pick = async (tpl: Template) => {
    const c = getCanvas();
    if (!c) { close(); return; }
    try {
      await tpl.build(c);
    } catch (err) {
      logger.error('templates', `build failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    close();
  };

  const focusTemplateTile = (index: number) => {
    setReviewIndex(index);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-template-index="${index}"]`)?.focus();
    });
  };

  const handleTemplateGridKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const activeIndex = Number((document.activeElement as HTMLElement | null)?.dataset.templateIndex ?? 0);
    const lastIndex = filteredTemplates.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : Math.max(0, Math.min(lastIndex, activeIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 3 : -3)));
    focusTemplateTile(nextIndex);
  };
  const handleSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-template-search-action]'))
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
    setReviewedSearchAction(nextAction?.dataset.templateSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  const handleCategoryActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-template-category-action]'));
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
    const nextCategory = nextAction?.dataset.templateCategory as TemplateCategory | undefined;
    if (nextCategory) {
      setCategory(nextCategory);
      setReviewIndex(0);
    }
    setReviewedCategoryAction(nextAction?.dataset.templateCategoryReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  const handleEmptyActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-template-empty-action]'));
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
    setReviewedEmptyAction(nextAction?.dataset.templateEmptyActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  const clearTemplateFilters = () => {
    setQuery('');
    setCategory('All');
    setReviewIndex(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="templates-dialog-title"
    >
      <div
        className="bg-panel border border-border rounded-lg shadow-2xl w-[760px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="templates-dialog-title" className="dialog-title">{t('New from Template')}</h2>
          <button className="btn-dialog-close" onClick={close} aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-border bg-panel/80">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-muted shrink-0" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              className="input text-sm min-w-0 flex-1"
              placeholder={t('Search templates…')}
              value={query}
              onChange={(event) => { setReviewIndex(0); setQuery(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && filteredTemplates[0]) {
                  event.preventDefault();
                  void pick(filteredTemplates[0]);
                  return;
                }
                if (event.key === 'ArrowDown' && filteredTemplates[0]) {
                  event.preventDefault();
                  setReviewIndex(0);
                  firstTemplateRef.current?.focus();
                  return;
                }
                if (event.key === 'Escape' && query) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery('');
                }
              }}
              aria-label={t('Search templates…')}
              title={`${t('Press Enter to use first search result')} · ${t('Press Arrow Down to focus first template')}`}
            />
            <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
              {resultSummary}
            </span>
            {query && (
              <div
                className="flex items-center gap-2 shrink-0"
                role="toolbar"
                aria-label={t('Template search actions')}
                aria-describedby="template-search-action-review-status"
                title={t('Use arrow keys to review template search actions')}
                onKeyDown={handleSearchActionKeys}
              >
                <span id="template-search-action-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedSearchAction || t('Template search actions')}`}
                </span>
                <button
                  type="button"
                  className="btn !py-1.5 !px-2 text-xs shrink-0"
                  data-template-search-action
                  data-template-search-action-review={t('Use first search result')}
                  onFocus={() => setReviewedSearchAction(t('Use first search result'))}
                  onClick={() => { if (filteredTemplates[0]) void pick(filteredTemplates[0]); }}
                  disabled={filteredTemplates.length === 0}
                  title={t('Use first search result')}
                >
                  {t('Use First')}
                </button>
                <button
                  type="button"
                  className="btn !py-1.5 !px-2 text-xs shrink-0"
                  data-template-search-action
                  data-template-search-action-review={t('Clear search')}
                  onFocus={() => setReviewedSearchAction(t('Clear search'))}
                  onClick={() => setQuery('')}
                  title={t('Clear search')}
                >
                  {t('Clear search')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-2.5 border-b border-border bg-panel2/50">
          <div
            className="flex flex-wrap items-center gap-2"
            role="toolbar"
            aria-label={t('Template category filters')}
            aria-describedby="template-category-action-review-status"
            title={t('Use arrow keys to review template categories')}
            onKeyDown={handleCategoryActionKeys}
          >
            <span id="template-category-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedCategoryAction || t('Template category filters')}`}
            </span>
            {TEMPLATE_CATEGORIES.map((categoryName) => {
              const count = categoryName === 'All'
                ? TEMPLATES.length
                : TEMPLATES.filter((template) => template.category === categoryName).length;
              const active = category === categoryName;
              const review = `${t(categoryName)} ${count} ${t('templates')}`;
              return (
                <button
                  key={categoryName}
                  type="button"
                  className={`btn !py-1 !px-2 text-xs ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  data-template-category-action
                  data-template-category={categoryName}
                  data-template-category-review={review}
                  aria-pressed={active}
                  onFocus={() => setReviewedCategoryAction(review)}
                  onClick={() => { setCategory(categoryName); setReviewIndex(0); }}
                  title={review}
                >
                  {t(categoryName)} <span className="text-muted tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-5 overflow-y-auto">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center text-center px-4 py-8">
              <div className="text-sm text-ink/90 mb-1">{t('No templates found.')}</div>
              <div className="type-caption leading-relaxed max-w-[280px]">
                {t('Try a template name, size, purpose, or id.')}
              </div>
              {(query || category !== 'All') && (
                <div
                  className="flex items-center justify-center gap-2 mt-4"
                  role="toolbar"
                  aria-label={t('Template empty-result actions')}
                  aria-describedby="template-empty-action-review-status"
                  title={t('Use arrow keys to review empty-result actions')}
                  onKeyDown={handleEmptyActionKeys}
                >
                  <span id="template-empty-action-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedEmptyAction || t('Template empty-result actions')}`}
                  </span>
                  {query && (
                    <button
                      type="button"
                      className="btn !py-1.5 !px-2 text-xs"
                      data-template-empty-action
                      data-template-empty-action-review={t('Clear search')}
                      onFocus={() => setReviewedEmptyAction(t('Clear search'))}
                      onClick={() => { setQuery(''); setReviewIndex(0); searchRef.current?.focus(); }}
                    >
                      {t('Clear search')}
                    </button>
                  )}
                  {category !== 'All' && (
                    <button
                      type="button"
                      className="btn !py-1.5 !px-2 text-xs"
                      data-template-empty-action
                      data-template-empty-action-review={t('Show all categories')}
                      onFocus={() => setReviewedEmptyAction(t('Show all categories'))}
                      onClick={() => { setCategory('All'); setReviewIndex(0); }}
                    >
                      {t('Show all categories')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-2 text-xs"
                    data-template-empty-action
                    data-template-empty-action-review={t('Reset template filters')}
                    onFocus={() => setReviewedEmptyAction(t('Reset template filters'))}
                    onClick={clearTemplateFilters}
                  >
                    {t('Reset filters')}
                  </button>
                </div>
              )}
            </div>
          ) : (
          <>
            <div id="template-grid-review-status" className="sr-only" aria-live="polite">
              {filteredTemplates[currentReviewIndex]
                ? `${t('Reviewing')} ${t(filteredTemplates[currentReviewIndex].name)} ${currentReviewIndex + 1} / ${filteredTemplates.length}. ${t('Press Enter to use template')}`
                : t('No templates found.')}
            </div>
            <div
              className="grid grid-cols-3 gap-4"
              role="grid"
              aria-label={t('Template results')}
              title={t('Use arrow keys to review templates')}
              onKeyDown={handleTemplateGridKeys}
              aria-describedby="template-grid-review-status"
            >
              {filteredTemplates.map((tpl, index) => (
              <button
                key={tpl.id}
                ref={index === 0 ? firstTemplateRef : undefined}
                role="gridcell"
                data-template-index={index}
                aria-selected={index === currentReviewIndex}
                onFocus={() => setReviewIndex(index)}
                onClick={() => pick(tpl)}
                title={`${t(tpl.name)} — ${t('Press Enter to use template')}`}
                className={`text-left bg-panel2 border rounded-lg overflow-hidden hover:border-accent2 hover:shadow-md focus:border-accent2 focus:ring-1 focus:ring-accent2/60 outline-none transition-all group ${index === currentReviewIndex ? 'border-accent2 shadow-md ring-1 ring-accent2/40' : 'border-border'}`}
              >
                <div className="aspect-[4/3] bg-white flex items-center justify-center overflow-hidden">
                  <img
                    src={tpl.thumbnail}
                    alt={t(tpl.name)}
                    draggable={false}
                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                  />
                </div>
                <div className="p-3">
                  {/* Each tile is effectively a subsection under the dialog's
                   * <h2 className="dialog-title"> "Templates" heading.
                   * Promoting to <h4> gives the heading-outline tree a real
                   * branch ("Templates → A4 Poster") rather than a flat list
                   * of pseudo-headings. Inheriting the same visual styles
                   * via class so the design is unchanged. */}
                  <h4 className="text-ink text-xs font-semibold mb-0.5">{t(tpl.name)}</h4>
                  <div className="text-muted text-[10px] leading-snug">{t(tpl.description)}</div>
                </div>
              </button>
              ))}
            </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
