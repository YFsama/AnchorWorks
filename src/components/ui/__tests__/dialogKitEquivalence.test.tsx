import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { FileText, Printer } from 'lucide-react';
import { PresetRow } from '../PresetRow';
import { ReviewedFooter } from '../ReviewedFooter';
import { SearchableListActions } from '../SearchableListActions';
import { useReviewedAction } from '../useRovingActions';

/**
 * DOM-equivalence suite for the house dialog kit.
 *
 * Each case renders a LEGACY fixture — a verbatim copy of the pre-kit markup
 * from one of the six pilot dialogs (state injected through props, `t` is the
 * identity) — next to the kit-based rendering the migrated dialog produces,
 * then asserts the two DOM trees are equal.
 *
 * Two bars:
 * - canonical equality (always): same tags, same text nodes, same attributes
 *   with the same values, compared as sorted attribute maps. This is what
 *   CSS, screen readers, axe, and React reconciliation observe.
 * - byte-identical serialization (cases flagged `exact`): outerHTML matches
 *   character for character, including attribute order. Cases not flagged
 *   differ ONLY in React's attribute serialization order (e.g. onFocus
 *   before onClick in the legacy Grommets/Rhinestone footers); every
 *   attribute, value, class, and child is identical.
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

// ---- SimplifyDialog -----------------------------------------------------------

const SIMPLIFY_PRESETS_PX = [0.5, 1, 1.5, 3, 5, 8];

function LegacySimplifyPreset(props: { tolerance: number; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-6 gap-1"
      role="toolbar"
      aria-label={t('Tolerance preset actions')}
      aria-describedby="simplify-preset-review-status"
      title={t('Use arrow keys to review tolerance presets')}
      onKeyDown={onKeys}
    >
      <div id="simplify-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Tolerance presets')}`}
      </div>
      {SIMPLIFY_PRESETS_PX.map((value) => {
        const review = `${t('Tolerance (px)')} ${value}`;
        return (
          <button
            key={value}
            type="button"
            data-simplify-preset-action
            data-tolerance={value}
            data-review={review}
            className={`btn !py-1 !px-1 !text-[10px] ${props.tolerance === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
            onClick={() => undefined}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            aria-pressed={props.tolerance === value}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function KitSimplifyPreset(props: { tolerance: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="simplify-preset-review-status"
      className="grid grid-cols-6 gap-1"
      label={t('Tolerance preset actions')}
      title={t('Use arrow keys to review tolerance presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Tolerance presets')}
      actionAttr="data-simplify-preset-action"
      setReviewed={setReviewed}
      items={SIMPLIFY_PRESETS_PX.map((value) => ({
        key: value,
        className: `btn !py-1 !px-1 !text-[10px] ${props.tolerance === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
        pressed: props.tolerance === value,
        onClick: () => undefined,
        data: { tolerance: value, review: `${t('Tolerance (px)')} ${value}` },
        children: value,
      }))}
    />
  );
}

cases.push(
  { name: 'SimplifyDialog tolerance preset toolbar (fallback announcement)', legacy: <LegacySimplifyPreset tolerance={1.5} reviewed="" />, kit: <KitSimplifyPreset tolerance={1.5} reviewed="" />, exact: true },
  { name: 'SimplifyDialog tolerance preset toolbar (reviewed announcement)', legacy: <LegacySimplifyPreset tolerance={1.5} reviewed="Tolerance (px) 3" />, kit: <KitSimplifyPreset tolerance={1.5} reviewed="Tolerance (px) 3" />, exact: true },
);

function LegacySimplifyFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2 mt-3"
      role="toolbar"
      aria-label={t('Simplify Path actions')}
      aria-describedby="simplify-action-review-status"
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
    >
      <div id="simplify-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Simplify Path actions')}`}
      </div>
      <button
        type="button"
        data-simplify-action
        data-simplify-action-review={t('Cancel')}
        className="btn"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Cancel'))}
      >
        {t('Cancel')}
      </button>
      <button
        type="button"
        data-simplify-action
        data-simplify-action-review={t('Apply')}
        className="btn-primary"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Apply'))}
      >
        {t('Apply')}
      </button>
    </div>
  );
}

function KitSimplifyFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="simplify-action-review-status"
      className="flex justify-end gap-2 mt-3"
      label={t('Simplify Path actions')}
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Simplify Path actions')}
      statusAs="div"
      actionAttr="data-simplify-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: () => undefined },
        { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'SimplifyDialog Cancel/Apply footer', legacy: <LegacySimplifyFooter reviewed="Apply" />, kit: <KitSimplifyFooter reviewed="Apply" />, exact: true });

// ---- GrommetsDialog -----------------------------------------------------------

const GROMMET_PRESETS = [
  { label: 'Small banner', inset: 15, spacing: 300, diameter: 8 },
  { label: 'Standard banner', inset: 20, spacing: 500, diameter: 10 },
  { label: 'Large banner', inset: 25, spacing: 750, diameter: 12 },
];

function LegacyGrommetsPreset(props: { inset: number; spacing: number; diameter: number; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-3 gap-1"
      role="toolbar"
      aria-label={t('Banner preset actions')}
      aria-describedby="grommet-preset-review-status"
      title={t('Use arrow keys to review banner presets')}
      onKeyDown={onKeys}
    >
      <div id="grommet-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || `${t('Inset (mm)')} ${props.inset} · ${t('Max spacing (mm)')} ${props.spacing} · ${t('Diameter (mm)')} ${props.diameter}`}`}
      </div>
      {GROMMET_PRESETS.map((preset) => {
        const active = props.inset === preset.inset && props.spacing === preset.spacing && props.diameter === preset.diameter;
        const review = `${t(preset.label)} · ${t('Inset (mm)')} ${preset.inset} · ${t('Max spacing (mm)')} ${preset.spacing} · ${t('Diameter (mm)')} ${preset.diameter}`;
        return (
          <button
            key={preset.label}
            type="button"
            data-grommet-preset-action
            data-review={review}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            onClick={() => undefined}
            aria-pressed={active}
            className={`px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}
            title={`${t(preset.label)}: ${preset.inset} / ${preset.spacing} / ${preset.diameter} mm`}
          >
            <span className="block font-medium">{t(preset.label)}</span>
            <span className="block tabular-nums">{preset.inset} · {preset.spacing} · Ø{preset.diameter}</span>
          </button>
        );
      })}
    </div>
  );
}

function KitGrommetsPreset(props: { inset: number; spacing: number; diameter: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="grommet-preset-review-status"
      className="grid grid-cols-3 gap-1"
      label={t('Banner preset actions')}
      title={t('Use arrow keys to review banner presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={`${t('Inset (mm)')} ${props.inset} · ${t('Max spacing (mm)')} ${props.spacing} · ${t('Diameter (mm)')} ${props.diameter}`}
      actionAttr="data-grommet-preset-action"
      setReviewed={setReviewed}
      items={GROMMET_PRESETS.map((preset) => {
        const active = props.inset === preset.inset && props.spacing === preset.spacing && props.diameter === preset.diameter;
        return {
          key: preset.label,
          className: `px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`,
          pressed: active,
          onClick: () => undefined,
          title: `${t(preset.label)}: ${preset.inset} / ${preset.spacing} / ${preset.diameter} mm`,
          data: { review: `${t(preset.label)} · ${t('Inset (mm)')} ${preset.inset} · ${t('Max spacing (mm)')} ${preset.spacing} · ${t('Diameter (mm)')} ${preset.diameter}` },
          children: (
            <>
              <span className="block font-medium">{t(preset.label)}</span>
              <span className="block tabular-nums">{preset.inset} · {preset.spacing} · Ø{preset.diameter}</span>
            </>
          ),
        };
      })}
    />
  );
}

cases.push({ name: 'GrommetsDialog banner preset toolbar (rich chips)', legacy: <LegacyGrommetsPreset inset={20} spacing={500} diameter={10} reviewed="" />, kit: <KitGrommetsPreset inset={20} spacing={500} diameter={10} reviewed="" />, exact: false });

function LegacyGrommetsFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2 mt-4"
      role="toolbar"
      aria-label={t('Banner Grommets actions')}
      aria-describedby="grommets-action-review-status"
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
    >
      <span id="grommets-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Banner Grommets actions')}`}
      </span>
      <button type="button" data-grommets-action data-grommets-action-review={t('Cancel')} className="btn" onFocus={() => setReviewed(t('Cancel'))} onClick={() => undefined}>{t('Cancel')}</button>
      <button type="button" data-grommets-action data-grommets-action-review={t('Reset grommet settings')} className="btn" onFocus={() => setReviewed(t('Reset grommet settings'))} onClick={() => undefined} title={t('Reset grommet settings')}>{t('Reset')}</button>
      <button type="button" data-grommets-action data-grommets-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewed(t('Apply'))} onClick={() => undefined}>{t('Apply')}</button>
    </div>
  );
}

function KitGrommetsFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="grommets-action-review-status"
      className="flex justify-end gap-2 mt-4"
      label={t('Banner Grommets actions')}
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Banner Grommets actions')}
      actionAttr="data-grommets-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: () => undefined },
        { children: t('Reset'), review: t('Reset grommet settings'), className: 'btn', onClick: () => undefined, title: t('Reset grommet settings') },
        { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'GrommetsDialog Cancel/Reset/Apply footer', legacy: <LegacyGrommetsFooter reviewed="" />, kit: <KitGrommetsFooter reviewed="" />, exact: false });

// ---- RhinestoneDialog ---------------------------------------------------------

const SS_PRESETS = [
  { label: 'SS6', mm: 2.0 },
  { label: 'SS10', mm: 2.8 },
  { label: 'SS16', mm: 3.9 },
  { label: 'SS20', mm: 4.7 },
];

function LegacyRhinestoneSize(props: { diameter: number; reviewed: string }) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="toolbar"
      aria-label={t('Stone size preset actions')}
      aria-describedby="rhinestone-size-preset-review-status"
      title={t('Use arrow keys to review stone size presets')}
      onKeyDown={onKeys}
    >
      <div id="rhinestone-size-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || `${t('Stone Ø (mm)')} ${props.diameter}`}`}
      </div>
      {SS_PRESETS.map((p) => {
        const active = Math.abs(props.diameter - p.mm) < 0.01;
        const review = `${p.label} · ${t('Stone Ø (mm)')} ${p.mm}`;
        return (
          <button key={p.label} type="button"
            data-rhinestone-preset-action
            data-review={review}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            onClick={() => undefined}
            aria-pressed={active}
            className={`px-2 py-0.5 rounded-sm border text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink' : 'border-border text-muted hover:text-ink'}`}
            title={`${p.label}: ${p.mm} mm`}>
            <span className="font-medium">{p.label}</span> <span className="tabular-nums">Ø{p.mm}</span>
          </button>
        );
      })}
    </div>
  );
}

function KitRhinestoneSize(props: { diameter: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="rhinestone-size-preset-review-status"
      className="flex flex-wrap gap-1"
      label={t('Stone size preset actions')}
      title={t('Use arrow keys to review stone size presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={`${t('Stone Ø (mm)')} ${props.diameter}`}
      actionAttr="data-rhinestone-preset-action"
      setReviewed={setReviewed}
      items={SS_PRESETS.map((p) => {
        const active = Math.abs(props.diameter - p.mm) < 0.01;
        return {
          key: p.label,
          className: `px-2 py-0.5 rounded-sm border text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink' : 'border-border text-muted hover:text-ink'}`,
          pressed: active,
          onClick: () => undefined,
          title: `${p.label}: ${p.mm} mm`,
          data: { review: `${p.label} · ${t('Stone Ø (mm)')} ${p.mm}` },
          children: (
            <>
              <span className="font-medium">{p.label}</span> <span className="tabular-nums">Ø{p.mm}</span>
            </>
          ),
        };
      })}
    />
  );
}

cases.push({ name: 'RhinestoneDialog stone size preset toolbar (inline spans)', legacy: <LegacyRhinestoneSize diameter={2.8} reviewed="" />, kit: <KitRhinestoneSize diameter={2.8} reviewed="" />, exact: false });

function LegacyRhinestoneFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2 mt-4"
      role="toolbar"
      aria-label={t('Rhinestone Template actions')}
      aria-describedby="rhinestone-action-review-status"
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
    >
      <span id="rhinestone-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Rhinestone Template actions')}`}
      </span>
      <button type="button" data-rhinestone-action data-rhinestone-action-review={t('Cancel')} className="btn" onFocus={() => setReviewed(t('Cancel'))} onClick={() => undefined}>{t('Cancel')}</button>
      <button type="button" data-rhinestone-action data-rhinestone-action-review={t('Reset rhinestone settings')} className="btn" onFocus={() => setReviewed(t('Reset rhinestone settings'))} onClick={() => undefined} title={t('Reset rhinestone settings')}>{t('Reset')}</button>
      <button type="button" data-rhinestone-action data-rhinestone-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewed(t('Apply'))} onClick={() => undefined}>{t('Apply')}</button>
    </div>
  );
}

function KitRhinestoneFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="rhinestone-action-review-status"
      className="flex justify-end gap-2 mt-4"
      label={t('Rhinestone Template actions')}
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Rhinestone Template actions')}
      actionAttr="data-rhinestone-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: () => undefined },
        { children: t('Reset'), review: t('Reset rhinestone settings'), className: 'btn', onClick: () => undefined, title: t('Reset rhinestone settings') },
        { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'RhinestoneDialog Cancel/Reset/Apply footer', legacy: <LegacyRhinestoneFooter reviewed="Reset rhinestone settings" />, kit: <KitRhinestoneFooter reviewed="Reset rhinestone settings" />, exact: false });

// ---- FreeDistortDialog --------------------------------------------------------

const DISTORT_PRESETS = [
  { label: 'Left perspective', corners: { tl: [18, -16], tr: [0, 0], br: [0, 0], bl: [18, 16] }, title: 'Pull the left edge into a signboard perspective.' },
  { label: 'Right perspective', corners: { tl: [0, 0], tr: [-18, -16], br: [-18, 16], bl: [0, 0] }, title: 'Pull the right edge into a signboard perspective.' },
  { label: 'Skew', corners: { tl: [12, 0], tr: [12, 0], br: [-12, 0], bl: [-12, 0] }, title: 'Slant the artwork for italic, speed, or panel mockups.' },
];

function LegacyFreeDistortPreset(props: { activePreset: string; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-3 gap-1"
      role="toolbar"
      aria-label={t('Free Distort preset actions')}
      aria-describedby="free-distort-preset-review-status"
      title={t('Use arrow keys to review free distort presets')}
      onKeyDown={onKeys}
    >
      <div id="free-distort-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Distort presets')}`}
      </div>
      {DISTORT_PRESETS.map((preset) => {
        const active = props.activePreset === preset.label;
        const review = `${t(preset.label)}: ${t(preset.title)}`;
        return (
          <button
            key={preset.label}
            type="button"
            data-free-distort-preset-action
            data-free-distort-preset-index={DISTORT_PRESETS.indexOf(preset)}
            data-review={review}
            className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
            onClick={() => undefined}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            aria-pressed={active}
            title={review}
          >
            {t(preset.label)}
          </button>
        );
      })}
    </div>
  );
}

function KitFreeDistortPreset(props: { activePreset: string; reviewed: string }) {
  return (
    <PresetRow
      statusId="free-distort-preset-review-status"
      className="grid grid-cols-3 gap-1"
      label={t('Free Distort preset actions')}
      title={t('Use arrow keys to review free distort presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Distort presets')}
      actionAttr="data-free-distort-preset-action"
      setReviewed={setReviewed}
      items={DISTORT_PRESETS.map((preset) => {
        const active = props.activePreset === preset.label;
        const review = `${t(preset.label)}: ${t(preset.title)}`;
        return {
          key: preset.label,
          className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
          pressed: active,
          onClick: () => undefined,
          title: review,
          data: { 'free-distort-preset-index': DISTORT_PRESETS.indexOf(preset), review },
          children: t(preset.label),
        };
      })}
    />
  );
}

cases.push({ name: 'FreeDistortDialog preset toolbar (title carries the review)', legacy: <LegacyFreeDistortPreset activePreset="Skew" reviewed="" />, kit: <KitFreeDistortPreset activePreset="Skew" reviewed="" />, exact: true });

function LegacyFreeDistortFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2 mt-3"
      role="toolbar"
      aria-label={t('Free Distort actions')}
      aria-describedby="free-distort-action-review-status"
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
    >
      <span id="free-distort-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Free Distort actions')}`}
      </span>
      <button
        type="button"
        data-free-distort-action
        data-free-distort-action-review={t('Reset')}
        className="btn"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Reset'))}
      >
        {t('Reset')}
      </button>
      <button
        type="button"
        data-free-distort-action
        data-free-distort-action-review={t('Cancel')}
        className="btn"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Cancel'))}
      >
        {t('Cancel')}
      </button>
      <button
        type="button"
        data-free-distort-action
        data-free-distort-action-review={t('Apply')}
        className="btn-primary"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Apply'))}
      >
        {t('Apply')}
      </button>
    </div>
  );
}

function KitFreeDistortFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="free-distort-action-review-status"
      className="flex justify-end gap-2 mt-3"
      label={t('Free Distort actions')}
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Free Distort actions')}
      actionAttr="data-free-distort-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Reset'), review: t('Reset'), className: 'btn', onClick: () => undefined },
        { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: () => undefined },
        { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'FreeDistortDialog Reset/Cancel/Apply footer', legacy: <LegacyFreeDistortFooter reviewed="" />, kit: <KitFreeDistortFooter reviewed="" />, exact: true });

// ---- PrintDialog --------------------------------------------------------------

const PRINT_JOB_PRESETS = [
  { label: 'Proof print', opts: { pageSize: 'A4', orientation: 'portrait', fit: 'fit', marginMm: 10 } },
  { label: 'Office full page', opts: { pageSize: 'Letter', orientation: 'portrait', fit: 'fit', marginMm: 5 } },
  { label: 'Photo fill', opts: { pageSize: 'A4', orientation: 'landscape', fit: 'fill', marginMm: 0 } },
  { label: 'True size check', opts: { pageSize: 'A4', orientation: 'portrait', fit: 'actual', marginMm: 10 } },
];

function LegacyPrintJobPreset(props: { reviewed: string; printSummaryLabel: string; active: boolean[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-1"
      role="toolbar"
      aria-label={t('Print job preset actions')}
      aria-describedby="print-job-preset-review-status"
      title={t('Use arrow keys to review print job presets')}
      onKeyDown={onKeys}
    >
      <div id="print-job-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || props.printSummaryLabel}`}
      </div>
      {PRINT_JOB_PRESETS.map((preset, index) => {
        const active = props.active[index];
        const review = `${t(preset.label)} job review`;
        return (
          <button
            key={preset.label}
            type="button"
            data-print-job-preset
            data-print-job-preset-index={PRINT_JOB_PRESETS.indexOf(preset)}
            data-review={review}
            className={`rounded-md border px-2 py-1 text-[10px] transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            onClick={() => undefined}
            aria-pressed={active}
            title={t(`${preset.label} settings`)}
          >
            {t(preset.label)}
          </button>
        );
      })}
    </div>
  );
}

function KitPrintJobPreset(props: { reviewed: string; printSummaryLabel: string; active: boolean[] }) {
  return (
    <PresetRow
      statusId="print-job-preset-review-status"
      className="grid grid-cols-2 gap-1"
      label={t('Print job preset actions')}
      title={t('Use arrow keys to review print job presets')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={props.printSummaryLabel}
      actionAttr="data-print-job-preset"
      setReviewed={setReviewed}
      items={PRINT_JOB_PRESETS.map((preset, index) => ({
        key: preset.label,
        className: `rounded-md border px-2 py-1 text-[10px] transition ${props.active[index] ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`,
        pressed: props.active[index],
        onClick: () => undefined,
        title: t(`${preset.label} settings`),
        data: { 'print-job-preset-index': PRINT_JOB_PRESETS.indexOf(preset), review: `${t(preset.label)} job review` },
        children: t(preset.label),
      }))}
    />
  );
}

cases.push({ name: 'PrintDialog job preset toolbar', legacy: <LegacyPrintJobPreset reviewed="" printSummaryLabel="A4 210×297mm · Portrait · Fit to page · Margin 10mm" active={[true, false, false, false]} />, kit: <KitPrintJobPreset reviewed="" printSummaryLabel="A4 210×297mm · Portrait · Fit to page · Margin 10mm" active={[true, false, false, false]} />, exact: false });

const MARGIN_PRESETS_MM = [0, 3, 5, 10, 15, 25];

function LegacyPrintMarginGroup(props: { marginMm: number; reviewed: string }) {
  return (
    <div
      className="grid grid-cols-6 gap-1"
      role="group"
      aria-label={t('Margin presets')}
      aria-describedby="print-margin-preset-review-status"
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
    >
      <div id="print-margin-preset-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || `${t('Margin')} ${props.marginMm} mm`}`}
      </div>
      {MARGIN_PRESETS_MM.map((margin) => {
        const active = Math.abs(props.marginMm - margin) < 0.001;
        const review = `${t('Margin')} ${margin} mm`;
        return (
          <button
            key={margin}
            type="button"
            data-value={`${margin}`}
            data-review={review}
            aria-pressed={active}
            className={`h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}
            onClick={() => undefined}
            title={`${t('Set margin to')} ${margin} mm`}
          >
            {margin}
          </button>
        );
      })}
    </div>
  );
}

function KitPrintMarginGroup(props: { marginMm: number; reviewed: string }) {
  return (
    <PresetRow
      statusId="print-margin-preset-review-status"
      className="grid grid-cols-6 gap-1"
      role="group"
      label={t('Margin presets')}
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={`${t('Margin')} ${props.marginMm} mm`}
      setReviewed={setReviewed}
      items={MARGIN_PRESETS_MM.map((margin) => {
        const active = Math.abs(props.marginMm - margin) < 0.001;
        return {
          key: margin,
          className: `h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
          pressed: active,
          onClick: () => undefined,
          title: `${t('Set margin to')} ${margin} mm`,
          data: { value: `${margin}`, review: `${t('Margin')} ${margin} mm` },
          children: margin,
        };
      })}
    />
  );
}

cases.push({ name: 'PrintDialog margin preset group (role=group segment)', legacy: <LegacyPrintMarginGroup marginMm={5} reviewed="" />, kit: <KitPrintMarginGroup marginMm={5} reviewed="" />, exact: false });

function LegacyPrintOutputFooter(props: { reviewed: string }) {
  return (
    <div
      className="flex justify-end gap-2 mt-3"
      role="toolbar"
      aria-label={t('Print output actions')}
      aria-describedby="print-output-action-review-status"
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
    >
      <span id="print-output-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Print output actions')}`}
      </span>
      <button
        type="button"
        data-print-output-action
        data-print-output-action-review={t('Cancel')}
        className="btn"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Cancel'))}
      >
        {t('Cancel')}
      </button>
      <button
        type="button"
        data-print-output-action
        data-print-output-action-review={t('Reset print settings')}
        className="btn"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Reset print settings'))}
        title={t('Reset print settings')}
      >
        {t('Reset')}
      </button>
      <button
        type="button"
        data-print-output-action
        data-print-output-action-review="PDF"
        className="btn flex items-center gap-1"
        onClick={() => undefined}
        onFocus={() => setReviewed('PDF')}
        title={t('Save as vector PDF (skips the system print dialog)')}
      ><FileText size={12} aria-hidden="true" /> PDF</button>
      <button
        type="button"
        data-print-output-action
        data-print-output-action-review={t('Print')}
        className="btn-primary flex items-center gap-1"
        onClick={() => undefined}
        onFocus={() => setReviewed(t('Print'))}
      ><Printer size={12} aria-hidden="true" /> {t('Print')}</button>
    </div>
  );
}

function KitPrintOutputFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="print-output-action-review-status"
      className="flex justify-end gap-2 mt-3"
      label={t('Print output actions')}
      title={t('Use Left/Right arrows to switch options')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Print output actions')}
      actionAttr="data-print-output-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: () => undefined },
        { children: t('Reset'), review: t('Reset print settings'), className: 'btn', onClick: () => undefined, title: t('Reset print settings') },
        { children: <><FileText size={12} aria-hidden="true" /> PDF</>, review: 'PDF', className: 'btn flex items-center gap-1', onClick: () => undefined, title: t('Save as vector PDF (skips the system print dialog)') },
        { children: <><Printer size={12} aria-hidden="true" /> {t('Print')}</>, review: t('Print'), className: 'btn-primary flex items-center gap-1', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'PrintDialog Cancel/Reset/PDF/Print footer (icon actions)', legacy: <LegacyPrintOutputFooter reviewed="PDF" />, kit: <KitPrintOutputFooter reviewed="PDF" />, exact: true });

function LegacyPrintPageSearch(props: { reviewed: string; filteredCount: number }) {
  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      role="toolbar"
      aria-label={t('Page size search actions')}
      aria-describedby="print-page-search-action-review-status"
      title={t('Use arrow keys to review page size search actions')}
      onKeyDown={onKeys}
    >
      <span id="print-page-search-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Page size search actions')}`}
      </span>
      <button
        type="button"
        className="text-[10px] text-accent2 hover:text-accent disabled:opacity-40"
        data-page-search-action
        data-page-search-action-review={t('Use first search result')}
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
        data-page-search-action
        data-page-search-action-review={t('Clear search')}
        onFocus={() => setReviewed(t('Clear search'))}
        onClick={() => undefined}
        title={t('Clear search')}
      >
        {t('Clear search')}
      </button>
    </div>
  );
}

function KitPrintPageSearch(props: { reviewed: string; filteredCount: number }) {
  return (
    <SearchableListActions
      statusId="print-page-search-action-review-status"
      className="flex items-center gap-1.5 shrink-0"
      label={t('Page size search actions')}
      title={t('Use arrow keys to review page size search actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Page size search actions')}
      actionAttr="data-page-search-action"
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
  { name: 'PrintDialog page-size search actions (Use First enabled)', legacy: <LegacyPrintPageSearch reviewed="" filteredCount={2} />, kit: <KitPrintPageSearch reviewed="" filteredCount={2} />, exact: true },
  { name: 'PrintDialog page-size search actions (Use First disabled)', legacy: <LegacyPrintPageSearch reviewed="" filteredCount={0} />, kit: <KitPrintPageSearch reviewed="" filteredCount={0} />, exact: true },
);

// ---- ShortcutsDialog ----------------------------------------------------------

const SHORTCUT_SEARCH_RECIPES = [
  { label: 'Text keys', query: 'text', title: 'Filter to text creation, sizing, and editing shortcuts.' },
  { label: 'Output keys', query: 'print|cut|plotter|export', title: 'Filter to print, cut contour, plotter, and export shortcuts.' },
  { label: 'View keys', query: 'zoom', title: 'Filter to zoom, outline, theme, and view shortcuts.' },
  { label: 'Edit keys', query: 'paste', title: 'Filter to common edit, paste, duplicate, and selection shortcuts.' },
];

function LegacyShortcutsRecipe(props: { query: string; reviewed: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="toolbar"
      aria-label={t('Shortcut search recipe actions')}
      aria-describedby="shortcut-recipe-action-review-status"
      title={t('Use arrow keys to review shortcut search recipes')}
      onKeyDown={onKeys}
    >
      <span id="shortcut-recipe-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Shortcut search recipe actions')}`}
      </span>
      {SHORTCUT_SEARCH_RECIPES.map((recipe, index) => {
        const active = props.query === recipe.query;
        return (
          <button
            key={recipe.label}
            type="button"
            data-shortcut-recipe-action
            data-shortcut-recipe-action-review={`${t(recipe.label)} · ${t(recipe.title)}`}
            data-recipe-index={index}
            className={`btn !py-1 !px-2 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
            onClick={() => undefined}
            onFocus={(event) => setReviewed(event.currentTarget.dataset.shortcutRecipeActionReview ?? '')}
            aria-pressed={active}
            title={t(recipe.title)}
          >
            {t(recipe.label)}
          </button>
        );
      })}
    </div>
  );
}

function KitShortcutsRecipe(props: { query: string; reviewed: string }) {
  return (
    <PresetRow
      statusId="shortcut-recipe-action-review-status"
      className="flex flex-wrap items-center gap-1"
      statusAs="span"
      label={t('Shortcut search recipe actions')}
      title={t('Use arrow keys to review shortcut search recipes')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Shortcut search recipe actions')}
      actionAttr="data-shortcut-recipe-action"
      setReviewed={setReviewed}
      items={SHORTCUT_SEARCH_RECIPES.map((recipe, index) => ({
        key: recipe.label,
        className: `btn !py-1 !px-2 !text-[10px] ${props.query === recipe.query ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
        pressed: props.query === recipe.query,
        onClick: () => undefined,
        title: t(recipe.title),
        focusReviewKey: 'shortcutRecipeActionReview',
        data: { 'shortcut-recipe-action-review': `${t(recipe.label)} · ${t(recipe.title)}`, 'recipe-index': index },
        children: t(recipe.label),
      }))}
    />
  );
}

cases.push({ name: 'ShortcutsDialog recipe toolbar (custom review attribute)', legacy: <LegacyShortcutsRecipe query="zoom" reviewed="" />, kit: <KitShortcutsRecipe query="zoom" reviewed="" />, exact: true });

function LegacyShortcutsSearch(props: { reviewed: string; visibleShortcuts: number }) {
  return (
    <div
      className="flex items-center gap-2"
      role="toolbar"
      aria-label={t('Shortcut search actions')}
      aria-describedby="shortcut-search-action-review-status"
      title={t('Use arrow keys to review shortcut search actions')}
      onKeyDown={onKeys}
    >
      <span id="shortcut-search-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Shortcut search actions')}`}
      </span>
      {props.visibleShortcuts > 0 && (
        <button
          type="button"
          className="hover:text-ink underline-offset-2 hover:underline transition-colors"
          data-shortcut-search-action
          data-shortcut-search-action-review={t('Edit first search result')}
          onFocus={() => setReviewed(t('Edit first search result'))}
          onClick={() => undefined}
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
        onFocus={() => setReviewed(t('Clear search'))}
        onClick={() => undefined}
        title={t('Clear search')}
      >
        {t('Clear search')}
      </button>
    </div>
  );
}

function KitShortcutsSearch(props: { reviewed: string; visibleShortcuts: number }) {
  return (
    <SearchableListActions
      statusId="shortcut-search-action-review-status"
      className="flex items-center gap-2"
      label={t('Shortcut search actions')}
      title={t('Use arrow keys to review shortcut search actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Shortcut search actions')}
      actionAttr="data-shortcut-search-action"
      setReviewed={setReviewed}
      first={{
        label: t('Edit First'),
        review: t('Edit first search result'),
        title: t('Edit first search result'),
        className: 'hover:text-ink underline-offset-2 hover:underline transition-colors',
        onActivate: () => undefined,
        hidden: !(props.visibleShortcuts > 0),
      }}
      clear={{
        label: t('Clear search'),
        review: t('Clear search'),
        title: t('Clear search'),
        className: 'hover:text-ink underline-offset-2 hover:underline transition-colors',
        onActivate: () => undefined,
      }}
    />
  );
}

cases.push(
  { name: 'ShortcutsDialog search actions (Edit First visible)', legacy: <LegacyShortcutsSearch reviewed="" visibleShortcuts={2} />, kit: <KitShortcutsSearch reviewed="" visibleShortcuts={2} />, exact: true },
  { name: 'ShortcutsDialog search actions (Edit First hidden)', legacy: <LegacyShortcutsSearch reviewed="" visibleShortcuts={0} />, kit: <KitShortcutsSearch reviewed="" visibleShortcuts={0} />, exact: true },
);

function LegacyShortcutsFooter(props: { reviewed: string }) {
  return (
    <div
      role="toolbar"
      aria-label={t('Keyboard Shortcuts actions')}
      aria-describedby="shortcut-footer-action-review-status"
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
    >
      <span id="shortcut-footer-action-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Keyboard Shortcuts actions')}`}
      </span>
      <button
        type="button"
        data-shortcut-footer-action
        data-shortcut-footer-action-review={t('Close')}
        className="btn !py-1 !px-2 !text-[10px]"
        onFocus={() => setReviewed(t('Close'))}
        onClick={() => undefined}
      >
        {t('Close')}
      </button>
      <button
        type="button"
        data-shortcut-footer-action
        data-shortcut-footer-action-review={t('Customize Shortcuts…')}
        className="btn !py-1 !px-2 !text-[10px]"
        onFocus={() => setReviewed(t('Customize Shortcuts…'))}
        onClick={() => undefined}
      >
        {t('Customize Shortcuts…')}
      </button>
    </div>
  );
}

function KitShortcutsFooter(props: { reviewed: string }) {
  return (
    <ReviewedFooter
      statusId="shortcut-footer-action-review-status"
      label={t('Keyboard Shortcuts actions')}
      title={t('Use arrow keys to review dialog actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Keyboard Shortcuts actions')}
      actionAttr="data-shortcut-footer-action"
      setReviewed={setReviewed}
      actions={[
        { children: t('Close'), review: t('Close'), className: 'btn !py-1 !px-2 !text-[10px]', onClick: () => undefined },
        { children: t('Customize Shortcuts…'), review: t('Customize Shortcuts…'), className: 'btn !py-1 !px-2 !text-[10px]', onClick: () => undefined },
      ]}
    />
  );
}

cases.push({ name: 'ShortcutsDialog Close/Customize footer (no container classes)', legacy: <LegacyShortcutsFooter reviewed="" />, kit: <KitShortcutsFooter reviewed="" />, exact: false });

// ---- the suite ----------------------------------------------------------------

describe('house dialog kit DOM equivalence', () => {
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

  it('useReviewedAction starts empty and stores the reviewed string', async () => {
    function Probe() {
      const [reviewed, setReviewedState] = useReviewedAction();
      return (
        <div>
          <span data-testid="value">{reviewed || 'fallback'}</span>
          <button type="button" onClick={() => setReviewedState('Apply')}>set</button>
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
    expect(container.querySelector('[data-testid="value"]')!.textContent).toBe('Apply');
  });
});
