import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { RotateCcw, Printer } from 'lucide-react';
import { ActionToolbar } from '../ActionToolbar';
import { PresetRow } from '../PresetRow';
import { ReviewedFooter } from '../ReviewedFooter';
import { SearchableListActions } from '../SearchableListActions';
import { useReviewedAction } from '../useRovingActions';

/**
 * DOM-equivalence suite for the house dialog kit — batch A extensions.
 *
 * The six pilot dialogs are covered by dialogKitEquivalence.test.tsx (frozen).
 * This file pins the NEW kit usage shapes uncovered while migrating the 24
 * batch-A chip-preset dialogs:
 *
 * - ShearDialog: preset row whose buttons carry a per-button `title` and a
 *   numeric `data-angle` value attribute (attribute order preserved exactly).
 * - SingleLineTextDialog: an ActionToolbar rendering its own children so one
 *   footer button can be `disabled` (ReviewedFooter has no disabled variant).
 * - SplitGridDialog: recipe preset row with a state-dependent fallback and
 *   ordered numeric data attributes (rows/cols/gutter/review).
 * - RepeatDialog: a preset row rendered inside a tab panel (tabpanel child).
 * - CutContourDialog: preset row announcing from a custom
 *   `data-cut-preset-review` attribute with rich two-span chips.
 * - TilePrintDialog: page-size search actions (SearchableListActions), a
 *   role="group" preset row driven by a segment handler, and an icon footer.
 *
 * Same two bars as the pilot suite: canonical equality (always) and
 * byte-identical serialization (cases flagged `exact`).
 */

// ---- shared test scaffolding -------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = (s: string) => s;
const onKeys = (_event: ReactKeyboardEvent<HTMLDivElement>) => undefined;
const setReviewed = (_value: string) => undefined;

let host: HTMLDivElement;
let roots: Root[];

function renderElement(element: ReactElement): Element {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  const first = container.firstElementChild;
  expect(first, `rendered nothing for ${element.type}`).toBeTruthy();
  return first!;
}

function canonical(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `#${JSON.stringify(node.textContent)}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const attrs = Array.from(el.attributes)
    .map((attr) => `${attr.name}=${JSON.stringify(attr.value)}`)
    .sort()
    .join(' ');
  const kids = Array.from(el.childNodes).map(canonical).join('');
  return `<${el.tagName.toLowerCase()} ${attrs}>${kids}</${el.tagName.toLowerCase()}>`;
}

interface DiffCase {
  name: string;
  legacy: ReactElement;
  kit: ReactElement;
  /** outerHTML is also required to match character-for-character */
  exact: boolean;
}

const cases: DiffCase[] = [];

function assertEquivalent(testCase: DiffCase) {
  it(`${testCase.name} — kit DOM equals legacy DOM`, () => {
    const legacy = renderElement(testCase.legacy);
    const kit = renderElement(testCase.kit);
    expect(canonical(kit), `canonical DOM differs for ${testCase.name}`).toBe(canonical(legacy));
    if (testCase.exact) {
      expect(kit.outerHTML, `serialized DOM differs for ${testCase.name}`).toBe(legacy.outerHTML);
    }
  });
}

// ---- ShearDialog ---------------------------------------------------------------

const SHEAR_ANGLE_PRESETS = [-30, -15, 0, 15, 30] as const;

function LegacyShearAnglePreset(props: { angle: number; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-5 gap-1"
      role="toolbar"
      aria-label={t('Shear angle preset actions')}
      aria-describedby="shear-angle-preset-review-status"
      title={t('Use arrow keys to review shear angle presets')}
      onKeyDown={onKeys}
    >
      <div id="shear-angle-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Shear angle presets')}`}
      </div>
      {SHEAR_ANGLE_PRESETS.map((preset) => {
        const review = `${t('Shear angle')} ${preset > 0 ? '+' : ''}${preset}°`;
        return (
          <button
            key={preset}
            type="button"
            data-shear-angle-preset-action
            data-angle={preset}
            data-review={review}
            className={`btn !py-1 !px-1 !text-[10px] ${props.angle === preset ? 'ring-1 ring-accent' : ''}`}
            onClick={() => undefined}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            aria-pressed={props.angle === preset}
            title={`${t('Set shear angle to')} ${preset > 0 ? '+' : ''}${preset}°`}
          >
            {preset > 0 ? '+' : ''}{preset}°
          </button>
        );
      })}
    </div>
  );
}

