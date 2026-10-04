import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LayersPanel } from '../../LayersPanel';
import { useEditor } from '../../../store/editor';
import { t } from '../../../lib/i18n';
import { selectVisibleObjects } from '../../../lib/canvasEngine';
import { toast } from '../../../lib/toast';

/**
 * Freeze-then-migrate suite for LayersPanel (batch C, dialog-kit migration).
 *
 * The frozen strings and behavior snapshots below were captured from the
 * pre-migration handwritten implementation at git HEAD (the file had no
 * working-tree diff, so HEAD is the byte baseline). HEAD owns exactly ONE
 * roving handler, `handleActionToolbarKeys`, shared by two sibling toolbars:
 *
 *   1. the QUICK-ACTIONS toolbar — role="toolbar", [data-layer-action]
 *      buttons, wrapping ArrowLeft/Right/Home/End over the ENABLED buttons
 *      (disabled filtered before indexing), review announce from
 *      data-layer-action-review with trimmed text-content fallback, focus
 *      committed synchronously, and the review live region
 *      (#layer-action-review-status) rendered as its first child;
 *   2. the SEARCH-ACTIONS toolbar — same handler, className="contents", its
 *      aria-describedby points at the quick toolbar's live region (the
 *      ArtboardsPanel order/fit externalStatus shape), and all 146 match
 *      buttons disable on `layerMatchCounts.total === 0` except the final
 *      "Clear search".
 *
 * The migration swaps the handler for makeRovingKeys({ wrap, skipDisabled,
 * guardEmpty, reviewKey: 'layerActionReview', fallbackToText }) and the two
 * containers for ActionToolbar (the search one via externalStatus). Two HEAD
 * deltas from the kit defaults are UNREACHABLE here and accepted (the
 * StatusBar/ArtboardsPanel precedent): the empty-collection bail ran BEFORE
 * preventDefault (both toolbars always render an enabled button — the quick
 * set is never disabled, the search set always ends with Clear search), and
 * the legacy container-focus fallback ("ArrowRight starts before the first
 * button") only diverges when the active element is not one of the matched
 * buttons — both containers hold nothing else focusable. The listbox stays
 * hand-rendered: role="listbox" + aria-activedescendant roving is outside the
 * kit's container roles (the ArtboardsPanel role="list" precedent), and its
 * arrow handler is untouched legacy covered here as a regression snapshot.
 *
 * Freeze scope note: the quick toolbar, both list rows, the initial announcer
 * texts, and the search toolbar's container tag + first/last buttons are
 * frozen BYTE-EXACT. The 146 search buttons are pinned by an ordered
 * review|enabled signature (~9 KB instead of a ~35 KB blob) — the buttons
 * themselves stay verbatim JSX, so the byte risk lives only in the container
 * and the shared live region, both of which are byte-frozen.
 */

