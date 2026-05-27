import { useEffect } from 'react';

/**
 * When `open` flips to true, capture the currently focused element. When it
 * flips back to false (dialog/modal closes), return focus to that element —
 * keeping keyboard users at their original tab position in the underlying UI.
 *
 * Matches the WAI-ARIA Authoring Practices guidance: "When the dialog closes,
 * focus returns to the element that invoked the dialog."
 *
 * Defenses against edge cases:
 *  - element no longer in the DOM (unmounted while dialog was open)
 *  - element somehow lost its `.focus` method (rare, but cheap to guard)
 */
export function useFocusRestore(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    return () => {
      if (restoreTo && document.contains(restoreTo) && typeof restoreTo.focus === 'function') {
        restoreTo.focus();
      }
    };
  }, [open]);
}
