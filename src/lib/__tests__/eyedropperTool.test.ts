import { describe, expect, it } from 'vitest';
import * as fabric from 'fabric';
import { applyEyedropperAppearance, readEyedropperAppearance } from '../tools/eyedropperTool';

describe('eyedropper appearance transfer', () => {
  it('reads rich object appearance for sampling', () => {
    const source = new fabric.Rect({ fill: '#112233', stroke: '#ff00aa', strokeWidth: 4, opacity: 0.7 });
    source.strokeDashArray = [8, 3];
    source.strokeLineCap = 'round';
    source.strokeLineJoin = 'bevel';
    source.globalCompositeOperation = 'multiply';
    source.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 });
    (source as fabric.FabricObject & { patternSpec?: unknown }).patternSpec = { kind: 'dots', size: 12, color1: '#fff', color2: '#000' };

    const look = readEyedropperAppearance(source);

    expect(look.fill).toBe('#112233');
    expect(look.strokeDashArray).toEqual([8, 3]);
    expect(look.strokeLineCap).toBe('round');
    expect(look.strokeLineJoin).toBe('bevel');
    expect(look.globalCompositeOperation).toBe('multiply');
    expect(look.shadow).toEqual({ color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 });
    expect(look.patternSpec).toEqual({ kind: 'dots', size: 12, color1: '#fff', color2: '#000' });
  });

  it('applies rich sampled appearance and clones mutable metadata', () => {
    const target = new fabric.Rect({ fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1 });
    const look = {
      fill: '#112233',
      stroke: '#ff00aa',
      strokeWidth: 4,
      opacity: 0.7,
      strokeDashArray: [8, 3],
      strokeLineCap: 'round' as CanvasLineCap,
      strokeLineJoin: 'bevel' as CanvasLineJoin,
      globalCompositeOperation: 'multiply' as GlobalCompositeOperation,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 },
      patternSpec: { kind: 'dots', size: 12, color1: '#fff', color2: '#000' },
    };

    applyEyedropperAppearance([target], look, null);
    look.strokeDashArray[0] = 99;
    look.patternSpec.color1 = '#abc';

    expect(target.fill).toBe('#112233');
    expect(target.strokeDashArray).toEqual([8, 3]);
    expect(target.strokeLineCap).toBe('round');
    expect(target.strokeLineJoin).toBe('bevel');
    expect(target.globalCompositeOperation).toBe('multiply');
    expect(target.shadow).toBeInstanceOf(fabric.Shadow);
    expect((target as fabric.FabricObject & { patternSpec?: unknown }).patternSpec).toEqual({ kind: 'dots', size: 12, color1: '#fff', color2: '#000' });
  });
});