vi.mock('../../../lib/canvasEngine', () => ({
  getCanvas: vi.fn(() => canvasHolder.c),
  pushHistory: vi.fn(),
  selectVisibleObjects: vi.fn(() => 0),
  selectUnlockedObjects: vi.fn(() => 0),
  hideOthers: vi.fn(() => 0),
  showAll: vi.fn(() => 0),
  unlockAll: vi.fn(() => 0),
}));
vi.mock('../../../lib/layerOps', () => {
  const mod: Record<string, unknown> = { LAYER_BLEND_MODES: [] };
  for (const name of [
    'addAnchorsToLayerObjectsById', 'applyGraphicStyleToLayerObjectsById', 'blendLayerObjectsById',
    'changeLayerObjectNameCaseById', 'cleanLayerObjectNamesById', 'cleanUpLayerObjectsById',
    'clearLayerObjectAppearanceById', 'clearLayerObjectGradientFillById', 'clearLayerObjectImageFiltersById',
    'clearLayerObjectPatternFillById', 'detachLayerSymbolInstancesById', 'expandLayerObjectAppearanceById',
    'expandLayerObjectClippingMasksById', 'flattenLayerObjectTransparencyById', 'freeDistortLayerObjectsById',
    'grommetLayerObjectsById', 'groupLayerObjectsById', 'knifeSplitLayerObjectsById',
    'makeLayerCompoundPathById', 'moveLayerObjectsById', 'multiOutlineLayerObjectsById',
    'normalizeLayerBlendMode', 'offsetLayerObjectsById', 'outlineLayerObjectStrokesById',
    'puckerLayerObjectsById', 'roughenLayerObjectsById', 'zigzagLayerObjectsById',
    'twistLayerObjectsById', 'normalizeLayerBoolean', 'normalizeLayerDash',
    'normalizeLayerPaint', 'normalizeLayerStrokeCap', 'normalizeLayerStrokeJoin',
    'renumberLayerObjectsById', 'releaseLayerCompoundPathsById', 'releaseLayerObjectClippingMasksById',
    'replaceLayerObjectNamesById', 'rhinestoneLayerObjectsById', 'reverseLayerObjectsById',
    'roundCornersLayerObjectsById', 'scissorsSplitLayerObjectsById', 'selectSameLayerAppearanceById',
    'selectSameLayerAssetById', 'selectSameLayerComplexAppearanceById', 'selectSameLayerGeometryById',
    'selectSameLayerObjectById', 'selectSameLayerProductionById', 'selectSameLayerTextById',
    'setLayerObjectBlendModeById', 'setLayerObjectDashById', 'setLayerObjectGeometryById',
    'setLayerObjectGeometryPairById', 'setLayerObjectMiterLimitById', 'setLayerObjectOpacityById',
    'setLayerObjectOverprintById', 'setLayerObjectPaintById', 'setLayerObjectPrintMarkKindById',
    'setLayerObjectShadowById', 'setLayerObjectStrokeStyleById', 'setLayerObjectStrokeUniformById',
    'setLayerObjectStrokeWidthById', 'setLayerObjectTextStyleById', 'simplifyLayerObjectsById',
    'smoothLayerObjectsById', 'splitLayerObjectsIntoGridById', 'targetLayerObjectsById',
    'ungroupLayerObjectsById', 'variableWidthLayerObjectsById', 'warpLayerObjectsById',
  ]) mod[name] = vi.fn();
  return mod;
});
vi.mock('../../../lib/toast', () => ({
  toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() },
}));
vi.mock('../../../lib/confirm', () => ({ showConfirm: vi.fn(async () => false) }));
vi.mock('../../../lib/graphicStyles', () => ({ loadGraphicStyles: vi.fn(() => []) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- fake canvas ------------------------------------------------------------------

interface FakeObj {
  _id: string;
  type: string;
  visible: boolean;
  lockMovementX: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  fill: string;
  stroke: string;
  name: string | null;
  toDataURL: () => string;
  set: (opts: Record<string, unknown>) => void;
}

const makeObj = (over: Partial<FakeObj> & Pick<FakeObj, '_id' | 'type'>): FakeObj => ({
  visible: true,
  lockMovementX: false,
  left: 10,
  top: 20,
  width: 30,
  height: 40,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  fill: '#112233',
  stroke: '',
  name: null,
  toDataURL: () => '',
  set(opts: Record<string, unknown>) { Object.assign(this, opts); },
  ...over,
});

// Canvas order is bottom→top, so the displayed (reversed) rows are [circle, rect]:
// row 0 is the hidden+locked Circle, row 1 the visible unlocked Rect.
const RECT = makeObj({ _id: '7', type: 'rect' });
const CIRCLE = makeObj({ _id: '3', type: 'circle', visible: false, lockMovementX: true });
const CANVAS_OBJECTS: FakeObj[] = [RECT, CIRCLE];

function makeFakeCanvas(objs: FakeObj[]) {
  return {
    getObjects: () => objs,
    on: () => {},
    off: () => {},
    requestRenderAll: () => {},
    setActiveObject: vi.fn(),
    discardActiveObject: () => {},
    remove: vi.fn(),
    add: vi.fn(),
    moveObjectTo: vi.fn(),
  };
}

const canvasHolder: { c: ReturnType<typeof makeFakeCanvas> | null } = { c: null };

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  canvasHolder.c = makeFakeCanvas(CANVAS_OBJECTS);
  // jsdom 27 has no scrollIntoView — the listbox roving calls it on move.
  (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView = () => {};
  act(() => useEditor.setState({ selectionIds: [] }));
  vi.mocked(selectVisibleObjects).mockClear();
  vi.mocked(toast.warn).mockClear();
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
});

function mountPanel(): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<LayersPanel />));
  return container;
}

