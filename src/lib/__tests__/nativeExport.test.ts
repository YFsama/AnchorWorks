import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeDataUrlToBytes, download, downloadDataURL, saveBytesNative } from '../io';
import { buildPrintDocumentHtml, pickPrintTransport, printHtmlDocument } from '../printer';

/**
 * Native export / print wiring (Tauri shell slice).
 *
 * Covers the pure decision points of the dual-shell behaviour:
 *   - io.ts: `download` / `downloadDataURL` route to the `fs_save_bytes`
 *     command under Tauri and to the `<a download>` click on the web;
 *     `decodeDataUrlToBytes` turns data URLs into the exact bytes the
 *     native side writes; `saveBytesNative` treats dialog-cancel as a
 *     silent false and toasts on real failures.
 *   - printer.ts: `pickPrintTransport` maps shell → transport,
 *     `buildPrintDocumentHtml` reassembles the historical iframe document,
 *     and `printHtmlDocument` injects the scoped print container into the
 *     main document on the native path.
 *
 * The runtime bridge mirrors the epsonMaint.test.ts pattern: isTauri /
 * callNative are scripted from `native`, everything else stays real. jsdom
 * has no URL.createObjectURL and no anchor navigation, so both are stubbed.
 */

const native = vi.hoisted(() => ({
  tauri: false,
  calls: [] as Array<{ cmd: string; args: Record<string, unknown> | undefined }>,
  /** What the mocked fs_save_bytes resolves with (path string or null). */
  saveReply: null as string | null,
  /** When set, the mocked invoke rejects with this message. */
  error: null as string | null,
}));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return {
    ...actual,
    isTauri: (): boolean => native.tauri,
    callNative: async <T>(
      cmd: string,
      args: Record<string, unknown> | undefined,
      webFallback: () => Promise<T> | T,
    ): Promise<T> => {
      native.calls.push({ cmd, args });
      if (!native.tauri) return await webFallback();
      if (native.error) throw new Error(native.error);
      return (native.saveReply ?? null) as unknown as T;
    },
  };
});

const toasts = vi.hoisted(() => ({ lines: [] as string[] }));

vi.mock('../toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../toast')>();
  const record = (kind: string) => (message: string) => {
    toasts.lines.push(`${kind}:${message}`);
    return 'toast-id';
  };
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: record('success'),
      error: record('error'),
      warn: record('warn'),
      info: record('info'),
    },
  };
});

const NATIVE_PRINT_ROOT_ID = 'anchorworks-native-print-root';
const NATIVE_PRINT_STYLE_ID = 'anchorworks-native-print-style';

/** Let fire-and-forget promises (async IIFE inside download) settle. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  native.tauri = false;
  native.calls.length = 0;
  native.saveReply = null;
  native.error = null;
  toasts.lines.length = 0;
  // jsdom implements neither — stub instead of letting the web path explode.
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  document.getElementById(NATIVE_PRINT_ROOT_ID)?.remove();
  document.getElementById(NATIVE_PRINT_STYLE_ID)?.remove();
  document.body.querySelectorAll('iframe').forEach((f) => f.remove());
});

/* ---------------------------- data URL decode --------------------------- */

describe('decodeDataUrlToBytes', () => {
  it('decodes base64 payloads to the exact source bytes', () => {
    const source = [...new TextEncoder().encode('hello wörld')];
    const b64 = btoa(String.fromCharCode(...source));
    expect(decodeDataUrlToBytes(`data:text/plain;base64,${b64}`)).toEqual(new Uint8Array(source));
  });

  it('decodes percent-encoded payloads (non-base64 data URLs)', () => {
    expect(decodeDataUrlToBytes('data:image/svg+xml,%3Csvg%2F%3E'))
      .toEqual(new TextEncoder().encode('<svg/>'));
  });
});

/* ---------------------------- export branch ----------------------------- */

