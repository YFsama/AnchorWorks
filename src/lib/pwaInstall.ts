/**
 * In-app PWA install entry point.
 * ---------------------------------------------------------------
 * Chromium fires `beforeinstallprompt` once the PWA installability
 * criteria are met (SW active, manifest, HTTPS). The default UX buries
 * installation behind the browser's omnibox install chip; this module
 * captures the event so the app can surface its own "Install
 * Anchorworks…" affordance (Help menu + command palette) and call
 * `prompt()` when the user actually asks for it.
 *
 *   App.tsx        — arms the module once per mount via `armPwaInstall()`
 *                    (StrictMode-safe: add/remove listeners, cleanup on
 *                    unmount).
 *   MenuBar /      — render their install entry only when `canInstall()`
 *   CommandPalette   is true, re-checking on every availability change
 *                    through `subscribeInstallAvailability()`.
 *
 * Where the event never fires — iOS Safari (uses Share → Add to Home
 * Screen), already-installed sessions, the Tauri and Electron shells —
 * `canInstall()` stays false and the menu entry simply never appears.
 *
 * `promptInstall()` is one-shot per captured event, matching the platform:
 * a dismissed or completed prompt never re-prompts from the same event;
 * the browser fires a fresh `beforeinstallprompt` if it becomes eligible
 * again, which re-arms the module.
 */

import { toast } from './toast';
import { t } from './i18n';

/** Minimal shape of the non-standard `BeforeInstallPromptEvent`. The DOM
 *  lib doesn't declare it (it's a Chromium proposal), so declare the two
 *  members we actually use. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

/**
 * Capture `beforeinstallprompt` (and the completion `appinstalled` event)
 * at module level. Called once from App.tsx's mount effect; returns the
 * disposer for that effect's cleanup, so listener add/remove stays
 * StrictMode-safe.
 */
export function armPwaInstall(): () => void {
  if (typeof window === 'undefined') return () => { /* SSR / test env — nothing to arm */ };

  const onBeforeInstallPrompt = (e: Event) => {
    // Prevent the browser's own mini-infobar so only our in-app entry
    // surfaces the install flow.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  };

  const onAppInstalled = () => {
    // The event can arrive without a preceding in-app prompt (user clicked
    // the omnibox chip directly), so also clear + notify here.
    deferredPrompt = null;
    notify();
    toast.success(t('Anchorworks installed'), { title: t('Installed') });
  };

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  };
}

/** True when an install prompt is currently capturable and not yet spent. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Subscribe to install-availability flips (event captured / spent /
 * install completed). Menu items use this to re-render at the moment the
 * platform becomes (or stops being) installable, instead of relying on a
 * lucky re-render. Returns an unsubscribe fn for effect cleanup.
 */
export function subscribeInstallAvailability(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/**
 * Show the platform install dialog for the captured event. One-shot: the
 * event is consumed either way, matching browser behaviour. Toasts cover
 * the outcomes — success arrives via the `appinstalled` listener; a
 * dismissal is the user's own choice and stays silent; a `prompt()` throw
 * surfaces as an error toast.
 */
export async function promptInstall(): Promise<void> {
  const event = deferredPrompt;
  if (!event) return;
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    // Drain userChoice so an unhandled rejection can't surface in the
    // console after dismissal (the only outcome that resolves here).
    await event.userChoice.catch(() => undefined);
  } catch (err) {
    toast.error((err as Error).message, { title: t('Installation failed') });
  }
}
