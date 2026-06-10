import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import * as canvasEngine from '../canvasEngine';
import { addMeasureProofManifest, addMeasureProofRevisionHistory, addMeasureProofApprovalAudit, addMeasureProofPackageCover, addMeasureProofDeliveryChecklist, addMeasureProofReleaseStamp, addMeasureProofPackageIndex, addMeasureProofDeliveryContact, addMeasureProofDeliverySchedule, addMeasureProofDeliveryRoute, addMeasureProofFulfillmentHandoff, addMeasureProofInstallHandoff, addMeasureProofSiteReadiness, addMeasureProofInstallPunchList, addMeasureProofClientAcceptance, addMeasureProofWarrantyInfo, addMeasureProofCareInstructions, addMeasureProofAssetArchive, addMeasureProofFileVerification, addSelectionAreaLabel, addSelectionCenterMark, addSelectionCornerMarks, addSelectionDimensions, addSelectionInsetFrame, addSelectionMarginFrame, addSelectionProductionMarks, addPrintMarksFromMeasureAnnotations, addCutContourFromMeasureAnnotations, addBridgedCutContourFromMeasureAnnotations, addRegistrationMarksFromMeasureAnnotations, addWeedBorderFromMeasureAnnotations, addGrommetsFromMeasureAnnotations, addRhinestonesFromMeasureAnnotations, preparePrintAndCutFromMeasureAnnotations, prepareBannerFinishingFromMeasureAnnotations, prepareStencilCutFromMeasureAnnotations, prepareRhinestoneTemplateFromMeasureAnnotations, prepareProofPageFromMeasureAnnotations, prepareProofPagesFromMeasureAnnotations, bringMeasureAnnotationsToFront, clearMeasureAnnotations, clearMeasureProofSheetObjects, commitDimension, setMeasureProofApprovalStatus, setMeasureProofJobInfo, setMeasureProofSignoff, setMeasureProofDeliveryContact, setMeasureProofDeliverySchedule, setMeasureProofDeliveryRoute, setMeasureProofFulfillmentHandoff, setMeasureProofInstallHandoff, setMeasureProofSiteReadiness, setMeasureProofInstallPunchList, setMeasureProofClientAcceptance, setMeasureProofWarrantyInfo, setMeasureProofCareInstructions, setMeasureProofAssetArchive, setMeasureProofFileVerification, duplicateMeasureAnnotationsToSelection, editMeasureAnnotations, hideMeasureAnnotations, lockMeasureAnnotations, makeArtboardFromMeasureAnnotations, makeCenterGuidesFromMeasureAnnotations, makeFullGuidesFromMeasureAnnotations, makeGuidesFromMeasureAnnotations, makeMarginArtboardFromMeasureAnnotations, makeMarginFullGuidesFromMeasureAnnotations, makeMarginGuidesFromMeasureAnnotations, proofMeasureAnnotations, resizeArtboardToMeasureAnnotations, selectMeasureAnnotations, selectMeasureProofObjectsByStatus, selectMeasureProofDeliveryBlockers, showMeasureAnnotations, unlockMeasureAnnotations } from '../tools/measureTool';

