import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import {
  buildGitHubIssueUrl,
  formatErrorsMarkdown,
  getErrorReportContext,
  getErrors,
  openErrorLogDialog,
  openExternal,
  recordReactError,
} from '../lib/errorLog';
import { ErrorLogDialog } from './ErrorLogDialog';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort boundary around the whole <App /> tree (mounted in main.tsx).
 * Without it a render-time throw leaves a blank canvas with no recovery path;
 * the fallback keeps the dark theme classes so it renders correctly even when
 * index.css variables are the only thing that loaded.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    recordReactError(error, info.componentStack ?? undefined);
  }

  render(): ReactNode {
    return this.state.error
      ? <CrashScreen error={this.state.error} />
      : this.props.children;
  }
}

function CrashScreen({ error }: { error: Error }) {
  const t = useT();
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');

  // ToastHost lives inside <App />, which just crashed — copy feedback has to
  // be inline state instead of toast.success / toast.error here.
  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorsMarkdown(getErrors(), getErrorReportContext()));
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
  };

  return (
    // z-[200]: above every dialog layer (ToastHost is z-110) — the crash
    // screen must own the viewport or the user can't recover.
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-boundary-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[640px] max-w-full max-h-[90vh] flex flex-col text-ink shadow-2xl">
        <div className="px-4 py-3 border-b border-border">
          <h2 id="error-boundary-title" className="dialog-title">{t('Unexpected error')}</h2>
          <p className="text-xs text-ink/80 mt-1">
            {t('The app hit an unrecoverable error. Reload to continue — recent errors are kept in the error log.')}
          </p>
        </div>
        <div className="px-4 py-3 overflow-auto">
          <div className="text-danger text-xs font-medium break-words">{error.message}</div>
          <details className="mt-2">
            <summary className="text-xs text-muted cursor-pointer select-none">{t('Stack')}</summary>
            <pre className="mt-2 text-[10px] leading-tight font-mono whitespace-pre-wrap break-all text-ink/85 bg-panel2 border border-border rounded p-2">
              {error.stack ?? ''}
            </pre>
          </details>
        </div>
        <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-end gap-2">
          {copyState !== 'idle' && (
            <span className={`text-xs mr-auto ${copyState === 'ok' ? 'text-ink/70' : 'text-danger'}`}>
              {copyState === 'ok' ? t('Copied') : t('Copy failed')}
            </span>
          )}
          <button type="button" className="btn" onClick={openErrorLogDialog}>{t('Open error log')}</button>
          <button
            type="button"
            className="btn"
            onClick={() => { void openExternal(buildGitHubIssueUrl(getErrors(), getErrorReportContext())); }}
          >
            {t('Report on GitHub')}
          </button>
          <button type="button" className="btn" onClick={() => { void copyDetails(); }}>{t('Copy details')}</button>
          <button type="button" className="btn-primary" onClick={() => location.reload()}>{t('Reload')}</button>
        </div>
      </div>
      {/* The boundary replaces the whole app (incl. App's dialog hosts), so
          the fallback carries its own log-dialog instance for "Open error
          log" — it reads the same module state, nothing is duplicated. */}
      <ErrorLogDialog />
    </div>
  );
}
