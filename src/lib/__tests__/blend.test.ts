import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyBlendOptionsToSelection, blendAngle, blendColor, buildBlendInsertPlan, buildBlendMetadata, buildBlendProps, buildBlendSequence, expandBlendSteps, getBlendStepMetadata, isBlendStepObject, releaseBlendSteps, removeOrphanBlendSteps, relinkBlendEndpointFromSelection, reverseBlendSteps, selectAllBlendEndpoints, selectAllBlendGroups, selectBlendEndpointsFromSelection, selectBlendGroupFromSelection, selectBlendStepsFromSelection, selectOrphanBlendSteps, updateBlendSteps, resolveBlendPairStepCounts, resolveBlendPairSteps, resolveSmoothColorSteps, endpointAngle, estimateBlendStepCount } from '../blend';
import * as canvasEngine from '../canvasEngine';

describe('blend interpolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('interpolates flat hex colors and falls back for unsupported paints', () => {
    expect(blendColor('#000', '#ffffff', 0.5)).toBe('#808080');
    expect(blendColor('#ff0000', '#00ff00', 0.25)).toBe('#bf4000');
    expect(blendColor('red', '#00ff00', 0.5)).toBe('red');
  });

  it('interpolates rgb and rgba color strings with alpha preservation', () => {
    expect(blendColor('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 0.5)).toBe('#808080');
    expect(blendColor('rgba(0, 0, 0, 0.25)', 'rgba(255, 255, 255, 0.75)', 0.5)).toBe('rgba(128, 128, 128, 0.5)');
    expect(blendColor('rgba(255, 0, 0, 0.5)', '#0000ff', 0.5)).toBe('rgba(128, 0, 128, 0.75)');
  });

  it('interpolates rotation through the shortest angle delta', () => {
    expect(blendAngle(350, 10, 0.5)).toBe(0);
    expect(blendAngle(10, 350, 0.5)).toBe(0);
    expect(blendAngle(170, -170, 0.5)).toBe(180);
    expect(blendAngle(undefined, 90, 0.5)).toBe(45);

    const props = buildBlendProps({ angle: 350 }, { angle: 10 }, 0.5);
    expect(props.angle).toBe(0);
  });

  it('can orient blend steps to each segment path direction', () => {
    expect(endpointAngle({ left: 0, top: 0 }, { left: 100, top: 0 })).toBe(0);
    expect(endpointAngle({ left: 0, top: 0 }, { left: 0, top: 100 })).toBe(90);
    expect(endpointAngle({ left: 0, top: 0 }, { left: -100, top: 0 })).toBe(180);
    expect(endpointAngle({ left: 0, top: 0, angle: 35 }, { left: 0, top: 0 })).toBe(35);

    const props = buildBlendProps({ left: 0, top: 0, angle: 10 }, { left: 0, top: 100, angle: 70 }, 0.5, { orientation: 'path' });
    expect(props.angle).toBe(90);
  });

  it('interpolates optional text and rounded-corner numeric attributes', () => {
    const props = buildBlendProps({
      rx: 0,
      ry: 4,
      radius: 10,
      fontSize: 24,
      charSpacing: 0,
      lineHeight: 1,
    }, {
      rx: 20,
      ry: 12,
      radius: 30,
      fontSize: 48,
      charSpacing: 120,
      lineHeight: 1.6,
    }, 0.5);

    expect(props).toMatchObject({
      rx: 10,
      ry: 8,
      radius: 20,
      fontSize: 36,
      charSpacing: 60,
      lineHeight: 1.3,
    });

    const partial = buildBlendProps({ fontSize: 24, charSpacing: 10 }, { charSpacing: 30 }, 0.5);
    expect(partial.fontSize).toBeUndefined();
    expect(partial.charSpacing).toBe(20);
  });

  it('builds Illustrator-like intermediate geometry and appearance props', () => {
    const props = buildBlendProps({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      scaleX: 1,
      scaleY: 2,
      skewX: 0,
      skewY: -10,
      angle: 10,
      opacity: 0.2,
      strokeWidth: 2,
      fill: '#000000',
      stroke: '#ff0000',
      strokeDashArray: [2, 6],
      strokeLineCap: 'butt',
      strokeLineJoin: 'miter',
      globalCompositeOperation: 'source-over',
      shadow: { color: '#000000', blur: 2, offsetX: 1, offsetY: -1 },
    }, {
      left: 30,
      top: 60,
      width: 200,
      height: 150,
      scaleX: 3,
      scaleY: 4,
      skewX: 20,
      skewY: 10,
      angle: 70,
      opacity: 1,
      strokeWidth: 10,
      fill: '#ffffff',
      stroke: '#0000ff',
      strokeDashArray: [10, 2],
      strokeLineCap: 'round',
      strokeLineJoin: 'bevel',
      globalCompositeOperation: 'multiply',
      shadow: { color: '#ffffff', blur: 10, offsetX: 5, offsetY: 3 },
    }, 0.5);

    expect(props).toMatchObject({
      left: 20,
      top: 40,
      width: 150,
      height: 100,
      scaleX: 2,
      scaleY: 3,
      skewX: 10,
      skewY: 0,
      angle: 40,
      strokeWidth: 6,
      fill: '#808080',
      stroke: '#800080',
      strokeDashArray: [6, 4],
      strokeLineCap: 'round',
      strokeLineJoin: 'bevel',
      globalCompositeOperation: 'multiply',
    });
    expect(props.opacity).toBeCloseTo(0.6);
    expect(props.shadow).toMatchObject({ color: '#808080', blur: 6, offsetX: 3, offsetY: 1 });
  });



  it('resolves smooth-color spacing from fill, stroke, shadow, and alpha distance', () => {
    expect(resolveSmoothColorSteps({ fill: '#000000' }, { fill: '#ffffff' })).toBe(18);
    expect(resolveSmoothColorSteps({ fill: 'rgba(0, 0, 0, 0.25)' }, { fill: 'rgba(0, 0, 0, 0.75)' })).toBe(5);
    expect(resolveSmoothColorSteps({ stroke: '#000000' }, { stroke: '#0000ff' })).toBe(10);
    expect(resolveSmoothColorSteps({ shadow: { color: '#000000' } }, { shadow: { color: '#ffffff' } })).toBe(18);
    expect(resolveSmoothColorSteps({ fill: 'red' }, { fill: '#ffffff' })).toBe(0);
    expect(resolveBlendPairSteps({ fill: '#000000' }, { fill: '#ffffff' }, 5, { spacingMode: 'smoothColor' })).toBe(18);
  });

  it('builds smooth-color sequences using automatic per-pair steps', () => {
    const sequence = buildBlendSequence([
      { left: 0, fill: '#000000' },
      { left: 100, fill: '#303030' },
      { left: 200, fill: '#ffffff' },
    ], 5, { spacingMode: 'smoothColor' });

    expect(sequence).toHaveLength(17);
    expect(sequence[0]).toMatchObject({ fill: '#0c0c0c' });
    expect(sequence[2]).toMatchObject({ fill: '#242424' });
    expect(sequence[3]).toMatchObject({ fill: '#3e3e3e' });
    expect(sequence.at(-1)).toMatchObject({ fill: '#f1f1f1' });
  });

  it('builds metadata for generated blend steps', () => {
    expect(buildBlendMetadata(0, 2, 5)).toEqual({
      kind: 'blendStep',
      blendId: 'forward:0',
      sourceIds: ['', ''],
      pairIndex: 0,
      stepIndex: 2,
      stepsInPair: 5,
      t: 2 / 6,
      spacingMode: 'specifiedSteps',
      orientation: 'page',
      reverse: false,
    });
    expect(buildBlendMetadata(1, 1, 3, { reverse: true, spacingMode: 'specifiedDistance', orientation: 'path' })).toEqual({
      kind: 'blendStep',
      blendId: 'reverse:1',
      sourceIds: ['', ''],
      pairIndex: 1,
      stepIndex: 1,
      stepsInPair: 3,
      t: 0.25,
      spacingMode: 'specifiedDistance',
      orientation: 'path',
      reverse: true,
    });
  });

  it('estimates total generated blend steps from current options', () => {
    const endpoints = [
      { left: 0, top: 0, fill: '#000000' },
      { left: 100, top: 0, fill: '#303030' },
      { left: 150, top: 0, fill: '#ffffff' },
    ];

    expect(resolveBlendPairStepCounts(endpoints, 2)).toEqual([2, 2]);
    expect(estimateBlendStepCount(endpoints, 2)).toBe(4);
    expect(resolveBlendPairStepCounts(endpoints, 5, { spacingMode: 'specifiedDistance', distancePx: 25 })).toEqual([3, 1]);
    expect(estimateBlendStepCount(endpoints, 5, { spacingMode: 'specifiedDistance', distancePx: 25 })).toBe(4);
    expect(estimateBlendStepCount(endpoints, 5, { spacingMode: 'smoothColor' })).toBe(17);
    expect(estimateBlendStepCount([endpoints[0]], 5)).toBe(0);
  });

  it('resolves specified-distance spacing per adjacent endpoint pair', () => {
    expect(resolveBlendPairSteps({ left: 0, top: 0 }, { left: 100, top: 0 }, 5, { spacingMode: 'specifiedDistance', distancePx: 25 })).toBe(3);
    expect(resolveBlendPairSteps({ left: 0, top: 0 }, { left: 10, top: 0 }, 5, { spacingMode: 'specifiedDistance', distancePx: 25 })).toBe(0);
    expect(resolveBlendPairSteps({ left: 0, top: 0 }, { left: 100, top: 0 }, 5, { spacingMode: 'specifiedSteps' })).toBe(5);
  });

  it('builds variable-step sequences from specified distance spacing', () => {
    const sequence = buildBlendSequence([
      { left: 0, top: 0, fill: '#000000' },
      { left: 100, top: 0, fill: '#ffffff' },
      { left: 150, top: 0, fill: '#000000' },
    ], 5, { spacingMode: 'specifiedDistance', distancePx: 25 });

    expect(sequence).toHaveLength(4);
    expect(sequence[0]).toMatchObject({ left: 25, fill: '#404040' });
    expect(sequence[2]).toMatchObject({ left: 75, fill: '#bfbfbf' });
    expect(sequence[3]).toMatchObject({ left: 125, fill: '#808080' });
  });

  it('plans blend insert positions between original z-order endpoints', () => {
    expect(buildBlendInsertPlan([2, 5], 3)).toEqual([3, 4, 5]);
    expect(buildBlendInsertPlan([2, 5, 9], 2)).toEqual([3, 4, 8, 9]);
    expect(buildBlendInsertPlan([9, 5, 2], 2)).toEqual([6, 7, 3, 4]);
    expect(buildBlendInsertPlan([2, 5, 9], [3, 1])).toEqual([3, 4, 5, 9]);
    expect(buildBlendInsertPlan([2], 2)).toEqual([]);
    expect(buildBlendInsertPlan([2, 5], 0)).toEqual([]);
  });

  it('can reverse the multi-stop blend spine without reordering the originals', () => {
    const sequence = buildBlendSequence([
      { left: 0, fill: '#000000' },
      { left: 30, fill: '#ffffff' },
      { left: 60, fill: '#000000' },
    ], 1, { reverse: true });

    expect(sequence).toHaveLength(2);
    expect(sequence[0]).toMatchObject({ left: 45, fill: '#808080' });
    expect(sequence[1]).toMatchObject({ left: 15, fill: '#808080' });
  });

  it('applies path orientation independently for each multi-stop segment', () => {
    const sequence = buildBlendSequence([
      { left: 0, top: 0, angle: 0 },
      { left: 100, top: 0, angle: 45 },
      { left: 100, top: 100, angle: 90 },
    ], 1, { orientation: 'path' });

    expect(sequence).toHaveLength(2);
    expect(sequence[0].angle).toBe(0);
    expect(sequence[1].angle).toBe(90);
  });

  it('builds adjacent blend segments across multiple selected endpoints', () => {
    const sequence = buildBlendSequence([
      { left: 0, top: 0, fill: '#000000' },
      { left: 30, top: 60, fill: '#ffffff' },
      { left: 60, top: 0, fill: '#000000' },
    ], 2);

    expect(sequence).toHaveLength(4);
    expect(sequence[0]).toMatchObject({ left: 10, top: 20, fill: '#555555' });
    expect(sequence[1]).toMatchObject({ left: 20, top: 40, fill: '#aaaaaa' });
    expect(sequence[2]).toMatchObject({ left: 40, top: 40, fill: '#aaaaaa' });
    expect(sequence[3]).toMatchObject({ left: 50, top: 20, fill: '#555555' });
  });


  it('recognizes and sanitizes generated blend-step metadata', () => {
    const metadata = getBlendStepMetadata({ __blend: { kind: 'blendStep', pairIndex: 1.9, stepIndex: 2.2, stepsInPair: 3.8, t: 1.5, spacingMode: 'smoothColor', orientation: 'path', reverse: true } });

    expect(metadata).toEqual({ kind: 'blendStep', blendId: '', sourceIds: ['', ''], pairIndex: 1, stepIndex: 2, stepsInPair: 3, t: 1, spacingMode: 'smoothColor', orientation: 'path', reverse: true });
    expect(isBlendStepObject({ __blend: metadata })).toBe(true);
    expect(getBlendStepMetadata({ __blend: { kind: 'other' } })).toBeNull();
  });


  it('builds endpoint-aware blend metadata', () => {
    expect(buildBlendMetadata(2, 1, 4, { reverse: true, spacingMode: 'specifiedDistance', orientation: 'path' }, ['o7', 'o9'])).toEqual({
      kind: 'blendStep',
      blendId: 'reverse:o7→o9:2',
      sourceIds: ['o7', 'o9'],
      pairIndex: 2,
      stepIndex: 1,
      stepsInPair: 4,
      t: 0.2,
      spacingMode: 'specifiedDistance',
      orientation: 'path',
      reverse: true,
    });
  });

  it('selects related blend steps by blend id rather than pair index alone', () => {
    const selected = new fabric.Rect();
    const related = new fabric.Rect();
    const unrelatedSamePair = new fabric.Rect();
    selected.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['a', 'b']));
    related.set('__blend', buildBlendMetadata(0, 2, 2, {}, ['a', 'b']));
    unrelatedSamePair.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['c', 'd']));
    const canvas = { getActiveObjects: () => [selected], getObjects: () => [selected, related, unrelatedSamePair], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendStepsFromSelection()).toBe(2);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([selected, related]);
  });



  it('selects related blend steps from a selected endpoint object', () => {
    const endpoint = new fabric.Rect();
    const related = new fabric.Rect();
    const unrelated = new fabric.Rect();
    (endpoint as { _id?: string })._id = 'endpoint-a';
    related.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['endpoint-a', 'endpoint-b']));
    unrelated.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['other-a', 'other-b']));
    const canvas = { getActiveObjects: () => [endpoint], getObjects: () => [endpoint, related, unrelated], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendStepsFromSelection()).toBe(1);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(related);
  });

  it('selects blend endpoint objects from selected generated steps', () => {
    const start = new fabric.Rect();
    const end = new fabric.Rect();
    const blendStep = new fabric.Rect();
    const unrelated = new fabric.Rect();
    (start as { _id?: string })._id = 'start';
    (end as { _id?: string })._id = 'end';
    (unrelated as { _id?: string })._id = 'other';
    blendStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['start', 'end']));
    const canvas = { getActiveObjects: () => [blendStep], getObjects: () => [start, blendStep, unrelated, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendEndpointsFromSelection()).toBe(2);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([start, end]);
  });



  it('selects all blend endpoint objects across the document', () => {
    const start = new fabric.Rect();
    const middle = new fabric.Rect();
    const end = new fabric.Rect();
    const stepA = new fabric.Rect();
    const stepB = new fabric.Rect();
    const unrelated = new fabric.Rect();
    (start as { _id?: string })._id = 'all-endpoints-start';
    (middle as { _id?: string })._id = 'all-endpoints-middle';
    (end as { _id?: string })._id = 'all-endpoints-end';
    (unrelated as { _id?: string })._id = 'not-a-blend-endpoint';
    stepA.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['all-endpoints-start', 'all-endpoints-middle']));
    stepB.set('__blend', buildBlendMetadata(1, 1, 2, {}, ['all-endpoints-middle', 'all-endpoints-end']));
    const canvas = { getActiveObjects: () => [], getObjects: () => [start, stepA, unrelated, middle, stepB, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllBlendEndpoints()).toBe(3);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([start, middle, end]);
  });

  it('does not select all blend endpoints when no generated steps exist', () => {
    const object = new fabric.Rect();
    const canvas = { getActiveObjects: () => [], getObjects: () => [object], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllBlendEndpoints()).toBe(0);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });


  it('selects all blend groups across the document', () => {
    const start = new fabric.Rect();
    const end = new fabric.Rect();
    const stepA = new fabric.Rect();
    const stepB = new fabric.Rect();
    const unrelated = new fabric.Rect();
    (start as { _id?: string })._id = 'all-groups-start';
    (end as { _id?: string })._id = 'all-groups-end';
    (unrelated as { _id?: string })._id = 'all-groups-unrelated';
    stepA.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['all-groups-start', 'all-groups-end']));
    stepB.set('__blend', buildBlendMetadata(0, 2, 2, {}, ['all-groups-start', 'all-groups-end']));
    const canvas = { getActiveObjects: () => [], getObjects: () => [start, stepA, unrelated, stepB, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllBlendGroups()).toBe(4);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([start, stepA, stepB, end]);
  });

  it('does not select all blend groups when no generated steps exist', () => {
    const object = new fabric.Rect();
    const canvas = { getActiveObjects: () => [], getObjects: () => [object], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllBlendGroups()).toBe(0);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });

  it('selects a complete blend group from a generated step', () => {
    const start = new fabric.Rect();
    const end = new fabric.Rect();
    const selected = new fabric.Rect();
    const related = new fabric.Rect();
    const unrelatedStep = new fabric.Rect();
    (start as { _id?: string })._id = 'group-start';
    (end as { _id?: string })._id = 'group-end';
    selected.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['group-start', 'group-end']));
    related.set('__blend', buildBlendMetadata(0, 2, 2, {}, ['group-start', 'group-end']));
    unrelatedStep.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['other-start', 'other-end']));
    const canvas = { getActiveObjects: () => [selected], getObjects: () => [start, selected, unrelatedStep, related, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendGroupFromSelection()).toBe(4);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([start, selected, related, end]);
  });


  it('selects a complete blend group from a selected endpoint object', () => {
    const start = new fabric.Rect();
    const end = new fabric.Rect();
    const relatedA = new fabric.Rect();
    const relatedB = new fabric.Rect();
    const unrelated = new fabric.Rect();
    (start as { _id?: string })._id = 'endpoint-group-start';
    (end as { _id?: string })._id = 'endpoint-group-end';
    relatedA.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['endpoint-group-start', 'endpoint-group-end']));
    relatedB.set('__blend', buildBlendMetadata(0, 2, 2, {}, ['endpoint-group-start', 'endpoint-group-end']));
    unrelated.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['other-start', 'other-end']));
    const canvas = { getActiveObjects: () => [start], getObjects: () => [start, relatedA, unrelated, relatedB, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendGroupFromSelection()).toBe(4);
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([start, relatedA, relatedB, end]);
  });

  it('does not select a blend group for non-blend selections', () => {
    const object = new fabric.Rect();
    const canvas = { getActiveObjects: () => [object], getObjects: () => [object], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendGroupFromSelection()).toBe(0);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });

  it('does not select endpoints for legacy blend metadata without source ids', () => {
    const blendStep = new fabric.Rect();
    blendStep.set('__blend', buildBlendMetadata(0, 1, 3));
    const canvas = { getActiveObjects: () => [blendStep], getObjects: () => [blendStep], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectBlendEndpointsFromSelection()).toBe(0);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });


  it('updates generated blend steps from their current source endpoints', () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000', opacity: 1 });
    const end = new fabric.Rect({ left: 100, top: 60, width: 30, height: 30, fill: '#ffffff', opacity: 0.5 });
    const blendStep = new fabric.Rect({ left: 10, top: 10, width: 10, height: 10, fill: '#111111', opacity: 1 });
    (start as { _id?: string })._id = 'start';
    (end as { _id?: string })._id = 'end';
    blendStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['start', 'end']));
    const canvas = { getActiveObjects: () => [blendStep], getObjects: () => [start, blendStep, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(updateBlendSteps()).toBe(1);
    expect(blendStep.left).toBe(25);
    expect(blendStep.top).toBe(15);
    expect(blendStep.width).toBe(15);
    expect(blendStep.height).toBe(15);
    expect(blendStep.fill).toBe('#404040');
    expect(blendStep.opacity).toBe(0.875);
    expect(getBlendStepMetadata(blendStep)?.sourceIds).toEqual(['start', 'end']);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });



  it('updates generated blend steps when a source endpoint is selected', () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000' });
    const end = new fabric.Rect({ left: 120, top: 0, width: 30, height: 30, fill: '#ffffff' });
    const blendStep = new fabric.Rect({ left: 2, top: 2, width: 2, height: 2, fill: '#111111' });
    const unrelatedStep = new fabric.Rect({ left: 3, top: 3, width: 3, height: 3, fill: '#222222' });
    (start as { _id?: string })._id = 'update-start';
    (end as { _id?: string })._id = 'update-end';
    blendStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['update-start', 'update-end']));
    unrelatedStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['other-start', 'other-end']));
    const canvas = { getActiveObjects: () => [start], getObjects: () => [start, blendStep, unrelatedStep, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(updateBlendSteps()).toBe(1);
    expect(blendStep.left).toBe(30);
    expect(blendStep.width).toBe(15);
    expect(blendStep.fill).toBe('#404040');
    expect(unrelatedStep.left).toBe(3);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('updates all document blend steps even when only one is selected', () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000' });
    const end = new fabric.Rect({ left: 80, top: 0, width: 50, height: 50, fill: '#ffffff' });
    const selectedStep = new fabric.Rect({ left: 1, top: 1, width: 1, height: 1, fill: '#111111' });
    const unselectedStep = new fabric.Rect({ left: 1, top: 1, width: 1, height: 1, fill: '#222222' });
    (start as { _id?: string })._id = 'all-start';
    (end as { _id?: string })._id = 'all-end';
    selectedStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['all-start', 'all-end']));
    unselectedStep.set('__blend', buildBlendMetadata(0, 2, 3, {}, ['all-start', 'all-end']));
    const canvas = { getActiveObjects: () => [selectedStep], getObjects: () => [start, selectedStep, unselectedStep, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(updateBlendSteps('document')).toBe(2);
    expect(selectedStep.left).toBe(20);
    expect(unselectedStep.left).toBe(40);
    expect(selectedStep.fill).toBe('#404040');
    expect(unselectedStep.fill).toBe('#808080');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('applies new blend options to selected existing blend steps', async () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000', angle: 0 });
    const end = new fabric.Rect({ left: 90, top: 0, width: 20, height: 20, fill: '#ffffff', angle: 90 });
    const oldStep = new fabric.Rect({ left: 1, top: 1, width: 1, height: 1, fill: '#111111' });
    (start as { _id?: string })._id = 'options-start';
    (end as { _id?: string })._id = 'options-end';
    oldStep.set('__blend', buildBlendMetadata(0, 1, 1, {}, ['options-start', 'options-end']));
    const objects: fabric.FabricObject[] = [start, oldStep, end];
    const canvas = {
      getActiveObjects: () => [oldStep],
      getObjects: () => objects,
      remove: vi.fn((object: fabric.FabricObject) => { const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      moveObjectTo: vi.fn((object: fabric.FabricObject, index: number) => { const current = objects.indexOf(object); if (current >= 0) objects.splice(current, 1); objects.splice(index, 0, object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await applyBlendOptionsToSelection(2, { orientation: 'path' })).toBe(2);
    expect(canvas.remove).toHaveBeenCalledWith(oldStep);
    expect(canvas.add).toHaveBeenCalledTimes(2);
    const first = canvas.add.mock.calls[0][0] as fabric.FabricObject;
    const second = canvas.add.mock.calls[1][0] as fabric.FabricObject;
    expect(getBlendStepMetadata(first)?.t).toBeCloseTo(1 / 3);
    expect(getBlendStepMetadata(second)?.t).toBeCloseTo(2 / 3);
    expect(getBlendStepMetadata(first)?.orientation).toBe('path');
    expect(getBlendStepMetadata(first)?.stepsInPair).toBe(2);
    expect(getBlendStepMetadata(second)?.stepIndex).toBe(2);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('relinks a selected blend endpoint to a replacement object', () => {
    const oldStart = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000' });
    const replacement = new fabric.Rect({ left: 100, top: 0, width: 20, height: 20, fill: '#ff0000' });
    const end = new fabric.Rect({ left: 200, top: 0, width: 30, height: 30, fill: '#ffffff' });
    const step = new fabric.Rect({ left: 50, top: 0, width: 10, height: 10, fill: '#111111' });
    (oldStart as { _id?: string })._id = 'relink-old-start';
    (end as { _id?: string })._id = 'relink-end';
    step.set('__blend', buildBlendMetadata(0, 1, 3, { orientation: 'page' }, ['relink-old-start', 'relink-end']));
    const canvas = { getActiveObjects: () => [oldStart, replacement], getObjects: () => [oldStart, replacement, step, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(relinkBlendEndpointFromSelection()).toBe(1);
    const replacementId = String((replacement as { _id?: string })._id ?? '');
    expect(replacementId).toBeTruthy();
    expect(getBlendStepMetadata(step)?.sourceIds).toEqual([replacementId, 'relink-end']);
    expect(step.left).toBe(125);
    expect(step.fill).toBe('#ff4040');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not relink blend endpoints when both selected objects are already sources', () => {
    const start = new fabric.Rect();
    const end = new fabric.Rect();
    const step = new fabric.Rect();
    (start as { _id?: string })._id = 'ambiguous-start';
    (end as { _id?: string })._id = 'ambiguous-end';
    step.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['ambiguous-start', 'ambiguous-end']));
    const canvas = { getActiveObjects: () => [start, end], getObjects: () => [start, step, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(relinkBlendEndpointFromSelection()).toBe(0);
    expect(getBlendStepMetadata(step)?.sourceIds).toEqual(['ambiguous-start', 'ambiguous-end']);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('applies blend options from a selected endpoint', async () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000' });
    const end = new fabric.Rect({ left: 80, top: 0, width: 20, height: 20, fill: '#ffffff' });
    const oldStep = new fabric.Rect({ left: 1, top: 1, width: 1, height: 1, fill: '#111111' });
    const unrelated = new fabric.Rect({ left: 2, top: 2, width: 2, height: 2, fill: '#222222' });
    (start as { _id?: string })._id = 'endpoint-options-start';
    (end as { _id?: string })._id = 'endpoint-options-end';
    oldStep.set('__blend', buildBlendMetadata(0, 1, 1, {}, ['endpoint-options-start', 'endpoint-options-end']));
    unrelated.set('__blend', buildBlendMetadata(0, 1, 1, {}, ['other-start', 'other-end']));
    const objects: fabric.FabricObject[] = [start, oldStep, unrelated, end];
    const canvas = {
      getActiveObjects: () => [start],
      getObjects: () => objects,
      remove: vi.fn((object: fabric.FabricObject) => { const index = objects.indexOf(object); if (index >= 0) objects.splice(index, 1); }),
      add: vi.fn((object: fabric.FabricObject) => { objects.push(object); }),
      moveObjectTo: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await applyBlendOptionsToSelection(1, { reverse: true })).toBe(1);
    expect(canvas.remove).toHaveBeenCalledWith(oldStep);
    expect(canvas.remove).not.toHaveBeenCalledWith(unrelated);
    const created = canvas.add.mock.calls[0][0] as fabric.FabricObject;
    expect(getBlendStepMetadata(created)?.sourceIds).toEqual(['endpoint-options-end', 'endpoint-options-start']);
    expect(getBlendStepMetadata(created)?.reverse).toBe(true);
  });

  it('skips updating blend steps when source endpoints are missing', () => {
    const blendStep = new fabric.Rect();
    blendStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['missing-a', 'missing-b']));
    const canvas = { getActiveObjects: () => [blendStep], getObjects: () => [blendStep], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(updateBlendSteps()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('expands selected blend steps by clearing metadata', () => {
    const object = { __blend: buildBlendMetadata(0, 1, 2), set(key: string, value: unknown) { (this as Record<string, unknown>)[key] = value; } };
    const canvas = { getActiveObjects: () => [object], getObjects: () => [object], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(expandBlendSteps()).toBe(1);
    expect(object.__blend).toBeUndefined();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });



  it('expands related blend steps when a source endpoint is selected', () => {
    const endpoint = { _id: 'expand-endpoint' };
    const related = { __blend: buildBlendMetadata(0, 1, 2, {}, ['expand-endpoint', 'expand-other']), set(key: string, value: unknown) { (this as Record<string, unknown>)[key] = value; } };
    const unrelated = { __blend: buildBlendMetadata(0, 1, 2, {}, ['other-a', 'other-b']), set(key: string, value: unknown) { (this as Record<string, unknown>)[key] = value; } };
    const canvas = { getActiveObjects: () => [endpoint], getObjects: () => [endpoint, related, unrelated], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(expandBlendSteps()).toBe(1);
    expect(related.__blend).toBeUndefined();
    expect(unrelated.__blend).toEqual(buildBlendMetadata(0, 1, 2, {}, ['other-a', 'other-b']));
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('expands all document blend steps without requiring selection', () => {
    const selected = { __blend: buildBlendMetadata(0, 1, 2), set(key: string, value: unknown) { (this as Record<string, unknown>)[key] = value; } };
    const unselected = { __blend: buildBlendMetadata(0, 2, 2), set(key: string, value: unknown) { (this as Record<string, unknown>)[key] = value; } };
    const endpoint = { fill: '#fff' };
    const canvas = { getActiveObjects: () => [selected], getObjects: () => [selected, endpoint, unselected], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(expandBlendSteps('document')).toBe(2);
    expect(selected.__blend).toBeUndefined();
    expect(unselected.__blend).toBeUndefined();
    expect((endpoint as { __blend?: unknown }).__blend).toBeUndefined();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('reverses selected blend steps by swapping endpoints and step order', () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000' });
    const end = new fabric.Rect({ left: 100, top: 0, width: 30, height: 30, fill: '#ffffff' });
    const blendStep = new fabric.Rect({ left: 25, top: 0, width: 15, height: 15, fill: '#404040' });
    (start as { _id?: string })._id = 'reverse-start';
    (end as { _id?: string })._id = 'reverse-end';
    blendStep.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['reverse-start', 'reverse-end']));
    const canvas = { getActiveObjects: () => [blendStep], getObjects: () => [start, blendStep, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(reverseBlendSteps()).toBe(1);
    const metadata = getBlendStepMetadata(blendStep);
    expect(metadata).toMatchObject({ sourceIds: ['reverse-end', 'reverse-start'], stepIndex: 3, stepsInPair: 3, t: 0.75, reverse: true });
    expect(blendStep.left).toBe(25);
    expect(blendStep.width).toBe(15);
    expect(blendStep.fill).toBe('#404040');
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('reverses related blend steps when a source endpoint is selected', () => {
    const start = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000000' });
    const end = new fabric.Rect({ left: 100, top: 0, width: 30, height: 30, fill: '#ffffff' });
    const related = new fabric.Rect({ left: 50, top: 0, width: 20, height: 20, fill: '#808080' });
    const unrelated = new fabric.Rect({ left: 5, top: 0, width: 10, height: 10, fill: '#111111' });
    (start as { _id?: string })._id = 'endpoint-reverse-start';
    (end as { _id?: string })._id = 'endpoint-reverse-end';
    related.set('__blend', buildBlendMetadata(0, 2, 3, {}, ['endpoint-reverse-start', 'endpoint-reverse-end']));
    unrelated.set('__blend', buildBlendMetadata(0, 1, 3, {}, ['other-start', 'other-end']));
    const canvas = { getActiveObjects: () => [start], getObjects: () => [start, related, unrelated, end], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(reverseBlendSteps()).toBe(1);
    expect(getBlendStepMetadata(related)?.sourceIds).toEqual(['endpoint-reverse-end', 'endpoint-reverse-start']);
    expect(getBlendStepMetadata(related)?.stepIndex).toBe(2);
    expect(getBlendStepMetadata(unrelated)?.sourceIds).toEqual(['other-start', 'other-end']);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('releases selected blend steps without removing endpoints', () => {
    const blendStep = { __blend: buildBlendMetadata(0, 1, 2) };
    const endpoint = { fill: '#fff' };
    const canvas = { getActiveObjects: () => [blendStep, endpoint], getObjects: () => [blendStep, endpoint], remove: vi.fn(), discardActiveObject: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(releaseBlendSteps()).toBe(1);
    expect(canvas.remove).toHaveBeenCalledWith(blendStep);
    expect(canvas.remove).not.toHaveBeenCalledWith(endpoint);
    expect(pushHistory).toHaveBeenCalledOnce();
  });



  it('releases related blend steps when a source endpoint is selected', () => {
    const endpoint = { _id: 'release-endpoint' };
    const related = { __blend: buildBlendMetadata(0, 1, 2, {}, ['release-endpoint', 'release-other']) };
    const unrelated = { __blend: buildBlendMetadata(0, 1, 2, {}, ['other-a', 'other-b']) };
    const canvas = { getActiveObjects: () => [endpoint], getObjects: () => [endpoint, related, unrelated], remove: vi.fn(), discardActiveObject: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(releaseBlendSteps()).toBe(1);
    expect(canvas.remove).toHaveBeenCalledWith(related);
    expect(canvas.remove).not.toHaveBeenCalledWith(endpoint);
    expect(canvas.remove).not.toHaveBeenCalledWith(unrelated);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('releases all document blend steps without removing endpoints', () => {
    const selectedStep = { __blend: buildBlendMetadata(0, 1, 2) };
    const unselectedStep = { __blend: buildBlendMetadata(0, 2, 2) };
    const endpoint = { fill: '#fff' };
    const canvas = { getActiveObjects: () => [selectedStep], getObjects: () => [selectedStep, endpoint, unselectedStep], remove: vi.fn(), discardActiveObject: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(releaseBlendSteps('document')).toBe(2);
    expect(canvas.remove).toHaveBeenCalledWith(selectedStep);
    expect(canvas.remove).toHaveBeenCalledWith(unselectedStep);
    expect(canvas.remove).not.toHaveBeenCalledWith(endpoint);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('selects orphan blend steps whose source endpoints are missing', () => {
    const start = new fabric.Rect();
    const valid = new fabric.Rect();
    const orphanMissingEnd = new fabric.Rect();
    const orphanLegacy = new fabric.Rect();
    const end = new fabric.Rect();
    (start as { _id?: string })._id = 'select-orphan-start';
    (end as { _id?: string })._id = 'select-orphan-end';
    valid.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['select-orphan-start', 'select-orphan-end']));
    orphanMissingEnd.set('__blend', buildBlendMetadata(0, 2, 2, {}, ['select-orphan-start', 'missing-end']));
    orphanLegacy.set('__blend', buildBlendMetadata(0, 1, 2));
    const canvas = { getActiveObjects: () => [], getObjects: () => [start, valid, orphanMissingEnd, orphanLegacy, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOrphanBlendSteps()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as { _objects?: unknown[] };
    expect(selection._objects).toEqual([orphanMissingEnd, orphanLegacy]);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not select orphan blend steps when all endpoints exist', () => {
    const start = new fabric.Rect();
    const step = new fabric.Rect();
    const end = new fabric.Rect();
    (start as { _id?: string })._id = 'no-orphan-start';
    (end as { _id?: string })._id = 'no-orphan-end';
    step.set('__blend', buildBlendMetadata(0, 1, 2, {}, ['no-orphan-start', 'no-orphan-end']));
    const canvas = { getActiveObjects: () => [], getObjects: () => [start, step, end], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectOrphanBlendSteps()).toBe(0);
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });

  it('removes orphan blend steps whose source endpoints are missing', () => {
    const start = { _id: 'orphan-start' };
    const valid = { __blend: buildBlendMetadata(0, 1, 2, {}, ['orphan-start', 'orphan-end']) };
    const orphanMissingEnd = { __blend: buildBlendMetadata(0, 2, 2, {}, ['orphan-start', 'missing-end']) };
    const orphanLegacy = { __blend: buildBlendMetadata(0, 1, 2) };
    const end = { _id: 'orphan-end' };
    const canvas = { getActiveObjects: () => [], getObjects: () => [start, valid, orphanMissingEnd, orphanLegacy, end], remove: vi.fn(), discardActiveObject: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(removeOrphanBlendSteps()).toBe(2);
    expect(canvas.remove).toHaveBeenCalledWith(orphanMissingEnd);
    expect(canvas.remove).toHaveBeenCalledWith(orphanLegacy);
    expect(canvas.remove).not.toHaveBeenCalledWith(valid);
    expect(canvas.remove).not.toHaveBeenCalledWith(start);
    expect(canvas.remove).not.toHaveBeenCalledWith(end);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not push history when no orphan blend steps exist', () => {
    const start = { _id: 'valid-start' };
    const step = { __blend: buildBlendMetadata(0, 1, 2, {}, ['valid-start', 'valid-end']) };
    const end = { _id: 'valid-end' };
    const canvas = { getActiveObjects: () => [], getObjects: () => [start, step, end], remove: vi.fn(), discardActiveObject: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(removeOrphanBlendSteps()).toBe(0);
    expect(canvas.remove).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('only blends dash arrays when both endpoints share a numeric pattern', () => {
    const props = buildBlendProps({ strokeDashArray: [2, 4] }, { strokeDashArray: [8] }, 0.5);

    expect(props.strokeDashArray).toBeUndefined();
  });
});
