import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printImageAtSize } from '../printer';

/**
 * printImageAtSize — the exact-physical-size image print that hands the
 * composed production sheet (buildProductionPreview's PNG) to the printer.
 * The harness mirrors nativeExport.test.ts (the printer-transport suite):
 * ../runtime is scripted from `native` (web default → the hidden-iframe
 * transport; Tauri → the native PrintOperation), jsdom's real DOM stands in
 * for the document the payload mounts into, and each web test removes the
 * iframe the transport left behind (its self-removal timer is 8 s out).
 */

const native = vi.hoisted(() => ({
  tauri: false,
  calls: [] as Array<{ cmd: string; args: Record<string, unknown> | undefined }>,
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
      return null as unknown as T;
    },
  };
});

const NATIVE_PRINT_ROOT_ID = 'anchorworks-native-print-root';
const NATIVE_PRINT_STYLE_ID = 'anchorworks-native-print-style';
const IMG = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(() => {
  native.tauri = false;
  native.calls.length = 0;
  document.body.querySelectorAll('iframe').forEach((f) => f.remove());
});

describe('printImageAtSize', () => {
  it('builds the hidden iframe with an exact-size @page and a 100%-size img', () => {
    const ok = printImageAtSize(IMG, 210, 297);
    expect(ok).toBe(true);
    const iframe = document.body.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const html = iframe!.contentDocument!.documentElement.outerHTML;
    // @page exactly the requested size with zero margins …
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
    // … and the img at the same exact physical size, carrying the sheet URL.
    expect(html).toContain('width: 210mm');
    expect(html).toContain('height: 297mm');
    expect(html).toContain(`src="${IMG}"`);
    expect(html).toContain('window.print()');
    iframe!.remove();
  });

  it('under Tauri, mounts the print root with the exact-size payload (no iframe)', async () => {
    native.tauri = true;
    const ok = printImageAtSize(IMG, 300, 62);
    expect(ok).toBe(true);
    // The native path waits one rAF (style application) before invoking —
    // settle past a frame, not just the microtask queue.
    await new Promise((r) => setTimeout(r, 50));
    const root = document.getElementById(NATIVE_PRINT_ROOT_ID);
    expect(root).not.toBeNull();
    expect(root!.innerHTML).toContain(`src="${IMG}"`);
    const style = document.getElementById(NATIVE_PRINT_STYLE_ID) as HTMLStyleElement;
    expect(style.textContent).toContain('@page { size: 300mm 62mm; margin: 0; }');
    expect(native.calls.some((c) => c.cmd === 'print_native')).toBe(true);
    expect(document.body.querySelector('iframe')).toBeNull();
    document.getElementById(NATIVE_PRINT_ROOT_ID)?.remove();
    document.getElementById(NATIVE_PRINT_STYLE_ID)?.remove();
  });

  it('returns false and prints nothing for unusable sizes or an empty URL', () => {
    expect(printImageAtSize(IMG, 0, 297)).toBe(false);
    expect(printImageAtSize(IMG, 210, Number.NaN)).toBe(false);
    expect(printImageAtSize(IMG, -1, 297)).toBe(false);
    expect(printImageAtSize('', 210, 297)).toBe(false);
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(native.calls).toHaveLength(0);
  });

  it('returns false when the transport is unavailable (DOM mount throws)', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
      throw new Error('no DOM');
    });
    expect(printImageAtSize(IMG, 210, 297)).toBe(false);
    appendSpy.mockRestore();
    expect(document.body.querySelector('iframe')).toBeNull();
  });
});
