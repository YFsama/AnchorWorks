/**
 * In-app updater UX. Replaces Tauri's native confirmation dialog
 * (`updater.dialog: true`) with a non-blocking toast workflow:
 *
 *   1. App boot waits ~5 s, then quietly polls the configured updater
 *      endpoint via `check()`.
 *   2. If a newer version is available, show a sticky info toast with
 *      "Install" + "Later" actions.
 *   3. On Install, kick off `downloadAndInstall()` and patch a toast
 *      progress bar from the plugin's progress callback.
 *   4. When the install finishes, show a Restart toast that calls
 *      `relaunch()` from `@tauri-apps/plugin-process`.
 *
 * All of this is no-op outside the Tauri shell — the PWA build is updated
 * via Service Worker and never reaches this module.
 */

import { toast } from './toast';
import { isTauri } from './runtime';
import { t } from './i18n';

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
  // The two callback functions exposed by tauri-plugin-updater's `check()`.
  downloadAndInstall(onEvent: (e: ProgressEvent) => void): Promise<void>;
}

type ProgressEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

/**
 * Boot-time updater hook. Called once from App.tsx after the canvas is
 * ready. Silently no-ops in the PWA build (Service Worker handles those
 * updates already) and on the user's first launch after install if they
 * opt out via the `vs:updater-paused` localStorage flag.
 */
export function initUpdaterOnBoot(): void {
  if (!isTauri()) return;
  try {
    if (window.localStorage.getItem('vs:updater-paused') === '1') return;
  } catch { /* localStorage blocked — proceed; user can opt out again */ }

  // 5s warm-up: don't compete for bandwidth/CPU with the first paint.
  // Long enough to feel "after startup," short enough to catch the
  // session before the user gets too invested in an unsaved doc.
  window.setTimeout(() => {
    void checkAndPrompt();
  }, 5000);
}

/**
 * Manually trigger an update check (e.g. from Help → Check for updates).
 * Surfaces an info toast when no update is found so the user gets
 * feedback rather than silence.
 */
export async function checkAndPrompt(opts: { announceNoUpdate?: boolean } = {}): Promise<void> {
  if (!isTauri()) {
    toast.info(t('Updates apply automatically in the PWA build.'), { title: t('Updates') });
    return;
  }

  let info: UpdateInfo | null;
  try {
    info = await checkForUpdate();
  } catch (err) {
    // Network failures are quiet by default — pollers shouldn't yell —
    // but a *manual* check (Help menu) deserves visible feedback so the
    // user doesn't wonder if the click worked.
    if (opts.announceNoUpdate) {
      toast.warn((err as Error).message, { title: t('Update check failed') });
    }
    return;
  }

  if (!info) {
    if (opts.announceNoUpdate) {
      toast.success(t('You are on the latest version.'), { title: t('No update available') });
    }
    return;
  }

  promptInstall(info);
}

async function checkForUpdate(): Promise<UpdateInfo | null> {
  // Dynamic import so the PWA build doesn't pull plugin-updater into its
  // initial chunk. The runtime gate above guarantees we only reach this
  // code when running under Tauri, where the dynamic import resolves to
  // the real plugin shim.
  const mod = await import('@tauri-apps/plugin-updater');
  const update = await mod.check();
  if (!update) return null;
  return {
    version: update.version,
    date: update.date,
    body: update.body,
    downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent as never),
  };
}

function promptInstall(info: UpdateInfo): void {
  // Sticky (duration: 0) so the user finds it again if they wander off.
  const id = toast.show({
    kind: 'info',
    title: t('Update available'),
    message: `${t('A new version')} v${info.version}${info.body ? ` — ${info.body.slice(0, 80)}${info.body.length > 80 ? '…' : ''}` : ''}`,
    duration: 0,
    action: {
      label: t('Install'),
      onClick: () => { void runInstall(info); },
    },
  });
  // No-op log so static analysis doesn't flag `id` as unused — we keep
  // the id around in case a future iteration wants to update this toast
  // in place rather than spawn a replacement.
  void id;
}

async function runInstall(info: UpdateInfo): Promise<void> {
  // Single sticky toast we patch as the download progresses.
  const id = toast.show({
    kind: 'info',
    title: `${t('Updating to')} v${info.version}`,
    message: t('Preparing download…'),
    duration: 0,
    progress: 0,
  });

  let totalBytes = 0;
  let received = 0;

  try {
    await info.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength ?? 0;
        toast.update(id, {
          message: totalBytes > 0
            ? `${t('Downloading')} (${formatBytes(totalBytes)})…`
            : t('Downloading…'),
          progress: 0,
        });
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength;
        const pct = totalBytes > 0 ? (received / totalBytes) * 100 : Math.min(99, received / 1_000_000);
        toast.update(id, {
          message: totalBytes > 0
            ? `${formatBytes(received)} / ${formatBytes(totalBytes)} · ${Math.round(pct)}%`
            : `${formatBytes(received)}…`,
          progress: pct,
        });
      } else if (event.event === 'Finished') {
        toast.update(id, {
          message: t('Verifying signature…'),
          progress: 100,
        });
      }
    });

    toast.dismiss(id);
    // Restart prompt — sticky, single click relaunches.
    toast.show({
      kind: 'success',
      title: t('Update installed'),
      message: t('Restart to load v') + info.version,
      duration: 0,
      action: {
        label: t('Restart now'),
        onClick: () => { void relaunch(); },
      },
    });
  } catch (err) {
    toast.update(id, {
      kind: 'error',
      title: t('Update failed'),
      message: (err as Error).message,
      duration: 8000,
      progress: undefined,
    });
  }
}

async function relaunch(): Promise<void> {
  try {
    const mod = await import('@tauri-apps/plugin-process');
    await mod.relaunch();
  } catch (err) {
    toast.error((err as Error).message, { title: t('Restart failed') });
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
