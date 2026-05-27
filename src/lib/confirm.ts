/**
 * Tiny styled confirm primitive — replaces window.confirm().
 *
 * Usage:
 *   if (await showConfirm({ message: 'Delete this?', danger: true })) { ... }
 *
 * Returns a Promise<boolean> that resolves when the user picks Confirm/Cancel,
 * presses Escape, or clicks the backdrop. A new call dismisses any pending one.
 */

export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm { opts: ConfirmOpts; resolve: (v: boolean) => void; }

let current: PendingConfirm | null = null;
const listeners = new Set<() => void>();

export function showConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    // If there's a pending dialog, treat as cancelled.
    if (current) current.resolve(false);
    current = { opts, resolve };
    listeners.forEach((l) => l());
  });
}

export function answerConfirm(value: boolean) {
  if (!current) return;
  const c = current;
  current = null;
  c.resolve(value);
  listeners.forEach((l) => l());
}

export function getCurrentConfirm(): ConfirmOpts | null {
  return current?.opts ?? null;
}

export function subscribeConfirm(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
