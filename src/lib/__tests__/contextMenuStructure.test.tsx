import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CanvasContextMenu } from '../../components/CanvasContextMenu';
import { useEditor } from '../../store/editor';

/**
 * Structure guard for the canvas right-click menu (Impl-D: regrouped so a
 * selection's menu fits one screen).
 *
 * Four things are pinned here:
 *   1. The ROOT stays within a direct-line budget (rows + separators). With the
 *      old flat list the root ran to 67 lines / ~1800px and only three of its
 *      twenty submenu rows were visible without scrolling.
 *   2. Zero loss: every command and submenu title the old menu exposed (44
 *      commands + 20 submenus) still exists somewhere in the tree, together
 *      with the 82 nested leaf commands.
 *   3. The original enable / disable logic is untouched. The conditions are
 *      restated here as an oracle that is POSITION-INDEPENDENT (a command
 *      counts as reachable when its button exists and is enabled), so the very
 *      same assertion passes on the old flat menu and on the regrouped one.
 *   4. Each command sits at its documented place: the tree below is the
 *      "original command → new location" map in executable form.
 *
 * A submenu that is disabled does not render its panel, so a command under a
 * disabled parent is absent from the DOM — the oracle treats that as "not
 * reachable", exactly like a disabled button.
 */

const h = vi.hoisted(() => ({
  objects: [] as Array<{ type: string; clipPath?: unknown }>,
  active: null as null | { type: string; clipPath?: unknown },
  clipboard: false,
}));

vi.mock('../canvasEngine', async (orig) => ({
  ...(await orig<typeof import('../canvasEngine')>()),
  // The menu only asks the canvas for the active objects while rendering.
  getCanvas: () => ({ getActiveObjects: () => h.objects, getActiveObject: () => h.active }),
}));

vi.mock('../clipboard', async (orig) => ({
  ...(await orig<typeof import('../clipboard')>()),
  hasClipboard: () => h.clipboard,
}));

const noopProps = { onNewDocument: () => {}, onOpenFile: () => {}, onImportImage: () => {}, onToggleDebug: () => {} };

type Obj = { type: string; clipPath?: unknown };
interface State { objects: Obj[]; clipboard?: boolean; canUndo?: boolean; canRedo?: boolean }

const STATES: Record<string, State> = {
  none: { objects: [] as Obj[] },
  vector: { objects: [{ type: 'rect' }], clipboard: true, canUndo: true },
  text: { objects: [{ type: 'i-text' }], canUndo: true, canRedo: true },
  image: { objects: [{ type: 'image' }], clipboard: true, canRedo: true },
  // Everything a multi-selection unlocks: group, boolean ops, align, distribute.
  multi: { objects: [{ type: 'path' }, { type: 'path' }, { type: 'rect' }], clipboard: true, canUndo: true, canRedo: true },
  // A group carrying a clipPath: ungroup + isolation + release-clipping enabled.
  clip: { objects: [{ type: 'group', clipPath: { type: 'path' } }], clipboard: true },
  // A lone path: join + release-compound-path enabled.
  compound: { objects: [{ type: 'path' }], clipboard: true },
  // Static (non-editable) text: Type ▸ applies, inline Edit Text does not.
  staticText: { objects: [{ type: 'text' }], clipboard: true },
};

