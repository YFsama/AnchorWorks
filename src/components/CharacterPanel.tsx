/**
 * Character panel — Illustrator-style text controls.
 *
 * Appears below the FontPicker when an i-text / textbox is selected. Wraps
 * font size, weight, style, alignment, character spacing (tracking), line
 * height (leading), case transforms, and the Text-on-Path action.
 */
import { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  TextAlignStart,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  CaseUpper,
  CaseLower,
  Type,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import { applyTextOnPath, canApplyTextOnPath } from '../lib/textPath';
import { registerSkill } from '../lib/mcp';
import { useT } from '../lib/i18n';

// Module-level guard so the AI skill is only registered once even if the
// panel mounts multiple times (e.g. during HMR or hot tab reloads).
let SET_TEXT_STYLE_REGISTERED = false;

interface TextProps {
  fontSize: number;
  fontWeight: string | number;
  fontStyle: string;
  underline: boolean;
  linethrough: boolean;
  textAlign: string;
  charSpacing: number;
  lineHeight: number;
}

const DEFAULT_TEXT_PROPS: TextProps = {
  fontSize: 32,
  fontWeight: 'normal',
  fontStyle: 'normal',
  underline: false,
  linethrough: false,
  textAlign: 'left',
  charSpacing: 0,
  lineHeight: 1.16,
};

function readActiveTextProps(): TextProps | null {
  const c = getCanvas();
  if (!c) return null;
  const a = c.getActiveObject();
  if (!a) return null;
  if (a.type !== 'i-text' && a.type !== 'text' && a.type !== 'textbox') return null;
  const t = a as fabric.IText;
  return {
    fontSize: (t as unknown as { fontSize?: number }).fontSize ?? 32,
    fontWeight: (t as unknown as { fontWeight?: string | number }).fontWeight ?? 'normal',
    fontStyle: (t as unknown as { fontStyle?: string }).fontStyle ?? 'normal',
    underline: !!(t as unknown as { underline?: boolean }).underline,
    linethrough: !!(t as unknown as { linethrough?: boolean }).linethrough,
    textAlign: (t as unknown as { textAlign?: string }).textAlign ?? 'left',
    charSpacing: (t as unknown as { charSpacing?: number }).charSpacing ?? 0,
    lineHeight: (t as unknown as { lineHeight?: number }).lineHeight ?? 1.16,
  };
}

/** Apply a patch to the active text object and push history. */
function patchActiveText(patch: Partial<TextProps>) {
  const c = getCanvas();
  if (!c) return;
  const a = c.getActiveObject();
  if (!a) return;
  if (a.type !== 'i-text' && a.type !== 'text' && a.type !== 'textbox') return;
  (a as fabric.IText).set(patch as Record<string, unknown>);
  a.setCoords();
  c.requestRenderAll();
  pushHistory();
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function transformActiveText(mode: 'upper' | 'lower' | 'title') {
  const c = getCanvas();
  if (!c) return;
  const a = c.getActiveObject();
  if (!a) return;
  if (a.type !== 'i-text' && a.type !== 'text' && a.type !== 'textbox') return;
  const t = a as fabric.IText;
  const cur = (t as unknown as { text?: string }).text ?? '';
  let next: string;
  if (mode === 'upper') next = cur.toUpperCase();
  else if (mode === 'lower') next = cur.toLowerCase();
  else next = titleCase(cur);
  t.set({ text: next });
  t.setCoords();
  c.requestRenderAll();
  pushHistory();
}

export function CharacterPanel() {
  const t = useT();
  // Re-read the live text props whenever the selection identity changes.
  // We key off selectionIds.join because selectionSummary doesn't carry the
  // text-specific fields we need (fontSize, charSpacing, etc.).
  const selectionIds = useEditor((s) => s.selectionIds);
  const selectionSummary = useEditor((s) => s.selectionSummary);
  const idKey = selectionIds.join(',');
  const [props, setProps] = useState<TextProps>(DEFAULT_TEXT_PROPS);

  // Register the AI skill once on first mount (idempotent across re-mounts).
  useEffect(() => {
    if (SET_TEXT_STYLE_REGISTERED) return;
    SET_TEXT_STYLE_REGISTERED = true;
    registerSkill({
      name: 'set_text_style',
      description:
        'Apply text styling to the currently selected text object. All fields are optional. ' +
        'fontSize is in pixels. bold/italic/underline toggle the corresponding properties. ' +
        'alignment is one of left|center|right|justify. ' +
        'charSpacing is in 1/1000 em (-200..1000). lineHeight is a multiplier (0.5..3).',
      input_schema: {
        type: 'object',
        properties: {
          fontSize: { type: 'number' },
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          underline: { type: 'boolean' },
          alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
          charSpacing: { type: 'number' },
          lineHeight: { type: 'number' },
        },
      },
      handler: (input) => {
        const c = getCanvas();
        if (!c) return 'no canvas';
        const a = c.getActiveObject();
        if (!a) return 'no selection';
        if (a.type !== 'i-text' && a.type !== 'text' && a.type !== 'textbox') {
          return 'selection is not a text object';
        }
        const patch: Partial<TextProps> = {};
        const i = input as Partial<{
          fontSize: number;
          bold: boolean;
          italic: boolean;
          underline: boolean;
          alignment: string;
          charSpacing: number;
          lineHeight: number;
        }>;
        if (typeof i.fontSize === 'number') patch.fontSize = i.fontSize;
        if (typeof i.bold === 'boolean') patch.fontWeight = i.bold ? 'bold' : 'normal';
        if (typeof i.italic === 'boolean') patch.fontStyle = i.italic ? 'italic' : 'normal';
        if (typeof i.underline === 'boolean') patch.underline = i.underline;
        if (typeof i.alignment === 'string') patch.textAlign = i.alignment;
        if (typeof i.charSpacing === 'number') patch.charSpacing = i.charSpacing;
        if (typeof i.lineHeight === 'number') patch.lineHeight = i.lineHeight;
        if (Object.keys(patch).length === 0) return 'no fields to apply';
        patchActiveText(patch);
        return `applied: ${Object.keys(patch).join(', ')}`;
      },
    });
  }, []);

  // Sync local UI state with the actual Fabric object whenever the selection
  // changes. selectionSummary alone is missing text fields, so we read
  // directly from the live active object. Render-time prev-key comparison
  // avoids the setState-in-effect anti-pattern (would cascade renders).
  const syncKey = `${idKey}|${selectionSummary?.type ?? ''}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    setProps(readActiveTextProps() ?? DEFAULT_TEXT_PROPS);
  }

  const isBold = String(props.fontWeight) === 'bold' || Number(props.fontWeight) >= 600;
  const isItalic = props.fontStyle === 'italic';

  const setFontSize = (v: number) => {
    setProps((p) => ({ ...p, fontSize: v }));
    patchActiveText({ fontSize: v });
  };
  const toggleBold = () => {
    const nv = isBold ? 'normal' : 'bold';
    setProps((p) => ({ ...p, fontWeight: nv }));
    patchActiveText({ fontWeight: nv });
  };
  const toggleItalic = () => {
    const nv = isItalic ? 'normal' : 'italic';
    setProps((p) => ({ ...p, fontStyle: nv }));
    patchActiveText({ fontStyle: nv });
  };
  const toggleUnderline = () => {
    const nv = !props.underline;
    setProps((p) => ({ ...p, underline: nv }));
    patchActiveText({ underline: nv });
  };
  const toggleStrike = () => {
    const nv = !props.linethrough;
    setProps((p) => ({ ...p, linethrough: nv }));
    patchActiveText({ linethrough: nv });
  };
  const setAlign = (v: 'left' | 'center' | 'right' | 'justify') => {
    setProps((p) => ({ ...p, textAlign: v }));
    patchActiveText({ textAlign: v });
  };
  const setCharSpacing = (v: number) => {
    setProps((p) => ({ ...p, charSpacing: v }));
    patchActiveText({ charSpacing: v });
  };
  const setLineHeight = (v: number) => {
    setProps((p) => ({ ...p, lineHeight: v }));
    patchActiveText({ lineHeight: v });
  };

  const tracking = props.charSpacing;
  const onPathEnabled = canApplyTextOnPath();

  return (
    <div className="panel-section p-3">
      <h3 className="field-label mb-2">{t('Character')}</h3>

      {/* Font size */}
      <div className="grid grid-cols-3 items-center gap-2 mb-2">
        <label className="text-muted">{t('Size')}</label>
        <div className="col-span-2">
          <input
            type="number"
            min={1}
            step={1}
            value={props.fontSize}
            onChange={(e) => setFontSize(+e.target.value)}
            aria-label={t('Size')}
            className="input-num"
          />
        </div>
      </div>

      {/* Weight / style toggles */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        <ToggleBtn on={isBold} onClick={toggleBold} title={t('Bold')}><Bold size={14} aria-hidden="true" /></ToggleBtn>
        <ToggleBtn on={isItalic} onClick={toggleItalic} title={t('Italic')}><Italic size={14} aria-hidden="true" /></ToggleBtn>
        <ToggleBtn on={props.underline} onClick={toggleUnderline} title={t('Underline')}><Underline size={14} aria-hidden="true" /></ToggleBtn>
        <ToggleBtn on={props.linethrough} onClick={toggleStrike} title={t('Strikethrough')}><Strikethrough size={14} aria-hidden="true" /></ToggleBtn>
      </div>

      {/* Tracking (charSpacing) */}
      <div className="grid grid-cols-3 items-center gap-2 mb-1">
        <label className="text-muted">{t('Tracking')}</label>
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="range"
            min={-200}
            max={1000}
            step={5}
            value={tracking}
            onChange={(e) => setCharSpacing(+e.target.value)}
            aria-label={t('Tracking')}
            className="flex-1 accent-accent"
          />
          <input
            type="number"
            min={-200}
            max={1000}
            step={5}
            value={tracking}
            onChange={(e) => setCharSpacing(+e.target.value)}
            aria-label={t('Tracking')}
            className="input-num w-16"
          />
        </div>
      </div>
      {/* Tracking presets */}
      <div className="flex flex-wrap gap-1 mb-3 pl-[33%]">
        <PresetPill label={t('tight')} onClick={() => setCharSpacing(-50)} active={tracking === -50}>-50</PresetPill>
        <PresetPill label={t('normal')} onClick={() => setCharSpacing(0)} active={tracking === 0}>0</PresetPill>
        <PresetPill label={t('loose')} onClick={() => setCharSpacing(50)} active={tracking === 50}>50</PresetPill>
        <PresetPill label={t('wide')} onClick={() => setCharSpacing(200)} active={tracking === 200}>200</PresetPill>
      </div>

      {/* Leading (lineHeight) */}
      <div className="grid grid-cols-3 items-center gap-2 mb-2">
        <label className="text-muted">{t('Leading')}</label>
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.05}
            value={props.lineHeight}
            onChange={(e) => setLineHeight(+e.target.value)}
            aria-label={t('Leading')}
            className="flex-1 accent-accent"
          />
          <input
            type="number"
            min={0.5}
            max={3}
            step={0.05}
            value={props.lineHeight}
            onChange={(e) => setLineHeight(+e.target.value)}
            aria-label={t('Leading')}
            className="input-num w-16"
          />
        </div>
      </div>

      {/* Text alignment */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        <ToggleBtn on={props.textAlign === 'left'} onClick={() => setAlign('left')} title={t('Align left')}>
          <TextAlignStart size={14} aria-hidden="true" />
        </ToggleBtn>
        <ToggleBtn on={props.textAlign === 'center'} onClick={() => setAlign('center')} title={t('Align center')}>
          <TextAlignCenter size={14} aria-hidden="true" />
        </ToggleBtn>
        <ToggleBtn on={props.textAlign === 'right'} onClick={() => setAlign('right')} title={t('Align right')}>
          <TextAlignEnd size={14} aria-hidden="true" />
        </ToggleBtn>
        <ToggleBtn on={props.textAlign === 'justify'} onClick={() => setAlign('justify')} title={t('Justify')}>
          <TextAlignJustify size={14} aria-hidden="true" />
        </ToggleBtn>
      </div>

      {/* Case transforms */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        <ToggleBtn on={false} onClick={() => transformActiveText('upper')} title={t('UPPERCASE')}>
          <CaseUpper size={14} aria-hidden="true" />
        </ToggleBtn>
        <ToggleBtn on={false} onClick={() => transformActiveText('lower')} title={t('lowercase')}>
          <CaseLower size={14} aria-hidden="true" />
        </ToggleBtn>
        <ToggleBtn on={false} onClick={() => transformActiveText('title')} title={t('Title Case')}>
          <Type size={14} aria-hidden="true" />
        </ToggleBtn>
      </div>

      {/* Text on path */}
      <button
        type="button"
        disabled={!onPathEnabled}
        onClick={() => applyTextOnPath()}
        title={onPathEnabled ? t('Place text along the selected path') : t('Select one text + one path to enable')}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('Text on Path')}
      </button>
    </div>
  );
}

function ToggleBtn({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      aria-pressed={on}
      className={`h-8 flex items-center justify-center rounded border transition-colors ${
        // `hover:bg-accent/20` on the "on" branch — previously an active
        // B/I/U/Strike or align toggle had no hover response, so mouse-overs
        // felt dead on the very buttons users had just engaged with. Mirrors
        // the bg-accent/15 → /20 pattern used by selected LayersPanel rows.
        on
          ? 'bg-accent/15 border-accent text-ink hover:bg-accent/20'
          : 'bg-panel2 border-border text-ink hover:bg-panel3'
      }`}
    >
      {children}
    </button>
  );
}

function PresetPill({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
        active
          // Active state needs its own hover so cursor-over-active reads as
          // interactive (mirrors the ToggleBtn fix earlier; B/I/U/Strike + the
          // align toggles share the same `bg-accent/15 → /20` hover pattern).
          ? 'bg-accent/15 border-accent text-ink hover:bg-accent/20'
          : 'bg-panel2 border-border text-muted hover:text-ink hover:bg-panel3'
      }`}
    >
      {label} <span className="opacity-70">{children}</span>
    </button>
  );
}
