import { useCallback, useState } from 'react';
import { X, Palette, RotateCcw } from 'lucide-react';
import { useEditor } from '../store/editor';
import { collectSelectionColors, recolorSelection } from '../lib/selectionApply';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const RECOLOR_PALETTE_PRESETS: Array<{ label: string; colors: string[]; title: string }> = [
  { label: 'Vinyl primary', colors: ['#ff2b2b', '#ffd600', '#0057ff', '#111111', '#ffffff'], title: 'Map artwork to common red, yellow, blue, black, and white vinyl colors.' },
  { label: 'Monochrome sign', colors: ['#111111', '#444444', '#777777', '#bbbbbb', '#f5f5f5'], title: 'Map artwork to a neutral grayscale sign palette.' },
  { label: 'Safety decal', colors: ['#ff6a00', '#ffd400', '#111111', '#ffffff'], title: 'Map artwork to high-visibility safety decal colors.' },
  { label: 'Team colors', colors: ['#0b1f4d', '#f5c542', '#ffffff', '#c8102e'], title: 'Map artwork to navy, gold, white, and red team lettering colors.' },
];

/**
 * Recolor Artwork — remap every solid fill/stroke colour in the selection
 * through a source → target swatch table (Illustrator's Recolor Artwork). The
 * source list is harvested from the selection (groups included) when the dialog
 * opens; each row's target defaults to its source until the user changes it.
 */
