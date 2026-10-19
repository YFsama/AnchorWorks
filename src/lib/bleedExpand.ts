/**
 * Bleed expansion — Cricut "Print Then Cut"-style ink bleed.
 *
 * Cricut Design Space's auto-bleed extends the artwork's outermost EDGE
 * PIXELS outward (~1/16 in) so a slightly mis-registered cut shows ink, not
 * white paper (help.cricut.com Print Then Cut; see docs/research-sticker-
 * printcut-2026-10.md §1 bleed table and §6 "True artwork bleed expansion"
 * gap this module closes). The cheap faithful browser technique is the
 * RING-DRAW: rasterize the selection once at `multiplier`× (≥3 ≈ 300
 * DPI-class) and alpha-composite that raster at `samples` positions on a
 * circle of radius = bleed, with the original centered on top — the
 * overlapping copies reproduce the nearest-colour smear. ≥16 samples covers
 * 1–3 mm bleeds without visible lobing (20 by default).
 *
 * The `mode: 'nearest'` HQ alternative skips the ring entirely: a
 * label-carrying chamfer (rasterEdt.ts) gives every transparent output
 * pixel the colour of its NEAREST opaque source pixel — the pixel-perfect
 * form of the same edge-pixel smear, no lobing at any bleed width. It
 * needs real canvas pixel access (getImageData/createImageData/putImageData)
 * and returns null without it, so headless callers keep the ring default.
 *
 * Entirely non-destructive: the live canvas is never touched; objects are
 * serialized + re-enlivened into an offscreen StaticCanvas exactly like
 * rasterize.ts does, and the smear is composited on a detached
 * HTMLCanvasElement the caller places itself.
 */
import * as fabric from 'fabric';
import { labelledChamfer } from './rasterEdt';

/** 96dpi mm→px divisor shared across the cutter pipeline (makeSticker et al). */
const MM_TO_PX = 3.7795;

/** Default raster multiplier — 300 DPI-class sharpness for print output. */
const DEFAULT_MULTIPLIER = 3;
/** Default ring samples — enough for smooth 1–3 mm bleeds. */
const DEFAULT_SAMPLES = 20;

export interface BleedOptions {
  /** Bleed width in mm (1–3 mm typical; Print Then Cut spec ~1/16 in). */
  bleedMm: number;
  /** Raster multiplier (canvas px → bitmap px). Default 3. */
  multiplier?: number;
  /** Ring sample count. Default 20 (≥16 recommended for 1–3 mm). */
  samples?: number;
  /** Smear strategy. 'ring' (default) is the behaviour above, byte-for-byte.
   *  'nearest' is the HQ mode: every transparent output pixel within the
   *  bleed takes the colour of its nearest opaque source pixel. Needs real
   *  getImageData/createImageData/putImageData — returns null under a
   *  headless ctx mock so callers fall back to the ring default. */
  mode?: 'ring' | 'nearest';
}

export interface BleedResult {
  /** PNG data URL of the smeared raster (already at multiplier× resolution). */
  url: string;
  /** Placement rect in CANVAS px (not multiplied): top-left of the expanded
   *  image, i.e. the selection bbox origin shrunk by the bleed on each side. */
  leftPx: number;
  topPx: number;
  /** Selection bbox size + 2·bleed, canvas px. The BITMAP is multiplier×
   *  larger than this rect — insert with scale 1/multiplier (the same
   *  placement idiom rasterize.ts uses). */
  widthPx: number;
  heightPx: number;
  /** The raster multiplier the bitmap was produced at, so callers can scale
   *  the placed image back down to canvas px. */
  multiplier: number;
}

/**
 * Ring-draw sample offsets: `samples` points evenly spaced on a circle of
 * `radiusPx`, starting at angle 0. Pure math (no DOM) so the geometry is
 * unit-testable without a rasterizer.
 */
export function bleedRingOffsets(samples: number, radiusPx: number): Array<[number, number]> {
  const n = Math.max(1, Math.round(samples));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push([Math.cos(a) * radiusPx, Math.sin(a) * radiusPx]);
  }
  return out;
}

/**
 * Pure pixel-perfect smear (no canvas): `src` is the offscreen bitmap's RGBA
 * (offW×offH), to be placed at integer-rounded (baseX, baseY) inside the
 * outW×outH output. Every transparent output pixel within `bleedPx` of an
 * opaque source pixel (alpha > 16; dist ≤ bleedPx + 1) adopts that pixel's
 * RGB at full alpha; source pixels themselves and pixels beyond the reach
 * stay untouched. The output composite then draws the crisp original on
 * top, exactly like the ring passes did.
 */
