import { Loader2 } from 'lucide-react';

interface LoadingProps {
  label?: string;
  overlay?: boolean;
}

export function Loading({ label, overlay = false }: LoadingProps) {
  const inner = (
    <div className="flex items-center gap-2 text-muted text-xs" role="status" aria-live="polite">
      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  );
  if (!overlay) return inner;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-md px-4 py-3 shadow-xl">
        {inner}
      </div>
    </div>
  );
}
