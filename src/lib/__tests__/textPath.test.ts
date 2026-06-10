import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { applyTextOnArc } from '../textPath';

describe('text path metadata', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
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
  });

  it('marks generated text-on-arc groups for later audits', async () => {
    const canvasEngine = await import('../canvasEngine');
    const text = {
      type: 'i-text',
      text: 'BADGE',
      fill: '#123456',
      fontSize: 24,
      fontFamily: 'Inter',
      getCenterPoint: () => ({ x: 100, y: 120 }),
    };
    const canvas = {
      getActiveObjects: () => [text],
      add: vi.fn(),
      remove: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(applyTextOnArc()).toBe(true);
    const group = canvas.add.mock.calls[0][0] as fabric.Group & { __textOnPath?: { kind: string; sourceText: string } };
    expect(group.__textOnPath).toEqual({ kind: 'arc', sourceText: 'BADGE' });
    expect(canvas.setActiveObject).toHaveBeenCalledWith(group);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });
});
