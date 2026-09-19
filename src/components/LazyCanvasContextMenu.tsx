import { useEffect, useRef, useState, type ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Lazy shell around CanvasContextMenu (157 kB of source, hundreds of command
// bindings). The real menu only mounts after the user right-clicks for the
// first time — until then this shell is the only eagerly-loaded code (a few
// hundred bytes), keeping the menu's module graph out of the entry chunk.
//
// How it preserves behavior:
//   1. The shell listens for the same `vector:context-menu` window event the
//      real menu listens for (dispatched by CanvasView / canvasEngine).
//   2. On the first event it stashes the requested {x, y} position, triggers
//      the dynamic import, and mounts the real component once loaded.
//   3. React runs child effects before parent effects, so by the time this
//      component's [Comp] effect fires the real menu has attached its own
//      `vector:context-menu` listener — the shell then replays the stashed
//      event so the menu opens at the exact coordinates of that first click.
//   4. An idle timer warms the chunk a few seconds after boot so even the
//      first right-click is usually instant (PWA: served from precache).
// ---------------------------------------------------------------------------

interface Props {
  onNewDocument: () => void | Promise<void>;
  onOpenFile: () => void;
  onImportImage: () => void;
  onToggleDebug: () => void;
}

export function LazyCanvasContextMenu(props: Props) {
  // The loaded menu component — null until the chunk arrives.
  const [Comp, setComp] = useState<ComponentType<Props> | null>(null);
  // Position of a context-menu request that arrived before the chunk loaded.
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  // Mirrors `Comp` for the always-attached window listener (avoids re-binding
  // the listener and stale closures).
  const readyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      import('./CanvasContextMenu').then((m) => {
        if (alive) setComp(() => m.CanvasContextMenu);
      });
    };
    const onShow = (ev: Event) => {
      if (readyRef.current) return; // real menu owns the event from here on
      const detail = (ev as CustomEvent<{ x: number; y: number }>).detail;
      if (!detail) return;
      pendingRef.current = { x: detail.x, y: detail.y };
      load();
    };
    window.addEventListener('vector:context-menu', onShow as EventListener);
    // Warm the chunk once the boot path has settled so the first right-click
    // is normally served from an already-loaded module.
    const warm = window.setTimeout(load, 5000);
    return () => {
      alive = false;
      window.removeEventListener('vector:context-menu', onShow as EventListener);
      window.clearTimeout(warm);
    };
  }, []);

  // Replay the stashed position after the real menu has mounted and attached
  // its own listener (child effects run before this parent effect).
  useEffect(() => {
    if (!Comp) return;
    readyRef.current = true;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      window.dispatchEvent(new CustomEvent('vector:context-menu', { detail: pending }));
    }
  }, [Comp]);

  if (!Comp) return null;
  return <Comp {...props} />;
}
