import { useCallback, useState } from 'react';
import { X, Type } from 'lucide-react';
import { useEditor } from '../store/editor';
import { addSingleLineText } from '../lib/singleLineText';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const SINGLE_LINE_PRESETS: Array<{ label: string; text: string; size: number; tracking: number; title: string }> = [
  { label: 'Engraving', text: 'ANCHOR 123', size: 48, tracking: 6, title: 'Compact engraving label for plates and tags.' },
  { label: 'Badge', text: 'MEMBER', size: 72, tracking: 10, title: 'Wide badge lettering for plaques and nameplates.' },
  { label: 'Serial', text: 'SN-001', size: 36, tracking: 4, title: 'Small serial text for asset tags and labels.' },
  { label: 'Pen plot', text: 'HELLO', size: 96, tracking: 12, title: 'Large open-stroke text for pen plotters.' },
];

export function SingleLineTextDialog() {
  const t = useT();
  const open = useEditor(s => s.showSingleLineText);
  const close = useCallback(() => useEditor.getState().setModal('showSingleLineText', false), []);
  const [text, setText] = useState('ANCHOR 123');
  const [size, setSize] = useState(72);
  const [tracking, setTracking] = useState(8);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const activePreset = SINGLE_LINE_PRESETS.find((preset) => text === preset.text && size === preset.size && tracking === preset.tracking)?.label ?? '';

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    if (addSingleLineText(text, size, tracking)) toast.success(t('Single-line text added'), { title: t('Single-line Text') });
    else toast.warn(t('Enter text first.'), { title: t('Single-line Text') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-single-line-action]')).filter((button) => !button.disabled);
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.singleLineActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-single-line-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const preset = SINGLE_LINE_PRESETS[Number(actions[nextIndex]?.dataset.singleLinePresetIndex ?? -1)];
    if (preset) applyPreset(preset);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const applyPreset = (preset: { text: string; size: number; tracking: number }) => {
    setText(preset.text);
    setSize(preset.size);
    setTracking(preset.tracking);
  };
  const resetFields = () => applyPreset(SINGLE_LINE_PRESETS[0]);
  const clearText = () => setText('');

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) close(); }} role="dialog" aria-modal="true" aria-labelledby="single-line-title">
      <div className="bg-panel border border-border rounded-lg w-[360px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="single-line-title" className="dialog-title flex items-center gap-2"><Type size={14} aria-hidden="true" /> {t('Single-line Text')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
        <label className="block mb-3">
          <div className="field-label">{t('Text')}</div>
          <input className="input-num" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><div className="field-label">{t('Size')}</div><input type="number" className="input-num" min={8} max={300} value={size} onChange={(e) => setSize(Math.max(8, parseFloat(e.target.value) || 72))} /></label>
          <label className="block"><div className="field-label">{t('Tracking')}</div><input type="number" className="input-num" min={0} max={80} value={tracking} onChange={(e) => setTracking(Math.max(0, parseFloat(e.target.value) || 0))} /></label>
        </div>
        <div className="mt-3">
          <div className="field-label !mb-1">{t('Single-line presets')}</div>
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Single-line Text preset actions')}
            aria-describedby="single-line-preset-review-status"
            title={t('Use arrow keys to review single-line text presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="single-line-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Single-line presets')}`}
            </div>
            {SINGLE_LINE_PRESETS.map((preset) => {
              const active = activePreset === preset.label;
              const review = `${t(preset.label)}: ${t(preset.title)} ${preset.text}, ${preset.size}px, ${preset.tracking} ${t('Tracking')}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-single-line-preset-action
                  data-single-line-preset-index={SINGLE_LINE_PRESETS.indexOf(preset)}
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
        <div
          className="grid grid-cols-2 gap-1 mt-3"
          role="toolbar"
          aria-label={t('Single-line Text field actions')}
          aria-describedby="single-line-field-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="single-line-field-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Single-line Text field actions')}`}
          </span>
          <button type="button" data-single-line-action data-single-line-action-review={t('Reset fields')} onFocus={() => setReviewedFooterAction(t('Reset fields'))} className="btn !py-1 !text-[10px]" onClick={resetFields}>{t('Reset fields')}</button>
          <button type="button" data-single-line-action data-single-line-action-review={t('Clear text')} onFocus={() => setReviewedFooterAction(t('Clear text'))} className="btn !py-1 !text-[10px]" onClick={clearText} disabled={!text}>{t('Clear text')}</button>
        </div>
        <p className="text-[10px] text-muted leading-relaxed mt-3">{t('Creates open stroke paths for engraving, pen plotters, and V-carve workflows.')}</p>
        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Single-line Text actions')}
          aria-describedby="single-line-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="single-line-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Single-line Text actions')}`}
          </span>
          <button type="button" data-single-line-action data-single-line-action-review={t('Cancel')} onFocus={() => setReviewedFooterAction(t('Cancel'))} className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" data-single-line-action data-single-line-action-review={t('Create')} onFocus={() => setReviewedFooterAction(t('Create'))} className="btn-primary" onClick={apply}>{t('Create')}</button>
        </div>
      </div>
    </div>
  );
}
