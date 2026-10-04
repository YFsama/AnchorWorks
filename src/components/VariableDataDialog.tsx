import { useCallback, useState } from 'react';
import { X, Hash, FileText, Table2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import {
  applyDataMerge,
  buildSerialValues,
  dedupeVariableListValues,
  estimateVariableDataGaps,
  generateVariableData,
  parseCsv,
  parseVariableListValues,
  planDataMerge,
  previewVariableDataValues,
  resolveDataMergeTargets,
  type DataMergeBinding,
  type VariableDataFillOrder,
  reverseVariableListValues,
  sortVariableListValues,
  summarizeVariableDataGrid,
} from '../lib/variableData';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, makeSegmentKeys } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';


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

  const [mode, setMode] = useState<'number' | 'list' | 'csv'>('number');
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
  // CSV data-merge state: pasted/loaded CSV text, header flag, and the
  // column → object-name binding rows.
  const [csvText, setCsvText] = useState('');
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [csvTargets, setCsvTargets] = useState<Record<string, string>>({});
  const [reviewedTokenChip, setReviewedTokenChip] = useState('');
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
  // CSV mode: parse on the fly and derive the column → object-name bindings
  // (a binding row only counts once its target name is non-empty).
  const csv = mode === 'csv' ? parseCsv(csvText, csvHasHeader) : null;
  const csvBindings: DataMergeBinding[] = (csv?.columns ?? [])
    .map(column => ({ column, target: (csvTargets[column] ?? '').trim() }))
    .filter(binding => binding.target !== '');
  const activeValues = mode === 'number'
    ? buildSerialValues(start, step, count, pad)
    : mode === 'list'
      ? listValues
      : (csv?.records ?? []).map(record => Object.values(record).filter(Boolean).join(' '));
  const preview = previewVariableDataValues(activeValues);
  const gridSummary = summarizeVariableDataGrid(preview.total, cols);
  const previewSample = preview.values.slice(0, 3).join(', ');
  const modeLabel = mode === 'number' ? t('Numbers') : mode === 'list' ? t('List') : t('CSV');
  const previewStatus = preview.total > 0
    ? `${t('Generation preview')}: ${modeLabel}. ${preview.total} ${t('values')}. ${t('Grid')}: ${gridSummary.rows} × ${gridSummary.cols}. ${previewSample}`
    : `${t('Generation preview')}: ${t('No values to preview')}`;

  // Live preview of the FIRST record: resolve the binding target names
  // against the canvas text objects and run them through the real planner.
  let firstRecordMissing: string[] = [];
  let firstRecordLines: Array<{ column: string; target: string; resolved: boolean; missing: boolean; text: string }> = [];
  if (csv && csv.records.length > 0 && csvBindings.length > 0) {
    const namedTexts = (getCanvas()?.getObjects() ?? []).filter(o => typeof (o as { text?: unknown }).text === 'string');
    const { targets } = resolveDataMergeTargets(namedTexts, csvBindings);
    const templateTexts = targets.map(target => String((target as { text?: unknown } | null)?.text ?? ''));
    const first = planDataMerge(csv.records.slice(0, 1), csvBindings, templateTexts, { cols, gapXmm: gapX, gapYmm: gapY, fillOrder }).records[0];
    firstRecordMissing = first?.ok ? [] : (first?.missing ?? []);
    firstRecordLines = csvBindings.map((binding, i) => ({
      column: binding.column,
      target: binding.target,
      resolved: !!targets[i],
      missing: !first?.ok && !!first?.missing.includes(binding.column),
      text: first?.ok ? (first.entries[i]?.text ?? '') : '',
    }));
  }

  const describeSerialPreset = (preset: (typeof SERIAL_PRESETS)[number]) => (
    `${t(preset.label)} · ${t('Start')} ${preset.start}, ${t('Step')} ${preset.step}, ${t('Count')} ${preset.count}, ${t('Pad')} ${preset.pad}, ${t('Columns')} ${preset.cols}`
  );

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    if (mode === 'csv') {
      if (!csv || csv.records.length === 0) { toast.warn(t('No values to generate.'), { title: t('Variable Data') }); return; }
      if (csvBindings.length === 0) { toast.warn(t('Bind at least one column to a named text object.'), { title: t('Variable Data') }); return; }
      const outcome = await applyDataMerge(csv.records, csvBindings, { cols, gapXmm: gapX, gapYmm: gapY, fillOrder });
      if (outcome.unmatched.length > 0) {
        toast.warn(`${t('No object named')} ${outcome.unmatched.join(', ')}`, { title: t('Variable Data') });
      }
      if (outcome.generated > 0) {
        toast.success(`${outcome.generated} ${t('records merged')}${outcome.skipped > 0 ? ` · ${outcome.skipped} ${t('records skipped (missing columns)')}` : ''}`, { title: t('Variable Data') });
        close();
      } else {
        toast.warn(t('No records merged.'), { title: t('Variable Data') });
      }
      return;
    }
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

  /** Load a .csv / .txt file into the paste box (read as UTF-8 text). */
  const onCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    event.target.value = '';
  };

  /** Copy a column's {{token}} so it can be pasted into the template text. */
  const copyToken = async (column: string) => {
    try {
      await navigator.clipboard.writeText(`{{${column}}}`);
      toast.success(t('Token copied to clipboard'));
    } catch {
      toast.warn(t('Clipboard unavailable.'));
    }
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

  // Roving keyboard conventions live in ui/useRovingActions; the toolbars are
  // the shared PresetRow / ReviewedFooter kit. The two tablists use the
  // segment variant (Seg carries data-value). The layout toolbar keeps its
  // hand-rolled container on purpose: it has no aria-describedby today and
  // publishes into the list toolbar's shared review region, which only exists
  // in list mode — an ActionToolbar would add a dangling describedby.
  const handleModeKeys = makeSegmentKeys({
    values: ['number', 'list', 'csv'] as const,
    current: mode,
    apply: setMode,
  });
  const handleFillOrderKeys = makeSegmentKeys({
    values: ['rows', 'columns'] as const,
    current: fillOrder,
    apply: setFillOrder,
  });
  const handleTokenChipKeys = makeRovingKeys({
    selector: '[data-variable-data-token]',
    wrap: true,
    guardEmpty: true,
    setReview: setReviewedTokenChip,
  });
  const handleColumnPresetKeys = makeRovingKeys({
    selector: '[data-variable-data-column-preset]',
    wrap: true,
    skipDisabled: true,
    guardEmpty: true,
    onNavigate: (button) => {
      const preset = Number(button?.dataset.variableDataColumnPreset);
      if (Number.isFinite(preset)) setCols(Math.max(1, Math.min(50, preset)));
    },
    setReview: setReviewedColumnPreset,
  });
  const handleLayoutActionKeys = makeRovingKeys({
    selector: '[data-variable-data-layout-action]',
    wrap: true,
    skipDisabled: true,
    guardEmpty: true,
    reviewKey: actionReviewKey('data-variable-data-list-action'),
    fallbackToText: true,
    setReview: setReviewedListAction,
  });
  const handleSerialPresetKeys = makeRovingKeys({
    selector: '[data-variable-data-preset]',
    wrap: true,
    onNavigate: (button) => {
      const preset = SERIAL_PRESETS.find((item) => item.id === button?.dataset.variableDataPreset);
      if (preset) applySerialPreset(preset);
    },
    setReview: setReviewedSerialPreset,
  });
  const handleListActionKeys = makeRovingKeys({
    selector: '[data-variable-data-list-action]',
    wrap: true,
    skipDisabled: true,
    guardEmpty: true,
    reviewKey: actionReviewKey('data-variable-data-list-action'),
    fallbackToText: true,
    setReview: setReviewedListAction,
  });
  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-variable-data-action]',
    reviewKey: actionReviewKey('data-variable-data-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const getListValues = () => listValues;

  const cleanListValues = () => setListText(getListValues().join('\n'));

  const dedupeListValues = () => setListText(dedupeVariableListValues(getListValues()).join('\n'));

  const sortListValues = () => setListText(sortVariableListValues(getListValues()).join('\n'));

  const reverseListValues = () => setListText(reverseVariableListValues(getListValues()).join('\n'));

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
          {mode === 'csv'
            ? t('Bind CSV columns to named text objects (Rename Selection…). Use {{Column}} tokens in the text; a "#" run still substitutes.')
            : t('Duplicate the selected text. A "#" run is the slot (e.g. No. ###); otherwise the whole text is replaced.')}
        </p>

        <Field label={t('Source')}>
          <div
            className="flex gap-1"
            role="tablist"
            aria-label={t('Variable Data modes')}
            title={t('Use arrow keys to switch modes')}
            onKeyDown={handleModeKeys}
          >
            <Seg id="variable-mode-number" value="number" active={mode === 'number'} onClick={() => setMode('number')} label={t('Numbers')} />
            <Seg id="variable-mode-list" value="list" active={mode === 'list'} onClick={() => setMode('list')} label={t('List')} />
            <Seg id="variable-mode-csv" value="csv" active={mode === 'csv'} onClick={() => setMode('csv')} label={t('CSV')} />
          </div>
        </Field>

        {mode === 'csv' ? (
          <>
            <Field label={t('CSV data (paste or load a file)')}>
              <textarea
                className="input-num h-16 resize-none font-mono text-[11px]"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'Name,Room\n"Alice Chen",101\n"Bob Li",102'}
                aria-describedby="variable-data-csv-summary"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px]">
              <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={csvHasHeader}
                  onChange={(e) => setCsvHasHeader(e.target.checked)}
                />
                {t('First row is header')}
              </label>
              <label className="btn !py-1 !px-2 !text-[10px] cursor-pointer inline-flex items-center gap-1">
                <FileText size={11} aria-hidden="true" />
                {t('Load CSV file…')}
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => { void onCsvFile(e); }}
                />
              </label>
              <span id="variable-data-csv-summary" className="text-muted tabular-nums" aria-live="polite">
                {csv && csv.records.length > 0
                  ? `${csv.records.length} ${t('records')} · ${csv.columns.length} ${t('columns')}`
                  : t('No CSV data yet.')}
              </span>
            </div>

            {/* Column → named-object binding rows + {{token}} chips. */}
            <div className="mb-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted flex items-center gap-1">
                <Table2 size={10} aria-hidden="true" />
                {t('Columns → named objects')}
              </div>
              <PresetRow
                statusId="variable-data-token-review-status"
                className="flex flex-wrap gap-1 mb-1.5"
                label={t('Column token chips')}
                title={t('Use arrow keys to review token chips')}
                onKeyDown={handleTokenChipKeys}
                statusAs="span"
                reviewingLabel={t('Reviewing')}
                reviewed={reviewedTokenChip}
                fallback={t('Column token chips')}
                setReviewed={setReviewedTokenChip}
                items={(csv?.columns ?? []).map((column) => ({
                  key: column,
                  children: `{{${column}}}`,
                  className: 'btn !py-0.5 !px-1.5 !text-[10px] font-mono',
                  onClick: () => { void copyToken(column); },
                  title: `${t('Copy the {{token}} for this column to the clipboard.')} — {{${column}}}`,
                  data: { 'variable-data-token': column, review: `${t('Insert token')} {{${column}}}` },
                }))}
              />
              {(csv?.columns ?? []).map((column) => (
                <div key={column} className="flex items-center gap-1 mb-1">
                  <span className="font-mono text-[10px] text-muted w-24 shrink-0 truncate" title={column}>{column}</span>
                  <input
                    className="input-num flex-1 !py-1 !text-[11px]"
                    value={csvTargets[column] ?? ''}
                    onChange={(e) => setCsvTargets({ ...csvTargets, [column]: e.target.value })}
                    placeholder={t('Object name')}
                    aria-label={`${t('Bind to object name')} — ${column}`}
                  />
                </div>
              ))}
              {(!csv || csv.columns.length === 0) && (
                <div className="text-[10px] text-muted">{t('No CSV data yet.')}</div>
              )}
            </div>

            {/* Live preview of the first record through the real planner. */}
            {firstRecordLines.length > 0 && (
              <div className="mb-2 rounded-md border border-border bg-panel2/60 p-2" role="status" aria-live="polite" aria-label={t('Live preview (first record)')}>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{t('Live preview (first record)')}</div>
                {firstRecordLines.map((line, index) => (
                  <div key={`${line.column}-${index}`} className="flex items-baseline gap-1 text-[10px] leading-relaxed">
                    <span className="font-mono text-muted shrink-0">{line.target}</span>
                    <span aria-hidden="true">→</span>
                    <span className={line.resolved && !line.missing ? 'text-ink' : 'text-warning'}>
                      {line.resolved ? (line.text || '—') : t('No object with this name')}
                    </span>
                  </div>
                ))}
                {firstRecordMissing.length > 0 && (
                  <div className="mt-1 text-[10px] text-warning">
                    {t('Missing columns')}: {firstRecordMissing.join(', ')}
                  </div>
                )}
              </div>
            )}
          </>
        ) : mode === 'number' ? (
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
              <PresetRow
                statusId="variable-data-serial-preset-review-status"
                className="grid grid-cols-4 gap-1"
                label={t('Variable Data serial presets')}
                title={t('Use arrow keys to review serial presets')}
                onKeyDown={handleSerialPresetKeys}
                statusAs="span"
                reviewingLabel={t('Reviewing')}
                reviewed={reviewedSerialPreset}
                fallback={t('Serial presets')}
                setReviewed={setReviewedSerialPreset}
                items={SERIAL_PRESETS.map((preset) => {
                  const active = start === preset.start && step === preset.step && count === preset.count && pad === preset.pad && cols === preset.cols;
                  return {
                    key: preset.id,
                    children: t(preset.label),
                    className: `btn !py-1 !px-1.5 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`,
                    pressed: active,
                    onClick: () => applySerialPreset(preset),
                    title: `${t(preset.label)} · ${t('Start')} ${preset.start}, ${t('Step')} ${preset.step}, ${t('Count')} ${preset.count}, ${t('Pad')} ${preset.pad}`,
                    data: { 'variable-data-preset': preset.id, review: describeSerialPreset(preset) },
                  };
                })}
              />
            </div>
          </>
        ) : (
          <>
            <Field label={t('Values (one per line or comma-separated)')}>
              <textarea className="input-num h-24 resize-none font-mono text-[11px]" value={listText} onChange={(e) => setListText(e.target.value)} />
            </Field>
            <PresetRow
              statusId="variable-data-list-action-review-status"
              className="grid grid-cols-3 gap-1 mt-1 mb-2"
              label={t('Variable Data list actions')}
              title={t('Use arrow keys to review list actions')}
              onKeyDown={handleListActionKeys}
              statusAs="span"
              reviewingLabel={t('Reviewing')}
              reviewed={reviewedListAction}
              fallback={t('Variable Data list actions')}
              actionAttr="data-variable-data-list-action"
              setReviewed={setReviewedListAction}
              items={[
                { key: 'sample', children: t('Sample list'), className: 'btn !py-1 !px-1.5 !text-[10px]', onClick: () => setListText(SAMPLE_LIST_VALUES.join('\n')), data: { 'variable-data-list-action-review': t('Sample list') }, focusReviewKey: 'variableDataListActionReview' },
                { key: 'clean', children: t('Clean list'), className: 'btn !py-1 !px-1.5 !text-[10px]', disabled: !listText.trim(), onClick: cleanListValues, data: { 'variable-data-list-action-review': t('Clean list') }, focusReviewKey: 'variableDataListActionReview' },
                { key: 'dedupe', children: t('Dedupe'), className: 'btn !py-1 !px-1.5 !text-[10px]', disabled: !listText.trim(), onClick: dedupeListValues, data: { 'variable-data-list-action-review': t('Dedupe') }, focusReviewKey: 'variableDataListActionReview' },
                { key: 'sort', children: t('Sort A-Z'), className: 'btn !py-1 !px-1.5 !text-[10px]', disabled: !listText.trim(), onClick: sortListValues, data: { 'variable-data-list-action-review': t('Sort A-Z') }, focusReviewKey: 'variableDataListActionReview' },
                { key: 'reverse', children: t('Reverse'), className: 'btn !py-1 !px-1.5 !text-[10px]', disabled: !listText.trim(), onClick: reverseListValues, data: { 'variable-data-list-action-review': t('Reverse') }, focusReviewKey: 'variableDataListActionReview' },
                { key: 'clear', children: t('Clear list'), className: 'btn !py-1 !px-1.5 !text-[10px]', disabled: !listText.trim(), onClick: () => setListText(''), data: { 'variable-data-list-action-review': t('Clear list') }, focusReviewKey: 'variableDataListActionReview' },
              ]}
            />
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
            <PresetRow
              statusId="variable-data-column-preset-review-status"
              className="mt-1 grid grid-cols-5 gap-1"
              label={t('Variable Data column presets')}
              title={t('Use arrow keys to review column presets')}
              onKeyDown={handleColumnPresetKeys}
              statusAs="span"
              reviewingLabel={t('Reviewing')}
              reviewed={reviewedColumnPreset}
              fallback={t('Variable Data column presets')}
              setReviewed={setReviewedColumnPreset}
              items={COLUMN_PRESETS.map((preset) => ({
                key: preset,
                children: preset,
                className: `btn !py-0.5 !px-1 !text-[10px] ${cols === preset ? 'ring-1 ring-accent' : ''}`,
                pressed: cols === preset,
                onClick: () => setCols(preset),
                data: { 'variable-data-column-preset': preset, review: `${t('Columns')} ${preset}` },
              }))}
            />
          </Field>
          <Field label={t('Fill order')}>
            <div
              className="flex gap-1"
              role="tablist"
              aria-label={t('Variable Data fill order')}
              title={t('Use arrow keys to switch fill order')}
              onKeyDown={handleFillOrderKeys}
            >
              <Seg id="variable-fill-rows" value="rows" active={fillOrder === 'rows'} onClick={() => setFillOrder('rows')} label={t('Rows')} />
              <Seg id="variable-fill-columns" value="columns" active={fillOrder === 'columns'} onClick={() => setFillOrder('columns')} label={t('Columns short')} />
            </div>
          </Field>
          <GapField axis="X" value={gapX} linked={linkGaps} reviewedPreset={reviewedGapXPreset} onChange={(value) => setGapValue('X', value)} setReviewedPreset={setReviewedGapXPreset} />
          <GapField axis="Y" value={gapY} linked={linkGaps} reviewedPreset={reviewedGapYPreset} onChange={(value) => setGapValue('Y', value)} setReviewedPreset={setReviewedGapYPreset} />
        </div>

        <ReviewedFooter
          statusId="variable-data-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Variable Data actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Variable Data actions')}
          actionAttr="data-variable-data-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Generate'), review: t('Generate'), className: 'btn-primary', onClick: () => { void apply(); } },
          ]}
        />
      </div>
    </div>
  );
}

