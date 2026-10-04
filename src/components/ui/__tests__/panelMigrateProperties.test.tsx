import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEditor } from '../../../store/editor';
import { t } from '../../../lib/i18n';
import { PropertiesPanel } from '../../PropertiesPanel';

/**
 * Migration freeze for PropertiesPanel (implementer T, batch C): the eight
 * hand-rolled roving handlers move onto the shared dialog kit with the
 * VariableDataDialog layout precedent — handler-only swaps, DOM byte-identical
 * (no strip rules needed; zero intended attribute deltas):
 *
 *   blendMode       → makeRovingKeys({ wrap, defer, onNavigate applies }) —
 *                     HEAD resolved the index from the FOCUSED button's
 *                     data-value (state only as a not-in-list fallback).
 *   numberPreset    → makeSegmentKeys via a number↔string marshalling shim:
 *                     HEAD resolved the index from the CURRENT VALUE with an
 *                     epsilon compare (|v-current| < 0.001), never from focus.
 *   patternKind     → makeRovingKeys({ wrap, defer, onNavigate applies }).
 *   shadowPreset    → makeRovingKeys({ wrap, defer, onNavigate applies }) —
 *                     HEAD had no component-state fallback in this group.
 *   strokeOption    → makeRovingKeys({ wrap, defer, onNavigate applies }) —
 *                     dash / line cap / line join / stroke alignment.
 *   toolbarPreset   → makeRovingKeys({ wrap, defer, onNavigate applies }) —
 *                     object-name actions + suggested-palette chips.
 *   transformAction → makeRovingKeys({ wrap, defer, onNavigate applies }) —
 *                     HEAD delegated 1:1 to handleStrokeOptionKeys.
 *   transformUnit   → makeSegmentKeys({ values: ['mm','px'], current: xfUnit }) —
 *                     the only STATE-indexed group, a role="radiogroup".
 *
 * HEAD keyboard semantics, re-verified handler-by-handler from
 * `git show HEAD:src/components/PropertiesPanel.tsx` (all eight): arrows WRAP
 * ((i ± 1 + n) % n), Home/End jump to the first/last value, nothing skips
 * disabled buttons (the object-name group arrows off disabled buttons), apply
 * runs synchronously, and focus follows on the next animation frame. Regions
 * with a review status publish the announcement from the focused button's
 * onFocus (numberPreset/strokeOption additionally re-announced via an
 * onReview callback in the same rAF); pattern/blend/shadow/palette/unit have
 * no review at all, so the kit's required setReview publisher is a no-op.
 *
 * Freeze discipline: every frozen string below was captured from the LEGACY
 * panel (== git HEAD; the working tree had no uncommitted changes to this
 * file) and must serialize byte-identically after the migration. The
 * behavior snapshots ran green against the legacy handlers first.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SUM = {
  count: 1,
  left: 200,
  top: 100,
  width: 400,
  height: 300,
  angle: 0,
  fill: '#ff0000',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  type: 'rect',
  name: 'Card',
};

const DEFAULT_STYLE = { fill: '#3d9bff', stroke: '#0f0f12', strokeWidth: 1, opacity: 1 };
const DEFAULT_SHADOW = { enabled: false, color: '#000000', blur: 12, offsetX: 4, offsetY: 4 };

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  localStorage.removeItem('vector.xfUnit');
  act(() => {
    useEditor.setState({
      selectionSummary: { ...SUM },
      selectionIds: ['obj-1'],
      palette: ['#112233', '#445566', '#778899'],
      shadow: { ...DEFAULT_SHADOW, enabled: true },
      dimUnit: 'mm',
      style: { ...DEFAULT_STYLE },
    });
  });
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  act(() => {
    useEditor.setState({
      selectionSummary: null,
      selectionIds: [],
      palette: [],
      shadow: { ...DEFAULT_SHADOW },
      style: { ...DEFAULT_STYLE },
    });
  });
});

function mountPanel(): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<PropertiesPanel />));
  return container.firstElementChild as HTMLElement;
}

/** Mounts with the gradient toggle on so the angle-preset row renders. */
function mountGradientAngle(): HTMLElement {
  const panel = mountPanel();
  const gradientToggle = Array.from(panel.querySelectorAll('h3'))
    .find((h) => h.textContent === 'Gradient')!
    .closest('div')!
    .querySelector('button[aria-pressed]')!;
  act(() => gradientToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  return panel;
}

// ---- region getters ------------------------------------------------------------

const region = (panel: HTMLElement, statusId: string) =>
  panel.querySelector<HTMLElement>(`[aria-describedby="${statusId}"]`)!;
const groupByLabel = (panel: HTMLElement, label: string) =>
  panel.querySelector<HTMLElement>(`div[role="group"][aria-label="${label}"]`)!;
const unitGroup = (panel: HTMLElement) =>
  panel.querySelector<HTMLElement>('div[role="radiogroup"][aria-label="Unit"]')!;
const valueButtons = (regionEl: HTMLElement) =>
  Array.from(regionEl.querySelectorAll<HTMLButtonElement>('button[data-value]'));

const announce = (reviewed: string, fallback: string): string => `${t('Reviewing')} ${reviewed || fallback}`;
const reviewText = (statusId: string): string | null => document.getElementById(statusId)?.textContent ?? null;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
}

// ---- frozen DOM (captured from the legacy panel; byte-identity, no strip rules) --

const FROZEN_OBJECT_NAME =
  '<div class="grid grid-cols-2 gap-1" role="group" aria-label="Object name actions" aria-describedby="properties-object-name-action-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-object-name-action-review-status" class="sr-only" aria-live="polite">Reviewing Object name actions</span>'
  + '<button type="button" class="btn text-[10px]" data-value="apply-name" disabled="" title="Apply object name">Apply name</button>'
  + '<button type="button" class="btn text-[10px]" data-value="clear-name" title="Clear object name">Clear name</button>'
  + '</div>';

