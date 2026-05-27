import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { getDocStats, subscribeStats, type DocStats } from '../lib/inspect';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';

/** Pretty-print a byte count using SI-ish units (kB / MB). Picked over
 *  binary kB so the displayed value matches what most "size" tooling shows. */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Compact integer formatting with thousand separators, keeping a single
 *  decimal place when the magnitude is reasonable. Designed for px / px²
 *  stats where the user mostly cares about order of magnitude. */
function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n);
  return rounded.toLocaleString();
}

// HH:MM:SS formatter moved to src/lib/time.ts so DebugPanel + InspectPanel
// share one source (was duplicated as identical local helpers in each file).
import { formatHMS as formatTime } from '../lib/time';

const TYPE_LABELS: Record<string, string> = {
  rect: 'Rect',
  circle: 'Circle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  polyline: 'Polyline',
  path: 'Path',
  'i-text': 'Text',
  text: 'Text',
  textbox: 'Text',
  image: 'Image',
  group: 'Group',
  activeselection: 'Selection',
};
function labelFor(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function InspectPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [stats, setStats] = useState<DocStats>(() => getDocStats());
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now());

  useEffect(() => {
    // The useState initializer already pulls a snapshot at first render.
    // We just subscribe here for future canvas events; the callback fires
    // *asynchronously* on Fabric event emissions, so it's not the
    // setState-in-effect anti-pattern (no synchronous cascade).
    const off = subscribeStats(() => {
      setStats(getDocStats());
      setRefreshedAt(Date.now());
    });
    return () => off();
  }, []);

  // Sort the type breakdown so the most common types lead — better for
  // scanability than dictionary order.
  const typeRows = useMemo(
    () => Object.entries(stats.byType).sort((a, b) => b[1] - a[1]),
    [stats.byType],
  );

  const bbox = stats.boundingBox;

  const onSwatch = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast.show({ kind: 'success', message: `${t('Copied')} ${hex}`, duration: 1800 });
    } catch {
      toast.show({ kind: 'warn', message: t('Clipboard unavailable'), duration: 2000 });
    }
  };

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="inspect-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Inspect')}
          </span>
          <span className="text-ink/60 tabular-nums normal-case tracking-normal">
            {formatTime(refreshedAt)}
          </span>
        </button>
      </h3>
      {open && (
        <div id="inspect-panel-body" className="px-3 pb-3 space-y-3">
          {/* Object count + per-type chips */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="field-label">{t('Objects')}</h4>
              <div className="text-ink tabular-nums text-xs">{stats.objectCount}</div>
            </div>
            {typeRows.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {typeRows.map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-1.5 h-5 rounded-sm bg-panel2 border border-border text-[10px] text-ink/90"
                    title={`${t(labelFor(type))}: ${count}`}
                  >
                    <span className="text-muted">{t(labelFor(type))}</span>
                    <span className="tabular-nums text-ink">{count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-muted italic">{t('No objects on canvas')}</div>
            )}
          </div>

          {/* Numeric stats grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label={t('Bounds')}>
              {bbox ? (
                <span className="tabular-nums">
                  {Math.round(bbox.w)} × {Math.round(bbox.h)} px
                </span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </Stat>
            <Stat label={t('Path length')}>
              <span className="tabular-nums">{formatNum(stats.totalPathLength)} px</span>
            </Stat>
            <Stat label={t('Total area')}>
              <span className="tabular-nums">{formatNum(stats.totalArea)} px²</span>
            </Stat>
            <Stat label={t('SVG size')}>
              <span className="tabular-nums">{formatBytes(stats.estimatedSvgBytes)}</span>
            </Stat>
          </div>

          {/* Group depth — only worth a badge when something is actually nested */}
          {stats.deepestNesting > 1 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Layers size={12} className="text-muted" aria-hidden="true" />
              <span className="text-muted">{t('Group depth')}</span>
              <span
                className="ml-auto inline-flex items-center px-1.5 h-5 rounded-sm bg-accent2/15 border border-accent2/40 text-ink tabular-nums text-[10px]"
                title={`${t('Deepest group nesting')}: ${stats.deepestNesting}`}
              >
                {stats.deepestNesting}
              </span>
            </div>
          )}

          {/* Palette */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="field-label">{t('Palette')}</h4>
              <div className="text-ink/60 tabular-nums text-[10px]">{stats.uniqueColors.length}</div>
            </div>
            {stats.uniqueColors.length === 0 ? (
              <div className="text-[10px] text-muted italic">{t('No colors in use')}</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {stats.uniqueColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSwatch(c)}
                    title={c}
                    aria-label={`${t('Copy color')} ${c}`}
                    className="w-3 h-3 rounded-sm border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="field-label mb-0">{label}</div>
      <div className="text-xs text-ink truncate">{children}</div>
    </div>
  );
}
