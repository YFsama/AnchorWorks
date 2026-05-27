import { useEffect, useRef, useState } from 'react';
import { answerConfirm, getCurrentConfirm, subscribeConfirm } from '../lib/confirm';
import { useT } from '../lib/i18n';

/**
 * Renders the currently-pending confirm dialog. Reuses the global modal
 * pattern (`z-50 bg-black/60` → child `bg-panel`) so it inherits the dialog
 * enter animation defined in index.css.
 */
export function ConfirmHost() {
  const [, tick] = useState(0);
  const t = useT();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeConfirm(() => tick((n) => n + 1)), []);
  const opts = getCurrentConfirm();

  useEffect(() => {
    if (!opts) return;
    // Capture whichever element triggered the dialog so we can restore focus
    // when it closes — keeping the user's tab position in the underlying UI.
    const restoreTo = document.activeElement as HTMLElement | null;
    // Destructive (danger) confirms default focus to Cancel — macOS / iOS
    // convention so the user can't impulsively press Enter and lose work.
    // Non-destructive confirms (Save changes? / Apply now?) default to the
    // primary action so Enter accepts.
    if (opts.danger) cancelBtnRef.current?.focus();
    else confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); answerConfirm(false); return; }
      // Enter only "submits" the dialog when no specific button has focus —
      // otherwise the focused <button> handles Enter natively (Enter on
      // Cancel = cancel, Enter on Confirm = confirm). The previous global
      // handler fired Confirm regardless of focus, so Tab-to-Cancel + Enter
      // would accidentally confirm — exactly wrong for destructive flows.
      // For destructive confirms we also skip the document.body fallback so
      // a "nothing focused" Enter doesn't accidentally trigger the danger
      // action.
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active === confirmBtnRef.current) {
          e.preventDefault();
          answerConfirm(true);
        } else if (!opts.danger && (!active || active === document.body)) {
          e.preventDefault();
          answerConfirm(true);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (restoreTo && document.contains(restoreTo) && typeof restoreTo.focus === 'function') {
        restoreTo.focus();
      }
    };
  }, [opts]);

  if (!opts) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) answerConfirm(false); }}
      role="alertdialog"
      aria-modal="true"
      // When a title is provided, the SR accessible name comes from the visible
      // <h2 id="confirm-host-title"> via labelledby. Without one (message-only
      // confirms), fall back to the generic "Confirm" label so SR still
      // announces something on dialog open.
      {...(opts.title ? { 'aria-labelledby': 'confirm-host-title' } : { 'aria-label': t('Confirm') })}
      aria-describedby="confirm-host-message"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] max-w-[90%] p-4 shadow-2xl">
        {opts.title && <h2 id="confirm-host-title" className="dialog-title mb-2">{opts.title}</h2>}
        <div
          id="confirm-host-message"
          className="text-xs text-ink/85 leading-relaxed mb-4 whitespace-pre-line"
        >
          {opts.message}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" ref={cancelBtnRef} className="btn" onClick={() => answerConfirm(false)}>
            {opts.cancelLabel ?? t('Cancel')}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            className={opts.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => answerConfirm(true)}
          >
            {opts.confirmLabel ?? t('OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