const FROZEN_PALETTE =
  '<div class="flex items-center gap-1 mb-2" role="group" aria-label="Suggested palette colors" title="Use Left/Right arrows to switch options">'
  + '<button type="button" title="#112233" data-value="#112233" class="w-7 h-7 rounded border border-border hover:scale-110 transition-transform" style="background-color: rgb(17, 34, 51);"></button>'
  + '<button type="button" title="#445566" data-value="#445566" class="w-7 h-7 rounded border border-border hover:scale-110 transition-transform" style="background-color: rgb(68, 85, 102);"></button>'
  + '<button type="button" title="#778899" data-value="#778899" class="w-7 h-7 rounded border border-border hover:scale-110 transition-transform" style="background-color: rgb(119, 136, 153);"></button>'
  + '</div>';

const FROZEN_STROKE_WIDTH =
  '<div class="grid grid-cols-6 gap-1" role="group" aria-label="Stroke width presets" aria-describedby="properties-stroke-width-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-stroke-width-preset-review-status" class="sr-only" aria-live="polite">Reviewing Stroke width presets</span>'
  + '<button type="button" aria-pressed="false" title="0 px" data-value="0" class="rounded-md border px-1 py-1 text-[10px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">0</button>'
  + '<button type="button" aria-pressed="false" title="0.5 px" data-value="0.5" class="rounded-md border px-1 py-1 text-[10px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">0.5</button>'
  + '<button type="button" aria-pressed="true" title="1 px" data-value="1" class="rounded-md border px-1 py-1 text-[10px] tabular-nums transition border-accent2 bg-accent2/15 text-ink">1</button>'
  + '<button type="button" aria-pressed="false" title="2 px" data-value="2" class="rounded-md border px-1 py-1 text-[10px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">2</button>'
  + '<button type="button" aria-pressed="false" title="4 px" data-value="4" class="rounded-md border px-1 py-1 text-[10px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">4</button>'
  + '<button type="button" aria-pressed="false" title="8 px" data-value="8" class="rounded-md border px-1 py-1 text-[10px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">8</button>'
  + '</div>';

const FROZEN_OPACITY =
  '<div class="grid grid-cols-4 gap-1" role="group" aria-label="Opacity presets" aria-describedby="properties-opacity-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-opacity-preset-review-status" class="sr-only" aria-live="polite">Reviewing Opacity presets</span>'
  + '<button type="button" aria-pressed="true" data-value="1" class="rounded-md border px-1.5 py-1 text-xs tabular-nums transition border-accent2 bg-accent2/15 text-ink">100%</button>'
  + '<button type="button" aria-pressed="false" data-value="0.75" class="rounded-md border px-1.5 py-1 text-xs tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">75%</button>'
  + '<button type="button" aria-pressed="false" data-value="0.5" class="rounded-md border px-1.5 py-1 text-xs tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">50%</button>'
  + '<button type="button" aria-pressed="false" data-value="0.25" class="rounded-md border px-1.5 py-1 text-xs tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">25%</button>'
  + '</div>';

const FROZEN_GRADIENT_ANGLE =
  '<div class="grid grid-cols-6 gap-1" role="group" aria-label="Gradient angle presets" aria-describedby="properties-gradient-angle-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-gradient-angle-preset-review-status" class="sr-only" aria-live="polite">Reviewing Gradient angle presets</span>'
  + '<button type="button" aria-pressed="false" class="btn px-1 py-0.5 text-[10px] tabular-nums " data-value="0">0°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-1 py-0.5 text-[10px] tabular-nums " data-value="45">45°</button>'
  + '<button type="button" aria-pressed="true" class="btn px-1 py-0.5 text-[10px] tabular-nums border-accent2 bg-accent2/15 text-ink" data-value="90">90°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-1 py-0.5 text-[10px] tabular-nums " data-value="135">135°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-1 py-0.5 text-[10px] tabular-nums " data-value="180">180°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-1 py-0.5 text-[10px] tabular-nums " data-value="270">270°</button>'
  + '</div>';

