import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import { artboardAnyPlacementSignature, artboardPlacementSignature, appearanceSignature, fillAppearanceSignature, fillStrokeSignature, gradientSignature, objectAreaSignature, objectAspectRatioSignature, objectBottomSignature, objectBoundsSignature, objectCenterSignature, objectCenterYSignature, objectCenterXSignature, objectPositionSignature, objectRightSignature, objectRotationSignature, objectScaleSignature, objectHeightSignature, objectSizeSignature, objectSkewSignature, objectTransformSignature, objectWidthSignature, objectXSignature, objectYSignature, overprintSignature, patternSignature, fixRichBlackObjects, fixRichBlackActiveArtboardObjects, fixOverInkLimitObjects, fixOverInkLimitActiveArtboardObjects, fixRegistrationColorObjects, fixRegistrationColorActiveArtboardObjects, fixSpotColorObjects, fixSpotColorActiveArtboardObjects, selectRgbColorObjects, selectRgbColorActiveArtboardObjects, fixRgbColorObjects, fixRgbColorActiveArtboardObjects, selectGrayscaleColorObjects, selectGrayscaleColorActiveArtboardObjects, fixGrayscaleColorObjects, fixGrayscaleColorActiveArtboardObjects, selectLabColorObjects, selectLabColorActiveArtboardObjects, fixLabColorObjects, fixLabColorActiveArtboardObjects, selectNonCmykColorObjects, selectNonCmykColorActiveArtboardObjects, fixNonCmykColorObjects, fixNonCmykColorActiveArtboardObjects, lockOthers, lockActiveArtboard, lockOtherArtboards, unlockSelection, unlockActiveArtboard, unlockOtherArtboards, releaseGuides, selectAllGroups, selectAllGroupsActiveArtboardObjects, selectAllImagesActiveArtboardObjects, selectAllPathsActiveArtboardObjects, selectAllShapesActiveArtboardObjects, selectAllTextActiveArtboardObjects, selectAreaTextObjects, selectAreaTextActiveArtboardObjects, selectClippingMaskedObjects, selectClippingMaskedActiveArtboardObjects, selectCompoundPathObjects, selectCompoundPathActiveArtboardObjects, selectCroppedImageObjects, selectCroppedImageActiveArtboardObjects, fixCroppedImageObjects, fixCroppedImageActiveArtboardObjects, selectCustomStrokeObjects, selectCustomStrokeActiveArtboardObjects, selectCustomTextSpacingObjects, selectCustomTextSpacingActiveArtboardObjects, selectDashedStrokeObjects, selectDashedStrokeActiveArtboardObjects, fixDashedStrokeObjects, fixDashedStrokeActiveArtboardObjects, selectDecoratedTextObjects, selectDecoratedTextActiveArtboardObjects, selectDropShadowObjects, selectDropShadowActiveArtboardObjects, selectEmbeddedImageObjects, selectEmbeddedImageActiveArtboardObjects, selectEmptyTextObjects, selectEmptyTextActiveArtboardObjects, fixEmptyTextObjects, fixEmptyTextActiveArtboardObjects, selectFilteredImageObjects, selectFilteredImageActiveArtboardObjects, fixFilteredImageObjects, fixFilteredImageActiveArtboardObjects, selectGradientFillObjects, selectGradientFillActiveArtboardObjects, selectHiddenObjects, selectHiddenActiveArtboardObjects, fixHiddenObjects, fixHiddenActiveArtboardObjects, selectVisibleActiveArtboardObjects, hideOtherArtboards, hideActiveArtboard, showActiveArtboard, showOtherArtboards, selectHighResolutionImageObjects, selectHighResolutionImageActiveArtboardObjects, fixHighResolutionImageObjects, fixHighResolutionImageActiveArtboardObjects, imageLinksSummary, imageLinksActiveArtboardSummary, imagePreflightSummary, imagePreflightActiveArtboardSummary, selectAllImagePreflightObjects, selectAllImagePreflightActiveArtboardObjects, fixAllImagePreflightObjects, fixAllImagePreflightActiveArtboardObjects, selectImagePreflightReviewObjects, selectImagePreflightReviewActiveArtboardObjects, clearImagePreflightReviewObjects, clearImagePreflightReviewActiveArtboardObjects, selectInsideArtboardObjects, selectInsideAnyArtboardObjects, selectLinkedImageObjects, selectLinkedImageActiveArtboardObjects, selectUnknownSourceImageObjects, selectUnknownSourceImageActiveArtboardObjects, selectEmbeddableLinkedImageObjects, selectEmbeddableLinkedImageActiveArtboardObjects, selectNotEmbeddableLinkedImageObjects, selectNotEmbeddableLinkedImageActiveArtboardObjects, selectImageHandoffRiskObjects, selectImageHandoffRiskActiveArtboardObjects, embedLinkedImageObjects, embedLinkedImageActiveArtboardObjects, restoreEmbeddedImageLinkObjects, restoreEmbeddedImageLinkActiveArtboardObjects, selectRestorableEmbeddedImageLinkObjects, selectRestorableEmbeddedImageLinkActiveArtboardObjects, selectLockedObjects, selectLockedActiveArtboardObjects, selectUnlockedActiveArtboardObjects, selectLowResolutionImageObjects, selectLowResolutionImageActiveArtboardObjects, fixLowResolutionImageObjects, fixLowResolutionImageActiveArtboardObjects, selectMissingFontTextObjects, selectMissingFontTextActiveArtboardObjects, selectMissingLinkedImageObjects, selectMissingLinkedImageActiveArtboardObjects, fixMissingLinkedImageObjects, fixMissingLinkedImageActiveArtboardObjects, selectMixedStyleTextObjects, selectMixedStyleTextActiveArtboardObjects, selectNamedObjects, selectNamedActiveArtboardObjects, selectNonLeftAlignedTextObjects, selectNonLeftAlignedTextActiveArtboardObjects, selectNonScalingStrokeObjects, selectNonScalingStrokeActiveArtboardObjects, selectOpenPathObjects, selectOpenPathActiveArtboardObjects, selectOutsideArtboardObjects, selectOutsideAnyArtboardObjects, fixOutsideArtboardObjects, fixOutsideAnyArtboardObjects, selectOverprintObjects, selectOverprintActiveArtboardObjects, fixOverprintObjects, fixOverprintActiveArtboardObjects, selectWhiteOverprintObjects, selectWhiteOverprintActiveArtboardObjects, fixWhiteOverprintObjects, fixWhiteOverprintActiveArtboardObjects, fixAllPrepressRisks, fixAllPrepressRisksActiveArtboard, selectSpotColorObjects, selectSpotColorActiveArtboardObjects, selectRichBlackObjects, selectRichBlackActiveArtboardObjects, selectOverInkLimitObjects, selectOverInkLimitActiveArtboardObjects, selectRegistrationColorObjects, selectRegistrationColorActiveArtboardObjects, selectOverflowingArtboardObjects, selectOverflowingAnyArtboardObjects, selectOverflowingTextObjects, selectOverflowingTextActiveArtboardObjects, selectPatternFillObjects, selectPatternFillActiveArtboardObjects, selectPointTextObjects, selectPointTextActiveArtboardObjects, selectPrintMarkObjects, selectPrintMarkActiveArtboardObjects, selectActiveArtboardObjects, selectSameArtboardObjects, selectInsideActiveArtboardObjects, selectOverflowingActiveArtboardObjects, selectOtherArtboardsObjects, selectSame, selectSameActiveArtboard, selectSameType, selectSameTypeActiveArtboardObjects, selectStrayPointObjects, selectStrayPointActiveArtboardObjects, fixAllCleanupObjects, fixAllCleanupActiveArtboardObjects, fixStrayPointObjects, fixStrayPointActiveArtboardObjects, selectStyledTextObjects, selectStyledTextActiveArtboardObjects, selectTextOnPathObjects, selectTextOnPathActiveArtboardObjects, selectThinStrokeObjects, selectThinStrokeActiveArtboardObjects, fixThinStrokeObjects, fixThinStrokeActiveArtboardObjects, selectTransformedImageObjects, selectTransformedImageActiveArtboardObjects, fixTransformedImageObjects, fixTransformedImageActiveArtboardObjects, selectTransformedObjects, selectTransformedActiveArtboardObjects, selectTransformedTextObjects, selectTransformedTextActiveArtboardObjects, selectTransparencyObjects, selectTransparencyActiveArtboardObjects, fixTransparencyObjects, fixTransparencyActiveArtboardObjects, selectFullyTransparentObjects, selectFullyTransparentActiveArtboardObjects, fixFullyTransparentObjects, fixFullyTransparentActiveArtboardObjects, selectUnnamedObjects, selectUnnamedActiveArtboardObjects, selectUnpaintedObjects, selectUnpaintedActiveArtboardObjects, fixUnpaintedObjects, fixUnpaintedActiveArtboardObjects, selectZeroLengthPathObjects, selectZeroLengthPathActiveArtboardObjects, fixZeroLengthPathObjects, fixZeroLengthPathActiveArtboardObjects, selectZeroSizeObjects, selectZeroSizeActiveArtboardObjects, fixZeroSizeObjects, fixZeroSizeActiveArtboardObjects, selectEmptyGroupObjects, selectEmptyGroupActiveArtboardObjects, fixEmptyGroupObjects, fixEmptyGroupActiveArtboardObjects, showSelection, releasedGuideLineCoords, sameSignature, selectSameSignature, shadowSignature, strokeAppearanceSignature, textAppearanceSignature } from '../selectionOps';
import {
  imageHandoffReport, imageHandoffActiveArtboardReport, imageHandoffTsvReport,
  imageHandoffActiveArtboardTsvReport, imageHandoffJsonReport, imageHandoffActiveArtboardJsonReport,
  imageHandoffSourceManifest, imageHandoffActiveArtboardSourceManifest,
  imageHandoffCollectSourceList, imageHandoffActiveArtboardCollectSourceList,
  imageHandoffMissingRelinkList, imageHandoffActiveArtboardMissingRelinkList,
  imageHandoffPackageChecklist, imageHandoffActiveArtboardPackageChecklist,
  imageHandoffPackagePlanJson, imageHandoffActiveArtboardPackagePlanJson,
  imageHandoffCollectDestinationManifest, imageHandoffActiveArtboardCollectDestinationManifest,
  imageHandoffCollectScript, imageHandoffActiveArtboardCollectScript, imageHandoffCollectPowerShell,
  imageHandoffActiveArtboardCollectPowerShell, imageHandoffVerifyScript,
  imageHandoffActiveArtboardVerifyScript, imageHandoffVerifyPowerShell,
  imageHandoffActiveArtboardVerifyPowerShell, imageHandoffVerifyManifestJson,
  imageHandoffActiveArtboardVerifyManifestJson, imageHandoffPackageFileIndexJson,
  imageHandoffActiveArtboardPackageFileIndexJson, imageHandoffPackageAuditJson,
  imageHandoffActiveArtboardPackageAuditJson, imageHandoffPackageAuditReport,
  imageHandoffActiveArtboardPackageAuditReport, imageHandoffPackageDigestManifest,
  imageHandoffActiveArtboardPackageDigestManifest, imageHandoffPackageSignoff,
  imageHandoffActiveArtboardPackageSignoff, imageHandoffPackageSignoffJson,
  imageHandoffActiveArtboardPackageSignoffJson, imageHandoffPackageSignoffTsv,
  imageHandoffActiveArtboardPackageSignoffTsv, imageHandoffPackageDeliveryManifestJson,
  imageHandoffActiveArtboardPackageDeliveryManifestJson, imageHandoffPackageDeliveryManifestTsv,
  imageHandoffActiveArtboardPackageDeliveryManifestTsv, imageHandoffPackageProvenanceJson,
  imageHandoffActiveArtboardPackageProvenanceJson, imageHandoffPackageProvenanceTsv,
  imageHandoffActiveArtboardPackageProvenanceTsv, imageHandoffPackageRightsManifestReport,
  imageHandoffActiveArtboardPackageRightsManifestReport, imageHandoffPackageRightsManifestJson,
  imageHandoffActiveArtboardPackageRightsManifestJson, imageHandoffPackageRightsManifestTsv,
  imageHandoffActiveArtboardPackageRightsManifestTsv, imageHandoffPackageAcceptanceJson,
  imageHandoffActiveArtboardPackageAcceptanceJson, imageHandoffPackageAcceptanceTsv,
  imageHandoffActiveArtboardPackageAcceptanceTsv, imageHandoffPackageDeliveryReceiptReport,
  imageHandoffActiveArtboardPackageDeliveryReceiptReport, imageHandoffPackageDeliveryReceiptJson,
  imageHandoffActiveArtboardPackageDeliveryReceiptJson, imageHandoffPackageDeliveryReceiptTsv,
  imageHandoffActiveArtboardPackageDeliveryReceiptTsv, imageHandoffPackageReleaseNotesReport,
  imageHandoffActiveArtboardPackageReleaseNotesReport, imageHandoffPackageReleaseNotesJson,
  imageHandoffActiveArtboardPackageReleaseNotesJson, imageHandoffPackageReleaseNotesTsv,
  imageHandoffActiveArtboardPackageReleaseNotesTsv, imageHandoffPackageSbomJson,
  imageHandoffActiveArtboardPackageSbomJson, imageHandoffPackageSbomTsv,
  imageHandoffActiveArtboardPackageSbomTsv, imageHandoffPackageAttestationJson,
  imageHandoffActiveArtboardPackageAttestationJson, imageHandoffPackageAttestationTsv,
  imageHandoffActiveArtboardPackageAttestationTsv, imageHandoffPackageRiskRegisterReport,
  imageHandoffActiveArtboardPackageRiskRegisterReport, imageHandoffPackageRiskRegisterJson,
  imageHandoffActiveArtboardPackageRiskRegisterJson, imageHandoffPackageRiskRegisterTsv,
  imageHandoffActiveArtboardPackageRiskRegisterTsv, imageHandoffPackageVerificationSummaryReport,
  imageHandoffActiveArtboardPackageVerificationSummaryReport,
  imageHandoffPackageVerificationSummaryJson,
  imageHandoffActiveArtboardPackageVerificationSummaryJson,
  imageHandoffPackageVerificationSummaryTsv,
  imageHandoffActiveArtboardPackageVerificationSummaryTsv, imageHandoffPackageClientReadme,
  imageHandoffActiveArtboardPackageClientReadme, imageHandoffPackageClientReadmeJson,
  imageHandoffActiveArtboardPackageClientReadmeJson, imageHandoffPackageChangeLogReport,
  imageHandoffActiveArtboardPackageChangeLogReport, imageHandoffPackageChangeLogJson,
  imageHandoffActiveArtboardPackageChangeLogJson, imageHandoffPackageChangeLogTsv,
  imageHandoffActiveArtboardPackageChangeLogTsv, imageHandoffPackageRelinkMapReport,
  imageHandoffActiveArtboardPackageRelinkMapReport, imageHandoffPackageRelinkMapJson,
  imageHandoffActiveArtboardPackageRelinkMapJson, imageHandoffPackageRelinkMapTsv,
  imageHandoffActiveArtboardPackageRelinkMapTsv, imageHandoffPackagePrepressTicketReport,
  imageHandoffActiveArtboardPackagePrepressTicketReport, imageHandoffPackagePrepressTicketJson,
  imageHandoffActiveArtboardPackagePrepressTicketJson, imageHandoffPackagePrepressTicketTsv,
  imageHandoffActiveArtboardPackagePrepressTicketTsv, imageHandoffPackagePrinterIntakeReport,
  imageHandoffActiveArtboardPackagePrinterIntakeReport, imageHandoffPackagePrinterIntakeJson,
  imageHandoffActiveArtboardPackagePrinterIntakeJson, imageHandoffPackagePrinterIntakeTsv,
  imageHandoffActiveArtboardPackagePrinterIntakeTsv, imageHandoffPackageShopProofChecklistReport,
  imageHandoffActiveArtboardPackageShopProofChecklistReport,
  imageHandoffPackageShopProofChecklistJson,
  imageHandoffActiveArtboardPackageShopProofChecklistJson, imageHandoffPackageShopProofChecklistTsv,
  imageHandoffActiveArtboardPackageShopProofChecklistTsv, imageHandoffPackageProductionHandoffJson,
  imageHandoffActiveArtboardPackageProductionHandoffJson, imageHandoffPackageProductionHandoffTsv,
  imageHandoffActiveArtboardPackageProductionHandoffTsv,
  imageHandoffPackagePrintReleaseApprovalReport,
  imageHandoffActiveArtboardPackagePrintReleaseApprovalReport,
  imageHandoffPackagePrintReleaseApprovalJson,
  imageHandoffActiveArtboardPackagePrintReleaseApprovalJson,
  imageHandoffPackagePrintReleaseApprovalTsv,
  imageHandoffActiveArtboardPackagePrintReleaseApprovalTsv, imageHandoffPackageVendorQaReport,
  imageHandoffActiveArtboardPackageVendorQaReport, imageHandoffPackageVendorQaJson,
  imageHandoffActiveArtboardPackageVendorQaJson, imageHandoffPackageVendorQaTsv,
  imageHandoffActiveArtboardPackageVendorQaTsv, imageHandoffPackagePressRunTicketReport,
  imageHandoffActiveArtboardPackagePressRunTicketReport, imageHandoffPackagePressRunTicketJson,
  imageHandoffActiveArtboardPackagePressRunTicketJson, imageHandoffPackagePressRunTicketTsv,
  imageHandoffActiveArtboardPackagePressRunTicketTsv, imageHandoffPackagePostpressInspectionReport,
  imageHandoffActiveArtboardPackagePostpressInspectionReport,
  imageHandoffPackagePostpressInspectionJson,
  imageHandoffActiveArtboardPackagePostpressInspectionJson,
  imageHandoffPackagePostpressInspectionTsv,
  imageHandoffActiveArtboardPackagePostpressInspectionTsv,
  imageHandoffPackageFinishedGoodsReleaseReport,
  imageHandoffActiveArtboardPackageFinishedGoodsReleaseReport,
  imageHandoffPackageFinishedGoodsReleaseJson,
  imageHandoffActiveArtboardPackageFinishedGoodsReleaseJson,
  imageHandoffPackageFinishedGoodsReleaseTsv,
  imageHandoffActiveArtboardPackageFinishedGoodsReleaseTsv,
  imageHandoffPackageShipmentHandoffReport, imageHandoffActiveArtboardPackageShipmentHandoffReport,
  imageHandoffPackageShipmentHandoffJson, imageHandoffActiveArtboardPackageShipmentHandoffJson,
  imageHandoffPackageShipmentHandoffTsv, imageHandoffActiveArtboardPackageShipmentHandoffTsv,
  imageHandoffPackageDeliveryConfirmationReport,
  imageHandoffActiveArtboardPackageDeliveryConfirmationReport,
  imageHandoffPackageDeliveryConfirmationJson,
  imageHandoffActiveArtboardPackageDeliveryConfirmationJson,
  imageHandoffPackageDeliveryConfirmationTsv,
  imageHandoffActiveArtboardPackageDeliveryConfirmationTsv,
  imageHandoffPackageReleaseGateJson, imageHandoffActiveArtboardPackageReleaseGateJson,
  imageHandoffPackageReleaseGateReport, imageHandoffActiveArtboardPackageReleaseGateReport,
  imageHandoffPackageReleaseGateTsv, imageHandoffActiveArtboardPackageReleaseGateTsv,
  imageHandoffPackageReleaseGateVerifyScript,
  imageHandoffActiveArtboardPackageReleaseGateVerifyScript,
  imageHandoffPackageReleaseGateVerifyPowerShell,
  imageHandoffActiveArtboardPackageReleaseGateVerifyPowerShell, imageHandoffPackageCiManifestJson,
  imageHandoffActiveArtboardPackageCiManifestJson, imageHandoffPackageGithubActionsWorkflow,
  imageHandoffActiveArtboardPackageGithubActionsWorkflow, imageHandoffPackageGitlabCiWorkflow,
  imageHandoffActiveArtboardPackageGitlabCiWorkflow, imageHandoffPackageAzurePipelinesWorkflow,
  imageHandoffActiveArtboardPackageAzurePipelinesWorkflow, imageHandoffPackageCircleCiWorkflow,
  imageHandoffActiveArtboardPackageCircleCiWorkflow, imageHandoffPackageJenkinsfile,
  imageHandoffActiveArtboardPackageJenkinsfile, imageHandoffPackageBitbucketPipelinesWorkflow,
  imageHandoffActiveArtboardPackageBitbucketPipelinesWorkflow, imageHandoffPackageBuildkiteWorkflow,
  imageHandoffActiveArtboardPackageBuildkiteWorkflow, imageHandoffPackageDroneWorkflow,
  imageHandoffActiveArtboardPackageDroneWorkflow, imageHandoffPackageTeamCityWorkflow,
  imageHandoffActiveArtboardPackageTeamCityWorkflow, imageHandoffPackageReadme,
  imageHandoffActiveArtboardPackageReadme, imageHandoffPackageTree,
  imageHandoffActiveArtboardPackageTree, imageHandoffPackageBundleJson,
  imageHandoffActiveArtboardPackageBundleJson, imageHandoffPackageBlockers,
  imageHandoffActiveArtboardPackageBlockers, imageHandoffPackageGateJson,
  imageHandoffActiveArtboardPackageGateJson
} from '../imageHandoff';


