/**
 * Runtime-shell detection for the dual-target build.
 *
 * Anchorworks ships as both a PWA (default) and a Tauri 2 native shell
 * (in progress — see src-tauri/). Most code is identical between the two,
 * but a handful of subsystems (filesystem, print spool, serial port, OS
 * menus, file associations) want to call native commands when they're
 * available and fall back to Web APIs otherwise.
 *
 * Single source of truth: `isTauri()`. Modules should never poke at
 * `window.__TAURI__` directly — go through this file so the detection
 * rule (and any future refinement, e.g. `__TAURI_INTERNALS__` for v2.x)
 * lives in one place.
 *
 * The Tauri 2 webview always injects `__TAURI_INTERNALS__` (which holds
 * the IPC bridge). Older v1 builds used `__TAURI__`; we check both so the
 * helper stays correct if the build is ever pinned back. A vanilla browser
 * has neither, so `isTauri()` returns false and the rest of the codebase
 * keeps using fetch / File System Access / Web Serial / window.print as
 * it does today.
 */

interface TauriGlobals {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

let cached: boolean | null = null;

export function isTauri(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = false;
    return cached;
  }
  const w = window as unknown as TauriGlobals;
  cached = Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
  return cached;
}

/** Web fallback flag — the negation of isTauri(). Helps readability when the
 *  branch's "happy path" is the web side. */
export function isWeb(): boolean { return !isTauri(); }

/**
 * True when the current session is on macOS (or iPad / iPhone, which share
 * the same Cmd-key convention). Used by keyboard-shortcut hint UI ("⌘K" vs
 * "Ctrl+K"), drag-feel tweaks, and any future native-menu glue that wants to
 * mirror macOS conventions.
 *
 * Prefers the modern `navigator.userAgentData.platform` (Chromium) and falls
 * back to the deprecated-but-still-universal `navigator.platform` string for
 * Safari / older browsers. Memoized — these values don't change at runtime.
 */
let macCache: boolean | null = null;
export function isMac(): boolean {
  if (macCache !== null) return macCache;
  if (typeof navigator === 'undefined') {
    macCache = false;
    return macCache;
  }
  // Chromium's userAgentData exposes "macOS" / "Windows" / "Linux" etc.
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform) {
    macCache = /mac/i.test(uaData.platform);
    return macCache;
  }
  // Legacy `navigator.platform` — "MacIntel" / "iPhone" / "iPad" / "Win32" etc.
  macCache = /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  return macCache;
}

/**
 * Invoke a Tauri command, OR fall through to a web-side handler when the
 * native shell isn't around. Each call site provides a typed `webFallback`
 * so the dual-shell behaviour is explicit at the call site rather than
 * hidden inside a wrapper module.
 *
 * Usage:
 *   const result = await callNative('fs_save_project', { path, json }, async () => {
 *     return saveProjectViaFileSystemAccess(json); // web path
 *   });
 *
 * The Tauri `invoke` import is dynamic so the web build never pays the
 * cost of loading `@tauri-apps/api` — Vite/Rolldown sees this as a
 * code-split point and tree-shakes the module out when the bundle is
 * deployed as a PWA.
 */
export async function callNative<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  webFallback: () => Promise<T> | T,
): Promise<T> {
  if (!isTauri()) return await webFallback();
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args) as Promise<T>;
}

/**
 * Translate a combo string for `aria-keyshortcuts`. WAI-ARIA spec maps the
 * Mac ⌘ key to `Meta`, not `Ctrl`; exposing `Ctrl+X` to a Mac screen reader
 * announces "Control X" while the actual binding the user presses is ⌘X.
 * Every visible UI surface that emits `aria-keyshortcuts` should funnel its
 * combo through this helper so the swap stays consistent. Non-Mac platforms
 * get the input unchanged. Returns `undefined` for empty input so call sites
 * can pass it straight into JSX (`aria-keyshortcuts={ariaKeyshortcuts(kbd)}`).
 */
export function ariaKeyshortcuts(combo: string | undefined | null): string | undefined {
  if (!combo) return undefined;
  if (!isMac()) return combo;
  return combo.replace(/\bCtrl\b/g, 'Meta');
}

export type OSName = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

let osCache: OSName | null = null;
/**
 * Best-effort OS identification. Same precedence as `isMac()` — Chromium's
 * `userAgentData.platform` first, legacy `navigator.platform` second. Used
 * by the About dialog and any UI that wants to show "Linux" / "Windows" /
 * "macOS" alongside the shell indicator. The Tauri side will provide an
 * authoritative `platform_info` command in a later T1 slice; this helper
 * stays as the cache-friendly synchronous default the UI can call any time.
 */
export function getOS(): OSName {
  if (osCache !== null) return osCache;
  if (typeof navigator === 'undefined') { osCache = 'unknown'; return osCache; }
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  const raw = (uaData?.platform || navigator.platform || '').toLowerCase();
  if (raw.includes('mac')) osCache = 'macos';
  else if (raw.includes('win')) osCache = 'windows';
  else if (raw.includes('android')) osCache = 'android';
  else if (raw.includes('iphone') || raw.includes('ipad') || raw.includes('ios')) osCache = 'ios';
  else if (raw.includes('linux')) osCache = 'linux';
  else osCache = 'unknown';
  return osCache;
}

/** Display-friendly OS label — proper casing for the About dialog etc. */
export function getOSLabel(): string {
  switch (getOS()) {
    case 'macos': return 'macOS';
    case 'windows': return 'Windows';
    case 'linux': return 'Linux';
    case 'ios': return 'iOS';
    case 'android': return 'Android';
    default: return 'Unknown';
  }
}

/** Authoritative platform info from the Tauri shell. Returns null when
 *  running under the PWA (no native bridge available); callers should fall
 *  back to `getOS()` / `getOSLabel()` for the UA-based approximation. */
export interface NativePlatformInfo {
  os: string;     // 'macos' | 'linux' | 'windows' | …
  arch: string;   // 'x86_64' | 'aarch64' | …
  version: string;
}
export async function platformInfo(): Promise<NativePlatformInfo | null> {
  if (!isTauri()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<NativePlatformInfo>('platform_info');
}

/**
 * Update the OS window title in the Tauri shell — no-op under the PWA
 * (callers already wrote to `document.title`, which is what browsers
 * surface in the tab/window list). Fire-and-forget; errors are swallowed
 * because a failed setTitle is cosmetic, not a correctness issue.
 *
 * Dynamic-imported so the PWA build never pulls `@tauri-apps/api/window`
 * into its bundle.
 */
export async function setNativeWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTitle(title);
  } catch { /* swallow — see jsdoc above */ }
}
