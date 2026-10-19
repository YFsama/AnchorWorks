import * as fabric from 'fabric';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '../templates';

/**
 * Smoke tests for the static template registry. We DON'T invoke
 * `template.build` here because it touches the real Fabric canvas (which
 * needs initCanvas + a DOM canvas element). Instead we verify the shape
 * of each entry and that the thumbnail is a valid SVG data URI.
 */
describe('TEMPLATES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(TEMPLATES)).toBe(true);
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  it('every template has id / name / description / thumbnail / build', () => {
    for (const t of TEMPLATES) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.thumbnail).toBe('string');
      expect(typeof t.build).toBe('function');
    }
  });

  it('every thumbnail starts with data:image/svg+xml', () => {
    for (const t of TEMPLATES) {
      expect(t.thumbnail.startsWith('data:image/svg+xml')).toBe(true);
    }
  });

  it('every template has a unique id', () => {
    const ids = TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every template has a unique name', () => {
    const names = TEMPLATES.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('build is a function (async-callable signature, not invoked)', () => {
    for (const t of TEMPLATES) {
      // We don't call build here — it requires a real fabric.Canvas.
      expect(typeof t.build).toBe('function');
      // Most exports declare async — but the safer check is "looks like a fn".
      expect(t.build.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes the expected baseline templates', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('business-card');
    expect(ids).toContain('poster-a4');
  });

  it('thumbnail data URI decodes to SVG-looking content', () => {
    for (const t of TEMPLATES) {
      // Strip the prefix and decode.
      const idx = t.thumbnail.indexOf(',');
      expect(idx).toBeGreaterThan(0);
      const decoded = decodeURIComponent(t.thumbnail.slice(idx + 1));
      expect(decoded).toMatch(/<svg/);
      expect(decoded).toMatch(/<\/svg>/);
    }
  });
});

/**
 * Sticker template additions. build() runs against a stub canvas (the
 * booleanOps/splitText makeCanvas pattern) under the repo-standard jsdom
 * 2D-context stub so real fabric.IText construction succeeds; the doc /
 * history helpers no-op safely with no initialized engine canvas.
 */
describe('Sticker templates', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
      save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      transform: vi.fn(), setTransform: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
      beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(), clearRect: vi.fn(),
      fillRect: vi.fn(), strokeRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeCanvas() {
    const objects: fabric.FabricObject[] = [];
    return {
      objects,
      getObjects: () => objects,
      remove: vi.fn((o: fabric.FabricObject) => {
        const i = objects.indexOf(o);
        if (i >= 0) objects.splice(i, 1);
      }),
      add: vi.fn((...os: fabric.FabricObject[]) => {
        objects.push(...os);
      }),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      fire: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
  }

  const NEW_IDS = ['sticker-sheet-kisscut', 'laptop-decal', 'tumbler-wrap'];

  it('registers the three new sticker templates', () => {
    const ids = TEMPLATES.map((t) => t.id);
    for (const id of NEW_IDS) expect(ids).toContain(id);
  });

  it('categorizes them under Stickers (4+ with the existing stickerPack)', () => {
    const stickers = TEMPLATES.filter((t) => t.category === 'Stickers');
    expect(stickers.length).toBeGreaterThanOrEqual(4);
    for (const id of NEW_IDS) {
      const t = TEMPLATES.find((x) => x.id === id);
      expect(t?.category).toBe('Stickers');
    }
  });

  it.each(NEW_IDS)('build(%s) does not throw and populates the canvas', async (id) => {
    const template = TEMPLATES.find((t) => t.id === id);
    expect(template).toBeDefined();
    const canvas = makeCanvas();
    await expect(
      template!.build(canvas as unknown as fabric.Canvas),
    ).resolves.toBeUndefined();
    expect(canvas.objects.length).toBeGreaterThan(0);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
});
