import { useEffect } from 'react';

/**
 * Capture-phase Escape close handler shared by every modal in the dialog
 * system. Capture phase ensures inner inputs can't swallow Escape; the
 * stopPropagation prevents Escape from cascading to outer dialogs / global
 * Esc handlers (e.g. the canvas deselect handler in App.tsx).
 *
 * Pass `open=false` to skip the listener entirely.
 */
export function useEscapeClose(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);
}
