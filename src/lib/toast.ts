/**
 * Tiny pub/sub toast notification system. Zero dependencies.
 *
 * Usage:
 *   import { toast } from '../lib/toast';
 *   toast.success('Saved');
 *   toast.error('API not available', { title: 'Plotter' });
 *   toast.show({ kind: 'info', message: 'Hello', action: { label: 'Undo', onClick: () => {} } });
 *
 * Render with <ToastHost /> mounted once in the app shell.
 */

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  /** ms before auto-dismiss; defaults to 4000 (errors: 7000). */
  duration?: number;
  action?: ToastAction;
}

type Listener = (toasts: Toast[]) => void;

const MAX_CONCURRENT = 5;
const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 7000;

let counter = 0;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, number>();

function emit() {
  // Hand each listener a fresh slice so React diffs cleanly.
  const snapshot = toasts.slice();
  for (const l of listeners) l(snapshot);
}

function nextId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}-${counter}`;
}

function scheduleDismiss(id: string, duration: number) {
  if (duration <= 0) return;
  const handle = window.setTimeout(() => dismiss(id), duration);
  timers.set(id, handle);
}

function clearTimer(id: string) {
  const handle = timers.get(id);
  if (handle != null) {
    window.clearTimeout(handle);
    timers.delete(id);
  }
}

function show(t: Omit<Toast, 'id'>): string {
  const id = nextId();
  const duration = t.duration ?? (t.kind === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
  const next: Toast = { ...t, id, duration };
  toasts = [...toasts, next];
  // FIFO cap — drop oldest if we're over the limit.
  while (toasts.length > MAX_CONCURRENT) {
    const removed = toasts.shift();
    if (removed) clearTimer(removed.id);
  }
  scheduleDismiss(id, duration);
  emit();
  return id;
}

function dismiss(id: string) {
  const before = toasts.length;
  toasts = toasts.filter(t => t.id !== id);
  clearTimer(id);
  if (toasts.length !== before) emit();
}

function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  // Prime the new subscriber with the current state.
  fn(toasts.slice());
  return () => { listeners.delete(fn); };
}

type ShortOpts = { title?: string; duration?: number; action?: ToastAction };

function shortHelper(kind: ToastKind) {
  return (message: string, opts: ShortOpts = {}): string =>
    show({ kind, message, title: opts.title, duration: opts.duration, action: opts.action });
}

export const toast = {
  show,
  dismiss,
  info: shortHelper('info'),
  success: shortHelper('success'),
  warn: shortHelper('warn'),
  error: shortHelper('error'),
};

export { subscribeToasts };
