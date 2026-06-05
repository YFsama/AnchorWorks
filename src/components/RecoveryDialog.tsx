import { useEffect, useState, type KeyboardEvent } from 'react';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import { clearAutoSave, getLastAutoSave } from '../lib/autosave';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { logger } from '../lib/debug';
import { useEditor } from '../store/editor';

export function RecoveryDialog() {
  const t = useT();
  const [entry, setEntry] = useState<ReturnType<typeof getLastAutoSave>>(null);
  const [focusedAction, setFocusedAction] = useState<'discard' | 'restore'>('discard');

  useEffect(() => {
    // Wait a tick so the canvas has a chance to initialize.
    const id = window.setTimeout(() => {
      const last = getLastAutoSave();
      const c = getCanvas();
      const canvasEmpty = !c || c.getObjects().length === 0;
      if (last && canvasEmpty) setEntry(last);
    }, 300);
    return () => window.clearTimeout(id);
  }, []);

  // Escape = Discard (the negative choice). Matches the alertdialog pattern
  // used by ConfirmHost, and the rest of the dialog system's escape behaviour.
  const onDiscard = () => {
    clearAutoSave();
    setEntry(null);
  };
  useEscapeClose(entry != null, onDiscard);
  useFocusRestore(entry != null);

  if (!entry) return null;

  const onRestore = async () => {
    const c = getCanvas();
    if (!c) return;
    try {
      await c.loadFromJSON(entry.json);
      c.renderAll();
      // Restore cut paths alongside the canvas — autosave snapshots
      // these too as of project schema v2 / autosave entry v2.
      if (Array.isArray(entry.cutPaths)) {
        useEditor.getState().setCutPaths(entry.cutPaths);
      }
      pushHistory();
    } catch (err) {
      logger.error('autosave', `restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearAutoSave();
    setEntry(null);
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
  const focusedActionLabel = focusedAction === 'restore' ? t('Restore') : t('Discard');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      aria-describedby="recovery-body"
    >
      <div className="bg-panel border border-border rounded-lg shadow-2xl w-[420px] p-5">
        <h2 id="recovery-title" className="dialog-title mb-2">{t('Recover unsaved work?')}</h2>
        <div id="recovery-body" className="text-muted text-xs mb-4">
          <div>{t('We found an auto-saved copy of your previous session from')} {when}</div>
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
          <button type="button" data-recovery-action="discard" className="btn" onFocus={() => setFocusedAction('discard')} onClick={onDiscard}>{t('Discard')}</button>
          <button type="button" data-recovery-action="restore" className="btn-primary" onFocus={() => setFocusedAction('restore')} onClick={onRestore}>{t('Restore')}</button>
        </div>
      </div>
    </div>
  );
}