function GapField({ axis, value, linked, reviewedPreset, onChange, setReviewedPreset }: { axis: 'X' | 'Y'; value: number; linked: boolean; reviewedPreset: string; onChange: (value: number) => void; setReviewedPreset: (review: string) => void }) {
  const t = useT();
  const reviewId = `variable-data-gap-${axis.toLowerCase()}-preset-review-status`;
  // Each axis renders its own roving handler, but preset application still
  // funnels through the dialog's onChange (setGapValue), so the linked X↔Y
  // coupling keeps living in exactly one place. data-review carries the same
  // "Gap X 40 mm[ · Link gaps]" text the legacy handler computed on the fly.
  const handlePresetKeys = makeRovingKeys({
    selector: '[data-variable-data-gap-preset]',
    wrap: true,
    skipDisabled: true,
    guardEmpty: true,
    onNavigate: (button) => {
      const preset = Number(button?.dataset.variableDataGapPreset);
      if (Number.isFinite(preset)) onChange(preset);
    },
    setReview: setReviewedPreset,
  });
  const reviewFor = (preset: number) => `${t('Gap')} ${axis} ${preset} mm${linked ? ` · ${t('Link gaps')}` : ''}`;
  return (
    <Field label={`${t('Gap')} ${axis} (mm)`}>
      <input type="number" className="input-num" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
      <PresetRow
        statusId={reviewId}
        className="mt-1 grid grid-cols-5 gap-1"
        label={t(`Variable Data gap ${axis} presets`)}
        title={linked ? t('Linked gaps: presets update both axes') : t('Use arrow keys to review gap presets')}
        onKeyDown={handlePresetKeys}
        statusAs="span"
        reviewingLabel={t('Reviewing')}
        reviewed={reviewedPreset}
        fallback={t(`Variable Data gap ${axis} presets`)}
        setReviewed={setReviewedPreset}
        items={GAP_PRESETS.map((preset) => ({
          key: preset,
          children: preset,
          className: `btn !py-0.5 !px-1 !text-[10px] ${value === preset ? 'ring-1 ring-accent' : ''}`,
          pressed: value === preset,
          onClick: () => onChange(preset),
          data: { 'variable-data-gap-preset': preset, 'variable-data-gap-axis': axis, review: reviewFor(preset) },
        }))}
      />
    </Field>
  );
}

function Seg({ id, value, active, onClick, label }: { id: string; value: string; active: boolean; onClick: () => void; label: string }) {
  return (
    <button id={id} type="button" role="tab" onClick={onClick} aria-selected={active} data-value={value}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'}`}>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