const FROZEN_PATTERN_KIND =
  '<div class="grid grid-cols-2 gap-1" role="group" aria-label="Pattern kind" title="Use Left/Right arrows to switch options">'
  + '<button type="button" aria-pressed="true" title="Checker" data-value="checker" class="rounded-md border px-2 py-1.5 text-xs transition border-accent2 bg-accent2/15 text-ink">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect width="48" height="22" fill="#ffffff"></rect>'
  + '<rect x="0" y="0" width="6" height="6" fill="#000000"></rect><rect x="12" y="0" width="6" height="6" fill="#000000"></rect><rect x="24" y="0" width="6" height="6" fill="#000000"></rect><rect x="36" y="0" width="6" height="6" fill="#000000"></rect>'
  + '<rect x="6" y="6" width="6" height="6" fill="#000000"></rect><rect x="18" y="6" width="6" height="6" fill="#000000"></rect><rect x="30" y="6" width="6" height="6" fill="#000000"></rect><rect x="42" y="6" width="6" height="6" fill="#000000"></rect>'
  + '<rect x="0" y="12" width="6" height="6" fill="#000000"></rect><rect x="12" y="12" width="6" height="6" fill="#000000"></rect><rect x="24" y="12" width="6" height="6" fill="#000000"></rect><rect x="36" y="12" width="6" height="6" fill="#000000"></rect>'
  + '<rect x="6" y="18" width="6" height="6" fill="#000000"></rect><rect x="18" y="18" width="6" height="6" fill="#000000"></rect><rect x="30" y="18" width="6" height="6" fill="#000000"></rect><rect x="42" y="18" width="6" height="6" fill="#000000"></rect>'
  + '</svg><span>Checker</span></button>'
  + '<button type="button" aria-pressed="false" title="Stripes" data-value="stripes" class="rounded-md border px-2 py-1.5 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect width="48" height="22" fill="#ffffff"></rect>'
  + '<rect x="-2" y="0" width="5" height="28" fill="#000000" transform="rotate(25 24 11)"></rect><rect x="8" y="0" width="5" height="28" fill="#000000" transform="rotate(25 24 11)"></rect><rect x="18" y="0" width="5" height="28" fill="#000000" transform="rotate(25 24 11)"></rect>'
  + '<rect x="28" y="0" width="5" height="28" fill="#000000" transform="rotate(25 24 11)"></rect><rect x="38" y="0" width="5" height="28" fill="#000000" transform="rotate(25 24 11)"></rect><rect x="48" y="0" width="5" height="28" fill="#000000" transform="rotate(25 24 11)"></rect>'
  + '</svg><span>Stripes</span></button>'
  + '<button type="button" aria-pressed="false" title="Dots" data-value="dots" class="rounded-md border px-2 py-1.5 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect width="48" height="22" fill="#ffffff"></rect>'
  + '<circle cx="4" cy="5" r="1.8" fill="#000000"></circle><circle cx="12" cy="5" r="1.8" fill="#000000"></circle><circle cx="20" cy="5" r="1.8" fill="#000000"></circle><circle cx="28" cy="5" r="1.8" fill="#000000"></circle><circle cx="36" cy="5" r="1.8" fill="#000000"></circle><circle cx="44" cy="5" r="1.8" fill="#000000"></circle>'
  + '<circle cx="8" cy="11" r="1.8" fill="#000000"></circle><circle cx="16" cy="11" r="1.8" fill="#000000"></circle><circle cx="24" cy="11" r="1.8" fill="#000000"></circle><circle cx="32" cy="11" r="1.8" fill="#000000"></circle><circle cx="40" cy="11" r="1.8" fill="#000000"></circle><circle cx="48" cy="11" r="1.8" fill="#000000"></circle>'
  + '<circle cx="4" cy="17" r="1.8" fill="#000000"></circle><circle cx="12" cy="17" r="1.8" fill="#000000"></circle><circle cx="20" cy="17" r="1.8" fill="#000000"></circle><circle cx="28" cy="17" r="1.8" fill="#000000"></circle><circle cx="36" cy="17" r="1.8" fill="#000000"></circle><circle cx="44" cy="17" r="1.8" fill="#000000"></circle>'
  + '</svg><span>Dots</span></button>'
  + '<button type="button" aria-pressed="false" title="Crosshatch" data-value="crosshatch" class="rounded-md border px-2 py-1.5 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect width="48" height="22" fill="#ffffff"></rect>'
  + '<line x1="-10" y1="22" x2="12" y2="0" stroke="#000000" stroke-width="1.5"></line><line x1="0" y1="22" x2="22" y2="0" stroke="#000000" stroke-width="1.5"></line><line x1="10" y1="22" x2="32" y2="0" stroke="#000000" stroke-width="1.5"></line><line x1="20" y1="22" x2="42" y2="0" stroke="#000000" stroke-width="1.5"></line><line x1="30" y1="22" x2="52" y2="0" stroke="#000000" stroke-width="1.5"></line><line x1="40" y1="22" x2="62" y2="0" stroke="#000000" stroke-width="1.5"></line>'
  + '<line x1="-10" y1="0" x2="12" y2="22" stroke="#000000" stroke-width="1.5"></line><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-width="1.5"></line><line x1="10" y1="0" x2="32" y2="22" stroke="#000000" stroke-width="1.5"></line><line x1="20" y1="0" x2="42" y2="22" stroke="#000000" stroke-width="1.5"></line><line x1="30" y1="0" x2="52" y2="22" stroke="#000000" stroke-width="1.5"></line><line x1="40" y1="0" x2="62" y2="22" stroke="#000000" stroke-width="1.5"></line>'
  + '</svg><span>Crosshatch</span></button>'
  + '</div>';

const FROZEN_PATTERN_SIZE =
  '<div class="grid grid-cols-6 gap-1" role="group" aria-label="Pattern size presets" aria-describedby="properties-pattern-size-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-pattern-size-preset-review-status" class="sr-only" aria-live="polite">Reviewing Pattern size presets</span>'
  + '<button type="button" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" data-value="8" title="Apply pattern size preset">8</button>'
  + '<button type="button" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" data-value="12" title="Apply pattern size preset">12</button>'
  + '<button type="button" class="btn !py-1 !px-1 !text-[10px] border-accent2 text-accent2 bg-accent2/10" aria-pressed="true" data-value="16" title="Apply pattern size preset">16</button>'
  + '<button type="button" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" data-value="24" title="Apply pattern size preset">24</button>'
  + '<button type="button" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" data-value="32" title="Apply pattern size preset">32</button>'
  + '<button type="button" class="btn !py-1 !px-1 !text-[10px] " aria-pressed="false" data-value="48" title="Apply pattern size preset">48</button>'
  + '</div>';

const FROZEN_SHADOW_PRESETS =
  '<div class="grid grid-cols-2 gap-1" role="group" aria-label="Shadow presets" title="Use Left/Right arrows to switch options">'
  + '<button type="button" data-value="soft" aria-pressed="false" class="rounded-md border px-2 py-1 text-xs transition border-border bg-panel2 text-muted hover:border-accent2/60 hover:text-ink">Soft Shadow</button>'
  + '<button type="button" data-value="hard" aria-pressed="false" class="rounded-md border px-2 py-1 text-xs transition border-border bg-panel2 text-muted hover:border-accent2/60 hover:text-ink">Hard Shadow</button>'
  + '<button type="button" data-value="glow" aria-pressed="false" class="rounded-md border px-2 py-1 text-xs transition border-border bg-panel2 text-muted hover:border-accent2/60 hover:text-ink">Glow</button>'
  + '<button type="button" data-value="clear" aria-pressed="false" class="rounded-md border px-2 py-1 text-xs transition border-border bg-panel2 text-muted hover:border-accent2/60 hover:text-ink">Clear Shadow</button>'
  + '</div>';

