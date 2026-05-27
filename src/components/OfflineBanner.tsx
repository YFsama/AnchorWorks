import { useSyncExternalStore } from 'react';
import { useT } from '../lib/i18n';

/**
 * Tiny "Offline" chip in the bottom-left corner — appears only when the
 * browser reports `navigator.onLine === false`. Uses `useSyncExternalStore`
 * to subscribe to the global `online`/`offline` events without the
 * setState-in-effect anti-pattern.
 *
 * Kept purely presentational: no store dependency, no portal. The chip uses
 * fixed positioning with a high z-index so it sits above panels but below
 * full-screen dialogs (which we render at z-50+).
 */
const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
const getOnlineSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true; // assume online on SSR — don't flash chip during hydration

export function OfflineBanner() {
  const t = useT();
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  if (online) return null;

  // Text uses `text-ink/90` (theme-aware) instead of `text-amber-200` so the
  // chip reads on both dark and light surfaces. Amber semantic is carried by
  // the dot + tinted background + border ring.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-40 select-none rounded-full border border-warn/40 bg-warn/15 px-3 py-1 text-xs font-medium text-ink/90 shadow-md backdrop-blur-sm"
    >
      <span
        aria-hidden="true"
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-warn"
      />
      {t('Offline')}
    </div>
  );
}
