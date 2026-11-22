import { useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent } from 'react';
import { Undo2, Redo2, Sparkles, Printer, Send, FileImage, Layers, X, Globe, Check, ChevronRight } from 'lucide-react';
import { useEditor } from '../store/editor';
import { undo, redo, zoomBy, zoomFit, zoomToPoint, zoomToPercent, zoomToAllArtboards, zoomToActiveArtboard, zoomToAdjacentArtboard, zoomToSelection, getCanvas, duplicateSelection, deleteSelection, autoArrangeSelection, flipSelection, lockSelection, lockOthers, lockActiveArtboard, lockOtherArtboards, unlockSelection, unlockActiveArtboard, unlockOtherArtboards, unlockAll, hideSelection, hideOthers, hideActiveArtboard, hideOtherArtboards, showSelection, showActiveArtboard, showOtherArtboards, showAll, makeGuidesFromSelection, releaseGuides, selectAllObjects, fixAllCleanupObjects, fixStrayPointObjects, fixAllPrepressRisks, deselectAll, promptRenameSelection, selectSame, selectSameType, selectInverse, selectObjectInStack, fixEmptyTextObjects, fixMissingLinkedImageObjects, fixAllImagePreflightObjects, groupSelection, ungroupSelection, ungroupAll, bringForward, sendBackward, sendToBack, bringToFront, applyStyleToSelection, swapFillStroke, defaultColors, alignSelection, distributeSelection, distributeInArtboard, centerOnArtboard, setKeyObject } from '../lib/canvasEngine';
import { joinSelection } from '../lib/pathJoin';
import { nestSelection } from '../lib/alignDistribute';
import { scissorsSplitSelectionAtMidpoint } from '../lib/scissors';
import { knifeSplitSelectionAtCenter } from '../lib/knife';
import { reflectSelection, repeatTransform, rotateSelection } from '../lib/transformOps';
import { reversePathSelection } from '../lib/pathReverse';
import { addAnchorsToSelection } from '../lib/addAnchors';
import { smoothPathSelection } from '../lib/pathSmooth';
import { cleanUpDocument, selectCleanupObjects } from '../lib/cleanUp';
import { outlineStrokeToFillSelection } from '../lib/outlineStrokeFill';
import { addArrowheads } from '../lib/arrowheads';
import { averageSelectedAnchors } from '../lib/pathEdit';
import { toggleIsolationMode } from '../lib/isolationMode';
import { fitActiveArtboardToContent, fitArtboardToContent } from '../lib/fitArtboard';
import { createOutlinesFromText } from '../lib/textToOutline';
import { splitTextToLetters, splitTextToLines } from '../lib/splitText';
import { adjustFontSize, adjustLeading, adjustTracking, changeCaseSelection } from '../lib/textCase';
import { smartPunctuationSelection } from '../lib/smartPunctuation';
import { applyTextOnArc } from '../lib/textPath';