describe('selection lock operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeObject = (locked = false, extra: Record<string, unknown> = {}) => ({
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    set: vi.fn(function set(this: Record<string, unknown>, props: Record<string, unknown>) {
      Object.assign(this, props);
    }),
    ...extra,
  });

  it('locks only unselected exportable objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const selected = makeObject();
    const other = makeObject();
    const alreadyLocked = makeObject(true);
    const guide = makeObject(false, { excludeFromExport: true });
    const canvas = {
      getActiveObjects: () => [selected],
      getObjects: () => [selected, other, alreadyLocked, guide],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(lockOthers()).toBe(1);
    expect(selected.set).not.toHaveBeenCalled();
    expect(other).toMatchObject({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    expect(alreadyLocked.set).not.toHaveBeenCalled();
    expect(guide.set).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not push history when nothing changes', async () => {
    const canvasEngine = await import('../canvasEngine');
    const selected = makeObject();
    const alreadyLocked = makeObject(true);
    const canvas = {
      getActiveObjects: () => [selected],
      getObjects: () => [selected, alreadyLocked],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(lockOthers()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('requires an active selection', async () => {
    const canvasEngine = await import('../canvasEngine');
    const other = makeObject();
    const canvas = {
      getActiveObjects: () => [],
      getObjects: () => [other],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(lockOthers()).toBe(0);
    expect(other.set).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });


  it('locks printable objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const alreadyLocked = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    const otherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlaySameBoard = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameBoard, alreadyLocked, otherBoard, overlaySameBoard],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(lockActiveArtboard()).toBe(2);
      expect(active).toMatchObject({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
      expect(sameBoard).toMatchObject({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
      expect(otherBoard.lockMovementX).not.toBe(true);
      expect(overlaySameBoard.lockMovementX).not.toBe(true);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('locks printable objects outside the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const otherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const alreadyLocked = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    const overlayOther = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameBoard, otherBoard, alreadyLocked, overlayOther],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(lockOtherArtboards()).toBe(1);
      expect(sameBoard.lockMovementX).not.toBe(true);
      expect(otherBoard).toMatchObject({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
      expect(overlayOther.lockMovementX).not.toBe(true);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('hides printable objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const alreadyHidden = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const otherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlaySameBoard = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameBoard, alreadyHidden, otherBoard, overlaySameBoard],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(hideActiveArtboard()).toBe(2);
      expect(active.visible).toBe(false);
      expect(sameBoard.visible).toBe(false);
      expect(otherBoard.visible).not.toBe(false);
      expect(overlaySameBoard.visible).not.toBe(false);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('hides printable objects outside the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const otherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const alreadyHidden = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const overlayOther = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameBoard, otherBoard, alreadyHidden, overlayOther],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(hideOtherArtboards()).toBe(1);
      expect(sameBoard.visible).not.toBe(false);
      expect(otherBoard.visible).toBe(false);
      expect(overlayOther.visible).not.toBe(false);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('reveals only hidden artwork outside the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const hiddenSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const hiddenOtherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const visibleOtherBoard = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayHidden = new fabric.Rect({ left: 20, top: 40, width: 20, height: 20, strokeWidth: 0, visible: false, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, hiddenSameBoard, hiddenOtherBoard, visibleOtherBoard, overlayHidden],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(showOtherArtboards()).toBe(1);
      expect(hiddenSameBoard.visible).toBe(false);
      expect(hiddenOtherBoard.visible).toBe(true);
      expect(overlayHidden.visible).toBe(false);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('reveals only hidden artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const hiddenSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const hiddenOtherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const visibleSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayHidden = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, visible: false, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, hiddenSameBoard, hiddenOtherBoard, visibleSameBoard, overlayHidden],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(showActiveArtboard()).toBe(1);
      expect(hiddenSameBoard.visible).toBe(true);
      expect(hiddenOtherBoard.visible).toBe(false);
      expect(overlayHidden.visible).toBe(false);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('unlocks only locked artwork outside the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const lockedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    const lockedOtherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    const unlockedOtherBoard = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayLocked = new fabric.Rect({ left: 20, top: 40, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, lockedSameBoard, lockedOtherBoard, unlockedOtherBoard, overlayLocked],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(unlockOtherArtboards()).toBe(1);
      expect(lockedSameBoard.lockMovementX).toBe(true);
      expect(lockedOtherBoard).toMatchObject({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
      expect(overlayLocked.lockMovementX).toBe(true);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('unlocks only locked artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const lockedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    const lockedOtherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    const unlockedSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayLocked = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, lockedSameBoard, lockedOtherBoard, unlockedSameBoard, overlayLocked],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(unlockActiveArtboard()).toBe(1);
      expect(lockedSameBoard).toMatchObject({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
      expect(lockedOtherBoard.lockMovementX).toBe(true);
      expect(overlayLocked.lockMovementX).toBe(true);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('unlocks only locked objects in the active selection', async () => {
    const canvasEngine = await import('../canvasEngine');
    const selectedLocked = makeObject(true);
    const selectedUnlocked = makeObject(false);
    const otherLocked = makeObject(true);
    const canvas = {
      getActiveObjects: () => [selectedLocked, selectedUnlocked],
      getObjects: () => [selectedLocked, selectedUnlocked, otherLocked],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(unlockSelection()).toBe(1);
    expect(selectedLocked).toMatchObject({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
    expect(selectedUnlocked.set).not.toHaveBeenCalled();
    expect(otherLocked).toMatchObject({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not push history when selected objects are already unlocked', async () => {
    const canvasEngine = await import('../canvasEngine');
    const selectedUnlocked = makeObject(false);
    const canvas = {
      getActiveObjects: () => [selectedUnlocked],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(unlockSelection()).toBe(0);
    expect(selectedUnlocked.set).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});







describe('appearance audit selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects exportable objects with live shadows', async () => {
    const canvasEngine = await import('../canvasEngine');
    const shadowed = new fabric.Rect({ width: 10, height: 10 });
    shadowed.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 2, offsetY: 3 });
    const glowGroup = new fabric.Group([new fabric.Rect({ width: 5, height: 5 })]);
    glowGroup.shadow = new fabric.Shadow({ color: 'rgba(61,155,255,0.45)', blur: 12, offsetX: 0, offsetY: 0 });
    const plain = new fabric.Rect({ width: 10, height: 10 });
    const overlayShadow = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    overlayShadow.shadow = new fabric.Shadow({ color: '#000', blur: 4 });
    const canvas = {
      getObjects: () => [shadowed, glowGroup, plain, overlayShadow],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectDropShadowObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([shadowed, glowGroup]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects shadowed and transparent artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const shadowFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    shadowFirstBoard.shadow = new fabric.Shadow({ color: '#000', blur: 4 });
    const transparentFirstBoard = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, strokeWidth: 0, opacity: 0.5 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const shadowSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    shadowSameBoard.shadow = new fabric.Shadow({ color: '#000', blur: 8 });
    const transparentSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, opacity: 0.4 });
    const blendedSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0, globalCompositeOperation: 'multiply' });
    const plainSameBoard = new fabric.Rect({ left: 245, top: 40, width: 10, height: 10, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [shadowFirstBoard, transparentFirstBoard, active, shadowSameBoard, transparentSameBoard, blendedSameBoard, plainSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectDropShadowActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(shadowSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectTransparencyActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([transparentSameBoard, blendedSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no shadowed objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectDropShadowObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects objects with opacity or non-normal blend modes', async () => {
    const canvasEngine = await import('../canvasEngine');
    const translucent = new fabric.Rect({ width: 10, height: 10, opacity: 0.5 });
    const blended = new fabric.Rect({ width: 10, height: 10, globalCompositeOperation: 'multiply' });
    const normal = new fabric.Rect({ width: 10, height: 10, opacity: 1, globalCompositeOperation: 'source-over' });
    const overlayTransparent = new fabric.Rect({ width: 10, height: 10, opacity: 0.2, excludeFromExport: true });
    const unselectableBlended = new fabric.Rect({ width: 10, height: 10, globalCompositeOperation: 'screen', selectable: false });
    const canvas = {
      getObjects: () => [translucent, blended, normal, overlayTransparent, unselectableBlended],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransparencyObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([translucent, blended]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no transparency objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10, opacity: 1, globalCompositeOperation: 'source-over' })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransparencyObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });


  it('selects fully transparent exported artwork separately from regular transparency', async () => {
    const canvasEngine = await import('../canvasEngine');
    const zeroOpacity = new fabric.Rect({ width: 10, height: 10, opacity: 0 });
    const nearlyZero = new fabric.Rect({ width: 10, height: 10, opacity: 0.0005 });
    const translucent = new fabric.Rect({ width: 10, height: 10, opacity: 0.2 });
    const overlayZero = new fabric.Rect({ width: 10, height: 10, opacity: 0, excludeFromExport: true });
    const canvas = {
      getObjects: () => [zeroOpacity, nearlyZero, translucent, overlayZero],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectFullyTransparentObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([zeroOpacity, nearlyZero]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects fully transparent artwork only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const zeroFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, opacity: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const zeroSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, opacity: 0 });
    const translucentSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, opacity: 0.2 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [zeroFirstBoard, active, zeroSameBoard, translucentSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectFullyTransparentActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(zeroSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes fully transparent exported artwork after cleanup review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const zeroOpacity = new fabric.Rect({ width: 10, height: 10, opacity: 0 });
    const nearlyZero = new fabric.Rect({ width: 10, height: 10, opacity: 0.0005 });
    const translucent = new fabric.Rect({ width: 10, height: 10, opacity: 0.2 });
    const overlayZero = new fabric.Rect({ width: 10, height: 10, opacity: 0, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [zeroOpacity, nearlyZero, translucent, overlayZero];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixFullyTransparentObjects()).toBe(2);
    expect(objects).toEqual([translucent, overlayZero]);
    expect(canvas.remove).toHaveBeenCalledWith(zeroOpacity);
    expect(canvas.remove).toHaveBeenCalledWith(nearlyZero);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixFullyTransparentObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes fully transparent artwork only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const zeroFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, opacity: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const zeroSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, opacity: 0 });
    const translucentSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, opacity: 0.2 });
    const objects: fabric.FabricObject[] = [zeroFirstBoard, active, zeroSameBoard, translucentSameBoard];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixFullyTransparentActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([zeroFirstBoard, active, translucentSameBoard]);
      expect(canvas.remove).toHaveBeenCalledWith(zeroSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixFullyTransparentActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('fixes transparency appearance for print handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const translucent = new fabric.Rect({ width: 10, height: 10, opacity: 0.4 });
    const blended = new fabric.Rect({ width: 10, height: 10, globalCompositeOperation: 'multiply' });
    const childTransparent = new fabric.Rect({ width: 10, height: 10, opacity: 0.6, globalCompositeOperation: 'screen' });
    const group = new fabric.Group([childTransparent]);
    const normal = new fabric.Rect({ width: 10, height: 10, opacity: 1, globalCompositeOperation: 'source-over' });
    const overlayTransparent = new fabric.Rect({ width: 10, height: 10, opacity: 0.2, excludeFromExport: true });
    const canvas = {
      getObjects: () => [translucent, blended, group, normal, overlayTransparent],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixTransparencyObjects()).toBe(3);
    expect(translucent.opacity).toBe(1);
    expect(translucent.globalCompositeOperation).toBe('source-over');
    expect(blended.opacity).toBe(1);
    expect(blended.globalCompositeOperation).toBe('source-over');
    expect(childTransparent.opacity).toBe(1);
    expect(childTransparent.globalCompositeOperation).toBe('source-over');
    expect(normal.opacity).toBe(1);
    expect(normal.globalCompositeOperation).toBe('source-over');
    expect(overlayTransparent.opacity).toBe(0.2);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixTransparencyObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes transparency appearance only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstTransparent = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, opacity: 0.5 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, opacity: 1 });
    const sameTransparent = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, opacity: 0.4, globalCompositeOperation: 'multiply' });
    const sameNormal = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, opacity: 1, globalCompositeOperation: 'source-over' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstTransparent, active, sameTransparent, sameNormal],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixTransparencyActiveArtboardObjects()).toBe(1);
      expect(sameTransparent.opacity).toBe(1);
      expect(sameTransparent.globalCompositeOperation).toBe('source-over');
      expect(firstTransparent.opacity).toBe(0.5);
      expect(sameNormal.opacity).toBe(1);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixTransparencyActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects with dashed stroke patterns', async () => {
    const canvasEngine = await import('../canvasEngine');
    const dashed = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeDashArray: [6, 4] });
    const zeroDash = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 2, strokeDashArray: [0, 0] });
    const solid = new fabric.Rect({ width: 10, height: 10, stroke: '#333333', strokeWidth: 2 });
    const overlayDashed = new fabric.Rect({ width: 10, height: 10, stroke: '#444444', strokeWidth: 2, strokeDashArray: [3, 2], excludeFromExport: true });
    const canvas = {
      getObjects: () => [dashed, zeroDash, solid, overlayDashed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectDashedStrokeObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(dashed);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('fixes dashed strokes to solid lines for print handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const dashed = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeDashArray: [6, 4] });
    const childDashed = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 1, strokeDashArray: [3, 2] });
    const group = new fabric.Group([childDashed]);
    const zeroDash = new fabric.Rect({ width: 10, height: 10, stroke: '#333333', strokeWidth: 2, strokeDashArray: [0, 0] });
    const solid = new fabric.Rect({ width: 10, height: 10, stroke: '#444444', strokeWidth: 2 });
    const overlayDashed = new fabric.Rect({ width: 10, height: 10, stroke: '#555555', strokeWidth: 2, strokeDashArray: [5, 5], excludeFromExport: true });
    const canvas = {
      getObjects: () => [dashed, group, zeroDash, solid, overlayDashed],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixDashedStrokeObjects()).toBe(2);
    expect(dashed.strokeDashArray).toBeNull();
    expect(childDashed.strokeDashArray).toBeNull();
    expect(zeroDash.strokeDashArray).toEqual([0, 0]);
    expect(solid.strokeDashArray).toBeNull();
    expect(overlayDashed.strokeDashArray).toEqual([5, 5]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixDashedStrokeObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes dashed strokes only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstDashed = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, stroke: '#111111', strokeWidth: 2, strokeDashArray: [6, 4] });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameDashed = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, stroke: '#222222', strokeWidth: 2, strokeDashArray: [3, 2] });
    const sameSolid = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, stroke: '#333333', strokeWidth: 2 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstDashed, active, sameDashed, sameSolid],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixDashedStrokeActiveArtboardObjects()).toBe(1);
      expect(sameDashed.strokeDashArray).toBeNull();
      expect(firstDashed.strokeDashArray).toEqual([6, 4]);
      expect(sameSolid.strokeDashArray).toBeNull();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixDashedStrokeActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no dashed stroke objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeDashArray: [0, 0] })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectDashedStrokeObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects painted objects with stroke widths thinner than the print threshold', async () => {
    const canvasEngine = await import('../canvasEngine');
    const hairline = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 0.1 });
    const nearThreshold = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 0.24 });
    const zeroWidth = new fabric.Rect({ width: 10, height: 10, stroke: '#333333', strokeWidth: 0 });
    const thresholdWidth = new fabric.Rect({ width: 10, height: 10, stroke: '#444444', strokeWidth: 0.25 });
    const normalWidth = new fabric.Rect({ width: 10, height: 10, stroke: '#555555', strokeWidth: 1 });
    const unpaintedThin = new fabric.Rect({ width: 10, height: 10, stroke: '', strokeWidth: 0.1 });
    const overlayThin = new fabric.Rect({ width: 10, height: 10, stroke: '#666666', strokeWidth: 0.1, excludeFromExport: true });
    const canvas = {
      getObjects: () => [hairline, nearThreshold, zeroWidth, thresholdWidth, normalWidth, unpaintedThin, overlayThin],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectThinStrokeObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([hairline, nearThreshold]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('fixes hairline strokes to the safe print threshold', async () => {
    const canvasEngine = await import('../canvasEngine');
    const thin = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 0.1 });
    const childThin = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 0.2 });
    const group = new fabric.Group([childThin]);
    const safe = new fabric.Rect({ width: 10, height: 10, stroke: '#333333', strokeWidth: 0.25 });
    const noStroke = new fabric.Rect({ width: 10, height: 10, strokeWidth: 0 });
    const overlayThin = new fabric.Rect({ width: 10, height: 10, stroke: '#444444', strokeWidth: 0.1, excludeFromExport: true });
    const canvas = {
      getObjects: () => [thin, group, safe, noStroke, overlayThin],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixThinStrokeObjects()).toBe(2);
    expect(thin.strokeWidth).toBe(0.25);
    expect(childThin.strokeWidth).toBe(0.25);
    expect(safe.strokeWidth).toBe(0.25);
    expect(noStroke.strokeWidth).toBe(0);
    expect(overlayThin.strokeWidth).toBe(0.1);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixThinStrokeObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes hairline strokes only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstThin = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, stroke: '#111111', strokeWidth: 0.1 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameThin = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, stroke: '#222222', strokeWidth: 0.1 });
    const sameSafe = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, stroke: '#333333', strokeWidth: 0.25 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstThin, active, sameThin, sameSafe],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixThinStrokeActiveArtboardObjects()).toBe(1);
      expect(sameThin.strokeWidth).toBe(0.25);
      expect(firstThin.strokeWidth).toBe(0.1);
      expect(sameSafe.strokeWidth).toBe(0.25);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixThinStrokeActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no thin stroke objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [
        new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 0 }),
        new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 0.25 }),
        new fabric.Rect({ width: 10, height: 10, stroke: null, strokeWidth: 0.1 }),
      ],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectThinStrokeObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects objects carrying imported overprint metadata', async () => {
    const canvasEngine = await import('../canvasEngine');
    const fillOverprint = new fabric.Rect({ width: 10, height: 10 });
    (fillOverprint as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const strokeOverprint = new fabric.Rect({ width: 10, height: 10 });
    (strokeOverprint as unknown as { data: { strokeOverprint: string } }).data = { strokeOverprint: 'yes' };
    const disabledOverprint = new fabric.Rect({ width: 10, height: 10 });
    (disabledOverprint as unknown as { overprint: string }).overprint = 'false';
    const overlayOverprint = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayOverprint as unknown as { overprintStroke: number }).overprintStroke = 1;
    const canvas = {
      getObjects: () => [fillOverprint, strokeOverprint, disabledOverprint, overlayOverprint],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOverprintObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([fillOverprint, strokeOverprint]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('clears all overprint metadata for print handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const fillOverprint = new fabric.Rect({ width: 10, height: 10 });
    (fillOverprint as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const strokeOverprint = new fabric.Rect({ width: 10, height: 10 });
    (strokeOverprint as unknown as { data: { strokeOverprint: string } }).data = { strokeOverprint: 'yes' };
    const childOverprint = new fabric.Rect({ width: 10, height: 10 });
    (childOverprint as unknown as { overprintStroke: number }).overprintStroke = 1;
    const group = new fabric.Group([childOverprint]);
    const disabledOverprint = new fabric.Rect({ width: 10, height: 10 });
    (disabledOverprint as unknown as { overprint: string }).overprint = 'false';
    const overlayOverprint = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayOverprint as unknown as { overprintFill: boolean }).overprintFill = true;
    const canvas = {
      getObjects: () => [fillOverprint, strokeOverprint, group, disabledOverprint, overlayOverprint],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixOverprintObjects()).toBe(3);
    expect((fillOverprint as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(false);
    expect((strokeOverprint as unknown as { data: { strokeOverprint?: unknown } }).data.strokeOverprint).toBe(false);
    expect((childOverprint as unknown as { overprintStroke?: unknown }).overprintStroke).toBe(false);
    expect((disabledOverprint as unknown as { overprint?: string }).overprint).toBe('false');
    expect((overlayOverprint as unknown as { overprintFill?: boolean }).overprintFill).toBe(true);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixOverprintObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clears all overprint metadata only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstOverprint = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstOverprint as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameOverprint = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameOverprint as unknown as { overprintFill: boolean }).overprintFill = true;
    const sameMetadataOverprint = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameMetadataOverprint as unknown as { metadata: { strokeOverprint: string } }).metadata = { strokeOverprint: 'on' };
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstOverprint, active, sameOverprint, sameMetadataOverprint],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixOverprintActiveArtboardObjects()).toBe(2);
      expect((sameOverprint as unknown as { overprintFill?: boolean }).overprintFill).toBe(false);
      expect((sameMetadataOverprint as unknown as { metadata: { strokeOverprint?: unknown } }).metadata.strokeOverprint).toBe(false);
      expect((firstOverprint as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(true);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixOverprintActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects dashed, thin, and overprint artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const dashedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, stroke: '#111', strokeWidth: 2, strokeDashArray: [4, 2] });
    const thinFirstBoard = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, stroke: '#111', strokeWidth: 0.1 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const dashedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, stroke: '#111', strokeWidth: 2, strokeDashArray: [6, 3] });
    const thinSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, stroke: '#222', strokeWidth: 0.1 });
    const overprintSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0 });
    (overprintSameBoard as unknown as { overprintFill: boolean }).overprintFill = true;
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [dashedFirstBoard, thinFirstBoard, active, dashedSameBoard, thinSameBoard, overprintSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectDashedStrokeActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(dashedSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectThinStrokeActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(thinSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectOverprintActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(overprintSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      (overprintSameBoard as unknown as { fill: string }).fill = '#fff';
      expect(selectWhiteOverprintActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(overprintSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      (overprintSameBoard as unknown as { fill: unknown }).fill = { name: 'PANTONE 185 C', spot: true };
      expect(selectSpotColorActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(overprintSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects and fixes white overprint preflight risks', async () => {
    const canvasEngine = await import('../canvasEngine');
    const whiteFill = new fabric.Rect({ width: 10, height: 10, fill: '#fff' });
    (whiteFill as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const whiteStroke = new fabric.Rect({ width: 10, height: 10, stroke: 'rgb(255, 255, 255)' });
    (whiteStroke as unknown as { overprintStroke: boolean }).overprintStroke = true;
    const cmykWhite = new fabric.Rect({ width: 10, height: 10 });
    (cmykWhite as unknown as { fill: unknown; overprint: boolean }).fill = { c: 0, m: 0, y: 0, k: 0 };
    (cmykWhite as unknown as { overprint: boolean }).overprint = true;
    const blackOverprint = new fabric.Rect({ width: 10, height: 10, fill: '#000' });
    (blackOverprint as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const overlayWhite = new fabric.Rect({ width: 10, height: 10, fill: '#fff', excludeFromExport: true });
    (overlayWhite as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const canvas = {
      getObjects: () => [whiteFill, whiteStroke, cmykWhite, blackOverprint, overlayWhite],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(selectWhiteOverprintObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([whiteFill, whiteStroke, cmykWhite]);

    vi.clearAllMocks();
    expect(fixWhiteOverprintObjects()).toBe(3);
    expect((whiteFill as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(false);
    expect((whiteStroke as unknown as { overprintStroke?: boolean }).overprintStroke).toBe(false);
    expect((cmykWhite as unknown as { overprint?: boolean }).overprint).toBe(false);
    expect((blackOverprint as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(true);
    expect((overlayWhite as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(true);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixWhiteOverprintObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('selects spot color separation artwork', async () => {
    const canvasEngine = await import('../canvasEngine');
    const pantoneFill = new fabric.Rect({ width: 10, height: 10 });
    (pantoneFill as unknown as { fill: unknown }).fill = { name: 'PANTONE 185 C', spot: true };
    const separationStroke = new fabric.Rect({ width: 10, height: 10 });
    (separationStroke as unknown as { stroke: unknown }).stroke = { type: 'separation', ink: 'Foil Gold' };
    const namedSpotChild = new fabric.Rect({ width: 10, height: 10 });
    (namedSpotChild as unknown as { fill: unknown }).fill = { swatchName: 'Spot Varnish' };
    const group = new fabric.Group([namedSpotChild]);
    const process = new fabric.Rect({ width: 10, height: 10 });
    (process as unknown as { fill: unknown }).fill = { c: 20, m: 30, y: 40, k: 0 };
    const overlaySpot = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlaySpot as unknown as { fill: unknown }).fill = { name: 'PANTONE 300 C', spot: true };
    const canvas = {
      getObjects: () => [pantoneFill, separationStroke, group, process, overlaySpot],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectSpotColorObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([pantoneFill, separationStroke, group]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects and converts RGB color artwork to process CMYK', async () => {
    const canvasEngine = await import('../canvasEngine');
    const hexFill = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const rgbStroke = new fabric.Rect({ width: 10, height: 10, stroke: 'rgb(255, 0, 128)' });
    const objectRgb = new fabric.Rect({ width: 10, height: 10 });
    (objectRgb as unknown as { fill: unknown }).fill = { mode: 'rgb', r: 0, g: 0.5, b: 1 };
    const childRgb = new fabric.Rect({ width: 10, height: 10 });
    (childRgb as unknown as { fill: unknown }).fill = { red: 128, green: 128, blue: 128 };
    const group = new fabric.Group([childRgb]);
    const cmyk = new fabric.Rect({ width: 10, height: 10 });
    (cmyk as unknown as { fill: unknown }).fill = { c: 20, m: 30, y: 40, k: 0 };
    const overlayRgb = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000', excludeFromExport: true });
    const canvas = {
      getObjects: () => [hexFill, rgbStroke, objectRgb, group, cmyk, overlayRgb],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(selectRgbColorObjects()).toBe(4);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([hexFill, rgbStroke, objectRgb, group]);

    vi.clearAllMocks();
    expect(fixRgbColorObjects()).toBe(4);
    expect((hexFill.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 66.667, m: 33.333, y: 0, k: 40, name: 'Process RGB' });
    expect((rgbStroke.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 100, y: 49.804, k: 0, name: 'Process RGB' });
    expect((objectRgb.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 50, y: 0, k: 0, name: 'Process RGB' });
    expect((childRgb.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 49.804, name: 'Process RGB' });
    expect((cmyk.fill as { c?: number }).c).toBe(20);
    expect((overlayRgb.fill as string)).toBe('#ff0000');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixRgbColorObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('converts RGB colors only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstRgb = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#ff0000' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameRgb = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#00ff00' });
    const sameCmyk = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameCmyk as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstRgb, active, sameRgb, sameCmyk],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(selectRgbColorActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(sameRgb);
      canvas.requestRenderAll.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.discardActiveObject.mockClear();

      expect(fixRgbColorActiveArtboardObjects()).toBe(1);
      expect((sameRgb.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 0, y: 100, k: 0, name: 'Process RGB' });
      expect((firstRgb.fill as string)).toBe('#ff0000');
      expect((sameCmyk.fill as { k?: number }).k).toBe(100);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixRgbColorActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects and converts grayscale color artwork to process CMYK', async () => {
    const canvasEngine = await import('../canvasEngine');
    const grayFill = new fabric.Rect({ width: 10, height: 10 });
    (grayFill as unknown as { fill: unknown }).fill = { mode: 'DeviceGray', gray: 45 };
    const grayStroke = new fabric.Rect({ width: 10, height: 10 });
    (grayStroke as unknown as { stroke: unknown }).stroke = { type: 'grayscale', grey: 0.72 };
    const childGray = new fabric.Rect({ width: 10, height: 10 });
    (childGray as unknown as { fill: unknown }).fill = { gray: 25 };
    const group = new fabric.Group([childGray]);
    const defaultBlack = new fabric.Rect({ width: 10, height: 10, fill: 'black' });
    const cmyk = new fabric.Rect({ width: 10, height: 10 });
    (cmyk as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 50 };
    const overlayGray = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayGray as unknown as { fill: unknown }).fill = { mode: 'DeviceGray', gray: 60 };
    const canvas = {
      getObjects: () => [grayFill, grayStroke, group, defaultBlack, cmyk, overlayGray],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(selectGrayscaleColorObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([grayFill, grayStroke, group]);

    vi.clearAllMocks();
    expect(fixGrayscaleColorObjects()).toBe(3);
    expect((grayFill.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 45, name: 'Process Gray' });
    expect((grayStroke.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 72, name: 'Process Gray' });
    expect((childGray.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 25, name: 'Process Gray' });
    expect((defaultBlack.fill as string)).toBe('black');
    expect((cmyk.fill as { k?: number }).k).toBe(50);
    expect((overlayGray.fill as { gray?: number }).gray).toBe(60);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixGrayscaleColorObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('converts grayscale colors only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstGray = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstGray as unknown as { fill: unknown }).fill = { mode: 'DeviceGray', gray: 80 };
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameGray = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameGray as unknown as { fill: unknown }).fill = { mode: 'DeviceGray', gray: 35 };
    const sameCmyk = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameCmyk as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstGray, active, sameGray, sameCmyk],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(selectGrayscaleColorActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(sameGray);
      canvas.requestRenderAll.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.discardActiveObject.mockClear();

      expect(fixGrayscaleColorActiveArtboardObjects()).toBe(1);
      expect((sameGray.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 35, name: 'Process Gray' });
      expect((firstGray.fill as { gray?: number }).gray).toBe(80);
      expect((sameCmyk.fill as { k?: number }).k).toBe(100);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixGrayscaleColorActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects and converts Lab color artwork to process CMYK', async () => {
    const canvasEngine = await import('../canvasEngine');
    const labFill = new fabric.Rect({ width: 10, height: 10 });
    (labFill as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 53.233, a: 80.109, b: 67.22 };
    const labStroke = new fabric.Rect({ width: 10, height: 10 });
    (labStroke as unknown as { stroke: unknown }).stroke = { type: 'CIELAB', lightness: 87.737, greenRed: -86.185, blueYellow: 83.181 };
    const childLab = new fabric.Rect({ width: 10, height: 10 });
    (childLab as unknown as { fill: unknown }).fill = { colorType: 'deviceLab', l: 32, a: 0, b: 0 };
    const group = new fabric.Group([childLab]);
    const rgb = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const cmyk = new fabric.Rect({ width: 10, height: 10 });
    (cmyk as unknown as { fill: unknown }).fill = { c: 20, m: 30, y: 40, k: 0 };
    const overlayLab = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayLab as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 60, a: 20, b: 20 };
    const canvas = {
      getObjects: () => [labFill, labStroke, group, rgb, cmyk, overlayLab],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(selectLabColorObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([labFill, labStroke, group]);

    vi.clearAllMocks();
    expect(fixLabColorObjects()).toBe(3);
    expect((labFill.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 100, y: 100, k: 0, name: 'Process Lab' });
    expect((labStroke.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 0, y: 100, k: 0, name: 'Process Lab' });
    expect((childLab.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 70.588, name: 'Process Lab' });
    expect((rgb.fill as string)).toBe('#336699');
    expect((cmyk.fill as { c?: number }).c).toBe(20);
    expect((overlayLab.fill as { l?: number }).l).toBe(60);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixLabColorObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('converts Lab colors only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstLab = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstLab as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 53.233, a: 80.109, b: 67.22 };
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameLab = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameLab as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 87.737, a: -86.185, b: 83.181 };
    const sameCmyk = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameCmyk as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstLab, active, sameLab, sameCmyk],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(selectLabColorActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(sameLab);
      canvas.requestRenderAll.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.discardActiveObject.mockClear();

      expect(fixLabColorActiveArtboardObjects()).toBe(1);
      expect((sameLab.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 0, y: 100, k: 0, name: 'Process Lab' });
      expect((firstLab.fill as { l?: number }).l).toBe(53.233);
      expect((sameCmyk.fill as { k?: number }).k).toBe(100);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixLabColorActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects and converts mixed non-CMYK colors in one preflight pass', async () => {
    const canvasEngine = await import('../canvasEngine');
    const spot = new fabric.Rect({ width: 10, height: 10 });
    (spot as unknown as { fill: unknown }).fill = { name: 'PANTONE 185 C', spot: true, c: 0, m: 91, y: 76, k: 0 };
    const rgb = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const gray = new fabric.Rect({ width: 10, height: 10 });
    (gray as unknown as { stroke: unknown }).stroke = { mode: 'DeviceGray', gray: 40 };
    const labChild = new fabric.Rect({ width: 10, height: 10 });
    (labChild as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 87.737, a: -86.185, b: 83.181 };
    const group = new fabric.Group([labChild]);
    const cmyk = new fabric.Rect({ width: 10, height: 10 });
    (cmyk as unknown as { fill: unknown }).fill = { c: 10, m: 20, y: 30, k: 40 };
    const overlayRgb = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000', excludeFromExport: true });
    const canvas = {
      getObjects: () => [spot, rgb, gray, group, cmyk, overlayRgb],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(selectNonCmykColorObjects()).toBe(4);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([spot, rgb, gray, group]);

    vi.clearAllMocks();
    expect(fixNonCmykColorObjects()).toBe(4);
    expect((spot.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 91, y: 76, k: 0, name: 'Process 185 c' });
    expect((rgb.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 66.667, m: 33.333, y: 0, k: 40, name: 'Process RGB' });
    expect((gray.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 40, name: 'Process Gray' });
    expect((labChild.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 0, y: 100, k: 0, name: 'Process Lab' });
    expect((cmyk.fill as { c?: number }).c).toBe(10);
    expect((overlayRgb.fill as string)).toBe('#ff0000');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixNonCmykColorObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('converts mixed non-CMYK colors only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstSpot = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstSpot as unknown as { fill: unknown }).fill = { name: 'PANTONE 300 C', spot: true, c: 100, m: 44, y: 0, k: 0 };
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameRgb = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#00ff00' });
    const sameLab = new fabric.Rect({ left: 215, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameLab as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 87.737, a: -86.185, b: 83.181 };
    const sameCmyk = new fabric.Rect({ left: 240, top: 10, width: 15, height: 20, strokeWidth: 0 });
    (sameCmyk as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const canvas = {
      getActiveObject: vi.fn(() => active),
      getObjects: () => [firstSpot, active, sameRgb, sameLab, sameCmyk],
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(selectNonCmykColorActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([sameRgb, sameLab]);

      const repairFirstSpot = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
      (repairFirstSpot as unknown as { fill: unknown }).fill = { name: 'PANTONE 300 C', spot: true, c: 100, m: 44, y: 0, k: 0 };
      const repairActive = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const repairRgb = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#00ff00' });
      const repairLab = new fabric.Rect({ left: 215, top: 10, width: 20, height: 20, strokeWidth: 0 });
      (repairLab as unknown as { fill: unknown }).fill = { mode: 'Lab', l: 87.737, a: -86.185, b: 83.181 };
      const repairCmyk = new fabric.Rect({ left: 240, top: 10, width: 15, height: 20, strokeWidth: 0 });
      (repairCmyk as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
      const repairCanvas = {
        getActiveObject: () => repairActive,
        getObjects: () => [repairFirstSpot, repairActive, repairRgb, repairLab, repairCmyk],
        getActiveObjects: () => [],
        requestRenderAll: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(repairCanvas as never);

      expect(fixNonCmykColorActiveArtboardObjects()).toBe(2);
      expect((repairRgb.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 0, y: 100, k: 0, name: 'Process RGB' });
      expect((repairLab.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 100, m: 0, y: 100, k: 0, name: 'Process Lab' });
      expect((repairFirstSpot.fill as { name?: string }).name).toBe('PANTONE 300 C');
      expect((repairCmyk.fill as { k?: number }).k).toBe(100);
      expect(repairCanvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixNonCmykColorActiveArtboardObjects()).toBe(0);
      expect(repairCanvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('converts spot color separations to process CMYK paints', async () => {
    const canvasEngine = await import('../canvasEngine');
    const pantoneFill = new fabric.Rect({ width: 10, height: 10 });
    (pantoneFill as unknown as { fill: unknown }).fill = { name: 'PANTONE 185 C', spot: true, c: 0, m: 91, y: 76, k: 0 };
    const separationStroke = new fabric.Rect({ width: 10, height: 10 });
    (separationStroke as unknown as { stroke: unknown }).stroke = { type: 'separation', ink: 'Foil Gold' };
    const namedSpotChild = new fabric.Rect({ width: 10, height: 10 });
    (namedSpotChild as unknown as { fill: unknown }).fill = { swatchName: 'Spot Varnish', cyan: 0.1, magenta: 0.2, yellow: 0, black: 0 };
    const group = new fabric.Group([namedSpotChild]);
    const process = new fabric.Rect({ width: 10, height: 10 });
    (process as unknown as { fill: unknown }).fill = { c: 20, m: 30, y: 40, k: 0 };
    const overlaySpot = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlaySpot as unknown as { fill: unknown }).fill = { name: 'PANTONE 300 C', spot: true, c: 100, m: 44, y: 0, k: 0 };
    const canvas = {
      getObjects: () => [pantoneFill, separationStroke, group, process, overlaySpot],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixSpotColorObjects()).toBe(3);
    expect((pantoneFill.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 91, y: 76, k: 0, name: 'Process 185 c' });
    expect((separationStroke.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
    expect((namedSpotChild.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 10, m: 20, y: 0, k: 0, name: 'Process varnish' });
    expect((process.fill as { c?: number }).c).toBe(20);
    expect((overlaySpot.fill as { name?: string }).name).toBe('PANTONE 300 C');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixSpotColorObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('converts spot color separations only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardSpot = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstBoardSpot as unknown as { fill: unknown }).fill = { name: 'PANTONE 300 C', spot: true, c: 100, m: 44, y: 0, k: 0 };
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardSpot = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameBoardSpot as unknown as { fill: unknown }).fill = { name: 'PANTONE 185 C', spot: true, c: 0, m: 91, y: 76, k: 0 };
    const sameBoardProcess = new fabric.Rect({ left: 220, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameBoardProcess as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardSpot, active, sameBoardSpot, sameBoardProcess],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixSpotColorActiveArtboardObjects()).toBe(1);
      expect((sameBoardSpot.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 91, y: 76, k: 0, name: 'Process 185 c' });
      expect((firstBoardSpot.fill as { name?: string }).name).toBe('PANTONE 300 C');
      expect((sameBoardProcess.fill as { name?: string }).name).toBeUndefined();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixSpotColorActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no overprint objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const plain = new fabric.Rect({ width: 10, height: 10 });
    const disabled = new fabric.Rect({ width: 10, height: 10 });
    (disabled as unknown as { metadata: { overprint: string } }).metadata = { overprint: 'no' };
    const canvas = {
      getObjects: () => [plain, disabled],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOverprintObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects editable print handoff mark objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const cropMark = new fabric.Line([0, 0, 10, 0]);
    (cropMark as unknown as { printMarkKind: string }).printMarkKind = 'crop';
    const pageInfo = new fabric.Rect({ width: 10, height: 10 });
    (pageInfo as unknown as { printMarkKind: string }).printMarkKind = 'page-info';
    const artwork = new fabric.Rect({ width: 10, height: 10 });
    const overlayMark = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayMark as unknown as { printMarkKind: string }).printMarkKind = 'bleed';
    const canvas = {
      getObjects: () => [cropMark, pageInfo, artwork, overlayMark],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectPrintMarkObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([cropMark, pageInfo]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no print mark objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectPrintMarkObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects rich black and registration color preflight risks', async () => {
    const canvasEngine = await import('../canvasEngine');
    const richFill = new fabric.Rect({ width: 10, height: 10 });
    (richFill as unknown as { fill: unknown }).fill = { c: 60, m: 40, y: 40, k: 100 };
    const richStroke = new fabric.Rect({ width: 10, height: 10 });
    (richStroke as unknown as { stroke: unknown }).stroke = { cyan: 0.4, magenta: 0.3, yellow: 0.3, black: 1 };
    const plainBlack = new fabric.Rect({ width: 10, height: 10 });
    (plainBlack as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const overInkFill = new fabric.Rect({ width: 10, height: 10 });
    (overInkFill as unknown as { fill: unknown }).fill = { c: 75, m: 75, y: 75, k: 80 };
    const safeCmyk = new fabric.Rect({ width: 10, height: 10 });
    (safeCmyk as unknown as { fill: unknown }).fill = { c: 40, m: 40, y: 40, k: 40 };
    const registrationName = new fabric.Rect({ width: 10, height: 10 });
    (registrationName as unknown as { fill: unknown }).fill = { name: '[Registration]' };
    const registrationChannels = new fabric.Rect({ width: 10, height: 10 });
    (registrationChannels as unknown as { stroke: unknown }).stroke = { c: 100, m: 100, y: 100, k: 100 };
    const overlayRisk = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayRisk as unknown as { fill: unknown }).fill = { c: 60, m: 60, y: 60, k: 100 };
    const canvas = {
      getObjects: () => [richFill, richStroke, plainBlack, overInkFill, safeCmyk, registrationName, registrationChannels, overlayRisk],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectRichBlackObjects()).toBe(2);
    let selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([richFill, richStroke]);

    canvas.discardActiveObject.mockClear();
    canvas.setActiveObject.mockClear();
    canvas.requestRenderAll.mockClear();

    expect(selectOverInkLimitObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenLastCalledWith(overInkFill);

    canvas.discardActiveObject.mockClear();
    canvas.setActiveObject.mockClear();
    canvas.requestRenderAll.mockClear();

    expect(selectRegistrationColorObjects()).toBe(2);
    selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([registrationName, registrationChannels]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('reduces over-ink limit CMYK paints proportionally', async () => {
    const canvasEngine = await import('../canvasEngine');
    const overInk = new fabric.Rect({ width: 10, height: 10 });
    (overInk as unknown as { fill: unknown }).fill = { c: 75, m: 75, y: 75, k: 80 };
    const overInkStroke = new fabric.Rect({ width: 10, height: 10 });
    (overInkStroke as unknown as { stroke: unknown }).stroke = { cyan: 0.9, magenta: 0.8, yellow: 0.8, black: 0.6 };
    const safe = new fabric.Rect({ width: 10, height: 10 });
    (safe as unknown as { fill: unknown }).fill = { c: 50, m: 50, y: 50, k: 50 };
    const registration = new fabric.Rect({ width: 10, height: 10 });
    (registration as unknown as { fill: unknown }).fill = { c: 100, m: 100, y: 100, k: 100 };
    const overlay = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlay as unknown as { fill: unknown }).fill = { c: 90, m: 80, y: 80, k: 80 };
    const canvas = {
      getObjects: () => [overInk, overInkStroke, safe, registration, overlay],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixOverInkLimitObjects()).toBe(2);
    expect(overInk.fill).toEqual({ c: 73.333, m: 73.333, y: 73.333, k: 80, name: 'Ink Limit 300%' });
    expect(overInkStroke.stroke).toEqual({ c: 86.4, m: 76.8, y: 76.8, k: 60, name: 'Ink Limit 300%' });
    expect((safe.fill as { c?: number }).c).toBe(50);
    expect((registration.fill as { c?: number }).c).toBe(100);
    expect((overlay.fill as { c?: number }).c).toBe(90);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixOverInkLimitObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes rich black and registration color preflight risks', async () => {
    const canvasEngine = await import('../canvasEngine');
    const richFill = new fabric.Rect({ width: 10, height: 10 });
    (richFill as unknown as { fill: unknown }).fill = { c: 60, m: 40, y: 40, k: 100 };
    const richStroke = new fabric.Rect({ width: 10, height: 10 });
    (richStroke as unknown as { stroke: unknown }).stroke = { c: 0.4, m: 0.3, y: 0.3, k: 1 };
    const plainBlack = new fabric.Rect({ width: 10, height: 10 });
    (plainBlack as unknown as { fill: unknown }).fill = { c: 0, m: 0, y: 0, k: 100 };
    const registrationArtwork = new fabric.Rect({ width: 10, height: 10 });
    (registrationArtwork as unknown as { fill: unknown }).fill = { name: '[Registration]' };
    const registrationMark = new fabric.Rect({ width: 10, height: 10 });
    (registrationMark as unknown as { fill: unknown; printMarkKind: string }).fill = { name: '[Registration]' };
    (registrationMark as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    const overlayRich = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlayRich as unknown as { fill: unknown }).fill = { c: 60, m: 40, y: 40, k: 100 };
    const canvas = {
      getObjects: () => [richFill, richStroke, plainBlack, registrationArtwork, registrationMark, overlayRich],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixRichBlackObjects()).toBe(2);
    expect((richFill.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
    expect((richStroke.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
    expect((plainBlack.fill as { c?: number; m?: number; y?: number; k?: number }).c).toBe(0);
    expect((overlayRich.fill as { c?: number }).c).toBe(60);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixRegistrationColorObjects()).toBe(1);
    expect((registrationArtwork.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
    expect((registrationMark.fill as { name?: string }).name).toBe('[Registration]');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixRichBlackObjects()).toBe(0);
    expect(fixRegistrationColorObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes all common prepress risks in one handoff pass', async () => {
    const canvasEngine = await import('../canvasEngine');
    const transparent = new fabric.Rect({ width: 10, height: 10, opacity: 0.4, globalCompositeOperation: 'multiply' });
    const dashed = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeDashArray: [4, 2] });
    const thin = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 0.1 });
    const overprint = new fabric.Rect({ width: 10, height: 10, fill: '#000000' });
    (overprint as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const rgb = new fabric.Rect({ width: 10, height: 10, fill: 'rgb(255, 0, 0)' });
    const rich = new fabric.Rect({ width: 10, height: 10 });
    (rich as unknown as { fill: unknown }).fill = { c: 50, m: 40, y: 40, k: 100 };
    const overInk = new fabric.Rect({ width: 10, height: 10 });
    (overInk as unknown as { stroke: unknown }).stroke = { c: 90, m: 70, y: 70, k: 80 };
    const registration = new fabric.Rect({ width: 10, height: 10 });
    (registration as unknown as { fill: unknown }).fill = 'registration';
    const registrationMark = new fabric.Rect({ width: 10, height: 10 });
    (registrationMark as unknown as { fill: unknown; printMarkKind: string }).fill = 'registration';
    (registrationMark as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    const overlayRisk = new fabric.Rect({ width: 10, height: 10, opacity: 0.2, excludeFromExport: true });
    const canvas = {
      getObjects: () => [transparent, dashed, thin, overprint, rgb, rich, overInk, registration, registrationMark, overlayRisk],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixAllPrepressRisks()).toBe(10);
    expect(transparent.opacity).toBe(1);
    expect(transparent.globalCompositeOperation).toBe('source-over');
    expect(dashed.strokeDashArray).toBeNull();
    expect(thin.strokeWidth).toBe(0.25);
    expect((overprint as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(false);
    expect(rgb.fill).toEqual({ c: 0, m: 100, y: 100, k: 0, name: 'Process RGB' });
    expect(rich.fill).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
    expect(overInk.stroke).toEqual({ c: 86.086, m: 66.957, y: 66.957, k: 80, name: 'Ink Limit 300%' });
    expect(registration.fill).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
    expect(registrationMark.fill).toBe('registration');
    expect(overlayRisk.opacity).toBe(0.2);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixAllPrepressRisks()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes all common prepress risks only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstRisk = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, opacity: 0.5 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameTransparent = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, opacity: 0.4 });
    const sameDashed = new fabric.Rect({ left: 215, top: 10, width: 20, height: 20, stroke: '#111111', strokeWidth: 2, strokeDashArray: [4, 2] });
    const sameRgb = new fabric.Rect({ left: 240, top: 10, width: 15, height: 20, fill: 'rgb(0, 0, 255)' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstRisk, active, sameTransparent, sameDashed, sameRgb],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixAllPrepressRisksActiveArtboard()).toBe(4);
      expect(sameTransparent.opacity).toBe(1);
      expect(sameDashed.strokeDashArray).toBeNull();
      expect(sameRgb.fill).toEqual({ c: 100, m: 100, y: 0, k: 0, name: 'Process RGB' });
      expect(firstRisk.opacity).toBe(0.5);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixAllPrepressRisksActiveArtboard()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('fixes prepress risks only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstWhite = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, fill: 'white' });
    (firstWhite as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const firstRich = new fabric.Rect({ left: 35, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstRich as unknown as { fill: unknown }).fill = { c: 50, m: 40, y: 40, k: 100 };
    const firstOverInk = new fabric.Rect({ left: 60, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstOverInk as unknown as { fill: unknown }).fill = { c: 90, m: 70, y: 70, k: 80 };
    const firstRegistration = new fabric.Rect({ left: 80, top: 10, width: 15, height: 20, strokeWidth: 0 });
    (firstRegistration as unknown as { stroke: unknown }).stroke = 'registration';
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameWhite = new fabric.Rect({ left: 190, top: 10, width: 20, height: 20, strokeWidth: 0, fill: 'white' });
    (sameWhite as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const sameRich = new fabric.Rect({ left: 215, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameRich as unknown as { fill: unknown }).fill = { c: 50, m: 40, y: 40, k: 100 };
    const sameOverInk = new fabric.Rect({ left: 240, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameOverInk as unknown as { fill: unknown }).fill = { c: 90, m: 70, y: 70, k: 80 };
    const sameRegistration = new fabric.Rect({ left: 165, top: 40, width: 20, height: 20, strokeWidth: 0 });
    (sameRegistration as unknown as { stroke: unknown }).stroke = 'registration';
    const sameRegistrationMark = new fabric.Rect({ left: 190, top: 40, width: 20, height: 20, strokeWidth: 0 });
    (sameRegistrationMark as unknown as { fill: unknown; printMarkKind: string }).fill = { name: '[Registration]' };
    (sameRegistrationMark as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstWhite, firstRich, firstOverInk, firstRegistration, active, sameWhite, sameRich, sameOverInk, sameRegistration, sameRegistrationMark],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixWhiteOverprintActiveArtboardObjects()).toBe(1);
      expect((sameWhite as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(false);
      expect((firstWhite as unknown as { fillOverprint?: boolean }).fillOverprint).toBe(true);

      expect(fixRichBlackActiveArtboardObjects()).toBe(1);
      expect((sameRich.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
      expect((firstRich.fill as { c?: number }).c).toBe(50);

      expect(fixOverInkLimitActiveArtboardObjects()).toBe(1);
      expect((sameOverInk.fill as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 86.086, m: 66.957, y: 66.957, k: 80, name: 'Ink Limit 300%' });
      expect((firstOverInk.fill as { c?: number }).c).toBe(90);

      expect(fixRegistrationColorActiveArtboardObjects()).toBe(1);
      expect((sameRegistration.stroke as { c?: number; m?: number; y?: number; k?: number; name?: string })).toEqual({ c: 0, m: 0, y: 0, k: 100, name: 'Process Black' });
      expect((firstRegistration.stroke as string)).toBe('registration');
      expect((sameRegistrationMark.fill as { name?: string }).name).toBe('[Registration]');
      expect(canvas.requestRenderAll).toHaveBeenCalledTimes(4);
      expect(pushHistory).toHaveBeenCalledTimes(4);

      vi.clearAllMocks();
      expect(fixWhiteOverprintActiveArtboardObjects()).toBe(0);
      expect(fixRichBlackActiveArtboardObjects()).toBe(0);
      expect(fixOverInkLimitActiveArtboardObjects()).toBe(0);
      expect(fixRegistrationColorActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects rich black and registration risks on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardRich = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstBoardRich as unknown as { fill: unknown }).fill = { c: 50, m: 40, y: 40, k: 100 };
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardOverInk = new fabric.Rect({ left: 190, top: 10, width: 10, height: 20, strokeWidth: 0 });
    (sameBoardOverInk as unknown as { fill: unknown }).fill = { c: 90, m: 70, y: 70, k: 80 };
    const sameBoardRich = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameBoardRich as unknown as { fill: unknown }).fill = { c: 50, m: 40, y: 40, k: 100 };
    const sameBoardRegistration = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameBoardRegistration as unknown as { stroke: unknown }).stroke = 'registration';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardRich, active, sameBoardOverInk, sameBoardRich, sameBoardRegistration],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectRichBlackActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(sameBoardRich);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectOverInkLimitActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(sameBoardOverInk);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectRegistrationColorActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(sameBoardRegistration);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects print handoff mark objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMark = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (firstBoardMark as unknown as { printMarkKind: string }).printMarkKind = 'crop';
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardCrop = new fabric.Line([210, 10, 230, 10], { strokeWidth: 0 });
    (sameBoardCrop as unknown as { printMarkKind: string }).printMarkKind = 'crop';
    const sameBoardPageInfo = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    (sameBoardPageInfo as unknown as { printMarkKind: string }).printMarkKind = 'page-info';
    const artworkSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMark, active, sameBoardCrop, sameBoardPageInfo, artworkSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectPrintMarkActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([sameBoardCrop, sameBoardPageInfo]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects all artwork intersecting the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowingSameBoard = new fabric.Rect({ left: 250, top: 90, width: 20, height: 20, strokeWidth: 0 });
    const overlay = new fabric.Rect({ left: 170, top: 50, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoard, active, sameBoard, overflowingSameBoard, overlay],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectActiveArtboardObjects()).toBe(3);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoard, overflowingSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects on the same artboard as the active object', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowSameBoard = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const outsideAll = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlaySameBoard = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoard, active, sameBoard, overflowSameBoard, outsideAll, overlaySameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameArtboardObjects()).toBe(3);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoard, overflowSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects fully inside the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowSameBoard = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoard, active, sameBoard, overflowSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectInsideActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects overflowing the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowSameBoard = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const overflowTop = new fabric.Rect({ left: 180, top: -10, width: 20, height: 20, strokeWidth: 0 });
    const otherBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameBoard, overflowSameBoard, overflowTop, otherBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOverflowingActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([overflowSameBoard, overflowTop]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects outside the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowSameBoard = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const outsideAll = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOtherBoard = new fabric.Rect({ left: 20, top: 40, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoard, active, sameBoard, overflowSameBoard, outsideAll, overlayOtherBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOtherArtboardsObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([firstBoard, outsideAll]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when the active object is not on an artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 130, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameArtboardObjects()).toBe(0);
      expect(canvas.discardActiveObject).not.toHaveBeenCalled();
      expect(canvas.setActiveObject).not.toHaveBeenCalled();
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects fully outside the first artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const inside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const overlapping = new fabric.Rect({ left: 90, top: 40, width: 30, height: 20 });
    const outsideRight = new fabric.Rect({ left: 130, top: 10, width: 20, height: 20 });
    const outsideTop = new fabric.Rect({ left: 20, top: -40, width: 20, height: 20 });
    const overlayOutside = new fabric.Rect({ left: 150, top: 150, width: 20, height: 20, excludeFromExport: true });
    const canvas = {
      getObjects: () => [inside, overlapping, outsideRight, outsideTop, overlayOutside],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOutsideArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([outsideRight, outsideTop]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no outside-artboard objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const canvas = {
      getObjects: () => [new fabric.Rect({ left: 20, top: 20, width: 20, height: 20 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOutsideArtboardObjects()).toBe(0);
      expect(canvas.discardActiveObject).not.toHaveBeenCalled();
      expect(canvas.setActiveObject).not.toHaveBeenCalled();
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects outside every artboard in multi-artboard documents', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstInside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const secondInside = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const betweenBoards = new fabric.Rect({ left: 120, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const farOutside = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOutside = new fabric.Rect({ left: 330, top: 10, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const firstArtboardCanvas = {
      getObjects: () => [firstInside, secondInside, betweenBoards, farOutside, overlayOutside],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    const firstInsideForAll = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const secondInsideForAll = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const betweenBoardsForAll = new fabric.Rect({ left: 120, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const farOutsideForAll = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOutsideForAll = new fabric.Rect({ left: 330, top: 10, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const allArtboardsCanvas = {
      getObjects: () => [firstInsideForAll, secondInsideForAll, betweenBoardsForAll, farOutsideForAll, overlayOutsideForAll],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };

    try {
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(firstArtboardCanvas as never);
      expect(selectOutsideArtboardObjects()).toBe(3);
      const firstArtboardSelection = firstArtboardCanvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(firstArtboardSelection.getObjects()).toEqual([secondInside, betweenBoards, farOutside]);

      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(allArtboardsCanvas as never);
      expect(selectOutsideAnyArtboardObjects()).toBe(2);
      const allArtboardsSelection = allArtboardsCanvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(allArtboardsSelection.getObjects()).toEqual([betweenBoardsForAll, farOutsideForAll]);
      expect(allArtboardsCanvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });


  it('removes objects fully outside the first artboard for pasteboard cleanup', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const inside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlapping = new fabric.Rect({ left: 90, top: 40, width: 30, height: 20, strokeWidth: 0 });
    const outsideRight = new fabric.Rect({ left: 130, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const outsideTop = new fabric.Rect({ left: 20, top: -40, width: 20, height: 20, strokeWidth: 0 });
    const overlayOutside = new fabric.Rect({ left: 150, top: 150, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [inside, overlapping, outsideRight, outsideTop, overlayOutside];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixOutsideArtboardObjects()).toBe(2);
      expect(objects).toEqual([inside, overlapping, overlayOutside]);
      expect(canvas.remove).toHaveBeenCalledWith(outsideRight);
      expect(canvas.remove).toHaveBeenCalledWith(outsideTop);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixOutsideArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes objects outside every artboard in multi-artboard cleanup', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstInside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const secondInside = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const betweenBoards = new fabric.Rect({ left: 120, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const farOutside = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOutside = new fabric.Rect({ left: 330, top: 10, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [firstInside, secondInside, betweenBoards, farOutside, overlayOutside];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixOutsideAnyArtboardObjects()).toBe(2);
      expect(objects).toEqual([firstInside, secondInside, overlayOutside]);
      expect(canvas.remove).toHaveBeenCalledWith(betweenBoards);
      expect(canvas.remove).toHaveBeenCalledWith(farOutside);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixOutsideAnyArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects fully inside the first artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const inside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const touchingEdges = new fabric.Rect({ left: 1, top: 1, width: 98, height: 98, strokeWidth: 0 });
    const overflowing = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const outside = new fabric.Rect({ left: 130, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayInside = new fabric.Rect({ left: 20, top: 20, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getObjects: () => [inside, touchingEdges, overflowing, outside, overlayInside],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectInsideArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([inside, touchingEdges]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects fully inside any artboard in multi-artboard documents', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstInside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const secondInside = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowingSecond = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const betweenBoards = new fabric.Rect({ left: 120, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayInside = new fabric.Rect({ left: 180, top: 20, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getObjects: () => [firstInside, secondInside, overflowingSecond, betweenBoards, overlayInside],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectInsideAnyArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([firstInside, secondInside]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no inside-artboard objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const canvas = {
      getObjects: () => [
        new fabric.Rect({ left: 130, top: 10, width: 20, height: 20 }),
        new fabric.Rect({ left: 90, top: 20, width: 30, height: 20 }),
      ],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectInsideArtboardObjects()).toBe(0);
      expect(canvas.discardActiveObject).not.toHaveBeenCalled();
      expect(canvas.setActiveObject).not.toHaveBeenCalled();
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects that intersect and overflow the first artboard trim edge', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const inside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const overflowingRight = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20 });
    const overflowingTop = new fabric.Rect({ left: 20, top: -5, width: 20, height: 20 });
    const outside = new fabric.Rect({ left: 130, top: 10, width: 20, height: 20 });
    const overlayOverflowing = new fabric.Rect({ left: 90, top: 60, width: 20, height: 20, excludeFromExport: true });
    const canvas = {
      getObjects: () => [inside, overflowingRight, overflowingTop, outside, overlayOverflowing],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOverflowingArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([overflowingRight, overflowingTop]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects overflowing any artboard in multi-artboard documents', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstInside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowFirst = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const overflowSecond = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const betweenBoards = new fabric.Rect({ left: 120, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOverflow = new fabric.Rect({ left: 95, top: 95, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getObjects: () => [firstInside, overflowFirst, overflowSecond, betweenBoards, overlayOverflow],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOverflowingAnyArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([overflowFirst, overflowSecond]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no overflowing artboard objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const canvas = {
      getObjects: () => [
        new fabric.Rect({ left: 20, top: 20, width: 20, height: 20 }),
        new fabric.Rect({ left: 130, top: 10, width: 20, height: 20 }),
      ],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOverflowingArtboardObjects()).toBe(0);
      expect(canvas.discardActiveObject).not.toHaveBeenCalled();
      expect(canvas.setActiveObject).not.toHaveBeenCalled();
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects painted objects with custom stroke cap, join, or miter limit', async () => {
    const canvasEngine = await import('../canvasEngine');
    const roundCap = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeLineCap: 'round' });
    const bevelJoin = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 2, strokeLineJoin: 'bevel' });
    const customMiter = new fabric.Rect({ width: 10, height: 10, stroke: '#333333', strokeWidth: 2, strokeMiterLimit: 8 });
    const defaultStroke = new fabric.Rect({ width: 10, height: 10, stroke: '#444444', strokeWidth: 2, strokeLineCap: 'butt', strokeLineJoin: 'miter', strokeMiterLimit: 4 });
    const unpaintedCustom = new fabric.Rect({ width: 10, height: 10, stroke: '', strokeWidth: 2, strokeLineCap: 'round' });
    const overlayCustom = new fabric.Rect({ width: 10, height: 10, stroke: '#555555', strokeWidth: 2, strokeLineJoin: 'round', excludeFromExport: true });
    const canvas = {
      getObjects: () => [roundCap, bevelJoin, customMiter, defaultStroke, unpaintedCustom, overlayCustom],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCustomStrokeObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([roundCap, bevelJoin, customMiter]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects custom and non-scaling stroke artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const customFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, stroke: '#111', strokeWidth: 2, strokeLineCap: 'round' });
    const nonScalingFirstBoard = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, stroke: '#111', strokeWidth: 2, strokeUniform: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const customSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, stroke: '#222', strokeWidth: 2, strokeLineJoin: 'bevel' });
    const nonScalingSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, stroke: '#333', strokeWidth: 2, strokeUniform: true });
    const defaultSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, stroke: '#444', strokeWidth: 2, strokeLineCap: 'butt', strokeLineJoin: 'miter' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [customFirstBoard, nonScalingFirstBoard, active, customSameBoard, nonScalingSameBoard, defaultSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectCustomStrokeActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(customSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectNonScalingStrokeActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(nonScalingSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no custom stroke objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeLineCap: 'butt', strokeLineJoin: 'miter', strokeMiterLimit: 4 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCustomStrokeObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects painted objects with non-scaling strokes', async () => {
    const canvasEngine = await import('../canvasEngine');
    const nonScaling = new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeUniform: true });
    const scaling = new fabric.Rect({ width: 10, height: 10, stroke: '#222222', strokeWidth: 2, strokeUniform: false });
    const unpaintedNonScaling = new fabric.Rect({ width: 10, height: 10, stroke: '', strokeWidth: 2, strokeUniform: true });
    const overlayNonScaling = new fabric.Rect({ width: 10, height: 10, stroke: '#333333', strokeWidth: 2, strokeUniform: true, excludeFromExport: true });
    const canvas = {
      getObjects: () => [nonScaling, scaling, unpaintedNonScaling, overlayNonScaling],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNonScalingStrokeObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(nonScaling);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no non-scaling stroke objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10, stroke: '#111111', strokeWidth: 2, strokeUniform: false })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNonScalingStrokeObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects objects with pattern fill metadata', async () => {
    const canvasEngine = await import('../canvasEngine');
    const patterned = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { patternSpec?: unknown };
    patterned.patternSpec = { kind: 'dots', size: 8, color1: '#fff', color2: '#000' };
    const invalidPattern = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { patternSpec?: unknown };
    invalidPattern.patternSpec = { kind: 'dots' };
    const overlayPattern = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true }) as fabric.Rect & { patternSpec?: unknown };
    overlayPattern.patternSpec = { kind: 'checker', size: 8, color1: '#fff', color2: '#000' };
    const plain = new fabric.Rect({ width: 10, height: 10 });
    const canvas = {
      getObjects: () => [patterned, invalidPattern, overlayPattern, plain],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectPatternFillObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(patterned);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects pattern and gradient fill artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 100, y2: 0 },
      colorStops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    });
    const patternFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { patternSpec?: unknown };
    patternFirstBoard.patternSpec = { kind: 'dots', size: 8, color1: '#fff', color2: '#000' };
    const gradientFirstBoard = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, strokeWidth: 0, fill: gradient });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const patternSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { patternSpec?: unknown };
    patternSameBoard.patternSpec = { kind: 'checker', size: 6, color1: '#fff', color2: '#000' };
    const gradientSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, fill: gradient });
    const solidSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0, fill: '#ff0000' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [patternFirstBoard, gradientFirstBoard, active, patternSameBoard, gradientSameBoard, solidSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectPatternFillActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(patternSameBoard);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectGradientFillActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(gradientSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects with gradient fills', async () => {
    const canvasEngine = await import('../canvasEngine');
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 100, y2: 0 },
      colorStops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    });
    const gradientObject = new fabric.Rect({ width: 10, height: 10, fill: gradient });
    const solid = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000' });
    const overlayGradient = new fabric.Rect({ width: 10, height: 10, fill: gradient, excludeFromExport: true });
    const canvas = {
      getObjects: () => [gradientObject, solid, overlayGradient],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectGradientFillObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(gradientObject);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

});

describe('paint audit selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects objects with no visible fill and no visible stroke', async () => {
    const canvasEngine = await import('../canvasEngine');
    const noPaint = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '', strokeWidth: 2 });
    const transparentPaint = new fabric.Rect({ width: 10, height: 10, fill: 'transparent', stroke: 'none' });
    const zeroStrokeNoFill = new fabric.Rect({ width: 10, height: 10, fill: null, stroke: '#111111', strokeWidth: 0 });
    const filled = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000', stroke: '' });
    const stroked = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '#000000', strokeWidth: 1 });
    const overlay = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '', excludeFromExport: true });
    const canvas = {
      getObjects: () => [noPaint, transparentPaint, zeroStrokeNoFill, filled, stroked, overlay],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectUnpaintedObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([noPaint, transparentPaint, zeroStrokeNoFill]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects unpainted artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const unpaintedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '', stroke: '' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#000000' });
    const noPaintSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '', stroke: '' });
    const transparentSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, fill: 'transparent', stroke: 'none' });
    const paintedSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0, fill: '#ff0000', stroke: '' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [unpaintedFirstBoard, active, noPaintSameBoard, transparentSameBoard, paintedSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectUnpaintedActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([noPaintSameBoard, transparentSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes unpainted artwork for cleanup handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const noPaint = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '', strokeWidth: 2 });
    const transparentPaint = new fabric.Rect({ width: 10, height: 10, fill: 'transparent', stroke: 'none' });
    const zeroStrokeNoFill = new fabric.Rect({ width: 10, height: 10, fill: null, stroke: '#111111', strokeWidth: 0 });
    const filled = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000', stroke: '' });
    const stroked = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '#000000', strokeWidth: 1 });
    const overlay = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '', excludeFromExport: true });
    const objects: fabric.FabricObject[] = [noPaint, transparentPaint, zeroStrokeNoFill, filled, stroked, overlay];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixUnpaintedObjects()).toBe(3);
    expect(objects).toEqual([filled, stroked, overlay]);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.remove).toHaveBeenCalledTimes(3);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixUnpaintedObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes unpainted artwork only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const unpaintedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '', stroke: '' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#000000' });
    const noPaintSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '', stroke: '' });
    const transparentSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, fill: 'transparent', stroke: 'none' });
    const paintedSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0, fill: '#ff0000', stroke: '' });
    const objects: fabric.FabricObject[] = [unpaintedFirstBoard, active, noPaintSameBoard, transparentSameBoard, paintedSameBoard];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixUnpaintedActiveArtboardObjects()).toBe(2);
      expect(objects).toEqual([unpaintedFirstBoard, active, paintedSameBoard]);
      expect(canvas.remove).toHaveBeenCalledWith(noPaintSameBoard);
      expect(canvas.remove).toHaveBeenCalledWith(transparentSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixUnpaintedActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes all cleanup artwork in one imported-art cleanup pass', async () => {
    const canvasEngine = await import('../canvasEngine');
    const stray = new fabric.Path('M 1 1');
    const zero = new fabric.Path('M 0 0 L 0 0');
    const unpainted = new fabric.Rect({ width: 10, height: 10, fill: '', stroke: '' });
    const zeroAndUnpainted = new fabric.Path('M 2 2 L 2 2', { fill: '', stroke: '' });
    const painted = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000' });
    const overlayCleanup = new fabric.Path('M 3 3', { excludeFromExport: true });
    const emptyText = new fabric.IText('');
    const zeroSize = new fabric.Rect({ width: 0, height: 0 });
    const emptyGroup = new fabric.Group([]);
    const realGroup = new fabric.Group([new fabric.Rect({ width: 10, height: 10, fill: '#333' })]);
    const objects: fabric.FabricObject[] = [stray, zero, unpainted, zeroAndUnpainted, emptyText, zeroSize, emptyGroup, realGroup, painted, overlayCleanup];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixAllCleanupObjects()).toBe(7);
    expect(objects).toEqual([realGroup, painted, overlayCleanup]);
    expect(canvas.remove).toHaveBeenCalledTimes(7);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixAllCleanupObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes all cleanup artwork only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstStray = new fabric.Path('M 1 1', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '#000000' });
    const sameStray = new fabric.Path('M 1 1', { left: 190, top: 10, strokeWidth: 0 });
    const sameZero = new fabric.Path('M 0 0 L 0 0', { left: 210, top: 10, strokeWidth: 0 });
    const sameUnpainted = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, fill: '', stroke: '' });
    const sameEmptyGroup = new fabric.Group([], { left: 250, top: 10 });
    const samePainted = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0, fill: '#ff0000' });
    const objects: fabric.FabricObject[] = [firstStray, active, sameStray, sameZero, sameUnpainted, sameEmptyGroup, samePainted];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixAllCleanupActiveArtboardObjects()).toBe(4);
      expect(objects).toEqual([firstStray, active, samePainted]);
      expect(canvas.remove).toHaveBeenCalledWith(sameStray);
      expect(canvas.remove).toHaveBeenCalledWith(sameZero);
      expect(canvas.remove).toHaveBeenCalledWith(sameUnpainted);
      expect(canvas.remove).toHaveBeenCalledWith(sameEmptyGroup);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixAllCleanupActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no unpainted artwork exists', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10, fill: '#fff', stroke: '' })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectUnpaintedObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});

describe('clipping mask selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects only exportable objects carrying clipPath masks', async () => {
    const canvasEngine = await import('../canvasEngine');
    const unclipped = new fabric.Rect({ width: 10, height: 10 });
    const clipped = new fabric.Rect({ width: 10, height: 10 });
    clipped.clipPath = new fabric.Circle({ radius: 5 });
    const hiddenClipped = new fabric.Rect({ width: 10, height: 10, visible: false });
    hiddenClipped.clipPath = new fabric.Rect({ width: 5, height: 5 });
    const overlayClipped = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    overlayClipped.clipPath = new fabric.Rect({ width: 5, height: 5 });
    const unselectableClipped = new fabric.Rect({ width: 10, height: 10, selectable: false });
    unselectableClipped.clipPath = new fabric.Rect({ width: 5, height: 5 });
    const canvas = {
      getObjects: () => [unclipped, clipped, hiddenClipped, overlayClipped, unselectableClipped],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectClippingMaskedObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([clipped, hiddenClipped]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects clipping masked artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const clippedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    clippedFirstBoard.clipPath = new fabric.Circle({ radius: 5 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const clippedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    clippedSameBoard.clipPath = new fabric.Rect({ width: 5, height: 5 });
    const unclippedSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [clippedFirstBoard, active, clippedSameBoard, unclippedSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectClippingMaskedActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(clippedSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no clipping masked objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectClippingMaskedObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});

describe('open path selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects open path, polyline, and line artwork', async () => {
    const canvasEngine = await import('../canvasEngine');
    const openPath = new fabric.Path('M 0 0 L 40 0 L 40 20');
    const closedPath = new fabric.Path('M 0 0 L 40 0 L 40 20 Z');
    const closedByEndpoint = new fabric.Path('M 0 0 L 40 0 L 0 0');
    const openPolyline = new fabric.Polyline([{ x: 0, y: 0 }, { x: 20, y: 10 }]);
    const closedPolyline = new fabric.Polyline([{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 0 }]);
    const openLine = new fabric.Line([0, 0, 10, 0]);
    const overlayOpenPath = new fabric.Path('M 0 0 L 10 0', { excludeFromExport: true });
    const canvas = {
      getObjects: () => [openPath, closedPath, closedByEndpoint, openPolyline, closedPolyline, openLine, overlayOpenPath],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOpenPathObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([openPath, openPolyline, openLine]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects open path artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const openFirstBoard = new fabric.Path('M 0 0 L 20 0', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const openSameBoard = new fabric.Path('M 0 0 L 20 0', { left: 210, top: 10, strokeWidth: 0 });
    const lineSameBoard = new fabric.Line([0, 0, 20, 0], { left: 230, top: 10, strokeWidth: 0 });
    const closedSameBoard = new fabric.Path('M 0 0 L 20 0 Z', { left: 250, top: 10, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [openFirstBoard, active, openSameBoard, lineSameBoard, closedSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOpenPathActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([openSameBoard, lineSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no open path objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Path('M 0 0 L 10 0 Z'), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOpenPathObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects compound path objects with multiple subpaths', async () => {
    const canvasEngine = await import('../canvasEngine');
    const compound = new fabric.Path('M 0 0 L 40 0 L 40 40 Z M 10 10 L 20 10 L 20 20 Z', { fillRule: 'evenodd' });
    const singlePath = new fabric.Path('M 0 0 L 40 0 L 40 40 Z');
    const overlayCompound = new fabric.Path('M 0 0 L 10 0 Z M 2 2 L 4 2 Z', { excludeFromExport: true });
    const canvas = {
      getObjects: () => [compound, singlePath, overlayCompound],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCompoundPathObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(compound);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects compound path artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const compoundFirstBoard = new fabric.Path('M 0 0 L 20 0 Z M 4 4 L 8 4 Z', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const compoundSameBoard = new fabric.Path('M 0 0 L 20 0 Z M 4 4 L 8 4 Z', { left: 210, top: 10, strokeWidth: 0 });
    const singleSameBoard = new fabric.Path('M 0 0 L 20 0 Z', { left: 230, top: 10, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [compoundFirstBoard, active, compoundSameBoard, singleSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectCompoundPathActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(compoundSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no compound path objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Path('M 0 0 L 10 0 Z'), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCompoundPathObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects stray point path objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const singleMove = new fabric.Path('M 4 5');
    const multiMove = new fabric.Path('M 0 0 M 10 10 Z');
    const drawnPath = new fabric.Path('M 0 0 L 10 0');
    const rect = new fabric.Rect({ width: 10, height: 10 });
    const overlayStray = new fabric.Path('M 20 20', { excludeFromExport: true });
    const canvas = {
      getObjects: () => [singleMove, multiMove, drawnPath, rect, overlayStray],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectStrayPointObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([singleMove, multiMove]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects stray point artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const strayFirstBoard = new fabric.Path('M 0 0', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const straySameBoard = new fabric.Path('M 0 0', { left: 210, top: 10, strokeWidth: 0 });
    const multiStraySameBoard = new fabric.Path('M 0 0 M 1 1 Z', { left: 230, top: 10, strokeWidth: 0 });
    const drawnSameBoard = new fabric.Path('M 0 0 L 10 0', { left: 250, top: 10, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [strayFirstBoard, active, straySameBoard, multiStraySameBoard, drawnSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectStrayPointActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([straySameBoard, multiStraySameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes stray point path objects for cleanup handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const singleMove = new fabric.Path('M 4 5');
    const multiMove = new fabric.Path('M 0 0 M 10 10 Z');
    const drawnPath = new fabric.Path('M 0 0 L 10 0');
    const overlayStray = new fabric.Path('M 20 20', { excludeFromExport: true });
    const objects: fabric.FabricObject[] = [singleMove, multiMove, drawnPath, overlayStray];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixStrayPointObjects()).toBe(2);
    expect(objects).toEqual([drawnPath, overlayStray]);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.remove).toHaveBeenCalledTimes(2);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixStrayPointObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes stray point paths only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const strayFirstBoard = new fabric.Path('M 0 0', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const straySameBoard = new fabric.Path('M 0 0', { left: 210, top: 10, strokeWidth: 0 });
    const drawnSameBoard = new fabric.Path('M 0 0 L 10 0', { left: 230, top: 10, strokeWidth: 0 });
    const objects: fabric.FabricObject[] = [strayFirstBoard, active, straySameBoard, drawnSameBoard];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixStrayPointActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([strayFirstBoard, active, drawnSameBoard]);
      expect(canvas.remove).toHaveBeenCalledWith(straySameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixStrayPointActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no stray point objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Path('M 0 0 L 10 0'), new fabric.Path('M 0 0 L 10 0 Z'), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectStrayPointObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects zero-length path objects separately from stray points', async () => {
    const canvasEngine = await import('../canvasEngine');
    const zeroLine = new fabric.Line([5, 5, 5, 5]);
    const zeroPath = new fabric.Path('M 0 0 L 0 0');
    const zeroCurve = new fabric.Path('M 10 10 C 10 10 10 10 10 10');
    const strayPoint = new fabric.Path('M 1 1');
    const realLine = new fabric.Line([0, 0, 10, 0]);
    const realPath = new fabric.Path('M 0 0 L 10 0');
    const overlayZero = new fabric.Path('M 3 3 L 3 3', { excludeFromExport: true });
    const canvas = {
      getObjects: () => [zeroLine, zeroPath, zeroCurve, strayPoint, realLine, realPath, overlayZero],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectZeroLengthPathObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([zeroLine, zeroPath, zeroCurve]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects zero-length artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const zeroFirstBoard = new fabric.Path('M 0 0 L 0 0', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const zeroSameBoard = new fabric.Path('M 0 0 L 0 0', { left: 210, top: 10, strokeWidth: 0 });
    const zeroCurveSameBoard = new fabric.Path('M 0 0 C 0 0 0 0 0 0', { left: 230, top: 10, strokeWidth: 0 });
    const straySameBoard = new fabric.Path('M 0 0', { left: 250, top: 10, strokeWidth: 0 });
    const realSameBoard = new fabric.Path('M 0 0 L 10 0', { left: 255, top: 10, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [zeroFirstBoard, active, zeroSameBoard, zeroCurveSameBoard, straySameBoard, realSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectZeroLengthPathActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([zeroSameBoard, zeroCurveSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes zero-length path objects for cleanup handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const zeroLine = new fabric.Line([5, 5, 5, 5]);
    const zeroPath = new fabric.Path('M 0 0 L 0 0');
    const zeroCurve = new fabric.Path('M 10 10 C 10 10 10 10 10 10');
    const strayPoint = new fabric.Path('M 1 1');
    const realPath = new fabric.Path('M 0 0 L 10 0');
    const overlayZero = new fabric.Path('M 3 3 L 3 3', { excludeFromExport: true });
    const objects: fabric.FabricObject[] = [zeroLine, zeroPath, zeroCurve, strayPoint, realPath, overlayZero];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixZeroLengthPathObjects()).toBe(3);
    expect(objects).toEqual([strayPoint, realPath, overlayZero]);
    expect(canvas.remove).toHaveBeenCalledTimes(3);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixZeroLengthPathObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes zero-length paths only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const zeroFirstBoard = new fabric.Path('M 0 0 L 0 0', { left: 10, top: 10, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const zeroSameBoard = new fabric.Path('M 0 0 L 0 0', { left: 210, top: 10, strokeWidth: 0 });
    const realSameBoard = new fabric.Path('M 0 0 L 10 0', { left: 230, top: 10, strokeWidth: 0 });
    const objects: fabric.FabricObject[] = [zeroFirstBoard, active, zeroSameBoard, realSameBoard];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixZeroLengthPathActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([zeroFirstBoard, active, realSameBoard]);
      expect(canvas.remove).toHaveBeenCalledWith(zeroSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixZeroLengthPathActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects zero-size imported objects separately from zero-length paths', async () => {
    const canvasEngine = await import('../canvasEngine');
    const zeroRect = new fabric.Rect({ width: 0, height: 0 });
    const scaledZero = new fabric.Rect({ width: 10, height: 10, scaleX: 0, scaleY: 0 });
    const zeroPath = new fabric.Path('M 0 0 L 0 0');
    const zeroLine = new fabric.Line([0, 0, 0, 0]);
    const realRect = new fabric.Rect({ width: 10, height: 10 });
    const overlayZero = new fabric.Rect({ width: 0, height: 0, excludeFromExport: true });
    const canvas = {
      getObjects: () => [zeroRect, scaledZero, zeroPath, zeroLine, realRect, overlayZero],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectZeroSizeObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([zeroRect, scaledZero]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects zero-size imported objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const zeroFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 0, height: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const zeroSameBoard = new fabric.Rect({ left: 210, top: 10, width: 0, height: 0 });
    const realSameBoard = new fabric.Rect({ left: 230, top: 10, width: 10, height: 10 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [zeroFirstBoard, active, zeroSameBoard, realSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectZeroSizeActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(zeroSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes zero-size imported objects for cleanup handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const zeroRect = new fabric.Rect({ width: 0, height: 0 });
    const scaledZero = new fabric.Rect({ width: 10, height: 10, scaleX: 0, scaleY: 0 });
    const zeroPath = new fabric.Path('M 0 0 L 0 0');
    const realRect = new fabric.Rect({ width: 10, height: 10 });
    const overlayZero = new fabric.Rect({ width: 0, height: 0, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [zeroRect, scaledZero, zeroPath, realRect, overlayZero];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixZeroSizeObjects()).toBe(2);
    expect(objects).toEqual([zeroPath, realRect, overlayZero]);
    expect(canvas.remove).toHaveBeenCalledTimes(2);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixZeroSizeObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes zero-size imported objects only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const zeroFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 0, height: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const zeroSameBoard = new fabric.Rect({ left: 210, top: 10, width: 0, height: 0 });
    const realSameBoard = new fabric.Rect({ left: 230, top: 10, width: 10, height: 10 });
    const objects: fabric.FabricObject[] = [zeroFirstBoard, active, zeroSameBoard, realSameBoard];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixZeroSizeActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([zeroFirstBoard, active, realSameBoard]);
      expect(canvas.remove).toHaveBeenCalledWith(zeroSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixZeroSizeActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });


  it('selects empty cleanup groups without selecting real artwork groups', async () => {
    const canvasEngine = await import('../canvasEngine');
    const emptyGroup = new fabric.Group([]);
    const cleanupOnlyGroup = new fabric.Group([new fabric.Rect({ width: 0, height: 0 })]);
    const realGroup = new fabric.Group([new fabric.Rect({ width: 10, height: 10, fill: '#111' })]);
    const overlayGroup = new fabric.Group([], { excludeFromExport: true });
    const canvas = {
      getObjects: () => [emptyGroup, cleanupOnlyGroup, realGroup, overlayGroup],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectEmptyGroupObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([emptyGroup, cleanupOnlyGroup]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('removes empty cleanup groups for imported structure cleanup', async () => {
    const canvasEngine = await import('../canvasEngine');
    const emptyGroup = new fabric.Group([]);
    const cleanupOnlyGroup = new fabric.Group([new fabric.Rect({ width: 0, height: 0 })]);
    const realGroup = new fabric.Group([new fabric.Rect({ width: 10, height: 10, fill: '#111' })]);
    const objects: fabric.FabricObject[] = [emptyGroup, cleanupOnlyGroup, realGroup];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixEmptyGroupObjects()).toBe(2);
    expect(objects).toEqual([realGroup]);
    expect(canvas.remove).toHaveBeenCalledTimes(2);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects empty cleanup groups only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const emptyFirstBoard = new fabric.Group([], { left: 10, top: 10 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const emptySameBoard = new fabric.Group([], { left: 210, top: 10 });
    const realSameBoard = new fabric.Group([new fabric.Rect({ width: 10, height: 10, fill: '#111' })], { left: 230, top: 10 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [emptyFirstBoard, active, emptySameBoard, realSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectEmptyGroupActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(emptySameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('removes empty cleanup groups only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const emptyFirstBoard = new fabric.Group([], { left: 10, top: 10 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const emptySameBoard = new fabric.Group([], { left: 210, top: 10 });
    const realSameBoard = new fabric.Group([new fabric.Rect({ width: 10, height: 10, fill: '#111' })], { left: 230, top: 10 });
    const objects: fabric.FabricObject[] = [emptyFirstBoard, active, emptySameBoard, realSameBoard];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixEmptyGroupActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([emptyFirstBoard, active, realSameBoard]);
      expect(canvas.remove).toHaveBeenCalledWith(emptySameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no zero-length path objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Path('M 0 0 L 10 0'), new fabric.Path('M 0 0'), new fabric.Line([0, 0, 5, 5])],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectZeroLengthPathObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});

describe('group object selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects exportable group objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const group = new fabric.Group([new fabric.Rect({ width: 10, height: 10 })]);
    const overlayGroup = new fabric.Group([new fabric.Rect({ width: 5, height: 5 })], { excludeFromExport: true });
    const plain = new fabric.Rect({ width: 10, height: 10 });
    const canvas = {
      getObjects: () => [group, overlayGroup, plain],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllGroups()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no group objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllGroups()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
  it('selects path, shape, and group objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const firstBoardPath = new fabric.Path('M 10 10 L 30 10', { strokeWidth: 0 });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const path = new fabric.Path('M 210 10 L 230 10', { strokeWidth: 0 });
      const polyline = new fabric.Polyline([{ x: 230, y: 10 }, { x: 250, y: 10 }], { strokeWidth: 0 });
      const shape = new fabric.Circle({ left: 210, top: 40, radius: 10, strokeWidth: 0 });
      const group = new fabric.Group([new fabric.Rect({ width: 10, height: 10, strokeWidth: 0 })], { left: 235, top: 40 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [firstBoardPath, active, path, polyline, shape, group],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, active, path, polyline, shape, group };
    };

    try {
      let scenario = installCanvas();
      expect(selectAllPathsActiveArtboardObjects()).toBe(2);
      let selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.path, scenario.polyline]);

      scenario = installCanvas();
      expect(selectAllShapesActiveArtboardObjects()).toBe(2);
      selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.active, scenario.shape]);

      scenario = installCanvas();
      expect(selectAllGroupsActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.group);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same-type objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const makeTypedObject = (type: string, extra: Record<string, unknown> = {}) => {
      const object = new fabric.Rect({ width: 10, height: 10, strokeWidth: 0 });
      Object.defineProperty(object, 'type', { value: type, configurable: true });
      return Object.assign(object, extra);
    };
    const firstBoardText = makeTypedObject('textbox', { left: 10, top: 10, width: 20, height: 20 });
    const active = makeTypedObject('i-text', { left: 170, top: 10, width: 20, height: 20 });
    const sameBoardText = makeTypedObject('text', { left: 210, top: 10, width: 20, height: 20 });
    const sameBoardBox = makeTypedObject('textbox', { left: 230, top: 10, width: 20, height: 20 });
    const sameBoardShape = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardText, active, sameBoardText, sameBoardBox, sameBoardShape],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameTypeActiveArtboardObjects()).toBe(3);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoardText, sameBoardBox]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same-type objects globally for comparison', async () => {
    const canvasEngine = await import('../canvasEngine');
    const active = new fabric.Rect({ width: 10, height: 10 });
    const same = new fabric.Rect({ width: 20, height: 20 });
    const other = new fabric.Circle({ radius: 5 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, same, other],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectSameType()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([active, same]);
  });

});

describe('object name selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects named exportable objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const named = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { name?: string };
    named.name = 'Logo';
    const blankName = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { name?: string };
    blankName.name = '  ';
    const unnamed = new fabric.Rect({ width: 10, height: 10 });
    const overlayNamed = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true }) as fabric.Rect & { name?: string };
    overlayNamed.name = 'Overlay';
    const canvas = {
      getObjects: () => [named, blankName, unnamed, overlayNamed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNamedObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(named);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects unnamed exportable objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const named = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { name?: string };
    named.name = 'Logo';
    const blankName = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { name?: string };
    blankName.name = '  ';
    const unnamed = new fabric.Rect({ width: 10, height: 10 });
    const overlayUnnamed = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    const canvas = {
      getObjects: () => [named, blankName, unnamed, overlayUnnamed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectUnnamedObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([blankName, unnamed]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects named artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const namedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { name?: string };
    namedFirstBoard.name = 'First';
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const namedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { name?: string };
    namedSameBoard.name = 'Logo';
    const blankSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { name?: string };
    blankSameBoard.name = '  ';
    const overlayNamed = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true }) as fabric.Rect & { name?: string };
    overlayNamed.name = 'Overlay';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [namedFirstBoard, active, namedSameBoard, blankSameBoard, overlayNamed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectNamedActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(namedSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects unnamed artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const unnamedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { name?: string };
    active.name = 'Active';
    const unnamedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const blankSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { name?: string };
    blankSameBoard.name = '  ';
    const namedSameBoard = new fabric.Rect({ left: 250, top: 10, width: 20, height: 20, strokeWidth: 0 }) as fabric.Rect & { name?: string };
    namedSameBoard.name = 'Logo';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [unnamedFirstBoard, active, unnamedSameBoard, blankSameBoard, namedSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectUnnamedActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([unnamedSameBoard, blankSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no named objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNamedObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects transformed exportable objects across artwork types', async () => {
    const canvasEngine = await import('../canvasEngine');
    const scaled = new fabric.Rect({ width: 10, height: 10, scaleX: 1.5 });
    const rotated = new fabric.Circle({ radius: 5, angle: 30 });
    const skewed = new fabric.Path('M 0 0 L 10 0', { skewY: 8 });
    const normal = new fabric.Rect({ width: 10, height: 10, scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 });
    const overlayTransformed = new fabric.Rect({ width: 10, height: 10, angle: 45, excludeFromExport: true });
    const hiddenTransformed = new fabric.Rect({ width: 10, height: 10, scaleX: 2, visible: false });
    const canvas = {
      getObjects: () => [scaled, rotated, skewed, normal, overlayTransformed, hiddenTransformed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransformedObjects()).toBe(4);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([scaled, rotated, skewed, hiddenTransformed]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no transformed objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10, scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 }), new fabric.Circle({ radius: 5 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransformedObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
  it('selects transformed objects on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardTransformed = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, angle: 30 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const scaledSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, scaleX: 1.5 });
    const skewedSameBoard = new fabric.Path('M 230 10 L 250 10', { strokeWidth: 0, skewY: 8 });
    const normalSameBoard = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0, scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardTransformed, active, scaledSameBoard, skewedSameBoard, normalSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectTransformedActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scaledSameBoard, skewedSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

});

describe('image object selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeImageObject = (filters: unknown[] = [], extra: Record<string, unknown> = {}) => {
    const object = new fabric.Rect({ width: 10, height: 10 });
    Object.defineProperty(object, 'type', { value: 'image', configurable: true });
    return Object.assign(object, { filters }, extra) as fabric.FabricObject & { filters?: unknown[]; applyFilters?: ReturnType<typeof vi.fn>; anchorworksPreflightIssue?: unknown; anchorworksEffectivePpi?: unknown; anchorworksTransformReview?: unknown; anchorworksMissingLinkReview?: unknown; anchorworksOriginalReviewStyle?: unknown; anchorworksOriginalLinkSource?: unknown; name?: string; stroke?: unknown; strokeWidth?: number; strokeUniform?: boolean; cropX?: number; cropY?: number; cropWidth?: number; cropHeight?: number; _src?: unknown; src?: unknown; missing?: unknown; broken?: unknown; linkMissing?: unknown };
  };

  it('selects image objects carrying live filters', async () => {
    const canvasEngine = await import('../canvasEngine');
    const filtered = makeImageObject([new fabric.filters.Grayscale()]);
    const unfiltered = makeImageObject([]);
    const vectorWithFilters = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { filters?: unknown[] };
    vectorWithFilters.filters = [new fabric.filters.Sepia()];
    const overlayFiltered = makeImageObject([new fabric.filters.Blur({ blur: 0.2 })], { excludeFromExport: true });
    const canvas = {
      getObjects: () => [filtered, unfiltered, vectorWithFilters, overlayFiltered],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectFilteredImageObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(filtered);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('clears live image filters for export review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const filtered = makeImageObject([new fabric.filters.Grayscale()], { applyFilters: vi.fn() });
    const multiFiltered = makeImageObject([new fabric.filters.Sepia(), new fabric.filters.Blur({ blur: 0.2 })], { applyFilters: vi.fn() });
    const unfiltered = makeImageObject([]);
    const overlayFiltered = makeImageObject([new fabric.filters.Blur({ blur: 0.2 })], { excludeFromExport: true, applyFilters: vi.fn() });
    const canvas = {
      getObjects: () => [filtered, multiFiltered, unfiltered, overlayFiltered],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixFilteredImageObjects()).toBe(2);
    expect(filtered.filters).toEqual([]);
    expect(multiFiltered.filters).toEqual([]);
    expect(unfiltered.filters).toEqual([]);
    expect(overlayFiltered.filters).toHaveLength(1);
    expect(filtered.applyFilters).toHaveBeenCalledOnce();
    expect(multiFiltered.applyFilters).toHaveBeenCalledOnce();
    expect(overlayFiltered.applyFilters).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixFilteredImageObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clears live image filters only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const filteredFirstBoard = makeImageObject([new fabric.filters.Grayscale()], { left: 10, top: 10, width: 20, height: 20, applyFilters: vi.fn() });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const filteredSameBoard = makeImageObject([new fabric.filters.Sepia()], { left: 210, top: 10, width: 20, height: 20, applyFilters: vi.fn() });
    const unfilteredSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [filteredFirstBoard, active, filteredSameBoard, unfilteredSameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixFilteredImageActiveArtboardObjects()).toBe(1);
      expect(filteredSameBoard.filters).toEqual([]);
      expect(filteredFirstBoard.filters).toHaveLength(1);
      expect(unfilteredSameBoard.filters).toEqual([]);
      expect(filteredSameBoard.applyFilters).toHaveBeenCalledOnce();
      expect(filteredFirstBoard.applyFilters).not.toHaveBeenCalled();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixFilteredImageActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no filtered image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([]), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectFilteredImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects image objects with crop offsets or reduced crop bounds', async () => {
    const canvasEngine = await import('../canvasEngine');
    const croppedByOffset = makeImageObject([], { cropX: 12, cropY: 0, width: 100, height: 100 });
    const croppedByWidth = makeImageObject([], { cropWidth: 80, cropHeight: 100, width: 100, height: 100 });
    const uncropped = makeImageObject([], { cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100, width: 100, height: 100 });
    const vectorWithCrop = new fabric.Rect({ width: 100, height: 100 }) as fabric.Rect & { cropX?: number };
    vectorWithCrop.cropX = 8;
    const overlayCropped = makeImageObject([], { cropX: 5, excludeFromExport: true });
    const canvas = {
      getObjects: () => [croppedByOffset, croppedByWidth, uncropped, vectorWithCrop, overlayCropped],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCroppedImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.type).toBe('activeselection');
    expect(activeSelection.getObjects()).toEqual([croppedByOffset, croppedByWidth]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('clears image crop settings for placed-image review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const croppedByOffset = makeImageObject([], { cropX: 12, cropY: 4, width: 100, height: 100 });
    const croppedByWidth = makeImageObject([], { cropWidth: 80, cropHeight: 90, width: 100, height: 100 });
    const uncropped = makeImageObject([], { cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100, width: 100, height: 100 });
    const overlayCropped = makeImageObject([], { cropX: 5, width: 100, height: 100, excludeFromExport: true });
    const canvas = {
      getObjects: () => [croppedByOffset, croppedByWidth, uncropped, overlayCropped],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixCroppedImageObjects()).toBe(2);
    expect(croppedByOffset).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 });
    expect(croppedByWidth).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 });
    expect(uncropped).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 });
    expect((overlayCropped as fabric.FabricObject & { cropX?: number }).cropX).toBe(5);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixCroppedImageObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clears image crop settings only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const croppedFirstBoard = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, cropX: 5 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const croppedSameBoard = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, cropX: 6, cropY: 2, cropWidth: 15, cropHeight: 16 });
    const uncroppedSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, cropX: 0, cropY: 0, cropWidth: 20, cropHeight: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [croppedFirstBoard, active, croppedSameBoard, uncroppedSameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixCroppedImageActiveArtboardObjects()).toBe(1);
      expect(croppedSameBoard).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 20, cropHeight: 20 });
      expect((croppedFirstBoard as fabric.FabricObject & { cropX?: number }).cropX).toBe(5);
      expect(uncroppedSameBoard).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 20, cropHeight: 20 });
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixCroppedImageActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no cropped image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([], { cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100, width: 100, height: 100 }), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCroppedImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects embedded image objects backed by data URLs', async () => {
    const canvasEngine = await import('../canvasEngine');
    const embeddedByPrivateSource = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const embeddedByGetter = makeImageObject([], { getSrc: () => ' data:image/jpeg;base64,BBBB ' });
    const linked = makeImageObject([], { _src: 'https://example.test/photo.png' });
    const vectorWithEmbeddedSource = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { _src?: string };
    vectorWithEmbeddedSource._src = 'data:image/png;base64,CCCC';
    const overlayEmbedded = makeImageObject([], { _src: 'data:image/png;base64,DDDD', excludeFromExport: true });
    const canvas = {
      getObjects: () => [embeddedByPrivateSource, embeddedByGetter, linked, vectorWithEmbeddedSource, overlayEmbedded],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectEmbeddedImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([embeddedByPrivateSource, embeddedByGetter]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no embedded image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([], { _src: 'https://example.test/photo.png' }), makeImageObject([], { src: '/assets/photo.png' })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectEmbeddedImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects linked image objects backed by non-data URLs', async () => {
    const canvasEngine = await import('../canvasEngine');
    const linkedByPrivateSource = makeImageObject([], { _src: 'https://example.test/photo.png' });
    const linkedByGetter = makeImageObject([], { getSrc: () => ' file:///tmp/photo.png ' });
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const noSource = makeImageObject([]);
    const overlayLinked = makeImageObject([], { _src: '/assets/overlay.png', excludeFromExport: true });
    const canvas = {
      getObjects: () => [linkedByPrivateSource, linkedByGetter, embedded, noSource, overlayLinked],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectLinkedImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([linkedByPrivateSource, linkedByGetter]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no linked image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([], { _src: 'data:image/png;base64,AAAA' }), makeImageObject([])],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectLinkedImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects image objects with unknown sources for Links cleanup', async () => {
    const canvasEngine = await import('../canvasEngine');
    const unknown = makeImageObject([]);
    const unknownBlankSource = makeImageObject([], { _src: '   ' });
    const linked = makeImageObject([], { _src: '/assets/photo.png' });
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const overlayUnknown = makeImageObject([], { excludeFromExport: true });
    const vector = new fabric.Rect({ width: 10, height: 10 });
    const canvas = {
      getObjects: () => [unknown, unknownBlankSource, linked, embedded, overlayUnknown, vector],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectUnknownSourceImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([unknown, unknownBlankSource]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects unknown source images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardUnknown = makeImageObject([], { left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardUnknown = makeImageObject([], { left: 210, top: 10, width: 20, height: 20 });
    const sameBoardLinked = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardUnknown, active, sameBoardUnknown, sameBoardLinked],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectUnknownSourceImageActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(sameBoardUnknown);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('embeds loaded linked image objects while preserving original sources', async () => {
    const canvasEngine = await import('../canvasEngine');
    const linkedByCanvas = makeImageObject([], {
      _src: '/assets/photo.png',
      name: 'Photo',
      getElement: () => ({ toDataURL: () => 'data:image/png;base64,EMBEDDED' }),
    });
    const linkedByDataElement = makeImageObject([], {
      _src: 'https://example.test/already-loaded.png',
      getElement: () => ({ src: 'data:image/png;base64,FROM_ELEMENT' }),
    });
    const missingLinked = makeImageObject([], {
      _src: '/assets/missing.png',
      missing: true,
      getElement: () => ({ toDataURL: () => 'data:image/png;base64,SHOULD_NOT_EMBED' }),
    });
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const overlayLinked = makeImageObject([], { _src: '/assets/overlay.png', excludeFromExport: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,OVERLAY' }) });
    const canvas = {
      getObjects: () => [linkedByCanvas, linkedByDataElement, missingLinked, embedded, overlayLinked],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(embedLinkedImageObjects()).toBe(2);
    expect(linkedByCanvas._src).toBe('data:image/png;base64,EMBEDDED');
    expect(linkedByCanvas.src).toBe('data:image/png;base64,EMBEDDED');
    expect(linkedByCanvas.anchorworksOriginalLinkSource).toBe('/assets/photo.png');
    expect(linkedByCanvas.name).toBe('Photo [Embedded Image]');
    expect(linkedByDataElement._src).toBe('data:image/png;base64,FROM_ELEMENT');
    expect(linkedByDataElement.anchorworksOriginalLinkSource).toBe('https://example.test/already-loaded.png');
    expect(missingLinked._src).toBe('/assets/missing.png');
    expect(embedded._src).toBe('data:image/png;base64,AAAA');
    expect(overlayLinked._src).toBe('/assets/overlay.png');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(embedLinkedImageObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('selects embeddable linked image objects before embedding', async () => {
    const canvasEngine = await import('../canvasEngine');
    const embeddableByCanvas = makeImageObject([], { _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const embeddableByElement = makeImageObject([], { _src: 'https://example.test/loaded.png', getElement: () => ({ src: 'data:image/png;base64,LOADED' }) });
    const missingLinked = makeImageObject([], { _src: '/assets/missing.png', missing: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,MISSING' }) });
    const notLoaded = makeImageObject([], { _src: '/assets/not-loaded.png' });
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const overlayEmbeddable = makeImageObject([], { _src: '/assets/overlay.png', excludeFromExport: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,OVERLAY' }) });
    const canvas = {
      getObjects: () => [embeddableByCanvas, embeddableByElement, missingLinked, notLoaded, embedded, overlayEmbeddable],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectEmbeddableLinkedImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([embeddableByCanvas, embeddableByElement]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects embeddable linked images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardEmbeddable = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,FIRST' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbeddable = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const sameBoardMissing = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/missing.png', linkMissing: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,MISSING' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardEmbeddable, active, sameBoardEmbeddable, sameBoardMissing],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectEmbeddableLinkedImageActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(sameBoardEmbeddable);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects linked image objects that cannot currently be embedded', async () => {
    const canvasEngine = await import('../canvasEngine');
    const embeddable = makeImageObject([], { _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const notEmbeddable = makeImageObject([], { _src: '/assets/cors-photo.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const missingLinked = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const overlayNotEmbeddable = makeImageObject([], { _src: '/assets/overlay.png', excludeFromExport: true, getElement: () => ({ complete: true, naturalWidth: 120, naturalHeight: 80, toDataURL: () => 'not-a-data-url' }) });
    const canvas = {
      getObjects: () => [embeddable, notEmbeddable, missingLinked, embedded, overlayNotEmbeddable],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNotEmbeddableLinkedImageObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(notEmbeddable);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects not embeddable linked images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardNotEmbeddable = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const sameBoardNotEmbeddable = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const sameBoardEmbeddable = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/loaded.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,LOADED' }) });
    const canvas = {
      getActiveObject: () => sameBoardNotEmbeddable,
      getObjects: () => [firstBoardNotEmbeddable, sameBoardNotEmbeddable, sameBoardEmbeddable],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectNotEmbeddableLinkedImageActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(sameBoardNotEmbeddable);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects image handoff risks for package review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const missingLinked = makeImageObject([], { _src: '/assets/missing.png', missing: true });
    const notEmbeddable = makeImageObject([], { _src: '/assets/cors-photo.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const unknownSource = makeImageObject([], { name: 'Pasted bitmap' });
    const embeddable = makeImageObject([], { _src: '/assets/loaded.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,LOADED' }) });
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,EMBEDDED' });
    const overlayRisk = makeImageObject([], { _src: '/assets/overlay-missing.png', missing: true, excludeFromExport: true });
    const canvas = {
      getObjects: () => [missingLinked, notEmbeddable, unknownSource, embeddable, embedded, overlayRisk],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectImageHandoffRiskObjects()).toBe(3);
    const selection = vi.mocked(canvas.setActiveObject).mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([missingLinked, notEmbeddable, unknownSource]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects image handoff risks only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const sameBoardNotEmbeddable = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: '/same-cors.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const sameBoardUnknown = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const sameBoardEmbeddable = makeImageObject([], { left: 250, top: 10, width: 20, height: 20, _src: '/loaded.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,LOADED' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardNotEmbeddable, sameBoardUnknown, sameBoardEmbeddable],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectImageHandoffRiskActiveArtboardObjects()).toBe(2);
      const selection = vi.mocked(canvas.setActiveObject).mock.calls[0]?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([sameBoardNotEmbeddable, sameBoardUnknown]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('embeds loaded linked images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardLinked = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,FIRST' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardLinked = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const sameBoardMissing = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/missing-same.png', linkMissing: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,MISSING' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardLinked, active, sameBoardLinked, sameBoardMissing],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(embedLinkedImageActiveArtboardObjects()).toBe(1);
      expect(firstBoardLinked._src).toBe('/first.png');
      expect(sameBoardLinked._src).toBe('data:image/png;base64,SAME');
      expect(sameBoardLinked.anchorworksOriginalLinkSource).toBe('/same.png');
      expect(sameBoardMissing._src).toBe('/missing-same.png');
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('restores embedded image objects back to preserved linked sources', async () => {
    const canvasEngine = await import('../canvasEngine');
    const restorable = makeImageObject([], {
      _src: 'data:image/png;base64,EMBEDDED',
      src: 'data:image/png;base64,EMBEDDED',
      anchorworksOriginalLinkSource: '/assets/original.png',
      name: 'Photo [Embedded Image]',
    });
    const restorableUnnamed = makeImageObject([], {
      _src: 'data:image/png;base64,EMBEDDED2',
      src: 'data:image/png;base64,EMBEDDED2',
      anchorworksOriginalLinkSource: 'https://example.test/photo.png',
      name: '[Embedded Image]',
    });
    const embeddedWithoutSource = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const linked = makeImageObject([], { _src: '/assets/linked.png', anchorworksOriginalLinkSource: '/assets/original-linked.png' });
    const overlayRestorable = makeImageObject([], { _src: 'data:image/png;base64,OVERLAY', anchorworksOriginalLinkSource: '/overlay.png', excludeFromExport: true });
    const canvas = {
      getObjects: () => [restorable, restorableUnnamed, embeddedWithoutSource, linked, overlayRestorable],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(restoreEmbeddedImageLinkObjects()).toBe(2);
    expect(restorable._src).toBe('/assets/original.png');
    expect(restorable.src).toBe('/assets/original.png');
    expect(restorable.anchorworksOriginalLinkSource).toBeUndefined();
    expect(restorable.name).toBe('Photo');
    expect(restorableUnnamed._src).toBe('https://example.test/photo.png');
    expect(restorableUnnamed.name).toBeUndefined();
    expect(embeddedWithoutSource._src).toBe('data:image/png;base64,AAAA');
    expect(linked._src).toBe('/assets/linked.png');
    expect(overlayRestorable._src).toBe('data:image/png;base64,OVERLAY');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(restoreEmbeddedImageLinkObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('selects restorable embedded image links before restoring', async () => {
    const canvasEngine = await import('../canvasEngine');
    const restorable = makeImageObject([], { _src: 'data:image/png;base64,AAAA', anchorworksOriginalLinkSource: '/assets/original.png' });
    const restorableRemote = makeImageObject([], { _src: 'data:image/png;base64,BBBB', anchorworksOriginalLinkSource: 'https://example.test/original.png' });
    const embeddedWithoutSource = makeImageObject([], { _src: 'data:image/png;base64,CCCC' });
    const linkedWithOriginal = makeImageObject([], { _src: '/assets/linked.png', anchorworksOriginalLinkSource: '/assets/original-linked.png' });
    const overlayRestorable = makeImageObject([], { _src: 'data:image/png;base64,OVERLAY', anchorworksOriginalLinkSource: '/overlay.png', excludeFromExport: true });
    const canvas = {
      getObjects: () => [restorable, restorableRemote, embeddedWithoutSource, linkedWithOriginal, overlayRestorable],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectRestorableEmbeddedImageLinkObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([restorable, restorableRemote]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects restorable embedded image links only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardRestorable = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,FIRST', anchorworksOriginalLinkSource: '/first.png' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardRestorable = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,SAME', anchorworksOriginalLinkSource: '/same.png' });
    const sameBoardEmbedded = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,PLAIN' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardRestorable, active, sameBoardRestorable, sameBoardEmbedded],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectRestorableEmbeddedImageLinkActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(sameBoardRestorable);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('restores embedded image links only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardEmbedded = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,FIRST', anchorworksOriginalLinkSource: '/first.png' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbedded = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,SAME', src: 'data:image/png;base64,SAME', anchorworksOriginalLinkSource: '/same.png', name: 'Same [Embedded Image]' });
    const sameBoardPlainEmbedded = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,PLAIN' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardEmbedded, active, sameBoardEmbedded, sameBoardPlainEmbedded],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(restoreEmbeddedImageLinkActiveArtboardObjects()).toBe(1);
      expect(firstBoardEmbedded._src).toBe('data:image/png;base64,FIRST');
      expect(sameBoardEmbedded._src).toBe('/same.png');
      expect(sameBoardEmbedded.src).toBe('/same.png');
      expect(sameBoardEmbedded.anchorworksOriginalLinkSource).toBeUndefined();
      expect(sameBoardEmbedded.name).toBe('Same');
      expect(sameBoardPlainEmbedded._src).toBe('data:image/png;base64,PLAIN');
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects missing linked image objects with broken state or failed elements', async () => {
    const canvasEngine = await import('../canvasEngine');
    const missingFlagged = makeImageObject([], { _src: 'https://example.test/missing.png', missing: true });
    const brokenElement = makeImageObject([], { _src: 'file:///tmp/broken.png', getElement: () => ({ complete: true, naturalWidth: 0, naturalHeight: 0 }) });
    const normalLinked = makeImageObject([], { _src: 'https://example.test/ok.png', getElement: () => ({ complete: true, naturalWidth: 640, naturalHeight: 480 }) });
    const embeddedBroken = makeImageObject([], { _src: 'data:image/png;base64,AAAA', broken: true });
    const overlayMissing = makeImageObject([], { _src: '/assets/missing.png', linkMissing: true, excludeFromExport: true });
    const canvas = {
      getObjects: () => [missingFlagged, brokenElement, normalLinked, embeddedBroken, overlayMissing],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectMissingLinkedImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([missingFlagged, brokenElement]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('removes missing linked image placeholders after Links review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const missingFlagged = makeImageObject([], { _src: 'https://example.test/missing.png', missing: true });
    const brokenElement = makeImageObject([], { _src: 'file:///tmp/broken.png', getElement: () => ({ complete: true, naturalWidth: 0, naturalHeight: 0 }) });
    const normalLinked = makeImageObject([], { _src: 'https://example.test/ok.png', getElement: () => ({ complete: true, naturalWidth: 640, naturalHeight: 480 }) });
    const embeddedBroken = makeImageObject([], { _src: 'data:image/png;base64,AAAA', broken: true });
    const overlayMissing = makeImageObject([], { _src: '/assets/missing.png', linkMissing: true, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [missingFlagged, brokenElement, normalLinked, embeddedBroken, overlayMissing];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixMissingLinkedImageObjects()).toBe(2);
    expect(objects).toEqual([normalLinked, embeddedBroken, overlayMissing]);
    expect(canvas.remove).toHaveBeenCalledWith(missingFlagged);
    expect(canvas.remove).toHaveBeenCalledWith(brokenElement);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixMissingLinkedImageObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes missing linked image placeholders only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const missingFirstBoard = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/missing-first.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const missingSameBoard = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: '/missing-same.png', linkMissing: true });
    const linkedSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/ok.png', getElement: () => ({ complete: true, naturalWidth: 60, naturalHeight: 60 }) });
    const overlayMissing = makeImageObject([], { left: 210, top: 40, width: 20, height: 20, _src: '/overlay-missing.png', missing: true, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [missingFirstBoard, active, missingSameBoard, linkedSameBoard, overlayMissing];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixMissingLinkedImageActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([missingFirstBoard, active, linkedSameBoard, overlayMissing]);
      expect(canvas.remove).toHaveBeenCalledWith(missingSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixMissingLinkedImageActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no missing linked image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [
        makeImageObject([], { _src: 'https://example.test/ok.png', getElement: () => ({ complete: true, naturalWidth: 320, naturalHeight: 240 }) }),
        makeImageObject([], { _src: 'data:image/png;base64,AAAA', missing: true }),
        makeImageObject([]),
      ],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectMissingLinkedImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects transformed image objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const scaledX = makeImageObject([], { scaleX: 1.5 });
    const scaledY = makeImageObject([], { scaleY: 0.75 });
    const rotated = makeImageObject([], { angle: 12 });
    const skewed = makeImageObject([], { skewX: 6 });
    const normalImage = makeImageObject([], { scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 });
    const vectorTransformed = new fabric.Rect({ width: 10, height: 10, scaleX: 2, angle: 15 });
    const overlayTransformed = makeImageObject([], { angle: 10, excludeFromExport: true });
    const canvas = {
      getObjects: () => [scaledX, scaledY, rotated, skewed, normalImage, vectorTransformed, overlayTransformed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransformedImageObjects()).toBe(4);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([scaledX, scaledY, rotated, skewed]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no transformed image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([], { scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 }), new fabric.Rect({ width: 10, height: 10, scaleX: 2 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransformedImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('marks transformed image objects for placement review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const scaled = makeImageObject([], { name: 'Placed Photo', scaleX: 1.5, scaleY: 1, angle: 0, stroke: '#111827', strokeWidth: 0.75, strokeUniform: false });
    const rotated = makeImageObject([], { angle: 12, skewX: 3, skewY: 0 });
    const normalImage = makeImageObject([], { scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 });
    const overlayTransformed = makeImageObject([], { angle: 10, excludeFromExport: true });
    const canvas = {
      getObjects: () => [scaled, rotated, normalImage, overlayTransformed],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixTransformedImageObjects()).toBe(2);
    expect(scaled.name).toBe('Placed Photo [Transformed Image]');
    expect(scaled.anchorworksPreflightIssue).toBe('transformed-image');
    expect(scaled.anchorworksTransformReview).toEqual({ scaleX: 1.5, scaleY: 1, angle: 0, skewX: 0, skewY: 0 });
    expect(scaled.anchorworksOriginalReviewStyle).toEqual({ stroke: '#111827', strokeWidth: 0.75, strokeUniform: false });
    expect(scaled.stroke).toBe('#8b5cf6');
    expect(scaled.strokeWidth).toBe(2);
    expect(scaled.strokeUniform).toBe(true);
    expect(rotated.name).toBe('[Transformed Image]');
    expect(rotated.anchorworksTransformReview).toEqual({ scaleX: 1, scaleY: 1, angle: 12, skewX: 3, skewY: 0 });
    expect(normalImage.anchorworksPreflightIssue).toBeUndefined();
    expect(overlayTransformed.anchorworksPreflightIssue).toBeUndefined();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixTransformedImageObjects()).toBe(0);
    expect(scaled.name).toBe('Placed Photo [Transformed Image]');
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('marks transformed images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const transformedFirstBoard = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, angle: 12 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const transformedSameBoard = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, scaleX: 1.25 });
    const normalSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [transformedFirstBoard, active, transformedSameBoard, normalSameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixTransformedImageActiveArtboardObjects()).toBe(1);
      expect(transformedSameBoard.anchorworksPreflightIssue).toBe('transformed-image');
      expect(transformedFirstBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(normalSameBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixTransformedImageActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects low resolution image objects by effective PPI', async () => {
    const canvasEngine = await import('../canvasEngine');
    const scaledTooLarge = makeImageObject([], { width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
    const lowFromElement = makeImageObject([], { width: 240, height: 120, scaleX: 2, scaleY: 2, getElement: () => ({ naturalWidth: 500, naturalHeight: 250 }) });
    const highResolution = makeImageObject([], { width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 300, naturalHeight: 300 });
    const vectorWithPixels = new fabric.Rect({ width: 100, height: 100 }) as fabric.Rect & { naturalWidth?: number; naturalHeight?: number };
    vectorWithPixels.naturalWidth = 100;
    vectorWithPixels.naturalHeight = 100;
    const overlayLow = makeImageObject([], { width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300, excludeFromExport: true });
    const canvas = {
      getObjects: () => [scaledTooLarge, lowFromElement, highResolution, vectorWithPixels, overlayLow],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectLowResolutionImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([scaledTooLarge, lowFromElement]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no low resolution image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([], { width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 300, naturalHeight: 300 }), makeImageObject([], { width: 100, height: 100 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectLowResolutionImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('marks low resolution image objects for preflight review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const scaledTooLarge = makeImageObject([], { name: 'Hero', width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300, stroke: '#0f172a', strokeWidth: 0.5, strokeUniform: false });
    const lowFromElement = makeImageObject([], { width: 240, height: 120, scaleX: 2, scaleY: 2, getElement: () => ({ naturalWidth: 500, naturalHeight: 250 }) });
    const printReady = makeImageObject([], { width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 300, naturalHeight: 300 });
    const overlayLow = makeImageObject([], { width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300, excludeFromExport: true });
    const canvas = {
      getObjects: () => [scaledTooLarge, lowFromElement, printReady, overlayLow],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixLowResolutionImageObjects()).toBe(2);
    expect(scaledTooLarge.name).toBe('Hero [Low Resolution]');
    expect(scaledTooLarge.anchorworksPreflightIssue).toBe('low-resolution-image');
    expect(scaledTooLarge.anchorworksEffectivePpi).toBe(96);
    expect(scaledTooLarge.anchorworksOriginalReviewStyle).toEqual({ stroke: '#0f172a', strokeWidth: 0.5, strokeUniform: false });
    expect(scaledTooLarge.stroke).toBe('#ef4444');
    expect(scaledTooLarge.strokeWidth).toBe(2);
    expect(scaledTooLarge.strokeUniform).toBe(true);
    expect(lowFromElement.name).toBe('[Low Resolution]');
    expect(lowFromElement.anchorworksEffectivePpi).toBe(100);
    expect(printReady.anchorworksPreflightIssue).toBeUndefined();
    expect(overlayLow.anchorworksPreflightIssue).toBeUndefined();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixLowResolutionImageObjects()).toBe(0);
    expect(scaledTooLarge.name).toBe('Hero [Low Resolution]');
    expect(scaledTooLarge.anchorworksOriginalReviewStyle).toEqual({ stroke: '#0f172a', strokeWidth: 0.5, strokeUniform: false });
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('marks low resolution images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const lowFirstBoard = makeImageObject([], { left: -250, top: 10, width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const lowSameBoard = makeImageObject([], { left: 210, top: 10, width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
    const printReadySameBoard = makeImageObject([], { left: 230, top: 10, width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [lowFirstBoard, active, lowSameBoard, printReadySameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixLowResolutionImageActiveArtboardObjects()).toBe(1);
      expect(lowSameBoard.anchorworksPreflightIssue).toBe('low-resolution-image');
      expect(lowFirstBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(printReadySameBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixLowResolutionImageActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects high resolution image objects by effective PPI', async () => {
    const canvasEngine = await import('../canvasEngine');
    const oversampled = makeImageObject([], { width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 600, naturalHeight: 600 });
    const highFromElement = makeImageObject([], { width: 120, height: 120, scaleX: 1, scaleY: 1, getElement: () => ({ naturalWidth: 700, naturalHeight: 700 }) });
    const printReady = makeImageObject([], { width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 300, naturalHeight: 300 });
    const vectorWithPixels = new fabric.Rect({ width: 100, height: 100 }) as fabric.Rect & { naturalWidth?: number; naturalHeight?: number };
    vectorWithPixels.naturalWidth = 800;
    vectorWithPixels.naturalHeight = 800;
    const overlayHigh = makeImageObject([], { width: 100, height: 100, naturalWidth: 700, naturalHeight: 700, excludeFromExport: true });
    const canvas = {
      getObjects: () => [oversampled, highFromElement, printReady, vectorWithPixels, overlayHigh],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectHighResolutionImageObjects()).toBe(2);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([oversampled, highFromElement]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no high resolution image objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeImageObject([], { width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 }), makeImageObject([], { width: 100, height: 100 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectHighResolutionImageObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('marks high resolution image objects for package optimization review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const oversampled = makeImageObject([], { name: 'Backdrop', width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 600, naturalHeight: 600, stroke: '#334155', strokeWidth: 1.25, strokeUniform: false });
    const highFromElement = makeImageObject([], { width: 120, height: 120, scaleX: 1, scaleY: 1, getElement: () => ({ naturalWidth: 700, naturalHeight: 700 }) });
    const printReady = makeImageObject([], { width: 100, height: 100, scaleX: 1, scaleY: 1, naturalWidth: 300, naturalHeight: 300 });
    const overlayHigh = makeImageObject([], { width: 100, height: 100, naturalWidth: 700, naturalHeight: 700, excludeFromExport: true });
    const canvas = {
      getObjects: () => [oversampled, highFromElement, printReady, overlayHigh],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixHighResolutionImageObjects()).toBe(2);
    expect(oversampled.name).toBe('Backdrop [High Resolution]');
    expect(oversampled.anchorworksPreflightIssue).toBe('high-resolution-image');
    expect(oversampled.anchorworksEffectivePpi).toBe(576);
    expect(oversampled.anchorworksOriginalReviewStyle).toEqual({ stroke: '#334155', strokeWidth: 1.25, strokeUniform: false });
    expect(oversampled.stroke).toBe('#f59e0b');
    expect(oversampled.strokeWidth).toBe(2);
    expect(oversampled.strokeUniform).toBe(true);
    expect(highFromElement.name).toBe('[High Resolution]');
    expect(highFromElement.anchorworksEffectivePpi).toBe(560);
    expect(printReady.anchorworksPreflightIssue).toBeUndefined();
    expect(overlayHigh.anchorworksPreflightIssue).toBeUndefined();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixHighResolutionImageObjects()).toBe(0);
    expect(oversampled.name).toBe('Backdrop [High Resolution]');
    expect(oversampled.anchorworksOriginalReviewStyle).toEqual({ stroke: '#334155', strokeWidth: 1.25, strokeUniform: false });
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('marks high resolution images only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const highFirstBoard = makeImageObject([], { left: -250, top: 10, width: 100, height: 100, naturalWidth: 600, naturalHeight: 600 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const highSameBoard = makeImageObject([], { left: 210, top: 10, width: 100, height: 100, naturalWidth: 600, naturalHeight: 600 });
    const printReadySameBoard = makeImageObject([], { left: 230, top: 10, width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [highFirstBoard, active, highSameBoard, printReadySameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixHighResolutionImageActiveArtboardObjects()).toBe(1);
      expect(highSameBoard.anchorworksPreflightIssue).toBe('high-resolution-image');
      expect(highFirstBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(printReadySameBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixHighResolutionImageActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('summarizes image preflight issues by category', async () => {
    const canvasEngine = await import('../canvasEngine');
    const filtered = makeImageObject([new fabric.filters.Grayscale()]);
    const cropped = makeImageObject([], { width: 100, height: 100, cropX: 5 });
    const transformed = makeImageObject([], { angle: 8 });
    const lowResolution = makeImageObject([], { width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
    const highResolution = makeImageObject([], { width: 100, height: 100, naturalWidth: 600, naturalHeight: 600 });
    const missingLinked = makeImageObject([], { _src: '/missing.png', missing: true });
    const marked = makeImageObject([], { anchorworksPreflightIssue: 'transformed-image' });
    const multiIssue = makeImageObject([new fabric.filters.Sepia()], { width: 100, height: 100, cropX: 4, naturalWidth: 600, naturalHeight: 600 });
    const cleanImage = makeImageObject([], { width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const overlayFiltered = makeImageObject([new fabric.filters.Blur({ blur: 0.2 })], { excludeFromExport: true });
    const canvas = {
      getObjects: () => [filtered, cropped, transformed, lowResolution, highResolution, missingLinked, marked, multiIssue, cleanImage, overlayFiltered],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imagePreflightSummary()).toEqual({
      total: 8,
      filtered: 2,
      cropped: 2,
      transformed: 2,
      lowResolution: 1,
      highResolution: 2,
      missingLinked: 1,
      reviewMarked: 1,
    });
  });

  it('summarizes image preflight issues only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardFiltered = makeImageObject([new fabric.filters.Grayscale()], { left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const filteredSameBoard = makeImageObject([new fabric.filters.Sepia()], { left: 210, top: 10, width: 20, height: 20 });
    const markedSameBoard = makeImageObject([], { left: 210, top: 40, width: 20, height: 20, anchorworksEffectivePpi: 560 });
    const cleanSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardFiltered, active, filteredSameBoard, markedSameBoard, cleanSameBoard],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imagePreflightActiveArtboardSummary()).toEqual({
        total: 2,
        filtered: 1,
        cropped: 0,
        transformed: 0,
        lowResolution: 0,
        highResolution: 0,
        missingLinked: 0,
        reviewMarked: 1,
      });
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('summarizes image links by asset state', async () => {
    const canvasEngine = await import('../canvasEngine');
    const embedded = makeImageObject([], { _src: 'data:image/png;base64,AAAA' });
    const restorableEmbedded = makeImageObject([], { _src: 'data:image/png;base64,BBBB', anchorworksOriginalLinkSource: '/assets/original.png' });
    const linkedEmbeddable = makeImageObject([], { name: 'Product shot', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const linkedNotLoaded = makeImageObject([], { _src: '/assets/not-loaded.png' });
    const linkedNotEmbeddable = makeImageObject([], { name: 'CDN photo', width: 300, height: 200, _src: '/assets/cors-photo.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const missingLinked = makeImageObject([], { _src: '/assets/missing.png', missing: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,MISSING' }) });
    const unknownSource = makeImageObject([]);
    const overlayLinked = makeImageObject([], { _src: '/assets/overlay.png', excludeFromExport: true, getElement: () => ({ toDataURL: () => 'data:image/png;base64,OVERLAY' }) });
    const vectorWithSource = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { _src?: string };
    vectorWithSource._src = '/assets/vector.png';
    const canvas = {
      getObjects: () => [embedded, restorableEmbedded, linkedEmbeddable, linkedNotLoaded, linkedNotEmbeddable, missingLinked, unknownSource, overlayLinked, vectorWithSource],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageLinksSummary()).toEqual({
      total: 7,
      embedded: 2,
      linked: 4,
      missingLinked: 2,
      embeddable: 1,
      notEmbeddableLinked: 1,
      restorable: 1,
      unknownSource: 1,
    });
  });

  it('summarizes image links only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardLinked = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,FIRST' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbedded = makeImageObject([], { name: 'Embedded backup', left: 210, top: 10, width: 300, height: 200, naturalWidth: 600, naturalHeight: 400, _src: 'data:image/png;base64,SAME', anchorworksOriginalLinkSource: '/same-original.png' });
    const sameBoardMissing = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/missing-same.png', linkMissing: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardLinked, active, sameBoardEmbedded, sameBoardMissing],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageLinksActiveArtboardSummary()).toEqual({
        total: 2,
        embedded: 1,
        linked: 1,
        missingLinked: 1,
        embeddable: 0,
        notEmbeddableLinked: 0,
        restorable: 1,
        unknownSource: 0,
      });
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates a copyable image handoff report for package review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const linkedEmbeddable = makeImageObject([], { name: 'Product shot', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const linkedNotEmbeddable = makeImageObject([], { name: 'CDN photo', width: 300, height: 200, _src: '/assets/cors-photo.png', getElement: () => ({ complete: true, naturalWidth: 300, naturalHeight: 200, toDataURL: () => 'not-a-data-url' }) });
    const missingLinked = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const unknownSource = makeImageObject([], { name: 'Pasted bitmap' });
    const canvas = {
      getObjects: () => [linkedEmbeddable, linkedNotEmbeddable, missingLinked, unknownSource],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffReport()).toBe([
      '# AnchorWorks Image Handoff Report (Document)',
      'Status: needs review · 3 risk(s)',
      'Images: 4 total · 3 linked · 0 embedded',
      'Link state: 1 missing · 1 not embeddable · 1 unknown source',
      'Severity: 2 error · 1 warning · 1 info · 0 ok',
      'Actions: 1 embeddable · 0 restorable embedded link(s)',
      'Assets:',
      '- #1 Product shot: info · embeddable linked · embed or collect linked file · 300×200 px · effective 96 PPI · /assets/photo.png',
      '- #2 CDN photo: error · not embeddable · replace source or embed manually · 300×200 px · effective 96 PPI · /assets/cors-photo.png',
      '- #3 Missing hero: error · missing linked · relink before package · 1200×800 px · effective 288 PPI · /assets/missing.png',
      '- #4 Pasted bitmap: warning · unknown source · relink or confirm embedded provenance · unknown pixels · effective unknown PPI · (unknown source)',
      'Package handoff: select image handoff risks, relink missing/unknown assets, and embed or replace not-embeddable linked images before collect/package.',
    ].join('\n'));
  });

  it('generates an active-artboard image handoff report', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbedded = makeImageObject([], { name: 'Embedded backup', left: 210, top: 10, width: 300, height: 200, naturalWidth: 600, naturalHeight: 400, _src: 'data:image/png;base64,SAME', anchorworksOriginalLinkSource: '/same-original.png' });
    const sameBoardEmbeddable = makeImageObject([], { name: 'Same-board link', left: 230, top: 10, width: 150, height: 75, naturalWidth: 300, naturalHeight: 150, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardEmbedded, sameBoardEmbeddable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardReport()).toBe([
        '# AnchorWorks Image Handoff Report (Active artboard)',
        'Status: ready · 0 risk(s)',
        'Images: 2 total · 1 linked · 1 embedded',
        'Link state: 0 missing · 0 not embeddable · 0 unknown source',
        'Severity: 0 error · 0 warning · 2 info · 0 ok',
        'Actions: 1 embeddable · 1 restorable embedded link(s)',
        'Assets:',
        '- #1 Embedded backup: info · restorable embedded · restore link if external asset workflow is required · 600×400 px · effective 192 PPI · data:image/png;base64,SAME',
        '- #2 Same-board link: info · embeddable linked · embed or collect linked file · 300×150 px · effective 192 PPI · /same.png',
        'Package handoff: no missing, unknown-source, or not-embeddable placed images detected.',
      ].join('\n'));
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates a spreadsheet TSV image handoff report', async () => {
    const canvasEngine = await import('../canvasEngine');
    const linkedEmbeddable = makeImageObject([], { name: 'Product\tshot', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const missingLinked = makeImageObject([], { name: 'Missing\nhero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const canvas = {
      getObjects: () => [linkedEmbeddable, missingLinked],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffTsvReport()).toBe([
      'Index\tName\tSeverity\tStatus\tAction\tPixels\tEffective PPI\tSource',
      '1\tProduct shot\tinfo\tembeddable linked\tembed or collect linked file\t300×200 px\t96 PPI\t/assets/photo.png',
      '2\tMissing hero\terror\tmissing linked\trelink before package\t1200×800 px\t288 PPI\t/assets/missing.png',
    ].join('\n'));
  });

  it('generates a spreadsheet TSV image handoff report for the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbeddable = makeImageObject([], { name: 'Same-board link', left: 230, top: 10, width: 150, height: 75, naturalWidth: 300, naturalHeight: 150, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardEmbeddable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardTsvReport()).toBe([
        'Index\tName\tSeverity\tStatus\tAction\tPixels\tEffective PPI\tSource',
        '1\tSame-board link\tinfo\tembeddable linked\tembed or collect linked file\t300×150 px\t192 PPI\t/same.png',
      ].join('\n'));
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates a machine-readable JSON image handoff report', async () => {
    const canvasEngine = await import('../canvasEngine');
    const linkedEmbeddable = makeImageObject([], { name: 'Product shot', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const missingLinked = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const canvas = {
      getObjects: () => [linkedEmbeddable, missingLinked],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(JSON.parse(imageHandoffJsonReport())).toEqual({
      scope: 'Document',
      status: 'needs review',
      riskTotal: 1,
      summary: {
        total: 2,
        embedded: 0,
        linked: 2,
        missingLinked: 1,
        embeddable: 1,
        notEmbeddableLinked: 0,
        restorable: 0,
        unknownSource: 0,
      },
      severity: { error: 1, warning: 0, info: 1, ok: 0 },
      assets: [
        {
          index: 1,
          name: 'Product shot',
          source: '/assets/photo.png',
          status: 'embeddable linked',
          severity: 'info',
          action: 'embed or collect linked file',
          pixels: '300×200 px',
          effectivePpi: '96 PPI',
        },
        {
          index: 2,
          name: 'Missing hero',
          source: '/assets/missing.png',
          status: 'missing linked',
          severity: 'error',
          action: 'relink before package',
          pixels: '1200×800 px',
          effectivePpi: '288 PPI',
        },
      ],
    });
  });

  it('generates a machine-readable JSON image handoff report for the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbeddable = makeImageObject([], { name: 'Same-board link', left: 230, top: 10, width: 150, height: 75, naturalWidth: 300, naturalHeight: 150, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardEmbeddable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(JSON.parse(imageHandoffActiveArtboardJsonReport())).toEqual({
        scope: 'Active artboard',
        status: 'ready',
        riskTotal: 0,
        summary: {
          total: 1,
          embedded: 0,
          linked: 1,
          missingLinked: 0,
          embeddable: 1,
          notEmbeddableLinked: 0,
          restorable: 0,
          unknownSource: 0,
        },
        severity: { error: 0, warning: 0, info: 1, ok: 0 },
        assets: [
          {
            index: 1,
            name: 'Same-board link',
            source: '/same.png',
            status: 'embeddable linked',
            severity: 'info',
            action: 'embed or collect linked file',
            pixels: '300×150 px',
            effectivePpi: '192 PPI',
          },
        ],
      });
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates a grouped image source manifest for package handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const linkedEmbeddable = makeImageObject([], { name: 'Product shot', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,PHOTO' }) });
    const missingLinked = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const unknownSource = makeImageObject([], { name: 'Pasted bitmap' });
    const canvas = {
      getObjects: () => [linkedEmbeddable, missingLinked, unknownSource],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffSourceManifest()).toBe([
      '# AnchorWorks Image Source Manifest (Document)',
      '## relink before package (1)',
      '- #2 Missing hero · error · missing linked · /assets/missing.png',
      '## relink or confirm embedded provenance (1)',
      '- #3 Pasted bitmap · warning · unknown source · (unknown source)',
      '## embed or collect linked file (1)',
      '- #1 Product shot · info · embeddable linked · /assets/photo.png',
    ].join('\n'));
  });

  it('generates a grouped image source manifest for the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardEmbeddable = makeImageObject([], { name: 'Same-board link', left: 230, top: 10, width: 150, height: 75, naturalWidth: 300, naturalHeight: 150, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardEmbeddable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardSourceManifest()).toBe([
        '# AnchorWorks Image Source Manifest (Active artboard)',
        '## embed or collect linked file (1)',
        '- #1 Same-board link · info · embeddable linked · /same.png',
      ].join('\n'));
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('exports only collectable linked image sources for package handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const embeddable = makeImageObject([], { name: 'Embeddable', _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const duplicateEmbeddable = makeImageObject([], { name: 'Duplicate embeddable', _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const linked = makeImageObject([], { name: 'Needs manual embed', _src: '/assets/logo.svg' });
    const missing = makeImageObject([], { name: 'Missing', _src: '/assets/missing.png', missing: true });
    const unknown = makeImageObject([], { name: 'Unknown' });
    const embedded = makeImageObject([], { name: 'Embedded', _src: 'data:image/png;base64,EMBEDDED' });
    const canvas = {
      getObjects: () => [embeddable, duplicateEmbeddable, linked, missing, unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffCollectSourceList()).toBe('/assets/hero.png');
    expect(imageHandoffCollectSourceList()).not.toContain('/assets/logo.svg');
    expect(imageHandoffCollectSourceList()).not.toContain('/assets/missing.png');
  });

  it('generates an image package checklist for handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const collectable = makeImageObject([], { name: 'Collectable hero', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const manual = makeImageObject([], { name: 'Manual logo', width: 200, height: 100, naturalWidth: 200, naturalHeight: 100, _src: '/assets/logo.svg', getElement: () => ({ naturalWidth: 200, naturalHeight: 100, toDataURL: () => 'not-a-data-url' }) });
    const unknown = makeImageObject([], { name: 'Pasted bitmap' });
    const embedded = makeImageObject([], { name: 'Embedded seal', width: 120, height: 120, naturalWidth: 120, naturalHeight: 120, _src: 'data:image/png;base64,SEAL' });
    const canvas = {
      getObjects: () => [collectable, missing, manual, unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffPackageChecklist()).toBe([
      '# AnchorWorks Image Package Checklist (Document)',
      'Status: needs review · 3 risk(s)',
      'Images: 5 total · 3 linked · 1 embedded',
      '## 1. Relink before package',
      '- /assets/missing.png',
      '## 2. Collect linked files',
      '- /assets/hero.png',
      '## 3. Manual review before handoff',
      '- #3 Manual logo · error · not embeddable · replace source or embed manually · /assets/logo.svg',
      '- #4 Pasted bitmap · warning · unknown source · relink or confirm embedded provenance · (unknown source)',
      '## 4. Ready embedded/linked assets',
      '- #5 Embedded seal · ok · embedded · ready · data:image/png;base64,SEAL',
      'Package step: relink missing sources and resolve manual-review assets before collecting linked files.',
    ].join('\n'));
  });

  it('generates image package gate JSON for automation', async () => {
    const canvasEngine = await import('../canvasEngine');
    const collectable = makeImageObject([], { name: 'Collectable hero', _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing hero', _src: '/assets/missing.png', missing: true });
    const manual = makeImageObject([], { name: 'Manual logo', _src: '/assets/logo.svg', getElement: () => ({ naturalWidth: 200, naturalHeight: 100, toDataURL: () => 'not-a-data-url' }) });
    const unknown = makeImageObject([], { name: 'Pasted bitmap' });
    const canvas = {
      getObjects: () => [collectable, missing, manual, unknown],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    const gate = JSON.parse(imageHandoffPackageGateJson());
    expect(gate).toMatchObject({
      scope: 'Document',
      pass: false,
      status: 'blocked',
      blockerCount: 3,
      counts: { missingLinked: 1, notEmbeddableLinked: 1, unknownSource: 1 },
    });
    expect(gate.blockers.map((blocker: { name: string }) => blocker.name)).toEqual(['Missing hero', 'Manual logo', 'Pasted bitmap']);
  });

  it('generates image package blockers for preflight gate', async () => {
    const canvasEngine = await import('../canvasEngine');
    const collectable = makeImageObject([], { name: 'Collectable hero', _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing hero', _src: '/assets/missing.png', missing: true });
    const manual = makeImageObject([], { name: 'Manual logo', _src: '/assets/logo.svg', getElement: () => ({ naturalWidth: 200, naturalHeight: 100, toDataURL: () => 'not-a-data-url' }) });
    const unknown = makeImageObject([], { name: 'Pasted bitmap' });
    const embedded = makeImageObject([], { name: 'Embedded seal', _src: 'data:image/png;base64,SEAL' });
    const canvas = {
      getObjects: () => [collectable, missing, manual, unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffPackageBlockers()).toBe([
      '# AnchorWorks Image Package Blockers (Document)',
      'Status: blocked · 3 blocker(s)',
      'Blocking counts: 1 missing · 1 not embeddable · 1 unknown source',
      '- #2 Missing hero · error · missing linked · relink before package · /assets/missing.png',
      '- #3 Manual logo · error · not embeddable · replace source or embed manually · /assets/logo.svg',
      '- #4 Pasted bitmap · warning · unknown source · relink or confirm embedded provenance · (unknown source)',
      'Package gate: resolve every blocker before final package delivery.',
    ].join('\n'));
  });

  it('generates an image package bundle JSON', async () => {
    const canvasEngine = await import('../canvasEngine');
    const collectable = makeImageObject([], { name: 'Collectable hero', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const canvas = {
      getObjects: () => [collectable, missing],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    const bundle = JSON.parse(imageHandoffPackageBundleJson());
    expect(bundle.scope).toBe('Document');
    expect(bundle.generatedBy).toBe('AnchorWorks');
    expect(bundle.files.map((file: { path: string }) => file.path)).toEqual([
      'README.md',
      'image-package-tree.txt',
      'image-handoff-report.md',
      'image-package-checklist.md',
      'image-package-plan.json',
      'image-package-gate.json',
      'collect-linked-images.sh',
      'collect-linked-images.ps1',
      'verify-linked-images.sh',
      'verify-linked-images.ps1',
      'image-package-verify-manifest.json',
      'image-collect-destinations.tsv',
      'image-source-manifest.md',
      'image-package-signoff.md',
      'image-package-signoff.json',
      'image-package-signoff.tsv',
      'image-package-delivery-manifest.json',
      'image-package-delivery-manifest.tsv',
      'image-package-provenance.json',
      'image-package-provenance.tsv',
      'image-package-rights-manifest.md',
      'image-package-rights-manifest.json',
      'image-package-rights-manifest.tsv',
      'image-package-acceptance.json',
      'image-package-acceptance.tsv',
      'image-package-delivery-receipt.md',
      'image-package-delivery-receipt.json',
      'image-package-delivery-receipt.tsv',
      'image-package-release-notes.md',
      'image-package-release-notes.json',
      'image-package-release-notes.tsv',
      'image-package-sbom.json',
      'image-package-sbom.tsv',
      'image-package-attestation.json',
      'image-package-attestation.tsv',
      'image-package-risk-register.md',
      'image-package-risk-register.json',
      'image-package-risk-register.tsv',
      'image-package-verification-summary.md',
      'image-package-verification-summary.json',
      'image-package-verification-summary.tsv',
      'image-package-client-readme.md',
      'image-package-client-readme.json',
      'image-package-change-log.md',
      'image-package-change-log.json',
      'image-package-change-log.tsv',
      'image-package-relink-map.md',
      'image-package-relink-map.json',
      'image-package-relink-map.tsv',
      'image-package-prepress-ticket.md',
      'image-package-prepress-ticket.json',
      'image-package-prepress-ticket.tsv',
      'image-package-printer-intake.md',
      'image-package-printer-intake.json',
      'image-package-printer-intake.tsv',
      'image-package-shop-proof-checklist.md',
      'image-package-shop-proof-checklist.json',
      'image-package-shop-proof-checklist.tsv',
      'image-package-production-handoff.json',
      'image-package-production-handoff.tsv',
      'image-package-print-release-approval.md',
      'image-package-print-release-approval.json',
      'image-package-print-release-approval.tsv',
      'image-package-vendor-qa.md',
      'image-package-vendor-qa.json',
      'image-package-vendor-qa.tsv',
      'image-package-press-run-ticket.md',
      'image-package-press-run-ticket.json',
      'image-package-press-run-ticket.tsv',
      'image-package-postpress-inspection.md',
      'image-package-postpress-inspection.json',
      'image-package-postpress-inspection.tsv',
      'image-package-finished-goods-release.md',
      'image-package-finished-goods-release.json',
      'image-package-finished-goods-release.tsv',
      'image-package-shipment-handoff.md',
      'image-package-shipment-handoff.json',
      'image-package-shipment-handoff.tsv',
      'image-package-delivery-confirmation.md',
      'image-package-delivery-confirmation.json',
      'image-package-delivery-confirmation.tsv',
      'image-package-release-gate.json',
      'image-package-release-gate.md',
      'image-package-release-gate.tsv',
      'verify-package-release-gate.sh',
      'verify-package-release-gate.ps1',
      'image-package-ci-manifest.json',
      'image-package-github-actions.yml',
      'image-package-gitlab-ci.yml',
      'image-package-azure-pipelines.yml',
      'image-package-circleci.yml',
      'image-package-jenkinsfile',
      'image-package-bitbucket-pipelines.yml',
      'image-package-buildkite.yml',
      'image-package-drone.yml',
      'image-package-teamcity.kts',
      'image-package-file-index.json',
      'image-package-audit.json',
      'image-package-audit.md',
      'image-package-digests.tsv',
    ]);
    expect(bundle.files.find((file: { path: string }) => file.path === 'README.md')?.content).toContain('/assets/hero.png -> Links/hero.png');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-plan.json')?.content).toContain('collectDestinations');
    const gate = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-gate.json')?.content);
    expect(gate.pass).toBe(false);
    expect(gate.blockerCount).toBe(1);
    expect(bundle.files.find((file: { path: string }) => file.path === 'collect-linked-images.sh')?.content).toContain("cp -f -- '/assets/hero.png' \"$PACKAGE_DIR\"/'Links/hero.png'");
    expect(bundle.files.find((file: { path: string }) => file.path === 'collect-linked-images.ps1')?.content).toContain("Copy-Item -LiteralPath '/assets/hero.png' -Destination (Join-Path $PackageDir 'Links/hero.png') -Force");
    expect(bundle.files.find((file: { path: string }) => file.path === 'verify-linked-images.sh')?.content).toContain('Missing: Links/hero.png');
    expect(bundle.files.find((file: { path: string }) => file.path === 'verify-linked-images.ps1')?.content).toContain('Test-Path -LiteralPath (Join-Path $PackageDir');
    const verifyManifest = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-verify-manifest.json')?.content);
    expect(verifyManifest.expectedFileCount).toBe(1);
    expect(verifyManifest.files).toEqual([{ packagePath: 'Links/hero.png', source: '/assets/hero.png', expectedExists: true }]);
    const fileIndex = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-file-index.json')?.content);
    expect(fileIndex.fileCount).toBe(bundle.files.length);
    expect(fileIndex.files.map((file: { path: string }) => file.path)).toContain('image-package-file-index.json');
    const packageAudit = JSON.parse(imageHandoffPackageAuditJson());
    expect(packageAudit.gate.status).toBe('blocked');
    expect(packageAudit.expectedLinks.expectedFileCount).toBe(1);
    expect(fileIndex.files.every((file: { digest: string }) => /^[0-9a-f]{8}$/.test(file.digest))).toBe(true);
    const readmeIndex = fileIndex.files.find((file: { path: string }) => file.path === 'README.md');
    expect(readmeIndex?.kind).toBe('markdown');
    expect(readmeIndex?.digest).toMatch(/^[0-9a-f]{8}$/);
    const bundleAudit = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-audit.json')?.content);
    expect(bundleAudit.gate.pass).toBe(false);
    expect(bundleAudit.expectedLinks.expectedFileCount).toBe(1);
    expect(bundleAudit.packageDigests.map((file: { path: string }) => file.path)).toContain('image-package-file-index.json');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-audit.md')?.content).toContain('# AnchorWorks Image Package Audit (Document)');
    expect(imageHandoffPackageAuditReport()).toContain('Gate: blocked · 1 blocker(s)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-digests.tsv')?.content).toContain('Path\tKind\tBytes\tDigest');
    expect(imageHandoffPackageDigestManifest()).toContain('README.md\tmarkdown');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-signoff.md')?.content).toContain('Designer signoff:');
    expect(imageHandoffPackageSignoff()).toContain('Prepress signoff:');
    const signoff = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-signoff.json')?.content);
    expect(signoff.checklist).toHaveLength(6);
    expect(signoff.signatures.designer).toEqual({ name: '', date: '' });
    expect(JSON.parse(imageHandoffPackageSignoffJson()).gate.status).toBe('blocked');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-signoff.tsv')?.content).toContain('Scope\tItem\tComplete');
    expect(imageHandoffPackageSignoffTsv()).toContain('Document\tPackage gate JSON reviewed.\tfalse');
    const deliveryManifest = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-manifest.json')?.content);
    expect(deliveryManifest.readyForDelivery).toBe(false);
    expect(deliveryManifest.deliverables.map((item: { name: string }) => item.name)).toContain('Links/');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-manifest.tsv')?.content).toContain('Scope\tDeliverable\tType\tRequired\tReady\tNote');
    expect(imageHandoffPackageDeliveryManifestJson()).toContain('image-package-signoff.md');
    expect(imageHandoffPackageDeliveryManifestTsv()).toContain('Document\tDocument artwork file\tartwork\ttrue\ttrue');
    expect(JSON.parse(imageHandoffPackageProvenanceJson()).assets.length).toBe(2);
    expect(imageHandoffPackageProvenanceTsv()).toContain('Document\t2\tMissing hero');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-provenance.json')?.content).toContain('proofRequired');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-provenance.tsv')?.content).toContain('effectivePpi');
    expect(imageHandoffPackageRightsManifestReport()).toContain('# AnchorWorks Image Package Rights Manifest (Document)');
    expect(JSON.parse(imageHandoffPackageRightsManifestJson()).manifestType).toBe('Image package rights manifest');
    expect(imageHandoffPackageRightsManifestTsv()).toContain('Document\t1\tCollectable hero\t/assets/hero.png');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-rights-manifest.md')?.content).toContain('Rights note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-rights-manifest.json')?.content).manifestType).toBe('Image package rights manifest');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-rights-manifest.tsv')?.content).toContain('Scope\tImage Index\tName');
    expect(JSON.parse(imageHandoffPackageAcceptanceJson()).acceptanceStatus).toBe('pending');
    expect(imageHandoffPackageAcceptanceTsv()).toContain('Document\tClient/shop recipient has accepted package contents.');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-acceptance.json')?.content).toContain('recipient');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-acceptance.tsv')?.content).toContain('Scope\tItem\tOwner');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-receipt.md')?.content).toContain('# AnchorWorks Image Package Delivery Receipt (Document)');
    expect(imageHandoffPackageDeliveryReceiptReport()).toContain('Receipt status: pending');
    expect(JSON.parse(imageHandoffPackageDeliveryReceiptJson()).receiptStatus).toBe('pending');
    expect(imageHandoffPackageDeliveryReceiptTsv()).toContain('Document\tReceipt status\tpending');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-receipt.json')?.content).toContain('deliveredTo');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-release-notes.md')?.content).toContain('# AnchorWorks Image Package Release Notes (Document)');
    expect(JSON.parse(imageHandoffPackageReleaseNotesJson()).releaseStatus).toBe('hold');
    expect(imageHandoffPackageReleaseNotesReport()).toContain('Expected collected Links: 1');
    expect(imageHandoffPackageReleaseNotesTsv()).toContain('Document\tRelease status\thold');
    expect(JSON.parse(imageHandoffPackageSbomJson()).componentCount).toBe(2);
    expect(imageHandoffPackageSbomTsv()).toContain('Document\timage-1\tlinked-image');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-sbom.json')?.content).toContain('AnchorWorks Image Package SBOM');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-sbom.tsv')?.content).toContain('BOM Ref');
    expect(JSON.parse(imageHandoffPackageAttestationJson()).attestationType).toBe('AnchorWorks image package provenance');
    expect(imageHandoffPackageAttestationTsv()).toContain('Document\tSBOM generated for placed image components');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-attestation.json')?.content).toContain('claims');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-attestation.tsv')?.content).toContain('Scope\tClaim\tSubject');
    expect(imageHandoffPackageRiskRegisterReport()).toContain('# AnchorWorks Image Package Risk Register (Document)');
    expect(JSON.parse(imageHandoffPackageRiskRegisterJson()).registerType).toBe('Image package risk register');
    expect(imageHandoffPackageRiskRegisterTsv()).toContain('Document\tIMAGE-001');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-risk-register.md')?.content).toContain('Risk note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-risk-register.json')?.content).registerType).toBe('Image package risk register');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-risk-register.tsv')?.content).toContain('Scope\tRisk ID\tName');
    expect(imageHandoffPackageVerificationSummaryReport()).toContain('# AnchorWorks Image Package Verification Summary (Document)');
    expect(JSON.parse(imageHandoffPackageVerificationSummaryJson()).summaryType).toBe('Image package verification summary');
    expect(imageHandoffPackageVerificationSummaryTsv()).toContain('Document\tRelease gate evaluated');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-verification-summary.md')?.content).toContain('Verification note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-verification-summary.json')?.content).summaryType).toBe('Image package verification summary');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-verification-summary.tsv')?.content).toContain('Scope\tCheck\tStatus');
    expect(imageHandoffPackageClientReadme()).toContain('# AnchorWorks Image Package Client README (Document)');
    expect(JSON.parse(imageHandoffPackageClientReadmeJson()).readmeType).toBe('Image package client README');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-client-readme.md')?.content).toContain('Recipient Steps');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-client-readme.json')?.content).requiredReviewArtifacts).toContain('image-package-release-notes.md');
    expect(imageHandoffPackageChangeLogReport()).toContain('# AnchorWorks Image Package Change Log (Document)');
    expect(JSON.parse(imageHandoffPackageChangeLogJson()).changeLogType).toBe('Image package change log');
    expect(imageHandoffPackageChangeLogTsv()).toContain('Document\tpackage-1\trelease gate decision');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-change-log.md')?.content).toContain('Change note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-change-log.json')?.content).changeLogType).toBe('Image package change log');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-change-log.tsv')?.content).toContain('Scope\tVersion\tChange Type');
    expect(imageHandoffPackageRelinkMapReport()).toContain('# AnchorWorks Image Package Relink Map (Document)');
    expect(JSON.parse(imageHandoffPackageRelinkMapJson()).mapType).toBe('Image package relink map');
    expect(imageHandoffPackageRelinkMapTsv()).toContain('Document\t1\tCollectable hero\t/assets/hero.png\tLinks/hero.png');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-relink-map.md')?.content).toContain('Relink note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-relink-map.json')?.content).mapType).toBe('Image package relink map');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-relink-map.tsv')?.content).toContain('Scope\tImage Index\tName');
    expect(imageHandoffPackagePrepressTicketReport()).toContain('# AnchorWorks Image Package Prepress Ticket (Document)');
    expect(JSON.parse(imageHandoffPackagePrepressTicketJson()).ticketType).toBe('Image package prepress ticket');
    expect(imageHandoffPackagePrepressTicketTsv()).toContain('Document\tReview final release gate');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-prepress-ticket.md')?.content).toContain('Prepress note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-prepress-ticket.json')?.content).ticketType).toBe('Image package prepress ticket');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-prepress-ticket.tsv')?.content).toContain('Scope\tTask\tOwner');
    expect(imageHandoffPackagePrinterIntakeReport()).toContain('# AnchorWorks Image Package Printer Intake (Document)');
    expect(JSON.parse(imageHandoffPackagePrinterIntakeJson()).intakeType).toBe('Image package printer intake');
    expect(imageHandoffPackagePrinterIntakeTsv()).toContain('Document\tRelease gate reviewed');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-printer-intake.md')?.content).toContain('Intake note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-printer-intake.json')?.content).intakeType).toBe('Image package printer intake');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-printer-intake.tsv')?.content).toContain('Scope\tIntake Item\tStatus');
    expect(imageHandoffPackageShopProofChecklistReport()).toContain('# AnchorWorks Image Package Shop Proof Checklist (Document)');
    expect(JSON.parse(imageHandoffPackageShopProofChecklistJson()).checklistType).toBe('Image package shop proof checklist');
    expect(imageHandoffPackageShopProofChecklistTsv()).toContain('Document\tRelease gate approved for proof signoff');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-shop-proof-checklist.md')?.content).toContain('Proof note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-shop-proof-checklist.json')?.content).checklistType).toBe('Image package shop proof checklist');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-shop-proof-checklist.tsv')?.content).toContain('Scope\tCheckpoint\tStatus');
    expect(JSON.parse(imageHandoffPackageProductionHandoffJson()).handoffType).toBe('Image package production handoff');
    expect(imageHandoffPackageProductionHandoffTsv()).toContain('Document\tFinal release gate cleared');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-production-handoff.json')?.content).handoffType).toBe('Image package production handoff');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-production-handoff.tsv')?.content).toContain('Scope\tStage\tOwner');
    expect(imageHandoffPackagePrintReleaseApprovalReport()).toContain('# AnchorWorks Image Package Print Release Approval (Document)');
    expect(JSON.parse(imageHandoffPackagePrintReleaseApprovalJson()).approvalType).toBe('Image package print release approval');
    expect(imageHandoffPackagePrintReleaseApprovalTsv()).toContain('Document\tRelease gate cleared for print');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-print-release-approval.md')?.content).toContain('Approval note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-print-release-approval.json')?.content).approvalType).toBe('Image package print release approval');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-print-release-approval.tsv')?.content).toContain('Scope\tApproval\tStatus');
    expect(imageHandoffPackageVendorQaReport()).toContain('# AnchorWorks Image Package Vendor QA (Document)');
    expect(JSON.parse(imageHandoffPackageVendorQaJson()).qaType).toBe('Image package vendor QA');
    expect(imageHandoffPackageVendorQaTsv()).toContain('Document\tRelease gate accepted');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-vendor-qa.md')?.content).toContain('Vendor QA note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-vendor-qa.json')?.content).qaType).toBe('Image package vendor QA');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-vendor-qa.tsv')?.content).toContain('Scope\tQA Check\tOwner');
    expect(imageHandoffPackagePressRunTicketReport()).toContain('# AnchorWorks Image Package Press Run Ticket (Document)');
    expect(JSON.parse(imageHandoffPackagePressRunTicketJson()).ticketType).toBe('Image package press run ticket');
    expect(imageHandoffPackagePressRunTicketTsv()).toContain('Document\tRelease gate clear for production start');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-press-run-ticket.md')?.content).toContain('Press run note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-press-run-ticket.json')?.content).ticketType).toBe('Image package press run ticket');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-press-run-ticket.tsv')?.content).toContain('Scope\tSetup\tStation');
    expect(imageHandoffPackagePostpressInspectionReport()).toContain('# AnchorWorks Image Package Postpress Inspection (Document)');
    expect(JSON.parse(imageHandoffPackagePostpressInspectionJson()).inspectionType).toBe('Image package postpress inspection');
    expect(imageHandoffPackagePostpressInspectionTsv()).toContain('Document\tRelease gate still clear after postpress');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-postpress-inspection.md')?.content).toContain('Postpress note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-postpress-inspection.json')?.content).inspectionType).toBe('Image package postpress inspection');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-postpress-inspection.tsv')?.content).toContain('Scope\tInspection\tStation');
    expect(imageHandoffPackageFinishedGoodsReleaseReport()).toContain('# AnchorWorks Image Package Finished Goods Release (Document)');
    expect(JSON.parse(imageHandoffPackageFinishedGoodsReleaseJson()).releaseType).toBe('Image package finished goods release');
    expect(imageHandoffPackageFinishedGoodsReleaseTsv()).toContain('Document\tRelease gate clear for shipment');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-finished-goods-release.md')?.content).toContain('Finished goods note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-finished-goods-release.json')?.content).releaseType).toBe('Image package finished goods release');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-finished-goods-release.tsv')?.content).toContain('Scope\tRelease Check\tOwner');
    expect(imageHandoffPackageShipmentHandoffReport()).toContain('# AnchorWorks Image Package Shipment Handoff (Document)');
    expect(JSON.parse(imageHandoffPackageShipmentHandoffJson()).handoffType).toBe('Image package shipment handoff');
    expect(imageHandoffPackageShipmentHandoffTsv()).toContain('Document\tRelease gate clear for carrier handoff');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-shipment-handoff.md')?.content).toContain('Shipment note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-shipment-handoff.json')?.content).handoffType).toBe('Image package shipment handoff');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-shipment-handoff.tsv')?.content).toContain('Scope\tHandoff\tOwner');
    expect(imageHandoffPackageDeliveryConfirmationReport()).toContain('# AnchorWorks Image Package Delivery Confirmation (Document)');
    expect(JSON.parse(imageHandoffPackageDeliveryConfirmationJson()).confirmationType).toBe('Image package delivery confirmation');
    expect(imageHandoffPackageDeliveryConfirmationTsv()).toContain('Document\tRelease gate remains clear after delivery');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-confirmation.md')?.content).toContain('Delivery note:');
    expect(JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-confirmation.json')?.content).confirmationType).toBe('Image package delivery confirmation');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-delivery-confirmation.tsv')?.content).toContain('Scope\tConfirmation\tOwner');
    const releaseGate = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-release-gate.json')?.content);
    expect(releaseGate.releaseStatus).toBe('hold');
    expect(releaseGate.checks.map((check: { name: string }) => check.name)).toContain('Designer/prepress signoff completed');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-release-gate.md')?.content).toContain('Release status: hold');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-release-gate.tsv')?.content).toContain('Scope\tCheck\tPass\tDetail');
    expect(imageHandoffPackageReleaseGateJson()).toContain('missingRequiredDeliverables');
    expect(imageHandoffPackageReleaseGateReport()).toContain('# AnchorWorks Image Package Release Gate (Document)');
    expect(imageHandoffPackageReleaseGateTsv()).toContain('Document\tDesigner/prepress signoff completed\tfalse');
    expect(bundle.files.find((file: { path: string }) => file.path === 'verify-package-release-gate.sh')?.content).toContain('Package release gate hold');
    expect(bundle.files.find((file: { path: string }) => file.path === 'verify-package-release-gate.ps1')?.content).toContain('ConvertFrom-Json');
    expect(imageHandoffPackageReleaseGateVerifyScript()).toContain('image-package-release-gate.json');
    expect(imageHandoffPackageReleaseGateVerifyPowerShell()).toContain('$json.releaseStatus');
    const ciManifest = JSON.parse(bundle.files.find((file: { path: string }) => file.path === 'image-package-ci-manifest.json')?.content);
    expect(ciManifest.requiredArtifacts).toContain('verify-package-release-gate.sh');
    expect(ciManifest.ciSteps.map((step: { name: string }) => step.name)).toContain('Verify final release gate');
    expect(imageHandoffPackageCiManifestJson()).toContain('image-package-release-gate.md');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-github-actions.yml')?.content).toContain('Verify release gate');
    expect(imageHandoffPackageGithubActionsWorkflow()).toContain('actions/upload-artifact@v4');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-gitlab-ci.yml')?.content).toContain('anchorworks_image_package_verify_document');
    expect(imageHandoffPackageGitlabCiWorkflow()).toContain('artifacts:');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-azure-pipelines.yml')?.content).toContain('PublishPipelineArtifact@1');
    expect(imageHandoffPackageAzurePipelinesWorkflow()).toContain('Verify release gate (Document)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-circleci.yml')?.content).toContain('store_artifacts');
    expect(imageHandoffPackageCircleCiWorkflow()).toContain('Verify release gate (Document)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-jenkinsfile')?.content).toContain('archiveArtifacts');
    expect(imageHandoffPackageJenkinsfile()).toContain('Verify release gate (Document)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-bitbucket-pipelines.yml')?.content).toContain('atlassian/default-image:4');
    expect(imageHandoffPackageBitbucketPipelinesWorkflow()).toContain('Verify AnchorWorks image package (Document)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-buildkite.yml')?.content).toContain('artifact_paths');
    expect(imageHandoffPackageBuildkiteWorkflow()).toContain('Verify AnchorWorks image package (Document)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-drone.yml')?.content).toContain('plugins/s3');
    expect(imageHandoffPackageDroneWorkflow()).toContain('anchorworks-image-package-document');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-teamcity.kts')?.content).toContain('artifactRules');
    expect(imageHandoffPackageTeamCityWorkflow()).toContain('Verify AnchorWorks image package (Document)');
    expect(bundle.files.find((file: { path: string }) => file.path === 'image-collect-destinations.tsv')?.content).toBe('Source\tPackage Path\n/assets/hero.png\tLinks/hero.png');
  }, 15000);

  it('generates an image package file tree', async () => {
    const canvasEngine = await import('../canvasEngine');
    const hero = makeImageObject([], { name: 'Hero', _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const duplicateHero = makeImageObject([], { name: 'Duplicate hero', _src: '/client/photo.png?version=2', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO2' }) });
    const unsafe = makeImageObject([], { name: 'Unsafe', _src: '/assets/logo:final?.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,LOGO' }) });
    const canvas = {
      getObjects: () => [hero, duplicateHero, unsafe],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffPackageTree()).toBe([
      'AnchorWorks Package (Document)/',
      '├─ Document artwork file',
      '├─ README.md',
      '├─ image-handoff-report.md',
      '├─ image-package-checklist.md',
      '├─ image-package-plan.json',
      '├─ image-package-gate.json',
      '├─ collect-linked-images.sh',
      '├─ collect-linked-images.ps1',
      '├─ verify-linked-images.sh',
      '├─ verify-linked-images.ps1',
      '├─ image-package-verify-manifest.json',
      '├─ image-package-file-index.json',
      '├─ image-package-audit.json',
      '├─ image-package-audit.md',
      '├─ image-package-digests.tsv',
      '├─ image-package-signoff.md',
      '├─ image-package-signoff.json',
      '├─ image-package-signoff.tsv',
      '├─ image-package-delivery-manifest.json',
      '├─ image-package-delivery-manifest.tsv',
      '├─ image-package-provenance.json',
      '├─ image-package-provenance.tsv',
      '├─ image-package-rights-manifest.md',
      '├─ image-package-rights-manifest.json',
      '├─ image-package-rights-manifest.tsv',
      '├─ image-package-acceptance.json',
      '├─ image-package-acceptance.tsv',
      '├─ image-package-delivery-receipt.md',
      '├─ image-package-delivery-receipt.json',
      '├─ image-package-delivery-receipt.tsv',
      '├─ image-package-release-notes.md',
      '├─ image-package-release-notes.json',
      '├─ image-package-release-notes.tsv',
      '├─ image-package-sbom.json',
      '├─ image-package-sbom.tsv',
      '├─ image-package-attestation.json',
      '├─ image-package-attestation.tsv',
      '├─ image-package-risk-register.md',
      '├─ image-package-risk-register.json',
      '├─ image-package-risk-register.tsv',
      '├─ image-package-verification-summary.md',
      '├─ image-package-verification-summary.json',
      '├─ image-package-verification-summary.tsv',
      '├─ image-package-client-readme.md',
      '├─ image-package-client-readme.json',
      '├─ image-package-change-log.md',
      '├─ image-package-change-log.json',
      '├─ image-package-change-log.tsv',
      '├─ image-package-relink-map.md',
      '├─ image-package-relink-map.json',
      '├─ image-package-relink-map.tsv',
      '├─ image-package-prepress-ticket.md',
      '├─ image-package-prepress-ticket.json',
      '├─ image-package-prepress-ticket.tsv',
      '├─ image-package-printer-intake.md',
      '├─ image-package-printer-intake.json',
      '├─ image-package-printer-intake.tsv',
      '├─ image-package-shop-proof-checklist.md',
      '├─ image-package-shop-proof-checklist.json',
      '├─ image-package-shop-proof-checklist.tsv',
      '├─ image-package-production-handoff.json',
      '├─ image-package-production-handoff.tsv',
      '├─ image-package-print-release-approval.md',
      '├─ image-package-print-release-approval.json',
      '├─ image-package-print-release-approval.tsv',
      '├─ image-package-vendor-qa.md',
      '├─ image-package-vendor-qa.json',
      '├─ image-package-vendor-qa.tsv',
      '├─ image-package-press-run-ticket.md',
      '├─ image-package-press-run-ticket.json',
      '├─ image-package-press-run-ticket.tsv',
      '├─ image-package-postpress-inspection.md',
      '├─ image-package-postpress-inspection.json',
      '├─ image-package-postpress-inspection.tsv',
      '├─ image-package-finished-goods-release.md',
      '├─ image-package-finished-goods-release.json',
      '├─ image-package-finished-goods-release.tsv',
      '├─ image-package-shipment-handoff.md',
      '├─ image-package-shipment-handoff.json',
      '├─ image-package-shipment-handoff.tsv',
      '├─ image-package-delivery-confirmation.md',
      '├─ image-package-delivery-confirmation.json',
      '├─ image-package-delivery-confirmation.tsv',
      '├─ image-package-release-gate.json',
      '├─ image-package-release-gate.md',
      '├─ image-package-release-gate.tsv',
      '├─ verify-package-release-gate.sh',
      '├─ verify-package-release-gate.ps1',
      '├─ image-package-ci-manifest.json',
      '├─ image-package-github-actions.yml',
      '├─ image-package-gitlab-ci.yml',
      '├─ image-package-azure-pipelines.yml',
      '├─ image-package-circleci.yml',
      '├─ image-package-jenkinsfile',
      '├─ image-package-bitbucket-pipelines.yml',
      '├─ image-package-buildkite.yml',
      '├─ image-package-drone.yml',
      '├─ image-package-teamcity.kts',
      '└─ Links/',
      '   ├─ photo.png',
      '   ├─ photo-2.png',
      '   └─ logo_final',
    ].join('\n'));
  });

  it('generates an image package README for delivery', async () => {
    const canvasEngine = await import('../canvasEngine');
    const collectable = makeImageObject([], { name: 'Collectable hero', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const manual = makeImageObject([], { name: 'Manual logo', width: 200, height: 100, naturalWidth: 200, naturalHeight: 100, _src: '/assets/logo.svg', getElement: () => ({ naturalWidth: 200, naturalHeight: 100, toDataURL: () => 'not-a-data-url' }) });
    const unknown = makeImageObject([], { name: 'Pasted bitmap' });
    const embedded = makeImageObject([], { name: 'Embedded seal', width: 120, height: 120, naturalWidth: 120, naturalHeight: 120, _src: 'data:image/png;base64,SEAL' });
    const canvas = {
      getObjects: () => [collectable, missing, manual, unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffPackageReadme()).toBe([
      '# AnchorWorks Image Package README (Document)',
      'Status: needs review · 3 risk(s)',
      'Images: 5 total · 3 linked · 1 embedded',
      '',
      '## Package Contents',
      '- Document artwork file',
      '- Links/ collected linked images',
      '- Image handoff reports/checklists copied from AnchorWorks',
      '',
      '## Collect Destinations',
      '- /assets/hero.png -> Links/hero.png',
      '',
      '## Automation Files',
      '- collect-linked-images.sh / collect-linked-images.ps1 copy collectable linked images into Links/.',
      '- verify-linked-images.sh / verify-linked-images.ps1 check that expected Links files exist after collection.',
      '- image-package-verify-manifest.json lists every expected collected file for CI or handoff automation.',
      '- image-package-file-index.json lists package files, kinds, byte counts, and digests.',
      '- image-package-audit.json summarizes gate status, expected Links files, and package digests.',
      '- image-package-audit.md provides a human-readable audit summary for production review.',
      '- image-package-digests.tsv provides spreadsheet-ready package digest rows.',
      '- image-package-signoff.md provides a final designer/prepress signoff checklist.',
      '- image-package-signoff.json provides machine-readable signoff checklist and signature fields.',
      '- image-package-signoff.tsv provides spreadsheet-ready signoff checklist rows.',
      '- image-package-delivery-manifest.json summarizes package deliverables for external QA systems.',
      '- image-package-delivery-manifest.tsv provides spreadsheet-ready deliverable readiness rows.',
      '- image-package-provenance.json records source, status, and required proof for every image asset.',
      '- image-package-provenance.tsv provides spreadsheet-ready image provenance rows.',
      '- image-package-rights-manifest.md provides placed-image rights, usage, and proof review instructions.',
      '- image-package-rights-manifest.json records machine-readable image rights and license review state.',
      '- image-package-rights-manifest.tsv provides spreadsheet-ready image rights review rows.',
      '- image-package-acceptance.json records client/shop acceptance checks before handoff closeout.',
      '- image-package-acceptance.tsv provides spreadsheet-ready acceptance checklist rows.',
      '- image-package-delivery-receipt.md provides a client/shop delivery receipt for package closeout.',
      '- image-package-delivery-receipt.json records machine-readable receipt fields and pending signoffs.',
      '- image-package-delivery-receipt.tsv provides spreadsheet-ready delivery receipt rows.',
      '- image-package-release-notes.md provides client/shop release notes for package delivery.',
      '- image-package-release-notes.json records machine-readable release note sections and blockers.',
      '- image-package-release-notes.tsv provides spreadsheet-ready release note rows.',
      '- image-package-sbom.json records package bill-of-materials components for audit systems.',
      '- image-package-sbom.tsv provides spreadsheet-ready package component rows.',
      '- image-package-attestation.json records package provenance/release attestation claims.',
      '- image-package-attestation.tsv provides spreadsheet-ready attestation claim rows.',
      '- image-package-risk-register.md provides a producer/prepress triage register for package blockers and residual risks.',
      '- image-package-risk-register.json records machine-readable package risk register entries and mitigation owners.',
      '- image-package-risk-register.tsv provides spreadsheet-ready package risk rows.',
      '- image-package-verification-summary.md provides a human/CI-ready verification summary for package release readiness.',
      '- image-package-verification-summary.json records machine-readable verification checks across Links, gate, risk, SBOM, and attestation outputs.',
      '- image-package-verification-summary.tsv provides spreadsheet-ready verification check rows.',
      '- image-package-client-readme.md provides recipient-facing package opening, review, and acceptance instructions.',
      '- image-package-client-readme.json records machine-readable recipient instructions and required review artifacts.',
      '- image-package-change-log.md provides package version, revision, and handoff change history for client/shop review.',
      '- image-package-change-log.json records machine-readable package change log entries and evidence links.',
      '- image-package-change-log.tsv provides spreadsheet-ready package change log rows.',
      '- image-package-relink-map.md provides recipient-facing source-to-Links relink instructions.',
      '- image-package-relink-map.json records machine-readable relink targets for placed images.',
      '- image-package-relink-map.tsv provides spreadsheet-ready relink mapping rows.',
      '- image-package-prepress-ticket.md provides an operator-facing production ticket for prepress/package execution.',
      '- image-package-prepress-ticket.json records machine-readable production tasks, holds, and evidence files.',
      '- image-package-prepress-ticket.tsv provides spreadsheet-ready prepress task rows.',
      '- image-package-printer-intake.md provides a print-shop receiving checklist for package intake.',
      '- image-package-printer-intake.json records machine-readable print-shop intake fields, holds, and required artifacts.',
      '- image-package-printer-intake.tsv provides spreadsheet-ready print-shop intake rows.',
      '- image-package-shop-proof-checklist.md provides print-shop proof review checkpoints before production approval.',
      '- image-package-shop-proof-checklist.json records machine-readable proof approval checks, holds, and evidence files.',
      '- image-package-shop-proof-checklist.tsv provides spreadsheet-ready shop proof review rows.',
      '- image-package-production-handoff.json records machine-readable production handoff responsibilities, evidence, holds, and next actions.',
      '- image-package-production-handoff.tsv provides spreadsheet-ready production handoff rows for shop scheduling.',
      '- image-package-print-release-approval.md provides the final client/shop print-release approval form before production.',
      '- image-package-print-release-approval.json records machine-readable final approval status, approvers, blockers, and evidence.',
      '- image-package-print-release-approval.tsv provides spreadsheet-ready final print-release approval rows.',
      '- image-package-vendor-qa.md provides vendor-facing QA acceptance checks before press/vendor release.',
      '- image-package-vendor-qa.json records machine-readable vendor QA status, owners, holds, and acceptance evidence.',
      '- image-package-vendor-qa.tsv provides spreadsheet-ready vendor QA rows for supplier review.',
      '- image-package-press-run-ticket.md provides an operator-facing press run ticket for production start.',
      '- image-package-press-run-ticket.json records machine-readable press setup, approvals, holds, and run evidence.',
      '- image-package-press-run-ticket.tsv provides spreadsheet-ready press run setup rows.',
      '- image-package-postpress-inspection.md provides finished-goods inspection checks after press/postpress work.',
      '- image-package-postpress-inspection.json records machine-readable postpress inspection status, defects, holds, and release evidence.',
      '- image-package-postpress-inspection.tsv provides spreadsheet-ready postpress inspection rows.',
      '- image-package-finished-goods-release.md provides final finished-goods release and shipment readiness instructions.',
      '- image-package-finished-goods-release.json records machine-readable finished-goods release status, shipment fields, holds, and evidence.',
      '- image-package-finished-goods-release.tsv provides spreadsheet-ready finished-goods release rows.',
      '- image-package-shipment-handoff.md provides carrier/customer shipment handoff and custody instructions.',
      '- image-package-shipment-handoff.json records machine-readable shipment handoff status, tracking fields, holds, and custody evidence.',
      '- image-package-shipment-handoff.tsv provides spreadsheet-ready shipment handoff rows.',
      '- image-package-delivery-confirmation.md provides recipient delivery confirmation and exception handling instructions.',
      '- image-package-delivery-confirmation.json records machine-readable delivery confirmation status, receipt fields, holds, and evidence.',
      '- image-package-delivery-confirmation.tsv provides spreadsheet-ready delivery confirmation rows.',
      '- image-package-release-gate.json summarizes final release blockers before client/shop delivery.',
      '- image-package-release-gate.md provides a human-readable release gate decision.',
      '- image-package-release-gate.tsv provides spreadsheet-ready release gate checks.',
      '- verify-package-release-gate.sh / verify-package-release-gate.ps1 fail CI when the release gate is still on hold.',
      '- image-package-ci-manifest.json lists CI/package verification steps and required release artifacts.',
      '- image-package-github-actions.yml provides a ready-to-copy GitHub Actions package verification workflow.',
      '- image-package-gitlab-ci.yml provides a ready-to-copy GitLab CI package verification job.',
      '- image-package-azure-pipelines.yml provides a ready-to-copy Azure Pipelines package verification job.',
      '- image-package-circleci.yml provides a ready-to-copy CircleCI package verification workflow.',
      '- image-package-jenkinsfile provides a ready-to-copy Jenkins Pipeline package verification job.',
      '- image-package-bitbucket-pipelines.yml provides a ready-to-copy Bitbucket Pipelines package verification step.',
      '- image-package-buildkite.yml provides a ready-to-copy Buildkite package verification pipeline.',
      '- image-package-drone.yml provides a ready-to-copy Drone CI package verification pipeline.',
      '- image-package-teamcity.kts provides a ready-to-copy TeamCity Kotlin DSL package verification build.',
      '',
      '## Relink Before Output',
      '- /assets/missing.png',
      '',
      '## Manual Review',
      '- #3 Manual logo · error · not embeddable · replace source or embed manually · /assets/logo.svg',
      '- #4 Pasted bitmap · warning · unknown source · relink or confirm embedded provenance · (unknown source)',
      '',
      '## Ready Assets',
      '- #5 Embedded seal · ok · embedded · ready · data:image/png;base64,SEAL',
      '',
      'Handoff note: resolve relink/manual-review items before final package delivery.',
    ].join('\n'));
  });

  it('generates a machine-readable image package plan', async () => {
    const canvasEngine = await import('../canvasEngine');
    const collectable = makeImageObject([], { name: 'Collectable hero', width: 300, height: 200, naturalWidth: 300, naturalHeight: 200, _src: '/assets/hero.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing hero', width: 400, height: 200, naturalWidth: 1200, naturalHeight: 800, _src: '/assets/missing.png', missing: true });
    const manual = makeImageObject([], { name: 'Manual logo', width: 200, height: 100, naturalWidth: 200, naturalHeight: 100, _src: '/assets/logo.svg', getElement: () => ({ naturalWidth: 200, naturalHeight: 100, toDataURL: () => 'not-a-data-url' }) });
    const unknown = makeImageObject([], { name: 'Pasted bitmap' });
    const embedded = makeImageObject([], { name: 'Embedded seal', width: 120, height: 120, naturalWidth: 120, naturalHeight: 120, _src: 'data:image/png;base64,SEAL' });
    const canvas = {
      getObjects: () => [collectable, missing, manual, unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    const plan = JSON.parse(imageHandoffPackagePlanJson());
    expect(plan.scope).toBe('Document');
    expect(plan.status).toBe('needs review');
    expect(plan.riskTotal).toBe(3);
    expect(plan.summary).toMatchObject({ total: 5, linked: 3, embedded: 1, missingLinked: 1, notEmbeddableLinked: 1, unknownSource: 1 });
    expect(plan.steps.relinkBeforePackage).toEqual(['/assets/missing.png']);
    expect(plan.steps.collectLinkedFiles).toEqual(['/assets/hero.png']);
    expect(plan.steps.collectDestinations).toEqual([
      { source: '/assets/hero.png', packagePath: 'Links/hero.png' },
    ]);
    expect(plan.steps.manualReviewBeforeHandoff.map((asset: { name: string }) => asset.name)).toEqual(['Manual logo', 'Pasted bitmap']);
    expect(plan.steps.readyEmbeddedOrLinkedAssets.map((asset: { name: string }) => asset.name)).toEqual(['Embedded seal']);
    expect(plan.assets).toHaveLength(5);
  }, 15000);

  it('generates collect destination package paths for linked images', async () => {
    const canvasEngine = await import('../canvasEngine');
    const hero = makeImageObject([], { name: 'Hero', _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const duplicateHero = makeImageObject([], { name: 'Duplicate hero', _src: '/client/photo.png?version=2', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO2' }) });
    const unsafe = makeImageObject([], { name: 'Unsafe', _src: '/assets/logo:final?.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,LOGO' }) });
    const duplicateSource = makeImageObject([], { name: 'Duplicate source', _src: '/assets/photo.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,HERO' }) });
    const missing = makeImageObject([], { name: 'Missing', _src: '/assets/missing.png', missing: true });
    const canvas = {
      getObjects: () => [hero, duplicateHero, unsafe, duplicateSource, missing],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffCollectDestinationManifest()).toBe([
      'Source\tPackage Path',
      '/assets/photo.png\tLinks/photo.png',
      '/client/photo.png?version=2\tLinks/photo-2.png',
      '/assets/logo:final?.png\tLinks/logo_final',
    ].join('\n'));
    expect(imageHandoffCollectScript()).toBe([
      '#!/usr/bin/env sh',
      'set -eu',
      '',
      '# AnchorWorks image package collect script (Document)',
      'PACKAGE_DIR="${1:-AnchorWorks Package}"',
      'mkdir -p "$PACKAGE_DIR"/Links',
      "cp -f -- '/assets/photo.png' \"$PACKAGE_DIR\"/'Links/photo.png'",
      "cp -f -- '/client/photo.png?version=2' \"$PACKAGE_DIR\"/'Links/photo-2.png'",
      "cp -f -- '/assets/logo:final?.png' \"$PACKAGE_DIR\"/'Links/logo_final'",
    ].join('\n'));
    expect(imageHandoffCollectPowerShell()).toBe([
      '$ErrorActionPreference = "Stop"',
      '',
      '# AnchorWorks image package collect script (Document)',
      'param([string]$PackageDir = "AnchorWorks Package")',
      'New-Item -ItemType Directory -Force -Path (Join-Path $PackageDir "Links") | Out-Null',
      "Copy-Item -LiteralPath '/assets/photo.png' -Destination (Join-Path $PackageDir 'Links/photo.png') -Force",
      "Copy-Item -LiteralPath '/client/photo.png?version=2' -Destination (Join-Path $PackageDir 'Links/photo-2.png') -Force",
      "Copy-Item -LiteralPath '/assets/logo:final?.png' -Destination (Join-Path $PackageDir 'Links/logo_final') -Force",
    ].join('\n'));
    expect(imageHandoffVerifyScript()).toContain('Missing: Links/photo.png');
    expect(imageHandoffVerifyScript()).toContain('Package verify failed.');
    expect(imageHandoffVerifyPowerShell()).toContain("Join-Path $PackageDir 'Links/photo.png'");
    expect(imageHandoffVerifyPowerShell()).toContain('Package verify failed.');
    const verifyManifest = JSON.parse(imageHandoffVerifyManifestJson());
    expect(verifyManifest.expectedFileCount).toBe(3);
    expect(verifyManifest.files.map((file: { packagePath: string }) => file.packagePath)).toEqual(['Links/photo.png', 'Links/photo-2.png', 'Links/logo_final']);
    const fileIndex = JSON.parse(imageHandoffPackageFileIndexJson());
    expect(fileIndex.files.map((file: { path: string }) => file.path)).toContain('image-package-verify-manifest.json');
    expect(fileIndex.files.map((file: { path: string }) => file.path)).toContain('image-package-file-index.json');
  });

  it('exports missing linked image sources for relink before package', async () => {
    const canvasEngine = await import('../canvasEngine');
    const missingHero = makeImageObject([], { name: 'Missing hero', _src: '/assets/missing.png', missing: true });
    const duplicateMissingHero = makeImageObject([], { name: 'Duplicate missing hero', _src: '/assets/missing.png', broken: true });
    const missingLogo = makeImageObject([], { name: 'Missing logo', _src: '/assets/logo-missing.svg', linkMissing: true });
    const collectable = makeImageObject([], { name: 'Collectable', _src: '/assets/collect.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,COLLECT' }) });
    const unknown = makeImageObject([], { name: 'Unknown' });
    const canvas = {
      getObjects: () => [missingHero, duplicateMissingHero, missingLogo, collectable, unknown],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffMissingRelinkList()).toBe([
      '/assets/missing.png',
      '/assets/logo-missing.svg',
    ].join('\n'));
  });

  it('exports only active-artboard collectable linked image sources', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardLinked = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardLinked = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const sameBoardMissing = makeImageObject([], { left: 235, top: 20, width: 20, height: 20, _src: '/same-missing.png', missing: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardLinked, active, sameBoardLinked, sameBoardMissing],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardCollectSourceList()).toBe('/same.png');
      expect(imageHandoffActiveArtboardMissingRelinkList()).toBe('/same-missing.png');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates active-artboard package gate JSON', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardCollectable = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardCollectable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      const gate = JSON.parse(imageHandoffActiveArtboardPackageGateJson());
      expect(gate).toMatchObject({
        scope: 'Active artboard',
        pass: true,
        status: 'ready',
        blockerCount: 0,
        counts: { missingLinked: 0, notEmbeddableLinked: 0, unknownSource: 0 },
      });
      expect(gate.blockers).toEqual([]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates active-artboard package blockers', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardCollectable = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardCollectable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardPackageBlockers()).toBe([
        '# AnchorWorks Image Package Blockers (Active artboard)',
        'Status: ready · 0 blocker(s)',
        'Blocking counts: 0 missing · 0 not embeddable · 0 unknown source',
        '- none',
        'Package gate: ready to collect linked files.',
      ].join('\n'));
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates an active-artboard image package bundle JSON', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardLinked = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,FIRST' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardLinked = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardLinked, active, sameBoardLinked],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      const bundle = JSON.parse(imageHandoffActiveArtboardPackageBundleJson());
      expect(bundle.scope).toBe('Active artboard');
      expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-tree.txt')?.content).toContain('same.png');
      expect(bundle.files.find((file: { path: string }) => file.path === 'collect-linked-images.sh')?.content).toContain("cp -f -- '/same.png'");
      expect(imageHandoffActiveArtboardCollectScript()).toContain("cp -f -- '/same.png'");
      expect(imageHandoffActiveArtboardCollectPowerShell()).toContain("Copy-Item -LiteralPath '/same.png'");
      expect(imageHandoffActiveArtboardVerifyScript()).toContain('Missing: Links/same.png');
      expect(imageHandoffActiveArtboardVerifyPowerShell()).toContain("Join-Path $PackageDir 'Links/same.png'");
      const verifyManifest = JSON.parse(imageHandoffActiveArtboardVerifyManifestJson());
      expect(verifyManifest.files.map((file: { packagePath: string }) => file.packagePath)).toEqual(['Links/same.png']);
      const fileIndex = JSON.parse(imageHandoffActiveArtboardPackageFileIndexJson());
      expect(fileIndex.scope).toBe('Active artboard');
      expect(fileIndex.files.map((file: { path: string }) => file.path)).toContain('image-package-file-index.json');
      const audit = JSON.parse(imageHandoffActiveArtboardPackageAuditJson());
      expect(audit.scope).toBe('Active artboard');
      expect(audit.expectedLinks.expectedFileCount).toBe(1);
      expect(imageHandoffActiveArtboardPackageAuditReport()).toContain('# AnchorWorks Image Package Audit (Active artboard)');
      expect(imageHandoffActiveArtboardPackageDigestManifest()).toContain('image-package-audit.md\tmarkdown');
      expect(imageHandoffActiveArtboardPackageSignoff()).toContain('# AnchorWorks Image Package Signoff (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageSignoffJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageSignoffTsv()).toContain('Active artboard\tPackage gate JSON reviewed.\tfalse');
      expect(JSON.parse(imageHandoffActiveArtboardPackageDeliveryManifestJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageDeliveryManifestTsv()).toContain('Active artboard\tDocument artwork file\tartwork\ttrue\ttrue');
      expect(JSON.parse(imageHandoffActiveArtboardPackageProvenanceJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageProvenanceTsv()).toContain('Active artboard\t1\tImage 1');
      expect(imageHandoffActiveArtboardPackageRightsManifestReport()).toContain('# AnchorWorks Image Package Rights Manifest (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageRightsManifestJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageRightsManifestTsv()).toContain('Active artboard\t1\tImage 1');
      expect(JSON.parse(imageHandoffActiveArtboardPackageAcceptanceJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageAcceptanceTsv()).toContain('Active artboard\tClient/shop recipient has accepted package contents.');
      expect(imageHandoffActiveArtboardPackageDeliveryReceiptReport()).toContain('# AnchorWorks Image Package Delivery Receipt (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageDeliveryReceiptJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageDeliveryReceiptTsv()).toContain('Active artboard\tReceipt status\tpending');
      expect(imageHandoffActiveArtboardPackageReleaseNotesReport()).toContain('# AnchorWorks Image Package Release Notes (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageReleaseNotesJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageReleaseNotesTsv()).toContain('Active artboard\tRelease status');
      expect(JSON.parse(imageHandoffActiveArtboardPackageSbomJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageSbomTsv()).toContain('Active artboard\timage-1');
      expect(JSON.parse(imageHandoffActiveArtboardPackageAttestationJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageAttestationTsv()).toContain('Active artboard\tPackage generated by AnchorWorks');
      expect(imageHandoffActiveArtboardPackageRiskRegisterReport()).toContain('# AnchorWorks Image Package Risk Register (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageRiskRegisterJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageRiskRegisterTsv()).toContain('Active artboard\tIMAGE-001');
      expect(imageHandoffActiveArtboardPackageVerificationSummaryReport()).toContain('# AnchorWorks Image Package Verification Summary (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageVerificationSummaryJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageVerificationSummaryTsv()).toContain('Active artboard\tRelease gate evaluated');
      expect(imageHandoffActiveArtboardPackageClientReadme()).toContain('# AnchorWorks Image Package Client README (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageClientReadmeJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageChangeLogReport()).toContain('# AnchorWorks Image Package Change Log (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageChangeLogJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageChangeLogTsv()).toContain('Active artboard\tpackage-1');
      expect(imageHandoffActiveArtboardPackageRelinkMapReport()).toContain('# AnchorWorks Image Package Relink Map (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageRelinkMapJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageRelinkMapTsv()).toContain('Active artboard\t1\tImage 1\t/same.png\tLinks/same.png');
      expect(imageHandoffActiveArtboardPackagePrepressTicketReport()).toContain('# AnchorWorks Image Package Prepress Ticket (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackagePrepressTicketJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackagePrepressTicketTsv()).toContain('Active artboard\tReview final release gate');
      expect(imageHandoffActiveArtboardPackagePrinterIntakeReport()).toContain('# AnchorWorks Image Package Printer Intake (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackagePrinterIntakeJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackagePrinterIntakeTsv()).toContain('Active artboard\tRelease gate reviewed');
      expect(imageHandoffActiveArtboardPackageShopProofChecklistReport()).toContain('# AnchorWorks Image Package Shop Proof Checklist (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageShopProofChecklistJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageShopProofChecklistTsv()).toContain('Active artboard\tRelease gate approved for proof signoff');
      expect(JSON.parse(imageHandoffActiveArtboardPackageProductionHandoffJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageProductionHandoffTsv()).toContain('Active artboard\tFinal release gate cleared');
      expect(imageHandoffActiveArtboardPackagePrintReleaseApprovalReport()).toContain('# AnchorWorks Image Package Print Release Approval (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackagePrintReleaseApprovalJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackagePrintReleaseApprovalTsv()).toContain('Active artboard\tRelease gate cleared for print');
      expect(imageHandoffActiveArtboardPackageVendorQaReport()).toContain('# AnchorWorks Image Package Vendor QA (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageVendorQaJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageVendorQaTsv()).toContain('Active artboard\tRelease gate accepted');
      expect(imageHandoffActiveArtboardPackagePressRunTicketReport()).toContain('# AnchorWorks Image Package Press Run Ticket (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackagePressRunTicketJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackagePressRunTicketTsv()).toContain('Active artboard\tRelease gate clear for production start');
      expect(imageHandoffActiveArtboardPackagePostpressInspectionReport()).toContain('# AnchorWorks Image Package Postpress Inspection (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackagePostpressInspectionJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackagePostpressInspectionTsv()).toContain('Active artboard\tRelease gate still clear after postpress');
      expect(imageHandoffActiveArtboardPackageFinishedGoodsReleaseReport()).toContain('# AnchorWorks Image Package Finished Goods Release (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageFinishedGoodsReleaseJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageFinishedGoodsReleaseTsv()).toContain('Active artboard\tRelease gate clear for shipment');
      expect(imageHandoffActiveArtboardPackageShipmentHandoffReport()).toContain('# AnchorWorks Image Package Shipment Handoff (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageShipmentHandoffJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageShipmentHandoffTsv()).toContain('Active artboard\tRelease gate clear for carrier handoff');
      expect(imageHandoffActiveArtboardPackageDeliveryConfirmationReport()).toContain('# AnchorWorks Image Package Delivery Confirmation (Active artboard)');
      expect(JSON.parse(imageHandoffActiveArtboardPackageDeliveryConfirmationJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageDeliveryConfirmationTsv()).toContain('Active artboard\tRelease gate remains clear after delivery');
      expect(JSON.parse(imageHandoffActiveArtboardPackageReleaseGateJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageReleaseGateReport()).toContain('# AnchorWorks Image Package Release Gate (Active artboard)');
      expect(imageHandoffActiveArtboardPackageReleaseGateTsv()).toContain('Active artboard\tDesigner/prepress signoff completed\tfalse');
      expect(imageHandoffActiveArtboardPackageReleaseGateVerifyScript()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageReleaseGateVerifyPowerShell()).toContain('Active artboard');
      expect(JSON.parse(imageHandoffActiveArtboardPackageCiManifestJson()).scope).toBe('Active artboard');
      expect(imageHandoffActiveArtboardPackageGithubActionsWorkflow()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageGitlabCiWorkflow()).toContain('active_artboard');
      expect(imageHandoffActiveArtboardPackageAzurePipelinesWorkflow()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageCircleCiWorkflow()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageJenkinsfile()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageBitbucketPipelinesWorkflow()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageBuildkiteWorkflow()).toContain('Active artboard');
      expect(imageHandoffActiveArtboardPackageDroneWorkflow()).toContain('active-artboard');
      expect(imageHandoffActiveArtboardPackageTeamCityWorkflow()).toContain('Active artboard');
      expect(bundle.files.find((file: { path: string }) => file.path === 'image-package-tree.txt')?.content).not.toContain('first.png');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  }, 15000);

  it('generates an active-artboard image package file tree', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardLinked = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,FIRST' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardLinked = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardLinked, active, sameBoardLinked],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardPackageTree()).toContain('AnchorWorks Package (Active artboard)/');
      expect(imageHandoffActiveArtboardPackageTree()).toContain('   └─ same.png');
      expect(imageHandoffActiveArtboardPackageTree()).not.toContain('first.png');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates an active-artboard image package README', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardCollectable = makeImageObject([], { name: 'Same-board asset', left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardCollectable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardPackageReadme()).toContain('# AnchorWorks Image Package README (Active artboard)');
      expect(imageHandoffActiveArtboardPackageReadme()).toContain('- /same.png -> Links/same.png');
      expect(imageHandoffActiveArtboardPackageReadme()).not.toContain('/first-missing.png');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates active-artboard collect destination package paths', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardLinked = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,FIRST' }) });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardLinked = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardLinked, active, sameBoardLinked],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardCollectDestinationManifest()).toBe([
        'Source\tPackage Path',
        '/same.png\tLinks/same.png',
      ].join('\n'));
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates an active-artboard image package plan', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardCollectable = makeImageObject([], { name: 'Same-board asset', left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardCollectable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      const plan = JSON.parse(imageHandoffActiveArtboardPackagePlanJson());
      expect(plan.scope).toBe('Active artboard');
      expect(plan.status).toBe('ready');
      expect(plan.summary).toMatchObject({ total: 1, linked: 1, missingLinked: 0 });
      expect(plan.steps.relinkBeforePackage).toEqual([]);
      expect(plan.steps.collectLinkedFiles).toEqual(['/same.png']);
      expect(plan.steps.collectDestinations).toEqual([{ source: '/same.png', packagePath: 'Links/same.png' }]);
      expect(plan.assets.map((asset: { source: string }) => asset.source)).toEqual(['/same.png']);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('generates an active-artboard image package checklist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/first-missing.png', missing: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardCollectable = makeImageObject([], { name: 'Same-board asset', left: 230, top: 10, width: 20, height: 20, _src: '/same.png', getElement: () => ({ toDataURL: () => 'data:image/png;base64,SAME' }) });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardMissing, active, sameBoardCollectable],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(imageHandoffActiveArtboardPackageChecklist()).toBe([
        '# AnchorWorks Image Package Checklist (Active artboard)',
        'Status: ready · 0 risk(s)',
        'Images: 1 total · 1 linked · 0 embedded',
        '## 1. Relink before package',
        '- none',
        '## 2. Collect linked files',
        '- /same.png',
        '## 3. Manual review before handoff',
        '- none',
        '## 4. Ready embedded/linked assets',
        '- none',
        'Package step: collect listed files, keep embedded assets in the document, and archive this checklist with the handoff.',
      ].join('\n'));
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('reports when no linked image sources are collectable or missing for handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const missing = makeImageObject([], { name: 'Missing', _src: '/assets/missing.png', missing: true });
    const unknown = makeImageObject([], { name: 'Unknown' });
    const embedded = makeImageObject([], { name: 'Embedded', _src: 'data:image/png;base64,EMBEDDED' });
    const canvas = {
      getObjects: () => [missing, unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(imageHandoffCollectSourceList()).toBe('No collectable linked image sources.');

    const cleanCanvas = {
      getObjects: () => [unknown, embedded],
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(cleanCanvas as never);
    expect(imageHandoffMissingRelinkList()).toBe('No missing linked image sources.');
  });

  it('selects all image preflight issues in one review pass', async () => {
    const canvasEngine = await import('../canvasEngine');
    const filtered = makeImageObject([new fabric.filters.Grayscale()]);
    const cropped = makeImageObject([], { width: 100, height: 100, cropX: 5 });
    const transformed = makeImageObject([], { angle: 8 });
    const lowResolution = makeImageObject([], { width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
    const highResolution = makeImageObject([], { width: 100, height: 100, naturalWidth: 600, naturalHeight: 600 });
    const missingLinked = makeImageObject([], { _src: '/assets/missing-select.png', missing: true });
    const cleanImage = makeImageObject([], { width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const overlayFiltered = makeImageObject([new fabric.filters.Blur({ blur: 0.2 })], { excludeFromExport: true });
    const vectorWithFilters = new fabric.Rect({ width: 10, height: 10 }) as fabric.Rect & { filters?: unknown[] };
    vectorWithFilters.filters = [new fabric.filters.Sepia()];
    const canvas = {
      getObjects: () => [filtered, cropped, transformed, lowResolution, highResolution, missingLinked, cleanImage, overlayFiltered, vectorWithFilters],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllImagePreflightObjects()).toBe(6);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([filtered, cropped, transformed, lowResolution, highResolution, missingLinked]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects all image preflight issues only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardFiltered = makeImageObject([new fabric.filters.Grayscale()], { left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const filteredSameBoard = makeImageObject([new fabric.filters.Sepia()], { left: 210, top: 10, width: 20, height: 20 });
    const transformedSameBoard = makeImageObject([], { left: 215, top: 40, width: 20, height: 20, angle: 12 });
    const missingSameBoard = makeImageObject([], { left: 225, top: 40, width: 20, height: 20, _src: '/assets/missing-active.png', linkMissing: true });
    const cleanSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardFiltered, active, filteredSameBoard, transformedSameBoard, missingSameBoard, cleanSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectAllImagePreflightActiveArtboardObjects()).toBe(3);
      const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
      expect(activeSelection.getObjects()).toEqual([filteredSameBoard, transformedSameBoard, missingSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects image preflight review markers for cleanup review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const markedLow = makeImageObject([], { anchorworksPreflightIssue: 'low-resolution-image' });
    const markedTransform = makeImageObject([], { anchorworksTransformReview: { scaleX: 1.5, scaleY: 1, angle: 0, skewX: 0, skewY: 0 } });
    const markedMissingLink = makeImageObject([], { anchorworksMissingLinkReview: { source: '/assets/missing.png' } });
    const styleOnlyMarker = makeImageObject([], { anchorworksOriginalReviewStyle: { stroke: '#111827', strokeWidth: 1, strokeUniform: false } });
    const cleanImage = makeImageObject([], { width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const overlayMarked = makeImageObject([], { anchorworksPreflightIssue: 'high-resolution-image', excludeFromExport: true });
    const canvas = {
      getObjects: () => [markedLow, markedTransform, markedMissingLink, styleOnlyMarker, cleanImage, overlayMarked],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectImagePreflightReviewObjects()).toBe(4);
    const activeSelection = canvas.setActiveObject.mock.calls[0]?.[0] as fabric.ActiveSelection;
    expect(activeSelection.getObjects()).toEqual([markedLow, markedTransform, markedMissingLink, styleOnlyMarker]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects image preflight review markers only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const markedFirstBoard = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, anchorworksPreflightIssue: 'transformed-image' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const markedSameBoard = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, anchorworksEffectivePpi: 560 });
    const cleanSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [markedFirstBoard, active, markedSameBoard, cleanSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectImagePreflightReviewActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(markedSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('clears image preflight review markers and restores original style', async () => {
    const canvasEngine = await import('../canvasEngine');
    const markedLow = makeImageObject([], {
      width: 100,
      height: 100,
      naturalWidth: 300,
      naturalHeight: 300,
      anchorworksPreflightIssue: 'low-resolution-image',
      anchorworksEffectivePpi: 96,
      anchorworksOriginalReviewStyle: { stroke: '#0f172a', strokeWidth: 0.5, strokeUniform: false },
      stroke: '#ef4444',
      strokeWidth: 2,
      strokeUniform: true,
    });
    const markedTransform = makeImageObject([], {
      anchorworksPreflightIssue: 'transformed-image',
      anchorworksTransformReview: { scaleX: 1.5, scaleY: 1, angle: 0, skewX: 0, skewY: 0 },
      anchorworksOriginalReviewStyle: { stroke: undefined, strokeWidth: undefined, strokeUniform: undefined },
      stroke: '#8b5cf6',
      strokeWidth: 2,
      strokeUniform: true,
    });
    const markedMissing = makeImageObject([], {
      anchorworksPreflightIssue: 'missing-linked-image',
      anchorworksMissingLinkReview: { source: '/assets/missing-clear.png' },
      anchorworksOriginalReviewStyle: { stroke: '#64748b', strokeWidth: 1, strokeUniform: false },
      stroke: '#dc2626',
      strokeWidth: 2,
      strokeUniform: true,
    });
    const cleanImage = makeImageObject([], { width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const overlayMarked = makeImageObject([], { anchorworksPreflightIssue: 'high-resolution-image', excludeFromExport: true, stroke: '#f59e0b' });
    const canvas = {
      getObjects: () => [markedLow, markedTransform, markedMissing, cleanImage, overlayMarked],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(clearImagePreflightReviewObjects()).toBe(3);
    expect(markedLow.anchorworksPreflightIssue).toBeUndefined();
    expect(markedLow.anchorworksEffectivePpi).toBeUndefined();
    expect(markedLow.anchorworksOriginalReviewStyle).toBeUndefined();
    expect(markedLow.stroke).toBe('#0f172a');
    expect(markedLow.strokeWidth).toBe(0.5);
    expect(markedLow.strokeUniform).toBe(false);
    expect(markedTransform.anchorworksPreflightIssue).toBeUndefined();
    expect(markedTransform.anchorworksTransformReview).toBeUndefined();
    expect(markedTransform.stroke).toBeUndefined();
    expect(markedTransform.strokeWidth).toBeUndefined();
    expect(markedTransform.strokeUniform).toBeUndefined();
    expect(markedMissing.anchorworksPreflightIssue).toBeUndefined();
    expect(markedMissing.anchorworksMissingLinkReview).toBeUndefined();
    expect(markedMissing.stroke).toBe('#64748b');
    expect(markedMissing.strokeWidth).toBe(1);
    expect(markedMissing.strokeUniform).toBe(false);
    expect(cleanImage.anchorworksPreflightIssue).toBeUndefined();
    expect(overlayMarked.anchorworksPreflightIssue).toBe('high-resolution-image');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(clearImagePreflightReviewObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clears image preflight review markers only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const markedFirstBoard = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, anchorworksPreflightIssue: 'transformed-image', stroke: '#8b5cf6' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const markedSameBoard = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, anchorworksPreflightIssue: 'high-resolution-image', anchorworksOriginalReviewStyle: { stroke: '#334155', strokeWidth: 1, strokeUniform: false }, stroke: '#f59e0b', strokeWidth: 2, strokeUniform: true });
    const cleanSameBoard = makeImageObject([], { left: 230, top: 10, width: 20, height: 20 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [markedFirstBoard, active, markedSameBoard, cleanSameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(clearImagePreflightReviewActiveArtboardObjects()).toBe(1);
      expect(markedSameBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(markedSameBoard.stroke).toBe('#334155');
      expect(markedSameBoard.strokeWidth).toBe(1);
      expect(markedSameBoard.strokeUniform).toBe(false);
      expect(markedFirstBoard.anchorworksPreflightIssue).toBe('transformed-image');
      expect(cleanSameBoard.anchorworksPreflightIssue).toBeUndefined();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(clearImagePreflightReviewActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('fixes all non-destructive image preflight issues in one pass', async () => {
    const canvasEngine = await import('../canvasEngine');
    const filtered = makeImageObject([new fabric.filters.Grayscale()], { applyFilters: vi.fn() });
    const cropped = makeImageObject([], { width: 100, height: 100, cropX: 5, cropY: 2, cropWidth: 80, cropHeight: 90 });
    const lowResolution = makeImageObject([], { width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
    const highResolution = makeImageObject([], { width: 100, height: 100, naturalWidth: 600, naturalHeight: 600 });
    const transformed = makeImageObject([], { angle: 8 });
    const missingLinked = makeImageObject([], { _src: '/assets/missing-fix.png', missing: true, stroke: '#0f172a', strokeWidth: 0.5, strokeUniform: false });
    const cleanImage = makeImageObject([], { width: 100, height: 100, naturalWidth: 300, naturalHeight: 300 });
    const overlayFiltered = makeImageObject([new fabric.filters.Blur({ blur: 0.2 })], { excludeFromExport: true, applyFilters: vi.fn() });
    const canvas = {
      getObjects: () => [filtered, cropped, lowResolution, highResolution, transformed, missingLinked, cleanImage, overlayFiltered],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(fixAllImagePreflightObjects()).toBe(6);
    expect(filtered.filters).toEqual([]);
    expect(filtered.applyFilters).toHaveBeenCalledOnce();
    expect(cropped.cropX).toBe(0);
    expect(cropped.cropY).toBe(0);
    expect(cropped.cropWidth).toBe(100);
    expect(cropped.cropHeight).toBe(100);
    expect(lowResolution.anchorworksPreflightIssue).toBe('low-resolution-image');
    expect(lowResolution.stroke).toBe('#ef4444');
    expect(highResolution.anchorworksPreflightIssue).toBe('high-resolution-image');
    expect(highResolution.stroke).toBe('#f59e0b');
    expect(transformed.anchorworksPreflightIssue).toBe('transformed-image');
    expect(transformed.stroke).toBe('#8b5cf6');
    expect(missingLinked.anchorworksPreflightIssue).toBe('missing-linked-image');
    expect(missingLinked.anchorworksMissingLinkReview).toEqual({ source: '/assets/missing-fix.png' });
    expect(missingLinked.stroke).toBe('#dc2626');
    expect(cleanImage.anchorworksPreflightIssue).toBeUndefined();
    expect(overlayFiltered.filters).toHaveLength(1);
    expect(overlayFiltered.applyFilters).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixAllImagePreflightObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('fixes all image preflight issues only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardFiltered = makeImageObject([new fabric.filters.Grayscale()], { left: 10, top: 10, width: 20, height: 20, applyFilters: vi.fn() });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const filteredSameBoard = makeImageObject([new fabric.filters.Sepia()], { left: 210, top: 10, width: 20, height: 20, applyFilters: vi.fn() });
    const croppedSameBoard = makeImageObject([], { left: 215, top: 40, width: 40, height: 40, cropX: 3, cropWidth: 30, cropHeight: 40 });
    const highSameBoard = makeImageObject([], { left: 200, top: 50, width: 20, height: 20, naturalWidth: 140, naturalHeight: 140 });
    const missingSameBoard = makeImageObject([], { left: 225, top: 50, width: 20, height: 20, _src: '/assets/missing-fix-active.png', linkMissing: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardFiltered, active, filteredSameBoard, croppedSameBoard, highSameBoard, missingSameBoard],
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(fixAllImagePreflightActiveArtboardObjects()).toBe(4);
      expect(firstBoardFiltered.filters).toHaveLength(1);
      expect(firstBoardFiltered.applyFilters).not.toHaveBeenCalled();
      expect(filteredSameBoard.filters).toEqual([]);
      expect(filteredSameBoard.applyFilters).toHaveBeenCalledOnce();
      expect(croppedSameBoard.cropX).toBe(0);
      expect(croppedSameBoard.cropWidth).toBe(40);
      expect(highSameBoard.anchorworksPreflightIssue).toBe('high-resolution-image');
      expect(missingSameBoard.anchorworksPreflightIssue).toBe('missing-linked-image');
      expect(missingSameBoard.anchorworksMissingLinkReview).toEqual({ source: '/assets/missing-fix-active.png' });
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixAllImagePreflightActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects image handoff categories on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const firstBoardFiltered = makeImageObject([new fabric.filters.Grayscale()], { left: 10, top: 10, width: 20, height: 20 });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const plainImage = makeImageObject([], { left: 210, top: 10, width: 20, height: 20 });
      const filteredImage = makeImageObject([new fabric.filters.Blur({ blur: 0.2 })], { left: 230, top: 10, width: 20, height: 20 });
      const croppedImage = makeImageObject([], { left: 210, top: 40, width: 20, height: 20, cropX: 5 });
      const vector = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [firstBoardFiltered, active, plainImage, filteredImage, croppedImage, vector],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, plainImage, filteredImage, croppedImage };
    };

    try {
      let scenario = installCanvas();
      expect(selectAllImagesActiveArtboardObjects()).toBe(3);
      const selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.plainImage, scenario.filteredImage, scenario.croppedImage]);

      scenario = installCanvas();
      expect(selectFilteredImageActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.filteredImage);

      scenario = installCanvas();
      expect(selectCroppedImageActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.croppedImage);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects linked and resolution image audits on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const firstBoardMissing = makeImageObject([], { left: 10, top: 10, width: 20, height: 20, _src: '/missing-first.png', missing: true });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const embeddedImage = makeImageObject([], { left: 210, top: 10, width: 20, height: 20, _src: 'data:image/png;base64,AAAA' });
      const linkedImage = makeImageObject([], { left: 230, top: 10, width: 20, height: 20, _src: '/assets/photo.png', getElement: () => ({ complete: true, naturalWidth: 60, naturalHeight: 60 }) });
      const missingImage = makeImageObject([], { left: 210, top: 40, width: 20, height: 20, _src: '/assets/missing.png', linkMissing: true });
      const lowImage = makeImageObject([], { left: 230, top: 40, width: 100, height: 100, scaleX: 3, scaleY: 3, naturalWidth: 300, naturalHeight: 300 });
      const highImage = makeImageObject([], { left: 250, top: 40, width: 20, height: 20, naturalWidth: 300, naturalHeight: 300 });
      const transformedImage = makeImageObject([], { left: 245, top: 10, width: 12, height: 12, angle: 12 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [firstBoardMissing, active, embeddedImage, linkedImage, missingImage, lowImage, highImage, transformedImage],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, embeddedImage, linkedImage, missingImage, lowImage, highImage, transformedImage };
    };

    try {
      let scenario = installCanvas();
      expect(selectEmbeddedImageActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.embeddedImage);

      scenario = installCanvas();
      expect(selectLinkedImageActiveArtboardObjects()).toBe(2);
      const selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.linkedImage, scenario.missingImage]);

      scenario = installCanvas();
      expect(selectMissingLinkedImageActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.missingImage);

      scenario = installCanvas();
      expect(selectLowResolutionImageActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.lowImage);

      scenario = installCanvas();
      expect(selectHighResolutionImageActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.highImage);

      scenario = installCanvas();
      expect(selectTransformedImageActiveArtboardObjects()).toBe(2);
      const transformedSelection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(transformedSelection.getObjects()).toEqual([scenario.lowImage, scenario.transformedImage]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

});

describe('text object selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeTypedObject = (type: string, extra: Record<string, unknown> = {}) => {
    const object = new fabric.Rect({ width: 10, height: 10 });
    Object.defineProperty(object, 'type', { value: type, configurable: true });
    return Object.assign(object, extra);
  };

  it('selects point text objects separately from area text', async () => {
    const canvasEngine = await import('../canvasEngine');
    const pointText = makeTypedObject('i-text');
    const legacyText = makeTypedObject('text');
    const areaText = makeTypedObject('textbox');
    const overlayPoint = makeTypedObject('i-text', { excludeFromExport: true });
    const canvas = {
      getObjects: () => [pointText, legacyText, areaText, overlayPoint],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectPointTextObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([pointText, legacyText]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects area text objects separately from point text', async () => {
    const canvasEngine = await import('../canvasEngine');
    const pointText = makeTypedObject('i-text');
    const areaText = makeTypedObject('textbox');
    const canvas = {
      getObjects: () => [pointText, areaText],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAreaTextObjects()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(areaText);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects whitespace-only text objects for cleanup audits', async () => {
    const canvasEngine = await import('../canvasEngine');
    const emptyPointText = makeTypedObject('i-text', { text: '  \n\t ' });
    const emptyAreaText = makeTypedObject('textbox', { text: '' });
    const filledText = makeTypedObject('text', { text: 'Label' });
    const vectorWithText = makeTypedObject('rect', { text: '' });
    const overlayEmpty = makeTypedObject('i-text', { text: '', excludeFromExport: true });
    const canvas = {
      getObjects: () => [emptyPointText, emptyAreaText, filledText, vectorWithText, overlayEmpty],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectEmptyTextObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([emptyPointText, emptyAreaText]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('removes whitespace-only text objects for cleanup handoff', async () => {
    const canvasEngine = await import('../canvasEngine');
    const emptyPointText = makeTypedObject('i-text', { text: '  \n\t ' });
    const emptyAreaText = makeTypedObject('textbox', { text: '' });
    const filledText = makeTypedObject('text', { text: 'Label' });
    const vectorWithText = makeTypedObject('rect', { text: '' });
    const overlayEmpty = makeTypedObject('i-text', { text: '', excludeFromExport: true });
    const objects = [emptyPointText, emptyAreaText, filledText, vectorWithText, overlayEmpty] as fabric.FabricObject[];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixEmptyTextObjects()).toBe(2);
    expect(objects).toEqual([filledText, vectorWithText, overlayEmpty]);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.remove).toHaveBeenCalledTimes(2);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixEmptyTextObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes whitespace-only text objects only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstEmpty = makeTypedObject('i-text', { left: 10, top: 10, width: 20, height: 20, text: '' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameEmpty = makeTypedObject('textbox', { left: 190, top: 10, width: 20, height: 20, text: ' \n ' });
    const sameFilled = makeTypedObject('text', { left: 220, top: 10, width: 20, height: 20, text: 'Label' });
    const objects = [firstEmpty, active, sameEmpty, sameFilled] as fabric.FabricObject[];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixEmptyTextActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([firstEmpty, active, sameFilled]);
      expect(canvas.remove).toHaveBeenCalledWith(sameEmpty);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixEmptyTextActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects overflowing area text objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const measuredOverflow = makeTypedObject('textbox', { height: 40, calcTextHeight: () => 72 });
    const flaggedOverflow = makeTypedObject('textbox', { height: 120, overflow: true });
    const fittingAreaText = makeTypedObject('textbox', { height: 80, calcTextHeight: () => 60 });
    const pointTextOverflowFlag = makeTypedObject('i-text', { height: 12, overflow: true });
    const overlayOverflow = makeTypedObject('textbox', { height: 20, calcTextHeight: () => 80, excludeFromExport: true });
    const canvas = {
      getObjects: () => [measuredOverflow, flaggedOverflow, fittingAreaText, pointTextOverflowFlag, overlayOverflow],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOverflowingTextObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([measuredOverflow, flaggedOverflow]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text subtypes on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const firstBoardText = makeTypedObject('i-text', { left: 10, top: 10, width: 20, height: 20, text: 'A' });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const pointText = makeTypedObject('i-text', { left: 210, top: 10, width: 20, height: 20, text: 'Label' });
      const legacyText = makeTypedObject('text', { left: 230, top: 10, width: 20, height: 20, text: 'Legacy' });
      const areaText = makeTypedObject('textbox', { left: 210, top: 40, width: 30, height: 20, text: 'Body' });
      const sameBoardVector = new fabric.Rect({ left: 250, top: 10, width: 8, height: 20, strokeWidth: 0 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [firstBoardText, active, pointText, legacyText, areaText, sameBoardVector],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, pointText, legacyText, areaText };
    };

    try {
      let scenario = installCanvas();
      expect(selectAllTextActiveArtboardObjects()).toBe(3);
      let selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.pointText, scenario.legacyText, scenario.areaText]);

      scenario = installCanvas();
      expect(selectPointTextActiveArtboardObjects()).toBe(2);
      selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.pointText, scenario.legacyText]);

      scenario = installCanvas();
      expect(selectAreaTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.areaText);
      expect(scenario.canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects overflowing and empty text on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardOverflow = makeTypedObject('textbox', { left: 10, top: 10, width: 20, height: 20, calcTextHeight: () => 60 });
    const firstBoardEmpty = makeTypedObject('i-text', { left: 40, top: 10, width: 20, height: 20, text: '' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overflowSameBoard = makeTypedObject('textbox', { left: 210, top: 10, width: 20, height: 20, calcTextHeight: () => 60 });
    const flaggedOverflowSameBoard = makeTypedObject('textbox', { left: 230, top: 10, width: 20, height: 20, overflow: true });
    const emptySameBoard = makeTypedObject('i-text', { left: 210, top: 40, width: 20, height: 20, text: '   ' });
    const filledSameBoard = makeTypedObject('text', { left: 240, top: 40, width: 20, height: 20, text: 'Copy' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [firstBoardOverflow, firstBoardEmpty, active, overflowSameBoard, flaggedOverflowSameBoard, emptySameBoard, filledSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectOverflowingTextActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([overflowSameBoard, flaggedOverflowSameBoard]);
      canvas.discardActiveObject.mockClear();
      canvas.setActiveObject.mockClear();
      canvas.requestRenderAll.mockClear();

      expect(selectEmptyTextActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenLastCalledWith(emptySameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not alter selection when no matching text subtype exists', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectPointTextObjects()).toBe(0);
    expect(selectAreaTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no overflowing text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('textbox', { height: 120, calcTextHeight: () => 80 }), makeTypedObject('i-text', { height: 12, textOverflow: true })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOverflowingTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no empty text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { text: 'Headline' }), makeTypedObject('textbox', { text: 'Body copy' }), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectEmptyTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('selects advanced text cleanup audits on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const firstBoardMissing = makeTypedObject('i-text', { left: 10, top: 10, width: 20, height: 20, fontFamily: 'Poster Gothic' });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const textOnPath = makeTypedObject('group', { left: 210, top: 10, width: 20, height: 20, __textOnPath: { kind: 'path', sourceText: 'Route' } });
      const missingFont = makeTypedObject('i-text', { left: 230, top: 10, width: 20, height: 20, fontFamily: 'Poster Gothic' });
      const customSpacing = makeTypedObject('textbox', { left: 210, top: 40, width: 20, height: 20, charSpacing: 120, lineHeight: 1.16 });
      const decorated = makeTypedObject('text', { left: 230, top: 40, width: 20, height: 20, underline: true });
      const normalText = makeTypedObject('i-text', { left: 250, top: 10, width: 8, height: 20, fontFamily: 'Inter', charSpacing: 0, lineHeight: 1.16 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [firstBoardMissing, active, textOnPath, missingFont, customSpacing, decorated, normalText],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, textOnPath, missingFont, customSpacing, decorated };
    };

    try {
      let scenario = installCanvas();
      expect(selectTextOnPathActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.textOnPath);

      scenario = installCanvas();
      expect(selectMissingFontTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.missingFont);

      scenario = installCanvas();
      expect(selectCustomTextSpacingActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.customSpacing);

      scenario = installCanvas();
      expect(selectDecoratedTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.decorated);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects advanced text appearance audits on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const firstBoardStyled = makeTypedObject('i-text', { left: 10, top: 10, width: 20, height: 20, fontStyle: 'italic' });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const nonLeftAligned = makeTypedObject('textbox', { left: 210, top: 10, width: 20, height: 20, textAlign: 'center' });
      const styled = makeTypedObject('i-text', { left: 230, top: 10, width: 20, height: 20, fontWeight: 'bold' });
      const transformed = makeTypedObject('text', { left: 210, top: 40, width: 20, height: 20, angle: 12 });
      const mixedStyle = makeTypedObject('textbox', { left: 230, top: 40, width: 20, height: 20, styles: { 0: { 1: { fontWeight: 'bold' } } } });
      const normalText = makeTypedObject('i-text', { left: 250, top: 10, width: 8, height: 20, textAlign: 'left', fontWeight: 'normal', angle: 0 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [firstBoardStyled, active, nonLeftAligned, styled, transformed, mixedStyle, normalText],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, nonLeftAligned, styled, transformed, mixedStyle };
    };

    try {
      let scenario = installCanvas();
      expect(selectNonLeftAlignedTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.nonLeftAligned);

      scenario = installCanvas();
      expect(selectStyledTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.styled);

      scenario = installCanvas();
      expect(selectTransformedTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.transformed);

      scenario = installCanvas();
      expect(selectMixedStyleTextActiveArtboardObjects()).toBe(1);
      expect(scenario.canvas.setActiveObject).toHaveBeenLastCalledWith(scenario.mixedStyle);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects generated text-on-path and text-on-arc groups', async () => {
    const canvasEngine = await import('../canvasEngine');
    const pathText = makeTypedObject('group', { __textOnPath: { kind: 'path', sourceText: 'Route' } });
    const arcText = makeTypedObject('group', { __textOnPath: { kind: 'arc', sourceText: 'Badge' } });
    const plainGroup = makeTypedObject('group');
    const overlayPathText = makeTypedObject('group', { __textOnPath: { kind: 'path', sourceText: 'Overlay' }, excludeFromExport: true });
    const canvas = {
      getObjects: () => [pathText, arcText, plainGroup, overlayPathText],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTextOnPathObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([pathText, arcText]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text objects using missing or unregistered fonts', async () => {
    const canvasEngine = await import('../canvasEngine');
    const missingFlagged = makeTypedObject('i-text', { fontFamily: 'Inter, sans-serif', missingFont: true });
    const unregisteredFamily = makeTypedObject('textbox', { fontFamily: 'Poster Gothic, sans-serif' });
    const registeredFamily = makeTypedObject('text', { fontFamily: 'Inter, system-ui, sans-serif' });
    const vectorWithFont = makeTypedObject('rect', { fontFamily: 'Poster Gothic' });
    const overlayMissing = makeTypedObject('i-text', { fontFamily: 'Unavailable', fontMissing: true, excludeFromExport: true });
    const canvas = {
      getObjects: () => [missingFlagged, unregisteredFamily, registeredFamily, vectorWithFont, overlayMissing],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectMissingFontTextObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([missingFlagged, unregisteredFamily]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text objects with custom tracking or leading', async () => {
    const canvasEngine = await import('../canvasEngine');
    const customTracking = makeTypedObject('i-text', { charSpacing: 120, lineHeight: 1.16 });
    const customLeading = makeTypedObject('textbox', { charSpacing: 0, lineHeight: 1.5 });
    const defaultSpacing = makeTypedObject('text', { charSpacing: 0, lineHeight: 1.16 });
    const vectorWithSpacing = makeTypedObject('rect', { charSpacing: 180, lineHeight: 2 });
    const overlayCustomSpacing = makeTypedObject('i-text', { charSpacing: 80, excludeFromExport: true });
    const canvas = {
      getObjects: () => [customTracking, customLeading, defaultSpacing, vectorWithSpacing, overlayCustomSpacing],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCustomTextSpacingObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([customTracking, customLeading]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text objects with underline, strikethrough, or overline decoration', async () => {
    const canvasEngine = await import('../canvasEngine');
    const underlined = makeTypedObject('i-text', { underline: true });
    const struck = makeTypedObject('textbox', { linethrough: true });
    const overlined = makeTypedObject('text', { overline: true });
    const plainText = makeTypedObject('i-text', { underline: false, linethrough: false });
    const vectorDecorated = makeTypedObject('rect', { underline: true });
    const overlayDecorated = makeTypedObject('i-text', { underline: true, excludeFromExport: true });
    const canvas = {
      getObjects: () => [underlined, struck, overlined, plainText, vectorDecorated, overlayDecorated],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectDecoratedTextObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([underlined, struck, overlined]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text objects with non-left paragraph alignment', async () => {
    const canvasEngine = await import('../canvasEngine');
    const centered = makeTypedObject('i-text', { textAlign: 'center' });
    const rightAligned = makeTypedObject('textbox', { textAlign: 'right' });
    const justified = makeTypedObject('text', { textAlign: 'justify' });
    const leftAligned = makeTypedObject('i-text', { textAlign: 'left' });
    const defaultAligned = makeTypedObject('textbox');
    const vectorAligned = makeTypedObject('rect', { textAlign: 'center' });
    const overlayCentered = makeTypedObject('i-text', { textAlign: 'center', excludeFromExport: true });
    const canvas = {
      getObjects: () => [centered, rightAligned, justified, leftAligned, defaultAligned, vectorAligned, overlayCentered],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNonLeftAlignedTextObjects()).toBe(3);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([centered, rightAligned, justified]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text objects with styled font appearance', async () => {
    const canvasEngine = await import('../canvasEngine');
    const bold = makeTypedObject('i-text', { fontWeight: 'bold' });
    const heavy = makeTypedObject('textbox', { fontWeight: 700 });
    const numericBold = makeTypedObject('text', { fontWeight: '600' });
    const italic = makeTypedObject('i-text', { fontStyle: 'italic' });
    const oblique = makeTypedObject('textbox', { fontStyle: 'oblique' });
    const regular = makeTypedObject('i-text', { fontWeight: 'normal', fontStyle: 'normal' });
    const numericRegular = makeTypedObject('text', { fontWeight: 400 });
    const vectorStyled = makeTypedObject('rect', { fontWeight: 'bold', fontStyle: 'italic' });
    const overlayStyled = makeTypedObject('i-text', { fontStyle: 'italic', excludeFromExport: true });
    const canvas = {
      getObjects: () => [bold, heavy, numericBold, italic, oblique, regular, numericRegular, vectorStyled, overlayStyled],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectStyledTextObjects()).toBe(5);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([bold, heavy, numericBold, italic, oblique]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects transformed text objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    const scaledX = makeTypedObject('i-text', { scaleX: 1.2 });
    const scaledY = makeTypedObject('textbox', { scaleY: 0.75 });
    const rotated = makeTypedObject('text', { angle: 15 });
    const skewedX = makeTypedObject('i-text', { skewX: 8 });
    const skewedY = makeTypedObject('textbox', { skewY: -5 });
    const normalText = makeTypedObject('i-text', { scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 });
    const vectorTransformed = makeTypedObject('rect', { scaleX: 2, angle: 30 });
    const overlayTransformed = makeTypedObject('i-text', { angle: 12, excludeFromExport: true });
    const canvas = {
      getObjects: () => [scaledX, scaledY, rotated, skewedX, skewedY, normalText, vectorTransformed, overlayTransformed],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransformedTextObjects()).toBe(5);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([scaledX, scaledY, rotated, skewedX, skewedY]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects text objects with mixed inline character styles', async () => {
    const canvasEngine = await import('../canvasEngine');
    const boldChar = makeTypedObject('i-text', { styles: { 0: { 1: { fontWeight: 'bold' } } } });
    const fillChar = makeTypedObject('textbox', { styles: { 1: { 0: { fill: '#ff0000' } } } });
    const emptyLineStyles = makeTypedObject('text', { styles: { 0: {} } });
    const noStyles = makeTypedObject('i-text');
    const vectorStyled = makeTypedObject('rect', { styles: { 0: { 0: { fontStyle: 'italic' } } } });
    const overlayStyled = makeTypedObject('i-text', { styles: { 0: { 0: { underline: true } } }, excludeFromExport: true });
    const canvas = {
      getObjects: () => [boldChar, fillChar, emptyLineStyles, noStyles, vectorStyled, overlayStyled],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectMixedStyleTextObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([boldChar, fillChar]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no text-on-path objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('group'), makeTypedObject('i-text', { text: 'Plain' })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTextOnPathObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no non-left aligned text exists', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { textAlign: 'left' }), makeTypedObject('textbox'), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectNonLeftAlignedTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no styled text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { fontWeight: 'normal', fontStyle: 'normal' }), makeTypedObject('textbox', { fontWeight: 400 }), makeTypedObject('text', { fontWeight: 'regular' }), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectStyledTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no transformed text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0 }), makeTypedObject('textbox'), makeTypedObject('rect', { scaleX: 2, angle: 45 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectTransformedTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no mixed style text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { styles: { 0: {} } }), makeTypedObject('textbox'), makeTypedObject('rect', { styles: { 0: { 0: { fill: '#f00' } } } })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectMixedStyleTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no decorated text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { underline: false, linethrough: false, overline: false }), makeTypedObject('textbox', {}), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectDecoratedTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no custom text spacing exists', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { charSpacing: 0, lineHeight: 1.16 }), makeTypedObject('textbox', {}), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCustomTextSpacingObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('does not alter selection when no missing font text objects exist', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [makeTypedObject('i-text', { fontFamily: 'Inter, sans-serif' }), makeTypedObject('textbox', { fontFamily: 'Roboto, sans-serif' }), new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectMissingFontTextObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});

describe('active artboard visibility selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects visible unlocked artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const visibleFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const visibleSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const hiddenSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const lockedSameBoard = new fabric.Rect({ left: 250, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true });
    const overlayVisible = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [visibleFirstBoard, active, visibleSameBoard, hiddenSameBoard, lockedSameBoard, overlayVisible],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectVisibleActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, visibleSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects unlocked artwork on the active object artboard including hidden artwork', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const unlockedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const visibleSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const hiddenSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const lockedSameBoard = new fabric.Rect({ left: 250, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementY: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [unlockedFirstBoard, active, visibleSameBoard, hiddenSameBoard, lockedSameBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectUnlockedActiveArtboardObjects()).toBe(3);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, visibleSameBoard, hiddenSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });
});

describe('hidden object selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeVisibleObject = (visible: boolean) => ({
    visible,
    set: vi.fn(function set(this: Record<string, unknown>, props: Record<string, unknown>) {
      Object.assign(this, props);
    }),
  });

  it('selects hidden exportable artwork without requiring visibility', async () => {
    const canvasEngine = await import('../canvasEngine');
    const visible = new fabric.Rect({ width: 10, height: 10 });
    const hidden = new fabric.Rect({ width: 10, height: 10, visible: false });
    const hiddenLocked = new fabric.Rect({ width: 10, height: 10, visible: false, lockMovementX: true });
    const overlayHidden = new fabric.Rect({ width: 10, height: 10, visible: false, excludeFromExport: true });
    const unselectableHidden = new fabric.Rect({ width: 10, height: 10, visible: false, selectable: false });
    const canvas = {
      getObjects: () => [visible, hidden, hiddenLocked, overlayHidden, unselectableHidden],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectHiddenObjects()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([hidden, hiddenLocked]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects hidden artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const hiddenFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const hiddenSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const visibleSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayHidden = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, visible: false, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [hiddenFirstBoard, active, hiddenSameBoard, visibleSameBoard, overlayHidden],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectHiddenActiveArtboardObjects()).toBe(1);
      expect(canvas.setActiveObject).toHaveBeenCalledWith(hiddenSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });


  it('removes hidden exportable artwork after cleanup review', async () => {
    const canvasEngine = await import('../canvasEngine');
    const visible = new fabric.Rect({ width: 10, height: 10 });
    const hidden = new fabric.Rect({ width: 10, height: 10, visible: false });
    const hiddenLocked = new fabric.Rect({ width: 10, height: 10, visible: false, lockMovementX: true });
    const overlayHidden = new fabric.Rect({ width: 10, height: 10, visible: false, excludeFromExport: true });
    const unselectableHidden = new fabric.Rect({ width: 10, height: 10, visible: false, selectable: false });
    const objects: fabric.FabricObject[] = [visible, hidden, hiddenLocked, overlayHidden, unselectableHidden];
    const canvas = {
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(fixHiddenObjects()).toBe(2);
    expect(objects).toEqual([visible, overlayHidden, unselectableHidden]);
    expect(canvas.remove).toHaveBeenCalledWith(hidden);
    expect(canvas.remove).toHaveBeenCalledWith(hiddenLocked);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(fixHiddenObjects()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes hidden artwork only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const hiddenFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const hiddenSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, visible: false });
    const visibleSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayHidden = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, visible: false, excludeFromExport: true });
    const objects: fabric.FabricObject[] = [hiddenFirstBoard, active, hiddenSameBoard, visibleSameBoard, overlayHidden];
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => objects,
      getActiveObjects: () => [],
      discardActiveObject: vi.fn(),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(fixHiddenActiveArtboardObjects()).toBe(1);
      expect(objects).toEqual([hiddenFirstBoard, active, visibleSameBoard, overlayHidden]);
      expect(canvas.remove).toHaveBeenCalledWith(hiddenSameBoard);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      expect(fixHiddenActiveArtboardObjects()).toBe(0);
      expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('reveals only hidden objects in the active selection', async () => {
    const canvasEngine = await import('../canvasEngine');
    const hidden = makeVisibleObject(false);
    const visible = makeVisibleObject(true);
    const otherHidden = makeVisibleObject(false);
    const canvas = {
      getActiveObjects: () => [hidden, visible],
      getObjects: () => [hidden, visible, otherHidden],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(showSelection()).toBe(1);
    expect(hidden).toMatchObject({ visible: true });
    expect(visible.set).not.toHaveBeenCalled();
    expect(otherHidden).toMatchObject({ visible: false });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not push history when selected objects are already visible', async () => {
    const canvasEngine = await import('../canvasEngine');
    const visible = makeVisibleObject(true);
    const canvas = {
      getActiveObjects: () => [visible],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(showSelection()).toBe(0);
    expect(visible.set).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});

describe('locked object selection operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects only locked exportable artwork', async () => {
    const canvasEngine = await import('../canvasEngine');
    const unlocked = new fabric.Rect({ width: 10, height: 10 });
    const lockedMove = new fabric.Rect({ width: 10, height: 10, lockMovementX: true });
    const lockedScale = new fabric.Rect({ width: 10, height: 10, lockScalingY: true });
    const hiddenLocked = new fabric.Rect({ width: 10, height: 10, visible: false, lockRotation: true });
    const overlayLocked = new fabric.Rect({ width: 10, height: 10, lockMovementY: true, excludeFromExport: true });
    const unselectableLocked = new fabric.Rect({ width: 10, height: 10, selectable: false, lockMovementX: true });
    const canvas = {
      getObjects: () => [unlocked, lockedMove, lockedScale, hiddenLocked, overlayLocked, unselectableLocked],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectLockedObjects()).toBe(3);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([lockedMove, lockedScale, hiddenLocked]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects locked artwork on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const lockedFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, lockMovementX: true });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const lockedSameBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeWidth: 0, lockScalingY: true });
    const lockedOverflowSameBoard = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0, lockRotation: true });
    const unlockedSameBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayLocked = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0, lockMovementX: true, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [lockedFirstBoard, active, lockedSameBoard, lockedOverflowSameBoard, unlockedSameBoard, overlayLocked],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectLockedActiveArtboardObjects()).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([lockedSameBoard, lockedOverflowSameBoard]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('does not change selection when no locked artwork exists', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = {
      getObjects: () => [{ selectable: true }, { selectable: true, excludeFromExport: true, lockMovementX: true }],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectLockedObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});

describe('guide release operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useEditor.setState({ userGuides: [], artboards: [] });
  });

  it('maps ruler guides to editable line coordinates', () => {
    const bounds = { left: 10, top: 20, right: 210, bottom: 120 };

    expect(releasedGuideLineCoords({ axis: 'v', pos: 42 }, bounds)).toEqual([42, 20, 42, 120]);
    expect(releasedGuideLineCoords({ axis: 'h', pos: 64 }, bounds)).toEqual([10, 64, 210, 64]);
  });

  it('releases persistent guides as editable selected line objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    useEditor.setState({
      userGuides: [
        { id: 'v1', axis: 'v', pos: 40 },
        { id: 'h1', axis: 'h', pos: 60 },
      ],
      artboards: [{ id: 'a1', name: 'A1', x: 10, y: 20, width: 200, height: 100 }],
    });
    const added: fabric.FabricObject[] = [];
    const canvas = {
      add: vi.fn((...objects: fabric.FabricObject[]) => { added.push(...objects); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      getWidth: () => 500,
      getHeight: () => 400,
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(releaseGuides()).toBe(2);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ name: 'Released Guide', selectable: true, evented: true, excludeFromExport: false });
    expect(added[0]).toMatchObject({ x1: 40, y1: 20, x2: 40, y2: 120 });
    expect(added[1]).toMatchObject({ x1: 10, y1: 60, x2: 210, y2: 60 });
    expect(useEditor.getState().userGuides).toEqual([]);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does nothing when there are no guides', async () => {
    const canvasEngine = await import('../canvasEngine');
    const canvas = { add: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(releaseGuides()).toBe(0);
    expect(canvas.add).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});

describe('selection operation signatures', () => {
  it('normalizes drop shadow signatures for Select Same Shadow', () => {
    expect(shadowSignature({ color: ' RGBA(0, 0, 0, 0.35) ', blur: 8, offsetX: 2, offsetY: -3 })).toBe('rgba(0, 0, 0, 0.35)|8.000|2.000|-3.000');
    expect(shadowSignature({ color: '', blur: 8 })).toBeNull();
    expect(shadowSignature(null)).toBeNull();
  });

  it('normalizes pattern fill signatures for Select Same Pattern Fill', () => {
    expect(patternSignature({ kind: ' Stripe ', size: 12, color1: ' #FFFFFF ', color2: '#000000' })).toBe('stripe|12.000|#ffffff|#000000');
    expect(patternSignature({ kind: 'dots', color1: '#fff', color2: '#000' })).toBeNull();
    expect(patternSignature(undefined)).toBeNull();
  });

  it('normalizes gradient fill signatures for Select Same Gradient Fill', () => {
    const gradient = {
      type: 'Linear',
      coords: { x1: 0, y1: 0, x2: 100, y2: 0 },
      colorStops: [
        { offset: 0, color: ' #112233 ' },
        { offset: 1, color: '#FFFFFF' },
      ],
    };

    expect(gradientSignature(gradient)).toBe('linear|0.000,0.000,100.000,0.000,0.000,0.000|0.000:#112233,1.000:#ffffff');
    expect(selectSameSignature({ fill: gradient }, 'gradientFill')).toBe(gradientSignature(gradient));
    expect(gradientSignature({ type: 'linear', colorStops: [{ offset: 0, color: '#000' }] })).toBeNull();
    expect(gradientSignature('#112233')).toBeNull();
  });

  it('normalizes overprint signatures for Select Same Overprint', () => {
    expect(overprintSignature({ fillOverprint: true })).toBe('fill:true|stroke:false');
    expect(overprintSignature({ overprintStroke: true })).toBe('fill:false|stroke:true');
    expect(overprintSignature({ overprint: true })).toBe('fill:true|stroke:true');
    expect(overprintSignature({ fillOverprint: false, strokeOverprint: false })).toBeNull();
    expect(selectSameSignature({ overprintFill: true }, 'overprint')).toBe('fill:true|stroke:false');
  });

  it('normalizes print mark type signatures for Select Same Print Mark Type', () => {
    expect(selectSameSignature({ printMarkKind: ' Registration ' }, 'printMarkKind')).toBe('registration');
    expect(selectSameSignature({ printMarkKind: 'page-info' }, 'printMarkKind')).toBe('page-info');
    expect(selectSameSignature({ printMarkKind: '' }, 'printMarkKind')).toBeNull();
  });

  it('classifies object artboard placement signatures', () => {
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    try {
      expect(artboardPlacementSignature(new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 }) as never)).toBe('inside-artboard');
      expect(artboardPlacementSignature(new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 }) as never)).toBe('overflowing-artboard');
      expect(artboardPlacementSignature(new fabric.Rect({ left: 130, top: 10, width: 20, height: 20, strokeWidth: 0 }) as never)).toBe('outside-artboard');
      expect(selectSameSignature(new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 }) as never, 'artboardPlacement')).toBe('inside-artboard');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('classifies object placement across any artboard', () => {
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    try {
      expect(artboardAnyPlacementSignature(new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 }) as never)).toBe('inside-any-artboard');
      expect(artboardAnyPlacementSignature(new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 }) as never)).toBe('overflowing-any-artboard');
      expect(artboardAnyPlacementSignature(new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 }) as never)).toBe('outside-any-artboard');
      expect(selectSameSignature(new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 }) as never, 'artboardAnyPlacement')).toBe('inside-any-artboard');
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });


  it('builds combined fill-and-stroke signatures for Select Same Fill & Stroke', () => {
    const object = { fill: ' #AABBCC ', stroke: '#112233' };

    expect(fillStrokeSignature(object)).toBe('fill:#aabbcc|stroke:#112233');
    expect(fillStrokeSignature({ fill: '', stroke: '' })).toBeNull();
    expect(selectSameSignature(object, 'fillStroke')).toBe('fill:#aabbcc|stroke:#112233');
  });

  it('builds fill appearance signatures from solid, pattern, opacity, and blend mode', () => {
    const object = { fill: ' #AABBCC ', patternSpec: { kind: 'dots', size: 8, color1: '#fff', color2: '#000' }, opacity: 0.5, globalCompositeOperation: 'Multiply' };

    expect(fillAppearanceSignature(object)).toBe('fill:#aabbcc|gradient:|pattern:dots|8.000|#fff|#000|opacity:0.500|blend:multiply');
    expect(fillAppearanceSignature({ fill: '', opacity: 1 })).toBeNull();
    expect(selectSameSignature(object, 'fillAppearance')).toBe(fillAppearanceSignature(object));
  });

  it('builds stroke appearance signatures from color, weight, dash, cap, and join', () => {
    const object = { stroke: ' #112233 ', strokeWidth: 2, strokeDashArray: [4, '2'], strokeLineCap: 'Round', strokeLineJoin: 'Bevel' };

    expect(strokeAppearanceSignature(object)).toBe('stroke:#112233|strokeWidth:2.000|dash:4.000,2.000|cap:round|join:bevel');
    expect(strokeAppearanceSignature({ stroke: '' })).toBeNull();
    expect(selectSameSignature(object, 'strokeAppearance')).toBe(strokeAppearanceSignature(object));
  });

  it('builds text appearance signatures from family, size, style, tracking, and leading', () => {
    const object = { type: 'i-text', fontFamily: ' Inter ', fontSize: 24, fontWeight: '700', fontStyle: 'Italic', charSpacing: 40, lineHeight: 1.2 };

    expect(textAppearanceSignature(object)).toBe('family:inter|size:24.000|weight:700|style:italic|tracking:40.000|leading:1.200');
    expect(textAppearanceSignature({ type: 'rect', fontFamily: 'Inter', fontSize: 24 })).toBeNull();
    expect(selectSameSignature(object, 'textAppearance')).toBe(textAppearanceSignature(object));
  });

  it('builds object position signatures from left and top coordinates', () => {
    const object = { left: 12.25, top: -3 };

    expect(objectPositionSignature(object)).toBe('left:12.250|top:-3.000');
    expect(objectPositionSignature({})).toBe('left:0.000|top:0.000');
    expect(selectSameSignature(object, 'objectPosition')).toBe(objectPositionSignature(object));
  });

  it('builds object X/Y signatures from individual coordinates', () => {
    const object = { left: 12.25, top: -3 };

    expect(objectXSignature(object)).toBe('left:12.250');
    expect(objectYSignature(object)).toBe('top:-3.000');
    expect(selectSameSignature(object, 'objectX')).toBe(objectXSignature(object));
    expect(selectSameSignature(object, 'objectY')).toBe(objectYSignature(object));
  });

  it('builds object right, bottom, and bounds signatures from scaled dimensions', () => {
    const object = { left: 10, top: 5, width: 100, height: 50, scaleX: 1.5, scaleY: 2 };

    expect(objectRightSignature(object)).toBe('right:160.000');
    expect(objectBottomSignature(object)).toBe('bottom:105.000');
    expect(objectBoundsSignature(object)).toBe('left:10.000|top:5.000|right:160.000|bottom:105.000');
    expect(objectRightSignature({ left: 10, width: 0, height: 50 })).toBeNull();
    expect(objectBottomSignature({ top: 5, width: 100, height: 0 })).toBeNull();
    expect(selectSameSignature(object, 'objectRight')).toBe(objectRightSignature(object));
    expect(selectSameSignature(object, 'objectBottom')).toBe(objectBottomSignature(object));
    expect(selectSameSignature(object, 'objectBounds')).toBe(objectBoundsSignature(object));
  });

  it('builds object center signatures from position and scaled dimensions', () => {
    const object = { left: 10, top: 5, width: 100, height: 50, scaleX: 1.5, scaleY: 2 };

    expect(objectCenterSignature(object)).toBe('centerX:85.000|centerY:55.000');
    expect(objectCenterXSignature(object)).toBe('centerX:85.000');
    expect(objectCenterYSignature(object)).toBe('centerY:55.000');
    expect(selectSameSignature(object, 'objectCenter')).toBe(objectCenterSignature(object));
    expect(selectSameSignature(object, 'objectCenterX')).toBe(objectCenterXSignature(object));
    expect(selectSameSignature(object, 'objectCenterY')).toBe(objectCenterYSignature(object));
  });

  it('builds object size signatures from scaled dimensions', () => {
    const object = { width: 100, height: 50, scaleX: 1.5, scaleY: 2 };

    expect(objectSizeSignature(object)).toBe('width:150.000|height:100.000');
    expect(objectWidthSignature(object)).toBe('width:150.000');
    expect(objectHeightSignature(object)).toBe('height:100.000');
    expect(objectAreaSignature(object)).toBe('area:15000.000');
    expect(objectAspectRatioSignature(object)).toBe('aspect:1.500');
    expect(objectSizeSignature({ width: 0, height: 50 })).toBeNull();
    expect(objectWidthSignature({ width: 0, height: 50 })).toBeNull();
    expect(objectHeightSignature({ width: 100, height: 0 })).toBeNull();
    expect(objectAreaSignature({ width: 0, height: 50 })).toBeNull();
    expect(objectAspectRatioSignature({ width: 100, height: 0 })).toBeNull();
    expect(selectSameSignature(object, 'objectSize')).toBe(objectSizeSignature(object));
    expect(selectSameSignature(object, 'objectWidth')).toBe(objectWidthSignature(object));
    expect(selectSameSignature(object, 'objectHeight')).toBe(objectHeightSignature(object));
    expect(selectSameSignature(object, 'objectArea')).toBe(objectAreaSignature(object));
    expect(selectSameSignature(object, 'objectAspectRatio')).toBe(objectAspectRatioSignature(object));
  });

  it('builds object scale signatures from transform scales', () => {
    const object = { scaleX: 1.25, scaleY: -0.5 };

    expect(objectScaleSignature(object)).toBe('scaleX:1.250|scaleY:-0.500');
    expect(objectScaleSignature({})).toBe('scaleX:1.000|scaleY:1.000');
    expect(selectSameSignature(object, 'objectScale')).toBe(objectScaleSignature(object));
  });

  it('builds object skew signatures from transform skew values', () => {
    const object = { skewX: 12.5, skewY: -3 };

    expect(objectSkewSignature(object)).toBe('skewX:12.500|skewY:-3.000');
    expect(objectSkewSignature({})).toBe('skewX:0.000|skewY:0.000');
    expect(selectSameSignature(object, 'objectSkew')).toBe(objectSkewSignature(object));
  });

  it('builds normalized object rotation signatures', () => {
    expect(objectRotationSignature({ angle: -45 })).toBe('angle:315.000');
    expect(objectRotationSignature({ angle: 405 })).toBe('angle:45.000');
    expect(objectRotationSignature({})).toBe('angle:0.000');
    expect(selectSameSignature({ angle: 405 }, 'objectRotation')).toBe('angle:45.000');
  });

  it('builds combined object transform signatures from scale, skew, and rotation', () => {
    const object = { scaleX: 1.25, scaleY: -0.5, skewX: 12.5, skewY: -3, angle: -45 };

    expect(objectTransformSignature(object)).toBe('scaleX:1.250|scaleY:-0.500|skewX:12.500|skewY:-3.000|angle:315.000');
    expect(selectSameSignature(object, 'objectTransform')).toBe(objectTransformSignature(object));
  });

  it('selects same geometry only on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);

    const installCanvas = () => {
      const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
      const sameBoardPosition = new fabric.Circle({ left: 170, top: 10, radius: 8, strokeWidth: 0 });
      const sameBoardWidth = new fabric.Rect({ left: 210, top: 10, width: 20, height: 30, strokeWidth: 0 });
      const differentSameBoard = new fabric.Rect({ left: 230, top: 10, width: 12, height: 20, strokeWidth: 0 });
      const canvas = {
        getActiveObject: () => active,
        getObjects: () => [sameFirstBoard, active, sameBoardPosition, sameBoardWidth, differentSameBoard],
        discardActiveObject: vi.fn(),
        setActiveObject: vi.fn(),
        requestRenderAll: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
        fire: vi.fn(),
      };
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
      return { canvas, active, sameBoardPosition, sameBoardWidth };
    };

    try {
      let scenario = installCanvas();
      expect(selectSameActiveArtboard('objectPosition')).toBe(2);
      let selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.active, scenario.sameBoardPosition]);

      scenario = installCanvas();
      expect(selectSameActiveArtboard('objectWidth')).toBe(2);
      selection = scenario.canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([scenario.active, scenario.sameBoardWidth]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same transform only on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0, scaleX: 1.5, scaleY: 1.2, angle: 15, skewX: 4 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0, scaleX: 1.5, scaleY: 1.2, angle: 15, skewX: 4 });
    const sameBoardTransform = new fabric.Circle({ left: 210, top: 10, radius: 8, strokeWidth: 0, scaleX: 1.5, scaleY: 1.2, angle: 15, skewX: 4 });
    const sameScaleOnly = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeWidth: 0, scaleX: 1.5, scaleY: 1.2, angle: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameBoardTransform, sameScaleOnly],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('objectTransform')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoardTransform]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same appearance only on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, fill: '#ff0000', stroke: '#111111', strokeWidth: 2, opacity: 0.75 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, fill: '#ff0000', stroke: '#111111', strokeWidth: 2, opacity: 0.75 });
    const sameBoardMatch = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, fill: '#ff0000', stroke: '#111111', strokeWidth: 2, opacity: 0.75 });
    const sameBoardDifferentFill = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, fill: '#00ff00', stroke: '#111111', strokeWidth: 2, opacity: 0.75 });
    const overlayMatch = new fabric.Rect({ left: 240, top: 40, width: 20, height: 20, fill: '#ff0000', stroke: '#111111', strokeWidth: 2, opacity: 0.75, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameBoardMatch, sameBoardDifferentFill, overlayMatch],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('appearance')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoardMatch]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same fill and stroke only on the active object artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, fill: '#222222', stroke: '#ffffff', strokeWidth: 1 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, fill: '#222222', stroke: '#ffffff', strokeWidth: 1 });
    const sameBoardFillStroke = new fabric.Circle({ left: 210, top: 10, radius: 10, fill: '#222222', stroke: '#ffffff', strokeWidth: 3 });
    const sameBoardFillOnly = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, fill: '#222222', stroke: '#000000', strokeWidth: 1 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameBoardFillStroke, sameBoardFillOnly],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('fillStroke')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameBoardFillStroke]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same text appearance only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 40, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 40, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 40, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 40, height: 20 });
    for (const object of [sameFirstBoard, active, sameSecondBoard, differentSecondBoard]) {
      Object.defineProperty(object, 'type', { value: 'textbox' });
      Object.defineProperty(object, 'fontFamily', { value: 'Inter' });
      Object.defineProperty(object, 'fontWeight', { value: '700' });
      Object.defineProperty(object, 'fill', { value: '#111111' });
    }
    Object.defineProperty(sameFirstBoard, 'fontSize', { value: 18 });
    Object.defineProperty(active, 'fontSize', { value: 18 });
    Object.defineProperty(sameSecondBoard, 'fontSize', { value: 18 });
    Object.defineProperty(differentSecondBoard, 'fontSize', { value: 24 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('textAppearance')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same opacity only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, opacity: 0.5 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, opacity: 0.5 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, opacity: 0.5 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, opacity: 0.75 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('opacity')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same blend mode only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    sameFirstBoard.globalCompositeOperation = 'multiply';
    active.globalCompositeOperation = 'multiply';
    sameSecondBoard.globalCompositeOperation = 'multiply';
    differentSecondBoard.globalCompositeOperation = 'screen';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('globalCompositeOperation')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same stroke dash only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeDashArray: [4, 2] });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeDashArray: [4, 2] });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeDashArray: [4, 2] });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeDashArray: [2, 2] });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('strokeDashArray')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same line cap only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeLineCap: 'round' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeLineCap: 'round' });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeLineCap: 'round' });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeLineCap: 'square' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('strokeLineCap')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same line join only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeLineJoin: 'bevel' });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeLineJoin: 'bevel' });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, strokeLineJoin: 'bevel' });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, strokeLineJoin: 'round' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('strokeLineJoin')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same name only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    sameFirstBoard.set('name', 'Logo Mark');
    active.set('name', ' Logo Mark ');
    sameSecondBoard.set('name', 'logo mark');
    differentSecondBoard.set('name', 'Logo Shadow');
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('name')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same artboard placement only inside the active artboard scope', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameOtherBoard = new fabric.Rect({ left: 245, top: 50, width: 30, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const sameFirstBoard = new fabric.Rect({ left: -10, top: 50, width: 30, height: 20, strokeWidth: 0 });
    const insideFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameOtherBoard, active, sameFirstBoard, insideFirstBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('artboardPlacement')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameFirstBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same any-artboard placement only inside the active artboard scope', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameOtherBoard = new fabric.Rect({ left: 245, top: 50, width: 30, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const sameFirstBoard = new fabric.Rect({ left: -10, top: 50, width: 30, height: 20, strokeWidth: 0 });
    const insideFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameOtherBoard, active, sameFirstBoard, insideFirstBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('artboardAnyPlacement')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameFirstBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same shadow only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameShadow = { color: 'rgba(0,0,0,0.3)', blur: 4, offsetX: 1, offsetY: 2 };
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    for (const object of [sameFirstBoard, active, sameSecondBoard]) Object.defineProperty(object, 'shadow', { value: sameShadow });
    Object.defineProperty(differentSecondBoard, 'shadow', { value: { ...sameShadow, blur: 8 } });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('shadow')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same pattern fill only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const samePattern = { kind: 'dots', size: 8, color1: '#fff', color2: '#000' };
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    for (const object of [sameFirstBoard, active, sameSecondBoard]) Object.defineProperty(object, 'patternSpec', { value: samePattern });
    Object.defineProperty(differentSecondBoard, 'patternSpec', { value: { ...samePattern, kind: 'stripes' } });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('patternSpec')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same gradient fill only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameGradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
      colorStops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    });
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, fill: sameGradient });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, fill: sameGradient });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20, fill: sameGradient });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20, fill: '#ff0000' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('gradientFill')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same overprint only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    for (const object of [sameFirstBoard, active, sameSecondBoard]) (object as unknown as { fillOverprint: boolean }).fillOverprint = true;
    (differentSecondBoard as unknown as { strokeOverprint: boolean }).strokeOverprint = true;
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('overprint')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same print mark type only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    for (const object of [sameFirstBoard, active, sameSecondBoard]) (object as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    (differentSecondBoard as unknown as { printMarkKind: string }).printMarkKind = 'crop';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('printMarkKind')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same symbol only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    for (const object of [sameFirstBoard, active, sameSecondBoard]) Object.defineProperty(object, 'symbolId', { value: 'Logo-Mark' });
    Object.defineProperty(differentSecondBoard, 'symbolId', { value: 'Icon-Mark' });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('symbolId')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects same clipping mask only on the active artboard', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const sameFirstBoard = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20 });
    const sameSecondBoard = new fabric.Rect({ left: 210, top: 10, width: 20, height: 20 });
    const differentSecondBoard = new fabric.Rect({ left: 230, top: 10, width: 20, height: 20 });
    const clipPath = new fabric.Rect({ width: 10, height: 10 });
    for (const object of [sameFirstBoard, active, sameSecondBoard]) object.clipPath = clipPath;
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [sameFirstBoard, active, sameSecondBoard, differentSecondBoard],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSameActiveArtboard('clipPath')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls.at(-1)?.[0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameSecondBoard]);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('builds stable full appearance signatures for Select Same Appearance', () => {
    const base = {
      fill: ' #AABBCC ',
      stroke: '#112233',
      strokeWidth: 2,
      opacity: 0.75,
      globalCompositeOperation: 'Multiply',
      strokeDashArray: [4, '2'],
      strokeLineCap: 'Round',
      strokeLineJoin: 'Bevel',
      shadow: { color: ' rgba(0,0,0,0.3) ', blur: 6, offsetX: 1, offsetY: 2 },
      patternSpec: { kind: 'dots', size: 8, color1: '#fff', color2: '#000' },
    };

    const same = { ...base, fill: '#aabbcc', globalCompositeOperation: 'multiply', strokeLineCap: 'round', strokeLineJoin: 'bevel' };
    const different = { ...base, opacity: 0.5 };

    expect(appearanceSignature(base)).toBe(appearanceSignature(same));
    expect(appearanceSignature(base)).not.toBe(appearanceSignature(different));
    expect(selectSameSignature(base, 'appearance')).toBe(appearanceSignature(base));
  });

  it('extracts advanced Select Same signatures from object-like values', () => {
    expect(selectSameSignature({ symbolId: ' Logo-Mark ' }, 'symbolId')).toBe('logo-mark');
    expect(selectSameSignature({ clipPath: { id: 'mask' } }, 'clipPath')).toBe('clipPath');
    expect(selectSameSignature({ clipPath: null }, 'clipPath')).toBeNull();
    expect(selectSameSignature({ strokeDashArray: ['4', 2, Number.NaN, 'bad'] }, 'strokeDashArray')).toEqual([4, 2]);
  });

  it('selects objects with the same overprint combination as the active object', async () => {
    const canvasEngine = await import('../canvasEngine');
    const active = new fabric.Rect({ width: 10, height: 10 });
    (active as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const same = new fabric.Rect({ width: 10, height: 10 });
    (same as unknown as { overprintFill: boolean }).overprintFill = true;
    const different = new fabric.Rect({ width: 10, height: 10 });
    (different as unknown as { strokeOverprint: boolean }).strokeOverprint = true;
    const overlaySame = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlaySame as unknown as { fillOverprint: boolean }).fillOverprint = true;
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, same, different, overlaySame],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectSame('overprint')).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([active, same]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('selects objects with the same artboard placement as the active object', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Artboard', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const sameOverflow = new fabric.Rect({ left: -10, top: 40, width: 20, height: 20, strokeWidth: 0 });
    const inside = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const outside = new fabric.Rect({ left: 130, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOverflow = new fabric.Rect({ left: 95, top: 95, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameOverflow, inside, outside, overlayOverflow],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSame('artboardPlacement')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameOverflow]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects objects with the same any-artboard placement as the active object', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 250, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const sameOverflowFirst = new fabric.Rect({ left: 90, top: 20, width: 30, height: 20, strokeWidth: 0 });
    const insideSecond = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const outsideAll = new fabric.Rect({ left: 300, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const overlayOverflow = new fabric.Rect({ left: 95, top: 95, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, sameOverflowFirst, insideSecond, outsideAll, overlayOverflow],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    try {
      expect(selectSame('artboardAnyPlacement')).toBe(2);
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual([active, sameOverflowFirst]);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('selects print marks with the same generated mark type as the active object', async () => {
    const canvasEngine = await import('../canvasEngine');
    const active = new fabric.Line([0, 0, 10, 0]);
    (active as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    const same = new fabric.Circle({ radius: 3 });
    (same as unknown as { printMarkKind: string }).printMarkKind = ' Registration ';
    const different = new fabric.Rect({ width: 10, height: 10 });
    (different as unknown as { printMarkKind: string }).printMarkKind = 'crop';
    const overlaySame = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (overlaySame as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    const canvas = {
      getActiveObject: () => active,
      getObjects: () => [active, same, different, overlaySame],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectSame('printMarkKind')).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([active, same]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('compares scalar, numeric, and dash signatures safely', () => {
    expect(sameSignature('symbol-a', 'symbol-a')).toBe(true);
    expect(sameSignature(0.5, 0.5000001)).toBe(true);
    expect(sameSignature([4, 2], [4, 2])).toBe(true);
    expect(sameSignature([4, 2], [4, 3])).toBe(false);
    expect(sameSignature(null, 'symbol-a')).toBe(false);
  });
});