/** Dispatches keydown inside act; returns defaultPrevented. */
function pressSync(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(event); });
  return event.defaultPrevented;
}

const focus = (el: HTMLElement) => act(() => { el.focus(); });

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// ---- locators ---------------------------------------------------------------------

const quickToolbar = (c: HTMLElement) => c.querySelector<HTMLElement>('[aria-label="Layer quick actions"]')!;
const searchToolbar = (c: HTMLElement) => c.querySelector<HTMLElement>('[aria-label="Layer search actions"]')!;
const searchInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="search"]')!;
const quickActions = (c: HTMLElement) => Array.from(quickToolbar(c).querySelectorAll<HTMLButtonElement>('[data-layer-action]'));
const searchActions = (c: HTMLElement) => Array.from(searchToolbar(c).querySelectorAll<HTMLButtonElement>('[data-layer-action]'));
const listbox = (c: HTMLElement) => c.querySelector<HTMLElement>('[role="listbox"]')!;
const listRows = (c: HTMLElement) => Array.from(listbox(c).querySelectorAll<HTMLElement>('[data-row-idx]'));
const statusText = () => document.getElementById('layer-action-review-status')!.textContent!;
const listStatusText = () => document.getElementById('layer-review-status')!.textContent!;
const counterText = (c: HTMLElement) => c.querySelector('.tabular-nums')!.textContent;

// ---- frozen DOM (captured byte-for-byte from the HEAD panel) -----------------------

const FROZEN_QUICK_TOOLBAR_HTML =
  '<div class="px-2 pb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Layer quick actions" aria-describedby="layer-action-review-status" title="Use arrow keys to review layer actions">'
  + '<span id="layer-action-review-status" class="sr-only" aria-live="polite">Reviewing Layer quick actions</span>'
  + '<button type="button" data-layer-action="true" data-layer-action-review="Select Visible Objects" class="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" title="Select Visible Objects"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mouse-pointer-click" aria-hidden="true"><path d="M14 4.1 12 6"></path><path d="m5.1 8-2.9-.8"></path><path d="m6 12-1.9 2"></path><path d="M7.2 2.2 8 5.1"></path><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"></path></svg>Visible</button>'
  + '<button type="button" data-layer-action="true" data-layer-action-review="Select Unlocked Objects" class="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" title="Select Unlocked Objects"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-open" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>Unlocked</button>'
  + '<button type="button" data-layer-action="true" data-layer-action-review="Hide Others" class="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" title="Hide Others"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"></path><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"></path><path d="m2 2 20 20"></path></svg>Others</button>'
  + '<button type="button" data-layer-action="true" data-layer-action-review="Show All" class="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" title="Show All"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>Show All</button>'
  + '<button type="button" data-layer-action="true" data-layer-action-review="Unlock All" class="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1" title="Unlock All"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-open" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>Unlock All</button>'
  + '</div>';

// Opening tag of the search-actions container (className="contents", the live
// region is external — it lives inside the quick toolbar above).
const FROZEN_SEARCH_TOOLBAR_TAG =
  '<div class="contents" role="toolbar" aria-label="Layer search actions" aria-describedby="layer-action-review-status" title="Use arrow keys to review layer actions">';

const FROZEN_SEARCH_FIRST_BUTTON =
  '<button type="button" data-layer-action="true" data-layer-action-review="Select first visible unlocked layer match" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" title="Select first visible unlocked layer match">Select First</button>';

const FROZEN_SEARCH_LAST_BUTTON =
  '<button type="button" data-layer-action="true" data-layer-action-review="Clear search" class="btn !py-1 !px-1.5 !text-[10px] shrink-0" title="Clear search">Clear search</button>';

