/** Extended I/O: PDF, DXF, JSON, JPG. */

import { getCanvas, pushHistory } from './canvasEngine';
import { exportSVG, download, saveBytesNative } from './io';
import { prepMarkMarginMm, renderTrimMarksSVG, type PrintPrep } from './printPrep';
import { useEditor, type CutPath } from '../store/editor';
import { isTauri } from './runtime';
import * as fabric from 'fabric';

export function exportJPG(multiplier = 2): string {
  const c = getCanvas(); if (!c) return '';
  return c.toDataURL({ format: 'jpeg', quality: 0.92, multiplier });
}

export function exportJSON(): void {
  const c = getCanvas(); if (!c) return;
  const j = JSON.stringify(c.toJSON(), null, 2);
  download('design.json', j, 'application/json');
}

export async function importJSON(file: File): Promise<void> {
  const c = getCanvas(); if (!c) return;
  const t = await file.text();
  await c.loadFromJSON(JSON.parse(t));
  c.renderAll();
  pushHistory();
}

/** Page sizes in millimeters: [width, height] in portrait orientation. */
const PAGE_SIZES_MM: Record<'A4' | 'A3' | 'Letter' | 'Legal', [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [216, 279],
  Legal: [216, 356],
};

/** mm → px factor shared with the cutter pipeline (96dpi convention);
 *  CutPath points are document mm-space, the canvas SVG is px. */
const MM_TO_PX = 3.7795;

/** jsPDF internals relied on by the optional-content (OCG) cut overlay.
 *  Verified against the jspdf@4.2.1 dist (its bundled AcroForm plugin uses
 *  the same hooks — jsPDF itself has no public OCG API). Re-verify on upgrade:
 *  any missing piece just disables the layer metadata (see fallback below). */
interface OcgInternals {
  newObjectDeferred(): number;
  newObjectDeferredBegin(oid: number, doOutput?: boolean): number;
  out(s: string): unknown;
  events: { subscribe(topic: string, cb: () => void): void };
}

/** One ISO 19593-1:2018 processing-steps optional content group. */
interface OcgLayer {
  /** OCG /Name and GTS_ProcStepsType (consumers accept Cutting/PartialCutting). */
  procStepsType: 'Cutting' | 'PartialCutting';
  /** Object id — minted per output pass inside the putResources event, never
   *  at draw time (jsPDF renumbers all objects in resetDocument on every
   *  buildDocument, so draw-time ids would collide with page objects). */
  oid: number;
}

/**
 * Real vector PDF export using jsPDF + svg2pdf.js. Renders the canvas's SVG
 * directly into a PDF page sized to the requested paper size.
 *
 * ISO 19593-1 cut overlay (includeCutPaths): cut paths are wrapped in
 * optional-content groups — /CutLayer for outline/trace/manual/perf kinds
 * (GTS_ProcStepsType /Cutting) and /KissLayer for kiss cuts
 * (/PartialCutting) — registered via a single catalog /OCProperties entry and
 * OFF in the default configuration, so processors that honour processing
 * steps skip the hairlines unless the layer is switched on. Mechanism is
 * internals-based (newObjectDeferred / newObjectDeferredBegin / out, events
 * putResources + putXobjectDict + postPutResources + putCatalog), verified
 * against jspdf 4.2.1 — re-verify on upgrade; on any mismatch the export
 * silently falls back to today's unwrapped hairlines.
 */
