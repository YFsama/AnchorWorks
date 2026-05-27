import clsx from 'clsx';
import { useEditor } from '../store/editor';
import type { ToolId } from '../types';
import { useT } from '../lib/i18n';
import { getTool } from '../lib/tools/types';
import { ariaKeyshortcuts } from '../lib/runtime';

// Groups define the visible toolbar layout (hairline `<hr>` between groups
// so 11 buttons scan as 5 clusters). Each entry is just a ToolId — icon,
// label, and shortcut all flow from the registry descriptor in
// registerTools.ts, which is the single source of truth.
const toolGroups: ToolId[][] = [
  // Pointer / selection
  ['select'],
  // Primitive shapes
  ['rect', 'ellipse', 'line', 'polygon'],
  // Path / drawing
  ['pen', 'pencil', 'eraser'],
  // Text
  ['text'],
  // Viewport navigation
  ['hand', 'zoom'],
];

export function Toolbar() {
  const t = useT();
  const tool = useEditor(s => s.tool);
  const setTool = useEditor(s => s.setTool);

  // WAI-ARIA toolbar pattern: Tab gets you IN, then arrow keys move focus
  // between buttons (roving tabindex). The button currently focused is the
  // only one in tab order; siblings get tabIndex={-1}.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'ArrowLeft' && k !== 'ArrowRight' &&
        k !== 'Home' && k !== 'End') return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-tool]'));
    if (!buttons.length) return;
    const idx = buttons.findIndex((b) => b === document.activeElement);
    let next = idx;
    if (k === 'ArrowDown' || k === 'ArrowRight') next = idx < 0 ? 0 : (idx + 1) % buttons.length;
    else if (k === 'ArrowUp' || k === 'ArrowLeft') next = idx < 0 ? buttons.length - 1 : (idx - 1 + buttons.length) % buttons.length;
    else if (k === 'Home') next = 0;
    else if (k === 'End') next = buttons.length - 1;
    e.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div
      className="flex flex-col items-center bg-panel border-r border-border w-14 py-2 gap-1 toolbar-vertical"
      role="toolbar"
      aria-label={t('Tools')}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      {toolGroups.map((group, gIdx) => (
        <div key={gIdx} className="contents">
          {gIdx > 0 && <div className="toolbar-sep" aria-hidden="true" />}
          {group.map(id => {
            const handler = getTool(id);
            if (!handler?.icon) return null;
            const Icon = handler.icon;
            const shortcut = handler.shortcut ?? '';
            // aria-label carries the localized tool name only; the shortcut
            // metadata lives in aria-keyshortcuts so screen readers can
            // announce it separately ("Rectangle, keyboard shortcut R").
            // Visible title keeps the inline "(R)" for sighted hover.
            const localized = t(handler.label);
            const title = shortcut ? `${localized} (${shortcut})` : localized;
            const active = tool === id;
            return (
              <button
                key={id}
                data-tool={id}
                title={title}
                aria-label={localized}
                aria-keyshortcuts={ariaKeyshortcuts(shortcut) || undefined}
                aria-pressed={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTool(id)}
                className={clsx('tool-btn relative', active && 'active')}
              >
                <Icon size={18} aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className={clsx(
                    // `transition-colors` (was `transition-opacity`) — the
                    // active/inactive diff is a colour switch (white/70 ↔
                    // muted/60), not an alpha change, so opacity transitions
                    // were a no-op and the badge colour flipped instantly.
                    'absolute bottom-0.5 right-1 text-[8px] font-medium font-mono leading-none tabular-nums select-none transition-colors',
                    active ? 'text-white/70' : 'text-muted/60',
                  )}
                >
                  {shortcut}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