// Ordered review|enabled signature of all 146 search-actions buttons with the
// 're' query (1 visible unlocked match → Show/Unlock Matches disabled because
// the hidden Circle and locked states are filtered out of the match counts;
// Blend/Compound/Group/Ungroup/Reverse need ≥2 matches or a group).
const FROZEN_SEARCH_SIGNATURE = [
  'Select first visible unlocked layer match', 'Select matching visible unlocked layers', 'Target matching layers',
  'Solo matching layers', 'Hide matching layers', 'Lock matching layers', 'Show matching layers|D', 'Unlock matching layers|D',
  'Rename matching layers', 'Renumber matching layers', 'Find and replace matching layer names', 'UPPERCASE', 'lowercase',
  'Title Case', 'Sentence case', 'Clean matching layer names', 'Set matching layer opacity', 'Set matching layer blend mode',
  'Set matching layer fill', 'Set matching layer stroke', 'Set matching layer stroke width', 'Set matching layer line cap',
  'Set matching layer line join', 'Set matching layer dash', 'Set matching layer miter limit', 'Set matching layer overprint',
  'Set matching layer print mark kind', 'Set matching layer font family', 'Set matching layer font size',
  'Set matching layer font weight', 'Set matching layer font style', 'Set matching layer text alignment',
  'Set matching layer underline', 'Set matching layer strikethrough', 'Set matching layer overline', 'Set matching layer tracking',
  'Set matching layer leading', 'Set matching layer x position', 'Set matching layer y position', 'Set matching layer center x',
  'Set matching layer center y', 'Set matching layer right edge', 'Set matching layer bottom edge', 'Set matching layer position',
  'Set matching layer center', 'Set matching layer bounds', 'Set matching layer width', 'Set matching layer height',
  'Set matching layer size', 'Set matching layer rotation', 'Set matching layer horizontal scale',
  'Set matching layer vertical scale', 'Set matching layer scale', 'Set matching layer horizontal skew',
  'Set matching layer vertical skew', 'Set matching layer skew', 'Select same object type in matching layers',
  'Select same visibility in matching layers', 'Select same lock state in matching layers',
  'Select same named state in matching layers', 'Select same name prefix in matching layers', 'Select same width in matching layers',
  'Select same height in matching layers', 'Select same size in matching layers', 'Select same area in matching layers',
  'Select same aspect ratio in matching layers', 'Select same rotation in matching layers', 'Select same scale in matching layers',
  'Select same right edge in matching layers', 'Select same bottom edge in matching layers', 'Select same x position in matching layers',
  'Select same y position in matching layers', 'Select same position in matching layers', 'Select same center in matching layers',
  'Select same bounds in matching layers', 'Select same skew in matching layers', 'Clear matching gradient fills',
  'Select same gradient fill in matching layers', 'Clear matching pattern fills', 'Select same pattern in matching layers',
  'Grommet matching objects', 'Rhinestone matching objects', 'Blend matching objects|D', 'Variable Width matching objects',
  'Multi-outline matching objects', 'Warp matching objects', 'Free Distort matching objects', 'Round corners matching objects',
  'Twist matching objects', 'Zig Zag matching objects', 'Roughen matching objects', 'Pucker or bloat matching objects',
  'Knife split matching objects horizontally', 'Knife split matching objects vertically',
  'Split matching open paths at midpoint', 'Split matching objects into grid', 'Clean up matching stray objects',
  'Add anchors to matching paths', 'Reverse matching path direction', 'Simplify matching layer paths',
  'Smooth matching layer paths', 'Offset matching layer paths', 'Outline strokes in matching layers',
  'Make matching compound path|D', 'Release matching compound paths', 'Expand matching clipping masks',
  'Release matching clipping masks', 'Select same clipping mask in matching layers', 'Select same font family in matching layers',
  'Select same font size in matching layers', 'Select same text appearance in matching layers', 'Break matching symbol links',
  'Select same symbol in matching layers', 'Select same image source in matching layers', 'Clear matching image filters',
  'Select same image filters in matching layers', 'Select same overprint in matching layers',
  'Select same print mark type in matching layers', 'Select same appearance in matching layers', 'Select same fill in matching layers',
  'Select same stroke in matching layers', 'Select same stroke width in matching layers', 'Select same line cap in matching layers',
  'Select same line join in matching layers', 'Select same dash in matching layers', 'Select same miter limit in matching layers',
  'Select same constant stroke in matching layers', 'Set matching layer shadow', 'Select same shadow in matching layers',
  'Select same opacity in matching layers', 'Select same blend mode in matching layers', 'Expand matching appearance',
  'Flatten matching transparency', 'Apply graphic style to matching layers', 'Clear matching layer appearance',
  'Set matching constant stroke width', 'Duplicate matching layers', 'Group matching layers|D', 'Ungroup matching layers|D',
  'Delete matching layers', 'Move matching layers forward', 'Move matching layers to front', 'Move matching layers backward',
  'Reverse matching layer order|D', 'Move matching layers to back', 'Clear search',
].map((entry) => (entry.endsWith('|D') ? entry : `${entry}|E`)).join('\n');

