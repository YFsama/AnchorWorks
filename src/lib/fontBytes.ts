/**
 * Byte registry for user-uploaded fonts — the enabler for glyph-level
 * Text→Outlines (slice 1 of the vector outlines effort).
 *
 * The browser happily renders a `FontFace` registered from an ArrayBuffer, but
 * never hands the glyph beziers back. `loadCustomFontFile` therefore parks a
 * copy of the bytes here, keyed by the family name it registers the FontFace
 * under, together with a conservative sniff of the face's real style (weight /
 * italic) read straight from the sfnt table directory. `resolveFontBytes` then
 * answers "do we have the TRUE face the canvas would paint (not a synthesized
 * bold/oblique)?" — if not, the caller stays on the raster-trace pipeline.
 *
 * System fonts (no bytes) and Google fonts (woff2 behind css2, out of scope for
 * this slice) simply never enter the registry, so they resolve to null.
 */

/** What we could sniff about one uploaded face. `null` = unknown. */
export interface FontFaceStyle {
  /** OS/2 usWeightClass (100–900), or null when the bytes don't hand it over. */
  weight: number | null;
  /** head.macStyle italic bit, or null when unknown. */
  italic: boolean | null;
}

interface RegisteredFace {
  bytes: ArrayBuffer;
  style: FontFaceStyle;
}

/** family (exact string) → uploaded faces, in upload order. */
const registry = new Map<string, RegisteredFace[]>();

/** Read the sfnt/woff table directory and return `[offset, length]` of `tag`. */
function findTable(view: DataView, tag: string): [number, number] | null {
  const magic = view.getUint32(0);
  let numTables: number;
  let dirOffset: number;
  let entrySize: number;
  if (magic === 0x00010000 || magic === 0x4f54544f /* 'OTTO' */ || magic === 0x74727565 /* 'true' */) {
    numTables = view.getUint16(4);
    dirOffset = 12;
    entrySize = 16; // tag, checksum, offset, length
  } else if (magic === 0x774f4646 /* 'wOFF' — woff1, directory is uncompressed */) {
    numTables = view.getUint16(12);
    dirOffset = 44;
    entrySize = 20; // tag, offset, compLength, origLength, origChecksum
  } else {
    return null; // woff2 (brotli-compressed directory) or unknown container
  }
  for (let i = 0; i < numTables; i++) {
    const e = dirOffset + i * entrySize;
    if (e + entrySize > view.byteLength) return null;
    const t =
      String.fromCharCode(view.getUint8(e), view.getUint8(e + 1), view.getUint8(e + 2), view.getUint8(e + 3));
    if (t !== tag) continue;
    if (entrySize === 16) return [view.getUint32(e + 8), view.getUint32(e + 12)];
    // woff: only usable when stored raw (zlib-inflating is out of scope here).
    const off = view.getUint32(e + 4);
    const comp = view.getUint32(e + 8);
    const orig = view.getUint32(e + 12);
    return comp === orig ? [off, orig] : null;
  }
  return null;
}

/**
 * Sniff the real style of an uploaded face from OS/2 (usWeightClass) and head
 * (macStyle italic bit). Dependency-free and conservative: anything it cannot
 * read (woff2, compressed woff tables, missing tables) reports `null` fields,
 * which `resolveFontBytes` treats as "can't prove a true face" for styled
 * requests.
 */
export function sniffFontFaceStyle(bytes: ArrayBuffer): FontFaceStyle {
  const style: FontFaceStyle = { weight: null, italic: null };
  try {
    const view = new DataView(bytes);
    if (view.byteLength < 12) return style;
    const os2 = findTable(view, 'OS/2');
    if (os2 && os2[0] + 6 <= view.byteLength) {
      style.weight = view.getUint16(os2[0] + 4); // version(2) then usWeightClass
    }
    const head = findTable(view, 'head');
    if (head && head[0] + 46 <= view.byteLength) {
      style.italic = (view.getUint16(head[0] + 44) & 0b10) !== 0; // macStyle bit 1
    }
  } catch {
    // Malformed bytes — keep nulls; the fontkit parse downstream will fail too.
  }
  return style;
}

/** Park an uploaded face's bytes under `family` (called by loadCustomFontFile). */
export function registerFontBytes(family: string, bytes: ArrayBuffer): void {
  const faces = registry.get(family) ?? [];
  faces.push({ bytes, style: sniffFontFaceStyle(bytes) });
  registry.set(family, faces);
}

/** Test hook: drop every registered face (identity of `family` is exact). */
export function clearFontBytes(): void {
  registry.clear();
}

/**
 * True when a numeric/'bold' weight asks for the bold class. The relative
 * keywords ('bolder'/'lighter') resolve against the canvas's inherited
 * weight, which we cannot replay faithfully — the resolver returns null for
 * them (fallback to the raster tracer) rather than guessing.
 */
function isBoldWeight(weight: number | string | undefined): boolean {
  if (typeof weight === 'number') return weight >= 600;
  return String(weight ?? '').trim().toLowerCase() === 'bold';
}

/** Style keywords whose painted face depends on inheritance — never outlined. */
function isUnresolvableWeight(weight: number | string | undefined): boolean {
  const w = String(weight ?? '').trim().toLowerCase();
  return w === 'bolder' || w === 'lighter';
}

/**
 * Resolve the font bytes the canvas would actually PAINT for this style query,
 * or null when we can't guarantee a true (non-synthesized) face:
 *
 * - family must match an uploaded family exactly;
 * - an italic request needs a face we know is italic (synthesized oblique is
 *   un-outlineable → caller falls back to the raster trace);
 * - a bold request needs a face we know is bold-weight — an upright/regular or
 *   unknown-weight face would be faux-bolded by the browser;
 * - a regular request never triggers synthesis, so any face of the family works
 *   (the browser paints its natural design and so do we).
 *
 * Google and system fonts are simply absent from the registry → null.
 */
export async function resolveFontBytes(
  family: string,
  weight: number | string | undefined,
  italic: boolean,
): Promise<ArrayBuffer | null> {
  const faces = registry.get(family);
  if (!faces || faces.length === 0) return null;
  if (isUnresolvableWeight(weight)) return null; // 'bolder'/'lighter': inherited resolution, bail
  const wantBold = isBoldWeight(weight);
  // Duplicate family registrations leave the LAST added FontFace as the one the
  // browser matches, so the last registered face is the one the canvas paints.
  const face = faces[faces.length - 1];
  if (italic && face.style.italic !== true) return null; // can't prove a real italic face
  if (wantBold && face.style.weight === null) return null; // unknown → can't prove bold
  if (wantBold && face.style.weight !== null && face.style.weight < 600) return null; // would synthesize
  return face.bytes;
}
