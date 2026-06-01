import { useEffect, useState } from 'react';
import { Trash2, X, Copy, Download } from 'lucide-react';
import { clearLog, getLog, subscribeLog } from '../lib/debug';
import { getCanvas } from '../lib/canvasEngine';
import { snapshotKeymap } from '../lib/keymap';
import { useEditor } from '../store/editor';
import { isTauri } from '../lib/runtime';
import { download } from '../lib/io';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { formatHMS } from '../lib/time';

interface Props { onClose: () => void; }

type Tab = 'log' | 'state' | 'perf' | 'keymap';
const TABS: Tab[] = ['log', 'state', 'perf', 'keymap'];

export function DebugPanel({ onClose }: Props) {
  const t = useT();
  const [, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>('log');
  const [fps, setFps] = useState(0);
  useEffect(() => { const unsub = subscribeLog(() => setTick(t => t + 1)); return () => { unsub(); }; }, []);

  // Live FPS — count requestAnimationFrame ticks over a rolling 500ms window.
  // The canvas only re-renders on demand, so this reflects the browser's UI
  // thread headroom rather than a fixed 60, which is the useful signal when
  // hunting jank.
  useEffect(() => {
    let raf = 0, frames = 0, last = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0; last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const log = getLog();
  const canvas = getCanvas();
  const objs = canvas?.getObjects() ?? [];
  const cutPaths = useEditor(s => s.cutPaths);
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;

  // Total cut-path length (mm) — handy when debugging plotter output size.
  const cutLenMm = (() => {
    let len = 0;
    for (const p of cutPaths) for (let i = 1; i < p.points.length; i++) {
      len += Math.hypot(p.points[i][0] - p.points[i - 1][0], p.points[i][1] - p.points[i - 1][1]);
    }
    return len;
  })();

  // One structured blob the user can hand to a bug report — everything a
  // maintainer needs to reproduce environment-specific issues.
  const diagnostics = () => ({
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    shell: isTauri() ? 'tauri' : 'web',
    userAgent: navigator.userAgent,
    language: navigator.language,
    webSerial: 'serial' in navigator,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    canvas: { zoom: canvas?.getZoom(), background: canvas?.backgroundColor, objectCount: objs.length },
    cutPaths: { count: cutPaths.length, totalLenMm: Math.round(cutLenMm) },
    memoryMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    keymap: snapshotKeymap(),
    log: log.slice(-100).map(l => ({ ts: l.ts, level: l.level, tag: l.tag, message: l.message })),
  });

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics(), null, 2));
      toast.success(t('Diagnostics copied'));
    } catch { toast.error(t('Clipboard unavailable')); }
  };
  const downloadDiagnostics = () =>
    download('anchorworks-diagnostics.json', JSON.stringify(diagnostics(), null, 2), 'application/json');

  return (
    <div className="h-56 border-t border-border bg-panel text-xs flex flex-col">
      <div className="h-8 border-b border-border flex items-center px-2 gap-1">
        <div
          role="tablist"
          aria-label={t('Debug')}
          aria-orientation="horizontal"
          className="flex items-center gap-1"
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const idx = TABS.indexOf(tab);
            let next = idx;
            if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
            else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = TABS.length - 1;
            if (next !== idx) setTab(TABS[next]);
          }}
        >
          {TABS.map(tt => (
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
          <button onClick={copyDiagnostics} className="text-muted hover:text-ink p-1 transition-colors" aria-label={t('Copy diagnostics')} title={t('Copy diagnostics')}><Copy size={12} aria-hidden="true" /></button>
          <button onClick={downloadDiagnostics} className="text-muted hover:text-ink p-1 transition-colors" aria-label={t('Download diagnostics')} title={t('Download diagnostics')}><Download size={12} aria-hidden="true" /></button>
          <button onClick={clearLog} className="text-muted hover:text-ink p-1 transition-colors" aria-label={t('Clear log')} title={t('Clear log')}><Trash2 size={12} aria-hidden="true" /></button>
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
            <div>{t('Version')}: {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'} · {isTauri() ? t('Native shell (Tauri)') : t('Web / PWA')}</div>
            <div className={fps && fps < 30 ? 'text-warn' : ''}>{t('FPS')}: {fps || '—'}</div>
            <div>{t('Object count')}: {objs.length}</div>
            <div>{t('Cut paths')}: {cutPaths.length} · {Math.round(cutLenMm)} mm</div>
            {mem && <div>{t('JS heap')}: {(mem.usedJSHeapSize / 1048576).toFixed(1)} / {(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB</div>}
            <div>{t('Viewport')}: {window.innerWidth}×{window.innerHeight} @ {window.devicePixelRatio}x</div>
            <div>{t('Web Serial')}: {('serial' in navigator) ? t('✅ available') : t('❌ not available')}</div>
            <div className="text-muted break-all">{navigator.userAgent}</div>
          </div>
        )}
        {tab === 'keymap' && (
          <pre className="p-2">{JSON.stringify(snapshotKeymap(), null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

// formatHMS moved to src/lib/time.ts (also consumed by InspectPanel).
