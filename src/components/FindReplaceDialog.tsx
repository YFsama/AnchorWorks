import { useCallback, useState } from 'react';
import { X, Search } from 'lucide-react';
import { useEditor } from '../store/editor';
import { replaceAllText, countTextMatches } from '../lib/findReplace';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Find & Replace (Illustrator Edit→Find and Replace) — replace every occurrence
 * of a string across all text objects on the canvas, with a case-sensitive
 * toggle and a live match count.
 */
export function FindReplaceDialog() {
  const t = useT();
  const open = useEditor(s => s.showFindReplace);
  const close = useCallback(() => useEditor.getState().setModal('showFindReplace', false), []);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const matches = find ? countTextMatches(find, matchCase) : 0;

  const apply = () => {
    const n = replaceAllText(find, replace, matchCase);
    if (n > 0) toast.success(`${n} ${t('replacements made')}`, { title: t('Find & Replace') });
    else toast.warn(t('No matches found.'), { title: t('Find & Replace') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="findreplace-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[340px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="findreplace-title" className="dialog-title flex items-center gap-2">
            <Search size={14} aria-hidden="true" /> {t('Find & Replace')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label">{t('Find')}</div>
          <input type="text" autoFocus value={find} onChange={(e) => setFind(e.target.value)} className="input-num w-full" aria-label={t('Find')} />
        </label>
        <label className="block mb-2">
          <div className="field-label">{t('Replace with')}</div>
          <input type="text" value={replace} onChange={(e) => setReplace(e.target.value)} className="input-num w-full" aria-label={t('Replace with')} />
        </label>

        <div className="flex items-center justify-between mt-1">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            <span>{t('Match case')}</span>
          </label>
          <span className="text-xs text-muted tabular-nums" aria-live="polite">{find ? `${matches} ${t('matches')}` : ''}</span>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" disabled={!find} onClick={apply}>{t('Replace All')}</button>
        </div>
      </div>
    </div>
  );
}
