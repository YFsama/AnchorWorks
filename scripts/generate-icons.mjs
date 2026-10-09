#!/usr/bin/env node
/**
 * generate-icons.mjs — rasterize the brand SVG into the PNG icon set.
 * ---------------------------------------------------------------
 * Usage:
 *   node scripts/generate-icons.mjs
 *
 * Produces in public/:
 *   icon-192.png          192×192  manifest `any` purpose
 *   icon-512.png          512×512  manifest `any` purpose
 *   apple-touch-icon.png  180×180  iOS home-screen icon (full-bleed square —
 *                                  iOS applies its own corner mask, so the
 *                                  tile's rx=86 rounding is removed)
 *   icon-maskable-512.png 512×512  manifest `maskable` purpose — the same
 *                                  artwork scaled to 70% about the canvas
 *                                  centre on a full-bleed background, so the
 *                                  whole composition sits inside the 80%
 *                                  minimum safe-zone circle launchers crop to.
 *
 * Why PNG: the source tiles in public/ are SVG (crisp at any size), but iOS
 * Safari refuses SVG apple-touch-icons (users get a page screenshot on
 * "Add to Home Screen" instead of the brand mark), and several Android /
 * ChromeOS launcher shells still expect raster icons. The SVG set stays as
 * the scalable fallback; these PNGs are the guaranteed-compatible set.
 *
 * Rasterization uses the Playwright chromium build that already ships as the
 * e2e devDependency (no new deps, no native image tooling). If chromium is
 * not installed yet, run once:
 *   npx playwright install chromium
 *
 * Deterministic and re-runnable: same SVG in → same PNGs out. Whenever the
 * brand mark changes, edit public/icon-512.svg and re-run this script.
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'public', 'icon-512.svg');

const TILE_BG_RECT = '<rect width="512" height="512" rx="86" fill="#1e1c21"/>';
// Maskable safe-zone math (documented so the 0.7 constant is auditable):
//   artwork extents in the 512 viewBox ≈ x[19,493] y[128,429] (includes the
//   rotated corner squares + half stroke widths). Farthest point from the
//   canvas centre (256,256) is a rotated-square corner at ≈293 units. The
//   maskable spec guarantees only the central 80% circle (r = 204.8), so the
//   artwork needs scale ≤ 204.8/293 ≈ 0.699 — 0.70 it is.
const MASKABLE_SCALE = 0.7;

function fail(message) {
  console.error(`generate-icons: ${message}`);
  process.exit(1);
}

const svg = await readFile(srcPath, 'utf8').catch(() => fail(`source tile not found: ${srcPath}`));
if (!svg.includes(TILE_BG_RECT)) {
  fail(`expected the brand tile background rect in ${srcPath}; edit this script if the tile layout changed.`);
}

// --- Build the three SVG variants from the single brand tile -----------------

// 1. As-shipped tile (rounded corners) — used for the manifest `any` icons.
const roundedTile = svg;

// 2. Full-bleed square tile — iOS rounds apple-touch-icons itself; shipping
//    pre-rounded corners leaves dark gaps at the corners of the OS mask.
const squareTile = svg.replace(TILE_BG_RECT, '<rect width="512" height="512" fill="#1e1c21"/>');

// 3. Maskable tile — full-bleed background (the launcher applies the shape
//    mask) with the whole composition scaled about the canvas centre so it
//    survives circular crops.
const bgEnd = svg.indexOf(TILE_BG_RECT) + TILE_BG_RECT.length;
const maskableTile =
  svg.slice(0, bgEnd).replace(TILE_BG_RECT, '<rect width="512" height="512" fill="#1e1c21"/>') +
  `<g transform="translate(256 256) scale(${MASKABLE_SCALE}) translate(-256 -256)">` +
  svg.slice(bgEnd) +
  '</g>';

/** Render one SVG string at an exact pixel size and return the PNG bytes. */
async function rasterize(page, svgSource, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body { margin: 0; padding: 0; background: transparent; }
       svg { display: block; width: ${size}px; height: ${size}px; }
     </style></head><body>${svgSource}</body></html>`,
  );
  return page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, type: 'png' });
}

const targets = [
  { file: 'icon-192.png', size: 192, svg: roundedTile },
  { file: 'icon-512.png', size: 512, svg: roundedTile },
  { file: 'apple-touch-icon.png', size: 180, svg: squareTile },
  { file: 'icon-maskable-512.png', size: 512, svg: maskableTile },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, svg: variant } of targets) {
    const bytes = await rasterize(page, variant, size);
    await writeFile(path.join(root, 'public', file), bytes);
    console.log(`  public/${file}  ${size}x${size}  ${(bytes.length / 1024).toFixed(1)} kB`);
  }
} finally {
  await browser.close();
}
console.log('done.');
