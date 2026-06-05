import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import * as fabric from 'fabric';
import {
  getCanvas,
  zoomBy,
  zoomFit,
  zoomToPercent,
  zoomToSelection,
  zoomToArtboard,
  duplicateSelection,
  alignSelection,
  distributeSelection,
  distributeInArtboard,
  groupSelection,
  ungroupSelection,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
  deleteSelection,
  autoArrangeSelection,
  centerOnArtboard,
  flipSelection,
  selectVisibleObjects,
  selectUnlockedObjects,
  selectSame,
  selectSameType,
  selectInverse,
  selectAllText,
  selectAllImages,
  selectAllPaths,
  selectAllShapes,
  selectObjectInStack,
  lockSelection,
  unlockAll,
  hideSelection,
  hideOthers,
  showAll,
  deselectAll,
  promptRenameSelection,
  makeGuidesFromSelection,
  applyStyleToSelection,
  swapFillStroke,
  defaultColors,
  undo,
  redo,
} from '../lib/canvasEngine';
import {
  copySelection,
  cutSelection,
  pasteFromClipboard,
  hasClipboard,
} from '../lib/clipboard';
import { useEditor } from '../store/editor';
import { buildOutlineCutPaths, weldOutline, outlineStrokeToCutPaths } from '../lib/contourFromSelection';
import { joinSelection } from '../lib/pathJoin';
import { repeatTransform, rotateSelection } from '../lib/transformOps';
import { toggleIsolationMode } from '../lib/isolationMode';
import { booleanOp, divideSelection, trimSelection, mergeSelection, cropSelection } from '../lib/booleanOps';
import { addAnchorsToSelection } from '../lib/addAnchors';
import { averageSelectedAnchors } from '../lib/pathEdit';
import { reversePathSelection } from '../lib/pathReverse';
import { pasteFromSystemClipboard, traceSelectedImage } from '../lib/io3';
import { rasterizeSelection } from '../lib/rasterize';
import { fitArtboardToContent } from '../lib/fitArtboard';
import { createArtboardFromSelection, exportAllArtboardsAsFiles, exportAllArtboardsAsPNG } from '../lib/artboards';
import { outlineStrokeToFillSelection } from '../lib/outlineStrokeFill';
import { invertColorsSelection, grayscaleColorsSelection } from '../lib/colorAdjust';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { createOutlinesFromText } from '../lib/textToOutline';
import { splitTextToLetters, splitTextToLines } from '../lib/splitText';
import { adjustFontSize, adjustLeading, adjustTracking, changeCaseSelection } from '../lib/textCase';
import { smartPunctuationSelection } from '../lib/smartPunctuation';
import { applyTextOnArc } from '../lib/textPath';
import { exportSelectionSVG, exportSelectionPNG, copySelectionSVG } from '../lib/exportSelection';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { getBinding } from '../lib/keymap';
import { isMac, ariaKeyshortcuts } from '../lib/runtime';
import { setOutlineMode, isOutlineMode } from '../lib/outlineView';
import { applyBlur, applySepia, applyGrayscale as applyImageGrayscale, applyBrightness as applyImageBrightness, applyContrast, applyHueRotate, clearFilters } from '../lib/filters';
import { cleanUpDocument } from '../lib/cleanUp';
import { saveSelectionAsSymbol } from '../lib/symbols';
import { addArrowheads } from '../lib/arrowheads';
import { applyStrokeAlign } from '../lib/strokeAlign';
import { applyBlendModeToSelection, applyPatternFill, applyShadowToSelection, applyStrokeStyleToSelection, toggleUniformStroke } from '../lib/effects';
import { getFormat } from '../lib/formats';
import { openProjectFromFile, openRecentFile, saveProjectQuick, saveProjectToFile } from '../lib/projectFile';
import { clearRecent, subscribeRecent, type RecentFile } from '../lib/recentFiles';
import { addPlotterBridges, addPlotterGrommets, addPlotterRegistrationMarks, addPlotterRhinestones, addPlotterWeedBorder, clearPlotterBridges, clearPlotterRegistrationMarks, clearPlotterWeedBorders, savePlotterTestCut } from '../lib/cutPrepActions';

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

