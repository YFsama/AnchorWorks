import { describe, expect, it } from 'vitest';
import { addSavedSwatchColor, addSwatchColor, applySwatchPaintInObject, countSwatchPaintMatches, DEFAULT_SWATCHES, loadSwatches, normalizeSwatchColor, replacePaintInObject, replaceSavedSwatchWithColor, replaceSwatchListColor, saveSwatches, SWATCHES_STORAGE_KEY } from '../globalSwatches';

describe('global swatches', () => {
  it('normalizes colors for matching', () => {
    expect(normalizeSwatchColor('  #AABBCC  ')).toBe('#aabbcc');
  });


  it('loads, saves, and appends swatches through shared storage helpers', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };

    expect(loadSwatches(storage)).toEqual(DEFAULT_SWATCHES);
    saveSwatches(['#123456'], storage);
    expect(data.get(SWATCHES_STORAGE_KEY)).toBe('["#123456"]');
    expect(loadSwatches(storage)).toEqual(['#123456']);
    expect(addSwatchColor(['#123456'], '#ABCDEF')).toEqual(['#123456', '#ABCDEF']);
    expect(addSwatchColor(['#123456'], '#123456')).toEqual(['#123456']);
    expect(addSavedSwatchColor('#ABCDEF', storage)).toEqual(['#123456', '#ABCDEF']);
    expect(loadSwatches(storage)).toEqual(['#123456', '#ABCDEF']);
  });

  it('replaces solid fill and stroke recursively', () => {
    const changes: Array<[string, unknown]> = [];
    const object = {
      fill: '#AABBCC',
      stroke: '#111111',
      set(key: string, value: unknown) {
        changes.push([key, value]);
        (this as Record<string, unknown>)[key] = value;
      },
      _objects: [
        { fill: '#aabbcc', stroke: 'transparent' },
        { fill: { type: 'linear' }, stroke: '#AABBCC' },
      ],
    };

    expect(replacePaintInObject(object, '#aabbcc', '#123456')).toBe(3);
    expect(object.fill).toBe('#123456');
    expect(object._objects[0].fill).toBe('#123456');
    expect(object._objects[1].stroke).toBe('#123456');
    expect(object.stroke).toBe('#111111');
    expect(changes).toEqual([['fill', '#123456']]);
  });


  it('applies swatch paint to the requested target', () => {
    const changes: Array<[string, unknown]> = [];
    const object = {
      fill: '#000000',
      stroke: '#ffffff',
      set(key: string, value: unknown) {
        changes.push([key, value]);
        (this as Record<string, unknown>)[key] = value;
      },
    };

    expect(applySwatchPaintInObject(object, '#ABCDEF', 'stroke')).toBe(1);
    expect(object.fill).toBe('#000000');
    expect(object.stroke).toBe('#ABCDEF');
    expect(changes).toEqual([['stroke', '#ABCDEF']]);
  });

  it('counts swatch paint matches recursively with fill and stroke filters', () => {
    const object = {
      fill: '#AABBCC',
      stroke: '#000000',
      _objects: [
        { fill: '#aabbcc', stroke: '#AABBCC' },
        { fill: 'transparent', stroke: '#123456' },
      ],
    };

    expect(countSwatchPaintMatches(object, '#aabbcc')).toBe(3);
    expect(countSwatchPaintMatches(object, '#aabbcc', 'fill')).toBe(2);
    expect(countSwatchPaintMatches(object, '#aabbcc', 'stroke')).toBe(1);
    expect(countSwatchPaintMatches(object, '#ffffff')).toBe(0);
  });

  it('replaces swatch entries and deduplicates by normalized color', () => {
    expect(replaceSwatchListColor(['#AABBCC', '#112233', '#123456'], '#aabbcc', '#123456')).toEqual(['#123456', '#112233']);
  });

  it('persists global swatch replacement metadata even when no canvas is mounted', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    saveSwatches(['#AABBCC', '#123456'], storage);

    const result = replaceSavedSwatchWithColor('#aabbcc', '#123456', storage);

    expect(result.changed).toBe(0);
    expect(result.swatches).toEqual(['#123456']);
    expect(loadSwatches(storage)).toEqual(['#123456']);
  });
});
