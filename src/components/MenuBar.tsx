import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Undo2, Redo2, Sparkles, Printer, Send, FileImage, Settings2, Layers, Hash, Magnet, Crosshair, Target, X, Globe, Check, ChevronRight, Sheet, Grid3X3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { undo, redo, zoomBy, zoomFit, zoomToPoint, zoomToPercent, zoomToSelection, getCanvas, duplicateSelection, deleteSelection, autoArrangeSelection, flipSelection, lockSelection, unlockAll, hideSelection, hideOthers, showAll, makeGuidesFromSelection, selectAllObjects, selectVisibleObjects, selectUnlockedObjects, deselectAll, promptRenameSelection, selectSame, selectSameType, selectInverse, selectObjectInStack, selectAllText, selectAllImages, selectAllPaths, selectAllShapes, groupSelection, ungroupSelection, ungroupAll, bringForward, sendBackward, bringToFront, sendToBack, applyStyleToSelection, swapFillStroke, defaultColors, alignSelection, distributeSelection, distributeInArtboard, centerOnArtboard } from '../lib/canvasEngine';
import { joinSelection } from '../lib/pathJoin';
import { repeatTransform, rotateSelection } from '../lib/transformOps';
import { reversePathSelection } from '../lib/pathReverse';
import { addAnchorsToSelection } from '../lib/addAnchors';
import { cleanUpDocument } from '../lib/cleanUp';
import { outlineStrokeToFillSelection } from '../lib/outlineStrokeFill';
import { addArrowheads } from '../lib/arrowheads';
import { averageSelectedAnchors } from '../lib/pathEdit';
import { toggleIsolationMode } from '../lib/isolationMode';
import { fitArtboardToContent } from '../lib/fitArtboard';
import { createOutlinesFromText } from '../lib/textToOutline';
import { splitTextToLetters, splitTextToLines } from '../lib/splitText';
import { adjustFontSize, adjustLeading, adjustTracking, changeCaseSelection } from '../lib/textCase';
import { smartPunctuationSelection } from '../lib/smartPunctuation';
import { applyTextOnArc } from '../lib/textPath';
import { exportSelectionSVG, exportSelectionPNG, copySelectionSVG } from '../lib/exportSelection';
import { createArtboardFromSelection, exportAllArtboardsAsFiles, exportAllArtboardsAsPNG } from '../lib/artboards';
import { booleanOp, divideSelection, trimSelection, cropSelection, mergeSelection } from '../lib/booleanOps';
import { rasterizeSelection } from '../lib/rasterize';
import { invertColorsSelection, grayscaleColorsSelection } from '../lib/colorAdjust';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { toast } from '../lib/toast';
import { importImageFile, pasteFromSystemClipboard, traceSelectedImage } from '../lib/io3';
import { copySelection, cutSelection, pasteFromClipboard } from '../lib/clipboard';
import { getFormat } from '../lib/formats';
import { resetOnboarding } from '../lib/onboarding';
import { useT, useI18n, LANGUAGES, t as tStatic, type Lang } from '../lib/i18n';
import { Logo } from './Logo';
import { showConfirm } from '../lib/confirm';
import { openProjectFromFile, openRecentFile, saveProjectQuick, saveProjectToFile } from '../lib/projectFile';
import { isTauri, isMac, getOSLabel, platformInfo, ariaKeyshortcuts, type NativePlatformInfo } from '../lib/runtime';
import { getAutoSaveStatus, subscribeAutoSaveStatus, type AutoSaveStatus } from '../lib/autosave';
import { setOutlineMode } from '../lib/outlineView';
import { clearRecent, subscribeRecent, type RecentFile } from '../lib/recentFiles';
import { addPlotterBridges, addPlotterGrommets, addPlotterRegistrationMarks, addPlotterRhinestones, addPlotterWeedBorder, clearPlotterBridges, clearPlotterRegistrationMarks, clearPlotterWeedBorders, savePlotterTestCut } from '../lib/cutPrepActions';
import { applyStrokeAlign } from '../lib/strokeAlign';
import { applyBlendModeToSelection, applyPatternFill, applyShadowToSelection, applyStrokeStyleToSelection, toggleUniformStroke } from '../lib/effects';
import { applyBlur, applySepia, applyGrayscale as applyImageGrayscale, applyBrightness as applyImageBrightness, applyContrast, applyHueRotate, clearFilters } from '../lib/filters';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { getBinding } from '../lib/keymap';

interface Props {
  onToggleAI: () => void;
  onToggleDebug: () => void;
  onShowOnboarding: () => void;
}

// Map Rust's `std::env::consts::OS` (lowercase, kebab-free) to the display
// casing used in the About dialog. Falls back to a Title-Cased version of
// the raw value for unknown OSes (BSDs, illumos, etc.).
function formatNativeOS(os: string): string {
  switch (os) {
    case 'macos': return 'macOS';
    case 'linux': return 'Linux';
    case 'windows': return 'Windows';
    case 'ios': return 'iOS';
    case 'android': return 'Android';
    default: return os ? os.charAt(0).toUpperCase() + os.slice(1) : 'Unknown';
  }
}

