import { useEffect, useRef, useState } from 'react';
import { X, Copy, Download, Trash2, ArrowUpRight } from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { formatHMS } from '../lib/time';
import { download } from '../lib/io';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import {
  buildGitHubIssueUrl,
  clearErrors,
  closeErrorLogDialog,
  formatErrorsMarkdown,
  getErrorReportContext,
  getErrors,
  isErrorLogDialogOpen,
  openExternal,
  subscribeErrorLogDialog,
  subscribeErrors,
  type ErrorKind,
  type ErrorLogEntry,
} from '../lib/errorLog';

// Kind badge tinting — identifiers stay verbatim (like DebugPanel's [tag]);
// only the tint is themed. warn/danger read as "async / render" severity.
const KIND_BADGE_CLASS: Record<ErrorKind, string> = {
  window: 'text-muted',
  unhandledrejection: 'text-warn',
  react: 'text-danger',
  toast: 'text-ink',
};

function ErrorLogRow({ entry, t }: { entry: ErrorLogEntry; t: (k: string) => string }) {
  return (
    <div className="px-4 py-2 border-b border-border/40">
      <div className="flex items-start gap-2">
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded bg-panel3 border border-border text-[10px] leading-none ${KIND_BADGE_CLASS[entry.kind]}`}
        >
          {entry.kind}
        </span>
        <span className="shrink-0 text-muted text-[10px] font-mono leading-4">{formatHMS(entry.ts)}</span>
        {entry.count > 1 && <span className="shrink-0 text-warn text-[10px] leading-4">×{entry.count}</span>}
        <span className="text-[11px] leading-4 break-all">{entry.message}</span>
      </div>
      {entry.source && (
        <div className="mt-1 ml-[calc(1.5rem+1.5rem)] text-muted text-[10px] font-mono break-all">
          {entry.source}{entry.lineno ? `:${entry.lineno}` : ''}{entry.colno ? `:${entry.colno}` : ''}
        </div>
      )}
      {entry.stack && (
        <details className="mt-1 ml-14">
          <summary className="text-[10px] text-muted cursor-pointer select-none">{t('Stack')}</summary>
          <pre className="mt-1 text-[10px] leading-tight font-mono whitespace-pre-wrap break-all text-ink/85 bg-panel2 border border-border rounded p-2 max-h-48 overflow-auto">
            {entry.stack}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Read-only viewer over the global error log (src/lib/errorLog.ts). Renders
 * nothing until openErrorLogDialog() flips the module flag — mounted both in
 * App's host area and inside ErrorBoundary's crash fallback.
 *
 * Follows the ConfirmHost dialog conventions: overlay + panel classes, Esc
 * close (capture phase), focus moved in on open and restored on close.
 */
export function ErrorLogDialog() {
  const t = useT();
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(isErrorLogDialogOpen());
  // Inline copy feedback (mirrors ErrorBoundary's crash-screen pattern):
  // this dialog also renders inside the crash fallback, where the app tree —
  // and with it ToastHost — is gone, so a toast alone would be invisible.
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const copyBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeErrors(() => setTick(n => n + 1)), []);
  // The dialog listener carries no payload (confirm.ts style) — read the new
  // flag from the module so this covers both open and close transitions.
  useEffect(() => subscribeErrorLogDialog(() => setOpen(isErrorLogDialogOpen())), []);
  useEscapeClose(open, closeErrorLogDialog);
  useFocusRestore(open);

  useEffect(() => {
    if (open) copyBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const errors = getErrors();
  const ctx = getErrorReportContext();
  const report = () => formatErrorsMarkdown(errors, ctx);
  const empty = errors.length === 0;

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopyState('ok');
      toast.success(t('Error log copied'));
    } catch {
      setCopyState('fail');
      toast.error(t('Clipboard unavailable'));
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    // z-[120]: above ToastHost (z-110) so the Copy-all confirmation toast
    // can't cover the dialog's own action row.
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-log-title"
      onClick={(e) => { if (e.target === e.currentTarget) closeErrorLogDialog(); }}
    >
      <div className="bg-panel border border-border rounded-lg w-[600px] max-w-[92%] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="error-log-title" className="dialog-title">{t('Error Log')}</h2>
          <button
            type="button"
            className="text-muted hover:text-ink p-1 transition-colors"
            aria-label={t('Close')}
            onClick={closeErrorLogDialog}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-border text-[10px] font-mono text-muted break-all">
          {ctx.version} · {ctx.shell} · {ctx.os} · {ctx.viewport}
        </div>
        <div className="flex-1 overflow-auto">
          {empty ? (
            <div className="p-4 text-xs text-muted">{t('No errors recorded yet.')}</div>
          ) : (
            [...errors].reverse().map(e => <ErrorLogRow key={e.id} entry={e} t={t} />)
          )}
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          {/* aria-live so the inline feedback is announced without stealing focus */}
          <span
            className={`text-[10px] mr-auto ${copyState === 'fail' ? 'text-danger' : 'text-muted'}`}
            aria-live="polite"
          >
            {copyState === 'ok' ? t('Copied') : copyState === 'fail' ? t('Copy failed') : ''}
          </span>
          <button
            type="button"
            className="btn"
            onClick={clearErrors}
            disabled={empty}
          >
            <Trash2 size={12} aria-hidden="true" className="mr-1" />{t('Clear')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => download('anchorworks-error-log.txt', report(), 'text/plain')}
            disabled={empty}
          >
            <Download size={12} aria-hidden="true" className="mr-1" />{t('Download .txt')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => { void openExternal(buildGitHubIssueUrl(errors, ctx)); }}
          >
            <ArrowUpRight size={12} aria-hidden="true" className="mr-1" />{t('Report on GitHub')}
          </button>
          <button
            type="button"
            ref={copyBtnRef}
            className="btn-primary"
            onClick={() => { void copyAll(); }}
            disabled={empty}
          >
            <Copy size={12} aria-hidden="true" className="mr-1" />{t('Copy all')}
          </button>
        </div>
      </div>
    </div>
  );
}
