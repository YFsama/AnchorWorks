import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LazyCanvasContextMenu } from '../../components/LazyCanvasContextMenu';

/**
 * Covers the lazy context-menu shell: it must (a) stay invisible until the
 * first `vector:context-menu` event, (b) load the real menu on that event,
 * and (c) replay the stashed {x, y} position once the real menu has attached
 * its own listener — so the first right-click still opens the menu at the
 * exact cursor position, exactly like the eager version did.
 *
 * Real timers on purpose: the shell loads the real menu via a dynamic
 * import(), whose microtask chain must interleave with React commits.
 */

const noopProps = {
  onNewDocument: () => {},
  onOpenFile: () => {},
  onImportImage: () => {},
  onToggleDebug: () => {},
};

async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

describe('LazyCanvasContextMenu shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders nothing before any context-menu event', async () => {
    await act(async () => {
      root.render(<LazyCanvasContextMenu {...noopProps} />);
    });
    // Give the (absent) warm-up timer no reason to have fired yet.
    expect(container.innerHTML).toBe('');
  });

  it('loads the real menu on the first event and opens it at the requested position', async () => {
    await act(async () => {
      root.render(<LazyCanvasContextMenu {...noopProps} />);
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('vector:context-menu', { detail: { x: 120, y: 40 } }));
    });
    // The dynamic import + replay effect + child render complete async.
    await waitFor(() => container.querySelector('[role="menu"]') !== null);
    const menu = container.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('40px');
  });

  it('stays closed after the idle warm-up until an event arrives', async () => {    await act(async () => {
      root.render(<LazyCanvasContextMenu {...noopProps} />);
    });
    // Wait past the 5s warm-up — chunk loads, but no menu is shown.
    await act(async () => { await new Promise((r) => setTimeout(r, 5300)); });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    // Once warmed, an event opens the menu immediately (module already loaded).
    act(() => {
      window.dispatchEvent(new CustomEvent('vector:context-menu', { detail: { x: 10, y: 10 } }));
    });
    await waitFor(() => container.querySelector('[role="menu"]') !== null);
    const menu = container.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.style.left).toBe('10px');
  }, 20000);
});
