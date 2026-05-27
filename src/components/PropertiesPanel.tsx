import { useEffect, useId, useRef, useState } from 'react';
import { RowInputIdContext, useRowInputId } from '../lib/rowInputIdContext';
import { RowInput, RowSelect } from './RowInput';
import { useEditor } from '../store/editor';
import { applyStyleToSelection, applyTransformToSelection, bringForward, sendBackward, bringToFront, sendToBack, groupSelection, ungroupSelection, deleteSelection, duplicateSelection, getCanvas } from '../lib/canvasEngine';
import {
  applyGradientToSelection,
  applyShadowToSelection,
  applyStrokeStyleToSelection,
  applyBlendModeToSelection,
  applyPatternFill,
  generatePalette,
  type GradientStop,
  type GradientType,
  type PatternKind,
} from '../lib/effects';
import { applyStrokeAlign, getStrokeAlign, type StrokeAlign } from '../lib/strokeAlign';
import { ariaKeyshortcuts } from '../lib/runtime';
import {
  applyBlur,
  applySepia,
  applyGrayscale,
  applyBrightness,
  applyContrast,
  applyHueRotate,
  clearFilters,
} from '../lib/filters';
import { Copy, Trash2, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Group, Ungroup, Pipette, Plus, X, Sparkles } from 'lucide-react';
import { FontPicker } from './FontPicker';
import { CharacterPanel } from './CharacterPanel';
import { ContrastChecker } from './ContrastChecker';
import { useColorPickerPopover } from '../lib/useColorPicker';
import { useT } from '../lib/i18n';

const DASH_PRESETS: Record<string, number[]> = {
  solid: [],
  dashed: [10, 5],
  dotted: [2, 4],
};

const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'difference',
  'exclusion',
];

