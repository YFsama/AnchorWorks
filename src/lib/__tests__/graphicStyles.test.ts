import { describe, expect, it } from 'vitest';
import * as fabric from 'fabric';
import {
  GRAPHIC_STYLES_KEY,
  DEFAULT_CLEARED_APPEARANCE,
  applyGraphicStyleToObject,
  clearAppearanceFromObject,
  captureGraphicStyleFromObject,
  defaultGraphicStyles,
  graphicStyleSignature,
  objectMatchesGraphicStyle,
  loadGraphicStyles,
  saveGraphicStyles,
  removeGraphicStyle,
  type GraphicStyle,
} from '../graphicStyles';

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(GRAPHIC_STYLES_KEY, initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    value: () => data.get(GRAPHIC_STYLES_KEY) ?? '',
  };
}

const style: GraphicStyle = {
  id: 'test-style',
  name: 'Test Style',
  fill: '#112233',
  stroke: '#ff00aa',
  strokeWidth: 4,
  opacity: 0.6,
  blendMode: 'multiply',
  strokeDashArray: [8, 3],
  strokeLineCap: 'round',
  strokeLineJoin: 'bevel',
  shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 },
};

describe('graphic styles', () => {
  it('loads built-in styles when storage is empty or invalid', () => {
    expect(loadGraphicStyles(memoryStorage())).toHaveLength(defaultGraphicStyles().length);
    expect(loadGraphicStyles(memoryStorage('{bad json'))).toHaveLength(defaultGraphicStyles().length);
  });

  it('saves and reloads user styles from storage', () => {
    const storage = memoryStorage();
    saveGraphicStyles([style], storage);

    const loaded = loadGraphicStyles(storage);
    expect(JSON.parse(storage.value())).toHaveLength(1);
    expect(loaded[0]).toEqual(style);
  });

  it('removes a persisted user style by id', () => {
    const storage = memoryStorage();
    saveGraphicStyles([style, { ...style, id: 'other-style' }], storage);

    expect(removeGraphicStyle('test-style', storage)).toBe(1);
    expect(loadGraphicStyles(storage).map(item => item.id)).toEqual(['other-style']);
    expect(removeGraphicStyle('missing-style', storage)).toBe(0);
  });

  it('captures appearance from an object', () => {
    const rect = new fabric.Rect({ fill: '#abcdef', stroke: '#123456', strokeWidth: 2, opacity: 0.75 });
    rect.globalCompositeOperation = 'screen';
    rect.strokeDashArray = [2, 2];
    rect.strokeLineCap = 'round';
    rect.strokeLineJoin = 'round';
    rect.shadow = new fabric.Shadow({ color: 'rgba(1,2,3,0.4)', blur: 7, offsetX: 1, offsetY: 2 });

    const captured = captureGraphicStyleFromObject(rect, 'Captured');
    expect(captured.name).toBe('Captured');
    expect(captured.fill).toBe('#abcdef');
    expect(captured.strokeDashArray).toEqual([2, 2]);
    expect(captured.blendMode).toBe('screen');
    expect(captured.shadow).toEqual({ color: 'rgba(1,2,3,0.4)', blur: 7, offsetX: 1, offsetY: 2 });
  });

  it('applies appearance to an object', () => {
    const rect = new fabric.Rect({ fill: '#ffffff', stroke: '#000000', strokeWidth: 1 });
    applyGraphicStyleToObject(rect, style);

    expect(rect.fill).toBe(style.fill);
    expect(rect.stroke).toBe(style.stroke);
    expect(rect.strokeWidth).toBe(style.strokeWidth);
    expect(rect.opacity).toBe(style.opacity);
    expect(rect.globalCompositeOperation).toBe(style.blendMode);
    expect(rect.strokeDashArray).toEqual(style.strokeDashArray);
    expect(rect.strokeLineCap).toBe(style.strokeLineCap);
    expect(rect.strokeLineJoin).toBe(style.strokeLineJoin);
    expect(rect.shadow).toBeInstanceOf(fabric.Shadow);
  });


  it('matches objects by full graphic style signature', () => {
    const rect = new fabric.Rect({ fill: '#112233', stroke: '#ff00aa', strokeWidth: 4, opacity: 0.6 });
    rect.globalCompositeOperation = 'multiply';
    rect.strokeDashArray = [8, 3];
    rect.strokeLineCap = 'round';
    rect.strokeLineJoin = 'bevel';
    rect.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 5, offsetY: 6 });

    expect(objectMatchesGraphicStyle(rect, style)).toBe(true);
    expect(graphicStyleSignature(style)).toContain('dash:8.000,3.000');

    rect.opacity = 0.7;
    expect(objectMatchesGraphicStyle(rect, style)).toBe(false);
  });

  it('clears appearance back to default fill, stroke, and no effects', () => {
    const rect = new fabric.Rect({ fill: '#abcdef', stroke: '#123456', strokeWidth: 8, opacity: 0.3 });
    rect.globalCompositeOperation = 'multiply';
    rect.strokeDashArray = [4, 2];
    rect.strokeLineCap = 'round';
    rect.strokeLineJoin = 'bevel';
    rect.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 3, offsetY: 4 });

    clearAppearanceFromObject(rect);

    expect(rect.fill).toBe(DEFAULT_CLEARED_APPEARANCE.fill);
    expect(rect.stroke).toBe(DEFAULT_CLEARED_APPEARANCE.stroke);
    expect(rect.strokeWidth).toBe(DEFAULT_CLEARED_APPEARANCE.strokeWidth);
    expect(rect.opacity).toBe(DEFAULT_CLEARED_APPEARANCE.opacity);
    expect(rect.globalCompositeOperation).toBe(DEFAULT_CLEARED_APPEARANCE.blendMode);
    expect(rect.strokeDashArray).toBeNull();
    expect(rect.strokeLineCap).toBe(DEFAULT_CLEARED_APPEARANCE.strokeLineCap);
    expect(rect.strokeLineJoin).toBe(DEFAULT_CLEARED_APPEARANCE.strokeLineJoin);
    expect(rect.shadow).toBeNull();
  });
});
