import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  buildGitHubIssueUrl,
  clearErrors,
  formatErrorsMarkdown,
  getErrorReportContext,
  getErrors,
  installGlobalErrorHandlers,
  openExternal,
  subscribeErrors,
  type ErrorLogEntry,
} from '../errorLog';
import { toast } from '../toast';
import { ErrorBoundary } from '../../components/ErrorBoundary';

/**
 * Covers the error-log slice end to end: ring-buffer capacity, consecutive
 * dedupe counting, snapshot broadcast semantics, the pure formatter / GitHub
 * URL helpers (encoding, 10-entry cap, stack + title truncation), handler
 * install idempotency under synthetic jsdom events, and the ErrorBoundary
 * fallback render.
 *
 * Module state is shared across tests in this file (no resetModules): each
 * test starts from clearErrors(), and installGlobalErrorHandlers' own
 * idempotency guard keeps the listeners single-attached for the whole run —
 * which is itself what the idempotency test exercises.
 */

// React-mounted tests need the act environment flag (repo convention — see
// components/ui/__tests__/*.test.tsx).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CTX = {
  version: '1.4.2-test',
  shell: 'PWA/browser',
  os: 'Windows',
  userAgent: 'UA-test',
  viewport: '800x600@2',
};

function makeEntry(overrides: Partial<ErrorLogEntry> = {}): ErrorLogEntry {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    ts: Date.parse('2026-10-08T12:00:00Z'),
    kind: 'window',
    message: 'boom',
    count: 1,
    ...overrides,
  };
}

function fireError(
  message: string,
  opts: { filename?: string; lineno?: number; colno?: number; error?: Error } = {},
): void {
  window.dispatchEvent(new ErrorEvent('error', {
    message,
    filename: opts.filename,
    lineno: opts.lineno,
    colno: opts.colno,
    error: opts.error,
  }));
}

beforeEach(() => {
  clearErrors();
  // Idempotent: attaches on the first call only.
  installGlobalErrorHandlers();
});

describe('errorLog ring buffer + capture', () => {
  it('caps at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) fireError(`boom-${i}`);
    const log = getErrors();
    expect(log).toHaveLength(200);
    expect(log[0].message).toBe('boom-5');
    expect(log[199].message).toBe('boom-204');
  });

  it('collapses consecutive identical errors into a counted entry', () => {
    fireError('same');
    fireError('same');
    fireError('same');
    let log = getErrors();
    expect(log).toHaveLength(1);
    expect(log[0].count).toBe(3);
    fireError('different');
    log = getErrors();
    expect(log).toHaveLength(2);
    expect(log[1].message).toBe('different');
    expect(log[1].count).toBe(1);
  });

  it('captures source position and stack from synthetic ErrorEvents', () => {
    fireError('with origin', {
      filename: 'app.ts',
      lineno: 3,
      colno: 7,
      error: new Error('with origin'),
    });
    const [entry] = getErrors();
    expect(entry.kind).toBe('window');
    expect(entry.source).toBe('app.ts');
    expect(entry.lineno).toBe(3);
    expect(entry.colno).toBe(7);
    expect(entry.stack).toContain('with origin');
  });

  it('install is idempotent — a second install does not double-capture', () => {
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    fireError('only once');
    const log = getErrors();
    expect(log).toHaveLength(1);
    // A duplicated listener would have recorded the second copy as a
    // consecutive repeat (count 2), so count===1 proves single attachment.
    expect(log[0].count).toBe(1);
  });

  // jsdom implements PromiseRejectionEvent; guard anyway so the suite stays
  // green on environments that don't.
  const maybeIt = typeof PromiseRejectionEvent === 'function' ? it : it.skip;
  maybeIt('captures unhandledrejection reasons', () => {
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: new Error('rejected boom'),
    }));
    const [entry] = getErrors();
    expect(entry.kind).toBe('unhandledrejection');
    expect(entry.message).toBe('rejected boom');
    expect(entry.stack).toContain('rejected boom');
  });

  it('records error toasts (and only error toasts) as kind toast', () => {
    toast.success('fine');
    toast.error('toast boom');
    const log = getErrors();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'toast', message: 'toast boom' });
  });

  it('subscribeErrors primes new subscribers and broadcasts fresh snapshots', () => {
    const lengths: number[] = [];
    const unsub = subscribeErrors((snap) => lengths.push(snap.length));
    expect(lengths).toEqual([0]);
    fireError('broadcast me');
    expect(lengths).toEqual([0, 1]);
    // The snapshot handed out is a copy — callers can't corrupt the store.
    getErrors().length = 0;
    expect(getErrors()).toHaveLength(1);
    unsub();
    fireError('after unsub');
    expect(lengths).toEqual([0, 1]);
  });

  it('clearErrors empties the log and notifies subscribers', () => {
    fireError('gone soon');
    let latest = -1;
    const unsub = subscribeErrors((snap) => { latest = snap.length; });
    clearErrors();
    expect(getErrors()).toHaveLength(0);
    expect(latest).toBe(0);
    unsub();
  });
});

