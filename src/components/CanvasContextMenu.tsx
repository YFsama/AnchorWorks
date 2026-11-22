import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import * as fabric from 'fabric';
import {
  getCanvas, duplicateSelection, alignSelection, distributeSelection, groupSelection,
  ungroupSelection, bringForward, sendBackward, bringToFront, sendToBack, deleteSelection,
  flipSelection, selectInverse, selectObjectInStack, lockSelection, lockOthers, unlockSelection,
  unlockAll, hideSelection, hideOthers, showSelection, showAll, deselectAll, promptRenameSelection,
  applyStyleToSelection, swapFillStroke, defaultColors, undo, redo
} from '../lib/canvasEngine';
import {
  copySelection, cutSelection, pasteFromClipboard, hasClipboard
} from '../lib/clipboard';
import { useEditor } from '../store/editor';
import { buildOutlineCutPaths, weldOutline, outlineStrokeToCutPaths } from '../lib/contourFromSelection';
import { joinSelection } from '../lib/pathJoin';
import { rotateSelection } from '../lib/transformOps';
import { toggleIsolationMode } from '../lib/isolationMode';
import { booleanOp, divideSelection, trimSelection, mergeSelection, cropSelection } from '../lib/booleanOps';
import { addAnchorsToSelection } from '../lib/addAnchors';
import { reversePathSelection } from '../lib/pathReverse';
import { pasteFromSystemClipboard, traceSelectedImage } from '../lib/io3';
import { rasterizeSelection } from '../lib/rasterize';
import { invertColorsSelection, grayscaleColorsSelection } from '../lib/colorAdjust';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { createOutlinesFromText } from '../lib/textToOutline';
import { splitTextToLetters } from '../lib/splitText';
import { applyTextOnArc } from '../lib/textPath';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { getBinding } from '../lib/keymap';
import { isMac, ariaKeyshortcuts } from '../lib/runtime';
import { applyBlur, applySepia, applyGrayscale as applyImageGrayscale, applyBrightness as applyImageBrightness, clearFilters } from '../lib/filters';
import { applyStrokeAlign } from '../lib/strokeAlign';
import { applyBlendModeToSelection, applyPatternFill, applyShadowToSelection, applyStrokeStyleToSelection, clearGradientFillSelection, clearPatternFillSelection, expandAppearanceSelection, flattenTransparencySelection } from '../lib/effects';
import { applyGraphicStyleToSelection, loadGraphicStyles, clearAppearanceFromSelection } from '../lib/graphicStyles';
import { addSavedSwatchColor, collectSelectionColorsIntoSwatches, loadSwatches } from '../lib/globalSwatches';

// ---------------------------------------------------------------------------
// The context menu host. Listens for the `vector:context-menu` CustomEvent
// (dispatched by CanvasView's `contextmenu` handler) and pops itself open at
// the requested screen coordinates.
// ---------------------------------------------------------------------------

type Pos = { x: number; y: number };

interface Props {
  onNewDocument: () => void | Promise<void>;
  onOpenFile: () => void;
  onImportImage: () => void;
  onToggleDebug: () => void;
}

const MENU_WIDTH = 220;