export function nearestColourSmear(
  src: Uint8ClampedArray | Uint8Array,
  offW: number,
  offH: number,
  outW: number,
  outH: number,
  baseX: number,
  baseY: number,
  bleedPx: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const bx = Math.round(baseX);
  const by = Math.round(baseY);
  // Opaque source pixels stamped onto the output grid: the chamfer seeds.
  const mask = new Uint8Array(outW * outH);
  for (let sy = 0; sy < offH; sy++) {
    const oy = sy + by;
    if (oy < 0 || oy >= outH) continue;
    for (let sx = 0; sx < offW; sx++) {
      const ox = sx + bx;
      if (ox < 0 || ox >= outW) continue;
      if (src[(sy * offW + sx) * 4 + 3] > 16) mask[oy * outW + ox] = 1;
    }
  }
  const { dist, labels } = labelledChamfer(mask, outW, outH);
  const reach = bleedPx + 1;
  for (let i = 0; i < outW * outH; i++) {
    if (mask[i] === 1 || dist[i] > reach) continue;
    const label = labels[i];
    if (label < 0) continue;
    const sx = (label % outW) - bx;
    const sy = Math.floor(label / outW) - by;
    if (sx < 0 || sy < 0 || sx >= offW || sy >= offH) continue; // unreachable by construction
    const s = (sy * offW + sx) * 4;
    const d = i * 4;
    out[d] = src[s];
    out[d + 1] = src[s + 1];
    out[d + 2] = src[s + 2];
    out[d + 3] = 255;
  }
  return out;
}

/**
 * Rasterize `objects` and smear their edge pixels outward by `bleedMm`.
 * Returns null when `objects` is empty or the raster pipeline fails (for
 * the 'nearest' HQ mode that includes a headless ctx without pixel access) —
 * the caller decides whether to toast and continue without a bleed.
 */
export async function buildBleedImage(
  objects: fabric.FabricObject[],
  opts: BleedOptions,
): Promise<BleedResult | null> {
  if (objects.length === 0) return null;
  const multiplier = opts.multiplier ?? DEFAULT_MULTIPLIER;
  const samples = opts.samples ?? DEFAULT_SAMPLES;
  const mode = opts.mode ?? 'ring';
  const bleedPx = opts.bleedMm * MM_TO_PX;

  // Union bounding rect of the selection in canvas px — same measurement
  // rasterize.ts uses.
  const rects = objects.map((o) => o.getBoundingRect());
  const left = Math.min(...rects.map((b) => b.left));
  const top = Math.min(...rects.map((b) => b.top));
  const width = Math.max(1, Math.max(...rects.map((b) => b.left + b.width)) - left);
  const height = Math.max(1, Math.max(...rects.map((b) => b.top + b.height)) - top);

  // Serialize translated to a 0,0 origin (verbatim rasterize.ts idiom) and
  // re-enliven into an offscreen StaticCanvas scaled by `multiplier`.
  const serialized = objects.map((o) => {
    const d = o.toObject() as Record<string, unknown>;
    if (typeof d.left === 'number') d.left = (d.left as number) - left;
    if (typeof d.top === 'number') d.top = (d.top as number) - top;
    return d;
  });

  // Expanded output canvas: selection size + bleed on every side, at the
  // raster multiplier so the smear is as sharp as the source raster.
  const offW = Math.max(1, Math.round(width * multiplier));
  const offH = Math.max(1, Math.round(height * multiplier));
  const outW = Math.max(1, Math.round((width + 2 * bleedPx) * multiplier));
  const outH = Math.max(1, Math.round((height + 2 * bleedPx) * multiplier));

  try {
    const offEl = document.createElement('canvas');
    offEl.width = offW;
    offEl.height = offH;
    const off = new fabric.StaticCanvas(offEl, {
      width: offW,
      height: offH,
      renderOnAddRemove: false,
    });
    try {
      off.setZoom(multiplier);
      const enlived = await fabric.util.enlivenObjects(serialized);
      for (const o of enlived) off.add(o as fabric.FabricObject);
      off.renderAll();

      const outEl = document.createElement('canvas');
      outEl.width = outW;
      outEl.height = outH;
      const ctx = outEl.getContext('2d');
      if (!ctx) return null;

      const source = off.getElement();
      const baseX = (outW - offW) / 2;
      const baseY = (outH - offH) / 2;
      if (mode === 'nearest') {
        // HQ mode needs real pixel access: a headless ctx mock without
        // getImageData/createImageData/putImageData fails here and the
        // caller keeps the ring default.
        const srcCtx = offEl.getContext('2d');
        if (!srcCtx || typeof srcCtx.getImageData !== 'function' ||
            typeof ctx.createImageData !== 'function' ||
            typeof ctx.putImageData !== 'function') return null;
        const srcImg = srcCtx.getImageData(0, 0, offW, offH);
        const smeared = nearestColourSmear(
          srcImg.data, offW, offH, outW, outH, baseX, baseY, bleedPx * multiplier,
        );
        const outImg = ctx.createImageData(outW, outH);
        outImg.data.set(smeared);
        ctx.putImageData(outImg, 0, 0);
      } else {
        // Ring-draw: the raster at every offset on the bleed circle, then the
        // untouched original centered on top. drawImage of the offscreen
        // canvas element directly — no data-URL round-trip per pass.
        for (const [dx, dy] of bleedRingOffsets(samples, bleedPx * multiplier)) {
          ctx.drawImage(source, baseX + dx, baseY + dy);
        }
      }
      ctx.drawImage(source, baseX, baseY);

      return {
        url: outEl.toDataURL('image/png'),
        leftPx: left - bleedPx,
        topPx: top - bleedPx,
        widthPx: width + 2 * bleedPx,
        heightPx: height + 2 * bleedPx,
        multiplier,
      };
    } finally {
      off.dispose();
    }
  } catch {
    // Raster pipeline failure (enliven/render/encode) — caller toasts.
    return null;
  }
}