/** Every selection fact the menu derives while rendering. */
function flags(s: State) {
  const a = s.objects;
  const one = a.length === 1 ? a[0] : null;
  const many: Obj | null = a.length > 1 ? { type: 'activeselection' } : null;
  const active = one ?? many;
  const has = a.length > 0;
  const paths = a.filter((o) => o.type === 'path').length;
  return {
    count: a.length,
    has,
    canGroup: active?.type === 'activeselection',
    canUngroup: active?.type === 'group',
    canAlign: a.length >= 2,
    canDistribute: a.length >= 3,
    canBool: a.length >= 2,
    canClip: active?.type === 'activeselection',
    canReleaseClip: !!active?.clipPath,
    canReleaseCompound: active?.type === 'path',
    canPaste: !!s.clipboard,
    canJoin: paths === 1 || paths === 2,
    editableText: a.length === 1 && (a[0].type === 'i-text' || a[0].type === 'textbox'),
    hasText: a.some((o) => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox'),
    canUndo: !!s.canUndo,
    canRedo: !!s.canRedo,
  };
}

// --- the original enable conditions, restated (label → condition) ----------
type F = ReturnType<typeof flags>;
const WHEN: Array<[keyof F | 'join' | 'blend' | true, string[]]> = [
  // Swatches carries no `disabled` of its own, but it lives under Appearance ▸
  // (disabled without a selection) in the old menu and the new one alike.
  [true, ['Paste from Clipboard', 'Unlock All', 'Show All', 'Select All', 'Select Inverse', 'Select Next Object Above', 'Select Next Object Below']],
  ['canUndo', ['Undo']],
  ['canRedo', ['Redo']],
  ['canPaste', ['Paste', 'Paste Here', 'Paste in Place', 'Paste in Front', 'Paste in Back']],
  ['has', [
    'Cut', 'Copy', 'Duplicate', 'Delete', 'Rename Selection…', 'Align & Distribute', 'Transform',
    'Bring to Front', 'Bring Forward', 'Send Backward', 'Send to Back',
    'Lock Selection', 'Lock Others', 'Unlock Selection', 'Hide Selection', 'Hide Others', 'Show Selection',
    'Create Contour', 'Weld', 'Outline Stroke', 'Trace Image', 'Rasterize', 'Deselect All',
    'Image Filters', 'Fill / Stroke', 'Stroke alignment', 'Stroke width', 'Stroke style',
    'Blend mode', 'Appearance', 'Pattern Fill', 'Drop shadow', 'Opacity', 'Edit Colors',
    'Transform…', 'Flip Horizontal', 'Flip Vertical', 'Rotate 90° CW', 'Rotate 90° CCW',
    'Blur', 'Sepia', 'Grayscale', 'Brightness +', 'Clear Image Filters',
    'Swap Fill / Stroke', 'Default Fill / Stroke', 'No Fill', 'No Stroke', 'Center', 'Inside', 'Outside',
    '0.5 px', '1 px', '2 px', '4 px', 'Dash', 'Solid', 'Dashed', 'Dotted', 'Line cap', 'Butt', 'Round', 'Square',
    'Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'Difference', '100%', '75%', '50%', '25%',
    'Checker', 'Stripes', 'Dots', 'Crosshatch', 'Clear Pattern Fill', 'Soft Shadow', 'Glow', 'Clear Shadow',
    'Recolor Artwork…', 'Freeform Gradient…', 'Invert Colors', 'Convert to Grayscale',
    'Clear Appearance', 'Flatten Transparency', 'Expand Appearance', 'Clear Gradient Fill', 'Graphic Styles',
    'Add Anchor Points', 'Reverse Path Direction', 'Simplify Path…', 'Round Corners…', 'Offset Path…',
    'Swatches', 'Add current fill', 'Collect colours from selection',
  ]],
  ['canGroup', ['Group']],
  ['canUngroup', ['Ungroup', 'Isolation Mode']],
  ['canBool', ['Pathfinder', 'Union', 'Subtract', 'Intersect', 'Exclude', 'Divide', 'Trim', 'Merge', 'Crop']],
  ['canAlign', ['Align left', 'Align center horizontally', 'Align right', 'Align top', 'Align center vertically', 'Align bottom']],
  ['canDistribute', ['Distribute horizontally (equal spacing)', 'Distribute vertically (equal spacing)']],
  ['canClip', ['Make Clipping Mask', 'Make Compound Path']],
  ['canReleaseClip', ['Release Clipping Mask']],
  ['canReleaseCompound', ['Release Compound Path']],
  ['join', ['Join Paths']],
  ['blend', ['Blend…']],
];
const LOGIC_LABELS = WHEN.flatMap(([, labels]) => labels);
const expectedReachable = (s: State) => {
  const f = flags(s);
  const ok: Record<string, boolean> = {};
  for (const [cond, labels] of WHEN) {
    const on = cond === true ? true : cond === 'join' ? f.canJoin : cond === 'blend' ? f.count >= 2 : !!f[cond];
    for (const l of labels) ok[l] = on;
  }
  return new Set(Object.keys(ok).filter((l) => ok[l]));
};

/** The 44 direct commands + 20 submenu titles of the old menu. */
const ORIGINAL_44 = [
  'Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Paste Here', 'Paste in Place', 'Paste in Front', 'Paste in Back', 'Paste from Clipboard',
  'Duplicate', 'Delete', 'Rename Selection…', 'Group', 'Ungroup', 'Isolation Mode', 'Make Clipping Mask', 'Release Clipping Mask',
  'Make Compound Path', 'Release Compound Path', 'Bring to Front', 'Bring Forward', 'Send Backward', 'Send to Back',
  'Lock Selection', 'Lock Others', 'Unlock Selection', 'Unlock All', 'Hide Selection', 'Hide Others', 'Show Selection', 'Show All',
  'Edit Text', 'Create Contour', 'Weld', 'Outline Stroke', 'Trace Image', 'Join Paths', 'Rasterize', 'Select All', 'Deselect All',
  'Select Inverse', 'Select Next Object Above', 'Select Next Object Below',
];
const ORIGINAL_20 = [
  'Pathfinder', 'Align & Distribute', 'Transform', 'Type', 'Image Filters', 'Fill / Stroke', 'Stroke alignment', 'Stroke width',
  'Stroke style', 'Blend mode', 'Appearance', 'Pattern Fill', 'Drop shadow', 'Opacity', 'Edit Colors', 'Path Effects',
  'Dash', 'Line cap', 'Graphic Styles', 'Swatches',
];
const ALL_STATES = Object.keys(STATES) as Array<keyof typeof STATES>;

// --- the regrouped tree: "▸" marks a submenu row, "|" a separator -----------
// Everything below the root is the new home of the original commands.
const TREE: Record<string, string[]> = {
  root: ['Undo', 'Redo', '|', 'Cut', 'Copy', 'Paste', 'Paste special ▸', 'Duplicate', 'Delete', 'Rename Selection…',
    'Group', 'Ungroup', 'Arrange ▸', 'Lock & Hide ▸', '|',
    'Pathfinder ▸', 'Align & Distribute ▸', 'Transform ▸', 'Path ▸', 'Select ▸', 'Appearance ▸', 'Image ▸'],
  'Paste special': ['Paste Here', 'Paste in Place', 'Paste in Front', 'Paste in Back', '|', 'Paste from Clipboard'],
  'Arrange': ['Bring to Front', 'Bring Forward', 'Send Backward', 'Send to Back', '|', 'Isolation Mode'],
  'Lock & Hide': ['Lock Selection', 'Lock Others', 'Unlock Selection', 'Unlock All', '|', 'Hide Selection', 'Hide Others', 'Show Selection', 'Show All'],
  Pathfinder: ['Union', 'Subtract', 'Intersect', 'Exclude', '|', 'Divide', 'Trim', 'Merge', 'Crop'],
  'Align & Distribute': ['Align left', 'Align center horizontally', 'Align right', 'Align top', 'Align center vertically', 'Align bottom', '|', 'Distribute horizontally (equal spacing)', 'Distribute vertically (equal spacing)'],
  Transform: ['Transform…', 'Flip Horizontal', 'Flip Vertical', 'Rotate 90° CW', 'Rotate 90° CCW'],
  Path: ['Join Paths', 'Outline Stroke', 'Weld', 'Create Contour', '|', 'Make Clipping Mask', 'Release Clipping Mask', 'Make Compound Path', 'Release Compound Path', '|', 'Path Effects ▸'],
  'Path > Path Effects': ['Add Anchor Points', 'Reverse Path Direction', 'Simplify Path…', 'Round Corners…', 'Offset Path…', 'Blend…'],
  Select: ['Select All', 'Deselect All', 'Select Inverse', 'Select Next Object Above', 'Select Next Object Below'],
  Appearance: ['Fill / Stroke ▸', 'Stroke alignment ▸', 'Stroke width ▸', 'Stroke style ▸', '|',
    'Blend mode ▸', 'Opacity ▸', 'Pattern Fill ▸', 'Drop shadow ▸', 'Edit Colors ▸', '|',
    'Graphic Styles ▸', 'Swatches ▸', '|', 'Clear Appearance', 'Flatten Transparency', 'Expand Appearance', 'Clear Gradient Fill'],
  'Appearance > Fill / Stroke': ['Swap Fill / Stroke', 'Default Fill / Stroke', '|', 'No Fill', 'No Stroke'],
  'Appearance > Stroke alignment': ['Center', 'Inside', 'Outside'],
  'Appearance > Stroke width': ['0.5 px', '1 px', '2 px', '4 px'],
  'Appearance > Stroke style': ['Dash ▸', 'Line cap ▸'],
  'Appearance > Stroke style > Dash': ['Solid', 'Dashed', 'Dotted'],
  'Appearance > Stroke style > Line cap': ['Butt', 'Round', 'Square'],
  'Appearance > Blend mode': ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'Difference'],
  'Appearance > Opacity': ['100%', '75%', '50%', '25%'],
  'Appearance > Pattern Fill': ['Checker', 'Stripes', 'Dots', 'Crosshatch', '|', 'Clear Pattern Fill'],
  'Appearance > Drop shadow': ['Soft Shadow', 'Glow', '|', 'Clear Shadow'],
  'Appearance > Edit Colors': ['Recolor Artwork…', 'Freeform Gradient…', 'Invert Colors', 'Convert to Grayscale'],
  'Appearance > Swatches': ['Add current fill', 'Collect colours from selection'],
  Image: ['Trace Image', 'Rasterize', '|', 'Image Filters ▸'],
  'Image > Image Filters': ['Blur', 'Sepia', 'Grayscale', 'Brightness +', 'Clear Image Filters'],
  Type: ['Create Outlines', 'Break Text into Letters', 'Text on Arc (Up)', 'Text on Arc (Down)'],
};
/** Rows that only exist for the object type they act on (type-conditional). */
const TEXT_ONLY_ROWS = ['Edit Text', 'Type ▸'];
/** Root budget: direct lines (rows + separators) for a plain vector selection. */
const ROOT_MAX_LINES = 22;

