import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { useEditor } from '../../../store/editor';
import { TransformDialog } from '../../TransformDialog';
import { ShearDialog } from '../../ShearDialog';
import { PresetRow } from '../PresetRow';

/**
 * Gap-B closure for the house dialog kit: radiogroup member semantics.
 *
 * The kit's containers already accept role="radiogroup" (ActionToolbar,
 * pinned in dialogKitGapC), but its buttons could only be aria-pressed
 * toggles. The last three hand-rolled radiogroups — TransformDialog's Unit
 * and Move-mode groups and ShearDialog's Axis group — were exactly that
 * shape: an ActionToolbar container whose buttons carry role="radio" and
 * aria-checked instead of aria-pressed.
 *
 * `PresetItem.radio` closes the gap: it renders role="radio" with
 * aria-checked={pressed} (the pressed state doubles as the checked state)
 * and suppresses aria-pressed, so a radiogroup is a PresetRow +
 * role="radiogroup" pair and nothing else. ARIA 1.2 group-level states
 * (aria-required etc.) stay consumer-owned — the kit forces nothing.
 *
 * Bars:
 * - Default output stays frozen: without `radio`, PresetRow serializes
 *   byte-identically to the pre-gap kit (dialogKitEquivalence /
 *   dialogKitBatchA / dialogKitGapA also pin that shape).
 * - With `radio`, the button markup equals the hand-rolled HEAD markup
 *   byte-for-byte (legacy-vs-kit harness below), which is what let the
 *   three dialog groups migrate with zero DOM change.
 * - The three consolidated dialog regions are DOM-frozen against strings
 *   captured from the pre-migration dialogs, and the keyboard snapshots
 *   (focus-roving arrows that apply the value, wrap at the ends,
 *   rAF-deferred review/focus commit) ran green against the HEAD handlers
 *   before the swap. makeSegmentKeys was evaluated and rejected: it indexes
 *   from the *current value* while the HEAD handlers index from the
 *   *focused button* — they diverge whenever focus sits on a non-selected
 *   radio (Tab entry, or after Reset), so the makeRovingKeys configuration
 *   is kept verbatim.
 */

