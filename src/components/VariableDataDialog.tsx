import { useCallback, useState } from 'react';
import { X, Hash } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { buildSerialValues, generateVariableData } from '../lib/variableData';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const MM_TO_PX = 3.7795;

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
  const [gapX, setGapX] = useState(40);
  const [gapY, setGapY] = useState(20);

  // Seed sensible grid gaps from the selected text's size, once per open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const o = selectedText();
      if (o) {
        const r = o.getBoundingRect();
        setGapX(Math.max(5, Math.round(r.width / MM_TO_PX) + 10));
        setGapY(Math.max(5, Math.round(r.height / MM_TO_PX) + 10));
      }
    }
  }

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    const o = selectedText();
    if (!o) { toast.warn(t('Select a single text object to enable'), { title: t('Variable Data') }); return; }
    const values = mode === 'number'
      ? buildSerialValues(start, step, count, pad)
      : listText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (values.length === 0) { toast.warn(t('No values to generate.'), { title: t('Variable Data') }); return; }
    const n = await generateVariableData(o, values, cols, gapX, gapY);
    toast.success(`${n} ${t('copies generated')}`, { title: t('Variable Data') });
    close();
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
          <div className="flex gap-1">
            <Seg active={mode === 'number'} onClick={() => setMode('number')} label={t('Numbers')} />
            <Seg active={mode === 'list'} onClick={() => setMode('list')} label={t('List')} />
          </div>
        </Field>

        {mode === 'number' ? (
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
        ) : (
          <Field label={t('Values (one per line or comma-separated)')}>
            <textarea className="input-num h-24 resize-none font-mono text-[11px]" value={listText} onChange={(e) => setListText(e.target.value)} />
          </Field>
        )}

        <div className="grid grid-cols-3 gap-2 mt-1">
          <Field label={t('Columns')}>
            <input type="number" min={1} max={50} className="input-num" value={cols} onChange={(e) => setCols(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))} />
          </Field>
          <Field label={`${t('Gap')} X (mm)`}>
            <input type="number" className="input-num" value={gapX} onChange={(e) => setGapX(parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={`${t('Gap')} Y (mm)`}>
            <input type="number" className="input-num" value={gapY} onChange={(e) => setGapY(parseFloat(e.target.value) || 0)} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => { void apply(); }}>{t('Generate')}</button>
        </div>
      </div>
    </div>
  );
}

function Seg({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'}`}>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