export function PropertiesPanel() {
  const t = useT();
  const sum = useEditor(s => s.selectionSummary);
  const style = useEditor(s => s.style);
  const setStyle = useEditor(s => s.setStyle);
  const shadow = useEditor(s => s.shadow);
  const setShadow = useEditor(s => s.setShadow);
  const palette = useEditor(s => s.palette);
  const setPalette = useEditor(s => s.setPalette);

  // Gradient editor local state
  const [gradientOn, setGradientOn] = useState(false);
  const [gradType, setGradType] = useState<GradientType>('linear');
  const [gradAngle, setGradAngle] = useState(90);
  const [gradStops, setGradStops] = useState<GradientStop[]>([
    { offset: 0, color: '#3d9bff' },
    { offset: 1, color: '#ff7a3d' },
  ]);

  // Stroke style local state
  const [dashKey, setDashKey] = useState<keyof typeof DASH_PRESETS>('solid');
  const [lineCap, setLineCap] = useState<CanvasLineCap>('butt');
  const [lineJoin, setLineJoin] = useState<CanvasLineJoin>('miter');
  const [strokeAlign, setStrokeAlignState] = useState<StrokeAlign>('center');

  // Blend mode local state
  const [blendMode, setBlendMode] = useState<GlobalCompositeOperation>('source-over');

  // Filters local state (custom sliders)
  const [fxBlur, setFxBlur] = useState(0);
  const [fxBrightness, setFxBrightness] = useState(0);
  const [fxContrast, setFxContrast] = useState(0);
  const [fxHue, setFxHue] = useState(0);

  // Pattern fill local state
  const [patternKind, setPatternKind] = useState<PatternKind>('checker');
  const [patternColor1, setPatternColor1] = useState('#ffffff');
  const [patternColor2, setPatternColor2] = useState('#000000');
  const [patternSize, setPatternSize] = useState(16);

  // Advanced color picker popover
  const { open: openColorPicker, popover: colorPopover } = useColorPickerPopover();

  // Track what we last applied — so the apply-effect can no-op when the store
  // change came from selection hydration (rather than the user moving a slider).
  // Without this, hydrating from a freshly-selected object would re-trigger
  // applyShadowToSelection → pushHistory on every selection click.
  const lastAppliedShadowRef = useRef<{ enabled: boolean; color: string; blur: number; offsetX: number; offsetY: number } | null>(null);

  // Sync shadow toggle to canvas whenever it changes — except when the change
  // matches what we just hydrated from the selection, in which case it's a
  // round-trip, not a user edit.
  useEffect(() => {
    if (!sum) return;
    const cur = { enabled: shadow.enabled, color: shadow.color, blur: shadow.blur, offsetX: shadow.offsetX, offsetY: shadow.offsetY };
    const prev = lastAppliedShadowRef.current;
    if (prev &&
        prev.enabled === cur.enabled &&
        prev.color === cur.color &&
        prev.blur === cur.blur &&
        prev.offsetX === cur.offsetX &&
        prev.offsetY === cur.offsetY) {
      return;
    }
    lastAppliedShadowRef.current = cur;
    if (shadow.enabled) {
      applyShadowToSelection({
        color: shadow.color,
        blur: shadow.blur,
        offsetX: shadow.offsetX,
        offsetY: shadow.offsetY,
      });
    } else {
      applyShadowToSelection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadow.enabled, shadow.color, shadow.blur, shadow.offsetX, shadow.offsetY]);

  // Reflect the active selection's stashed __strokeAlign + shadow on selection
  // change. Render-time prev-tracking avoids the setState-in-effect cascade.
  // For shadow specifically, we hydrate the store *and* the ref in the same
  // render so the apply-effect doesn't fire on what's effectively a read.
  const [prevSum, setPrevSum] = useState(sum);
  if (prevSum !== sum) {
    setPrevSum(sum);
    const c = getCanvas();
    if (c) {
      setStrokeAlignState(getStrokeAlign(c.getActiveObject()));
      const obj = c.getActiveObject() as { shadow?: { color?: string; blur?: number; offsetX?: number; offsetY?: number } | null } | undefined;
      const sh = obj?.shadow;
      if (sh && typeof sh === 'object') {
        const hydrated = {
          enabled: true,
          color: typeof sh.color === 'string' ? sh.color : '#000000',
          blur: typeof sh.blur === 'number' ? sh.blur : 12,
          offsetX: typeof sh.offsetX === 'number' ? sh.offsetX : 4,
          offsetY: typeof sh.offsetY === 'number' ? sh.offsetY : 4,
        };
        // The `if (prevSum !== sum)` gate above ensures this whole block
        // only runs once per selection-change. Hydrating the ref alongside
        // the setState here is the intentional pattern documented in the
        // comment at the top of the block — the apply-effect treats it
        // as a read, not a user-driven write.
        // eslint-disable-next-line react-hooks/refs
        lastAppliedShadowRef.current = hydrated;
        setShadow(hydrated);
      } else if (obj) {
        // Selected object has no shadow → reflect "off" in the UI.
        const hydrated = { enabled: false, color: shadow.color, blur: shadow.blur, offsetX: shadow.offsetX, offsetY: shadow.offsetY };
        // eslint-disable-next-line react-hooks/refs
        lastAppliedShadowRef.current = hydrated;
        setShadow({ enabled: false });
      }
    }
  }

  const applyGradientNow = () => applyGradientToSelection(gradStops, gradType, gradAngle);

  const addStop = () => {
    const last = gradStops[gradStops.length - 1];
    const second = gradStops[gradStops.length - 2] ?? { offset: 0, color: '#ffffff' };
    const newOffset = Math.min(1, (last.offset + second.offset) / 2 + 0.05);
    setGradStops([...gradStops, { offset: newOffset, color: '#888888' }]);
  };

  const removeStop = (i: number) => {
    if (gradStops.length <= 2) return;
    setGradStops(gradStops.filter((_, idx) => idx !== i));
  };

  const updateStop = (i: number, patch: Partial<GradientStop>) => {
    setGradStops(gradStops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const pickColorEyedropper = async () => {
    const AnyWin = window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } };
    if (!AnyWin.EyeDropper) {
      alert(t('EyeDropper API not available in this browser.'));
      return;
    }
    try {
      const result = await new AnyWin.EyeDropper().open();
      const hex = result.sRGBHex;
      setStyle({ fill: hex });
      applyStyleToSelection({ fill: hex });
    } catch {
      // user cancelled
    }
  };

  const suggestPalette = () => {
    const base = (sum?.fill && typeof sum.fill === 'string' && sum.fill.startsWith('#')) ? sum.fill : style.fill;
    setPalette(generatePalette(base));
  };

  return (
    <>
    {colorPopover}
    <div className="flex flex-col text-xs overflow-y-auto h-full">
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Appearance')}</h3>
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <ColorRow label={t('Fill')} value={typeof sum?.fill === 'string' ? sum.fill : style.fill} onChange={(v) => { setStyle({ fill: v }); applyStyleToSelection({ fill: v }); }} />
          </div>
          <button
            type="button"
            title={t('Advanced color picker')}
            aria-label={t('Advanced color picker')}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const current = typeof sum?.fill === 'string' ? sum.fill : style.fill;
              openColorPicker({
                value: typeof current === 'string' && current.startsWith('#') ? current : '#3d9bff',
                anchor: { x: rect.left - 270, y: rect.top },
                onChange: (v) => { setStyle({ fill: v }); applyStyleToSelection({ fill: v }); },
              });
            }}
            className="btn h-7 mb-2 px-1.5"
          >
            <span aria-hidden>🎨</span><span className="ml-1">{t('Adv')}</span>
          </button>
        </div>
        <Swatches />
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            title={t('Pick color with eyedropper')}
            onClick={pickColorEyedropper}
            className="btn flex items-center gap-1"
          >
            <Pipette size={12} aria-hidden="true" /> {t('Pick color')}
          </button>
          <button
            type="button"
            title={t('Generate a 5-color palette from current fill')}
            onClick={suggestPalette}
            className="btn flex items-center gap-1"
          >
            <Sparkles size={12} aria-hidden="true" /> {t('Suggest palette')}
          </button>
        </div>
        {palette.length > 0 && (
          <div className="flex items-center gap-1 mb-2">
            {palette.map((c, i) => (
              <button
                key={i}
                type="button"
                title={c}
                onClick={() => { setStyle({ fill: c }); applyStyleToSelection({ fill: c }); }}
                className="w-7 h-7 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
        <ColorRow label={t('Stroke')} value={typeof sum?.stroke === 'string' ? sum.stroke : style.stroke} onChange={(v) => { setStyle({ stroke: v }); applyStyleToSelection({ stroke: v }); }} />
        <Row label={t('Stroke W')}>
          <RowInput type="number" min={0} step={0.5} className="input-num"
            aria-label={t('Stroke W')}
            value={sum?.strokeWidth ?? style.strokeWidth}
            onChange={(e) => { const v = +e.target.value; setStyle({ strokeWidth: v }); applyStyleToSelection({ strokeWidth: v }); }} />
        </Row>
        <Row label={t('Opacity')}>
          {/* Slider + percent readout — matches the Blur/Bright/Contrast/Hue
           * sliders right below in the Filters section, which all carry a
           * numeric tail. "50%" reads faster than "0.50" for opacity since
           * users typically think in transparency percentages. */}
          <div className="flex items-center gap-2">
            <RowInput type="range" min={0} max={1} step={0.05}
              aria-label={t('Opacity')}
              value={sum?.opacity ?? style.opacity}
              onChange={(e) => { const v = +e.target.value; setStyle({ opacity: v }); applyStyleToSelection({ opacity: v }); }}
              className="flex-1 accent-accent" />
            <span className="text-muted w-10 text-right tabular-nums">{Math.round((sum?.opacity ?? style.opacity) * 100)}%</span>
          </div>
        </Row>
      </div>

      {/* Gradient section */}
      <div className="panel-section p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="field-label">{t('Gradient')}</h3>
          <Toggle on={gradientOn} onChange={setGradientOn} label={t('Gradient')} />
        </div>
        {gradientOn && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={gradType === 'linear'}
                  onChange={() => setGradType('linear')}
                  className="accent-accent"
                />
                <span>{t('Linear')}</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={gradType === 'radial'}
                  onChange={() => setGradType('radial')}
                  className="accent-accent"
                />
                <span>{t('Radial')}</span>
              </label>
            </div>
            {gradType === 'linear' && (
              <Row label={t('Angle')}>
                <div className="flex items-center gap-2">
                  <RowInput
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={gradAngle}
                    onChange={(e) => setGradAngle(+e.target.value)}
                    aria-label={t('Angle')}
                    className="flex-1 accent-accent"
                  />
                  <span className="text-muted w-8 text-right">{gradAngle}°</span>
                </div>
              </Row>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('Stops')}</span>
                <button type="button" onClick={addStop} className="btn flex items-center gap-1" title={t('Add stop')}>
                  <Plus size={12} aria-hidden="true" /> {t('Add')}
                </button>
              </div>
              {gradStops.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="color"
                    value={s.color.startsWith('#') ? s.color : '#ffffff'}
                    onChange={(e) => updateStop(i, { color: e.target.value })}
                    className="w-7 h-7 rounded border border-border bg-panel2"
                    aria-label={`${t('Stop')} ${i + 1} ${t('color')}`}
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={s.offset}
                    onChange={(e) => updateStop(i, { offset: +e.target.value })}
                    className="input-num w-16"
                    aria-label={`${t('Stop')} ${i + 1} ${t('offset')}`}
                  />
                  <input
                    type="text"
                    spellCheck={false}
                    value={s.color}
                    onChange={(e) => updateStop(i, { color: e.target.value })}
                    className="input-num flex-1"
                    aria-label={`${t('Stop')} ${i + 1} ${t('color value')}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeStop(i)}
                    disabled={gradStops.length <= 2}
                    className="btn p-1 disabled:opacity-30"
                    title={t('Remove stop')}
                    aria-label={t('Remove stop')}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={applyGradientNow} className="btn-primary w-full">
              {t('Apply gradient')}
            </button>
          </div>
        )}
      </div>

      {/* Pattern fill section */}
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Pattern Fill')}</h3>
        <Row label={t('Pattern')}>
          <RowSelect
            className="input-num"
            aria-label={t('Pattern kind')}
            value={patternKind}
            onChange={(e) => setPatternKind(e.target.value as PatternKind)}
          >
            <option value="checker">{t('Checker')}</option>
            <option value="stripes">{t('Stripes')}</option>
            <option value="dots">{t('Dots')}</option>
            <option value="crosshatch">{t('Crosshatch')}</option>
          </RowSelect>
        </Row>
        <Row label={t('Color 1')}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={patternColor1.startsWith('#') ? patternColor1 : '#ffffff'}
              onChange={(e) => setPatternColor1(e.target.value)}
              className="w-7 h-7 rounded border border-border bg-panel2"
              aria-label={t('Pattern color 1 swatch')}
            />
            <RowInput
              type="text"
              spellCheck={false}
              value={patternColor1}
              onChange={(e) => setPatternColor1(e.target.value)}
              className="input-num flex-1"
              aria-label={t('Pattern color 1 value')}
            />
          </div>
        </Row>
        <Row label={t('Color 2')}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={patternColor2.startsWith('#') ? patternColor2 : '#000000'}
              onChange={(e) => setPatternColor2(e.target.value)}
              className="w-7 h-7 rounded border border-border bg-panel2"
              aria-label={t('Pattern color 2 swatch')}
            />
            <RowInput
              type="text"
              spellCheck={false}
              value={patternColor2}
              onChange={(e) => setPatternColor2(e.target.value)}
              className="input-num flex-1"
              aria-label={t('Pattern color 2 value')}
            />
          </div>
        </Row>
        <Row label={t('Size')}>
          <RowInput
            type="number"
            min={2}
            step={1}
            value={patternSize}
            onChange={(e) => setPatternSize(+e.target.value)}
            className="input-num"
            aria-label={t('Pattern size')}
          />
        </Row>
        <button
          type="button"
          onClick={() => applyPatternFill(patternKind, patternSize, patternColor1, patternColor2)}
          className="btn-primary w-full"
        >
          {t('Apply pattern')}
        </button>
      </div>

      {/* Shadow section */}
      <div className="panel-section p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="field-label">{t('Drop shadow')}</h3>
          <Toggle on={shadow.enabled} onChange={(v) => setShadow({ enabled: v })} label={t('Drop shadow')} />
        </div>
        {shadow.enabled && (
          <div className="space-y-2">
            <Row label={t('Color')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={shadow.color.startsWith('#') ? shadow.color : '#000000'}
                  onChange={(e) => setShadow({ color: e.target.value })}
                  className="w-7 h-7 rounded border border-border bg-panel2"
                  aria-label={t('Shadow color swatch')}
                />
                <RowInput
                  type="text"
                  spellCheck={false}
                  value={shadow.color}
                  onChange={(e) => setShadow({ color: e.target.value })}
                  className="input-num flex-1"
                  aria-label={t('Shadow color value')}
                />
              </div>
            </Row>
            <Row label={t('Blur')}>
              <RowInput
                type="number"
                min={0}
                step={1}
                value={shadow.blur}
                onChange={(e) => setShadow({ blur: +e.target.value })}
                className="input-num"
                aria-label={t('Shadow blur')}
              />
            </Row>
            <Row label={t('Offset X')}>
              <RowInput
                type="number"
                step={1}
                value={shadow.offsetX}
                onChange={(e) => setShadow({ offsetX: +e.target.value })}
                className="input-num"
                aria-label={t('Shadow offset X')}
              />
            </Row>
            <Row label={t('Offset Y')}>
              <RowInput
                type="number"
                step={1}
                value={shadow.offsetY}
                onChange={(e) => setShadow({ offsetY: +e.target.value })}
                className="input-num"
                aria-label={t('Shadow offset Y')}
              />
            </Row>
          </div>
        )}
      </div>

      {/* Filters section */}
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Filters')}</h3>
        <div className="grid grid-cols-3 gap-1 mb-2">
          <button type="button" onClick={clearFilters} className="btn" title={t('Clear all filters')}>{t('None')}</button>
          <button type="button" onClick={() => applyBlur(0.2)} className="btn" title={t('Gaussian blur')}>{t('Blur')}</button>
          <button type="button" onClick={() => applySepia()} className="btn" title={t('Sepia')}>{t('Sepia')}</button>
          <button type="button" onClick={() => applyGrayscale()} className="btn" title={t('Grayscale')}>{t('Gray')}</button>
          <button type="button" onClick={() => applyBrightness(0.15)} className="btn" title={t('Brightness +')}>B+</button>
          <button type="button" onClick={() => applyBrightness(-0.15)} className="btn" title={t('Brightness -')}>B-</button>
          <button type="button" onClick={() => applyContrast(0.15)} className="btn" title={t('Contrast +')}>C+</button>
          <button type="button" onClick={() => applyContrast(-0.15)} className="btn" title={t('Contrast -')}>C-</button>
          <button type="button" onClick={() => applyHueRotate(60)} className="btn" title={t('Hue rotate')}>{t('Hue')}</button>
        </div>
        <h4 className="field-label mt-3 mb-1">{t('Custom')}</h4>
        <Row label="Blur">
          <div className="flex items-center gap-2">
            <RowInput
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fxBlur}
              onChange={(e) => setFxBlur(+e.target.value)}
              onMouseUp={() => applyBlur(fxBlur)}
              onTouchEnd={() => applyBlur(fxBlur)}
              className="flex-1 accent-accent"
              aria-label={t('Filter blur amount')}
            />
            <span className="text-muted w-10 text-right">{fxBlur.toFixed(2)}</span>
          </div>
        </Row>
        <Row label="Bright">
          <div className="flex items-center gap-2">
            <RowInput
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={fxBrightness}
              onChange={(e) => setFxBrightness(+e.target.value)}
              onMouseUp={() => applyBrightness(fxBrightness)}
              onTouchEnd={() => applyBrightness(fxBrightness)}
              className="flex-1 accent-accent"
              aria-label={t('Filter brightness')}
            />
            <span className="text-muted w-10 text-right">{fxBrightness.toFixed(2)}</span>
          </div>
        </Row>
        <Row label="Contrast">
          <div className="flex items-center gap-2">
            <RowInput
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={fxContrast}
              onChange={(e) => setFxContrast(+e.target.value)}
              onMouseUp={() => applyContrast(fxContrast)}
              onTouchEnd={() => applyContrast(fxContrast)}
              className="flex-1 accent-accent"
              aria-label={t('Filter contrast')}
            />
            <span className="text-muted w-10 text-right">{fxContrast.toFixed(2)}</span>
          </div>
        </Row>
        <Row label="Hue">
          <div className="flex items-center gap-2">
            <RowInput
              type="range"
              min={-180}
              max={180}
              step={1}
              value={fxHue}
              onChange={(e) => setFxHue(+e.target.value)}
              onMouseUp={() => applyHueRotate(fxHue)}
              onTouchEnd={() => applyHueRotate(fxHue)}
              className="flex-1 accent-accent"
              aria-label={t('Filter hue rotation')}
            />
            <span className="text-muted w-10 text-right">{fxHue}°</span>
          </div>
        </Row>
        <button type="button" onClick={clearFilters} className="btn w-full mt-1">
          {t('Clear all filters')}
        </button>
      </div>

      {/* Advanced stroke */}
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Advanced stroke')}</h3>
        <Row label={t('Dash')}>
          <RowSelect
            className="input-num"
            aria-label={t('Dash')}
            value={dashKey}
            onChange={(e) => {
              const k = e.target.value as keyof typeof DASH_PRESETS;
              setDashKey(k);
              applyStrokeStyleToSelection({ strokeDashArray: DASH_PRESETS[k] });
            }}
          >
            <option value="solid">{t('Solid')}</option>
            <option value="dashed">{t('Dashed')}</option>
            <option value="dotted">{t('Dotted')}</option>
          </RowSelect>
        </Row>
        <Row label={t('Line cap')}>
          <RowSelect
            className="input-num"
            aria-label={t('Line cap')}
            value={lineCap}
            onChange={(e) => {
              const v = e.target.value as CanvasLineCap;
              setLineCap(v);
              applyStrokeStyleToSelection({ strokeLineCap: v });
            }}
          >
            <option value="butt">{t('Butt')}</option>
            <option value="round">{t('Round')}</option>
            <option value="square">{t('Square')}</option>
          </RowSelect>
        </Row>
        <Row label={t('Line join')}>
          <RowSelect
            className="input-num"
            aria-label={t('Line join')}
            value={lineJoin}
            onChange={(e) => {
              const v = e.target.value as CanvasLineJoin;
              setLineJoin(v);
              applyStrokeStyleToSelection({ strokeLineJoin: v });
            }}
          >
            <option value="miter">{t('Miter')}</option>
            <option value="round">{t('Round')}</option>
            <option value="bevel">{t('Bevel')}</option>
          </RowSelect>
        </Row>
        <Row label={t('Stroke alignment')}>
          <div className="flex items-center gap-1">
            {(['center', 'inside', 'outside'] as const).map((mode) => {
              const active = strokeAlign === mode;
              const label = mode === 'center' ? t('Center') : mode === 'inside' ? t('Inside') : t('Outside');
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStrokeAlignState(mode);
                    applyStrokeAlign(mode);
                  }}
                  className={
                    'flex-1 h-7 px-2 rounded text-xs border transition-colors ' +
                    (active
                      // hover:bg-accent/20 on the active branch — mirrors the
                      // ToggleBtn / PresetPill fixes so engaged "Center /
                      // Inside / Outside" stroke-align selectors lift on
                      // hover instead of feeling dead.
                      ? 'bg-accent/15 text-ink border-accent hover:bg-accent/20'
                      : 'bg-panel2 border-border text-ink hover:bg-panel3')
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Row>
      </div>

      {/* Blend mode */}
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Blend mode')}</h3>
        <Row label={t('Mode')}>
          <RowSelect
            className="input-num"
            aria-label={t('Blend mode')}
            value={blendMode}
            onChange={(e) => {
              const v = e.target.value as GlobalCompositeOperation;
              setBlendMode(v);
              applyBlendModeToSelection(v);
            }}
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </RowSelect>
        </Row>
      </div>

      {sum && (
        <div className="panel-section p-3">
          <h3 className="field-label mb-2">{t('Transform')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <NumField label={t('X')} value={sum.left} onChange={(v) => applyTransformToSelection({ left: v })} />
            <NumField label={t('Y')} value={sum.top} onChange={(v) => applyTransformToSelection({ top: v })} />
            <NumField label={t('W')} value={sum.width} onChange={(v) => applyTransformToSelection({ width: v })} />
            <NumField label={t('H')} value={sum.height} onChange={(v) => applyTransformToSelection({ height: v })} />
            <NumField label={t('Rot')} value={sum.angle} onChange={(v) => applyTransformToSelection({ angle: v })} />
          </div>
        </div>
      )}

      {(sum?.type === 'i-text' || sum?.type === 'textbox') && <FontPicker />}
      {(sum?.type === 'i-text' || sum?.type === 'textbox') && <CharacterPanel />}
      {(sum?.type === 'i-text' || sum?.type === 'text' || sum?.type === 'textbox') && <ContrastChecker />}

      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Arrange')}</h3>
        <div className="grid grid-cols-4 gap-1">
          <ToolButton title={t('Bring to Front')} kbd="Ctrl+Shift+]" onClick={bringToFront}><ChevronsUp size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Bring Forward')} kbd="Ctrl+]" onClick={bringForward}><ChevronUp size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Send Backward')} kbd="Ctrl+[" onClick={sendBackward}><ChevronDown size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Send to Back')} kbd="Ctrl+Shift+[" onClick={sendToBack}><ChevronsDown size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Group')} kbd="Ctrl+G" onClick={groupSelection}><Group size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Ungroup')} kbd="Ctrl+Shift+G" onClick={ungroupSelection}><Ungroup size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Duplicate')} kbd="Ctrl+D" onClick={duplicateSelection}><Copy size={14} aria-hidden="true" /></ToolButton>
          <ToolButton title={t('Delete')} kbd="Delete" onClick={deleteSelection}><Trash2 size={14} aria-hidden="true" /></ToolButton>
        </div>
      </div>

      {sum && (
        <div className="px-3 py-2 text-muted text-[10px]">
          {sum.count} {sum.count === 1 ? t('object selected') : t('objects selected')} · {sum.type}
        </div>
      )}
    </div>
    </>
  );
}

// `Row` generates a stable id via `useId`, sets it on the `<label>` via
// `htmlFor`, and exposes it through `RowInputIdContext` so children can
// opt in by reading `useRowInputId()` and applying the id to their primary
// input control. The context + hook live in `./RowInputId.tsx` so this
// file stays component-only (react-refresh constraint).

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="grid grid-cols-3 items-center gap-2 mb-2">
      <label className="text-muted" htmlFor={id}>{label}</label>
      <div className="col-span-2">
        <RowInputIdContext.Provider value={id}>{children}</RowInputIdContext.Provider>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // NumField wraps its own `<label>`, so it doesn't consume the Row-level
  // id context — the local span/input pairing keeps the click target tight
  // around the inline X/Y/W/H labels.
  return (
    <label className="flex items-center gap-1">
      <span className="text-muted w-4">{label}</span>
      <input type="number" className="input-num" value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useT();
  const hex = value?.startsWith('#') ? value : '#3d9bff';
  return (
    <Row label={label}>
      <ColorRowBody hex={hex} value={value} onChange={onChange} label={label} t={t} />
    </Row>
  );
}

function ColorRowBody({
  hex, value, onChange, label, t,
}: { hex: string; value: string; onChange: (v: string) => void; label: string; t: (s: string) => string }) {
  // The text input is the "primary" target — wire it to the Row's label id
  // via the context the Row provides. The swatch keeps its own aria-label.
  const inputId = useRowInputId() ?? undefined;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-border bg-panel2"
        aria-label={`${label} ${t('swatch')}`}
      />
      <input
        id={inputId}
        type="text"
        spellCheck={false}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="input-num flex-1"
        placeholder={t('none')}
        aria-label={`${label} ${t('color value')}`}
      />
    </div>
  );
}

function ToolButton({ children, title, kbd, onClick }: { children: React.ReactNode; title: string; kbd?: string; onClick: () => void }) {
  return (
    <button
      title={kbd ? `${title} (${kbd})` : title}
      aria-label={title}
      aria-keyshortcuts={ariaKeyshortcuts(kbd)}
      onClick={onClick}
      className="h-8 flex items-center justify-center rounded bg-panel2 border border-border hover:bg-panel3 text-ink transition-colors"
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-panel3 border border-border'}`}
      aria-pressed={on}
      // Toggle is icon-only — without an accessible name, axe's button-name rule
      // flags it. Callers pass a label naming the thing being toggled.
      aria-label={label ?? t('Toggle')}
    >
      <span
        className={`absolute top-0.5 ${on ? 'left-[18px]' : 'left-0.5'} w-4 h-4 rounded-full bg-ink transition-all`}
      />
    </button>
  );
}

// ---------- Swatches ----------
const SWATCH_KEY = 'vector.swatches';
const DEFAULT_SWATCHES: string[] = [
  '#000000', '#ffffff', '#9a9aa6', '#3a3a44',
  '#ff3d3d', '#ff7a3d', '#ffc83d', '#f1ff3d',
  '#7aff3d', '#3dff7a', '#3dffd0', '#3dd0ff',
  '#3d9bff', '#3d5fff', '#7a3dff', '#c83dff',
  '#ff3dc8', '#ff3d7a', '#7a4f2b', '#2b4f7a',
  '#0f3d2b', '#5b2b3d', '#2b1b2b', '#15151a',
];

function loadSwatches(): string[] {
  try {
    const raw = localStorage.getItem(SWATCH_KEY);
    if (!raw) return DEFAULT_SWATCHES.slice();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((c) => typeof c === 'string');
  } catch { /* ignore */ }
  return DEFAULT_SWATCHES.slice();
}

function saveSwatches(arr: string[]) {
  try { localStorage.setItem(SWATCH_KEY, JSON.stringify(arr)); } catch { /* ignore */ }
}

function Swatches() {
  const t = useT();
  const [swatches, setSwatches] = useState<string[]>(() => loadSwatches());
  const style = useEditor(s => s.style);
  const setStyle = useEditor(s => s.setStyle);

  useEffect(() => { saveSwatches(swatches); }, [swatches]);

  const onClick = (e: React.MouseEvent, color: string) => {
    e.preventDefault();
    if (e.altKey) {
      setStyle({ stroke: color });
      applyStyleToSelection({ stroke: color });
    } else {
      setStyle({ fill: color });
      applyStyleToSelection({ fill: color });
    }
  };

  const onContext = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    setSwatches(swatches.filter((_, i) => i !== idx));
  };

  const addCurrent = () => {
    const c = style.fill;
    if (!c || typeof c !== 'string') return;
    if (swatches.includes(c)) return;
    setSwatches([...swatches, c]);
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-muted text-[10px] mb-1">
        <span>{t('Swatches')}</span>
        <span className="opacity-60">{t('Alt = stroke · right-click = remove')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {swatches.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            title={c}
            onClick={(e) => onClick(e, c)}
            onContextMenu={(e) => onContext(e, i)}
            className="w-5 h-5 rounded-sm border border-border hover:scale-110 transition-transform"
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          type="button"
          title={t('Add current fill')}
          aria-label={t('Add current fill')}
          onClick={addCurrent}
          className="w-5 h-5 rounded-sm border border-border bg-panel2 text-muted hover:text-ink hover:bg-panel3 transition-colors flex items-center justify-center text-[10px] leading-none"
        ><span aria-hidden="true">+</span></button>
      </div>
    </div>
  );
}