vi.mock('../../../lib/canvasEngine', () => ({ getCanvas: () => null }));
vi.mock('../../../lib/transformOps', () => ({
  applyTransform: vi.fn(async () => true),
  shearSelection: vi.fn(() => true),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = (s: string) => s;
const onKeys = (_event: ReactKeyboardEvent<HTMLDivElement>) => undefined;
const setReviewed = (_value: string) => undefined;

let host: HTMLDivElement;
let roots: Root[];

function renderElement(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  const first = container.firstElementChild;
  expect(first, `rendered nothing for ${String(element.type)}`).toBeTruthy();
  return first as HTMLElement;
}

/** Attribute-sorted serialization — the canonical "strip" equality bar. */
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

// ---- (a) frozen default output: PresetRow without `radio` -----------------------

const FROZEN_DEFAULT_HTML =
  '<div class="flex gap-1" role="toolbar" aria-label="Gap B presets" aria-describedby="gap-b-preset-status" title="Use arrow keys to review presets">'
  + '<div id="gap-b-preset-status" class="sr-only" aria-live="polite">Reviewing Gap B presets</div>'
  + '<button type="button" data-gap-b-preset-action="true" data-review="Preset mm review" class="btn" aria-pressed="true" title="Preset mm">mm</button>'
  + '<button type="button" data-gap-b-preset-action="true" data-review="Preset px review" class="btn">px</button>'
  + '</div>';

function DefaultPresetRow() {
  return (
    <PresetRow
      statusId="gap-b-preset-status"
      className="flex gap-1"
      label="Gap B presets"
      title="Use arrow keys to review presets"
      onKeyDown={onKeys}
      reviewingLabel="Reviewing"
      fallback="Gap B presets"
      actionAttr="data-gap-b-preset-action"
      setReviewed={setReviewed}
      items={[
        { key: 'mm', className: 'btn', pressed: true, onClick: () => undefined, title: 'Preset mm', data: { review: 'Preset mm review' }, children: 'mm' },
        { key: 'px', className: 'btn', onClick: () => undefined, data: { review: 'Preset px review' }, children: 'px' },
      ]}
    />
  );
}

// ---- (b) radio mode: role=radio + aria-checked, no aria-pressed -----------------

const FROZEN_RADIO_HTML =
  '<div class="flex gap-1 mb-2" role="radiogroup" aria-label="Unit" aria-describedby="gap-b-unit-status" title="Use arrow keys to switch transform units">'
  + '<div id="gap-b-unit-status" class="sr-only" aria-live="polite">Reviewing Unit</div>'
  + '<button type="button" data-gap-b-unit-action="true" data-unit="mm" data-review="Unit · mm" role="radio" aria-checked="true" class="btn-primary flex-1">mm</button>'
  + '<button type="button" data-gap-b-unit-action="true" data-unit="px" data-review="Unit · px" role="radio" aria-checked="false" class="btn flex-1">px</button>'
  + '</div>';

function RadioUnitRow(props: { unit: 'mm' | 'px' }) {
  return (
    <PresetRow
      statusId="gap-b-unit-status"
      className="flex gap-1 mb-2"
      role="radiogroup"
      label={t('Unit')}
      title={t('Use arrow keys to switch transform units')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      fallback={t('Unit')}
      actionAttr="data-gap-b-unit-action"
      setReviewed={setReviewed}
      items={[
        { key: 'mm', radio: true, pressed: props.unit === 'mm', className: props.unit === 'mm' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => undefined, data: { unit: 'mm', review: `${t('Unit')} · mm` }, children: 'mm' },
        { key: 'px', radio: true, pressed: props.unit === 'px', className: props.unit === 'px' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => undefined, data: { unit: 'px', review: `${t('Unit')} · px` }, children: 'px' },
      ]}
    />
  );
}

// ---- legacy-vs-kit harness: the HEAD hand-rolled markup, verbatim ---------------

function LegacyTransformUnitGroup(props: { unit: 'mm' | 'px'; reviewed: string }) {
  return (
    <div
      className="flex gap-1 mb-2"
      role="radiogroup"
      aria-label={t('Unit')}
      aria-describedby="transform-unit-review-status"
      title={t('Use arrow keys to switch transform units')}
      onKeyDown={onKeys}
    >
      <div id="transform-unit-review-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Unit')}`}
      </div>
      <button type="button" data-transform-unit-action data-unit="mm" data-review={`${t('Unit')} · mm`} role="radio" aria-checked={props.unit === 'mm'} className={props.unit === 'mm' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => undefined} onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}>mm</button>
      <button type="button" data-transform-unit-action data-unit="px" data-review={`${t('Unit')} · px`} role="radio" aria-checked={props.unit === 'px'} className={props.unit === 'px' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => undefined} onFocus={(event) => setReviewed(event.currentTarget.dataset.review ?? '')}>px</button>
    </div>
  );
}

function KitTransformUnitGroup(props: { unit: 'mm' | 'px'; reviewed: string }) {
  return (
    <PresetRow
      statusId="transform-unit-review-status"
      className="flex gap-1 mb-2"
      role="radiogroup"
      label={t('Unit')}
      title={t('Use arrow keys to switch transform units')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Unit')}
      actionAttr="data-transform-unit-action"
      setReviewed={setReviewed}
      items={[
        { key: 'mm', radio: true, pressed: props.unit === 'mm', className: props.unit === 'mm' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => undefined, data: { unit: 'mm', review: `${t('Unit')} · mm` }, children: 'mm' },
        { key: 'px', radio: true, pressed: props.unit === 'px', className: props.unit === 'px' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => undefined, data: { unit: 'px', review: `${t('Unit')} · px` }, children: 'px' },
      ]}
    />
  );
}

// ---- frozen dialog regions (captured from the pre-migration dialogs) ------------

const FROZEN_TRANSFORM_UNIT_HTML =
  '<div class="flex gap-1 mb-2" role="radiogroup" aria-label="Unit" aria-describedby="transform-unit-review-status" title="Use arrow keys to switch transform units">'
  + '<div id="transform-unit-review-status" class="sr-only" aria-live="polite">Reviewing Unit</div>'
  + '<button type="button" data-transform-unit-action="true" data-unit="mm" data-review="Unit · mm" role="radio" aria-checked="true" class="btn-primary flex-1">mm</button>'
  + '<button type="button" data-transform-unit-action="true" data-unit="px" data-review="Unit · px" role="radio" aria-checked="false" class="btn flex-1">px</button>'
  + '</div>';

const FROZEN_TRANSFORM_MOVE_MODE_HTML =
  '<div class="flex gap-1 mb-2" role="radiogroup" aria-label="Move mode" aria-describedby="transform-move-mode-review-status" title="Use arrow keys to switch move mode">'
  + '<div id="transform-move-mode-review-status" class="sr-only" aria-live="polite">Reviewing Move mode</div>'
  + '<button type="button" data-transform-move-mode-action="true" data-mode="xy" data-review="Move mode · XY" role="radio" aria-checked="true" class="btn-primary flex-1">XY</button>'
  + '<button type="button" data-transform-move-mode-action="true" data-mode="polar" data-review="Move mode · Polar" role="radio" aria-checked="false" class="btn flex-1">Polar</button>'
  + '</div>';

const FROZEN_SHEAR_AXIS_HTML =
  '<div class="flex gap-1 mt-3" role="radiogroup" aria-label="Axis" aria-describedby="shear-axis-review-status" title="Use arrow keys to switch shear axis">'
  + '<div id="shear-axis-review-status" class="sr-only" aria-live="polite">Reviewing Axis</div>'
  + '<button type="button" data-shear-axis-action="true" data-axis="horizontal" data-review="Axis · Horizontal" role="radio" aria-checked="true" class="btn-primary flex-1">Horizontal</button>'
  + '<button type="button" data-shear-axis-action="true" data-axis="vertical" data-review="Axis · Vertical" role="radio" aria-checked="false" class="btn flex-1">Vertical</button>'
  + '</div>';

// ---- dialog scaffolding ----------------------------------------------------------

function openTransform(): HTMLElement {
  act(() => useEditor.setState({ showTransform: true, dimUnit: 'mm' }));
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<TransformDialog />));
  const overlay = container.firstElementChild as HTMLElement | null;
  expect(overlay, 'transform overlay rendered').toBeTruthy();
  return overlay!;
}

function openShear(): HTMLElement {
  act(() => useEditor.setState({ showShear: true }));
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<ShearDialog />));
  const overlay = container.firstElementChild as HTMLElement | null;
  expect(overlay, 'shear overlay rendered').toBeTruthy();
  return overlay!;
}

