import { useCallback, useState } from 'react';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import { useEditor } from '../store/editor';
import { addFreeformGradient, type FreeformGradientStop } from '../lib/freeformGradient';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const DEFAULT_STOPS: FreeformGradientStop[] = [
  { x: 0.2, y: 0.25, color: '#3d9bff', radius: 0.55 },
  { x: 0.8, y: 0.3, color: '#ff7a3d', radius: 0.5 },
  { x: 0.45, y: 0.85, color: '#7cff6b', radius: 0.6 },
];

const GRADIENT_PRESETS: Array<{ label: string; width: number; height: number; stops: FreeformGradientStop[]; title: string }> = [
  {
    label: 'Poster glow',
    width: 480,
    height: 320,
    title: 'Bright poster background with cool and warm focus spots.',
    stops: [
      { x: 0.18, y: 0.22, color: '#2f80ff', radius: 0.7 },
      { x: 0.82, y: 0.28, color: '#ff6a3d', radius: 0.55 },
      { x: 0.5, y: 0.82, color: '#fff15a', radius: 0.65 },
    ],
  },
  {
    label: 'Neon sign',
    width: 520,
    height: 300,
    title: 'High-contrast magenta and cyan glow for sign mockups.',
    stops: [
      { x: 0.15, y: 0.5, color: '#06122f', radius: 1 },
      { x: 0.38, y: 0.35, color: '#00f0ff', radius: 0.45 },
      { x: 0.72, y: 0.55, color: '#ff2fd6', radius: 0.55 },
      { x: 0.9, y: 0.2, color: '#7cff6b', radius: 0.35 },
    ],
  },
  {
    label: 'Metal plate',
    width: 500,
    height: 220,
    title: 'Subtle silver tones for plaques, badges, and nameplates.',
    stops: [
      { x: 0.08, y: 0.25, color: '#d9dde4', radius: 0.55 },
      { x: 0.45, y: 0.5, color: '#7d8794', radius: 0.65 },
      { x: 0.85, y: 0.3, color: '#ffffff', radius: 0.5 },
      { x: 0.65, y: 0.88, color: '#b9c0ca', radius: 0.45 },
    ],
  },
  {
    label: 'Heat map',
    width: 420,
    height: 420,
    title: 'Dense color field for decals, wraps, and proof backgrounds.',
    stops: [
      { x: 0.2, y: 0.2, color: '#243bff', radius: 0.55 },
      { x: 0.78, y: 0.28, color: '#00d27a', radius: 0.5 },
      { x: 0.32, y: 0.78, color: '#ffd23f', radius: 0.55 },
      { x: 0.78, y: 0.78, color: '#ff3b30', radius: 0.6 },
    ],
  },
];

