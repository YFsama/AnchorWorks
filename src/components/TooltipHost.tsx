import { useEffect, useState, useRef } from 'react';

/**
 * Global delegated tooltip provider.
 *
 * On mouseenter over any element with a `title` attribute, this:
 *   1. Stashes the title text and clears the attribute (suppresses the OS tooltip).
 *   2. Schedules a styled tooltip to appear after 400ms next to the element.
 *   3. Restores the title attribute on mouseleave / blur / click — so screen
 *      readers and accessibility tooling continue to read it via the live DOM.
 *
 * One file, one mount. Replaces every native `title=""` tooltip in the app
 * without touching a single component.
 */

const SHOW_DELAY = 400;
const HIDE_DELAY = 80;
const OFFSET = 8;
const ATTR_STASH = 'data-tip-orig';

export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; left: number; top: number; placement: 'above' | 'below' } | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const activeEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
      if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    };
    const restore = (el: HTMLElement | null) => {
      if (!el) return;
      const orig = el.getAttribute(ATTR_STASH);
      if (orig !== null) { el.setAttribute('title', orig); el.removeAttribute(ATTR_STASH); }
    };
    const onEnter = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.nodeType !== 1) return;
      // Find the closest element carrying a title; supports nested icons.
      const host = el.closest('[title]') as HTMLElement | null;
      if (!host) return;
      const text = host.getAttribute('title');
      if (!text) return;

      clear();
      host.setAttribute(ATTR_STASH, text);
      host.setAttribute('title', '');
      activeEl.current = host;

      showTimer.current = window.setTimeout(() => {
        const rect = host.getBoundingClientRect();
        const placeAbove = rect.top > 80;
        setTip({
          text,
          left: rect.left + rect.width / 2,
          top: placeAbove ? rect.top - OFFSET : rect.bottom + OFFSET,
          placement: placeAbove ? 'above' : 'below',
        });
      }, SHOW_DELAY);
    };
    const onLeave = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.nodeType !== 1) return;
      const host = (el.closest?.('[' + ATTR_STASH + ']') as HTMLElement | null) ?? activeEl.current;
      if (!host) return;
      clear();
      hideTimer.current = window.setTimeout(() => {
        restore(host);
        if (activeEl.current === host) activeEl.current = null;
        setTip(null);
      }, HIDE_DELAY);
    };
    const onClickOrBlur = () => {
      clear();
      restore(activeEl.current);
      activeEl.current = null;
      setTip(null);
    };

    document.addEventListener('mouseover', onEnter, true);
    document.addEventListener('mouseout', onLeave, true);
    document.addEventListener('click', onClickOrBlur, true);
    document.addEventListener('keydown', onClickOrBlur, true);
    window.addEventListener('blur', onClickOrBlur);

    return () => {
      clear();
      restore(activeEl.current);
      document.removeEventListener('mouseover', onEnter, true);
      document.removeEventListener('mouseout', onLeave, true);
      document.removeEventListener('click', onClickOrBlur, true);
      document.removeEventListener('keydown', onClickOrBlur, true);
      window.removeEventListener('blur', onClickOrBlur);
    };
  }, []);

  if (!tip) return null;

  // `--tt-y` feeds into the `tooltip-enter` keyframe in index.css so the
  // animation lands on the placement-appropriate Y offset. Without it the
  // keyframe defaults to -100% (the "above" placement value), which fights
  // the inline `translate(-50%, 0)` we set for "below" — the tooltip would
  // animate up off its anchor and end up over the wrong target. Setting the
  // var per-placement keeps the inline transform and the keyframe's `to`
  // step in agreement.
  const yOffset = tip.placement === 'above' ? '-100%' : '0';
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: tip.left,
        top: tip.top,
        transform: `translate(-50%, ${yOffset})`,
        // Custom property consumed by the `tooltip-enter` keyframe. Cast via
        // `as React.CSSProperties` so TS accepts the custom-prop key.
        ['--tt-y' as unknown as keyof React.CSSProperties]: yOffset,
        zIndex: 9999,
        pointerEvents: 'none',
        // Inverted tooltip — `ink` surface + `panel` text gives a high-contrast
        // pill that pops on toolbar / menu / status surfaces in both themes
        // (dark mode: near-white pill on dark UI; light mode: near-black pill
        // on light UI). Previous hard-coded #0e0e12 / #e7e7ea looked stuck-in-
        // dark-mode on the light theme.
        background: 'rgb(var(--color-ink))',
        color: 'rgb(var(--color-panel))',
        border: '1px solid rgb(var(--color-ink))',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 11,
        lineHeight: 1.3,
        fontWeight: 500,
        letterSpacing: 0.1,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 14px rgb(0 0 0 / 0.25)',
        animation: 'tooltip-enter 120ms ease-out both',
        animationDelay: '0ms',
      }}
    >
      {tip.text}
    </div>
  );
}
