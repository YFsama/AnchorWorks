import { useEffect } from 'react';

/**
 * Move focus to `target` on dialog close, resolving the hover-menu race.
 *
 * Two failure modes make a naive `target.focus()` silently drop focus to
 * <body> when the dialog was invoked from a menubar dropdown:
 *
 *  1. The row is already `visibility: hidden` at restore time — the dropdown
 *     panel is kept open by `group-focus-within`, which the dialog's opening
 *     focus steal breaks, so the panel (and the row) hide while the dialog
 *     is open. Focusing a hidden element is a no-op.
 *  2. The row is still visible at restore time because the POINTER still
 *     hovers the panel (`:hover` keeps it open) — focus lands on the row,
 *     then the panel hides as soon as the mouse moves, and the browser
 *     drops focus to <body>. focus() racing the browser's :hover
 *     recomputation loses either way.
 *
 * Both come out right by NEVER restoring into a closed menu's rows: a
 * target inside a `role="menu"` restores to the menu's owning trigger
 * button instead (the always-visible menubar item that opened the panel —
 * matching the keyboard path, where focus was on the trigger all along).
 * Non-menu targets focus directly, with a visible-ancestor fallback for
 * other lazily-hidden invokers.
 */
export function restoreDialogFocus(target: HTMLElement | null): void {
  if (!target || !document.contains(target) || typeof target.focus !== 'function') return;
  const visible = (el: Element) => {
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length > 0;
  };
  // Menu rows always resolve to their panel's owning trigger button. The
  // aria-haspopup="menu" requirement keeps the match tight: every real
  // dropdown trigger carries it (MenuBar Dropdown/submenus, the language
  // pill, CanvasContextMenu submenus), while a loose `:scope > button`
  // could grab an unrelated sibling — e.g. the mobile Panels toggle when
  // the canvas context menu's root (a role="menu" with no owning wrapper)
  // climbs to the app root on ≤900px windows.
  const menu = target.closest('[role="menu"]');
  if (menu) {
    const trigger = menu.parentElement?.querySelector<HTMLElement>(':scope > button[aria-haspopup="menu"]:not([disabled])');
    if (trigger && visible(trigger)) {
      trigger.focus();
      return;
    }
  }
  if (visible(target)) {
    target.focus();
    return;
  }
  // Other hidden invokers: nearest visible focusable ancestor.
  for (let host: HTMLElement | null = target.parentElement; host; host = host.parentElement) {
    if (!visible(host)) continue;
    const candidate = host.querySelector<HTMLElement>(':scope > button:not([disabled]), :scope > [role="menuitem"]:not([disabled])');
    if (candidate) {
      candidate.focus();
      return;
    }
  }
}

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
 *  - element hidden behind a closed dropdown menu (see restoreDialogFocus)
 */
export function useFocusRestore(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    return () => {
      restoreDialogFocus(restoreTo);
    };
  }, [open]);
}
