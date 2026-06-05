import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, PenTool,
  FilePlus2, FolderOpen, FileImage, Image, Printer, Send, FileText, Save,
  Undo2, Redo2, Copy, Trash2, Group, Ungroup, MousePointerClick,
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown,
  Plus, Minus, Maximize2, Bug,
  Settings2, Keyboard, HelpCircle, Sparkles, BookOpen,
  Wand2, Palette, AlignCenter, Grid3X3, SunMoon, Type, RotateCw, RotateCcw, Star,
  type LucideIcon,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import {
  undo, redo, zoomBy, zoomFit, zoomToPercent, zoomToSelection, deleteSelection, duplicateSelection,
  groupSelection, ungroupSelection, ungroupAll,
  bringForward, sendBackward, bringToFront, sendToBack, autoArrangeSelection, centerOnArtboard, alignSelection, distributeSelection, distributeInArtboard, flipSelection, selectSame, lockSelection, unlockAll, hideSelection, hideOthers, showAll, swapFillStroke, defaultColors, applyStyleToSelection, makeGuidesFromSelection, selectInverse, selectAllObjects, selectVisibleObjects, selectUnlockedObjects, promptRenameSelection, selectAllText, selectAllImages, selectAllPaths, selectAllShapes, selectSameType, deselectAll, selectObjectInStack,
} from '../lib/canvasEngine';
import { getCanvas } from '../lib/canvasEngine';
import { getFormat } from '../lib/formats';
import { toast } from '../lib/toast';
import { setOutlineMode, isOutlineMode } from '../lib/outlineView';
import { openProjectFromFile, openRecentFile, saveProjectQuick, saveProjectToFile } from '../lib/projectFile';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { booleanOp, divideSelection, trimSelection, cropSelection, mergeSelection } from '../lib/booleanOps';
import { reversePathSelection } from '../lib/pathReverse';
import { addAnchorsToSelection } from '../lib/addAnchors';
import { cleanUpDocument } from '../lib/cleanUp';
import { fitArtboardToContent } from '../lib/fitArtboard';
import { exportSelectionSVG, exportSelectionPNG, copySelectionSVG } from '../lib/exportSelection';
import { pasteFromSystemClipboard, traceSelectedImage } from '../lib/io3';
import { createArtboardFromSelection, exportAllArtboardsAsFiles, exportAllArtboardsAsPNG } from '../lib/artboards';
import { rasterizeSelection } from '../lib/rasterize';
import { outlineStrokeToFillSelection } from '../lib/outlineStrokeFill';
import { addArrowheads } from '../lib/arrowheads';
import { averageSelectedAnchors } from '../lib/pathEdit';
import { toggleIsolationMode } from '../lib/isolationMode';
import { createOutlinesFromText } from '../lib/textToOutline';
import { changeCaseSelection, adjustFontSize, adjustTracking, adjustLeading } from '../lib/textCase';
import { smartPunctuationSelection } from '../lib/smartPunctuation';
import { splitTextToLetters, splitTextToLines } from '../lib/splitText';
import { invertColorsSelection, grayscaleColorsSelection } from '../lib/colorAdjust';
import { copySelection, cutSelection, pasteFromClipboard } from '../lib/clipboard';
import { buildOutlineCutPaths, weldOutline, outlineStrokeToCutPaths } from '../lib/contourFromSelection';
import { joinSelection } from '../lib/pathJoin';
import { repeatTransform, rotateSelection } from '../lib/transformOps';
import { applyTextOnArc } from '../lib/textPath';
import { applyStrokeAlign } from '../lib/strokeAlign';
import { applyBlur, applySepia, applyGrayscale as applyImageGrayscale, applyBrightness as applyImageBrightness, applyContrast, applyHueRotate, clearFilters } from '../lib/filters';
import { applyBlendModeToSelection, applyPatternFill, applyShadowToSelection, applyStrokeStyleToSelection, toggleUniformStroke } from '../lib/effects';
import { isMac, ariaKeyshortcuts } from '../lib/runtime';
import { getBinding } from '../lib/keymap';
import { listTools } from '../lib/tools/types';
import { clearRecent, subscribeRecent, type RecentFile } from '../lib/recentFiles';
import { addPlotterBridges, addPlotterGrommets, addPlotterRegistrationMarks, addPlotterRhinestones, addPlotterWeedBorder, clearPlotterBridges, clearPlotterRegistrationMarks, clearPlotterWeedBorders, savePlotterTestCut } from '../lib/cutPrepActions';
import type { ToolId } from '../types';

interface Props {
  onToggleAI: () => void;
  onToggleDebug: () => void;
  onShowOnboarding: () => void;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onImportImage: () => void;
}

interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  keywords?: string;
  // Typed as Lucide's public LucideIcon (extends SVGAttributes) so callers
  // can pass any standard SVG prop — `aria-hidden`, `className`, etc. —
  // without TS narrowing them away. The previous narrow stub forced one-off
  // boolean-form `aria-hidden={true}` syntax that broke the codebase's
  // canonical `aria-hidden="true"` string-form convention.
  icon: LucideIcon;
  run: () => void;
}

/** Local Kbd helper — mirrors the one in MenuBar.tsx (do not extract). */
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

/**
 * Score a command against the query. Lower is better (sorted asc).
 * - Label match wins over category, which wins over keywords/shortcut.
 * - Earlier index within the haystack also ranks better.
 * Returns Infinity if no match.
 */
function score(cmd: Command, q: string): number {
  if (!q) return 0;
  const label = cmd.label.toLowerCase();
  const cat = cmd.category.toLowerCase();
  const kws = (cmd.keywords ?? '').toLowerCase();
  const sc = (cmd.shortcut ?? '').toLowerCase();

  const labelIdx = label.indexOf(q);
  if (labelIdx >= 0) return labelIdx;
  const catIdx = cat.indexOf(q);
  if (catIdx >= 0) return 1000 + catIdx;
  const kwIdx = kws.indexOf(q);
  if (kwIdx >= 0) return 2000 + kwIdx;
  const scIdx = sc.indexOf(q);
  if (scIdx >= 0) return 3000 + scIdx;
  return Infinity;
}

