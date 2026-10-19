import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { bleedRingOffsets, buildBleedImage } from '../bleedExpand';

const MM_TO_PX = 3.7795; // 96dpi convention shared across the cutter pipeline

describe('bleedRingOffsets', () => {
  it('places every sample at radius r, evenly spaced by 2π/20, first at angle 0', () => {
    const r = 12.5;
    const offsets = bleedRingOffsets(20, r);
    expect(offsets).toHaveLength(20);
    // First sample sits at angle 0 → (r, 0).
    expect(offsets[0][0]).toBeCloseTo(r, 9);
    expect(offsets[0][1]).toBeCloseTo(0, 9);
    for (let i = 0; i < offsets.length; i++) {
      const [dx, dy] = offsets[i];
      // Every offset has length r (±1e-9).
      expect(Math.hypot(dx, dy)).toBeCloseTo(r, 9);
      // Angles evenly spaced: exactly i·(2π/20) around the circle.
      const angle = (2 * Math.PI * i) / 20;
      expect(dx).toBeCloseTo(Math.cos(angle) * r, 9);
      expect(dy).toBeCloseTo(Math.sin(angle) * r, 9);
    }
  });
});

describe('buildBleedImage', () => {
  // Exact-typed spy factories — `ReturnType<typeof vi.spyOn>` is too loose
  // for tsc (the generic mock-instance variance fails assignment).
  const spyToDataURL = () => vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
  const spyRectFromObject = () => vi.spyOn(fabric.Rect, 'fromObject');
  // Ring-pass counter — shared with the ctx mock installed below.
  let drawImage: ReturnType<typeof vi.fn>;
  let toDataURL: ReturnType<typeof spyToDataURL>;
  // Captures the serialized payloads the real fabric.util.enlivenObjects
  // resolves (via Rect.fromObject) — proves the 0,0-translation step.
  let fromObject: ReturnType<typeof spyRectFromObject>;
  // Two overlapping rects whose union bbox is exactly 100×50 px at (100, 200):
  //   A: (100,200) 60×50 → right 160, bottom 250
  //   B: (130,220) 70×30 → right 200, bottom 250
  //   union → left 100, top 200, 100×50. strokeWidth 0 keeps getBoundingRect
  //   exactly at the declared geometry.
  let rects: fabric.Rect[];

  beforeEach(() => {
    drawImage = vi.fn();
    toDataURL = spyToDataURL().mockReturnValue('data:image/png;base64,bleed-test');
    // Repo-standard 2D mock (printMarks.test.ts pattern) + drawImage for the
    // ring passes. Both the offscreen StaticCanvas render and the output
    // canvas composite against this single shared ctx mock.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      // StaticCanvas.renderCanvas applies the viewport with ctx.transform —
      // not in the printMarks mock shape (it never renders a canvas).
      transform: vi.fn(),
      setLineDash: vi.fn(),
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
      drawImage,
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);

    rects = [
      new fabric.Rect({ left: 100, top: 200, width: 60, height: 50, strokeWidth: 0, fill: '#e11d48' }),
      new fabric.Rect({ left: 130, top: 220, width: 70, height: 30, strokeWidth: 0, fill: '#2563eb' }),
    ];
    // Stubbing path: the REAL fabric.util.enlivenObjects runs headless
    // (fabric v6 enlivens plain Rects with no canvas — verified here; the
    // util namespace itself cannot be spied, its properties are
    // non-configurable). Only Rect.fromObject is wrapped, calling through to
    // the real implementation, so enliven resolves genuine Rects while we
    // capture the serialized payloads it received.
    const realFromObject = fabric.Rect.fromObject.bind(fabric.Rect);
    fromObject = spyRectFromObject().mockImplementation(
      (...args: Parameters<typeof realFromObject>) => realFromObject(...args),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ring-draws samples + 1 centered original and reports expanded canvas-px geometry', async () => {
    const result = await buildBleedImage(rects, { bleedMm: 1 });
    expect(result).not.toBeNull();

    // Geometry is canvas-px (NOT multiplied): bbox − bleed on each corner,
    // bbox size + 2·bleed. 1 mm = 3.7795 px.
    const bleedPx = 1 * MM_TO_PX;
    expect(result!.leftPx).toBeCloseTo(100 - bleedPx, 2);
    expect(result!.topPx).toBeCloseTo(200 - bleedPx, 2);
    expect(result!.widthPx).toBeCloseTo(100 + 2 * bleedPx, 2);
    expect(result!.heightPx).toBeCloseTo(50 + 2 * bleedPx, 2);
    expect(result!.url).toBe('data:image/png;base64,bleed-test');
    // The bitmap is multiplier× larger than the placement rect — callers
    // place it at scale 1/multiplier (regression guard for the 3×-oversized
    // insert bug).
    expect(result!.multiplier).toBe(3);
    expect(result!.multiplier).toBeGreaterThan(1);

    // Ring passes: 20 samples + the un-offset original on top = 21 draws of
    // the offscreen raster. The shared ctx mock also sees fabric's per-object
    // cache draws during renderAll (one per rect, from small per-object cache
    // canvases) — filter to the offscreen raster element, the only source of
    // exactly round(bbox·multiplier) = 300×150 px.
    const offW = Math.round(100 * 3);
    const offH = Math.round(50 * 3);
    const ringPasses = drawImage.mock.calls.filter(
      ([src]) => (src as HTMLCanvasElement)?.width === offW && (src as HTMLCanvasElement)?.height === offH,
    );
    expect(ringPasses).toHaveLength(21);
    // The ring geometry itself: centered base position + the sample circle.
    const outW = Math.round((100 + 2 * bleedPx) * 3);
    const outH = Math.round((50 + 2 * bleedPx) * 3);
    const baseX = (outW - offW) / 2;
    const baseY = (outH - offH) / 2;
    const radius = bleedPx * 3;
    for (let i = 0; i < 20; i++) {
      const angle = (2 * Math.PI * i) / 20;
      expect(ringPasses[i][1]).toBeCloseTo(baseX + Math.cos(angle) * radius, 6);
      expect(ringPasses[i][2]).toBeCloseTo(baseY + Math.sin(angle) * radius, 6);
    }
    // …and the untouched original centered on top, last.
    expect(ringPasses[20][1]).toBeCloseTo(baseX, 6);
    expect(ringPasses[20][2]).toBeCloseTo(baseY, 6);
    // Exactly one encode of the final composite.
    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith('image/png');

    // The serializer translated the objects to a 0,0 origin before enliven
    // (one fromObject call per rect, both observed by the real enliven path).
    expect(fromObject).toHaveBeenCalledTimes(2);
    const serialized = fromObject.mock.calls.map(
      (call) => call[0] as { left: number; top: number },
    );
    expect(Math.min(...serialized.map((s) => s.left))).toBeCloseTo(0, 6);
    expect(Math.min(...serialized.map((s) => s.top))).toBeCloseTo(0, 6);
  });

  it('honours a custom samples count', async () => {
    await buildBleedImage(rects, { bleedMm: 2, samples: 8 });
    // Same offscreen-raster filter as above (2 cache draws excluded).
    const ringPasses = drawImage.mock.calls.filter(
      ([src]) => (src as HTMLCanvasElement)?.width === 300 && (src as HTMLCanvasElement)?.height === 150,
    );
    expect(ringPasses).toHaveLength(8 + 1);
  });

  it('returns null for an empty selection', async () => {
    expect(await buildBleedImage([], { bleedMm: 1 })).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(toDataURL).not.toHaveBeenCalled();
  });
});

