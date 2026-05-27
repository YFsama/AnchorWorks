import { useCallback } from 'react';
import { useEditor } from '../store/editor';
import { TEMPLATES, type Template } from '../lib/templates';
import { getCanvas } from '../lib/canvasEngine';
import { X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { logger } from '../lib/debug';

export function TemplatesDialog() {
  const t = useT();
  const open = useEditor((s) => s.showTemplates);
  const setModal = useEditor((s) => s.setModal);
  const close = useCallback(() => setModal('showTemplates', false), [setModal]);

  // Escape close — capture phase, consistent with the rest of the dialog system.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  const pick = async (tpl: Template) => {
    const c = getCanvas();
    if (!c) { close(); return; }
    try {
      await tpl.build(c);
    } catch (err) {
      logger.error('templates', `build failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="templates-dialog-title"
    >
      <div
        className="bg-panel border border-border rounded-lg shadow-2xl w-[760px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="templates-dialog-title" className="dialog-title">{t('New from Template')}</h2>
          <button className="btn-dialog-close" onClick={close} aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-3 gap-4">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => pick(tpl)}
                className="text-left bg-panel2 border border-border rounded-lg overflow-hidden hover:border-accent2 hover:shadow-md transition-all group"
              >
                <div className="aspect-[4/3] bg-white flex items-center justify-center overflow-hidden">
                  <img
                    src={tpl.thumbnail}
                    alt={t(tpl.name)}
                    draggable={false}
                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                  />
                </div>
                <div className="p-3">
                  {/* Each tile is effectively a subsection under the dialog's
                   * <h2 className="dialog-title"> "Templates" heading.
                   * Promoting to <h4> gives the heading-outline tree a real
                   * branch ("Templates → A4 Poster") rather than a flat list
                   * of pseudo-headings. Inheriting the same visual styles
                   * via class so the design is unchanged. */}
                  <h4 className="text-ink text-xs font-semibold mb-0.5">{t(tpl.name)}</h4>
                  <div className="text-muted text-[10px] leading-snug">{t(tpl.description)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