export function CommandPalette({
  onToggleAI, onToggleDebug, onShowOnboarding, onNewDocument, onOpenFile, onImportImage,
}: Props) {
  const t = useT();
  const open = useEditor((s) => s.showCommandPalette);
  const setModal = useEditor((s) => s.setModal);
  const setTool = useEditor((s) => s.setTool);
  const rulersVisible = useEditor((s) => s.rulersVisible);
  const gridVisible = useEditor((s) => s.gridVisible);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const smartGuidesEnabled = useEditor((s) => s.smartGuidesEnabled);
  const anchorSnapEnabled = useEditor((s) => s.anchorSnapEnabled);
  const guidesVisible = useEditor((s) => s.guidesVisible);
  const guidesLocked = useEditor((s) => s.guidesLocked);
  const outlineMode = useEditor((s) => s.outlineMode);
  const theme = useEditor((s) => s.theme);
  const highContrast = useEditor((s) => s.highContrast);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [reviewedSearchAction, setReviewedSearchAction] = useState('');
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => setModal('showCommandPalette', false);

  useEffect(() => subscribeRecent(setRecent), []);

  const runWithSelection = (action: () => void, message = t('Select something first.'), minSelection = 1) => {
    if ((getCanvas()?.getActiveObjects().length ?? 0) < minSelection) {
      toast.warn(message);
      return;
    }
    action();
  };

  // Helper: open AI panel and copy a preset prompt to clipboard.
  const aiPreset = async (prompt: string) => {
    onToggleAI();
    // navigator.clipboard.writeText is async and the optional-chain trick
    // doesn't catch a rejected Promise — without awaiting, a permission
    // failure would still fire the "copied" toast while the user's
    // clipboard held stale content. Await + catch so the toast only
    // claims success when the write actually landed.
    try {
      await navigator.clipboard?.writeText(prompt);
      toast.info(t('AI prompt copied — paste it into the AI panel.'));
    } catch {
      toast.warn(t('Clipboard unavailable — the AI panel is open; paste manually.'));
    }
  };

  const selectTool = (tool: ToolId) => setTool(tool);
  const openPrintPrep = () => {
    setModal('openPrintPrep', true);
    setModal('showPrint', true);
  };

  // Build the full command list. Memoised on translation function only —
  // the closures captured here read fresh state from the store on call.
  const commands: Command[] = useMemo(() => [
    // ---------- Tool ----------
    // Drawn from the ToolHandler registry (registerTools.ts) — icon, label,
    // shortcut, keywords all flow from the descriptor so adding a tool means
    // one registry entry, no parallel array to keep in sync. Filtered on
    // `icon` so non-toolbar tools (e.g. directSelect) don't surface here.
    ...listTools().filter(h => h.icon).map(h => ({
      id: `tool.${h.id}`,
      label: t(h.label),
      category: t('Tool'),
      shortcut: getBinding(`tool.${h.id}`),
      keywords: h.keywords,
      icon: h.icon as LucideIcon,
      run: () => selectTool(h.id),
    })),

    // ---------- File ----------
    { id: 'file.new',         label: t('New'),                 category: t('File'), shortcut: getBinding('file.new'), icon: FilePlus2,  run: onNewDocument },
    { id: 'file.template',    label: t('New from Template…'),  category: t('File'), shortcut: getBinding('file.newFromTemplate'), keywords: 'starter preset', icon: FilePlus2,  run: () => setModal('showTemplates', true) },
    { id: 'file.open',          label: t('Open SVG / JSON…'),    category: t('File'), shortcut: getBinding('file.open'), keywords: 'import load', icon: FolderOpen, run: onOpenFile },
    { id: 'file.openProject',   label: t('Open Project…'),       category: t('File'), shortcut: getBinding('file.openProject'), keywords: 'vstudio project file', icon: FolderOpen, run: () => { void openProjectFromFile(); } },
    ...recent.slice(0, 5).map((f, i) => ({ id: `file.recent.${i}`, label: `${t('Open Recent')}: ${f.name}`, category: t('File'), keywords: `recent file project reopen ${f.name}`, icon: FolderOpen, run: () => { void openRecentFile(f.name); } })),
    ...(recent.length ? [{ id: 'file.clearRecent', label: t('Clear Recent'), category: t('File'), keywords: 'recent files history clear', icon: Trash2, run: () => clearRecent() }] : []),
    { id: 'file.saveProject',   label: t('Save Project'),        category: t('File'), shortcut: getBinding('file.saveProject'), keywords: 'persist vstudio', icon: Save, run: () => { void saveProjectQuick(); } },
    { id: 'file.saveProjectAs', label: t('Save Project As…'),    category: t('File'), shortcut: getBinding('file.saveProjectAs'), keywords: 'copy duplicate vstudio', icon: Save, run: () => { void saveProjectToFile(); } },
    { id: 'file.importImage', label: t('Import Image…'), category: t('File'), shortcut: getBinding('file.importImage'), keywords: 'png jpg picture', icon: Image, run: onImportImage },
    { id: 'file.pasteClipboard', label: t('Paste from Clipboard'), category: t('File'), keywords: 'paste clipboard image svg external system import', icon: Image, run: () => { void pasteFromSystemClipboard().then(r => { if (r === 'empty') toast.warn(t('No image or SVG on the clipboard.')); else if (r === 'failed') toast.warn(t('Clipboard unavailable.')); }); } },
    { id: 'file.exportSvg',   label: t('Export SVG'),          category: t('File'), shortcut: getBinding('file.exportSvg'), keywords: getFormat('svg')?.keywords, icon: Save,
      // Routes through the format registry — see `formatRegistration.ts`
      // SVG handler. Identical byte output to the previous direct
      // `download(..., exportSVGOptimized())` call, but every future tweak
      // (filename pattern, default options, search keywords) now lives in one place.
      run: () => { try { void getFormat('svg')?.export?.(); toast.success(`${t('Exported')} SVG`); } catch (err) { toast.error((err as Error).message); } } },
    // Raster + PDF exports go through the format registry (see formatRegistration.ts).
    // Behavioural diff is zero — the registry handlers call the same
    // `exportPNG(2)` / `exportJPG(2)` / `exportPDF()` / `exportPDFReal()`
    // underneath — but every future tweak (default DPI, filename pattern,
    // options) lives in one place. The PrintDialog still calls
    // `exportPDFReal` directly because it passes a full options object;
    // the no-args default path is what migrates to the registry.
    { id: 'file.exportPng',   label: t('Export PNG (2×)'),     category: t('File'), keywords: getFormat('png')?.keywords,        icon: FileImage,  run: () => { void getFormat('png')?.export?.(); } },
    { id: 'file.exportAllArtboards', label: t('Export All Artboards (SVG)'), category: t('File'), keywords: 'export all artboards svg each separate batch', icon: Save, run: () => { void exportAllArtboardsAsFiles().then(n => { if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); } },
    { id: 'file.exportAllArtboardsPng', label: t('Export All Artboards (PNG)'), category: t('File'), keywords: 'export all artboards png each separate batch', icon: FileImage, run: () => { const n = exportAllArtboardsAsPNG(); if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); } },
    { id: 'file.exportSelSvg', label: t('Export Selection as SVG'), category: t('File'), keywords: 'export selection svg cropped only selected', icon: Save, run: () => { void exportSelectionSVG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
    { id: 'file.exportSelPng', label: t('Export Selection as PNG'), category: t('File'), keywords: 'export selection png cropped only selected', icon: FileImage, run: () => { void exportSelectionPNG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
    { id: 'file.copyAsSvg', label: t('Copy as SVG'), category: t('File'), keywords: 'copy svg clipboard markup code paste selection', icon: Save, run: () => { void copySelectionSVG().then(r => { if (r === 'ok') toast.success(t('SVG copied to clipboard')); else if (r === 'empty') toast.warn(t('Select something first.')); else toast.warn(t('Clipboard unavailable.')); }); } },
    { id: 'file.exportJpg',   label: t('Export JPG (2×)'),     category: t('File'), keywords: getFormat('jpg')?.keywords,        icon: FileImage,  run: () => { void getFormat('jpg')?.export?.(); } },
    { id: 'file.exportPdf',   label: t('Export PDF'),          category: t('File'), keywords: getFormat('pdf')?.keywords,        icon: FileText,   run: () => { void getFormat('pdf')?.export?.(); } },
    { id: 'file.exportPdfV',  label: t('Export PDF (Vector)'), category: t('File'), keywords: getFormat('pdf-vector')?.keywords, icon: FileText,   run: () => { void getFormat('pdf-vector')?.export?.(); } },
    { id: 'file.exportDxf', label: t('Export DXF (paths)'), category: t('File'), keywords: getFormat('dxf')?.keywords, icon: Save, run: () => { void getFormat('dxf')?.export?.(); } },
    { id: 'file.exportJson', label: t('Export JSON'), category: t('File'), keywords: getFormat('json')?.keywords, icon: Save, run: () => { void getFormat('json')?.export?.(); } },
    { id: 'file.print',       label: t('Print…'),              category: t('File'), shortcut: getBinding('file.print'), icon: Printer,    run: () => setModal('showPrint', true) },
    { id: 'file.printPrep',   label: t('Print Prep…'),         category: t('File'), keywords: 'print prep crop marks registration marks bleed margins output', icon: Printer, run: openPrintPrep },
    { id: 'file.tilePrint',   label: t('Tile Print…'),         category: t('File'), shortcut: getBinding('file.tilePrint'), keywords: 'tile panel poster large format split pages', icon: Printer, run: () => setModal('showTilePrint', true) },
    { id: 'file.outputNest', label: t('Auto-arrange (Nest)'), category: t('File'), keywords: 'nest pack arrange tile material waste layout vinyl cutter plotter output signmaster', icon: Grid3X3, run: () => {
      const n = autoArrangeSelection();
      if (n > 0) toast.success(`${n} ${t('objects arranged')}`, { title: t('Auto-arrange (Nest)') });
      else toast.warn(t('Select 2 or more objects first.'), { title: t('Auto-arrange (Nest)') });
    } },
    { id: 'file.plotterRegMarks', label: t('Add positioning marks'), category: t('File'), keywords: 'registration marks reg marks print cut contour plotter cutter align', icon: Send, run: () => addPlotterRegistrationMarks(t) },
    { id: 'file.plotterWeedBorder', label: t('Weed border'), category: t('File'), keywords: 'weed border weeding vinyl cutter plotter peel waste cut prep', icon: Send, run: () => addPlotterWeedBorder(t) },
    { id: 'file.plotterWeedRows', label: `${t('Weed border')} — ${t('Weed rows')}`, category: t('File'), keywords: 'weed grid rows horizontal divider weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 2, 0) },
    { id: 'file.plotterWeedColumns', label: `${t('Weed border')} — ${t('Weed columns')}`, category: t('File'), keywords: 'weed grid columns vertical divider weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 0, 2) },
    { id: 'file.plotterWeedGrid2x2', label: `${t('Weed border')} — ${t('2×2')}`, category: t('File'), keywords: 'weed grid 2x2 two by two dividers weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 2, 2) },
    { id: 'file.plotterWeedGrid3x2', label: `${t('Weed border')} — ${t('3×2')}`, category: t('File'), keywords: 'weed grid 3x2 three by two dividers weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 3, 2) },
    { id: 'file.plotterBridgeLight', label: `${t('Bridges')} — ${t('Light')}`, category: t('File'), keywords: 'bridge bridges tabs light stencil island weeding vinyl cutter plotter cut prep', icon: Send, run: () => addPlotterBridges(t, 2, 0.6) },
    { id: 'file.plotterBridgeStandard', label: `${t('Bridges')} — ${t('Standard')}`, category: t('File'), keywords: 'bridge bridges tabs standard stencil island weeding vinyl cutter plotter cut prep', icon: Send, run: () => addPlotterBridges(t, 4, 1) },
    { id: 'file.plotterBridgeHeavy', label: `${t('Bridges')} — ${t('Heavy')}`, category: t('File'), keywords: 'bridge bridges tabs heavy stencil island weeding vinyl cutter plotter cut prep', icon: Send, run: () => addPlotterBridges(t, 6, 1.5) },
    { id: 'file.bannerGrommets', label: t('Banner Grommets…'), category: t('File'), keywords: 'grommet eyelet banner finishing hole vinyl cutter plotter output signmaster', icon: Send, run: () => runWithSelection(() => setModal('showGrommets', true)) },
    { id: 'file.bannerGrommetsSmall', label: `${t('Banner Grommets')} — ${t('Small banner')}`, category: t('File'), keywords: 'grommet eyelet small banner finishing hole preset vinyl cutter plotter output signmaster', icon: Send, run: () => addPlotterGrommets(t, 15, 300, 8) },
    { id: 'file.bannerGrommetsStandard', label: `${t('Banner Grommets')} — ${t('Standard banner')}`, category: t('File'), keywords: 'grommet eyelet standard banner finishing hole preset vinyl cutter plotter output signmaster', icon: Send, run: () => addPlotterGrommets(t, 20, 500, 10) },
    { id: 'file.bannerGrommetsLarge', label: `${t('Banner Grommets')} — ${t('Large banner')}`, category: t('File'), keywords: 'grommet eyelet large banner finishing hole preset vinyl cutter plotter output signmaster', icon: Send, run: () => addPlotterGrommets(t, 25, 750, 12) },
    { id: 'file.plotterTestCut', label: t('Save Test Cut File'), category: t('File'), keywords: 'test cut calibration blade force offset vinyl cutter plotter hpgl plt', icon: Send, run: () => savePlotterTestCut(t) },
    { id: 'file.clearPlotterRegMarks', label: t('Clear positioning marks'), category: t('File'), keywords: 'clear remove registration marks reg marks plotter cutter', icon: Trash2, run: () => clearPlotterRegistrationMarks(t) },
    { id: 'file.clearPlotterWeedBorders', label: t('Clear weed borders'), category: t('File'), keywords: 'clear remove weed border weeding vinyl cutter plotter', icon: Trash2, run: () => clearPlotterWeedBorders(t) },
    { id: 'file.clearPlotterBridges', label: t('Clear bridges'), category: t('File'), keywords: 'clear remove bridge bridges tabs restore closed paths stencil vinyl cutter plotter', icon: Trash2, run: () => clearPlotterBridges(t) },
    { id: 'file.plotter',     label: t('Send to Plotter…'),    category: t('File'), shortcut: getBinding('window.plotter'), keywords: 'cutter cnc', icon: Send, run: () => setModal('showPlotter', true) },

    // ---------- Edit ----------
    { id: 'edit.undo',       label: t('Undo'),      category: t('Edit'), shortcut: getBinding('edit.undo'), icon: Undo2,    run: () => undo() },
    { id: 'edit.redo',       label: t('Redo'),      category: t('Edit'), shortcut: `${getBinding('edit.redo')} / ${getBinding('edit.redoShift')}`, icon: Redo2, run: () => redo() },
    { id: 'edit.copy',       label: t('Copy'),      category: t('Edit'), shortcut: getBinding('edit.copy'), keywords: 'copy selection internal clipboard duplicate later paste', icon: Copy, run: () => { if (copySelection()) toast.success(t('Copied')); else toast.warn(t('Select something first.')); } },
    { id: 'edit.cut',        label: t('Cut'),       category: t('Edit'), shortcut: getBinding('edit.cut'), keywords: 'cut selection remove internal clipboard paste', icon: Copy, run: () => { if (cutSelection()) toast.success(t('Cut')); else toast.warn(t('Select something first.')); } },
    { id: 'edit.paste',      label: t('Paste'),     category: t('Edit'), shortcut: getBinding('edit.paste'), keywords: 'paste internal clipboard selection canvas', icon: Copy, run: () => { void pasteFromClipboard().then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); } },
    { id: 'edit.duplicate',  label: t('Duplicate'), category: t('Edit'), shortcut: getBinding('edit.duplicate'), icon: Copy,     run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else duplicateSelection(); } },
    { id: 'edit.delete',     label: t('Delete'),    category: t('Edit'), shortcut: 'Del / Backspace',    icon: Trash2,   run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else deleteSelection(); } },
    { id: 'edit.renameSelection', label: t('Rename Selection…'), category: t('Edit'), keywords: 'layer object name rename selection layers panel current existing prefill', icon: MousePointerClick, run: () => { const n = getCanvas()?.getActiveObjects().length ?? 0; if (n < 1) { toast.warn(t('Select something first.')); return; } const renamed = promptRenameSelection(t('Object name')); if (renamed) toast.success(`${renamed} ${t('objects renamed')}`); } },
    { id: 'edit.group',      label: t('Group'),     category: t('Edit'), shortcut: getBinding('edit.group'), keywords: 'combine bundle',         icon: Group,    run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else groupSelection(); } },
    { id: 'edit.isolation',  label: t('Isolation Mode'), category: t('Edit'), shortcut: getBinding('object.isolation'), keywords: 'isolate group edit children enter group', icon: Group, run: () => { if (!toggleIsolationMode()) toast.warn(t('Select a group first.')); } },
    { id: 'edit.ungroup',    label: t('Ungroup'),   category: t('Edit'), shortcut: getBinding('edit.ungroup'),                                     icon: Ungroup,  run: () => { if (getCanvas()?.getActiveObject()?.type !== 'group') toast.warn(t('Select a group first.')); else ungroupSelection(); } },
    { id: 'edit.ungroupAll', label: t('Ungroup All'), category: t('Edit'), keywords: 'ungroup all flatten recursive nested groups', icon: Ungroup, run: () => { const n = ungroupAll(); if (n) toast.success(`${n} ${t('groups ungrouped')}`); else toast.warn(t('Select a group first.')); } },
    { id: 'edit.selectAll',  label: t('Select All'), category: t('Edit'), shortcut: getBinding('edit.selectAll'), keywords: 'select all objects artwork', icon: MousePointerClick, run: () => { const n = selectAllObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No objects.')); } },
    { id: 'edit.deselectAll', label: t('Deselect All'), category: t('Edit'), shortcut: getBinding('edit.deselectAll'), keywords: 'deselect none clear selection nothing', icon: MousePointerClick, run: () => { deselectAll(); } },
    { id: 'edit.selectVisibleObjects', label: t('Select Visible Objects'), category: t('Edit'), keywords: 'select visible unlocked objects artwork batch sign', icon: MousePointerClick, run: () => { const n = selectVisibleObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No visible unlocked objects.')); } },
    { id: 'edit.selectUnlockedObjects', label: t('Select Unlocked Objects'), category: t('Edit'), keywords: 'select unlocked editable objects artwork batch sign', icon: MousePointerClick, run: () => { const n = selectUnlockedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unlocked objects.')); } },
    { id: 'edit.pasteInPlace', label: t('Paste in Place'),     category: t('Edit'), shortcut: getBinding('edit.pasteInPlace'), keywords: 'paste place position original same', icon: Copy, run: () => { void pasteFromClipboard(undefined, true).then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); } },
    { id: 'edit.pasteInFront', label: t('Paste in Front'),     category: t('Edit'), shortcut: getBinding('edit.pasteInFront'), keywords: 'paste front top original position stack', icon: Copy, run: () => { void pasteFromClipboard(undefined, true, 'front').then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); } },
    { id: 'edit.pasteInBack',  label: t('Paste in Back'),      category: t('Edit'), shortcut: getBinding('edit.pasteInBack'), keywords: 'paste back bottom original position stack', icon: Copy, run: () => { void pasteFromClipboard(undefined, true, 'back').then(ok => { if (!ok) toast.warn(t('Clipboard unavailable.')); }); } },
    { id: 'edit.selectInverse',    label: t('Select Inverse'),     category: t('Edit'), shortcut: getBinding('edit.selectInverse'), keywords: 'select inverse invert opposite others', icon: MousePointerClick, run: () => { const n = selectInverse(); toast.success(`${n} ${t('selected')}`); } },
    { id: 'edit.selectAllText',    label: t('Select All Text Objects'), category: t('Edit'), keywords: 'select all text objects type batch font', icon: MousePointerClick, run: () => { const n = selectAllText(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No text objects.')); } },
    { id: 'edit.selectAllImages',  label: t('Select All Image Objects'), category: t('Edit'), keywords: 'select all images raster bitmap placed photos trace batch', icon: MousePointerClick, run: () => { const n = selectAllImages(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image objects.')); } },
    { id: 'edit.selectAllPaths',   label: t('Select All Path Objects'), category: t('Edit'), keywords: 'select all paths curves cut lines vector outlines batch', icon: MousePointerClick, run: () => { const n = selectAllPaths(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No path objects.')); } },
    { id: 'edit.selectAllShapes',  label: t('Select All Shape Objects'), category: t('Edit'), keywords: 'select all shapes rectangles circles ellipses polygons lines batch', icon: MousePointerClick, run: () => { const n = selectAllShapes(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No shape objects.')); } },
    { id: 'edit.selectNextAbove',  label: t('Select Next Object Above'), category: t('Edit'), shortcut: getBinding('edit.selectNextAbove'), keywords: 'select next object above stack z order', icon: MousePointerClick, run: () => { if (!selectObjectInStack('up')) toast.warn(t('Nothing above.')); } },
    { id: 'edit.selectNextBelow',  label: t('Select Next Object Below'), category: t('Edit'), shortcut: getBinding('edit.selectNextBelow'), keywords: 'select next object below stack z order', icon: MousePointerClick, run: () => { if (!selectObjectInStack('down')) toast.warn(t('Nothing below.')); } },
    { id: 'edit.selectSameFill',   label: t('Select Same Fill'),   category: t('Edit'), keywords: 'select same fill colour color match', icon: MousePointerClick, run: () => { const n = selectSame('fill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
    { id: 'edit.selectSameStroke', label: t('Select Same Stroke'), category: t('Edit'), keywords: 'select same stroke colour color match', icon: MousePointerClick, run: () => { const n = selectSame('stroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
    { id: 'edit.selectSameWeight', label: t('Select Same Stroke Weight'), category: t('Edit'), keywords: 'select same stroke weight width thickness match', icon: MousePointerClick, run: () => { const n = selectSame('strokeWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameOpacity', label: t('Select Same Opacity'), category: t('Edit'), keywords: 'select same opacity transparency alpha match', icon: MousePointerClick, run: () => { const n = selectSame('opacity'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameFontFamily', label: t('Select Same Font Family'), category: t('Edit'), keywords: 'select same font family typeface text match', icon: MousePointerClick, run: () => { const n = selectSame('fontFamily'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
    { id: 'edit.selectSameFontSize', label: t('Select Same Font Size'), category: t('Edit'), keywords: 'select same font size point text match', icon: MousePointerClick, run: () => { const n = selectSame('fontSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
    { id: 'edit.selectSameBlendMode', label: t('Select Same Blend Mode'), category: t('Edit'), keywords: 'select same blend mode multiply screen overlay compositing match', icon: MousePointerClick, run: () => { const n = selectSame('globalCompositeOperation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameDash', label: t('Select Same Dash'), category: t('Edit'), keywords: 'select same dash dashed dotted stroke style match', icon: MousePointerClick, run: () => { const n = selectSame('strokeDashArray'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameLineCap', label: t('Select Same Line Cap'), category: t('Edit'), keywords: 'select same line cap butt round square stroke style match', icon: MousePointerClick, run: () => { const n = selectSame('strokeLineCap'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameLineJoin', label: t('Select Same Line Join'), category: t('Edit'), keywords: 'select same line join miter round bevel stroke style match', icon: MousePointerClick, run: () => { const n = selectSame('strokeLineJoin'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameType', label: t('Select Same Type'), category: t('Edit'), keywords: 'select same type object kind shape rectangle path text batch', icon: MousePointerClick, run: () => { const n = selectSameType(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
    { id: 'edit.selectSameName', label: t('Select Same Name'), category: t('Edit'), keywords: 'select same name layer object named labels imported artwork batch', icon: MousePointerClick, run: () => { const n = selectSame('name'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a named object first.')); } },
    { id: 'edit.lock',        label: t('Lock Selection'),      category: t('Edit'), shortcut: getBinding('edit.lockSelection'), keywords: 'lock freeze protect immovable', icon: MousePointerClick, run: () => { const n = lockSelection(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select something first.')); } },
    { id: 'edit.unlockAll',   label: t('Unlock All'),          category: t('Edit'), shortcut: getBinding('edit.unlockAll'), keywords: 'unlock release all', icon: MousePointerClick, run: () => { const n = unlockAll(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked objects.')); } },
    { id: 'edit.hide',        label: t('Hide Selection'),      category: t('Edit'), shortcut: getBinding('edit.hideSelection'), keywords: 'hide invisible conceal', icon: MousePointerClick, run: () => { const n = hideSelection(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); } },
    { id: 'edit.hideOthers',  label: t('Hide Others'),         category: t('Edit'), keywords: 'hide others isolate focus conceal rest', icon: MousePointerClick, run: () => { const n = hideOthers(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); } },
    { id: 'edit.showAll',     label: t('Show All'),            category: t('Edit'), shortcut: getBinding('edit.showAll'), keywords: 'show reveal all hidden', icon: MousePointerClick, run: () => { const n = showAll(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden objects.')); } },

    // ---------- Arrange ----------
    { id: 'arrange.front',     label: t('Bring to Front'),     category: t('Arrange'), shortcut: `${getBinding('arrange.forwardFront').replace(/]$/, 'Shift+]')}`, keywords: 'order z-index top',    icon: ChevronsUp,   run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else bringToFront(); } },
    { id: 'arrange.forward',   label: t('Bring Forward'),      category: t('Arrange'), shortcut: getBinding('arrange.forwardFront'), keywords: 'order z-index up',     icon: ChevronUp,    run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else bringForward(); } },
    { id: 'arrange.back',      label: t('Send Backward'),      category: t('Arrange'), shortcut: getBinding('arrange.backwardBack'), keywords: 'order z-index down',   icon: ChevronDown,  run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else sendBackward(); } },
    { id: 'arrange.bottom',    label: t('Send to Back'),       category: t('Arrange'), shortcut: `${getBinding('arrange.backwardBack').replace(/[[]$/, 'Shift+[')}`, keywords: 'order z-index bottom', icon: ChevronsDown, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else sendToBack(); } },
    { id: 'arrange.transform', label: t('Transform…'),          category: t('Arrange'), keywords: 'transform move scale rotate numeric exact copy reflect', icon: Wand2, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showTransform', true); } },
    { id: 'arrange.resize',    label: t('Resize…'),            category: t('Arrange'), keywords: 'resize scale exact size mm width height dimensions', icon: Wand2, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showResize', true); } },
    { id: 'arrange.centerArtboard', label: t('Center on Artboard'), category: t('Arrange'), keywords: 'center centre artboard page middle align', icon: AlignCenter, run: () => { if (!centerOnArtboard()) toast.warn(t('Select something first.')); } },
    { id: 'align.left', label: t('Align left'), category: t('Arrange'), shortcut: getBinding('align.left'), keywords: 'align left edges selection objects', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else alignSelection('left'); } },
    { id: 'align.centerH', label: t('Align center horizontally'), category: t('Arrange'), shortcut: getBinding('align.centerH'), keywords: 'align horizontal center centre selection objects', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else alignSelection('centerH'); } },
    { id: 'align.right', label: t('Align right'), category: t('Arrange'), shortcut: getBinding('align.right'), keywords: 'align right edges selection objects', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else alignSelection('right'); } },
    { id: 'align.top', label: t('Align top'), category: t('Arrange'), shortcut: getBinding('align.top'), keywords: 'align top edges selection objects', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else alignSelection('top'); } },
    { id: 'align.centerV', label: t('Align center vertically'), category: t('Arrange'), shortcut: getBinding('align.centerV'), keywords: 'align vertical center middle selection objects', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else alignSelection('centerV'); } },
    { id: 'align.bottom', label: t('Align bottom'), category: t('Arrange'), shortcut: getBinding('align.bottom'), keywords: 'align bottom edges selection objects', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) toast.warn(t('Select 2 or more objects first.')); else alignSelection('bottom'); } },
    { id: 'distribute.horizontal', label: t('Distribute horizontally (equal spacing)'), category: t('Arrange'), shortcut: getBinding('distribute.horizontal'), keywords: 'distribute horizontal equal spacing gaps selection', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 3) toast.warn(t('Select 3 or more objects first.')); else distributeSelection('horizontal'); } },
    { id: 'distribute.vertical', label: t('Distribute vertically (equal spacing)'), category: t('Arrange'), shortcut: getBinding('distribute.vertical'), keywords: 'distribute vertical equal spacing gaps selection', icon: AlignCenter, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 3) toast.warn(t('Select 3 or more objects first.')); else distributeSelection('vertical'); } },
    { id: 'distribute.artboardHorizontal', label: t('Distribute horizontally in Artboard'), category: t('Arrange'), keywords: 'distribute horizontal artboard page equal margins', icon: AlignCenter, run: () => { const st = useEditor.getState(); if ((getCanvas()?.getActiveObjects().length ?? 0) < 1 || st.artboards.length === 0) toast.warn(t('Select something first.')); else distributeInArtboard('horizontal'); } },
    { id: 'distribute.artboardVertical', label: t('Distribute vertically in Artboard'), category: t('Arrange'), keywords: 'distribute vertical artboard page equal margins', icon: AlignCenter, run: () => { const st = useEditor.getState(); if ((getCanvas()?.getActiveObjects().length ?? 0) < 1 || st.artboards.length === 0) toast.warn(t('Select something first.')); else distributeInArtboard('vertical'); } },
    { id: 'arrange.rasterize', label: t('Rasterize'),          category: t('Arrange'), keywords: 'rasterize raster bitmap flatten image png', icon: Wand2, run: () => { void rasterizeSelection().then(ok => { if (ok) toast.success(t('Rasterized')); else toast.warn(t('Select an object first.')); }); } },
    { id: 'image.trace', label: t('Trace Image'),              category: t('Arrange'), keywords: 'image trace vectorise vectorize outline bitmap raster polygon autotrace', icon: Wand2, run: () => { void traceSelectedImage().then(ok => { if (ok) toast.success(t('Image traced')); else toast.warn(t('Select a raster image first.')); }); } },
    { id: 'filter.blur', label: `${t('Image Filters')} — ${t('Blur')}`, category: t('Arrange'), keywords: 'image filter blur soften raster photo', icon: Image, run: () => applyBlur(0.08) },
    { id: 'filter.sepia', label: `${t('Image Filters')} — ${t('Sepia')}`, category: t('Arrange'), keywords: 'image filter sepia vintage raster photo', icon: Image, run: () => applySepia() },
    { id: 'filter.grayscale', label: `${t('Image Filters')} — ${t('Grayscale')}`, category: t('Arrange'), keywords: 'image filter grayscale greyscale raster photo', icon: Image, run: () => applyImageGrayscale() },
    { id: 'filter.brighten', label: `${t('Image Filters')} — ${t('Brightness +')}`, category: t('Arrange'), keywords: 'image filter brightness lighten raster photo', icon: Image, run: () => applyImageBrightness(0.12) },
    { id: 'filter.darken', label: `${t('Image Filters')} — ${t('Brightness -')}`, category: t('Arrange'), keywords: 'image filter brightness darken raster photo', icon: Image, run: () => applyImageBrightness(-0.12) },
    { id: 'filter.contrast', label: `${t('Image Filters')} — ${t('Contrast +')}`, category: t('Arrange'), keywords: 'image filter contrast raster photo', icon: Image, run: () => applyContrast(0.18) },
    { id: 'filter.hue', label: `${t('Image Filters')} — ${t('Hue rotate')}`, category: t('Arrange'), keywords: 'image filter hue rotate colour color raster photo', icon: Image, run: () => applyHueRotate(30) },
    { id: 'filter.clear', label: t('Clear Image Filters'), category: t('Arrange'), keywords: 'image filter clear remove reset raster photo', icon: Image, run: () => clearFilters() },
    { id: 'arrange.shear',     label: t('Shear…'),             category: t('Arrange'), keywords: 'shear skew slant oblique italic transform', icon: Wand2, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showShear', true); } },
    { id: 'arrange.transformAgain', label: t('Transform Again'), category: t('Arrange'), shortcut: getBinding('edit.transformAgain'), keywords: 'transform again repeat step and repeat array duplicate last', icon: Wand2, run: () => { repeatTransform().then((ok) => { if (!ok) toast.warn(t('Apply a Transform first.')); }); } },
    { id: 'arrange.rotateCW',  label: t('Rotate 90° CW'),      category: t('Arrange'), keywords: 'rotate 90 clockwise right turn', icon: RotateCw, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(90); } },
    { id: 'arrange.rotateCCW', label: t('Rotate 90° CCW'),     category: t('Arrange'), keywords: 'rotate 90 counter clockwise anticlockwise left turn', icon: RotateCcw, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(-90); } },
    { id: 'arrange.rotate180', label: t('Rotate 180°'),        category: t('Arrange'), keywords: 'rotate 180 flip half turn upside down', icon: RotateCw, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else void rotateSelection(180); } },
    { id: 'arrange.blend',     label: t('Blend…'),             category: t('Arrange'), keywords: 'blend morph interpolate steps between gradient shapes', icon: Wand2, run: () => runWithSelection(() => setModal('showBlend', true), t('Select 2 or more objects first.'), 2) },
    { id: 'color.swapFillStroke', label: t('Swap Fill / Stroke'), category: t('Arrange'), shortcut: getBinding('edit.swapFillStroke'), keywords: 'swap exchange fill stroke colour color', icon: Palette, run: () => { if (!swapFillStroke()) toast.warn(t('Select an object first.')); } },
    { id: 'color.invert',      label: t('Invert Colors'),      category: t('Arrange'), keywords: 'invert colours negative edit colors', icon: Palette, run: () => { const n = invertColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
    { id: 'color.grayscale',   label: t('Convert to Grayscale'), category: t('Arrange'), keywords: 'grayscale greyscale desaturate gray edit colors', icon: Palette, run: () => { const n = grayscaleColorsSelection(); if (n) toast.success(`${n} ${t('colours changed')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
    { id: 'color.saturate',    label: t('Saturate…'),          category: t('Arrange'), keywords: 'saturate saturation vivid desaturate edit colors', icon: Palette, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showSaturate', true); } },
    { id: 'color.hue',         label: t('Adjust Hue…'),        category: t('Arrange'), keywords: 'hue shift rotate colour wheel recolor edit colors', icon: Palette, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showHue', true); } },
    { id: 'color.brightness',  label: t('Adjust Brightness…'), category: t('Arrange'), keywords: 'brightness lighten darken lightness value edit colors', icon: Palette, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showBrightness', true); } },
    { id: 'color.defaultColors',  label: t('Default Fill / Stroke'), category: t('Arrange'), shortcut: getBinding('edit.defaultColors'), keywords: 'default colours reset white fill black stroke', icon: Palette, run: () => defaultColors() },
    { id: 'color.noFill', label: t('No Fill'), category: t('Arrange'), shortcut: getBinding('appearance.noFill'), keywords: 'none transparent remove fill colour color', icon: Palette, run: () => runWithSelection(() => applyStyleToSelection({ fill: '' })) },
    { id: 'color.noStroke', label: t('No Stroke'), category: t('Arrange'), shortcut: getBinding('appearance.noStroke'), keywords: 'none transparent remove stroke outline colour color', icon: Palette, run: () => runWithSelection(() => applyStyleToSelection({ stroke: '', strokeWidth: 0 })) },
    { id: 'arrange.flipH',     label: t('Flip Horizontal'),     category: t('Arrange'), shortcut: getBinding('edit.flipH'), keywords: 'flip mirror reflect horizontal', icon: Wand2, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else flipSelection('x'); } },
    { id: 'arrange.flipV',     label: t('Flip Vertical'),       category: t('Arrange'), shortcut: getBinding('edit.flipV'), keywords: 'flip mirror reflect vertical', icon: Wand2, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else flipSelection('y'); } },
    { id: 'arrange.repeat',    label: t('Repeat (Grid / Radial / Mirror)…'), category: t('Arrange'), keywords: 'array duplicate pattern radial mirror', icon: Grid3X3, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showRepeat', true); } },
    { id: 'arrange.nest',      label: t('Auto-arrange (Nest)'), category: t('Arrange'), keywords: 'nest pack arrange tile material waste layout bin vinyl cutter plotter output', icon: Grid3X3, run: () => {
      const n = autoArrangeSelection();
      if (n > 0) toast.success(`${n} ${t('objects arranged')}`, { title: t('Auto-arrange (Nest)') });
      else toast.warn(t('Select 2 or more objects first.'), { title: t('Auto-arrange (Nest)') });
    } },
    { id: 'edit.clipMask',        label: t('Make Clipping Mask'),     category: t('Arrange'), shortcut: getBinding('edit.clipMask'),     keywords: 'mask clip clipping',            icon: Wand2,   run: () => { if (!applyClipMask()) toast.warn(t('Select 2 or more objects first.')); } },
    { id: 'edit.releaseClip',     label: t('Release Clipping Mask'),  category: t('Arrange'), shortcut: getBinding('edit.releaseClip'), keywords: 'unmask unclip clipping',         icon: Wand2,   run: () => { if (!releaseClipMask()) toast.warn(t('Select a clipping group first.')); } },
    { id: 'edit.compoundPath',    label: t('Make Compound Path'),     category: t('Arrange'), shortcut: getBinding('edit.compoundPath'),     keywords: 'merge paths combine even-odd', icon: PenTool, run: () => { if (!makeCompoundPath()) toast.warn(t('Select 2 or more objects first.')); } },
    { id: 'edit.releaseCompound', label: t('Release Compound Path'),  category: t('Arrange'), shortcut: getBinding('edit.releaseCompound'), keywords: 'split decompose paths',          icon: PenTool, run: () => { if (!releaseCompoundPath()) toast.warn(t('Select a compound path first.')); } },
    { id: 'path.simplify',     label: t('Simplify Path…'),     category: t('Arrange'), keywords: 'simplify reduce anchor points douglas peucker smooth', icon: PenTool, run: () => runWithSelection(() => setModal('showSimplify', true)) },
    { id: 'path.roundCorners', label: t('Round Corners…'),     category: t('Arrange'), keywords: 'round corners fillet radius soften stylize', icon: PenTool, run: () => runWithSelection(() => setModal('showRoundCorners', true)) },
    { id: 'path.offset',       label: t('Offset Path…'),       category: t('Arrange'), keywords: 'offset path parallel inset outset expand contour', icon: PenTool, run: () => runWithSelection(() => setModal('showOffsetPath', true)) },
    { id: 'path.addAnchors',   label: t('Add Anchor Points'),  category: t('Arrange'), keywords: 'add anchor points subdivide nodes densify path', icon: PenTool, run: () => { const n = addAnchorsToSelection(); if (n) toast.success(`${n} ${t('paths subdivided')}`); else toast.warn(t('Select one or more paths first.')); } },
    { id: 'path.averageAnchors', label: t('Average Anchor Points'), category: t('Arrange'), shortcut: getBinding('path.averageAnchors'), keywords: 'average anchor points align handles selected nodes', icon: PenTool, run: () => { const n = averageSelectedAnchors('both'); if (n) toast.success(`${n} ${t('anchors averaged')}`); else toast.warn(t('Shift-click two or more path anchors first.')); } },
    { id: 'path.cleanUp',      label: t('Clean Up'),           category: t('Arrange'), keywords: 'clean up remove stray points empty text junk tidy', icon: PenTool, run: () => { const n = cleanUpDocument(); if (n) toast.success(`${n} ${t('stray objects removed')}`); else toast.success(t('Nothing to clean up.')); } },
    { id: 'path.splitGrid',    label: t('Split Into Grid…'),   category: t('Arrange'), keywords: 'split grid rows columns divide cells labels panels', icon: Grid3X3, run: () => setModal('showSplitGrid', true) },
    { id: 'path.roughen',      label: t('Roughen…'),           category: t('Arrange'), keywords: 'roughen distort jitter rough distressed hand drawn', icon: PenTool, run: () => runWithSelection(() => setModal('showRoughen', true)) },
    { id: 'path.zigzag',       label: t('Zig Zag…'),           category: t('Arrange'), keywords: 'zigzag zig zag wave distort ridges scallop border', icon: PenTool, run: () => runWithSelection(() => setModal('showZigzag', true)) },
    { id: 'path.pucker',       label: t('Pucker & Bloat…'),    category: t('Arrange'), keywords: 'pucker bloat distort star spike balloon inflate deflate', icon: PenTool, run: () => runWithSelection(() => setModal('showPucker', true)) },
    { id: 'path.twist',        label: t('Twist…'),             category: t('Arrange'), keywords: 'twist twirl swirl spiral distort rotate', icon: PenTool, run: () => runWithSelection(() => setModal('showTwist', true)) },
    { id: 'path.freeDistort',  label: t('Free Distort…'),      category: t('Arrange'), keywords: 'free distort perspective envelope corner transform', icon: PenTool, run: () => runWithSelection(() => setModal('showFreeDistort', true)) },
    { id: 'path.warp',         label: t('Arc Warp…'),          category: t('Arrange'), keywords: 'warp arc arch bend banner envelope distort curve', icon: PenTool, run: () => runWithSelection(() => setModal('showWarp', true)) },
    { id: 'insert.star',       label: t('Star / Polygon…'),    category: t('Insert'), keywords: 'star polygon spiral shape burst pentagon hexagon insert create', icon: Star, run: () => setModal('showStar', true) },
    { id: 'path.join',         label: t('Join Paths'),         category: t('Arrange'), shortcut: getBinding('edit.join'), keywords: 'join connect close path endpoints merge', icon: PenTool, run: () => { if (!joinSelection()) toast.warn(t('Select 1 open path to close, or 2 to join.')); } },
    { id: 'path.reverse',      label: t('Reverse Path Direction'), category: t('Arrange'), keywords: 'reverse path direction winding flip order', icon: PenTool, run: () => { const n = reversePathSelection(); if (n) toast.success(`${n} ${t('paths reversed')}`); else toast.warn(t('Select one or more paths first.')); } },
    { id: 'bool.union',     label: t('Union'),     category: t('Arrange'), keywords: 'pathfinder boolean unite merge combine', icon: Wand2, run: () => { void booleanOp('union').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
    { id: 'bool.subtract',  label: t('Subtract'),  category: t('Arrange'), keywords: 'pathfinder boolean minus front difference', icon: Wand2, run: () => { void booleanOp('subtract').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
    { id: 'bool.intersect', label: t('Intersect'), category: t('Arrange'), keywords: 'pathfinder boolean intersection overlap', icon: Wand2, run: () => { void booleanOp('intersect').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
    { id: 'bool.exclude',   label: t('Exclude'),   category: t('Arrange'), keywords: 'pathfinder boolean xor exclude', icon: Wand2, run: () => { void booleanOp('exclude').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
    { id: 'bool.minusBack', label: t('Minus Back'), category: t('Arrange'), keywords: 'pathfinder boolean minus back subtract', icon: Wand2, run: () => { void booleanOp('minus-back').then((ok) => { if (!ok) toast.warn(t('Select 2 or more objects first.')); }); } },
    { id: 'bool.divide',    label: t('Divide'),     category: t('Arrange'), keywords: 'pathfinder boolean divide split regions', icon: Wand2, run: () => { const n = divideSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
    { id: 'bool.trim',      label: t('Trim'),       category: t('Arrange'), keywords: 'pathfinder boolean trim hidden remove', icon: Wand2, run: () => { const n = trimSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
    { id: 'bool.merge',     label: t('Merge'),      category: t('Arrange'), keywords: 'pathfinder boolean merge same colour unite flatten', icon: Wand2, run: () => { const n = mergeSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
    { id: 'bool.crop',      label: t('Crop'),       category: t('Arrange'), keywords: 'pathfinder boolean crop frame mask clip inside', icon: Wand2, run: () => { const n = cropSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
    { id: 'cut.contourDialog', label: t('Cut Contour…'), category: t('Arrange'), shortcut: getBinding('window.cutContour'), keywords: 'cut contour dialog offset trace registration reg marks print and cut vinyl cutter', icon: Send, run: () => setModal('showCutContour', true) },
    { id: 'cut.registrationMarks', label: t('Add positioning marks'), category: t('Arrange'), keywords: 'registration marks reg marks print and cut vinyl cutter align crop marks', icon: Send, run: () => addPlotterRegistrationMarks(t) },
    { id: 'cut.weedBorder', label: t('Weed border'), category: t('Arrange'), keywords: 'weed border weeding vinyl cutter plotter peel waste cut prep', icon: Send, run: () => addPlotterWeedBorder(t) },
    { id: 'cut.weedRows', label: `${t('Weed border')} — ${t('Weed rows')}`, category: t('Arrange'), keywords: 'weed grid rows horizontal divider weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 2, 0) },
    { id: 'cut.weedColumns', label: `${t('Weed border')} — ${t('Weed columns')}`, category: t('Arrange'), keywords: 'weed grid columns vertical divider weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 0, 2) },
    { id: 'cut.weedGrid2x2', label: `${t('Weed border')} — ${t('2×2')}`, category: t('Arrange'), keywords: 'weed grid 2x2 two by two dividers weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 2, 2) },
    { id: 'cut.weedGrid3x2', label: `${t('Weed border')} — ${t('3×2')}`, category: t('Arrange'), keywords: 'weed grid 3x2 three by two dividers weeding vinyl cutter plotter peel waste cut prep', icon: Grid3X3, run: () => addPlotterWeedBorder(t, 3, 2) },
    { id: 'cut.bridgeLight', label: `${t('Bridges')} — ${t('Light')}`, category: t('Arrange'), keywords: 'bridge bridges tabs light stencil island weeding vinyl cutter plotter cut prep', icon: Send, run: () => addPlotterBridges(t, 2, 0.6) },
    { id: 'cut.bridgeStandard', label: `${t('Bridges')} — ${t('Standard')}`, category: t('Arrange'), keywords: 'bridge bridges tabs standard stencil island weeding vinyl cutter plotter cut prep', icon: Send, run: () => addPlotterBridges(t, 4, 1) },
    { id: 'cut.bridgeHeavy', label: `${t('Bridges')} — ${t('Heavy')}`, category: t('Arrange'), keywords: 'bridge bridges tabs heavy stencil island weeding vinyl cutter plotter cut prep', icon: Send, run: () => addPlotterBridges(t, 6, 1.5) },
    { id: 'cut.testCutFile', label: t('Save Test Cut File'), category: t('Arrange'), keywords: 'test cut calibration blade force offset vinyl cutter plotter hpgl plt', icon: Send, run: () => savePlotterTestCut(t) },
    { id: 'cut.clearRegistrationMarks', label: t('Clear positioning marks'), category: t('Arrange'), keywords: 'clear remove registration marks reg marks print cut vinyl cutter', icon: Trash2, run: () => clearPlotterRegistrationMarks(t) },
    { id: 'cut.clearWeedBorders', label: t('Clear weed borders'), category: t('Arrange'), keywords: 'clear remove weed border weeding vinyl cutter plotter', icon: Trash2, run: () => clearPlotterWeedBorders(t) },
    { id: 'cut.clearBridges', label: t('Clear bridges'), category: t('Arrange'), keywords: 'clear remove bridge bridges tabs restore closed paths stencil vinyl cutter plotter', icon: Trash2, run: () => clearPlotterBridges(t) },
    { id: 'cut.contour2mm', label: t('Generate 2 mm contour'), category: t('Arrange'), keywords: 'cut contour offset 2mm outline vinyl cutter sign', icon: Send, run: () => {
      const objs = getCanvas()?.getActiveObjects() ?? [];
      if (!objs.length) { toast.warn(t('Select one or more shapes first.')); return; }
      const paths = buildOutlineCutPaths(objs, 2, 1);
      if (!paths.length) { toast.warn(t('No contour generated.')); return; }
      const ed = useEditor.getState();
      ed.addCutPaths(paths);
      ed.setCutPathsVisible(true);
      toast.success(`${paths.length} ${t('contour(s) added')}`, { title: t('Contour generated') });
    } },
    { id: 'cut.weld',          label: t('Weld cut paths'),               category: t('Arrange'), keywords: 'merge union combine cut weld overlap sign', icon: Wand2, run: () => {
      const objs = getCanvas()?.getActiveObjects() ?? [];
      if (!objs.length) { toast.warn(t('Select one or more shapes first.')); return; }
      const paths = weldOutline(objs);
      const ed = useEditor.getState();
      ed.addCutPaths(paths);
      ed.setCutPathsVisible(true);
      toast.success(`${t('Welded into')} ${paths.length} ${t('cut paths')}`, { title: t('Weld') });
    } },
    { id: 'cut.strokeEdges', label: t('Stroke edges to cut paths'), category: t('Arrange'), keywords: 'outline stroke edge cut path vinyl cutter sign', icon: Send, run: () => {
      const objs = getCanvas()?.getActiveObjects() ?? [];
      if (!objs.length) { toast.warn(t('Select one or more shapes first.')); return; }
      const paths = outlineStrokeToCutPaths(objs);
      if (!paths.length) { toast.warn(t('Select shapes that have a stroke first.')); return; }
      const ed = useEditor.getState();
      ed.addCutPaths(paths);
      ed.setCutPathsVisible(true);
      toast.success(`${paths.length} ${t('cut paths')}`, { title: t('Outline Stroke') });
    } },
    { id: 'cut.togglePreview', label: t('Show / Hide cut preview'), category: t('Arrange'), keywords: 'show hide cut preview overlay contour path vinyl cutter', icon: Send, run: () => {
      const ed = useEditor.getState();
      if (!ed.cutPaths.length) { toast.warn(t('No cut paths yet.')); return; }
      ed.setCutPathsVisible(!ed.cutPathsVisible);
    } },
    { id: 'cut.clearContourPaths', label: t('Clear contour'), category: t('Arrange'), keywords: 'clear remove contour outline cut paths vinyl cutter', icon: Trash2, run: () => {
      const ed = useEditor.getState();
      if (!ed.cutPaths.some(p => p.kind === 'outline')) { toast.warn(t('No contour cut paths.')); return; }
      ed.clearCutPaths('outline');
      toast.success(t('Contour cut paths cleared'), { title: t('Cut prep') });
    } },
    { id: 'cut.clearTracePaths', label: t('Clear trace'), category: t('Arrange'), keywords: 'clear remove trace bitmap cut paths vinyl cutter', icon: Trash2, run: () => {
      const ed = useEditor.getState();
      if (!ed.cutPaths.some(p => p.kind === 'trace')) { toast.warn(t('No traced cut paths.')); return; }
      ed.clearCutPaths('trace');
      toast.success(t('Traced cut paths cleared'), { title: t('Cut prep') });
    } },
    { id: 'cut.clearRegmarkPaths', label: t('Clear regmarks'), category: t('Arrange'), keywords: 'clear remove registration marks regmarks cut paths vinyl cutter', icon: Trash2, run: () => {
      const ed = useEditor.getState();
      if (!ed.cutPaths.some(p => p.kind === 'regmark')) { toast.warn(t('No registration marks.')); return; }
      ed.clearCutPaths('regmark');
      toast.success(t('Registration marks cleared'), { title: t('Cut prep') });
    } },
    { id: 'cut.clearPaths', label: t('Clear cut paths'), category: t('Arrange'), keywords: 'clear remove delete cut paths contour vinyl cutter', icon: Trash2, run: () => {
      const ed = useEditor.getState();
      if (!ed.cutPaths.length) { toast.warn(t('No cut paths yet.')); return; }
      ed.clearCutPaths();
      toast.success(t('Cut paths cleared'), { title: t('Cut prep') });
    } },
    { id: 'effect.outline', label: t('Multi-outline…'),       category: t('Arrange'), keywords: 'outline contour border sign text effect stroke layered', icon: Wand2, run: () => runWithSelection(() => setModal('showOutline', true)) },
    { id: 'effect.recolor', label: t('Recolor Artwork…'),     category: t('Arrange'), keywords: 'recolor remap colors swatch replace palette', icon: Palette, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showRecolor', true); } },
    { id: 'color.freeformGradient', label: t('Freeform Gradient…'), category: t('Arrange'), keywords: 'freeform gradient mesh colour color engraving raster highlight shade', icon: Palette, run: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else setModal('showFreeformGradient', true); } },
    { id: 'text.variableData', label: t('Variable Data…'),    category: t('Arrange'), shortcut: getBinding('text.variableData'), keywords: 'serial number numbering badge variable data merge sequence list', icon: Type, run: () => runWithSelection(() => setModal('showVariableData', true)) },
    { id: 'cut.rhinestone',   label: t('Rhinestone Template…'), category: t('Arrange'), keywords: 'rhinestone hotfix stone bling dots template outline', icon: Wand2, run: () => runWithSelection(() => setModal('showRhinestone', true)) },
    { id: 'cut.rhinestoneFine', label: `${t('Rhinestone Template')} — ${t('Fine stones')}`, category: t('Arrange'), keywords: 'rhinestone hotfix fine small ss6 dense spacing preset template outline', icon: Wand2, run: () => addPlotterRhinestones(t, 2, 3) },
    { id: 'cut.rhinestoneStandard', label: `${t('Rhinestone Template')} — ${t('Standard stones')}`, category: t('Arrange'), keywords: 'rhinestone hotfix standard ss10 spacing preset template outline', icon: Wand2, run: () => addPlotterRhinestones(t, 2.8, 4) },
    { id: 'cut.rhinestoneBold', label: `${t('Rhinestone Template')} — ${t('Bold stones')}`, category: t('Arrange'), keywords: 'rhinestone hotfix bold large ss20 loose spacing preset template outline', icon: Wand2, run: () => addPlotterRhinestones(t, 4.7, 6) },
    { id: 'cut.grommets',     label: t('Banner Grommets…'), category: t('Arrange'), keywords: 'grommet eyelet banner hole finishing corner edge vinyl cutter plotter output', icon: Wand2, run: () => runWithSelection(() => setModal('showGrommets', true)) },
    { id: 'cut.grommetsSmall', label: `${t('Banner Grommets')} — ${t('Small banner')}`, category: t('Arrange'), keywords: 'grommet eyelet small banner hole preset finishing corner edge vinyl cutter plotter output', icon: Wand2, run: () => addPlotterGrommets(t, 15, 300, 8) },
    { id: 'cut.grommetsStandard', label: `${t('Banner Grommets')} — ${t('Standard banner')}`, category: t('Arrange'), keywords: 'grommet eyelet standard banner hole preset finishing corner edge vinyl cutter plotter output', icon: Wand2, run: () => addPlotterGrommets(t, 20, 500, 10) },
    { id: 'cut.grommetsLarge', label: `${t('Banner Grommets')} — ${t('Large banner')}`, category: t('Arrange'), keywords: 'grommet eyelet large banner hole preset finishing corner edge vinyl cutter plotter output', icon: Wand2, run: () => addPlotterGrommets(t, 25, 750, 12) },
    { id: 'text.findReplace', label: t('Find & Replace…'),     category: t('Arrange'), shortcut: getBinding('text.findReplace'), keywords: 'find replace search text substitute', icon: Type, run: () => setModal('showFindReplace', true) },
    { id: 'text.createOutlines', label: t('Create Outlines'), category: t('Arrange'), shortcut: getBinding('text.createOutlines'), keywords: 'text outlines vectorise convert curves create outline cut', icon: Type, run: () => { void createOutlinesFromText().then(ok => { if (ok) toast.success(t('Text converted to outlines')); else toast.warn(t('Select a single text object to enable')); }); } },
    { id: 'text.splitLetters', label: t('Break Text into Letters'), category: t('Arrange'), shortcut: getBinding('text.splitLetters'), keywords: 'break split text letters characters explode per letter', icon: Type, run: () => { const n = splitTextToLetters(); if (n) toast.success(`${n} ${t('letters created')}`); else toast.warn(t('Select a text object first.')); } },
    { id: 'text.splitLines',   label: t('Break Text into Lines'), category: t('Arrange'), shortcut: getBinding('text.splitLines'), keywords: 'break split text lines rows explode per line', icon: Type, run: () => { const n = splitTextToLines(); if (n) toast.success(`${n} ${t('lines created')}`); else toast.warn(t('Select multi-line text first.')); } },
    { id: 'text.caseUpper',    label: t('UPPERCASE'),          category: t('Arrange'), shortcut: getBinding('text.caseUpper'), keywords: 'change case uppercase caps text', icon: Type, run: () => { if (!changeCaseSelection('upper')) toast.warn(t('Select a text object first.')); } },
    { id: 'text.caseLower',    label: t('lowercase'),          category: t('Arrange'), shortcut: getBinding('text.caseLower'), keywords: 'change case lowercase text', icon: Type, run: () => { if (!changeCaseSelection('lower')) toast.warn(t('Select a text object first.')); } },
    { id: 'text.caseTitle',    label: t('Title Case'),         category: t('Arrange'), shortcut: getBinding('text.caseTitle'), keywords: 'change case title capitalise each word text', icon: Type, run: () => { if (!changeCaseSelection('title')) toast.warn(t('Select a text object first.')); } },
    { id: 'text.caseSentence', label: t('Sentence case'),      category: t('Arrange'), shortcut: getBinding('text.caseSentence'), keywords: 'change case sentence capitalise text', icon: Type, run: () => { if (!changeCaseSelection('sentence')) toast.warn(t('Select a text object first.')); } },
    { id: 'text.smartPunctuation', label: t('Smart Punctuation'), category: t('Arrange'), shortcut: getBinding('text.smartPunctuation'), keywords: 'smart punctuation curly quotes typographic apostrophe em dash ellipsis text', icon: Type, run: () => { const n = smartPunctuationSelection(); if (n) toast.success(`${n} ${t('text objects updated')}`); else toast.warn(t('Select a text object first.')); } },
    { id: 'text.fontSizeUp',   label: t('Increase Font Size'), category: t('Arrange'), shortcut: getBinding('text.fontSizeUp'), keywords: 'font size increase bigger larger text', icon: Type, run: () => { if (!adjustFontSize(2)) toast.warn(t('Select a text object first.')); } },
    { id: 'text.fontSizeDown', label: t('Decrease Font Size'), category: t('Arrange'), shortcut: getBinding('text.fontSizeDown'), keywords: 'font size decrease smaller text', icon: Type, run: () => { if (!adjustFontSize(-2)) toast.warn(t('Select a text object first.')); } },
    { id: 'text.trackingUp',   label: t('Increase Tracking'), category: t('Arrange'), shortcut: getBinding('text.trackingUp'), keywords: 'tracking letter spacing increase wider kerning text', icon: Type, run: () => { if (!adjustTracking(25)) toast.warn(t('Select a text object first.')); } },
    { id: 'text.trackingDown', label: t('Decrease Tracking'), category: t('Arrange'), shortcut: getBinding('text.trackingDown'), keywords: 'tracking letter spacing decrease tighter kerning text', icon: Type, run: () => { if (!adjustTracking(-25)) toast.warn(t('Select a text object first.')); } },
    { id: 'text.leadingUp',    label: t('Increase Leading'), category: t('Arrange'), shortcut: getBinding('text.leadingUp'), keywords: 'leading line height spacing increase looser text', icon: Type, run: () => { if (!adjustLeading(0.05)) toast.warn(t('Select a text object first.')); } },
    { id: 'text.leadingDown',  label: t('Decrease Leading'), category: t('Arrange'), shortcut: getBinding('text.leadingDown'), keywords: 'leading line height spacing decrease tighter text', icon: Type, run: () => { if (!adjustLeading(-0.05)) toast.warn(t('Select a text object first.')); } },
    { id: 'text.singleLine', label: t('Single-line Text…'), category: t('Arrange'), shortcut: getBinding('text.singleLine'), keywords: 'single line engraving hershey stroke text plotter v carve', icon: Type, run: () => setModal('showSingleLineText', true) },
    { id: 'text.arcUp',   label: `${t('Text on Arc')} ∩`, category: t('Arrange'), shortcut: getBinding('text.arcUp'), keywords: 'text arc curve circle badge seal up arch', icon: Type, run: () => { if (!applyTextOnArc(false)) toast.warn(t('Select a single text object to enable')); } },
    { id: 'text.arcDown', label: `${t('Text on Arc')} ∪`, category: t('Arrange'), shortcut: getBinding('text.arcDown'), keywords: 'text arc curve circle badge seal down arch', icon: Type, run: () => { if (!applyTextOnArc(true)) toast.warn(t('Select a single text object to enable')); } },
    { id: 'cut.outlineStroke',  label: t('Outline Stroke'),    category: t('Arrange'), keywords: 'stroke outline expand cut edges', icon: PenTool, run: () => {
      const objs = getCanvas()?.getActiveObjects() ?? [];
      if (!objs.length) { toast.warn(t('Select one or more shapes first.')); return; }
      const paths = outlineStrokeToCutPaths(objs);
      if (!paths.length) { toast.warn(t('Select shapes that have a stroke first.')); return; }
      const ed = useEditor.getState();
      ed.addCutPaths(paths);
      ed.setCutPathsVisible(true);
      toast.success(`${paths.length} ${t('cut paths')}`, { title: t('Outline Stroke') });
    } },
    { id: 'path.outlineStrokeFill', label: t('Outline Stroke to Fill'), category: t('Arrange'), keywords: 'outline stroke fill expand convert shape solid', icon: PenTool, run: () => { const n = outlineStrokeToFillSelection(); if (n) toast.success(`${n} ${t('strokes outlined')}`); else toast.warn(t('Select shapes that have a stroke first.')); } },
    { id: 'path.arrowStart',   label: t('Add Arrowhead (Start)'), category: t('Arrange'), keywords: 'arrowhead arrow start line dimension annotation', icon: PenTool, run: () => { const n = addArrowheads('start'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
    { id: 'path.arrowEnd',     label: t('Add Arrowhead (End)'), category: t('Arrange'), keywords: 'arrowhead arrow end line dimension annotation', icon: PenTool, run: () => { const n = addArrowheads('end'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
    { id: 'path.arrowBoth',    label: t('Add Arrowheads (Both)'), category: t('Arrange'), keywords: 'arrowhead arrow both ends line dimension annotation', icon: PenTool, run: () => { const n = addArrowheads('both'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
    { id: 'stroke.uniform', label: t('Constant Stroke Width'), category: t('Arrange'), keywords: 'stroke uniform constant scale width cut line', icon: AlignCenter, run: () => { const s = toggleUniformStroke(); if (s === null) toast.warn(t('Select an object first.')); else toast.success(s ? t('Stroke width is now constant') : t('Stroke width now scales')); } },
    { id: 'stroke.alignCenter', label: `${t('Stroke alignment')} — ${t('Center')}`, category: t('Arrange'), keywords: 'stroke align center default', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeAlign('center')) },
    { id: 'stroke.alignInside', label: `${t('Stroke alignment')} — ${t('Inside')}`, category: t('Arrange'), keywords: 'stroke align inside inner inset', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeAlign('inside')) },
    { id: 'stroke.alignOutside', label: `${t('Stroke alignment')} — ${t('Outside')}`, category: t('Arrange'), keywords: 'stroke align outside outer outset', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeAlign('outside')) },
    { id: 'stroke.width0', label: `${t('Stroke width')} — 0 px`, category: t('Arrange'), keywords: 'stroke width none no stroke hairline outline', icon: AlignCenter, run: () => runWithSelection(() => applyStyleToSelection({ strokeWidth: 0 })) },
    { id: 'stroke.width05', label: `${t('Stroke width')} — 0.5 px`, category: t('Arrange'), keywords: 'stroke width hairline thin cut line', icon: AlignCenter, run: () => runWithSelection(() => applyStyleToSelection({ strokeWidth: 0.5 })) },
    { id: 'stroke.width1', label: `${t('Stroke width')} — 1 px`, category: t('Arrange'), keywords: 'stroke width one cut line outline', icon: AlignCenter, run: () => runWithSelection(() => applyStyleToSelection({ strokeWidth: 1 })) },
    { id: 'stroke.width2', label: `${t('Stroke width')} — 2 px`, category: t('Arrange'), keywords: 'stroke width two outline sign', icon: AlignCenter, run: () => runWithSelection(() => applyStyleToSelection({ strokeWidth: 2 })) },
    { id: 'stroke.width4', label: `${t('Stroke width')} — 4 px`, category: t('Arrange'), keywords: 'stroke width four bold outline sign', icon: AlignCenter, run: () => runWithSelection(() => applyStyleToSelection({ strokeWidth: 4 })) },
    { id: 'stroke.width8', label: `${t('Stroke width')} — 8 px`, category: t('Arrange'), keywords: 'stroke width eight heavy outline sign', icon: AlignCenter, run: () => runWithSelection(() => applyStyleToSelection({ strokeWidth: 8 })) },
    { id: 'stroke.dashSolid', label: `${t('Dash')} — ${t('Solid')}`, category: t('Arrange'), keywords: 'stroke dash solid line cut path', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeDashArray: [] })) },
    { id: 'stroke.dashDashed', label: `${t('Dash')} — ${t('Dashed')}`, category: t('Arrange'), keywords: 'stroke dash dashed perforation cut path', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeDashArray: [10, 5] })) },
    { id: 'stroke.dashDotted', label: `${t('Dash')} — ${t('Dotted')}`, category: t('Arrange'), keywords: 'stroke dash dotted perforation cut path', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeDashArray: [2, 6] })) },
    { id: 'stroke.capButt', label: `${t('Line cap')} — ${t('Butt')}`, category: t('Arrange'), keywords: 'stroke line cap butt endpoint reset', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeLineCap: 'butt' })) },
    { id: 'stroke.capRound', label: `${t('Line cap')} — ${t('Round')}`, category: t('Arrange'), keywords: 'stroke line cap round endpoint', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeLineCap: 'round' })) },
    { id: 'stroke.capSquare', label: `${t('Line cap')} — ${t('Square')}`, category: t('Arrange'), keywords: 'stroke line cap square endpoint', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeLineCap: 'square' })) },
    { id: 'stroke.joinMiter', label: `${t('Line join')} — ${t('Miter')}`, category: t('Arrange'), keywords: 'stroke line join miter corner reset', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeLineJoin: 'miter' })) },
    { id: 'stroke.joinRound', label: `${t('Line join')} — ${t('Round')}`, category: t('Arrange'), keywords: 'stroke line join round corner', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeLineJoin: 'round' })) },
    { id: 'stroke.joinBevel', label: `${t('Line join')} — ${t('Bevel')}`, category: t('Arrange'), keywords: 'stroke line join bevel corner', icon: AlignCenter, run: () => runWithSelection(() => applyStrokeStyleToSelection({ strokeLineJoin: 'bevel' })) },
    { id: 'blend.normal', label: `${t('Blend mode')} — ${t('Normal')}`, category: t('Arrange'), keywords: 'blend mode normal source over opacity appearance', icon: Palette, run: () => runWithSelection(() => applyBlendModeToSelection('source-over')) },
    { id: 'blend.multiply', label: `${t('Blend mode')} — ${t('Multiply')}`, category: t('Arrange'), keywords: 'blend mode multiply darken transparency appearance', icon: Palette, run: () => runWithSelection(() => applyBlendModeToSelection('multiply')) },
    { id: 'blend.screen', label: `${t('Blend mode')} — ${t('Screen')}`, category: t('Arrange'), keywords: 'blend mode screen lighten transparency appearance', icon: Palette, run: () => runWithSelection(() => applyBlendModeToSelection('screen')) },
    { id: 'blend.overlay', label: `${t('Blend mode')} — ${t('Overlay')}`, category: t('Arrange'), keywords: 'blend mode overlay contrast transparency appearance', icon: Palette, run: () => runWithSelection(() => applyBlendModeToSelection('overlay')) },
    { id: 'blend.difference', label: `${t('Blend mode')} — ${t('Difference')}`, category: t('Arrange'), keywords: 'blend mode difference invert transparency appearance', icon: Palette, run: () => runWithSelection(() => applyBlendModeToSelection('difference')) },
    { id: 'pattern.checker', label: `${t('Pattern Fill')} — ${t('Checker')}`, category: t('Arrange'), keywords: 'pattern fill checker checkerboard vinyl texture swatch', icon: Palette, run: () => runWithSelection(() => applyPatternFill('checker', 16, '#ffffff', '#111827')) },
    { id: 'pattern.stripes', label: `${t('Pattern Fill')} — ${t('Stripes')}`, category: t('Arrange'), keywords: 'pattern fill stripes hatch stripe vinyl texture swatch', icon: Palette, run: () => runWithSelection(() => applyPatternFill('stripes', 16, '#ffffff', '#111827')) },
    { id: 'pattern.dots', label: `${t('Pattern Fill')} — ${t('Dots')}`, category: t('Arrange'), keywords: 'pattern fill dots polka halftone vinyl texture swatch', icon: Palette, run: () => runWithSelection(() => applyPatternFill('dots', 16, '#ffffff', '#111827')) },
    { id: 'pattern.crosshatch', label: `${t('Pattern Fill')} — ${t('Crosshatch')}`, category: t('Arrange'), keywords: 'pattern fill crosshatch hatch texture swatch', icon: Palette, run: () => runWithSelection(() => applyPatternFill('crosshatch', 16, '#ffffff', '#111827')) },
    { id: 'shadow.soft', label: `${t('Drop shadow')} — ${t('Soft Shadow')}`, category: t('Arrange'), keywords: 'drop shadow soft blur appearance depth', icon: Palette, run: () => runWithSelection(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 })) },
    { id: 'shadow.hard', label: `${t('Drop shadow')} — ${t('Hard Shadow')}`, category: t('Arrange'), keywords: 'drop shadow hard offset sign vinyl appearance', icon: Palette, run: () => runWithSelection(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.45)', blur: 0, offsetX: 5, offsetY: 5 })) },
    { id: 'shadow.glow', label: `${t('Drop shadow')} — ${t('Glow')}`, category: t('Arrange'), keywords: 'glow shadow neon halo appearance', icon: Palette, run: () => runWithSelection(() => applyShadowToSelection({ color: 'rgba(61,155,255,0.75)', blur: 16, offsetX: 0, offsetY: 0 })) },
    { id: 'shadow.clear', label: t('Clear Shadow'), category: t('Arrange'), keywords: 'remove clear drop shadow appearance', icon: Palette, run: () => runWithSelection(() => applyShadowToSelection(null)) },
    { id: 'opacity.100', label: `${t('Opacity')} — 100%`, category: t('Arrange'), keywords: 'opacity transparency alpha solid full appearance', icon: Palette, run: () => runWithSelection(() => applyStyleToSelection({ opacity: 1 })) },
    { id: 'opacity.75', label: `${t('Opacity')} — 75%`, category: t('Arrange'), keywords: 'opacity transparency alpha 75 appearance', icon: Palette, run: () => runWithSelection(() => applyStyleToSelection({ opacity: 0.75 })) },
    { id: 'opacity.50', label: `${t('Opacity')} — 50%`, category: t('Arrange'), keywords: 'opacity transparency alpha half appearance', icon: Palette, run: () => runWithSelection(() => applyStyleToSelection({ opacity: 0.5 })) },
    { id: 'opacity.25', label: `${t('Opacity')} — 25%`, category: t('Arrange'), keywords: 'opacity transparency alpha 25 appearance', icon: Palette, run: () => runWithSelection(() => applyStyleToSelection({ opacity: 0.25 })) },

    // ---------- View ----------
    { id: 'view.zoomIn',  label: t('Zoom In'),     category: t('View'), shortcut: getBinding('view.zoomIn'), icon: Plus,      run: () => zoomBy(1.25) },
    { id: 'view.zoomOut', label: t('Zoom Out'),    category: t('View'), shortcut: getBinding('view.zoomOut'), icon: Minus,     run: () => zoomBy(1 / 1.25) },
    { id: 'view.actualSize', label: t('Actual Size'), category: t('View'), shortcut: getBinding('view.actualSize'), keywords: 'actual size 100 percent real zoom reset', icon: Maximize2, run: () => zoomToPercent(100) },
    { id: 'view.zoomFit', label: t('Fit to Page'), category: t('View'), shortcut: getBinding('view.zoomFit'), icon: Maximize2, run: () => zoomFit() },
    { id: 'view.zoomSelection', label: t('Zoom to Selection'), category: t('View'), shortcut: getBinding('view.zoomSelection'), keywords: 'zoom selection fit frame focus selected', icon: Maximize2, run: () => { if (!zoomToSelection()) toast.warn(t('Select something first.')); } },
    { id: 'artboard.fromSelection', label: t('Create Artboard from Selection'), category: t('View'), keywords: 'create new artboard from selection bounds page frame', icon: Maximize2, run: () => { const ab = createArtboardFromSelection(); if (ab) toast.success(t('Artboard created')); else toast.warn(t('Select something first.')); } },
    { id: 'artboard.fitArtwork', label: t('Fit Artboard to Artwork'), category: t('View'), keywords: 'fit artboard artwork bounds crop resize', icon: Maximize2, run: () => { if (!fitArtboardToContent('all')) toast.warn(t('Nothing to fit.')); } },
    { id: 'artboard.fitSelection', label: t('Fit Artboard to Selection'), category: t('View'), keywords: 'fit artboard selection crop resize', icon: Maximize2, run: () => { if (!fitArtboardToContent('selection')) toast.warn(t('Select something first.')); } },
    { id: 'view.outline', label: outlineMode ? t('Hide Outline View') : t('Outline View'), category: t('View'), shortcut: getBinding('view.outline'), keywords: 'wireframe geometry preview', icon: PenTool, run: () => setOutlineMode(!isOutlineMode()) },
    { id: 'view.rulers', label: rulersVisible ? t('Hide Rulers') : t('Show Rulers'), category: t('View'), keywords: 'ruler rulers toggle show hide measure', icon: Grid3X3, run: () => { const s = useEditor.getState(); s.setRulersVisible(!s.rulersVisible); } },
    { id: 'view.grid', label: gridVisible ? t('Hide Grid') : t('Show Grid'), category: t('View'), keywords: 'grid toggle show hide layout precision', icon: Grid3X3, run: () => { const s = useEditor.getState(); s.setGridVisible(!s.gridVisible); } },
    { id: 'view.snapGrid', label: snapEnabled ? t('Disable Snap to Grid') : t('Snap to Grid'), category: t('View'), keywords: 'snap grid toggle align magnet precision layout', icon: Grid3X3, run: () => { const s = useEditor.getState(); s.setSnapEnabled(!s.snapEnabled); } },
    { id: 'view.smartGuides', label: smartGuidesEnabled ? t('Disable Smart Guides') : t('Smart Guides'), category: t('View'), keywords: 'smart guides snap align hints measure spacing illustrator', icon: Grid3X3, run: () => { const s = useEditor.getState(); s.setSmartGuidesEnabled(!s.smartGuidesEnabled); } },
    { id: 'view.anchorSnap', label: anchorSnapEnabled ? t('Disable Anchor Snap') : t('Anchor Snap'), category: t('View'), keywords: 'anchor snap point node path precision edit', icon: Grid3X3, run: () => { const s = useEditor.getState(); s.setAnchorSnapEnabled(!s.anchorSnapEnabled); } },
    { id: 'view.guides', label: guidesVisible ? t('Hide Guides') : t('Show Guides'), category: t('View'), shortcut: getBinding('view.toggleGuides'), keywords: 'guide guides toggle show hide ruler', icon: Grid3X3, run: () => { const s = useEditor.getState(); s.setGuidesVisible(!s.guidesVisible); } },
    { id: 'view.makeGuides', label: t('Make Guides from Selection'), category: t('View'), keywords: 'guide make convert selection bounds ruler', icon: Grid3X3, run: () => { const n = makeGuidesFromSelection(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('Select something first.')); } },
    { id: 'view.marginGuides', label: t('Margin Guides…'), category: t('View'), keywords: 'margin guides safe area frame inset artboard', icon: Grid3X3, run: () => setModal('showMarginGuides', true) },
    { id: 'view.clearGuides', label: t('Clear Guides'), category: t('View'), keywords: 'guide ruler remove delete', icon: Grid3X3, run: () => useEditor.getState().clearUserGuides() },
    { id: 'view.lockGuides', label: guidesLocked ? t('Unlock Guides') : t('Lock Guides'), category: t('View'), keywords: 'guide ruler lock freeze', icon: Grid3X3, run: () => useEditor.getState().setGuidesLocked(!useEditor.getState().guidesLocked) },
    { id: 'view.debug',   label: t('Toggle Debug'), category: t('View'), keywords: 'logs panel inspect',     icon: Bug,       run: onToggleDebug },

    // ---------- Window ----------
    { id: 'window.docSettings', label: t('Document Settings…'), category: t('Window'), keywords: 'doc size dpi background', icon: Settings2,  run: () => setModal('showDocSettings', true) },
    { id: 'window.preferences', label: t('Open Preferences…'),   category: t('Window'), shortcut: getBinding('window.preferences'), keywords: 'settings prefs config app',     icon: Settings2,  run: () => setModal('showPreferences', true) },
    { id: 'window.helpCenter',  label: t('Open Help Center'),   category: t('Window'), shortcut: getBinding('help.helpCenter'), keywords: 'docs manual reference guide', icon: BookOpen, run: () => setModal('showHelpCenter', true) },
    { id: 'window.shortcuts',   label: t('Keyboard Shortcuts'), category: t('Window'), shortcut: getBinding('help.shortcuts'), icon: Keyboard,   run: () => setModal('showShortcuts', true) },
    { id: 'window.keymapEditor', label: t('Customize Shortcuts…'), category: t('Window'), keywords: 'rebind remap keybinding hotkey custom', icon: Keyboard, run: () => setModal('showKeymapEditor', true) },
    { id: 'window.onboarding',  label: t('Onboarding…'),        category: t('Window'), keywords: 'tour welcome help start', icon: HelpCircle, run: onShowOnboarding },
    { id: 'window.checkUpdates', label: t('Check for Updates…'), category: t('Window'), keywords: 'update upgrade release version check', icon: HelpCircle, run: () => { void import('../lib/updater').then(m => m.checkAndPrompt({ announceNoUpdate: true })); } },
    { id: 'window.ai',          label: t('Open AI Panel'),      category: t('Window'), keywords: 'assistant chat',          icon: Sparkles,   run: onToggleAI },
    { id: 'window.debug',       label: t('Debug Panel'),        category: t('Window'), shortcut: getBinding('help.debugPanel'), keywords: 'debug logs diagnostics inspect developer', icon: Bug, run: onToggleDebug },
    { id: 'window.theme', label: theme === 'light' ? t('Dark Theme') : t('Light Theme'), category: t('Window'), shortcut: getBinding('view.toggleTheme'), keywords: 'light dark mode appearance theme toggle', icon: SunMoon, run: () => { const s = useEditor.getState(); s.setTheme(s.theme === 'light' ? 'dark' : 'light'); } },
    { id: 'window.highContrast', label: highContrast ? t('Disable High Contrast') : t('High Contrast'), category: t('Window'), keywords: 'accessibility contrast a11y readable theme', icon: SunMoon, run: () => { const s = useEditor.getState(); s.setHighContrast(!s.highContrast); } },

    // ---------- AI ----------
    { id: 'ai.critique',  label: t('✨ Critique design'),       category: t('AI'), keywords: 'review feedback improve',
      icon: Wand2,        run: () => aiPreset('Critique the current canvas design. Give 3 concrete, actionable improvements (visual hierarchy, balance, color, spacing). Be specific about which elements to change.') },
    { id: 'ai.palette',   label: t('🎨 Better palette'),        category: t('AI'), keywords: 'color colour scheme harmony',
      icon: Palette,      run: () => aiPreset('Suggest a more harmonious color palette for the current canvas and apply it. Use set_fill / set_stroke on the existing shapes when possible rather than regenerating.') },
    { id: 'ai.tidy',      label: t('📐 Tidy alignment'),        category: t('AI'), keywords: 'align distribute space cleanup',
      icon: AlignCenter,  run: () => aiPreset('Tidy up the alignment and spacing of the elements on this canvas. Use the align_objects and distribute_objects skills to perfectly align and evenly space everything. Do NOT regenerate any SVG.') },
    { id: 'ai.iconSet',   label: t('🧩 Convert to icon set'),   category: t('AI'), keywords: 'icons glyph set generate',
      icon: Grid3X3,      run: () => aiPreset('Convert the current canvas into a small, cohesive icon set — flat, line-based, consistent stroke widths, a unified palette. Replace the canvas with the new icon set as an SVG grid.') },
  // We intentionally do not depend on the callbacks here — they are stable for
  // the lifetime of the parent and the closures read fresh state on call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, recent, rulersVisible, gridVisible, snapEnabled, smartGuidesEnabled, anchorSnapEnabled, guidesVisible, guidesLocked, outlineMode, theme, highContrast]);

  // Filter + rank against the query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = commands
      .map((c, i) => ({ c, i, s: score(c, q) }))
      .filter((x) => x.s !== Infinity)
      .sort((a, b) => a.s - b.s || a.i - b.i);
    return ranked.map((x) => x.c);
  }, [commands, query]);

  // Reset state during render on open-transition (no cascading effect).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }
  // Focus the input after open — DOM side-effects belong in an effect.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Derive a safe-clamped active index in render — avoids the setState-in-effect
  // cascade and the one-frame mismatch where the highlight pointed at a stale row.
  const safeActive = active >= filtered.length ? 0 : active;

  // Scroll the active item into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  if (!open) return null;

  const run = (cmd: Command) => {
    close();
    // Run on the next tick so the close animation can begin without React
    // flushing a state update inside the command (e.g. setTool) at the same
    // time we unmount.
    setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // IME guard — Enter during pinyin/kana composition commits the
      // candidate into the search box, not the active command.
      e.preventDefault();
      const cmd = filtered[safeActive];
      if (cmd) run(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        setQuery('');
        setActive(0);
      } else {
        close();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, filtered.length - 1));
    } else if (e.key === 'PageDown') {
      // Jump by 10 to match the WAI-ARIA listbox pattern — useful when the
      // empty-query view lists every command and the user wants to skim
      // without holding ArrowDown.
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 10));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 10));
    }
  };

  const handleSearchActionKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const actions = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-command-search-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? actions.length - 1
        : e.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    e.preventDefault();
    const nextAction = actions[nextIndex];
    setReviewedSearchAction(nextAction?.dataset.commandSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center"
      style={{ paddingTop: '18vh' }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t('Command Palette')}
    >
      <div
        className="w-[520px] max-w-[95vw] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-panel2">
          <Search size={14} className="text-muted shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('Type a command or search…')}
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-label={t('Command Palette')}
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[safeActive] ? `cmd-${filtered[safeActive].id}` : undefined}
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-muted"
          />
          {query && (
            <div
              className="flex items-center gap-1 shrink-0"
              role="toolbar"
              aria-label={t('Command search actions')}
              aria-describedby="command-search-action-review-status"
              title={t('Use arrow keys to review command search actions')}
              onKeyDown={handleSearchActionKeys}
            >
              <span id="command-search-action-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedSearchAction || t('Command search actions')}`}
              </span>
              <button
                type="button"
                className="btn !py-1 !px-2 text-[10px] shrink-0"
                data-command-search-action
                data-command-search-action-review={t('Run first search result')}
                onFocus={() => setReviewedSearchAction(t('Run first search result'))}
                onClick={() => {
                  const cmd = filtered[0];
                  if (cmd) run(cmd);
                }}
                disabled={filtered.length === 0}
                title={t('Run first search result')}
              >
                {t('Run First')}
              </button>
              <button
                type="button"
                className="btn !py-1 !px-2 text-[10px] shrink-0"
                data-command-search-action
                data-command-search-action-review={t('Clear search')}
                onFocus={() => setReviewedSearchAction(t('Clear search'))}
                onClick={() => { setQuery(''); setActive(0); inputRef.current?.focus(); }}
                title={t('Clear search')}
              >
                {t('Clear search')}
              </button>
            </div>
          )}
          <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
            {query.trim() ? `${filtered.length} / ${commands.length} ${t('matches')}` : `${commands.length} ${t('commands')}`}
          </span>
          <Kbd combo="Esc" />
        </div>
        <div id="command-review-status" className="sr-only" aria-live="polite">
          {filtered[safeActive]
            ? `${t('Reviewing')} ${filtered[safeActive].label} ${safeActive + 1} / ${filtered.length}. ${t('Press Enter to run')}`
            : t('No commands found.')}
        </div>
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          // axe `aria-input-field-name` flags listboxes without a name.
          aria-label={t('Available commands')}
          aria-describedby="command-review-status"
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center px-4 py-8" role="presentation">
              {/* Search-glass with empty inner — consistent line-art style with
                  the other empty states (Layers / Assets / Symbols / Artboards). */}
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <circle cx="19" cy="19" r="11" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.2" />
                <line x1="27" y1="27" x2="36" y2="36" stroke="rgb(var(--color-accent2))" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="19" x2="24" y2="19" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
                <line x1="14" y1="14" x2="20" y2="14" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
                <line x1="14" y1="24" x2="22" y2="24" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No commands found.')}</div>
              <div className="type-caption leading-relaxed max-w-[260px]">
                {t('Try a different keyword — tool, file, edit, view, AI…')}
              </div>
              {query && (
                <button
                  type="button"
                  className="btn !py-1 !px-2 text-[10px] mt-2"
                  onClick={() => { setQuery(''); setActive(0); inputRef.current?.focus(); }}
                >
                  {t('Clear search')}
                </button>
              )}
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isActive = idx === safeActive;
              return (
                <button
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isActive}
                  aria-label={cmd.label}
                  aria-keyshortcuts={ariaKeyshortcuts(cmd.shortcut)}
                  onClick={() => run(cmd)}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full h-8 flex items-center gap-2 px-3 text-left text-xs transition-colors ${
                    isActive ? 'bg-panel3 text-ink' : 'text-ink/90 hover:bg-panel3/60'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span className="flex-1 truncate">{cmd.label}</span>
                  <span className="field-label !mb-0 text-[9px]">
                    {cmd.category}
                  </span>
                  {cmd.shortcut && (
                    <span className="ml-1">
                      <Kbd combo={cmd.shortcut} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-panel2 text-[10px] text-muted">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><Kbd combo="↑" /><Kbd combo="↓" /> {t('navigate')}</span>
            <span className="flex items-center gap-1"><Kbd combo="Home" /><Kbd combo="End" /> {t('first / last')}</span>
            <span className="flex items-center gap-1"><Kbd combo="PgUp" /><Kbd combo="PgDn" /> {t('jump')}</span>
            <span className="flex items-center gap-1"><Kbd combo="Enter" /> {t('run')}</span>
            <span className="flex items-center gap-1"><Kbd combo="Esc" /> {t('clear / close')}</span>
          </div>
          <span className="tabular-nums">
            {query.trim() ? `${filtered.length} / ${commands.length}` : filtered.length}
          </span>
        </div>
      </div>
    </div>
  );
}
