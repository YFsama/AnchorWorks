import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CharacterPanel } from '../../CharacterPanel';
import { AlignPanel } from '../../AlignPanel';
import { StatusBar } from '../../StatusBar';
import { useEditor } from '../../../store/editor';
import { t } from '../../../lib/i18n';
import { getCanvas, pushHistory, zoomToArtboard, zoomToPercent, distributeSpacing } from '../../../lib/canvasEngine';
import { toast } from '../../../lib/toast';
import { MM_TO_PX } from '../../../lib/rulerTicks';

/**
 * Freeze-then-migrate suite for CharacterPanel / AlignPanel / StatusBar
 * (dialog-kit migration, implementer X).
 *
 * HEAD semantics, re-verified handler-by-handler from git HEAD before any
 * edit (`git show HEAD:src/components/<Panel>.tsx`; CharacterPanel and
 * AlignPanel had no uncommitted changes, StatusBar's working-tree delta is
 * the already-reviewed plotter-chip delay-mount and does not touch its
 * handler):
 *
 * 1. CharacterPanel.handlePresetKeys — shared by the five preset groups
 *    (size / tracking / leading / H scale / V scale). ArrowLeft/Right/Home/
 *    End only; other keys return un-prevented. preventDefault comes first.
 *    The index resolves from the CURRENT VALUE with an epsilon compare
 *    (|value − current| < 0.001, never from focus); unmatched values seed
 *    baseIndex 0 for ArrowLeft and −1 for ArrowRight. Arrows WRAP
 *    ((base ± 1 + n) % n); Home/End hit the absolute first/last value.
 *    apply(next) runs synchronously; onReview(next) + focus of
 *    `[data-value="${next}"]` follow on the next animation frame.
 *
 * 2. AlignPanel.handleSpacingPresetKeys — shared by the three spacing
 *    groups (plain / horizontal / vertical). Identical value-indexed wrap
 *    semantics over the dimUnit-dependent spacingPresets list; apply goes
 *    through applySpacingPreset(next, direction) — setSpacing always, plus
 *    distributeSpacing(direction, mm-value) when a direction is passed
 *    (px values divided by MM_TO_PX first). rAF focus only, no review
 *    callback: these groups carry no live region.
 *
 * 3. StatusBar.handleStatusActionKeys — shared by the status toolbar div
 *    and the nested artboard-nav span. Bails when event.defaultPrevented
 *    (the nav span and toolbar div both listen; the first pass to move
 *    focus must be the only one). ArrowLeft/Right/Home/End only, other
 *    keys un-prevented. Collects `[data-status-action]` buttons inside the
 *    container, skipping disabled ones; empty → bail (un-prevented — dead
 *    branch here, both containers always render enabled action buttons).
 *    activeIndex = Math.max(0, indexOf(document.activeElement)); arrows
 *    WRAP; Home/End jump absolutely. preventDefault then synchronous focus.
 *    No review announcer anywhere in the bar.
 *
 * Migration: the two preset handlers become makeSegmentKeys behind the same
 * number↔string marshalling shim PropertiesPanel uses (epsilon match kept,
 * so 0.9999 still lands on preset 1); the five CharacterPanel group
 * containers move onto ActionToolbar (role="group", statusAs="span" —
 * byte-identical region + live region); the StatusBar handler becomes
 * makeRovingKeys({ wrap, skipDisabled, guardEmpty }) behind a one-line
 * defaultPrevented guard. AlignPanel group containers and the StatusBar
 * toolbar/nav containers stay hand-rendered (no aria-describedby in HEAD —
 * adopting ActionToolbar there would ADD one plus a live region).
 *
 * Every frozen string below was captured from the legacy panels and must
 * serialize byte-identically after the migration; the behavior snapshots
 * ran green against the legacy handlers first.
 */