const FROZEN_BLEND_MODE =
  '<div class="grid grid-cols-2 gap-1" role="group" aria-label="Blend mode" title="Use Left/Right arrows to switch options">'
  + '<button type="button" aria-pressed="true" title="Normal" data-value="source-over" class="rounded-md border px-2 py-1.5 text-left text-xs transition border-accent2 bg-accent2/15 text-ink">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect x="0" y="0" width="48" height="22" fill="#f6d365"></rect><circle cx="19" cy="11" r="9" fill="#3d9bff" opacity="0.9"></circle><circle cx="29" cy="11" r="9" fill="#ff4fa3" opacity="0.9" style="mix-blend-mode: normal;"></circle></svg><span>Normal</span></button>'
  + '<button type="button" aria-pressed="false" title="Multiply" data-value="multiply" class="rounded-md border px-2 py-1.5 text-left text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect x="0" y="0" width="48" height="22" fill="#f6d365"></rect><circle cx="19" cy="11" r="9" fill="#3d9bff" opacity="0.9"></circle><circle cx="29" cy="11" r="9" fill="#ff4fa3" opacity="0.9" style="mix-blend-mode: multiply;"></circle></svg><span>Multiply</span></button>'
  + '<button type="button" aria-pressed="false" title="Screen" data-value="screen" class="rounded-md border px-2 py-1.5 text-left text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect x="0" y="0" width="48" height="22" fill="#f6d365"></rect><circle cx="19" cy="11" r="9" fill="#3d9bff" opacity="0.9"></circle><circle cx="29" cy="11" r="9" fill="#ff4fa3" opacity="0.9" style="mix-blend-mode: screen;"></circle></svg><span>Screen</span></button>'
  + '<button type="button" aria-pressed="false" title="Overlay" data-value="overlay" class="rounded-md border px-2 py-1.5 text-left text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect x="0" y="0" width="48" height="22" fill="#f6d365"></rect><circle cx="19" cy="11" r="9" fill="#3d9bff" opacity="0.9"></circle><circle cx="29" cy="11" r="9" fill="#ff4fa3" opacity="0.9" style="mix-blend-mode: overlay;"></circle></svg><span>Overlay</span></button>'
  + '<button type="button" aria-pressed="false" title="Difference" data-value="difference" class="rounded-md border px-2 py-1.5 text-left text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">'
  + '<svg viewBox="0 0 48 22" class="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true"><rect x="0" y="0" width="48" height="22" fill="#f6d365"></rect><circle cx="19" cy="11" r="9" fill="#3d9bff" opacity="0.9"></circle><circle cx="29" cy="11" r="9" fill="#ff4fa3" opacity="0.9" style="mix-blend-mode: difference;"></circle></svg><span>Difference</span></button>'
  + '</div>';

const FROZEN_BLUR =
  '<div class="flex flex-wrap gap-1" role="group" aria-label="Blur presets" aria-describedby="properties-blur-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-blur-preset-review-status" class="sr-only" aria-live="polite">Reviewing Blur presets</span>'
  + '<button type="button" aria-pressed="true" class="btn px-2 py-0.5 text-[11px] border-accent2 bg-accent2/15 text-ink" data-value="0">0.0</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.1">0.1</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.2">0.2</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.4">0.4</button>'
  + '</div>';

const FROZEN_BRIGHTNESS =
  '<div class="flex flex-wrap gap-1" role="group" aria-label="Brightness presets" aria-describedby="properties-brightness-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-brightness-preset-review-status" class="sr-only" aria-live="polite">Reviewing Brightness presets</span>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="-0.3">-0.30</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="-0.15">-0.15</button>'
  + '<button type="button" aria-pressed="true" class="btn px-2 py-0.5 text-[11px] border-accent2 bg-accent2/15 text-ink" data-value="0">0.00</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.15">+0.15</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.3">+0.30</button>'
  + '</div>';

const FROZEN_CONTRAST =
  '<div class="flex flex-wrap gap-1" role="group" aria-label="Contrast presets" aria-describedby="properties-contrast-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-contrast-preset-review-status" class="sr-only" aria-live="polite">Reviewing Contrast presets</span>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="-0.3">-0.30</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="-0.15">-0.15</button>'
  + '<button type="button" aria-pressed="true" class="btn px-2 py-0.5 text-[11px] border-accent2 bg-accent2/15 text-ink" data-value="0">0.00</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.15">+0.15</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="0.3">+0.30</button>'
  + '</div>';

const FROZEN_HUE =
  '<div class="flex flex-wrap gap-1" role="group" aria-label="Hue presets" aria-describedby="properties-hue-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-hue-preset-review-status" class="sr-only" aria-live="polite">Reviewing Hue presets</span>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="-90">-90°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="-45">-45°</button>'
  + '<button type="button" aria-pressed="true" class="btn px-2 py-0.5 text-[11px] border-accent2 bg-accent2/15 text-ink" data-value="0">0°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="45">+45°</button>'
  + '<button type="button" aria-pressed="false" class="btn px-2 py-0.5 text-[11px] " data-value="90">+90°</button>'
  + '</div>';

const FROZEN_DASH =
  '<div class="grid grid-cols-3 gap-1" role="group" aria-label="Dash" aria-describedby="properties-dash-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-dash-preset-review-status" class="sr-only" aria-live="polite">Reviewing Dash</span>'
  + '<button type="button" aria-pressed="true" title="Solid" data-value="solid" class="h-9 rounded-md border px-2 text-xs transition border-accent2 bg-accent2/15 text-ink"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><line x1="6" y1="8" x2="58" y2="8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray=""></line></svg><span>Solid</span></button>'
  + '<button type="button" aria-pressed="false" title="Dashed" data-value="dashed" class="h-9 rounded-md border px-2 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><line x1="6" y1="8" x2="58" y2="8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 4"></line></svg><span>Dashed</span></button>'
  + '<button type="button" aria-pressed="false" title="Dotted" data-value="dotted" class="h-9 rounded-md border px-2 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><line x1="6" y1="8" x2="58" y2="8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 4"></line></svg><span>Dotted</span></button>'
  + '</div>';