describe('download / downloadDataURL transport', () => {
  it('under Tauri, download() sends UTF-8 bytes to fs_save_bytes and never clicks an anchor', async () => {
    native.tauri = true;
    download('design.dxf', '0\nSECTION', 'application/dxf');
    await flush();
    expect(native.calls).toHaveLength(1);
    expect(native.calls[0].cmd).toBe('fs_save_bytes');
    expect(native.calls[0].args).toEqual({
      bytes: Array.from(new TextEncoder().encode('0\nSECTION')),
      suggestedName: 'design.dxf',
      path: null,
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('under Tauri, downloadDataURL() decodes the data URL and saves the raw bytes', async () => {
    native.tauri = true;
    const bytes = new TextEncoder().encode('PNGDATA');
    const b64 = btoa(String.fromCharCode(...bytes));
    downloadDataURL('design.png', `data:image/png;base64,${b64}`);
    await flush();
    expect(native.calls).toHaveLength(1);
    expect(native.calls[0].cmd).toBe('fs_save_bytes');
    expect(native.calls[0].args).toMatchObject({
      bytes: Array.from(bytes),
      suggestedName: 'design.png',
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('on the web, download() keeps the <a download> path and never invokes native commands', async () => {
    download('a.svg', '<svg/>', 'image/svg+xml');
    await flush();
    expect(native.calls).toHaveLength(0);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('on the web, downloadDataURL() keeps the anchor-click path', async () => {
    downloadDataURL('a.png', 'data:image/png;base64,AAAA');
    await flush();
    expect(native.calls).toHaveLength(0);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('saveBytesNative', () => {
  it('resolves false with no toast when the user cancels the OS dialog', async () => {
    native.tauri = true;
    native.saveReply = null;
    await expect(saveBytesNative('x.png', new Uint8Array([1]))).resolves.toBe(false);
    expect(toasts.lines).toHaveLength(0);
  });

  it('resolves true and toasts the saved name on success', async () => {
    native.tauri = true;
    native.saveReply = '/tmp/design.png';
    await expect(saveBytesNative('design.png', new Uint8Array([1, 2]))).resolves.toBe(true);
    expect(toasts.lines).toEqual(['success:Saved design.png']);
  });

  it('resolves false and toasts an error when the write fails', async () => {
    native.tauri = true;
    native.error = 'disk full';
    await expect(saveBytesNative('design.png', new Uint8Array([1]))).resolves.toBe(false);
    expect(toasts.lines).toEqual(['error:disk full']);
  });

  it('is a no-op outside Tauri', async () => {
    await expect(saveBytesNative('x.png', new Uint8Array([1]))).resolves.toBe(false);
    expect(native.calls).toHaveLength(0);
  });
});

/* ------------------------------ print branch ---------------------------- */

describe('pickPrintTransport', () => {
  it('maps the shell flag to the transport', () => {
    expect(pickPrintTransport(true)).toBe('native');
    expect(pickPrintTransport(false)).toBe('iframe');
  });
});

describe('buildPrintDocumentHtml', () => {
  it('assembles the standalone iframe document with default title/debounce', () => {
    const html = buildPrintDocumentHtml({ css: '@page { size: A4; }', body: '<div class="page">X</div>' });
    expect(html).toContain('<title>Print</title>');
    expect(html).toContain('@page { size: A4; }');
    expect(html).toContain('<div class="page">X</div>');
    expect(html).toContain('window.print()');
    expect(html).toContain('}, 200)');
  });

  it('honours the call site title and debounce override', () => {
    const html = buildPrintDocumentHtml({ css: '', body: 'B', title: 'Tile Print', delayMs: 100 });
    expect(html).toContain('<title>Tile Print</title>');
    expect(html).toContain('}, 100)');
  });
});

describe('printHtmlDocument', () => {
  it('under Tauri, injects a scoped print container and calls print_native, then cleans up', async () => {
    native.tauri = true;
    printHtmlDocument({ css: '@page { size: 210mm 297mm; margin: 0; }', body: '<div class="page">X</div>' });
    // The native path waits one rAF (style application) before invoking —
    // settle past a frame, not just the microtask queue.
    await new Promise((r) => setTimeout(r, 50));

    const root = document.getElementById(NATIVE_PRINT_ROOT_ID);
    expect(root).not.toBeNull();
    expect(root!.innerHTML).toContain('class="page"');

    const style = document.getElementById(NATIVE_PRINT_STYLE_ID) as HTMLStyleElement;
    expect(style).not.toBeNull();
    // Screen rule hides the container; print rules hide the app and carry
    // the payload's @page through verbatim.
    expect(style.textContent).toContain(`#${NATIVE_PRINT_ROOT_ID} { display: none; }`);
    expect(style.textContent).toContain('@media print');
    expect(style.textContent).toContain('body > *:not(#anchorworks-native-print-root) { display: none !important; }');
    expect(style.textContent).toContain('@page { size: 210mm 297mm; margin: 0; }');

    const last = native.calls[native.calls.length - 1];
    expect(last.cmd).toBe('print_native');
    expect(last.args).toBeUndefined();

    // Cleanup runs on a settle timer after print_native resolves.
    await new Promise((r) => setTimeout(r, 700));
    expect(document.getElementById(NATIVE_PRINT_ROOT_ID)).toBeNull();
    expect(document.getElementById(NATIVE_PRINT_STYLE_ID)).toBeNull();
  });

  it('under Tauri, replaces a stale print root from an earlier attempt', async () => {
    native.tauri = true;
    printHtmlDocument({ css: '', body: '<div>first</div>' });
    await flush();
    printHtmlDocument({ css: '', body: '<div>second</div>' });
    await flush();
    expect(document.querySelectorAll(`#${NATIVE_PRINT_ROOT_ID}`)).toHaveLength(1);
    expect(document.getElementById(NATIVE_PRINT_ROOT_ID)!.innerHTML).toContain('second');
  });

  it('on the web, spawns the hidden iframe instead of touching the main document', async () => {
    printHtmlDocument({ css: '@page { margin: 0; }', body: '<div class="page">Y</div>' });
    const iframe = document.body.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.contentDocument!.body.innerHTML).toContain('class="page"');
    expect(native.calls).toHaveLength(0);
    expect(document.getElementById(NATIVE_PRINT_ROOT_ID)).toBeNull();
    iframe!.remove();
  });
});
