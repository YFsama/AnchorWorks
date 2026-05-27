import { useCallback, useMemo, useState } from 'react';
import { X, Grid3x3, RotateCw, FlipHorizontal2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { repeatGrid, repeatRadial, repeatMirror } from '../lib/repeat';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

type Tab = 'grid' | 'radial' | 'mirror';
type MirrorAxis = 'horizontal' | 'vertical' | 'both';

/**
 * "Object > Repeat" — a three-tab dialog for array transforms (Grid / Radial
 * / Mirror). Each tab has its own input set + a tiny SVG preview that
 * sketches how the operation will look. Apply commits via the matching
 * function in `lib/repeat.ts` and closes.
 *
 * State is local to the dialog (no store coupling beyond the open flag) —
 * we re-init defaults each time it opens so users don't see stale numbers
 * from a previous session.
 */
export function RepeatDialog() {
  const t = useT();
  const open = useEditor(s => s.showRepeat);
  const close = useCallback(() => useEditor.getState().setModal('showRepeat', false), []);
  const selCount = useEditor(s => s.selectionIds.length);

  // Escape close — capture phase, consistent with the rest of the dialog system.
  useEscapeClose(open, close);
  useFocusRestore(open);

  const [tab, setTab] = useState<Tab>('grid');

  // Grid params
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [dx, setDx] = useState(80);
  const [dy, setDy] = useState(80);

  // Radial params
  const [count, setCount] = useState(8);
  const [radius, setRadius] = useState(120);
  const [startAngle, setStartAngle] = useState(0);
  const [endAngle, setEndAngle] = useState(360);
  const [rotateInstances, setRotateInstances] = useState(true);

  // Mirror params
  const [axis, setAxis] = useState<MirrorAxis>('horizontal');

  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const apply = async () => {
    if (selCount === 0) {
      toast.warn(t('No selection'));
      return;
    }
    setBusy(true);
    try {
      let added = 0;
      if (tab === 'grid') {
        added = await repeatGrid({
          cols: clamp(cols, 1, 50),
          rows: clamp(rows, 1, 50),
          dx,
          dy,
        });
      } else if (tab === 'radial') {
        added = await repeatRadial({
          count: clamp(count, 2, 64),
          radius,
          startAngle,
          endAngle,
          rotateInstances,
        });
      } else {
        added = await repeatMirror({ axis });
      }
      toast.success(`+${added} ${t('copies')}`);
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="repeat-dialog-title"
    >
      <div
        className="bg-panel border border-border rounded-lg w-[560px] max-w-[95%] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title row */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="repeat-dialog-title" className="dialog-title">{t('Repeat')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Tab strip — WAI-ARIA tablist for assistive-tech, matches the
         *  pattern in PreferencesDialog (which also implements arrow-key
         *  nav, copied below). */}
        <div
          className="flex border-b border-border bg-panel/60"
          role="tablist"
          aria-label={t('Repeat')}
          aria-orientation="horizontal"
          onKeyDown={(e) => {
            const order: Tab[] = ['grid', 'radial', 'mirror'];
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
          <TabBtn id="grid" active={tab === 'grid'} onClick={() => setTab('grid')} icon={<Grid3x3 size={12} aria-hidden="true" />} label={t('Grid')} />
          <TabBtn id="radial" active={tab === 'radial'} onClick={() => setTab('radial')} icon={<RotateCw size={12} aria-hidden="true" />} label={t('Radial')} />
          <TabBtn id="mirror" active={tab === 'mirror'} onClick={() => setTab('mirror')} icon={<FlipHorizontal2 size={12} aria-hidden="true" />} label={t('Mirror')} />
        </div>

        <div
          id="repeat-tab-panel"
          className="px-4 py-4 grid grid-cols-[1fr_180px] gap-4"
          role="tabpanel"
          aria-labelledby={`repeat-tab-${tab}`}
        >
          {/* Inputs */}
          <div>
            {tab === 'grid' && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <NumField label={t('Cols')} value={cols} min={1} max={50} step={1} onChange={setCols} />
                <NumField label={t('Rows')} value={rows} min={1} max={50} step={1} onChange={setRows} />
                <NumField label={t('dx (px)')} value={dx} step={1} onChange={setDx} />
                <NumField label={t('dy (px)')} value={dy} step={1} onChange={setDy} />
                <div className="col-span-2 text-[10px] text-muted">
                  {cols} × {rows} = {cols * rows} {t('instances')}
                </div>
              </div>
            )}
            {tab === 'radial' && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <NumField label={t('Count')} value={count} min={2} max={64} step={1} onChange={setCount} />
                <NumField label={t('Radius (px)')} value={radius} min={0} step={1} onChange={setRadius} />
                <NumField label={t('Start °')} value={startAngle} min={-360} max={360} step={1} onChange={setStartAngle} />
                <NumField label={t('End °')} value={endAngle} min={-360} max={360} step={1} onChange={setEndAngle} />
                <label className="col-span-2 flex items-center gap-2 text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rotateInstances}
                    onChange={(e) => setRotateInstances(e.target.checked)}
                  />
                  {t('Rotate instances')}
                </label>
              </div>
            )}
            {tab === 'mirror' && (
              <div className="space-y-2 text-xs">
                <RadioRow value="horizontal" current={axis} onChange={setAxis} label={t('Horizontal (flip X)')} />
                <RadioRow value="vertical" current={axis} onChange={setAxis} label={t('Vertical (flip Y)')} />
                <RadioRow value="both" current={axis} onChange={setAxis} label={t('Both (4-way kaleidoscope)')} />
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-panel2 border border-border rounded-md p-2 flex items-center justify-center">
            <Preview
              tab={tab}
              grid={{ cols, rows, dx, dy }}
              radial={{ count, radius, startAngle, endAngle }}
              mirror={{ axis }}
            />
          </div>

          <div className="col-span-2 text-[10px] text-muted -mt-2">
            {selCount === 0
              ? t('Select an object first.')
              : `${t('Selected')} ${selCount} ${selCount === 1 ? t('object') : t('objects')}`}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <div className="flex-1" />
          <button
            type="button"
            className="btn-primary"
            onClick={() => { void apply(); }}
            disabled={busy || selCount === 0}
            aria-busy={busy}
          >
            {busy ? t('Applying…') : t('Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ small helpers ----------------------------- */

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function TabBtn({ id, active, onClick, icon, label }: { id: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      id={`repeat-tab-${id}`}
      role="tab"
      aria-selected={active}
      aria-controls="repeat-tab-panel"
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs border-r border-border last:border-r-0 transition-colors ${
        active
          ? 'bg-panel2 text-ink border-b-2 border-b-accent2'
          : 'text-muted hover:text-ink hover:bg-panel3'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function NumField({
  label, value, min, max, step = 1, onChange,
}: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <div className="field-label">{label}</div>
      <input
        type="number"
        className="input-num"
        value={value}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

function RadioRow({
  value, current, onChange, label,
}: { value: MirrorAxis; current: MirrorAxis; onChange: (v: MirrorAxis) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 rounded bg-panel2 border border-border hover:border-accent2/40 cursor-pointer text-ink transition-colors">
      <input
        type="radio"
        name="repeat-mirror-axis"
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
      />
      {label}
    </label>
  );
}

/* -------------------------------- preview --------------------------------- */

interface PreviewProps {
  tab: Tab;
  grid: { cols: number; rows: number; dx: number; dy: number };
  radial: { count: number; radius: number; startAngle: number; endAngle: number };
  mirror: { axis: MirrorAxis };
}

/**
 * Tiny SVG preview that conveys the shape of the array. Renders a stylised
 * "instance" rectangle at each computed position, scaled to fit a 160×160
 * box. Not a faithful preview of the actual selection — it's a schematic.
 */
function Preview({ tab, grid, radial, mirror }: PreviewProps) {
  const points = useMemo(() => computePreviewPoints(tab, grid, radial, mirror), [tab, grid, radial, mirror]);

  if (!points.length) return <div className="text-[10px] text-muted">—</div>;

  // Compute bounds and normalise into a 0..1 space, with padding.
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const pad = 0.15;
  const span = Math.max(w, h);

  const SVG = 160;
  const norm = (px: number, py: number) => {
    const nx = (px - minX - w / 2) / span;
    const ny = (py - minY - h / 2) / span;
    return { x: SVG / 2 + nx * SVG * (1 - pad * 2), y: SVG / 2 + ny * SVG * (1 - pad * 2) };
  };

  return (
    <svg width={SVG} height={SVG} viewBox={`0 0 ${SVG} ${SVG}`} className="block">
      {points.map((p, i) => {
        const { x, y } = norm(p.x, p.y);
        const isOrigin = p.origin;
        const rot = p.angle ?? 0;
        return (
          <g key={i} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(2)})`}>
            <rect
              x={-7}
              y={-5}
              width={14}
              height={10}
              rx={1}
              fill={isOrigin ? 'rgb(var(--color-accent2))' : 'rgb(var(--color-accent2) / 0.27)'}
              stroke="rgb(var(--color-accent2))"
              strokeWidth={1}
            />
            {p.flipX && (
              <line x1={0} y1={-5} x2={0} y2={5} stroke="#fff" strokeWidth={0.5} strokeDasharray="1 1" />
            )}
            {p.flipY && (
              <line x1={-7} y1={0} x2={7} y2={0} stroke="#fff" strokeWidth={0.5} strokeDasharray="1 1" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface PreviewPoint { x: number; y: number; angle?: number; origin?: boolean; flipX?: boolean; flipY?: boolean }

function computePreviewPoints(
  tab: Tab,
  grid: { cols: number; rows: number; dx: number; dy: number },
  radial: { count: number; radius: number; startAngle: number; endAngle: number },
  mirror: { axis: MirrorAxis },
): PreviewPoint[] {
  if (tab === 'grid') {
    const out: PreviewPoint[] = [];
    const cols = Math.max(1, Math.min(20, Math.floor(grid.cols)));
    const rows = Math.max(1, Math.min(20, Math.floor(grid.rows)));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({ x: c * grid.dx, y: r * grid.dy, origin: c === 0 && r === 0 });
      }
    }
    return out;
  }
  if (tab === 'radial') {
    const out: PreviewPoint[] = [];
    const count = Math.max(2, Math.min(64, Math.floor(radial.count)));
    const closed = Math.abs(radial.endAngle - radial.startAngle) >= 360 - 1e-6;
    const denom = closed ? count : Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
      const t = i / denom;
      const a = radial.startAngle + (radial.endAngle - radial.startAngle) * t;
      const rad = (a * Math.PI) / 180;
      const x = Math.sin(rad) * radial.radius;
      const y = -Math.cos(rad) * radial.radius;
      out.push({ x, y, origin: i === 0, angle: a });
    }
    return out;
  }
  // mirror
  const out: PreviewPoint[] = [];
  out.push({ x: 0, y: 0, origin: true });
  if (mirror.axis === 'horizontal' || mirror.axis === 'both') out.push({ x: 30, y: 0, flipX: true });
  if (mirror.axis === 'vertical' || mirror.axis === 'both') out.push({ x: 0, y: 22, flipY: true });
  if (mirror.axis === 'both') out.push({ x: 30, y: 22, flipX: true, flipY: true });
  return out;
}