const FROZEN_LINE_CAP =
  '<div class="grid grid-cols-3 gap-1" role="group" aria-label="Line cap" aria-describedby="properties-line-cap-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-line-cap-preset-review-status" class="sr-only" aria-live="polite">Reviewing Line cap</span>'
  + '<button type="button" aria-pressed="true" title="Butt" data-value="butt" class="h-9 rounded-md border px-2 text-xs transition border-accent2 bg-accent2/15 text-ink"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><line x1="14" y1="8" x2="50" y2="8" stroke="currentColor" stroke-width="6" stroke-linecap="butt"></line><line x1="14" y1="3" x2="14" y2="13" stroke="currentColor" stroke-width="1" opacity="0.35"></line><line x1="50" y1="3" x2="50" y2="13" stroke="currentColor" stroke-width="1" opacity="0.35"></line></svg><span>Butt</span></button>'
  + '<button type="button" aria-pressed="false" title="Round" data-value="round" class="h-9 rounded-md border px-2 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><line x1="14" y1="8" x2="50" y2="8" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line><line x1="14" y1="3" x2="14" y2="13" stroke="currentColor" stroke-width="1" opacity="0.35"></line><line x1="50" y1="3" x2="50" y2="13" stroke="currentColor" stroke-width="1" opacity="0.35"></line></svg><span>Round</span></button>'
  + '<button type="button" aria-pressed="false" title="Square" data-value="square" class="h-9 rounded-md border px-2 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><line x1="14" y1="8" x2="50" y2="8" stroke="currentColor" stroke-width="6" stroke-linecap="square"></line><line x1="14" y1="3" x2="14" y2="13" stroke="currentColor" stroke-width="1" opacity="0.35"></line><line x1="50" y1="3" x2="50" y2="13" stroke="currentColor" stroke-width="1" opacity="0.35"></line></svg><span>Square</span></button>'
  + '</div>';

const FROZEN_LINE_JOIN =
  '<div class="grid grid-cols-3 gap-1" role="group" aria-label="Line join" aria-describedby="properties-line-join-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-line-join-preset-review-status" class="sr-only" aria-live="polite">Reviewing Line join</span>'
  + '<button type="button" aria-pressed="true" title="Miter" data-value="miter" class="h-9 rounded-md border px-2 text-xs transition border-accent2 bg-accent2/15 text-ink"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><polyline points="21,13 32,3 43,13" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="butt" stroke-linejoin="miter"></polyline></svg><span>Miter</span></button>'
  + '<button type="button" aria-pressed="false" title="Round" data-value="round" class="h-9 rounded-md border px-2 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><polyline points="21,13 32,3 43,13" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="butt" stroke-linejoin="round"></polyline></svg><span>Round</span></button>'
  + '<button type="button" aria-pressed="false" title="Bevel" data-value="bevel" class="h-9 rounded-md border px-2 text-xs transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60"><svg viewBox="0 0 64 16" class="mb-0.5 h-3 w-full" aria-hidden="true"><polyline points="22,13 32,3 42,13" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="butt" stroke-linejoin="bevel"></polyline></svg><span>Bevel</span></button>'
  + '</div>';

const FROZEN_MITER_LIMIT =
  '<div class="grid grid-cols-4 gap-1" role="group" aria-label="Miter limit presets" aria-describedby="properties-miter-limit-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-miter-limit-preset-review-status" class="sr-only" aria-live="polite">Reviewing Miter limit presets</span>'
  + '<button type="button" aria-pressed="false" data-value="2" class="rounded-md border px-1.5 py-1 text-[11px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">2</button>'
  + '<button type="button" aria-pressed="true" data-value="4" class="rounded-md border px-1.5 py-1 text-[11px] tabular-nums transition border-accent2 bg-accent2/15 text-ink">4</button>'
  + '<button type="button" aria-pressed="false" data-value="8" class="rounded-md border px-1.5 py-1 text-[11px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">8</button>'
  + '<button type="button" aria-pressed="false" data-value="12" class="rounded-md border px-1.5 py-1 text-[11px] tabular-nums transition border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">12</button>'
  + '</div>';

const FROZEN_STROKE_ALIGN =
  '<div class="flex items-center gap-1" role="group" aria-label="Stroke alignment" aria-describedby="properties-stroke-align-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-stroke-align-preset-review-status" class="sr-only" aria-live="polite">Reviewing Stroke alignment</span>'
  + '<button type="button" aria-pressed="true" data-value="center" class="flex-1 h-7 px-2 rounded text-xs border transition-colors bg-accent/15 text-ink border-accent hover:bg-accent/20">Center</button>'
  + '<button type="button" aria-pressed="false" data-value="inside" class="flex-1 h-7 px-2 rounded text-xs border transition-colors bg-panel2 border-border text-ink hover:bg-panel3">Inside</button>'
  + '<button type="button" aria-pressed="false" data-value="outside" class="flex-1 h-7 px-2 rounded text-xs border transition-colors bg-panel2 border-border text-ink hover:bg-panel3">Outside</button>'
  + '</div>';

const FROZEN_UNIT =
  '<div class="flex gap-0.5" role="radiogroup" aria-label="Unit" title="Use Left/Right arrows to switch options">'
  + '<button type="button" role="radio" aria-checked="true" data-value="mm" class="px-1.5 py-0.5 rounded text-[10px] border transition-colors bg-accent/15 text-ink border-accent hover:bg-accent/20">mm</button>'
  + '<button type="button" role="radio" aria-checked="false" data-value="px" class="px-1.5 py-0.5 rounded text-[10px] border transition-colors bg-panel2 border-border text-muted hover:bg-panel3">px</button>'
  + '</div>';

const FROZEN_SCALE =
  '<div class="grid grid-cols-6 gap-1 mt-2" role="group" aria-label="Size scale presets" aria-describedby="properties-transform-scale-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-transform-scale-preset-review-status" class="sr-only" aria-live="polite">Reviewing Size scale presets</span>'
  + '<button type="button" aria-pressed="false" title="Scale 25%" data-value="25" class="px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">25%</button>'
  + '<button type="button" aria-pressed="false" title="Scale 50%" data-value="50" class="px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">50%</button>'
  + '<button type="button" aria-pressed="false" title="Scale 75%" data-value="75" class="px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">75%</button>'
  + '<button type="button" aria-pressed="true" title="Scale 100%" data-value="100" class="px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors border-accent2 bg-accent2/15 text-ink">100%</button>'
  + '<button type="button" aria-pressed="false" title="Scale 150%" data-value="150" class="px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">150%</button>'
  + '<button type="button" aria-pressed="false" title="Scale 200%" data-value="200" class="px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">200%</button>'
  + '</div>';

