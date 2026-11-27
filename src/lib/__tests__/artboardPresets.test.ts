import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import {
  ARTBOARD_SIZE_PRESETS, LANDSCAPE_FIRST_PRESET_IDS, PAPER_PRESETS, SIGN_PRESETS,
  matchPreset, mmToPx, presetToPx, type PaperPreset,
} from '../paperSizes';
import { createArtboards, resolveArtboardAnchor, resizeArtboard, MAX_NEW_ARTBOARDS } from '../artboards';
import { useEditor } from '../../store/editor';
import * as canvasEngine from '../canvasEngine';
import type { Artboard } from '../../types';

const DPI = 96;
const ab = (id: string, x: number, y: number, width: number, height: number, name = id): Artboard => ({ id, name, x, y, width, height });

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('sign-shop presets', () => {
  it('ships the sign / identification sizes portrait-authored in millimetres, and joins PAPER_PRESETS', () => {
    const labels = SIGN_PRESETS.map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Yard sign (18×24 in)', 'Banner (24×12 in)', 'Banner (2×4 ft)', 'Banner / panel (4×8 ft)',
      'Poster (24×36 in)', 'Roll-up banner (850×2000 mm)',
      'Sticker label (76×51 mm)', 'Name badge (89×38 mm)', 'Bumper sticker (3×11.5 in)', 'Door hanger (3.5×8.5 in)',
    ]));
    for (const preset of SIGN_PRESETS) {
      expect(preset.unit, preset.id).toBe('mm');
      expect(preset.w, `${preset.id} portrait-authored`).toBeLessThanOrEqual(preset.h);
      expect(PAPER_PRESETS).toContain(preset);
    }
  });

  it('uses the same mm → px conversion as the paper sizes (96 DPI)', () => {
    // The artboard row's "24×12 in" preset is 609.6 × 304.8 mm → 2304 × 1152.
    expect(presetToPx(byId('banner-24x12'), DPI, true)).toEqual({ width: 2304, height: 1152 });
    expect(presetToPx(byId('yard-sign-18x24'), DPI, false)).toEqual({ width: 1728, height: 2304 });
    expect(presetToPx(byId('banner-4x8'), DPI, true)).toEqual({ width: 9216, height: 4608 });
    expect(presetToPx(byId('sticker-label'), DPI, true)).toEqual({ width: 287, height: 193 });
    expect(presetToPx(byId('name-badge'), DPI, true)).toEqual({ width: 336, height: 144 });
  });

  it('flags the wide formats as landscape-first and leaves paper / posters portrait', () => {
    for (const id of ['banner-24x12', 'banner-2x4', 'banner-3x6', 'banner-4x8', 'yard-sign-18x12', 'name-badge', 'bumper-sticker', 'sticker-label']) {
      expect(LANDSCAPE_FIRST_PRESET_IDS.has(id), id).toBe(true);
    }
    for (const id of ['yard-sign-18x24', 'poster-24x36', 'rollup-banner', 'door-hanger', 'a4', 'letter']) {
      expect(LANDSCAPE_FIRST_PRESET_IDS.has(id), id).toBe(false);
    }
  });

  it('lists every preset exactly once in the artboard picker catalogue, signs first', () => {
    const ids = ARTBOARD_SIZE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(PAPER_PRESETS.length);
    expect(ids.slice(0, SIGN_PRESETS.length)).toEqual(SIGN_PRESETS.map((p) => p.id));
    expect(ids.slice(SIGN_PRESETS.length)).toEqual(PAPER_PRESETS.filter((p) => !SIGN_PRESETS.includes(p)).map((p) => p.id));
  });

  it('is recognised by matchPreset without stealing another preset or the 800×600 default', () => {
    for (const sign of SIGN_PRESETS) {
      for (const landscape of [false, true]) {
        const px = presetToPx(sign, DPI, landscape);
        expect(matchPreset(px.width, px.height, DPI), `${sign.id} landscape=${landscape}`).toEqual({ id: sign.id, landscape });
      }
    }
    // No sign size sits within matchPreset's 2px tolerance of another preset
    // (the first match wins, so a near-duplicate would be unreachable).
    const others = PAPER_PRESETS.filter((p) => !SIGN_PRESETS.includes(p));
    for (const sign of SIGN_PRESETS) {
      const s = [presetToPx(sign, DPI, false), presetToPx(sign, DPI, true)];
      for (const other of others) {
        for (const landscape of [false, true]) {
          const o = presetToPx(other, DPI, landscape);
          const clashes = s.some((m) => Math.abs(m.width - o.width) <= 2 && Math.abs(m.height - o.height) <= 2);
          expect(clashes, `${sign.id} vs ${other.id}`).toBe(false);
        }
      }
    }
    expect(matchPreset(800, 600, DPI)).toBeNull();
  });
});

