import { exportSVG } from './io';
import { callNative, isTauri } from './runtime';
import { toast } from './toast';
import { t } from './i18n';
import { renderTrimMarksSVG, type PrintPrep } from './printPrep';

export interface PrintOptions {
  pageSize: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  fit: 'actual' | 'fit' | 'fill';
  marginMm: number;
}

export const PAGE_DIMS_MM: Record<PrintOptions['pageSize'], [number, number]> = {
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

/* ------------------------------------------------------------------ */
/* Print transport plumbing — shared by printer.ts and io3.ts         */
/* ------------------------------------------------------------------ */

/**
 * The document pieces every print path produces: a print-scoped stylesheet
 * (starts with the `@page` rule) and the body markup that goes on the
 * page(s). Kept as data rather than a finished HTML string so each
 * transport can assemble what it needs — the iframe path wraps it in a
 * standalone document, the native path scopes it inside the main document.
 */
export interface PrintPayload {
  css: string;
  body: string;
  /** Standalone-document title (iframe transport only — kept so the web
   *  output stays byte-identical to the pre-helper era). */
  title?: string;
  /** Auto-print debounce for the iframe transport's onload script. */
  delayMs?: number;
  /** How long the hidden print iframe stays in the DOM before removal.
   *  Image-heavy payloads (multi-page PDF, tile print) can take seconds to
   *  fire onload → print; removing the iframe too early silently cancels
   *  the print. Defaults to 5000; the heavy paths pass 8000 to match their
   *  pre-refactor margin. */
  iframeRemovalMs?: number;
}

export type PrintTransport = 'iframe' | 'native';

/**
 * Pure environment → transport decision (unit tested; call sites inject the
 * flag so tests never depend on the real Tauri globals).
 *
 * Web/PWA/Electron: hidden iframe + `window.print()` — the historical path.
 * Tauri shell: `window.print()` inside an embedded WKWebView/WebKitGTK is
 * exactly the environment where it silently does nothing, so the content is
 * injected into the main document and printed via the Rust `print_native`
 * command (wry's real PrintOperation).
 */
export function pickPrintTransport(tauriEnv: boolean): PrintTransport {
  return tauriEnv ? 'native' : 'iframe';
}

/** Assemble the standalone document the iframe transport writes. Mirrors
 *  the exact markup the three call sites used to inline (same title, same
 *  debounce script) so web behaviour is unchanged. */
export function buildPrintDocumentHtml(payload: PrintPayload): string {
  const title = payload.title ?? 'Print';
  const delay = payload.delayMs ?? 200;
  return `<!doctype html><html><head><title>${title}</title><style>${payload.css}</style></head><body>
    ${payload.body}
    <script>window.onload = () => { setTimeout(() => { window.print(); }, ${delay}); };</script>
  </body></html>`;
}

/** Entry point for every print path: picks the transport for the current
 *  shell and dispatches. Callers only ever build a PrintPayload. */
export function printHtmlDocument(payload: PrintPayload): void {
  if (pickPrintTransport(isTauri()) === 'native') {
    printInMainDocument(payload);
  } else {
    spawnPrintIframe(buildPrintDocumentHtml(payload), payload.iframeRemovalMs ?? 5000);
  }
}

const NATIVE_PRINT_ROOT_ID = 'anchorworks-native-print-root';
const NATIVE_PRINT_STYLE_ID = 'anchorworks-native-print-style';

/**
 * Native-shell print: mount the payload into the main document inside a
 * container that is `display:none` on screen, with a scoped stylesheet that
 * (only) under `@media print` hides the entire app UI and shows the
 * container. The webview then hands its DOM to wry's PrintOperation via the
 * Rust `print_native` command — both WKWebView and WebKitGTK render print
 * media, so the payload's `@page` size/margins apply exactly as they did in
 * the iframe document (index.css declares no print rules of its own, so
 * there is nothing to fight with).
 */
function printInMainDocument(payload: PrintPayload): void {
  // Drop leftovers from an earlier native print (crashed dialog, killed
  // window) so a stale payload can never bleed into this one.
  document.getElementById(NATIVE_PRINT_ROOT_ID)?.remove();
  document.getElementById(NATIVE_PRINT_STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = NATIVE_PRINT_STYLE_ID;
  style.textContent = `
    #${NATIVE_PRINT_ROOT_ID} { display: none; }
    @media print {
      body > *:not(#${NATIVE_PRINT_ROOT_ID}) { display: none !important; }
      #${NATIVE_PRINT_ROOT_ID} { display: block !important; }
      ${payload.css}
    }`;

  const root = document.createElement('div');
  root.id = NATIVE_PRINT_ROOT_ID;
  root.innerHTML = payload.body;

  document.body.append(style, root);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', onAfterPrint);
    document.getElementById(NATIVE_PRINT_ROOT_ID)?.remove();
    document.getElementById(NATIVE_PRINT_STYLE_ID)?.remove();
  };
  // Primary cleanup signal: `afterprint` fires in the main window once the
  // OS print dialog has actually finished (WebView2 evals window.print(),
  // which fires it natively; WKWebView/WebKitGTK fire it around the print
  // operation). The 500 ms settle below is only the fallback for backends
  // that resolve the invoke early without surfacing afterprint.
  const onAfterPrint = () => cleanup();
  window.addEventListener('afterprint', onAfterPrint);
  // Failsafe: if the invoke never settles (webview killed mid-dialog), the
  // print styles must not outlive the attempt by forever hiding nothing.
  const failsafe = window.setTimeout(cleanup, 5 * 60_000);

  void (async () => {
    try {
      // One layout frame so the webview applies the print stylesheet before
      // wry snapshots the DOM into the print surface.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await callNative('print_native', undefined, () => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t('Print failed') });
    } finally {
      // Settle window for backends that resolve the invoke while the dialog
      // is still up — afterprint (if the backend fires it) wins the race.
      window.setTimeout(() => {
        window.clearTimeout(failsafe);
        cleanup();
      }, 500);
    }
  })();
}

/** Open a hidden iframe with print-ready HTML, then invoke window.print.
 *  Web/PWA/Electron path — unchanged from the pre-helper era. */
function spawnPrintIframe(html: string, removalMs: number) {
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
  setTimeout(() => document.body.removeChild(iframe), removalMs);
}

/** Print the current canvas. Under the Tauri shell the payload is printed
 *  through the native PrintOperation (`print_native`); in a browser it goes
 *  through the hidden-iframe + `window.print()` path. See
 *  `pickPrintTransport` for why the shell can't rely on `window.print()`. */
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

    printHtmlDocument({
      title: 'Print',
      delayMs: 100,
      css: `
      @page { size: ${outerW}mm ${outerH}mm; margin: 0; marks: crop; }
      html, body { margin: 0; padding: 0; background: white; }
      .page { width: ${outerW}mm; height: ${outerH}mm; }
      svg { display: block; width: 100%; height: 100%; }`,
      body: `<div class="page">${wrappedSvg}</div>`,
    });
    return;
  }

  const containerStyle = fit === 'actual'
    ? `width: auto; height: auto;`
    : fit === 'fit'
      ? `width: 100%; height: 100%; object-fit: contain;`
      : `width: 100%; height: 100%; object-fit: cover;`;

  printHtmlDocument({
    title: 'Print',
    delayMs: 100,
    css: `
    @page { size: ${pw}mm ${ph}mm; margin: ${m}mm; }
    html, body { margin: 0; padding: 0; background: white; }
    .page { width: ${pw - m * 2}mm; height: ${ph - m * 2}mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    svg { ${containerStyle} max-width: 100%; max-height: 100%; }`,
    body: `<div class="page">${svg}</div>`,
  });
}