const FROZEN_FIT =
  '<div class="grid grid-cols-3 gap-1 mt-2" role="group" aria-label="Fit size presets" aria-describedby="properties-fit-size-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-fit-size-preset-review-status" class="sr-only" aria-live="polite">Reviewing Fit size presets</span>'
  + '<button type="button" aria-pressed="false" title="Fit width to document" data-value="fit-width" class="px-2 py-1 rounded border text-[10px] transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">Fit W</button>'
  + '<button type="button" aria-pressed="false" title="Fit height to document" data-value="fit-height" class="px-2 py-1 rounded border text-[10px] transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">Fit H</button>'
  + '<button type="button" aria-pressed="false" title="Fit selection inside document" data-value="fit-page" class="px-2 py-1 rounded border text-[10px] transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">Fit Page</button>'
  + '</div>';

const FROZEN_CENTER =
  '<div class="grid grid-cols-3 gap-1 mt-2" role="group" aria-label="Document center presets" aria-describedby="properties-document-center-preset-review-status" title="Use Left/Right arrows to switch options">'
  + '<span id="properties-document-center-preset-review-status" class="sr-only" aria-live="polite">Reviewing Document center presets</span>'
  + '<button type="button" aria-pressed="true" title="Center horizontally in document" data-value="center-x" class="px-2 py-1 rounded border text-[10px] transition-colors border-accent2 bg-accent2/15 text-ink">Center X</button>'
  + '<button type="button" aria-pressed="false" title="Center vertically in document" data-value="center-y" class="px-2 py-1 rounded border text-[10px] transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">Center Y</button>'
  + '<button type="button" aria-pressed="false" title="Center in document" data-value="center" class="px-2 py-1 rounded border text-[10px] transition-colors border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60">Center</button>'
  + '</div>';

describe('PropertiesPanel migration — frozen DOM (canonical state, zero deltas)', () => {
  it('object name action group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-object-name-action-review-status').outerHTML).toBe(FROZEN_OBJECT_NAME);
  });

  it('suggested palette group serializes byte-identically', () => {
    expect(groupByLabel(mountPanel(), 'Suggested palette colors').outerHTML).toBe(FROZEN_PALETTE);
  });

  it('stroke width preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-stroke-width-preset-review-status').outerHTML).toBe(FROZEN_STROKE_WIDTH);
  });

  it('opacity preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-opacity-preset-review-status').outerHTML).toBe(FROZEN_OPACITY);
  });

  it('gradient angle preset group serializes byte-identically (toggle on)', () => {
    expect(region(mountGradientAngle(), 'properties-gradient-angle-preset-review-status').outerHTML).toBe(FROZEN_GRADIENT_ANGLE);
  });

  it('pattern kind group serializes byte-identically', () => {
    expect(groupByLabel(mountPanel(), 'Pattern kind').outerHTML).toBe(FROZEN_PATTERN_KIND);
  });

  it('pattern size preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-pattern-size-preset-review-status').outerHTML).toBe(FROZEN_PATTERN_SIZE);
  });

  it('shadow preset group serializes byte-identically (shadow enabled)', () => {
    expect(groupByLabel(mountPanel(), 'Shadow presets').outerHTML).toBe(FROZEN_SHADOW_PRESETS);
  });

  it('blend quick mode group serializes byte-identically', () => {
    expect(groupByLabel(mountPanel(), 'Blend mode').outerHTML).toBe(FROZEN_BLEND_MODE);
  });

  it('blur preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-blur-preset-review-status').outerHTML).toBe(FROZEN_BLUR);
  });

  it('brightness preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-brightness-preset-review-status').outerHTML).toBe(FROZEN_BRIGHTNESS);
  });

  it('contrast preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-contrast-preset-review-status').outerHTML).toBe(FROZEN_CONTRAST);
  });

  it('hue preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-hue-preset-review-status').outerHTML).toBe(FROZEN_HUE);
  });

  it('dash preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-dash-preset-review-status').outerHTML).toBe(FROZEN_DASH);
  });

  it('line cap preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-line-cap-preset-review-status').outerHTML).toBe(FROZEN_LINE_CAP);
  });

  it('line join preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-line-join-preset-review-status').outerHTML).toBe(FROZEN_LINE_JOIN);
  });

  it('miter limit preset group serializes byte-identically (miter join default)', () => {
    expect(region(mountPanel(), 'properties-miter-limit-preset-review-status').outerHTML).toBe(FROZEN_MITER_LIMIT);
  });

  it('stroke alignment group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-stroke-align-preset-review-status').outerHTML).toBe(FROZEN_STROKE_ALIGN);
  });

  it('transform unit radiogroup serializes byte-identically (role=radio preserved)', () => {
    expect(unitGroup(mountPanel()).outerHTML).toBe(FROZEN_UNIT);
  });

  it('transform scale preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-transform-scale-preset-review-status').outerHTML).toBe(FROZEN_SCALE);
  });

  it('fit size preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-fit-size-preset-review-status').outerHTML).toBe(FROZEN_FIT);
  });

  it('document center preset group serializes byte-identically', () => {
    expect(region(mountPanel(), 'properties-document-center-preset-review-status').outerHTML).toBe(FROZEN_CENTER);
  });
});

// ---- behavior snapshots ---------------------------------------------------------

