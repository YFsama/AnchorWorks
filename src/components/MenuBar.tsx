import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Undo2, Redo2, Sparkles, Printer, Send, FileImage, Settings2, Layers, Hash, Magnet, Crosshair, Target, X, Globe, Check, ChevronRight, Sheet, Grid3X3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { undo, redo, zoomBy, zoomFit, zoomToPoint, zoomToPercent, zoomToAllArtboards, zoomToActiveArtboard, zoomToAdjacentArtboard, zoomToSelection, getCanvas, duplicateSelection, deleteSelection, autoArrangeSelection, flipSelection, lockSelection, lockOthers, lockActiveArtboard, lockOtherArtboards, unlockSelection, unlockActiveArtboard, unlockOtherArtboards, unlockAll, hideSelection, hideOthers, hideActiveArtboard, hideOtherArtboards, showSelection, showActiveArtboard, showOtherArtboards, showAll, makeGuidesFromSelection, releaseGuides, selectAllObjects, selectVisibleObjects, selectVisibleActiveArtboardObjects, selectUnlockedObjects, selectUnlockedActiveArtboardObjects, selectLockedObjects, selectLockedActiveArtboardObjects, selectHiddenObjects, selectHiddenActiveArtboardObjects, fixHiddenObjects, fixHiddenActiveArtboardObjects, selectNamedObjects, selectNamedActiveArtboardObjects, selectUnnamedObjects, selectUnnamedActiveArtboardObjects, selectClippingMaskedObjects, selectClippingMaskedActiveArtboardObjects, selectOpenPathObjects, selectOpenPathActiveArtboardObjects, selectCompoundPathObjects, selectCompoundPathActiveArtboardObjects, selectStrayPointObjects, selectStrayPointActiveArtboardObjects, fixAllCleanupObjects, fixAllCleanupActiveArtboardObjects, fixStrayPointObjects, fixStrayPointActiveArtboardObjects, selectZeroLengthPathObjects, selectZeroLengthPathActiveArtboardObjects, fixZeroLengthPathObjects, fixZeroLengthPathActiveArtboardObjects, selectZeroSizeObjects, selectZeroSizeActiveArtboardObjects, fixZeroSizeObjects, fixZeroSizeActiveArtboardObjects, selectEmptyGroupObjects, selectEmptyGroupActiveArtboardObjects, fixEmptyGroupObjects, fixEmptyGroupActiveArtboardObjects, selectUnpaintedObjects, selectUnpaintedActiveArtboardObjects, fixUnpaintedObjects, fixUnpaintedActiveArtboardObjects, selectDropShadowObjects, selectDropShadowActiveArtboardObjects, selectTransparencyObjects, selectTransparencyActiveArtboardObjects, fixTransparencyObjects, fixTransparencyActiveArtboardObjects, selectFullyTransparentObjects, selectFullyTransparentActiveArtboardObjects, fixFullyTransparentObjects, fixFullyTransparentActiveArtboardObjects, selectDashedStrokeObjects, selectDashedStrokeActiveArtboardObjects, fixDashedStrokeObjects, fixDashedStrokeActiveArtboardObjects, selectThinStrokeObjects, selectThinStrokeActiveArtboardObjects, fixThinStrokeObjects, fixThinStrokeActiveArtboardObjects, selectOverprintObjects, selectOverprintActiveArtboardObjects, fixOverprintObjects, fixOverprintActiveArtboardObjects, selectWhiteOverprintObjects, selectWhiteOverprintActiveArtboardObjects, fixWhiteOverprintObjects, fixWhiteOverprintActiveArtboardObjects, fixAllPrepressRisks, fixAllPrepressRisksActiveArtboard, selectSpotColorObjects, selectSpotColorActiveArtboardObjects, fixSpotColorObjects, fixSpotColorActiveArtboardObjects, selectRgbColorObjects, selectRgbColorActiveArtboardObjects, fixRgbColorObjects, fixRgbColorActiveArtboardObjects, selectGrayscaleColorObjects, selectGrayscaleColorActiveArtboardObjects, fixGrayscaleColorObjects, fixGrayscaleColorActiveArtboardObjects, selectLabColorObjects, selectLabColorActiveArtboardObjects, fixLabColorObjects, fixLabColorActiveArtboardObjects, selectNonCmykColorObjects, selectNonCmykColorActiveArtboardObjects, fixNonCmykColorObjects, fixNonCmykColorActiveArtboardObjects, selectPrintMarkObjects, selectPrintMarkActiveArtboardObjects, selectRichBlackObjects, selectRichBlackActiveArtboardObjects, fixRichBlackObjects, fixRichBlackActiveArtboardObjects, selectOverInkLimitObjects, selectOverInkLimitActiveArtboardObjects, fixOverInkLimitObjects, fixOverInkLimitActiveArtboardObjects, selectRegistrationColorObjects, selectRegistrationColorActiveArtboardObjects, fixRegistrationColorObjects, fixRegistrationColorActiveArtboardObjects, selectActiveArtboardObjects, selectSameArtboardObjects, selectInsideActiveArtboardObjects, selectOverflowingActiveArtboardObjects, selectOtherArtboardsObjects, selectOutsideArtboardObjects, selectOutsideAnyArtboardObjects, fixOutsideArtboardObjects, fixOutsideAnyArtboardObjects, selectInsideArtboardObjects, selectInsideAnyArtboardObjects, selectOverflowingArtboardObjects, selectOverflowingAnyArtboardObjects, selectCustomStrokeObjects, selectCustomStrokeActiveArtboardObjects, selectNonScalingStrokeObjects, selectNonScalingStrokeActiveArtboardObjects, selectPatternFillObjects, selectPatternFillActiveArtboardObjects, selectGradientFillObjects, selectGradientFillActiveArtboardObjects, deselectAll, promptRenameSelection, selectSame, selectSameActiveArtboard, selectSameType, selectSameTypeActiveArtboardObjects, selectInverse, selectObjectInStack, selectAllText, selectAllTextActiveArtboardObjects, selectPointTextObjects, selectPointTextActiveArtboardObjects, selectAreaTextObjects, selectAreaTextActiveArtboardObjects, selectOverflowingTextObjects, selectOverflowingTextActiveArtboardObjects, selectEmptyTextObjects, selectEmptyTextActiveArtboardObjects, fixEmptyTextObjects, fixEmptyTextActiveArtboardObjects, selectTextOnPathObjects, selectTextOnPathActiveArtboardObjects, selectMissingFontTextObjects, selectMissingFontTextActiveArtboardObjects, selectCustomTextSpacingObjects, selectCustomTextSpacingActiveArtboardObjects, selectDecoratedTextObjects, selectDecoratedTextActiveArtboardObjects, selectStyledTextObjects, selectStyledTextActiveArtboardObjects, selectTransformedTextObjects, selectTransformedTextActiveArtboardObjects, selectMixedStyleTextObjects, selectMixedStyleTextActiveArtboardObjects, selectNonLeftAlignedTextObjects, selectNonLeftAlignedTextActiveArtboardObjects, selectAllImages, selectAllImagesActiveArtboardObjects, selectFilteredImageObjects, selectFilteredImageActiveArtboardObjects, fixFilteredImageObjects, fixFilteredImageActiveArtboardObjects, selectCroppedImageObjects, selectCroppedImageActiveArtboardObjects, fixCroppedImageObjects, fixCroppedImageActiveArtboardObjects, selectEmbeddedImageObjects, selectEmbeddedImageActiveArtboardObjects, selectLinkedImageObjects, selectLinkedImageActiveArtboardObjects, selectUnknownSourceImageObjects, selectUnknownSourceImageActiveArtboardObjects, selectEmbeddableLinkedImageObjects, selectEmbeddableLinkedImageActiveArtboardObjects, selectNotEmbeddableLinkedImageObjects, selectNotEmbeddableLinkedImageActiveArtboardObjects, selectImageHandoffRiskObjects, selectImageHandoffRiskActiveArtboardObjects, embedLinkedImageObjects, embedLinkedImageActiveArtboardObjects, restoreEmbeddedImageLinkObjects, restoreEmbeddedImageLinkActiveArtboardObjects, selectRestorableEmbeddedImageLinkObjects, selectRestorableEmbeddedImageLinkActiveArtboardObjects, selectMissingLinkedImageObjects, selectMissingLinkedImageActiveArtboardObjects, fixMissingLinkedImageObjects, fixMissingLinkedImageActiveArtboardObjects, selectTransformedImageObjects, selectTransformedImageActiveArtboardObjects, fixTransformedImageObjects, fixTransformedImageActiveArtboardObjects, selectLowResolutionImageObjects, selectLowResolutionImageActiveArtboardObjects, fixLowResolutionImageObjects, fixLowResolutionImageActiveArtboardObjects, selectHighResolutionImageObjects, selectHighResolutionImageActiveArtboardObjects, fixHighResolutionImageObjects, fixHighResolutionImageActiveArtboardObjects, imageLinksSummary, imageLinksActiveArtboardSummary, imagePreflightSummary, imagePreflightActiveArtboardSummary, selectAllImagePreflightObjects, selectAllImagePreflightActiveArtboardObjects, fixAllImagePreflightObjects, fixAllImagePreflightActiveArtboardObjects, selectImagePreflightReviewObjects, selectImagePreflightReviewActiveArtboardObjects, clearImagePreflightReviewObjects, clearImagePreflightReviewActiveArtboardObjects, selectTransformedObjects, selectTransformedActiveArtboardObjects, selectAllPaths, selectAllPathsActiveArtboardObjects, selectAllShapes, selectAllShapesActiveArtboardObjects, selectAllGroups, selectAllGroupsActiveArtboardObjects, groupSelection, ungroupSelection, ungroupAll, bringForward, sendBackward, sendToBack, bringToFront, applyStyleToSelection, swapFillStroke, defaultColors, alignSelection, distributeSelection, distributeInArtboard, centerOnArtboard, setKeyObject } from '../lib/canvasEngine';
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
import { addMeasureProofManifest, addMeasureProofRevisionHistory, addMeasureProofApprovalAudit, addMeasureProofPackageCover, addMeasureProofDeliveryChecklist, addMeasureProofReleaseStamp, addMeasureProofPackageIndex, addMeasureProofDeliveryContact, addMeasureProofDeliverySchedule, addMeasureProofDeliveryRoute, addMeasureProofFulfillmentHandoff, addMeasureProofInstallHandoff, addMeasureProofSiteReadiness, addMeasureProofInstallPunchList, addMeasureProofClientAcceptance, addMeasureProofWarrantyInfo, addMeasureProofCareInstructions, addMeasureProofAssetArchive, addMeasureProofFileVerification, addSelectionAreaLabel, addSelectionCenterMark, addSelectionCornerMarks, addSelectionDimensions, addSelectionInsetFrame, addSelectionMarginFrame, addSelectionProductionMarks, addPrintMarksFromMeasureAnnotations, addCutContourFromMeasureAnnotations, addBridgedCutContourFromMeasureAnnotations, addRegistrationMarksFromMeasureAnnotations, addWeedBorderFromMeasureAnnotations, addGrommetsFromMeasureAnnotations, addRhinestonesFromMeasureAnnotations, preparePrintAndCutFromMeasureAnnotations, prepareBannerFinishingFromMeasureAnnotations, prepareStencilCutFromMeasureAnnotations, prepareRhinestoneTemplateFromMeasureAnnotations, prepareProofPageFromMeasureAnnotations, prepareProofPagesFromMeasureAnnotations, bringMeasureAnnotationsToFront, clearMeasureAnnotations, clearMeasureProofSheetObjects, commitDimension, setMeasureProofApprovalStatus, setMeasureProofJobInfo, setMeasureProofSignoff, setMeasureProofDeliveryContact, setMeasureProofDeliverySchedule, setMeasureProofDeliveryRoute, setMeasureProofFulfillmentHandoff, setMeasureProofInstallHandoff, setMeasureProofSiteReadiness, setMeasureProofInstallPunchList, setMeasureProofClientAcceptance, setMeasureProofWarrantyInfo, setMeasureProofCareInstructions, setMeasureProofAssetArchive, setMeasureProofFileVerification, duplicateMeasureAnnotationsToSelection, editMeasureAnnotations, hideMeasureAnnotations, lockMeasureAnnotations, makeArtboardFromMeasureAnnotations, makeCenterGuidesFromMeasureAnnotations, makeFullGuidesFromMeasureAnnotations, makeGuidesFromMeasureAnnotations, makeMarginArtboardFromMeasureAnnotations, makeMarginFullGuidesFromMeasureAnnotations, makeMarginGuidesFromMeasureAnnotations, proofMeasureAnnotations, resizeArtboardToMeasureAnnotations, selectMeasureAnnotations, selectMeasureProofObjectsByStatus, selectMeasureProofDeliveryBlockers, showMeasureAnnotations, unlockMeasureAnnotations } from '../lib/tools/measureTool';
import { exportSelectionSVG, exportSelectionPNG, copySelectionSVG } from '../lib/exportSelection';
import { createArtboardFromSelection, deleteActiveArtboard, duplicateActiveArtboard, duplicateActiveArtboardFrame, exportActiveArtboardAsPNG, exportActiveArtboardAsSVG, exportAllArtboardsAsFiles, exportAllArtboardsAsPNG, promptExportArtboardRangeAsPNG, promptExportArtboardRangeAsSVG, promptRearrangeArtboards, promptRenameActiveArtboard, renumberArtboardsByPosition, reorderActiveArtboard, sortArtboardsByPosition } from '../lib/artboards';
import { booleanOp, divideSelection, trimSelection, cropSelection, mergeSelection, mergeSameFillSelection } from '../lib/booleanOps';
import { rasterizeSelection } from '../lib/rasterize';
import { invertColorsSelection, grayscaleColorsSelection } from '../lib/colorAdjust';
import { applyClipMask, releaseClipMask, expandClippingMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
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
import { envelopeSelection } from '../lib/envelope';
import { addPlotterBridges, addPlotterGrommets, addPlotterRegistrationMarks, addPlotterRhinestones, addPlotterWeedBorder, clearPlotterBridges, clearPlotterRegistrationMarks, clearPlotterWeedBorders, savePlotterTestCut } from '../lib/cutPrepActions';
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

const imagePreflightSummaryText = (summary: ReturnType<typeof imagePreflightSummary>) => `Image preflight: ${summary.total} total · ${summary.filtered} filters · ${summary.cropped} crops · ${summary.transformed} transforms · ${summary.lowResolution} low PPI · ${summary.highResolution} high PPI · ${summary.missingLinked} missing links · ${summary.reviewMarked} marked`;
const imageLinksSummaryText = (summary: ReturnType<typeof imageLinksSummary>) => `Image links: ${summary.total} total · ${summary.linked} linked · ${summary.embedded} embedded · ${summary.missingLinked} missing · ${summary.embeddable} embeddable · ${summary.notEmbeddableLinked} not embeddable · ${summary.restorable} restorable · ${summary.unknownSource} unknown`;

export function MenuBar({ onToggleAI, onToggleDebug, onShowOnboarding }: Props) {
  const t = useT();
  const copyImageHandoffReport = (report: string) => {
    void navigator.clipboard.writeText(report)
      .then(() => toast.success(t('Image handoff report copied')))
      .catch(() => toast.info(report));
  };
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
        { label: t('Import PDF…'), onClick: () => pdfRef.current?.click() },
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
        { label: t('Export Active Artboard (SVG)'), onClick: () => { void exportActiveArtboardAsSVG().then(ok => { if (ok) toast.success(t('Artboard exported')); else toast.warn(t('Select an object on or near an artboard first.')); }); } },
        { label: t('Export Active Artboard (PNG)'), onClick: () => { if (exportActiveArtboardAsPNG()) toast.success(t('Artboard exported')); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Export All Artboards (SVG)'), onClick: () => { void exportAllArtboardsAsFiles().then(n => { if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); } },
        { label: t('Export All Artboards (PNG)'), onClick: () => { const n = exportAllArtboardsAsPNG(); if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); } },
        { label: t('Export Artboard Range (SVG)…'), onClick: () => { void promptExportArtboardRangeAsSVG(t('Artboard range'), '1').then(n => { if (n == null) toast.warn(t('Invalid artboard range.')); else if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); }); } },
        { label: t('Export Artboard Range (PNG)…'), onClick: () => { const n = promptExportArtboardRangeAsPNG(t('Artboard range'), '1'); if (n == null) toast.warn(t('Invalid artboard range.')); else if (n) toast.success(`${n} ${t('artboards exported')}`); else toast.warn(t('No artboards to export.')); } },
        { label: t('Export Selection as SVG'), onClick: () => { void exportSelectionSVG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
        { label: t('Export Selection as PNG'), onClick: () => { void exportSelectionPNG().then(ok => { if (!ok) toast.warn(t('Select something first.')); }); } },
        { label: t('Copy as SVG'), onClick: () => { void copySelectionSVG().then(r => { if (r === 'ok') toast.success(t('SVG copied to clipboard')); else if (r === 'empty') toast.warn(t('Select something first.')); else toast.warn(t('Clipboard unavailable.')); }); } },
        { sep: true },
        { label: t('Print…'), onClick: () => setModal('showPrint', true), kbd: getBinding('file.print') },
        { label: t('Print Prep…'), onClick: openPrintPrep },
        { label: t('Add Print Marks'), onClick: () => { const n = addPrintMarksToArtboard(); if (n) toast.success(`${n} ${t('print marks added')}`); else toast.warn(t('No artboard for print marks.')); } },
        { label: t('Clear Print Marks'), onClick: () => { const n = clearPrintMarks(); if (n) toast.success(`${n} ${t('print marks cleared')}`); else toast.warn(t('No print marks.')); } },
        { label: t('Tile Print…'), onClick: () => setModal('showTilePrint', true), kbd: getBinding('file.tilePrint') },
        { label: t('Auto-arrange (Nest)'), onClick: runAutoNest },
        { label: t('Nest (rotation-aware)'), onClick: runRotationNest },
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
        { label: t('Epson maintenance…'), onClick: () => setModal('showEpsonMaint', true) },
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
        { label: t('Select Visible Active Artboard Objects'), onClick: () => { const n = selectVisibleActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Select Unlocked Objects'), onClick: () => { const n = selectUnlockedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unlocked objects.')); } },
        { label: t('Select Unlocked Active Artboard Objects'), onClick: () => { const n = selectUnlockedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Select Locked Objects'), onClick: () => { const n = selectLockedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No locked objects.')); } },
        { label: t('Select Locked Active Artboard Objects'), onClick: () => { const n = selectLockedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Select Hidden Objects'), onClick: () => { const n = selectHiddenObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No hidden objects.')); } },
        { label: t('Select Hidden Active Artboard Objects'), onClick: () => { const n = selectHiddenActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Fix Hidden Objects'), onClick: () => { const n = fixHiddenObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No hidden objects.')); } },
        { label: t('Fix Hidden Active Artboard Objects'), onClick: () => { const n = fixHiddenActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Select Same'), sub: [
          { label: t('Select Same Fill'), onClick: () => { const n = selectSame('fill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Fill Appearance'), onClick: () => { const n = selectSame('fillAppearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a fill first.')); } },
          { label: t('Select Same Fill Appearance Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('fillAppearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Stroke'), onClick: () => { const n = selectSame('stroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Fill & Stroke'), onClick: () => { const n = selectSame('fillStroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a solid colour first.')); } },
          { label: t('Select Same Fill & Stroke Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('fillStroke'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Stroke Appearance'), onClick: () => { const n = selectSame('strokeAppearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a stroke first.')); } },
          { label: t('Select Same Stroke Appearance Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('strokeAppearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Stroke Weight'), onClick: () => { const n = selectSame('strokeWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Stroke Weight Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('strokeWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Opacity'), onClick: () => { const n = selectSame('opacity'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Opacity Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('opacity'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Font Family'), onClick: () => { const n = selectSame('fontFamily'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Font Family Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('fontFamily'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Font Size'), onClick: () => { const n = selectSame('fontSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Font Size Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('fontSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Text Appearance'), onClick: () => { const n = selectSame('textAppearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a text object first.')); } },
          { label: t('Select Same Text Appearance Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('textAppearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Blend Mode'), onClick: () => { const n = selectSame('globalCompositeOperation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Blend Mode Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('globalCompositeOperation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Dash'), onClick: () => { const n = selectSame('strokeDashArray'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Dash Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('strokeDashArray'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Line Cap'), onClick: () => { const n = selectSame('strokeLineCap'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Line Cap Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('strokeLineCap'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Line Join'), onClick: () => { const n = selectSame('strokeLineJoin'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Line Join Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('strokeLineJoin'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Type'), onClick: () => { const n = selectSameType(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Type Active Artboard Objects'), onClick: () => { const n = selectSameTypeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same X Position'), onClick: () => { const n = selectSame('objectX'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same X Position Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectX'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Y Position'), onClick: () => { const n = selectSame('objectY'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Y Position Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectY'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Position'), onClick: () => { const n = selectSame('objectPosition'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Position Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectPosition'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Right Edge'), onClick: () => { const n = selectSame('objectRight'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Right Edge Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectRight'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Bottom Edge'), onClick: () => { const n = selectSame('objectBottom'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Bottom Edge Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectBottom'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Bounds'), onClick: () => { const n = selectSame('objectBounds'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Bounds Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectBounds'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Center X'), onClick: () => { const n = selectSame('objectCenterX'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Center X Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectCenterX'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Center Y'), onClick: () => { const n = selectSame('objectCenterY'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Center Y Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectCenterY'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Center'), onClick: () => { const n = selectSame('objectCenter'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Center Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectCenter'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Width'), onClick: () => { const n = selectSame('objectWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Width Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectWidth'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Height'), onClick: () => { const n = selectSame('objectHeight'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Height Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectHeight'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Object Size'), onClick: () => { const n = selectSame('objectSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Object Size Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectSize'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Area'), onClick: () => { const n = selectSame('objectArea'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Area Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectArea'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Aspect Ratio'), onClick: () => { const n = selectSame('objectAspectRatio'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Aspect Ratio Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectAspectRatio'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Scale'), onClick: () => { const n = selectSame('objectScale'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Scale Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectScale'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Skew'), onClick: () => { const n = selectSame('objectSkew'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Skew Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectSkew'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Rotation'), onClick: () => { const n = selectSame('objectRotation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Rotation Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectRotation'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Transform'), onClick: () => { const n = selectSame('objectTransform'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Transform Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('objectTransform'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Artboard Placement'), onClick: () => { const n = selectSame('artboardPlacement'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Artboard Placement Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('artboardPlacement'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Any-Artboard Placement'), onClick: () => { const n = selectSame('artboardAnyPlacement'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Any-Artboard Placement Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('artboardAnyPlacement'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Name'), onClick: () => { const n = selectSame('name'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a named object first.')); } },
          { label: t('Select Same Name Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('name'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Appearance'), onClick: () => { const n = selectSame('appearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object first.')); } },
          { label: t('Select Same Appearance Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('appearance'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Shadow'), onClick: () => { const n = selectSame('shadow'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a drop shadow first.')); } },
          { label: t('Select Same Shadow Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('shadow'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Pattern Fill'), onClick: () => { const n = selectSame('patternSpec'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a pattern fill first.')); } },
          { label: t('Select Same Pattern Fill Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('patternSpec'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Gradient Fill'), onClick: () => { const n = selectSame('gradientFill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object with a gradient fill first.')); } },
          { label: t('Select Same Gradient Fill Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('gradientFill'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Overprint'), onClick: () => { const n = selectSame('overprint'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an overprint object first.')); } },
          { label: t('Select Same Overprint Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('overprint'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Print Mark Type'), onClick: () => { const n = selectSame('printMarkKind'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a print mark first.')); } },
          { label: t('Select Same Print Mark Type Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('printMarkKind'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Symbol'), onClick: () => { const n = selectSame('symbolId'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a symbol instance first.')); } },
          { label: t('Select Same Symbol Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('symbolId'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Clipping Mask'), onClick: () => { const n = selectSame('clipPath'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select a clipping group first.')); } },
          { label: t('Select Same Clipping Mask Active Artboard Objects'), onClick: () => { const n = selectSameActiveArtboard('clipPath'); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        ] },
        { label: t('Select Object'), sub: [
          { label: t('Select All Text Objects'), onClick: () => { const n = selectAllText(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No text objects.')); } },
          { label: t('Select All Text Active Artboard Objects'), onClick: () => { const n = selectAllTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Point Text Objects'), onClick: () => { const n = selectPointTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No point text objects.')); } },
          { label: t('Select Point Text Active Artboard Objects'), onClick: () => { const n = selectPointTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Area Text Objects'), onClick: () => { const n = selectAreaTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No area text objects.')); } },
          { label: t('Select Area Text Active Artboard Objects'), onClick: () => { const n = selectAreaTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Overflowing Text Objects'), onClick: () => { const n = selectOverflowingTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No overflowing text objects.')); } },
          { label: t('Select Overflowing Text Active Artboard Objects'), onClick: () => { const n = selectOverflowingTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Empty Text Objects'), onClick: () => { const n = selectEmptyTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No empty text objects.')); } },
          { label: t('Select Empty Text Active Artboard Objects'), onClick: () => { const n = selectEmptyTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Empty Text Objects'), onClick: () => { const n = fixEmptyTextObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No empty text objects.')); } },
          { label: t('Fix Empty Text Active Artboard Objects'), onClick: () => { const n = fixEmptyTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Text on Path Objects'), onClick: () => { const n = selectTextOnPathObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No text on path objects.')); } },
          { label: t('Select Text on Path Active Artboard Objects'), onClick: () => { const n = selectTextOnPathActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Missing Font Text Objects'), onClick: () => { const n = selectMissingFontTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No missing font text objects.')); } },
          { label: t('Select Missing Font Text Active Artboard Objects'), onClick: () => { const n = selectMissingFontTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Custom Text Spacing Objects'), onClick: () => { const n = selectCustomTextSpacingObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No custom text spacing objects.')); } },
          { label: t('Select Custom Text Spacing Active Artboard Objects'), onClick: () => { const n = selectCustomTextSpacingActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Decorated Text Objects'), onClick: () => { const n = selectDecoratedTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No decorated text objects.')); } },
          { label: t('Select Decorated Text Active Artboard Objects'), onClick: () => { const n = selectDecoratedTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Non-Left Aligned Text Objects'), onClick: () => { const n = selectNonLeftAlignedTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No non-left aligned text objects.')); } },
          { label: t('Select Non-Left Aligned Text Active Artboard Objects'), onClick: () => { const n = selectNonLeftAlignedTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Styled Text Objects'), onClick: () => { const n = selectStyledTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No styled text objects.')); } },
          { label: t('Select Styled Text Active Artboard Objects'), onClick: () => { const n = selectStyledTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Transformed Text Objects'), onClick: () => { const n = selectTransformedTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No transformed text objects.')); } },
          { label: t('Select Transformed Text Active Artboard Objects'), onClick: () => { const n = selectTransformedTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Mixed Style Text Objects'), onClick: () => { const n = selectMixedStyleTextObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No mixed style text objects.')); } },
          { label: t('Select Mixed Style Text Active Artboard Objects'), onClick: () => { const n = selectMixedStyleTextActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select All Image Objects'), onClick: () => { const n = selectAllImages(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image objects.')); } },
          { label: t('Select All Image Active Artboard Objects'), onClick: () => { const n = selectAllImagesActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Filtered Image Objects'), onClick: () => { const n = selectFilteredImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No filtered image objects.')); } },
          { label: t('Select Filtered Image Active Artboard Objects'), onClick: () => { const n = selectFilteredImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Filtered Image Objects'), onClick: () => { const n = fixFilteredImageObjects(); if (n) toast.success(`${n} ${t('image filters cleared')}`); else toast.warn(t('No filtered image objects.')); } },
          { label: t('Fix Filtered Image Active Artboard Objects'), onClick: () => { const n = fixFilteredImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('image filters cleared')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Cropped Image Objects'), onClick: () => { const n = selectCroppedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No cropped image objects.')); } },
          { label: t('Select Cropped Image Active Artboard Objects'), onClick: () => { const n = selectCroppedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Cropped Image Objects'), onClick: () => { const n = fixCroppedImageObjects(); if (n) toast.success(`${n} ${t('image crops cleared')}`); else toast.warn(t('No cropped image objects.')); } },
          { label: t('Fix Cropped Image Active Artboard Objects'), onClick: () => { const n = fixCroppedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('image crops cleared')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Embedded Image Objects'), onClick: () => { const n = selectEmbeddedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No embedded image objects.')); } },
          { label: t('Select Embedded Image Active Artboard Objects'), onClick: () => { const n = selectEmbeddedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Linked Image Objects'), onClick: () => { const n = selectLinkedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No linked image objects.')); } },
          { label: t('Select Linked Image Active Artboard Objects'), onClick: () => { const n = selectLinkedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Image Links Summary'), onClick: () => toast.info(imageLinksSummaryText(imageLinksSummary())) },
          { label: t('Image Links Active Artboard Summary'), onClick: () => toast.info(imageLinksSummaryText(imageLinksActiveArtboardSummary())) },
          { label: t('Copy Image Handoff Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffReport()) },
          { label: t('Copy Image Handoff Active Artboard Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardReport()) },
          { label: t('Copy Image Handoff TSV Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffTsvReport()) },
          { label: t('Copy Image Handoff Active Artboard TSV Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardTsvReport()) },
          { label: t('Copy Image Handoff JSON Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffJsonReport()) },
          { label: t('Copy Image Handoff Active Artboard JSON Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardJsonReport()) },
          { label: t('Copy Image Handoff Source Manifest'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffSourceManifest()) },
          { label: t('Copy Image Handoff Active Artboard Source Manifest'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardSourceManifest()) },
          { label: t('Copy Image Handoff Collect Source List'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffCollectSourceList()) },
          { label: t('Copy Image Handoff Active Artboard Collect Source List'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardCollectSourceList()) },
          { label: t('Copy Image Handoff Missing Relink List'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffMissingRelinkList()) },
          { label: t('Copy Image Handoff Active Artboard Missing Relink List'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardMissingRelinkList()) },
          { label: t('Copy Image Handoff Package Checklist'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageChecklist()) },
          { label: t('Copy Image Handoff Active Artboard Package Checklist'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageChecklist()) },
          { label: t('Copy Image Handoff Package Plan JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePlanJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Plan JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePlanJson()) },
          { label: t('Copy Image Handoff Collect Destination Manifest'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffCollectDestinationManifest()) },
          { label: t('Copy Image Handoff Active Artboard Collect Destination Manifest'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardCollectDestinationManifest()) },
          { label: t('Copy Image Handoff Collect Script'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffCollectScript()) },
          { label: t('Copy Image Handoff Active Artboard Collect Script'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardCollectScript()) },
          { label: t('Copy Image Handoff Collect PowerShell'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffCollectPowerShell()) },
          { label: t('Copy Image Handoff Active Artboard Collect PowerShell'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardCollectPowerShell()) },
          { label: t('Copy Image Handoff Verify Script'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffVerifyScript()) },
          { label: t('Copy Image Handoff Active Artboard Verify Script'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardVerifyScript()) },
          { label: t('Copy Image Handoff Verify PowerShell'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffVerifyPowerShell()) },
          { label: t('Copy Image Handoff Active Artboard Verify PowerShell'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardVerifyPowerShell()) },
          { label: t('Copy Image Handoff Verify Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffVerifyManifestJson()) },
          { label: t('Copy Image Handoff Active Artboard Verify Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardVerifyManifestJson()) },
          { label: t('Copy Image Handoff Package File Index JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFileIndexJson()) },
          { label: t('Copy Image Handoff Active Artboard Package File Index JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFileIndexJson()) },
          { label: t('Copy Image Handoff Package Audit JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAuditJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Audit JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAuditJson()) },
          { label: t('Copy Image Handoff Package Audit Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAuditReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Audit Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAuditReport()) },
          { label: t('Copy Image Handoff Package Digest Manifest'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDigestManifest()) },
          { label: t('Copy Image Handoff Active Artboard Package Digest Manifest'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDigestManifest()) },
          { label: t('Copy Image Handoff Package Signoff'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageSignoff()) },
          { label: t('Copy Image Handoff Active Artboard Package Signoff'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageSignoff()) },
          { label: t('Copy Image Handoff Package Signoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageSignoffJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Signoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageSignoffJson()) },
          { label: t('Copy Image Handoff Package Signoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageSignoffTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Signoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageSignoffTsv()) },
          { label: t('Copy Image Handoff Package Delivery Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryManifestJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryManifestJson()) },
          { label: t('Copy Image Handoff Package Delivery Manifest TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryManifestTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Manifest TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryManifestTsv()) },
          { label: t('Copy Image Handoff Package Provenance JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageProvenanceJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Provenance JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageProvenanceJson()) },
          { label: t('Copy Image Handoff Package Provenance TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageProvenanceTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Provenance TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageProvenanceTsv()) },
          { label: t('Copy Image Handoff Package Rights Manifest Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRightsManifestReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Rights Manifest Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRightsManifestReport()) },
          { label: t('Copy Image Handoff Package Rights Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRightsManifestJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Rights Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRightsManifestJson()) },
          { label: t('Copy Image Handoff Package Rights Manifest TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRightsManifestTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Rights Manifest TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRightsManifestTsv()) },
          { label: t('Copy Image Handoff Package Acceptance JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAcceptanceJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Acceptance JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAcceptanceJson()) },
          { label: t('Copy Image Handoff Package Acceptance TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAcceptanceTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Acceptance TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAcceptanceTsv()) },
          { label: t('Copy Image Handoff Package Delivery Receipt'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryReceiptReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Receipt'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryReceiptReport()) },
          { label: t('Copy Image Handoff Package Delivery Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryReceiptJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryReceiptJson()) },
          { label: t('Copy Image Handoff Package Delivery Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryReceiptTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryReceiptTsv()) },
          { label: t('Copy Image Handoff Package Release Notes'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseNotesReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Notes'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseNotesReport()) },
          { label: t('Copy Image Handoff Package Release Notes JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseNotesJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Notes JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseNotesJson()) },
          { label: t('Copy Image Handoff Package Release Notes TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseNotesTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Notes TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseNotesTsv()) },
          { label: t('Copy Image Handoff Package SBOM JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageSbomJson()) },
          { label: t('Copy Image Handoff Active Artboard Package SBOM JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageSbomJson()) },
          { label: t('Copy Image Handoff Package SBOM TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageSbomTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package SBOM TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageSbomTsv()) },
          { label: t('Copy Image Handoff Package Attestation JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAttestationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Attestation JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAttestationJson()) },
          { label: t('Copy Image Handoff Package Attestation TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAttestationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Attestation TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAttestationTsv()) },
          { label: t('Copy Image Handoff Package Risk Register Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRiskRegisterReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Risk Register Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRiskRegisterReport()) },
          { label: t('Copy Image Handoff Package Risk Register JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRiskRegisterJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Risk Register JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRiskRegisterJson()) },
          { label: t('Copy Image Handoff Package Risk Register TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRiskRegisterTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Risk Register TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRiskRegisterTsv()) },
          { label: t('Copy Image Handoff Package Verification Summary Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageVerificationSummaryReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Verification Summary Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageVerificationSummaryReport()) },
          { label: t('Copy Image Handoff Package Verification Summary JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageVerificationSummaryJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Verification Summary JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageVerificationSummaryJson()) },
          { label: t('Copy Image Handoff Package Verification Summary TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageVerificationSummaryTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Verification Summary TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageVerificationSummaryTsv()) },
          { label: t('Copy Image Handoff Package Client README'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageClientReadme()) },
          { label: t('Copy Image Handoff Active Artboard Package Client README'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageClientReadme()) },
          { label: t('Copy Image Handoff Package Client README JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageClientReadmeJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Client README JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageClientReadmeJson()) },
          { label: t('Copy Image Handoff Package Change Log Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageChangeLogReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Change Log Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageChangeLogReport()) },
          { label: t('Copy Image Handoff Package Change Log JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageChangeLogJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Change Log JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageChangeLogJson()) },
          { label: t('Copy Image Handoff Package Change Log TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageChangeLogTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Change Log TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageChangeLogTsv()) },
          { label: t('Copy Image Handoff Package Relink Map Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRelinkMapReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Relink Map Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRelinkMapReport()) },
          { label: t('Copy Image Handoff Package Relink Map JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRelinkMapJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Relink Map JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRelinkMapJson()) },
          { label: t('Copy Image Handoff Package Relink Map TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRelinkMapTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Relink Map TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRelinkMapTsv()) },
          { label: t('Copy Image Handoff Package Prepress Ticket Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrepressTicketReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Prepress Ticket Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrepressTicketReport()) },
          { label: t('Copy Image Handoff Package Prepress Ticket JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrepressTicketJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Prepress Ticket JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrepressTicketJson()) },
          { label: t('Copy Image Handoff Package Prepress Ticket TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrepressTicketTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Prepress Ticket TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrepressTicketTsv()) },
          { label: t('Copy Image Handoff Package Printer Intake Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrinterIntakeReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Printer Intake Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrinterIntakeReport()) },
          { label: t('Copy Image Handoff Package Printer Intake JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrinterIntakeJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Printer Intake JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrinterIntakeJson()) },
          { label: t('Copy Image Handoff Package Printer Intake TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrinterIntakeTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Printer Intake TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrinterIntakeTsv()) },
          { label: t('Copy Image Handoff Package Shop Proof Checklist Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageShopProofChecklistReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Shop Proof Checklist Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageShopProofChecklistReport()) },
          { label: t('Copy Image Handoff Package Shop Proof Checklist JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageShopProofChecklistJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Shop Proof Checklist JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageShopProofChecklistJson()) },
          { label: t('Copy Image Handoff Package Shop Proof Checklist TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageShopProofChecklistTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Shop Proof Checklist TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageShopProofChecklistTsv()) },
          { label: t('Copy Image Handoff Package Production Handoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageProductionHandoffJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Production Handoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageProductionHandoffJson()) },
          { label: t('Copy Image Handoff Package Production Handoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageProductionHandoffTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Production Handoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageProductionHandoffTsv()) },
          { label: t('Copy Image Handoff Package Print Release Approval Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrintReleaseApprovalReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Print Release Approval Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrintReleaseApprovalReport()) },
          { label: t('Copy Image Handoff Package Print Release Approval JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrintReleaseApprovalJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Print Release Approval JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrintReleaseApprovalJson()) },
          { label: t('Copy Image Handoff Package Print Release Approval TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePrintReleaseApprovalTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Print Release Approval TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePrintReleaseApprovalTsv()) },
          { label: t('Copy Image Handoff Package Vendor QA Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageVendorQaReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Vendor QA Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageVendorQaReport()) },
          { label: t('Copy Image Handoff Package Vendor QA JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageVendorQaJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Vendor QA JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageVendorQaJson()) },
          { label: t('Copy Image Handoff Package Vendor QA TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageVendorQaTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Vendor QA TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageVendorQaTsv()) },
          { label: t('Copy Image Handoff Package Press Run Ticket Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePressRunTicketReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Press Run Ticket Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePressRunTicketReport()) },
          { label: t('Copy Image Handoff Package Press Run Ticket JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePressRunTicketJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Press Run Ticket JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePressRunTicketJson()) },
          { label: t('Copy Image Handoff Package Press Run Ticket TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePressRunTicketTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Press Run Ticket TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePressRunTicketTsv()) },
          { label: t('Copy Image Handoff Package Postpress Inspection Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostpressInspectionReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Postpress Inspection Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostpressInspectionReport()) },
          { label: t('Copy Image Handoff Package Postpress Inspection JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostpressInspectionJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Postpress Inspection JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostpressInspectionJson()) },
          { label: t('Copy Image Handoff Package Postpress Inspection TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostpressInspectionTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Postpress Inspection TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostpressInspectionTsv()) },
          { label: t('Copy Image Handoff Package Finished Goods Release Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinishedGoodsReleaseReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Finished Goods Release Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinishedGoodsReleaseReport()) },
          { label: t('Copy Image Handoff Package Finished Goods Release JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinishedGoodsReleaseJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Finished Goods Release JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinishedGoodsReleaseJson()) },
          { label: t('Copy Image Handoff Package Finished Goods Release TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinishedGoodsReleaseTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Finished Goods Release TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinishedGoodsReleaseTsv()) },
          { label: t('Copy Image Handoff Package Shipment Handoff Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageShipmentHandoffReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Shipment Handoff Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageShipmentHandoffReport()) },
          { label: t('Copy Image Handoff Package Shipment Handoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageShipmentHandoffJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Shipment Handoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageShipmentHandoffJson()) },
          { label: t('Copy Image Handoff Package Shipment Handoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageShipmentHandoffTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Shipment Handoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageShipmentHandoffTsv()) },
          { label: t('Copy Image Handoff Package Delivery Confirmation Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryConfirmationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Confirmation Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryConfirmationReport()) },
          { label: t('Copy Image Handoff Package Delivery Confirmation JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryConfirmationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Confirmation JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryConfirmationJson()) },
          { label: t('Copy Image Handoff Package Delivery Confirmation TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDeliveryConfirmationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Delivery Confirmation TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDeliveryConfirmationTsv()) },
          { label: t('Copy Image Handoff Package Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Archive Manifest Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageArchiveManifestReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Archive Manifest Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageArchiveManifestReport()) },
          { label: t('Copy Image Handoff Package Archive Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageArchiveManifestJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Archive Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageArchiveManifestJson()) },
          { label: t('Copy Image Handoff Package Archive Manifest TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageArchiveManifestTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Archive Manifest TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageArchiveManifestTsv()) },
          { label: t('Copy Image Handoff Package Retention Schedule Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetentionScheduleReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Retention Schedule Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetentionScheduleReport()) },
          { label: t('Copy Image Handoff Package Retention Schedule JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetentionScheduleJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Retention Schedule JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetentionScheduleJson()) },
          { label: t('Copy Image Handoff Package Retention Schedule TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetentionScheduleTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Retention Schedule TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetentionScheduleTsv()) },
          { label: t('Copy Image Handoff Package Disposition Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDispositionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Disposition Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDispositionCertificateReport()) },
          { label: t('Copy Image Handoff Package Disposition Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDispositionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Disposition Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDispositionCertificateJson()) },
          { label: t('Copy Image Handoff Package Disposition Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDispositionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Disposition Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDispositionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Destruction Log Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDestructionLogReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Destruction Log Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDestructionLogReport()) },
          { label: t('Copy Image Handoff Package Destruction Log JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDestructionLogJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Destruction Log JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDestructionLogJson()) },
          { label: t('Copy Image Handoff Package Destruction Log TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDestructionLogTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Destruction Log TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDestructionLogTsv()) },
          { label: t('Copy Image Handoff Package Retrieval Request Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalRequestReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Request Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalRequestReport()) },
          { label: t('Copy Image Handoff Package Retrieval Request JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalRequestJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Request JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalRequestJson()) },
          { label: t('Copy Image Handoff Package Retrieval Request TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalRequestTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Request TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalRequestTsv()) },
          { label: t('Copy Image Handoff Package Retrieval Fulfillment Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalFulfillmentReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Fulfillment Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalFulfillmentReport()) },
          { label: t('Copy Image Handoff Package Retrieval Fulfillment JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalFulfillmentJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Fulfillment JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalFulfillmentJson()) },
          { label: t('Copy Image Handoff Package Retrieval Fulfillment TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalFulfillmentTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Fulfillment TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalFulfillmentTsv()) },
          { label: t('Copy Image Handoff Package Retrieval Return Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalReturnReceiptReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Return Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalReturnReceiptReport()) },
          { label: t('Copy Image Handoff Package Retrieval Return Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalReturnReceiptJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Return Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalReturnReceiptJson()) },
          { label: t('Copy Image Handoff Package Retrieval Return Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageRetrievalReturnReceiptTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Retrieval Return Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageRetrievalReturnReceiptTsv()) },
          { label: t('Copy Image Handoff Package Custody Ledger Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyLedgerReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Ledger Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyLedgerReport()) },
          { label: t('Copy Image Handoff Package Custody Ledger JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyLedgerJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Ledger JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyLedgerJson()) },
          { label: t('Copy Image Handoff Package Custody Ledger TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyLedgerTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Ledger TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyLedgerTsv()) },
          { label: t('Copy Image Handoff Package Custody Exceptions Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyExceptionsReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Exceptions Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyExceptionsReport()) },
          { label: t('Copy Image Handoff Package Custody Exceptions JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyExceptionsJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Exceptions JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyExceptionsJson()) },
          { label: t('Copy Image Handoff Package Custody Exceptions TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyExceptionsTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Exceptions TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyExceptionsTsv()) },
          { label: t('Copy Image Handoff Package Custody Remediation Plan Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyRemediationPlanReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Remediation Plan Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyRemediationPlanReport()) },
          { label: t('Copy Image Handoff Package Custody Remediation Plan JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyRemediationPlanJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Remediation Plan JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyRemediationPlanJson()) },
          { label: t('Copy Image Handoff Package Custody Remediation Plan TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyRemediationPlanTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Remediation Plan TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyRemediationPlanTsv()) },
          { label: t('Copy Image Handoff Package Custody Remediation Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyRemediationVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Remediation Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyRemediationVerificationReport()) },
          { label: t('Copy Image Handoff Package Custody Remediation Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyRemediationVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Remediation Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyRemediationVerificationJson()) },
          { label: t('Copy Image Handoff Package Custody Remediation Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCustodyRemediationVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Custody Remediation Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCustodyRemediationVerificationTsv()) },
          { label: t('Copy Image Handoff Package Final Custody Signoff Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalCustodySignoffReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Custody Signoff Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalCustodySignoffReport()) },
          { label: t('Copy Image Handoff Package Final Custody Signoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalCustodySignoffJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Custody Signoff JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalCustodySignoffJson()) },
          { label: t('Copy Image Handoff Package Final Custody Signoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalCustodySignoffTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Custody Signoff TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalCustodySignoffTsv()) },
          { label: t('Copy Image Handoff Package Final Package Seal Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalPackageSealReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Package Seal Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalPackageSealReport()) },
          { label: t('Copy Image Handoff Package Final Package Seal JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalPackageSealJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Package Seal JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalPackageSealJson()) },
          { label: t('Copy Image Handoff Package Final Package Seal TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalPackageSealTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Package Seal TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalPackageSealTsv()) },
          { label: t('Copy Image Handoff Package Final Package Seal Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalPackageSealVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Package Seal Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalPackageSealVerificationReport()) },
          { label: t('Copy Image Handoff Package Final Package Seal Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalPackageSealVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Package Seal Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalPackageSealVerificationJson()) },
          { label: t('Copy Image Handoff Package Final Package Seal Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageFinalPackageSealVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Final Package Seal Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageFinalPackageSealVerificationTsv()) },
          { label: t('Copy Image Handoff Package Reseal Remediation Plan Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageResealRemediationPlanReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Reseal Remediation Plan Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageResealRemediationPlanReport()) },
          { label: t('Copy Image Handoff Package Reseal Remediation Plan JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageResealRemediationPlanJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Reseal Remediation Plan JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageResealRemediationPlanJson()) },
          { label: t('Copy Image Handoff Package Reseal Remediation Plan TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageResealRemediationPlanTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Reseal Remediation Plan TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageResealRemediationPlanTsv()) },
          { label: t('Copy Image Handoff Package Reseal Remediation Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageResealRemediationVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Reseal Remediation Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageResealRemediationVerificationReport()) },
          { label: t('Copy Image Handoff Package Reseal Remediation Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageResealRemediationVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Reseal Remediation Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageResealRemediationVerificationJson()) },
          { label: t('Copy Image Handoff Package Reseal Remediation Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageResealRemediationVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Reseal Remediation Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageResealRemediationVerificationTsv()) },
          { label: t('Copy Image Handoff Package Reissued Seal Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReissuedSealCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Reissued Seal Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReissuedSealCertificateReport()) },
          { label: t('Copy Image Handoff Package Reissued Seal Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReissuedSealCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Reissued Seal Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReissuedSealCertificateJson()) },
          { label: t('Copy Image Handoff Package Reissued Seal Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReissuedSealCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Reissued Seal Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReissuedSealCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Authorization Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseAuthorizationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Authorization Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseAuthorizationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Authorization JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseAuthorizationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Authorization JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseAuthorizationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Authorization TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseAuthorizationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Authorization TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseAuthorizationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Execution Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseExecutionReceiptReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Execution Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseExecutionReceiptReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Execution Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseExecutionReceiptJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Execution Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseExecutionReceiptJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Execution Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseExecutionReceiptTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Execution Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseExecutionReceiptTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Execution Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseExecutionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Execution Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseExecutionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Execution Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseExecutionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Execution Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseExecutionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Release Execution Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealReleaseExecutionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Release Execution Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealReleaseExecutionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Update Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveUpdateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Update Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveUpdateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Update JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveUpdateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Update JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveUpdateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Update TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveUpdateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Update TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveUpdateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Retention Update Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealRetentionUpdateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Retention Update Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealRetentionUpdateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Retention Update JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealRetentionUpdateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Retention Update JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealRetentionUpdateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Retention Update TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealRetentionUpdateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Retention Update TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealRetentionUpdateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Retention Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealRetentionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Retention Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealRetentionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Retention Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealRetentionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Retention Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealRetentionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Retention Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealRetentionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Retention Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealRetentionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Lock Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveLockCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Lock Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveLockCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Lock Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveLockCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Lock Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveLockCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Lock Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveLockCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Lock Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveLockCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Lock Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveLockVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Lock Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveLockVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Lock Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveLockVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Lock Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveLockVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Archive Lock Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealArchiveLockVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Archive Lock Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealArchiveLockVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Signoff Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditSignoffCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Signoff Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditSignoffCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Signoff Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditSignoffCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Signoff Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditSignoffCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Signoff Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditSignoffCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Signoff Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditSignoffCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Signoff Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditSignoffVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Signoff Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditSignoffVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Signoff Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditSignoffVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Signoff Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditSignoffVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Locked Archive Audit Signoff Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealLockedArchiveAuditSignoffVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Locked Archive Audit Signoff Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealLockedArchiveAuditSignoffVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Compliance Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalComplianceCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Compliance Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalComplianceCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Compliance Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalComplianceCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Compliance Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalComplianceCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Compliance Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalComplianceCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Compliance Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalComplianceCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseReceiptReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseReceiptReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseReceiptJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseReceiptJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseReceiptTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseReceiptTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Release Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveReleaseCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Release Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveReleaseCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Completion Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveCompletionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Completion Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveCompletionCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Completion Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveCompletionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Completion Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveCompletionCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Completion Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveCompletionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Completion Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveCompletionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Completion Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveCompletionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Completion Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveCompletionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Completion Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveCompletionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Completion Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveCompletionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Completion Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveCompletionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Completion Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveCompletionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Gate Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseGateCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Gate Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseGateCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Gate Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseGateCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Gate Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseGateCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Gate Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseGateCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Gate Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseGateCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Gate Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseGateVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Gate Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseGateVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Gate Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseGateVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Gate Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseGateVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Gate Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseGateVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Gate Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseGateVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Execution Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseExecutionReceiptReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Execution Receipt Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseExecutionReceiptReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Execution Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseExecutionReceiptJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Execution Receipt JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseExecutionReceiptJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Execution Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseExecutionReceiptTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Execution Receipt TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseExecutionReceiptTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Execution Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseExecutionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Execution Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseExecutionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Execution Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseExecutionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Execution Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseExecutionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Execution Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseExecutionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Execution Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseExecutionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Completion Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCompletionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Completion Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCompletionCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Completion Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCompletionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Completion Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCompletionCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Completion Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCompletionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Completion Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCompletionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Completion Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCompletionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Completion Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCompletionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Completion Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCompletionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Completion Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCompletionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Completion Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseCompletionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Completion Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseCompletionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Finalization Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalizationCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Finalization Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalizationCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Finalization Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalizationCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Finalization Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalizationCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Finalization Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalizationCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Finalization Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalizationCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Finalization Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalizationVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Finalization Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalizationVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Finalization Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalizationVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Finalization Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalizationVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Finalization Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalizationVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Finalization Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalizationVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Freeze Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Freeze Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Freeze Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Freeze Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Freeze Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Freeze Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Freeze Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Freeze Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Freeze Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Freeze Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Freeze Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Freeze Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsFreezeVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closure Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closure Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closure Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closure Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closure Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closure Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closure Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closure Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closure Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closure Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closure Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closure Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsClosureVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Completion Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Completion Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Completion Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Completion Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Completion Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Completion Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Completion Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Completion Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Completion Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Completion Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Completion Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Completion Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCompletionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Signoff Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Signoff Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Signoff Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Signoff Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Signoff Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Signoff Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Signoff Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Signoff Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Signoff Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Signoff Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Signoff Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Signoff Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsSignoffVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Release Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Release Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Release Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Release Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Release Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Release Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Release Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Release Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Release Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Release Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Release Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Release Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsReleaseVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Handoff Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Handoff Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Handoff Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Handoff Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Handoff Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Handoff Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Handoff Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Handoff Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Handoff Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Handoff Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Handoff Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Handoff Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsHandoffVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closeout Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closeout Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closeout Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closeout Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closeout Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Closeout Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsCloseoutVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Archive Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Archive Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Archive Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Archive Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Archive Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Archive Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Archive Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Archive Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Archive Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Archive Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Archive Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Archive Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsArchiveVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Retention Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Retention Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Retention Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Retention Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Retention Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Retention Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Retention Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Retention Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Retention Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Retention Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Retention Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Retention Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsRetentionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Disposition Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Disposition Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Disposition Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Disposition Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Disposition Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Disposition Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Disposition Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionVerificationReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Disposition Verification Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionVerificationReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Disposition Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionVerificationJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Disposition Verification JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionVerificationJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Disposition Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionVerificationTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Disposition Verification TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDispositionVerificationTsv()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Destruction Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDestructionCertificateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Destruction Certificate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDestructionCertificateReport()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Destruction Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDestructionCertificateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Destruction Certificate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDestructionCertificateJson()) },
          { label: t('Copy Image Handoff Package Post-Reseal Final Archive Seal Release Final Records Destruction Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackagePostResealFinalArchiveSealReleaseFinalRecordsDestructionCertificateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Post-Reseal Final Archive Seal Release Final Records Destruction Certificate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackagePostResealFinalArchiveSealReleaseFinalRecordsDestructionCertificateTsv()) },
          { label: t('Copy Image Handoff Package Release Gate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseGateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Gate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseGateJson()) },
          { label: t('Copy Image Handoff Package Release Gate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseGateReport()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Gate Report'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseGateReport()) },
          { label: t('Copy Image Handoff Package Release Gate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseGateTsv()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Gate TSV'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseGateTsv()) },
          { label: t('Copy Image Handoff Package Release Gate Verify Script'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseGateVerifyScript()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Gate Verify Script'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseGateVerifyScript()) },
          { label: t('Copy Image Handoff Package Release Gate Verify PowerShell'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReleaseGateVerifyPowerShell()) },
          { label: t('Copy Image Handoff Active Artboard Package Release Gate Verify PowerShell'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReleaseGateVerifyPowerShell()) },
          { label: t('Copy Image Handoff Package CI Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCiManifestJson()) },
          { label: t('Copy Image Handoff Active Artboard Package CI Manifest JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCiManifestJson()) },
          { label: t('Copy Image Handoff Package GitHub Actions Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageGithubActionsWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package GitHub Actions Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageGithubActionsWorkflow()) },
          { label: t('Copy Image Handoff Package GitLab CI Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageGitlabCiWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package GitLab CI Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageGitlabCiWorkflow()) },
          { label: t('Copy Image Handoff Package Azure Pipelines Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageAzurePipelinesWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package Azure Pipelines Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageAzurePipelinesWorkflow()) },
          { label: t('Copy Image Handoff Package CircleCI Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageCircleCiWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package CircleCI Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageCircleCiWorkflow()) },
          { label: t('Copy Image Handoff Package Jenkinsfile'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageJenkinsfile()) },
          { label: t('Copy Image Handoff Active Artboard Package Jenkinsfile'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageJenkinsfile()) },
          { label: t('Copy Image Handoff Package Bitbucket Pipelines Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageBitbucketPipelinesWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package Bitbucket Pipelines Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageBitbucketPipelinesWorkflow()) },
          { label: t('Copy Image Handoff Package Buildkite Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageBuildkiteWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package Buildkite Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageBuildkiteWorkflow()) },
          { label: t('Copy Image Handoff Package Drone CI Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageDroneWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package Drone CI Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageDroneWorkflow()) },
          { label: t('Copy Image Handoff Package TeamCity Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageTeamCityWorkflow()) },
          { label: t('Copy Image Handoff Active Artboard Package TeamCity Workflow'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageTeamCityWorkflow()) },
          { label: t('Copy Image Handoff Package README'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageReadme()) },
          { label: t('Copy Image Handoff Active Artboard Package README'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageReadme()) },
          { label: t('Copy Image Handoff Package Tree'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageTree()) },
          { label: t('Copy Image Handoff Active Artboard Package Tree'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageTree()) },
          { label: t('Copy Image Handoff Package Bundle JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageBundleJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Bundle JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageBundleJson()) },
          { label: t('Copy Image Handoff Package Blockers'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageBlockers()) },
          { label: t('Copy Image Handoff Active Artboard Package Blockers'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageBlockers()) },
          { label: t('Copy Image Handoff Package Gate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffPackageGateJson()) },
          { label: t('Copy Image Handoff Active Artboard Package Gate JSON'), onClick: async () => copyImageHandoffReport((await import('../lib/imageHandoff')).imageHandoffActiveArtboardPackageGateJson()) },
          { label: t('Select Unknown Source Image Objects'), onClick: () => { const n = selectUnknownSourceImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unknown source image objects.')); } },
          { label: t('Select Unknown Source Image Active Artboard Objects'), onClick: () => { const n = selectUnknownSourceImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Embeddable Linked Image Objects'), onClick: () => { const n = selectEmbeddableLinkedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No embeddable linked image objects.')); } },
          { label: t('Select Embeddable Linked Image Active Artboard Objects'), onClick: () => { const n = selectEmbeddableLinkedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Not Embeddable Linked Image Objects'), onClick: () => { const n = selectNotEmbeddableLinkedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No not embeddable linked image objects.')); } },
          { label: t('Select Not Embeddable Linked Image Active Artboard Objects'), onClick: () => { const n = selectNotEmbeddableLinkedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Image Handoff Risk Objects'), onClick: () => { const n = selectImageHandoffRiskObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image handoff risk objects.')); } },
          { label: t('Select Image Handoff Risk Active Artboard Objects'), onClick: () => { const n = selectImageHandoffRiskActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Embed Linked Image Objects'), onClick: () => { const n = embedLinkedImageObjects(); if (n) toast.success(`${n} ${t('linked images embedded')}`); else toast.warn(t('No embeddable linked image objects.')); } },
          { label: t('Embed Linked Image Active Artboard Objects'), onClick: () => { const n = embedLinkedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('linked images embedded')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Restore Embedded Image Link Objects'), onClick: () => { const n = restoreEmbeddedImageLinkObjects(); if (n) toast.success(`${n} ${t('embedded image links restored')}`); else toast.warn(t('No restorable embedded image links.')); } },
          { label: t('Restore Embedded Image Link Active Artboard Objects'), onClick: () => { const n = restoreEmbeddedImageLinkActiveArtboardObjects(); if (n) toast.success(`${n} ${t('embedded image links restored')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Restorable Embedded Image Link Objects'), onClick: () => { const n = selectRestorableEmbeddedImageLinkObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No restorable embedded image links.')); } },
          { label: t('Select Restorable Embedded Image Link Active Artboard Objects'), onClick: () => { const n = selectRestorableEmbeddedImageLinkActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Missing Linked Image Objects'), onClick: () => { const n = selectMissingLinkedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No missing linked image objects.')); } },
          { label: t('Select Missing Linked Image Active Artboard Objects'), onClick: () => { const n = selectMissingLinkedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Missing Linked Image Objects'), onClick: () => { const n = fixMissingLinkedImageObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No missing linked image objects.')); } },
          { label: t('Fix Missing Linked Image Active Artboard Objects'), onClick: () => { const n = fixMissingLinkedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Transformed Image Objects'), onClick: () => { const n = selectTransformedImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No transformed image objects.')); } },
          { label: t('Select Transformed Image Active Artboard Objects'), onClick: () => { const n = selectTransformedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Transformed Image Objects'), onClick: () => { const n = fixTransformedImageObjects(); if (n) toast.success(`${n} ${t('transformed images marked')}`); else toast.warn(t('No transformed image objects.')); } },
          { label: t('Fix Transformed Image Active Artboard Objects'), onClick: () => { const n = fixTransformedImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('transformed images marked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Low Resolution Image Objects'), onClick: () => { const n = selectLowResolutionImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No low resolution image objects.')); } },
          { label: t('Select Low Resolution Image Active Artboard Objects'), onClick: () => { const n = selectLowResolutionImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Low Resolution Image Objects'), onClick: () => { const n = fixLowResolutionImageObjects(); if (n) toast.success(`${n} ${t('low resolution images marked')}`); else toast.warn(t('No low resolution image objects.')); } },
          { label: t('Fix Low Resolution Image Active Artboard Objects'), onClick: () => { const n = fixLowResolutionImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('low resolution images marked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select High Resolution Image Objects'), onClick: () => { const n = selectHighResolutionImageObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No high resolution image objects.')); } },
          { label: t('Select High Resolution Image Active Artboard Objects'), onClick: () => { const n = selectHighResolutionImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix High Resolution Image Objects'), onClick: () => { const n = fixHighResolutionImageObjects(); if (n) toast.success(`${n} ${t('high resolution images marked')}`); else toast.warn(t('No high resolution image objects.')); } },
          { label: t('Fix High Resolution Image Active Artboard Objects'), onClick: () => { const n = fixHighResolutionImageActiveArtboardObjects(); if (n) toast.success(`${n} ${t('high resolution images marked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Image Preflight Summary'), onClick: () => toast.info(imagePreflightSummaryText(imagePreflightSummary())) },
          { label: t('Image Preflight Active Artboard Summary'), onClick: () => toast.info(imagePreflightSummaryText(imagePreflightActiveArtboardSummary())) },
          { label: t('Select All Image Preflight Objects'), onClick: () => { const n = selectAllImagePreflightObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image preflight issues.')); } },
          { label: t('Select All Image Preflight Active Artboard Objects'), onClick: () => { const n = selectAllImagePreflightActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix All Image Preflight Objects'), onClick: () => { const n = fixAllImagePreflightObjects(); if (n) toast.success(`${n} ${t('image preflight issues fixed')}`); else toast.warn(t('No image preflight issues.')); } },
          { label: t('Fix All Image Preflight Active Artboard Objects'), onClick: () => { const n = fixAllImagePreflightActiveArtboardObjects(); if (n) toast.success(`${n} ${t('image preflight issues fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Image Preflight Review Objects'), onClick: () => { const n = selectImagePreflightReviewObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No image preflight review markers.')); } },
          { label: t('Select Image Preflight Review Active Artboard Objects'), onClick: () => { const n = selectImagePreflightReviewActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Clear Image Preflight Review Objects'), onClick: () => { const n = clearImagePreflightReviewObjects(); if (n) toast.success(`${n} ${t('image preflight reviews cleared')}`); else toast.warn(t('No image preflight review markers.')); } },
          { label: t('Clear Image Preflight Review Active Artboard Objects'), onClick: () => { const n = clearImagePreflightReviewActiveArtboardObjects(); if (n) toast.success(`${n} ${t('image preflight reviews cleared')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Transformed Objects'), onClick: () => { const n = selectTransformedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No transformed objects.')); } },
          { label: t('Select Transformed Active Artboard Objects'), onClick: () => { const n = selectTransformedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select All Path Objects'), onClick: () => { const n = selectAllPaths(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No path objects.')); } },
          { label: t('Select All Path Active Artboard Objects'), onClick: () => { const n = selectAllPathsActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select All Shape Objects'), onClick: () => { const n = selectAllShapes(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No shape objects.')); } },
          { label: t('Select All Shape Active Artboard Objects'), onClick: () => { const n = selectAllShapesActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select All Group Objects'), onClick: () => { const n = selectAllGroups(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No group objects.')); } },
          { label: t('Select All Group Active Artboard Objects'), onClick: () => { const n = selectAllGroupsActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Named Objects'), onClick: () => { const n = selectNamedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No named objects.')); } },
          { label: t('Select Named Active Artboard Objects'), onClick: () => { const n = selectNamedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Unnamed Objects'), onClick: () => { const n = selectUnnamedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unnamed objects.')); } },
          { label: t('Select Unnamed Active Artboard Objects'), onClick: () => { const n = selectUnnamedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Clipping Masked Objects'), onClick: () => { const n = selectClippingMaskedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No clipping masked objects.')); } },
          { label: t('Select Clipping Masked Active Artboard Objects'), onClick: () => { const n = selectClippingMaskedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Open Path Objects'), onClick: () => { const n = selectOpenPathObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No open path objects.')); } },
          { label: t('Select Open Path Active Artboard Objects'), onClick: () => { const n = selectOpenPathActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Compound Path Objects'), onClick: () => { const n = selectCompoundPathObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No compound path objects.')); } },
          { label: t('Select Compound Path Active Artboard Objects'), onClick: () => { const n = selectCompoundPathActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Stray Point Objects'), onClick: () => { const n = selectStrayPointObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No stray point objects.')); } },
          { label: t('Select Stray Point Active Artboard Objects'), onClick: () => { const n = selectStrayPointActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix All Cleanup Objects'), onClick: () => { const n = fixAllCleanupObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No cleanup objects found.')); } },
          { label: t('Fix All Cleanup Active Artboard Objects'), onClick: () => { const n = fixAllCleanupActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Stray Point Objects'), onClick: () => { const n = fixStrayPointObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No stray point objects.')); } },
          { label: t('Fix Stray Point Active Artboard Objects'), onClick: () => { const n = fixStrayPointActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Zero-Length Path Objects'), onClick: () => { const n = selectZeroLengthPathObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No zero-length path objects.')); } },
          { label: t('Select Zero-Length Path Active Artboard Objects'), onClick: () => { const n = selectZeroLengthPathActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Zero-Length Path Objects'), onClick: () => { const n = fixZeroLengthPathObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No zero-length path objects.')); } },
          { label: t('Fix Zero-Length Path Active Artboard Objects'), onClick: () => { const n = fixZeroLengthPathActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Zero-Size Objects'), onClick: () => { const n = selectZeroSizeObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No zero-size objects.')); } },
          { label: t('Select Zero-Size Active Artboard Objects'), onClick: () => { const n = selectZeroSizeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Zero-Size Objects'), onClick: () => { const n = fixZeroSizeObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No zero-size objects.')); } },
          { label: t('Fix Zero-Size Active Artboard Objects'), onClick: () => { const n = fixZeroSizeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Empty Group Objects'), onClick: () => { const n = selectEmptyGroupObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No empty group objects.')); } },
          { label: t('Select Empty Group Active Artboard Objects'), onClick: () => { const n = selectEmptyGroupActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Empty Group Objects'), onClick: () => { const n = fixEmptyGroupObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No empty group objects.')); } },
          { label: t('Fix Empty Group Active Artboard Objects'), onClick: () => { const n = fixEmptyGroupActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Unpainted Objects'), onClick: () => { const n = selectUnpaintedObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No unpainted objects.')); } },
          { label: t('Select Unpainted Active Artboard Objects'), onClick: () => { const n = selectUnpaintedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Unpainted Objects'), onClick: () => { const n = fixUnpaintedObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No unpainted objects.')); } },
          { label: t('Fix Unpainted Active Artboard Objects'), onClick: () => { const n = fixUnpaintedActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Drop Shadow Objects'), onClick: () => { const n = selectDropShadowObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No drop shadow objects.')); } },
          { label: t('Select Drop Shadow Active Artboard Objects'), onClick: () => { const n = selectDropShadowActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Transparency Objects'), onClick: () => { const n = selectTransparencyObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No transparency objects.')); } },
          { label: t('Select Transparency Active Artboard Objects'), onClick: () => { const n = selectTransparencyActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Transparency Objects'), onClick: () => { const n = fixTransparencyObjects(); if (n) toast.success(`${n} ${t('transparency flattened')}`); else toast.warn(t('No transparency objects.')); } },
          { label: t('Fix Transparency Active Artboard Objects'), onClick: () => { const n = fixTransparencyActiveArtboardObjects(); if (n) toast.success(`${n} ${t('transparency flattened')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Fully Transparent Objects'), onClick: () => { const n = selectFullyTransparentObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No fully transparent objects.')); } },
          { label: t('Select Fully Transparent Active Artboard Objects'), onClick: () => { const n = selectFullyTransparentActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Fully Transparent Objects'), onClick: () => { const n = fixFullyTransparentObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No fully transparent objects.')); } },
          { label: t('Fix Fully Transparent Active Artboard Objects'), onClick: () => { const n = fixFullyTransparentActiveArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Dashed Stroke Objects'), onClick: () => { const n = selectDashedStrokeObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No dashed stroke objects.')); } },
          { label: t('Select Dashed Stroke Active Artboard Objects'), onClick: () => { const n = selectDashedStrokeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Dashed Stroke Objects'), onClick: () => { const n = fixDashedStrokeObjects(); if (n) toast.success(`${n} ${t('dash patterns cleared')}`); else toast.warn(t('No dashed stroke objects.')); } },
          { label: t('Fix Dashed Stroke Active Artboard Objects'), onClick: () => { const n = fixDashedStrokeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('dash patterns cleared')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Thin Stroke Objects'), onClick: () => { const n = selectThinStrokeObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No thin stroke objects.')); } },
          { label: t('Select Thin Stroke Active Artboard Objects'), onClick: () => { const n = selectThinStrokeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Thin Stroke Objects'), onClick: () => { const n = fixThinStrokeObjects(); if (n) toast.success(`${n} ${t('thin strokes fixed')}`); else toast.warn(t('No thin stroke objects.')); } },
          { label: t('Fix Thin Stroke Active Artboard Objects'), onClick: () => { const n = fixThinStrokeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('thin strokes fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Overprint Objects'), onClick: () => { const n = selectOverprintObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No overprint objects.')); } },
          { label: t('Select Overprint Active Artboard Objects'), onClick: () => { const n = selectOverprintActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Overprint Objects'), onClick: () => { const n = fixOverprintObjects(); if (n) toast.success(`${n} ${t('overprint flags cleared')}`); else toast.warn(t('No overprint objects.')); } },
          { label: t('Fix Overprint Active Artboard Objects'), onClick: () => { const n = fixOverprintActiveArtboardObjects(); if (n) toast.success(`${n} ${t('overprint flags cleared')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select White Overprint Objects'), onClick: () => { const n = selectWhiteOverprintObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No white overprint objects.')); } },
          { label: t('Select White Overprint Active Artboard Objects'), onClick: () => { const n = selectWhiteOverprintActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix White Overprint Objects'), onClick: () => { const n = fixWhiteOverprintObjects(); if (n) toast.success(`${n} ${t('overprint flags cleared')}`); else toast.warn(t('No white overprint objects.')); } },
          { label: t('Fix White Overprint Active Artboard Objects'), onClick: () => { const n = fixWhiteOverprintActiveArtboardObjects(); if (n) toast.success(`${n} ${t('overprint flags cleared')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix All Prepress Risks'), onClick: () => { const n = fixAllPrepressRisks(); if (n) toast.success(`${n} ${t('prepress risks fixed')}`); else toast.warn(t('No prepress risks found.')); } },
          { label: t('Fix All Prepress Risks Active Artboard'), onClick: () => { const n = fixAllPrepressRisksActiveArtboard(); if (n) toast.success(`${n} ${t('prepress risks fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Spot Color Objects'), onClick: () => { const n = selectSpotColorObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No spot color objects.')); } },
          { label: t('Select Spot Color Active Artboard Objects'), onClick: () => { const n = selectSpotColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Spot Color Objects'), onClick: () => { const n = fixSpotColorObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No spot color objects.')); } },
          { label: t('Fix Spot Color Active Artboard Objects'), onClick: () => { const n = fixSpotColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select RGB Color Objects'), onClick: () => { const n = selectRgbColorObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No RGB color objects.')); } },
          { label: t('Select RGB Color Active Artboard Objects'), onClick: () => { const n = selectRgbColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix RGB Color Objects'), onClick: () => { const n = fixRgbColorObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No RGB color objects.')); } },
          { label: t('Fix RGB Color Active Artboard Objects'), onClick: () => { const n = fixRgbColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Grayscale Color Objects'), onClick: () => { const n = selectGrayscaleColorObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No grayscale color objects.')); } },
          { label: t('Select Grayscale Color Active Artboard Objects'), onClick: () => { const n = selectGrayscaleColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Grayscale Color Objects'), onClick: () => { const n = fixGrayscaleColorObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No grayscale color objects.')); } },
          { label: t('Fix Grayscale Color Active Artboard Objects'), onClick: () => { const n = fixGrayscaleColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Lab Color Objects'), onClick: () => { const n = selectLabColorObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No Lab color objects.')); } },
          { label: t('Select Lab Color Active Artboard Objects'), onClick: () => { const n = selectLabColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Lab Color Objects'), onClick: () => { const n = fixLabColorObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No Lab color objects.')); } },
          { label: t('Fix Lab Color Active Artboard Objects'), onClick: () => { const n = fixLabColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Non-CMYK Color Objects'), onClick: () => { const n = selectNonCmykColorObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No non-CMYK color objects.')); } },
          { label: t('Select Non-CMYK Color Active Artboard Objects'), onClick: () => { const n = selectNonCmykColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Non-CMYK Color Objects'), onClick: () => { const n = fixNonCmykColorObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No non-CMYK color objects.')); } },
          { label: t('Fix Non-CMYK Color Active Artboard Objects'), onClick: () => { const n = fixNonCmykColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Print Mark Objects'), onClick: () => { const n = selectPrintMarkObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No print mark objects.')); } },
          { label: t('Select Print Mark Active Artboard Objects'), onClick: () => { const n = selectPrintMarkActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Rich Black Objects'), onClick: () => { const n = selectRichBlackObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No rich black objects.')); } },
          { label: t('Select Rich Black Active Artboard Objects'), onClick: () => { const n = selectRichBlackActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Rich Black Objects'), onClick: () => { const n = fixRichBlackObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No rich black objects.')); } },
          { label: t('Fix Rich Black Active Artboard Objects'), onClick: () => { const n = fixRichBlackActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Over Ink Limit Objects'), onClick: () => { const n = selectOverInkLimitObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No over ink limit objects.')); } },
          { label: t('Select Over Ink Limit Active Artboard Objects'), onClick: () => { const n = selectOverInkLimitActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Over Ink Limit Objects'), onClick: () => { const n = fixOverInkLimitObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No over ink limit objects.')); } },
          { label: t('Fix Over Ink Limit Active Artboard Objects'), onClick: () => { const n = fixOverInkLimitActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Registration Color Objects'), onClick: () => { const n = selectRegistrationColorObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No registration color objects.')); } },
          { label: t('Select Registration Color Active Artboard Objects'), onClick: () => { const n = selectRegistrationColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Fix Registration Color Objects'), onClick: () => { const n = fixRegistrationColorObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('No registration color objects.')); } },
          { label: t('Fix Registration Color Active Artboard Objects'), onClick: () => { const n = fixRegistrationColorActiveArtboardObjects(); if (n) toast.success(`${n} ${t('prepress paints fixed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Active Artboard Objects'), onClick: () => { const n = selectActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Same Artboard Objects'), onClick: () => { const n = selectSameArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Inside Active Artboard Objects'), onClick: () => { const n = selectInsideActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Overflowing Active Artboard Objects'), onClick: () => { const n = selectOverflowingActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Other Artboards Objects'), onClick: () => { const n = selectOtherArtboardsObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Outside Artboard Objects'), onClick: () => { const n = selectOutsideArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No outside artboard objects.')); } },
          { label: t('Select Outside Any Artboard Objects'), onClick: () => { const n = selectOutsideAnyArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No outside any artboard objects.')); } },
          { label: t('Fix Outside Artboard Objects'), onClick: () => { const n = fixOutsideArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No outside artboard objects.')); } },
          { label: t('Fix Outside Any Artboard Objects'), onClick: () => { const n = fixOutsideAnyArtboardObjects(); if (n) toast.success(`${n} ${t('cleanup objects removed')}`); else toast.warn(t('No outside any artboard objects.')); } },
          { label: t('Select Inside Artboard Objects'), onClick: () => { const n = selectInsideArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No inside artboard objects.')); } },
          { label: t('Select Inside Any Artboard Objects'), onClick: () => { const n = selectInsideAnyArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No inside any artboard objects.')); } },
          { label: t('Select Overflowing Artboard Objects'), onClick: () => { const n = selectOverflowingArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No overflowing artboard objects.')); } },
          { label: t('Select Overflowing Any Artboard Objects'), onClick: () => { const n = selectOverflowingAnyArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No overflowing any artboard objects.')); } },
          { label: t('Select Custom Stroke Objects'), onClick: () => { const n = selectCustomStrokeObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No custom stroke objects.')); } },
          { label: t('Select Custom Stroke Active Artboard Objects'), onClick: () => { const n = selectCustomStrokeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Non-Scaling Stroke Objects'), onClick: () => { const n = selectNonScalingStrokeObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No non-scaling stroke objects.')); } },
          { label: t('Select Non-Scaling Stroke Active Artboard Objects'), onClick: () => { const n = selectNonScalingStrokeActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Pattern Fill Objects'), onClick: () => { const n = selectPatternFillObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No pattern fill objects.')); } },
          { label: t('Select Pattern Fill Active Artboard Objects'), onClick: () => { const n = selectPatternFillActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select Gradient Fill Objects'), onClick: () => { const n = selectGradientFillObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No gradient fill objects.')); } },
          { label: t('Select Gradient Fill Active Artboard Objects'), onClick: () => { const n = selectGradientFillActiveArtboardObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
          { label: t('Select All Symbol Instances'), onClick: () => { const n = selectAllSymbolInstances(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No symbol instances found.')); } },
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
        { label: t('Reflect 45°'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else reflectSelection(45); } },
        { label: t('Reflect 135°'), onClick: () => { if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) toast.warn(t('Select something first.')); else reflectSelection(135); } },
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
          { label: t('Merge Same Fill'), onClick: () => { const n = mergeSameFillSelection(); if (n) toast.success(`${n} ${t('same-fill groups merged')}`); else toast.warn(t('Select 2 or more same-fill shapes first.')); } },
          { label: t('Crop'), onClick: () => { const n = cropSelection(); if (!n) toast.warn(t('Select 2 or more objects first.')); } },
        ] },
        { label: t('Make Clipping Mask'), onClick: () => { if (!applyClipMask()) toast.warn(t('Select 2 or more objects first.')); }, kbd: getBinding('edit.clipMask') },
        { label: t('Release Clipping Mask'), onClick: () => { if (!releaseClipMask()) toast.warn(t('Select a clipping group first.')); }, kbd: getBinding('edit.releaseClip') },
        { label: t('Expand Clipping Mask'), onClick: () => { const n = expandClippingMask(); if (n) toast.success(`${n} ${t('clip masks expanded')}`); else toast.warn(t('Select a clipping group first.')); } },
        { label: t('Make Compound Path'), onClick: () => { if (!makeCompoundPath()) toast.warn(t('Select 2 or more objects first.')); }, kbd: getBinding('edit.compoundPath') },
        { label: t('Release Compound Path'), onClick: () => { if (!releaseCompoundPath()) toast.warn(t('Select a compound path first.')); }, kbd: getBinding('edit.releaseCompound') },
        { sep: true },
        { label: t('Lock Selection'), onClick: () => { const n = lockSelection(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.lockSelection') },
        { label: t('Lock Others'), onClick: () => { const n = lockOthers(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('No other unlocked objects.')); } },
        { label: t('Lock Active Artboard'), onClick: () => { const n = lockActiveArtboard(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Lock Other Artboards'), onClick: () => { const n = lockOtherArtboards(); if (n) toast.success(`${n} ${t('locked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Unlock Selection'), onClick: () => { const n = unlockSelection(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked selection.')); } },
        { label: t('Unlock Active Artboard'), onClick: () => { const n = unlockActiveArtboard(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Unlock Other Artboards'), onClick: () => { const n = unlockOtherArtboards(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Unlock All'), onClick: () => { const n = unlockAll(); if (n) toast.success(`${n} ${t('unlocked')}`); else toast.warn(t('No locked objects.')); }, kbd: getBinding('edit.unlockAll') },
        { label: t('Hide Selection'), onClick: () => { const n = hideSelection(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); }, kbd: getBinding('edit.hideSelection') },
        { label: t('Hide Others'), onClick: () => { const n = hideOthers(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select something first.')); } },
        { label: t('Hide Active Artboard'), onClick: () => { const n = hideActiveArtboard(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Hide Other Artboards'), onClick: () => { const n = hideOtherArtboards(); if (n) toast.success(`${n} ${t('hidden')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Show Selection'), onClick: () => { const n = showSelection(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('No hidden selection.')); } },
        { label: t('Show Active Artboard'), onClick: () => { const n = showActiveArtboard(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Show Other Artboards'), onClick: () => { const n = showOtherArtboards(); if (n) toast.success(`${n} ${t('revealed')}`); else toast.warn(t('Select an object on or near an artboard first.')); } },
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
        { label: t('Fit All Artboards in Window'), onClick: () => { if (!zoomToAllArtboards()) toast.warn(t('No artboards to navigate.')); } },
        { label: t('Zoom to Active Artboard'), onClick: () => { if (!zoomToActiveArtboard()) toast.warn(t('Select an object on or near an artboard first.')); } },
        { label: t('Previous Artboard'), onClick: () => { if (!zoomToAdjacentArtboard(-1)) toast.warn(t('No artboards to navigate.')); } },
        { label: t('Next Artboard'), onClick: () => { if (!zoomToAdjacentArtboard(1)) toast.warn(t('No artboards to navigate.')); } },
        { label: t('Zoom to Selection'), onClick: () => { if (!zoomToSelection()) toast.warn(t('Select something first.')); }, kbd: getBinding('view.zoomSelection') },
        { sep: true },
        { label: t('Outline View'), onClick: () => setOutlineMode(!outlineMode), kbd: getBinding('view.outline'), checked: outlineMode },
        { sep: true },
        { label: t('Pin measurement as dimension'), onClick: () => { if (commitDimension()) toast.success(t('Dimension added')); else toast.warn(t('No measurement to pin.')); }, kbd: 'Enter' },
        { label: t('Add selection dimensions'), onClick: () => { const n = addSelectionDimensions(); if (n) toast.success(`${n} ${t('dimensions added')}`); else toast.warn(t('Select something first.')); } },
        { label: t('Add selection area label'), onClick: () => { if (addSelectionAreaLabel()) toast.success(t('Area label added')); else toast.warn(t('Select something first.')); } },
        { label: t('Add selection center mark'), onClick: () => { if (addSelectionCenterMark()) toast.success(t('Center mark added')); else toast.warn(t('Select something first.')); } },
        { label: t('Add selection corner marks'), onClick: () => { if (addSelectionCornerMarks()) toast.success(t('Corner marks added')); else toast.warn(t('Select something first.')); } },
        { label: t('Add production mark set'), onClick: () => { const n = addSelectionProductionMarks(); if (n) toast.success(`${n} ${t('production mark sets added')}`); else toast.warn(t('Select something first.')); } },
        { label: t('Add selection margin frame'), onClick: () => { const raw = window.prompt(t('Set selection margin frame in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); if (addSelectionMarginFrame(marginMm)) toast.success(t('Margin frame added')); else toast.warn(Number.isFinite(marginMm) ? t('Select something first.') : t('Invalid margin value.')); } },
        { label: t('Add selection inset frame'), onClick: () => { const raw = window.prompt(t('Set selection inset frame in mm'), '5'); if (raw == null) return; const insetMm = Number(raw); if (addSelectionInsetFrame(insetMm)) toast.success(t('Inset frame added')); else toast.warn(Number.isFinite(insetMm) ? t('Select something first.') : t('Invalid inset value.')); } },
        { label: t('Select measure annotations'), onClick: () => { const n = selectMeasureAnnotations(); if (n) toast.success(`${n} ${t('selected')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Lock measure annotations'), onClick: () => { const n = lockMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations locked')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Unlock measure annotations'), onClick: () => { const n = unlockMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations unlocked')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Hide measure annotations'), onClick: () => { const n = hideMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations hidden')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Show measure annotations'), onClick: () => { const n = showMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations shown')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Bring measure annotations to front'), onClick: () => { const n = bringMeasureAnnotationsToFront(); if (n) toast.success(`${n} ${t('measure annotations brought to front')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Prepare measure annotations for proof'), onClick: () => { const n = proofMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations proof-ready')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Edit measure annotations'), onClick: () => { const n = editMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations editable')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Duplicate measure annotations to selection'), onClick: async () => { const n = await duplicateMeasureAnnotationsToSelection(); if (n) toast.success(`${n} ${t('measure annotations duplicated')}`); else toast.warn(t('Select artwork and keep measure annotations.')); } },
        { label: t('Make guides from measure annotations'), onClick: () => { const n = makeGuidesFromMeasureAnnotations(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Make margin guides from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure guide margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); const n = makeMarginGuidesFromMeasureAnnotations(marginMm); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
        { label: t('Make center guides from measure annotations'), onClick: () => { const n = makeCenterGuidesFromMeasureAnnotations(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Make full guide set from measure annotations'), onClick: () => { const n = makeFullGuidesFromMeasureAnnotations(); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Make margin full guide set from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure guide margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); const n = makeMarginFullGuidesFromMeasureAnnotations(marginMm); if (n) toast.success(`${n} ${t('guides added')}`); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
        { label: t('Add print marks from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure print bleed in mm'), '3'); if (raw == null) return; const bleedMm = Number(raw); const n = addPrintMarksFromMeasureAnnotations(bleedMm); if (n) toast.success(`${n} ${t('print marks added')}`); else toast.warn(Number.isFinite(bleedMm) ? t('No measure annotations.') : t('Invalid bleed value.')); } },
        { label: t('Add cut contour from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (raw == null) return; const offsetMm = Number(raw); const n = addCutContourFromMeasureAnnotations(offsetMm); if (n) toast.success(`${n} ${t('contour(s) added')}`); else toast.warn(Number.isFinite(offsetMm) ? t('No measure annotations.') : t('Invalid offset value.')); } },
        { label: t('Add bridged cut contour from measure annotations'), onClick: () => { const offsetRaw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (offsetRaw == null) return; const countRaw = window.prompt(t('Set measure bridge count'), '4'); if (countRaw == null) return; const gapRaw = window.prompt(t('Set measure bridge gap in mm'), '1'); if (gapRaw == null) return; const offsetMm = Number(offsetRaw); const count = Number(countRaw); const gapMm = Number(gapRaw); const n = addBridgedCutContourFromMeasureAnnotations(offsetMm, count, gapMm); if (n) toast.success(`${n} ${t('bridged contours added')}`); else toast.warn(Number.isFinite(offsetMm) && Number.isFinite(count) && Number.isFinite(gapMm) ? t('No measure annotations.') : t('Invalid bridge value.')); } },
        { label: t('Add positioning marks from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure positioning mark offset in mm'), '5'); if (raw == null) return; const offsetMm = Number(raw); const n = addRegistrationMarksFromMeasureAnnotations(offsetMm); if (n) toast.success(t('4-corner registration marks added.')); else toast.warn(Number.isFinite(offsetMm) ? t('No measure annotations.') : t('Invalid offset value.')); } },
        { label: t('Add weed border from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure weed margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); const n = addWeedBorderFromMeasureAnnotations(marginMm); if (n) toast.success(t('Weed border added.')); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
        { label: t('Add weed grid from measure annotations'), onClick: () => { const marginRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (marginRaw == null) return; const rowsRaw = window.prompt(t('Set measure weed rows'), '1'); if (rowsRaw == null) return; const colsRaw = window.prompt(t('Set measure weed columns'), '1'); if (colsRaw == null) return; const marginMm = Number(marginRaw); const rows = Number(rowsRaw); const cols = Number(colsRaw); const n = addWeedBorderFromMeasureAnnotations(marginMm, rows, cols); if (n) toast.success(t('Weed grid added.')); else toast.warn(Number.isFinite(marginMm) && Number.isFinite(rows) && Number.isFinite(cols) ? t('No measure annotations.') : t('Invalid weed grid value.')); } },
        { label: t('Add grommets from measure annotations'), onClick: () => { const insetRaw = window.prompt(t('Set measure grommet inset in mm'), '20'); if (insetRaw == null) return; const spacingRaw = window.prompt(t('Set measure grommet max spacing in mm'), '500'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure grommet diameter in mm'), '10'); if (diameterRaw == null) return; const insetMm = Number(insetRaw); const spacingMm = Number(spacingRaw); const diameterMm = Number(diameterRaw); const n = addGrommetsFromMeasureAnnotations(insetMm, spacingMm, diameterMm); if (n) toast.success(`${n} ${t('grommets added')}`); else toast.warn(Number.isFinite(insetMm) && Number.isFinite(spacingMm) && Number.isFinite(diameterMm) ? t('No measure annotations.') : t('Invalid grommet value.')); } },
        { label: t('Add rhinestones from measure annotations'), onClick: () => { const spacingRaw = window.prompt(t('Set measure rhinestone spacing in mm'), '4'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure rhinestone diameter in mm'), '2.8'); if (diameterRaw == null) return; const spacingMm = Number(spacingRaw); const diameterMm = Number(diameterRaw); const n = addRhinestonesFromMeasureAnnotations(spacingMm, diameterMm); if (n) toast.success(`${n} ${t('stones placed')}`); else toast.warn(Number.isFinite(spacingMm) && Number.isFinite(diameterMm) ? t('No measure annotations.') : t('Invalid rhinestone value.')); } },
        { label: t('Prepare print and cut from measure annotations'), onClick: () => { const bleedRaw = window.prompt(t('Set measure print bleed in mm'), '3'); if (bleedRaw == null) return; const contourRaw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (contourRaw == null) return; const regRaw = window.prompt(t('Set measure positioning mark offset in mm'), '5'); if (regRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const result = preparePrintAndCutFromMeasureAnnotations(Number(bleedRaw), Number(contourRaw), Number(regRaw), Number(weedRaw)); if (result) toast.success(`${result.printMarks} ${t('print marks added')} · ${result.cutPaths} ${t('cut paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid print and cut prep value.')); } },
        { label: t('Prepare banner finishing from measure annotations'), onClick: () => { const insetRaw = window.prompt(t('Set measure grommet inset in mm'), '20'); if (insetRaw == null) return; const spacingRaw = window.prompt(t('Set measure grommet max spacing in mm'), '500'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure grommet diameter in mm'), '10'); if (diameterRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const rowsRaw = window.prompt(t('Set measure weed rows'), '0'); if (rowsRaw == null) return; const colsRaw = window.prompt(t('Set measure weed columns'), '0'); if (colsRaw == null) return; const result = prepareBannerFinishingFromMeasureAnnotations(Number(insetRaw), Number(spacingRaw), Number(diameterRaw), Number(weedRaw), Number(rowsRaw), Number(colsRaw)); if (result) toast.success(`${result.grommets} ${t('grommets added')} · ${result.weedPaths} ${t('weed paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid banner finishing value.')); } },
        { label: t('Prepare stencil cut from measure annotations'), onClick: () => { const offsetRaw = window.prompt(t('Set measure cut contour offset in mm'), '0'); if (offsetRaw == null) return; const countRaw = window.prompt(t('Set measure bridge count'), '4'); if (countRaw == null) return; const gapRaw = window.prompt(t('Set measure bridge gap in mm'), '1'); if (gapRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const rowsRaw = window.prompt(t('Set measure weed rows'), '1'); if (rowsRaw == null) return; const colsRaw = window.prompt(t('Set measure weed columns'), '1'); if (colsRaw == null) return; const result = prepareStencilCutFromMeasureAnnotations(Number(offsetRaw), Number(countRaw), Number(gapRaw), Number(weedRaw), Number(rowsRaw), Number(colsRaw)); if (result) toast.success(`${result.bridgedContours} ${t('bridged contours added')} · ${result.weedPaths} ${t('weed paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid stencil cut value.')); } },
        { label: t('Prepare rhinestone template from measure annotations'), onClick: () => { const spacingRaw = window.prompt(t('Set measure rhinestone spacing in mm'), '4'); if (spacingRaw == null) return; const diameterRaw = window.prompt(t('Set measure rhinestone diameter in mm'), '2.8'); if (diameterRaw == null) return; const weedRaw = window.prompt(t('Set measure weed margin in mm'), '5'); if (weedRaw == null) return; const result = prepareRhinestoneTemplateFromMeasureAnnotations(Number(spacingRaw), Number(diameterRaw), Number(weedRaw)); if (result) toast.success(`${result.stones} ${t('stones placed')} · ${result.weedPaths} ${t('weed paths added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid rhinestone template value.')); } },
        { label: t('Prepare proof page from measure annotations'), onClick: () => { const marginRaw = window.prompt(t('Set measure proof page margin in mm'), '5'); if (marginRaw == null) return; const bleedRaw = window.prompt(t('Set measure print bleed in mm'), '3'); if (bleedRaw == null) return; const result = prepareProofPageFromMeasureAnnotations(Number(marginRaw), Number(bleedRaw)); if (result) toast.success(`${t('Artboard added')} · ${result.printMarks} ${t('print marks added')} · ${result.proofFrames} ${t('proof frames added')} · ${result.proofLabels} ${t('proof labels added')} · ${result.proofLegends} ${t('proof legends added')} · ${result.proofChecklists} ${t('proof checklists added')} · ${result.proofApprovalStamps} ${t('proof approval stamps added')} · ${result.proofColorBars} ${t('proof color bars added')} · ${result.proofScales} ${t('proof scales added')} · ${result.proofJobInfos} ${t('proof job info panels added')} · ${result.proofFilenames} ${t('proof filename labels added')} · ${result.proofPreflights} ${t('proof preflight summaries added')} · ${result.proofSpecs} ${t('proof specs panels added')} · ${result.proofSafetyNotes} ${t('proof safety notes added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid proof page value.')); } },
        { label: t('Prepare proof pages from measure annotations'), onClick: () => { const marginRaw = window.prompt(t('Set measure proof page margin in mm'), '5'); if (marginRaw == null) return; const bleedRaw = window.prompt(t('Set measure print bleed in mm'), '3'); if (bleedRaw == null) return; const result = prepareProofPagesFromMeasureAnnotations(Number(marginRaw), Number(bleedRaw)); if (result) toast.success(`${result.artboards} ${t('artboards added')} · ${result.printMarks} ${t('print marks added')} · ${result.proofFrames} ${t('proof frames added')} · ${result.proofLabels} ${t('proof labels added')} · ${result.proofLegends} ${t('proof legends added')} · ${result.proofChecklists} ${t('proof checklists added')} · ${result.proofApprovalStamps} ${t('proof approval stamps added')} · ${result.proofColorBars} ${t('proof color bars added')} · ${result.proofScales} ${t('proof scales added')} · ${result.proofJobInfos} ${t('proof job info panels added')} · ${result.proofFilenames} ${t('proof filename labels added')} · ${result.proofPreflights} ${t('proof preflight summaries added')} · ${result.proofSpecs} ${t('proof specs panels added')} · ${result.proofSafetyNotes} ${t('proof safety notes added')} · ${result.guides} ${t('guides added')}`); else toast.warn(t('Invalid proof pages value.')); } },
        { label: t('Make artboard from measure annotations'), onClick: () => { if (makeArtboardFromMeasureAnnotations()) toast.success(t('Artboard added')); else toast.warn(t('No measure annotations.')); } },
        { label: t('Make margin artboard from measure annotations'), onClick: () => { const raw = window.prompt(t('Set measure artboard margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); if (makeMarginArtboardFromMeasureAnnotations(marginMm)) toast.success(t('Artboard added')); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
        { label: t('Resize artboard to measure annotations'), onClick: () => { if (resizeArtboardToMeasureAnnotations()) toast.success(t('Artboard resized')); else toast.warn(t('No measure annotations.')); } },
        { label: t('Resize artboard to measure annotations with margin'), onClick: () => { const raw = window.prompt(t('Set measure artboard margin in mm'), '5'); if (raw == null) return; const marginMm = Number(raw); if (resizeArtboardToMeasureAnnotations(marginMm)) toast.success(t('Artboard resized')); else toast.warn(Number.isFinite(marginMm) ? t('No measure annotations.') : t('Invalid margin value.')); } },
        { label: t('Clear measure annotations'), onClick: () => { const n = clearMeasureAnnotations(); if (n) toast.success(`${n} ${t('measure annotations cleared')}`); else toast.warn(t('No measure annotations.')); } },
        { label: t('Add measure proof manifest'), onClick: () => { const n = addMeasureProofManifest(); if (n) toast.success(`${n} ${t('proof manifests updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof revision history'), onClick: () => { const n = addMeasureProofRevisionHistory(); if (n) toast.success(`${n} ${t('proof revision histories updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof approval audit'), onClick: () => { const n = addMeasureProofApprovalAudit(); if (n) toast.success(`${n} ${t('proof approval audits updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof package cover'), onClick: () => { const n = addMeasureProofPackageCover(); if (n) toast.success(`${n} ${t('proof package covers updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof delivery checklist'), onClick: () => { const n = addMeasureProofDeliveryChecklist(); if (n) toast.success(`${n} ${t('proof delivery checklists updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof release stamp'), onClick: () => { const n = addMeasureProofReleaseStamp(); if (n) toast.success(`${n} ${t('proof release stamps updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof package index'), onClick: () => { const n = addMeasureProofPackageIndex(); if (n) toast.success(`${n} ${t('proof package indexes updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Add measure proof delivery contact'), onClick: () => { const n = addMeasureProofDeliveryContact(); if (n) toast.success(`${n} ${t('proof delivery contacts updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof delivery contact'), onClick: () => { const client = window.prompt(t('Set measure proof client'), ''); if (client == null) return; const contact = window.prompt(t('Set measure proof contact name'), ''); if (contact == null) return; const email = window.prompt(t('Set measure proof contact email'), ''); if (email == null) return; const phone = window.prompt(t('Set measure proof contact phone'), ''); if (phone == null) return; const n = setMeasureProofDeliveryContact({ client, contact, email, phone }); if (n) toast.success(`${n} ${t('proof delivery contacts updated')}`); else toast.warn(t('No measure proof delivery contact panels.')); } },
        { label: t('Add measure proof delivery schedule'), onClick: () => { const n = addMeasureProofDeliverySchedule(); if (n) toast.success(`${n} ${t('proof delivery schedules updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof delivery schedule'), onClick: () => { const due = window.prompt(t('Set measure proof due date'), ''); if (due == null) return; const ship = window.prompt(t('Set measure proof ship date'), ''); if (ship == null) return; const method = window.prompt(t('Set measure proof delivery method'), ''); if (method == null) return; const notes = window.prompt(t('Set measure proof delivery notes'), ''); if (notes == null) return; const n = setMeasureProofDeliverySchedule({ due, ship, method, notes }); if (n) toast.success(`${n} ${t('proof delivery schedules updated')}`); else toast.warn(t('No measure proof delivery schedule panels.')); } },
        { label: t('Add measure proof delivery route'), onClick: () => { const n = addMeasureProofDeliveryRoute(); if (n) toast.success(`${n} ${t('proof delivery routes updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof delivery route'), onClick: () => { const carrier = window.prompt(t('Set measure proof route carrier'), ''); if (carrier == null) return; const service = window.prompt(t('Set measure proof route service'), ''); if (service == null) return; const account = window.prompt(t('Set measure proof route account'), ''); if (account == null) return; const address = window.prompt(t('Set measure proof route address'), ''); if (address == null) return; const n = setMeasureProofDeliveryRoute({ carrier, service, account, address }); if (n) toast.success(`${n} ${t('proof delivery routes updated')}`); else toast.warn(t('No measure proof delivery route panels.')); } },
        { label: t('Add measure proof fulfillment handoff'), onClick: () => { const n = addMeasureProofFulfillmentHandoff(); if (n) toast.success(`${n} ${t('proof fulfillment handoffs updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof fulfillment handoff'), onClick: () => { const quantity = window.prompt(t('Set measure proof fulfillment quantity'), ''); if (quantity == null) return; const packaging = window.prompt(t('Set measure proof fulfillment packaging'), ''); if (packaging == null) return; const owner = window.prompt(t('Set measure proof fulfillment owner'), ''); if (owner == null) return; const tracking = window.prompt(t('Set measure proof fulfillment tracking'), ''); if (tracking == null) return; const n = setMeasureProofFulfillmentHandoff({ quantity, packaging, owner, tracking }); if (n) toast.success(`${n} ${t('proof fulfillment handoffs updated')}`); else toast.warn(t('No measure proof fulfillment handoff panels.')); } },
        { label: t('Add measure proof install handoff'), onClick: () => { const n = addMeasureProofInstallHandoff(); if (n) toast.success(`${n} ${t('proof install handoffs updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof install handoff'), onClick: () => { const installer = window.prompt(t('Set measure proof install installer'), ''); if (installer == null) return; const date = window.prompt(t('Set measure proof install date'), ''); if (date == null) return; const site = window.prompt(t('Set measure proof install site'), ''); if (site == null) return; const notes = window.prompt(t('Set measure proof install notes'), ''); if (notes == null) return; const n = setMeasureProofInstallHandoff({ installer, date, site, notes }); if (n) toast.success(`${n} ${t('proof install handoffs updated')}`); else toast.warn(t('No measure proof install handoff panels.')); } },
        { label: t('Add measure proof site readiness'), onClick: () => { const n = addMeasureProofSiteReadiness(); if (n) toast.success(`${n} ${t('proof site readiness panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof site readiness'), onClick: () => { const permit = window.prompt(t('Set measure proof site permit'), ''); if (permit == null) return; const access = window.prompt(t('Set measure proof site access'), ''); if (access == null) return; const power = window.prompt(t('Set measure proof site power'), ''); if (power == null) return; const risks = window.prompt(t('Set measure proof site risks'), ''); if (risks == null) return; const n = setMeasureProofSiteReadiness({ permit, access, power, risks }); if (n) toast.success(`${n} ${t('proof site readiness panels updated')}`); else toast.warn(t('No measure proof site readiness panels.')); } },
        { label: t('Add measure proof install punch list'), onClick: () => { const n = addMeasureProofInstallPunchList(); if (n) toast.success(`${n} ${t('proof install punch lists updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof install punch list'), onClick: () => { const open = window.prompt(t('Set measure proof punch list open items'), ''); if (open == null) return; const owner = window.prompt(t('Set measure proof punch list owner'), ''); if (owner == null) return; const due = window.prompt(t('Set measure proof punch list due date'), ''); if (due == null) return; const resolution = window.prompt(t('Set measure proof punch list resolution'), ''); if (resolution == null) return; const n = setMeasureProofInstallPunchList({ open, owner, due, resolution }); if (n) toast.success(`${n} ${t('proof install punch lists updated')}`); else toast.warn(t('No measure proof install punch list panels.')); } },
        { label: t('Add measure proof client acceptance'), onClick: () => { const n = addMeasureProofClientAcceptance(); if (n) toast.success(`${n} ${t('proof client acceptances updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof client acceptance'), onClick: () => { const acceptedBy = window.prompt(t('Set measure proof accepted by'), ''); if (acceptedBy == null) return; const date = window.prompt(t('Set measure proof acceptance date'), ''); if (date == null) return; const status = window.prompt(t('Set measure proof acceptance status'), ''); if (status == null) return; const notes = window.prompt(t('Set measure proof acceptance notes'), ''); if (notes == null) return; const n = setMeasureProofClientAcceptance({ acceptedBy, date, status, notes }); if (n) toast.success(`${n} ${t('proof client acceptances updated')}`); else toast.warn(t('No measure proof client acceptance panels.')); } },
        { label: t('Add measure proof warranty info'), onClick: () => { const n = addMeasureProofWarrantyInfo(); if (n) toast.success(`${n} ${t('proof warranty info panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof warranty info'), onClick: () => { const term = window.prompt(t('Set measure proof warranty term'), ''); if (term == null) return; const coverage = window.prompt(t('Set measure proof warranty coverage'), ''); if (coverage == null) return; const contact = window.prompt(t('Set measure proof warranty contact'), ''); if (contact == null) return; const notes = window.prompt(t('Set measure proof warranty notes'), ''); if (notes == null) return; const n = setMeasureProofWarrantyInfo({ term, coverage, contact, notes }); if (n) toast.success(`${n} ${t('proof warranty info panels updated')}`); else toast.warn(t('No measure proof warranty info panels.')); } },
        { label: t('Add measure proof care instructions'), onClick: () => { const n = addMeasureProofCareInstructions(); if (n) toast.success(`${n} ${t('proof care instruction panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof care instructions'), onClick: () => { const cleaning = window.prompt(t('Set measure proof care cleaning'), ''); if (cleaning == null) return; const chemicals = window.prompt(t('Set measure proof care chemicals'), ''); if (chemicals == null) return; const inspection = window.prompt(t('Set measure proof care inspection'), ''); if (inspection == null) return; const notes = window.prompt(t('Set measure proof care notes'), ''); if (notes == null) return; const n = setMeasureProofCareInstructions({ cleaning, chemicals, inspection, notes }); if (n) toast.success(`${n} ${t('proof care instruction panels updated')}`); else toast.warn(t('No measure proof care instruction panels.')); } },
        { label: t('Add measure proof asset archive'), onClick: () => { const n = addMeasureProofAssetArchive(); if (n) toast.success(`${n} ${t('proof asset archive panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof asset archive'), onClick: () => { const source = window.prompt(t('Set measure proof archive source'), ''); if (source == null) return; const exports = window.prompt(t('Set measure proof archive exports'), ''); if (exports == null) return; const photos = window.prompt(t('Set measure proof archive photos'), ''); if (photos == null) return; const notes = window.prompt(t('Set measure proof archive notes'), ''); if (notes == null) return; const n = setMeasureProofAssetArchive({ source, exports, photos, notes }); if (n) toast.success(`${n} ${t('proof asset archive panels updated')}`); else toast.warn(t('No measure proof asset archive panels.')); } },
        { label: t('Add measure proof file verification'), onClick: () => { const n = addMeasureProofFileVerification(); if (n) toast.success(`${n} ${t('proof file verification panels updated')}`); else toast.warn(t('No measure proof sheet objects.')); } },
        { label: t('Set measure proof file verification'), onClick: () => { const version = window.prompt(t('Set measure proof verification version'), ''); if (version == null) return; const checksum = window.prompt(t('Set measure proof verification checksum'), ''); if (checksum == null) return; const reviewed = window.prompt(t('Set measure proof verification reviewed'), ''); if (reviewed == null) return; const notes = window.prompt(t('Set measure proof verification notes'), ''); if (notes == null) return; const n = setMeasureProofFileVerification({ version, checksum, reviewed, notes }); if (n) toast.success(`${n} ${t('proof file verification panels updated')}`); else toast.warn(t('No measure proof file verification panels.')); } },
        { label: t('Set measure proof job information'), onClick: () => { const job = window.prompt(t('Set measure proof job name'), ''); if (job == null) return; const revision = window.prompt(t('Set measure proof revision'), ''); if (revision == null) return; const prepared = window.prompt(t('Set measure proof prepared by'), ''); if (prepared == null) return; const notes = window.prompt(t('Set measure proof notes'), ''); if (notes == null) return; const n = setMeasureProofJobInfo({ job, revision, prepared, notes }); if (n) toast.success(`${n} ${t('proof job info panels updated')}`); else toast.warn(t('No measure proof job info panels.')); } },
        { label: t('Set measure proof signoff'), onClick: () => { const signer = window.prompt(t('Set measure proof signer'), ''); if (signer == null) return; const date = window.prompt(t('Set measure proof signoff date'), ''); if (date == null) return; const note = window.prompt(t('Set measure proof signoff note'), ''); if (note == null) return; const n = setMeasureProofSignoff({ signer, date, note }); if (n) toast.success(`${n} ${t('proof signoffs updated')}`); else toast.warn(t('No measure proof checklists.')); } },
        { label: t('Select draft measure proof objects'), onClick: () => { const n = selectMeasureProofObjectsByStatus('draft'); if (n) toast.success(`${n} ${t('proof objects selected')}`); else toast.warn(t('No matching measure proof objects.')); } },
        { label: t('Select approved measure proof objects'), onClick: () => { const n = selectMeasureProofObjectsByStatus('approved'); if (n) toast.success(`${n} ${t('proof objects selected')}`); else toast.warn(t('No matching measure proof objects.')); } },
        { label: t('Select changes-required measure proof objects'), onClick: () => { const n = selectMeasureProofObjectsByStatus('changes'); if (n) toast.success(`${n} ${t('proof objects selected')}`); else toast.warn(t('No matching measure proof objects.')); } },
        { label: t('Select measure proof delivery blockers'), onClick: () => { const n = selectMeasureProofDeliveryBlockers(); if (n) toast.success(`${n} ${t('proof blockers selected')}`); else toast.warn(t('No measure proof blockers.')); } },
        { label: t('Mark proof sheet as draft'), onClick: () => { const n = setMeasureProofApprovalStatus('draft'); if (n) toast.success(`${n} ${t('proof approval stamps updated')}`); else toast.warn(t('No measure proof approval stamps.')); } },
        { label: t('Mark proof sheet as approved'), onClick: () => { const n = setMeasureProofApprovalStatus('approved'); if (n) toast.success(`${n} ${t('proof approval stamps updated')}`); else toast.warn(t('No measure proof approval stamps.')); } },
        { label: t('Mark proof sheet as changes required'), onClick: () => { const n = setMeasureProofApprovalStatus('changes'); if (n) toast.success(`${n} ${t('proof approval stamps updated')}`); else toast.warn(t('No measure proof approval stamps.')); } },
        { label: t('Clear measure proof sheet objects'), onClick: () => { const n = clearMeasureProofSheetObjects(); if (n) toast.success(`${n} ${t('proof sheet objects cleared')}`); else toast.warn(t('No measure proof sheet objects.')); } },
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

      <Dropdown label={t('Document')} items={[
        { label: t('Document Settings…'), onClick: () => setModal('showDocSettings', true) },
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
        // Separations — per-plate spot/process colour inventory, isolation
        // preview, and per-plate export. Print-production colour workflow.
        { label: t('Separations…'), onClick: () => setModal('showSeparations', true) },
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
          { label: t('Scissors at Midpoint'), onClick: () => { const n = scissorsSplitSelectionAtMidpoint(); if (n) toast.success(`${n} ${t('paths split')}`); else toast.warn(t('Select open stroked paths first.')); } },
          { label: t('Knife Split Horizontal'), onClick: () => { const n = knifeSplitSelectionAtCenter('horizontal'); if (n) toast.success(`${n} ${t('objects knife-split')}`); else toast.warn(t('Select closed shapes first.')); } },
          { label: t('Knife Split Vertical'), onClick: () => { const n = knifeSplitSelectionAtCenter('vertical'); if (n) toast.success(`${n} ${t('objects knife-split')}`); else toast.warn(t('Select closed shapes first.')); } },
          { label: t('Average Anchor Points'), onClick: () => { const n = averageSelectedAnchors('both'); if (n) toast.success(`${n} ${t('anchors averaged')}`); else toast.warn(t('Shift-click two or more path anchors first.')); }, kbd: getBinding('path.averageAnchors') },
          { label: t('Outline Stroke to Fill'), onClick: () => { const n = outlineStrokeToFillSelection(); if (n) toast.success(`${n} ${t('strokes outlined')}`); else toast.warn(t('Select shapes that have a stroke first.')); } },
          { label: t('Simplify Path…'), onClick: () => openWithSelection('showSimplify') },
          { label: t('Smooth Path'), onClick: () => { const n = smoothPathSelection(); if (n) toast.success(`${n} ${t('paths smoothed')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Round Corners…'), onClick: () => openWithSelection('showRoundCorners') },
          { label: t('Offset Path…'), onClick: () => openWithSelection('showOffsetPath') },
          { label: t('Reverse Path Direction'), onClick: () => { const n = reversePathSelection(); if (n) toast.success(`${n} ${t('paths reversed')}`); else toast.warn(t('Select one or more paths first.')); } },
          { label: t('Add Arrowhead (Start)'), onClick: () => { const n = addArrowheads('start'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Add Arrowhead (End)'), onClick: () => { const n = addArrowheads('end'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Add Arrowheads (Both)'), onClick: () => { const n = addArrowheads('both'); if (n) toast.success(`${n} ${t('arrowheads added')}`); else toast.warn(t('Select an open path or line first.')); } },
          { label: t('Select Cleanup Objects'), onClick: () => { const n = selectCleanupObjects(); if (n) toast.success(`${n} ${t('selected')}`); else toast.success(t('Nothing to clean up.')); } },
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
          { label: t('Envelope Distort — Make with Top Object'), onClick: () => {
            void envelopeSelection().then((r) => {
              if (r && r.reshaped > 0) toast.success(`${r.reshaped} ${t('objects reshaped into the envelope')}${r.skipped > 0 ? ` · ${r.skipped} ${t('raster images skipped')}` : ''}`, { title: t('Envelope Distort') });
              else toast.warn(t('Select the artwork plus one vector shape on top (2+ objects) — the top-most object becomes the envelope.'), { title: t('Envelope Distort') });
            });
          } },
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
        { sep: true },
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
        { sep: true },
        { label: t('Appearance'), sub: [
          { label: t('Clear Appearance'), onClick: () => { const n = clearAppearanceFromSelection(); if (n) toast.success(`${n} ${t('appearances cleared')}`); else toast.warn(t('Select something first.')); } },
          { label: t('Flatten Transparency'), onClick: () => { const n = flattenTransparencySelection(); if (n) toast.success(`${n} ${t('objects flattened')}`); else toast.warn(t('Select transparent or blended objects first.')); } },
          { label: t('Expand Appearance'), onClick: () => { void expandAppearanceSelection().then((n) => { if (n) toast.success(`${n} ${t('appearances expanded')}`); else toast.warn(t('Select objects with expandable appearance first.')); }); } },
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
          { label: t('Pattern Fill'), sub: [
            { label: t('Checker'), onClick: () => openWithSelectionAction(() => applyPatternFill('checker', 16, '#ffffff', '#111827')) },
            { label: t('Stripes'), onClick: () => openWithSelectionAction(() => applyPatternFill('stripes', 16, '#ffffff', '#111827')) },
            { label: t('Dots'), onClick: () => openWithSelectionAction(() => applyPatternFill('dots', 16, '#ffffff', '#111827')) },
            { label: t('Crosshatch'), onClick: () => openWithSelectionAction(() => applyPatternFill('crosshatch', 16, '#ffffff', '#111827')) },
            { sep: true },
            { label: t('Clear Pattern Fill'), onClick: () => { const n = clearPatternFillSelection(); if (n) toast.success(`${n} ${t('pattern fills cleared')}`); else toast.warn(t('Select objects with pattern fills first.')); } },
            { label: t('Expand Pattern Fill'), onClick: () => { const n = expandPatternFillSelection(); if (n) toast.success(`${n} ${t('pattern fills expanded')}`); else toast.warn(t('Select objects with pattern fills first.')); } },
          ] },
          { label: t('Drop shadow'), sub: [
            { label: t('Soft Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 })) },
            { label: t('Hard Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(0,0,0,0.45)', blur: 0, offsetX: 5, offsetY: 5 })) },
            { label: t('Glow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection({ color: 'rgba(61,155,255,0.75)', blur: 16, offsetX: 0, offsetY: 0 })) },
            { sep: true },
            { label: t('Clear Shadow'), onClick: () => openWithSelectionAction(() => applyShadowToSelection(null)) },
            { label: t('Expand Drop Shadow'), onClick: () => { void expandDropShadowSelection().then((n) => { if (n) toast.success(`${n} ${t('drop shadows expanded')}`); else toast.warn(t('Select objects with drop shadows first.')); }); } },
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
          { label: t('Nest (rotation-aware)'), onClick: runRotationNest },
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
      <input ref={pdfRef} type="file" accept=".pdf,application/pdf" hidden onChange={onPdf} />

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
