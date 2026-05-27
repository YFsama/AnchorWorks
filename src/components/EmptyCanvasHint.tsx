import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { isMac } from '../lib/runtime';
import { Logo } from './Logo';

/**
 * Subtle centered hint shown while the canvas has zero objects. Fades to
 * 0 opacity the moment the user adds anything. Pointer-events disabled so it
 * never steals clicks from the underlying Fabric canvas.
 */
export function EmptyCanvasHint() {
  const t = useT();
  const count = useEditor((s) => s.objectCount);
  const visible = count === 0;
  // The command palette is bound to Cmd+K on macOS / Ctrl+K elsewhere; pick
  // the shortcut hint that matches the user's actual binding. Platform check
  // lives in runtime.ts so EmptyCanvasHint, CanvasContextMenu's Kbd helper,
  // and any future menu-shortcut glyph share one source of truth.
  const onMac = isMac();

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex flex-col items-center text-center max-w-[300px] px-6">
        <div className="opacity-50 mb-4">
          <Logo size={56} variant="mark" />
        </div>
        <div className="text-sm font-medium text-ink/80 mb-2">
          {t('Blank canvas')}
        </div>
        <div className="type-caption leading-relaxed">
          {t('Pick a tool from the left, drop an SVG, or pick a template from File menu.')}
        </div>
        {/* Small caps style only suits Latin scripts — letter-spacing splits
         * CJK into "按 ⌘ K 打 开" gaps. Keep plain typography here; the
         * shortcut chip-like reading still comes through from `⌘K` / `Ctrl+K`. */}
        <div className="text-[10px] text-muted/70 mt-3">
          {onMac ? t('Press ⌘K for command palette') : t('Press Ctrl+K for command palette')}
        </div>
      </div>
    </div>
  );
}