const FROZEN_ROW_CIRCLE =
  '<div class="relative"><div id="layer-row-3" data-row-idx="0" role="option" aria-selected="false" draggable="true" class="flex items-center gap-1.5 px-1.5 py-1 text-xs transition-colors group cursor-pointer hover:bg-panel3  opacity-50 " title="Circle #3"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical text-muted/70 shrink-0 cursor-grab" aria-hidden="true"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg><button class="text-muted hover:text-ink transition-colors" title="Show" aria-label="Show" aria-pressed="true"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"></path><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"></path><path d="m2 2 20 20"></path></svg></button><button class="text-muted hover:text-ink transition-colors" title="Unlock" aria-label="Unlock" aria-pressed="true"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button><div class="w-6 h-6 rounded-sm bg-panel2 border border-border shrink-0" aria-hidden="true"></div><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle text-muted shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg><span class="flex-1 truncate text-ink/90 select-none">Circle</span><span class="text-muted text-[10px] tabular-nums shrink-0 opacity-60 group-hover:opacity-100 transition-opacity " aria-hidden="true">#3</span><button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-ink transition-all" title="Duplicate layer object" aria-label="Duplicate layer object"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button><button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all" title="Delete" aria-label="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>';

const FROZEN_ROW_RECT =
  '<div class="relative"><div id="layer-row-7" data-row-idx="1" role="option" aria-selected="false" draggable="true" class="flex items-center gap-1.5 px-1.5 py-1 text-xs transition-colors group cursor-pointer hover:bg-panel3   " title="Rect #7"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical text-muted/70 shrink-0 cursor-grab" aria-hidden="true"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg><button class="text-muted hover:text-ink transition-colors" title="Hide" aria-label="Hide" aria-pressed="false"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg></button><button class="text-muted hover:text-ink transition-colors" title="Lock" aria-label="Lock" aria-pressed="false"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-open" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg></button><div class="w-6 h-6 rounded-sm bg-panel2 border border-border shrink-0" aria-hidden="true"></div><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square text-muted shrink-0" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"></rect></svg><span class="flex-1 truncate text-ink/90 select-none">Rect</span><span class="text-muted text-[10px] tabular-nums shrink-0 opacity-60 group-hover:opacity-100 transition-opacity " aria-hidden="true">#7</span><button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-ink transition-all" title="Duplicate layer object" aria-label="Duplicate layer object"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button><button class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all" title="Delete" aria-label="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>';

const signatureOf = (c: HTMLElement) =>
  searchActions(c).map((b) => `${b.getAttribute('data-layer-action-review')}|${b.disabled ? 'D' : 'E'}`).join('\n');

// ---- the suite ---------------------------------------------------------------------