vi.mock('../../../lib/canvasEngine', () => ({
  getCanvas: vi.fn(() => null),
  pushHistory: vi.fn(),
  zoomToArtboard: vi.fn(),
  zoomToPercent: vi.fn(),
  alignSelection: vi.fn(),
  distributeSelection: vi.fn(),
  distributeInArtboard: vi.fn(),
  distributeSpacing: vi.fn(),
  centerOnArtboard: vi.fn(() => false),
  flipSelection: vi.fn(),
  setKeyObject: vi.fn(() => false),
}));
vi.mock('../../../lib/textPath', () => ({
  applyTextOnPath: vi.fn(),
  canApplyTextOnPath: vi.fn(() => false),
  applyTextOnArc: vi.fn(),
  canApplyTextOnArc: vi.fn(() => false),
}));
vi.mock('../../../lib/textToOutline', () => ({
  createOutlinesFromText: vi.fn(async () => true),
  canCreateOutlines: vi.fn(() => false),
}));
vi.mock('../../../lib/textCase', () => ({ changeCaseSelection: vi.fn() }));
vi.mock('../../../lib/toast', () => ({
  toast: { success: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn(), show: vi.fn() },
}));
vi.mock('../../../lib/mcp', () => ({ registerSkill: vi.fn() }));
vi.mock('../../../lib/booleanOps', () => ({
  booleanOp: vi.fn(),
  divideSelection: vi.fn(),
  trimSelection: vi.fn(),
}));
vi.mock('../../../lib/masks', () => ({
  applyClipMask: vi.fn(),
  releaseClipMask: vi.fn(),
  makeCompoundPath: vi.fn(),
  releaseCompoundPath: vi.fn(),
}));
vi.mock('../../PlotterStatusChip', () => ({
  PlotterStatusChip: () => <span data-testid="plotter-chip" />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// StatusBar reads the injected build version global (vite `define`); tests
// see it as a plain window property.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '9.9.9';

const ARTBOARDS = [
  { id: 'ab-1', name: 'Cover', x: 0, y: 0, width: 800, height: 600 },
  { id: 'ab-2', name: 'Back', x: 850, y: 0, width: 300, height: 250 },
];

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  vi.clearAllMocks();
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  act(() => {
    useEditor.setState({
      selectionIds: [],
      selectionSummary: null,
      artboards: [],
      cutPaths: [],
      dimUnit: 'mm',
      gridVisible: false,
      snapEnabled: false,
      smartGuidesEnabled: true,
      anchorSnapEnabled: true,
      showHelpCenter: false,
      showPlotter: false,
      showCutContour: false,
    });
  });
});

function mountPanel(el: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(el));
  return container;
}

/** Dispatches keydown inside act; returns the event (defaultPrevented etc.). */
function pressSync(el: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(event); });
  return event;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Keydown + one animation frame (the preset handlers defer review/focus). */
async function pressAsync(el: Element, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => {
    el.dispatchEvent(event);
    await nextFrame();
  });
  return event;
}

const focus = (el: HTMLElement) => act(() => { el.focus(); });

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// ---- locators -------------------------------------------------------------------

const charGroup = (statusId: string) =>
  document.getElementById(statusId)!.parentElement as HTMLElement;
const charStatusText = (statusId: string) => document.getElementById(statusId)!.textContent!;
const pill = (statusId: string, value: string | number) =>
  charGroup(statusId).querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!;

const alignGroup = (label: string) =>
  (el: HTMLElement) => el.querySelector<HTMLElement>(`div[role="group"][aria-label="${label}"]`)!;
const alignPresetButton = (group: HTMLElement, value: string | number) =>
  group.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!;

const statusToolbar = (el: HTMLElement) => el.querySelector<HTMLElement>('[role="toolbar"]')!;
const statusButtons = (el: HTMLElement) =>
  Array.from(statusToolbar(el).querySelectorAll<HTMLButtonElement>('[data-status-action]'));
const navRegion = (el: HTMLElement) => el.querySelector<HTMLElement>('[role="navigation"]')!;

// ---- frozen DOM (captured byte-for-byte from the legacy panels) ------------------

const pillClass = (active: boolean) =>
  `px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
    active
      ? 'bg-accent/15 border-accent text-ink hover:bg-accent/20'
      : 'bg-panel2 border-border text-muted hover:text-ink hover:bg-panel3'
  }`;
const sizePill = (size: number, active: boolean) =>
  `<button type="button" title="Size" aria-pressed="${active}" data-value="${size}" class="${pillClass(active)}">Size <span class="opacity-70">${size}</span></button>`;

const FROZEN_SIZE_GROUP =
  '<div class="flex flex-wrap gap-1 mb-2 pl-[33%]" role="group" aria-label="Size presets" aria-describedby="character-size-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="character-size-preset-review-status" class="sr-only" aria-live="polite">Reviewing Size presets</span>'
  + [12, 18, 24, 36, 48, 72, 96, 144, 216].map((s) => sizePill(s, false)).join('')
  + '</div>';

const FROZEN_TRACKING_GROUP =
  '<div class="flex flex-wrap gap-1 mb-3 pl-[33%]" role="group" aria-label="Tracking presets" aria-describedby="character-tracking-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="character-tracking-preset-review-status" class="sr-only" aria-live="polite">Reviewing Tracking presets</span>'
  + `<button type="button" title="tight" aria-pressed="false" data-value="-50" class="${pillClass(false)}">tight <span class="opacity-70">-50</span></button>`
  + `<button type="button" title="normal" aria-pressed="true" data-value="0" class="${pillClass(true)}">normal <span class="opacity-70">0</span></button>`
  + `<button type="button" title="loose" aria-pressed="false" data-value="50" class="${pillClass(false)}">loose <span class="opacity-70">50</span></button>`
  + `<button type="button" title="wide" aria-pressed="false" data-value="200" class="${pillClass(false)}">wide <span class="opacity-70">200</span></button>`
  + '</div>';