export function FreeformGradientDialog() {
  const t = useT();
  const open = useEditor(s => s.showFreeformGradient);
  const close = useCallback(() => useEditor.getState().setModal('showFreeformGradient', false), []);
  const [width, setWidth] = useState(480);
  const [height, setHeight] = useState(320);
  const [stops, setStops] = useState<FreeformGradientStop[]>(DEFAULT_STOPS);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const activePreset = GRADIENT_PRESETS.find((preset) => width === preset.width && height === preset.height && stopsEqual(stops, preset.stops))?.label ?? '';

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const updateStop = (index: number, patch: Partial<FreeformGradientStop>) => setStops(stops.map((stop, i) => i === index ? { ...stop, ...patch } : stop));
  const apply = async () => {
    const ok = await addFreeformGradient(width, height, stops);
    if (ok) toast.success(t('Freeform gradient added'), { title: t('Freeform Gradient') });
    else toast.warn(t('Add at least two color stops.'), { title: t('Freeform Gradient') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-freeform-gradient-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.freeformGradientActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-freeform-gradient-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const preset = GRADIENT_PRESETS[Number(actions[nextIndex]?.dataset.freeformGradientPresetIndex ?? -1)];
    if (preset) applyPreset(preset);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const applyPreset = (preset: { width: number; height: number; stops: FreeformGradientStop[] }) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setStops(preset.stops.map((stop) => ({ ...stop })));
  };

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) close(); }} role="dialog" aria-modal="true" aria-labelledby="freeform-gradient-title">
      <div className="bg-panel border border-border rounded-lg w-[460px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3"><h2 id="freeform-gradient-title" className="dialog-title flex items-center gap-2"><Sparkles size={14} aria-hidden="true" /> {t('Freeform Gradient')}</h2><button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button></div>
        <p className="text-xs text-muted leading-relaxed mb-3">{t('Creates a rasterized freeform gradient from draggable-style color stops; it exports reliably where SVG mesh gradients are unsupported.')}</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label><div className="field-label">{t('Width')}</div><input type="number" className="input-num" min={16} value={width} onChange={(e) => setWidth(Math.max(16, parseInt(e.target.value, 10) || 480))} /></label>
          <label><div className="field-label">{t('Height')}</div><input type="number" className="input-num" min={16} value={height} onChange={(e) => setHeight(Math.max(16, parseInt(e.target.value, 10) || 320))} /></label>
        </div>
        <div className="mb-3">
          <div className="field-label !mb-1">{t('Freeform gradient presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Freeform Gradient preset actions')}
            aria-describedby="freeform-gradient-preset-review-status"
            title={t('Use arrow keys to review freeform gradient presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="freeform-gradient-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Freeform gradient presets')}`}
            </div>
            {GRADIENT_PRESETS.map((preset) => {
              const active = activePreset === preset.label;
              const review = `${t(preset.label)}: ${t(preset.title)} ${preset.width}×${preset.height}, ${preset.stops.length} ${t('stops')}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-freeform-gradient-preset-action
                  data-freeform-gradient-preset-index={GRADIENT_PRESETS.indexOf(preset)}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => applyPreset(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={review}
                >
                  {t(preset.label)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1 max-h-56 overflow-auto pr-1">
          {stops.map((stop, index) => (
            <div key={index} className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-1 items-center">
              <input type="color" value={stop.color} onChange={(e) => updateStop(index, { color: e.target.value })} className="w-7 h-7 rounded border border-border bg-panel2" aria-label={`${t('Stop')} ${index + 1}`} />
              <input type="number" className="input-num" min={0} max={1} step={0.05} value={stop.x} onChange={(e) => updateStop(index, { x: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })} aria-label="X" />
              <input type="number" className="input-num" min={0} max={1} step={0.05} value={stop.y} onChange={(e) => updateStop(index, { y: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })} aria-label="Y" />
              <input type="number" className="input-num" min={0.05} max={2} step={0.05} value={stop.radius} onChange={(e) => updateStop(index, { radius: Math.max(0.05, parseFloat(e.target.value) || 0.5) })} aria-label={t('Radius')} />
              <button type="button" className="btn p-1" disabled={stops.length <= 2} onClick={() => setStops(stops.filter((_, i) => i !== index))} aria-label={t('Remove stop')}><Trash2 size={12} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn mt-2 flex items-center gap-1" onClick={() => setStops([...stops, { x: 0.5, y: 0.5, color: '#ffffff', radius: 0.5 }])}><Plus size={12} aria-hidden="true" /> {t('Add stop')}</button>
        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Freeform Gradient actions')}
          aria-describedby="freeform-gradient-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="freeform-gradient-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Freeform Gradient actions')}`}
          </span>
          <button type="button" data-freeform-gradient-action data-freeform-gradient-action-review={t('Cancel')} onFocus={() => setReviewedFooterAction(t('Cancel'))} className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" data-freeform-gradient-action data-freeform-gradient-action-review={t('Create')} onFocus={() => setReviewedFooterAction(t('Create'))} className="btn-primary" onClick={() => { void apply(); }}>{t('Create')}</button>
        </div>
      </div>
    </div>
  );
}

function stopsEqual(a: FreeformGradientStop[], b: FreeformGradientStop[]) {
  return a.length === b.length && a.every((stop, index) => {
    const other = b[index];
    return other && Math.abs(stop.x - other.x) < 0.001 && Math.abs(stop.y - other.y) < 0.001 && Math.abs(stop.radius - other.radius) < 0.001 && stop.color.toLowerCase() === other.color.toLowerCase();
  });
}