describe('LayersPanel migration — frozen legacy DOM (byte-exact)', () => {
  it('the quick-actions toolbar serializes byte-identically (status span first child)', () => {
    const c = mountPanel();
    expect(quickActions(c)).toHaveLength(5);
    expect(quickToolbar(c).outerHTML).toBe(FROZEN_QUICK_TOOLBAR_HTML);
  });

  it('both list rows serialize byte-identically (hidden+locked circle, visible rect)', () => {
    const c = mountPanel();
    expect(listRows(c)).toHaveLength(2);
    expect(listRows(c)[0].parentElement!.outerHTML).toBe(FROZEN_ROW_CIRCLE);
    expect(listRows(c)[1].parentElement!.outerHTML).toBe(FROZEN_ROW_RECT);
  });

  it('the search toolbar keeps its container tag, count, first/last buttons and full ordered signature', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    const toolbar = searchToolbar(c);
    expect(toolbar.outerHTML.startsWith(FROZEN_SEARCH_TOOLBAR_TAG)).toBe(true);
    expect(toolbar.querySelector('#layer-action-review-status')).toBe(null);
    expect(searchActions(c)).toHaveLength(146);
    expect(searchActions(c)[0].outerHTML).toBe(FROZEN_SEARCH_FIRST_BUTTON);
    expect(searchActions(c).at(-1)!.outerHTML).toBe(FROZEN_SEARCH_LAST_BUTTON);
    expect(signatureOf(c)).toBe(FROZEN_SEARCH_SIGNATURE);
  });

  it('the initial announcers and match counter carry their HEAD texts', () => {
    const c = mountPanel();
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Layer quick actions')}`);
    expect(listStatusText()).toBe('Reviewing Circle 1 / 2. Hidden · Locked');
    expect(counterText(c)).toBe(`2 ${t('objects')}`);
    typeInto(searchInput(c), 're');
    expect(counterText(c)).toBe(`1 / 2 ${t('matches')}`);
    typeInto(searchInput(c), 'zzz');
    expect(counterText(c)).toBe(`0 / 2 ${t('matches')}`);
  });
});