const FROZEN_LEADING_GROUP =
  '<div class="flex flex-wrap gap-1 mb-3 pl-[33%]" role="group" aria-label="Leading presets" aria-describedby="character-leading-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="character-leading-preset-review-status" class="sr-only" aria-live="polite">Reviewing Leading presets</span>'
  + `<button type="button" title="Leading" aria-pressed="false" data-value="0.9" class="${pillClass(false)}">Leading <span class="opacity-70">0.9</span></button>`
  + `<button type="button" title="Leading" aria-pressed="false" data-value="1" class="${pillClass(false)}">Leading <span class="opacity-70">1</span></button>`
  + `<button type="button" title="Leading" aria-pressed="true" data-value="1.16" class="${pillClass(true)}">Leading <span class="opacity-70">1.16</span></button>`
  + `<button type="button" title="Leading" aria-pressed="false" data-value="1.5" class="${pillClass(false)}">Leading <span class="opacity-70">1.5</span></button>`
  + `<button type="button" title="Leading" aria-pressed="false" data-value="2" class="${pillClass(false)}">Leading <span class="opacity-70">2</span></button>`
  + '</div>';

const scalePill = (axis: 'Horizontal' | 'Vertical', value: number, active: boolean) =>
  `<button type="button" title="${axis} Scale" aria-pressed="${active}" data-value="${value}" class="${pillClass(active)}">${axis} Scale <span class="opacity-70">${value}%</span></button>`;

const FROZEN_H_SCALE_GROUP =
  '<div class="flex flex-wrap gap-1" role="group" aria-label="Horizontal scale presets" aria-describedby="character-h-scale-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="character-h-scale-preset-review-status" class="sr-only" aria-live="polite">Reviewing Horizontal scale presets</span>'
  + [75, 85, 100, 115, 125].map((v) => scalePill('Horizontal', v, v === 100)).join('')
  + '</div>';

const FROZEN_V_SCALE_GROUP =
  '<div class="flex flex-wrap gap-1" role="group" aria-label="Vertical scale presets" aria-describedby="character-v-scale-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="character-v-scale-preset-review-status" class="sr-only" aria-live="polite">Reviewing Vertical scale presets</span>'
  + [75, 100, 125].map((v) => scalePill('Vertical', v, v === 100)).join('')
  + '</div>';

const spacingBtnClass = (active: boolean) =>
  `h-6 rounded border text-[10px] transition-colors ${
    active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'
  }`;
const applyBtnClass = (active: boolean) =>
  `h-6 rounded border text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    active ? 'bg-accent/20 border-accent text-accent' : 'border-border bg-panel2 text-ink hover:bg-panel3'
  }`;

const FROZEN_SPACING_GROUP = (unit: 'mm' | 'px', activePreset: number, _disabled: boolean): string => {
  const presets = unit === 'mm' ? [0, 1, 2, 5, 10, 25] : [0, 24, 48, 96, 192, 480];
  return '<div class="grid grid-cols-6 gap-1" role="group" aria-label="Spacing presets" title="Use Left/Right arrows to switch options">'
    + presets
        .map(
          (p) =>
            `<button type="button" class="${spacingBtnClass(Math.abs(activePreset - p) < 0.001)}" title="Set spacing to ${p} ${unit}" aria-pressed="${Math.abs(activePreset - p) < 0.001}" data-value="${p}">${p}</button>`,
        )
        .join('')
    + '</div>';
};

const FROZEN_APPLY_H_GROUP = (unit: 'mm' | 'px', activePreset: number, disabled: boolean): string => {
  const presets = unit === 'mm' ? [0, 1, 2, 5, 10, 25] : [0, 24, 48, 96, 192, 480];
  return '<div class="grid grid-cols-6 gap-1" role="group" aria-label="Apply horizontal spacing preset" title="Use Left/Right arrows to switch options">'
    + presets
        .map((p) => {
          const active = Math.abs(activePreset - p) < 0.001;
          return `<button type="button" aria-pressed="${active}" class="${applyBtnClass(active)}"${disabled ? ' disabled=""' : ''} title="Apply horizontal spacing preset ${p} ${unit}" data-value="${p}">${p}H</button>`;
        })
        .join('')
    + '</div>';
};

const FROZEN_APPLY_V_GROUP = (unit: 'mm' | 'px', activePreset: number, disabled: boolean): string => {
  const presets = unit === 'mm' ? [0, 1, 2, 5, 10, 25] : [0, 24, 48, 96, 192, 480];
  return '<div class="grid grid-cols-6 gap-1 mt-1" role="group" aria-label="Apply vertical spacing preset" title="Use Left/Right arrows to switch options">'
    + presets
        .map((p) => {
          const active = Math.abs(activePreset - p) < 0.001;
          return `<button type="button" aria-pressed="${active}" class="${applyBtnClass(active)}"${disabled ? ' disabled=""' : ''} title="Apply vertical spacing preset ${p} ${unit}" data-value="${p}">${p}V</button>`;
        })
        .join('')
    + '</div>';
};

