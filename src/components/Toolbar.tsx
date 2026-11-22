import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useEditor } from '../store/editor';
import type { ToolId } from '../types';
import { useT } from '../lib/i18n';
import { getTool } from '../lib/tools/types';
import { getBinding, subscribeKeymap } from '../lib/keymap';
import { ariaKeyshortcuts } from '../lib/runtime';

// Groups define the visible toolbar layout (hairline `<hr>` between groups
// so 11 buttons scan as 5 clusters). Each entry is just a ToolId — icon,
// label and default shortcut flow from the tool registry; the displayed
// shortcut reads the user-customisable keymap so toolbar hints stay current.
const toolGroups: ToolId[][] = [
  // Pointer / selection
  ['select'],
  // Primitive shapes
  ['rect', 'ellipse', 'line', 'polygon', 'shapeBuilder'],
  // Path / drawing
  ['pen', 'pencil', 'eraser', 'knife', 'width'],
  // Text
  ['text'],
  // Viewport navigation
  ['hand', 'zoom'],
  // Inspection / sampling
  ['measure', 'eyedropper'],
];

export function Toolbar() {
  const t = useT();
  const tool = useEditor(s => s.tool);
  const setTool = useEditor(s => s.setTool);
  const [, setKeymapTick] = useState(0);

  useEffect(() => subscribeKeymap(() => setKeymapTick((n) => n + 1)), []);

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
            const shortcut = getBinding(`tool.${id}`);
            // aria-label embeds the visible shortcut chip text after an em
            // dash (WCAG 2.5.3 Label in Name — voice-control users say
            // "Shift M" / "R" and must hit this button; axe curates
            // parenthesised fragments OUT of the name, so parentheses
            // can't carry it). aria-keyshortcuts still announces the
            // binding as a separate property.
            const localized = t(handler.label);
            const title = shortcut ? `${localized} (${shortcut})` : localized;
            const name = shortcut ? `${localized} — ${shortcut}` : localized;
            const active = tool === id;
            return (
              <button
                key={id}
                data-tool={id}
                title={title}
                aria-label={name}
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
                    // muted), not an alpha change, so opacity transitions
                    // were a no-op and the badge colour flipped instantly.
                    // Inactive uses the full muted token (no /60 dimming):
                    // muted@0.6 fails AA at 8px in the light theme (2.6:1),
                    // same reasoning as badge-inactive in index.css.
                    'absolute bottom-0.5 right-1 text-[8px] font-medium font-mono leading-none tabular-nums select-none transition-colors',
                    active ? 'text-white/70' : 'text-muted',
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
