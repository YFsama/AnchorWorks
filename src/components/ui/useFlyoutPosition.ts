import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

/** `below` — under the anchor, left-aligned with it (a menubar trigger).
 *  `aside` — flush with the anchor's right edge, first row level with it (a
 *  submenu row); flips to the anchor's left when the viewport edge is near. */
export type FlyoutPlace = 'below' | 'aside';

/** Gap between a trigger and the panel placed under it. */
const BELOW_GAP = 4;
/** The panels' `py-1` — subtracted so the flyout's first row lines up with its row. */
const PANEL_PADDING_Y = 4;
/** Flyouts never come closer than this to a viewport edge. */
const VIEWPORT_MARGIN = 8;

/** Where a panel sits until it has been measured — off-screen, never at (0,0). */
export const FLYOUT_PARKED: CSSProperties = { left: -9999, top: -9999 };

/**
 * Positions a dropdown / flyout panel with `position: fixed` from its
 * anchor's live viewport rect.
 *
 * Why fixed at every level: a flyout that hangs outside its parent panel
 * (a submenu to the right of a row) is clipped by any scrolling ancestor,
 * and `overflow-y: auto` clips on both axes even when nothing overflows.
 * The menubar's top-level panel needs `overflow-y-auto` for its height cap
 * and the context menu's root for the same reason — with `absolute`
 * submenus inside them, every nested flyout was cut off: CSS reported the
 * panel "visible", but `elementFromPoint` on its rows returned the canvas,
 * so the rows could not be clicked by mouse at all. A fixed panel's
 * containing block is the viewport (no transformed ancestor on these
 * surfaces), so no ancestor overflow can clip it.
 *
 * `measure()` runs from the anchor's mouseenter / focus handlers (never
 * from an effect body — `set-state-in-effect`), before the browser paints,
 * so the panel never shows at a stale position. While `open`, window
 * resize and any scroll (captured, since element scrolls don't bubble)
 * re-measure. The panel is rendered with `FLYOUT_PARKED` whenever `pos` is
 * null, so callers must keep it mounted (hidden via visibility) to give
 * `offsetWidth` / `offsetHeight` something to measure.
 */
export function useFlyoutPosition<Anchor extends HTMLElement>(place: FlyoutPlace, open: boolean) {
  const anchorRef = useRef<Anchor>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left: number;
    let top: number;
    if (place === 'below') {
      left = anchor.left;
      top = anchor.bottom + BELOW_GAP;
    } else {
      // Flush, with no gap: a gap would be dead space that breaks the hover
      // chain between a row and its flyout.
      left = anchor.right;
      top = anchor.top - PANEL_PADDING_Y;
      if (left + pw > vw - VIEWPORT_MARGIN) left = anchor.left - pw;
    }
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - VIEWPORT_MARGIN - pw));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - VIEWPORT_MARGIN - ph));
    setPos({ left, top });
  }, [place]);

  const clear = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  return { anchorRef, panelRef, pos, measure, clear };
}
