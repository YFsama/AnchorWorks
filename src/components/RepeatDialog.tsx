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

const GRID_REPEAT_PRESETS = [
  { id: 'two-by-two', label: '2×2 repeat', cols: 2, rows: 2 },
  { id: 'three-by-three', label: '3×3 repeat', cols: 3, rows: 3 },
  { id: 'five-across', label: '5 across', cols: 5, rows: 1 },
  { id: 'five-down', label: '5 down', cols: 1, rows: 5 },
] as const;
const RADIAL_REPEAT_PRESETS = [
  { id: 'six-around', label: '6 around', count: 6, radius: 100, startAngle: 0, endAngle: 360, rotateInstances: true },
  { id: 'eight-around', label: '8 around', count: 8, radius: 120, startAngle: 0, endAngle: 360, rotateInstances: true },
  { id: 'twelve-badge', label: '12 badge', count: 12, radius: 140, startAngle: 0, endAngle: 360, rotateInstances: false },
] as const;
const MIRROR_AXIS_PRESETS: Array<{ value: MirrorAxis; label: string }> = [
  { value: 'horizontal', label: 'Horizontal (flip X)' },
  { value: 'vertical', label: 'Vertical (flip Y)' },
  { value: 'both', label: 'Both (4-way kaleidoscope)' },
];

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

  // Grid params. Default the per-step offset to the selection's bounding size
  // so the array tiles edge-to-edge out of the box (SignMaster Step & Repeat) —
  // the dialog mounts on open, so the summary reflects the current selection.
  const initSum = useEditor.getState().selectionSummary;
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [dx, setDx] = useState(() => (initSum && initSum.width > 0 ? Math.round(initSum.width) : 80));
  const [dy, setDy] = useState(() => (initSum && initSum.height > 0 ? Math.round(initSum.height) : 80));

  // Radial params
  const [count, setCount] = useState(8);
  const [radius, setRadius] = useState(120);
  const [startAngle, setStartAngle] = useState(0);
  const [endAngle, setEndAngle] = useState(360);
  const [rotateInstances, setRotateInstances] = useState(true);

  // Mirror params
  const [axis, setAxis] = useState<MirrorAxis>('horizontal');
  const [reviewedGridPreset, setReviewedGridPreset] = useState('');
  const [reviewedRadialPreset, setReviewedRadialPreset] = useState('');
  const [reviewedMirrorPreset, setReviewedMirrorPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

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

  const applyGridPreset = (preset: (typeof GRID_REPEAT_PRESETS)[number]) => {
    setCols(preset.cols);
    setRows(preset.rows);
  };

  const resetFields = () => {
    setTab('grid');
    setCols(3);
    setRows(3);
    setDx(initSum && initSum.width > 0 ? Math.round(initSum.width) : 80);
    setDy(initSum && initSum.height > 0 ? Math.round(initSum.height) : 80);
    setCount(8);
    setRadius(120);
    setStartAngle(0);
    setEndAngle(360);
    setRotateInstances(true);
    setAxis('horizontal');
    setReviewedGridPreset('');
    setReviewedRadialPreset('');
    setReviewedMirrorPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleGridPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-repeat-grid-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const preset = GRID_REPEAT_PRESETS.find((item) => item.id === actions[nextIndex]?.dataset.value);
    if (preset) applyGridPreset(preset);
    requestAnimationFrame(() => {
      setReviewedGridPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const applyRadialPreset = (preset: (typeof RADIAL_REPEAT_PRESETS)[number]) => {
    setCount(preset.count);
    setRadius(preset.radius);
    setStartAngle(preset.startAngle);
    setEndAngle(preset.endAngle);
    setRotateInstances(preset.rotateInstances);
  };

  const handleRadialPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-repeat-radial-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const preset = RADIAL_REPEAT_PRESETS.find((item) => item.id === actions[nextIndex]?.dataset.value);
    if (preset) applyRadialPreset(preset);
    requestAnimationFrame(() => {
      setReviewedRadialPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleMirrorPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-repeat-mirror-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const nextAxis = actions[nextIndex]?.dataset.value as MirrorAxis | undefined;
    if (nextAxis) setAxis(nextAxis);
    requestAnimationFrame(() => {
      setReviewedMirrorPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-repeat-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.repeatActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
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
              <div className="space-y-3 text-xs">
                <div>
                  <div className="field-label !mb-1">{t('Repeat grid presets')}</div>
                  <div
                    className="grid grid-cols-4 gap-1"
                    role="toolbar"
                    aria-label={t('Repeat grid preset actions')}
                    aria-describedby="repeat-grid-preset-review-status"
                    title={t('Use arrow keys to review repeat grid presets')}
                    onKeyDown={handleGridPresetKeys}
                  >
                    <div id="repeat-grid-preset-review-status" className="sr-only" aria-live="polite">
                      {`${t('Reviewing')} ${reviewedGridPreset || t('Repeat grid presets')}`}
                    </div>
                    {GRID_REPEAT_PRESETS.map((preset) => {
                      const active = cols === preset.cols && rows === preset.rows;
                      const review = `${t(preset.label)} · ${t('Cols')} ${preset.cols} · ${t('Rows')} ${preset.rows}`;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          data-repeat-grid-preset-action
                          data-value={preset.id}
                          data-review={review}
                          className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                          onClick={() => applyGridPreset(preset)}
                          onFocus={(event) => setReviewedGridPreset(event.currentTarget.dataset.review ?? '')}
                          aria-pressed={active}
                          title={`${t(preset.label)} · ${preset.cols}×${preset.rows}`}
                        >
                          {t(preset.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <NumField label={t('Cols')} value={cols} min={1} max={50} step={1} onChange={setCols} />
                <NumField label={t('Rows')} value={rows} min={1} max={50} step={1} onChange={setRows} />
                <NumField label={t('dx (px)')} value={dx} step={1} onChange={setDx} />
                <NumField label={t('dy (px)')} value={dy} step={1} onChange={setDy} />
                  <div className="col-span-2 text-[10px] text-muted">
                    {cols} × {rows} = {cols * rows} {t('instances')}
                  </div>
                </div>
              </div>
            )}
            {tab === 'radial' && (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="field-label !mb-1">{t('Repeat radial presets')}</div>
                  <div
                    className="grid grid-cols-3 gap-1"
                    role="toolbar"
                    aria-label={t('Repeat radial preset actions')}
                    aria-describedby="repeat-radial-preset-review-status"
                    title={t('Use arrow keys to review repeat radial presets')}
                    onKeyDown={handleRadialPresetKeys}
                  >
                    <div id="repeat-radial-preset-review-status" className="sr-only" aria-live="polite">
                      {`${t('Reviewing')} ${reviewedRadialPreset || t('Repeat radial presets')}`}
                    </div>
                    {RADIAL_REPEAT_PRESETS.map((preset) => {
                      const active = count === preset.count
                        && radius === preset.radius
                        && startAngle === preset.startAngle
                        && endAngle === preset.endAngle
                        && rotateInstances === preset.rotateInstances;
                      const review = `${t(preset.label)} · ${t('Count')} ${preset.count} · ${t('Radius (px)')} ${preset.radius} · ${preset.rotateInstances ? t('Rotate instances') : t('No rotation')}`;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          data-repeat-radial-preset-action
                          data-value={preset.id}
                          data-review={review}
                          className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                          onClick={() => applyRadialPreset(preset)}
                          onFocus={(event) => setReviewedRadialPreset(event.currentTarget.dataset.review ?? '')}
                          aria-pressed={active}
                          title={`${t(preset.label)} · ${preset.count} ${t('copies')} · ${preset.radius}px`}
                        >
                          {t(preset.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
              </div>
            )}
            {tab === 'mirror' && (
              <div className="space-y-2 text-xs">
                <div className="field-label !mb-1">{t('Mirror axis presets')}</div>
                <div
                  className="grid grid-cols-3 gap-1"
                  role="toolbar"
                  aria-label={t('Repeat mirror preset actions')}
                  aria-describedby="repeat-mirror-preset-review-status"
                  title={t('Use arrow keys to review repeat mirror presets')}
                  onKeyDown={handleMirrorPresetKeys}
                >
                  <div id="repeat-mirror-preset-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedMirrorPreset || t('Mirror axis presets')}`}
                  </div>
                  {MIRROR_AXIS_PRESETS.map((preset) => {
                    const active = axis === preset.value;
                    const review = `${t('Mirror')} · ${t(preset.label)}`;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        data-repeat-mirror-preset-action
                        data-value={preset.value}
                        data-review={review}
                        className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                        onClick={() => setAxis(preset.value)}
                        onFocus={(event) => setReviewedMirrorPreset(event.currentTarget.dataset.review ?? '')}
                        aria-pressed={active}
                        title={t(preset.label)}
                      >
                        {t(preset.label)}
                      </button>
                    );
                  })}
                </div>
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
        <div
          className="flex items-center gap-2 px-4 py-3 border-t border-border"
          role="toolbar"
          aria-label={t('Repeat actions')}
          aria-describedby="repeat-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="repeat-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Repeat actions')}`}
          </span>
          <button type="button" data-repeat-action data-repeat-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-repeat-action data-repeat-action-review={t('Reset')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset'))} onClick={resetFields} disabled={busy}>{t('Reset')}</button>
          <div className="flex-1" />
          <button
            type="button"
            data-repeat-action
            data-repeat-action-review={busy ? t('Applying…') : t('Apply')}
            className="btn-primary"
            onFocus={(event) => setReviewedFooterAction(event.currentTarget.dataset.repeatActionReview ?? '')}
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