describe('CanvasContextMenu structure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    act(() => { useEditor.setState({ canUndo: false, canRedo: false }); });
  });

  async function mount(state: State) {
    h.objects = state.objects;
    h.active = state.objects.length === 1 ? state.objects[0] : state.objects.length ? { type: 'activeselection' } : null;
    h.clipboard = !!state.clipboard;
    act(() => { useEditor.setState({ canUndo: !!state.canUndo, canRedo: !!state.canRedo }); });
    await act(async () => { root.render(<CanvasContextMenu {...noopProps} />); });
    await act(async () => { window.dispatchEvent(new CustomEvent('vector:context-menu', { detail: { x: 120, y: 40 } })); });
    const menu = container.querySelector('[role="menu"]') as HTMLElement | null;
    expect(menu, 'the menu opened').not.toBeNull();
    return menu!;
  }

  // A row is a plain Item button, a separator, or a submenu's wrapper (the one
  // kind of element with a haspopup button directly inside it).
  const isLine = (el: Element) => el.matches('button[role="menuitem"]') || el.matches('[role="separator"]') || !!el.querySelector(':scope > button[role="menuitem"][aria-haspopup="menu"]');
  const labelOf = (el: Element) => {
    if (el.matches('[role="separator"]')) return '|';
    const b = el.matches('button[role="menuitem"]') ? el : el.querySelector(':scope > button[role="menuitem"]')!;
    return `${b.getAttribute('aria-label')}${b.getAttribute('aria-haspopup') === 'menu' ? ' ▸' : ''}`;
  };
  const directLines = (menu: HTMLElement) => [...menu.children].filter(isLine).map(labelOf);
  /** Root-level rows: directly under the root (the old flat menu), or inside
   *  the root's single scroll-content wrapper (the regrouped menu, whose root
   *  also hosts the scroll hints). */
  const linesHost = (menu: HTMLElement): HTMLElement => {
    const plain = [...menu.children].filter((el) => !isLine(el));
    return plain.length === 1 && plain[0].getAttribute('role') === null ? (plain[0] as HTMLElement) : menu;
  };
  const rootLines = (menu: HTMLElement) => directLines(linesHost(menu));
  /** The panel opened by the submenu row `title` that is a direct row of `menu`. */
  const panel = (menu: HTMLElement, title: string) => {
    const row = [...menu.children].filter((el) => isLine(el) && !el.matches('[role="separator"]'))
      .map((el) => (el.matches('button[role="menuitem"]') ? el : el.querySelector(':scope > button[role="menuitem"]')!))
      .find((b) => b.getAttribute('aria-label') === title);
    return row ? row.parentElement!.querySelector<HTMLElement>(':scope > [role="menu"]') : null;
  };
  const panelAt = (menu: HTMLElement, path: string) => path.split(' > ').reduce<HTMLElement | null>((m, step) => (m ? panel(m, step) : null), linesHost(menu));

  it('keeps the root within the line budget in every selection state', async () => {
    for (const name of ALL_STATES) {
      const menu = await mount(STATES[name]);
      const lines = rootLines(menu);
      // The only rows that come and go with the object type: Type ▸ for any text
      // in the selection, plus Edit Text for a single editable text object.
      const f = flags(STATES[name]);
      const budget = ROOT_MAX_LINES + Number(f.hasText) + Number(f.editableText);
      expect(lines.length, `[${name}] root has ${lines.length} direct lines (budget ${budget}):\n${lines.join(' / ')}`).toBeLessThanOrEqual(budget);
      if (name === 'vector') {
        expect(lines.filter((l) => l !== '|')).toHaveLength(20);
        expect(lines.filter((l) => l === '|')).toHaveLength(2);
      }
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    }
  });

  it('loses nothing: all 44 commands and 20 submenus (and the 82 nested leaves) still exist', async () => {
    const seen = new Set<string>();
    for (const name of ALL_STATES) {
      const menu = await mount(STATES[name]);
      for (const b of menu.querySelectorAll('button[role="menuitem"]')) seen.add(b.getAttribute('aria-label') ?? '');
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    }
    const lost = [...ORIGINAL_44, ...ORIGINAL_20, ...LOGIC_LABELS, ...TREE.Type].filter((l) => !seen.has(l));
    expect(lost, 'labels missing from the menu tree').toEqual([]);
    expect(ORIGINAL_44).toHaveLength(44);
    expect(ORIGINAL_20).toHaveLength(20);
    // 139 labels carry an enable condition (the oracle); 82 of them are the
    // second/third-level leaves that were never top-level rows.
    expect(new Set(LOGIC_LABELS).size).toBe(139);
    expect(new Set([...LOGIC_LABELS, ...TREE.Type].filter((l) => !ORIGINAL_44.includes(l) && !ORIGINAL_20.includes(l))).size).toBe(82);
  });

  it('keeps the original enable / disable logic in every selection state', async () => {
    for (const name of ALL_STATES) {
      const menu = await mount(STATES[name]);
      const reachable = new Set<string>();
      for (const b of menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')) {
        if (!b.disabled) reachable.add(b.getAttribute('aria-label') ?? '');
      }
      const expected = expectedReachable(STATES[name]);
      const inUniverse = (s: Set<string>) => [...s].filter((l) => LOGIC_LABELS.includes(l)).sort();
      expect(inUniverse(reachable), `[${name}] reachable commands`).toEqual(inUniverse(expected));
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    }
  });

  it('shows Edit Text and Type only for text, and the image commands for any selection', async () => {
    for (const name of ALL_STATES) {
      const menu = await mount(STATES[name]);
      const f = flags(STATES[name]);
      const lines = rootLines(menu);
      expect(lines.includes('Edit Text'), `[${name}] Edit Text shown`).toBe(f.editableText);
      expect(lines.includes('Type ▸'), `[${name}] Type shown`).toBe(f.hasText);
      // Trace Image / Rasterize / Image Filters were always offered: Rasterize and
      // the filters act on vector art too, so Image ▸ is not an image-only row.
      expect(lines.includes('Image ▸'), `[${name}] Image row shown`).toBe(true);
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    }
  });

  it('places every command at its documented location', async () => {
    // A multi-selection unlocks every submenu, so the whole tree (minus the
    // text-only Type ▸) is in the DOM.
    const menu = await mount(STATES.multi);
    for (const [path, lines] of Object.entries(TREE)) {
      if (path === 'Type') continue;
      const at = path === 'root' ? linesHost(menu) : panelAt(menu, path);
      expect(at ?? null, `panel "${path}" is open`).not.toBeNull();
      expect(directLines(at!), `direct lines of "${path}"`).toEqual(lines);
    }
    // Numeric zero-loss: the old menu rendered 145 (+ saved graphic styles) rows
    // for this selection; the regrouped one adds six submenu rows and drops the
    // always-shown-but-disabled Type ▸ with its four children.
    const styles = directLines(panelAt(menu, 'Appearance > Graphic Styles')!).filter((l) => l !== '|').length;
    expect(menu.querySelectorAll('button[role="menuitem"]').length).toBe(146 + styles);
    // …and the two type-conditional rows sit right after Lock & Hide ▸.
    // …and the two type-conditional rows lead the tools block, exactly where
    // the old menu had them: right after the separator that follows the lock /
    // hide rows.
    const textMenu = linesHost(await mount(STATES.text));
    const cut = TREE.root.indexOf('|', TREE.root.indexOf('Lock & Hide ▸')) + 1;
    expect(directLines(textMenu)).toEqual([...TREE.root.slice(0, cut), ...TEXT_ONLY_ROWS, ...TREE.root.slice(cut)]);
    expect(directLines(panelAt(textMenu, 'Type')!)).toEqual(TREE.Type);
    // Paste special is never disabled as a whole — "Paste from Clipboard" reads
    // the SYSTEM clipboard, so it stays reachable when the internal one is empty.
    const none = await mount(STATES.none);
    const row = (l: string) => [...none.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')].find((b) => b.getAttribute('aria-label') === l)!;
    expect(row('Paste special').disabled).toBe(false);
    expect(row('Paste from Clipboard').disabled).toBe(false);
    for (const l of ['Paste Here', 'Paste in Place', 'Paste in Front', 'Paste in Back']) expect(row(l).disabled, l).toBe(true);
  });

  it('shows a scroll hint only on the edges the root can still scroll to', async () => {
    const menu = await mount(STATES.vector);
    const hint = (edge: 'top' | 'bottom') => menu.querySelector(`[data-scroll-hint="${edge}"]`);
    // jsdom has no layout — drive the geometry by hand, then let the menu re-read it.
    const geometry = (scrollHeight: number, clientHeight: number, scrollTop: number) => {
      for (const [k, v] of Object.entries({ scrollHeight, clientHeight, scrollTop })) {
        Object.defineProperty(menu, k, { configurable: true, get: () => v });
      }
      act(() => { menu.dispatchEvent(new Event('scroll')) });
    };
    geometry(600, 600, 0); // nothing to scroll
    expect(hint('top')).toBeNull();
    expect(hint('bottom')).toBeNull();
    geometry(1800, 600, 0); // at the top: more below
    expect(hint('top')).toBeNull();
    expect(hint('bottom')).not.toBeNull();
    geometry(1800, 600, 600); // mid-way: more on both sides
    expect(hint('top')).not.toBeNull();
    expect(hint('bottom')).not.toBeNull();
    geometry(1800, 600, 1200); // at the end
    expect(hint('top')).not.toBeNull();
    expect(hint('bottom')).toBeNull();
  });
});
