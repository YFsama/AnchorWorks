import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { clearAutoSave, countAutoSaveObjects, restoreAutoSaveEntry, type AutoSaveEntry } from '../lib/autosave';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';
import { useT } from '../lib/i18n';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Crash recovery — and ONLY crash recovery.
 *
 * App.tsx mounts this dialog when the boot decision (`decideSessionOffer` in
 * autosave.ts) returns `modal`: the previous session did not end cleanly AND
 * left work that is not in a project file. A normal close with unsaved work
 * gets a non-blocking toast instead, so this modal no longer greets every
 * launch.
 *
 * Hardening, because the entry it offers may be the only copy of that work:
 *
 *  - initial focus lands on Restore (the safe choice), never on Discard;
 *  - Escape does NOT discard. It only moves focus to Restore — the dialog
 *    stays until the user makes an explicit choice;
 *  - Discard goes through a danger confirm first;
 *  - a failed restore keeps the dialog and the entry.
 */
export function RecoveryDialog({ entry, onDone }: { entry: AutoSaveEntry; onDone: () => void }) {
  const t = useT();
  const [focusedAction, setFocusedAction] = useState<'discard' | 'restore'>('restore');
  // True while the "Discard?" confirm is on screen.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // True while the canvas is being loaded from the entry.
  const [busy, setBusy] = useState(false);
  const restoreRef = useRef<HTMLButtonElement>(null);

  // Capture whichever element had focus BEFORE the initial focus lands on
  // Restore (effects run in declaration order) so it is handed back on close.
  useFocusRestore(true);
  useEffect(() => {
    restoreRef.current?.focus();
  }, []);

  // Escape never discards. It is swallowed at capture phase (so the global
  // Esc handlers underneath — deselect, etc. — don't react to a modal either)
  // and merely parks focus on the safe action. Suspended while the Discard
  // confirm is open: that dialog owns Escape (answers "cancel") and its focus.
  useEffect(() => {
    if (confirmingDiscard) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      restoreRef.current?.focus();
      setFocusedAction('restore');
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [confirmingDiscard]);

  const onRestore = async () => {
    setBusy(true);
    try {
      if (!(await restoreAutoSaveEntry(entry))) {
        // The entry is untouched — the user can retry or explicitly discard.
        toast.error(t('The previous session could not be restored.'), { title: t('Recover unsaved work?') });
        return;
      }
      toast.success(t('Previous session restored'));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = async () => {
    setConfirmingDiscard(true);
    try {
      const ok = await showConfirm({
        title: t('Discard recovered work?'),
        message: t('This permanently deletes the only copy of the unsaved changes from your last session. This cannot be undone.'),
        confirmLabel: t('Discard'),
        danger: true,
      });
      if (!ok) return;
    } finally {
      setConfirmingDiscard(false);
    }
    clearAutoSave();
    onDone();
  };

  const handleRecoveryActionKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-recovery-action]'));
    if (buttons.length === 0) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    setFocusedAction(buttons[nextIndex]?.dataset.recoveryAction === 'restore' ? 'restore' : 'discard');
    buttons[nextIndex]?.focus();
  };

  const when = new Date(entry.ts).toLocaleString();
  const objectCount = countAutoSaveObjects(entry);
  const cutPathCount = entry.cutPaths?.length ?? 0;
  const locked = busy || confirmingDiscard;
  const focusedActionLabel = focusedAction === 'restore' ? t('Restore') : t('Discard');

  return (
    // z-[100] above every app layer, but BELOW ConfirmHost (z-50 + later in
    // the DOM) while the Discard confirm is pending — otherwise the confirm
    // would open behind this overlay.
    <div
      className={`fixed inset-0 ${confirmingDiscard ? 'z-40' : 'z-[100]'} flex items-center justify-center bg-black/60 backdrop-blur-xs`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      aria-describedby="recovery-body"
    >
      <div className="bg-panel border border-border rounded-lg shadow-2xl w-[420px] max-w-[92vw] max-h-[calc(100vh-4rem)] overflow-y-auto p-5">
        <h2 id="recovery-title" className="dialog-title mb-2">{t('Recover unsaved work?')}</h2>
        <div id="recovery-body" className="text-muted text-xs mb-4">
          <div>{t('Anchorworks did not shut down correctly last time.')}</div>
          <div className="mt-1">{t('We found an auto-saved copy of your previous session from')} {when}</div>
          {objectCount != null && (
            <div className="mt-1 tabular-nums">
              {objectCount} {t(objectCount === 1 ? 'object' : 'objects')}
              {cutPathCount > 0 ? ` · ${cutPathCount} ${t('cut paths')}` : ''}
            </div>
          )}
          <div className="mt-1">{t('Would you like to restore it?')}</div>
        </div>
        <div
          className="flex justify-end gap-2"
          role="toolbar"
          aria-label={t('Recovery actions')}
          aria-describedby="recovery-action-review-status"
          title={t('Use arrow keys to review recovery actions')}
          onKeyDown={handleRecoveryActionKeys}
        >
          <div id="recovery-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${focusedActionLabel}. ${focusedAction === 'restore' ? t('Would you like to restore it?') : t('Discard')}`}
          </div>
          <button
            type="button"
            data-recovery-action="discard"
            className="btn"
            disabled={locked}
            onFocus={() => setFocusedAction('discard')}
            onClick={() => { void onDiscard(); }}
          >
            {t('Discard')}
          </button>
          <button
            ref={restoreRef}
            type="button"
            data-recovery-action="restore"
            className="btn-primary"
            disabled={locked}
            onFocus={() => setFocusedAction('restore')}
            onClick={() => { void onRestore(); }}
          >
            {t('Restore')}
          </button>
        </div>
      </div>
    </div>
  );
}
