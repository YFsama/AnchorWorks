import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { addAnchorsToLayerObjectsById, applyGraphicStyleToLayerObjectsById, blendLayerObjectsById, changeLayerObjectNameCaseById, cleanLayerObjectNamesById, cleanUpLayerObjectsById, clearLayerObjectAppearanceById, clearLayerObjectGradientFillById, clearLayerObjectImageFiltersById, clearLayerObjectPatternFillById, detachLayerSymbolInstancesById, expandLayerObjectAppearanceById, expandLayerObjectClippingMasksById, flattenLayerObjectTransparencyById, freeDistortLayerObjectsById, grommetLayerObjectsById, groupLayerObjectsById, knifeSplitLayerObjectsById, makeLayerCompoundPathById, moveLayerObjectsById, multiOutlineLayerObjectsById, normalizeLayerBlendMode, normalizeLayerBoolean, normalizeLayerDash, normalizeLayerPaint, normalizeLayerStrokeCap, normalizeLayerStrokeJoin, offsetLayerObjectsById, outlineLayerObjectStrokesById, puckerLayerObjectsById, renumberLayerObjectsById, roughenLayerObjectsById, releaseLayerCompoundPathsById, zigzagLayerObjectsById, releaseLayerObjectClippingMasksById, replaceLayerObjectNamesById, reverseLayerObjectsById, rhinestoneLayerObjectsById, roundCornersLayerObjectsById, scissorsSplitLayerObjectsById, selectMatchingLayerAppearanceById, selectSameLayerAppearanceById, selectSameLayerAssetById, selectSameLayerComplexAppearanceById, selectSameLayerGeometryById, selectSameLayerObjectById, selectSameLayerProductionById, selectSameLayerTextById, setLayerObjectBlendModeById, setLayerObjectDashById, setLayerObjectGeometryById, setLayerObjectGeometryPairById, setLayerObjectMiterLimitById, setLayerObjectOpacityById, setLayerObjectOverprintById, setLayerObjectPaintById, setLayerObjectPrintMarkKindById, setLayerObjectShadowById, setLayerObjectStrokeStyleById, setLayerObjectStrokeUniformById, setLayerObjectStrokeWidthById, setLayerObjectTextStyleById, simplifyLayerObjectsById, smoothLayerObjectsById, splitLayerObjectsIntoGridById, targetLayerObjectsById, twistLayerObjectsById, ungroupLayerObjectsById, variableWidthLayerObjectsById, warpLayerObjectsById } from '../layerOps';
import * as canvasEngine from '../canvasEngine';

function rect(id: string) {
  const object = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, strokeWidth: 0 });
  (object as fabric.FabricObject & { _id?: string })._id = id;
  return object;
}