describe('createArtboards — batch at a chosen size', () => {
  const size = { width: 1123, height: 794 }; // A4 landscape @ 96 DPI

  it('lays a row out to the right of the anchor, numbering after the existing list', () => {
    useEditor.getState().setArtboards([ab('ab-1', 0, 0, 800, 600)]);
    const created = createArtboards({ ...size, count: 2, placement: 'right', anchorId: 'ab-1' });
    expect(created.map(({ x, y, name }) => ({ x, y, name }))).toEqual([
      { x: 830, y: 0, name: 'Artboard 2' },
      { x: 1983, y: 0, name: 'Artboard 3' }, // 830 + 1123 + 30
    ]);
    expect(created.every((a) => a.width === 1123 && a.height === 794)).toBe(true);
    expect(useEditor.getState().artboards).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem('vector.artboards')!)).toHaveLength(3);
  });

  it('places below / left / above, aligned with the anchor', () => {
    useEditor.getState().setArtboards([ab('ab-1', 100, 200, 800, 600)]);
    const anchorId = 'ab-1';
    const pick = (placement: 'below' | 'left' | 'above') => {
      const [{ x, y }] = createArtboards({ ...size, placement, anchorId });
      return { x, y };
    };
    expect(pick('below')).toEqual({ x: 100, y: 830 }); // 200 + 600 + 30
    expect(pick('left')).toEqual({ x: 100 - 30 - 1123, y: 200 });
    expect(pick('above')).toEqual({ x: 100, y: 200 - 30 - 794 });
  });

  it('slides the row past an artboard that already occupies the spot', () => {
    useEditor.getState().setArtboards([ab('ab-1', 0, 0, 800, 600), ab('ab-2', 830, 0, 300, 250)]);
    const [{ x, y }] = createArtboards({ ...size, anchorId: 'ab-1' });
    // 830 would overlap ab-2 (830…1130): one pitch further along is clear.
    expect({ x, y }).toEqual({ x: 830 + 1123 + 30, y: 0 });
  });

  it('starts a grid at the origin when the document is empty', () => {
    useEditor.getState().setArtboards([]);
    const created = createArtboards({ ...size, count: 5, placement: 'grid' });
    expect(created.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 }, { x: 1153, y: 0 }, { x: 2306, y: 0 }, // ceil(sqrt(5)) = 3 columns
      { x: 0, y: 824 }, { x: 1153, y: 824 },
    ]);
    expect(created[0].name).toBe('Artboard 1');
  });

  it('moves a grid below the existing artboards when the origin is taken', () => {
    useEditor.getState().setArtboards([ab('ab-1', 0, 0, 800, 600), ab('ab-2', 0, 900, 400, 200)]);
    const created = createArtboards({ ...size, count: 2, placement: 'grid', columns: 1 });
    // Below the lowest existing bottom edge (1100) plus the gap.
    expect(created.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 0, y: 1130 }, { x: 0, y: 1130 + 794 + 30 }]);
  });

  it('clamps the count and columns, and falls back to the document size', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    useEditor.getState().setArtboards([ab('ab-1', 0, 0, 800, 600)]);
    expect(createArtboards({ ...size, count: 1000, placement: 'grid' })).toHaveLength(MAX_NEW_ARTBOARDS);
    expect(createArtboards({ ...size, count: 0, placement: 'grid' })).toHaveLength(1);
    expect(createArtboards({ ...size, count: Number.NaN, placement: 'grid' })).toHaveLength(1);
    const [one] = createArtboards({ width: Number.NaN, height: -5, count: 4, placement: 'grid', columns: 99 });
    // Default document is 800 × 600 — untouched by the presets work.
    expect(one).toMatchObject({ width: 800, height: 600, x: 0 });
    const [first] = createArtboards({ ...size, count: 4, placement: 'grid', columns: 99 });
    expect(first).toMatchObject({ width: 1123, height: 794 });
  });

  it("resolves the anchor: explicit → selected object's artboard → artboard in view → last", () => {
    const list = [ab('ab-1', 0, 0, 800, 600), ab('ab-2', 1000, 0, 800, 600), ab('ab-3', 2000, 0, 800, 600)];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    useEditor.getState().setArtboards(list);
    expect(resolveArtboardAnchor('ab-2')?.id).toBe('ab-2');
    expect(resolveArtboardAnchor('gone')?.id).toBe('ab-3'); // nothing selected, no view: last
    useEditor.getState().setArtboards([]);
    expect(resolveArtboardAnchor()).toBeNull();
    useEditor.getState().setArtboards(list);

    const onSecond = new fabric.Rect({ left: 1200, top: 100, width: 50, height: 50, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({ getActiveObject: () => onSecond } as never);
    expect(resolveArtboardAnchor()?.id).toBe('ab-2');

    // View centre (scene 1500, 300) sits on ab-2 → zoom 2, pan (−2500, −300).
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => null,
      getWidth: () => 1000,
      getHeight: () => 600,
      viewportTransform: [2, 0, 0, 2, -2500, -300],
    } as never);
    expect(resolveArtboardAnchor()?.id).toBe('ab-2');
  });
});

