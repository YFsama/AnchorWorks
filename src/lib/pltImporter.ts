/**
 * HP-GL / PLT importer.
 *
 * Parses the dialect produced by vinyl cutters (Roland CAMM, Graphtec FC,
 * generic HP-GL/2 pen plotters) and turns it into polylines we can drop
 * onto the canvas as a fabric path.
 *
 * Real-world cutter PLTs we tested look like:
 *
 *   TB25;11280,7920;CT1;<spaces>IN;IN;IN;PA;PU10911,5879;PD10913,5834;...;PU11480,200;!PG;
 *
 *   TB nn      - Roland tool-back / overcut depth (ignored on import; replayed on export)
 *   <w>,<h>    - bare numbers following TB = page size in plotter units (40/mm)
 *   CT n       - cut-through / tangential cutting mode (ignored)
 *   <spaces>   - serial-buffer drain padding (skipped)
 *   IN         - initialise (resets state)
 *   PA / PR    - plot absolute / relative
 *   PU x,y     - pen up + move (ends current polyline)
 *   PD x,y...  - pen down + line-to (each coord pair appended)
 *   PG / !PG   - page eject (terminator)
 *   SP n       - select pen n (ignored - we don't track pen colour)
 *   VS n / FS n - velocity / force (ignored)
 *
 * All coordinate values are in plotter units. HP standard is 40 units/mm
 * (= 1016/inch), which both Roland and Graphtec follow. We surface
 * pageSize in mm so the caller can scale the import sensibly.
 */

export interface PltImportOptions {
  /** Plotter units per mm. HP standard = 40. Override only for exotic firmwares. */
  unitsPerMm: number;
  /**
   * Anchor the imported geometry at canvas origin (0,0) instead of leaving it
   * at the absolute coords the cutter file specified. Most user files have
   * an offset baked in for the cutter bed — translating to origin is the
   * sensible default when dropping into a fresh canvas.
   */
  normalizeToOrigin: boolean;
  /** Drop polylines whose bounding box is smaller than this (mm). */
  minSizeMm: number;
}

export const defaultPltImportOptions: PltImportOptions = {
  unitsPerMm: 40,
  normalizeToOrigin: true,
  minSizeMm: 0.05,
};

export interface PltPolyline {
  points: Array<[number, number]>; // in mm, Y-down (SVG convention)
  closed: boolean;
}

export interface PltImportResult {
  polylines: PltPolyline[];
  /** Page size in mm if the cutter declared one (TB followed by w,h). */
  pageSizeMm?: { w: number; h: number };
  /** Bounding box of all geometry in mm. */
  boundsMm: { x: number; y: number; w: number; h: number };
  /** Detected dialect from header sniff. */
  dialect: 'roland-camm' | 'graphtec-fc' | 'bare-hpgl';
  /** Human-readable warnings — unknown opcodes, truncated statements, etc. */
  warnings: string[];
}