describe('layer stack operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves matching layer objects to the front while preserving their relative order', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    const requestRenderAll = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
        objects.push(object);
      }),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll,
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(moveLayerObjectsById(['b', 'd'], 'front')).toBe(2);
    expect(objects.map((object) => (object as fabric.FabricObject & { _id?: string })._id)).toEqual(['a', 'c', 'b', 'd']);
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('moves matching layer objects to the back while preserving their relative order', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
        objects.unshift(object);
      }),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(moveLayerObjectsById(['b', 'd'], 'back')).toBe(2);
    expect(objects.map((object) => (object as fabric.FabricObject & { _id?: string })._id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('moves matching layer objects forward one step as a group', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d'), rect('e')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(moveLayerObjectsById(['b', 'd'], 'forward')).toBe(2);
    expect(objects.map((object) => (object as fabric.FabricObject & { _id?: string })._id)).toEqual(['a', 'c', 'b', 'e', 'd']);
  });

  it('moves matching layer objects backward one step as a group', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d'), rect('e')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(moveLayerObjectsById(['b', 'd'], 'backward')).toBe(2);
    expect(objects.map((object) => (object as fabric.FabricObject & { _id?: string })._id)).toEqual(['b', 'a', 'd', 'c', 'e']);
  });

  it('reverses matching layer objects inside their current stack slots', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d'), rect('e')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(moveLayerObjectsById(['b', 'd', 'e'], 'reverse')).toBe(3);
    expect(objects.map((object) => (object as fabric.FabricObject & { _id?: string })._id)).toEqual(['a', 'e', 'c', 'd', 'b']);
  });

  it('groups matching layer objects and replaces them in the root stack', () => {
    const first = rect('a');
    const middle = rect('b');
    const last = rect('c');
    const objects: fabric.FabricObject[] = [first, middle, last];
    const setActiveObject = vi.fn();
    const requestRenderAll = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      moveObjectTo: vi.fn((object: fabric.FabricObject, index: number) => {
        const current = objects.indexOf(object);
        if (current >= 0) objects.splice(current, 1);
        objects.splice(index, 0, object);
      }),
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll,
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(groupLayerObjectsById(['a', 'c'])).toBe(2);
    expect(objects).toHaveLength(2);
    expect(objects[0]).toBe(middle);
    expect(objects[1]).toBeInstanceOf(fabric.Group);
    const group = objects[1] as fabric.Group;
    expect(group.getObjects()).toEqual([first, last]);
    expect(setActiveObject).toHaveBeenCalledWith(group);
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('ungroups matching layer groups back into root stack objects', () => {
    const first = rect('a');
    const second = rect('b');
    const group = new fabric.Group([first, second]);
    (group as fabric.Group & { _id?: string })._id = 'g';
    const after = rect('c');
    const objects: fabric.FabricObject[] = [group, after];
    const setActiveObject = vi.fn();
    const requestRenderAll = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) objects.splice(index, 1);
      }),
      moveObjectTo: vi.fn((object: fabric.FabricObject, index: number) => {
        const current = objects.indexOf(object);
        if (current >= 0) objects.splice(current, 1);
        objects.splice(index, 0, object);
      }),
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll,
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(ungroupLayerObjectsById(['g'])).toBe(1);
    expect(objects).toEqual([first, second, after]);
    expect(setActiveObject.mock.calls[0][0]).toBeInstanceOf(fabric.ActiveSelection);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([first, second]);
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not ungroup matching non-group layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn(),
      remove: vi.fn(),
      moveObjectTo: vi.fn(),
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(ungroupLayerObjectsById(['a'])).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not group fewer than two matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn(),
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(groupLayerObjectsById(['a'])).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('reveals unlocks and targets matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[1].visible = false;
    objects[1].set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false });
    const setActiveObject = vi.fn();
    const requestRenderAll = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll,
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(targetLayerObjectsById(['b', 'c'])).toEqual({ selected: 2, revealed: 1, unlocked: 1 });
    expect(objects[1].visible).toBe(true);
    expect(objects[1].lockMovementX).toBe(false);
    expect(setActiveObject).toHaveBeenCalledWith(expect.any(fabric.ActiveSelection));
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('targets visible unlocked matches without adding history', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(targetLayerObjectsById(['a'])).toEqual({ selected: 1, revealed: 0, unlocked: 0 });
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('renumbers matching layer objects in stack order', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(renumberLayerObjectsById(['c', 'a'], { prefix: 'Logo', start: 7 })).toBe(2);
    expect((objects[0] as fabric.FabricObject & { name?: string }).name).toBe('Logo 7');
    expect((objects[2] as fabric.FabricObject & { name?: string }).name).toBe('Logo 8');
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('finds and replaces names inside matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    (objects[0] as fabric.FabricObject & { name?: string }).name = 'Logo red';
    (objects[1] as fabric.FabricObject & { name?: string }).name = 'Logo blue';
    (objects[2] as fabric.FabricObject & { name?: string }).name = 'Guide red';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(replaceLayerObjectNamesById(['a', 'b'], { find: 'Logo', replace: 'Mark' })).toBe(2);
    expect((objects[0] as fabric.FabricObject & { name?: string }).name).toBe('Mark red');
    expect((objects[1] as fabric.FabricObject & { name?: string }).name).toBe('Mark blue');
    expect((objects[2] as fabric.FabricObject & { name?: string }).name).toBe('Guide red');
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('changes matching layer names to title and sentence case', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    (objects[0] as fabric.FabricObject & { name?: string }).name = 'logo-red MARK';
    (objects[1] as fabric.FabricObject & { name?: string }).name = 'CUT LINE';
    (objects[2] as fabric.FabricObject & { name?: string }).name = 'guide mark';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(changeLayerObjectNameCaseById(['a', 'b'], 'title')).toBe(2);
    expect((objects[0] as fabric.FabricObject & { name?: string }).name).toBe('Logo-Red Mark');
    expect((objects[1] as fabric.FabricObject & { name?: string }).name).toBe('Cut Line');
    expect((objects[2] as fabric.FabricObject & { name?: string }).name).toBe('guide mark');
    expect(changeLayerObjectNameCaseById(['a'], 'sentence')).toBe(1);
    expect((objects[0] as fabric.FabricObject & { name?: string }).name).toBe('Logo-red mark');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('changes matching layer names to upper and lower case', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b')];
    (objects[0] as fabric.FabricObject & { name?: string }).name = 'Logo red';
    (objects[1] as fabric.FabricObject & { name?: string }).name = 'CUT LINE';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(changeLayerObjectNameCaseById(['a'], 'upper')).toBe(1);
    expect((objects[0] as fabric.FabricObject & { name?: string }).name).toBe('LOGO RED');
    expect(changeLayerObjectNameCaseById(['b'], 'lower')).toBe(1);
    expect((objects[1] as fabric.FabricObject & { name?: string }).name).toBe('cut line');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('cleans whitespace in matching layer names', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    (objects[0] as fabric.FabricObject & { name?: string | null }).name = '  Logo    red  ';
    (objects[1] as fabric.FabricObject & { name?: string | null }).name = '   ';
    (objects[2] as fabric.FabricObject & { name?: string | null }).name = 'Guide   mark';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(cleanLayerObjectNamesById(['a', 'b'])).toBe(2);
    expect((objects[0] as fabric.FabricObject & { name?: string | null }).name).toBe('Logo red');
    expect((objects[1] as fabric.FabricObject & { name?: string | null }).name).toBeNull();
    expect((objects[2] as fabric.FabricObject & { name?: string | null }).name).toBe('Guide   mark');
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('sets opacity on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].opacity = 1;
    objects[1].opacity = 0.75;
    objects[2].opacity = 1;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectOpacityById(['a', 'b'], { opacity: 0.5 })).toBe(2);
    expect(objects[0].opacity).toBe(0.5);
    expect(objects[1].opacity).toBe(0.5);
    expect(objects[2].opacity).toBe(1);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('sets blend mode on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].globalCompositeOperation = 'source-over';
    objects[1].globalCompositeOperation = 'screen';
    objects[2].globalCompositeOperation = 'source-over';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectBlendModeById(['a', 'b'], { blendMode: 'multiply' })).toBe(2);
    expect(objects[0].globalCompositeOperation).toBe('multiply');
    expect(objects[1].globalCompositeOperation).toBe('multiply');
    expect(objects[2].globalCompositeOperation).toBe('source-over');
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('normalizes layer blend mode prompt values', () => {
    expect(normalizeLayerBlendMode('Normal')).toBe('source-over');
    expect(normalizeLayerBlendMode('color dodge')).toBe('color-dodge');
    expect(normalizeLayerBlendMode('COLOR_BURN')).toBe('color-burn');
    expect(normalizeLayerBlendMode('unknown')).toBeNull();
  });

  it('sets paint on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ fill: '#000000', stroke: '#111111' });
    objects[1].set({ fill: '#222222', stroke: '#333333' });
    objects[2].set({ fill: '#444444', stroke: '#555555' });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectPaintById(['a', 'b'], { target: 'fill', paint: '#ff0000' })).toBe(2);
    expect(objects[0].fill).toBe('#ff0000');
    expect(objects[1].fill).toBe('#ff0000');
    expect(objects[2].fill).toBe('#444444');
    expect(setLayerObjectPaintById(['a'], { target: 'stroke', paint: '' })).toBe(1);
    expect(objects[0].stroke).toBe('');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('sets stroke width on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].strokeWidth = 1;
    objects[1].strokeWidth = 2;
    objects[2].strokeWidth = 3;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeWidthById(['a', 'b'], { strokeWidth: 4 })).toBe(2);
    expect(objects[0].strokeWidth).toBe(4);
    expect(objects[1].strokeWidth).toBe(4);
    expect(objects[2].strokeWidth).toBe(3);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('sets line cap and join on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ strokeLineCap: 'butt', strokeLineJoin: 'miter' });
    objects[1].set({ strokeLineCap: 'square', strokeLineJoin: 'bevel' });
    objects[2].set({ strokeLineCap: 'butt', strokeLineJoin: 'miter' });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeStyleById(['a', 'b'], { target: 'cap', value: 'round' })).toBe(2);
    expect(objects[0].strokeLineCap).toBe('round');
    expect(objects[1].strokeLineCap).toBe('round');
    expect(objects[2].strokeLineCap).toBe('butt');
    expect(setLayerObjectStrokeStyleById(['a'], { target: 'join', value: 'round' })).toBe(1);
    expect(objects[0].strokeLineJoin).toBe('round');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('sets dash pattern on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].strokeDashArray = [];
    objects[1].strokeDashArray = [2, 4];
    objects[2].strokeDashArray = [];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectDashById(['a', 'b'], { dash: [10, 5] })).toBe(2);
    expect(objects[0].strokeDashArray).toEqual([10, 5]);
    expect(objects[1].strokeDashArray).toEqual([10, 5]);
    expect(objects[2].strokeDashArray).toEqual([]);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('sets and clears shadow on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].shadow = null;
    objects[1].shadow = new fabric.Shadow({ color: '#000000', blur: 2, offsetX: 1, offsetY: 1 });
    objects[2].shadow = null;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectShadowById(['a', 'b'], { color: '#112233', blur: 8, offsetX: 4, offsetY: -3 })).toBe(2);
    expect((objects[0].shadow as unknown as fabric.Shadow).color).toBe('#112233');
    expect((objects[0].shadow as unknown as fabric.Shadow).blur).toBe(8);
    expect((objects[0].shadow as unknown as fabric.Shadow).offsetX).toBe(4);
    expect((objects[0].shadow as unknown as fabric.Shadow).offsetY).toBe(-3);
    expect((objects[1].shadow as fabric.Shadow).color).toBe('#112233');
    expect(objects[2].shadow).toBeNull();
    expect(setLayerObjectShadowById(['a', 'b'], { color: '#112233', blur: 8, offsetX: 4, offsetY: -3 })).toBe(0);
    expect(setLayerObjectShadowById(['a'], { color: null })).toBe(1);
    expect(objects[0].shadow).toBeNull();
    expect(objects[1].shadow).not.toBeNull();
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('sets production flags on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    (objects[0] as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).fillOverprint = false;
    (objects[1] as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).strokeOverprint = true;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectOverprintById(['a', 'b'], { target: 'both', overprint: true })).toBe(2);
    expect((objects[0] as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).fillOverprint).toBe(true);
    expect((objects[0] as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).overprintFill).toBe(true);
    expect((objects[0] as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).strokeOverprint).toBe(true);
    expect((objects[0] as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).overprintStroke).toBe(true);
    expect((objects[0] as fabric.FabricObject & { overprint?: boolean }).overprint).toBe(true);
    expect((objects[2] as fabric.FabricObject & { overprint?: boolean }).overprint).toBeUndefined();
    expect(setLayerObjectOverprintById(['a'], { target: 'stroke', overprint: false })).toBe(1);
    expect((objects[0] as fabric.FabricObject & { strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).strokeOverprint).toBe(false);
    expect((objects[0] as fabric.FabricObject & { strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean }).overprintStroke).toBe(false);
    expect((objects[0] as fabric.FabricObject & { overprint?: boolean }).overprint).toBe(false);
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('sets print mark kind on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    (objects[0] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind = 'crop';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectPrintMarkKindById(['a', 'b'], { printMarkKind: 'Page Info' })).toBe(2);
    expect((objects[0] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind).toBe('page-info');
    expect((objects[1] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind).toBe('page-info');
    expect((objects[2] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind).toBeUndefined();
    expect(setLayerObjectPrintMarkKindById(['a'], { printMarkKind: null })).toBe(1);
    expect((objects[0] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind).toBeUndefined();
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('normalizes layer dash prompt values', () => {
    expect(normalizeLayerDash('solid')).toEqual([]);
    expect(normalizeLayerDash('dashed')).toEqual([10, 5]);
    expect(normalizeLayerDash('dotted')).toEqual([2, 4]);
    expect(normalizeLayerDash('8, 3 2')).toEqual([8, 3, 2]);
    expect(normalizeLayerDash('0 0')).toEqual([]);
    expect(normalizeLayerDash('-1 2')).toBeNull();
    expect(normalizeLayerDash('bad')).toBeNull();
  });







  it('sets geometry on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [
      new fabric.Rect({ left: 10, top: 20, width: 10, height: 20, scaleX: 1, scaleY: 1, angle: 0, strokeWidth: 0 }),
      new fabric.Rect({ left: 30, top: 40, width: 20, height: 10, scaleX: 2, scaleY: 1, angle: 15, strokeWidth: 0 }),
      new fabric.Rect({ left: 50, top: 60, width: 30, height: 30, scaleX: 1, scaleY: 1, angle: 0, strokeWidth: 0 }),
    ];
    objects.forEach((object, index) => { (object as fabric.FabricObject & { _id?: string })._id = ['a', 'b', 'c'][index]; });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectGeometryById(['a', 'b'], { target: 'x', value: 100 })).toBe(2);
    expect(objects[0].left).toBe(100);
    expect(objects[1].left).toBe(100);
    expect(objects[2].left).toBe(50);
    expect(setLayerObjectGeometryById(['a', 'b'], { target: 'width', value: 60 })).toBe(2);
    expect(objects[0].scaleX).toBeCloseTo(6);
    expect(objects[1].scaleX).toBeCloseTo(3);
    expect(setLayerObjectGeometryById(['a'], { target: 'height', value: 10 })).toBe(1);
    expect(objects[0].scaleY).toBeCloseTo(0.5);
    expect(setLayerObjectGeometryById(['a', 'b'], { target: 'rotation', value: 45 })).toBe(2);
    expect(objects[0].angle).toBe(45);
    expect(objects[1].angle).toBe(45);
    expect(setLayerObjectGeometryById(['a'], { target: 'scaleY', value: 2 })).toBe(1);
    expect(objects[0].scaleY).toBe(2);
    expect(setLayerObjectGeometryById(['a', 'b'], { target: 'scaleX', value: 1.5 })).toBe(2);
    expect(objects[0].scaleX).toBe(1.5);
    expect(objects[1].scaleX).toBe(1.5);
    expect(setLayerObjectGeometryById(['a', 'b'], { target: 'skewX', value: 12 })).toBe(2);
    expect(objects[0].skewX).toBe(12);
    expect(objects[1].skewX).toBe(12);
    expect(setLayerObjectGeometryById(['a'], { target: 'skewY', value: -6 })).toBe(1);
    expect(objects[0].skewY).toBe(-6);
    expect(setLayerObjectGeometryById(['a'], { target: 'centerX', value: 50 })).toBe(1);
    expect(objects[0].left).toBeCloseTo(42.5);
    expect(setLayerObjectGeometryById(['a'], { target: 'centerY', value: 50 })).toBe(1);
    expect(objects[0].top).toBeCloseTo(30);
    expect(setLayerObjectGeometryById(['a'], { target: 'right', value: 80 })).toBe(1);
    expect(objects[0].left).toBeCloseTo(65);
    expect(setLayerObjectGeometryById(['a'], { target: 'bottom', value: 90 })).toBe(1);
    expect(objects[0].top).toBeCloseTo(50);
    expect(setLayerObjectGeometryById(['a'], { target: 'width', value: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledTimes(12);
  });

  it('sets paired geometry on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [
      new fabric.Rect({ left: 10, top: 20, width: 10, height: 20, scaleX: 1, scaleY: 1, strokeWidth: 0 }),
      new fabric.Rect({ left: 30, top: 40, width: 20, height: 10, scaleX: 1, scaleY: 2, strokeWidth: 0 }),
      new fabric.Rect({ left: 50, top: 60, width: 30, height: 30, scaleX: 1, scaleY: 1, strokeWidth: 0 }),
    ];
    objects.forEach((object, index) => { (object as fabric.FabricObject & { _id?: string })._id = ['a', 'b', 'c'][index]; });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectGeometryPairById(['a', 'b'], { target: 'position', values: [100, 120] })).toBe(2);
    expect(objects[0].left).toBe(100);
    expect(objects[0].top).toBe(120);
    expect(objects[1].left).toBe(100);
    expect(objects[1].top).toBe(120);
    expect(setLayerObjectGeometryPairById(['a'], { target: 'center', values: [50, 60] })).toBe(1);
    expect(objects[0].left).toBeCloseTo(45);
    expect(objects[0].top).toBeCloseTo(50);
    expect(setLayerObjectGeometryPairById(['a', 'b'], { target: 'size', values: [40, 50] })).toBe(2);
    expect(objects[0].scaleX).toBeCloseTo(4);
    expect(objects[0].scaleY).toBeCloseTo(2.5);
    expect(objects[1].scaleX).toBeCloseTo(2);
    expect(objects[1].scaleY).toBeCloseTo(5);
    expect(setLayerObjectGeometryPairById(['a', 'b'], { target: 'scale', values: [1.25, 0.75] })).toBe(2);
    expect(objects[0].scaleX).toBe(1.25);
    expect(objects[0].scaleY).toBe(0.75);
    expect(setLayerObjectGeometryPairById(['a'], { target: 'skew', values: [8, -4] })).toBe(1);
    expect(objects[0].skewX).toBe(8);
    expect(objects[0].skewY).toBe(-4);
    expect(setLayerObjectGeometryPairById(['a'], { target: 'bounds', values: [10, 20, 70, 80] })).toBe(1);
    expect(objects[0].left).toBe(10);
    expect(objects[0].top).toBe(20);
    expect(objects[0].scaleX).toBeCloseTo(6);
    expect(objects[0].scaleY).toBeCloseTo(3);
    expect(setLayerObjectGeometryPairById(['a'], { target: 'bounds', values: [0, 0, 0, 10] })).toBe(0);
    expect(pushHistory).toHaveBeenCalledTimes(6);
  });

  it('selects same geometry within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [
      rect('a'),
      rect('b'),
      rect('c'),
      new fabric.Rect({ left: 0, top: 0, width: 10, height: 20, scaleX: 2, scaleY: 1, angle: 45, strokeWidth: 0 }),
    ];
    (objects[3] as fabric.FabricObject & { _id?: string })._id = 'd';
    objects[0].set({ width: 10, height: 20, scaleX: 2, scaleY: 1, angle: 45 });
    objects[1].set({ width: 20, height: 20, scaleX: 1, scaleY: 1, angle: 405 });
    objects[2].set({ width: 10, height: 10, scaleX: 2, scaleY: 2, angle: 90 });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'width')).toBe(3);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1], objects[2]]);
    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'height')).toBe(3);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1], objects[2]]);
    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'size')).toBe(3);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1], objects[2]]);
    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'rotation')).toBe(2);
    expect((setActiveObject.mock.calls[3][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerGeometryById(['a', 'b', 'd'], 'scale')).toBe(2);
    expect((setActiveObject.mock.calls[4][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[3]]);
  });

  it('selects same aspect ratio within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ width: 10, height: 20, scaleX: 2, scaleY: 1 });
    objects[1].set({ width: 20, height: 20, scaleX: 1, scaleY: 1 });
    objects[2].set({ width: 10, height: 20, scaleX: 1, scaleY: 1 });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'aspectRatio')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });


  it('selects same position center and bounds within filtered layer ids', () => {
    const setup = () => {
      const objects: fabric.FabricObject[] = [
        new fabric.Rect({ left: 10, top: 20, width: 10, height: 20, strokeWidth: 0 }),
        new fabric.Rect({ left: 10, top: 30, width: 10, height: 20, strokeWidth: 0 }),
        new fabric.Rect({ left: 30, top: 20, width: 10, height: 20, strokeWidth: 0 }),
        new fabric.Rect({ left: 10, top: 20, width: 10, height: 20, strokeWidth: 0 }),
      ];
      objects.forEach((object, index) => { (object as fabric.FabricObject & { _id?: string })._id = ['a', 'b', 'c', 'd'][index]; });
      const setActiveObject = vi.fn();
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
        getObjects: () => objects,
        getActiveObject: () => objects[0],
        bringObjectToFront: vi.fn(),
        sendObjectToBack: vi.fn(),
        discardActiveObject: vi.fn(),
        setActiveObject,
        requestRenderAll: vi.fn(),
        fire: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
      } as never);
      return { objects, setActiveObject };
    };

    let next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'd'], 'x')).toBe(3);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[1], next.objects[3]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'y')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[2]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'd'], 'position')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[3]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'd'], 'center')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[3]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'd'], 'bounds')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[3]]);
  });


  it('selects same area edges and skew within filtered layer ids', () => {
    const setup = () => {
      const objects: fabric.FabricObject[] = [
        new fabric.Rect({ left: 10, top: 20, width: 10, height: 20, skewX: 12, skewY: 4, strokeWidth: 0 }),
        new fabric.Rect({ left: 20, top: 20, width: 10, height: 20, skewX: 12, skewY: 4, strokeWidth: 0 }),
        new fabric.Rect({ left: 10, top: 35, width: 20, height: 10, skewX: 12, skewY: 0, strokeWidth: 0 }),
        new fabric.Rect({ left: 10, top: 10, width: 10, height: 30, skewX: 0, skewY: 4, strokeWidth: 0 }),
      ];
      objects.forEach((object, index) => { (object as fabric.FabricObject & { _id?: string })._id = ['a', 'b', 'c', 'd'][index]; });
      const setActiveObject = vi.fn();
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
        getObjects: () => objects,
        getActiveObject: () => objects[0],
        bringObjectToFront: vi.fn(),
        sendObjectToBack: vi.fn(),
        discardActiveObject: vi.fn(),
        setActiveObject,
        requestRenderAll: vi.fn(),
        fire: vi.fn(),
        _onObjectAdded: vi.fn(),
        _onObjectRemoved: vi.fn(),
      } as never);
      return { objects, setActiveObject };
    };

    let next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'area')).toBe(3);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[1], next.objects[2]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'd'], 'right')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[3]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'c', 'd'], 'bottom')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[3]]);
    vi.restoreAllMocks();
    next = setup();
    expect(selectSameLayerGeometryById(['a', 'b', 'c'], 'skew')).toBe(2);
    expect((next.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([next.objects[0], next.objects[1]]);
  });



  it('selects same complex appearance within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
      colorStops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' },
      ],
    });
    objects[0].set({ fill: gradient });
    objects[1].set({ fill: gradient });
    objects[2].set({ fill: '#ff0000' });
    (objects[0] as fabric.FabricObject & { patternSpec?: unknown }).patternSpec = { kind: 'hatch', size: 8, color1: '#111111', color2: '#ffffff' };
    (objects[1] as fabric.FabricObject & { patternSpec?: unknown }).patternSpec = { kind: 'hatch', size: 8, color1: '#111111', color2: '#ffffff' };
    (objects[2] as fabric.FabricObject & { patternSpec?: unknown }).patternSpec = { kind: 'dots', size: 8, color1: '#111111', color2: '#ffffff' };
    objects[0].clipPath = new fabric.Rect({ width: 5, height: 5 });
    objects[1].clipPath = new fabric.Rect({ width: 6, height: 6 });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerComplexAppearanceById(['a', 'b', 'c'], 'gradientFill')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerComplexAppearanceById(['a', 'b', 'c'], 'pattern')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerComplexAppearanceById(['a', 'b', 'c'], 'clipPath')).toBe(2);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });

  it('sets text style on matching text layer objects only', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    const textObjects = objects as Array<fabric.FabricObject & {
      fontFamily?: string;
      fontSize?: number;
      charSpacing?: number;
      lineHeight?: number;
      textAlign?: string;
      underline?: boolean;
      linethrough?: boolean;
      overline?: boolean;
      setCoords?: () => void;
    }>;
    Object.defineProperty(objects[0], 'type', { value: 'textbox', configurable: true });
    Object.defineProperty(objects[1], 'type', { value: 'i-text', configurable: true });
    textObjects[0].fontFamily = 'Inter';
    textObjects[0].fontSize = 12;
    textObjects[0].charSpacing = 0;
    textObjects[0].lineHeight = 1;
    textObjects[1].fontFamily = 'Roboto';
    textObjects[1].fontSize = 14;
    textObjects[1].charSpacing = 10;
    textObjects[1].lineHeight = 1.1;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectTextStyleById(['a', 'b', 'c'], { target: 'fontFamily', value: ' Source Sans ' })).toBe(2);
    expect(textObjects[0].fontFamily).toBe('Source Sans');
    expect(textObjects[1].fontFamily).toBe('Source Sans');
    expect((objects[2] as fabric.FabricObject & { fontFamily?: string }).fontFamily).toBeUndefined();
    expect(setLayerObjectTextStyleById(['a', 'b', 'c'], { target: 'fontSize', value: 18 })).toBe(2);
    expect(textObjects[0].fontSize).toBe(18);
    expect(textObjects[1].fontSize).toBe(18);
    expect(setLayerObjectTextStyleById(['a', 'b'], { target: 'fontWeight', value: '700' })).toBe(2);
    expect((textObjects[0] as typeof textObjects[number] & { fontWeight?: string }).fontWeight).toBe('700');
    expect((textObjects[1] as typeof textObjects[number] & { fontWeight?: string }).fontWeight).toBe('700');
    expect(setLayerObjectTextStyleById(['a', 'b'], { target: 'fontStyle', value: 'italic' })).toBe(2);
    expect((textObjects[0] as typeof textObjects[number] & { fontStyle?: string }).fontStyle).toBe('italic');
    expect((textObjects[1] as typeof textObjects[number] & { fontStyle?: string }).fontStyle).toBe('italic');
    expect(setLayerObjectTextStyleById(['a', 'b'], { target: 'charSpacing', value: 25 })).toBe(2);
    expect(textObjects[0].charSpacing).toBe(25);
    expect(textObjects[1].charSpacing).toBe(25);
    expect(setLayerObjectTextStyleById(['a'], { target: 'lineHeight', value: 1.4 })).toBe(1);
    expect(textObjects[0].lineHeight).toBe(1.4);
    expect(textObjects[1].lineHeight).toBe(1.1);
    expect(setLayerObjectTextStyleById(['a', 'b'], { target: 'textAlign', value: 'Center' })).toBe(2);
    expect(textObjects[0].textAlign).toBe('center');
    expect(textObjects[1].textAlign).toBe('center');
    expect(setLayerObjectTextStyleById(['a', 'b'], { target: 'underline', value: 'on' })).toBe(2);
    expect(textObjects[0].underline).toBe(true);
    expect(textObjects[1].underline).toBe(true);
    expect(setLayerObjectTextStyleById(['a'], { target: 'linethrough', value: 'yes' })).toBe(1);
    expect(textObjects[0].linethrough).toBe(true);
    expect(setLayerObjectTextStyleById(['a', 'b'], { target: 'overline', value: 'true' })).toBe(2);
    expect(textObjects[0].overline).toBe(true);
    expect(textObjects[1].overline).toBe(true);
    expect(setLayerObjectTextStyleById(['a'], { target: 'underline', value: 'maybe' })).toBe(0);
    expect(setLayerObjectTextStyleById(['a'], { target: 'textAlign', value: 'middle' })).toBe(0);
    expect(setLayerObjectTextStyleById(['a'], { target: 'fontSize', value: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledTimes(10);
  });

  it('selects same text attributes within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    const textObjects = objects as Array<fabric.FabricObject & {
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: string;
      fontStyle?: string;
      charSpacing?: number;
      lineHeight?: number;
      textAlign?: string;
      underline?: boolean;
      linethrough?: boolean;
      overline?: boolean;
    }>;
    Object.defineProperty(objects[0], 'type', { value: 'textbox', configurable: true });
    Object.defineProperty(objects[1], 'type', { value: 'textbox', configurable: true });
    Object.defineProperty(objects[2], 'type', { value: 'textbox', configurable: true });
    textObjects[0].fontFamily = 'Inter';
    textObjects[0].fontSize = 18;
    textObjects[0].fontWeight = '700';
    textObjects[0].fontStyle = 'normal';
    textObjects[0].charSpacing = 20;
    textObjects[0].lineHeight = 1.2;
    textObjects[0].textAlign = 'center';
    textObjects[0].underline = true;
    textObjects[0].linethrough = false;
    textObjects[0].overline = true;
    textObjects[1].fontFamily = ' inter ';
    textObjects[1].fontSize = 18;
    textObjects[1].fontWeight = '700';
    textObjects[1].fontStyle = 'normal';
    textObjects[1].charSpacing = 20;
    textObjects[1].lineHeight = 1.2;
    textObjects[1].textAlign = 'center';
    textObjects[1].underline = true;
    textObjects[1].linethrough = false;
    textObjects[1].overline = true;
    textObjects[2].fontFamily = 'Roboto';
    textObjects[2].fontSize = 18;
    textObjects[2].fontWeight = '400';
    textObjects[2].fontStyle = 'italic';
    textObjects[2].charSpacing = 0;
    textObjects[2].lineHeight = 1;
    textObjects[2].textAlign = 'left';
    textObjects[2].underline = true;
    textObjects[2].linethrough = true;
    textObjects[2].overline = false;
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerTextById(['a', 'b', 'c', 'd'], 'fontFamily')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerTextById(['a', 'b', 'c', 'd'], 'fontSize')).toBe(3);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1], objects[2]]);
    expect(selectSameLayerTextById(['a', 'b', 'c', 'd'], 'textAppearance')).toBe(2);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerTextById(['a', 'c', 'd'], 'fontFamily')).toBe(1);
    expect(setActiveObject.mock.calls[3][0]).toBe(objects[0]);
  });







  it('outlines strokes on matching layer objects', () => {
    const stroked = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#ff0000', strokeWidth: 4 });
    (stroked as fabric.FabricObject & { _id?: string })._id = 'a';
    const unstroked = new fabric.Rect({ left: 30, top: 0, width: 10, height: 10, fill: '#000000', strokeWidth: 0 });
    (unstroked as fabric.FabricObject & { _id?: string })._id = 'b';
    const untouched = new fabric.Rect({ left: 50, top: 0, width: 10, height: 10, fill: '#000000', stroke: '#00ff00', strokeWidth: 3 });
    (untouched as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [stroked, unstroked, untouched];
    const added: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(outlineLayerObjectStrokesById(['a', 'b'])).toBe(1);
    expect(stroked.stroke).toBe('');
    expect(stroked.strokeWidth).toBe(0);
    expect(untouched.stroke).toBe('#00ff00');
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Path);
    expect((added[0] as fabric.Path).fill).toBe('#ff0000');
    expect((added[0] as fabric.Path).fillRule).toBe('evenodd');
    expect(setActiveObject).toHaveBeenCalledWith(added[0]);
    expect(outlineLayerObjectStrokesById(['b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('adds offset path copies for matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Circle({ left: 40, top: 0, radius: 8, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(offsetLayerObjectsById(['a', 'b', 'c'], { offsetMm: 2 })).toBe(2);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(first);
    expect(objects).toContain(second);
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(offsetLayerObjectsById(['a'], { offsetMm: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('builds grommet cut paths for matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 200, height: 100, fill: '#ffffff', strokeWidth: 0 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const ignored = new fabric.Rect({ left: 400, top: 0, width: 80, height: 80, fill: '#000000', strokeWidth: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'b';
    const objects: fabric.FabricObject[] = [first, ignored];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
    } as never);

    const paths = grommetLayerObjectsById(['a'], { insetMm: 2, maxSpacingMm: 20, diameterMm: 4 });
    expect(paths.length).toBeGreaterThanOrEqual(4);
    expect(paths.every((path) => path.closed && path.kind === 'manual' && path.passes === 1)).toBe(true);
    expect(paths.every((path) => path.id.startsWith('gr-'))).toBe(true);
    expect(grommetLayerObjectsById(['missing'], { insetMm: 2, maxSpacingMm: 20, diameterMm: 4 })).toEqual([]);
    expect(grommetLayerObjectsById(['a'], { insetMm: 2, maxSpacingMm: 0, diameterMm: 4 })).toEqual([]);
  });

  it('builds rhinestone cut paths for matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', strokeWidth: 0 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const ignored = new fabric.Rect({ left: 40, top: 0, width: 8, height: 8, fill: '#000000', strokeWidth: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'b';
    const objects: fabric.FabricObject[] = [first, ignored];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
    } as never);

    const paths = rhinestoneLayerObjectsById(['a'], { spacingMm: 5, diameterMm: 2 });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.closed && path.kind === 'manual' && path.passes === 1)).toBe(true);
    expect(paths.every((path) => path.id.startsWith('rs-'))).toBe(true);
    expect(rhinestoneLayerObjectsById(['missing'], { spacingMm: 5, diameterMm: 2 })).toEqual([]);
    expect(rhinestoneLayerObjectsById(['a'], { spacingMm: 0, diameterMm: 2 })).toEqual([]);
  });

  it('creates blend steps between matching layer objects', async () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Rect({ left: 100, top: 20, width: 20, height: 20, fill: '#ffffff', stroke: '#222222', strokeWidth: 3 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Rect({ left: 200, top: 0, width: 8, height: 8, fill: '#ff0000' });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, ignored, second];
    const added: fabric.FabricObject[] = [];
    const moved: Array<{ object: fabric.FabricObject; index: number }> = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      moveObjectTo: vi.fn((object: fabric.FabricObject, index: number) => { moved.push({ object, index }); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    await expect(blendLayerObjectsById(['a', 'b'], { steps: 2, spacingMode: 'specifiedSteps', orientation: 'page' })).resolves.toBe(2);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Rect)).toBe(true);
    expect(added.map((object) => (object as fabric.FabricObject & { __blend?: { stepIndex?: number } }).__blend?.stepIndex)).toEqual([1, 2]);
    expect(moved.map(({ index }) => index)).toEqual([1, 2]);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(objects).toContain(ignored);
    await expect(blendLayerObjectsById(['a'], { steps: 2 })).resolves.toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('applies variable width profiles to matching open strokes', () => {
    const first = new fabric.Path('M 0 0 L 20 0 L 30 10', { fill: '', stroke: '#111111', strokeWidth: 4 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Path('M 40 0 L 50 10 L 60 0', { fill: '', stroke: '#222222', strokeWidth: 6 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Rect({ left: 70, top: 0, width: 8, height: 8, fill: '#000000', stroke: '#333333', strokeWidth: 2 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(variableWidthLayerObjectsById(['a', 'b', 'c'], { profile: 'bulge' })).toBe(2);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#111111');
    expect((added[1] as fabric.Path).fill).toBe('#222222');
    expect(first.stroke).toBe('');
    expect(first.strokeWidth).toBe(0);
    expect(second.stroke).toBe('');
    expect(second.strokeWidth).toBe(0);
    expect(ignored.stroke).toBe('#333333');
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(variableWidthLayerObjectsById(['c'], { profile: 'hourglass' })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('adds multi-outline clones to matching layer objects', async () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Circle({ left: 40, top: 0, radius: 8, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Rect({ left: 70, top: 0, width: 6, height: 6, fill: '#000000' });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      bringObjectToFront: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    await expect(multiOutlineLayerObjectsById(['a', 'b'], { colors: ['#ffffff', '#000000'], widthMm: 1 })).resolves.toBe(4);
    expect(added).toHaveLength(4);
    expect(added.map((object) => object.stroke)).toEqual(['#000000', '#ffffff', '#000000', '#ffffff']);
    expect(added.every((object) => object.paintFirst === 'stroke')).toBe(true);
    expect(objects).toContain(ignored);
    await expect(multiOutlineLayerObjectsById(['missing'], { colors: ['#ffffff'], widthMm: 1 })).resolves.toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('warps matching layer objects across a shared layer-search frame', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Ellipse({ left: 40, top: 0, rx: 8, ry: 6, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(warpLayerObjectsById(['a', 'b', 'c'], { bendPct: 50, style: 'flag' })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(warpLayerObjectsById(['c'], { bendPct: 50, style: 'arc' })).toBe(0);
    expect(warpLayerObjectsById(['missing'], { bendPct: 0, style: 'wave' })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('free-distorts matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Ellipse({ left: 40, top: 0, rx: 8, ry: 6, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(freeDistortLayerObjectsById(['a', 'b', 'c'], { offsets: { tl: [10, -4], tr: [0, 0], br: [0, 0], bl: [10, 4] } })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(freeDistortLayerObjectsById(['c'], { offsets: { tl: [10, -4], tr: [0, 0], br: [0, 0], bl: [10, 4] } })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('rounds corners for matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Polygon([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 12 }], { left: 40, top: 0, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Ellipse({ left: 70, top: 0, rx: 8, ry: 6, fill: '#000000' });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(roundCornersLayerObjectsById(['a', 'b', 'c'], { radiusMm: 2 })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(roundCornersLayerObjectsById(['c'], { radiusMm: 2 })).toBe(0);
    expect(roundCornersLayerObjectsById(['missing'], { radiusMm: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('twists matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Polygon([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 12 }], { left: 40, top: 0, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(twistLayerObjectsById(['a', 'b', 'c'], { angleDeg: 45 })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(twistLayerObjectsById(['c'], { angleDeg: -45 })).toBe(0);
    expect(twistLayerObjectsById(['missing'], { angleDeg: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('zig-zags matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Polygon([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 12 }], { left: 40, top: 0, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(zigzagLayerObjectsById(['a', 'b', 'c'], { sizeMm: 1, ridges: 8, smooth: false })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(zigzagLayerObjectsById(['c'], { sizeMm: 1, ridges: 8, smooth: true })).toBe(0);
    expect(zigzagLayerObjectsById(['missing'], { sizeMm: 0, ridges: 8, smooth: false })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('roughens matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Polygon([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 12 }], { left: 40, top: 0, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(roughenLayerObjectsById(['a', 'b', 'c'], { sizeMm: 1, detailMm: 2 })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(roughenLayerObjectsById(['c'], { sizeMm: 1, detailMm: 2 })).toBe(0);
    expect(roughenLayerObjectsById(['missing'], { sizeMm: 0, detailMm: 2 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('applies pucker bloat to matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Polygon([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 12 }], { left: 40, top: 0, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(puckerLayerObjectsById(['a', 'b', 'c'], { amount: 0.25 })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(puckerLayerObjectsById(['c'], { amount: -0.25 })).toBe(0);
    expect(puckerLayerObjectsById(['missing'], { amount: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('knife-splits matching closed layer objects at center', () => {
    const closed = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (closed as fabric.FabricObject & { _id?: string })._id = 'a';
    const open = new fabric.Path('M 30 0 L 40 0 L 40 10', { fill: '', stroke: '#222222', strokeWidth: 2 });
    (open as fabric.FabricObject & { _id?: string })._id = 'b';
    const untouched = new fabric.Rect({ left: 60, top: 0, width: 8, height: 8, fill: '#000000' });
    (untouched as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [closed, open, untouched];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(knifeSplitLayerObjectsById(['a', 'b'], 'vertical')).toBe(1);
    expect(removed).toEqual([closed]);
    expect(added.length).toBeGreaterThanOrEqual(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect(objects).toContain(open);
    expect(objects).toContain(untouched);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(knifeSplitLayerObjectsById(['b'], 'horizontal')).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('splits matching open layer paths at midpoint', () => {
    const openPath = new fabric.Path('M 0 0 L 10 0 L 10 10', { fill: '', stroke: '#111111', strokeWidth: 2 });
    (openPath as fabric.FabricObject & { _id?: string })._id = 'a';
    const closedPath = new fabric.Path('M 20 0 L 30 0 L 30 10 Z', { fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (closedPath as fabric.FabricObject & { _id?: string })._id = 'b';
    const untouched = new fabric.Path('M 40 0 L 50 0 L 50 10', { fill: '', stroke: '#333333', strokeWidth: 1 });
    (untouched as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [openPath, closedPath, untouched];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((...newObjects: fabric.FabricObject[]) => { added.push(...newObjects); objects.push(...newObjects); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(scissorsSplitLayerObjectsById(['a', 'b'])).toBe(1);
    expect(removed).toEqual([openPath]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).stroke).toBe('#111111');
    expect(objects).toContain(closedPath);
    expect(objects).toContain(untouched);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(scissorsSplitLayerObjectsById(['b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('splits matching layer objects into grid cells', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Rect({ left: 40, top: 0, width: 10, height: 10, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const untouched = new fabric.Rect({ left: 70, top: 0, width: 8, height: 8, fill: '#000000' });
    (untouched as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, untouched];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(splitLayerObjectsIntoGridById(['a', 'b'], { rows: 2, cols: 2, gutterMm: 0 })).toBe(8);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(8);
    expect(added.every((object) => object instanceof fabric.Rect)).toBe(true);
    expect((added[0] as fabric.Rect).fill).toBe('#ffffff');
    expect((added[4] as fabric.Rect).stroke).toBe('#222222');
    expect(objects).toContain(untouched);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(splitLayerObjectsIntoGridById(['missing'], { rows: 2, cols: 2, gutterMm: 0 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('cleans up matching stray layer objects', () => {
    const strayPath = new fabric.Path('M 0 0', { fill: '#ffffff' });
    (strayPath as fabric.FabricObject & { _id?: string })._id = 'a';
    const zeroSize = new fabric.Rect({ left: 20, top: 0, width: 0, height: 0 });
    (zeroSize as fabric.FabricObject & { _id?: string })._id = 'b';
    const validPath = new fabric.Path('M 0 0 L 10 0 L 10 10 Z', { fill: '#abcdef' });
    (validPath as fabric.FabricObject & { _id?: string })._id = 'c';
    const unmatchedJunk = new fabric.Path('M 30 0', { fill: '#000000' });
    (unmatchedJunk as fabric.FabricObject & { _id?: string })._id = 'd';
    const objects: fabric.FabricObject[] = [strayPath, zeroSize, validPath, unmatchedJunk];
    const removed: fabric.FabricObject[] = [];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(cleanUpLayerObjectsById(['a', 'b', 'c'])).toBe(2);
    expect(removed).toEqual([strayPath, zeroSize]);
    expect(objects).toEqual([validPath, unmatchedJunk]);
    expect(cleanUpLayerObjectsById(['c'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('adds anchor points to matching layer paths', () => {
    const first = new fabric.Path('M 0 0 L 10 0 L 10 10 Z', { fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Path('M 20 0 L 30 0 L 30 10 Z', { fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Rect({ left: 50, top: 0, width: 10, height: 10 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const beforeFirstLength = first.path.length;
    const beforeSecondLength = second.path.length;
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(addAnchorsToLayerObjectsById(['a', 'b', 'c'])).toBe(2);
    expect(first.path.length).toBeGreaterThan(beforeFirstLength);
    expect(second.path.length).toBeGreaterThan(beforeSecondLength);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([first, second]);
    expect(addAnchorsToLayerObjectsById(['c'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('reverses matching layer path directions', () => {
    const first = new fabric.Path('M 0 0 L 10 0 L 10 10 Z', { fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Path('M 20 0 L 30 0 L 30 10 Z', { fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Rect({ left: 50, top: 0, width: 10, height: 10 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(reverseLayerObjectsById(['a', 'b', 'c'])).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(reverseLayerObjectsById(['c'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('simplifies matching layer path objects', () => {
    const first = new fabric.Path('M 0 0 L 5 0 L 10 0 L 10 10 L 0 10 Z', { fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Path('M 20 0 L 24 2 L 28 0 L 30 10 L 20 10 Z', { fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Rect({ left: 50, top: 0, width: 10, height: 10 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(simplifyLayerObjectsById(['a', 'b', 'c'], { tolerancePx: 2 })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(simplifyLayerObjectsById(['c'], { tolerancePx: 2 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('smooths matching layer path objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Polygon([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 12 }], { left: 40, top: 0, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const ignored = new fabric.Group([], { left: 70, top: 0 });
    (ignored as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, ignored];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(smoothLayerObjectsById(['a', 'b', 'c'], { iterations: 2 })).toBe(2);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect((added[0] as fabric.Path).fill).toBe('#ffffff');
    expect((added[1] as fabric.Path).stroke).toBe('#222222');
    expect(objects).toContain(ignored);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual(added);
    expect(smoothLayerObjectsById(['c'], { iterations: 1 })).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('makes a compound path from matching layer objects', () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 });
    (first as fabric.FabricObject & { _id?: string })._id = 'a';
    const second = new fabric.Rect({ left: 20, top: 0, width: 10, height: 10, fill: '#abcdef', stroke: '#222222', strokeWidth: 2 });
    (second as fabric.FabricObject & { _id?: string })._id = 'b';
    const untouched = new fabric.Rect({ left: 40, top: 0, width: 10, height: 10, fill: '#000000' });
    (untouched as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [first, second, untouched];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(makeLayerCompoundPathById(['a', 'b'])).toBe(1);
    expect(removed).toEqual([first, second]);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(fabric.Path);
    expect((added[0] as fabric.Path).fill).toBe('#abcdef');
    expect((added[0] as fabric.Path).stroke).toBe('#222222');
    expect((added[0] as fabric.Path).fillRule).toBe('evenodd');
    expect(objects).toContain(untouched);
    expect(setActiveObject).toHaveBeenCalledWith(added[0]);
    expect(makeLayerCompoundPathById(['c'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('releases compound paths on matching layer objects', () => {
    const compound = new fabric.Path('M 0 0 L 10 0 L 10 10 Z M 20 20 L 30 20 L 30 30 Z', { fill: '#112233', stroke: '#445566', strokeWidth: 2 });
    (compound as fabric.FabricObject & { _id?: string })._id = 'a';
    const simple = new fabric.Path('M 0 0 L 5 5 Z', { fill: '#ffffff' });
    (simple as fabric.FabricObject & { _id?: string })._id = 'b';
    const untouched = new fabric.Path('M 50 50 L 60 50 Z M 70 70 L 80 70 Z', { fill: '#abcdef' });
    (untouched as fabric.FabricObject & { _id?: string })._id = 'c';
    const objects: fabric.FabricObject[] = [compound, simple, untouched];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); objects.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(releaseLayerCompoundPathsById(['a', 'b'])).toBe(1);
    expect(removed).toEqual([compound]);
    expect(added).toHaveLength(2);
    expect(added.every((object) => object instanceof fabric.Path)).toBe(true);
    expect(objects).toContain(untouched);
    expect(setActiveObject).toHaveBeenCalled();
    expect(releaseLayerCompoundPathsById(['b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('expands clipping masks on matching layer objects and ungroups matching groups', () => {
    const clipped = rect('a');
    clipped.clipPath = new fabric.Rect({ width: 5, height: 5 });
    const childA = rect('child-a');
    const childB = rect('child-b');
    const group = new fabric.Group([childA, childB]);
    (group as fabric.Group & { _id?: string })._id = 'b';
    group.clipPath = new fabric.Circle({ radius: 4 });
    const untouched = rect('c');
    untouched.clipPath = new fabric.Rect({ width: 8, height: 8 });
    const objects: fabric.FabricObject[] = [clipped, group, untouched];
    const added: fabric.FabricObject[] = [];
    const removed: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      remove: vi.fn((object: fabric.FabricObject) => { removed.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(expandLayerObjectClippingMasksById(['a', 'b'])).toBe(3);
    expect(clipped.clipPath).toBeUndefined();
    expect(group.clipPath).toBeUndefined();
    expect(untouched.clipPath).toBeInstanceOf(fabric.Rect);
    expect(removed).toEqual([group]);
    expect(added).toEqual([childA, childB]);
    expect(setActiveObject).toHaveBeenCalled();
    expect(expandLayerObjectClippingMasksById(['a'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('releases clipping masks on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    objects[0].clipPath = new fabric.Rect({ width: 5, height: 5 });
    objects[1].clipPath = new fabric.Circle({ radius: 4 });
    objects[3].clipPath = new fabric.Rect({ width: 7, height: 7 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(releaseLayerObjectClippingMasksById(['a', 'b', 'c'])).toBe(2);
    expect(objects[0].clipPath).toBeUndefined();
    expect(objects[1].clipPath).toBeUndefined();
    expect(objects[2].clipPath).toBeUndefined();
    expect(objects[3].clipPath).toBeInstanceOf(fabric.Rect);
    expect(releaseLayerObjectClippingMasksById(['a', 'b', 'c'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('clears gradient and pattern fills on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    const gradient = new fabric.Gradient({
      type: 'linear',
      gradientUnits: 'pixels',
      coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
      colorStops: [
        { offset: 0, color: '#112233' },
        { offset: 1, color: '#ffffff' },
      ],
    });
    objects[0].set({ fill: gradient });
    objects[1].set({ fill: '#445566' });
    objects[2].set({ fill: gradient });
    (objects[1] as fabric.FabricObject & { patternSpec?: { kind: string; size: number; color1: string; color2: string } }).patternSpec = { kind: 'checker', size: 12, color1: '#abcdef', color2: '#000000' };
    (objects[3] as fabric.FabricObject & { patternSpec?: { kind: string; size: number; color1: string; color2: string } }).patternSpec = { kind: 'dots', size: 8, color1: '#fedcba', color2: '#111111' };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(clearLayerObjectGradientFillById(['a', 'b'])).toBe(1);
    expect(objects[0].fill).toBe('#112233');
    expect(objects[1].fill).toBe('#445566');
    expect(objects[2].fill).toBe(gradient);
    expect(clearLayerObjectPatternFillById(['a', 'b', 'c'])).toBe(1);
    expect(objects[1].fill).toBe('#abcdef');
    expect((objects[1] as fabric.FabricObject & { patternSpec?: unknown }).patternSpec).toBeUndefined();
    expect((objects[3] as fabric.FabricObject & { patternSpec?: unknown }).patternSpec).toEqual({ kind: 'dots', size: 8, color1: '#fedcba', color2: '#111111' });
    expect(clearLayerObjectGradientFillById(['a', 'b'])).toBe(0);
    expect(clearLayerObjectPatternFillById(['a', 'b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('clears image filters on matching layer image objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    Object.defineProperty(objects[0], 'type', { value: 'image', configurable: true });
    Object.defineProperty(objects[1], 'type', { value: 'image', configurable: true });
    Object.defineProperty(objects[2], 'type', { value: 'image', configurable: true });
    const applyA = vi.fn();
    const applyB = vi.fn();
    (objects[0] as fabric.FabricObject & { filters?: unknown[]; applyFilters?: () => void }).filters = [{ type: 'blur', blur: 0.25 }];
    (objects[0] as fabric.FabricObject & { filters?: unknown[]; applyFilters?: () => void }).applyFilters = applyA;
    (objects[1] as fabric.FabricObject & { filters?: unknown[]; applyFilters?: () => void }).filters = [];
    (objects[1] as fabric.FabricObject & { filters?: unknown[]; applyFilters?: () => void }).applyFilters = applyB;
    (objects[2] as fabric.FabricObject & { filters?: unknown[] }).filters = [{ type: 'sepia' }];
    (objects[3] as fabric.FabricObject & { filters?: unknown[] }).filters = [{ type: 'contrast' }];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(clearLayerObjectImageFiltersById(['a', 'b', 'd'])).toBe(1);
    expect((objects[0] as fabric.FabricObject & { filters?: unknown[] }).filters).toEqual([]);
    expect((objects[1] as fabric.FabricObject & { filters?: unknown[] }).filters).toEqual([]);
    expect((objects[2] as fabric.FabricObject & { filters?: unknown[] }).filters).toEqual([{ type: 'sepia' }]);
    expect((objects[3] as fabric.FabricObject & { filters?: unknown[] }).filters).toEqual([{ type: 'contrast' }]);
    expect(applyA).toHaveBeenCalledOnce();
    expect(applyB).not.toHaveBeenCalled();
    expect(clearLayerObjectImageFiltersById(['a', 'b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('detaches symbol metadata on matching layer objects and nested children', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    (objects[0] as fabric.FabricObject & { symbolId?: string }).symbolId = 'sym-a';
    (objects[1] as fabric.FabricObject & { symbolId?: string; _objects?: fabric.FabricObject[] }).symbolId = 'sym-b';
    const child = rect('child') as fabric.FabricObject & { symbolId?: string };
    child.symbolId = 'sym-b';
    (objects[1] as fabric.FabricObject & { _objects?: fabric.FabricObject[] })._objects = [child];
    (objects[2] as fabric.FabricObject & { symbolId?: string }).symbolId = 'sym-c';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(detachLayerSymbolInstancesById(['a', 'b'])).toBe(3);
    expect((objects[0] as fabric.FabricObject & { symbolId?: string }).symbolId).toBeUndefined();
    expect((objects[1] as fabric.FabricObject & { symbolId?: string }).symbolId).toBeUndefined();
    expect(child.symbolId).toBeUndefined();
    expect((objects[2] as fabric.FabricObject & { symbolId?: string }).symbolId).toBe('sym-c');
    expect(detachLayerSymbolInstancesById(['a', 'b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('selects same symbol and image assets within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    Object.defineProperty(objects[1], 'type', { value: 'image', configurable: true });
    Object.defineProperty(objects[2], 'type', { value: 'image', configurable: true });
    Object.defineProperty(objects[3], 'type', { value: 'image', configurable: true });
    (objects[0] as fabric.FabricObject & { symbolId?: string }).symbolId = 'badge';
    (objects[1] as fabric.FabricObject & { symbolId?: string; _src?: string; filters?: unknown[] }).symbolId = 'badge';
    (objects[1] as fabric.FabricObject & { _src?: string; filters?: unknown[] })._src = 'data:image/png;base64,AAA';
    (objects[2] as fabric.FabricObject & { _src?: string; filters?: unknown[] })._src = ' data:image/png;base64,aaa ';
    (objects[3] as fabric.FabricObject & { _src?: string; filters?: unknown[] })._src = 'data:image/png;base64,BBB';
    (objects[1] as fabric.FabricObject & { filters?: unknown[] }).filters = [{ type: 'blur', blur: 0.25 }];
    (objects[2] as fabric.FabricObject & { filters?: unknown[] }).filters = [{ type: 'blur', blur: 0.25 }];
    (objects[3] as fabric.FabricObject & { filters?: unknown[] }).filters = [{ type: 'contrast', contrast: 0.5 }];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerAssetById(['a', 'b', 'c', 'd'], 'symbol')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerAssetById(['b', 'c', 'd'], 'imageSource')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[1], objects[2]]);
    expect(selectSameLayerAssetById(['b', 'c', 'd'], 'imageFilters')).toBe(2);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[1], objects[2]]);
    expect(selectSameLayerAssetById(['a', 'c', 'd'], 'symbol')).toBe(1);
    expect(setActiveObject.mock.calls[3][0]).toBe(objects[0]);
  });

  it('selects same production flags within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    (objects[0] as fabric.FabricObject & { fillOverprint?: boolean }).fillOverprint = true;
    (objects[1] as fabric.FabricObject & { overprintFill?: boolean }).overprintFill = true;
    (objects[2] as fabric.FabricObject & { strokeOverprint?: boolean }).strokeOverprint = true;
    (objects[0] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind = 'crop';
    (objects[1] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind = 'crop';
    (objects[2] as fabric.FabricObject & { printMarkKind?: string }).printMarkKind = 'registration';
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerProductionById(['a', 'b', 'c'], 'overprint')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerProductionById(['a', 'b', 'c'], 'printMarkKind')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });

  it('selects same object type visibility and lock state within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    Object.defineProperty(objects[3], 'type', { value: 'textbox', configurable: true });
    objects[0].visible = false;
    objects[1].visible = false;
    objects[2].visible = true;
    objects[0].set({ lockMovementX: true });
    objects[1].set({ lockMovementY: true });
    objects[2].set({ lockMovementX: false, lockMovementY: false });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerObjectById(['a', 'b', 'd'], 'type')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerObjectById(['a', 'b', 'c'], 'visibility')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerObjectById(['a', 'b', 'c'], 'lock')).toBe(2);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });


  it('selects same named state and name prefix within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    (objects[0] as fabric.FabricObject & { name?: string }).name = 'Logo-red-01';
    (objects[1] as fabric.FabricObject & { name?: string }).name = 'Logo blue 02';
    (objects[2] as fabric.FabricObject & { name?: string }).name = 'Badge-green';
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerObjectById(['a', 'b', 'c', 'd'], 'named')).toBe(3);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1], objects[2]]);
    expect(selectSameLayerObjectById(['a', 'b', 'c', 'd'], 'namePrefix')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });

  it('selects same fill within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    objects[0].set({ fill: '#112233', stroke: '#000000' });
    objects[1].set({ fill: '#112233', stroke: '#ff0000' });
    objects[2].set({ fill: '#112233', stroke: '#000000' });
    objects[3].set({ fill: '#00ff00', stroke: '#000000' });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerAppearanceById(['a', 'b', 'd'], 'fill')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });


  it('selects same stroke detail attributes within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    objects[0].set({ strokeWidth: 4, strokeLineCap: 'round', strokeLineJoin: 'bevel', strokeDashArray: [6, 2] });
    objects[1].set({ strokeWidth: 4, strokeLineCap: 'round', strokeLineJoin: 'miter', strokeDashArray: [6, 2] });
    objects[2].set({ strokeWidth: 2, strokeLineCap: 'square', strokeLineJoin: 'bevel', strokeDashArray: [1, 1] });
    objects[3].set({ strokeWidth: 4, strokeLineCap: 'round', strokeLineJoin: 'bevel', strokeDashArray: [6, 2] });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'strokeWidth')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'strokeCap')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'strokeJoin')).toBe(2);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[2]]);
    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'dash')).toBe(2);
    expect((setActiveObject.mock.calls[3][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });


  it('selects same miter constant stroke and shadow within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    objects[0].set({ strokeMiterLimit: 8, strokeUniform: true });
    objects[1].set({ strokeMiterLimit: 8, strokeUniform: false });
    objects[2].set({ strokeMiterLimit: 4, strokeUniform: true });
    objects[3].set({ strokeMiterLimit: 8, strokeUniform: true });
    objects[0].shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 6, offsetX: 2, offsetY: 3 });
    objects[1].shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 6, offsetX: 2, offsetY: 3 });
    objects[2].shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.2)', blur: 6, offsetX: 2, offsetY: 3 });
    objects[3].shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 6, offsetX: 2, offsetY: 3 });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'miterLimit')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'strokeUniform')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[2]]);
    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'shadow')).toBe(2);
    expect((setActiveObject.mock.calls[2][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
  });

  it('selects same opacity and blend mode within filtered layer ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    objects[0].opacity = 0.5;
    objects[1].opacity = 0.5;
    objects[2].opacity = 0.9;
    objects[3].opacity = 0.5;
    objects[0].globalCompositeOperation = 'multiply';
    objects[1].globalCompositeOperation = 'screen';
    objects[2].globalCompositeOperation = 'multiply';
    objects[3].globalCompositeOperation = 'multiply';
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'opacity')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(selectSameLayerAppearanceById(['a', 'b', 'c'], 'blendMode')).toBe(2);
    expect((setActiveObject.mock.calls[1][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[2]]);
  });

  it('selects matching layer appearances within filtered ids', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c'), rect('d')];
    objects[0].set({ fill: '#112233', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    objects[1].set({ fill: '#112233', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    objects[2].set({ fill: '#112233', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    objects[3].set({ fill: '#ff0000', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    const setActiveObject = vi.fn();
    const requestRenderAll = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[1],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll,
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(selectMatchingLayerAppearanceById(['a', 'b', 'd'])).toBe(2);
    expect(setActiveObject.mock.calls[0][0]).toBeInstanceOf(fabric.ActiveSelection);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[0], objects[1]]);
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('uses explicit sample id when selecting matching layer appearances', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ fill: '#112233', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    objects[1].set({ fill: '#ff0000', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    objects[2].set({ fill: '#ff0000', stroke: '#000000', strokeWidth: 2, opacity: 1 });
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      getActiveObject: () => objects[0],
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject,
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);

    expect(selectMatchingLayerAppearanceById(['a', 'b', 'c'], 'b')).toBe(2);
    expect((setActiveObject.mock.calls[0][0] as fabric.ActiveSelection).getObjects()).toEqual([objects[1], objects[2]]);
  });



  it('expands appearance on matching layer objects', async () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].shadow = new fabric.Shadow({ color: '#000000', blur: 4, offsetX: 2, offsetY: 3 });
    (objects[1] as fabric.FabricObject & { patternSpec?: { kind: 'checker'; size: number; color1: string; color2: string } }).patternSpec = { kind: 'checker', size: 10, color1: '#ffffff', color2: '#000000' };
    objects[2].set({ fill: '#336699', opacity: 0.5 });
    const added: fabric.FabricObject[] = [];
    const setActiveObject = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(await expandLayerObjectAppearanceById(['a', 'b'])).toBeGreaterThanOrEqual(2);
    expect(objects[0].shadow).toBeNull();
    expect((objects[1] as fabric.FabricObject & { patternSpec?: unknown }).patternSpec).toBeUndefined();
    expect(objects[2].opacity).toBe(0.5);
    expect(added.length).toBeGreaterThan(0);
    expect(setActiveObject).toHaveBeenCalled();
    expect(await expandLayerObjectAppearanceById(['a', 'b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('flattens transparency on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ fill: '#336699', stroke: '#ff0000', opacity: 0.5 });
    objects[0].globalCompositeOperation = 'multiply';
    objects[0].shadow = new fabric.Shadow({ color: '#000000', blur: 4, offsetX: 1, offsetY: 2 });
    objects[1].set({ fill: '#ffffff', opacity: 1 });
    objects[2].set({ fill: '#123456', opacity: 0.25 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(flattenLayerObjectTransparencyById(['a', 'b'])).toBe(1);
    expect(objects[0].opacity).toBe(1);
    expect(objects[0].fill).toBe('rgba(51, 102, 153, 0.5)');
    expect(objects[0].stroke).toBe('rgba(255, 0, 0, 0.5)');
    expect(objects[0].globalCompositeOperation).toBe('source-over');
    expect(objects[0].shadow).toMatchObject({ color: 'rgba(0, 0, 0, 0.5)', blur: 4, offsetX: 1, offsetY: 2 });
    expect(objects[1].opacity).toBe(1);
    expect(objects[2].opacity).toBe(0.25);
    expect(flattenLayerObjectTransparencyById(['a', 'b'])).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('applies graphic style to matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1 });
    objects[1].set({ fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1 });
    objects[2].set({ fill: '#654321', stroke: '#000000', strokeWidth: 1, opacity: 1 });
    const style = {
      id: 'poster',
      name: 'Poster',
      fill: '#112233',
      stroke: '#ff00aa',
      strokeWidth: 5,
      opacity: 0.6,
      blendMode: 'multiply' as GlobalCompositeOperation,
      strokeDashArray: [8, 3],
      strokeLineCap: 'round' as CanvasLineCap,
      strokeLineJoin: 'bevel' as CanvasLineJoin,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 },
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(applyGraphicStyleToLayerObjectsById(['a', 'b'], style)).toBe(2);
    expect(objects[0].fill).toBe('#112233');
    expect(objects[0].stroke).toBe('#ff00aa');
    expect(objects[0].strokeWidth).toBe(5);
    expect(objects[0].opacity).toBe(0.6);
    expect(objects[0].globalCompositeOperation).toBe('multiply');
    expect(objects[0].strokeDashArray).toEqual([8, 3]);
    expect(objects[0].strokeLineCap).toBe('round');
    expect(objects[0].strokeLineJoin).toBe('bevel');
    expect(objects[0].shadow).toBeInstanceOf(fabric.Shadow);
    expect(objects[1].fill).toBe('#112233');
    expect(objects[2].fill).toBe('#654321');
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not commit history when matching graphic style is unchanged', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    const style = {
      id: 'poster',
      name: 'Poster',
      fill: '#112233',
      stroke: '#ff00aa',
      strokeWidth: 5,
      opacity: 0.6,
      blendMode: 'multiply' as GlobalCompositeOperation,
      strokeDashArray: [8, 3],
      strokeLineCap: 'round' as CanvasLineCap,
      strokeLineJoin: 'bevel' as CanvasLineJoin,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 },
    };
    objects[0].set({ fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, opacity: style.opacity, strokeDashArray: style.strokeDashArray, strokeLineCap: style.strokeLineCap, strokeLineJoin: style.strokeLineJoin });
    objects[0].globalCompositeOperation = style.blendMode;
    objects[0].shadow = new fabric.Shadow(style.shadow);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(applyGraphicStyleToLayerObjectsById(['a'], style)).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clears appearance on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].set({ fill: '#ff0000', stroke: '#00ff00', strokeWidth: 8, opacity: 0.4, strokeDashArray: [4, 2], strokeLineCap: 'round', strokeLineJoin: 'bevel' });
    objects[0].globalCompositeOperation = 'multiply';
    objects[0].shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 3, offsetY: 5 });
    objects[1].set({ fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1, strokeDashArray: null, strokeLineCap: 'butt', strokeLineJoin: 'miter' });
    objects[1].globalCompositeOperation = 'source-over';
    objects[1].shadow = null;
    objects[2].set({ fill: '#123456' });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(clearLayerObjectAppearanceById(['a', 'b'])).toBe(1);
    expect(objects[0].fill).toBe('#ffffff');
    expect(objects[0].stroke).toBe('#000000');
    expect(objects[0].strokeWidth).toBe(1);
    expect(objects[0].opacity).toBe(1);
    expect(objects[0].strokeDashArray).toBeNull();
    expect(objects[0].strokeLineCap).toBe('butt');
    expect(objects[0].strokeLineJoin).toBe('miter');
    expect(objects[0].globalCompositeOperation).toBe('source-over');
    expect(objects[0].shadow).toBeNull();
    expect(objects[2].fill).toBe('#123456');
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not commit history when matching appearances are already clear', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].set({ fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1, strokeDashArray: null, strokeLineCap: 'butt', strokeLineJoin: 'miter' });
    objects[0].globalCompositeOperation = 'source-over';
    objects[0].shadow = null;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(clearLayerObjectAppearanceById(['a'])).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('sets miter limit on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].strokeMiterLimit = 4;
    objects[1].strokeMiterLimit = 8;
    objects[2].strokeMiterLimit = 4;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectMiterLimitById(['a', 'b'], { miterLimit: 12 })).toBe(2);
    expect(objects[0].strokeMiterLimit).toBe(12);
    expect(objects[1].strokeMiterLimit).toBe(12);
    expect(objects[2].strokeMiterLimit).toBe(4);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('sets constant stroke width on matching layer objects', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b'), rect('c')];
    objects[0].strokeUniform = false;
    objects[1].strokeUniform = false;
    objects[2].strokeUniform = false;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeUniformById(['a', 'b'], { strokeUniform: true })).toBe(2);
    expect(objects[0].strokeUniform).toBe(true);
    expect(objects[1].strokeUniform).toBe(true);
    expect(objects[2].strokeUniform).toBe(false);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('normalizes layer boolean prompt values', () => {
    expect(normalizeLayerBoolean('on')).toBe(true);
    expect(normalizeLayerBoolean('constant')).toBe(true);
    expect(normalizeLayerBoolean('OFF')).toBe(false);
    expect(normalizeLayerBoolean('scale')).toBe(false);
    expect(normalizeLayerBoolean('maybe')).toBeNull();
  });

  it('does not commit history when constant stroke width is unchanged', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].strokeUniform = true;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeUniformById(['a'], { strokeUniform: true })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when layer miter limit is unchanged or invalid', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].strokeMiterLimit = 4;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectMiterLimitById(['a'], { miterLimit: 4 })).toBe(0);
    expect(setLayerObjectMiterLimitById(['a'], { miterLimit: Number.NaN })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clamps negative matching layer miter limit to zero', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].strokeMiterLimit = 4;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectMiterLimitById(['a'], { miterLimit: -2 })).toBe(1);
    expect(objects[0].strokeMiterLimit).toBe(0);
  });

  it('does not commit history when layer dash pattern is unchanged', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].strokeDashArray = [10, 5];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectDashById(['a'], { dash: [10, 5] })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('normalizes layer stroke cap and join prompt values', () => {
    expect(normalizeLayerStrokeCap(' Round ')).toBe('round');
    expect(normalizeLayerStrokeCap('projecting')).toBeNull();
    expect(normalizeLayerStrokeJoin('BEVEL')).toBe('bevel');
    expect(normalizeLayerStrokeJoin('arcs')).toBeNull();
  });

  it('does not commit history when layer stroke style is unchanged', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].set({ strokeLineCap: 'round' });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeStyleById(['a'], { target: 'cap', value: 'round' })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when layer stroke width is unchanged or invalid', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].strokeWidth = 2;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeWidthById(['a'], { strokeWidth: 2 })).toBe(0);
    expect(setLayerObjectStrokeWidthById(['a'], { strokeWidth: Number.NaN })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clamps negative matching layer stroke width to zero', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].strokeWidth = 2;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectStrokeWidthById(['a'], { strokeWidth: -4 })).toBe(1);
    expect(objects[0].strokeWidth).toBe(0);
  });

  it('normalizes layer paint prompt values', () => {
    expect(normalizeLayerPaint('#abc')).toBe('#abc');
    expect(normalizeLayerPaint('#aabbccdd')).toBe('#aabbccdd');
    expect(normalizeLayerPaint('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    expect(normalizeLayerPaint('none')).toBe('');
    expect(normalizeLayerPaint('')).toBeNull();
    expect(normalizeLayerPaint('red')).toBeNull();
  });

  it('does not commit history when layer paint is unchanged', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].set({ fill: '#ff0000' });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectPaintById(['a'], { target: 'fill', paint: '#ff0000' })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when layer blend mode is unchanged', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].globalCompositeOperation = 'multiply';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectBlendModeById(['a'], { blendMode: 'multiply' })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when layer opacity is unchanged or invalid', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].opacity = 0.5;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectOpacityById(['a'], { opacity: 0.5 })).toBe(0);
    expect(setLayerObjectOpacityById(['a'], { opacity: Number.NaN })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('clamps matching layer object opacity', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    objects[0].opacity = 1;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(setLayerObjectOpacityById(['a'], { opacity: -1 })).toBe(1);
    expect(objects[0].opacity).toBe(0);
  });

  it('does not commit history when layer names are already clean', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b')];
    (objects[0] as fabric.FabricObject & { name?: string | null }).name = 'Logo red';
    (objects[1] as fabric.FabricObject & { name?: string | null }).name = null;
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(cleanLayerObjectNamesById(['a', 'b'])).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when layer name case is unchanged or unnamed', () => {
    const objects: fabric.FabricObject[] = [rect('a'), rect('b')];
    (objects[0] as fabric.FabricObject & { name?: string }).name = 'LOGO';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(changeLayerObjectNameCaseById(['a', 'b'], 'upper')).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when no layer names are replaced', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    (objects[0] as fabric.FabricObject & { name?: string }).name = 'Logo';
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(replaceLayerObjectNamesById(['a'], { find: 'Missing', replace: 'Mark' })).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit history when no ids match', () => {
    const objects: fabric.FabricObject[] = [rect('a')];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => objects,
      bringObjectToFront: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(moveLayerObjectsById(['missing'], 'front')).toBe(0);
    expect(pushHistory).not.toHaveBeenCalled();
  });
});