function KitShearAnglePreset(props: { angle: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="shear-angle-preset-review-status"
      className="grid grid-cols-5 gap-1"
      label={t('Shear angle preset actions')}
      title={t('Use arrow keys to review shear angle presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Shear angle presets')}
      actionAttr="data-shear-angle-preset-action"
      setReviewed={setReviewed}
      items={SHEAR_ANGLE_PRESETS.map((preset) => ({
        key: preset,
        className: `btn !py-1 !px-1 !text-[10px] ${props.angle === preset ? 'ring-1 ring-accent' : ''}`,
        pressed: props.angle === preset,
        onClick: () => undefined,
        title: `${t('Set shear angle to')} ${preset > 0 ? '+' : ''}${preset}°`,
        data: { angle: preset, review: `${t('Shear angle')} ${preset > 0 ? '+' : ''}${preset}°` },
        children: <>{preset > 0 ? '+' : ''}{preset}°</>,
      }))}
    />
  );
}

cases.push(
  { name: 'ShearDialog angle preset toolbar (per-button title + numeric data attr)', legacy: <LegacyShearAnglePreset angle={15} reviewed="" />, kit: <KitShearAnglePreset angle={15} reviewed="" />, exact: true },
  { name: 'ShearDialog angle preset toolbar (reviewed announcement)', legacy: <LegacyShearAnglePreset angle={0} reviewed="Shear angle -15°" />, kit: <KitShearAnglePreset angle={0} reviewed="Shear angle -15°" />, exact: true },
);

// ---- SingleLineTextDialog ------------------------------------------------------

function LegacySingleLineFieldActions(props: { reviewed: string; hasText: boolean }) {
  return (
    <div
      className="grid grid-cols-2 gap-1 mt-3"
      role="toolbar"
      aria-label={t('Single-line Text field actions')}
      aria-describedby="single-line-field-action-review-status"
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
    >
      <span id="single-line-field-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Single-line Text field actions')}`}
      </span>
      <button type="button" data-single-line-action data-single-line-action-review={t('Reset fields')} onFocus={() => setReviewed(t('Reset fields'))} className="btn !py-1 !text-[10px]" onClick={() => undefined}>{t('Reset fields')}</button>
      <button type="button" data-single-line-action data-single-line-action-review={t('Clear text')} onFocus={() => setReviewed(t('Clear text'))} className="btn !py-1 !text-[10px]" onClick={() => undefined} disabled={!props.hasText}>{t('Clear text')}</button>
    </div>
  );
}

function KitSingleLineFieldActions(props: { reviewed: string; hasText: boolean }) {
  return (
    <ActionToolbar
      statusId="single-line-field-action-review-status"
      className="grid grid-cols-2 gap-1 mt-3"
      label={t('Single-line Text field actions')}
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Single-line Text field actions')}
      statusAs="span"
    >
      <button type="button" data-single-line-action data-single-line-action-review={t('Reset fields')} onFocus={() => setReviewed(t('Reset fields'))} className="btn !py-1 !text-[10px]" onClick={() => undefined}>{t('Reset fields')}</button>
      <button type="button" data-single-line-action data-single-line-action-review={t('Clear text')} onFocus={() => setReviewed(t('Clear text'))} className="btn !py-1 !text-[10px]" onClick={() => undefined} disabled={!props.hasText}>{t('Clear text')}</button>
    </ActionToolbar>
  );
}

cases.push(
  { name: 'SingleLineTextDialog field actions (toolbar with a disabled button)', legacy: <LegacySingleLineFieldActions reviewed="" hasText />, kit: <KitSingleLineFieldActions reviewed="" hasText />, exact: true },
  { name: 'SingleLineTextDialog field actions (Clear text disabled)', legacy: <LegacySingleLineFieldActions reviewed="" hasText={false} />, kit: <KitSingleLineFieldActions reviewed="" hasText={false} />, exact: true },
);

// ---- SplitGridDialog -----------------------------------------------------------

const GRID_RECIPE_PRESETS = [
  { label: 'Sticker sheet', rows: 3, cols: 3, gutter: 2, title: '3×3 cells with a light kiss-cut gap.' },
  { label: 'Yard sign', rows: 1, cols: 2, gutter: 5, title: 'Two horizontal panels with assembly space.' },
  { label: 'Banner panels', rows: 1, cols: 3, gutter: 10, title: 'Three wide panels with larger sewing or overlap gaps.' },
  { label: 'Tile proof', rows: 2, cols: 2, gutter: 0, title: 'Four no-gap proof panels.' },
];