const icon = (name: string, size: number, extraClass: string, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}${extraClass}" aria-hidden="true">${inner}</svg>`;

const badge = (label: string, active: boolean, iconName: string, iconInner: string): string =>
  `<button type="button" data-status-action="true" class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${active ? 'badge-active' : 'badge-inactive'} hover:bg-panel2" title="${label} ${active ? 'on' : 'off'} — Toggle" aria-label="${label} ${active ? 'on' : 'off'}" aria-pressed="${active}">${icon(iconName, 11, '', iconInner)}${label}</button>`;

const FROZEN_STATUS_TOOLBAR =
  '<div class="ml-auto flex items-center gap-3" role="toolbar" aria-label="Status actions" title="Use arrow keys to review status actions">'
  // artboard nav (role="navigation" — hand-rendered, outside the kit's roles)
  + '<span class="flex items-center gap-0.5 px-1 rounded bg-panel2 border border-border" role="navigation" aria-label="Artboard navigation" title="Use arrow keys to review status actions">'
  + `<button type="button" data-status-action="true" class="p-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors" aria-label="Previous artboard" title="Previous artboard">${icon('chevron-left', 11, '', '<path d="m15 18-6-6 6-6"></path>')}</button>`
  + '<button type="button" data-status-action="true" class="px-1 rounded text-[10px] tabular-nums text-ink hover:bg-panel3 transition-colors" title="Cover" aria-label="Cover (1 of 2)">1/2</button>'
  + `<button type="button" data-status-action="true" class="p-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors" aria-label="Next artboard" title="Next artboard">${icon('chevron-right', 11, '', '<path d="m9 18 6-6-6-6"></path>')}</button>`
  + '</span>'
  // plotter chip skeleton (aria-hidden, NOT part of the roving set)
  + '<span class="relative" aria-hidden="true"><span class="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] tabular-nums"><span class="inline-block h-2 w-2 rounded-full bg-muted"></span>'
  + icon('usb', 11, ' text-muted', '<circle cx="10" cy="7" r="1"></circle><circle cx="4" cy="20" r="1"></circle><path d="M4.7 19.3 19 5"></path><path d="m21 3-3 1 2 2Z"></path><path d="M9.26 7.68 5 12l2 5"></path><path d="m10 14 5 2 3.5-3.5"></path><path d="m18 12 1-1 1 1-1 1Z"></path>')
  + '<span class="text-muted">Plotter</span>'
  + icon('chevron-up', 10, ' text-muted', '<path d="m18 15-6-6-6 6"></path>')
  + '</span></span>'
  + badge('GRID', false, 'hash', '<line x1="4" x2="20" y1="9" y2="9"></line><line x1="4" x2="20" y1="15" y2="15"></line><line x1="10" x2="8" y1="3" y2="21"></line><line x1="16" x2="14" y1="3" y2="21"></line>')
  + badge('SNAP', false, 'magnet', '<path d="m12 15 4 4"></path><path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"></path><path d="m5 8 4 4"></path>')
  + badge('GUIDES', true, 'crosshair', '<circle cx="12" cy="12" r="10"></circle><line x1="22" x2="18" y1="12" y2="12"></line><line x1="6" x2="2" y1="12" y2="12"></line><line x1="12" x2="12" y1="6" y2="2"></line><line x1="12" x2="12" y1="22" y2="18"></line>')
  + badge('ANCHOR', true, 'target', '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>')
  + '<span class="statusbar-sep" aria-hidden="true"></span>'
  + '<button type="button" data-status-action="true" class="tabular-nums text-muted hover:text-ink transition-colors" title="Anchorworks v9.9.9" aria-label="Anchorworks Version 9.9.9">v9.9.9</button>'
  + '</div>';

// ---- CharacterPanel --------------------------------------------------------------

describe('CharacterPanel — frozen legacy DOM (byte-exact)', () => {
  it('the five preset groups serialize byte-identically (default props)', () => {
    mountPanel(<CharacterPanel />);
    expect(charGroup('character-size-preset-review-status').outerHTML).toBe(FROZEN_SIZE_GROUP);
    expect(charGroup('character-tracking-preset-review-status').outerHTML).toBe(FROZEN_TRACKING_GROUP);
    expect(charGroup('character-leading-preset-review-status').outerHTML).toBe(FROZEN_LEADING_GROUP);
    expect(charGroup('character-h-scale-preset-review-status').outerHTML).toBe(FROZEN_H_SCALE_GROUP);
    expect(charGroup('character-v-scale-preset-review-status').outerHTML).toBe(FROZEN_V_SCALE_GROUP);
  });

  it('the initial review announcers carry their fallbacks', () => {
    mountPanel(<CharacterPanel />);
    expect(charStatusText('character-size-preset-review-status')).toBe(`${t('Reviewing')} ${t('Size presets')}`);
    expect(charStatusText('character-tracking-preset-review-status')).toBe(`${t('Reviewing')} ${t('Tracking presets')}`);
    expect(charStatusText('character-leading-preset-review-status')).toBe(`${t('Reviewing')} ${t('Leading presets')}`);
    expect(charStatusText('character-h-scale-preset-review-status')).toBe(`${t('Reviewing')} ${t('Horizontal scale presets')}`);
    expect(charStatusText('character-v-scale-preset-review-status')).toBe(`${t('Reviewing')} ${t('Vertical scale presets')}`);
  });
});

