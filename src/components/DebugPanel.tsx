import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { clearLog, getLog, subscribeLog } from '../lib/debug';
import { getCanvas } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import { formatHMS } from '../lib/time';

interface Props { onClose: () => void; }

export function DebugPanel({ onClose }: Props) {
  const t = useT();
  const [, setTick] = useState(0);
  const [tab, setTab] = useState<'log' | 'state' | 'perf'>('log');
  useEffect(() => { const unsub = subscribeLog(() => setTick(t => t + 1)); return () => { unsub(); }; }, []);
  const log = getLog();
  const canvas = getCanvas();
  const objs = canvas?.getObjects() ?? [];
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return (
    <div className="h-56 border-t border-border bg-panel text-xs flex flex-col">
      <div className="h-8 border-b border-border flex items-center px-2 gap-1">
        {/* WAI-ARIA tablist, same recipe as RepeatDialog + PreferencesDialog
         *  — including arrow-key navigation between sibling tabs. */}
        <div
          role="tablist"
          aria-label={t('Debug')}
          aria-orientation="horizontal"
          className="flex items-center gap-1"
          onKeyDown={(e) => {
            const order: Array<'log' | 'state' | 'perf'> = ['log', 'state', 'perf'];
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const idx = order.indexOf(tab);
            let next = idx;
            if (e.key === 'ArrowRight') next = (idx + 1) % order.length;
            else if (e.key === 'ArrowLeft') next = (idx - 1 + order.length) % order.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = order.length - 1;
            if (next !== idx) setTab(order[next]);
          }}
        >
          {(['log', 'state', 'perf'] as const).map(tt => (
            <button
              key={tt}
              id={`debug-tab-${tt}`}
              role="tab"
              aria-selected={tab === tt}
              aria-controls="debug-tab-panel"
              tabIndex={tab === tt ? 0 : -1}
              onClick={() => setTab(tt)}
              className={`px-2 py-0.5 rounded transition-colors ${tab === tt ? 'bg-panel3 text-ink' : 'text-muted hover:text-ink'}`}
            >
              {t(tt)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={clearLog} className="text-muted hover:text-ink p-1 transition-colors" aria-label={t('Clear log')}><Trash2 size={12} aria-hidden="true" /></button>
          <button onClick={onClose} className="text-muted hover:text-ink p-1 transition-colors" aria-label={t('Close')}><X size={12} aria-hidden="true" /></button>
        </div>
      </div>
      <div
        id="debug-tab-panel"
        className="flex-1 overflow-auto font-mono text-[10px] leading-tight"
        role="tabpanel"
        aria-labelledby={`debug-tab-${tab}`}
      >
        {tab === 'log' && (
          log.length === 0
            ? <div className="p-3 text-muted">{t('No log entries.')}</div>
            : log.map((l, i) => (
              <div key={i} className={`px-2 py-0.5 border-b border-border/40 ${
                l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warn' : 'text-ink'
              }`}>
                <span className="text-muted mr-2">{formatHMS(l.ts)}</span>
                <span className="text-ink font-medium mr-2">[{l.tag}]</span>{l.message}
              </div>
            ))
        )}
        {tab === 'state' && (
          <pre className="p-2">{JSON.stringify({
            zoom: canvas?.getZoom(),
            viewport: canvas?.viewportTransform,
            background: canvas?.backgroundColor,
            objects: objs.map(o => ({ id: (o as { _id?: string })._id, type: o.type, left: o.left, top: o.top, w: o.width, h: o.height, angle: o.angle })),
          }, null, 2)}</pre>
        )}
        {tab === 'perf' && (
          <div className="p-2 space-y-1">
            <div>{t('FPS target: 60 (canvas re-renders on demand)')}</div>
            <div>{t('Object count')}: {objs.length}</div>
            {mem && <div>{t('JS heap')}: {(mem.usedJSHeapSize / 1048576).toFixed(1)} / {(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB</div>}
            <div>{t('UserAgent')}: {navigator.userAgent}</div>
            <div>{t('Web Serial')}: {('serial' in navigator) ? t('✅ available') : t('❌ not available')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// formatHMS moved to src/lib/time.ts (also consumed by InspectPanel).
