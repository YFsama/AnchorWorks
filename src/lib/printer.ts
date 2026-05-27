import { exportSVG } from './io';
import { renderTrimMarksSVG, type PrintPrep } from './printPrep';

export interface PrintOptions {
  pageSize: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  fit: 'actual' | 'fit' | 'fill';
  marginMm: number;
}

const PAGE_DIMS_MM: Record<PrintOptions['pageSize'], [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [216, 279],
  Legal: [216, 356],
};

/** True when any prep overlay actually needs to be drawn. */
function hasPrep(prep?: PrintPrep): prep is PrintPrep {
  if (!prep) return false;
  return prep.cropMarks || prep.registrationMarks || prep.pageInfo || prep.bleedMm > 0;
}

/** Open a hidden iframe with print-ready HTML, then invoke window.print.
 *  Works identically under the Tauri shell — the embedded webview routes
 *  `window.print()` to the OS print dialog (WebKit / WebView2 / WebKitGTK).
 *  The Rust-side `print_native` command exists for cases that don't have a
 *  user gesture available (e.g. file-association launches), not the hot
 *  print path the dialogs and tile-print exercise. */
export function printCanvas(opts: PrintOptions, prep?: PrintPrep) {
  const svg = exportSVG();
  const [pw, ph] = opts.orientation === 'portrait'
    ? PAGE_DIMS_MM[opts.pageSize]
    : ([...PAGE_DIMS_MM[opts.pageSize]].reverse() as [number, number]);
  const fit = opts.fit;
  const m = opts.marginMm;

  // When prep is requested, we wrap the canvas SVG in an outer SVG sized to
  // include the bleed margin on every side, and overlay the marks layer
  // around the trim box. The @page size is grown by 2*bleed so the marks fit
  // on the printed page.
  if (hasPrep(prep)) {
    const bleed = Math.max(0, prep.bleedMm);
    // Outer page size includes bleed plus a small margin so marks aren't
    // clipped by the printer's hardware margin.
    const MARK_MARGIN = 12; // mm of room outside trim+bleed for marks/text
    const outerW = pw + (bleed + MARK_MARGIN) * 2;
    const outerH = ph + (bleed + MARK_MARGIN) * 2;
    const offX = bleed + MARK_MARGIN; // trim box top-left within outer SVG
    const offY = bleed + MARK_MARGIN;

    const innerSvg = svg
      .replace(/<\?xml[^?]*\?>/, '')
      .replace(/<!DOCTYPE[^>]*>/, '');

    const marks = renderTrimMarksSVG(pw, ph, prep);

    const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}mm" height="${outerH}mm" viewBox="0 0 ${outerW} ${outerH}">
      <g transform="translate(${offX} ${offY})">
        <!-- artwork scaled to the trim box -->
        <svg width="${pw}" height="${ph}" x="0" y="0" preserveAspectRatio="xMidYMid ${fit === 'fill' ? 'slice' : 'meet'}">${innerSvg}</svg>
        <!-- prep marks -->
        <g>${marks}</g>
      </g>
    </svg>`;

    const html = `<!doctype html><html><head><title>Print</title><style>
      @page { size: ${outerW}mm ${outerH}mm; margin: 0; marks: crop; }
      html, body { margin: 0; padding: 0; background: white; }
      .page { width: ${outerW}mm; height: ${outerH}mm; }
      svg { display: block; width: 100%; height: 100%; }
    </style></head><body>
      <div class="page">${wrappedSvg}</div>
      <script>window.onload = () => { setTimeout(() => { window.print(); }, 100); };</script>
    </body></html>`;

    spawnPrintIframe(html);
    return;
  }

  const containerStyle = fit === 'actual'
    ? `width: auto; height: auto;`
    : fit === 'fit'
      ? `width: 100%; height: 100%; object-fit: contain;`
      : `width: 100%; height: 100%; object-fit: cover;`;

  const html = `<!doctype html><html><head><title>Print</title><style>
    @page { size: ${pw}mm ${ph}mm; margin: ${m}mm; }
    html, body { margin: 0; padding: 0; background: white; }
    .page { width: ${pw - m * 2}mm; height: ${ph - m * 2}mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    svg { ${containerStyle} max-width: 100%; max-height: 100%; }
  </style></head><body>
    <div class="page">${svg}</div>
    <script>window.onload = () => { setTimeout(() => { window.print(); }, 100); };</script>
  </body></html>`;

  spawnPrintIframe(html);
}

function spawnPrintIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => document.body.removeChild(iframe), 5000);
}