function LegacySplitGridRecipe(props: { rows: number; cols: number; gutter: number; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-2 gap-1"
      role="toolbar"
      aria-label={t('Split grid recipe actions')}
      aria-describedby="split-grid-recipe-review-status"
      title={t('Use arrow keys to review split grid recipes')}
      onKeyDown={onKeys}
    >
      <div id="split-grid-recipe-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || `${props.rows} ${t('Rows')} × ${props.cols} ${t('Columns')}, ${props.gutter.toFixed(1)} ${t('Gutter (mm)')}`}`}
      </div>
      {GRID_RECIPE_PRESETS.map((preset) => {
        const review = `${t(preset.label)} · ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')} · ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}`;
        return (
          <button
            key={preset.label}
            type="button"
            data-split-grid-preset-action
            data-rows={preset.rows}
            data-cols={preset.cols}
            data-gutter={preset.gutter}
            data-review={review}
            className={`btn !py-1 !px-1 !text-[10px] ${props.rows === preset.rows && props.cols === preset.cols ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            onClick={() => undefined}
            aria-pressed={props.rows === preset.rows && props.cols === preset.cols}
            title={`${t(preset.title)} ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}, ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}`}
          >
            {t(preset.label)}
          </button>
        );
      })}
    </div>
  );
}

function KitSplitGridRecipe(props: { rows: number; cols: number; gutter: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="split-grid-recipe-review-status"
      className="grid grid-cols-2 gap-1"
      label={t('Split grid recipe actions')}
      title={t('Use arrow keys to review split grid recipes')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={`${props.rows} ${t('Rows')} × ${props.cols} ${t('Columns')}, ${props.gutter.toFixed(1)} ${t('Gutter (mm)')}`}
      actionAttr="data-split-grid-preset-action"
      setReviewed={setReviewed}
      items={GRID_RECIPE_PRESETS.map((preset) => ({
        key: preset.label,
        className: `btn !py-1 !px-1 !text-[10px] ${props.rows === preset.rows && props.cols === preset.cols ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
        pressed: props.rows === preset.rows && props.cols === preset.cols,
        onClick: () => undefined,
        title: `${t(preset.title)} ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')}, ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}`,
        data: { rows: preset.rows, cols: preset.cols, gutter: preset.gutter, review: `${t(preset.label)} · ${preset.rows} ${t('Rows')} × ${preset.cols} ${t('Columns')} · ${preset.gutter.toFixed(1)} ${t('Gutter (mm)')}` },
        children: t(preset.label),
      }))}
    />
  );
}

cases.push({ name: 'SplitGridDialog recipe preset toolbar (state-dependent fallback)', legacy: <LegacySplitGridRecipe rows={3} cols={3} gutter={2} reviewed="" />, kit: <KitSplitGridRecipe rows={3} cols={3} gutter={2} reviewed="" />, exact: false });

// ---- RepeatDialog --------------------------------------------------------------

const GRID_REPEAT_PRESETS = [
  { id: 'two-by-two', label: '2×2 repeat', cols: 2, rows: 2 },
  { id: 'three-by-three', label: '3×3 repeat', cols: 3, rows: 3 },
  { id: 'five-across', label: '5 across', cols: 5, rows: 1 },
  { id: 'five-down', label: '5 down', cols: 1, rows: 5 },
] as const;