import { createArtboardFromSelection, deleteActiveArtboard, duplicateActiveArtboard, duplicateActiveArtboardFrame, exportActiveArtboardAsPNG, exportActiveArtboardAsSVG, exportAllArtboardsAsFiles, exportAllArtboardsAsPNG, promptExportArtboardRangeAsPNG, promptExportArtboardRangeAsSVG, promptRearrangeArtboards, promptRenameActiveArtboard, renumberArtboardsByPosition, reorderActiveArtboard, sortArtboardsByPosition } from '../lib/artboards';
import { booleanOp, divideSelection, trimSelection, cropSelection, mergeSelection, mergeSameFillSelection } from '../lib/booleanOps';
import { applyClipMask, releaseClipMask, expandClippingMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { toast } from '../lib/toast';
import { openErrorLogDialog } from '../lib/errorLog';
import { getFormat } from '../lib/formats';
import { copySelection, cutSelection, pasteFromClipboard } from '../lib/clipboard';
import { resetOnboarding } from '../lib/onboarding';
import { useT, useI18n, LANGUAGES, t as tStatic, type Lang } from '../lib/i18n';
import { Logo } from './Logo';
import { showConfirm } from '../lib/confirm';
import { isTauri, isMac, getOSLabel, platformInfo, ariaKeyshortcuts, type NativePlatformInfo } from '../lib/runtime';
import { canInstall, subscribeInstallAvailability, promptInstall } from '../lib/pwaInstall';
import { getAutoSaveStatus, subscribeAutoSaveStatus, type AutoSaveStatus } from '../lib/autosave';
import { setOutlineMode } from '../lib/outlineView';
import type { RecentFile } from '../lib/recentFiles';
import { envelopeSelection } from '../lib/envelope';
import { addPrintMarksToArtboard, clearPrintMarks } from '../lib/printMarks';
import { applyStrokeAlign } from '../lib/strokeAlign';
import { applyBlendModeToSelection, applyOverprintToSelection, applyPatternFill, applyShadowToSelection, applyStrokeStyleToSelection, clearGradientFillSelection, clearPatternFillSelection, expandAppearanceSelection, expandDropShadowSelection, expandPatternFillSelection, flattenTransparencySelection, toggleUniformStroke } from '../lib/effects';
import { applyGraphicStyleToSelection, loadGraphicStyles, saveGraphicStyleFromSelection, selectObjectsUsingGraphicStyle, clearAppearanceFromSelection } from '../lib/graphicStyles';
import { addSavedSwatchColor, applySwatchToSelection, collectSelectionColorsIntoSwatches, loadSwatches, replaceSavedSwatchWithColor, selectObjectsUsingSwatch } from '../lib/globalSwatches';
import { applyBlur, applySepia, applyGrayscale as applyImageGrayscale, applyBrightness as applyImageBrightness, applyContrast, applyHueRotate, clearFilters } from '../lib/filters';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { getBinding } from '../lib/keymap';
import { getSymbols, redefineSymbolFromSelection, detachSymbolInstancesFromSelection, selectAllSymbolInstances, selectSymbolInstances } from '../lib/symbols';
import { expandBlendSteps, releaseBlendSteps, removeOrphanBlendSteps, relinkBlendEndpointFromSelection, reverseBlendSteps, selectAllBlendEndpoints, selectAllBlendGroups, selectBlendEndpointsFromSelection, selectBlendGroupFromSelection, selectBlendSteps, selectBlendStepsFromSelection, selectOrphanBlendSteps, updateBlendSteps } from '../lib/blend';

interface Props {
  onToggleAI: () => void;
  onToggleDebug: () => void;
  onShowOnboarding: () => void;
}

// io3 (system-clipboard paste, image import, trace) is interaction-only.
// Cached dynamic import (same shape as App.tsx's withProjectFile) keeps the
// ~29 kB module out of the entry chunk; CanvasView's drag-drop effect and
// AssetsPanel's registry refresh warm the same module at boot, so these menu
// actions are synchronous cache hits in practice (a cold click just waits
// out the one chunk fetch).
type IO3Module = typeof import('../lib/io3');
let io3Cache: IO3Module | null = null;
const loadIO3 = (): Promise<IO3Module> =>
  import('../lib/io3').then((m) => { io3Cache = m; return m; });
/** Invoke an io3 API, preferring the warmed module cache. */
function withIO3<T>(invoke: (m: IO3Module) => Promise<T>): Promise<T> {
  const cached = io3Cache;
  return cached ? invoke(cached) : loadIO3().then(invoke);
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
  const pdfRef = useRef<HTMLInputElement>(null);
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
  // In-app PWA install — the Help-menu entry below renders only while the
  // browser holds a capturable `beforeinstallprompt` event (armed once in
  // App.tsx via armPwaInstall). The subscription flips this state at the
  // exact moment installability changes, so the item appears/disappears
  // without relying on a lucky re-render. Safari, already-installed, Tauri
  // and Electron sessions never fire the event — the entry never shows.
  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => subscribeInstallAvailability(() => setInstallable(canInstall())), []);
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
  // recentFiles is loaded dynamically so it stays out of the entry chunk;
  // the subscription lands once that import resolves (StrictMode-safe via
  // the cancelled flag — same shape as App's projectFile title effect).
  const [recent, setRecent] = useState<RecentFile[]>([]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void import('../lib/recentFiles').then((m) => {
      if (cancelled) return;
      unsub = m.subscribeRecent(setRecent);
    }).catch((e) => console.warn('recentFiles chunk failed to load — recent menu disabled', e));
    return () => { cancelled = true; unsub?.(); };
  }, []);

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
    await withIO3((m) => m.importImageFile(f)).catch(console.warn);
    e.target.value = '';
  };
  // Vector PDF import routes through the same registry entry drag-drop uses
  // (pdf.js operator-list walker → SVG pipeline). Errors toast inside the
  // importer, so the handler only resets the input.
  const onPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      await getFormat('pdf')?.import?.(f);
    } catch {
      /* toasts surfaced by the importer */
    }
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

  // Rotation-aware nesting — skyline packer that may turn shapes 90°.
  const runRotationNest = () => {
    const result = nestSelection();
    if (result) toast.success(`${result.arranged} ${t('objects arranged')} · ${Math.round(result.utilization * 100)}% ${t('material used')}${result.rotated > 0 ? ` · ${result.rotated} ${t('objects rotated')}` : ''}`, { title: t('Nest (rotation-aware)') });
    else toast.warn(t('Select 2 or more objects first.'), { title: t('Nest (rotation-aware)') });
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
        // Embeds the visible wordmark (WCAG 2.5.3 Label in Name).
        aria-label={`${t('About')} Anchorworks`}
      >
        <Logo size={20} variant="full" />
      </button>
      <span className="topbar-sep" aria-hidden="true" />

      {/* Menu strip — `min-w-[340px] overflow-x-auto` lets the 9 top-level
          menus keep a workable width and scroll horizontally when the
          window is narrow instead of pushing the right-hand toolbars
          off-screen (same paradigm as .output-actions-toolbar; the explicit
          floor stops the flex shrink from crushing the strip to 0px).
          Because an overflow container clips absolutely-positioned
          descendants, the Dropdown panels below pin themselves with
          `position: fixed` at the trigger's viewport rect once open — see
          the Dropdown component. */}
      <div role="menubar" aria-label={t('Application menu')} className="flex items-center gap-2 min-w-[340px] overflow-x-auto">
      <Dropdown label={t('File')} width="w-64" items={[
        { label: t('Save Project'), onClick: async () => { void (await import('../lib/projectFile')).saveProjectQuick(); }, kbd: getBinding('file.saveProject') },
        { label: t('Save Project As…'), onClick: async () => { void (await import('../lib/projectFile')).saveProjectToFile(); }, kbd: getBinding('file.saveProjectAs') },
        { label: t('Open Project…'), onClick: async () => { void (await import('../lib/projectFile')).openProjectFromFile(); }, kbd: getBinding('file.openProject') },
        { sep: true },
        { label: t('New'), onClick: async () => { if (await showConfirm({ title: t('New document'), message: t('Clear canvas?'), confirmLabel: t('Clear'), danger: true })) location.reload(); }, kbd: getBinding('file.new') },
        { label: t('New from Template…'), onClick: () => setModal('showTemplates', true), kbd: getBinding('file.newFromTemplate') },
        { label: t('Open SVG / JSON…'), onClick: () => fileRef.current?.click(), kbd: getBinding('file.open') },
        { label: t('Import'), sub: [
          { label: t('Import Image…'), onClick: () => imageRef.current?.click(), kbd: getBinding('file.importImage') },
          { label: t('Import PDF…'), onClick: () => pdfRef.current?.click() },
          { label: t('Paste from Clipboard'), onClick: () => { void withIO3((m) => m.pasteFromSystemClipboard()).then(r => { if (r === 'empty') toast.warn(t('No image or SVG on the clipboard.')); else if (r === 'failed') toast.warn(t('Clipboard unavailable.')); }).catch((e) => console.warn('io3 chunk failed to load — paste disabled', e)); } },
        ] },
        { label: t('Export'), sub: [
          // File-menu exports route through the format registry — same files,
          // filenames, and options as before, but every consumer (CommandPalette,
          // drag-drop, AI skills, future Tauri "Save as…" dialog) reads the
          // single source of truth. `exportPDFReal` (vector PDF) doesn't have a
          // registry entry yet; its options story is heavier and migrates in a
          // later cycle.
          { label: t('Export SVG'), onClick: async () => { void getFormat('svg')?.export?.(); }, kbd: getBinding('file.exportSvg') },
          { label: t('Export PNG (2×)'), onClick: async () => { void getFormat('png')?.export?.(); } },
          { label: t('Export JPG (2×)'), onClick: async () => { void getFormat('jpg')?.export?.(); } },
          { label: t('Export PDF'), onClick: async () => { void getFormat('pdf')?.export?.(); } },
          { label: t('Export PDF (Vector)'), onClick: async () => { void getFormat('pdf-vector')?.export?.(); } },
          { label: t('Export DXF (paths)'), onClick: async () => { void getFormat('dxf')?.export?.(); } },
          { label: t('Export JSON'), onClick: async () => { void getFormat('json')?.export?.(); } },
          // Print-then-cut RIP handoff: same files as the plain exports, with
          // the store's cut paths appended (CutContour spot layer in the SVG,
          // magenta hairlines in the PDF). Shared with the command palette via
          // the cutPrepActions helpers.
          { label: t('Export SVG (with cut layer)'), onClick: async () => (await import('../lib/cutPrepActions')).exportSvgWithCutLayer(t) },
          { label: t('Export PDF (with cut layer)'), onClick: async () => (await import('../lib/cutPrepActions')).exportPdfWithCutLayer(t) },
          { sep: true },
          { label: t('Export Active Artboard (SVG)'), onClick: () => { void exportActiveArtboardAsSVG().then(ok => { if (ok) toast.success(t('Artboard exported')); else toast.warn(t('Select an object on or near an artboard first.')); }); } },
          { label: t('Export Active Artboard (PNG)'), onClick: () => { if (exportActiveArtboardAsPNG()) toast.success(t('Artboard exported')); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Export All Artboards (SVG)'), onClick: () => { void exportAllArtboardsAsFiles().then(n => { if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); } },
          { label: t('Export All Artboards (PNG)'), onClick: () => { const n = exportAllArtboardsAsPNG(); if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); } },
          { label: t('Export Artboard Range (SVG)…'), onClick: () => { void promptExportArtboardRangeAsSVG(t('Artboard range'), '1').then(n => { if (n == null) toast.warn(t('Invalid artboard range.')); else if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); } },
          { label: t('Export Artboard Range (PNG)…'), onClick: () => { const n = promptExportArtboardRangeAsPNG(t('Artboard range'), '1'); if (n == null) toast.warn(t('Invalid artboard range.')); else if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); } },
          { label: t('Export Selection as SVG'), onClick: async () => { void (await import('../lib/exportSelection')).exportSelectionSVG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
          { label: t('Export Selection as PNG'), onClick: async () => { void (await import('../lib/exportSelection')).exportSelectionPNG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
          { label: t('Copy as SVG'), onClick: async () => { void (await import('../lib/exportSelection')).copySelectionSVG().then(r => { if (r === 'ok') toast.success(t('SVG copied to clipboard')); else if (r === 'empty') toast.warn(t('Select something first.')); else toast.warn(t('Clipboard unavailable.')); }); } },
        ] },
        { sep: true },
        { label: t('Print…'), onClick: () => setModal('showPrint', true), kbd: getBinding('file.print') },
        { label: t('Document Settings…'), onClick: () => setModal('showDocSettings', true) },
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
        // The long tail of Select Visible / Unlocked / Locked / Hidden ×
        // (document | active artboard) helpers moved out of the menu —
        // every one remains reachable from the command palette (verified
        // 1:1 label match in CommandPalette.tsx; see the reorg report).
        { label: t('Select Same'), sub: [
          // High-frequency subset kept in the menu; the remaining 79
          // "Select Same …" variants (appearance / geometry / artboard
          // scoping pairs) are command-palette only — every removed label
          // was verified 1:1 against CommandPalette.tsx first.
          { label: t('Select Same Fill'), onClick: () => { const n = selectSame('fill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Stroke'), onClick: () => { const n = selectSame('stroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Fill & Stroke'), onClick: () => { const n = selectSame('fillStroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Opacity'), onClick: () => { const n = selectSame('opacity'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Font Family'), onClick: () => { const n = selectSame('fontFamily'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Font Size'), onClick: () => { const n = selectSame('fontSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Type'), onClick: () => { const n = selectSameType(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
        ] },
        // "Select Object …" family (217 entries) moved out of the menu —
        // every removed label was verified 1:1 against CommandPalette.tsx
        // first, so the long tail stays reachable from the palette. The
        // six high-frequency fix actions stay one click away, plus the
        // cleanup pair (formerly Document > Path).
        { label: t('Fix All Cleanup Objects'), onClick: () => { const n = fixAllCleanupObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No cleanup objects found.')); } },
        { label: t('Fix Stray Point Objects'), onClick: () => { const n = fixStrayPointObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No stray point objects.')); } },
        { label: t('Fix Empty Text Objects'), onClick: () => { const n = fixEmptyTextObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No empty text objects.')); } },
        { label: t('Fix Missing Linked Image Objects'), onClick: () => { const n = fixMissingLinkedImageObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No missing linked image objects.')); } },
        { label: t('Fix All Prepress Risks'), onClick: () => { const n = fixAllPrepressRisks(); if (n) toast.success(`${n} ${t('prepress risks fixed')}`); else toast.warn(t('No prepress risks found.')); } },
        { label: t('Fix All Image Preflight Objects'), onClick: () => { const n = fixAllImagePreflightObjects(); if (n) toast.success(`${n} ${t('image preflight issues fixed')}`); else toast.warn(t('No image preflight issues.')); } },
        { label: t('Select Cleanup Objects'), onClick: () => { const n = selectCleanupObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.success(t('Nothing to clean up.')); } },
        { label: t('Clean Up'), onClick: () => { const n = cleanUpDocument(); if (n) toast.success(`${n} ${t('stray objects removed')}`); else toast.success(t('Nothing to clean up.')); } },
        { label: t('Select Inverse'), onClick: () => { selectInverse(); }, kbd: getBinding('edit.selectInverse') },
        { label: t('Select Next Object Above'), onClick: () => { if (!selectObjectInStack('up')) toast.warn(t('Nothing above.')); }, kbd: getBinding('edit.selectNextAbove') },
        { label: t('Select Next Object Below'), onClick: () => { if (!selectObjectInStack('down')) toast.warn(t('Nothing below.')); }, kbd: getBinding('edit.selectNextBelow') },
        { sep: true },
      ]} />

      <Dropdown label={t('Object')} items={[
        { label: t('Group'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else groupSelection(); }, kbd: getBinding('edit.group') },
        { label: t('Isolation Mode'), onClick: () => { if (!toggleIsolationMode()) toast.warn(t('Select a group first.')); }, kbd: getBinding('object.isolation') },
        { label: t('Ungroup'), onClick: () => { if (getCanvas()?.getActiveObject()?.type !== 'group') toast.warn(t('Select a group first.')); else ungroupSelection(); }, kbd: getBinding('edit.ungroup') },
        { label: t('Ungroup All'), onClick: () => { const n = ungroupAll(); if (n) toast.success(`${n} ${t('groups ungrouped')}`); else toast.warn(t('Select a group first.')); } },
        { sep: true },
        { label: t('Transform'), sub: [
          { label: t('Transform…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showTransform', true); } },
          { label: t('Resize…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showResize', true); } },
          { label: t('Shear…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showShear', true); } },
          { label: t('Free Distort…'), onClick: () => openWithSelection('showFreeDistort') },
          { label: t('Transform Again'), onClick: () => { repeatTransform().then((ok) => { if (!ok) toast.warn(t('Apply a Transform first.')); }); }, kbd: getBinding('edit.transformAgain') },
          { label: t('Rotate 90° CW'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(90); } },
          { label: t('Rotate 90° CCW'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(-90); } },
          { label: t('Rotate 180°'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(180); } },
          { label: t('Flip Horizontal'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else flipSelection('x'); }, kbd: getBinding('edit.flipH') },
          { label: t('Flip Vertical'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else flipSelection('y'); }, kbd: getBinding('edit.flipV') },
          { label: t('Reflect 45°'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else reflectSelection(45); } },
          { label: t('Reflect 135°'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else reflectSelection(135); } },
        ] },
        { label: t('Arrange'), sub: [
          { label: t('Bring to Front'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else bringToFront(); }, kbd: `${getBinding('arrange.forwardFront').replace(/]$/, 'Shift+]')}` },
          { label: t('Bring Forward'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else bringForward(); }, kbd: getBinding('arrange.forwardFront') },
          { label: t('Send Backward'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else sendBackward(); }, kbd: getBinding('arrange.backwardBack') },
          { label: t('Send to Back'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else sendToBack(); }, kbd: `${getBinding('arrange.backwardBack').replace(/[[]$/, 'Shift+[')}` },
        ] },
        { sep: true },
        { label: t('Lock'), sub: [
          { label: t('Lock Selection'), onClick: () => { const n = lockSelection(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.lockSelection') },
          { label: t('Lock Others'), onClick: () => { const n = lockOthers(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('No other unlocked objects.')); } },
          { label: t('Lock Active Artboard'), onClick: () => { const n = lockActiveArtboard(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Lock Other Artboards'), onClick: () => { const n = lockOtherArtboards(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Unlock Selection'), onClick: () => { const n = unlockSelection(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked selection.')); } },
          { label: t('Unlock Active Artboard'), onClick: () => { const n = unlockActiveArtboard(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Unlock Other Artboards'), onClick: () => { const n = unlockOtherArtboards(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Unlock All'), onClick: () => { const n = unlockAll(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked objects.')); }, kbd: getBinding('edit.unlockAll') },
        ] },
        { label: t('Hide'), sub: [
          { label: t('Hide Selection'), onClick: () => { const n = hideSelection(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.hideSelection') },
          { label: t('Hide Others'), onClick: () => { const n = hideOthers(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); } },
          { label: t('Hide Active Artboard'), onClick: () => { const n = hideActiveArtboard(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Hide Other Artboards'), onClick: () => { const n = hideOtherArtboards(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Show Selection'), onClick: () => { const n = showSelection(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden selection.')); } },
          { label: t('Show Active Artboard'), onClick: () => { const n = showActiveArtboard(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Show Other Artboards'), onClick: () => { const n = showOtherArtboards(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Show All'), onClick: () => { const n = showAll(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden objects.')); }, kbd: getBinding('edit.showAll') },
        ] },
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
          { label: t('Merge Same Fill'), onClick: () => { const n = mergeSameFillSelection(); if (n) toast.success(`${n} ${t('same-fill groups merged')}`); else toast.warn(t('Select 2 or more same-fill shapes first.')); } },
          { label: t('Crop'), onClick: () => { const n = cropSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
        ] },
        { label: t('Join Paths'), onClick: () => { if (!joinSelection()) toast.warn(t('Select 1 open path to close, or 2 to join.')); }, kbd: getBinding('edit.join') },
        { label: t('Make Clipping Mask'), onClick: () => { if (!applyClipMask()) toast.warn(t('Select 2 or more objects first.')); }, kbd: getBinding('edit.clipMask') },
        { label: t('Release Clipping Mask'), onClick: () => { if (!releaseClipMask()) toast.warn(t('Select a clipping group first.')); }, kbd: getBinding('edit.releaseClip') },
        { label: t('Expand Clipping Mask'), onClick: () => { const n = expandClippingMask(); if (n) toast.success(`${n} ${t('clip masks expanded')}`); else toast.warn(t('Select a clipping group first.')); } },
        { label: t('Make Compound Path'), onClick: () => { if (!makeCompoundPath()) toast.warn(t('Select 2 or more objects first.')); }, kbd: getBinding('edit.compoundPath') },
        { label: t('Release Compound Path'), onClick: () => { if (!releaseCompoundPath()) toast.warn(t('Select a compound path first.')); }, kbd: getBinding('edit.releaseCompound') },
        { sep: true },
        { label: t('Expand Appearance'), onClick: () => { void expandAppearanceSelection().then((n) => { if (n) toast.success(`${n} ${t('appearances expanded')}`); else toast.warn(t('Select objects with expandable appearance first.')); }); } },
        { label: t('Flatten Transparency'), onClick: () => { const n = flattenTransparencySelection(); if (n) toast.success(`${n} ${t('objects flattened')}`); else toast.warn(t('Select transparent or blended objects first.')); } },
        { sep: true },
        { label: t('Align & Distribute'), sub: [
          { label: t('Align left'), onClick: () => runAlign(() => alignSelection('left'), 2), kbd: getBinding('align.left') },
          { label: t('Align center horizontally'), onClick: () => runAlign(() => alignSelection('centerH'), 2), kbd: getBinding('align.centerH') },
          { label: t('Align right'), onClick: () => runAlign(() => alignSelection('right'), 2), kbd: getBinding('align.right') },
          { sep: true },
          { label: t('Align top'), onClick: () => runAlign(() => alignSelection('top'), 2), kbd: getBinding('align.top') },
          { label: t('Align center vertically'), onClick: () => runAlign(() => alignSelection('centerV'), 2), kbd: getBinding('align.centerV') },
          { label: t('Align bottom'), onClick: () => runAlign(() => alignSelection('bottom'), 2), kbd: getBinding('align.bottom') },
          { sep: true },
          { label: t('Set Key Object'), onClick: () => { if (setKeyObject()) toast.success(t('Key object set')); else toast.warn(t('Select a single object first.')); } },
          { label: t('Align to Key Object'), sub: [
            { label: t('Align left'), onClick: () => runAlign(() => alignSelection('left', 'key'), 2) },
            { label: t('Align center horizontally'), onClick: () => runAlign(() => alignSelection('centerH', 'key'), 2) },
            { label: t('Align right'), onClick: () => runAlign(() => alignSelection('right', 'key'), 2) },
            { sep: true },
            { label: t('Align top'), onClick: () => runAlign(() => alignSelection('top', 'key'), 2) },
            { label: t('Align center vertically'), onClick: () => runAlign(() => alignSelection('centerV', 'key'), 2) },
            { label: t('Align bottom'), onClick: () => runAlign(() => alignSelection('bottom', 'key'), 2) },
          ] },
          { sep: true },
          { label: t('Distribute horizontally (equal spacing)'), onClick: () => runAlign(() => distributeSelection('horizontal'), 3), kbd: getBinding('distribute.horizontal') },
          { label: t('Distribute vertically (equal spacing)'), onClick: () => runAlign(() => distributeSelection('vertical'), 3), kbd: getBinding('distribute.vertical') },
          { label: t('Distribute by edge/center'), sub: [
            { label: t('Distribute horizontal centers'), onClick: () => runAlign(() => distributeSelection('horizontal', 'center'), 3) },
            { label: t('Distribute vertical centers'), onClick: () => runAlign(() => distributeSelection('vertical', 'center'), 3) },
            { sep: true },
            { label: t('Distribute left edges'), onClick: () => runAlign(() => distributeSelection('horizontal', 'start'), 3) },
            { label: t('Distribute right edges'), onClick: () => runAlign(() => distributeSelection('horizontal', 'end'), 3) },
            { label: t('Distribute top edges'), onClick: () => runAlign(() => distributeSelection('vertical', 'start'), 3) },
            { label: t('Distribute bottom edges'), onClick: () => runAlign(() => distributeSelection('vertical', 'end'), 3) },
            { sep: true },
            { label: t('Distribute to Key Object'), sub: [
              { label: t('Distribute horizontal centers'), onClick: () => runAlign(() => distributeSelection('horizontal', 'center', 'key'), 3) },
              { label: t('Distribute vertical centers'), onClick: () => runAlign(() => distributeSelection('vertical', 'center', 'key'), 3) },
              { sep: true },
              { label: t('Distribute left edges'), onClick: () => runAlign(() => distributeSelection('horizontal', 'start', 'key'), 3) },
              { label: t('Distribute right edges'), onClick: () => runAlign(() => distributeSelection('horizontal', 'end', 'key'), 3) },
              { label: t('Distribute top edges'), onClick: () => runAlign(() => distributeSelection('vertical', 'start', 'key'), 3) },
              { label: t('Distribute bottom edges'), onClick: () => runAlign(() => distributeSelection('vertical', 'end', 'key'), 3) },
            ] },
          ] },
          { sep: true },
          { label: t('Align to Artboard'), sub: [
            { label: t('Align left'), onClick: () => runArtboardAlign(() => alignSelection('left', 'artboard')) },
            { label: t('Align center horizontally'), onClick: () => runArtboardAlign(() => alignSelection('centerH', 'artboard')) },
            { label: t('Align right'), onClick: () => runArtboardAlign(() => alignSelection('right', 'artboard')) },
            { sep: true },
            { label: t('Align top'), onClick: () => runArtboardAlign(() => alignSelection('top', 'artboard')) },
            { label: t('Align center vertically'), onClick: () => runArtboardAlign(() => alignSelection('centerV', 'artboard')) },
            { label: t('Align bottom'), onClick: () => runArtboardAlign(() => alignSelection('bottom', 'artboard')) },
          ] },
          { label: t('Distribute horizontally in Artboard'), onClick: () => runArtboardAlign(() => distributeInArtboard('horizontal')) },
          { label: t('Distribute vertically in Artboard'), onClick: () => runArtboardAlign(() => distributeInArtboard('vertical')) },
          { label: t('Center on Artboard'), onClick: () => runArtboardAlign(() => centerOnArtboard()) },
        ] },
        { label: t('Appearance'), sub: [
          { label: t('Clear Appearance'), onClick: () => { const n = clearAppearanceFromSelection(); if (n) toast.success(`${n} ${t('appearances cleared')}`); else toast.warn(t('Select something first.')); } },
          { label: t('Clear Gradient Fill'), onClick: () => { const n = clearGradientFillSelection(); if (n) toast.success(`${n} ${t('gradient fills cleared')}`); else toast.warn(t('Select objects with gradient fills first.')); } },
          { label: t('Overprint'), sub: [
            { label: t('Overprint Fill'), onClick: () => { const n = applyOverprintToSelection('fill', true); if (n) toast.success(`${n} ${t('overprint updated')}`); else toast.warn(t('Select objects to update overprint.')); } },
            { label: t('Overprint Stroke'), onClick: () => { const n = applyOverprintToSelection('stroke', true); if (n) toast.success(`${n} ${t('overprint updated')}`); else toast.warn(t('Select objects to update overprint.')); } },
            { label: t('Overprint Fill and Stroke'), onClick: () => { const n = applyOverprintToSelection('both', true); if (n) toast.success(`${n} ${t('overprint updated')}`); else toast.warn(t('Select objects to update overprint.')); } },
            { sep: true },
            { label: t('Clear Overprint'), onClick: () => { const n = applyOverprintToSelection('both', false); if (n) toast.success(`${n} ${t('overprint updated')}`); else toast.warn(t('Select objects to update overprint.')); } },
          ] },
          { sep: true },
          { label: t('Graphic Styles'), sub: [
            { label: t('Save selection as graphic style'), onClick: () => { const style = saveGraphicStyleFromSelection(); if (style) toast.success(`${t('Graphic style saved')}: ${style.name}`); else toast.warn(t('Select something first.')); } },
            { sep: true },
            ...loadGraphicStyles().flatMap((style) => [
              { label: `${t('Apply graphic style')}: ${style.name}`, onClick: () => { const n = applyGraphicStyleToSelection(style); if (n) toast.success(`${n} ${t('graphic styles applied')}`); else toast.warn(t('Select something first.')); } },
              { label: `${t('Select art using graphic style')}: ${style.name}`, onClick: () => { const n = selectObjectsUsingGraphicStyle(style); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No objects use this graphic style.')); } },
            ]),
          ] },
          { label: t('Swatches'), sub: [
            { label: t('Add current fill'), onClick: () => { const fill = useEditor.getState().style.fill; if (typeof fill !== 'string' || !fill) { toast.warn(t('Select an object with a solid colour first.')); return; } const before = loadSwatches().length; const next = addSavedSwatchColor(fill); if (next.length > before) toast.success(t('Swatch added')); else toast.warn(t('Swatch already exists.')); } },
            { label: t('Collect colours from selection'), onClick: () => { const result = collectSelectionColorsIntoSwatches(); if (result.added) toast.success(`${result.added} ${t('swatches added')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
            { sep: true },
            ...loadSwatches().flatMap((color) => [
              { label: `${t('Apply swatch fill')}: ${color}`, onClick: () => { const n = applySwatchToSelection(color, 'fill'); if (n) toast.success(`${n} ${t('Appearance applied')}`); else toast.warn(t('Select something first.')); } },
              { label: `${t('Apply swatch stroke')}: ${color}`, onClick: () => { const n = applySwatchToSelection(color, 'stroke'); if (n) toast.success(`${n} ${t('Appearance applied')}`); else toast.warn(t('Select something first.')); } },
              { label: `${t('Select art using swatch')}: ${color}`, onClick: () => { const n = selectObjectsUsingSwatch(color); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No objects use this swatch.')); } },
              { label: `${t('Replace swatch with current fill')}: ${color}`, onClick: () => { const fill = useEditor.getState().style.fill; if (typeof fill !== 'string' || !fill) { toast.warn(t('Select an object with a solid colour first.')); return; } const result = replaceSavedSwatchWithColor(color, fill); if (result.changed) toast.success(`${result.changed} ${t('colours changed')}`); else toast.warn(t('No objects use this swatch.')); } },
            ]),
          ] },
          { sep: true },
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


        ] },
        { label: t('Symbols'), sub: [
          { label: t('Redefine Symbol'), onClick: () => { void redefineSymbolFromSelection().then((entry) => { if (entry) toast.success(t('Symbol redefined')); else toast.warn(t('Select a symbol instance first.')); }); } },
          { label: t('Break Symbol Link'), onClick: () => { const count = detachSymbolInstancesFromSelection(); if (count) toast.success(`${count} ${t('symbol instances detached')}`); else toast.warn(t('Select a symbol instance first.')); } },
          { sep: true },
          { label: t('Select All Symbol Instances'), onClick: () => { const count = selectAllSymbolInstances(); if (count) toast.success(`${count} ${t('selected')}`); else toast.warn(t('No symbol instances found.')); } },
          { label: t('Select symbol instances'), sub: getSymbols().map((symbol) => ({
            label: symbol.name,
            onClick: () => { const count = selectSymbolInstances(symbol.id); if (count) toast.success(`${count} ${t('selected')}`); else toast.warn(t('No symbol instances found.')); },
          })) },
        ] },
        { label: t('Image'), sub: [
          { label: t('Trace Image'), onClick: () => { void withIO3((m) => m.traceSelectedImage()).then(ok => { if (ok) toast.success(t('Image traced')); else toast.warn(t('Select a raster image first.')); }).catch((e) => console.warn('io3 chunk failed to load — trace disabled', e)); } },
          { label: t('Rasterize'), onClick: async () => { void (await import('../lib/rasterize')).rasterizeSelection().then(ok => { if (ok) toast.success(t('Rasterized')); else toast.warn(t('Select an object first.')); }); } },
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
        { label: t('Path'), sub: [
          { label: t('Add Anchor Points'), onClick: () => { const n = addAnchorsToSelection(); if (n) toast.success(`${n} ${t('paths subdivided')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Scissors at Midpoint'), onClick: () => { const n = scissorsSplitSelectionAtMidpoint(); if (n) toast.success(`${n} ${t('paths split')}`); else toast.warn(t('Select open stroked paths first.')); } },
          { label: t('Knife Split Horizontal'), onClick: () => { const n = knifeSplitSelectionAtCenter('horizontal'); if (n) toast.success(`${n} ${t('objects knife-split')}`); else toast.warn(t('Select closed shapes first.')); } },
          { label: t('Knife Split Vertical'), onClick: () => { const n = knifeSplitSelectionAtCenter('vertical'); if (n) toast.success(`${n} ${t('objects knife-split')}`); else toast.warn(t('Select closed shapes first.')); } },
          { label: t('Average Anchor Points'), onClick: () => { const n = averageSelectedAnchors('both'); if (n) toast.success(`${n} ${t('anchors averaged')}`); else toast.warn(t('Shift-click two or more path anchors first.')); }, kbd: getBinding('path.averageAnchors') },
          { label: t('Smooth Path'), onClick: () => { const n = smoothPathSelection(); if (n) toast.success(`${n} ${t('paths smoothed')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Reverse Path Direction'), onClick: () => { const n = reversePathSelection(); if (n) toast.success(`${n} ${t('paths reversed')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Add Arrowhead (Start)'), onClick: () => { const n = addArrowheads('start'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Add Arrowhead (End)'), onClick: () => { const n = addArrowheads('end'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Add Arrowheads (Both)'), onClick: () => { const n = addArrowheads('both'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
        ] },
        { label: t('Artboards'), sub: [
          { label: t('Create Artboard from Selection'), onClick: () => { const ab = createArtboardFromSelection(); if (ab) toast.success(t('Artboard created')); else toast.warn(t('Select something first.')); } },
          { label: t('Duplicate Active Artboard'), onClick: () => { void duplicateActiveArtboard().then((ab) => { if (ab) toast.success(t('Artboard duplicated')); else toast.warn(t('Select an object on or near an artboard first.')); }); } },
          { label: t('Duplicate Active Artboard Frame'), onClick: () => { if (duplicateActiveArtboardFrame()) toast.success(t('Artboard duplicated')); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Rename Active Artboard…'), onClick: () => { if (promptRenameActiveArtboard(t('Artboard name'))) toast.success(t('Artboard renamed')); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Move Active Artboard Earlier'), onClick: () => { if (reorderActiveArtboard('previous')) toast.success(t('Artboard order updated')); else toast.warn(t('Active artboard cannot move further.')); } },
          { label: t('Move Active Artboard Later'), onClick: () => { if (reorderActiveArtboard('next')) toast.success(t('Artboard order updated')); else toast.warn(t('Active artboard cannot move further.')); } },
          { label: t('Move Active Artboard to First'), onClick: () => { if (reorderActiveArtboard('first')) toast.success(t('Artboard order updated')); else toast.warn(t('Active artboard cannot move further.')); } },
          { label: t('Move Active Artboard to Last'), onClick: () => { if (reorderActiveArtboard('last')) toast.success(t('Artboard order updated')); else toast.warn(t('Active artboard cannot move further.')); } },
          { label: t('Sort Artboards by Position'), onClick: () => { if (sortArtboardsByPosition()) toast.success(t('Artboard order updated')); else toast.warn(t('Artboard order already matches position.')); } },
          { label: t('Renumber Artboards by Position'), onClick: () => { if (renumberArtboardsByPosition(t('Artboard'))) toast.success(t('Artboards renumbered')); else toast.warn(t('Artboards already numbered by position.')); } },
          { label: t('Delete Active Artboard'), onClick: async () => { if (await showConfirm({ message: t('Delete active artboard?'), confirmLabel: t('Delete'), danger: true })) { if (deleteActiveArtboard()) toast.success(t('Artboard deleted')); else toast.warn(t('Select an object on or near an artboard first.')); } } },
          { label: t('Rearrange Artboards'), onClick: () => { const n = promptRearrangeArtboards({ columns: t('Columns'), spacing: t('Spacing'), moveArtwork: t('Move artwork? yes/no') }); if (n == null) return; if (n === -1) toast.warn(t('Invalid artboard rearrange options.')); else if (n) toast.success(t('Artboards rearranged')); else toast.warn(t('Need at least two artboards.')); } },
          { label: t('Fit Artboard to Artwork'), onClick: () => { if (!fitArtboardToContent('all')) toast.warn(t('Nothing to fit.')); } },
          { label: t('Fit Artboard to Selection'), onClick: () => { if (!fitArtboardToContent('selection')) toast.warn(t('Select something first.')); } },
          { label: t('Fit Active Artboard to Artwork'), onClick: () => { if (!fitActiveArtboardToContent('all')) toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fit Active Artboard to Selection'), onClick: () => { if (!fitActiveArtboardToContent('selection')) toast.warn(t('Select an object on or near an artboard first.')); } },
        ] },
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
        { label: t('Increase Font Size'), onClick: () => adjustTextMetric(adjustFontSize, 2), kbd: getBinding('text.fontSizeUp') },
        { label: t('Decrease Font Size'), onClick: () => adjustTextMetric(adjustFontSize, -2), kbd: getBinding('text.fontSizeDown') },
        { label: t('Increase Tracking'), onClick: () => adjustTextMetric(adjustTracking, 25), kbd: getBinding('text.trackingUp') },
        { label: t('Decrease Tracking'), onClick: () => adjustTextMetric(adjustTracking, -25), kbd: getBinding('text.trackingDown') },
        { label: t('Increase Leading'), onClick: () => adjustTextMetric(adjustLeading, 0.05), kbd: getBinding('text.leadingUp') },
        { label: t('Decrease Leading'), onClick: () => adjustTextMetric(adjustLeading, -0.05), kbd: getBinding('text.leadingDown') },
        { sep: true },
        { label: t('Single-line Text…'), onClick: () => setModal('showSingleLineText', true), kbd: getBinding('text.singleLine') },
        { label: t('Find & Replace…'), onClick: () => setModal('showFindReplace', true), kbd: getBinding('text.findReplace') },
      ]} />

      <Dropdown label={t('Effects')} items={[
        { label: t('Stylize'), sub: [
          { label: t('Outline Stroke to Fill'), onClick: () => { const n = outlineStrokeToFillSelection(); if (n) toast.success(`${n} ${t('strokes outlined')}`); else toast.warn(t('Select shapes that have a stroke first.')); } },
          { label: t('Simplify Path…'), onClick: () => openWithSelection('showSimplify') },
          { label: t('Round Corners…'), onClick: () => openWithSelection('showRoundCorners') },
          { label: t('Offset Path…'), onClick: () => openWithSelection('showOffsetPath') },
          { label: t('Roughen…'), onClick: () => openWithSelection('showRoughen') },
          { label: t('Zig Zag…'), onClick: () => openWithSelection('showZigzag') },
          { label: t('Pucker & Bloat…'), onClick: () => openWithSelection('showPucker') },
          { label: t('Twist…'), onClick: () => openWithSelection('showTwist') },
        ] },
        { label: t('Distort & Transform'), sub: [
          { label: t('Arc Warp…'), onClick: () => openWithSelection('showWarp') },
          { label: t('Surface Wrap…'), onClick: () => setModal('showSurfaceWrap', true) },
          { label: t('Envelope Distort — Make with Top Object'), onClick: () => {
            void envelopeSelection().then((r) => {
              if (r && r.reshaped > 0) toast.success(`${r.reshaped} ${t('objects reshaped into the envelope')}${r.skipped > 0 ? ` · ${r.skipped} ${t('raster images skipped')}` : ''}`, { title: t('Envelope Distort') });
              else toast.warn(t('Select the artwork plus one vector shape on top (2+ objects) — the top-most object becomes the envelope.'), { title: t('Envelope Distort') });
            });
          } },
        ] },
        { label: t('Edit Colors'), sub: [
          { label: t('Recolor Artwork…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showRecolor', true); } },
          { label: t('Invert Colors'), onClick: async () => { const n = (await import('../lib/colorAdjust')).invertColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Convert to Grayscale'), onClick: async () => { const n = (await import('../lib/colorAdjust')).grayscaleColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Saturate…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showSaturate', true); } },
          { label: t('Adjust Hue…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showHue', true); } },
          { label: t('Adjust Brightness…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showBrightness', true); } },
          { sep: true },
          { label: t('Blur'), onClick: () => applyBlur(0.08) },
          { label: t('Contrast +'), onClick: () => applyContrast(0.18) },
        ] },
        { sep: true },
        { label: t('Blend'), sub: [
          { label: t('Blend…'), onClick: () => openWithSelection('showBlend', t('Select 2 or more objects first.'), 2) },
          { label: t('Select Blend Steps'), onClick: () => { const n = selectBlendSteps(); if (n) toast.success(`${n} ${t('blend steps selected')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Select Related Blend Steps'), onClick: () => { const n = selectBlendStepsFromSelection(); if (n) toast.success(`${n} ${t('blend steps selected')}`); else toast.warn(t('Select a generated blend step or endpoint first.')); } },
          { label: t('Select Blend Endpoints'), onClick: () => { const n = selectBlendEndpointsFromSelection(); if (n) toast.success(`${n} ${t('blend endpoints selected')}`); else toast.warn(t('Select a generated blend step or endpoint first.')); } },
          { label: t('Select All Blend Endpoints'), onClick: () => { const n = selectAllBlendEndpoints(); if (n) toast.success(`${n} ${t('blend endpoints selected')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Select Blend Group'), onClick: () => { const n = selectBlendGroupFromSelection(); if (n) toast.success(`${n} ${t('blend objects selected')}`); else toast.warn(t('Select a generated blend step or endpoint first.')); } },
          { label: t('Select All Blend Groups'), onClick: () => { const n = selectAllBlendGroups(); if (n) toast.success(`${n} ${t('blend objects selected')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Select Orphan Blend Steps'), onClick: () => { const n = selectOrphanBlendSteps('document'); if (n) toast.success(`${n} ${t('orphan blend steps selected')}`); else toast.success(t('No orphan blend steps found.')); } },
          { label: t('Update Blend Steps'), onClick: () => { const n = updateBlendSteps(); if (n) toast.success(`${n} ${t('blend steps updated')}`); else toast.warn(t('Select generated blend steps or endpoints first.')); } },
          { label: t('Relink Blend Endpoint'), onClick: () => { const n = relinkBlendEndpointFromSelection(); if (n) toast.success(`${n} ${t('blend steps relinked')}`); else toast.warn(t('Select one blend endpoint and one replacement object.')); } },
          { label: t('Update All Blend Steps'), onClick: () => { const n = updateBlendSteps('document'); if (n) toast.success(`${n} ${t('blend steps updated')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Reverse Blend Steps'), onClick: () => { const n = reverseBlendSteps(); if (n) toast.success(`${n} ${t('blend steps reversed')}`); else toast.warn(t('Select generated blend steps or endpoints first.')); } },
          { label: t('Reverse All Blend Steps'), onClick: () => { const n = reverseBlendSteps('document'); if (n) toast.success(`${n} ${t('blend steps reversed')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Expand Blend Steps'), onClick: () => { const n = expandBlendSteps(); if (n) toast.success(`${n} ${t('blend steps expanded')}`); else toast.warn(t('Select generated blend steps or endpoints first.')); } },
          { label: t('Expand All Blend Steps'), onClick: () => { const n = expandBlendSteps('document'); if (n) toast.success(`${n} ${t('blend steps expanded')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Release Blend Steps'), onClick: () => { const n = releaseBlendSteps(); if (n) toast.success(`${n} ${t('blend steps released')}`); else toast.warn(t('Select generated blend steps or endpoints first.')); } },
          { label: t('Release All Blend Steps'), onClick: () => { const n = releaseBlendSteps('document'); if (n) toast.success(`${n} ${t('blend steps released')}`); else toast.warn(t('No generated blend steps found.')); } },
          { label: t('Remove Orphan Blend Steps'), onClick: () => { const n = removeOrphanBlendSteps('document'); if (n) toast.success(`${n} ${t('orphan blend steps removed')}`); else toast.success(t('No orphan blend steps found.')); } },
        ] },
        { sep: true },
        { label: t('Freeform Gradient…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showFreeformGradient', true); } },
        { label: t('Drop shadow'), sub: [
          { label: t('Soft Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 })) },
          { label: t('Hard Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.45)', blur: 0, offsetX: 5, offsetY: 5 })) },
          { label: t('Glow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(61,155,255,0.75)', blur: 16, offsetX: 0, offsetY: 0 })) },
          { sep: true },
          { label: t('Clear Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection(null)) },
          { label: t('Expand Drop Shadow'), onClick: () => { void expandDropShadowSelection().then((n) => { if (n) toast.success(`${n} ${t('drop shadows expanded')}`); else toast.warn(t('Select objects with drop shadows first.')); }); } },
        ] },
        { label: t('Pattern Fill'), sub: [
          { label: t('Checker'), onClick: () => openWithSelectionAction(() => applyPatternFill('checker', 16, '#ffffff', '#111827')) },
          { label: t('Stripes'), onClick: () => openWithSelectionAction(() => applyPatternFill('stripes', 16, '#ffffff', '#111827')) },
          { label: t('Dots'), onClick: () => openWithSelectionAction(() => applyPatternFill('dots', 16, '#ffffff', '#111827')) },
          { label: t('Crosshatch'), onClick: () => openWithSelectionAction(() => applyPatternFill('crosshatch', 16, '#ffffff', '#111827')) },
          { sep: true },
          { label: t('Clear Pattern Fill'), onClick: () => { const n = clearPatternFillSelection(); if (n) toast.success(`${n} ${t('pattern fills cleared')}`); else toast.warn(t('Select objects with pattern fills first.')); } },
          { label: t('Expand Pattern Fill'), onClick: () => { const n = expandPatternFillSelection(); if (n) toast.success(`${n} ${t('pattern fills expanded')}`); else toast.warn(t('Select objects with pattern fills first.')); } },
        ] },
        { label: t('Multi-outline…'), onClick: () => openWithSelection('showOutline') },
      ]} />

      <Dropdown label={t('Production')} width="w-64" items={[
        { label: t('Send to Plotter…'), onClick: () => setModal('showPlotter', true), kbd: getBinding('window.plotter') },
        { label: t('Cut Contour…'), onClick: () => openWithSelection('showCutContour'), kbd: getBinding('window.cutContour') },
        { label: t('Trace to Vector Art…'), onClick: () => setModal('showTraceArt', true) },
        { label: t('Production Preview…'), onClick: () => openWithSelection('showProductionPreview') },
        { label: t('Separations…'), onClick: () => setModal('showSeparations', true) },
        { label: t('Print Prep…'), onClick: openPrintPrep },
        { label: t('Tile Print…'), onClick: () => setModal('showTilePrint', true), kbd: getBinding('file.tilePrint') },
        { label: t('Add Print Marks'), onClick: () => { const n = addPrintMarksToArtboard(); if (n) toast.success(`${n} ${t('print marks added')}`); else toast.warn(t('No artboard for print marks.')); } },
        { label: t('Clear Print Marks'), onClick: () => { const n = clearPrintMarks(); if (n) toast.success(`${n} ${t('print marks cleared')}`); else toast.warn(t('No print marks.')); } },
        { label: t('Epson maintenance…'), onClick: () => setModal('showEpsonMaint', true) },
        { sep: true },
        { label: t('Auto-arrange (Nest)'), onClick: runAutoNest },
        { label: t('Nest (rotation-aware)'), onClick: runRotationNest },
        { label: t('Nest cut paths (vinyl)'), onClick: async () => (await import('../lib/cutPrepActions')).nestCutPathsVinyl(t) },
        { label: t('Nest cut paths (raster true-shape)'), onClick: async () => (await import('../lib/cutPrepActions')).nestCutPathsRaster(t) },
        { label: t('Gang Sheet Builder…'), onClick: () => setModal('showGangSheet', true) },
        { sep: true },
        { label: t('Make Sticker…'), onClick: () => openWithSelection('showMakeSticker'), kbd: getBinding('document.makeSticker') },
            { label: t('Rhinestone Template…'), onClick: () => openWithSelection('showRhinestone') },
            { label: t('Rhinestone presets'), sub: [
              { label: t('Fine stones'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterRhinestones(t, 2, 3) },
              { label: t('Standard stones'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterRhinestones(t, 2.8, 4) },
              { label: t('Bold stones'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterRhinestones(t, 4.7, 6) },
              { label: t('Custom…'), onClick: () => openWithSelection('showRhinestone') },
            ] },
        { label: t('Single-line Text…'), onClick: () => setModal('showSingleLineText', true), kbd: getBinding('text.singleLine') },
            { label: t('Variable Data…'), onClick: () => openWithSelection('showVariableData'), kbd: getBinding('text.variableData') },
        { sep: true },
        { label: t('Cut prep'), sub: [
          { label: t('Add positioning marks'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterRegistrationMarks(t) },
          {
            label: t('Weed border'),
            sub: [
              { label: t('Border only'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterWeedBorder(t) },
              { label: t('Weed rows'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterWeedBorder(t, 2, 0) },
              { label: t('Weed columns'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterWeedBorder(t, 0, 2) },
              { label: t('2×2'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterWeedBorder(t, 2, 2) },
              { label: t('3×2'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterWeedBorder(t, 3, 2) },
            ],
          },
          {
            label: t('Bridges'),
            sub: [
              { label: t('Light'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterBridges(t, 2, 0.6) },
              { label: t('Standard'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterBridges(t, 4, 1) },
              { label: t('Heavy'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterBridges(t, 6, 1.5) },
            ],
          },
          {
            label: t('Banner Grommet presets'),
            sub: [
              { label: t('Small banner'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterGrommets(t, 15, 300, 8) },
              { label: t('Standard banner'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterGrommets(t, 20, 500, 10) },
              { label: t('Large banner'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterGrommets(t, 25, 750, 12) },
              { label: t('Custom…'), onClick: () => openWithSelection('showGrommets') },
            ],
          },
          { label: t('Save Test Cut File'), onClick: async () => (await import('../lib/cutPrepActions')).savePlotterTestCut(t) },
          { sep: true },
          { label: t('Clear positioning marks'), onClick: async () => (await import('../lib/cutPrepActions')).clearPlotterRegistrationMarks(t) },
          { label: t('Clear weed borders'), onClick: async () => (await import('../lib/cutPrepActions')).clearPlotterWeedBorders(t) },
          { label: t('Clear bridges'), onClick: async () => (await import('../lib/cutPrepActions')).clearPlotterBridges(t) },
          { label: t('Clear contour'), onClick: () => clearCutKind('outline'), disabled: contourCutCount === 0 },
          { label: t('Clear trace'), onClick: () => clearCutKind('trace'), disabled: traceCutCount === 0 },
          { label: t('Clear regmarks'), onClick: () => clearCutKind('regmark'), disabled: regmarkCutCount === 0 },
          { label: t('Clear cut paths'), onClick: () => clearCutJob(), disabled: cutPathCount === 0 },
        ] },
        { sep: true },
        { label: t('Proof'), sub: [
          { label: t('Add selection margin frame'), onClick: async () => { const raw = window.prompt(t('Set selection margin frame in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); if ((await import('../lib/tools/measureTool')).addSelectionMarginFrame(marginMm)) toast.success(t('Margin frame added')); else toast.warn(Number.isFinite(marginMm) ? t('Select something first.') : t('Invalid margin value.')); } },
          { label: t('Add selection inset frame'), onClick: async () => { const raw = window.prompt(t('Set selection inset frame in mm'), '5'); if (raw == null) return; const insetMm = Number(raw); if ((await import('../lib/tools/measureTool')).addSelectionInsetFrame(insetMm)) toast.success(t('Inset frame added')); else toast.warn(Number.isFinite(insetMm) ? t('Select something first.') : t('Invalid inset value.')); } },
          { sep: true },
          { label: t('Lock measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).lockMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations locked')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Unlock measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).unlockMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations unlocked')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Hide measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).hideMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations hidden')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Show measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).showMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations shown')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Bring measure annotations to front'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).bringMeasureAnnotationsToFront(); if (n) toast.success(`${n} ${t('measure annotations brought to front')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Prepare measure annotations for proof'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).proofMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations proof-ready')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Edit measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).editMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations editable')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Duplicate measure annotations to selection'), onClick: async () => { const n = await (await import('../lib/tools/measureTool')).duplicateMeasureAnnotationsToSelection(); if (n) toast.success(`${n} ${t('measure annotations duplicated')}`); else toast.warn(t('Select artwork and keep measure annotations.')); } },
          { sep: true },
          { label: t('Make guides from measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).makeGuidesFromMeasureAnnotations(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Make margin guides from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure guide margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); const n = (await import('../lib/tools/measureTool')).makeMarginGuidesFromMeasureAnnotations(marginMm); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
          { label: t('Make center guides from measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).makeCenterGuidesFromMeasureAnnotations(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Make full guide set from measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).makeFullGuidesFromMeasureAnnotations(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Make margin full guide set from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure guide margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); const n = (await import('../lib/tools/measureTool')).makeMarginFullGuidesFromMeasureAnnotations(marginMm); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
          { sep: true },
          { label: t('Add print marks from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure print bleed in mm'), '3'); if (raw == null) return; const bleedMm = Number(raw); const n = (await import('../lib/tools/measureTool')).addPrintMarksFromMeasureAnnotations(bleedMm); if (n) toast.success(`${n} ${t('print marks added')}`); else toast.warn(Number.isFinite(bleedMm) ? t('No measure annotations.') : t('Invalid bleed value.')); } },
          { label: t('Add cut contour from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (raw == null) return; const offsetMm = Number(raw); const n = (await import('../lib/tools/measureTool')).addCutContourFromMeasureAnnotations(offsetMm); if (n) toast.success(`${n} ${t('contour(s) added')}`); else toast.warn(Number.isFinite(offsetMm) ? t('No measure annotations.') : t('Invalid offset value.')); } },
          { label: t('Add bridged cut contour from measure annotations'), onClick: async () => { const offsetRaw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (offsetRaw == null) return; const countRaw = window.prompt(t('Set measure bridge count'), '4'); if (countRaw == null) return; const gapRaw = window.prompt(t('Set measure bridge gap in mm'), '1'); if (gapRaw == null) return; const offsetMm = Number(offsetRaw); const count = Number(countRaw); const gapMm = Number(gapRaw); const n = (await import('../lib/tools/measureTool')).addBridgedCutContourFromMeasureAnnotations(offsetMm, count, gapMm); if (n) toast.success(`${n} ${t('bridged contours added')}`); else toast.warn(Number.isFinite(offsetMm) && Number.isFinite(count) && Number.isFinite(gapMm) ? t('No measure annotations.') : t('Invalid bridge value.')); } },
          { label: t('Add positioning marks from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure positioning mark offset in mm'), '5'); if (raw == null) return; const offsetMm = Number(raw); const n = (await import('../lib/tools/measureTool')).addRegistrationMarksFromMeasureAnnotations(offsetMm); if (n) toast.success(t('4-corner registration marks added.')); else toast.warn(Number.isFinite(offsetMm) ? t('No measure annotations.') : t('Invalid offset value.')); } },
          { label: t('Add weed border from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure weed margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); const n = (await import('../lib/tools/measureTool')).addWeedBorderFromMeasureAnnotations(marginMm); if (n) toast.success(t('Weed border added.')); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
          { label: t('Add weed grid from measure annotations'), onClick: async () => { const marginRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (marginRaw == null) return; const rowsRaw = window.prompt(t('Set measure weed rows'), '1'); if (rowsRaw == null) return; const colsRaw = window.prompt(t('Set measure weed columns'), '1'); if (colsRaw == null) return; const marginMm = Number(marginRaw); const rows = Number(rowsRaw); const cols = Number(colsRaw); const n = (await import('../lib/tools/measureTool')).addWeedBorderFromMeasureAnnotations(marginMm, rows, cols); if (n) toast.success(t('Weed grid added.')); else toast.warn(Number.isFinite(marginMm) && Number.isFinite(rows) && Number.isFinite(cols) ? t('No measure annotations.') : t('Invalid weed grid value.')); } },
          { label: t('Add grommets from measure annotations'), onClick: async () => { const insetRaw = window.prompt(t('Set measure grommet inset in mm'), '20'); if (insetRaw == null) return; const spacingRaw = window.prompt(t('Set measure grommet max spacing in mm'), '500'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure grommet diameter in mm'), '10'); if (diameterRaw == null) return; const insetMm = Number(insetRaw); const spacingMm = Number(spacingRaw); const diameterMm = Number(diameterRaw); const n = (await import('../lib/tools/measureTool')).addGrommetsFromMeasureAnnotations(insetMm, spacingMm, diameterMm); if (n) toast.success(`${n} ${t('grommets added')}`); else toast.warn(Number.isFinite(insetMm) && Number.isFinite(spacingMm) && Number.isFinite(diameterMm) ? t('No measure annotations.') : t('Invalid grommet value.')); } },
          { label: t('Add rhinestones from measure annotations'), onClick: async () => { const spacingRaw = window.prompt(t('Set measure rhinestone spacing in mm'), '4'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure rhinestone diameter in mm'), '2.8'); if (diameterRaw == null) return; const spacingMm = Number(spacingRaw); const diameterMm = Number(diameterRaw); const n = (await import('../lib/tools/measureTool')).addRhinestonesFromMeasureAnnotations(spacingMm, diameterMm); if (n) toast.success(`${n} ${t('stones placed')}`); else toast.warn(Number.isFinite(spacingMm) && Number.isFinite(diameterMm) ? t('No measure annotations.') : t('Invalid rhinestone value.')); } },
          { label: t('Prepare print and cut from measure annotations'), onClick: async () => { const bleedRaw = window.prompt(t('Set measure print bleed in mm'), '3'); if (bleedRaw == null) return; const contourRaw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (contourRaw == null) return; const regRaw = window.prompt(t('Set measure positioning mark offset in mm'), '5'); if (regRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const result = (await import('../lib/tools/measureTool')).preparePrintAndCutFromMeasureAnnotations(Number(bleedRaw), Number(contourRaw), Number(regRaw), Number(weedRaw)); if (result) toast.success(`${result.printMarks} ${t('print marks added')} · ${result.cutPaths} ${t('cut paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid print and cut prep value.')); } },
          { label: t('Prepare banner finishing from measure annotations'), onClick: async () => { const insetRaw = window.prompt(t('Set measure grommet inset in mm'), '20'); if (insetRaw == null) return; const spacingRaw = window.prompt(t('Set measure grommet max spacing in mm'), '500'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure grommet diameter in mm'), '10'); if (diameterRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const rowsRaw = window.prompt(t('Set measure weed rows'), '0'); if (rowsRaw == null) return; const colsRaw = window.prompt(t('Set measure weed columns'), '0'); if (colsRaw == null) return; const result = (await import('../lib/tools/measureTool')).prepareBannerFinishingFromMeasureAnnotations(Number(insetRaw), Number(spacingRaw), Number(diameterRaw), Number(weedRaw), Number(rowsRaw), Number(colsRaw)); if (result) toast.success(`${result.grommets} ${t('grommets added')} · ${result.weedPaths} ${t('weed paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid banner finishing value.')); } },
          { label: t('Prepare stencil cut from measure annotations'), onClick: async () => { const offsetRaw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (offsetRaw == null) return; const countRaw = window.prompt(t('Set measure bridge count'), '4'); if (countRaw == null) return; const gapRaw = window.prompt(t('Set measure bridge gap in mm'), '1'); if (gapRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const rowsRaw = window.prompt(t('Set measure weed rows'), '1'); if (rowsRaw == null) return; const colsRaw = window.prompt(t('Set measure weed columns'), '1'); if (colsRaw == null) return; const result = (await import('../lib/tools/measureTool')).prepareStencilCutFromMeasureAnnotations(Number(offsetRaw), Number(countRaw), Number(gapRaw), Number(weedRaw), Number(rowsRaw), Number(colsRaw)); if (result) toast.success(`${result.bridgedContours} ${t('bridged contours added')} · ${result.weedPaths} ${t('weed paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid stencil cut value.')); } },
          { label: t('Prepare rhinestone template from measure annotations'), onClick: async () => { const spacingRaw = window.prompt(t('Set measure rhinestone spacing in mm'), '4'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure rhinestone diameter in mm'), '2.8'); if (diameterRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const result = (await import('../lib/tools/measureTool')).prepareRhinestoneTemplateFromMeasureAnnotations(Number(spacingRaw), Number(diameterRaw), Number(weedRaw)); if (result) toast.success(`${result.stones} ${t('stones placed')} · ${result.weedPaths} ${t('weed paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid rhinestone template value.')); } },
          { sep: true },
          { label: t('Prepare proof page from measure annotations'), onClick: async () => { const marginRaw = window.prompt(t('Set measure proof page margin in mm'), '5'); if (marginRaw == null) return; const bleedRaw = window.prompt(t('Set measure print bleed in mm'), '3'); if (bleedRaw == null) return; const result = (await import('../lib/tools/measureProof')).prepareProofPageFromMeasureAnnotations(Number(marginRaw), Number(bleedRaw)); if (result) toast.success(`${t('Artboard added')} · ${result.printMarks} ${t('print marks added')} · ${result.proofFrames} ${t('proof frames added')} · ${result.proofLabels} ${t('proof labels added')} · ${result.proofLegends} ${t('proof legends added')} · ${result.proofChecklists} ${t('proof checklists added')} · ${result.proofApprovalStamps} ${t('proof approval stamps added')} · ${result.proofColorBars} ${t('proof color bars added')} · ${result.proofScales} ${t('proof scales added')} · ${result.proofJobInfos} ${t('proof job info panels added')} · ${result.proofFilenames} ${t('proof filename labels added')} · ${result.proofPreflights} ${t('proof preflight summaries added')} · ${result.proofSpecs} ${t('proof specs panels added')} · ${result.proofSafetyNotes} ${t('proof safety notes added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid proof page value.')); } },
          { label: t('Prepare proof pages from measure annotations'), onClick: async () => { const marginRaw = window.prompt(t('Set measure proof page margin in mm'), '5'); if (marginRaw == null) return; const bleedRaw = window.prompt(t('Set measure print bleed in mm'), '3'); if (bleedRaw == null) return; const result = (await import('../lib/tools/measureProof')).prepareProofPagesFromMeasureAnnotations(Number(marginRaw), Number(bleedRaw)); if (result) toast.success(`${result.artboards} ${t('artboards added')} · ${result.printMarks} ${t('print marks added')} · ${result.proofFrames} ${t('proof frames added')} · ${result.proofLabels} ${t('proof labels added')} · ${result.proofLegends} ${t('proof legends added')} · ${result.proofChecklists} ${t('proof checklists added')} · ${result.proofApprovalStamps} ${t('proof approval stamps added')} · ${result.proofColorBars} ${t('proof color bars added')} · ${result.proofScales} ${t('proof scales added')} · ${result.proofJobInfos} ${t('proof job info panels added')} · ${result.proofFilenames} ${t('proof filename labels added')} · ${result.proofPreflights} ${t('proof preflight summaries added')} · ${result.proofSpecs} ${t('proof specs panels added')} · ${result.proofSafetyNotes} ${t('proof safety notes added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid proof pages value.')); } },
          { label: t('Make artboard from measure annotations'), onClick: async () => { if ((await import('../lib/tools/measureTool')).makeArtboardFromMeasureAnnotations()) toast.success(t('Artboard added')); else toast.warn(t('No measure annotations.')); } },
          { label: t('Make margin artboard from measure annotations'), onClick: async () => { const raw = window.prompt(t('Set measure artboard margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); if ((await import('../lib/tools/measureTool')).makeMarginArtboardFromMeasureAnnotations(marginMm)) toast.success(t('Artboard added')); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
          { label: t('Resize artboard to measure annotations'), onClick: async () => { if ((await import('../lib/tools/measureTool')).resizeArtboardToMeasureAnnotations()) toast.success(t('Artboard resized')); else toast.warn(t('No measure annotations.')); } },
          { label: t('Resize artboard to measure annotations with margin'), onClick: async () => { const raw = window.prompt(t('Set measure artboard margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); if ((await import('../lib/tools/measureTool')).resizeArtboardToMeasureAnnotations(marginMm)) toast.success(t('Artboard resized')); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
          { sep: true },
          { label: t('Add measure proof manifest'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofManifest(); if (n) toast.success(`${n} ${t('proof manifests updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof revision history'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofRevisionHistory(); if (n) toast.success(`${n} ${t('proof revision histories updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof approval audit'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofApprovalAudit(); if (n) toast.success(`${n} ${t('proof approval audits updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof package cover'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofPackageCover(); if (n) toast.success(`${n} ${t('proof package covers updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof delivery checklist'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofDeliveryChecklist(); if (n) toast.success(`${n} ${t('proof delivery checklists updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof release stamp'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofReleaseStamp(); if (n) toast.success(`${n} ${t('proof release stamps updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof package index'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofPackageIndex(); if (n) toast.success(`${n} ${t('proof package indexes updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Add measure proof delivery contact'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofDeliveryContact(); if (n) toast.success(`${n} ${t('proof delivery contacts updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof delivery contact'), onClick: async () => { const client = window.prompt(t('Set measure proof client'), ''); if (client == null) return; const contact = window.prompt(t('Set measure proof contact name'), ''); if (contact == null) return; const email = window.prompt(t('Set measure proof contact email'), ''); if (email == null) return; const phone = window.prompt(t('Set measure proof contact phone'), ''); if (phone == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofDeliveryContact({ client, contact, email, phone }); if (n) toast.success(`${n} ${t('proof delivery contacts updated')}`); else toast.warn(t('No measure proof delivery contact panels.')); } },
          { label: t('Add measure proof delivery schedule'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofDeliverySchedule(); if (n) toast.success(`${n} ${t('proof delivery schedules updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof delivery schedule'), onClick: async () => { const due = window.prompt(t('Set measure proof due date'), ''); if (due == null) return; const ship = window.prompt(t('Set measure proof ship date'), ''); if (ship == null) return; const method = window.prompt(t('Set measure proof delivery method'), ''); if (method == null) return; const notes = window.prompt(t('Set measure proof delivery notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofDeliverySchedule({ due, ship, method, notes }); if (n) toast.success(`${n} ${t('proof delivery schedules updated')}`); else toast.warn(t('No measure proof delivery schedule panels.')); } },
          { label: t('Add measure proof delivery route'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofDeliveryRoute(); if (n) toast.success(`${n} ${t('proof delivery routes updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof delivery route'), onClick: async () => { const carrier = window.prompt(t('Set measure proof route carrier'), ''); if (carrier == null) return; const service = window.prompt(t('Set measure proof route service'), ''); if (service == null) return; const account = window.prompt(t('Set measure proof route account'), ''); if (account == null) return; const address = window.prompt(t('Set measure proof route address'), ''); if (address == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofDeliveryRoute({ carrier, service, account, address }); if (n) toast.success(`${n} ${t('proof delivery routes updated')}`); else toast.warn(t('No measure proof delivery route panels.')); } },
          { label: t('Add measure proof fulfillment handoff'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofFulfillmentHandoff(); if (n) toast.success(`${n} ${t('proof fulfillment handoffs updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof fulfillment handoff'), onClick: async () => { const quantity = window.prompt(t('Set measure proof fulfillment quantity'), ''); if (quantity == null) return; const packaging = window.prompt(t('Set measure proof fulfillment packaging'), ''); if (packaging == null) return; const owner = window.prompt(t('Set measure proof fulfillment owner'), ''); if (owner == null) return; const tracking = window.prompt(t('Set measure proof fulfillment tracking'), ''); if (tracking == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofFulfillmentHandoff({ quantity, packaging, owner, tracking }); if (n) toast.success(`${n} ${t('proof fulfillment handoffs updated')}`); else toast.warn(t('No measure proof fulfillment handoff panels.')); } },
          { label: t('Add measure proof install handoff'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofInstallHandoff(); if (n) toast.success(`${n} ${t('proof install handoffs updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof install handoff'), onClick: async () => { const installer = window.prompt(t('Set measure proof install installer'), ''); if (installer == null) return; const date = window.prompt(t('Set measure proof install date'), ''); if (date == null) return; const site = window.prompt(t('Set measure proof install site'), ''); if (site == null) return; const notes = window.prompt(t('Set measure proof install notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofInstallHandoff({ installer, date, site, notes }); if (n) toast.success(`${n} ${t('proof install handoffs updated')}`); else toast.warn(t('No measure proof install handoff panels.')); } },
          { label: t('Add measure proof site readiness'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofSiteReadiness(); if (n) toast.success(`${n} ${t('proof site readiness panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof site readiness'), onClick: async () => { const permit = window.prompt(t('Set measure proof site permit'), ''); if (permit == null) return; const access = window.prompt(t('Set measure proof site access'), ''); if (access == null) return; const power = window.prompt(t('Set measure proof site power'), ''); if (power == null) return; const risks = window.prompt(t('Set measure proof site risks'), ''); if (risks == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofSiteReadiness({ permit, access, power, risks }); if (n) toast.success(`${n} ${t('proof site readiness panels updated')}`); else toast.warn(t('No measure proof site readiness panels.')); } },
          { label: t('Add measure proof install punch list'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofInstallPunchList(); if (n) toast.success(`${n} ${t('proof install punch lists updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof install punch list'), onClick: async () => { const open = window.prompt(t('Set measure proof punch list open items'), ''); if (open == null) return; const owner = window.prompt(t('Set measure proof punch list owner'), ''); if (owner == null) return; const due = window.prompt(t('Set measure proof punch list due date'), ''); if (due == null) return; const resolution = window.prompt(t('Set measure proof punch list resolution'), ''); if (resolution == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofInstallPunchList({ open, owner, due, resolution }); if (n) toast.success(`${n} ${t('proof install punch lists updated')}`); else toast.warn(t('No measure proof install punch list panels.')); } },
          { label: t('Add measure proof client acceptance'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofClientAcceptance(); if (n) toast.success(`${n} ${t('proof client acceptances updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof client acceptance'), onClick: async () => { const acceptedBy = window.prompt(t('Set measure proof accepted by'), ''); if (acceptedBy == null) return; const date = window.prompt(t('Set measure proof acceptance date'), ''); if (date == null) return; const status = window.prompt(t('Set measure proof acceptance status'), ''); if (status == null) return; const notes = window.prompt(t('Set measure proof acceptance notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofClientAcceptance({ acceptedBy, date, status, notes }); if (n) toast.success(`${n} ${t('proof client acceptances updated')}`); else toast.warn(t('No measure proof client acceptance panels.')); } },
          { label: t('Add measure proof warranty info'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofWarrantyInfo(); if (n) toast.success(`${n} ${t('proof warranty info panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof warranty info'), onClick: async () => { const term = window.prompt(t('Set measure proof warranty term'), ''); if (term == null) return; const coverage = window.prompt(t('Set measure proof warranty coverage'), ''); if (coverage == null) return; const contact = window.prompt(t('Set measure proof warranty contact'), ''); if (contact == null) return; const notes = window.prompt(t('Set measure proof warranty notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofWarrantyInfo({ term, coverage, contact, notes }); if (n) toast.success(`${n} ${t('proof warranty info panels updated')}`); else toast.warn(t('No measure proof warranty info panels.')); } },
          { label: t('Add measure proof care instructions'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofCareInstructions(); if (n) toast.success(`${n} ${t('proof care instruction panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof care instructions'), onClick: async () => { const cleaning = window.prompt(t('Set measure proof care cleaning'), ''); if (cleaning == null) return; const chemicals = window.prompt(t('Set measure proof care chemicals'), ''); if (chemicals == null) return; const inspection = window.prompt(t('Set measure proof care inspection'), ''); if (inspection == null) return; const notes = window.prompt(t('Set measure proof care notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofCareInstructions({ cleaning, chemicals, inspection, notes }); if (n) toast.success(`${n} ${t('proof care instruction panels updated')}`); else toast.warn(t('No measure proof care instruction panels.')); } },
          { label: t('Add measure proof asset archive'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofAssetArchive(); if (n) toast.success(`${n} ${t('proof asset archive panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof asset archive'), onClick: async () => { const source = window.prompt(t('Set measure proof archive source'), ''); if (source == null) return; const exports = window.prompt(t('Set measure proof archive exports'), ''); if (exports == null) return; const photos = window.prompt(t('Set measure proof archive photos'), ''); if (photos == null) return; const notes = window.prompt(t('Set measure proof archive notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofAssetArchive({ source, exports, photos, notes }); if (n) toast.success(`${n} ${t('proof asset archive panels updated')}`); else toast.warn(t('No measure proof asset archive panels.')); } },
          { label: t('Add measure proof file verification'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).addMeasureProofFileVerification(); if (n) toast.success(`${n} ${t('proof file verification panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
          { label: t('Set measure proof file verification'), onClick: async () => { const version = window.prompt(t('Set measure proof verification version'), ''); if (version == null) return; const checksum = window.prompt(t('Set measure proof verification checksum'), ''); if (checksum == null) return; const reviewed = window.prompt(t('Set measure proof verification reviewed'), ''); if (reviewed == null) return; const notes = window.prompt(t('Set measure proof verification notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofFileVerification({ version, checksum, reviewed, notes }); if (n) toast.success(`${n} ${t('proof file verification panels updated')}`); else toast.warn(t('No measure proof file verification panels.')); } },
          { label: t('Set measure proof job information'), onClick: async () => { const job = window.prompt(t('Set measure proof job name'), ''); if (job == null) return; const revision = window.prompt(t('Set measure proof revision'), ''); if (revision == null) return; const prepared = window.prompt(t('Set measure proof prepared by'), ''); if (prepared == null) return; const notes = window.prompt(t('Set measure proof notes'), ''); if (notes == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofJobInfo({ job, revision, prepared, notes }); if (n) toast.success(`${n} ${t('proof job info panels updated')}`); else toast.warn(t('No measure proof job info panels.')); } },
          { label: t('Set measure proof signoff'), onClick: async () => { const signer = window.prompt(t('Set measure proof signer'), ''); if (signer == null) return; const date = window.prompt(t('Set measure proof signoff date'), ''); if (date == null) return; const note = window.prompt(t('Set measure proof signoff note'), ''); if (note == null) return; const n = (await import('../lib/tools/measureProof')).setMeasureProofSignoff({ signer, date, note }); if (n) toast.success(`${n} ${t('proof signoffs updated')}`); else toast.warn(t('No measure proof checklists.')); } },
          { sep: true },
          { label: t('Select draft measure proof objects'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).selectMeasureProofObjectsByStatus('draft'); if (n) toast.success(`${n} ${t('proof objects selected')}`); else toast.warn(t('No matching measure proof objects.')); } },
          { label: t('Select approved measure proof objects'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).selectMeasureProofObjectsByStatus('approved'); if (n) toast.success(`${n} ${t('proof objects selected')}`); else toast.warn(t('No matching measure proof objects.')); } },
          { label: t('Select changes-required measure proof objects'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).selectMeasureProofObjectsByStatus('changes'); if (n) toast.success(`${n} ${t('proof objects selected')}`); else toast.warn(t('No matching measure proof objects.')); } },
          { label: t('Select measure proof delivery blockers'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).selectMeasureProofDeliveryBlockers(); if (n) toast.success(`${n} ${t('proof blockers selected')}`); else toast.warn(t('No measure proof blockers.')); } },
          { label: t('Mark proof sheet as draft'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).setMeasureProofApprovalStatus('draft'); if (n) toast.success(`${n} ${t('proof approval stamps updated')}`); else toast.warn(t('No measure proof approval stamps.')); } },
          { label: t('Mark proof sheet as approved'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).setMeasureProofApprovalStatus('approved'); if (n) toast.success(`${n} ${t('proof approval stamps updated')}`); else toast.warn(t('No measure proof approval stamps.')); } },
          { label: t('Mark proof sheet as changes required'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).setMeasureProofApprovalStatus('changes'); if (n) toast.success(`${n} ${t('proof approval stamps updated')}`); else toast.warn(t('No measure proof approval stamps.')); } },
          { label: t('Clear measure proof sheet objects'), onClick: async () => { const n = (await import('../lib/tools/measureProof')).clearMeasureProofSheetObjects(); if (n) toast.success(`${n} ${t('proof sheet objects cleared')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        ] },
      ]} />

      <Dropdown label={t('View')} items={[
        { label: t('Zoom In'), onClick: () => zoomBy(1.25), kbd: getBinding('view.zoomIn') },
        { label: t('Zoom Out'), onClick: () => zoomBy(1 / 1.25), kbd: getBinding('view.zoomOut') },
        { label: t('Actual Size'), onClick: () => zoomToPercent(100), kbd: getBinding('view.actualSize') },
        { label: t('Fit to Page'), onClick: () => zoomFit(), kbd: getBinding('view.zoomFit') },
        { label: t('Fit All Artboards in Window'), onClick: () => { if (!zoomToAllArtboards()) toast.warn(t('No artboards to navigate.')); } },
        { label: t('Zoom to Active Artboard'), onClick: () => { if (!zoomToActiveArtboard()) toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Previous Artboard'), onClick: () => { if (!zoomToAdjacentArtboard(-1)) toast.warn(t('No artboards to navigate.')); } },
        { label: t('Next Artboard'), onClick: () => { if (!zoomToAdjacentArtboard(1)) toast.warn(t('No artboards to navigate.')); } },
        { label: t('Zoom to Selection'), onClick: () => { if (!zoomToSelection()) toast.warn(t('Select something first.')); }, kbd: getBinding('view.zoomSelection') },
        { sep: true },
        { label: t('Outline View'), onClick: () => setOutlineMode(!outlineMode), kbd: getBinding('view.outline'), checked: outlineMode },
        { sep: true },
        { label: t('Measure'), sub: [
          { label: t('Pin measurement as dimension'), onClick: async () => { if ((await import('../lib/tools/measureTool')).commitDimension()) toast.success(t('Dimension added')); else toast.warn(t('No measurement to pin.')); }, kbd: 'Enter' },
          { label: t('Add selection dimensions'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).addSelectionDimensions(); if (n) toast.success(`${n} ${t('dimensions added')}`); else toast.warn(t('Select something first.')); } },
          { label: t('Add selection area label'), onClick: async () => { if ((await import('../lib/tools/measureTool')).addSelectionAreaLabel()) toast.success(t('Area label added')); else toast.warn(t('Select something first.')); } },
          { label: t('Add selection center mark'), onClick: async () => { if ((await import('../lib/tools/measureTool')).addSelectionCenterMark()) toast.success(t('Center mark added')); else toast.warn(t('Select something first.')); } },
          { label: t('Add selection corner marks'), onClick: async () => { if ((await import('../lib/tools/measureTool')).addSelectionCornerMarks()) toast.success(t('Corner marks added')); else toast.warn(t('Select something first.')); } },
          { label: t('Add production mark set'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).addSelectionProductionMarks(); if (n) toast.success(`${n} ${t('production mark sets added')}`); else toast.warn(t('Select something first.')); } },
          { label: t('Select measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).selectMeasureAnnotations(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No measure annotations.')); } },
          { label: t('Clear measure annotations'), onClick: async () => { const n = (await import('../lib/tools/measureTool')).clearMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations cleared')}`); else toast.warn(t('No measure annotations.')); } },
        ] },
        { label: t('Show Rulers'), onClick: () => setRulersVisible(!rulersVisible), checked: rulersVisible },
        { label: t('Show Grid'), onClick: () => setGridVisible(!gridVisible), checked: gridVisible },
        { label: t('Snap to Grid'), onClick: () => setSnapEnabled(!snapEnabled), checked: snapEnabled },
        { label: t('Smart Guides'), onClick: () => setSmartGuidesEnabled(!smartGuidesEnabled), checked: smartGuidesEnabled },
        { label: t('Anchor Snap'), onClick: () => setAnchorSnapEnabled(!anchorSnapEnabled), checked: anchorSnapEnabled },
        { sep: true },
        { label: t('Make Guides from Selection'), onClick: () => { const n = makeGuidesFromSelection(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('Select something first.')); } },
        { label: t('Margin Guides…'), onClick: () => setModal('showMarginGuides', true) },
        { label: t('Release Guides'), onClick: () => { const n = releaseGuides(); if (n) toast.success(`${n} ${t('guides released')}`); else toast.warn(t('No guides to release.')); } },
        { label: t('Show Guides'), onClick: () => { const s = useEditor.getState(); s.setGuidesVisible(!s.guidesVisible); }, checked: guidesVisible, kbd: getBinding('view.toggleGuides') },
        { label: t('Lock Guides'), onClick: () => useEditor.getState().setGuidesLocked(!useEditor.getState().guidesLocked), checked: guidesLocked },
        { label: t('Clear Guides'), onClick: () => useEditor.getState().clearUserGuides() },
      ]} />

      <Dropdown label={t('Insert')} items={[
        { label: t('Star / Polygon…'), onClick: () => setModal('showStar', true) },
        { label: t('Split Into Grid…'), onClick: () => setModal('showSplitGrid', true) },
        { label: t('Repeat (Grid / Radial / Mirror)…'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showRepeat', true); } },
        { sep: true },
        // Image intake doubles as an insert (same handler as File > Import).
        { label: t('Import Image…'), onClick: () => imageRef.current?.click(), kbd: getBinding('file.importImage') },
        { label: t('Import PDF…'), onClick: () => pdfRef.current?.click() },
      ]} />

      <Dropdown label={t('Help')} items={[
        { label: t('Help Center…'), onClick: () => setModal('showHelpCenter', true), kbd: getBinding('help.helpCenter') },
        { label: t('Command Palette…'), onClick: () => setModal('showCommandPalette', true), kbd: getBinding('window.commandPalette') },
        { label: t('Preferences…'), onClick: () => setModal('showPreferences', true), kbd: getBinding('window.preferences') },
        { label: t('Onboarding…'), onClick: () => { resetOnboarding(); onShowOnboarding(); } },
        { label: t('Keyboard Shortcuts'), onClick: () => setModal('showShortcuts', true), kbd: getBinding('help.shortcuts') },
        { label: t('Customize Shortcuts…'), onClick: () => setModal('showKeymapEditor', true) },
        { sep: true },
        // In-app install entry — conditional because `beforeinstallprompt`
        // never fires on Safari / already-installed / Tauri / Electron
        // sessions, and a dead menu item would be worse than none.
        ...(installable ? [{ label: t('Install Anchorworks…'), onClick: () => { void promptInstall(); } }] : []),
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
        // Error log lives next to the debug panel: same "support & diagnose"
        // cluster, but useful to end users reporting a bug, not just devs.
        { label: t('Error Log…'), onClick: () => openErrorLogDialog() },
        { label: t('About'), onClick: () => setShowAbout(true) },
      ]} />
      </div>

      <span className="topbar-sep" aria-hidden="true" />
      <div
        className="flex items-center gap-1 shrink-0"
        role="toolbar"
        aria-label={t('History actions')}
        title={t('Use arrow keys to review top bar actions')}
        onKeyDown={handleTopbarActionKeys}
      >
        <IconBtn data-topbar-action title={`${t('Undo')} (${getBinding('edit.undo')})`} aria-label={t('Undo')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('edit.undo'))} onClick={() => undo()} disabled={!canUndo}><Undo2 size={14} aria-hidden="true" /></IconBtn>
        <IconBtn data-topbar-action title={`${t('Redo')} (${getBinding('edit.redo')} / ${getBinding('edit.redoShift')})`} aria-label={t('Redo')} aria-keyshortcuts={ariaKeyshortcuts(`${getBinding('edit.redo')} ${getBinding('edit.redoShift')}`)} onClick={() => redo()} disabled={!canRedo}><Redo2 size={14} aria-hidden="true" /></IconBtn>
      </div>

      <span className="topbar-sep" aria-hidden="true" />
      {/* Grid / Snap / Guides / Anchor moved out of the topbar (wave 5
          declutter): the StatusBar pips and the View menu are the two
          remaining, always-available entry points for these toggles. */}

      {/* Right cluster — min-w-0 (not shrink-0) so it shares width
          pressure with the menu strip: the output-actions toolbar inside
          already carries the min-width:0 + overflow-x:auto pattern
          (index.css), and without min-w-0 here its automatic minimum
          would push 100% of the shrink onto the menus (measured: menu
          strip collapsed to 0px at 1440px). */}
      <div className="ml-auto flex items-center gap-2 min-w-0">
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
          {/* Wave-5 declutter: the old strip exposed 16 always-visible
              buttons and scrolled horizontally — now the two highest-traffic
              actions stay one-click and everything else folds into the
              grouped "More…" dropdown below (all still ≤2 clicks away). */}
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Send to Plotter…')} (${getBinding('window.plotter')})`} aria-label={t('Send to Plotter…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('window.plotter'))} onClick={() => setModal('showPlotter', true)}>
            <Send size={12} aria-hidden="true" />{t('Plotter')}
          </button>
          <button type="button" data-topbar-action className="btn flex items-center gap-1" title={`${t('Print…')} (${getBinding('file.print')})`} aria-label={t('Print…')} aria-keyshortcuts={ariaKeyshortcuts(getBinding('file.print'))} onClick={() => setModal('showPrint', true)}>
            <Printer size={12} aria-hidden="true" />{t('Print')}
          </button>
          {/* role=group keeps the dropdown markup grouped for the roving
              toolbar semantics; the trigger itself renders as a plain
              button (see Dropdown's triggerRole note). */}
          <span role="group" className="inline-flex">
            <Dropdown
              label={t('More…')}
              width="w-64"
              triggerRole="button"
              triggerProps={{ 'data-topbar-action': true, className: 'btn flex items-center gap-1' }}
              items={[
              { label: t('Cut Contour…'), onClick: () => openWithSelection('showCutContour'), kbd: getBinding('window.cutContour') },
              { label: `${t('Reg')} — ${t('Add positioning marks')}`, onClick: async () => (await import('../lib/cutPrepActions')).addPlotterRegistrationMarks(t) },
              { label: t('Weed border'), onClick: async () => (await import('../lib/cutPrepActions')).addPlotterWeedBorder(t) },
              { label: `${t('Bridge')} — ${t('Standard')}`, onClick: async () => { (await import('../lib/cutPrepActions')).addPlotterBridges(t, 4, 1); } },
              { label: t('Clear bridges'), onClick: async () => { (await import('../lib/cutPrepActions')).clearPlotterBridges(t); } },
              { label: t('Banner Grommets…'), onClick: () => openWithSelection('showGrommets') },
              { label: t('Save Test Cut File'), onClick: async () => (await import('../lib/cutPrepActions')).savePlotterTestCut(t) },
              { sep: true },
              { label: t('Auto-arrange (Nest)'), onClick: runAutoNest },
              { label: t('Rhinestone Template…'), onClick: () => openWithSelection('showRhinestone') },
              { label: t('Variable Data…'), onClick: () => openWithSelection('showVariableData'), kbd: getBinding('text.variableData') },
              { sep: true },
              { label: t('Print Prep…'), onClick: openPrintPrep },
              { label: t('Tile Print…'), onClick: () => setModal('showTilePrint', true), kbd: getBinding('file.tilePrint') },
              { sep: true },
              { label: t('Export SVG'), onClick: async () => { void getFormat('svg')?.export?.(); }, kbd: getBinding('file.exportSvg') },
              { label: t('Document Settings…'), onClick: () => setModal('showDocSettings', true) },
            ]}
            />
          </span>
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
      <input ref={pdfRef} type="file" accept=".pdf,application/pdf" hidden onChange={onPdf} />

      {showAbout && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-xs" onClick={() => setShowAbout(false)}>
          <div
            className="w-[380px] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden max-h-[calc(100vh-4rem)] overflow-y-auto"
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
                    style={{ background: isTauri() ? 'var(--success)' : 'var(--accent2)' }}
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
        // Accessible name embeds the visible wordmark ("EN"/"中文") so the
        // pill satisfies WCAG 2.5.3 Label in Name (label-content-name-
        // mismatch) — same em-dash convention as the About/Logo button.
        aria-label={`${t('Language')} — ${labelFor(lang)}`}
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
      <div className="px-3 pt-1.5 pb-1 field-label mb-0! text-muted/80">
        {tStatic('Recent Files')}
      </div>
    ),
  });
  for (const f of top) {
    items.push({
      node: (
        <button
          onClick={async () => { void (await import('../lib/projectFile')).openRecentFile(f.name); }}
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
            className="w-4 h-4 rounded-sm border border-border bg-panel2 shrink-0 overflow-hidden flex items-center justify-center"
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
          <span className="text-[10px] text-muted tabular-nums shrink-0">
            {formatRelativeTime(f.ts)}
          </span>
        </button>
      ),
    });
  }
  items.push({
    node: (
      <button
        onClick={async () => { void (await import('../lib/recentFiles')).clearRecent(); }}
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
          className="w-12 bg-transparent outline-hidden text-ink text-right"
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
      className="btn-ghost flex items-center gap-1.5 shrink-0 whitespace-nowrap"
      onClick={async () => { void (await import('../lib/projectFile')).saveProjectQuick(); }}
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
function Dropdown({ label, items, width, triggerProps, triggerRole }: { label: string; items: MenuItem[]; width?: string; triggerProps?: ButtonHTMLAttributes<HTMLButtonElement> & { 'data-topbar-action'?: boolean }; triggerRole?: 'menuitem' | 'button' }) {
  // Pull className out so the spread below can't clobber the explicit prop.
  const { className: triggerClass, ...triggerRest } = triggerProps ?? {};
  // Track open state so aria-expanded reflects reality. The visual
  // transition is still CSS (group-hover / group-focus-within) — this
  // state mirrors those triggers so screen readers know the menu state.
  const [open, setOpen] = useState(false);
  // The menubar strip scrolls horizontally when the window is narrow, and
  // an overflow container clips absolutely-positioned descendants — which
  // would cut off the flyout panel that hangs below the strip. So once
  // open, the panel is pinned with `position: fixed` at the trigger's
  // current viewport rect (measured here, not in CSS). DOM order — and
  // with it the hover / focus-within containment that drives visibility —
  // is unchanged; only the paint coordinates move. Until the measurement
  // lands the panel parks off-screen so it never flashes at (0,0).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPanelPos({ left: rect.left, top: rect.bottom + 4 });
    };
    measure();
    // `position: fixed` decouples the panel from the trigger's layout, so
    // anything that moves the trigger while open must re-measure — window
    // resize, and horizontal scrolling of the overflow-x-auto menubar strip
    // (element scroll doesn't bubble; capture catches it). Without this the
    // panel hangs at stale viewport coordinates, visually detached.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);
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
        ref={triggerRef}
        // triggerProps lets toolbar callers restyle the trigger (.btn look)
        // and join roving sets (data-topbar-action) without forking the
        // hover/focus/fixed-panel logic; className, when passed, replaces the
        // menubar default so the caller owns the visuals.
        className={triggerClass ?? 'px-2 py-1 rounded hover:bg-panel2 text-ink/90 hover:text-ink transition-colors'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        // In a menubar strip the trigger reads as a menu item; in a toolbar
        // (the output cluster's "More…") a plain button + aria-haspopup is
        // the correct semantics — axe requires menuitem parents to be
        // menu/menubar, which a toolbar is not (LanguageSwitcher precedent).
        role={triggerRole ?? 'menuitem'}
        {...triggerRest}
      >
        {label}
      </button>
      <div
        className={`fixed bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 ${width ?? 'w-56'} py-1 max-h-[calc(100vh-6rem)] overflow-y-auto`}
        style={panelPos ? { left: panelPos.left, top: panelPos.top } : { left: -9999, top: -9999 }}
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