describe('errorLog report formatting', () => {
  it('formatErrorsMarkdown embeds environment and every entry', () => {
    const entries = [
      makeEntry({ kind: 'window', message: 'alpha', count: 2, source: 'app.ts', lineno: 3, colno: 7, stack: 'Error: alpha\n    at x' }),
      makeEntry({ kind: 'react', message: 'beta' }),
    ];
    const md = formatErrorsMarkdown(entries, CTX);
    expect(md).toContain('- Version: 1.4.2-test');
    expect(md).toContain('- Shell: PWA/browser');
    expect(md).toContain('- OS: Windows');
    expect(md).toContain('- User agent: UA-test');
    expect(md).toContain('- Viewport: 800x600@2');
    expect(md).toContain('window ×2 — alpha');
    expect(md).toContain('Source: app.ts:3:7');
    expect(md).toContain('Error: alpha');
    expect(md).toContain('react — beta');
    expect(md).toContain('(2 total');
  });

  it('getErrorReportContext reads the live environment lazily', () => {
    const ctx = getErrorReportContext();
    // __APP_VERSION__ is not defined under vitest → documented 'dev' fallback.
    expect(ctx.version).toBe('dev');
    expect(ctx.shell).toBe('PWA/browser');
    expect(ctx.viewport).toMatch(/^\d+x\d+@[\d.]+$/);
    expect(ctx.userAgent).toBe(navigator.userAgent);
  });
});

describe('buildGitHubIssueUrl', () => {
  it('targets the repo issue form with a truncated [Report] title', () => {
    const entries = [makeEntry({ message: 'x'.repeat(80) })];
    const url = buildGitHubIssueUrl(entries, CTX);
    expect(url.startsWith('https://github.com/YFsama/AnchorWorks/issues/new?')).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('title')).toBe(`[Report] ${'x'.repeat(60)}`);
  });

  it('includes env, the 10 newest entries only, newest first', () => {
    // Zero-padded messages so substring matches can't cross-contaminate.
    const entries = Array.from({ length: 12 }, (_, i) =>
      makeEntry({ kind: 'window', message: `failure #${String(i).padStart(2, '0')}` }));
    const params = new URLSearchParams(buildGitHubIssueUrl(entries, CTX).split('?')[1]);
    const body = params.get('body')!;
    expect(body).toContain('- Version: 1.4.2-test');
    expect(body).toContain('(10 of 12, newest first)');
    expect(body).toContain('failure #11');
    expect(body).toContain('failure #02');
    expect(body).not.toContain('failure #01');
    expect(body).not.toContain('failure #00');
    expect(body.indexOf('failure #11')).toBeLessThan(body.indexOf('failure #02'));
  });

  it('truncates long stacks and appends a privacy reminder', () => {
    const entries = [makeEntry({ stack: 'S'.repeat(2000) })];
    const body = new URLSearchParams(buildGitHubIssueUrl(entries, CTX).split('?')[1]).get('body')!;
    expect(body).toContain('S'.repeat(1500));
    expect(body).not.toContain('S'.repeat(1501));
    expect(body).toContain('truncated');
    expect(body).toContain('remove any private content');
  });
});

describe('openExternal (web path)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to window.open with noopener when not under Tauri', async () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await openExternal('https://example.com/report');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('https://example.com/report', '_blank', 'noopener');
  });
});

describe('ErrorBoundary fallback', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders the crash dialog and records a react-kind entry', async () => {
    function Bomb(): never {
      throw new Error('boundary kaboom');
    }
    // React logs the caught error via console.error in dev — expected here.
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(container.textContent).toContain('Unexpected error');
    expect(container.textContent).toContain('boundary kaboom');
    expect(container.textContent).toContain('Reload');
    expect(getErrors().some(e => e.kind === 'react' && e.message === 'boundary kaboom')).toBe(true);
  });
});