function LegacyRepeatGridPreset(props: { cols: number; rows: number; reviewed: string }) {
  return (
    <div id="repeat-tab-panel" role="tabpanel" aria-labelledby="repeat-tab-grid">
      <div
        className="grid grid-cols-4 gap-1"
        role="toolbar"
        aria-label={t('Repeat grid preset actions')}
        aria-describedby="repeat-grid-preset-review-status"
        title={t('Use arrow keys to review repeat grid presets')}
        onKeyDown={onKeys}
      >
        <div id="repeat-grid-preset-review-status" className="sr-only" aria-live="polite">
          {`${t('Reviewing')} ${props.reviewed || t('Repeat grid presets')}`}
        </div>
        {GRID_REPEAT_PRESETS.map((preset) => {
          const review = `${t(preset.label)} · ${t('Cols')} ${preset.cols} · ${t('Rows')} ${preset.rows}`;
          return (
            <button
              key={preset.id}
              type="button"
              data-repeat-grid-preset-action
              data-value={preset.id}
              data-review={review}
              className={`btn !py-1 !px-1 !text-[10px] ${props.cols === preset.cols && props.rows === preset.rows ? 'ring-1 ring-accent' : ''}`}
              onClick={() => undefined}
              onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
              aria-pressed={props.cols === preset.cols && props.rows === preset.rows}
              title={`${t(preset.label)} · ${preset.cols}×${preset.rows}`}
            >
              {t(preset.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KitRepeatGridPreset(props: { cols: number; rows: number; reviewed: string }) {
  return (
    <div id="repeat-tab-panel" role="tabpanel" aria-labelledby="repeat-tab-grid">
      <PresetRow
        statusId="repeat-grid-preset-review-status"
        className="grid grid-cols-4 gap-1"
        label={t('Repeat grid preset actions')}
        title={t('Use arrow keys to review repeat grid presets')}
        onKeyDown={onKeys}
        reviewingLabel={t('Reviewing')}
        reviewed={props.reviewed}
        fallback={t('Repeat grid presets')}
        actionAttr="data-repeat-grid-preset-action"
        setReviewed={setReviewed}
        items={GRID_REPEAT_PRESETS.map((preset) => ({
          key: preset.id,
          className: `btn !py-1 !px-1 !text-[10px] ${props.cols === preset.cols && props.rows === preset.rows ? 'ring-1 ring-accent' : ''}`,
          pressed: props.cols === preset.cols && props.rows === preset.rows,
          onClick: () => undefined,
          title: `${t(preset.label)} · ${preset.cols}×${preset.rows}`,
          data: { value: preset.id, review: `${t(preset.label)} · ${t('Cols')} ${preset.cols} · ${t('Rows')} ${preset.rows}` },
          children: t(preset.label),
        }))}
      />
    </div>
  );
}

cases.push({ name: 'RepeatDialog grid preset toolbar inside a tab panel', legacy: <LegacyRepeatGridPreset cols={3} rows={3} reviewed="" />, kit: <KitRepeatGridPreset cols={3} rows={3} reviewed="" />, exact: true });

// ---- CutContourDialog ----------------------------------------------------------

const TRACE_PRESETS = [
  { label: 'Logo', threshold: 128, simplify: 1, useAlpha: false },
  { label: 'Dark art', threshold: 96, simplify: 0.5, useAlpha: false },
  { label: 'Photo high contrast', threshold: 160, simplify: 2, useAlpha: false },
  { label: 'Transparent PNG', threshold: 128, simplify: 1, useAlpha: true },
  { label: 'Noisy scan', threshold: 140, simplify: 3, useAlpha: false },
];

function describeTracePreset(preset: (typeof TRACE_PRESETS)[number]) {
  return `${preset.label}: ${preset.threshold} / ${preset.simplify}px${preset.useAlpha ? ` · ${t('Alpha')}` : ''}`;
}

function LegacyCutTracePreset(props: { threshold: number; simplify: number; useAlpha: boolean; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-5 gap-1"
      role="toolbar"
      aria-label={t('Trace preset actions')}
      aria-describedby="trace-preset-review-status"
      title={t('Use arrow keys to review presets')}
      onKeyDown={onKeys}
    >
      <div id="trace-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || describeTracePreset(TRACE_PRESETS[0])}`}
      </div>
      {TRACE_PRESETS.map((preset) => {
        const review = describeTracePreset(preset);
        const active = props.threshold === preset.threshold && Math.abs(props.simplify - preset.simplify) < 0.001 && props.useAlpha === preset.useAlpha;
        return (
          <button
            key={preset.label}
            type="button"
            data-cut-preset-action
            data-cut-preset-review={review}
            className={`min-h-10 rounded border px-1.5 py-1 text-[10px] leading-tight transition-colors ${active ? 'bg-[#ff2e9a]/15 border-[#ff2e9a] text-ink' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.cutPresetReview ?? '')}
            onClick={() => undefined}
            title={review}
            aria-pressed={active}
          >
            <span className="block font-medium">{preset.label}</span>
            <span className="block text-muted tabular-nums">{preset.threshold} · {preset.simplify}px{preset.useAlpha ? ' · A' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function KitCutTracePreset(props: { threshold: number; simplify: number; useAlpha: boolean; reviewed: string }) {
  return (
    <PresetRow
      statusId="trace-preset-review-status"
      className="grid grid-cols-5 gap-1"
      label={t('Trace preset actions')}
      title={t('Use arrow keys to review presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={describeTracePreset(TRACE_PRESETS[0])}
      actionAttr="data-cut-preset-action"
      setReviewed={setReviewed}
      items={TRACE_PRESETS.map((preset) => {
        const review = describeTracePreset(preset);
        const active = props.threshold === preset.threshold && Math.abs(props.simplify - preset.simplify) < 0.001 && props.useAlpha === preset.useAlpha;
        return {
          key: preset.label,
          className: `min-h-10 rounded border px-1.5 py-1 text-[10px] leading-tight transition-colors ${active ? 'bg-[#ff2e9a]/15 border-[#ff2e9a] text-ink' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
          pressed: active,
          onClick: () => undefined,
          title: review,
          focusReviewKey: 'cutPresetReview',
          data: { 'cut-preset-review': review },
          children: (
            <>
              <span className="block font-medium">{preset.label}</span>
              <span className="block text-muted tabular-nums">{preset.threshold} · {preset.simplify}px{preset.useAlpha ? ' · A' : ''}</span>
            </>
          ),
        };
      })}
    />
  );
}

cases.push({ name: 'CutContourDialog trace preset toolbar (custom review attribute, rich chips)', legacy: <LegacyCutTracePreset threshold={128} simplify={1} useAlpha={false} reviewed="" />, kit: <KitCutTracePreset threshold={128} simplify={1} useAlpha={false} reviewed="" />, exact: false });

// ---- TilePrintDialog -----------------------------------------------------------

function LegacyTilePageSearch(props: { reviewed: string; filteredCount: number }) {
  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      role="toolbar"
      aria-label={t('Page size search actions')}
      aria-describedby="tile-page-search-action-review-status"
      title={t('Use arrow keys to review page size search actions')}
      onKeyDown={onKeys}
    >
      <span id="tile-page-search-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Page size search actions')}`}
      </span>
      <button
        type="button"
        className="text-[10px] text-accent2 hover:text-accent disabled:opacity-40"
        data-tile-page-search-action
        data-tile-page-search-action-review={t('Use first search result')}
        onFocus={() => setReviewed(t('Use first search result'))}
        onClick={() => undefined}
        disabled={props.filteredCount === 0}
        title={t('Use first search result')}
      >
        {t('Use First')}
      </button>
      <button
        type="button"
        className="text-[10px] text-accent2 hover:text-accent"
        data-tile-page-search-action
        data-tile-page-search-action-review={t('Clear search')}
        onFocus={() => setReviewed(t('Clear search'))}
        onClick={() => undefined}
        title={t('Clear search')}
      >
        {t('Clear search')}
      </button>
    </div>
  );
}

function KitTilePageSearch(props: { reviewed: string; filteredCount: number }) {
  return (
    <SearchableListActions
      statusId="tile-page-search-action-review-status"
      className="flex items-center gap-1.5 shrink-0"
      label={t('Page size search actions')}
      title={t('Use arrow keys to review page size search actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Page size search actions')}
      actionAttr="data-tile-page-search-action"
      setReviewed={setReviewed}
      first={{
        label: t('Use First'),
        review: t('Use first search result'),
        title: t('Use first search result'),
        className: 'text-[10px] text-accent2 hover:text-accent disabled:opacity-40',
        onActivate: () => undefined,
        disabled: props.filteredCount === 0,
      }}
      clear={{
        label: t('Clear search'),
        review: t('Clear search'),
        title: t('Clear search'),
        className: 'text-[10px] text-accent2 hover:text-accent',
        onActivate: () => undefined,
      }}
    />
  );
}

cases.push(
  { name: 'TilePrintDialog page-size search actions (Use First enabled)', legacy: <LegacyTilePageSearch reviewed="" filteredCount={2} />, kit: <KitTilePageSearch reviewed="" filteredCount={2} />, exact: true },
  { name: 'TilePrintDialog page-size search actions (Use First disabled)', legacy: <LegacyTilePageSearch reviewed="" filteredCount={0} />, kit: <KitTilePageSearch reviewed="" filteredCount={0} />, exact: true },
);

const TILE_MARGIN_PRESETS_MM = [0, 3, 5, 10, 15];

function LegacyTileMarginGroup(props: { marginMm: number; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-5 gap-1"
      role="group"
      aria-label={t('Margin presets')}
      aria-describedby="tile-margin-preset-review-status"
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
    >
      <div id="tile-margin-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || `${t('Margin')} ${props.marginMm} mm`}`}
      </div>
      {TILE_MARGIN_PRESETS_MM.map((preset) => {
        const active = Math.abs(props.marginMm - preset) < 0.001;
        const review = `${t('Margin')} ${preset} mm`;
        return (
          <button
            key={preset}
            type="button"
            data-value={`${preset}`}
            data-review={review}
            className={`h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            onClick={() => undefined}
            title={`${t('Set margin to')} ${preset} mm`}
            aria-pressed={active}
          >
            {preset}
          </button>
        );
      })}
    </div>
  );
}

function KitTileMarginGroup(props: { marginMm: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="tile-margin-preset-review-status"
      className="grid grid-cols-5 gap-1"
      role="group"
      label={t('Margin presets')}
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={`${t('Margin')} ${props.marginMm} mm`}
      setReviewed={setReviewed}
      items={TILE_MARGIN_PRESETS_MM.map((preset) => ({
        key: preset,
        className: `h-6 rounded border text-[10px] transition-colors ${Math.abs(props.marginMm - preset) < 0.001 ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
        pressed: Math.abs(props.marginMm - preset) < 0.001,
        onClick: () => undefined,
        title: `${t('Set margin to')} ${preset} mm`,
        data: { value: `${preset}`, review: `${t('Margin')} ${preset} mm` },
        children: preset,
      }))}
    />
  );
}

cases.push({ name: 'TilePrintDialog margin preset group (segment-handler driven)', legacy: <LegacyTileMarginGroup marginMm={5} reviewed="" />, kit: <KitTileMarginGroup marginMm={5} reviewed="" />, exact: false });

function LegacyTileOutputFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2"
      role="toolbar"
      aria-label={t('Tile Print output actions')}
      aria-describedby="tile-print-output-action-review-status"
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
    >
      <span id="tile-print-output-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Tile Print output actions')}`}
      </span>
      <button
        type="button"
        data-tile-output-action
        data-tile-output-action-review={t('Cancel')}
        className="btn"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Cancel'))}
      >
        {t('Cancel')}
      </button>
      <button
        type="button"
        data-tile-output-action
        data-tile-output-action-review={t('Reset tile print settings')}
        className="btn flex items-center gap-1"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Reset tile print settings'))}
        title={t('Reset tile print settings')}
      >
        <RotateCcw size={12} aria-hidden="true" /> {t('Reset')}
      </button>
      <button
        type="button"
        data-tile-output-action
        data-tile-output-action-review={t('Print')}
        className="btn-primary flex items-center gap-1"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Print'))}
      >
        <Printer size={12} aria-hidden="true" /> {t('Print')}
      </button>
    </div>
  );
}

function KitTileOutputFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="tile-print-output-action-review-status"
      className="flex justify-end gap-2"
      label={t('Tile Print output actions')}
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Tile Print output actions')}
      actionAttr="data-tile-output-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: () => undefined },
        { children: <><RotateCcw size={12} aria-hidden="true" /> {t('Reset')}</>, review: t('Reset tile print settings'), className: 'btn flex items-center gap-1', onClick: () => undefined, title: t('Reset tile print settings') },
        { children: <><Printer size={12} aria-hidden="true" /> {t('Print')}</>, review: t('Print'), className: 'btn-primary flex items-center gap-1', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'TilePrintDialog Cancel/Reset/Print footer (icon actions)', legacy: <LegacyTileOutputFooter reviewed="" />, kit: <KitTileOutputFooter reviewed="" />, exact: true });

// ---- the suite ----------------------------------------------------------------

describe('house dialog kit DOM equivalence (batch A shapes)', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
  });

  for (const testCase of cases) assertEquivalent(testCase);

  it('useReviewedAction is the same state machine the batch-A dialogs rely on', async () => {
    function Probe() {
      const [reviewed, setReviewedState] = useReviewedAction();
      return (
        <div>
          <span data-testid="value">{reviewed || 'fallback'}</span>
          <button type="button" onClick={() => setReviewedState('Send to Plotter…')}>set</button>
        </div>
      );
    }
    const container = document.createElement('div');
    host.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Probe />));
    expect(container.querySelector('[data-testid="value"]')!.textContent).toBe('fallback');
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-testid="value"]')!.textContent).toBe('Send to Plotter…');
  });
});