export function MenuBar({ onToggleAI, onToggleDebug, onShowOnboarding }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [showAbout, setShowAbout] = useState(false);
  // Match the rest of the dialog system: Escape closes, focus returns to the
  // opener (the Logo button in the header) when the modal unmounts. Without
  // these the About dialog was a focus trap with no keyboard exit.
  useEscapeClose(showAbout, () => setShowAbout(false));
  useFocusRestore(showAbout);
  // When About opens under the Tauri shell, replace the UA-heuristic OS label
  // with the authoritative `platform_info` command result. PWA users keep the
  // synchronous `getOSLabel()` path; no extra fetch is paid.
  const [nativeInfo, setNativeInfo] = useState<NativePlatformInfo | null>(null);
  useEffect(() => {
    if (!showAbout || !isTauri() || nativeInfo) return;
    let cancelled = false;
    platformInfo().then((info) => { if (!cancelled && info) setNativeInfo(info); }).catch(() => { /* fall back silently to getOSLabel() */ });
    return () => { cancelled = true; };
  }, [showAbout, nativeInfo]);
  const setModal = useEditor(s => s.setModal);
  const zoom = useEditor(s => s.zoom);
  const canUndo = useEditor(s => s.canUndo);
  const canRedo = useEditor(s => s.canRedo);
  const gridVisible = useEditor(s => s.gridVisible);
  const snapEnabled = useEditor(s => s.snapEnabled);
  const smartGuidesEnabled = useEditor(s => s.smartGuidesEnabled);
  const anchorSnapEnabled = useEditor(s => s.anchorSnapEnabled);
  const guidesLocked = useEditor(s => s.guidesLocked);
  const guidesVisible = useEditor(s => s.guidesVisible);
  const rulersVisible = useEditor(s => s.rulersVisible);
  const setRulersVisible = useEditor(s => s.setRulersVisible);
  const setGridVisible = useEditor(s => s.setGridVisible);
  const setSnapEnabled = useEditor(s => s.setSnapEnabled);
  const setSmartGuidesEnabled = useEditor(s => s.setSmartGuidesEnabled);
  const setAnchorSnapEnabled = useEditor(s => s.setAnchorSnapEnabled);
  const highContrast = useEditor(s => s.highContrast);
  const setHighContrast = useEditor(s => s.setHighContrast);
  const theme = useEditor(s => s.theme);
  const setTheme = useEditor(s => s.setTheme);
  const outlineMode = useEditor(s => s.outlineMode);
  const cutPaths = useEditor(s => s.cutPaths);
  const clearCutPaths = useEditor(s => s.clearCutPaths);
  const cutPathCount = cutPaths.length;
  const contourCutCount = cutPaths.filter(path => path.kind === 'outline').length;
  const traceCutCount = cutPaths.filter(path => path.kind === 'trace').length;
  const regmarkCutCount = cutPaths.filter(path => path.kind === 'regmark').length;
  // Recent files — subscribed so the menu refreshes after each save / open.
  const [recent, setRecent] = useState<RecentFile[]>([]);
  useEffect(() => subscribeRecent(setRecent), []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    // Both branches route through the format registry — the SVG handler now
    // does the smart preprocessing + warning toast that used to live here.
    if (ext === 'svg') await getFormat('svg')?.import?.(f);
    else if (ext === 'json') await getFormat('json')?.import?.(f);
    e.target.value = '';
  };
  const onJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    await getFormat('json')?.import?.(f);
    e.target.value = '';
  };
  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    await importImageFile(f);
    e.target.value = '';
  };

  const selectionCount = () => getCanvas()?.getActiveObjects().length ?? 0;
  const openPrintPrep = () => {
    setModal('openPrintPrep', true);
    setModal('showPrint', true);
  };

  const runAutoNest = () => {
    const n = autoArrangeSelection();
    if (n > 0) toast.success(`${n} ${t('objects arranged')}`, { title: t('Auto-arrange (Nest)') });
    else toast.warn(t('Select 2 or more objects first.'), { title: t('Auto-arrange (Nest)') });
  };

  const requireTextSelection = (action: () => void, message = t('Select a text object first.')) => {
    const hasText = (getCanvas()?.getActiveObjects().some(o => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox')) ?? false;
    if (!hasText) {
      toast.warn(message);
      return;
    }
    action();
  };
  const adjustTextMetric = (fn: (delta: number) => number, delta: number) => {
    if (!fn(delta)) toast.warn(t('Select a text object first.'));
  };



  const runAlign = (action: () => void, minSelection: number) => {
    if (selectionCount() < minSelection) {
      toast.warn(t(minSelection === 3 ? 'Select 3 or more objects first.' : 'Select 2 or more objects first.'));
      return;
    }
    action();
  };
  const runArtboardAlign = (action: () => boolean | void) => {
    const editor = useEditor.getState();
    if (selectionCount() < 1 || editor.artboards.length === 0) {
      toast.warn(t('Select something first.'));
      return;
    }
    const ok = action();
    if (ok === false) toast.warn(t('Select something first.'));
  };

  const openWithSelectionAction = (action: () => void, message = t('Select something first.')) => {
    if (selectionCount() < 1) {
      toast.warn(message);
      return;
    }
    action();
  };

  const openWithSelection = (modal: Parameters<typeof setModal>[0], message = t('Select something first.'), minSelection = 1) => {
    if (selectionCount() < minSelection) {
      toast.warn(message);
      return;
    }
    setModal(modal, true);
  };

  const clearCutJob = () => {
    clearCutPaths();
    toast.success(t('Cut paths cleared'), { title: t('Cut prep') });
  };

  const clearCutKind = (kind: 'outline' | 'trace' | 'regmark') => {
    clearCutPaths(kind);
    const message = kind === 'outline'
      ? t('Contour cut paths cleared')
      : kind === 'trace'
        ? t('Traced cut paths cleared')
        : t('Registration marks cleared');
    toast.success(message, { title: t('Cut prep') });
  };

  const handleTopbarActionKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-topbar-action]'))
      .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (buttons.length === 0) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  return (
    // The outer bar is the app's top banner: <header> gives it an implicit
    // `banner` landmark, pairing with the <main> canvas region and the right
    // <aside> for clean SR landmark navigation. It mixes ARIA menu items (the
    // dropdowns below) with toolbar buttons, which axe's `aria-required-children`
    // rule rightly objects to — so `role="menubar"` is re-attached to the
    // focused dropdown cluster only, not on the outer banner.
    <header className="topbar h-11 flex items-center px-3 gap-2 text-xs" aria-label={t('Application chrome')}>
      <button
        type="button"
        onClick={() => setShowAbout(true)}
        className="flex items-center rounded-sm px-1 -mx-1 hover:bg-panel2 transition-colors"
        title={t('About')}
        aria-label={t('About')}
      >
        <Logo size={20} variant="full" />
      </button>
      <span className="topbar-sep" aria-hidden="true" />

      <div role="menubar" aria-label={t('Application menu')} className="flex items-center gap-2">
      <Dropdown label={t('File')} width="w-64" items={[
        { label: t('Save Project'), onClick: () => { void saveProjectQuick(); }, kbd: getBinding('file.saveProject') },
        { label: t('Save Project As…'), onClick: () => { void saveProjectToFile(); }, kbd: getBinding('file.saveProjectAs') },
        { label: t('Open Project…'), onClick: () => { void openProjectFromFile(); }, kbd: getBinding('file.openProject') },
        { sep: true },
        { label: t('New'), onClick: async () => { if (await showConfirm({ title: t('New document'), message: t('Clear canvas?'), confirmLabel: t('Clear'), danger: true })) location.reload(); }, kbd: getBinding('file.new') },
        { label: t('New from Template…'), onClick: () => setModal('showTemplates', true), kbd: getBinding('file.newFromTemplate') },
        { label: t('Open SVG / JSON…'), onClick: () => fileRef.current?.click(), kbd: getBinding('file.open') },
        { label: t('Import Image…'), onClick: () => imageRef.current?.click(), kbd: getBinding('file.importImage') },
        { label: t('Paste from Clipboard'), onClick: () => { void pasteFromSystemClipboard().then(r => { if (r === 'empty') toast.warn(t('No image or SVG on the clipboard.')); else if (r === 'failed') toast.warn(t('Clipboard unavailable.')); }); } },
        { sep: true },
        // File-menu exports route through the format registry — same files,
        // filenames, and options as before, but every consumer (CommandPalette,
        // drag-drop, AI skills, future Tauri "Save as…" dialog) reads the
        // single source of truth. `exportPDFReal` (vector PDF) doesn't have a
        // registry entry yet; its options story is heavier and migrates in a
        // later cycle.
        { label: t('Export SVG'), onClick: () => { void getFormat('svg')?.export?.(); }, kbd: getBinding('file.exportSvg') },
        { label: t('Export PNG (2×)'), onClick: () => { void getFormat('png')?.export?.(); } },
        { label: t('Export JPG (2×)'), onClick: () => { void getFormat('jpg')?.export?.(); } },
        { label: t('Export PDF'), onClick: () => { void getFormat('pdf')?.export?.(); } },
        { label: t('Export PDF (Vector)'), onClick: () => { void getFormat('pdf-vector')?.export?.(); } },
        { label: t('Export DXF (paths)'), onClick: () => { void getFormat('dxf')?.export?.(); } },
        { label: t('Export JSON'), onClick: () => { void getFormat('json')?.export?.(); } },
        { sep: true },
        { label: t('Export All Artboards (SVG)'), onClick: () => { void exportAllArtboardsAsFiles().then(n => { if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); } },
        { label: t('Export All Artboards (PNG)'), onClick: () => { const n = exportAllArtboardsAsPNG(); if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); } },
        { label: t('Export Selection as SVG'), onClick: () => { void exportSelectionSVG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
        { label: t('Export Selection as PNG'), onClick: () => { void exportSelectionPNG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
        { label: t('Copy as SVG'), onClick: () => { void copySelectionSVG().then(r => { if (r === 'ok') toast.success(t('SVG copied to clipboard')); else if (r === 'empty') toast.warn(t('Select something first.')); else toast.warn(t('Clipboard unavailable.')); }); } },
        { sep: true },
        { label: t('Print…'), onClick: () => setModal('showPrint', true), kbd: getBinding('file.print') },
        { label: t('Print Prep…'), onClick: openPrintPrep },
        { label: t('Tile Print…'), onClick: () => setModal('showTilePrint', true), kbd: getBinding('file.tilePrint') },
        { label: t('Auto-arrange (Nest)'), onClick: runAutoNest },
        { label: t('Add positioning marks'), onClick: () => addPlotterRegistrationMarks(t) },
        {
          label: t('Weed border'),
          sub: [
            { label: t('Border only'), onClick: () => addPlotterWeedBorder(t) },
            { label: t('Weed rows'), onClick: () => addPlotterWeedBorder(t, 2, 0) },
            { label: t('Weed columns'), onClick: () => addPlotterWeedBorder(t, 0, 2) },
            { label: t('2×2'), onClick: () => addPlotterWeedBorder(t, 2, 2) },
            { label: t('3×2'), onClick: () => addPlotterWeedBorder(t, 3, 2) },
          ],
        },
        {
          label: t('Bridges'),
          sub: [
            { label: t('Light'), onClick: () => addPlotterBridges(t, 2, 0.6) },
            { label: t('Standard'), onClick: () => addPlotterBridges(t, 4, 1) },
            { label: t('Heavy'), onClick: () => addPlotterBridges(t, 6, 1.5) },
          ],
        },
        {
          label: t('Banner Grommet presets'),
          sub: [
            { label: t('Small banner'), onClick: () => addPlotterGrommets(t, 15, 300, 8) },
            { label: t('Standard banner'), onClick: () => addPlotterGrommets(t, 20, 500, 10) },
            { label: t('Large banner'), onClick: () => addPlotterGrommets(t, 25, 750, 12) },
            { label: t('Custom…'), onClick: () => openWithSelection('showGrommets') },
          ],
        },
        { label: t('Save Test Cut File'), onClick: () => savePlotterTestCut(t) },
        { label: t('Clear positioning marks'), onClick: () => clearPlotterRegistrationMarks(t) },
        { label: t('Clear weed borders'), onClick: () => clearPlotterWeedBorders(t) },
        { label: t('Clear bridges'), onClick: () => clearPlotterBridges(t) },
        { label: t('Clear cut paths'), onClick: () => clearCutJob(), disabled: cutPathCount === 0 },
        { label: t('Send to Plotter…'), onClick: () => setModal('showPlotter', true), kbd: getBinding('window.plotter') },
        ...buildRecentFilesItems(recent),
      ]} />

      <Dropdown label={t('Edit')} items={[
        { label: t('Undo'), onClick: () => undo(), disabled: !canUndo, kbd: getBinding('edit.undo') },
        { label: t('Redo'), onClick: () => redo(), disabled: !canRedo, kbd: `${getBinding('edit.redo')} / ${getBinding('edit.redoShift')}` },
        { sep: true },
        { label: t('Cut'), onClick: () => { if (!cutSelection()) toast.warn(t('Select something first.')); }, kbd: getBinding('edit.cut') },
        { label: t('Copy'), onClick: () => { if (copySelection()) toast.success(t('Copied')); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.copy') },
        { label: t('Paste'), onClick: () => { void pasteFromClipboard().then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); }, kbd: getBinding('edit.paste') },
        { label: t('Paste in Place'), onClick: () => { void pasteFromClipboard(undefined, true).then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); }, kbd: getBinding('edit.pasteInPlace') },
        { label: t('Paste in Front'), onClick: () => { void pasteFromClipboard(undefined, true, 'front').then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); }, kbd: getBinding('edit.pasteInFront') },
        { label: t('Paste in Back'), onClick: () => { void pasteFromClipboard(undefined, true, 'back').then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); }, kbd: getBinding('edit.pasteInBack') },
        { sep: true },
        { label: t('Duplicate'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else duplicateSelection(); }, kbd: getBinding('edit.duplicate') },
        { label: t('Delete'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else deleteSelection(); }, kbd: 'Del / Backspace' },
        { label: t('Rename Selection…'), onClick: () => { const n = getCanvas()?.getActiveObjects().length ?? 0; if (n < 1) { toast.warn(t('Select something first.')); return; } const renamed = promptRenameSelection(t('Object name')); if (renamed) toast.success(`${renamed} ${t('objects renamed')}`); } },
        { sep: true },
        { label: t('Find & Replace…'), onClick: () => setModal('showFindReplace', true), kbd: getBinding('text.findReplace') },
        { label: t('Select All'), onClick: () => { const n = selectAllObjects(); if (!n) toast.warn(t('Nothing to select.')); }, kbd: getBinding('edit.selectAll') },
        { label: t('Deselect All'), onClick: () => { deselectAll(); }, kbd: getBinding('edit.deselectAll') },
        { label: t('Select Visible Objects'), onClick: () => { const n = selectVisibleObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No visible unlocked objects.')); } },
        { label: t('Select Unlocked Objects'), onClick: () => { const n = selectUnlockedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unlocked objects.')); } },
        { label: t('Select Same'), sub: [
          { label: t('Select Same Fill'), onClick: () => { const n = selectSame('fill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Stroke'), onClick: () => { const n = selectSame('stroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Stroke Weight'), onClick: () => { const n = selectSame('strokeWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Opacity'), onClick: () => { const n = selectSame('opacity'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Font Family'), onClick: () => { const n = selectSame('fontFamily'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Font Size'), onClick: () => { const n = selectSame('fontSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Blend Mode'), onClick: () => { const n = selectSame('globalCompositeOperation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Dash'), onClick: () => { const n = selectSame('strokeDashArray'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Line Cap'), onClick: () => { const n = selectSame('strokeLineCap'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Line Join'), onClick: () => { const n = selectSame('strokeLineJoin'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Type'), onClick: () => { const n = selectSameType(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Name'), onClick: () => { const n = selectSame('name'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a named object first.')); } },
        ] },
        { label: t('Select Object'), sub: [
          { label: t('Select All Text Objects'), onClick: () => { const n = selectAllText(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No text objects.')); } },
          { label: t('Select All Image Objects'), onClick: () => { const n = selectAllImages(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image objects.')); } },
          { label: t('Select All Path Objects'), onClick: () => { const n = selectAllPaths(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No path objects.')); } },
          { label: t('Select All Shape Objects'), onClick: () => { const n = selectAllShapes(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No shape objects.')); } },
        ] },
        { label: t('Select Inverse'), onClick: () => { selectInverse(); }, kbd: getBinding('edit.selectInverse') },
        { label: t('Select Next Object Above'), onClick: () => { if (!selectObjectInStack('up')) toast.warn(t('Nothing above.')); }, kbd: getBinding('edit.selectNextAbove') },
        { label: t('Select Next Object Below'), onClick: () => { if (!selectObjectInStack('down')) toast.warn(t('Nothing below.')); }, kbd: getBinding('edit.selectNextBelow') },
        { sep: true },
        { label: t('Transform…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showTransform', true); } },
        { label: t('Resize…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showResize', true); } },
        { label: t('Shear…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showShear', true); } },
        { label: t('Transform Again'), onClick: () => { repeatTransform().then((ok) => { if (!ok) toast.warn(t('Apply a Transform first.')); }); }, kbd: getBinding('edit.transformAgain') },
        { label: t('Rotate 90° CW'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(90); } },
        { label: t('Rotate 90° CCW'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(-90); } },
        { label: t('Rotate 180°'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(180); } },
        { label: t('Flip Horizontal'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else flipSelection('x'); }, kbd: getBinding('edit.flipH') },
        { label: t('Flip Vertical'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else flipSelection('y'); }, kbd: getBinding('edit.flipV') },
        { label: t('Join Paths'), onClick: () => { if (!joinSelection()) toast.warn(t('Select 1 open path to close, or 2 to join.')); }, kbd: getBinding('edit.join') },
        { sep: true },
        { label: t('Group'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else groupSelection(); }, kbd: getBinding('edit.group') },
        { label: t('Isolation Mode'), onClick: () => { if (!toggleIsolationMode()) toast.warn(t('Select a group first.')); }, kbd: getBinding('object.isolation') },
        { label: t('Ungroup'), onClick: () => { if (getCanvas()?.getActiveObject()?.type !== 'group') toast.warn(t('Select a group first.')); else ungroupSelection(); }, kbd: getBinding('edit.ungroup') },
        { label: t('Ungroup All'), onClick: () => { const n = ungroupAll(); if (n) toast.success(`${n} ${t('groups ungrouped')}`); else toast.warn(t('Select a group first.')); } },
        { label: t('Bring to Front'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else bringToFront(); }, kbd: `${getBinding('arrange.forwardFront').replace(/]$/, 'Shift+]')}` },
        { label: t('Bring Forward'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else bringForward(); }, kbd: getBinding('arrange.forwardFront') },
        { label: t('Send Backward'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else sendBackward(); }, kbd: getBinding('arrange.backwardBack') },
        { label: t('Send to Back'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else sendToBack(); }, kbd: `${getBinding('arrange.backwardBack').replace(/[[]$/, 'Shift+[')}` },
        { sep: true },
        { label: t('Pathfinder'), sub: [
          { label: t('Union'), onClick: () => { void booleanOp('union').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
          { label: t('Subtract'), onClick: () => { void booleanOp('subtract').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
          { label: t('Intersect'), onClick: () => { void booleanOp('intersect').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
          { label: t('Exclude'), onClick: () => { void booleanOp('exclude').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
          { label: t('Minus Back'), onClick: () => { void booleanOp('minus-back').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
          { sep: true },
          { label: t('Divide'), onClick: () => { const n = divideSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
          { label: t('Trim'), onClick: () => { const n = trimSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
          { label: t('Merge'), onClick: () => { const n = mergeSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
          { label: t('Crop'), onClick: () => { const n = cropSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
        ] },
        { label: t('Make Clipping Mask'), onClick: () => { if (!applyClipMask()) toast.warn(t('Select 2 or more objects first.')); }, kbd: getBinding('edit.clipMask') },
        { label: t('Release Clipping Mask'), onClick: () => { if (!releaseClipMask()) toast.warn(t('Select a clipping group first.')); }, kbd: getBinding('edit.releaseClip') },
        { label: t('Make Compound Path'), onClick: () => { if (!makeCompoundPath()) toast.warn(t('Select 2 or more objects first.')); }, kbd: getBinding('edit.compoundPath') },
        { label: t('Release Compound Path'), onClick: () => { if (!releaseCompoundPath()) toast.warn(t('Select a compound path first.')); }, kbd: getBinding('edit.releaseCompound') },
        { sep: true },
        { label: t('Lock Selection'), onClick: () => { const n = lockSelection(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.lockSelection') },
        { label: t('Unlock All'), onClick: () => { const n = unlockAll(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked objects.')); }, kbd: getBinding('edit.unlockAll') },
        { label: t('Hide Selection'), onClick: () => { const n = hideSelection(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.hideSelection') },
        { label: t('Hide Others'), onClick: () => { const n = hideOthers(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); } },
        { label: t('Show All'), onClick: () => { const n = showAll(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden objects.')); }, kbd: getBinding('edit.showAll') },
      ]} />

      <Dropdown label={t('Type')} items={[
        { label: t('Create Outlines'), onClick: () => { void createOutlinesFromText().then(ok => { if (ok) toast.success(t('Text converted to outlines')); else toast.warn(t('Select a single text object to enable')); }); }, kbd: getBinding('text.createOutlines') },
        { label: t('Break Text into Letters'), onClick: () => { const n = splitTextToLetters(); if (n) toast.success(`${n} ${t('letters created')}`); else toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.splitLetters') },
        { label: t('Break Text into Lines'), onClick: () => { const n = splitTextToLines(); if (n) toast.success(`${n} ${t('lines created')}`); else toast.warn(t('Select multi-line text first.')); }, kbd: getBinding('text.splitLines') },
        { sep: true },
        { label: t('Text on Arc (Up)'), onClick: () => { if (!applyTextOnArc(false)) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.arcUp') },
        { label: t('Text on Arc (Down)'), onClick: () => { if (!applyTextOnArc(true)) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.arcDown') },
        { sep: true },
        { label: t('Change Case'), sub: [
          { label: t('UPPERCASE'), onClick: () => { if (!changeCaseSelection('upper')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseUpper') },
          { label: t('lowercase'), onClick: () => { if (!changeCaseSelection('lower')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseLower') },
          { label: t('Title Case'), onClick: () => { if (!changeCaseSelection('title')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseTitle') },
          { label: t('Sentence case'), onClick: () => { if (!changeCaseSelection('sentence')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseSentence') },
        ] },
        { label: t('Smart Punctuation'), onClick: () => { const n = smartPunctuationSelection(); if (n) toast.success(`${n} ${t('text objects updated')}`); else toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.smartPunctuation') },
        { sep: true },
        { label: t('Find & Replace…'), onClick: () => setModal('showFindReplace', true), kbd: getBinding('text.findReplace') },
      ]} />

      <Dropdown label={t('View')} items={[
        { label: t('Zoom In'), onClick: () => zoomBy(1.25), kbd: getBinding('view.zoomIn') },
        { label: t('Zoom Out'), onClick: () => zoomBy(1 / 1.25), kbd: getBinding('view.zoomOut') },
        { label: t('Actual Size'), onClick: () => zoomToPercent(100), kbd: getBinding('view.actualSize') },
        { label: t('Fit to Page'), onClick: () => zoomFit(), kbd: getBinding('view.zoomFit') },
        { label: t('Zoom to Selection'), onClick: () => { if (!zoomToSelection()) toast.warn(t('Select something first.')); }, kbd: getBinding('view.zoomSelection') },
        { sep: true },
        { label: t('Outline View'), onClick: () => setOutlineMode(!outlineMode), kbd: getBinding('view.outline'), checked: outlineMode },
        { sep: true },
        { label: t('Show Rulers'), onClick: () => setRulersVisible(!rulersVisible), checked: rulersVisible },
        { label: t('Show Grid'), onClick: () => setGridVisible(!gridVisible), checked: gridVisible },
        { label: t('Snap to Grid'), onClick: () => setSnapEnabled(!snapEnabled), checked: snapEnabled },
        { label: t('Smart Guides'), onClick: () => setSmartGuidesEnabled(!smartGuidesEnabled), checked: smartGuidesEnabled },
        { label: t('Anchor Snap'), onClick: () => setAnchorSnapEnabled(!anchorSnapEnabled), checked: anchorSnapEnabled },
        { sep: true },
        { label: t('Make Guides from Selection'), onClick: () => { const n = makeGuidesFromSelection(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('Select something first.')); } },
        { label: t('Margin Guides…'), onClick: () => setModal('showMarginGuides', true) },
        { label: t('Show Guides'), onClick: () => { const s = useEditor.getState(); s.setGuidesVisible(!s.guidesVisible); }, checked: guidesVisible, kbd: getBinding('view.toggleGuides') },
        { label: t('Lock Guides'), onClick: () => useEditor.getState().setGuidesLocked(!useEditor.getState().guidesLocked), checked: guidesLocked },
        { label: t('Clear Guides'), onClick: () => useEditor.getState().clearUserGuides() },
      ]} />

      <Dropdown label={t('Document')} items={[
        { label: t('Document Settings…'), onClick: () => setModal('showDocSettings', true) },
        { label: t('Create Artboard from Selection'), onClick: () => { const ab = createArtboardFromSelection(); if (ab) toast.success(t('Artboard created')); else toast.warn(t('Select something first.')); } },
        { label: t('Fit Artboard to Artwork'), onClick: () => { if (!fitArtboardToContent('all')) toast.warn(t('Nothing to fit.')); } },
        { label: t('Fit Artboard to Selection'), onClick: () => { if (!fitArtboardToContent('selection')) toast.warn(t('Select something first.')); } },
        { sep: true },
        { label: t('Insert'), sub: [
          { label: t('Star / Polygon…'), onClick: () => setModal('showStar', true) },
          { label: t('Split Into Grid…'), onClick: () => setModal('showSplitGrid', true) },
          { label: t('Repeat (Grid / Radial / Mirror)…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showRepeat', true); } },
        ] },
        // Cut Contour suite — opens the multi-tab dialog covering vector
        // offset, bitmap trace, and registration marks. Lives under
        // Document because cut paths are document-level metadata.
        { label: t('Cut Contour…'), onClick: () => openWithSelection('showCutContour'), kbd: getBinding('window.cutContour') },
        { label: t('Add positioning marks'), onClick: () => addPlotterRegistrationMarks(t) },
        { label: t('Weed border'), onClick: () => addPlotterWeedBorder(t) },
        { label: t('Bridge presets'), sub: [
          { label: t('Light'), onClick: () => addPlotterBridges(t, 2, 0.6) },
          { label: t('Standard'), onClick: () => addPlotterBridges(t, 4, 1) },
          { label: t('Heavy'), onClick: () => addPlotterBridges(t, 6, 1.5) },
        ] },
        { label: t('Banner Grommets…'), onClick: () => openWithSelection('showGrommets') },
        { label: `${t('Banner Grommets')} — ${t('Small banner')}`, onClick: () => addPlotterGrommets(t, 15, 300, 8) },
        { label: `${t('Banner Grommets')} — ${t('Standard banner')}`, onClick: () => addPlotterGrommets(t, 20, 500, 10) },
        { label: `${t('Banner Grommets')} — ${t('Large banner')}`, onClick: () => addPlotterGrommets(t, 25, 750, 12) },
        { label: t('Clear positioning marks'), onClick: () => clearPlotterRegistrationMarks(t) },
        { label: t('Clear weed borders'), onClick: () => clearPlotterWeedBorders(t) },
        { label: t('Clear bridges'), onClick: () => clearPlotterBridges(t) },
        { label: t('Clear contour'), onClick: () => clearCutKind('outline'), disabled: contourCutCount === 0 },
        { label: t('Clear trace'), onClick: () => clearCutKind('trace'), disabled: traceCutCount === 0 },
        { label: t('Clear regmarks'), onClick: () => clearCutKind('regmark'), disabled: regmarkCutCount === 0 },
        { label: t('Clear cut paths'), onClick: () => clearCutJob(), disabled: cutPathCount === 0 },
        { sep: true },
        { label: t('Type'), sub: [
          { label: t('Create Outlines'), onClick: () => { void createOutlinesFromText().then(ok => { if (ok) toast.success(t('Text converted to outlines')); else toast.warn(t('Select a single text object to enable')); }); }, kbd: getBinding('text.createOutlines') },
          { label: t('Break Text into Letters'), onClick: () => { const n = splitTextToLetters(); if (n) toast.success(`${n} ${t('letters created')}`); else toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.splitLetters') },
          { label: t('Break Text into Lines'), onClick: () => { const n = splitTextToLines(); if (n) toast.success(`${n} ${t('lines created')}`); else toast.warn(t('Select multi-line text first.')); }, kbd: getBinding('text.splitLines') },
          { sep: true },
          { label: t('Text on Arc (Up)'), onClick: () => requireTextSelection(() => { if (!applyTextOnArc(false)) toast.warn(t('Select a text object first.')); }), kbd: getBinding('text.arcUp') },
          { label: t('Text on Arc (Down)'), onClick: () => requireTextSelection(() => { if (!applyTextOnArc(true)) toast.warn(t('Select a text object first.')); }), kbd: getBinding('text.arcDown') },
          { sep: true },
          { label: t('Increase Font Size'), onClick: () => adjustTextMetric(adjustFontSize, 2), kbd: getBinding('text.fontSizeUp') },
          { label: t('Decrease Font Size'), onClick: () => adjustTextMetric(adjustFontSize, -2), kbd: getBinding('text.fontSizeDown') },
          { label: t('Increase Tracking'), onClick: () => adjustTextMetric(adjustTracking, 25), kbd: getBinding('text.trackingUp') },
          { label: t('Decrease Tracking'), onClick: () => adjustTextMetric(adjustTracking, -25), kbd: getBinding('text.trackingDown') },
          { label: t('Increase Leading'), onClick: () => adjustTextMetric(adjustLeading, 0.05), kbd: getBinding('text.leadingUp') },
          { label: t('Decrease Leading'), onClick: () => adjustTextMetric(adjustLeading, -0.05), kbd: getBinding('text.leadingDown') },
          { sep: true },
          { label: t('Single-line Text…'), onClick: () => setModal('showSingleLineText', true), kbd: getBinding('text.singleLine') },
          { label: t('Find & Replace…'), onClick: () => setModal('showFindReplace', true), kbd: getBinding('text.findReplace') },
          { label: t('Change Case'), sub: [
            { label: t('UPPERCASE'), onClick: () => { if (!changeCaseSelection('upper')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseUpper') },
            { label: t('lowercase'), onClick: () => { if (!changeCaseSelection('lower')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseLower') },
            { label: t('Title Case'), onClick: () => { if (!changeCaseSelection('title')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseTitle') },
            { label: t('Sentence case'), onClick: () => { if (!changeCaseSelection('sentence')) toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.caseSentence') },
          ] },
          { label: t('Smart Punctuation'), onClick: () => { const n = smartPunctuationSelection(); if (n) toast.success(`${n} ${t('text objects updated')}`); else toast.warn(t('Select a text object first.')); }, kbd: getBinding('text.smartPunctuation') },
        ] },
        { sep: true },
        // Path / effect operations grouped into flyouts — all also reachable via
        // the command palette + right-click; submenus keep this menu navigable.
        { label: t('Path'), sub: [
          { label: t('Add Anchor Points'), onClick: () => { const n = addAnchorsToSelection(); if (n) toast.success(`${n} ${t('paths subdivided')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Average Anchor Points'), onClick: () => { const n = averageSelectedAnchors('both'); if (n) toast.success(`${n} ${t('anchors averaged')}`); else toast.warn(t('Shift-click two or more path anchors first.')); }, kbd: getBinding('path.averageAnchors') },
          { label: t('Outline Stroke to Fill'), onClick: () => { const n = outlineStrokeToFillSelection(); if (n) toast.success(`${n} ${t('strokes outlined')}`); else toast.warn(t('Select shapes that have a stroke first.')); } },
          { label: t('Simplify Path…'), onClick: () => openWithSelection('showSimplify') },
          { label: t('Round Corners…'), onClick: () => openWithSelection('showRoundCorners') },
          { label: t('Offset Path…'), onClick: () => openWithSelection('showOffsetPath') },
          { label: t('Reverse Path Direction'), onClick: () => { const n = reversePathSelection(); if (n) toast.success(`${n} ${t('paths reversed')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Add Arrowhead (Start)'), onClick: () => { const n = addArrowheads('start'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Add Arrowhead (End)'), onClick: () => { const n = addArrowheads('end'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Add Arrowheads (Both)'), onClick: () => { const n = addArrowheads('both'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Clean Up'), onClick: () => { const n = cleanUpDocument(); if (n) toast.success(`${n} ${t('stray objects removed')}`); else toast.success(t('Nothing to clean up.')); } },
          { label: t('Rasterize'), onClick: () => { void rasterizeSelection().then(ok => { if (ok) toast.success(t('Rasterized')); else toast.warn(t('Select an object first.')); }); } },
        ] },
        { label: t('Distort & Transform'), sub: [
          { label: t('Roughen…'), onClick: () => openWithSelection('showRoughen') },
          { label: t('Zig Zag…'), onClick: () => openWithSelection('showZigzag') },
          { label: t('Pucker & Bloat…'), onClick: () => openWithSelection('showPucker') },
          { label: t('Twist…'), onClick: () => openWithSelection('showTwist') },
          { label: t('Free Distort…'), onClick: () => openWithSelection('showFreeDistort') },
          { label: t('Arc Warp…'), onClick: () => openWithSelection('showWarp') },
          { label: t('Blend…'), onClick: () => openWithSelection('showBlend', t('Select 2 or more objects first.'), 2) },
        ] },
        { label: t('Align & Distribute'), sub: [
          { label: t('Align left'), onClick: () => runAlign(() => alignSelection('left'), 2), kbd: getBinding('align.left') },
          { label: t('Align center horizontally'), onClick: () => runAlign(() => alignSelection('centerH'), 2), kbd: getBinding('align.centerH') },
          { label: t('Align right'), onClick: () => runAlign(() => alignSelection('right'), 2), kbd: getBinding('align.right') },
          { sep: true },
          { label: t('Align top'), onClick: () => runAlign(() => alignSelection('top'), 2), kbd: getBinding('align.top') },
          { label: t('Align center vertically'), onClick: () => runAlign(() => alignSelection('centerV'), 2), kbd: getBinding('align.centerV') },
          { label: t('Align bottom'), onClick: () => runAlign(() => alignSelection('bottom'), 2), kbd: getBinding('align.bottom') },
          { sep: true },
          { label: t('Distribute horizontally (equal spacing)'), onClick: () => runAlign(() => distributeSelection('horizontal'), 3), kbd: getBinding('distribute.horizontal') },
          { label: t('Distribute vertically (equal spacing)'), onClick: () => runAlign(() => distributeSelection('vertical'), 3), kbd: getBinding('distribute.vertical') },
          { label: t('Distribute horizontally in Artboard'), onClick: () => runArtboardAlign(() => distributeInArtboard('horizontal')) },
          { label: t('Distribute vertically in Artboard'), onClick: () => runArtboardAlign(() => distributeInArtboard('vertical')) },
          { label: t('Center on Artboard'), onClick: () => runArtboardAlign(() => centerOnArtboard()) },
        ] },
        { sep: true },
        { label: t('Appearance'), sub: [
          { label: t('Fill / Stroke'), sub: [
            { label: t('Swap Fill / Stroke'), onClick: () => { if (!swapFillStroke()) toast.warn(t('Select an object first.')); }, kbd: getBinding('edit.swapFillStroke') },
            { label: t('Default Fill / Stroke'), onClick: () => defaultColors(), kbd: getBinding('edit.defaultColors') },
            { sep: true },
            { label: t('No Fill'), onClick: () => openWithSelectionAction(() => applyStyleToSelection({ fill: '' })), kbd: getBinding('appearance.noFill') },
            { label: t('No Stroke'), onClick: () => openWithSelectionAction(() => applyStyleToSelection({ stroke: '', strokeWidth: 0 })), kbd: getBinding('appearance.noStroke') },
          ] },
          { label: t('Stroke alignment'), sub: [
            { label: t('Center'), onClick: () => openWithSelectionAction(() => applyStrokeAlign('center')) },
            { label: t('Inside'), onClick: () => openWithSelectionAction(() => applyStrokeAlign('inside')) },
            { label: t('Outside'), onClick: () => openWithSelectionAction(() => applyStrokeAlign('outside')) },
            { sep: true },
            { label: t('Constant Stroke Width'), onClick: () => { const state = toggleUniformStroke(); if (state === null) toast.warn(t('Select an object first.')); else toast.success(state ? t('Stroke width is now constant') : t('Stroke width now scales')); } },
          ] },
          { label: t('Stroke width'), sub: [
            { label: '0 px', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ strokeWidth: 0 })) },
            { label: '0.5 px', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ strokeWidth: 0.5 })) },
            { label: '1 px', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ strokeWidth: 1 })) },
            { label: '2 px', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ strokeWidth: 2 })) },
            { label: '4 px', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ strokeWidth: 4 })) },
            { label: '8 px', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ strokeWidth: 8 })) },
          ] },
          { label: t('Stroke style'), sub: [
            { label: `${t('Dash')} — ${t('Solid')}`, onClick: () => openWithSelectionAction(() => applyStrokeStyleToSelection({ strokeDashArray: [] })) },
            { label: `${t('Dash')} — ${t('Dashed')}`, onClick: () => openWithSelectionAction(() => applyStrokeStyleToSelection({ strokeDashArray: [10, 5] })) },
            { label: `${t('Dash')} — ${t('Dotted')}`, onClick: () => openWithSelectionAction(() => applyStrokeStyleToSelection({ strokeDashArray: [2, 6] })) },
            { label: `${t('Line cap')} — ${t('Round')}`, onClick: () => openWithSelectionAction(() => applyStrokeStyleToSelection({ strokeLineCap: 'round' })) },
            { label: `${t('Line join')} — ${t('Round')}`, onClick: () => openWithSelectionAction(() => applyStrokeStyleToSelection({ strokeLineJoin: 'round' })) },
          ] },
          { label: t('Blend mode'), sub: [
            { label: t('Normal'), onClick: () => openWithSelectionAction(() => applyBlendModeToSelection('source-over')) },
            { label: t('Multiply'), onClick: () => openWithSelectionAction(() => applyBlendModeToSelection('multiply')) },
            { label: t('Screen'), onClick: () => openWithSelectionAction(() => applyBlendModeToSelection('screen')) },
            { label: t('Overlay'), onClick: () => openWithSelectionAction(() => applyBlendModeToSelection('overlay')) },
            { label: t('Difference'), onClick: () => openWithSelectionAction(() => applyBlendModeToSelection('difference')) },
          ] },
          { label: t('Opacity'), sub: [
            { label: '100%', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ opacity: 1 })) },
            { label: '75%', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ opacity: 0.75 })) },
            { label: '50%', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ opacity: 0.5 })) },
            { label: '25%', onClick: () => openWithSelectionAction(() => applyStyleToSelection({ opacity: 0.25 })) },
          ] },
          { label: t('Pattern Fill'), sub: [
            { label: t('Checker'), onClick: () => openWithSelectionAction(() => applyPatternFill('checker', 16, '#ffffff', '#111827')) },
            { label: t('Stripes'), onClick: () => openWithSelectionAction(() => applyPatternFill('stripes', 16, '#ffffff', '#111827')) },
            { label: t('Dots'), onClick: () => openWithSelectionAction(() => applyPatternFill('dots', 16, '#ffffff', '#111827')) },
            { label: t('Crosshatch'), onClick: () => openWithSelectionAction(() => applyPatternFill('crosshatch', 16, '#ffffff', '#111827')) },
          ] },
          { label: t('Drop shadow'), sub: [
            { label: t('Soft Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 })) },
            { label: t('Hard Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.45)', blur: 0, offsetX: 5, offsetY: 5 })) },
            { label: t('Glow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(61,155,255,0.75)', blur: 16, offsetX: 0, offsetY: 0 })) },
            { sep: true },
            { label: t('Clear Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection(null)) },
          ] },
        ] },
        { sep: true },
        { label: t('Edit Colors'), sub: [
          { label: t('Recolor Artwork…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showRecolor', true); } },
          { label: t('Freeform Gradient…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showFreeformGradient', true); } },
          { label: t('Invert Colors'), onClick: () => { const n = invertColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Convert to Grayscale'), onClick: () => { const n = grayscaleColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Saturate…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showSaturate', true); } },
          { label: t('Adjust Hue…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showHue', true); } },
          { label: t('Adjust Brightness…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showBrightness', true); } },
        ] },
        { label: t('Image'), sub: [
          { label: t('Trace Image'), onClick: () => { void traceSelectedImage().then(ok => { if (ok) toast.success(t('Image traced')); else toast.warn(t('Select a raster image first.')); }); } },
          { label: t('Rasterize'), onClick: () => { void rasterizeSelection().then(ok => { if (ok) toast.success(t('Rasterized')); else toast.warn(t('Select an object first.')); }); } },
          { sep: true },
          { label: t('Image Filters'), sub: [
            { label: t('Blur'), onClick: () => applyBlur(0.08) },
            { label: t('Sepia'), onClick: () => applySepia() },
            { label: t('Grayscale'), onClick: () => applyImageGrayscale() },
            { label: t('Brightness +'), onClick: () => applyImageBrightness(0.12) },
            { label: t('Brightness -'), onClick: () => applyImageBrightness(-0.12) },
            { label: t('Contrast +'), onClick: () => applyContrast(0.18) },
            { label: t('Hue rotate'), onClick: () => applyHueRotate(30) },
            { label: t('Clear Image Filters'), onClick: () => clearFilters() },
          ] },
        ] },
        { sep: true },
        { label: t('Sign Effects'), sub: [
          { label: t('Multi-outline…'), onClick: () => openWithSelection('showOutline') },
          { label: t('Rhinestone Template…'), onClick: () => openWithSelection('showRhinestone') },
          { label: t('Rhinestone presets'), sub: [
            { label: t('Fine stones'), onClick: () => addPlotterRhinestones(t, 2, 3) },
            { label: t('Standard stones'), onClick: () => addPlotterRhinestones(t, 2.8, 4) },
            { label: t('Bold stones'), onClick: () => addPlotterRhinestones(t, 4.7, 6) },
            { label: t('Custom…'), onClick: () => openWithSelection('showRhinestone') },
          ] },
          { label: t('Banner Grommets…'), onClick: () => openWithSelection('showGrommets') },
          { label: t('Variable Data…'), onClick: () => openWithSelection('showVariableData'), kbd: getBinding('text.variableData') },
          { label: t('Auto-arrange (Nest)'), onClick: runAutoNest },
        ] },
      ]} />

      <Dropdown label={t('Help')} items={[
        { label: t('Help Center…'), onClick: () => setModal('showHelpCenter', true), kbd: getBinding('help.helpCenter') },
        { label: t('Command Palette…'), onClick: () => setModal('showCommandPalette', true), kbd: getBinding('window.commandPalette') },
        { label: t('Preferences…'), onClick: () => setModal('showPreferences', true), kbd: getBinding('window.preferences') },
        { label: t('Onboarding…'), onClick: () => { resetOnboarding(); onShowOnboarding(); } },
        { label: t('Keyboard Shortcuts'), onClick: () => setModal('showShortcuts', true), kbd: getBinding('help.shortcuts') },
        { label: t('Customize Shortcuts…'), onClick: () => setModal('showKeymapEditor', true) },
        { sep: true },
        // Manual updater check — auto-runs once on boot, but this entry lets
        // users force-check (e.g. after seeing a release blog post). Wired to
        // checkAndPrompt with `announceNoUpdate` so the user gets a confirming
        // toast either way rather than silent success.
        { label: t('Check for Updates…'), onClick: () => {
          void import('../lib/updater').then(m => m.checkAndPrompt({ announceNoUpdate: true }));
        } },
        { label: theme === 'light' ? t('Dark Theme') : t('Light Theme'), onClick: () => setTheme(theme === 'light' ? 'dark' : 'light'), kbd: getBinding('view.toggleTheme') },
        { label: highContrast ? t('Disable High Contrast') : t('High Contrast'), onClick: () => setHighContrast(!highContrast) },
        { sep: true },
        // Debug panel moved off the top chrome — it's a developer affordance,
        // not something end users should see as primary. Still reachable
        // via Ctrl+Shift+D (dev-tool convention) or this menu entry.
        { label: t('Debug Panel'), onClick: onToggleDebug, kbd: getBinding('help.debugPanel') },
        { label: t('About'), onClick: () => setShowAbout(true) },
      ]} />
      </div>

      <span className="topbar-sep" aria-hidden="true" />
      <div
        className="flex items-center gap-1"
        role="toolbar"
        aria-label={t('History actions')}
        title={t('Use arrow keys to review top bar actions')}
        onKeyDown={handleTopbarActionKeys}
      >
        <IconBtn data-topbar-action title={`${t('Undo')} (${getBinding('edit.undo')})`} aria-label={t('Undo')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('edit.undo'))} onClick={() => undo()} disabled={!canUndo}><Undo2 size={14} aria-hidden="true" /></IconBtn>
        <IconBtn data-topbar-action title={`${t('Redo')} (${getBinding('edit.redo')} / ${getBinding('edit.redoShift')})`} aria-label={t('Redo')} aria-keyshortcuts={ariaKeyshortcuts(`${getBinding('edit.redo')} ${getBinding('edit.redoShift')}`)} onClick={() => redo()} disabled={!canRedo}><Redo2 size={14} aria-hidden="true" /></IconBtn>
      </div>

      <span className="topbar-sep" aria-hidden="true" />
      {/* Grid / Snap / Guides — single segmented control. Each pip is independently
          toggleable; the group reads as one cluster. */}
      <div
        className="segmented"
        role="toolbar"
        aria-label={t('Canvas helper actions')}
        title={t('Use arrow keys to review top bar actions')}
        onKeyDown={handleTopbarActionKeys}
      >
        <button
          type="button"
          data-topbar-action
          title={t('Grid')}
          aria-label={t('Grid')}
          aria-pressed={gridVisible}
          onClick={() => setGridVisible(!gridVisible)}
        >
          <Hash size={12} aria-hidden="true" />
          <span>{t('Grid')}</span>
        </button>
        <button
          type="button"
          data-topbar-action
          title={t('Snap to Grid')}
          aria-label={t('Snap to Grid')}
          aria-pressed={snapEnabled}
          onClick={() => setSnapEnabled(!snapEnabled)}
        >
          <Magnet size={12} aria-hidden="true" />
          <span>{t('Snap')}</span>
        </button>
        <button
          type="button"
          data-topbar-action
          title={t('Smart Guides')}
          aria-label={t('Smart Guides')}
          aria-pressed={smartGuidesEnabled}
          onClick={() => setSmartGuidesEnabled(!smartGuidesEnabled)}
        >
          <Crosshair size={12} aria-hidden="true" />
          <span>{t('Guides')}</span>
        </button>
        <button
          type="button"
          data-topbar-action
          title={t('Snap to anchor points')}
          aria-label={t('Snap to anchor points')}
          aria-pressed={anchorSnapEnabled}
          onClick={() => setAnchorSnapEnabled(!anchorSnapEnabled)}
        >
          <Target size={12} aria-hidden="true" />
          <span>{t('Anchor')}</span>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <SaveIndicator />
        {/* Zoom indicator — click to edit %, Enter applies, Escape cancels, blur commits.
            Right-click / shift-click fits the page. */}
        <ZoomChip zoom={zoom} t={t} />
        <span className="topbar-sep" aria-hidden="true" />
        {/* Secondary — output actions. */}
        <div
          className="output-actions-toolbar flex items-center gap-2"
          role="toolbar"
          aria-label={t('Output actions')}
          title={t('Use arrow keys to review top bar actions')}
          onKeyDown={handleTopbarActionKeys}
        >
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Send to Plotter…')} (${getBinding('window.plotter')})`} aria-label={t('Send to Plotter…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('window.plotter'))} onClick={() => setModal('showPlotter', true)}>
            <Send size={12} aria-hidden="true" />{t('Plotter')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Cut Contour…')} (${getBinding('window.cutContour')})`} aria-label={t('Cut Contour…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('window.cutContour'))} onClick={() => openWithSelection('showCutContour')}>
            <Target size={12} aria-hidden="true" />{t('Contour')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Add positioning marks')} aria-label={t('Add positioning marks')} onClick={() => addPlotterRegistrationMarks(t)}>
            <Target size={12} aria-hidden="true" />{t('Reg')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Weed border')} aria-label={t('Weed border')} onClick={() => addPlotterWeedBorder(t)}>
            <Grid3X3 size={12} aria-hidden="true" />{t('Weed')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Bridges')} — ${t('Standard')}`} aria-label={`${t('Bridges')} — ${t('Standard')}`} onClick={() => { addPlotterBridges(t, 4, 1); }}>
            <Grid3X3 size={12} aria-hidden="true" />{t('Bridge')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Clear bridges')} aria-label={t('Clear bridges')} onClick={() => { clearPlotterBridges(t); }}>
            <Grid3X3 size={12} aria-hidden="true" />{t('Clear')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Banner Grommets…')} aria-label={t('Banner Grommets…')} onClick={() => openWithSelection('showGrommets')}>
            <Target size={12} aria-hidden="true" />{t('Grommet')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Rhinestone Template…')} aria-label={t('Rhinestone Template…')} onClick={() => openWithSelection('showRhinestone')}>
            <Sparkles size={12} aria-hidden="true" />{t('Stone')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Variable Data…')} (${getBinding('text.variableData')})`} aria-label={t('Variable Data…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('text.variableData'))} onClick={() => openWithSelection('showVariableData')}>
            <Hash size={12} aria-hidden="true" />{t('Data')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Save Test Cut File')} aria-label={t('Save Test Cut File')} onClick={() => savePlotterTestCut(t)}>
            <Send size={12} aria-hidden="true" />{t('Test')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Auto-arrange (Nest)')} aria-label={t('Auto-arrange (Nest)')} onClick={runAutoNest}>
            <Grid3X3 size={12} aria-hidden="true" />{t('Nest')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Print…')} (${getBinding('file.print')})`} aria-label={t('Print…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('file.print'))} onClick={() => setModal('showPrint', true)}>
            <Printer size={12} aria-hidden="true" />{t('Print')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={t('Print Prep…')} aria-label={t('Print Prep…')} onClick={openPrintPrep}>
            <Printer size={12} aria-hidden="true" />{t('Prep')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Tile Print…')} (${getBinding('file.tilePrint')})`} aria-label={t('Tile Print…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('file.tilePrint'))} onClick={() => setModal('showTilePrint', true)}>
            <Sheet size={12} aria-hidden="true" />{t('Tile')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Export SVG')} (${getBinding('file.exportSvg')})`} aria-label={t('Export SVG')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('file.exportSvg'))} onClick={() => { void getFormat('svg')?.export?.(); }}>
            <FileImage size={12} aria-hidden="true" />{t('Export')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center justify-center w-7 h-7 p-0" title={t('Document Settings…')} aria-label={t('Document Settings…')} onClick={() => setModal('showDocSettings', true)}>
            <Settings2 size={12} aria-hidden="true" />
          </button>
          {/* Primary — AI. */}
          <button type="button" data-topbar-action className="btn-primary flex items-center gap-1" title={t('AI Assistant')} aria-label={t('AI Assistant')} onClick={onToggleAI}>
            <Sparkles size={12} aria-hidden="true" />{t('AI')}
          </button>
        </div>
        <LanguageSwitcher />
      </div>

      <input ref={fileRef} type="file" accept=".svg,.json" hidden onChange={onFile} />
      <input ref={jsonRef} type="file" accept=".json" hidden onChange={onJSON} />
      <input ref={imageRef} data-import-image type="file" accept=".png,.jpg,.jpeg,.webp,.gif" hidden onChange={onImage} />

      {showAbout && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAbout(false)}>
          <div
            className="w-[380px] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-dialog-title"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
              <h2 id="about-dialog-title" className="dialog-title">{t('About')}</h2>
              <button type="button" onClick={() => setShowAbout(false)} className="btn-dialog-close" aria-label={t('Close')}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-3 text-sm">
              <Logo size={40} variant="full" />
              <div className="type-caption">
                {t('Version')} {__APP_VERSION__}
                {' · '}
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: isTauri() ? 'rgb(var(--color-success))' : 'rgb(var(--color-accent2))' }}
                    aria-hidden="true"
                  />
                  {isTauri() ? t('Native shell (Tauri)') : t('Web / PWA')}
                </span>
                <span className="text-muted/80" title={nativeInfo ? `${nativeInfo.os} · ${nativeInfo.arch}` : undefined}>
                  {' · '}
                  {nativeInfo
                    ? `${formatNativeOS(nativeInfo.os)} ${nativeInfo.arch}`
                    : getOSLabel()}
                </span>
              </div>
              <p className="text-muted text-xs leading-relaxed">
                {t('An AI-assisted vector editor built with Fabric.js, React, and Tailwind. AI features powered by Anthropic. Source managed with Git.')}
              </p>
              <div className="text-[10px] text-muted/70 pt-2 border-t border-border">
                {t('Credits: Fabric.js, React, Anthropic, Lucide icons.')}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function LanguageSwitcher() {
  const t = useT();
  const lang = useI18n(s => s.lang);
  const setLang = useI18n(s => s.setLang);
  const labelFor = (l: Lang) => (l === 'zh' ? '中文' : 'EN');
  // Same aria-expanded recipe as the Dropdown component above — track open
  // state so SR knows the menu's actual visibility (CSS hover / focus-within
  // doesn't propagate to the a11y tree on its own).
  const [open, setOpen] = useState(false);
  const handleLanguageMenuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-language-action]'));
    if (buttons.length === 0) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };
  return (
    <div
      className="relative group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        // Pill-style language switcher — rounded-full sets it apart from rectangular buttons.
        className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-panel2 border border-border text-muted hover:text-ink hover:border-border/80 transition-colors"
        title={t('Language')}
        aria-label={t('Language')}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          setOpen(true);
          const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[data-language-action]') ?? []);
          buttons[event.key === 'ArrowUp' ? buttons.length - 1 : 0]?.focus();
        }}
      >
        <Globe size={11} aria-hidden="true" />
        <span>{labelFor(lang)}</span>
      </button>
      <div
        className="absolute right-0 top-full mt-1 bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 w-28 py-1"
        role="menu"
        aria-label={t('Language')}
        title={t('Use arrow keys to review languages')}
        onKeyDown={handleLanguageMenuKeys}
      >
        {LANGUAGES.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            data-language-action
            role="menuitemradio"
            aria-checked={l === lang}
            aria-label={labelFor(l)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 text-ink transition-colors"
          >
            <span>{labelFor(l)}</span>
            {l === lang && <Check size={12} className="text-success" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Build the Recent Files cluster (header + items + clear button) as a list of
 * `MenuItem`s appended to the File dropdown. Returns an empty array when
 * there are no recents, which hides the section entirely.
 */
function buildRecentFilesItems(recent: RecentFile[]): MenuItem[] {
  if (recent.length === 0) return [];
  const top = recent.slice(0, 5);
  const items: MenuItem[] = [{ sep: true }];
  items.push({
    node: (
      <div className="px-3 pt-1.5 pb-1 field-label !mb-0 text-muted/80">
        {tStatic('Recent Files')}
      </div>
    ),
  });
  for (const f of top) {
    items.push({
      node: (
        <button
          onClick={() => { void openRecentFile(f.name); }}
          role="menuitem"
          aria-label={`${tStatic('Open recent')}: ${f.name}`}
          title={f.name}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-panel3 transition-colors"
        >
          {/* 16×16 thumb (was 12×12). At 12px the saved-canvas preview was
              an indistinguishable colour blob inside a tiny square; 16px is
              just enough resolution to read dominant shape + colour, which
              is the whole point of having a preview at all. The menu-row
              height (px-3 py-1.5 ≈ 28px) accommodates it without changing. */}
          <span
            className="w-4 h-4 rounded-sm border border-border bg-panel2 flex-shrink-0 overflow-hidden flex items-center justify-center"
            aria-hidden="true"
          >
            {f.preview ? (
              <img
                src={f.preview}
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              // Fallback icon for projects saved before preview generation
              // was wired up (and any future case where the thumb fails to
              // generate). Without this, the box rendered as an empty grey
              // square — visually broken instead of intentionally placeholder.
              <FileImage size={10} className="text-muted/70" aria-hidden="true" />
            )}
          </span>
          <span className="flex-1 min-w-0 truncate text-ink/90">{f.name}</span>
          <span className="text-[10px] text-muted tabular-nums flex-shrink-0">
            {formatRelativeTime(f.ts)}
          </span>
        </button>
      ),
    });
  }
  items.push({
    node: (
      <button
        onClick={() => clearRecent()}
        role="menuitem"
        aria-label={tStatic('Clear recent files')}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 text-[11px] text-muted hover:text-ink transition-colors"
      >
        <span>{tStatic('Clear Recent')}</span>
      </button>
    ),
  });
  return items;
}

/** Short relative-time helper for the recent-files list. Uses {n} placeholder
 * templates so zh can reorder ("5 分钟前") vs en ("5m ago"). */
function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return tStatic('just now');
  const min = Math.floor(sec / 60);
  if (min < 60) return tStatic('Nm ago').replace('{n}', String(min));
  const hr = Math.floor(min / 60);
  if (hr < 24) return tStatic('Nh ago').replace('{n}', String(hr));
  const day = Math.floor(hr / 24);
  if (day < 7) return tStatic('Nd ago').replace('{n}', String(day));
  const wk = Math.floor(day / 7);
  if (wk < 5) return tStatic('Nw ago').replace('{n}', String(wk));
  const mo = Math.floor(day / 30);
  if (mo < 12) return tStatic('Nmo ago').replace('{n}', String(mo));
  return tStatic('Ny ago').replace('{n}', String(Math.floor(day / 365)));
}

/**
 * Zoom indicator — clickable badge that toggles to an editable input.
 * Type a percentage and press Enter (or blur) to apply. Escape cancels.
 * Shift-click or right-click jumps to Fit-to-Page.
 */
function ZoomChip({ zoom, t }: { zoom: number; t: (k: string) => string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const displayPct = Math.round(zoom * 100);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n > 0) {
      const c = getCanvas();
      const target = Math.max(5, Math.min(3200, n)) / 100;
      if (c) zoomToPoint(c.getWidth() / 2, c.getHeight() / 2, target);
    }
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel2 border border-accent2 text-xs tabular-nums">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className="w-12 bg-transparent outline-none text-ink text-right"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // IME guard — the input is `type="text"` so a CJK keyboard
            // layout (pinyin / kana) could be active. Without isComposing,
            // the Enter that closes the IME candidate popup would
            // double-fire as a zoom commit on the partial transliteration.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          aria-label={t('Zoom')}
        />
        <span className="text-muted">%</span>
      </div>
    );
  }

  return (
    <button
      className="btn-ghost flex items-center gap-1 tabular-nums"
      onClick={(e) => {
        if (e.shiftKey) { zoomFit(); return; }
        setDraft(String(displayPct));
        setEditing(true);
      }}
      onContextMenu={(e) => { e.preventDefault(); zoomFit(); }}
      title={`${displayPct}% — ${t('Click to set, Shift-click to fit')}`}
      aria-label={`${t('Zoom')} ${displayPct}%`}
    >
      <Layers size={11} aria-hidden="true" />
      <span className="text-ink">{displayPct}%</span>
    </button>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // `disabled:hover:*` resets neutralise the active hover styles when the
  // button is disabled (Undo / Redo when there's nothing to undo). Without
  // them a greyed-out Undo button still flashed the bg-panel3 + text-ink
  // hover combo, contradicting its "can't click me" signal.
  return <button {...rest} className="px-2 py-1 rounded hover:bg-panel3 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted transition-colors text-muted hover:text-ink">{children}</button>;
}

/**
 * Compact "Saved Ns ago" / "Unsaved changes" chip. Reads from the autosave
 * status feed and re-renders on a 5s tick (so the relative time stays fresh
 * even when no Fabric events fire). Click triggers `saveProjectQuick()` —
 * writes back to the current handle when we have one, otherwise opens the
 * save picker.
 */
function SaveIndicator() {
  const t = useT();
  const [status, setStatus] = useState<AutoSaveStatus>(() => getAutoSaveStatus());
  // Forces a re-render every 5s so the relative time label refreshes.
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeAutoSaveStatus(setStatus);
    const id = window.setInterval(() => setTick((tk) => tk + 1), 5000);
    return () => { unsub(); window.clearInterval(id); };
  }, []);

  const label = formatSaveLabel(status, t);
  // Visual hierarchy: dirty == warn dot, clean == success dot, never-saved == muted.
  const dotClass = status.dirty
    ? 'bg-warn'
    : status.lastSavedAt
      ? 'bg-success'
      : 'bg-muted/40';

  return (
    <button
      type="button"
      className="btn-ghost flex items-center gap-1.5"
      onClick={() => { void saveProjectQuick(); }}
      // Title carries the action hint ("Save now"); the visible span + aria-
      // label both surface the *status* ("Saved 3m ago" / "Unsaved changes")
      // — splitting these gives the tooltip a job beyond echoing what the
      // sighted user can already read on the chip.
      title={`${t('Save now')} (${getBinding('file.saveProject')})`}
      aria-label={label}
      aria-keyshortcuts={ariaKeyshortcuts(getBinding('file.saveProject'))}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${dotClass}`} aria-hidden="true" />
      <span className="type-caption">{label}</span>
    </button>
  );
}

function formatSaveLabel(s: AutoSaveStatus, t: (k: string) => string): string {
  if (s.dirty) return t('Unsaved changes');
  if (s.lastSavedAt == null) return t('Not saved yet');
  const diff = Math.max(0, Date.now() - s.lastSavedAt);
  if (diff < 5000) return t('Saved just now');
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t('Saved Ns ago').replace('{n}', String(sec));
  const min = Math.floor(sec / 60);
  if (min < 60) return t('Saved Nm ago').replace('{n}', String(min));
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('Saved Nh ago').replace('{n}', String(hr));
  // Roll over into days once we cross the 24-hour mark — matches the
  // Recent Files relative-time scale (Nd / Nw / Nmo ago) so a stale save
  // reads as "Saved 3d ago" instead of "Saved 72h ago".
  const day = Math.floor(hr / 24);
  return t('Saved Nd ago').replace('{n}', String(day));
}

interface MenuItem {
  label?: string;
  onClick?: () => void;
  kbd?: string;
  sep?: boolean;
  disabled?: boolean;
  /** Checked toggle item — renders a ✓ icon next to the kbd. */
  checked?: boolean;
  /** Optional custom JSX — when present, replaces the standard button row. */
  node?: React.ReactNode;
  /** Nested submenu — renders a flyout panel on hover/focus. */
  sub?: MenuItem[];
}
function Dropdown({ label, items, width }: { label: string; items: MenuItem[]; width?: string }) {
  // Track open state so aria-expanded reflects reality. The visual
  // transition is still CSS (group-hover / group-focus-within) — this
  // state mirrors those triggers so screen readers know the menu state.
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Only collapse when focus leaves the dropdown subtree entirely —
        // tabbing between menu items stays "open".
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="px-2 py-1 rounded hover:bg-panel2 text-ink/90 hover:text-ink transition-colors"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        role="menuitem"
      >
        {label}
      </button>
      <div
        className={`absolute left-0 top-full mt-1 bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 ${width ?? 'w-56'} py-1`}
        role="menu"
        aria-label={label}
      >
        {items.map((it, i) => <MenuRow key={i} it={it} />)}
      </div>
    </div>
  );
}

/** A single dropdown row: separator, custom node, nested submenu, or button. */
function MenuRow({ it }: { it: MenuItem }) {
  if (it.sep) return <div className="my-1 border-t border-border" role="separator" />;
  if (it.node) return <div>{it.node}</div>;

  if (it.sub) {
    return (
      <div className="relative group/sub">
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-label={it.label}
          className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 gap-2 transition-colors"
        >
          <span className="flex items-center gap-1.5 flex-1 min-w-0 truncate">{it.label}</span>
          <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-muted" />
        </button>
        <div
          className="absolute left-full top-0 -mt-1 bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover/sub:opacity-100 group-hover/sub:visible group-focus-within/sub:opacity-100 group-focus-within/sub:visible transition-all z-50 w-56 py-1 max-h-[70vh] overflow-y-auto"
          role="menu"
          aria-label={it.label}
        >
          {it.sub.map((s, j) => <MenuRow key={j} it={s} />)}
        </div>
      </div>
    );
  }

  const isToggle = typeof it.checked === 'boolean';
  return (
    <button
      type="button"
      disabled={it.disabled}
      onClick={it.onClick}
      role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={isToggle ? it.checked : undefined}
      aria-label={it.label}
      aria-keyshortcuts={ariaKeyshortcuts(it.kbd)}
      className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent gap-2 transition-colors"
    >
      <span className="flex items-center gap-1.5 flex-1 min-w-0 truncate">{it.label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        {it.kbd && <Kbd combo={it.kbd} />}
        {isToggle && (
          <span className={`w-3 ${it.checked ? 'text-success' : 'text-transparent'}`} aria-hidden="true">
            <Check size={12} />
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Renders a shortcut combo as discrete <kbd> chips. "Ctrl+N" → [Ctrl][N].
 * Uses ⌘ on macOS for the Cmd modifier so the hint matches the actual key.
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