describe('numberPreset — value-indexed wrap roving (current, NOT focus)', () => {
  it('ArrowRight steps from the CURRENT value while focus sits elsewhere, applies synchronously, reviews + focuses on the next frame', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-stroke-width-preset-review-status');
    const buttons = valueButtons(reg);
    expect(reviewText('properties-stroke-width-preset-review-status')).toBe(announce('', t('Stroke width presets')));
    act(() => buttons[4].focus()); // focus "4", current stays strokeWidth 1; the focus itself reviews "4 px"
    expect(reviewText('properties-stroke-width-preset-review-status')).toBe(announce(`${t('Stroke W')} 4 px`, t('Stroke width presets')));
    const event = press(buttons[4], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    // HEAD: index of current(1)=2 → next 2; applied before the frame.
    expect(useEditor.getState().style.strokeWidth).toBe(2);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(reg.querySelector('[data-value="2"]'));
    expect(reviewText('properties-stroke-width-preset-review-status')).toBe(announce(`${t('Stroke W')} 2 px`, t('Stroke width presets')));
  });

  it('wraps ArrowRight at the last preset and ArrowLeft at the first (gradient angle)', async () => {
    const panel = mountGradientAngle();
    const reg = region(panel, 'properties-gradient-angle-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[2].focus()); // 90° active
    press(buttons[2], 'End');
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="270"]')!.getAttribute('aria-pressed')).toBe('true');
    act(() => reg.querySelector<HTMLButtonElement>('[data-value="270"]')!.focus());
    press(reg.querySelector('[data-value="270"]')!, 'ArrowRight');
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="0"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(reviewText('properties-gradient-angle-preset-review-status')).toBe(announce(`${t('Angle')} 0°`, t('Gradient angle presets')));
    press(reg.querySelector('[data-value="0"]')!, 'ArrowLeft');
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="270"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('when the current value is not a preset, ArrowRight restarts at the FIRST and ArrowLeft wraps from the LAST', () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-stroke-width-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => { useEditor.setState({ selectionSummary: { ...SUM, strokeWidth: 3 } }); });
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowRight');
    expect(useEditor.getState().style.strokeWidth).toBe(0);
    press(buttons[0], 'ArrowLeft');
    expect(useEditor.getState().style.strokeWidth).toBe(8);
  });

  it('matches the current value with the 0.001 epsilon (0.9999 resolves to preset 1)', () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-stroke-width-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => { useEditor.setState({ selectionSummary: { ...SUM, strokeWidth: 0.9999 } }); });
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowRight');
    expect(useEditor.getState().style.strokeWidth).toBe(2);
  });

  it('Home jumps to the first preset and reviews it (opacity)', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-opacity-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[1].focus());
    press(buttons[1], 'Home');
    expect(useEditor.getState().style.opacity).toBe(1);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(reg.querySelector('[data-value="1"]'));
    expect(reviewText('properties-opacity-preset-review-status')).toBe(announce(`${t('Opacity')} 100%`, t('Opacity presets')));
  });

  it('ignores non-roving keys without preventing default (ArrowDown)', () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-opacity-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[0].focus());
    const event = press(buttons[0], 'ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(useEditor.getState().style.opacity).toBe(1);
  });
});

describe('toolbarPreset — focus-indexed wrap roving', () => {
  it('object-name ArrowRight applies clear-name when changes are pending (reachable path)', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-object-name-action-review-status');
    const [applyName, clearName] = valueButtons(reg);
    const input = panel.querySelector<HTMLInputElement>('input[aria-label="Object name"]')!;
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setInput.call(input, 'Renamed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(applyName.disabled).toBe(false); // pending changes enable apply
    act(() => applyName.focus());
    const event = press(applyName, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(clearName);
    expect(reviewText('properties-object-name-action-review-status')).toBe(announce(t('Clear name'), t('Object name actions')));
  });

  it('object-name wraps onto the DISABLED apply-name without skipping it or moving focus', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-object-name-action-review-status');
    const [applyName, clearName] = valueButtons(reg);
    const input = panel.querySelector<HTMLInputElement>('input[aria-label="Object name"]')!;
    expect(applyName.disabled).toBe(true); // draft === name → no pending changes
    act(() => clearName.focus());
    press(clearName, 'ArrowRight');
    // HEAD: no skipDisabled — next is apply-name; its apply is a no-op and
    // focusing a disabled button does nothing, so focus/review stay put.
    expect(input.value).toBe('Card');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(clearName);
    expect(reviewText('properties-object-name-action-review-status')).toBe(announce(t('Clear name'), t('Object name actions')));
  });

  it('palette ArrowRight wraps the last chip back to the first and applies its fill', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Suggested palette colors');
    const chips = valueButtons(reg);
    act(() => chips[2].focus());
    press(chips[2], 'ArrowRight');
    expect(useEditor.getState().style.fill).toBe('#112233');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(chips[0]);
    press(chips[0], 'ArrowLeft');
    expect(useEditor.getState().style.fill).toBe('#778899');
  });

  it('palette Home/End reach the absolute ends', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Suggested palette colors');
    const chips = valueButtons(reg);
    act(() => chips[1].focus());
    press(chips[1], 'Home');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(chips[0]);
    act(() => chips[1].focus());
    press(chips[1], 'End');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(chips[2]);
  });
});

