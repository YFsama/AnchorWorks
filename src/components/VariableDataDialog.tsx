import { useCallback, useState } from 'react';
import { X, Hash } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import {
  buildSerialValues,
  dedupeVariableListValues,
  estimateVariableDataGaps,
  generateVariableData,
  parseVariableListValues,
  previewVariableDataValues,
  type VariableDataFillOrder,
  reverseVariableListValues,
  sortVariableListValues,
  summarizeVariableDataGrid,
} from '../lib/variableData';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';


const SERIAL_PRESETS = [
  { id: 'badges-10', label: 'Badges 10', start: 1, step: 1, count: 10, pad: 2, cols: 5 },
  { id: 'badges-50', label: 'Badges 50', start: 1, step: 1, count: 50, pad: 3, cols: 5 },
  { id: 'odds-25', label: 'Odd 25', start: 1, step: 2, count: 25, pad: 2, cols: 5 },
  { id: 'tickets-100', label: 'Tickets 100', start: 1, step: 1, count: 100, pad: 3, cols: 10 },
] as const;

const SAMPLE_LIST_VALUES = ['Alice Chen', 'Bob Li', 'Carla Smith', 'Door 104', 'Door 105'];
const COLUMN_PRESETS = [2, 3, 4, 5, 10] as const;
const GAP_PRESETS = [5, 10, 20, 40, 80] as const;

