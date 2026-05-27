import { useCallback } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

interface Shortcut {
  keys: string;
  labelKey: string;
}

const TOOLS: Shortcut[] = [
  { keys: 'V', labelKey: 'Select' },
  { keys: 'R', labelKey: 'Rectangle' },
  { keys: 'E', labelKey: 'Ellipse' },
  { keys: 'L', labelKey: 'Line' },
  { keys: 'G', labelKey: 'Polygon' },
  { keys: 'P', labelKey: 'Pen' },
  { keys: 'B', labelKey: 'Pencil' },
  { keys: 'X', labelKey: 'Eraser' },
  { keys: 'T', labelKey: 'Text' },
  { keys: 'H', labelKey: 'Hand' },
  { keys: 'Z', labelKey: 'Zoom' },
  { keys: 'Space (hold)', labelKey: 'Temporary Hand (pan)' },
];

const ACTIONS: Shortcut[] = [
  { keys: 'Ctrl+Z', labelKey: 'Undo' },
  { keys: 'Ctrl+Y / Ctrl+Shift+Z', labelKey: 'Redo' },
  { keys: 'Ctrl+A', labelKey: 'Select all' },
  { keys: 'Esc', labelKey: 'Deselect' },
  { keys: 'Ctrl+D', labelKey: 'Duplicate selection' },
  { keys: 'Ctrl+C / Ctrl+X / Ctrl+V', labelKey: 'Copy / Cut / Paste' },
  { keys: 'Ctrl+G / Ctrl+Shift+G', labelKey: 'Group / Ungroup' },
  { keys: 'Ctrl+] / Ctrl+[', labelKey: 'Bring Forward / Send Backward' },
  { keys: 'Ctrl+Shift+] / Ctrl+Shift+[', labelKey: 'Bring to Front / Send to Back' },
  { keys: 'Delete / Backspace', labelKey: 'Delete selection' },
  { keys: '← ↑ → ↓', labelKey: 'Nudge selection (1 px)' },
  { keys: 'Shift+Arrows', labelKey: 'Nudge selection (10 px)' },
];

const FILE_VIEW: Shortcut[] = [
  { keys: 'Ctrl+O', labelKey: 'Open SVG / JSON…' },
  { keys: 'Ctrl+Shift+S', labelKey: 'Save Project' },
  { keys: 'Ctrl+S', labelKey: 'Export SVG' },
  { keys: 'Ctrl+P', labelKey: 'Print…' },
  { keys: 'Ctrl+=', labelKey: 'Zoom in' },
  { keys: 'Ctrl+-', labelKey: 'Zoom out' },
  { keys: 'Ctrl+0', labelKey: 'Zoom fit' },
  { keys: 'Ctrl+1', labelKey: 'Actual Size' },
  { keys: 'Ctrl+Alt+Y', labelKey: 'Outline View' },
  { keys: 'Ctrl+Shift+L', labelKey: 'Toggle Theme' },
  { keys: 'Ctrl+K', labelKey: 'Command Palette' },
  { keys: 'Ctrl+,', labelKey: 'Preferences…' },
  { keys: 'F1', labelKey: 'Help Center' },
  { keys: '?', labelKey: 'Show this dialog' },
];

export function ShortcutsDialog() {
  const t = useT();
  const open = useEditor(s => s.showShortcuts);
  const setModal = useEditor(s => s.setModal);
  const close = useCallback(() => setModal('showShortcuts', false), [setModal]);

  // Escape close — capture phase mirrors HelpCenter/AIPanel pattern so it works
  // even if focus lands inside an interactive child.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
    >
      <div
        className="w-[640px] max-w-[95vw] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="shortcuts-dialog-title" className="dialog-title">{t('Keyboard Shortcuts')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-6 p-5 max-h-[70vh] overflow-y-auto">
          <Column title={t('Tools')} items={TOOLS} />
          <Column title={t('Actions')} items={ACTIONS} />
          <Column title={t('File / View')} items={FILE_VIEW} />
        </div>
        <div className="px-4 py-2 border-t border-border bg-panel2 text-[10px] text-muted text-center">
          {t('Press')} <kbd className="kbd-inline">?</kbd> {t('anytime to open this dialog.')}
        </div>
      </div>
    </div>
  );
}

function Column({ title, items }: { title: string; items: Shortcut[] }) {
  const t = useT();
  return (
    <div>
      <h3 className="field-label mb-2 font-semibold">{title}</h3>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.keys + it.labelKey} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-panel3/50 transition-colors">
            <span className="text-ink/90">{t(it.labelKey)}</span>
            <kbd className="px-2 py-0.5 rounded bg-panel3 border border-border text-[11px] font-mono text-ink">{it.keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