export function CanvasContextMenu({ onNewDocument, onOpenFile, onImportImage, onToggleDebug }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  // We subscribe to selection state so disabled items refresh whenever the
  // canvas selection changes (mostly relevant after a copy/cut completed).
  const selectionIds = useEditor((s) => s.selectionIds);
  const cutPaths = useEditor((s) => s.cutPaths);
  const cutPathCount = cutPaths.length;
  const contourCutCount = cutPaths.filter(p => p.kind === 'outline').length;
  const traceCutCount = cutPaths.filter(p => p.kind === 'trace').length;
  const regmarkCutCount = cutPaths.filter(p => p.kind === 'regmark').length;
  const cutPathsVisible = useEditor((s) => s.cutPathsVisible);
  const artboardCount = useEditor((s) => s.artboards.length);
  const gridVisible = useEditor((s) => s.gridVisible);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const smartGuidesEnabled = useEditor((s) => s.smartGuidesEnabled);
  const anchorSnapEnabled = useEditor((s) => s.anchorSnapEnabled);
  const rulersVisible = useEditor((s) => s.rulersVisible);
  const guidesVisible = useEditor((s) => s.guidesVisible);
  const guidesLocked = useEditor((s) => s.guidesLocked);
  const theme = useEditor((s) => s.theme);
  const highContrast = useEditor((s) => s.highContrast);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [clipboardTick, setClipboardTick] = useState(0);

  useEffect(() => subscribeRecent(setRecent), []);

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
  const canDistributeArtboard = active.length >= 1 && artboardCount > 0;
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

  const changeCase = (mode: 'upper' | 'lower' | 'title' | 'sentence') => {
    const n = changeCaseSelection(mode);
    if (n) toast.success(`${n} ${t('text objects updated')}`);
    else toast.warn(t('Select a text object first.'));
  };

  const adjustTextMetric = (fn: (delta: number) => number, delta: number) => {
    const n = fn(delta);
    if (n) toast.success(`${n} ${t('text objects updated')}`);
    else toast.warn(t('Select a text object first.'));
  };

  const copyAsSvg = async () => {
    const r = await copySelectionSVG();
    if (r === 'ok') toast.success(t('SVG copied to clipboard'));
    else if (r === 'empty') toast.warn(t('Select something first.'));
    else toast.warn(t('Clipboard unavailable.'));
  };

  const openModal = (k: 'showCutContour' | 'showPlotter' | 'showOutline' | 'showRecolor' | 'showRhinestone' | 'showGrommets' | 'showVariableData' | 'showSimplify' | 'showRoundCorners' | 'showOffsetPath' | 'showRoughen' | 'showZigzag' | 'showPucker' | 'showTwist' | 'showFreeDistort' | 'showFreeformGradient' | 'showSaturate' | 'showHue' | 'showBrightness' | 'showTransform' | 'showResize' | 'showShear' | 'showRepeat' | 'showMarginGuides' | 'showFindReplace' | 'showSingleLineText' | 'showWarp' | 'showBlend' | 'showStar' | 'showSplitGrid' | 'showPrint' | 'showTilePrint' | 'showHelpCenter' | 'showPreferences' | 'showKeymapEditor' | 'showShortcuts' | 'showDocSettings' | 'showTemplates' | 'showCommandPalette') =>
    useEditor.getState().setModal(k, true);

  const openPrintPrep = () => {
    const ed = useEditor.getState();
    ed.setModal('openPrintPrep', true);
    ed.setModal('showPrint', true);
  };

  const nest = () => {
    const n = autoArrangeSelection();
    if (n > 0) toast.success(`${n} ${t('objects arranged')}`, { title: t('Auto-arrange (Nest)') });
    else toast.warn(t('Select 2 or more objects first.'), { title: t('Auto-arrange (Nest)') });
  };

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


  const toggleCutPreview = () => {
    const ed = useEditor.getState();
    ed.setCutPathsVisible(!ed.cutPathsVisible);
  };

  const clearCutJob = () => {
    const ed = useEditor.getState();
    ed.clearCutPaths();
    toast.success(t('Cut paths cleared'), { title: t('Cut prep') });
  };
  const clearCutKind = (kind: 'outline' | 'trace' | 'regmark') => {
    const ed = useEditor.getState();
    ed.clearCutPaths(kind);
    const message = kind === 'outline'
      ? t('Contour cut paths cleared')
      : kind === 'trace'
        ? t('Traced cut paths cleared')
        : t('Registration marks cleared');
    toast.success(message, { title: t('Cut prep') });
  };

  const saveSymbolFromSelection = async () => {
    if (!hasSelection) { toast.warn(t('Select one or more objects on the canvas first.')); return; }
    const name = window.prompt(t('Symbol name'), 'Symbol');
    if (name == null) return;
    const entry = await saveSelectionAsSymbol(name.trim() || 'Symbol');
    if (entry) toast.success(t('Symbol saved'));
    else toast.warn(t('Select one or more objects on the canvas first.'));
  };

  const makeArtboardFromSelection = () => {
    const ab = createArtboardFromSelection();
    if (!ab) { toast.warn(t('Select something first.')); return; }
    zoomToArtboard({ x: ab.x, y: ab.y, width: ab.width, height: ab.height });
    toast.success(t('Artboard created'));
  };

  const toggleStoreFlag = (key: 'gridVisible' | 'snapEnabled' | 'smartGuidesEnabled' | 'anchorSnapEnabled' | 'rulersVisible' | 'guidesVisible' | 'guidesLocked') => {
    const st = useEditor.getState();
    if (key === 'gridVisible') st.setGridVisible(!st.gridVisible);
    else if (key === 'snapEnabled') st.setSnapEnabled(!st.snapEnabled);
    else if (key === 'smartGuidesEnabled') st.setSmartGuidesEnabled(!st.smartGuidesEnabled);
    else if (key === 'anchorSnapEnabled') st.setAnchorSnapEnabled(!st.anchorSnapEnabled);
    else if (key === 'rulersVisible') st.setRulersVisible(!st.rulersVisible);
    else if (key === 'guidesVisible') st.setGuidesVisible(!st.guidesVisible);
    else st.setGuidesLocked(!st.guidesLocked);
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
      className="fixed z-[1000] bg-panel border border-border rounded-md shadow-xl py-1 text-xs max-h-[90vh] overflow-y-auto overscroll-contain"
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
      <SubMenu label={t('File / Import')} openLeft={openLeft}>
        <Item label={t('New')} kbd={getBinding('file.new')} onClick={() => run(() => onNewDocument(), true)} />
        <Item label={t('New from Template…')} kbd={getBinding('file.newFromTemplate')} onClick={() => run(() => openModal('showTemplates'), true)} />
        <Item label={t('Open SVG / JSON…')} kbd={getBinding('file.open')} onClick={() => run(() => onOpenFile(), true)} />
        <Item label={t('Import Image…')} kbd={getBinding('file.importImage')} onClick={() => run(() => onImportImage(), true)} />
        <Item label={t('Paste from Clipboard')} onClick={() => run(() => { void pasteFromSystemClipboard().then(r => { if (r === 'empty') toast.warn(t('No image or SVG on the clipboard.')); else if (r === 'failed') toast.warn(t('Clipboard unavailable.')); }); }, true)} />
        <Separator />
        <Item label={t('Open Project…')} kbd={getBinding('file.openProject')} onClick={() => run(() => { void openProjectFromFile(); }, true)} />
        <Item label={t('Save Project')} kbd={getBinding('file.saveProject')} onClick={() => run(() => { void saveProjectQuick(); }, true)} />
        <Item label={t('Save Project As…')} kbd={getBinding('file.saveProjectAs')} onClick={() => run(() => { void saveProjectToFile(); }, true)} />
        {recent.length > 0 && <Separator />}
        {recent.slice(0, 5).map((f) => (
          <Item key={f.name} label={`${t('Open Recent')}: ${f.name}`} onClick={() => run(() => { void openRecentFile(f.name); }, true)} />
        ))}
        {recent.length > 0 && <Item label={t('Clear Recent')} onClick={() => run(() => clearRecent(), true)} />}
      </SubMenu>
      <SubMenu label={t('Export')} openLeft={openLeft}>
        <Item label={t('Export SVG')} kbd={getBinding('file.exportSvg')} onClick={() => run(() => { void getFormat('svg')?.export?.(); }, true)} />
        <Item label={t('Export PNG (2×)')} onClick={() => run(() => { void getFormat('png')?.export?.(); }, true)} />
        <Item label={t('Export JPG (2×)')} onClick={() => run(() => { void getFormat('jpg')?.export?.(); }, true)} />
        <Item label={t('Export PDF')} onClick={() => run(() => { void getFormat('pdf')?.export?.(); }, true)} />
        <Item label={t('Export PDF (Vector)')} onClick={() => run(() => { void getFormat('pdf-vector')?.export?.(); }, true)} />
        <Item label={t('Export DXF (paths)')} onClick={() => run(() => { void getFormat('dxf')?.export?.(); }, true)} />
        <Item label={t('Export JSON')} onClick={() => run(() => { void getFormat('json')?.export?.(); }, true)} />
        <Separator />
        <Item label={t('Export All Artboards (SVG)')} onClick={() => run(() => { void exportAllArtboardsAsFiles().then(n => { if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); }, true)} />
        <Item label={t('Export All Artboards (PNG)')} onClick={() => run(() => { const n = exportAllArtboardsAsPNG(); if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }, true)} />
        <Separator />
        <Item label={t('Export Selection as SVG')} disabled={!hasSelection} onClick={() => run(() => exportSelectionSVG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }), hasSelection)} />
        <Item label={t('Export Selection as PNG')} disabled={!hasSelection} onClick={() => run(() => exportSelectionPNG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }), hasSelection)} />
        <Item label={t('Copy as SVG')} disabled={!hasSelection} onClick={() => run(() => copyAsSvg(), hasSelection)} />
      </SubMenu>
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
        <Item label={t('Minus Back')} disabled={!canBool} onClick={() => run(() => { void booleanOp('minus-back').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); }, canBool)} />
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
        <Separator />
        <Item label={t('Align top')} kbd={getBinding('align.top')} disabled={!canAlign} onClick={() => run(() => alignSelection('top'), canAlign)} />
        <Item label={t('Align center vertically')} kbd={getBinding('align.centerV')} disabled={!canAlign} onClick={() => run(() => alignSelection('centerV'), canAlign)} />
        <Item label={t('Align bottom')} kbd={getBinding('align.bottom')} disabled={!canAlign} onClick={() => run(() => alignSelection('bottom'), canAlign)} />
        <Separator />
        <Item label={t('Distribute horizontally (equal spacing)')} kbd={getBinding('distribute.horizontal')} disabled={!canDistribute} onClick={() => run(() => distributeSelection('horizontal'), canDistribute)} />
        <Item label={t('Distribute vertically (equal spacing)')} kbd={getBinding('distribute.vertical')} disabled={!canDistribute} onClick={() => run(() => distributeSelection('vertical'), canDistribute)} />
        <Item label={t('Distribute horizontally in Artboard')} disabled={!canDistributeArtboard} onClick={() => run(() => distributeInArtboard('horizontal'), canDistributeArtboard)} />
        <Item label={t('Distribute vertically in Artboard')} disabled={!canDistributeArtboard} onClick={() => run(() => distributeInArtboard('vertical'), canDistributeArtboard)} />
        <Item label={t('Center on Artboard')} disabled={!canDistributeArtboard} onClick={() => run(() => { if (!centerOnArtboard()) toast.warn(t('Select something first.')); }, canDistributeArtboard)} />
      </SubMenu>
      <SubMenu label={t('Transform')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Transform…')} disabled={!hasSelection} onClick={() => run(() => openModal('showTransform'), hasSelection)} />
        <Item label={t('Resize…')} disabled={!hasSelection} onClick={() => run(() => openModal('showResize'), hasSelection)} />
        <Item label={t('Shear…')} disabled={!hasSelection} onClick={() => run(() => openModal('showShear'), hasSelection)} />
        <Item label={t('Repeat (Grid / Radial / Mirror)…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRepeat'), hasSelection)} />
        <Item label={t('Transform Again')} kbd={getBinding('edit.transformAgain')} disabled={!hasSelection} onClick={() => run(() => { repeatTransform().then(ok => { if (!ok) toast.warn(t('Apply a Transform first.')); }); }, hasSelection)} />
        <Separator />
        <Item label={t('Flip Horizontal')} kbd={getBinding('edit.flipH')} disabled={!hasSelection} onClick={() => run(() => flip('x'), hasSelection)} />
        <Item label={t('Flip Vertical')} kbd={getBinding('edit.flipV')} disabled={!hasSelection} onClick={() => run(() => flip('y'), hasSelection)} />
        <Item label={t('Rotate 90° CW')} disabled={!hasSelection} onClick={() => run(() => { void rotateSelection(90); }, hasSelection)} />
        <Item label={t('Rotate 90° CCW')} disabled={!hasSelection} onClick={() => run(() => { void rotateSelection(-90); }, hasSelection)} />
        <Item label={t('Rotate 180°')} disabled={!hasSelection} onClick={() => run(() => { void rotateSelection(180); }, hasSelection)} />
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
        <Item label={t('Break Text into Lines')} kbd={getBinding('text.splitLines')} disabled={!hasTextSelection} onClick={() => run(() => { const n = splitTextToLines(); if (n) toast.success(`${n} ${t('lines created')}`); else toast.warn(t('Select multi-line text first.')); }, hasTextSelection)} />
        <Separator />
        <Item label={t('Text on Arc (Up)')} kbd={getBinding('text.arcUp')} disabled={!hasTextSelection} onClick={() => run(() => { if (!applyTextOnArc(false)) toast.warn(t('Select a text object first.')); }, hasTextSelection)} />
        <Item label={t('Text on Arc (Down)')} kbd={getBinding('text.arcDown')} disabled={!hasTextSelection} onClick={() => run(() => { if (!applyTextOnArc(true)) toast.warn(t('Select a text object first.')); }, hasTextSelection)} />
        <Separator />
        <Item label={t('Increase Font Size')} kbd={getBinding('text.fontSizeUp')} disabled={!hasTextSelection} onClick={() => run(() => adjustTextMetric(adjustFontSize, 2), hasTextSelection)} />
        <Item label={t('Decrease Font Size')} kbd={getBinding('text.fontSizeDown')} disabled={!hasTextSelection} onClick={() => run(() => adjustTextMetric(adjustFontSize, -2), hasTextSelection)} />
        <Item label={t('Increase Tracking')} kbd={getBinding('text.trackingUp')} disabled={!hasTextSelection} onClick={() => run(() => adjustTextMetric(adjustTracking, 25), hasTextSelection)} />
        <Item label={t('Decrease Tracking')} kbd={getBinding('text.trackingDown')} disabled={!hasTextSelection} onClick={() => run(() => adjustTextMetric(adjustTracking, -25), hasTextSelection)} />
        <Item label={t('Increase Leading')} kbd={getBinding('text.leadingUp')} disabled={!hasTextSelection} onClick={() => run(() => adjustTextMetric(adjustLeading, 0.05), hasTextSelection)} />
        <Item label={t('Decrease Leading')} kbd={getBinding('text.leadingDown')} disabled={!hasTextSelection} onClick={() => run(() => adjustTextMetric(adjustLeading, -0.05), hasTextSelection)} />
        <Separator />
        <Item label={t('Single-line Text…')} kbd={getBinding('text.singleLine')} onClick={() => run(() => openModal('showSingleLineText'), true)} />
        <Item label={t('Find & Replace…')} kbd={getBinding('text.findReplace')} onClick={() => run(() => openModal('showFindReplace'), true)} />
        <SubMenu label={t('Change Case')} openLeft={openLeft} disabled={!hasTextSelection}>
          <Item label="UPPERCASE" kbd={getBinding('text.caseUpper')} disabled={!hasTextSelection} onClick={() => run(() => changeCase('upper'), hasTextSelection)} />
          <Item label="lowercase" kbd={getBinding('text.caseLower')} disabled={!hasTextSelection} onClick={() => run(() => changeCase('lower'), hasTextSelection)} />
          <Item label="Title Case" kbd={getBinding('text.caseTitle')} disabled={!hasTextSelection} onClick={() => run(() => changeCase('title'), hasTextSelection)} />
          <Item label="Sentence case" kbd={getBinding('text.caseSentence')} disabled={!hasTextSelection} onClick={() => run(() => changeCase('sentence'), hasTextSelection)} />
        </SubMenu>
        <Item label={t('Smart Punctuation')} kbd={getBinding('text.smartPunctuation')} disabled={!hasTextSelection} onClick={() => run(() => { const n = smartPunctuationSelection(); if (n) toast.success(`${n} ${t('text objects updated')}`); else toast.warn(t('Select a text object first.')); }, hasTextSelection)} />
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
        <Item label={t('Brightness -')} disabled={!hasSelection} onClick={() => run(() => applyImageBrightness(-0.12), hasSelection)} />
        <Item label={t('Contrast +')} disabled={!hasSelection} onClick={() => run(() => applyContrast(0.18), hasSelection)} />
        <Item label={t('Hue rotate')} disabled={!hasSelection} onClick={() => run(() => applyHueRotate(30), hasSelection)} />
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
        <Separator />
        <Item label={t('Constant Stroke Width')} disabled={!hasSelection} onClick={() => run(() => { const s = toggleUniformStroke(); if (s === null) toast.warn(t('Select an object first.')); else toast.success(s ? t('Stroke width is now constant') : t('Stroke width now scales')); }, hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Stroke width')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label="0 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 0 }), hasSelection)} />
        <Item label="0.5 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 0.5 }), hasSelection)} />
        <Item label="1 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 1 }), hasSelection)} />
        <Item label="2 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 2 }), hasSelection)} />
        <Item label="4 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 4 }), hasSelection)} />
        <Item label="8 px" disabled={!hasSelection} onClick={() => run(() => applyStyleToSelection({ strokeWidth: 8 }), hasSelection)} />
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
        <SubMenu label={t('Line join')} openLeft={openLeft} disabled={!hasSelection}>
          <Item label={t('Miter')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeLineJoin: 'miter' }), hasSelection)} />
          <Item label={t('Round')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeLineJoin: 'round' }), hasSelection)} />
          <Item label={t('Bevel')} disabled={!hasSelection} onClick={() => run(() => applyStrokeStyleToSelection({ strokeLineJoin: 'bevel' }), hasSelection)} />
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
      <SubMenu label={t('Pattern Fill')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Checker')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('checker', 16, '#ffffff', '#111827'), hasSelection)} />
        <Item label={t('Stripes')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('stripes', 16, '#ffffff', '#111827'), hasSelection)} />
        <Item label={t('Dots')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('dots', 16, '#ffffff', '#111827'), hasSelection)} />
        <Item label={t('Crosshatch')} disabled={!hasSelection} onClick={() => run(() => applyPatternFill('crosshatch', 16, '#ffffff', '#111827'), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Drop shadow')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Soft Shadow')} disabled={!hasSelection} onClick={() => run(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 }), hasSelection)} />
        <Item label={t('Hard Shadow')} disabled={!hasSelection} onClick={() => run(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.45)', blur: 0, offsetX: 5, offsetY: 5 }), hasSelection)} />
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
        <Item label={t('Saturate…')} disabled={!hasSelection} onClick={() => run(() => openModal('showSaturate'), hasSelection)} />
        <Item label={t('Adjust Hue…')} disabled={!hasSelection} onClick={() => run(() => openModal('showHue'), hasSelection)} />
        <Item label={t('Adjust Brightness…')} disabled={!hasSelection} onClick={() => run(() => openModal('showBrightness'), hasSelection)} />
      </SubMenu>
      <SubMenu label={t('Sign Effects')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Multi-outline…')} disabled={!hasSelection} onClick={() => run(() => openModal('showOutline'), hasSelection)} />
        <Item label={t('Rhinestone Template…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRhinestone'), hasSelection)} />
        <SubMenu label={t('Rhinestone presets')} openLeft={openLeft}>
          <Item label={t('Fine stones')} disabled={!hasSelection} onClick={() => run(() => { addPlotterRhinestones(t, 2, 3); }, hasSelection)} />
          <Item label={t('Standard stones')} disabled={!hasSelection} onClick={() => run(() => { addPlotterRhinestones(t, 2.8, 4); }, hasSelection)} />
          <Item label={t('Bold stones')} disabled={!hasSelection} onClick={() => run(() => { addPlotterRhinestones(t, 4.7, 6); }, hasSelection)} />
          <Item label={t('Custom…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRhinestone'), hasSelection)} />
        </SubMenu>
        <Item label={t('Banner Grommets…')} disabled={!hasSelection} onClick={() => run(() => openModal('showGrommets'), hasSelection)} />
        <Item label={t('Variable Data…')} disabled={!hasSelection} onClick={() => run(() => openModal('showVariableData'), hasSelection)} />
        <Item label={t('Auto-arrange (Nest)')} disabled={active.length < 2} onClick={() => run(() => nest(), active.length >= 2)} />
      </SubMenu>
      <Item
        label={t('Join Paths')}
        kbd={getBinding('edit.join')}
        disabled={pathCount !== 1 && pathCount !== 2}
        onClick={() => run(() => { joinSelection(); }, pathCount === 1 || pathCount === 2)}
      />
      <SubMenu label={t('Path Effects')} openLeft={openLeft}>
        <Item label={t('Clean Up')} onClick={() => run(() => { const n = cleanUpDocument(); if (n) toast.success(`${n} ${t('stray objects removed')}`); else toast.success(t('Nothing to clean up.')); }, true)} />
        <Separator />
        <Item label={t('Add Anchor Points')} disabled={!hasSelection} onClick={() => run(() => { const n = addAnchorsToSelection(); if (n) toast.success(`${n} ${t('paths subdivided')}`); else toast.warn(t('Select one or more paths first.')); }, hasSelection)} />
        <Item label={t('Average Anchor Points')} kbd={getBinding('path.averageAnchors')} disabled={!hasSelection} onClick={() => run(() => { const n = averageSelectedAnchors('both'); if (n) toast.success(`${n} ${t('anchors averaged')}`); else toast.warn(t('Shift-click two or more path anchors first.')); }, hasSelection)} />
        <Item label={t('Outline Stroke to Fill')} disabled={!hasSelection} onClick={() => run(() => { const n = outlineStrokeToFillSelection(); if (n) toast.success(`${n} ${t('strokes outlined')}`); else toast.warn(t('Select shapes that have a stroke first.')); }, hasSelection)} />
        <Item label={t('Reverse Path Direction')} disabled={!hasSelection} onClick={() => run(() => { const n = reversePathSelection(); if (n) toast.success(`${n} ${t('paths reversed')}`); else toast.warn(t('Select one or more paths first.')); }, hasSelection)} />
        <Item label={t('Add Arrowhead (Start)')} disabled={!hasSelection} onClick={() => run(() => { const n = addArrowheads('start'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); }, hasSelection)} />
        <Item label={t('Add Arrowhead (End)')} disabled={!hasSelection} onClick={() => run(() => { const n = addArrowheads('end'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); }, hasSelection)} />
        <Item label={t('Add Arrowheads (Both)')} disabled={!hasSelection} onClick={() => run(() => { const n = addArrowheads('both'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); }, hasSelection)} />
        <Item label={t('Simplify Path…')} disabled={!hasSelection} onClick={() => run(() => openModal('showSimplify'), hasSelection)} />
        <Item label={t('Round Corners…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRoundCorners'), hasSelection)} />
        <Item label={t('Offset Path…')} disabled={!hasSelection} onClick={() => run(() => openModal('showOffsetPath'), hasSelection)} />
        <Item label={t('Roughen…')} disabled={!hasSelection} onClick={() => run(() => openModal('showRoughen'), hasSelection)} />
        <Item label={t('Zig Zag…')} disabled={!hasSelection} onClick={() => run(() => openModal('showZigzag'), hasSelection)} />
        <Item label={t('Pucker & Bloat…')} disabled={!hasSelection} onClick={() => run(() => openModal('showPucker'), hasSelection)} />
        <Item label={t('Twist…')} disabled={!hasSelection} onClick={() => run(() => openModal('showTwist'), hasSelection)} />
        <Item label={t('Free Distort…')} disabled={!hasSelection} onClick={() => run(() => openModal('showFreeDistort'), hasSelection)} />
        <Item label={t('Arc Warp…')} disabled={!hasSelection} onClick={() => run(() => openModal('showWarp'), hasSelection)} />
        <Item label={t('Blend…')} disabled={active.length < 2} onClick={() => run(() => openModal('showBlend'), active.length >= 2)} />
      </SubMenu>
      <SubMenu label={t('Cut prep')} openLeft={openLeft}>
        <Item label={t('Generate 2 mm contour')} disabled={!hasSelection} onClick={() => run(() => oneClickContour(), hasSelection)} />
        <Item label={t('Cut Contour…')} kbd={getBinding('window.cutContour')} disabled={!hasSelection} onClick={() => run(() => openModal('showCutContour'), hasSelection)} />
        <Item label={t('Weld cut paths')} disabled={!hasSelection} onClick={() => run(() => weld(), hasSelection)} />
        <Item label={t('Stroke edges to cut paths')} disabled={!hasSelection} onClick={() => run(() => outlineStroke(), hasSelection)} />
        <Item label={t('Add positioning marks')} onClick={() => run(() => addPlotterRegistrationMarks(t), true)} />
        <Item label={t('Weed border')} onClick={() => run(() => addPlotterWeedBorder(t), true)} />
        <SubMenu label={t('Weed grid presets')} openLeft={openLeft}>
          <Item label={t('Weed rows')} onClick={() => run(() => addPlotterWeedBorder(t, 2, 0), true)} />
          <Item label={t('Weed columns')} onClick={() => run(() => addPlotterWeedBorder(t, 0, 2), true)} />
          <Item label={t('2×2')} onClick={() => run(() => addPlotterWeedBorder(t, 2, 2), true)} />
          <Item label={t('3×2')} onClick={() => run(() => addPlotterWeedBorder(t, 3, 2), true)} />
        </SubMenu>
        <SubMenu label={t('Bridge presets')} openLeft={openLeft}>
          <Item label={t('Light')} onClick={() => run(() => { addPlotterBridges(t, 2, 0.6); }, true)} />
          <Item label={t('Standard')} onClick={() => run(() => { addPlotterBridges(t, 4, 1); }, true)} />
          <Item label={t('Heavy')} onClick={() => run(() => { addPlotterBridges(t, 6, 1.5); }, true)} />
        </SubMenu>
        <SubMenu label={t('Banner Grommet presets')} openLeft={openLeft}>
          <Item label={t('Small banner')} disabled={!hasSelection} onClick={() => run(() => { addPlotterGrommets(t, 15, 300, 8); }, hasSelection)} />
          <Item label={t('Standard banner')} disabled={!hasSelection} onClick={() => run(() => { addPlotterGrommets(t, 20, 500, 10); }, hasSelection)} />
          <Item label={t('Large banner')} disabled={!hasSelection} onClick={() => run(() => { addPlotterGrommets(t, 25, 750, 12); }, hasSelection)} />
          <Item label={t('Custom…')} disabled={!hasSelection} onClick={() => run(() => openModal('showGrommets'), hasSelection)} />
        </SubMenu>
        <Item label={t('Save Test Cut File')} onClick={() => run(() => savePlotterTestCut(t), true)} />
        <Item label={t('Clear positioning marks')} onClick={() => run(() => { clearPlotterRegistrationMarks(t); }, true)} />
        <Item label={t('Clear weed borders')} onClick={() => run(() => { clearPlotterWeedBorders(t); }, true)} />
        <Item label={t('Clear bridges')} onClick={() => run(() => { clearPlotterBridges(t); }, true)} />
        <Separator />
        <Item label={cutPathsVisible ? t('Hide cut preview') : t('Show cut preview')} disabled={cutPathCount === 0} onClick={() => run(() => toggleCutPreview(), cutPathCount > 0)} />
        <Item label={t('Clear contour')} disabled={contourCutCount === 0} onClick={() => run(() => clearCutKind('outline'), contourCutCount > 0)} />
        <Item label={t('Clear trace')} disabled={traceCutCount === 0} onClick={() => run(() => clearCutKind('trace'), traceCutCount > 0)} />
        <Item label={t('Clear regmarks')} disabled={regmarkCutCount === 0} onClick={() => run(() => clearCutKind('regmark'), regmarkCutCount > 0)} />
        <Item label={t('Clear cut paths')} disabled={cutPathCount === 0} onClick={() => run(() => clearCutJob(), cutPathCount > 0)} />
        <Item label={t('Send to Plotter…')} kbd={getBinding('window.plotter')} onClick={() => run(() => openModal('showPlotter'), true)} />
      </SubMenu>
      <SubMenu label={t('Print / Output')} openLeft={openLeft}>
        <Item label={t('Print…')} kbd={getBinding('file.print')} onClick={() => run(() => openModal('showPrint'), true)} />
        <Item label={t('Print Prep…')} onClick={() => run(() => openPrintPrep(), true)} />
        <Item label={t('Tile Print…')} kbd={getBinding('file.tilePrint')} onClick={() => run(() => openModal('showTilePrint'), true)} />
        <Item label={t('Auto-arrange (Nest)')} disabled={active.length < 2} onClick={() => run(() => nest(), active.length >= 2)} />
        <Item label={t('Add positioning marks')} onClick={() => run(() => addPlotterRegistrationMarks(t), true)} />
        <Item label={t('Weed border')} onClick={() => run(() => addPlotterWeedBorder(t), true)} />
        <SubMenu label={t('Weed grid presets')} openLeft={openLeft}>
          <Item label={t('Weed rows')} onClick={() => run(() => addPlotterWeedBorder(t, 2, 0), true)} />
          <Item label={t('Weed columns')} onClick={() => run(() => addPlotterWeedBorder(t, 0, 2), true)} />
          <Item label={t('2×2')} onClick={() => run(() => addPlotterWeedBorder(t, 2, 2), true)} />
          <Item label={t('3×2')} onClick={() => run(() => addPlotterWeedBorder(t, 3, 2), true)} />
        </SubMenu>
        <SubMenu label={t('Bridge presets')} openLeft={openLeft}>
          <Item label={t('Light')} onClick={() => run(() => { addPlotterBridges(t, 2, 0.6); }, true)} />
          <Item label={t('Standard')} onClick={() => run(() => { addPlotterBridges(t, 4, 1); }, true)} />
          <Item label={t('Heavy')} onClick={() => run(() => { addPlotterBridges(t, 6, 1.5); }, true)} />
        </SubMenu>
        <SubMenu label={t('Banner Grommet presets')} openLeft={openLeft}>
          <Item label={t('Small banner')} disabled={!hasSelection} onClick={() => run(() => { addPlotterGrommets(t, 15, 300, 8); }, hasSelection)} />
          <Item label={t('Standard banner')} disabled={!hasSelection} onClick={() => run(() => { addPlotterGrommets(t, 20, 500, 10); }, hasSelection)} />
          <Item label={t('Large banner')} disabled={!hasSelection} onClick={() => run(() => { addPlotterGrommets(t, 25, 750, 12); }, hasSelection)} />
          <Item label={t('Custom…')} disabled={!hasSelection} onClick={() => run(() => openModal('showGrommets'), hasSelection)} />
        </SubMenu>
        <Item label={t('Save Test Cut File')} onClick={() => run(() => savePlotterTestCut(t), true)} />
        <Item label={t('Clear positioning marks')} onClick={() => run(() => { clearPlotterRegistrationMarks(t); }, true)} />
        <Item label={t('Clear weed borders')} onClick={() => run(() => { clearPlotterWeedBorders(t); }, true)} />
        <Item label={t('Clear bridges')} onClick={() => run(() => { clearPlotterBridges(t); }, true)} />
        <Item label={t('Clear cut paths')} disabled={cutPathCount === 0} onClick={() => run(() => clearCutJob(), cutPathCount > 0)} />
        <Item label={t('Send to Plotter…')} kbd={getBinding('window.plotter')} onClick={() => run(() => openModal('showPlotter'), true)} />
      </SubMenu>
      <SubMenu label={t('Insert / Layout')} openLeft={openLeft}>
        <Item label={t('Save Selection as Symbol')} disabled={!hasSelection} onClick={() => run(() => saveSymbolFromSelection(), hasSelection)} />
        <Separator />
        <Item label={t('Star / Polygon…')} onClick={() => run(() => openModal('showStar'), true)} />
        <Item label={t('Split Into Grid…')} onClick={() => run(() => openModal('showSplitGrid'), true)} />
      </SubMenu>
      <SubMenu label={t('Artboard')} openLeft={openLeft}>
        <Item label={t('Document Settings…')} onClick={() => run(() => openModal('showDocSettings'), true)} />
        <Item label={t('New from Template…')} onClick={() => run(() => openModal('showTemplates'), true)} />
        <Separator />
        <Item label={t('Create Artboard from Selection')} disabled={!hasSelection} onClick={() => run(() => makeArtboardFromSelection(), hasSelection)} />
        <Item label={t('Fit Artboard to Selection')} disabled={!hasSelection} onClick={() => run(() => { if (!fitArtboardToContent('selection')) toast.warn(t('Select something first.')); }, hasSelection)} />
        <Item label={t('Fit Artboard to Artwork')} onClick={() => run(() => { if (!fitArtboardToContent('all')) toast.warn(t('Nothing to fit.')); }, true)} />
      </SubMenu>
      <SubMenu label={t('View / Guides')} openLeft={openLeft}>
        <Item label={t('Zoom In')} kbd={getBinding('view.zoomIn')} onClick={() => run(() => zoomBy(1.25), true)} />
        <Item label={t('Zoom Out')} kbd={getBinding('view.zoomOut')} onClick={() => run(() => zoomBy(1 / 1.25), true)} />
        <Item label={t('Actual Size')} kbd={getBinding('view.actualSize')} onClick={() => run(() => zoomToPercent(100), true)} />
        <Item label={t('Fit to Page')} kbd={getBinding('view.zoomFit')} onClick={() => run(() => zoomFit(), true)} />
        <Item label={t('Zoom to Selection')} kbd={getBinding('view.zoomSelection')} disabled={!hasSelection} onClick={() => run(() => { if (!zoomToSelection()) toast.warn(t('Select something first.')); }, hasSelection)} />
        <Separator />
        <Item label={isOutlineMode() ? t('Hide Outline View') : t('Outline View')} kbd={getBinding('view.outline')} onClick={() => run(() => setOutlineMode(!isOutlineMode()), true)} />
        <Item label={gridVisible ? t('Hide Grid') : t('Show Grid')} onClick={() => run(() => toggleStoreFlag('gridVisible'), true)} />
        <Item label={snapEnabled ? t('Disable Snap to Grid') : t('Snap to Grid')} onClick={() => run(() => toggleStoreFlag('snapEnabled'), true)} />
        <Item label={smartGuidesEnabled ? t('Disable Smart Guides') : t('Smart Guides')} onClick={() => run(() => toggleStoreFlag('smartGuidesEnabled'), true)} />
        <Item label={anchorSnapEnabled ? t('Disable Anchor Snap') : t('Anchor Snap')} onClick={() => run(() => toggleStoreFlag('anchorSnapEnabled'), true)} />
        <Separator />
        <Item label={rulersVisible ? t('Hide Rulers') : t('Show Rulers')} onClick={() => run(() => toggleStoreFlag('rulersVisible'), true)} />
        <Item label={guidesVisible ? t('Hide Guides') : t('Show Guides')} kbd={getBinding('view.toggleGuides')} onClick={() => run(() => toggleStoreFlag('guidesVisible'), true)} />
        <Item label={guidesLocked ? t('Unlock Guides') : t('Lock Guides')} onClick={() => run(() => toggleStoreFlag('guidesLocked'), true)} />
        <Item label={t('Make Guides from Selection')} disabled={!hasSelection} onClick={() => run(() => { const n = makeGuidesFromSelection(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('Select something first.')); }, hasSelection)} />
        <Item label={t('Margin Guides…')} onClick={() => run(() => openModal('showMarginGuides'), true)} />
        <Item label={t('Clear Guides')} onClick={() => run(() => useEditor.getState().clearUserGuides(), true)} />
      </SubMenu>
      <SubMenu label={t('Help / Settings')} openLeft={openLeft}>
        <Item label={t('Command Palette…')} kbd={getBinding('window.commandPalette')} onClick={() => run(() => openModal('showCommandPalette'), true)} />
        <Item label={t('Help Center…')} kbd={getBinding('help.helpCenter')} onClick={() => run(() => openModal('showHelpCenter'), true)} />
        <Item label={t('Keyboard Shortcuts')} kbd={getBinding('help.shortcuts')} onClick={() => run(() => openModal('showShortcuts'), true)} />
        <Item label={t('Customize Shortcuts…')} onClick={() => run(() => openModal('showKeymapEditor'), true)} />
        <Item label={t('Preferences…')} kbd={getBinding('window.preferences')} onClick={() => run(() => openModal('showPreferences'), true)} />
        <Item label={t('Check for Updates…')} onClick={() => run(() => { void import('../lib/updater').then(m => m.checkAndPrompt({ announceNoUpdate: true })); }, true)} />
        <Separator />
        <Item label={theme === 'light' ? t('Dark Theme') : t('Light Theme')} kbd={getBinding('view.toggleTheme')} onClick={() => run(() => { const s = useEditor.getState(); s.setTheme(s.theme === 'light' ? 'dark' : 'light'); }, true)} />
        <Item label={highContrast ? t('Disable High Contrast') : t('High Contrast')} onClick={() => run(() => { const s = useEditor.getState(); s.setHighContrast(!s.highContrast); }, true)} />
        <Separator />
        <Item label={t('Debug Panel')} kbd={getBinding('help.debugPanel')} onClick={() => run(() => onToggleDebug(), true)} />
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
        label={t('Select Visible Objects')}
        onClick={() => run(() => { const n = selectVisibleObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No visible unlocked objects.')); }, true)}
      />
      <Item
        label={t('Select Unlocked Objects')}
        onClick={() => run(() => { const n = selectUnlockedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unlocked objects.')); }, true)}
      />
      <SubMenu label={t('Select Object')} openLeft={openLeft}>
        <Item label={t('Select All Text Objects')} onClick={() => run(() => { const n = selectAllText(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No text objects.')); }, true)} />
        <Item label={t('Select All Image Objects')} onClick={() => run(() => { const n = selectAllImages(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image objects.')); }, true)} />
        <Item label={t('Select All Path Objects')} onClick={() => run(() => { const n = selectAllPaths(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No path objects.')); }, true)} />
        <Item label={t('Select All Shape Objects')} onClick={() => run(() => { const n = selectAllShapes(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No shape objects.')); }, true)} />
      </SubMenu>
      <SubMenu label={t('Select Same')} openLeft={openLeft} disabled={!hasSelection}>
        <Item label={t('Select Same Fill')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('fill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); }, hasSelection)} />
        <Item label={t('Select Same Stroke')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('stroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); }, hasSelection)} />
        <Item label={t('Select Same Stroke Weight')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('strokeWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Opacity')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('opacity'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Font Family')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('fontFamily'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); }, hasSelection)} />
        <Item label={t('Select Same Font Size')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('fontSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); }, hasSelection)} />
        <Item label={t('Select Same Blend Mode')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('globalCompositeOperation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Dash')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('strokeDashArray'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Line Cap')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('strokeLineCap'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Line Join')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('strokeLineJoin'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Type')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSameType(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); }, hasSelection)} />
        <Item label={t('Select Same Name')} disabled={!hasSelection} onClick={() => run(() => { const n = selectSame('name'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a named object first.')); }, hasSelection)} />
      </SubMenu>
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
          className={`absolute top-0 -mt-1 ${openLeft ? 'right-full' : 'left-full'} bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover/sub:opacity-100 group-hover/sub:visible group-focus-within/sub:opacity-100 group-focus-within/sub:visible transition-all z-[1001] w-56 py-1 max-h-[70vh] overflow-y-auto overscroll-contain`}
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