export async function exportPDFReal(opts?: {
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  prep?: PrintPrep;
  /** Overlay the store's cut paths as magenta hairlines in the same trim-box
   *  coordinate space as the artwork (CutContour RIP convention). */
  includeCutPaths?: boolean;
}): Promise<void> {
  const canvas = getCanvas();
  if (!canvas) return;

  const pageSize = opts?.pageSize ?? 'A4';
  const cw = canvas.getWidth?.() ?? 0;
  const ch = canvas.getHeight?.() ?? 0;
  const autoOrientation: 'portrait' | 'landscape' = cw > ch ? 'landscape' : 'portrait';
  const orientation = opts?.orientation ?? autoOrientation;
  const prep = opts?.prep;
  const wantPrep = !!prep && (prep.cropMarks || prep.registrationMarks || prep.pageInfo || prep.bleedMm > 0 || prep.scaleCheck === true);

  const [pwPortrait, phPortrait] = PAGE_SIZES_MM[pageSize];
  const trimW = orientation === 'portrait' ? pwPortrait : phPortrait;
  const trimH = orientation === 'portrait' ? phPortrait : pwPortrait;

  // When prep is requested we grow the PDF page so the marks fit around the
  // trim box. Otherwise the PDF stays the requested paper size.
  const bleed = wantPrep ? Math.max(0, prep!.bleedMm) : 0;
  const MARK_MARGIN = wantPrep ? prepMarkMarginMm(prep!) : 12;
  const pageW = wantPrep ? trimW + (bleed + MARK_MARGIN) * 2 : trimW;
  const pageH = wantPrep ? trimH + (bleed + MARK_MARGIN) * 2 : trimH;

  // Lazy-load jsPDF + svg2pdf.js so they don't bloat the main bundle.
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js'),
  ]);

  const svgString = exportSVG();
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.documentElement;

  // jsPDF accepts either a named format or [width, height] in `unit`.
  const pdf = wantPrep
    ? new jsPDF({ orientation, unit: 'mm', format: [pageW, pageH] })
    : new jsPDF({ orientation, unit: 'mm', format: pageSize.toLowerCase() });

  // Fit the SVG into the trim box while preserving aspect ratio.
  const svgW = cw || 1;
  const svgH = ch || 1;
  const scale = Math.min(trimW / svgW, trimH / svgH);
  const renderW = svgW * scale;
  const renderH = svgH * scale;
  const trimX = wantPrep ? bleed + MARK_MARGIN : 0;
  const trimY = wantPrep ? bleed + MARK_MARGIN : 0;
  const x = trimX + (trimW - renderW) / 2;
  const y = trimY + (trimH - renderH) / 2;

  await svg2pdf(svgEl as unknown as Element, pdf, {
    x,
    y,
    width: renderW,
    height: renderH,
  });

  if (wantPrep) {
    // Build a stand-alone SVG for the marks, sized so its viewBox uses mm
    // directly. We place it on the PDF aligned with the trim box.
    const marks = renderTrimMarksSVG(trimW, trimH, prep!);
    const marksSvgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${trimW}mm" height="${trimH}mm" viewBox="0 0 ${trimW} ${trimH}" overflow="visible">${marks}</svg>`;
    const marksDoc = parser.parseFromString(marksSvgStr, 'image/svg+xml');
    const marksEl = marksDoc.documentElement;
    await svg2pdf(marksEl as unknown as Element, pdf, {
      x: trimX,
      y: trimY,
      width: trimW,
      height: trimH,
    });
  }

  if (opts?.includeCutPaths) {
    // CutContour overlay: magenta hairlines over the artwork box, using the
    // same canvas-px → PDF-mm placement computed above for the SVG (pdf
    // coords = x/y + canvasPx * scale, and cut-path mm → canvas px via the
    // shared 96dpi factor).
    const cutPaths = useEditor.getState().cutPaths;
    if (cutPaths.length) {
      // ISO 19593-1 groups: through/perforation cuts vs kiss cuts.
      // Registration marks (and any future kind) stay ungrouped — drawn, but
      // not claimed as cutting geometry by the processing-steps metadata.
      const cutting: CutPath[] = [];
      const kiss: CutPath[] = [];
      const regmark: CutPath[] = [];
      for (const p of cutPaths) {
        if (p.kind === 'kiss') kiss.push(p);
        else if (p.kind === 'regmark') regmark.push(p);
        else cutting.push(p);
      }

      // --- OCG wiring (see JSDoc above; every write is failure-guarded) ---
      let ocWrite: ((s: string) => boolean) | null = null;
      const layers: OcgLayer[] = [];
      try {
        const internal = pdf.internal as unknown as OcgInternals;
        if (typeof internal.newObjectDeferred !== 'function'
          || typeof internal.newObjectDeferredBegin !== 'function'
          || typeof internal.out !== 'function'
          || !internal.events || typeof internal.events.subscribe !== 'function') {
          throw new Error('jspdf OCG internals unavailable');
        }
        if (cutting.length) layers.push({ procStepsType: 'Cutting', oid: 0 });
        if (kiss.length) layers.push({ procStepsType: 'PartialCutting', oid: 0 });
        if (!layers.length) throw new Error('no OCG-eligible cut paths (regmarks only)');

        ocWrite = (s: string): boolean => {
          try { internal.out(s); return true; } catch { ocWrite = null; return false; }
        };

        // Object ids are minted here, per output pass: putResources fires
        // after fonts/gstates/patterns are numbered but before the shared
        // /Resources dict is serialized (and long before the OCG objects are
        // emitted), so ids never collide with page objects.
        internal.events.subscribe('putResources', () => {
          try { for (const l of layers) l.oid = internal.newObjectDeferred(); }
          catch { layers.length = 0; }
        });
        // NOTE: no /Properties entry is written into the shared /Resources
        // dict. The only 4.2.1 event inside the resource-dictionary body
        // (putXobjectDict) fires inside `/XObject <<` BEFORE the framework
        // closes it, and writing `/Properties` there left the object with an
        // unbalanced `>>` — accepted by lenient parsers, rejected by strict
        // prepress. Instead the BDC operands below carry the FULL inline OCG
        // dictionary (standard marked-content grammar — PDF 32000-1 allows a
        // dictionary operand), which open-graphtec-server's cut_extract
        // accepts alongside named properties.
        // The OCG dictionaries themselves, after every resource object.
        internal.events.subscribe('postPutResources', () => {
          for (const l of layers) {
            let begun = false;
            try {
              internal.newObjectDeferredBegin(l.oid, true);
              begun = true;
              internal.out(`<< /Type /OCG /Name (${l.procStepsType}) /GTS_Metadata << /GTS_ProcStepsGroup /Structural /GTS_ProcStepsType /${l.procStepsType} >> >>`);
              internal.out('endobj');
            } catch {
              try { if (begun) internal.out('endobj'); } catch { /* layer dropped */ }
            }
          }
        });
        // ONE /OCProperties catalog entry: both groups registered, both OFF
        // and ordered in the default configuration. These registered twins
        // express the layer inventory and OFF-by-default intent to viewers
        // (Acrobat layers panel); the BDC operands carry equivalent INLINE
        // dictionaries, which some viewers will not toggle with the twins —
        // machine consumers (open-graphtec-server, preflight) read the inline
        // GTS metadata directly either way.
        internal.events.subscribe('putCatalog', () => {
          if (!layers.length) return;
          try {
            const refs = layers.map((l) => `${l.oid} 0 R`).join(' ');
            internal.out(`/OCProperties << /OCGs [${refs}] /D << /Name (Default) /OFF [${refs}] /Order [${refs}] >> >>`);
          } catch { /* catalog without optional content */ }
        });
      } catch {
        // The OCG overlay is a metadata nicety: on any internals mismatch
        // (e.g. a future jspdf rename) fall back to drawing the cut paths
        // without the /OC wrappers — the export must never fail for this.
        // The io layer has no logger, so the fallback is silent.
        ocWrite = null;
        layers.length = 0;
      }

      pdf.setDrawColor(255, 0, 255);
      // 0.25 mm hairline in OUTPUT space — setLineWidth is PDF-unit (mm),
      // already independent of the artwork fit scale.
      pdf.setLineWidth(0.25);

      const drawGroup = (paths: CutPath[]): void => {
        for (const cutPath of paths) {
          const pts = cutPath.points;
          if (pts.length < 2) continue;
          const toPdf = (mx: number, my: number): [number, number] => [x + mx * MM_TO_PX * scale, y + my * MM_TO_PX * scale];
          let [prevX, prevY] = toPdf(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const [cx, cy] = toPdf(pts[i][0], pts[i][1]);
            pdf.line(prevX, prevY, cx, cy);
            prevX = cx;
            prevY = cy;
          }
          if (cutPath.closed) {
            const [sx, sy] = toPdf(pts[0][0], pts[0][1]);
            pdf.line(prevX, prevY, sx, sy);
          }
        }
      };

      const wrap = (layer: OcgLayer | undefined, body: () => void): void => {
        // Inline full OCG dictionary as the BDC property — spec-standard
        // marked-content grammar, needs no /Properties name resolution.
        const open = layer
          ? `/OC << /Type /OCG /Name (${layer.procStepsType}) /GTS_Metadata << /GTS_ProcStepsGroup /Structural /GTS_ProcStepsType /${layer.procStepsType} >> >> BDC`
          : null;
        if (!ocWrite || !layer || !ocWrite(open!)) { body(); return; }
        body();
        ocWrite('EMC');
      };

      // Through cuts first, registration marks, kiss cuts last; within each
      // group the original order is preserved. Grouping reorders strokes only
      // ACROSS groups, which is visually inert: every stroke uses the same
      // opaque magenta paint, so overlapping hairlines rasterize identically
      // in any order.
      wrap(layers.find((l) => l.procStepsType === 'Cutting'), () => drawGroup(cutting));
      drawGroup(regmark);
      wrap(layers.find((l) => l.procStepsType === 'PartialCutting'), () => drawGroup(kiss));
    }
  }

  // jsPDF's save() internally does the same `<a download>` click io.ts works
  // around — under the Tauri shell that's a silent no-op on WKWebView /
  // WebKitGTK, so emit the bytes through the native save dialog instead.
  if (isTauri()) {
    await saveBytesNative('design.pdf', new Uint8Array(pdf.output('arraybuffer')));
  } else {
    pdf.save('design.pdf');
  }
}