export function RecolorDialog() {
  const t = useT();
  const open = useEditor(s => s.showRecolor);
  const close = useCallback(() => useEditor.getState().setModal('showRecolor', false), []);

  // Re-harvest source colours once per open transition (React's "adjust state
  // on prop change" pattern — no effect).
  const [prevOpen, setPrevOpen] = useState(open);
  const [sources, setSources] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [reviewedPalettePreset, setReviewedPalettePreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const cols = collectSelectionColors();
      setSources(cols);
      setTargets(Object.fromEntries(cols.map(c => [c, c])));
    }
  }

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const setTarget = (src: string, v: string) => setTargets(m => ({ ...m, [src]: v }));
  const resetAll = () => setTargets(Object.fromEntries(sources.map(c => [c, c])));
  const rotateTargets = () => {
    if (sources.length < 2) return;
    setTargets(Object.fromEntries(sources.map((src, index) => [src, sources[(index + 1) % sources.length]])));
  };
  const reverseTargets = () => {
    if (sources.length < 2) return;
    setTargets(Object.fromEntries(sources.map((src, index) => [src, sources[sources.length - 1 - index]])));
  };
  const grayscaleTargets = () => {
    setTargets(Object.fromEntries(sources.map((src) => [src, toGrayscaleHex(src)])));
  };

  const applyPalettePreset = (colors: string[]) => {
    setTargets(Object.fromEntries(sources.map((src, index) => [src, colors[index % colors.length]])));
  };

  const apply = () => {
    const n = recolorSelection(targets);
    if (n > 0) toast.success(`${n} ${t('paints recolored')}`, { title: t('Recolor Artwork') });
    else toast.warn(t('Nothing changed — pick different target colors.'), { title: t('Recolor Artwork') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-recolor-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.recolorActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePalettePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-recolor-palette-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const preset = RECOLOR_PALETTE_PRESETS[Number(actions[nextIndex]?.dataset.recolorPalettePresetIndex ?? -1)];
    if (preset) applyPalettePreset(preset.colors);
    requestAnimationFrame(() => {
      setReviewedPalettePreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recolor-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="recolor-title" className="dialog-title flex items-center gap-2">
            <Palette size={14} aria-hidden="true" /> {t('Recolor Artwork')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
        <div id="recolor-action-review-status" className="sr-only" aria-live="polite">
          {`${t('Reviewing')} ${reviewedFooterAction || t('Recolor Artwork actions')}`}
        </div>

        {sources.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">{t('No solid colors in the selection to recolor.')}</p>
        ) : (
          <>
            <div
              className="grid grid-cols-3 gap-1 mb-3"
              role="toolbar"
              aria-label={t('Recolor mapping actions')}
              aria-describedby="recolor-action-review-status"
              title={t('Use arrow keys to review recolor mapping actions')}
              onKeyDown={handleFooterActionKeys}
            >
              <button
                type="button"
                data-recolor-action
                data-recolor-action-review={t('Rotate map')}
                className="btn"
                onClick={rotateTargets}
                onFocus={() => setReviewedFooterAction(t('Rotate map'))}
                disabled={sources.length < 2}
              >
                {t('Rotate map')}
              </button>
              <button
                type="button"
                data-recolor-action
                data-recolor-action-review={t('Reverse map')}
                className="btn"
                onClick={reverseTargets}
                onFocus={() => setReviewedFooterAction(t('Reverse map'))}
                disabled={sources.length < 2}
              >
                {t('Reverse map')}
              </button>
              <button
                type="button"
                data-recolor-action
                data-recolor-action-review={t('Map to gray')}
                className="btn"
                onClick={grayscaleTargets}
                onFocus={() => setReviewedFooterAction(t('Map to gray'))}
              >
                {t('Map to gray')}
              </button>
            </div>
            <div className="mb-3">
              <div className="field-label !mb-1">{t('Recolor palette recipes')}</div>
              <div
                className="grid grid-cols-2 gap-1"
                role="toolbar"
                aria-label={t('Recolor palette recipe actions')}
                aria-describedby="recolor-palette-recipe-review-status"
                title={t('Use arrow keys to review recolor palette recipes')}
                onKeyDown={handlePalettePresetActionKeys}
              >
                <div id="recolor-palette-recipe-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedPalettePreset || t('Recolor palette recipes')}`}
                </div>
                {RECOLOR_PALETTE_PRESETS.map((preset) => {
                  const active = sources.every((src, index) => targets[src] === preset.colors[index % preset.colors.length]);
                  const review = `${t(preset.label)}: ${t(preset.title)} ${preset.colors.length} ${t('Color')}`;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      data-recolor-palette-preset-action
                      data-recolor-palette-preset-index={RECOLOR_PALETTE_PRESETS.indexOf(preset)}
                      data-review={review}
                      className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                      onClick={() => applyPalettePreset(preset.colors)}
                      onFocus={(event) => setReviewedPalettePreset(event.currentTarget.dataset.review ?? '')}
                      aria-pressed={active}
                      title={review}
                    >
                      {t(preset.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
              {sources.map((src) => (
              <div key={src} className="flex items-center gap-2 text-xs">
                <span className="w-5 h-5 rounded-sm border border-border shrink-0" style={{ background: src }} aria-hidden="true" />
                <span className="flex-1 font-mono text-[10px] text-muted truncate">{src}</span>
                <span aria-hidden="true" className="text-muted">→</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(targets[src] ?? '') ? targets[src] : '#000000'}
                  onChange={(e) => setTarget(src, e.target.value)}
                  className="input-num p-0.5 h-6 w-10 cursor-pointer"
                  aria-label={`${t('Recolor')} ${src}`}
                />
              </div>
              ))}
            </div>
          </>
        )}

        <div
          className="flex items-center gap-2 mt-4"
          role="toolbar"
          aria-label={t('Recolor Artwork actions')}
          aria-describedby="recolor-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <button
            type="button"
            data-recolor-action
            data-recolor-action-review={t('Reset')}
            className="btn flex items-center gap-1 !text-[11px]"
            onClick={resetAll}
            onFocus={() => setReviewedFooterAction(t('Reset'))}
            disabled={!sources.length}
          >
            <RotateCcw size={11} aria-hidden="true" /> {t('Reset')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            data-recolor-action
            data-recolor-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-recolor-action
            data-recolor-action-review={t('Apply')}
            className="btn-primary"
            onClick={apply}
            onFocus={() => setReviewedFooterAction(t('Apply'))}
            disabled={!sources.length}
          >
            {t('Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

function toGrayscaleHex(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#000000';
  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const gray = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
  const channel = gray.toString(16).padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}
