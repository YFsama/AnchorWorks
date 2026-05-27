import { useEffect, useState } from 'react';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import { clearAutoSave, getLastAutoSave } from '../lib/autosave';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { logger } from '../lib/debug';

export function RecoveryDialog() {
  const t = useT();
  const [entry, setEntry] = useState<ReturnType<typeof getLastAutoSave>>(null);

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
      pushHistory();
    } catch (err) {
      logger.error('autosave', `restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearAutoSave();
    setEntry(null);
  };

  const when = new Date(entry.ts).toLocaleString();

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
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onDiscard}>{t('Discard')}</button>
          <button type="button" className="btn-primary" onClick={onRestore}>{t('Restore')}</button>
        </div>
      </div>
    </div>
  );
}
