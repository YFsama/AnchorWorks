/**
 * Global error log — the recording half of Anchorworks' "record, copy,
 * report" error story.
 *
 *   record  → window 'error', 'unhandledrejection', React boundary catches,
 *             and error toasts all funnel into one ring buffer (200 entries).
 *   copy    → formatErrorsMarkdown() renders a human-readable report for the
 *             clipboard / a downloaded .txt.
 *   report  → buildGitHubIssueUrl() prefills an issue on the project repo.
 *
 * Everything lives in module state with a toast.ts-style snapshot broadcast
 * (`subscribeErrors`), so both React hosts and non-React call sites
 * (ErrorBoundary in main.tsx, menu actions) share one source of truth.
 *
 * The dialog-open flag also lives here (confirm.ts precedent) rather than the
 * editor store: setModal's key union is owned by other feature slices, and
 * the boundary needs to open the log from outside any React context anyway.
 */

import { subscribeToasts } from './toast';
import { isTauri, getOSLabel } from './runtime';

export type ErrorKind = 'window' | 'unhandledrejection' | 'react' | 'toast';

export interface ErrorLogEntry {
  id: string;
  ts: number;
  kind: ErrorKind;
  message: string;
  stack?: string;
  /** Script origin for kind='window' (ev.filename). */
  source?: string;
  lineno?: number;
  colno?: number;
  /** Consecutive identical errors inside the dedupe window collapse into one entry. */
  count: number;
}

export interface ErrorReportContext {
  version: string;
  shell: string;
  os: string;
  userAgent: string;
  viewport: string;
}

const CAPACITY = 200;
// Repeated identical errors (e.g. a rAF loop throwing) would evict everything
// else from the ring in seconds — collapse consecutive repeats into a count
// while they stay within this window.
const DEDUPE_WINDOW_MS = 60_000;

export const GITHUB_REPO_URL = 'https://github.com/YFsama/AnchorWorks';
const ISSUE_MAX_ENTRIES = 10;
const ISSUE_STACK_LIMIT = 1500;
const ISSUE_TITLE_LIMIT = 60;

let entries: ErrorLogEntry[] = [];
let seq = 0;
const listeners = new Set<(snapshot: ErrorLogEntry[]) => void>();

function emit(): void {
  const snapshot = entries.slice();
  for (const l of listeners) l(snapshot);
}

/** Current log, oldest first. The array is a copy — mutate freely. */
export function getErrors(): ErrorLogEntry[] {
  return entries.slice();
}