function selectedText() {
  const objs = getCanvas()?.getActiveObjects() ?? [];
  if (objs.length !== 1) return null;
  const o = objs[0];
  return (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') ? o : null;
}

/**
 * Variable Data / serial numbering — duplicate a selected text object into a
 * grid where each copy carries the next number in a sequence or the next line
 * of a custom list (SignMaster badges/numbering). A `#` run in the template is
 * the substitution slot (e.g. "No. ###"); otherwise the whole text is replaced.
 */
export function VariableDataDialog() {
  const t = useT();
  const open = useEditor(s => s.showVariableData);
  const close = useCallback(() => useEditor.getState().setModal('showVariableData', false), []);

  const [mode, setMode] = useState<'number' | 'list'>('number');
  const [start, setStart] = useState(1);
  const [step, setStep] = useState(1);
  const [count, setCount] = useState(10);
  const [pad, setPad] = useState(0);
  const [listText, setListText] = useState('');
  const [cols, setCols] = useState(5);
  const [fillOrder, setFillOrder] = useState<VariableDataFillOrder>('rows');
  const [gapX, setGapX] = useState(40);
  const [gapY, setGapY] = useState(20);
  const [linkGaps, setLinkGaps] = useState(false);
  const [reviewedSerialPreset, setReviewedSerialPreset] = useState('');
  const [reviewedColumnPreset, setReviewedColumnPreset] = useState('');
  const [reviewedGapXPreset, setReviewedGapXPreset] = useState('');
  const [reviewedGapYPreset, setReviewedGapYPreset] = useState('');
  const [reviewedListAction, setReviewedListAction] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  // Seed sensible grid gaps from the selected text's size, once per open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const o = selectedText();
      if (o) {
        const r = o.getBoundingRect();
        const gaps = estimateVariableDataGaps(r.width, r.height);
        setGapX(gaps.gapX);
        setGapY(gaps.gapY);
      }
    }
  }

  const listValues = parseVariableListValues(listText);
  const preview = previewVariableDataValues(mode === 'number' ? buildSerialValues(start, step, count, pad) : listValues);
  const gridSummary = summarizeVariableDataGrid(preview.total, cols);
  const previewSample = preview.values.slice(0, 3).join(', ');
  const previewStatus = preview.total > 0
    ? `${t('Generation preview')}: ${mode === 'number' ? t('Numbers') : t('List')}. ${preview.total} ${t('values')}. ${t('Grid')}: ${gridSummary.rows} × ${gridSummary.cols}. ${previewSample}`
    : `${t('Generation preview')}: ${t('No values to preview')}`;

  const describeSerialPreset = (preset: (typeof SERIAL_PRESETS)[number]) => (
    `${t(preset.label)} · ${t('Start')} ${preset.start}, ${t('Step')} ${preset.step}, ${t('Count')} ${preset.count}, ${t('Pad')} ${preset.pad}, ${t('Columns')} ${preset.cols}`
  );

  const reviewGapPreset = (axis: 'X' | 'Y', value: number) => {
    const review = `${t('Gap')} ${axis} ${value} mm${linkGaps ? ` · ${t('Link gaps')}` : ''}`;
    if (axis === 'X') setReviewedGapXPreset(review);
    else setReviewedGapYPreset(review);
  };

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    const o = selectedText();
    if (!o) { toast.warn(t('Select a single text object to enable'), { title: t('Variable Data') }); return; }
    const values = mode === 'number'
      ? buildSerialValues(start, step, count, pad)
      : listValues;
    if (values.length === 0) { toast.warn(t('No values to generate.'), { title: t('Variable Data') }); return; }
    const n = await generateVariableData(o, values, cols, gapX, gapY, fillOrder);
    toast.success(`${n} ${t('copies generated')}`, { title: t('Variable Data') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-variable-data-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.variableDataActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const focusMode = (nextMode: typeof mode) => {
    setMode(nextMode);
    requestAnimationFrame(() => document.getElementById(`variable-mode-${nextMode}`)?.focus());
  };

  const handleModeKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const modes: Array<typeof mode> = ['number', 'list'];
    const index = modes.indexOf(mode);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? modes.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + modes.length) % modes.length;
    focusMode(modes[nextIndex]);
  };

  const focusFillOrder = (nextOrder: VariableDataFillOrder) => {
    setFillOrder(nextOrder);
    requestAnimationFrame(() => document.getElementById(`variable-fill-${nextOrder}`)?.focus());
  };

  const handleFillOrderKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const orders: VariableDataFillOrder[] = ['rows', 'columns'];
    const index = orders.indexOf(fillOrder);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? orders.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + orders.length) % orders.length;
    focusFillOrder(orders[nextIndex]);
  };

  const handleColumnPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const presets = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-variable-data-column-preset]'))
      .filter((button) => !button.disabled);
    if (presets.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, presets.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? presets.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + presets.length) % presets.length;
    const nextPreset = Number(presets[nextIndex]?.dataset.variableDataColumnPreset);
    if (Number.isFinite(nextPreset)) {
      setCols(Math.max(1, Math.min(50, nextPreset)));
      setReviewedColumnPreset(`${t('Columns')} ${nextPreset}`);
    }
    presets[nextIndex]?.focus();
  };

  const handleGapPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const presets = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-variable-data-gap-preset]'))
      .filter((button) => !button.disabled);
    if (presets.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, presets.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? presets.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + presets.length) % presets.length;
    const nextPreset = Number(presets[nextIndex]?.dataset.variableDataGapPreset);
    if (Number.isFinite(nextPreset)) {
      const axis = presets[nextIndex]?.dataset.variableDataGapAxis === 'Y' ? 'Y' : 'X';
      setGapValue(axis, nextPreset);
      reviewGapPreset(axis, nextPreset);
    }
    presets[nextIndex]?.focus();
  };

  const handleLayoutActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-variable-data-layout-action]'))
      .filter((button) => !button.disabled);
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + actions.length) % actions.length;
    const nextAction = actions[nextIndex];
    setReviewedListAction(nextAction?.dataset.variableDataListActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const setGapValue = (axis: 'X' | 'Y', value: number) => {
    if (axis === 'X') setGapX(value);
    else setGapY(value);
    if (linkGaps) {
      if (axis === 'X') setGapY(value);
      else setGapX(value);
    }
  };

  const applyAutoGap = () => {
    const o = selectedText();
    if (!o) {
      toast.warn(t('Select a single text object to enable'), { title: t('Variable Data') });
      return;
    }
    const r = o.getBoundingRect();
    const gaps = estimateVariableDataGaps(r.width, r.height);
    setGapX(gaps.gapX);
    setGapY(gaps.gapY);
  };

  const applySerialPreset = (preset: (typeof SERIAL_PRESETS)[number]) => {
    setMode('number');
    setStart(preset.start);
    setStep(preset.step);
    setCount(preset.count);
    setPad(preset.pad);
    setCols(preset.cols);
  };

  const handleSerialPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const presets = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-variable-data-preset]'));
    const activeIndex = Math.max(0, presets.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? presets.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + presets.length) % presets.length;
    const nextPresetId = presets[nextIndex]?.dataset.variableDataPreset;
    const nextPreset = SERIAL_PRESETS.find((preset) => preset.id === nextPresetId);
    if (nextPreset) {
      applySerialPreset(nextPreset);
      setReviewedSerialPreset(describeSerialPreset(nextPreset));
    }
    presets[nextIndex]?.focus();
  };

  const getListValues = () => listValues;

  const cleanListValues = () => setListText(getListValues().join('\n'));

  const dedupeListValues = () => setListText(dedupeVariableListValues(getListValues()).join('\n'));

  const sortListValues = () => setListText(sortVariableListValues(getListValues()).join('\n'));

  const reverseListValues = () => setListText(reverseVariableListValues(getListValues()).join('\n'));

  const handleListActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-variable-data-list-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + actions.length) % actions.length;
    const nextAction = actions[nextIndex];
    setReviewedListAction(nextAction?.dataset.variableDataListActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vardata-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[380px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="vardata-title" className="dialog-title flex items-center gap-2">
            <Hash size={14} aria-hidden="true" /> {t('Variable Data')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <p className="text-[10px] text-muted mb-2 leading-relaxed">
          {t('Duplicate the selected text. A "#" run is the slot (e.g. No. ###); otherwise the whole text is replaced.')}
        </p>

        <Field label={t('Source')}>
          <div
            className="flex gap-1"
            role="tablist"
            aria-label={t('Variable Data modes')}
            title={t('Use arrow keys to switch modes')}
            onKeyDown={handleModeKeys}
          >
            <Seg id="variable-mode-number" active={mode === 'number'} onClick={() => setMode('number')} label={t('Numbers')} />
            <Seg id="variable-mode-list" active={mode === 'list'} onClick={() => setMode('list')} label={t('List')} />
          </div>
        </Field>

        {mode === 'number' ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Field label={t('Start')}>
                <input type="number" className="input-num" value={start} onChange={(e) => setStart(parseInt(e.target.value, 10) || 0)} />
              </Field>
              <Field label={t('Step')}>
                <input type="number" className="input-num" value={step} onChange={(e) => setStep(parseInt(e.target.value, 10) || 1)} />
              </Field>
              <Field label={t('Count')}>
                <input type="number" min={1} max={2000} className="input-num" value={count} onChange={(e) => setCount(Math.max(1, Math.min(2000, parseInt(e.target.value, 10) || 1)))} />
              </Field>
              <Field label={t('Pad')}>
                <input type="number" min={0} max={8} className="input-num" value={pad} onChange={(e) => setPad(Math.max(0, Math.min(8, parseInt(e.target.value, 10) || 0)))} />
              </Field>
            </div>
            <div className="mt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{t('Serial presets')}</div>
              <div
                className="grid grid-cols-4 gap-1"
                role="toolbar"
                aria-label={t('Variable Data serial presets')}
                aria-describedby="variable-data-serial-preset-review-status"
                title={t('Use arrow keys to review serial presets')}
                onKeyDown={handleSerialPresetKeys}
              >
                <span id="variable-data-serial-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedSerialPreset || t('Serial presets')}`}
                </span>
                {SERIAL_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-variable-data-preset={preset.id}
                    className={`btn !py-1 !px-1.5 !text-[10px] ${start === preset.start && step === preset.step && count === preset.count && pad === preset.pad && cols === preset.cols ? 'ring-1 ring-accent' : ''}`}
                    aria-pressed={start === preset.start && step === preset.step && count === preset.count && pad === preset.pad && cols === preset.cols}
                    onClick={() => applySerialPreset(preset)}
                    onFocus={() => setReviewedSerialPreset(describeSerialPreset(preset))}
                    title={`${t(preset.label)} · ${t('Start')} ${preset.start}, ${t('Step')} ${preset.step}, ${t('Count')} ${preset.count}, ${t('Pad')} ${preset.pad}`}
                  >
                    {t(preset.label)}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label={t('Values (one per line or comma-separated)')}>
              <textarea className="input-num h-24 resize-none font-mono text-[11px]" value={listText} onChange={(e) => setListText(e.target.value)} />
            </Field>
            <div
              className="grid grid-cols-3 gap-1 mt-1 mb-2"
              role="toolbar"
              aria-label={t('Variable Data list actions')}
              aria-describedby="variable-data-list-action-review-status"
              title={t('Use arrow keys to review list actions')}
              onKeyDown={handleListActionKeys}
            >
              <span id="variable-data-list-action-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedListAction || t('Variable Data list actions')}`}
              </span>
              <button type="button" data-variable-data-list-action data-variable-data-list-action-review={t('Sample list')} onFocus={() => setReviewedListAction(t('Sample list'))} className="btn !py-1 !px-1.5 !text-[10px]" onClick={() => setListText(SAMPLE_LIST_VALUES.join('\n'))}>{t('Sample list')}</button>
              <button type="button" data-variable-data-list-action data-variable-data-list-action-review={t('Clean list')} onFocus={() => setReviewedListAction(t('Clean list'))} className="btn !py-1 !px-1.5 !text-[10px]" disabled={!listText.trim()} onClick={cleanListValues}>{t('Clean list')}</button>
              <button type="button" data-variable-data-list-action data-variable-data-list-action-review={t('Dedupe')} onFocus={() => setReviewedListAction(t('Dedupe'))} className="btn !py-1 !px-1.5 !text-[10px]" disabled={!listText.trim()} onClick={dedupeListValues}>{t('Dedupe')}</button>
              <button type="button" data-variable-data-list-action data-variable-data-list-action-review={t('Sort A-Z')} onFocus={() => setReviewedListAction(t('Sort A-Z'))} className="btn !py-1 !px-1.5 !text-[10px]" disabled={!listText.trim()} onClick={sortListValues}>{t('Sort A-Z')}</button>
              <button type="button" data-variable-data-list-action data-variable-data-list-action-review={t('Reverse')} onFocus={() => setReviewedListAction(t('Reverse'))} className="btn !py-1 !px-1.5 !text-[10px]" disabled={!listText.trim()} onClick={reverseListValues}>{t('Reverse')}</button>
              <button type="button" data-variable-data-list-action data-variable-data-list-action-review={t('Clear list')} onFocus={() => setReviewedListAction(t('Clear list'))} className="btn !py-1 !px-1.5 !text-[10px]" disabled={!listText.trim()} onClick={() => setListText('')}>{t('Clear list')}</button>
            </div>
          </>
        )}

        <div className="mt-2 rounded-md border border-border bg-panel2/60 p-2" role="status" aria-live="polite" aria-atomic="true" aria-label={previewStatus}>
          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted">
            <span>{t('Generation preview')}</span>
            <span>{preview.total} {t('values')}</span>
          </div>
          <div className="mt-1 text-[10px] text-muted">
            {t('Grid')}: {gridSummary.rows} × {gridSummary.cols} · {gridSummary.cells} {t('cells')}
          </div>
          {preview.values.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {preview.values.map((value, index) => (
                <span key={`${value}-${index}`} className="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink">{value}</span>
              ))}
              {preview.hidden > 0 && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">+{preview.hidden}</span>}
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-muted">{t('No values to preview')}</div>
          )}
        </div>

        <div
          className="mt-2 flex justify-end gap-1"
          role="toolbar"
          aria-label={t('Variable Data layout actions')}
          title={t('Use arrow keys to review layout actions')}
          onKeyDown={handleLayoutActionKeys}
        >
          <button
            type="button"
            data-variable-data-layout-action
            className="btn !py-1 !px-2 !text-[10px]"
            onClick={applyAutoGap}
          >
            {t('Auto gap')}
          </button>
          <button
            type="button"
            data-variable-data-layout-action
            className={`btn !py-1 !px-2 !text-[10px] ${linkGaps ? 'ring-1 ring-accent' : ''}`}
            aria-pressed={linkGaps}
            onClick={() => setLinkGaps((enabled) => !enabled)}
          >
            {t('Link gaps')}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-1">
          <Field label={t('Columns')}>
            <input type="number" min={1} max={50} className="input-num" value={cols} onChange={(e) => setCols(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))} />
            <div
              className="mt-1 grid grid-cols-5 gap-1"
              role="toolbar"
              aria-label={t('Variable Data column presets')}
              aria-describedby="variable-data-column-preset-review-status"
              title={t('Use arrow keys to review column presets')}
              onKeyDown={handleColumnPresetKeys}
            >
              <span id="variable-data-column-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedColumnPreset || t('Variable Data column presets')}`}
              </span>
              {COLUMN_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-variable-data-column-preset={preset}
                  className={`btn !py-0.5 !px-1 !text-[10px] ${cols === preset ? 'ring-1 ring-accent' : ''}`}
                  aria-pressed={cols === preset}
                  onClick={() => setCols(preset)}
                  onFocus={() => setReviewedColumnPreset(`${t('Columns')} ${preset}`)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('Fill order')}>
            <div
              className="flex gap-1"
              role="tablist"
              aria-label={t('Variable Data fill order')}
              title={t('Use arrow keys to switch fill order')}
              onKeyDown={handleFillOrderKeys}
            >
              <Seg id="variable-fill-rows" active={fillOrder === 'rows'} onClick={() => setFillOrder('rows')} label={t('Rows')} />
              <Seg id="variable-fill-columns" active={fillOrder === 'columns'} onClick={() => setFillOrder('columns')} label={t('Columns short')} />
            </div>
          </Field>
          <GapField axis="X" value={gapX} linked={linkGaps} reviewedPreset={reviewedGapXPreset} onReview={reviewGapPreset} onChange={(value) => setGapValue('X', value)} onPresetKeys={handleGapPresetKeys} />
          <GapField axis="Y" value={gapY} linked={linkGaps} reviewedPreset={reviewedGapYPreset} onReview={reviewGapPreset} onChange={(value) => setGapValue('Y', value)} onPresetKeys={handleGapPresetKeys} />
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Variable Data actions')}
          aria-describedby="variable-data-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="variable-data-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Variable Data actions')}`}
          </span>
          <button type="button" data-variable-data-action data-variable-data-action-review={t('Cancel')} onFocus={() => setReviewedFooterAction(t('Cancel'))} className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" data-variable-data-action data-variable-data-action-review={t('Generate')} onFocus={() => setReviewedFooterAction(t('Generate'))} className="btn-primary" onClick={() => { void apply(); }}>{t('Generate')}</button>
        </div>
      </div>
    </div>
  );
}

function GapField({ axis, value, linked, reviewedPreset, onReview, onChange, onPresetKeys }: { axis: 'X' | 'Y'; value: number; linked: boolean; reviewedPreset: string; onReview: (axis: 'X' | 'Y', value: number) => void; onChange: (value: number) => void; onPresetKeys: (event: React.KeyboardEvent<HTMLDivElement>) => void }) {
  const t = useT();
  const reviewId = `variable-data-gap-${axis.toLowerCase()}-preset-review-status`;
  return (
    <Field label={`${t('Gap')} ${axis} (mm)`}>
      <input type="number" className="input-num" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
      <div
        className="mt-1 grid grid-cols-5 gap-1"
        role="toolbar"
        aria-label={t(`Variable Data gap ${axis} presets`)}
        aria-describedby={reviewId}
        title={linked ? t('Linked gaps: presets update both axes') : t('Use arrow keys to review gap presets')}
        onKeyDown={onPresetKeys}
      >
        <span id={reviewId} className="sr-only" aria-live="polite">
          {`${t('Reviewing')} ${reviewedPreset || t(`Variable Data gap ${axis} presets`)}`}
        </span>
        {GAP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            data-variable-data-gap-preset={preset}
            data-variable-data-gap-axis={axis}
            className={`btn !py-0.5 !px-1 !text-[10px] ${value === preset ? 'ring-1 ring-accent' : ''}`}
            aria-pressed={value === preset}
            onClick={() => onChange(preset)}
            onFocus={() => onReview(axis, preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Seg({ id, active, onClick, label }: { id: string; active: boolean; onClick: () => void; label: string }) {
  return (
    <button id={id} type="button" role="tab" onClick={onClick} aria-selected={active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'}`}>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