/**
 * Lightweight PDF export: build a single-page PDF that embeds the SVG as
 * a vector image preserving editability in viewers that support it. We open a
 * new window and use the browser's "Save as PDF" via print.
 */
export function exportPDF(): void {
  const svg = exportSVG();
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>PDF Export</title>
    <style>html,body{margin:0;padding:0;background:#fff;}
    .wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
    svg{max-width:100%;max-height:100vh}</style></head>
    <body><div class="wrap">${svg}</div>
    <script>setTimeout(()=>window.print(),200);</script></body></html>`);
  w.document.close();
}

/** Export a minimal DXF (AutoCAD R12-ish) of LINE and LWPOLYLINE entities. */
export function exportDXF(): void {
  const c = getCanvas(); if (!c) return;
  const ents: string[] = [];
  c.getObjects().forEach((o) => collectDXFEntities(o, ents));
  const dxf =
    `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ents.join('\n')}\n0\nENDSEC\n0\nEOF\n`;
  download('design.dxf', dxf, 'application/dxf');
}

function collectDXFEntities(o: fabric.FabricObject, out: string[]) {
  if (o.type === 'line') {
    const l = o as fabric.Line;
    out.push(`0\nLINE\n8\n0\n10\n${l.x1}\n20\n${-l.y1!}\n11\n${l.x2}\n21\n${-l.y2!}`);
  } else if (o.type === 'rect') {
    const r = o as fabric.Rect;
    const x = r.left ?? 0, y = r.top ?? 0, w = (r.width ?? 0) * (r.scaleX ?? 1), h = (r.height ?? 0) * (r.scaleY ?? 1);
    out.push(polyDXF([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true));
  } else if (o.type === 'polygon' || o.type === 'polyline') {
    const p = o as fabric.Polygon;
    const left = p.left ?? 0, top = p.top ?? 0;
    const pts = (p.points ?? []).map(pt => [left + pt.x, top + pt.y] as [number, number]);
    out.push(polyDXF(pts, o.type === 'polygon'));
  } else if (o.type === 'path') {
    const pts = sampleObjectPolyline(o as fabric.Path);
    if (pts.length > 1) out.push(polyDXF(pts, false));
  } else if (o.type === 'ellipse' || o.type === 'circle') {
    const e = o as fabric.Ellipse;
    const cx = (e.left ?? 0) + (e.rx ?? 0), cy = (e.top ?? 0) + (e.ry ?? 0);
    const rx = e.rx ?? 0, ry = e.ry ?? 0;
    const pts: Array<[number, number]> = [];
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    out.push(polyDXF(pts, true));
  }
}

function polyDXF(points: Array<[number, number]>, closed: boolean): string {
  const head = `0\nLWPOLYLINE\n8\n0\n90\n${points.length}\n70\n${closed ? 1 : 0}`;
  const body = points.map(([x, y]) => `10\n${x}\n20\n${-y}`).join('\n');
  return `${head}\n${body}`;
}

function sampleObjectPolyline(p: fabric.Path): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const left = p.left ?? 0, top = p.top ?? 0;
  for (const seg of p.path ?? []) {
    const cmd = seg[0];
    if (cmd === 'M' || cmd === 'L') out.push([left + (seg[1] as number), top + (seg[2] as number)]);
    else if (cmd === 'Q') { out.push([left + (seg[3] as number), top + (seg[4] as number)]); }
    else if (cmd === 'C') { out.push([left + (seg[5] as number), top + (seg[6] as number)]); }
  }
  return out;
}
