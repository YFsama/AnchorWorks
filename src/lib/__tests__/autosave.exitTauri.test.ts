import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Exit tracking under the Tauri shell.
 *
 * `installSessionExitTracking()` registers `onCloseRequested` there. That is
 * not a passive observer: Tauri's runtime keeps the window open as soon as a
 * JS listener exists for the close-requested event
 * (tauri/src/manager/window.rs → `api.prevent_close()` when
 * `has_js_listener`), and `@tauri-apps/api/window` destroys the window from
 * JS once the handler returns without `preventDefault()`. Two contracts keep
 * that safe:
 *
 *   - the handler must NOT prevent the close, and must write the clean mark
 *     BEFORE the window goes away (otherwise every normal close reads as a
 *     crash on the next launch), and
 *   - a StrictMode mount → cleanup → mount must end with exactly ONE live
 *     listener, even when the first (async) registration resolves only after
 *     its cleanup already ran.
 *
 * The mock below reproduces the real `onCloseRequested` shape: an async
 * registration, then on close "run handler → destroy unless prevented".
 */
type AutoSaveModule = typeof import('../autosave');
type Handler = (evt: { preventDefault: () => void }) => void | Promise<void>;

const { tauri, windowMock, runtimeMock } = vi.hoisted(() => {
  const tauri = {
    registrations: [] as Array<{ handler: Handler; unlistened: boolean; settle: () => void }>,
    destroys: 0,
  };
  const windowMock = () => ({
    getCurrentWindow: () => ({
      onCloseRequested: (handler: Handler) =>
        new Promise<() => void>((resolve) => {
          const reg = { handler, unlistened: false, settle: () => resolve(() => { reg.unlistened = true; }) };
          tauri.registrations.push(reg);
        }),
      destroy: async () => { tauri.destroys += 1; },
    }),
  });
  const runtimeMock = async (importOriginal: () => Promise<Record<string, unknown>>) => ({
    ...(await importOriginal()),
    isTauri: () => true,
  });
  return { tauri, windowMock, runtimeMock };
});

vi.mock('../runtime', runtimeMock);
vi.mock('@tauri-apps/api/window', windowMock);

const EXIT_KEY = 'vector.sessionExit';

/** Fresh module graph. `vi.resetModules()` also drops the mocks above for
 *  every later import, so re-register them for the new graph each time. */
async function fresh(): Promise<AutoSaveModule> {
  vi.resetModules();
  vi.doMock('../runtime', runtimeMock);
  vi.doMock('@tauri-apps/api/window', windowMock);
  return import('../autosave');
}

/** Wait until `expected` `onCloseRequested` registrations are in, resolve them, drain microtasks. */
async function settleRegistrations(expected: number): Promise<void> {
  await vi.waitFor(() => { expect(tauri.registrations).toHaveLength(expected); });
  for (const r of tauri.registrations) r.settle();
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** What the runtime does when the user clicks the window's close button. */
async function requestClose(): Promise<void> {
  for (const r of tauri.registrations) {
    if (r.unlistened) continue;
    const evt = { prevented: false, preventDefault() { this.prevented = true; } };
    await r.handler(evt);
    if (!evt.prevented) await getCurrentWindow().destroy();
  }
}

const readExit = () => {
  const raw = localStorage.getItem(EXIT_KEY);
  return raw ? (JSON.parse(raw) as { clean: boolean }) : null;
};

beforeEach(() => {
  localStorage.clear();
  tauri.registrations.length = 0;
  tauri.destroys = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session exit tracking under Tauri', () => {
  it('a close request marks a clean exit and still lets the window close', async () => {
    const autosave = await fresh();
    autosave.beginSession();
    expect(readExit()?.clean).toBe(false);
    const dispose = autosave.installSessionExitTracking();
    await settleRegistrations(1);
    expect(tauri.registrations).toHaveLength(1);

    await requestClose();
    expect(readExit()?.clean).toBe(true);
    expect(tauri.destroys).toBe(1);
    dispose();
  });

  it('StrictMode mount → cleanup → mount leaves exactly one live listener', async () => {
    const autosave = await fresh();
    autosave.beginSession();
    // StrictMode: the effect runs, is cleaned up at once (before the dynamic
    // import resolves), then runs again.
    autosave.installSessionExitTracking()();
    const dispose = autosave.installSessionExitTracking();
    await settleRegistrations(2);

    expect(tauri.registrations).toHaveLength(2);
    expect(tauri.registrations[0].unlistened).toBe(true); // late registration released
    expect(tauri.registrations[1].unlistened).toBe(false);

    await requestClose();
    expect(readExit()?.clean).toBe(true);
    expect(tauri.destroys).toBe(1); // one handler ran → one destroy, no rejected double-destroy
    dispose();
    expect(tauri.registrations[1].unlistened).toBe(true);
  });

  it('after dispose the Tauri listener is gone and no longer writes the mark', async () => {
    const autosave = await fresh();
    autosave.beginSession();
    const dispose = autosave.installSessionExitTracking();
    await settleRegistrations(1);
    dispose();
    autosave.markSessionExit(false);
    await requestClose();
    expect(readExit()?.clean).toBe(false);
    expect(tauri.destroys).toBe(0);
  });

  it('a plain page unload (reload, in-app navigation) still marks clean under Tauri', async () => {
    const autosave = await fresh();
    autosave.beginSession();
    const dispose = autosave.installSessionExitTracking();
    await settleRegistrations(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(readExit()?.clean).toBe(true);
    dispose();
  });

  it('a close before the Tauri chunk resolved falls back to the web path', async () => {
    const autosave = await fresh();
    autosave.beginSession();
    const dispose = autosave.installSessionExitTracking();
    // Registration still pending (no settle) — the webview may still run unload.
    window.dispatchEvent(new Event('pagehide'));
    expect(readExit()?.clean).toBe(true);
    dispose();
  });
});