describe('quick-actions toolbar — wrapping roving with review announce', () => {
  it('ArrowRight wraps at the end and publishes the landed action review', () => {
    const c = mountPanel();
    const [visible] = quickActions(c);
    const unlockAll = quickActions(c).at(-1)!;
    focus(unlockAll);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Unlock All')}`);
    expect(pressSync(unlockAll, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(visible);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Select Visible Objects')}`);
  });

  it('ArrowLeft wraps at the start', () => {
    const c = mountPanel();
    const [visible, , , , unlockAll] = quickActions(c);
    focus(visible);
    expect(pressSync(visible, 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(unlockAll);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Unlock All')}`);
  });

  it('Home jumps to the first action and End to the last', () => {
    const c = mountPanel();
    const [visible, , , , unlockAll] = quickActions(c);
    focus(unlockAll);
    pressSync(unlockAll, 'Home');
    expect(document.activeElement).toBe(visible);
    focus(unlockAll);
    pressSync(unlockAll, 'End');
    expect(document.activeElement).toBe(unlockAll);
  });

  it('ignores non-roving keys without preventing default', () => {
    const c = mountPanel();
    const [, unlocked] = quickActions(c);
    focus(unlocked);
    expect(pressSync(unlocked, 'ArrowUp')).toBe(false);
    expect(pressSync(unlocked, 'ArrowDown')).toBe(false);
    expect(pressSync(unlocked, 'a')).toBe(false);
    expect(document.activeElement).toBe(unlocked);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Select Unlocked Objects')}`);
  });

  it('clicking a quick action still invokes its handler (Visible → warn toast)', () => {
    const c = mountPanel();
    act(() => { quickActions(c)[0].click(); });
    expect(selectVisibleObjects).toHaveBeenCalledTimes(1);
    expect(toast.warn).toHaveBeenCalledWith(t('No visible unlocked objects.'));
  });
});

describe('search-actions toolbar — wrapping roving with skipDisabled into the shared region', () => {
  it('ArrowRight wraps from Clear search back to Select First', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    const [selectFirst] = searchActions(c);
    const clear = searchActions(c).at(-1)!;
    focus(clear);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Clear search')}`);
    expect(pressSync(clear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(selectFirst);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Select first visible unlocked layer match')}`);
  });

  it('ArrowLeft wraps from Select First to Clear search', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    const [selectFirst] = searchActions(c);
    const clear = searchActions(c).at(-1)!;
    focus(selectFirst);
    pressSync(selectFirst, 'ArrowLeft');
    expect(document.activeElement).toBe(clear);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Clear search')}`);
  });

  it('Home and End jump absolutely across the 146-button set', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    const [selectFirst] = searchActions(c);
    const clear = searchActions(c).at(-1)!;
    focus(clear);
    pressSync(clear, 'Home');
    expect(document.activeElement).toBe(selectFirst);
    focus(selectFirst);
    pressSync(selectFirst, 'End');
    expect(document.activeElement).toBe(clear);
  });

  it('skips the disabled Show/Unlock Matches when stepping forward', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    const lock = searchActions(c)[5]; // Lock Matches (enabled)
    const rename = searchActions(c)[8]; // Rename Matches — Show(6)/Unlock(7) disabled
    expect(searchActions(c)[6].disabled).toBe(true);
    expect(searchActions(c)[7].disabled).toBe(true);
    focus(lock);
    expect(pressSync(lock, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(rename);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Rename matching layers')}`);
  });

  it('with zero matches every move stays on the single enabled Clear search', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 'zzz');
    const clear = searchActions(c).at(-1)!;
    expect(searchActions(c).filter((b) => !b.disabled)).toHaveLength(1);
    focus(clear);
    expect(pressSync(clear, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(clear);
    expect(statusText()).toBe(`${t('Reviewing')} ${t('Clear search')}`);
    pressSync(clear, 'Home');
    expect(document.activeElement).toBe(clear);
    pressSync(clear, 'End');
    expect(document.activeElement).toBe(clear);
  });
});

describe('search input keys (Enter / ArrowDown / Escape) — HEAD behavior', () => {
  it('Enter selects the first visible unlocked match and points the listbox at it', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    expect(pressSync(searchInput(c), 'Enter')).toBe(true);
    expect(canvasHolder.c!.setActiveObject).toHaveBeenCalledWith(RECT);
    expect(listbox(c).getAttribute('aria-activedescendant')).toBe('layer-row-7');
    expect(listStatusText()).toBe('Reviewing Rect 1 / 1. Visible · Unlocked');
    expect(toast.warn).not.toHaveBeenCalled();
  });

  it('ArrowDown focuses the listbox on the first match; Escape clears the query and toolbar', () => {
    const c = mountPanel();
    typeInto(searchInput(c), 're');
    expect(pressSync(searchInput(c), 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(listbox(c));
    expect(canvasHolder.c!.setActiveObject).toHaveBeenCalledWith(RECT);
    focus(searchInput(c));
    expect(pressSync(searchInput(c), 'Escape')).toBe(true);
    expect(searchInput(c).value).toBe('');
    expect(searchToolbar(c)).toBe(null);
    expect(counterText(c)).toBe(`2 ${t('objects')}`);
  });
});

describe('listbox roving — untouched legacy handler, regression snapshot', () => {
  it('focusing the listbox reviews the first row (hidden Circle)', () => {
    const c = mountPanel();
    focus(listbox(c));
    expect(listbox(c).getAttribute('aria-activedescendant')).toBe('layer-row-3');
    expect(listStatusText()).toBe('Reviewing Circle 1 / 2. Hidden · Locked');
  });

  it('ArrowDown moves to the Rect row, selects it on canvas, clamps at the end', () => {
    const c = mountPanel();
    focus(listbox(c));
    canvasHolder.c!.setActiveObject.mockClear();
    expect(pressSync(listbox(c), 'ArrowDown')).toBe(true);
    expect(listbox(c).getAttribute('aria-activedescendant')).toBe('layer-row-7');
    expect(canvasHolder.c!.setActiveObject).toHaveBeenCalledWith(RECT);
    expect(listStatusText()).toBe('Reviewing Rect 2 / 2. Visible · Unlocked');
    pressSync(listbox(c), 'ArrowDown');
    expect(listbox(c).getAttribute('aria-activedescendant')).toBe('layer-row-7');
  });

  it('Home returns to the first row; F2 opens the rename input, Escape cancels it', () => {
    const c = mountPanel();
    focus(listbox(c));
    pressSync(listbox(c), 'ArrowDown');
    pressSync(listbox(c), 'Home');
    expect(listbox(c).getAttribute('aria-activedescendant')).toBe('layer-row-3');
    expect(pressSync(listbox(c), 'F2')).toBe(true);
    const input = listRows(c)[0].querySelector('input')!;
    expect(document.activeElement).toBe(input);
    expect(pressSync(input, 'Escape')).toBe(true);
    expect(listRows(c)[0].querySelector('input')).toBe(null);
  });
});