describe('resizing an existing artboard keeps the artwork', () => {
  it('resizeArtboard only rewrites the artboard record — objects outside it stay on the canvas', () => {
    const stray = new fabric.Rect({ left: 2000, top: 1500, width: 40, height: 40, strokeWidth: 0 });
    const remove = vi.fn();
    const getObjects = vi.fn(() => [stray]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({ getObjects, remove } as never);
    useEditor.getState().setArtboards([ab('ab-1', 0, 0, 800, 600)]);
    const [a4Portrait, a4Landscape] = [presetToPx(byId('a4'), DPI, false), presetToPx(byId('a4'), DPI, true)];
    expect(a4Portrait).toEqual({ width: 794, height: 1123 });

    // What the artboard row's A4 preset applies: mmToPx(210 / 297) at the document DPI.
    resizeArtboard('ab-1', mmToPx(210, DPI), mmToPx(297, DPI));
    expect(useEditor.getState().artboards[0]).toMatchObject({ x: 0, y: 0, width: 794, height: 1123 });
    expect(getObjects()).toEqual([stray]);
    expect(remove).not.toHaveBeenCalled();
    expect(stray.left).toBe(2000);

    // The picker's A4 landscape resolves to the same numbers.
    resizeArtboard('ab-1', a4Landscape.width, a4Landscape.height);
    expect(a4Landscape).toEqual({ width: 1123, height: 794 });
    expect(useEditor.getState().artboards[0]).toMatchObject({ x: 0, y: 0, width: 1123, height: 794 });
    expect(getObjects()).toHaveLength(1);
  });
});

function byId(id: string): PaperPreset {
  const preset = PAPER_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);
  return preset;
}