describe('patternKind — focus-indexed wrap roving', () => {
  it('ArrowRight applies the next kind and moves focus; wraps crosshatch → checker', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Pattern kind');
    const buttons = valueButtons(reg);
    act(() => buttons[2].focus()); // dots
    press(buttons[2], 'ArrowRight');
    expect(reg.querySelector('[data-value="crosshatch"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[3]);
    act(() => buttons[3].focus());
    press(buttons[3], 'ArrowRight');
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="checker"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Home/End jump to checker/crosshatch', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Pattern kind');
    const buttons = valueButtons(reg);
    act(() => buttons[1].focus());
    press(buttons[1], 'Home');
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="checker"]')!.getAttribute('aria-pressed')).toBe('true');
    act(() => buttons[1].focus());
    press(buttons[1], 'End');
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="crosshatch"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('shadowPreset — focus-indexed wrap roving (no state fallback)', () => {
  it('ArrowRight applies Hard Shadow into the store and the color field', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Shadow presets');
    const buttons = valueButtons(reg);
    act(() => buttons[0].focus()); // soft
    press(buttons[0], 'ArrowRight');
    const shadow = useEditor.getState().shadow;
    expect(shadow.enabled).toBe(true);
    expect(shadow.color).toBe('rgba(0,0,0,0.45)');
    expect(shadow.blur).toBe(0);
    expect(shadow.offsetX).toBe(5);
    expect(shadow.offsetY).toBe(5);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('ArrowRight onto Clear Shadow disables the whole shadow section', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Shadow presets');
    const buttons = valueButtons(reg);
    act(() => buttons[2].focus()); // glow
    press(buttons[2], 'ArrowRight');
    expect(useEditor.getState().shadow.enabled).toBe(false);
    await act(async () => { await nextFrame(); });
    expect(groupByLabel(panel, 'Shadow presets')).toBeNull();
  });
});

describe('strokeOption — focus-indexed wrap roving (dash / cap / join / align)', () => {
  it('dash ArrowRight wraps dotted → solid and reviews the label', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-dash-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[2].focus()); // dotted
    press(buttons[2], 'ArrowRight');
    expect(reg.querySelector('[data-value="solid"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[0]);
    expect(reviewText('properties-dash-preset-review-status')).toBe(announce(t('Solid'), t('Dash')));
  });

  it('dash ArrowLeft wraps solid → dotted', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-dash-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowLeft');
    expect(reg.querySelector('[data-value="dotted"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('line cap ArrowRight wraps square → butt and reviews "Line cap Butt"', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-line-cap-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[2].focus()); // square
    press(buttons[2], 'ArrowRight');
    expect(reg.querySelector('[data-value="butt"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[0]);
    expect(reviewText('properties-line-cap-preset-review-status')).toBe(announce(`${t('Line cap')} ${t('Butt')}`, t('Line cap')));
  });

  it('stroke align ArrowLeft wraps center → outside', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-stroke-align-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[0].focus()); // center
    press(buttons[0], 'ArrowLeft');
    expect(reg.querySelector('[data-value="outside"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[2]);
    expect(reviewText('properties-stroke-align-preset-review-status')).toBe(announce(`${t('Stroke alignment')} ${t('Outside')}`, t('Stroke alignment')));
  });

  it('line join End lands on bevel, which hides the miter-limit row', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-line-join-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[0].focus());
    press(buttons[0], 'End');
    expect(reg.querySelector('[data-value="bevel"]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[2]);
    expect(region(panel, 'properties-miter-limit-preset-review-status')).toBeNull();
  });
});

describe('blendMode — focus-indexed wrap roving over the quick modes', () => {
  it('ArrowRight wraps difference → source-over and syncs the All-modes select', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Blend mode');
    const buttons = valueButtons(reg);
    act(() => buttons[4].focus()); // difference
    press(buttons[4], 'ArrowRight');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[0]);
    const select = panel.querySelector<HTMLSelectElement>('select[aria-label="Blend mode"]')!;
    expect(select.value).toBe('source-over');
  });

  it('ArrowLeft wraps source-over → difference', async () => {
    const panel = mountPanel();
    const reg = groupByLabel(panel, 'Blend mode');
    const buttons = valueButtons(reg);
    act(() => buttons[0].focus());
    press(buttons[0], 'ArrowLeft');
    expect(buttons[4].getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[4]);
  });
});

describe('transformUnit — state-indexed wrap roving (radiogroup)', () => {
  it('ArrowRight switches mm → px in the store, checks the radio, and moves focus (crash fixed by the kit)', async () => {
    const panel = mountPanel();
    const reg = unitGroup(panel);
    const buttons = valueButtons(reg);
    expect(useEditor.getState().dimUnit).toBe('mm');
    act(() => buttons[0].focus()); // keydown from mm, index comes from STATE (mm)
    press(buttons[0], 'ArrowRight');
    expect(useEditor.getState().dimUnit).toBe('px');
    // Intentional delta, fixed by the migration: HEAD read event.currentTarget
    // INSIDE the rAF commit, which React 19 nulls once dispatch returns — the
    // frame threw "Cannot read properties of null (reading 'querySelector')"
    // and focus never moved. makeSegmentKeys captures the container
    // synchronously, so the formula's intended focus move now happens.
    await act(async () => { await nextFrame(); });
    expect(reg.querySelector('[data-value="px"]')!.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(reg.querySelector('[data-value="px"]'));
  });

  it('wraps ArrowRight at px back to mm; Home/End hit the absolute ends', async () => {
    const panel = mountPanel();
    const reg = unitGroup(panel);
    const buttons = valueButtons(reg);
    act(() => buttons[1].focus());
    press(buttons[1], 'ArrowRight');
    await act(async () => { await nextFrame(); });
    act(() => useEditor.setState({ dimUnit: 'px' }));
    const pxButton = reg.querySelector<HTMLButtonElement>('[data-value="px"]')!;
    act(() => pxButton.focus());
    press(pxButton, 'ArrowRight');
    expect(useEditor.getState().dimUnit).toBe('mm');
    press(pxButton, 'Home');
    expect(useEditor.getState().dimUnit).toBe('mm');
    press(pxButton, 'End');
    expect(useEditor.getState().dimUnit).toBe('px');
  });
});

describe('transformAction — fit/center wrap roving (strokeOption delegation in HEAD)', () => {
  it('fit ArrowRight wraps fit-page → fit-width and reviews its action label', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-fit-size-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[2].focus()); // fit-page (last)
    const event = press(buttons[2], 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[0]);
    expect(reviewText('properties-fit-size-preset-review-status')).toBe(announce(t('Fit width to document'), t('Fit size presets')));
  });

  it('center ArrowRight steps center-y → center and reviews its action label', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-document-center-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[1].focus()); // center-y
    press(buttons[1], 'ArrowRight');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[2]);
    expect(reviewText('properties-document-center-preset-review-status')).toBe(announce(t('Center in document'), t('Document center presets')));
  });

  it('scale ArrowRight applies the next scale preset (computed current)', async () => {
    const panel = mountPanel();
    const reg = region(panel, 'properties-transform-scale-preset-review-status');
    const buttons = valueButtons(reg);
    act(() => buttons[3].focus()); // 100 active (no canvas → current 100)
    press(buttons[3], 'ArrowRight');
    await act(async () => { await nextFrame(); });
    expect(document.activeElement).toBe(buttons[4]);
    expect(reviewText('properties-transform-scale-preset-review-status')).toBe(announce(`${t('Scale')} 150%`, t('Size scale presets')));
  });
});
