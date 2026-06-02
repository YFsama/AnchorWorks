import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
  getCanvas,
  duplicateSelection,
  groupSelection,
  ungroupSelection,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
  deleteSelection,
  pushHistory,
} from '../lib/canvasEngine';
import {
  copySelection,
  cutSelection,
  pasteFromClipboard,
  hasClipboard,
} from '../lib/clipboard';
import { useEditor } from '../store/editor';
import { buildOutlineCutPaths, weldOutline, outlineStrokeToCutPaths } from '../lib/contourFromSelection';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { isMac, ariaKeyshortcuts } from '../lib/runtime';

// ---------------------------------------------------------------------------
// The context menu host. Listens for the `vector:context-menu` CustomEvent
// (dispatched by CanvasView's `contextmenu` handler) and pops itself open at
// the requested screen coordinates.
// ---------------------------------------------------------------------------

type Pos = { x: number; y: number };

const MENU_WIDTH = 220;

export function CanvasContextMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  // We subscribe to selection state so disabled items refresh whenever the
  // canvas selection changes (mostly relevant after a copy/cut completed).
  const selectionIds = useEditor((s) => s.selectionIds);
  const [clipboardTick, setClipboardTick] = useState(0);

  useEffect(() => {
    const onShow = (ev: Event) => {
      const e = ev as CustomEvent<{ x: number; y: number }>;
      if (!e.detail) return;
      setPos({ x: e.detail.x, y: e.detail.y });
      setOpen(true);
    };
    window.addEventListener('vector:context-menu', onShow as EventListener);
    return () => window.removeEventListener('vector:context-menu', onShow as EventListener);
  }, []);

  // Close on Escape, scroll (page or any nested scroller), window blur, or
  // any click outside the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onBlur = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    // mousedown (not click) so we close before the original target processes
    // the press — matches native OS popup behavior.
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onBlur);
    // Right-clicking elsewhere should dismiss the current menu too. A new
    // context-menu event will re-open us at the new position.
    window.addEventListener('contextmenu', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('contextmenu', onDown, true);
    };
  }, [open]);

  // Edge-flip placement: if the menu would overflow the right/bottom edge of
  // the viewport, mirror it to the left/above the cursor. We measure after the
  // initial paint via useLayoutEffect so the user never sees the flicker.
  const [adjustedPos, setAdjustedPos] = useState<Pos>({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = pos.x;
    let y = pos.y;
    if (x + rect.width > vw) {
      x = Math.max(0, pos.x - rect.width);
    }
    if (y + rect.height > vh) {
      y = Math.max(0, pos.y - rect.height);
    }
    setAdjustedPos({ x, y });
  }, [open, pos, selectionIds, clipboardTick]);

  if (!open) return null;

  const c = getCanvas();
  const active = c?.getActiveObjects() ?? [];
  const hasSelection = active.length > 0;
  const activeObj = c?.getActiveObject() ?? null;
  const canGroup = activeObj?.type === 'activeselection';
  const canUngroup = activeObj?.type === 'group';
  const canPaste = hasClipboard();
  // A single editable text object → offer inline "Edit Text".
  const editableText = active.length === 1 &&
    (active[0].type === 'i-text' || active[0].type === 'textbox') ? active[0] : null;

  // Flip every selected object about its own centre. Works on a multi-select
  // too — Fabric flips each member in place.
  const flip = (axis: 'x' | 'y') => {
    if (!c) return;
    for (const o of active) {
      if (axis === 'x') o.set('flipX', !o.flipX);
      else o.set('flipY', !o.flipY);
      o.setCoords();
    }
    c.requestRenderAll();
    pushHistory();
  };

  const selectAll = () => {
    if (!c) return;
    const objs = c.getObjects().filter((o) => !(o as { excludeFromExport?: boolean }).excludeFromExport);
    if (!objs.length) return;
    c.discardActiveObject();
    c.setActiveObject(new fabric.ActiveSelection(objs, { canvas: c }));
    c.requestRenderAll();
  };

  const editText = () => {
    if (!editableText) return;
    const it = editableText as fabric.IText;
    c?.setActiveObject(it);
    it.enterEditing?.();
    it.selectAll?.();
    c?.requestRenderAll();
  };

  const openModal = (k: 'showCutContour' | 'showPlotter' | 'showOutline') =>
    useEditor.getState().setModal(k, true);

  // One-click contour — generate a default 2 mm offset cut line around the
  // selection and show it, no dialog. The dialog ("Cut Contour…") stays for
  // tuning offset / passes / trace / reg-marks.
  const oneClickContour = () => {
    if (!active.length) return;
    const paths = buildOutlineCutPaths(active, 2, 1);
    if (!paths.length) {
      toast.warn(t('No geometry was produced — try a smaller offset distance.'), { title: t('Empty contour') });
      return;
    }
    const ed = useEditor.getState();
    ed.addCutPaths(paths);
    ed.setCutPathsVisible(true);
    toast.success(`${paths.length} ${t('contour(s) added')}`, { title: t('Contour generated') });
  };

  // Weld — union overlapping outlines into the fewest cut paths (SignMaster).
  const weld = () => {
    if (!active.length) return;
    const paths = weldOutline(active);
    if (!paths.length) {
      toast.warn(t('No geometry was produced — try a smaller offset distance.'), { title: t('Weld') });
      return;
    }
    const ed = useEditor.getState();
    ed.addCutPaths(paths);
    ed.setCutPathsVisible(true);
    toast.success(`${t('Welded into')} ${paths.length} ${t('cut paths')}`, { title: t('Weld') });
  };

  // Outline Stroke — cut lines along both edges of the selection's stroke.
  const outlineStroke = () => {
    if (!active.length) return;
    const paths = outlineStrokeToCutPaths(active);
    if (!paths.length) {
      toast.warn(t('Select shapes that have a stroke first.'), { title: t('Outline Stroke') });
      return;
    }
    const ed = useEditor.getState();
    ed.addCutPaths(paths);
    ed.setCutPathsVisible(true);
    toast.success(`${paths.length} ${t('cut paths')}`, { title: t('Outline Stroke') });
  };

  // Each item runs its action, bumps the clipboard tick (so paste enables),
  // and closes the menu. Items disabled at render time short-circuit before
  // their handler runs.
  function run(fn: () => void | Promise<unknown>, enabled: boolean) {
    if (!enabled) return;
    Promise.resolve(fn()).finally(() => {
      setClipboardTick((n) => n + 1);
      setOpen(false);
    });
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('Canvas')}
      className="fixed z-[1000] bg-panel border border-border rounded-md shadow-xl py-1 text-xs"
      style={{ left: adjustedPos.x, top: adjustedPos.y, width: MENU_WIDTH }}
    >
      <Item
        label={t('Cut')}
        kbd="Ctrl+X"
        disabled={!hasSelection}
        onClick={() => run(() => { cutSelection(); }, hasSelection)}
      />
      <Item
        label={t('Copy')}
        kbd="Ctrl+C"
        disabled={!hasSelection}
        onClick={() => run(() => { copySelection(); setClipboardTick((n) => n + 1); }, hasSelection)}
      />
      <Item
        label={t('Paste')}
        kbd="Ctrl+V"
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard(), canPaste)}
      />
      <Item
        label={t('Paste Here')}
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard({ x: pos.x, y: pos.y }), canPaste)}
      />
      <Separator />
      <Item
        label={t('Duplicate')}
        kbd="Ctrl+D"
        disabled={!hasSelection}
        onClick={() => run(() => { duplicateSelection(); }, hasSelection)}
      />
      <Item
        label={t('Delete')}
        kbd="Del"
        disabled={!hasSelection}
        onClick={() => run(() => { deleteSelection(); }, hasSelection)}
      />
      <Separator />
      <Item
        label={t('Group')}
        kbd="Ctrl+G"
        disabled={!canGroup}
        onClick={() => run(() => { groupSelection(); }, canGroup)}
      />
      <Item
        label={t('Ungroup')}
        kbd="Ctrl+Shift+G"
        disabled={!canUngroup}
        onClick={() => run(() => { ungroupSelection(); }, canUngroup)}
      />
      <Separator />
      <Item
        label={t('Flip Horizontal')}
        disabled={!hasSelection}
        onClick={() => run(() => flip('x'), hasSelection)}
      />
      <Item
        label={t('Flip Vertical')}
        disabled={!hasSelection}
        onClick={() => run(() => flip('y'), hasSelection)}
      />
      <Separator />
      <Item
        label={t('Bring to Front')}
        disabled={!hasSelection}
        onClick={() => run(() => { bringToFront(); }, hasSelection)}
      />
      <Item
        label={t('Bring Forward')}
        disabled={!hasSelection}
        onClick={() => run(() => { bringForward(); }, hasSelection)}
      />
      <Item
        label={t('Send Backward')}
        disabled={!hasSelection}
        onClick={() => run(() => { sendBackward(); }, hasSelection)}
      />
      <Item
        label={t('Send to Back')}
        disabled={!hasSelection}
        onClick={() => run(() => { sendToBack(); }, hasSelection)}
      />
      <Separator />
      {editableText && (
        <Item
          label={t('Edit Text')}
          kbd="Enter"
          onClick={() => run(() => editText(), true)}
        />
      )}
      <Item
        label={t('Create Contour')}
        disabled={!hasSelection}
        onClick={() => run(() => oneClickContour(), hasSelection)}
      />
      <Item
        label={t('Weld')}
        disabled={!hasSelection}
        onClick={() => run(() => weld(), hasSelection)}
      />
      <Item
        label={t('Outline Stroke')}
        disabled={!hasSelection}
        onClick={() => run(() => outlineStroke(), hasSelection)}
      />
      <Item
        label={t('Multi-outline…')}
        disabled={!hasSelection}
        onClick={() => run(() => openModal('showOutline'), hasSelection)}
      />
      <Item
        label={t('Cut Contour…')}
        disabled={!hasSelection}
        onClick={() => run(() => openModal('showCutContour'), hasSelection)}
      />
      <Item
        label={t('Send to Plotter…')}
        onClick={() => run(() => openModal('showPlotter'), true)}
      />
      <Separator />
      <Item
        label={t('Select All')}
        kbd="Ctrl+A"
        onClick={() => run(() => selectAll(), true)}
      />
    </div>
  );
}

function Item({
  label,
  kbd,
  disabled,
  onClick,
}: {
  label: string;
  kbd?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts={ariaKeyshortcuts(kbd)}
      className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
    >
      <span>{label}</span>
      {kbd && <Kbd combo={kbd} />}
    </button>
  );
}

function Separator() {
  return <div className="my-1 border-t border-border" role="separator" />;
}

/**
 * Small inline copy of MenuBar's Kbd helper — kept local on purpose so the two
 * surfaces can drift independently without coupling. Renders shortcut combos
 * as discrete chips and substitutes ⌘/⌥/⇧ on macOS.
 */
function Kbd({ combo }: { combo: string }) {
  const onMac = isMac();
  const parts = combo.split('+').map((p) => {
    const k = p.trim();
    if (onMac && /^Ctrl$/i.test(k)) return '⌘';
    if (onMac && /^Alt$/i.test(k)) return '⌥';
    if (onMac && /^Shift$/i.test(k)) return '⇧';
    if (onMac && /^Meta$/i.test(k)) return '⌘';
    return k;
  });
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {parts.map((p, i) => (
        <kbd key={i} className="kbd-menu">
          {p}
        </kbd>
      ))}
    </span>
  );
}
