/** Extended I/O: PDF, DXF, JSON, JPG. */

import { getCanvas, pushHistory } from './canvasEngine';
import { exportSVG, download } from './io';
import { renderTrimMarksSVG, type PrintPrep } from './printPrep';
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

/**
 * Real vector PDF export using jsPDF + svg2pdf.js. Renders the canvas's SVG
 * directly into a PDF page sized to the requested paper size.
 */
export async function exportPDFReal(opts?: {
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  prep?: PrintPrep;
}): Promise<void> {
  const canvas = getCanvas();
  if (!canvas) return;

  const pageSize = opts?.pageSize ?? 'A4';
  const cw = canvas.getWidth?.() ?? 0;
  const ch = canvas.getHeight?.() ?? 0;
  const autoOrientation: 'portrait' | 'landscape' = cw > ch ? 'landscape' : 'portrait';
  const orientation = opts?.orientation ?? autoOrientation;
  const prep = opts?.prep;
  const wantPrep = !!prep && (prep.cropMarks || prep.registrationMarks || prep.pageInfo || prep.bleedMm > 0);

  const [pwPortrait, phPortrait] = PAGE_SIZES_MM[pageSize];
  const trimW = orientation === 'portrait' ? pwPortrait : phPortrait;
  const trimH = orientation === 'portrait' ? phPortrait : pwPortrait;

  // When prep is requested we grow the PDF page so the marks fit around the
  // trim box. Otherwise the PDF stays the requested paper size.
  const MARK_MARGIN = 12; // mm of room outside trim+bleed for marks/text
  const bleed = wantPrep ? Math.max(0, prep!.bleedMm) : 0;
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

  pdf.save('design.pdf');
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