describe('measure dimension annotations', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useEditor.getState().setMeasure(null);
  });

  it('commits the live measurement as an editable dimension group', () => {
    const added: fabric.FabricObject[] = [];
    const canvas = {
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setMeasure({ x1: 0, y1: 0, x2: 37.795, y2: 0 });

    expect(commitDimension()).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Group);
    const group = added[0] as fabric.Group;
    expect(group.getObjects()).toHaveLength(4);
    expect(group.getObjects().some((object) => object instanceof fabric.Text && (object as fabric.Text).text === '10.0 mm')).toBe(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
    expect(useEditor.getState().measure).toBeNull();
  });



  it('adds width and height annotations around the active selection bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionDimensions()).toBe(2);
    expect(added).toHaveLength(1);
    const group = added[0] as fabric.Group;
    expect(group).toBeInstanceOf(fabric.Group);
    const labels = group.getObjects().filter((object): object is fabric.Text => object instanceof fabric.Text).map((object) => object.text);
    expect(labels).toContain('W 20.0 mm');
    expect(labels).toContain('H 10.0 mm');
    expect(group.getObjects()).toHaveLength(12);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds an editable area and perimeter label at the selection center', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionAreaLabel()).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Text);
    const label = added[0] as fabric.Text;
    expect(label.text).toBe('Area 200.0 mm²\nPerim 60.0 mm');
    expect(label.left).toBeCloseTo(47.795, 3);
    expect(label.top).toBeCloseTo(38.8975, 3);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(label);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds a center crosshair and coordinate label for the active selection', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionCenterMark()).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Group);
    const group = added[0] as fabric.Group;
    expect(group.getObjects()).toHaveLength(4);
    expect(group.getObjects().filter((object) => object instanceof fabric.Line)).toHaveLength(2);
    expect(group.getObjects().some((object) => object instanceof fabric.Circle)).toBe(true);
    expect(group.getObjects().some((object) => object instanceof fabric.Text && (object as fabric.Text).text === 'C 12.6, 10.3 mm')).toBe(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds editable L-shaped marks at all selection corners', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionCornerMarks()).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Group);
    const group = added[0] as fabric.Group;
    expect(group.getObjects()).toHaveLength(8);
    expect(group.getObjects().every((object) => object instanceof fabric.Line)).toBe(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds a combined production mark set in one editable group', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionProductionMarks()).toBe(4);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Group);
    const group = added[0] as fabric.Group;
    expect(group.getObjects()).toHaveLength(25);
    const labels = group.getObjects().filter((object): object is fabric.Text => object instanceof fabric.Text).map((object) => object.text);
    expect(labels).toContain('W 20.0 mm');
    expect(labels).toContain('H 10.0 mm');
    expect(labels).toContain('Area 200.0 mm²\nPerim 60.0 mm');
    expect(labels).toContain('C 12.6, 10.3 mm');
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds a dashed margin frame around the active selection', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionMarginFrame(5)).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Group);
    const group = added[0] as fabric.Group;
    expect(group.getObjects()).toHaveLength(2);
    const frame = group.getObjects().find((object): object is fabric.Rect => object instanceof fabric.Rect);
    const label = group.getObjects().find((object): object is fabric.Text => object instanceof fabric.Text);
    expect(frame).toBeTruthy();
    expect(label?.text).toBe('Margin 5.0 mm');
    expect(frame?.width).toBeCloseTo(113.385, 3);
    expect(frame?.height).toBeCloseTo(75.59, 3);
    expect(frame?.strokeDashArray).toEqual([6, 4]);
    expect(addSelectionMarginFrame(-1)).toBe(false);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds a dashed inset frame inside the active selection', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const added: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionInsetFrame(2)).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Group);
    const group = added[0] as fabric.Group;
    expect(group.getObjects()).toHaveLength(2);
    const frame = group.getObjects().find((object): object is fabric.Rect => object instanceof fabric.Rect);
    const label = group.getObjects().find((object): object is fabric.Text => object instanceof fabric.Text);
    expect(frame).toBeTruthy();
    expect(label?.text).toBe('Inset 2.0 mm');
    expect(frame?.width).toBeCloseTo(60.472, 3);
    expect(frame?.height).toBeCloseTo(22.677, 3);
    expect(frame?.strokeDashArray).toEqual([3, 3]);
    expect(addSelectionInsetFrame(20)).toBe(false);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('makes persistent guides from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });

    expect(addSelectionAreaLabel()).toBe(true);
    expect(makeGuidesFromMeasureAnnotations()).toBe(4);
    expect(addUserGuide).toHaveBeenCalledTimes(4);
    expect(addUserGuide.mock.calls.map((call) => call[0])).toEqual(['v', 'v', 'h', 'h']);
    const boundGuidePositions = addUserGuide.mock.calls.map((call) => call[1]);

    addUserGuide.mockClear();
    expect(makeMarginGuidesFromMeasureAnnotations(5)).toBe(4);
    expect(addUserGuide).toHaveBeenCalledTimes(4);
    expect(addUserGuide.mock.calls.map((call) => call[0])).toEqual(['v', 'v', 'h', 'h']);
    expect(addUserGuide.mock.calls[0][1]).toBeCloseTo(boundGuidePositions[0] - 18.8975, 3);
    expect(addUserGuide.mock.calls[1][1]).toBeCloseTo(boundGuidePositions[1] + 18.8975, 3);
    expect(makeMarginGuidesFromMeasureAnnotations(-1)).toBe(0);

    addUserGuide.mockClear();
    expect(makeCenterGuidesFromMeasureAnnotations()).toBe(2);
    expect(addUserGuide).toHaveBeenCalledTimes(2);
    expect(addUserGuide.mock.calls.map((call) => call[0])).toEqual(['v', 'h']);

    addUserGuide.mockClear();
    expect(makeFullGuidesFromMeasureAnnotations()).toBe(6);
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(addUserGuide.mock.calls.map((call) => call[0])).toEqual(['v', 'v', 'h', 'h', 'v', 'h']);
    const fullCenterX = addUserGuide.mock.calls[4][1];
    const fullCenterY = addUserGuide.mock.calls[5][1];

    addUserGuide.mockClear();
    expect(makeMarginFullGuidesFromMeasureAnnotations(5)).toBe(6);
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(addUserGuide.mock.calls.map((call) => call[0])).toEqual(['v', 'v', 'h', 'h', 'v', 'h']);
    expect(addUserGuide.mock.calls[0][1]).toBeCloseTo(boundGuidePositions[0] - 18.8975, 3);
    expect(addUserGuide.mock.calls[4][1]).toBeCloseTo(fullCenterX, 3);
    expect(addUserGuide.mock.calls[5][1]).toBeCloseTo(fullCenterY, 3);
    expect(makeMarginFullGuidesFromMeasureAnnotations(-1)).toBe(0);
  });


  it('adds print marks from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionAreaLabel()).toBe(true);
    for (const object of objects) object.canvas = canvas as never;
    const annotationCount = objects.length;
    vi.clearAllMocks();

    expect(addPrintMarksFromMeasureAnnotations(3)).toBe(26);
    expect(objects).toHaveLength(annotationCount + 26);
    expect(objects.slice(annotationCount).every((object) => typeof (object as { printMarkKind?: unknown }).printMarkKind === 'string')).toBe(true);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(addPrintMarksFromMeasureAnnotations(-1)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds cut contour paths from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();
    expect(addCutContourFromMeasureAnnotations(2)).toBe(1);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(1);
    expect(cutPaths[0].kind).toBe('outline');
    expect(cutPaths[0].closed).toBe(true);
    expect(cutPaths[0].color).toBe('#ff00ff');
    expect(cutPaths[0].points).toHaveLength(5);
    expect(cutPaths[0].points[0][0]).toBeCloseTo(objects[0].getBoundingRect().left / 3.7795 - 2, 3);
    expect(cutPaths[0].points[2][1]).toBeCloseTo((objects[0].getBoundingRect().top + objects[0].getBoundingRect().height) / 3.7795 + 2, 3);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(addCutContourFromMeasureAnnotations(-1)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });



  it('adds bridged cut contour paths from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();
    const count = addBridgedCutContourFromMeasureAnnotations(2, 4, 1);
    expect(count).toBeGreaterThan(1);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(count);
    expect(cutPaths.every((path) => path.kind === 'outline' && !path.closed)).toBe(true);
    expect(cutPaths.every((path) => path.bridgeSourceId && path.bridgeOriginal?.closed)).toBe(true);
    expect(cutPaths[0].color).toBe('#ff00ff');
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(addBridgedCutContourFromMeasureAnnotations(2, 0, 1)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('adds plotter registration marks from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setCutPaths([{ id: 'old-regmark', points: [[0, 0], [1, 0]], closed: false, kind: 'regmark' }]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();
    expect(addRegistrationMarksFromMeasureAnnotations(5)).toBe(4);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(4);
    expect(cutPaths.every((path) => path.kind === 'regmark')).toBe(true);
    expect(cutPaths.some((path) => path.id === 'old-regmark')).toBe(false);
    const rect = objects[0].getBoundingRect();
    expect(cutPaths[0].points[1][0]).toBeCloseTo(rect.left / 3.7795, 3);
    expect(cutPaths[0].points[1][1]).toBeCloseTo(rect.top / 3.7795, 3);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(addRegistrationMarksFromMeasureAnnotations(-1)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds weed border paths from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();
    expect(addWeedBorderFromMeasureAnnotations(5, 1, 2)).toBe(4);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(4);
    expect(cutPaths.every((path) => path.kind === 'manual')).toBe(true);
    expect(cutPaths[0].id.startsWith('weed-border-')).toBe(true);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-v-'))).toHaveLength(2);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-h-'))).toHaveLength(1);
    const rect = objects[0].getBoundingRect();
    expect(cutPaths[0].points[0][0]).toBeCloseTo(rect.left / 3.7795 - 5, 3);
    expect(cutPaths[0].points[2][1]).toBeCloseTo((rect.top + rect.height) / 3.7795 + 5, 3);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(addWeedBorderFromMeasureAnnotations(-1)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds grommet cut paths from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();
    expect(addGrommetsFromMeasureAnnotations(2, 1000, 4)).toBe(4);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(4);
    expect(cutPaths.every((path) => path.kind === 'manual' && path.closed)).toBe(true);
    expect(cutPaths.every((path) => path.id.startsWith('gr-'))).toBe(true);
    expect(cutPaths[0].points).toHaveLength(21);
    const rect = objects[0].getBoundingRect();
    const inset = Math.min(2, rect.width / 3.7795 / 2, rect.height / 3.7795 / 2);
    expect(cutPaths[0].points[0][0]).toBeCloseTo(rect.left / 3.7795 + inset + 2, 3);
    expect(cutPaths[0].points[0][1]).toBeCloseTo(rect.top / 3.7795 + inset, 3);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(addGrommetsFromMeasureAnnotations(2, 0, 4)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('adds rhinestone cut paths from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();
    const count = addRhinestonesFromMeasureAnnotations(10, 2);
    expect(count).toBeGreaterThan(0);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(count);
    expect(cutPaths.every((path) => path.kind === 'manual' && path.closed)).toBe(true);
    expect(cutPaths.every((path) => path.id.startsWith('rs-'))).toBe(true);
    expect(cutPaths[0].points).toHaveLength(17);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(addRhinestonesFromMeasureAnnotations(0, 2)).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('prepares a print-and-cut package from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });
    useEditor.getState().setCutPaths([{ id: 'old-regmark', points: [[0, 0], [1, 0]], closed: false, kind: 'regmark' }]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    for (const object of objects) object.canvas = canvas as never;
    const annotationCount = objects.length;
    vi.clearAllMocks();

    const result = preparePrintAndCutFromMeasureAnnotations(3, 1, 5, 4);
    expect(result).toEqual({ printMarks: 26, cutPaths: 6, guides: 6 });
    expect(objects).toHaveLength(annotationCount + 26);
    expect(objects.slice(annotationCount).every((object) => typeof (object as { printMarkKind?: unknown }).printMarkKind === 'string')).toBe(true);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(6);
    expect(cutPaths.filter((path) => path.kind === 'outline')).toHaveLength(1);
    expect(cutPaths.filter((path) => path.kind === 'regmark')).toHaveLength(4);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-border-'))).toHaveLength(1);
    expect(cutPaths.some((path) => path.id === 'old-regmark')).toBe(false);
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(preparePrintAndCutFromMeasureAnnotations(-1)).toBeNull();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('prepares a banner finishing package from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();

    const result = prepareBannerFinishingFromMeasureAnnotations(2, 1000, 4, 5, 1, 2);
    expect(result).toEqual({ grommets: 4, weedPaths: 4, guides: 6 });
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength(8);
    expect(cutPaths.filter((path) => path.id.startsWith('gr-'))).toHaveLength(4);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-border-'))).toHaveLength(1);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-v-'))).toHaveLength(2);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-h-'))).toHaveLength(1);
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(prepareBannerFinishingFromMeasureAnnotations(2, 0, 4, 5)).toBeNull();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('prepares a stencil cut package from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();

    const result = prepareStencilCutFromMeasureAnnotations(2, 4, 1, 5, 1, 2);
    expect(result).not.toBeNull();
    expect(result?.weedPaths).toBe(4);
    expect(result?.guides).toBe(6);
    expect(result?.bridgedContours ?? 0).toBeGreaterThan(1);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength((result?.bridgedContours ?? 0) + 4);
    expect(cutPaths.filter((path) => path.kind === 'outline' && !path.closed && path.bridgeSourceId)).toHaveLength(result?.bridgedContours ?? 0);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-border-'))).toHaveLength(1);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-v-'))).toHaveLength(2);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-h-'))).toHaveLength(1);
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(prepareStencilCutFromMeasureAnnotations(2, 0, 1, 5)).toBeNull();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('prepares a rhinestone template package from measure annotation bounds', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });
    useEditor.getState().setCutPaths([]);
    useEditor.getState().setCutPathsVisible(false);

    expect(addSelectionAreaLabel()).toBe(true);
    vi.clearAllMocks();

    const result = prepareRhinestoneTemplateFromMeasureAnnotations(10, 2, 5);
    expect(result).not.toBeNull();
    expect(result?.stones ?? 0).toBeGreaterThan(0);
    expect(result?.weedPaths).toBe(1);
    expect(result?.guides).toBe(6);
    const cutPaths = useEditor.getState().cutPaths;
    expect(cutPaths).toHaveLength((result?.stones ?? 0) + 1);
    expect(cutPaths.filter((path) => path.id.startsWith('rs-'))).toHaveLength(result?.stones ?? 0);
    expect(cutPaths.filter((path) => path.id.startsWith('weed-border-'))).toHaveLength(1);
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(useEditor.getState().cutPathsVisible).toBe(true);
    expect(prepareRhinestoneTemplateFromMeasureAnnotations(0, 2, 5)).toBeNull();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('prepares a proof page package from measure annotation bounds', () => {
    const originalArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'Base', x: 0, y: 0, width: 100, height: 100 }]);
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });

    expect(addSelectionAreaLabel()).toBe(true);
    for (const object of objects) object.canvas = canvas as never;
    const annotationCount = objects.length;
    vi.clearAllMocks();

    const result = prepareProofPageFromMeasureAnnotations(5, 3);
    expect(result).toEqual({ artboard: true, printMarks: 26, proofLabels: 1, proofFrames: 2, proofLegends: 1, proofChecklists: 1, proofApprovalStamps: 1, proofColorBars: 1, proofScales: 1, proofJobInfos: 1, proofFilenames: 1, proofPreflights: 1, proofManifests: 0, proofRevisions: 0, proofAudits: 0, proofCovers: 0, proofDeliveries: 0, proofReleases: 0, proofIndexes: 0, proofContacts: 0, proofSchedules: 0, proofRoutes: 0, proofFulfillments: 0, proofInstalls: 0, proofSiteReadinesses: 0, proofPunchLists: 0, proofAcceptances: 0, proofWarranties: 0, proofCares: 0, proofArchives: 0, proofVerifications: 0, proofSpecs: 1, proofSafetyNotes: 1, guides: 6 });
    const artboards = useEditor.getState().artboards;
    expect(artboards).toHaveLength(2);
    expect(artboards[1].name).toBe('Measure Proof Page 2 +5.0mm');
    expect(artboards[1].width).toBeCloseTo(objects[0].getBoundingRect().width + 37.795, 3);
    expect(objects).toHaveLength(annotationCount + 39);
    expect(objects.slice(annotationCount, annotationCount + 26).every((object) => typeof (object as { printMarkKind?: unknown }).printMarkKind === 'string')).toBe(true);
    expect(objects.slice(annotationCount + 26, annotationCount + 28).map((object) => (object as { measureProofFrameKind?: unknown }).measureProofFrameKind)).toEqual(['trim', 'artwork']);
    expect((objects[annotationCount + 28] as { measureProofLabelKind?: unknown }).measureProofLabelKind).toBe('measure-proof-label');
    expect((objects[annotationCount + 28] as fabric.FabricText).text).toContain('Proof 2');
    expect((objects[annotationCount + 29] as { measureProofLegendKind?: unknown }).measureProofLegendKind).toBe('measure-proof-legend');
    expect((objects[annotationCount + 30] as { measureProofChecklistKind?: unknown }).measureProofChecklistKind).toBe('measure-proof-checklist');
    expect((objects[annotationCount + 30] as { measureProofSignoff?: unknown }).measureProofSignoff).toEqual({ signer: '', date: '', note: '' });
    expect((objects[annotationCount + 30] as { measureProofChecklistStatus?: unknown }).measureProofChecklistStatus).toBe('draft');
    expect((objects[annotationCount + 30] as { measureProofChecklistStates?: unknown }).measureProofChecklistStates).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect((objects[annotationCount + 31] as { measureProofApprovalKind?: unknown }).measureProofApprovalKind).toBe('measure-proof-approval-stamp');
    expect((objects[annotationCount + 31] as { measureProofApprovalStatus?: unknown }).measureProofApprovalStatus).toBe('draft');
    expect((objects[annotationCount + 32] as { measureProofColorBarKind?: unknown }).measureProofColorBarKind).toBe('measure-proof-color-bar');
    expect((objects[annotationCount + 33] as { measureProofScaleKind?: unknown }).measureProofScaleKind).toBe('measure-proof-scale');
    expect((objects[annotationCount + 34] as { measureProofJobInfoKind?: unknown }).measureProofJobInfoKind).toBe('measure-proof-job-info');
    expect((objects[annotationCount + 35] as { measureProofFilenameKind?: unknown }).measureProofFilenameKind).toBe('measure-proof-filename');
    expect((objects[annotationCount + 35] as { measureProofFilename?: unknown }).measureProofFilename).toBe('measure-proof-rev-draft-p02.pdf');
    expect((objects[annotationCount + 36] as { measureProofPreflightKind?: unknown }).measureProofPreflightKind).toBe('measure-proof-preflight');
    expect((objects[annotationCount + 36] as { measureProofPreflightFilename?: unknown }).measureProofPreflightFilename).toBe('measure-proof-rev-draft-p02.pdf');
    expect((objects[annotationCount + 36] as { measureProofPreflightStatus?: unknown }).measureProofPreflightStatus).toBe('draft');
    expect((objects[annotationCount + 37] as { measureProofSpecsKind?: unknown }).measureProofSpecsKind).toBe('measure-proof-specs');
    expect((objects[annotationCount + 38] as { measureProofSafetyKind?: unknown }).measureProofSafetyKind).toBe('measure-proof-safety');
    expect(addUserGuide).toHaveBeenCalledTimes(6);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(prepareProofPageFromMeasureAnnotations(-1)).toBeNull();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofSignoff({ signer: 'Client A', date: '2026-06-08', note: 'Approved by email' })).toBe(1);
    expect((objects[annotationCount + 30] as { measureProofSignoff?: { signer?: string; date?: string; note?: string } }).measureProofSignoff).toEqual({ signer: 'Client A', date: '2026-06-08', note: 'Approved by email' });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofJobInfo({ job: 'Window decal', revision: 'R2', prepared: 'AW', notes: 'Laminate gloss' })).toBe(1);
    expect((objects[annotationCount + 34] as { measureProofJobInfo?: { job?: string; revision?: string; prepared?: string; notes?: string } }).measureProofJobInfo).toEqual({ job: 'Window decal', revision: 'R2', prepared: 'AW', notes: 'Laminate gloss' });
    expect((objects[annotationCount + 35] as { measureProofFilename?: unknown }).measureProofFilename).toBe('window-decal-r2-draft-p02.pdf');
    expect((objects[annotationCount + 36] as { measureProofPreflightFilename?: unknown }).measureProofPreflightFilename).toBe('window-decal-r2-draft-p02.pdf');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofApprovalStatus('approved')).toBe(1);
    expect((objects[annotationCount + 31] as { measureProofApprovalStatus?: unknown }).measureProofApprovalStatus).toBe('approved');
    expect((objects[annotationCount + 30] as { measureProofChecklistStatus?: unknown }).measureProofChecklistStatus).toBe('approved');
    expect((objects[annotationCount + 30] as { measureProofChecklistStates?: unknown }).measureProofChecklistStates).toEqual(['checked', 'checked', 'checked', 'checked', 'checked']);
    expect((objects[annotationCount + 35] as { measureProofFilename?: unknown }).measureProofFilename).toBe('window-decal-r2-approved-p02.pdf');
    expect((objects[annotationCount + 36] as { measureProofPreflightFilename?: unknown }).measureProofPreflightFilename).toBe('window-decal-r2-approved-p02.pdf');
    expect((objects[annotationCount + 36] as { measureProofPreflightStatus?: unknown }).measureProofPreflightStatus).toBe('approved');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofManifest()).toBe(1);
    expect((objects[annotationCount + 39] as { measureProofManifestKind?: unknown }).measureProofManifestKind).toBe('measure-proof-manifest');
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofManifest()).toBe(1);
    expect(objects).toHaveLength(annotationCount + 40);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofRevisionHistory()).toBe(1);
    expect((objects[annotationCount + 40] as { measureProofRevisionKind?: unknown }).measureProofRevisionKind).toBe('measure-proof-revision-history');
    expect(((objects[annotationCount + 40] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Revision: R2');
    expect(((objects[annotationCount + 40] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Prepared: AW');
    expect(((objects[annotationCount + 40] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('Signoff: 1/1 complete');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofApprovalAudit()).toBe(1);
    expect((objects[annotationCount + 41] as { measureProofAuditKind?: unknown }).measureProofAuditKind).toBe('measure-proof-approval-audit');
    expect(((objects[annotationCount + 41] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Readiness: Ready for production');
    expect(((objects[annotationCount + 41] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Approved pages: 1/1');
    expect(((objects[annotationCount + 41] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Unsigned pages: 0');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofPackageCover()).toBe(1);
    expect((objects[annotationCount + 42] as { measureProofCoverKind?: unknown }).measureProofCoverKind).toBe('measure-proof-package-cover');
    expect(((objects[annotationCount + 42] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Job: Window decal');
    expect(((objects[annotationCount + 42] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Approval: 1 approved · 0 changes · 0 draft');
    expect(((objects[annotationCount + 42] as fabric.Group).getObjects()[8] as fabric.FabricText).text).toBe('Package status: Ready to release');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofDeliveryChecklist()).toBe(1);
    expect((objects[annotationCount + 43] as { measureProofDeliveryKind?: unknown }).measureProofDeliveryKind).toBe('measure-proof-delivery-checklist');
    expect(((objects[annotationCount + 43] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('✓ Job name: Window decal');
    expect(((objects[annotationCount + 43] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('✓ Approved pages: 1/1');
    expect(((objects[annotationCount + 43] as fabric.Group).getObjects()[9] as fabric.FabricText).text).toBe('✓ Signoff complete: 1/1');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofReleaseStamp()).toBe(1);
    expect((objects[annotationCount + 44] as { measureProofReleaseKind?: unknown }).measureProofReleaseKind).toBe('measure-proof-release-stamp');
    expect(((objects[annotationCount + 44] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('RELEASE READY');
    expect(((objects[annotationCount + 44] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Approved package can ship');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofPackageIndex()).toBe(1);
    expect((objects[annotationCount + 45] as { measureProofIndexKind?: unknown }).measureProofIndexKind).toBe('measure-proof-package-index');
    expect(((objects[annotationCount + 45] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Pages indexed: 1');
    expect(((objects[annotationCount + 45] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('P02 · approved · signed · window-decal-r2-approved-p02.pdf');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofDeliveryContact()).toBe(1);
    expect((objects[annotationCount + 46] as { measureProofContactKind?: unknown }).measureProofContactKind).toBe('measure-proof-delivery-contact');
    expect(((objects[annotationCount + 46] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Client: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofDeliveryContact({ client: 'City Foods', contact: 'Dana', email: 'dana@example.com', phone: '555-0100' })).toBe(1);
    expect((objects[annotationCount + 46] as { measureProofContact?: { client?: string } }).measureProofContact?.client).toBe('City Foods');
    expect(((objects[annotationCount + 46] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Client: City Foods');
    expect(((objects[annotationCount + 46] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Email: dana@example.com');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofDeliverySchedule()).toBe(1);
    expect((objects[annotationCount + 47] as { measureProofScheduleKind?: unknown }).measureProofScheduleKind).toBe('measure-proof-delivery-schedule');
    expect(((objects[annotationCount + 47] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Due: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofDeliverySchedule({ due: 'Friday', ship: 'Monday', method: 'Pickup', notes: 'Call first' })).toBe(1);
    expect((objects[annotationCount + 47] as { measureProofSchedule?: { due?: string } }).measureProofSchedule?.due).toBe('Friday');
    expect(((objects[annotationCount + 47] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Method: Pickup');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofDeliveryRoute()).toBe(1);
    expect((objects[annotationCount + 48] as { measureProofRouteKind?: unknown }).measureProofRouteKind).toBe('measure-proof-delivery-route');
    expect(((objects[annotationCount + 48] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Carrier: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofDeliveryRoute({ carrier: 'UPS', service: 'Ground', account: 'AW-12', address: 'Dock 4' })).toBe(1);
    expect((objects[annotationCount + 48] as { measureProofRoute?: { carrier?: string } }).measureProofRoute?.carrier).toBe('UPS');
    expect(((objects[annotationCount + 48] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Service: Ground');
    expect(((objects[annotationCount + 48] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Address: Dock 4');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofFulfillmentHandoff()).toBe(1);
    expect((objects[annotationCount + 49] as { measureProofFulfillmentKind?: unknown }).measureProofFulfillmentKind).toBe('measure-proof-fulfillment-handoff');
    expect(((objects[annotationCount + 49] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Quantity: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofFulfillmentHandoff({ quantity: '12 kits', packaging: 'Flat cartons', owner: 'Sam', tracking: '1Z999' })).toBe(1);
    expect((objects[annotationCount + 49] as { measureProofFulfillment?: { owner?: string } }).measureProofFulfillment?.owner).toBe('Sam');
    expect(((objects[annotationCount + 49] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Packaging: Flat cartons');
    expect(((objects[annotationCount + 49] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Tracking: 1Z999');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofInstallHandoff()).toBe(1);
    expect((objects[annotationCount + 50] as { measureProofInstallKind?: unknown }).measureProofInstallKind).toBe('measure-proof-install-handoff');
    expect(((objects[annotationCount + 50] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Installer: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofInstallHandoff({ installer: 'Crew A', date: '2026-06-18', site: 'Lobby', notes: 'Bring lift' })).toBe(1);
    expect((objects[annotationCount + 50] as { measureProofInstall?: { site?: string } }).measureProofInstall?.site).toBe('Lobby');
    expect(((objects[annotationCount + 50] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Installer: Crew A');
    expect(((objects[annotationCount + 50] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Notes: Bring lift');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofSiteReadiness()).toBe(1);
    expect((objects[annotationCount + 51] as { measureProofSiteReadinessKind?: unknown }).measureProofSiteReadinessKind).toBe('measure-proof-site-readiness');
    expect(((objects[annotationCount + 51] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Permit: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofSiteReadiness({ permit: 'Approved', access: 'Loading dock', power: '120V', risks: 'Low ceiling' })).toBe(1);
    expect((objects[annotationCount + 51] as { measureProofSiteReadiness?: { access?: string } }).measureProofSiteReadiness?.access).toBe('Loading dock');
    expect(((objects[annotationCount + 51] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Access: Loading dock');
    expect(((objects[annotationCount + 51] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Risks: Low ceiling');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofInstallPunchList()).toBe(1);
    expect((objects[annotationCount + 52] as { measureProofPunchListKind?: unknown }).measureProofPunchListKind).toBe('measure-proof-install-punch-list');
    expect(((objects[annotationCount + 52] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Open items: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofInstallPunchList({ open: '2 decals lifting', owner: 'Crew A', due: '2026-06-21', resolution: 'Re-squeegee edges' })).toBe(1);
    expect((objects[annotationCount + 52] as { measureProofPunchList?: { owner?: string } }).measureProofPunchList?.owner).toBe('Crew A');
    expect(((objects[annotationCount + 52] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Open items: 2 decals lifting');
    expect(((objects[annotationCount + 52] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Resolution: Re-squeegee edges');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofClientAcceptance()).toBe(1);
    expect((objects[annotationCount + 53] as { measureProofAcceptanceKind?: unknown }).measureProofAcceptanceKind).toBe('measure-proof-client-acceptance');
    expect(((objects[annotationCount + 53] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Accepted by: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofClientAcceptance({ acceptedBy: 'Client Rep', date: '2026-06-23', status: 'Accepted', notes: 'Signed on site' })).toBe(1);
    expect((objects[annotationCount + 53] as { measureProofAcceptance?: { status?: string } }).measureProofAcceptance?.status).toBe('Accepted');
    expect(((objects[annotationCount + 53] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Accepted by: Client Rep');
    expect(((objects[annotationCount + 53] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Status: Accepted');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofWarrantyInfo()).toBe(1);
    expect((objects[annotationCount + 54] as { measureProofWarrantyKind?: unknown }).measureProofWarrantyKind).toBe('measure-proof-warranty-info');
    expect(((objects[annotationCount + 54] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Term: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofWarrantyInfo({ term: '12 months', coverage: 'Materials and install', contact: 'support@example.com', notes: 'Excludes vandalism' })).toBe(1);
    expect((objects[annotationCount + 54] as { measureProofWarranty?: { term?: string } }).measureProofWarranty?.term).toBe('12 months');
    expect(((objects[annotationCount + 54] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Coverage: Materials and install');
    expect(((objects[annotationCount + 54] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Notes: Excludes vandalism');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofCareInstructions()).toBe(1);
    expect((objects[annotationCount + 55] as { measureProofCareKind?: unknown }).measureProofCareKind).toBe('measure-proof-care-instructions');
    expect(((objects[annotationCount + 55] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Cleaning: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofCareInstructions({ cleaning: 'Soft cloth monthly', chemicals: 'No solvents', inspection: 'Quarterly', notes: 'Report lifting edges' })).toBe(1);
    expect((objects[annotationCount + 55] as { measureProofCare?: { cleaning?: string } }).measureProofCare?.cleaning).toBe('Soft cloth monthly');
    expect(((objects[annotationCount + 55] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Chemicals: No solvents');
    expect(((objects[annotationCount + 55] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Notes: Report lifting edges');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofAssetArchive()).toBe(1);
    expect((objects[annotationCount + 56] as { measureProofArchiveKind?: unknown }).measureProofArchiveKind).toBe('measure-proof-asset-archive');
    expect(((objects[annotationCount + 56] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Source: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofAssetArchive({ source: 'Working AI', exports: 'PDF/SVG/PNG', photos: 'Install album', notes: 'Archive after approval' })).toBe(1);
    expect((objects[annotationCount + 56] as { measureProofArchive?: { exports?: string } }).measureProofArchive?.exports).toBe('PDF/SVG/PNG');
    expect(((objects[annotationCount + 56] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Exports: PDF/SVG/PNG');
    expect(((objects[annotationCount + 56] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Notes: Archive after approval');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(addMeasureProofFileVerification()).toBe(1);
    expect((objects[annotationCount + 57] as { measureProofVerificationKind?: unknown }).measureProofVerificationKind).toBe('measure-proof-file-verification');
    expect(((objects[annotationCount + 57] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Version: Not set');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofFileVerification({ version: 'v3-final', checksum: 'sha256:abc123', reviewed: 'QA Lead', notes: 'Matches exported PDF' })).toBe(1);
    expect((objects[annotationCount + 57] as { measureProofVerification?: { checksum?: string } }).measureProofVerification?.checksum).toBe('sha256:abc123');
    expect(((objects[annotationCount + 57] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Checksum: sha256:abc123');
    expect(((objects[annotationCount + 57] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Reviewed: QA Lead');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(clearMeasureProofSheetObjects()).toBe(58);
    expect(objects).toHaveLength(annotationCount);
    expect(objects.every((object) => (object as { measureAnnotationKind?: unknown }).measureAnnotationKind === 'measure-annotation')).toBe(true);
    expect(canvas.remove).toHaveBeenCalledTimes(58);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(clearMeasureProofSheetObjects()).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();

    useEditor.getState().setArtboards(originalArtboards);
  });

  it('prepares proof pages for each measure annotation', () => {
    const originalArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'Base', x: 0, y: 0, width: 100, height: 100 }]);
    let selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const addUserGuide = vi.fn();
    useEditor.setState({ addUserGuide });

    expect(addSelectionAreaLabel()).toBe(true);
    selected = [new fabric.Rect({ left: 160, top: 80, width: 37.795, height: 75.59, strokeWidth: 0 })];
    expect(addSelectionAreaLabel()).toBe(true);
    for (const object of objects) object.canvas = canvas as never;
    const annotationCount = objects.length;
    vi.clearAllMocks();

    const result = prepareProofPagesFromMeasureAnnotations(5, 3);
    expect(result).toEqual({ artboards: 2, printMarks: 52, proofLabels: 2, proofFrames: 4, proofLegends: 2, proofChecklists: 2, proofApprovalStamps: 2, proofColorBars: 2, proofScales: 2, proofJobInfos: 2, proofFilenames: 2, proofPreflights: 2, proofManifests: 1, proofRevisions: 1, proofAudits: 1, proofCovers: 1, proofDeliveries: 1, proofReleases: 1, proofIndexes: 1, proofContacts: 1, proofSchedules: 1, proofRoutes: 1, proofFulfillments: 1, proofInstalls: 1, proofSiteReadinesses: 1, proofPunchLists: 1, proofAcceptances: 1, proofWarranties: 1, proofCares: 1, proofArchives: 1, proofVerifications: 1, proofSpecs: 2, proofSafetyNotes: 2, guides: 12 });
    const artboards = useEditor.getState().artboards;
    expect(artboards).toHaveLength(3);
    expect(artboards[1].name).toBe('Measure Proof Page 2 +5.0mm');
    expect(artboards[2].name).toBe('Measure Proof Page 3 +5.0mm');
    expect(objects).toHaveLength(annotationCount + 97);
    expect(objects.slice(annotationCount, annotationCount + 52).every((object) => typeof (object as { printMarkKind?: unknown }).printMarkKind === 'string')).toBe(true);
    expect(objects.slice(annotationCount + 52, annotationCount + 56).map((object) => (object as { measureProofFrameKind?: unknown }).measureProofFrameKind)).toEqual(['trim', 'artwork', 'trim', 'artwork']);
    expect(objects.slice(annotationCount + 56, annotationCount + 58).map((object) => (object as { measureProofLabelKind?: unknown }).measureProofLabelKind)).toEqual(['measure-proof-label', 'measure-proof-label']);
    expect(objects.slice(annotationCount + 58, annotationCount + 60).map((object) => (object as { measureProofLegendKind?: unknown }).measureProofLegendKind)).toEqual(['measure-proof-legend', 'measure-proof-legend']);
    expect(objects.slice(annotationCount + 60, annotationCount + 62).map((object) => (object as { measureProofChecklistKind?: unknown }).measureProofChecklistKind)).toEqual(['measure-proof-checklist', 'measure-proof-checklist']);
    expect(objects.slice(annotationCount + 60, annotationCount + 62).map((object) => (object as { measureProofSignoff?: { signer?: string } }).measureProofSignoff?.signer)).toEqual(['', '']);
    expect(objects.slice(annotationCount + 60, annotationCount + 62).map((object) => (object as { measureProofChecklistStatus?: unknown }).measureProofChecklistStatus)).toEqual(['draft', 'draft']);
    expect(objects.slice(annotationCount + 62, annotationCount + 64).map((object) => (object as { measureProofApprovalKind?: unknown }).measureProofApprovalKind)).toEqual(['measure-proof-approval-stamp', 'measure-proof-approval-stamp']);
    expect(objects.slice(annotationCount + 62, annotationCount + 64).map((object) => (object as { measureProofApprovalStatus?: unknown }).measureProofApprovalStatus)).toEqual(['draft', 'draft']);
    expect(objects.slice(annotationCount + 64, annotationCount + 66).map((object) => (object as { measureProofColorBarKind?: unknown }).measureProofColorBarKind)).toEqual(['measure-proof-color-bar', 'measure-proof-color-bar']);
    expect(objects.slice(annotationCount + 66, annotationCount + 68).map((object) => (object as { measureProofScaleKind?: unknown }).measureProofScaleKind)).toEqual(['measure-proof-scale', 'measure-proof-scale']);
    expect(objects.slice(annotationCount + 68, annotationCount + 70).map((object) => (object as { measureProofJobInfoKind?: unknown }).measureProofJobInfoKind)).toEqual(['measure-proof-job-info', 'measure-proof-job-info']);
    expect(objects.slice(annotationCount + 70, annotationCount + 72).map((object) => (object as { measureProofFilenameKind?: unknown }).measureProofFilenameKind)).toEqual(['measure-proof-filename', 'measure-proof-filename']);
    expect(objects.slice(annotationCount + 70, annotationCount + 72).map((object) => (object as { measureProofFilename?: unknown }).measureProofFilename)).toEqual(['measure-proof-rev-draft-p02.pdf', 'measure-proof-rev-draft-p03.pdf']);
    expect(objects.slice(annotationCount + 72, annotationCount + 74).map((object) => (object as { measureProofPreflightKind?: unknown }).measureProofPreflightKind)).toEqual(['measure-proof-preflight', 'measure-proof-preflight']);
    expect(objects.slice(annotationCount + 72, annotationCount + 74).map((object) => (object as { measureProofPreflightFilename?: unknown }).measureProofPreflightFilename)).toEqual(['measure-proof-rev-draft-p02.pdf', 'measure-proof-rev-draft-p03.pdf']);
    expect((objects[annotationCount + 74] as { measureProofManifestKind?: unknown }).measureProofManifestKind).toBe('measure-proof-manifest');
    expect(((objects[annotationCount + 74] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Signoff: 0/2 complete');
    expect((objects[annotationCount + 75] as { measureProofRevisionKind?: unknown }).measureProofRevisionKind).toBe('measure-proof-revision-history');
    expect(((objects[annotationCount + 75] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('Signoff: 0/2 complete');
    expect((objects[annotationCount + 76] as { measureProofAuditKind?: unknown }).measureProofAuditKind).toBe('measure-proof-approval-audit');
    expect(((objects[annotationCount + 76] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Readiness: 4 blockers before production');
    expect(((objects[annotationCount + 76] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Unsigned pages: 2');
    expect((objects[annotationCount + 77] as { measureProofCoverKind?: unknown }).measureProofCoverKind).toBe('measure-proof-package-cover');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Job: Not set');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[8] as fabric.FabricText).text).toBe('Package status: Hold for review');
    expect((objects[annotationCount + 78] as { measureProofDeliveryKind?: unknown }).measureProofDeliveryKind).toBe('measure-proof-delivery-checklist');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('• Job name: missing');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('! Approved pages: 0/2');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[9] as fabric.FabricText).text).toBe('! Signoff complete: 0/2');
    expect((objects[annotationCount + 79] as { measureProofReleaseKind?: unknown }).measureProofReleaseKind).toBe('measure-proof-release-stamp');
    expect(((objects[annotationCount + 79] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('RELEASE HOLD');
    expect((objects[annotationCount + 80] as { measureProofIndexKind?: unknown }).measureProofIndexKind).toBe('measure-proof-package-index');
    expect(((objects[annotationCount + 80] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Pages indexed: 2');
    expect(((objects[annotationCount + 80] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('P02 · draft · unsigned · measure-proof-rev-draft-p02.pdf');
    expect(((objects[annotationCount + 80] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('P03 · draft · unsigned · measure-proof-rev-draft-p03.pdf');
    expect((objects[annotationCount + 81] as { measureProofContactKind?: unknown }).measureProofContactKind).toBe('measure-proof-delivery-contact');
    expect(((objects[annotationCount + 81] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Client: Not set');
    expect((objects[annotationCount + 82] as { measureProofScheduleKind?: unknown }).measureProofScheduleKind).toBe('measure-proof-delivery-schedule');
    expect(((objects[annotationCount + 82] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Due: Not set');
    expect((objects[annotationCount + 83] as { measureProofRouteKind?: unknown }).measureProofRouteKind).toBe('measure-proof-delivery-route');
    expect(((objects[annotationCount + 83] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Carrier: Not set');
    expect((objects[annotationCount + 84] as { measureProofFulfillmentKind?: unknown }).measureProofFulfillmentKind).toBe('measure-proof-fulfillment-handoff');
    expect(((objects[annotationCount + 84] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Quantity: Not set');
    expect((objects[annotationCount + 85] as { measureProofInstallKind?: unknown }).measureProofInstallKind).toBe('measure-proof-install-handoff');
    expect(((objects[annotationCount + 85] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Installer: Not set');
    expect((objects[annotationCount + 86] as { measureProofSiteReadinessKind?: unknown }).measureProofSiteReadinessKind).toBe('measure-proof-site-readiness');
    expect(((objects[annotationCount + 86] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Permit: Not set');
    expect((objects[annotationCount + 87] as { measureProofPunchListKind?: unknown }).measureProofPunchListKind).toBe('measure-proof-install-punch-list');
    expect(((objects[annotationCount + 87] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Open items: Not set');
    expect((objects[annotationCount + 88] as { measureProofAcceptanceKind?: unknown }).measureProofAcceptanceKind).toBe('measure-proof-client-acceptance');
    expect(((objects[annotationCount + 88] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Accepted by: Not set');
    expect((objects[annotationCount + 89] as { measureProofWarrantyKind?: unknown }).measureProofWarrantyKind).toBe('measure-proof-warranty-info');
    expect(((objects[annotationCount + 89] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Term: Not set');
    expect((objects[annotationCount + 90] as { measureProofCareKind?: unknown }).measureProofCareKind).toBe('measure-proof-care-instructions');
    expect(((objects[annotationCount + 90] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Cleaning: Not set');
    expect((objects[annotationCount + 91] as { measureProofArchiveKind?: unknown }).measureProofArchiveKind).toBe('measure-proof-asset-archive');
    expect(((objects[annotationCount + 91] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Source: Not set');
    expect((objects[annotationCount + 92] as { measureProofVerificationKind?: unknown }).measureProofVerificationKind).toBe('measure-proof-file-verification');
    expect(((objects[annotationCount + 92] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Version: Not set');
    expect(objects.slice(annotationCount + 93, annotationCount + 95).map((object) => (object as { measureProofSpecsKind?: unknown }).measureProofSpecsKind)).toEqual(['measure-proof-specs', 'measure-proof-specs']);
    expect(objects.slice(annotationCount + 95).map((object) => (object as { measureProofSafetyKind?: unknown }).measureProofSafetyKind)).toEqual(['measure-proof-safety', 'measure-proof-safety']);
    expect(addUserGuide).toHaveBeenCalledTimes(12);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(prepareProofPagesFromMeasureAnnotations(-1)).toBeNull();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(selectMeasureProofObjectsByStatus('draft')).toBe(10);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(selectMeasureProofDeliveryBlockers()).toBe(13);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofSignoff({ signer: 'Shop Lead', date: '2026-06-09', note: 'Batch OK' })).toBe(2);
    expect(objects.slice(annotationCount + 60, annotationCount + 62).map((object) => (object as { measureProofSignoff?: { signer?: string; date?: string; note?: string } }).measureProofSignoff)).toEqual([{ signer: 'Shop Lead', date: '2026-06-09', note: 'Batch OK' }, { signer: 'Shop Lead', date: '2026-06-09', note: 'Batch OK' }]);
    expect(((objects[annotationCount + 74] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Signoff: 2/2 complete');
    expect(((objects[annotationCount + 75] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('Signoff: 2/2 complete');
    expect(((objects[annotationCount + 76] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Readiness: 2 blockers before production');
    expect(((objects[annotationCount + 76] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Unsigned pages: 0');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('Signoff: 2/2 complete · 0 unsigned');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[9] as fabric.FabricText).text).toBe('✓ Signoff complete: 2/2');
    expect(((objects[annotationCount + 79] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('RELEASE HOLD');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofDeliveryContact({ client: 'Fleet Co', contact: 'Avery', email: 'avery@example.com', phone: '555-0200' })).toBe(1);
    expect(((objects[annotationCount + 81] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Client: Fleet Co');
    expect(((objects[annotationCount + 81] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Phone: 555-0200');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofDeliverySchedule({ due: '2026-06-15', ship: '2026-06-16', method: 'Courier', notes: 'AM dock' })).toBe(1);
    expect(((objects[annotationCount + 82] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Due: 2026-06-15');
    expect(((objects[annotationCount + 82] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Notes: AM dock');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofDeliveryRoute({ carrier: 'FedEx', service: '2Day', account: 'Fleet-9', address: 'Installer bay' })).toBe(1);
    expect(((objects[annotationCount + 83] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Carrier: FedEx');
    expect(((objects[annotationCount + 83] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Address: Installer bay');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofFulfillmentHandoff({ quantity: '2 crates', packaging: 'Edge guards', owner: 'Logistics', tracking: 'FX-22' })).toBe(1);
    expect(((objects[annotationCount + 84] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Quantity: 2 crates');
    expect(((objects[annotationCount + 84] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Owner: Logistics');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofInstallHandoff({ installer: 'Install Co', date: '2026-06-20', site: 'North wall', notes: 'After hours' })).toBe(1);
    expect(((objects[annotationCount + 85] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Installer: Install Co');
    expect(((objects[annotationCount + 85] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Site: North wall');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofSiteReadiness({ permit: 'Permit on file', access: 'Gate B', power: 'Generator', risks: 'Rain plan' })).toBe(1);
    expect(((objects[annotationCount + 86] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Permit: Permit on file');
    expect(((objects[annotationCount + 86] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Power: Generator');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofInstallPunchList({ open: '1 paint touch-up', owner: 'Install Co', due: '2026-06-22', resolution: 'Client walk-through' })).toBe(1);
    expect(((objects[annotationCount + 87] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Open items: 1 paint touch-up');
    expect(((objects[annotationCount + 87] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Owner: Install Co');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofClientAcceptance({ acceptedBy: 'Dana Client', date: '2026-06-23', status: 'Accepted with notes', notes: 'Final photos sent' })).toBe(1);
    expect(((objects[annotationCount + 88] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Accepted by: Dana Client');
    expect(((objects[annotationCount + 88] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Notes: Final photos sent');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofWarrantyInfo({ term: '18 months', coverage: 'Print defects', contact: 'Warranty Desk', notes: 'Keep care sheet' })).toBe(1);
    expect(((objects[annotationCount + 89] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Term: 18 months');
    expect(((objects[annotationCount + 89] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Contact: Warranty Desk');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofCareInstructions({ cleaning: 'Warm water only', chemicals: 'Avoid ammonia', inspection: 'Every 6 months', notes: 'Photograph issues' })).toBe(1);
    expect(((objects[annotationCount + 90] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Cleaning: Warm water only');
    expect(((objects[annotationCount + 90] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Inspection: Every 6 months');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofAssetArchive({ source: 'Native artwork folder', exports: 'Final PDF + SVG', photos: 'Completion gallery', notes: 'Hash archive before delivery' })).toBe(1);
    expect(((objects[annotationCount + 91] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Source: Native artwork folder');
    expect(((objects[annotationCount + 91] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Exports: Final PDF + SVG');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofFileVerification({ version: 'Release candidate 2', checksum: 'sha256:def456', reviewed: 'Prepress', notes: 'Uploaded to archive' })).toBe(1);
    expect(((objects[annotationCount + 92] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Version: Release candidate 2');
    expect(((objects[annotationCount + 92] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Checksum: sha256:def456');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofJobInfo({ job: 'Fleet graphics', revision: 'Proof 3', prepared: 'Operator', notes: 'Panel set' })).toBe(2);
    expect(objects.slice(annotationCount + 68, annotationCount + 70).map((object) => (object as { measureProofJobInfo?: { job?: string } }).measureProofJobInfo?.job)).toEqual(['Fleet graphics', 'Fleet graphics']);
    expect(objects.slice(annotationCount + 70, annotationCount + 72).map((object) => (object as { measureProofFilename?: unknown }).measureProofFilename)).toEqual(['fleet-graphics-proof-3-draft-p02.pdf', 'fleet-graphics-proof-3-draft-p03.pdf']);
    expect(objects.slice(annotationCount + 72, annotationCount + 74).map((object) => (object as { measureProofPreflightFilename?: unknown }).measureProofPreflightFilename)).toEqual(['fleet-graphics-proof-3-draft-p02.pdf', 'fleet-graphics-proof-3-draft-p03.pdf']);
    expect(((objects[annotationCount + 75] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Revision: Proof 3');
    expect(((objects[annotationCount + 75] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Prepared: Operator');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Job: Fleet graphics');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Revision: Proof 3');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[3] as fabric.FabricText).text).toBe('Prepared by: Operator');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('✓ Job name: Fleet graphics');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('✓ Export filenames: 2/2');
    expect(((objects[annotationCount + 79] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('RELEASE HOLD');
    expect(((objects[annotationCount + 80] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('P02 · draft · signed · fleet-graphics-proof-3-draft-p02.pdf');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofApprovalStatus('changes')).toBe(2);
    expect(objects.slice(annotationCount + 62, annotationCount + 64).map((object) => (object as { measureProofApprovalStatus?: unknown }).measureProofApprovalStatus)).toEqual(['changes', 'changes']);
    expect(objects.slice(annotationCount + 60, annotationCount + 62).map((object) => (object as { measureProofChecklistStates?: unknown }).measureProofChecklistStates)).toEqual([['checked', 'checked', 'checked', 'issue', 'issue'], ['checked', 'checked', 'checked', 'issue', 'issue']]);
    expect(objects.slice(annotationCount + 70, annotationCount + 72).map((object) => (object as { measureProofFilename?: unknown }).measureProofFilename)).toEqual(['fleet-graphics-proof-3-changes-p02.pdf', 'fleet-graphics-proof-3-changes-p03.pdf']);
    expect(objects.slice(annotationCount + 72, annotationCount + 74).map((object) => (object as { measureProofPreflightStatus?: unknown }).measureProofPreflightStatus)).toEqual(['changes', 'changes']);
    expect(((objects[annotationCount + 75] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Approvals: 0/2 approved');
    expect(((objects[annotationCount + 75] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Changes: 2 flagged');
    expect(((objects[annotationCount + 76] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('Readiness: 2 blockers before production');
    expect(((objects[annotationCount + 76] as fabric.Group).getObjects()[4] as fabric.FabricText).text).toBe('Draft pages: 0');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[5] as fabric.FabricText).text).toBe('Approval: 0 approved · 2 changes · 0 draft');
    expect(((objects[annotationCount + 77] as fabric.Group).getObjects()[8] as fabric.FabricText).text).toBe('Package status: Hold for review');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[6] as fabric.FabricText).text).toBe('! Approved pages: 0/2');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[7] as fabric.FabricText).text).toBe('! Changes required: 2');
    expect(((objects[annotationCount + 78] as fabric.Group).getObjects()[8] as fabric.FabricText).text).toBe('✓ Draft pages: 0');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(selectMeasureProofObjectsByStatus('changes')).toBe(10);
    expect(selectMeasureProofObjectsByStatus('approved')).toBe(0);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(selectMeasureProofDeliveryBlockers()).toBe(13);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    expect(setMeasureProofApprovalStatus('approved')).toBe(2);
    expect(((objects[annotationCount + 79] as fabric.Group).getObjects()[1] as fabric.FabricText).text).toBe('RELEASE READY');
    expect(((objects[annotationCount + 79] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('Approved package can ship');
    expect(((objects[annotationCount + 80] as fabric.Group).getObjects()[2] as fabric.FabricText).text).toBe('P02 · approved · signed · fleet-graphics-proof-3-approved-p02.pdf');
    expect(selectMeasureProofDeliveryBlockers()).toBe(0);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    useEditor.getState().setArtboards(originalArtboards);
  });

  it('makes an artboard from measure annotation bounds', () => {
    const originalArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'Base', x: 0, y: 0, width: 100, height: 100 }]);
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionAreaLabel()).toBe(true);
    expect(makeArtboardFromMeasureAnnotations()).toBe(true);
    const artboards = useEditor.getState().artboards;
    expect(artboards).toHaveLength(2);
    expect(artboards[1].name).toBe('Measure Proof 2');
    expect(artboards[1].width).toBeGreaterThan(0);
    expect(artboards[1].height).toBeGreaterThan(0);

    expect(makeMarginArtboardFromMeasureAnnotations(5)).toBe(true);
    const marginArtboard = useEditor.getState().artboards[2];
    expect(marginArtboard.name).toBe('Measure Proof 3 +5.0mm');
    expect(marginArtboard.width).toBeCloseTo(artboards[1].width + 37.795, 3);
    expect(marginArtboard.height).toBeCloseTo(artboards[1].height + 37.795, 3);
    expect(makeMarginArtboardFromMeasureAnnotations(-1)).toBe(false);

    expect(resizeArtboardToMeasureAnnotations()).toBe(true);
    const resizedBase = useEditor.getState().artboards[0];
    expect(resizedBase.x).toBeCloseTo(artboards[1].x, 3);
    expect(resizedBase.y).toBeCloseTo(artboards[1].y, 3);
    expect(resizedBase.width).toBeCloseTo(artboards[1].width, 3);
    expect(resizedBase.height).toBeCloseTo(artboards[1].height, 3);

    expect(resizeArtboardToMeasureAnnotations(5)).toBe(true);
    const resizedWithMargin = useEditor.getState().artboards[0];
    expect(resizedWithMargin.width).toBeCloseTo(artboards[1].width + 37.795, 3);
    expect(resizedWithMargin.height).toBeCloseTo(artboards[1].height + 37.795, 3);
    expect(resizeArtboardToMeasureAnnotations(-1)).toBe(false);
    expect(pushHistory).toHaveBeenCalledTimes(5);

    useEditor.getState().setArtboards(originalArtboards);
  });

  it('duplicates existing measure annotations onto the active artwork selection', async () => {
    let selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const target = new fabric.Rect({ left: 200, top: 180, width: 75.59, height: 37.795, strokeWidth: 0 });
    const objects: fabric.FabricObject[] = [];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      bringObjectToFront: vi.fn((object: fabric.FabricObject) => { const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionAreaLabel()).toBe(true);
    expect(objects).toHaveLength(1);
    const source = objects[0] as fabric.FabricObject & { measureAnnotationKind?: string };
    expect(source.measureAnnotationKind).toBe('measure-annotation');

    selected = [target];
    expect(await duplicateMeasureAnnotationsToSelection()).toBe(1);
    expect(objects).toHaveLength(2);
    const clone = objects[1] as fabric.FabricObject & { measureAnnotationKind?: string };
    expect(clone).not.toBe(source);
    expect(clone.measureAnnotationKind).toBe('measure-annotation');
    expect(clone.left).not.toBe(source.left);
    expect(clone.visible && clone.selectable && clone.evented && clone.hasControls).toBe(true);
    expect(canvas.bringObjectToFront).toHaveBeenCalledWith(clone);
    expect(canvas.setActiveObject).toHaveBeenLastCalledWith(clone);
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('tags, selects, and clears generated measure annotations', () => {
    const selected = [new fabric.Rect({ left: 10, top: 20, width: 75.59, height: 37.795, strokeWidth: 0 })];
    const backgroundArtwork = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, strokeWidth: 0 });
    const foregroundArtwork = new fabric.Rect({ left: 100, top: 100, width: 10, height: 10, strokeWidth: 0 });
    const objects: fabric.FabricObject[] = [backgroundArtwork];
    const canvas = {
      getActiveObjects: () => selected,
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      bringObjectToFront: vi.fn((object: fabric.FabricObject) => { const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionDimensions()).toBe(2);
    expect(objects).toHaveLength(2);
    expect(objects.filter((object) => (object as fabric.FabricObject & { measureAnnotationKind?: string }).measureAnnotationKind === 'measure-annotation')).toHaveLength(1);

    expect(selectMeasureAnnotations()).toBe(1);
    expect(canvas.discardActiveObject).toHaveBeenCalled();
    expect(canvas.setActiveObject).toHaveBeenLastCalledWith(objects[1]);

    objects[1].set({ visible: false, selectable: false, evented: false, hasControls: false, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    expect(editMeasureAnnotations()).toBe(1);
    expect(canvas.bringObjectToFront).toHaveBeenCalledTimes(1);
    expect(canvas.setActiveObject).toHaveBeenLastCalledWith(objects[1]);
    expect(objects[1].visible && objects[1].selectable && objects[1].evented && objects[1].hasControls && !objects[1].lockMovementX && !objects[1].lockMovementY && !objects[1].lockScalingX && !objects[1].lockScalingY && !objects[1].lockRotation).toBe(true);

    objects.push(foregroundArtwork);
    expect(addSelectionMarginFrame(5)).toBe(true);
    expect(objects).toHaveLength(4);
    const measureAnnotations = objects.filter((object) => (object as fabric.FabricObject & { measureAnnotationKind?: string }).measureAnnotationKind === 'measure-annotation');
    expect(measureAnnotations).toHaveLength(2);

    expect(bringMeasureAnnotationsToFront()).toBe(2);
    expect(canvas.bringObjectToFront).toHaveBeenCalledTimes(3);
    expect(objects.slice(-2)).toEqual(measureAnnotations);

    expect(lockMeasureAnnotations()).toBe(2);
    expect(measureAnnotations.every((object) => !object.selectable && !object.evented && object.lockMovementX && object.lockMovementY && object.lockScalingX && object.lockScalingY && object.lockRotation)).toBe(true);

    expect(unlockMeasureAnnotations()).toBe(2);
    expect(measureAnnotations.every((object) => object.selectable && object.evented && !object.lockMovementX && !object.lockMovementY && !object.lockScalingX && !object.lockScalingY && !object.lockRotation)).toBe(true);

    expect(hideMeasureAnnotations()).toBe(2);
    expect(measureAnnotations.every((object) => !object.visible)).toBe(true);

    expect(showMeasureAnnotations()).toBe(2);
    expect(measureAnnotations.every((object) => object.visible)).toBe(true);

    measureAnnotations[0].set({ visible: false, selectable: true, evented: true, lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
    objects.splice(objects.indexOf(foregroundArtwork), 1);
    objects.push(foregroundArtwork);
    expect(proofMeasureAnnotations()).toBe(2);
    expect(canvas.bringObjectToFront).toHaveBeenCalledTimes(5);
    expect(objects.slice(-2)).toEqual(measureAnnotations);
    expect(measureAnnotations.every((object) => object.visible && !object.selectable && !object.evented && object.lockMovementX && object.lockMovementY && object.lockScalingX && object.lockScalingY && object.lockRotation)).toBe(true);

    expect(clearMeasureAnnotations()).toBe(2);
    expect(objects).toEqual([backgroundArtwork, foregroundArtwork]);
    expect(canvas.remove).toHaveBeenCalledTimes(2);
    expect(pushHistory).toHaveBeenCalledTimes(10);
  });

  it('does not add selection dimensions without selected artwork', () => {
    const canvas = {
      getActiveObjects: () => [],
      add: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(addSelectionDimensions()).toBe(0);
    expect(canvas.add).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit empty or tiny measurements', () => {
    const canvas = {
      add: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(commitDimension()).toBe(false);
    useEditor.getState().setMeasure({ x1: 0, y1: 0, x2: 0.1, y2: 0 });
    expect(commitDimension()).toBe(false);
    expect(canvas.add).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});