describe('buildBleedImage nearest-colour HQ mode', () => {
  // Same two-rect selection as the ring suite: union bbox 100×50 px.
  const makeRects = () => [
    new fabric.Rect({ left: 100, top: 200, width: 60, height: 50, strokeWidth: 0, fill: '#e11d48' }),
    new fabric.Rect({ left: 130, top: 220, width: 70, height: 30, strokeWidth: 0, fill: '#2563eb' }),
  ];
  /** Repo-standard 2D mock minus any pixel access — what jsdom provides. */
  const installHeadlessCtx = () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      transform: vi.fn(),
      setLineDash: vi.fn(),
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
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null gracefully under the headless ctx mock (no getImageData)', async () => {
    installHeadlessCtx();
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,bleed-test');
    // Honest jsdom path: the HQ mode needs real pixel access; without it the
    // call degrades to null BEFORE encoding and the caller keeps 'ring'.
    expect(await buildBleedImage(makeRects(), { bleedMm: 1, mode: 'nearest' })).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
    // …while the ring default keeps working under the very same mock.
    expect(await buildBleedImage(makeRects(), { bleedMm: 1 })).not.toBeNull();
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it('smears each transparent pixel with its nearest source colour', async () => {
    // The repo mock has no getImageData — instrument it with a synthetic
    // fully-opaque source (left half red, right half blue) plus working
    // createImageData/putImageData so the smear math itself runs for real.
    const outW = 323; // round((100 + 2·3.7795)·3)
    const outH = 173; // round((50 + 2·3.7795)·3)
    const putImageData = vi.fn();
    const drawImage = vi.fn();
    installHeadlessCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      transform: vi.fn(),
      setLineDash: vi.fn(),
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
      drawImage,
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let sy = 0; sy < h; sy++) {
          for (let sx = 0; sx < w; sx++) {
            const d = (sy * w + sx) * 4;
            if (sx < w / 2) { data[d] = 200; data[d + 1] = 0; data[d + 2] = 0; }
            else { data[d] = 0; data[d + 1] = 0; data[d + 2] = 200; }
            data[d + 3] = 255;
          }
        }
        return { width: w, height: h, data, colorSpace: 'srgb' } as unknown as ImageData;
      },
      createImageData: (w: number, h: number) =>
        ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' }) as unknown as ImageData,
      putImageData,
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,bleed-test');

    const result = await buildBleedImage(makeRects(), { bleedMm: 1, mode: 'nearest' });
    expect(result).not.toBeNull();
    // Same geometry contract as the ring mode.
    const bleedPx = 1 * MM_TO_PX;
    expect(result!.leftPx).toBeCloseTo(100 - bleedPx, 2);
    expect(result!.topPx).toBeCloseTo(200 - bleedPx, 2);
    expect(result!.widthPx).toBeCloseTo(100 + 2 * bleedPx, 2);
    expect(result!.heightPx).toBeCloseTo(50 + 2 * bleedPx, 2);
    expect(result!.multiplier).toBe(3);
    expect(result!.url).toBe('data:image/png;base64,bleed-test');

    // One smear composite written at the origin, then the crisp original
    // drawn centered on top (no ring passes in this mode).
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(putImageData.mock.calls[0][1]).toBe(0);
    expect(putImageData.mock.calls[0][2]).toBe(0);
    const smear = (putImageData.mock.calls[0][0] as unknown as { data: Uint8ClampedArray }).data;
    expect(smear).toHaveLength(outW * outH * 4);
    const px = (x: number, y: number): number[] => {
      const d = (y * outW + x) * 4;
      return [smear[d], smear[d + 1], smear[d + 2], smear[d + 3]];
    };
    // Source block sits at rounded (12, 12)..(311, 164). Pixels just outside
    // it adopt the nearest source colour at full alpha…
    expect(px(11, 87)).toEqual([200, 0, 0, 255]); // 1 px left of the block, left half → red
    expect(px(5, 12)).toEqual([200, 0, 0, 255]); // 7 px reach along the top edge
    expect(px(160, 5)).toEqual([200, 0, 0, 255]); // bleed straight above the artwork
    expect(px(322, 87)).toEqual([0, 0, 200, 255]); // right of the block, right half → blue
    // …corners farther than bleedPx·multiplier + 1 stay untouched…
    expect(px(0, 0)).toEqual([0, 0, 0, 0]); // ≈16 px diagonal — out of reach
    expect(px(322, 0)).toEqual([0, 0, 0, 0]);
    // …and the source footprint itself is left transparent in the smear
    // layer (the untouched original is composited on top afterwards).
    expect(px(100, 75)).toEqual([0, 0, 0, 0]);

    const offscreenPasses = drawImage.mock.calls.filter(
      ([src]) => (src as HTMLCanvasElement)?.width === 300 && (src as HTMLCanvasElement)?.height === 150,
    );
    expect(offscreenPasses).toHaveLength(1);
    expect(offscreenPasses[0][1]).toBeCloseTo((outW - 300) / 2, 6);
    expect(offscreenPasses[0][2]).toBeCloseTo((outH - 150) / 2, 6);
    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });
});