describe('CharacterPanel — value-indexed wrapping segment roving', () => {
  it('ArrowRight applies the next preset, republishes the review, and focuses it next frame', async () => {
    const c = mountPanel(<CharacterPanel />);
    const input = c.querySelector<HTMLInputElement>('input[type="number"]')!;
    const statusId = 'character-size-preset-review-status';
    const p24 = pill(statusId, 24);
    // Click first so the CURRENT VALUE (what the handler indexes by) is 24;
    // the review announcer follows FOCUS (legacy onFocus), so focus after.
    act(() => p24.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    focus(p24);
    expect(p24.getAttribute('aria-pressed')).toBe('true');
    expect(charStatusText(statusId)).toBe(`${t('Reviewing')} ${t('Size')} 24px`);
    const event = await pressAsync(p24, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(pill(statusId, 36));
    expect(charStatusText(statusId)).toBe(`${t('Reviewing')} ${t('Size')} 36px`);
    expect(input.value).toBe('36');
    expect(pill(statusId, 36).getAttribute('aria-pressed')).toBe('true');
  });

  it('ArrowLeft wraps 12 → 216 and Home/End jump absolutely', async () => {
    mountPanel(<CharacterPanel />);
    const statusId = 'character-size-preset-review-status';
    const p12 = pill(statusId, 12);
    // Click first so the current value is 12 (matched at index 0) — then
    // ArrowLeft genuinely wraps to the last preset, not the unmatched path.
    act(() => p12.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    focus(p12);
    await pressAsync(p12, 'ArrowLeft');
    expect(document.activeElement).toBe(pill(statusId, 216));
    expect(charStatusText(statusId)).toBe(`${t('Reviewing')} ${t('Size')} 216px`);
    await pressAsync(document.activeElement as HTMLElement, 'Home');
    expect(document.activeElement).toBe(p12);
    await pressAsync(document.activeElement as HTMLElement, 'End');
    expect(document.activeElement).toBe(pill(statusId, 216));
  });

  it('unmatched current value seeds ArrowRight from the first and ArrowLeft from the last preset', async () => {
    mountPanel(<CharacterPanel />);
    const statusId = 'character-size-preset-review-status';
    // Default props.fontSize = 32 — not among SIZE_PRESETS. The handler reads
    // the CURRENT VALUE, not the focused pill, so focusing 12 and going
    // right still resolves from 32 → baseIndex −1 → first preset (12).
    const p12 = pill(statusId, 12);
    focus(p12);
    await pressAsync(p12, 'ArrowRight');
    expect(document.activeElement).toBe(p12);
    expect(charStatusText(statusId)).toBe(`${t('Reviewing')} ${t('Size')} 12px`);
    // ArrowLeft from unmatched: baseIndex 0 → (0−1+9)%9 = 8 → 216.
    await pressAsync(p12, 'ArrowLeft');
    expect(document.activeElement).toBe(pill(statusId, 216));
    expect(charStatusText(statusId)).toBe(`${t('Reviewing')} ${t('Size')} 216px`);
  });

  it('ignores non-roving keys without preventing default', () => {
    mountPanel(<CharacterPanel />);
    const p12 = pill('character-size-preset-review-status', 12);
    focus(p12);
    const before = charStatusText('character-size-preset-review-status');
    expect(pressSync(p12, 'ArrowUp').defaultPrevented).toBe(false);
    expect(pressSync(p12, 'ArrowDown').defaultPrevented).toBe(false);
    expect(pressSync(p12, 'Enter').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(p12);
    expect(charStatusText('character-size-preset-review-status')).toBe(before);
  });

  it('tracking, leading, H-scale and V-scale groups share the same semantics', async () => {
    mountPanel(<CharacterPanel />);
    // Tracking: current 0 (matched, index 1) → ArrowRight applies 50.
    const track = pill('character-tracking-preset-review-status', -50);
    focus(track);
    await pressAsync(track, 'ArrowRight');
    expect(document.activeElement).toBe(pill('character-tracking-preset-review-status', 50));
    expect(charStatusText('character-tracking-preset-review-status')).toBe(`${t('Reviewing')} ${t('Tracking')} 50`);
    // Leading: current 1.16 → ArrowRight applies 1.5 (epsilon on floats).
    const lead = pill('character-leading-preset-review-status', 1.16);
    focus(lead);
    await pressAsync(lead, 'ArrowRight');
    expect(document.activeElement).toBe(pill('character-leading-preset-review-status', 1.5));
    expect(charStatusText('character-leading-preset-review-status')).toBe(`${t('Reviewing')} ${t('Leading')} 1.5`);
    // H scale: current 100 → ArrowRight applies 115 (percent → 0.1..10 clamp).
    const h85 = pill('character-h-scale-preset-review-status', 85);
    focus(h85);
    await pressAsync(h85, 'ArrowRight');
    expect(document.activeElement).toBe(pill('character-h-scale-preset-review-status', 115));
    expect(charStatusText('character-h-scale-preset-review-status')).toBe(`${t('Reviewing')} ${t('Horizontal Scale')} 115%`);
    // V scale: current 100 → ArrowRight applies 125.
    const v100 = pill('character-v-scale-preset-review-status', 100);
    focus(v100);
    await pressAsync(v100, 'ArrowRight');
    expect(document.activeElement).toBe(pill('character-v-scale-preset-review-status', 125));
    expect(charStatusText('character-v-scale-preset-review-status')).toBe(`${t('Reviewing')} ${t('Vertical Scale')} 125%`);
  });

  it('clicking a pill applies the value through patchActiveText (set + setCoords + render + history)', () => {
    const fakeText = { type: 'i-text', set: vi.fn(), setCoords: vi.fn() };
    const fakeCanvas = {
      getActiveObject: () => fakeText,
      getActiveObjects: () => [fakeText],
      requestRenderAll: vi.fn(),
    };
    vi.mocked(getCanvas).mockReturnValue(fakeCanvas as never);
    mountPanel(<CharacterPanel />);
    act(() => pill('character-size-preset-review-status', 72).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(fakeText.set).toHaveBeenCalledWith({ fontSize: 72 });
    expect(fakeText.setCoords).toHaveBeenCalled();
    expect(fakeCanvas.requestRenderAll).toHaveBeenCalled();
    expect(pushHistory).toHaveBeenCalled();
    expect(pill('character-size-preset-review-status', 72).getAttribute('aria-pressed')).toBe('true');
  });
});

// ---- AlignPanel ------------------------------------------------------------------

describe('AlignPanel — frozen legacy DOM (byte-exact)', () => {
  it('the three spacing groups serialize byte-identically (mm, 5 active, 2 selected)', () => {
    act(() => useEditor.setState({ selectionIds: ['a', 'b'], dimUnit: 'mm' }));
    const c = mountPanel(<AlignPanel />);
    expect(alignGroup('Spacing presets')(c).outerHTML).toBe(FROZEN_SPACING_GROUP('mm', 5, false));
    expect(alignGroup('Apply horizontal spacing preset')(c).outerHTML).toBe(FROZEN_APPLY_H_GROUP('mm', 5, false));
    expect(alignGroup('Apply vertical spacing preset')(c).outerHTML).toBe(FROZEN_APPLY_V_GROUP('mm', 5, false));
  });

  it('px unit swaps the preset ladder and the H/V pills disable below 2 selected', () => {
    act(() => useEditor.setState({ selectionIds: [], dimUnit: 'px' }));
    const c = mountPanel(<AlignPanel />);
    expect(alignGroup('Spacing presets')(c).outerHTML).toBe(FROZEN_SPACING_GROUP('px', 5, true));
    expect(alignGroup('Apply horizontal spacing preset')(c).outerHTML).toBe(FROZEN_APPLY_H_GROUP('px', 5, true));
    expect(alignGroup('Apply vertical spacing preset')(c).outerHTML).toBe(FROZEN_APPLY_V_GROUP('px', 5, true));
  });
});

describe('AlignPanel — spacing preset roving', () => {
  beforeEach(() => {
    act(() => useEditor.setState({ selectionIds: ['a', 'b'], dimUnit: 'mm' }));
  });

  it('ArrowRight on the plain group applies 10 without distributing', async () => {
    const c = mountPanel(<AlignPanel />);
    const group = alignGroup('Spacing presets')(c);
    const p5 = alignPresetButton(group, 5);
    focus(p5);
    const event = await pressAsync(p5, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(alignPresetButton(group, 10));
    // Shared spacing state: the active pill moves in ALL three groups.
    expect(alignPresetButton(group, 10).getAttribute('aria-pressed')).toBe('true');
    expect(alignPresetButton(alignGroup('Apply horizontal spacing preset')(c), 10).getAttribute('aria-pressed')).toBe('true');
    expect(distributeSpacing).not.toHaveBeenCalled();
  });

  it('ArrowLeft on the horizontal group wraps 0 → 25 and distributes in mm', async () => {
    const c = mountPanel(<AlignPanel />);
    const group = alignGroup('Apply horizontal spacing preset')(c);
    const p0 = alignPresetButton(group, 0);
    // Click first so spacing = 0 (matched at index 0) — then ArrowLeft
    // genuinely wraps to the last preset.
    act(() => p0.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(distributeSpacing).toHaveBeenCalledWith('horizontal', 0);
    focus(p0);
    await pressAsync(p0, 'ArrowLeft');
    expect(document.activeElement).toBe(alignPresetButton(group, 25));
    expect(distributeSpacing).toHaveBeenCalledWith('horizontal', 25);
  });

  it('ArrowRight on the vertical group applies the next preset and distributes', async () => {
    const c = mountPanel(<AlignPanel />);
    const group = alignGroup('Apply vertical spacing preset')(c);
    const p5 = alignPresetButton(group, 5);
    focus(p5);
    await pressAsync(p5, 'ArrowRight');
    expect(document.activeElement).toBe(alignPresetButton(group, 10));
    expect(distributeSpacing).toHaveBeenCalledWith('vertical', 10);
  });

  it('unmatched spacing (typed 3.5) seeds ArrowLeft from the last preset', async () => {
    const c = mountPanel(<AlignPanel />);
    const input = c.querySelector<HTMLInputElement>('input[type="number"]')!;
    typeInto(input, '3.5');
    expect(input.value).toBe('3.5');
    const group = alignGroup('Spacing presets')(c);
    const p5 = alignPresetButton(group, 5);
    focus(p5);
    await pressAsync(p5, 'ArrowLeft');
    expect(document.activeElement).toBe(alignPresetButton(group, 25));
    expect(alignPresetButton(group, 25).getAttribute('aria-pressed')).toBe('true');
    expect(distributeSpacing).not.toHaveBeenCalled();
  });

  it('px unit divides the preset by MM_TO_PX before distributing', async () => {
    act(() => useEditor.setState({ dimUnit: 'px' }));
    const c = mountPanel(<AlignPanel />);
    const group = alignGroup('Apply horizontal spacing preset')(c);
    const p24 = alignPresetButton(group, 24);
    // Click first so spacing = 24 (matched at index 1) → ArrowRight applies 48.
    act(() => p24.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    focus(p24);
    await pressAsync(p24, 'ArrowRight');
    expect(distributeSpacing).toHaveBeenCalledWith('horizontal', 48 / MM_TO_PX);
  });

  it('clicking an H pill applies the preset with direction; ignores non-roving keys', () => {
    const c = mountPanel(<AlignPanel />);
    act(() => alignPresetButton(alignGroup('Apply horizontal spacing preset')(c), 2).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(distributeSpacing).toHaveBeenCalledWith('horizontal', 2);
    const group = alignGroup('Spacing presets')(c);
    const p2 = alignPresetButton(group, 2);
    focus(p2);
    expect(pressSync(p2, 'ArrowUp').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(p2);
  });
});

// ---- StatusBar -------------------------------------------------------------------

describe('StatusBar — frozen legacy DOM (byte-exact)', () => {
  it('the status actions toolbar serializes byte-identically (skeleton state)', () => {
    act(() => useEditor.setState({ artboards: ARTBOARDS }));
    const c = mountPanel(<StatusBar />);
    expect(statusToolbar(c).outerHTML).toBe(FROZEN_STATUS_TOOLBAR);
  });
});

describe('StatusBar — toolbar roving (wrap, skip-disabled, sync focus)', () => {
  beforeEach(() => {
    act(() => useEditor.setState({ artboards: ARTBOARDS }));
  });

  it('ArrowRight steps GRID → SNAP and ArrowLeft wraps GRID back onto nav-next', () => {
    const c = mountPanel(<StatusBar />);
    const [prev, counter, next, grid, snap] = statusButtons(c);
    void prev; void counter;
    focus(grid);
    expect(pressSync(grid, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(snap);
    focus(grid);
    pressSync(grid, 'ArrowLeft');
    expect(document.activeElement).toBe(next);
  });

  it('Home/End jump absolutely and arrows wrap at both ends', () => {
    const c = mountPanel(<StatusBar />);
    const [prev, , , grid, , , , version] = statusButtons(c);
    focus(grid);
    pressSync(grid, 'End');
    expect(document.activeElement).toBe(version);
    focus(version);
    pressSync(version, 'ArrowRight');
    expect(document.activeElement).toBe(prev);
    pressSync(prev, 'Home');
    expect(document.activeElement).toBe(prev); // Home from prev stays (index 0)
  });

  it('ignores non-roving keys without preventing default', () => {
    const c = mountPanel(<StatusBar />);
    const [, , , grid] = statusButtons(c);
    focus(grid);
    expect(pressSync(grid, 'ArrowUp').defaultPrevented).toBe(false);
    expect(pressSync(grid, 'Enter').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(grid);
  });

  it('the nested artboard-nav span roves its own three buttons, and the bubbled toolbar pass does not double-move focus', () => {
    const c = mountPanel(<StatusBar />);
    const nav = navRegion(c);
    const [navPrev, navCounter, navNext] = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-status-action]'));
    // ArrowRight inside the nav span: prev → counter. The same bubbled event
    // reaches the toolbar div's handler, which must bail (defaultPrevented)
    // instead of moving focus again (legacy guard, kept by the migration).
    focus(navPrev);
    expect(pressSync(navPrev, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(navCounter);
    focus(navCounter);
    pressSync(navCounter, 'ArrowRight');
    expect(document.activeElement).toBe(navNext);
    focus(navNext);
    pressSync(navNext, 'ArrowLeft');
    expect(document.activeElement).toBe(navCounter);
  });

  it('prev/next clicks wrap the artboard index and zoom to the target artboard', () => {
    const c = mountPanel(<StatusBar />);
    const [navPrev, , navNext] = Array.from(navRegion(c).querySelectorAll<HTMLButtonElement>('[data-status-action]'));
    // zoomToArtboard receives the bare geometry object, not the artboard record.
    const geo = (i: number) => ({ x: ARTBOARDS[i].x, y: ARTBOARDS[i].y, width: ARTBOARDS[i].width, height: ARTBOARDS[i].height });
    act(() => navNext.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(zoomToArtboard).toHaveBeenCalledWith(geo(1));
    act(() => navNext.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // 2 artboards: next from index 1 wraps to 0.
    expect(zoomToArtboard).toHaveBeenCalledWith(geo(0));
    act(() => navPrev.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(zoomToArtboard).toHaveBeenLastCalledWith(geo(1));
  });

  it('badge clicks toggle store flags; the version button opens Help Center', () => {
    const c = mountPanel(<StatusBar />);
    const [, , , grid, snap] = statusButtons(c);
    const version = statusButtons(c)[7];
    act(() => grid.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(useEditor.getState().gridVisible).toBe(true);
    act(() => snap.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(useEditor.getState().snapEnabled).toBe(true);
    act(() => version.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(useEditor.getState().showHelpCenter).toBe(true);
    expect(grid.getAttribute('aria-pressed')).toBe('true');
  });

  it('the cut-path chip routes plain / modifier clicks and joins the roving set', () => {
    act(() => useEditor.setState({ cutPaths: [{ points: [], closed: false } as never] }));
    const c = mountPanel(<StatusBar />);
    const cut = () => statusToolbar(c).querySelector<HTMLButtonElement>('button[title*="Send to Plotter"]')!;
    const cutIndex = statusButtons(c).indexOf(cut());
    expect(cutIndex).toBe(3); // after the three nav buttons, before the badges
    act(() => cut().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(useEditor.getState().showPlotter).toBe(true);
    // Ctrl-click clears the cut paths (which unmounts the chip).
    act(() => cut().dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    expect(useEditor.getState().cutPaths).toHaveLength(0);
    expect(toast.success).toHaveBeenCalledWith(t('Cut paths cleared'), { title: t('Cut prep') });
    expect(statusToolbar(c).querySelector('button[title*="Send to Plotter"]')).toBe(null);
    // Shift-click on a freshly-mounted chip opens Cut Contour instead.
    act(() => useEditor.setState({ cutPaths: [{ points: [], closed: false } as never] }));
    act(() => cut().dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })));
    expect(useEditor.getState().showCutContour).toBe(true);
  });

  it('the plotter chip delay-mounts behind the skeleton after 250 ms', async () => {
    vi.useFakeTimers();
    try {
      act(() => useEditor.setState({ artboards: ARTBOARDS }));
      const c = mountPanel(<StatusBar />);
      expect(c.querySelector('[data-testid="plotter-chip"]')).toBe(null);
      expect(statusToolbar(c).innerHTML).toContain('class="relative"');
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      expect(c.querySelector('[data-testid="plotter-chip"]')).not.toBe(null);
      // The skeleton is gone and never joins the roving set either way.
      expect(statusButtons(c).length).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ZoomField edits commit on Enter and cancel on Escape', async () => {
    act(() => useEditor.setState({ artboards: ARTBOARDS }));
    const c = mountPanel(<StatusBar />);
    const zoomButton = () =>
      Array.from(c.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('%'))!;
    act(() => zoomButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const input = c.querySelector<HTMLInputElement>('input[aria-label="Set zoom percentage"]')!;
    expect(input).toBeTruthy();
    typeInto(input, '150');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(zoomToPercent).toHaveBeenCalledWith(150);
    // The commit swapped the input back to a (new) button node — re-query.
    act(() => zoomButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const input2 = c.querySelector<HTMLInputElement>('input[aria-label="Set zoom percentage"]')!;
    await act(async () => {
      input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(c.querySelector('input[aria-label="Set zoom percentage"]')).toBe(null);
  });
});