// Props stay part of the public surface (LazyCanvasContextMenu forwards them
// from App.tsx); the slimmed menu no longer needs the callbacks itself.
export function CanvasContextMenu(_props: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  // We subscribe to selection state so disabled items refresh whenever the
  // canvas selection changes (mostly relevant after a copy/cut completed).
  const selectionIds = useEditor((s) => s.selectionIds);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
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
  // Submenus fly out to the right unless the menu sits too close to the right
  // edge, in which case they open leftward so they stay on-screen.
  const openLeft = adjustedPos.x + MENU_WIDTH + 230 > (typeof window !== 'undefined' ? window.innerWidth : 99999);
  const canAlign = active.length >= 2;
  const canDistribute = active.length >= 3;
  const canBool = active.length >= 2;
  const canClip = activeObj?.type === 'activeselection';
  const canReleaseClip = !!(activeObj as { clipPath?: unknown } | undefined)?.clipPath;
  const canReleaseCompound = activeObj?.type === 'path';
  const canPaste = hasClipboard();
  const pathCount = active.filter(o => o.type === 'path').length;
  // A single editable text object → offer inline "Edit Text".
  const editableText = active.length === 1 &&
    (active[0].type === 'i-text' || active[0].type === 'textbox') ? active[0] : null;
  const hasTextSelection = active.some((o) => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox');

  // Flip is shared with the menu / command palette / shortcut (flipSelection).
  const flip = (axis: 'x' | 'y') => flipSelection(axis);

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

  const openModal = (k: 'showCutContour' | 'showPlotter' | 'showOutline' | 'showRecolor' | 'showRhinestone' | 'showGrommets' | 'showMakeSticker' | 'showProductionPreview' | 'showSurfaceWrap' | 'showVariableData' | 'showSimplify' | 'showRoundCorners' | 'showOffsetPath' | 'showRoughen' | 'showZigzag' | 'showPucker' | 'showTwist' | 'showFreeDistort' | 'showFreeformGradient' | 'showSaturate' | 'showHue' | 'showBrightness' | 'showTransform' | 'showResize' | 'showShear' | 'showRepeat' | 'showMarginGuides' | 'showFindReplace' | 'showSingleLineText' | 'showWarp' | 'showBlend' | 'showStar' | 'showSplitGrid' | 'showPrint' | 'showTilePrint' | 'showHelpCenter' | 'showPreferences' | 'showKeymapEditor' | 'showShortcuts' | 'showDocSettings' | 'showTemplates' | 'showCommandPalette') =>
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
      className="fixed z-1000 bg-panel border border-border rounded-md shadow-xl py-1 text-xs max-h-[90vh] overflow-y-auto overscroll-contain"
      style={{ left: adjustedPos.x, top: adjustedPos.y, width: MENU_WIDTH }}
    >
      <Item
        label={t('Undo')}
        kbd={getBinding('edit.undo')}
        disabled={!canUndo}
        onClick={() => run(() => { undo(); }, canUndo)}
      />
      <Item
        label={t('Redo')}
        kbd={`${getBinding('edit.redo')} / ${getBinding('edit.redoShift')}`}
        disabled={!canRedo}
        onClick={() => run(() => { redo(); }, canRedo)}
      />
      <Separator />
      <Item
        label={t('Cut')}
        kbd={getBinding('edit.cut')}
        disabled={!hasSelection}
        onClick={() => run(() => { cutSelection(); }, hasSelection)}
      />
      <Item
        label={t('Copy')}
        kbd={getBinding('edit.copy')}
        disabled={!hasSelection}
        onClick={() => run(() => { copySelection(); setClipboardTick((n) => n + 1); }, hasSelection)}
      />
      <Item
        label={t('Paste')}
        kbd={getBinding('edit.paste')}
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard(), canPaste)}
      />
      <Item
        label={t('Paste Here')}
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard({ x: pos.x, y: pos.y }), canPaste)}
      />
      <Item
        label={t('Paste in Place')}
        kbd={getBinding('edit.pasteInPlace')}
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard(undefined, true), canPaste)}
      />
      <Item
        label={t('Paste in Front')}
        kbd={getBinding('edit.pasteInFront')}
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard(undefined, true, 'front'), canPaste)}
      />
      <Item
        label={t('Paste in Back')}
        kbd={getBinding('edit.pasteInBack')}
        disabled={!canPaste}
        onClick={() => run(() => pasteFromClipboard(undefined, true, 'back'), canPaste)}
      />
      <Item
        label={t('Paste from Clipboard')}
        onClick={() => run(() => { void pasteFromSystemClipboard().then(r => { if (r === 'empty') toast.warn(t('No image or SVG on the clipboard.')); else if (r === 'failed') toast.warn(t('Clipboard unavailable.')); }); }, true)}
      />
      <Separator />
      <Item
        label={t('Duplicate')}
        kbd={getBinding('edit.duplicate')}
        disabled={!hasSelection}
        onClick={() => run(() => { duplicateSelection(); }, hasSelection)}
      />
      <Item
        label={t('Delete')}
        kbd="Del / Backspace"
        disabled={!hasSelection}
        onClick={() => run(() => { deleteSelection(); }, hasSelection)}
      />
      <Item
        label={t('Rename Selection…')}
        disabled={!hasSelection}
        onClick={() => run(() => { const renamed = promptRenameSelection(t('Object name')); if (renamed) toast.success(`${renamed} ${t('objects renamed')}`); }, hasSelection)}
      />
      <Separator />
      <Item
        label={t('Group')}
        kbd={getBinding('edit.group')}
        disabled={!canGroup}
        onClick={() => run(() => { groupSelection(); }, canGroup)}
      />
      <Item
        label={t('Ungroup')}
        kbd={getBinding('edit.ungroup')}
        disabled={!canUngroup}
        onClick={() => run(() => { ungroupSelection(); }, canUngroup)}
      />
      <Item
        label={t('Isolation Mode')}
        kbd={getBinding('object.isolation')}
        disabled={!canUngroup}
        onClick={() => run(() => { toggleIsolationMode(); }, canUngroup)}
      />
      <Item
        label={t('Make Clipping Mask')}
        kbd={getBinding('edit.clipMask')}
        disabled={!canClip}
        onClick={() => run(() => { applyClipMask(); }, canClip)}
      />
      <Item
        label={t('Release Clipping Mask')}
        kbd={getBinding('edit.releaseClip')}
        disabled={!canReleaseClip}
        onClick={() => run(() => { releaseClipMask(); }, canReleaseClip)}
      />
      <Item
        label={t('Make Compound Path')}
        kbd={getBinding('edit.compoundPath')}
        disabled={!canClip}
        onClick={() => run(() => { makeCompoundPath(); }, canClip)}
      />
      <Item
        label={t('Release Compound Path')}
        kbd={getBinding('edit.releaseCompound')}
        disabled={!canReleaseCompound}
        onClick={() => run(() => { releaseCompoundPath(); }, canReleaseCompound)}
      />
      <SubMenu label={t('Pathfinder')} openLeft={openLeft} disabled={!canBool}>
        <Item label={t('Union')} disabled={!canBool} onClick={() => run(() => { void booleanOp('union').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); }, canBool)} />
        <Item label={t('Subtract')} disabled={!canBool} onClick={() => run(() => { void booleanOp('subtract').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); }, canBool)} />
        <Item label={t('Intersect')} disabled={!canBool} onClick={() => run(() => { void booleanOp('intersect').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); }, canBool)} />
        <Item label={t('Exclude')} disabled={!canBool} onClick={() => run(() => { void booleanOp('exclude').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); }, canBool)} />
        <Separator />
        <Item label={t('Divide')} disabled={!canBool} onClick={() => run(() => { divideSelection(); }, canBool)} />
        <Item label={t('Trim')} disabled={!canBool} onClick={() => run(() => { trimSelection(); }, canBool)} />
        <Item label={t('Merge')} disabled={!canBool} onClick={() => run(() => { mergeSelection(); }, canBool)} />
        <Item label={t('Crop')} disabled={!canBool} onClick={() => run(() => { cropSelection(); }, canBool)} />
      </SubMenu>
      <Separator />
      <SubMenu label={t('Align & Distribute')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Align left')} kbd={getBinding('align.left')} disabled={!canAlign} onClick={() => run(() => alignSelection('left'), canAlign)} />
        <Item label={t('Align center horizontally')} kbd={getBinding('align.centerH')} disabled={!canAlign} onClick={() => run(() => alignSelection('centerH'), canAlign)} />
        <Item label={t('Align right')} kbd={getBinding('align.right')} disabled={!canAlign} onClick={() => run(() => alignSelection('right'), canAlign)} />
        <Item label={t('Align top')} kbd={getBinding('align.top')} disabled={!canAlign} onClick={() => run(() => alignSelection('top'), canAlign)} />
        <Item label={t('Align center vertically')} kbd={getBinding('align.centerV')} disabled={!canAlign} onClick={() => run(() => alignSelection('centerV'), canAlign)} />
        <Item label={t('Align bottom')} kbd={getBinding('align.bottom')} disabled={!canAlign} onClick={() => run(() => alignSelection('bottom'), canAlign)} />
        <Separator />
        <Item label={t('Distribute horizontally (equal spacing)')} kbd={getBinding('distribute.horizontal')} disabled={!canDistribute} onClick={() => run(() => distributeSelection('horizontal'), canDistribute)} />
        <Item label={t('Distribute vertically (equal spacing)')} kbd={getBinding('distribute.vertical')} disabled={!canDistribute} onClick={() => run(() => distributeSelection('vertical'), canDistribute)} />
      </SubMenu>
      <SubMenu label={t('Transform')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Transform…')} disabled={!hasSelection} onClick={() => run(() => openModal('showTransform'), hasSelection)} />
        <Item label={t('Flip Horizontal')} kbd={getBinding('edit.flipH')} disabled={!hasSelection} onClick={() => run(() => flip('x'), hasSelection)} />
        <Item label={t('Flip Vertical')} kbd={getBinding('edit.flipV')} disabled={!hasSelection} onClick={() => run(() => flip('y'), hasSelection)} />
        <Item label={t('Rotate 90° CW')} disabled={!hasSelection} onClick={() => run(() => { void rotateSelection(90); }, hasSelection)} />
        <Item label={t('Rotate 90° CCW')} disabled={!hasSelection} onClick={() => run(() => { void rotateSelection(-90); }, hasSelection)} />
      </SubMenu>
      <Separator />
      <Item
        label={t('Bring to Front')}
        kbd={`${getBinding('arrange.forwardFront').replace(/]$/, 'Shift+]')}`}
        disabled={!hasSelection}
        onClick={() => run(() => { bringToFront(); }, hasSelection)}
      />
      <Item
        label={t('Bring Forward')}
        kbd={getBinding('arrange.forwardFront')}
        disabled={!hasSelection}
        onClick={() => run(() => { bringForward(); }, hasSelection)}
      />
      <Item
        label={t('Send Backward')}
        kbd={getBinding('arrange.backwardBack')}
        disabled={!hasSelection}
        onClick={() => run(() => { sendBackward(); }, hasSelection)}
      />
      <Item
        label={t('Send to Back')}
        kbd={`${getBinding('arrange.backwardBack').replace(/[[]$/, 'Shift+[')}`}
        disabled={!hasSelection}
        onClick={() => run(() => { sendToBack(); }, hasSelection)}
      />
      <Separator />
      <Item
        label={t('Lock Selection')}
        kbd={getBinding('edit.lockSelection')}
        disabled={!hasSelection}
        onClick={() => run(() => { const n = lockSelection(); if (n) toast.success(`${n} ${t('locked')}`); }, hasSelection)}
      />
      <Item
        label={t('Lock Others')}
        disabled={!hasSelection}
        onClick={() => run(() => { const n = lockOthers(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('No other unlocked objects.')); }, hasSelection)}
      />
      <Item
        label={t('Unlock Selection')}
        disabled={!hasSelection}
        onClick={() => run(() => { const n = unlockSelection(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked selection.')); }, hasSelection)}
      />
      <Item
        label={t('Unlock All')}
        kbd={getBinding('edit.unlockAll')}
        onClick={() => run(() => { const n = unlockAll(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked objects.')); }, true)}
      />
      <Item
        label={t('Hide Selection')}
        kbd={getBinding('edit.hideSelection')}
        disabled={!hasSelection}
        onClick={() => run(() => { const n = hideSelection(); if (n) toast.success(`${n} ${t('hidden')}`); }, hasSelection)}
      />
      <Item
        label={t('Hide Others')}
        disabled={!hasSelection}
        onClick={() => run(() => { const n = hideOthers(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); }, hasSelection)}
      />
      <Item
        label={t('Show Selection')}
        disabled={!hasSelection}
        onClick={() => run(() => { const n = showSelection(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden selection.')); }, hasSelection)}
      />
      <Item
        label={t('Show All')}
        kbd={getBinding('edit.showAll')}
        onClick={() => run(() => { const n = showAll(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden objects.')); }, true)}
      />
      <Separator />
      {editableText && (
        <Item
          label={t('Edit Text')}
          kbd="Enter"
          onClick={() => run(() => editText(), true)}
        />
      )}
      <SubMenu label={t('Type')} openLeft={openLeft}>
        <Item label={t('Create Outlines')} kbd={getBinding('text.createOutlines')} disabled={!hasTextSelection} onClick={() => run(() => { void createOutlinesFromText().then(ok => { if (ok) toast.success(t('Text converted to outlines')); else toast.warn(t('Select a single text object to enable')); }); }, hasTextSelection)} />
        <Item label={t('Break Text into Letters')} kbd={getBinding('text.splitLetters')} disabled={!hasTextSelection} onClick={() => run(() => { const n = splitTextToLetters(); if (n) toast.success(`${n} ${t('letters created')}`); else toast.warn(t('Select a text object first.')); }, hasTextSelection)} />
        <Item label={t('Text on Arc (Up)')} kbd={getBinding('text.arcUp')} disabled={!hasTextSelection} onClick={() => run(() => { if (!applyTextOnArc(false)) toast.warn(t('Select a text object first.')); }, hasTextSelection)} />
        <Item label={t('Text on Arc (Down)')} kbd={getBinding('text.arcDown')} disabled={!hasTextSelection} onClick={() => run(() => { if (!applyTextOnArc(true)) toast.warn(t('Select a text object first.')); }, hasTextSelection)} />
      </SubMenu>
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
        label={t('Trace Image')}
        disabled={!hasSelection}
        onClick={() => run(() => { void traceSelectedImage().then(ok => { if (ok) toast.success(t('Image traced')); else toast.warn(t('Select a raster image first.')); }); }, hasSelection)}
      />
      <SubMenu label={t('Image Filters')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Blur')} disabled={!hasSelection} onClick={() => run(() => applyBlur(0.08), hasSelection)} />
        <Item label={t('Sepia')} disabled={!hasSelection} onClick={() => run(() => applySepia(), hasSelection)} />
        <Item label={t('Grayscale')} disabled={!hasSelection} onClick={() => run(() => applyImageGrayscale(), hasSelection)} />
        <Item label={t('Brightness +')} disabled={!hasSelection} onClick={() => run(() => applyImageBrightness(0.12), hasSelection)} />
        <Item label={t('Clear Image Filters')} disabled={!hasSelection} onClick={() => run(() => clearFilters(), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Fill / Stroke')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Swap Fill / Stroke')} kbd={getBinding('edit.swapFillStroke')} disabled={!hasSelection} onClick={() => run(() => { if (!swapFillStroke()) toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Default Fill / Stroke')} kbd={getBinding('edit.defaultColors')} disabled={!hasSelection} onClick={() => run(() => defaultColors(), hasSelection)} />
        <Separator />
        <Item label={t('No Fill')} kbd={getBinding('appearance.noFill')} disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ fill: '' }), hasSelection)} />
        <Item label={t('No Stroke')} kbd={getBinding('appearance.noStroke')} disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ stroke: '', strokeWidth: 0 }), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Stroke alignment')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Center')} disabled={!hasSelection} onClick={() => run(() => applyStrokeAlign('center'), hasSelection)} />
        <Item label={t('Inside')} disabled={!hasSelection} onClick={() => run(() => applyStrokeAlign('inside'), hasSelection)} />
        <Item label={t('Outside')} disabled={!hasSelection} onClick={() => run(() => applyStrokeAlign('outside'), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Stroke width')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label="0.5 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 0.5 }), hasSelection)} />
        <Item label="1 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 1 }), hasSelection)} />
        <Item label="2 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 2 }), hasSelection)} />
        <Item label="4 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 4 }), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Stroke style')} openLeft={openLeft} disabled={!hasSelection}>
        <SubMenu label={t('Dash')} openLeft={openLeft} disabled={!hasSelection}>
          <Item label={t('Solid')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeDashArray: [] }), hasSelection)} />
          <Item label={t('Dashed')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeDashArray: [10, 5] }), hasSelection)} />
          <Item label={t('Dotted')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeDashArray: [2, 6] }), hasSelection)} />
        </SubMenu>
        <SubMenu label={t('Line cap')} openLeft={openLeft} disabled={!hasSelection}>
          <Item label={t('Butt')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeLineCap: 'butt' }), hasSelection)} />
          <Item label={t('Round')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeLineCap: 'round' }), hasSelection)} />
          <Item label={t('Square')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeLineCap: 'square' }), hasSelection)} />
        </SubMenu>
      </SubMenu>
      <SubMenu label={t('Blend mode')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Normal')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('source-over'), hasSelection)} />
        <Item label={t('Multiply')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('multiply'), hasSelection)} />
        <Item label={t('Screen')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('screen'), hasSelection)} />
        <Item label={t('Overlay')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('overlay'), hasSelection)} />
        <Item label={t('Darken')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('darken'), hasSelection)} />
        <Item label={t('Lighten')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('lighten'), hasSelection)} />
        <Item label={t('Difference')} disabled={!hasSelection} onClick={() => run(() => applyBlendModeToSelection('difference'), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Appearance')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Clear Appearance')} disabled={!hasSelection} onClick={() => run(() => { const n = clearAppearanceFromSelection(); if (n) toast.success(`${n} ${t('appearances cleared')}`); else toast.warn(t('Select something first.')); }, hasSelection)} />
        <Item label={t('Flatten Transparency')} disabled={!hasSelection} onClick={() => run(() => { const n = flattenTransparencySelection(); if (n) toast.success(`${n} ${t('objects flattened')}`); else toast.warn(t('Select transparent or blended objects first.')); }, hasSelection)} />
        <Item label={t('Expand Appearance')} disabled={!hasSelection} onClick={() => run(() => { void expandAppearanceSelection().then((n) => { if (n) toast.success(`${n} ${t('appearances expanded')}`); else toast.warn(t('Select objects with expandable appearance first.')); }); }, hasSelection)} />
        <Item label={t('Clear Gradient Fill')} disabled={!hasSelection} onClick={() => run(() => { const n = clearGradientFillSelection(); if (n) toast.success(`${n} ${t('gradient fills cleared')}`); else toast.warn(t('Select objects with gradient fills first.')); }, hasSelection)} />
        <Separator />
        <SubMenu label={t('Graphic Styles')} openLeft={openLeft} disabled={!hasSelection}>
          {loadGraphicStyles().map((style) => (
            <Item key={style.id} label={style.name} disabled={!hasSelection} onClick={() => run(() => { const n = applyGraphicStyleToSelection(style); if (n) toast.success(`${n} ${t('graphic styles applied')}`); else toast.warn(t('Select something first.')); }, hasSelection)} />
          ))}
        </SubMenu>
        <SubMenu label={t('Swatches')} openLeft={openLeft}>
          <Item label={t('Add current fill')} onClick={() => run(() => { const fill = useEditor.getState().style.fill; if (typeof fill !== 'string' || !fill) { toast.warn(t('Select an object with a solid colour first.')); return; } const before = loadSwatches().length; const next = addSavedSwatchColor(fill); if (next.length > before) toast.success(t('Swatch added')); else toast.warn(t('Swatch already exists.')); }, true)} />
          <Item label={t('Collect colours from selection')} onClick={() => run(() => { const result = collectSelectionColorsIntoSwatches(); if (result.added) toast.success(`${result.added} ${t('swatches added')}`); else toast.warn(t('Select an object with a solid colour first.')); }, true)} />
        </SubMenu>
      </SubMenu>
      <SubMenu label={t('Pattern Fill')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Checker')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('checker', 16, '#ffffff', '#111827'), hasSelection)} />
        <Item label={t('Stripes')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('stripes', 16, '#ffffff', '#111827'), hasSelection)} />
        <Item label={t('Dots')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('dots', 16, '#ffffff', '#111827'), hasSelection)} />
        <Item label={t('Crosshatch')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('crosshatch', 16, '#ffffff', '#111827'), hasSelection)} />
        <Separator />
        <Item label={t('Clear Pattern Fill')} disabled={!hasSelection} onClick={() => run(() => { const n = clearPatternFillSelection(); if (n) toast.success(`${n} ${t('pattern fills cleared')}`); else toast.warn(t('Select objects with pattern fills first.')); }, hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Drop shadow')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Soft Shadow')} disabled={!hasSelection} onClick={() => run(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 }), hasSelection)} />
        <Item label={t('Glow')} disabled={!hasSelection} onClick={() => run(() => applyShadowToSelection({ color: 'rgba(61,155,255,0.75)', blur: 16, offsetX: 0, offsetY: 0 }), hasSelection)} />
        <Separator />
        <Item label={t('Clear Shadow')} disabled={!hasSelection} onClick={() => run(() => applyShadowToSelection(null), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Opacity')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label="100%" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ opacity: 1 }), hasSelection)} />
        <Item label="75%" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ opacity: 0.75 }), hasSelection)} />
        <Item label="50%" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ opacity: 0.5 }), hasSelection)} />
        <Item label="25%" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ opacity: 0.25 }), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Edit Colors')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Recolor Artwork…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRecolor'), hasSelection)} />
        <Item label={t('Freeform Gradient…')} disabled={!hasSelection} onClick={() => run(() => openModal('showFreeformGradient'), hasSelection)} />
        <Item label={t('Invert Colors')} disabled={!hasSelection} onClick={() => run(() => { const n = invertColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); }, hasSelection)} />
        <Item label={t('Convert to Grayscale')} disabled={!hasSelection} onClick={() => run(() => { const n = grayscaleColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); }, hasSelection)} />
      </SubMenu>
      <Item
        label={t('Join Paths')}
        kbd={getBinding('edit.join')}
        disabled={pathCount !== 1 && pathCount !== 2}
        onClick={() => run(() => { joinSelection(); }, pathCount === 1 || pathCount === 2)}
      />
      <SubMenu label={t('Path Effects')} openLeft={openLeft}>
        <Item label={t('Add Anchor Points')} disabled={!hasSelection} onClick={() => run(() => { const n = addAnchorsToSelection(); if (n) toast.success(`${n} ${t('paths subdivided')}`); else toast.warn(t('Select one or more paths first.')); }, hasSelection)} />
        <Item label={t('Reverse Path Direction')} disabled={!hasSelection} onClick={() => run(() => { const n = reversePathSelection(); if (n) toast.success(`${n} ${t('paths reversed')}`); else toast.warn(t('Select one or more paths first.')); }, hasSelection)} />
        <Item label={t('Simplify Path…')} disabled={!hasSelection} onClick={() => run(() => openModal('showSimplify'), hasSelection)} />
        <Item label={t('Round Corners…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRoundCorners'), hasSelection)} />
        <Item label={t('Offset Path…')} disabled={!hasSelection} onClick={() => run(() => openModal('showOffsetPath'), hasSelection)} />
        <Item label={t('Blend…')} disabled={active.length < 2} onClick={() => run(() => openModal('showBlend'), active.length >= 2)} />
      </SubMenu>
      <Item
        label={t('Rasterize')}
        disabled={!hasSelection}
        onClick={() => run(() => { void rasterizeSelection().then(ok => { if (ok) toast.success(t('Rasterized')); else toast.warn(t('Select an object first.')); }); }, hasSelection)}
      />
      <Separator />
      <Item
        label={t('Select All')}
        kbd={getBinding('edit.selectAll')}
        onClick={() => run(() => selectAll(), true)}
      />
      <Item
        label={t('Deselect All')}
        kbd={getBinding('edit.deselectAll')}
        disabled={!hasSelection}
        onClick={() => run(() => { deselectAll(); }, hasSelection)}
      />
      <Item
        label={t('Select Inverse')}
        kbd={getBinding('edit.selectInverse')}
        onClick={() => run(() => { selectInverse(); }, true)}
      />
      <Item
        label={t('Select Next Object Above')}
        kbd={getBinding('edit.selectNextAbove')}
        onClick={() => run(() => { if (!selectObjectInStack('up')) toast.warn(t('Nothing above.')); }, true)}
      />
      <Item
        label={t('Select Next Object Below')}
        kbd={getBinding('edit.selectNextBelow')}
        onClick={() => run(() => { if (!selectObjectInStack('down')) toast.warn(t('Nothing below.')); }, true)}
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