const region = (overlay: HTMLElement, statusId: string) =>
  overlay.querySelector<HTMLElement>(`[aria-describedby="${statusId}"]`)!;

const regionButtons = (overlay: HTMLElement, statusId: string) =>
  Array.from(region(overlay, statusId).querySelectorAll<HTMLButtonElement>('button'));

const reviewText = (statusId: string) => document.getElementById(statusId)!.textContent;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Dispatch a keydown outside act when the handler must NOT cause a state update. */
function pressRaw(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Dispatch a keydown inside act so synchronous handler state updates flush. */
function press(target: HTMLElement, key: string): KeyboardEvent {
  let event!: KeyboardEvent;
  act(() => { event = pressRaw(target, key); });
  return event;
}

async function pressDeferred(target: HTMLElement, key: string): Promise<KeyboardEvent> {
  const event = press(target, key);
  await act(async () => { await nextFrame(); });
  return event;
}

// ---- the suites ------------------------------------------------------------------

describe('dialog kit gap B: PresetItem radiogroup member semantics', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
  });

  it('without radio, PresetRow output stays byte-identical to the pre-gap kit', () => {
    expect(renderElement(<DefaultPresetRow />).outerHTML).toBe(FROZEN_DEFAULT_HTML);
  });

  it('radio items render role=radio + aria-checked={pressed} and drop aria-pressed', () => {
    const toolbar = renderElement(<RadioUnitRow unit="mm" />);
    expect(toolbar.outerHTML).toBe(FROZEN_RADIO_HTML);
    const [mm, px] = toolbar.querySelectorAll<HTMLButtonElement>('button');
    expect(mm.getAttribute('role')).toBe('radio');
    expect(mm.getAttribute('aria-checked')).toBe('true');
    expect(mm.hasAttribute('aria-pressed')).toBe(false);
    expect(px.getAttribute('aria-checked')).toBe('false');
  });

  it('radio and non-radio items coexist in one row — semantics are per item', () => {
    const toolbar = renderElement(
      <PresetRow
        statusId="gap-b-mixed-status"
        className="flex gap-1"
        label="Mixed row"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Mixed row"
        actionAttr="data-gap-b-mixed-action"
        setReviewed={setReviewed}
        items={[
          { key: 'radio', radio: true, pressed: true, className: 'btn-primary', onClick: () => undefined, data: { review: 'Radio review' }, children: 'Radio' },
          { key: 'toggle', pressed: true, className: 'btn', onClick: () => undefined, data: { review: 'Toggle review' }, children: 'Toggle' },
        ]}
      />,
    );
    const [radio, toggle] = toolbar.querySelectorAll<HTMLButtonElement>('button');
    expect(radio.getAttribute('role')).toBe('radio');
    expect(radio.getAttribute('aria-checked')).toBe('true');
    expect(radio.hasAttribute('aria-pressed')).toBe(false);
    expect(toggle.hasAttribute('role')).toBe(false);
    expect(toggle.hasAttribute('aria-checked')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('kit radiogroup row equals the hand-rolled HEAD markup byte-for-byte', () => {
    const legacy = renderElement(<LegacyTransformUnitGroup unit="mm" reviewed="" />);
    const kit = renderElement(<KitTransformUnitGroup unit="mm" reviewed="" />);
    expect(canonical(kit)).toBe(canonical(legacy));
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    // The other selection state and a reviewed announcement too.
    const legacyPx = renderElement(<LegacyTransformUnitGroup unit="px" reviewed="Unit · px" />);
    const kitPx = renderElement(<KitTransformUnitGroup unit="px" reviewed="Unit · px" />);
    expect(canonical(kitPx)).toBe(canonical(legacyPx));
    expect(kitPx.outerHTML).toBe(legacyPx.outerHTML);
  });
});

describe('gap B dialog consolidation: TransformDialog + ShearDialog radiogroups', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
    act(() => useEditor.setState({ showTransform: false, showShear: false, dimUnit: 'mm' }));
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
    act(() => useEditor.setState({ showTransform: false, showShear: false }));
  });

  it('TransformDialog unit radiogroup DOM is frozen (captured from the HEAD dialog)', () => {
    const overlay = openTransform();
    expect(region(overlay, 'transform-unit-review-status').outerHTML).toBe(FROZEN_TRANSFORM_UNIT_HTML);
  });

  it('TransformDialog move-mode radiogroup DOM is frozen (captured from the HEAD dialog)', () => {
    const overlay = openTransform();
    expect(region(overlay, 'transform-move-mode-review-status').outerHTML).toBe(FROZEN_TRANSFORM_MOVE_MODE_HTML);
  });

  it('ShearDialog axis radiogroup DOM is frozen (captured from the HEAD dialog)', () => {
    const overlay = openShear();
    expect(region(overlay, 'shear-axis-review-status').outerHTML).toBe(FROZEN_SHEAR_AXIS_HTML);
  });

  it('unit arrows rove focus, apply the unit, and review it (HEAD semantics)', async () => {
    const overlay = openTransform();
    const unitRegion = region(overlay, 'transform-unit-review-status');
    const [mm, px] = regionButtons(overlay, 'transform-unit-review-status');

    // Nothing focused: HEAD falls back to index 0, so ArrowRight -> px (apply + review + focus).
    await pressDeferred(unitRegion, 'ArrowRight');
    expect(useEditor.getState().dimUnit).toBe('px');
    expect(document.activeElement).toBe(px);
    expect(reviewText('transform-unit-review-status')).toBe('Reviewing Unit · px');
    expect(px.getAttribute('aria-checked')).toBe('true');
    expect(mm.getAttribute('aria-checked')).toBe('false');

    // Wrapping: from px (index 1) ArrowRight wraps back to mm.
    await pressDeferred(unitRegion, 'ArrowRight');
    expect(document.activeElement).toBe(mm);
    expect(useEditor.getState().dimUnit).toBe('mm');
    expect(reviewText('transform-unit-review-status')).toBe('Reviewing Unit · mm');

    // Home/End jump to the absolute ends and still apply.
    await pressDeferred(unitRegion, 'End');
    expect(document.activeElement).toBe(px);
    expect(useEditor.getState().dimUnit).toBe('px');
    await pressDeferred(unitRegion, 'Home');
    expect(document.activeElement).toBe(mm);
    expect(useEditor.getState().dimUnit).toBe('mm');
  });

  it('unit buttons publish their review announcement on focus (HEAD onFocus wiring)', () => {
    const overlay = openTransform();
    const [, px] = regionButtons(overlay, 'transform-unit-review-status');
    act(() => px.focus());
    expect(reviewText('transform-unit-review-status')).toBe('Reviewing Unit · px');
  });

  it('move-mode arrows apply the mode, swap the fields, and review it (HEAD semantics)', async () => {
    const overlay = openTransform();
    const modeRegion = region(overlay, 'transform-move-mode-review-status');
    const [xy, polar] = regionButtons(overlay, 'transform-move-mode-review-status');
    expect(overlay.textContent).toContain('Move X (mm)');

    await pressDeferred(modeRegion, 'ArrowRight');
    expect(document.activeElement).toBe(polar);
    expect(polar.getAttribute('aria-checked')).toBe('true');
    expect(xy.getAttribute('aria-checked')).toBe('false');
    expect(reviewText('transform-move-mode-review-status')).toBe('Reviewing Move mode · Polar');
    expect(overlay.textContent).toContain('Distance (mm)');

    // ArrowLeft wraps from the first member back to the last.
    act(() => xy.focus());
    await pressDeferred(modeRegion, 'ArrowLeft');
    expect(document.activeElement).toBe(polar);
    expect(reviewText('transform-move-mode-review-status')).toBe('Reviewing Move mode · Polar');
  });

  it('roving indexes from the focused button, not the current value (why makeSegmentKeys was rejected)', async () => {
    const overlay = openTransform();
    const modeRegion = region(overlay, 'transform-move-mode-review-status');
    const [xy, polar] = regionButtons(overlay, 'transform-move-mode-review-status');

    // Focus polar WITHOUT activating: value stays 'xy'. The HEAD handler's
    // index source is document.activeElement, so ArrowRight wraps 1 -> 0 and
    // lands on xy (a value-indexed handler would have applied polar instead).
    act(() => polar.focus());
    await pressDeferred(modeRegion, 'ArrowRight');
    expect(document.activeElement).toBe(xy);
    expect(reviewText('transform-move-mode-review-status')).toBe('Reviewing Move mode · XY');
    expect(xy.getAttribute('aria-checked')).toBe('true');
  });

  it('shear axis arrows apply the axis and review it (HEAD semantics)', async () => {
    const overlay = openShear();
    const axisRegion = region(overlay, 'shear-axis-review-status');
    const [horizontal, vertical] = regionButtons(overlay, 'shear-axis-review-status');

    await pressDeferred(axisRegion, 'ArrowRight');
    expect(document.activeElement).toBe(vertical);
    expect(vertical.getAttribute('aria-checked')).toBe('true');
    expect(horizontal.getAttribute('aria-checked')).toBe('false');
    expect(reviewText('shear-axis-review-status')).toBe('Reviewing Axis · Vertical');

    await pressDeferred(axisRegion, 'ArrowRight');
    expect(document.activeElement).toBe(horizontal);
    expect(reviewText('shear-axis-review-status')).toBe('Reviewing Axis · Horizontal');
  });

  it('clicking a radio still applies the value directly (HEAD onClick wiring)', async () => {
    const overlay = openShear();
    const [, vertical] = regionButtons(overlay, 'shear-axis-review-status');
    await act(async () => vertical.click());
    expect(vertical.getAttribute('aria-checked')).toBe('true');
  });

  it('non-roving keys pass through untouched (no preventDefault, no navigation)', async () => {
    const overlay = openTransform();
    const unitRegion = region(overlay, 'transform-unit-review-status');
    const event = press(unitRegion, 'ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(document.body);
    expect(useEditor.getState().dimUnit).toBe('mm');
    expect(reviewText('transform-unit-review-status')).toBe('Reviewing Unit');
  });
});
