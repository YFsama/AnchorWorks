import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { exitIsolationMode, isIsolationMode } from '../lib/isolationMode';
import { useT } from '../lib/i18n';

export function IsolationBadge() {
  const t = useT();
  const [active, setActive] = useState(isIsolationMode());
  useEffect(() => {
    const onChange = () => setActive(isIsolationMode());
    window.addEventListener('anchorworks:isolation', onChange as EventListener);
    return () => window.removeEventListener('anchorworks:isolation', onChange as EventListener);
  }, []);
  if (!active) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 rounded-full border border-accent2/50 bg-panel/95 px-3 py-1.5 text-xs text-ink shadow-lg flex items-center gap-2">
      <span>{t('Isolation Mode')}</span>
      <button type="button" className="btn !py-0.5 !px-1.5 flex items-center gap-1" onClick={() => { exitIsolationMode(); setActive(false); }}><LogOut size={12} aria-hidden="true" /> {t('Exit')}</button>
    </div>
  );
}