export function clearErrors(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

/** Snapshot broadcast mirroring subscribeToasts: primes new subscribers. */
export function subscribeErrors(fn: (snapshot: ErrorLogEntry[]) => void): () => void {
  listeners.add(fn);
  fn(entries.slice());
  return () => { listeners.delete(fn); };
}

function record(input: Omit<ErrorLogEntry, 'id' | 'ts' | 'count'>): void {
  const ts = Date.now();
  const last = entries[entries.length - 1];
  if (last && last.kind === input.kind && last.message === input.message && ts - last.ts < DEDUPE_WINDOW_MS) {
    entries = [...entries.slice(0, -1), { ...last, ts, count: last.count + 1 }];
    emit();
    return;
  }
  seq += 1;
  const entry: ErrorLogEntry = { ...input, id: `e${ts.toString(36)}-${seq}`, ts, count: 1 };
  entries = [...entries, entry];
  if (entries.length > CAPACITY) entries = entries.slice(entries.length - CAPACITY);
  emit();
}

/** Called from ErrorBoundary.componentDidCatch — kind='react' entries. */
export function recordReactError(error: unknown, componentStack?: string): void {
  const stack = error instanceof Error && error.stack ? error.stack : undefined;
  // Component stacks are the part React adds beyond Error.stack — append so
  // the report shows both the throw site and the owning component tree.
  const merged = stack && componentStack ? `${stack}\n${componentStack}` : (stack ?? componentStack);
  record({
    kind: 'react',
    message: error instanceof Error ? error.message : String(error),
    stack: merged || undefined,
  });
}

function describeReason(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) return { message: reason.message || String(reason), stack: reason.stack };
  if (typeof reason === 'string') return { message: reason };
  if (reason === null) return { message: 'null' };
  if (reason === undefined) return { message: 'undefined' };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

let installed = false;

/**
 * Attach the global capture listeners. Idempotent — safe under StrictMode
 * double-invoked effects or repeated module loads (main.tsx calls it once
 * before createRoot so boot-time failures are recorded too).
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (ev: ErrorEvent) => {
    record({
      kind: 'window',
      message: ev.message || 'Unknown error',
      stack: ev.error instanceof Error && ev.error.stack ? ev.error.stack : undefined,
      source: ev.filename || undefined,
      lineno: ev.lineno || undefined,
      colno: ev.colno || undefined,
    });
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const { message, stack } = describeReason(ev.reason);
    record({ kind: 'unhandledrejection', message, stack });
  });

  // The toast pub/sub hands us the FULL current list on every change, so diff
  // against the previous snapshot to find newly-shown error toasts — otherwise
  // every unrelated toast update would re-record every standing error.
  let seen = new Set<string>();
  subscribeToasts((toasts) => {
    const next = new Set<string>();
    for (const item of toasts) {
      next.add(item.id);
      if (item.kind === 'error' && !seen.has(item.id)) {
        record({
          kind: 'toast',
          message: item.title ? `${item.title}: ${item.message}` : item.message,
        });
      }
    }
    seen = next;
  });
}

/* ------------------------- report context (lazy) ------------------------- */

export function getErrorReportContext(): ErrorReportContext {
  return {
    // `typeof` guard first: the define is absent under vitest / plain node.
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    shell: isTauri() ? 'Tauri' : 'PWA/browser',
    os: getOSLabel(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    viewport: typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`
      : 'unknown',
  };
}

/* ------------------------------ formatting ------------------------------- */

function formatEntryHeading(entry: ErrorLogEntry): string {
  const time = new Date(entry.ts).toISOString();
  const count = entry.count > 1 ? ` ×${entry.count}` : '';
  return `[${time}] ${entry.kind}${count} — ${entry.message}`;
}

function sourceLine(entry: ErrorLogEntry): string | null {
  if (!entry.source) return null;
  const pos = entry.lineno ? `:${entry.lineno}${entry.colno ? `:${entry.colno}` : ''}` : '';
  return `Source: ${entry.source}${pos}`;
}

function truncateStack(stack: string): string {
  if (stack.length <= ISSUE_STACK_LIMIT) return stack;
  return `${stack.slice(0, ISSUE_STACK_LIMIT)}\n… (truncated)`;
}

/** Human-readable report for clipboard / .txt download. Newest entry last. */
export function formatErrorsMarkdown(entriesIn: ErrorLogEntry[], ctx: ErrorReportContext): string {
  const lines: string[] = [
    '# Anchorworks error report',
    '',
    '## Environment',
    `- Version: ${ctx.version}`,
    `- Shell: ${ctx.shell}`,
    `- OS: ${ctx.os}`,
    `- User agent: ${ctx.userAgent}`,
    `- Viewport: ${ctx.viewport}`,
    '',
    `## Errors (${entriesIn.length} total, oldest first)`,
    '',
  ];
  if (entriesIn.length === 0) {
    lines.push('No errors recorded.', '');
  }
  for (const e of entriesIn) {
    lines.push(`### ${formatEntryHeading(e)}`);
    const src = sourceLine(e);
    if (src) lines.push(src);
    if (e.stack) {
      lines.push('', 'Stack:', '```', truncateStack(e.stack), '```');
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Prefilled issue URL on the project repo. Only the newest
 * ISSUE_MAX_ENTRIES errors ride along (stacks truncated) so the URL stays
 * within browser length limits; the full log goes via clipboard / .txt.
 */
export function buildGitHubIssueUrl(entriesIn: ErrorLogEntry[], ctx: ErrorReportContext): string {
  const newest = entriesIn[entriesIn.length - 1];
  const headline = newest ? newest.message : 'No errors recorded';
  const title = `[Report] ${headline.slice(0, ISSUE_TITLE_LIMIT)}`;

  const recent = entriesIn.slice(-ISSUE_MAX_ENTRIES).reverse();
  const bodyLines: string[] = [
    '<!-- Auto-generated by the Anchorworks error log. Please review and remove any private content (file names, paths, URLs, account info) before submitting. -->',
    '',
    '## Environment',
    `- Version: ${ctx.version}`,
    `- Shell: ${ctx.shell}`,
    `- OS: ${ctx.os}`,
    `- User agent: ${ctx.userAgent}`,
    `- Viewport: ${ctx.viewport}`,
    '',
    `## Recent errors (${recent.length} of ${entriesIn.length}, newest first)`,
    '',
  ];
  if (recent.length === 0) bodyLines.push('No errors recorded.', '');
  for (const e of recent) {
    bodyLines.push(`### ${formatEntryHeading(e)}`);
    const src = sourceLine(e);
    if (src) bodyLines.push(src);
    if (e.stack) {
      bodyLines.push('', '```', truncateStack(e.stack), '```');
    }
    bodyLines.push('');
  }
  bodyLines.push('## Steps to reproduce', '', '<!-- What were you doing when the error happened? -->', '');

  return `${GITHUB_REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}

/**
 * Open a URL in the system browser. Under Tauri, window.open targets the
 * webview's own window — plugin-shell's `open` hands it to the OS so GitHub
 * auth flows land in the user's real browser. Falls back to window.open when
 * the plugin is unavailable or fails.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const mod = await import('@tauri-apps/plugin-shell');
      await mod.open(url);
      return;
    } catch {
      /* fall through to window.open */
    }
  }
  window.open(url, '_blank', 'noopener');
}

/* --------------------------- dialog open state --------------------------- */

let dialogOpen = false;
const dialogListeners = new Set<() => void>();

function emitDialog(): void {
  for (const l of dialogListeners) l();
}

export function openErrorLogDialog(): void {
  if (dialogOpen) return;
  dialogOpen = true;
  emitDialog();
}

export function closeErrorLogDialog(): void {
  if (!dialogOpen) return;
  dialogOpen = false;
  emitDialog();
}

export function isErrorLogDialogOpen(): boolean {
  return dialogOpen;
}

export function subscribeErrorLogDialog(fn: () => void): () => void {
  dialogListeners.add(fn);
  return () => { dialogListeners.delete(fn); };
}