/** A right-click menu row that reveals a nested flyout panel on hover/focus.
 *  `openLeft` flips the flyout to the left when the menu hugs the right edge. */
function SubMenu({ label, openLeft, disabled, children }: { label: string; openLeft: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative group/sub">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-label={label}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
      >
        <span>{label}</span>
        <ChevronRight size={12} aria-hidden="true" className="text-muted" />
      </button>
      {!disabled && (
        <div
          className={`absolute top-0 -mt-1 ${openLeft ? 'right-full' : 'left-full'} bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover/sub:opacity-100 group-hover/sub:visible group-focus-within/sub:opacity-100 group-focus-within/sub:visible transition-all z-1001 w-56 py-1 max-h-[70vh] overflow-y-auto overscroll-contain`}
          role="menu"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Small inline copy of MenuBar's Kbd helper — kept local on purpose so the two
 * surfaces can drift independently without coupling. Renders shortcut combos
 * as discrete chips and substitutes ⌘/⌥/⇧ on macOS.
 */
function Kbd({ combo }: { combo: string }) {
  const isMacPlatform = isMac();
  const renderKey = (key: string) => {
    const k = key.trim();
    if (isMacPlatform && /^Ctrl$/i.test(k)) return '⌘';
    if (isMacPlatform && /^Alt$/i.test(k)) return '⌥';
    if (isMacPlatform && /^Shift$/i.test(k)) return '⇧';
    if (isMacPlatform && /^Meta$/i.test(k)) return '⌘';
    return k;
  };
  const combos = combo.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {combos.map((part, comboIndex) => (
        <span key={`${part}-${comboIndex}`} className="flex items-center gap-0.5">
          {comboIndex > 0 && <span className="mx-0.5 text-muted">/</span>}
          {part.split('+').map((p, keyIndex) => (
            <kbd key={`${part}-${keyIndex}`} className="kbd-menu">
              {renderKey(p)}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