/** Parse PLT/HP-GL text. Tolerant: unknown opcodes are warned, not thrown. */
export function parsePlt(text: string, partial?: Partial<PltImportOptions>): PltImportResult {
  const opts = { ...defaultPltImportOptions, ...partial };
  const warnings: string[] = [];

  // Dialect sniff before tokenisation. Order matters: !PG is Roland-specific
  // and stronger than TB which Graphtec also emits occasionally.
  const sniff = text.slice(0, 4096);
  let dialect: PltImportResult['dialect'] = 'bare-hpgl';
  if (/!PG\s*;/.test(sniff) || /^TB\d+;/.test(sniff.trimStart())) dialect = 'roland-camm';
  else if (/\bFS\d+/.test(sniff) || /\bVS\d+/.test(sniff)) dialect = 'graphtec-fc';

  // Tokenise into statements. Both `;` and CR/LF terminate (some firmwares
  // omit `;` after the last statement in a line).
  const stmts = text
    .split(/[;\r\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Parser state.
  let cur: [number, number] = [0, 0]; // current pen position in plotter units
  let absolute = true;
  let lineUnits: Array<[number, number]> = []; // current polyline (units)
  const polysUnits: Array<{ points: Array<[number, number]>; closed: boolean }> = [];
  let pageWidthU: number | undefined;
  let pageHeightU: number | undefined;
  let expectPageSize = false; // TB just seen — next bare numbers = page dims

  const flush = () => {
    if (lineUnits.length >= 2) polysUnits.push({ points: lineUnits, closed: false });
    lineUnits = [];
  };

  const parseNums = (s: string): number[] => {
    if (!s) return [];
    const out: number[] = [];
    // Allow comma OR whitespace separation; tolerate Roland's `+` sign prefix.
    for (const tok of s.split(/[\s,]+/)) {
      if (!tok) continue;
      const n = parseFloat(tok);
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  };

  for (const stmt of stmts) {
    // Bare-number statement (no opcode) — only valid right after TB.
    if (/^[\s\d+\-.,]+$/.test(stmt)) {
      if (expectPageSize) {
        const nums = parseNums(stmt);
        if (nums.length >= 2) { pageWidthU = nums[0]; pageHeightU = nums[1]; }
        expectPageSize = false;
      }
      continue;
    }
    expectPageSize = false;

    // Opcode = leading non-digit run. Roland prefixes its extensions with `!`.
    const m = stmt.match(/^(!?[A-Za-z]{1,3})(.*)$/);
    if (!m) { warnings.push(`Unparseable statement: ${stmt.slice(0, 24)}`); continue; }
    const op = m[1].toUpperCase();
    const params = parseNums(m[2]);

    switch (op) {
      case 'IN':       // initialise — reset state but keep accumulated geometry
      case 'DF':       // default values
      case 'SP':       // select pen (ignored)
      case 'LT':       // line type (ignored)
      case 'CI':       // circle: not used by cutter PLT — fall through warning
      case 'VS':       // velocity
      case 'FS':       // force
      case 'CT':       // cut through mode
      case 'AA':       // arc absolute (rare)
      case 'AR':       // arc relative
      case '!ST':      // Roland Sort (ignored — we don't sort)
      case '!DT':      // Roland delete
      case '!NR':      // Roland new row
        // Acknowledge without action. The geometry-irrelevant ones are
        // collapsed here intentionally.
        if (op === 'CI' || op === 'AA' || op === 'AR') {
          warnings.push(`Skipped arc/circle opcode ${op} — flatten before export to round-trip.`);
        }
        break;

      case 'TB':       // Roland tool-back — next bare-number statement is page size
        expectPageSize = true;
        break;

      case 'PA':       // plot absolute
        absolute = true;
        // PA may carry coords; if so, they are a move (no draw).
        for (let i = 0; i + 1 < params.length; i += 2) {
          cur = [params[i], params[i + 1]];
        }
        break;

      case 'PR':       // plot relative
        absolute = false;
        for (let i = 0; i + 1 < params.length; i += 2) {
          cur = [cur[0] + params[i], cur[1] + params[i + 1]];
        }
        break;

      case 'PU': {     // pen up + optional move
        flush(); // end any active polyline
        for (let i = 0; i + 1 < params.length; i += 2) {
          const x = params[i], y = params[i + 1];
          cur = absolute ? [x, y] : [cur[0] + x, cur[1] + y];
        }
        break;
      }

      case 'PD': {     // pen down + line-to each pair
        if (lineUnits.length === 0) lineUnits.push([cur[0], cur[1]]);
        for (let i = 0; i + 1 < params.length; i += 2) {
          const x = params[i], y = params[i + 1];
          cur = absolute ? [x, y] : [cur[0] + x, cur[1] + y];
          lineUnits.push([cur[0], cur[1]]);
        }
        break;
      }

      case 'PG':
      case '!PG':      // page eject
        flush();
        break;

      default:
        warnings.push(`Unknown opcode ${op}`);
        break;
    }
  }
  flush();

  // Convert plotter units → mm. HP-GL Y-axis is bottom-up (paper); SVG/canvas
  // is top-down. Flip Y around the page height when known, otherwise around
  // the geometry bounds.
  const u2mm = 1 / opts.unitsPerMm;

  // First pass: compute raw bounds in plotter units. Only minX (for the
  // X normalisation offset) and minY/maxY (for the Y flip + normalisation)
  // are consumed downstream — maxX is recomputed in mm after conversion.
  let minX = Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polysUnits) for (const [, y] of p.points) {
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  for (const p of polysUnits) for (const [x] of p.points) {
    if (x < minX) minX = x;
  }
  if (!Number.isFinite(minX)) { minX = minY = maxY = 0; }

  const pageH = pageHeightU; // in plotter units, before mm conversion
  const flipY = (yUnits: number): number => {
    if (pageH !== undefined) return (pageH - yUnits) * u2mm;
    return (maxY - (yUnits - minY)) * u2mm; // flip around bounding box
  };

  const offsetXmm = opts.normalizeToOrigin ? -minX * u2mm : 0;
  const offsetYmm = opts.normalizeToOrigin
    ? -(pageH !== undefined ? (pageH - maxY) : 0) * u2mm
    : 0;

  const polylines: PltPolyline[] = [];
  for (const p of polysUnits) {
    const pts: Array<[number, number]> = p.points.map(([x, y]) => [
      x * u2mm + offsetXmm,
      flipY(y) + offsetYmm,
    ]);
    // Filter out degenerate fragments smaller than minSize.
    let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
    for (const [x, y] of pts) {
      if (x < lx) lx = x; if (x > hx) hx = x;
      if (y < ly) ly = y; if (y > hy) hy = y;
    }
    if (Math.max(hx - lx, hy - ly) < opts.minSizeMm) continue;

    // Detect "closed by coincidence" — first ≈ last → mark closed so the
    // exporter can emit Z and the editor's path tools recognise the loop.
    const first = pts[0], last = pts[pts.length - 1];
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05;
    polylines.push({ points: pts, closed });
  }

  // Recompute bounds after the unit-conversion + Y-flip pass.
  let bx = Infinity, by = Infinity, bxe = -Infinity, bye = -Infinity;
  for (const p of polylines) for (const [x, y] of p.points) {
    if (x < bx) bx = x; if (x > bxe) bxe = x;
    if (y < by) by = y; if (y > bye) bye = y;
  }

  // When normalizeToOrigin is set but the cutter file didn't declare a page
  // size (so the upstream Y offset was 0 and the flipped Y still sits at
  // wherever the original units happened to land), do a final shift so the
  // imported geometry actually starts at (0,0). With pageH known the offset
  // was computed up-front and this is a no-op.
  if (opts.normalizeToOrigin && Number.isFinite(bx) && (bx !== 0 || by !== 0)) {
    for (const p of polylines) {
      for (let i = 0; i < p.points.length; i++) {
        p.points[i] = [p.points[i][0] - bx, p.points[i][1] - by];
      }
    }
    bxe -= bx; bye -= by;
    bx = 0; by = 0;
  }
  if (!Number.isFinite(bx)) { bx = by = bxe = bye = 0; }

  return {
    polylines,
    pageSizeMm: pageWidthU !== undefined && pageHeightU !== undefined
      ? { w: pageWidthU * u2mm, h: pageHeightU * u2mm }
      : undefined,
    boundsMm: { x: bx, y: by, w: bxe - bx, h: bye - by },
    dialect,
    warnings,
  };
}

/**
 * Convert parsed polylines to an SVG <path> document so the existing
 * `importSVGString` pipeline can place it on the canvas. Caller controls
 * the mm-to-px scale; 3.7795 (96dpi) is the default everywhere else in the
 * codebase.
 */
export function polylinesToSvg(
  polys: PltPolyline[],
  opts: { pxPerMm?: number; strokeColor?: string } = {},
): string {
  const pxPerMm = opts.pxPerMm ?? 3.7795;
  const stroke = opts.strokeColor ?? '#111';

  if (polys.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>';
  }

  // Compute viewport in px.
  let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
  for (const p of polys) for (const [x, y] of p.points) {
    const X = x * pxPerMm, Y = y * pxPerMm;
    if (X < lx) lx = X; if (X > hx) hx = X;
    if (Y < ly) ly = Y; if (Y > hy) hy = Y;
  }
  const pad = 4;
  const vbW = (hx - lx) + pad * 2;
  const vbH = (hy - ly) + pad * 2;

  const paths = polys.map(p => {
    const parts: string[] = [];
    p.points.forEach(([x, y], i) => {
      const X = (x * pxPerMm - lx + pad).toFixed(3);
      const Y = (y * pxPerMm - ly + pad).toFixed(3);
      parts.push(i === 0 ? `M${X} ${Y}` : `L${X} ${Y}`);
    });
    if (p.closed) parts.push('Z');
    return `<path d="${parts.join(' ')}" fill="none" stroke="${stroke}" stroke-width="0.5"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW.toFixed(2)}" height="${vbH.toFixed(2)}" viewBox="0 0 ${vbW.toFixed(2)} ${vbH.toFixed(2)}">${paths}</svg>`;
}
