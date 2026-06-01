/**
 * Common artboard / document size presets.
 *
 * Print and card sizes are stored in **millimetres** (physical, DPI-aware)
 * and converted to pixels at the document's DPI. Screen / social sizes are
 * stored directly in **pixels** because they're authored for a display, not
 * a press, and a DPI conversion would be meaningless.
 *
 * The dialog feeds the chosen preset through `presetToPx()` so the canvas
 * is always resized in px (the unit `resizeCanvas` expects), while the
 * physical mm value is what a print/cut workflow ultimately cares about.
 */

export type PaperCategory = 'print' | 'card' | 'sticker' | 'screen';

export interface PaperPreset {
  /** Stable id used as the <option> value. */
  id: string;
  /** i18n key (English source string). */
  label: string;
  category: PaperCategory;
  /** Width / height in the preset's own `unit`, given in PORTRAIT orientation. */
  w: number;
  h: number;
  unit: 'mm' | 'px';
}

/**
 * The preset catalogue. Ordering inside each category is roughly
 * largest → smallest / most-common → least, since that's the order a user
 * scans a size dropdown. Categories are grouped in the dialog via
 * `<optgroup>`.
 */
export const PAPER_PRESETS: PaperPreset[] = [
  // ---- Print (ISO + US, millimetres) -------------------------------------
  { id: 'a3', label: 'A3', category: 'print', w: 297, h: 420, unit: 'mm' },
  { id: 'a4', label: 'A4', category: 'print', w: 210, h: 297, unit: 'mm' },
  { id: 'a5', label: 'A5', category: 'print', w: 148, h: 210, unit: 'mm' },
  { id: 'a6', label: 'A6 (postcard)', category: 'print', w: 105, h: 148, unit: 'mm' },
  { id: 'letter', label: 'US Letter', category: 'print', w: 216, h: 279, unit: 'mm' },
  { id: 'legal', label: 'US Legal', category: 'print', w: 216, h: 356, unit: 'mm' },
  { id: 'tabloid', label: 'Tabloid (11×17)', category: 'print', w: 279, h: 432, unit: 'mm' },

  // ---- Cards & photo (millimetres) ---------------------------------------
  { id: 'card-us', label: 'Business card (US, 3.5×2 in)', category: 'card', w: 89, h: 51, unit: 'mm' },
  { id: 'card-eu', label: 'Business card (EU, 85×55)', category: 'card', w: 85, h: 55, unit: 'mm' },
  { id: 'postcard', label: 'Postcard (4×6 in)', category: 'card', w: 152, h: 102, unit: 'mm' },
  { id: 'photo-5x7', label: 'Photo 5×7 in', category: 'card', w: 178, h: 127, unit: 'mm' },

  // ---- Stickers / labels (millimetres) -----------------------------------
  { id: 'sticker-50', label: 'Die-cut sticker 50×50', category: 'sticker', w: 50, h: 50, unit: 'mm' },
  { id: 'sticker-75', label: 'Die-cut sticker 75×75', category: 'sticker', w: 75, h: 75, unit: 'mm' },
  { id: 'sticker-100', label: 'Die-cut sticker 100×100', category: 'sticker', w: 100, h: 100, unit: 'mm' },
  { id: 'label-round-60', label: 'Round label Ø60', category: 'sticker', w: 60, h: 60, unit: 'mm' },
  { id: 'sticker-sheet-a4', label: 'Sticker sheet (A4)', category: 'sticker', w: 210, h: 297, unit: 'mm' },

  // ---- Screen / social (pixels, DPI-independent) -------------------------
  { id: 'ig-post', label: 'Instagram post (1080²)', category: 'screen', w: 1080, h: 1080, unit: 'px' },
  { id: 'ig-story', label: 'Instagram story (1080×1920)', category: 'screen', w: 1080, h: 1920, unit: 'px' },
  { id: 'yt-thumb', label: 'YouTube thumbnail (1280×720)', category: 'screen', w: 1280, h: 720, unit: 'px' },
  { id: 'x-header', label: 'X / Twitter header (1500×500)', category: 'screen', w: 1500, h: 500, unit: 'px' },
  { id: 'fullhd', label: 'Full HD (1920×1080)', category: 'screen', w: 1920, h: 1080, unit: 'px' },
];

export const CATEGORY_LABELS: Record<PaperCategory, string> = {
  print: 'Print',
  card: 'Cards & photo',
  sticker: 'Stickers & labels',
  screen: 'Screen & social',
};

const MM_PER_INCH = 25.4;

/** Convert a millimetre measurement to px at a given DPI. */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Convert a px measurement to mm at a given DPI. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

export interface PresetPx { width: number; height: number }

/**
 * Resolve a preset to pixel dimensions for the canvas. `landscape` swaps
 * the portrait-authored w/h. Screen presets ignore DPI; print/card/sticker
 * presets convert from mm at the supplied DPI.
 */
export function presetToPx(preset: PaperPreset, dpi: number, landscape: boolean): PresetPx {
  const w = preset.unit === 'mm' ? mmToPx(preset.w, dpi) : preset.w;
  const h = preset.unit === 'mm' ? mmToPx(preset.h, dpi) : preset.h;
  return landscape ? { width: Math.max(w, h), height: Math.min(w, h) } : { width: Math.min(w, h), height: Math.max(w, h) };
}

/**
 * Best-effort match of the current px document size back to a preset id, so
 * re-opening Document Settings shows the right selection instead of always
 * defaulting to "Custom". Matches within a 2px tolerance to absorb rounding.
 */
export function matchPreset(widthPx: number, heightPx: number, dpi: number): { id: string; landscape: boolean } | null {
  for (const p of PAPER_PRESETS) {
    const port = presetToPx(p, dpi, false);
    const land = presetToPx(p, dpi, true);
    if (near(widthPx, port.width) && near(heightPx, port.height)) return { id: p.id, landscape: false };
    if (near(widthPx, land.width) && near(heightPx, land.height)) return { id: p.id, landscape: true };
  }
  return null;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 2;
}
