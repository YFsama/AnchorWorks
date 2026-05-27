/** Simple in-app debug log + perf timer with a tiny pubsub. */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export interface LogEntry { ts: number; level: LogLevel; tag: string; message: string; }

const buffer: LogEntry[] = [];
const listeners = new Set<() => void>();
const MAX = 500;

export function log(level: LogLevel, tag: string, message: string) {
  buffer.push({ ts: Date.now(), level, tag, message });
  if (buffer.length > MAX) buffer.shift();
  listeners.forEach(l => l());
  if (level === 'error') console.error(`[${tag}]`, message);
  else if (level === 'warn') console.warn(`[${tag}]`, message);
  else console.log(`[${tag}]`, message);
}
export const logger = {
  info:  (tag: string, m: string) => log('info', tag, m),
  warn:  (tag: string, m: string) => log('warn', tag, m),
  error: (tag: string, m: string) => log('error', tag, m),
  debug: (tag: string, m: string) => log('debug', tag, m),
};
export function subscribeLog(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
export function getLog(): LogEntry[] { return [...buffer]; }
export function clearLog() { buffer.length = 0; listeners.forEach(l => l()); }

export function time<T>(tag: string, fn: () => T): T {
  const start = performance.now();
  const r = fn();
  log('debug', tag, `took ${(performance.now() - start).toFixed(1)}ms`);
  return r;
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => log('error', 'window', e.message));
  window.addEventListener('unhandledrejection', (e) => log('error', 'promise', String((e as PromiseRejectionEvent).reason)));
}
