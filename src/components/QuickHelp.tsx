import { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useEditor } from '../store/editor';
import { isMac } from '../lib/runtime';
import { getBinding, subscribeKeymap } from '../lib/keymap';

/**
 * Floating quick-help affordance.
 *
 * Two parts:
 *   1. A circular FAB pinned to the bottom-right of the viewport. One
 *      click pops the panel; another click closes it. Survives panel
 *      resizing because it pins to the canvas-column right edge, not
 *      the right-rail.
 *   2. A compact card with ~10 most-asked-about gestures (zoom, pan,
 *      select, transform, group, AI). Faster to glance than opening
 *      the full Help Center modal, which lives on F1.
 *
 * Discoverability over the full HelpCenter — the FAB is always there;
 * the modal is only one keystroke away (F1) but new users don't know
 * what to press. The icon button gives them an obvious place to look.
 */
export function QuickHelp() {
  const t = useT();
  const setModal = useEditor(s => s.setModal);
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Click-outside / Esc to close.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (cardRef.current?.contains(tgt)) return;
      if (fabRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Re-render when the user rebinds a key so the tips never go stale
  // (same subscribeKeymap tick pattern as KeymapEditor / ShortcutsDialog).
  const [, setKeymapTick] = useState(0);
  useEffect(() => subscribeKeymap(() => setKeymapTick((n) => n + 1)), []);

  // Format a keymap combo ('Ctrl+Shift+S') for the compact chip: swap
  // Ctrl/Alt/Shift for their macOS glyphs (same substitution rules as the
  // Kbd helpers in MenuBar / CanvasContextMenu / KeymapEditor) and join the
  // parts with plain spaces inside the single kbd chip.
  const onMac = isMac();
  const fmtCombo = (combo: string) =>
    combo
      .split('+')
      .map((part) => {
        const k = part.trim();
        if (onMac && /^Ctrl$/i.test(k)) return '⌘';
        if (onMac && /^Alt$/i.test(k)) return '⌥';
        if (onMac && /^Shift$/i.test(k)) return '⇧';
        if (onMac && /^Meta$/i.test(k)) return '⌘';
        return k;
      })
      .join(' ');

  // Each tip pairs an English-source phrase (translated below) with a
  // visual `kbd` representation pulled from the keymap registry so custom
  // bindings show through. Order = frequency of use, not category. Arrow
  // nudging and the two pointer gestures have no registry binding (keymap.ts
  // excludes multi-key arrow groups and hold-pairs) so they stay verbatim.
  const tips: Array<{ key: string; kbd: string }> = [
    { key: 'Zoom: scroll wheel · pinch trackpad', kbd: '' },
    { key: 'Pan: middle-mouse drag · hold Space + drag', kbd: '' },
    { key: 'Fit page to view', kbd: fmtCombo(getBinding('view.zoomFit')) },
    { key: 'Open Command Palette', kbd: fmtCombo(getBinding('window.commandPalette')) },
    { key: 'Save project', kbd: fmtCombo(getBinding('file.saveProject')) },
    { key: 'Group / Ungroup', kbd: `${fmtCombo(getBinding('edit.group'))} / ${fmtCombo(getBinding('edit.ungroup'))}` },
    { key: 'Duplicate selection', kbd: fmtCombo(getBinding('edit.duplicate')) },
    { key: 'Nudge selection (Shift for 10px)', kbd: '← ↑ → ↓' },
    { key: 'Open AI assistant', kbd: '' },
    { key: 'Full keyboard shortcut list', kbd: fmtCombo(getBinding('help.shortcuts')) },
  ];

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={t('Quick help')}
        aria-expanded={open}
        title={`${t('Quick help')} — ${t('press F1 for the full Help Center')}`}
        className="quick-help-fab"
      >
        <HelpCircle size={18} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label={t('Quick help')}
          className="quick-help-card"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="field-label !mb-0">{t('Quick help')}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-dialog-close"
              aria-label={t('Close')}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink/90">{t(tip.key)}</span>
                {tip.kbd && <kbd className="kbd-menu shrink-0">{tip.kbd}</kbd>}
              </li>
            ))}
          </ul>
          <div className="border-t border-border mt-3 pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setModal('showHelpCenter', true); }}
              className="btn-ghost text-xs"
            >
              {t('Open Help Center')}  ↗
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setModal('showShortcuts', true); }}
              className="btn-ghost text-xs"
            >
              {t('All shortcuts')}  ↗
            </button>
          </div>
        </div>
      )}
    </>
  );
}
