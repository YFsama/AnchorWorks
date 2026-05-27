import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { subscribeToasts, toast as toastApi, type Toast, type ToastKind } from '../lib/toast';
import { useT } from '../lib/i18n';

/**
 * Fixed bottom-right toast stack. Mounted once at the app shell level.
 * Slides each toast in from the right; respects prefers-reduced-motion.
 *
 * Implementation: we mirror the source list (`live`) plus retain a brief
 * "leaving" cache so removed toasts can finish their exit animation before
 * unmounting.
 */
export function ToastHost() {
  const [live, setLive] = useState<Toast[]>([]);
  // Toasts that have been removed from `live` but still need to play their
  // exit animation. Each entry remembers its toast for rendering.
  const [leaving, setLeaving] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setLive), []);

  // Track the previous `live` array to diff removals (needs the full Toast).
  const prevLiveRef = useRef<Toast[]>([]);
  useEffect(() => {
    const prevLive = prevLiveRef.current;
    const currentIds = new Set(live.map(t => t.id));
    const removed = prevLive.filter(t => !currentIds.has(t.id));
    prevLiveRef.current = live;
    if (removed.length) {
      setLeaving(prevLeaving => {
        // Don't double-add if any are already leaving.
        const existing = new Set(prevLeaving.map(t => t.id));
        const additions = removed.filter(t => !existing.has(t.id));
        if (additions.length === 0) return prevLeaving;
        return [...prevLeaving, ...additions];
      });
      // Schedule cleanup after exit animation.
      const timeouts = removed.map(t =>
        window.setTimeout(() => {
          setLeaving(prevLeaving => prevLeaving.filter(x => x.id !== t.id));
        }, 200),
      );
      return () => { for (const h of timeouts) window.clearTimeout(h); };
    }
  }, [live]);

  if (live.length === 0 && leaving.length === 0) return null;

  // Stable ordering: live (newest at the bottom of the stack) followed by
  // residual leaving toasts.
  const liveIds = new Set(live.map(t => t.id));
  const residualLeaving = leaving.filter(t => !liveIds.has(t.id));

  return (
    // No aria-live on the host: each ToastItem carries its own `role` (alert
    // for warn/error → assertive; status for info/success → polite). A live
    // region on the parent would double-announce on top of the child role.
    <div
      className="toast-host"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        // Above every dialog layer (RecoveryDialog is z-[100], TemplatesDialog
        // is z-[90], etc.). System feedback must always be visible on top.
        zIndex: 110,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {live.map(t => <ToastItem key={t.id} toast={t} leaving={false} />)}
      {residualLeaving.map(t => <ToastItem key={t.id} toast={t} leaving={true} />)}
    </div>
  );
}

// Routed through CSS vars so dark + light themes both stay AA-compliant
// (light-mode overrides for success / warn / danger / accent2 darken these
// for the 3:1 graphical contrast threshold on the off-white surface).
const KIND_COLOR: Record<ToastKind, string> = {
  success: 'rgb(var(--color-success))',
  warn:    'rgb(var(--color-warn))',
  error:   'rgb(var(--color-danger))',
  info:    'rgb(var(--color-accent2))',
};

function KindIcon({ kind }: { kind: ToastKind }) {
  const color = KIND_COLOR[kind];
  const props = { size: 16, color, 'aria-hidden': true as const };
  if (kind === 'success') return <CheckCircle2 {...props} />;
  if (kind === 'warn') return <AlertTriangle {...props} />;
  if (kind === 'error') return <XCircle {...props} />;
  return <Info {...props} />;
}

function ToastItem({ toast, leaving }: { toast: Toast; leaving: boolean }) {
  const t = useT();
  // Theme-aware colors are sourced from CSS variables so toasts read correctly
  // in dark, light, and high-contrast modes (regression: hard-coded #1d1d22 /
  // #e7e7ea here made every toast look "stuck in dark mode" in light theme).
  return (
    <div
      role={toast.kind === 'error' || toast.kind === 'warn' ? 'alert' : 'status'}
      className={`toast-item ${leaving ? 'toast-leaving' : 'toast-entering'}`}
      style={{
        width: 320,
        background: 'rgb(var(--color-panel))',
        border: '1px solid rgb(var(--color-border))',
        borderLeft: `3px solid ${KIND_COLOR[toast.kind]}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgb(0 0 0 / 0.28)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        color: 'rgb(var(--color-ink))',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <KindIcon kind={toast.kind} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: 'rgb(var(--color-ink))' }}>
            {toast.title}
          </div>
        )}
        <div style={{ fontSize: 11, lineHeight: 1.4, color: 'rgb(var(--color-ink) / 0.82)', wordBreak: 'break-word' }}>
          {toast.message}
        </div>
      </div>
      {toast.action && (
        <button
          type="button"
          className="btn"
          style={{ flexShrink: 0, marginTop: -2 }}
          onClick={() => {
            try { toast.action!.onClick(); } finally { toastApi.dismiss(toast.id); }
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={t('Dismiss')}
        onClick={() => toastApi.dismiss(toast.id)}
        className="toast-dismiss"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
