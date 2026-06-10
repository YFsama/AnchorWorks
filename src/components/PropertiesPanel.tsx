import { useEffect, useId, useRef, useState } from 'react';
import { RowInputIdContext, useRowInputId } from '../lib/rowInputIdContext';
import { RowInput, RowSelect } from './RowInput';
import { useEditor } from '../store/editor';
import { applyStyleToSelection, applyTransformToSelection, bringForward, sendBackward, bringToFront, sendToBack, groupSelection, ungroupSelection, deleteSelection, duplicateSelection, renameSelection, getCanvas } from '../lib/canvasEngine';
import { addSavedSwatchColor, applySwatchToSelection, collectSelectionColorsIntoSwatches, loadSwatches, normalizeSwatchColor, replaceSavedSwatchWithColor, saveSwatches, selectObjectsUsingSwatch } from '../lib/globalSwatches';
import {
  applyGraphicStyleToSelection,
  loadGraphicStyles,
  removeGraphicStyle,
  saveGraphicStyleFromSelection,
  saveGraphicStyles,
  selectObjectsUsingGraphicStyle,
  type GraphicStyle,
} from '../lib/graphicStyles';
import {
  applyGradientToSelection,
  applyShadowToSelection,
  applyStrokeStyleToSelection,
  applyBlendModeToSelection,
  setUniformStroke,
  applyPatternFill,
  generatePalette,
  type GradientStop,
  type GradientType,
  type PatternKind,
} from '../lib/effects';
import { applyStrokeAlign, getStrokeAlign, type StrokeAlign } from '../lib/strokeAlign';
import { applyWidthProfileToSelection, type WidthProfile, WIDTH_PROFILES } from '../lib/variableWidth';
import { BRUSH_PRESETS, type BrushPresetId } from '../lib/brushPresets';
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
import { Copy, Trash2, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Group, Ungroup, Pipette, Plus, X, Sparkles, MousePointerClick } from 'lucide-react';
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

const STROKE_WIDTH_PRESETS = [0, 0.5, 1, 2, 4, 8];
const OPACITY_PRESETS = [1, 0.75, 0.5, 0.25];
const TRANSFORM_SCALE_PRESETS = [25, 50, 75, 100, 150, 200];
const ROTATION_PRESETS = [0, 90, 180, -90];
const GRADIENT_ANGLE_PRESETS = [0, 45, 90, 135, 180, 270];
const FIT_SIZE_ACTIONS = ['fit-width', 'fit-height', 'fit-page'] as const;
const DOCUMENT_CENTER_ACTIONS = ['center-x', 'center-y', 'center'] as const;
const OBJECT_NAME_ACTIONS = ['apply-name', 'clear-name'] as const;
const DASH_STYLE_ACTIONS = ['solid', 'dashed', 'dotted'] as const;
const LINE_CAP_ACTIONS = ['butt', 'round', 'square'] as const;
const LINE_JOIN_ACTIONS = ['miter', 'round', 'bevel'] as const;
const STROKE_ALIGN_ACTIONS = ['center', 'inside', 'outside'] as const;
const QUICK_BLEND_MODES = ['source-over', 'multiply', 'screen', 'overlay', 'difference'] as const;
const PATTERN_KIND_ACTIONS = ['checker', 'stripes', 'dots', 'crosshatch'] as const;
const SHADOW_PRESETS = [
  { id: 'soft', label: 'Soft Shadow', value: { color: 'rgba(0,0,0,0.35)', blur: 12, offsetX: 4, offsetY: 6 } },
  { id: 'hard', label: 'Hard Shadow', value: { color: 'rgba(0,0,0,0.45)', blur: 0, offsetX: 5, offsetY: 5 } },
  { id: 'glow', label: 'Glow', value: { color: 'rgba(61,155,255,0.75)', blur: 16, offsetX: 0, offsetY: 0 } },
  { id: 'clear', label: 'Clear Shadow', value: null },
] as const;
type ShadowPresetId = typeof SHADOW_PRESETS[number]['id'];
const SHADOW_PRESET_ACTIONS: ShadowPresetId[] = SHADOW_PRESETS.map((preset) => preset.id);
const PATTERN_SIZE_PRESETS = [8, 12, 16, 24, 32, 48];
const FILTER_BLUR_PRESETS = [0, 0.1, 0.2, 0.4];
const FILTER_TONE_PRESETS = [-0.3, -0.15, 0, 0.15, 0.3];
const FILTER_HUE_PRESETS = [-90, -45, 0, 45, 90];
const MITER_LIMIT_PRESETS = [2, 4, 8, 12];

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
  const selectionIds = useEditor(s => s.selectionIds);
  const style = useEditor(s => s.style);
  const setStyle = useEditor(s => s.setStyle);
  const brushPreset = useEditor(s => s.brushPreset);
  const setBrushPreset = useEditor(s => s.setBrushPreset);
  const shadow = useEditor(s => s.shadow);
  const setShadow = useEditor(s => s.setShadow);
  const palette = useEditor(s => s.palette);
  const setPalette = useEditor(s => s.setPalette);
  const doc = useEditor(s => s.doc);

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
  const [dashCustom, setDashCustom] = useState('');
  const [lineCap, setLineCap] = useState<CanvasLineCap>('butt');
  const [lineJoin, setLineJoin] = useState<CanvasLineJoin>('miter');
  const [miterLimit, setMiterLimit] = useState(4);
  const [strokeAlign, setStrokeAlignState] = useState<StrokeAlign>('center');
  const [strokeUniform, setStrokeUniformState] = useState(false);

  // Blend mode local state
  const [blendMode, setBlendMode] = useState<GlobalCompositeOperation>('source-over');

  // Object name editor: draft locally, commit on blur/Enter to avoid one
  // history snapshot per keystroke.
  const [nameDraft, setNameDraft] = useState('');
  const [nameDraftKey, setNameDraftKey] = useState('');

  // Filters local state (custom sliders)
  const [fxBlur, setFxBlur] = useState(0);
  const [fxBrightness, setFxBrightness] = useState(0);
  const [fxContrast, setFxContrast] = useState(0);
  const [fxHue, setFxHue] = useState(0);
  const clearImageFiltersFromPanel = () => {
    setFxBlur(0);
    setFxBrightness(0);
    setFxContrast(0);
    setFxHue(0);
    clearFilters();
  };
  const applyPanelBlur = (amount: number) => { setFxBlur(amount); applyBlur(amount); };
  const applyPanelBrightness = (amount: number) => { setFxBrightness(amount); applyBrightness(amount); };
  const applyPanelContrast = (amount: number) => { setFxContrast(amount); applyContrast(amount); };
  const applyPanelHueRotate = (degrees: number) => { setFxHue(degrees); applyHueRotate(degrees); };

  // Transform numeric unit (mm/px) — shared via the store so the inspector and
  // the status-bar dimensions always agree; persisted under vector.xfUnit.
  const xfUnit = useEditor(s => s.dimUnit);
  const changeUnit = useEditor(s => s.setDimUnit);
  const toU = (px: number) => (xfUnit === 'mm' ? Math.round((px / 3.7795) * 100) / 100 : px);
  const fromU = (v: number) => (xfUnit === 'mm' ? v * 3.7795 : v);

  // Pattern fill local state
  const [patternKind, setPatternKind] = useState<PatternKind>('checker');
  const [patternColor1, setPatternColor1] = useState('#ffffff');
  const [patternColor2, setPatternColor2] = useState('#000000');
  const [patternSize, setPatternSize] = useState(16);
  const [reviewedStrokeWidthPreset, setReviewedStrokeWidthPreset] = useState('');
  const [reviewedOpacityPreset, setReviewedOpacityPreset] = useState('');
  const [reviewedGradientAnglePreset, setReviewedGradientAnglePreset] = useState('');
  const [reviewedPatternSizePreset, setReviewedPatternSizePreset] = useState('');
  const [reviewedBlurPreset, setReviewedBlurPreset] = useState('');
  const [reviewedBrightnessPreset, setReviewedBrightnessPreset] = useState('');
  const [reviewedContrastPreset, setReviewedContrastPreset] = useState('');
  const [reviewedHuePreset, setReviewedHuePreset] = useState('');
  const [reviewedTransformScalePreset, setReviewedTransformScalePreset] = useState('');
  const [reviewedFitPreset, setReviewedFitPreset] = useState('');
  const [reviewedCenterPreset, setReviewedCenterPreset] = useState('');
  const [reviewedNameAction, setReviewedNameAction] = useState('');
  const [reviewedRotationPreset, setReviewedRotationPreset] = useState('');
  const [reviewedDashPreset, setReviewedDashPreset] = useState('');
  const [reviewedLineCapPreset, setReviewedLineCapPreset] = useState('');
  const [reviewedLineJoinPreset, setReviewedLineJoinPreset] = useState('');
  const [reviewedMiterLimitPreset, setReviewedMiterLimitPreset] = useState('');
  const [reviewedStrokeAlignPreset, setReviewedStrokeAlignPreset] = useState('');
  const applyPatternPreset = (nextKind: PatternKind, nextSize = patternSize) => {
    setPatternKind(nextKind);
    setPatternSize(nextSize);
    applyPatternFill(nextKind, nextSize, patternColor1, patternColor2);
  };

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
      setStrokeUniformState(!!(c.getActiveObject() as { strokeUniform?: boolean } | undefined)?.strokeUniform);
      // Reflect the object's actual stroke style so the controls aren't stale.
      const so = c.getActiveObject() as { strokeDashArray?: number[] | null; strokeLineCap?: CanvasLineCap; strokeLineJoin?: CanvasLineJoin; strokeMiterLimit?: number } | undefined;
      if (so) {
        setLineCap(so.strokeLineCap ?? 'butt');
        setLineJoin(so.strokeLineJoin ?? 'miter');
        setMiterLimit(typeof so.strokeMiterLimit === 'number' ? so.strokeMiterLimit : 4);
        const da = Array.isArray(so.strokeDashArray) ? so.strokeDashArray : [];
        const preset = (Object.keys(DASH_PRESETS) as (keyof typeof DASH_PRESETS)[])
          .find((kk) => JSON.stringify(DASH_PRESETS[kk]) === JSON.stringify(da));
        if (preset) { setDashKey(preset); setDashCustom(''); }
        else { setDashKey('solid'); setDashCustom(da.join(' ')); }
      }
      // Reflect the object's blend mode too (same write-only-state fix).
      const activeObject = c.getActiveObject();
      setBlendMode((activeObject as { globalCompositeOperation?: GlobalCompositeOperation } | undefined)?.globalCompositeOperation ?? 'source-over');
      const gradient = hydrateGradientFromObject(activeObject);
      if (gradient) {
        setGradientOn(true);
        setGradType(gradient.type);
        setGradAngle(gradient.angle);
        setGradStops(gradient.stops);
      } else if (activeObject) {
        setGradientOn(false);
      }
      const obj = activeObject as { shadow?: { color?: string; blur?: number; offsetX?: number; offsetY?: number } | null } | undefined;
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

  const selectionKey = selectionIds.join('|');
  const nextNameDraftKey = `${selectionKey}|${sum?.name ?? ''}`;
  if (nameDraftKey !== nextNameDraftKey) {
    setNameDraftKey(nextNameDraftKey);
    setNameDraft(sum?.name ?? '');
  }

  const commitNameFromProperties = (nextName = nameDraft) => {
    if (!sum || nextName === sum.name) return;
    setNameDraft(nextName);
    renameSelection(nextName);
  };
  const applyObjectNameAction = (action: typeof OBJECT_NAME_ACTIONS[number]) => {
    if (action === 'clear-name') {
      commitNameFromProperties('');
      return;
    }
    commitNameFromProperties();
  };
  const nameHasChanges = !!sum && nameDraft !== sum.name;
  const nameCanClear = !!sum && (nameDraft.length > 0 || sum.name.length > 0);

  const transformPresetClass = (active: boolean) =>
    `px-2 py-1 rounded border text-[10px] transition-colors ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`;
  const handleNumberPresetKeys = (
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly number[],
    current: number,
    apply: (next: number) => void,
    onReview?: (next: number) => void,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const index = values.findIndex((value) => Math.abs(value - current) < 0.001);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
        : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
    apply(next);
    requestAnimationFrame(() => {
      onReview?.(next);
      group.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
    });
  };
  const handleToolbarPresetKeys = (
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly string[],
    apply?: (next: string) => void,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const activeValue = group.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset.value
      : undefined;
    const index = activeValue ? values.indexOf(activeValue) : -1;
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
        : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
    apply?.(next);
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus());
  };
  const handlePatternKindKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const activeValue = group.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset.value
      : undefined;
    const activeKind = PATTERN_KIND_ACTIONS.find((kind) => kind === activeValue) ?? patternKind;
    const index = PATTERN_KIND_ACTIONS.indexOf(activeKind);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? PATTERN_KIND_ACTIONS[0]
      : event.key === 'End'
        ? PATTERN_KIND_ACTIONS[PATTERN_KIND_ACTIONS.length - 1]
        : PATTERN_KIND_ACTIONS[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + PATTERN_KIND_ACTIONS.length) % PATTERN_KIND_ACTIONS.length];
    applyPatternPreset(next);
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus());
  };
  const handleStrokeOptionKeys = <T extends string>(
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly T[],
    current: T,
    apply: (next: T) => void,
    onReview?: (next: T) => void,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const activeValue = group.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset.value
      : undefined;
    const activeOption = values.find((value) => value === activeValue) ?? current;
    const index = values.indexOf(activeOption);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
        : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
    apply(next);
    requestAnimationFrame(() => {
      onReview?.(next);
      group.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
    });
  };
  const applyDashPreset = (key: keyof typeof DASH_PRESETS) => {
    setDashKey(key);
    setDashCustom('');
    applyStrokeStyleToSelection({ strokeDashArray: DASH_PRESETS[key] });
  };
  const applyLineCapPreset = (cap: CanvasLineCap) => {
    setLineCap(cap);
    applyStrokeStyleToSelection({ strokeLineCap: cap });
  };
  const applyLineJoinPreset = (join: CanvasLineJoin) => {
    setLineJoin(join);
    applyStrokeStyleToSelection({ strokeLineJoin: join });
  };
  const applyStrokeAlignPreset = (mode: StrokeAlign) => {
    setStrokeAlignState(mode);
    applyStrokeAlign(mode);
  };
  const applyBlendModePreset = (mode: GlobalCompositeOperation) => {
    setBlendMode(mode);
    applyBlendModeToSelection(mode);
  };
  const handleBlendModeKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const activeValue = group.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset.value
      : undefined;
    const activeMode = QUICK_BLEND_MODES.find((mode) => mode === activeValue) ?? blendMode;
    const index = QUICK_BLEND_MODES.indexOf(activeMode as typeof QUICK_BLEND_MODES[number]);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? QUICK_BLEND_MODES[0]
      : event.key === 'End'
        ? QUICK_BLEND_MODES[QUICK_BLEND_MODES.length - 1]
        : QUICK_BLEND_MODES[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + QUICK_BLEND_MODES.length) % QUICK_BLEND_MODES.length];
    applyBlendModePreset(next);
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus());
  };
  const applyShadowPreset = (preset: typeof SHADOW_PRESETS[number]) => {
    if (preset.value) {
      setShadow({ enabled: true, ...preset.value });
      applyShadowToSelection(preset.value);
    } else {
      setShadow({ enabled: false });
      applyShadowToSelection(null);
    }
  };
  const handleShadowPresetKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const activeValue = group.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset.value
      : undefined;
    const activePresetId = SHADOW_PRESET_ACTIONS.find((id) => id === activeValue);
    const index = activePresetId ? SHADOW_PRESET_ACTIONS.indexOf(activePresetId) : -1;
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? SHADOW_PRESET_ACTIONS[0]
      : event.key === 'End'
        ? SHADOW_PRESET_ACTIONS[SHADOW_PRESET_ACTIONS.length - 1]
        : SHADOW_PRESET_ACTIONS[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + SHADOW_PRESET_ACTIONS.length) % SHADOW_PRESET_ACTIONS.length];
    const preset = SHADOW_PRESETS.find((entry) => entry.id === next);
    if (preset) applyShadowPreset(preset);
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus());
  };
  const isFitWidth = !!sum && sum.width > 0 && Math.abs(sum.width - doc.width) <= 1;
  const isFitHeight = !!sum && sum.height > 0 && Math.abs(sum.height - doc.height) <= 1;
  const isCenteredX = !!sum && Math.abs(sum.left - (doc.width - sum.width) / 2) <= 1;
  const isCenteredY = !!sum && Math.abs(sum.top - (doc.height - sum.height) / 2) <= 1;
  const isFitPage = isCenteredX && isCenteredY && (isFitWidth || isFitHeight) && !!sum && sum.width <= doc.width + 1 && sum.height <= doc.height + 1;
  const applyScalePreset = (scale: number) => {
    if (!sum) return;
    const c = getCanvas();
    const activeObject = c?.getActiveObject();
    const baseWidth = activeObject?.width ?? 0;
    const baseHeight = activeObject?.height ?? 0;
    applyTransformToSelection({
      width: baseWidth > 0 ? baseWidth * (scale / 100) : sum.width * (scale / 100),
      height: baseHeight > 0 ? baseHeight * (scale / 100) : sum.height * (scale / 100),
    });
  };
  const applyFitPreset = (mode: typeof FIT_SIZE_ACTIONS[number]) => {
    if (!sum) return;
    if (mode === 'fit-width') {
      const ratio = sum.width > 0 ? doc.width / sum.width : 1;
      applyTransformToSelection({ width: doc.width, height: sum.height * ratio });
      return;
    }
    if (mode === 'fit-height') {
      const ratio = sum.height > 0 ? doc.height / sum.height : 1;
      applyTransformToSelection({ width: sum.width * ratio, height: doc.height });
      return;
    }
    const ratio = Math.min(sum.width > 0 ? doc.width / sum.width : 1, sum.height > 0 ? doc.height / sum.height : 1);
    const width = sum.width * ratio;
    const height = sum.height * ratio;
    applyTransformToSelection({ width, height, left: (doc.width - width) / 2, top: (doc.height - height) / 2 });
  };
  const applyCenterPreset = (mode: typeof DOCUMENT_CENTER_ACTIONS[number]) => {
    if (!sum) return;
    if (mode === 'center-x') {
      applyTransformToSelection({ left: (doc.width - sum.width) / 2 });
      return;
    }
    if (mode === 'center-y') {
      applyTransformToSelection({ top: (doc.height - sum.height) / 2 });
      return;
    }
    applyTransformToSelection({ left: (doc.width - sum.width) / 2, top: (doc.height - sum.height) / 2 });
  };
  const handleTransformUnitKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const units = ['mm', 'px'] as const;
    const index = units.indexOf(xfUnit);
    const next = event.key === 'Home'
      ? units[0]
      : event.key === 'End'
        ? units[units.length - 1]
        : units[(index + (event.key === 'ArrowRight' ? 1 : -1) + units.length) % units.length];
    changeUnit(next);
    requestAnimationFrame(() => event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus());
  };
  const handleTransformActionKeys = <T extends string>(
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly T[],
    current: T,
    apply: (next: T) => void,
    onReview?: (next: T) => void,
  ) => handleStrokeOptionKeys(event, values, current, apply, onReview);

  return (
    <>
    {colorPopover}
    <div className="flex flex-col text-xs overflow-y-auto h-full">
      {sum && (
        <div className="panel-section p-3">
          <h3 className="field-label mb-2">{t('Selection')}</h3>
          <Row label={t('Object name')}>
            <div className="space-y-1.5">
              <RowInput
                value={nameDraft}
                placeholder={sum.count > 1 ? t('Multiple objects') : t('Unnamed')}
                aria-label={t('Object name')}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => commitNameFromProperties()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commitNameFromProperties(); e.currentTarget.blur(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setNameDraft(sum.name); e.currentTarget.blur(); }
                }}
              />
              <div
                className="grid grid-cols-2 gap-1"
                role="group"
                aria-label={t('Object name actions')}
                aria-describedby="properties-object-name-action-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleToolbarPresetKeys(event, OBJECT_NAME_ACTIONS, (action) => applyObjectNameAction(action as typeof OBJECT_NAME_ACTIONS[number]))}
              >
                <span id="properties-object-name-action-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedNameAction || t('Object name actions')}`}
                </span>
                <button
                  type="button"
                  className="btn text-[10px]"
                  data-value="apply-name"
                  disabled={!nameHasChanges}
                  title={t('Apply object name')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyObjectNameAction('apply-name')}
                  onFocus={() => setReviewedNameAction(t('Apply name'))}
                >
                  {t('Apply name')}
                </button>
                <button
                  type="button"
                  className="btn text-[10px]"
                  data-value="clear-name"
                  disabled={!nameCanClear}
                  title={t('Clear object name')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyObjectNameAction('clear-name')}
                  onFocus={() => setReviewedNameAction(t('Clear name'))}
                >
                  {t('Clear name')}
                </button>
              </div>
            </div>
          </Row>
        </div>
      )}
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
        <GraphicStyles />
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
          <div
            className="flex items-center gap-1 mb-2"
            role="group"
            aria-label={t('Suggested palette colors')}
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleToolbarPresetKeys(event, palette, (fill) => { setStyle({ fill }); applyStyleToSelection({ fill }); })}
          >
            {palette.map((c, i) => (
              <button
                key={`${c}-${i}`}
                type="button"
                title={c}
                data-value={c}
                onClick={() => { setStyle({ fill: c }); applyStyleToSelection({ fill: c }); }}
                className="w-7 h-7 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
        <ColorRow label={t('Stroke')} value={typeof sum?.stroke === 'string' ? sum.stroke : style.stroke} onChange={(v) => { setStyle({ stroke: v }); applyStyleToSelection({ stroke: v }); }} />
        <Row label={t('Stroke W')}>
          <div className="space-y-1.5">
            <RowInput type="number" min={0} step={0.5} className="input-num"
              aria-label={t('Stroke W')}
              value={sum?.strokeWidth ?? style.strokeWidth}
              onChange={(e) => { const v = +e.target.value; setStyle({ strokeWidth: v }); applyStyleToSelection({ strokeWidth: v }); }} />
            <div
              className="grid grid-cols-6 gap-1"
              role="group"
              aria-label={t('Stroke width presets')}
              aria-describedby="properties-stroke-width-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, STROKE_WIDTH_PRESETS, sum?.strokeWidth ?? style.strokeWidth, (strokeWidth) => { setStyle({ strokeWidth }); applyStyleToSelection({ strokeWidth }); }, (strokeWidth) => setReviewedStrokeWidthPreset(`${t('Stroke W')} ${strokeWidth} px`))}
            >
              <span id="properties-stroke-width-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedStrokeWidthPreset || t('Stroke width presets')}`}
              </span>
              {STROKE_WIDTH_PRESETS.map((strokeWidth) => {
                const active = Math.abs((sum?.strokeWidth ?? style.strokeWidth) - strokeWidth) < 0.001;
                return (
                  <button
                    key={strokeWidth}
                    type="button"
                    aria-pressed={active}
                    title={`${strokeWidth} px`}
                    onClick={() => { setStyle({ strokeWidth }); applyStyleToSelection({ strokeWidth }); }}
                    onFocus={() => setReviewedStrokeWidthPreset(`${t('Stroke W')} ${strokeWidth} px`)}
                    data-value={strokeWidth}
                    className={`rounded-md border px-1 py-1 text-[10px] tabular-nums transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                  >
                    {strokeWidth}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>
        <Row label={t('Brush preset')}>
          <RowSelect
            value={brushPreset}
            aria-label={t('Brush preset')}
            onChange={(event) => setBrushPreset(event.target.value as BrushPresetId)}
          >
            {BRUSH_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{t(preset.label)}</option>
            ))}
          </RowSelect>
        </Row>
        <Row label={t('Opacity')}>
          {/* Slider + percent readout — matches the Blur/Bright/Contrast/Hue
           * sliders right below in the Filters section, which all carry a
           * numeric tail. "50%" reads faster than "0.50" for opacity since
           * users typically think in transparency percentages. */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <RowInput type="range" min={0} max={1} step={0.05}
                aria-label={t('Opacity')}
                value={sum?.opacity ?? style.opacity}
                onChange={(e) => { const v = +e.target.value; setStyle({ opacity: v }); applyStyleToSelection({ opacity: v }); }}
                className="flex-1 accent-accent" />
              <span className="text-muted w-10 text-right tabular-nums">{Math.round((sum?.opacity ?? style.opacity) * 100)}%</span>
            </div>
            <div
              className="grid grid-cols-4 gap-1"
              role="group"
              aria-label={t('Opacity presets')}
              aria-describedby="properties-opacity-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, OPACITY_PRESETS, sum?.opacity ?? style.opacity, (opacity) => { setStyle({ opacity }); applyStyleToSelection({ opacity }); }, (opacity) => setReviewedOpacityPreset(`${t('Opacity')} ${Math.round(opacity * 100)}%`))}
            >
              <span id="properties-opacity-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedOpacityPreset || t('Opacity presets')}`}
              </span>
              {OPACITY_PRESETS.map((opacity) => {
                const active = Math.abs((sum?.opacity ?? style.opacity) - opacity) < 0.001;
                return (
                  <button
                    key={opacity}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setStyle({ opacity }); applyStyleToSelection({ opacity }); }}
                    onFocus={() => setReviewedOpacityPreset(`${t('Opacity')} ${Math.round(opacity * 100)}%`)}
                    data-value={opacity}
                    className={`rounded-md border px-1.5 py-1 text-xs tabular-nums transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                  >
                    {Math.round(opacity * 100)}%
                  </button>
                );
              })}
            </div>
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
                <div className="space-y-1.5">
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
                  <div
                    className="grid grid-cols-6 gap-1"
                    role="group"
                    aria-label={t('Gradient angle presets')}
                    aria-describedby="properties-gradient-angle-preset-review-status"
                    title={t('Use Left/Right arrows to switch options')}
                    onKeyDown={(event) => handleNumberPresetKeys(event, GRADIENT_ANGLE_PRESETS, gradAngle, setGradAngle, (angle) => setReviewedGradientAnglePreset(`${t('Angle')} ${angle}°`))}
                  >
                    <span id="properties-gradient-angle-preset-review-status" className="sr-only" aria-live="polite">
                      {`${t('Reviewing')} ${reviewedGradientAnglePreset || t('Gradient angle presets')}`}
                    </span>
                    {GRADIENT_ANGLE_PRESETS.map((angle) => {
                      const active = Math.abs(gradAngle - angle) < 0.001;
                      return (
                        <button
                          key={angle}
                          type="button"
                          aria-pressed={active}
                          className={`btn px-1 py-0.5 text-[10px] tabular-nums ${active ? 'border-accent2 bg-accent2/15 text-ink' : ''}`}
                          data-value={angle}
                          onClick={() => setGradAngle(angle)}
                          onFocus={() => setReviewedGradientAnglePreset(`${t('Angle')} ${angle}°`)}
                        >
                          {angle}°
                        </button>
                      );
                    })}
                  </div>
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
          <div
            className="grid grid-cols-2 gap-1"
            role="group"
            aria-label={t('Pattern kind')}
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={handlePatternKindKeys}
          >
            {PATTERN_KIND_ACTIONS.map((kind) => {
              const active = patternKind === kind;
              const label = kind === 'checker' ? t('Checker') : kind === 'stripes' ? t('Stripes') : kind === 'dots' ? t('Dots') : t('Crosshatch');
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  title={label}
                  data-value={kind}
                  onClick={() => applyPatternPreset(kind)}
                  className={`rounded-md border px-2 py-1.5 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  <PatternPreview kind={kind} color1={patternColor1} color2={patternColor2} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
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
          <div className="space-y-1">
            <RowInput
              type="number"
              min={2}
              step={1}
              value={patternSize}
              onChange={(e) => setPatternSize(+e.target.value)}
              className="input-num"
              aria-label={t('Pattern size')}
            />
            <div
              className="grid grid-cols-6 gap-1"
              role="group"
              aria-label={t('Pattern size presets')}
              aria-describedby="properties-pattern-size-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, PATTERN_SIZE_PRESETS, patternSize, (size) => applyPatternPreset(patternKind, size), (size) => setReviewedPatternSizePreset(`${t('Pattern size')} ${size}`))}
            >
              <span id="properties-pattern-size-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedPatternSizePreset || t('Pattern size presets')}`}
              </span>
              {PATTERN_SIZE_PRESETS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`btn !py-1 !px-1 !text-[10px] ${patternSize === size ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => applyPatternPreset(patternKind, size)}
                  onFocus={() => setReviewedPatternSizePreset(`${t('Pattern size')} ${size}`)}
                  aria-pressed={patternSize === size}
                  data-value={size}
                  title={t('Apply pattern size preset')}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
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
            <Row label={t('Shadow presets')}>
              <div
                className="grid grid-cols-2 gap-1"
                role="group"
                aria-label={t('Shadow presets')}
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={handleShadowPresetKeys}
              >
                {SHADOW_PRESETS.map((preset) => {
                  const active = preset.value
                    ? shadow.enabled
                      && shadow.color === preset.value.color
                      && shadow.blur === preset.value.blur
                      && shadow.offsetX === preset.value.offsetX
                      && shadow.offsetY === preset.value.offsetY
                    : !shadow.enabled;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-value={preset.id}
                      aria-pressed={active}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:border-accent2/60 hover:text-ink'}`}
                      onClick={() => applyShadowPreset(preset)}
                    >
                      {t(preset.label)}
                    </button>
                  );
                })}
              </div>
            </Row>
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
          <button type="button" onClick={clearImageFiltersFromPanel} className="btn" title={t('Clear Image Filters')}>{t('None')}</button>
          <button type="button" onClick={() => applyPanelBlur(0.2)} className="btn" title={t('Gaussian blur')}>{t('Blur')}</button>
          <button type="button" onClick={() => applySepia()} className="btn" title={t('Sepia')}>{t('Sepia')}</button>
          <button type="button" onClick={() => applyGrayscale()} className="btn" title={t('Grayscale')}>{t('Gray')}</button>
          <button type="button" onClick={() => applyPanelBrightness(0.15)} className="btn" title={t('Brightness +')}>B+</button>
          <button type="button" onClick={() => applyPanelBrightness(-0.15)} className="btn" title={t('Brightness -')}>B-</button>
          <button type="button" onClick={() => applyPanelContrast(0.15)} className="btn" title={t('Contrast +')}>C+</button>
          <button type="button" onClick={() => applyPanelContrast(-0.15)} className="btn" title={t('Contrast -')}>C-</button>
          <button type="button" onClick={() => applyPanelHueRotate(60)} className="btn" title={t('Hue rotate')}>{t('Hue')}</button>
        </div>
        <h4 className="field-label mt-3 mb-1">{t('Custom')}</h4>
        <Row label="Blur">
          <div className="space-y-1">
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
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={t('Blur presets')}
              aria-describedby="properties-blur-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, FILTER_BLUR_PRESETS, fxBlur, applyPanelBlur, (amount) => setReviewedBlurPreset(`${t('Blur')} ${amount.toFixed(1)}`))}
            >
              <span id="properties-blur-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedBlurPreset || t('Blur presets')}`}
              </span>
              {FILTER_BLUR_PRESETS.map((amount) => {
                const active = Math.abs(fxBlur - amount) < 0.001;
                return (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={active}
                    className={`btn px-2 py-0.5 text-[11px] ${active ? 'border-accent2 bg-accent2/15 text-ink' : ''}`}
                    data-value={amount}
                    onClick={() => applyPanelBlur(amount)}
                    onFocus={() => setReviewedBlurPreset(`${t('Blur')} ${amount.toFixed(1)}`)}
                  >
                    {amount.toFixed(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>
        <Row label="Bright">
          <div className="space-y-1">
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
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={t('Brightness presets')}
              aria-describedby="properties-brightness-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, FILTER_TONE_PRESETS, fxBrightness, applyPanelBrightness, (amount) => setReviewedBrightnessPreset(`${t('Brightness')} ${amount > 0 ? '+' : ''}${amount.toFixed(2)}`))}
            >
              <span id="properties-brightness-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedBrightnessPreset || t('Brightness presets')}`}
              </span>
              {FILTER_TONE_PRESETS.map((amount) => {
                const active = Math.abs(fxBrightness - amount) < 0.001;
                return (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={active}
                    className={`btn px-2 py-0.5 text-[11px] ${active ? 'border-accent2 bg-accent2/15 text-ink' : ''}`}
                    data-value={amount}
                    onClick={() => applyPanelBrightness(amount)}
                    onFocus={() => setReviewedBrightnessPreset(`${t('Brightness')} ${amount > 0 ? '+' : ''}${amount.toFixed(2)}`)}
                  >
                    {amount > 0 ? '+' : ''}{amount.toFixed(2)}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>
        <Row label="Contrast">
          <div className="space-y-1">
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
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={t('Contrast presets')}
              aria-describedby="properties-contrast-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, FILTER_TONE_PRESETS, fxContrast, applyPanelContrast, (amount) => setReviewedContrastPreset(`${t('Contrast')} ${amount > 0 ? '+' : ''}${amount.toFixed(2)}`))}
            >
              <span id="properties-contrast-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedContrastPreset || t('Contrast presets')}`}
              </span>
              {FILTER_TONE_PRESETS.map((amount) => {
                const active = Math.abs(fxContrast - amount) < 0.001;
                return (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={active}
                    className={`btn px-2 py-0.5 text-[11px] ${active ? 'border-accent2 bg-accent2/15 text-ink' : ''}`}
                    data-value={amount}
                    onClick={() => applyPanelContrast(amount)}
                    onFocus={() => setReviewedContrastPreset(`${t('Contrast')} ${amount > 0 ? '+' : ''}${amount.toFixed(2)}`)}
                  >
                    {amount > 0 ? '+' : ''}{amount.toFixed(2)}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>
        <Row label="Hue">
          <div className="space-y-1">
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
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={t('Hue presets')}
              aria-describedby="properties-hue-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleNumberPresetKeys(event, FILTER_HUE_PRESETS, fxHue, applyPanelHueRotate, (degrees) => setReviewedHuePreset(`${t('Hue')} ${degrees > 0 ? '+' : ''}${degrees}°`))}
            >
              <span id="properties-hue-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedHuePreset || t('Hue presets')}`}
              </span>
              {FILTER_HUE_PRESETS.map((degrees) => {
                const active = fxHue === degrees;
                return (
                  <button
                    key={degrees}
                    type="button"
                    aria-pressed={active}
                    className={`btn px-2 py-0.5 text-[11px] ${active ? 'border-accent2 bg-accent2/15 text-ink' : ''}`}
                    data-value={degrees}
                    onClick={() => applyPanelHueRotate(degrees)}
                    onFocus={() => setReviewedHuePreset(`${t('Hue')} ${degrees > 0 ? '+' : ''}${degrees}°`)}
                  >
                    {degrees > 0 ? '+' : ''}{degrees}°
                  </button>
                );
              })}
            </div>
          </div>
        </Row>
        <button type="button" onClick={clearImageFiltersFromPanel} className="btn w-full mt-1">
          {t('Clear Image Filters')}
        </button>
      </div>

      {/* Advanced stroke */}
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Advanced stroke')}</h3>
        <Row label={t('Dash')}>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={t('Dash')}
            aria-describedby="properties-dash-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleStrokeOptionKeys(event, DASH_STYLE_ACTIONS, dashKey, applyDashPreset, (key) => setReviewedDashPreset(dashPresetLabel(key, t)))}
          >
            <span id="properties-dash-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedDashPreset || t('Dash')}`}
            </span>
            {DASH_STYLE_ACTIONS.map((key) => {
              const active = dashKey === key;
              const label = dashPresetLabel(key, t);
              const dash = key === 'solid' ? '' : key === 'dashed' ? '6 4' : '1 4';
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  title={label}
                  data-value={key}
                  onClick={() => applyDashPreset(key)}
                  onFocus={() => setReviewedDashPreset(label)}
                  className={`h-9 rounded-md border px-2 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  <svg viewBox="0 0 64 16" className="mb-0.5 h-3 w-full" aria-hidden="true">
                    <line x1="6" y1="8" x2="58" y2="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={dash} />
                  </svg>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t('Custom dash')}>
          {/* Space/comma-separated dash & gap lengths (px) — perforation / cut
           *  lines need exact patterns the presets can't express. Applies live;
           *  an empty field is ignored so it doesn't clobber the preset. */}
          <RowInput
            className="input-num"
            aria-label={t('Custom dash')}
            placeholder="10 5 2 5"
            value={dashCustom}
            onChange={(e) => {
              const raw = e.target.value;
              setDashCustom(raw);
              const arr = raw.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
              if (arr.length >= 1 && arr.some((n) => n > 0)) {
                applyStrokeStyleToSelection({ strokeDashArray: arr });
              }
            }}
          />
        </Row>
        <Row label={t('Line cap')}>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={t('Line cap')}
            aria-describedby="properties-line-cap-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleStrokeOptionKeys(event, LINE_CAP_ACTIONS, lineCap, applyLineCapPreset, (cap) => setReviewedLineCapPreset(`${t('Line cap')} ${lineCapLabel(cap, t)}`))}
          >
            <span id="properties-line-cap-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedLineCapPreset || t('Line cap')}`}
            </span>
            {LINE_CAP_ACTIONS.map((cap) => {
              const active = lineCap === cap;
              const label = lineCapLabel(cap, t);
              return (
                <button
                  key={cap}
                  type="button"
                  aria-pressed={active}
                  title={label}
                  data-value={cap}
                  onClick={() => applyLineCapPreset(cap)}
                  onFocus={() => setReviewedLineCapPreset(`${t('Line cap')} ${label}`)}
                  className={`h-9 rounded-md border px-2 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  <svg viewBox="0 0 64 16" className="mb-0.5 h-3 w-full" aria-hidden="true">
                    <line x1="14" y1="8" x2="50" y2="8" stroke="currentColor" strokeWidth="6" strokeLinecap={cap} />
                    <line x1="14" y1="3" x2="14" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.35" />
                    <line x1="50" y1="3" x2="50" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.35" />
                  </svg>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t('Line join')}>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={t('Line join')}
            aria-describedby="properties-line-join-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleStrokeOptionKeys(event, LINE_JOIN_ACTIONS, lineJoin, applyLineJoinPreset, (join) => setReviewedLineJoinPreset(`${t('Line join')} ${lineJoinLabel(join, t)}`))}
          >
            <span id="properties-line-join-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedLineJoinPreset || t('Line join')}`}
            </span>
            {LINE_JOIN_ACTIONS.map((join) => {
              const active = lineJoin === join;
              const label = lineJoinLabel(join, t);
              const points = join === 'bevel' ? '22,13 32,3 42,13' : '21,13 32,3 43,13';
              return (
                <button
                  key={join}
                  type="button"
                  aria-pressed={active}
                  title={label}
                  data-value={join}
                  onClick={() => applyLineJoinPreset(join)}
                  onFocus={() => setReviewedLineJoinPreset(`${t('Line join')} ${label}`)}
                  className={`h-9 rounded-md border px-2 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  <svg viewBox="0 0 64 16" className="mb-0.5 h-3 w-full" aria-hidden="true">
                    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="butt" strokeLinejoin={join} />
                  </svg>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </Row>
        {lineJoin === 'miter' && (
          <Row label={t('Miter limit')}>
            {/* How far a sharp corner may extend before it's clipped to a bevel
             *  (SVG stroke-miterlimit). Only meaningful for miter joins. */}
            <div className="space-y-1">
              <RowInput
                type="number"
                min={1}
                step={1}
                className="input-num"
                aria-label={t('Miter limit')}
                value={String(miterLimit)}
                onChange={(e) => {
                  const v = Math.max(1, parseFloat(e.target.value) || 4);
                  setMiterLimit(v);
                  applyStrokeStyleToSelection({ strokeMiterLimit: v });
                }}
              />
              <div
                className="grid grid-cols-4 gap-1"
                role="group"
                aria-label={t('Miter limit presets')}
                aria-describedby="properties-miter-limit-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleNumberPresetKeys(event, MITER_LIMIT_PRESETS, miterLimit, (limit) => { setMiterLimit(limit); applyStrokeStyleToSelection({ strokeMiterLimit: limit }); }, (limit) => setReviewedMiterLimitPreset(`${t('Miter limit')} ${limit}`))}
              >
                <span id="properties-miter-limit-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedMiterLimitPreset || t('Miter limit presets')}`}
                </span>
                {MITER_LIMIT_PRESETS.map((limit) => {
                  const active = Math.abs(miterLimit - limit) < 0.001;
                  return (
                    <button
                      key={limit}
                      type="button"
                      aria-pressed={active}
                      data-value={limit}
                      className={`rounded-md border px-1.5 py-1 text-[11px] tabular-nums transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onClick={() => {
                        setMiterLimit(limit);
                        applyStrokeStyleToSelection({ strokeMiterLimit: limit });
                      }}
                      onFocus={() => setReviewedMiterLimitPreset(`${t('Miter limit')} ${limit}`)}
                    >
                      {limit}
                    </button>
                  );
                })}
              </div>
            </div>
          </Row>
        )}
        <Row label={t('Stroke alignment')}>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t('Stroke alignment')}
            aria-describedby="properties-stroke-align-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleStrokeOptionKeys(event, STROKE_ALIGN_ACTIONS, strokeAlign, applyStrokeAlignPreset, (mode) => setReviewedStrokeAlignPreset(`${t('Stroke alignment')} ${strokeAlignLabel(mode, t)}`))}
          >
            <span id="properties-stroke-align-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedStrokeAlignPreset || t('Stroke alignment')}`}
            </span>
            {STROKE_ALIGN_ACTIONS.map((mode) => {
              const active = strokeAlign === mode;
              const label = strokeAlignLabel(mode, t);
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  data-value={mode}
                  onClick={() => applyStrokeAlignPreset(mode)}
                  onFocus={() => setReviewedStrokeAlignPreset(`${t('Stroke alignment')} ${label}`)}
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
        <Row label={t('Constant width')}>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={strokeUniform}
              onChange={(e) => { setStrokeUniformState(e.target.checked); setUniformStroke(e.target.checked); }}
            />
            <span>{t('Keep stroke width when scaling')}</span>
          </label>
        </Row>
        <Row label={t('Width profile')}>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={t('Width profile')}
            title={t('Apply variable width profile')}
          >
            {WIDTH_PROFILES.map((profile) => (
              <button
                key={profile}
                type="button"
                className="btn !py-1 !px-1 !text-[10px]"
                title={widthProfileLabel(profile, t)}
                onClick={() => applyWidthProfileToSelection(profile)}
              >
                {widthProfileShortLabel(profile, t)}
              </button>
            ))}
          </div>
        </Row>
      </div>

      {/* Blend mode */}
      <div className="panel-section p-3">
        <h3 className="field-label mb-2">{t('Blend mode')}</h3>
        <Row label={t('Quick modes')}>
          <div
            className="grid grid-cols-2 gap-1"
            role="group"
            aria-label={t('Blend mode')}
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={handleBlendModeKeys}
          >
            {QUICK_BLEND_MODES.map((mode) => {
              const active = blendMode === mode;
              const label = blendModeLabel(mode, t);
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  title={label}
                  data-value={mode}
                  onClick={() => applyBlendModePreset(mode)}
                  className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  <BlendPreview mode={mode} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t('All modes')}>
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
              <option key={m} value={m}>{blendModeLabel(m, t)}</option>
            ))}
          </RowSelect>
        </Row>
      </div>

      {sum && (
        <div className="panel-section p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="field-label">{t('Transform')}</h3>
            <div
              className="flex gap-0.5"
              role="radiogroup"
              aria-label={t('Unit')}
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={handleTransformUnitKeys}
            >
              {(['mm', 'px'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={xfUnit === u}
                  data-value={u}
                  onClick={() => changeUnit(u)}
                  className={
                    'px-1.5 py-0.5 rounded text-[10px] border transition-colors ' +
                    (xfUnit === u
                      ? 'bg-accent/15 text-ink border-accent hover:bg-accent/20'
                      : 'bg-panel2 border-border text-muted hover:bg-panel3')
                  }
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label={t('X')} value={toU(sum.left)} onChange={(v) => applyTransformToSelection({ left: fromU(v) })} />
            <NumField label={t('Y')} value={toU(sum.top)} onChange={(v) => applyTransformToSelection({ top: fromU(v) })} />
            <NumField label={t('W')} value={toU(sum.width)} onChange={(v) => applyTransformToSelection({ width: fromU(v) })} />
            <NumField label={t('H')} value={toU(sum.height)} onChange={(v) => applyTransformToSelection({ height: fromU(v) })} />
            <NumField label={t('Rot')} value={sum.angle} onChange={(v) => applyTransformToSelection({ angle: v })} />
          </div>
          <div
            className="grid grid-cols-6 gap-1 mt-2"
            role="group"
            aria-label={t('Size scale presets')}
            aria-describedby="properties-transform-scale-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => {
              const c = getCanvas();
              const baseWidth = c?.getActiveObject()?.width ?? 0;
              const currentScale = baseWidth > 0 ? Math.round((sum.width / baseWidth) * 100) : 100;
              handleNumberPresetKeys(event, TRANSFORM_SCALE_PRESETS, currentScale, applyScalePreset, (scale) => setReviewedTransformScalePreset(`${t('Scale')} ${scale}%`));
            }}
          >
            <span id="properties-transform-scale-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedTransformScalePreset || t('Size scale presets')}`}
            </span>
            {TRANSFORM_SCALE_PRESETS.map((scale) => {
              const c = getCanvas();
              const activeObject = c?.getActiveObject();
              const baseWidth = activeObject?.width ?? 0;
              const currentScale = baseWidth > 0 ? Math.round((sum.width / baseWidth) * 100) : 100;
              const active = Math.abs(currentScale - scale) <= 1;
              return (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={active}
                  title={`${t('Scale')} ${scale}%`}
                  onClick={() => applyScalePreset(scale)}
                  onFocus={() => setReviewedTransformScalePreset(`${t('Scale')} ${scale}%`)}
                  data-value={scale}
                  className={`px-1.5 py-1 rounded border text-[10px] tabular-nums transition-colors ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  {scale}%
                </button>
              );
            })}
          </div>
          <div
            className="grid grid-cols-3 gap-1 mt-2"
            role="group"
            aria-label={t('Fit size presets')}
            aria-describedby="properties-fit-size-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleTransformActionKeys(event, FIT_SIZE_ACTIONS, isFitWidth ? 'fit-width' : isFitHeight ? 'fit-height' : 'fit-page', applyFitPreset, (mode) => setReviewedFitPreset(transformActionLabel(mode, t)))}
          >
            <span id="properties-fit-size-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedFitPreset || t('Fit size presets')}`}
            </span>
            <button
              type="button"
              aria-pressed={isFitWidth}
              title={t('Fit width to document')}
              data-value="fit-width"
              onClick={() => applyFitPreset('fit-width')}
              onFocus={() => setReviewedFitPreset(transformActionLabel('fit-width', t))}
              className={transformPresetClass(isFitWidth)}
            >
              {t('Fit W')}
            </button>
            <button
              type="button"
              aria-pressed={isFitHeight}
              title={t('Fit height to document')}
              data-value="fit-height"
              onClick={() => applyFitPreset('fit-height')}
              onFocus={() => setReviewedFitPreset(transformActionLabel('fit-height', t))}
              className={transformPresetClass(isFitHeight)}
            >
              {t('Fit H')}
            </button>
            <button
              type="button"
              aria-pressed={isFitPage}
              title={t('Fit selection inside document')}
              data-value="fit-page"
              onClick={() => applyFitPreset('fit-page')}
              onFocus={() => setReviewedFitPreset(transformActionLabel('fit-page', t))}
              className={transformPresetClass(isFitPage)}
            >
              {t('Fit Page')}
            </button>
          </div>
          <div
            className="grid grid-cols-3 gap-1 mt-2"
            role="group"
            aria-label={t('Document center presets')}
            aria-describedby="properties-document-center-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleTransformActionKeys(event, DOCUMENT_CENTER_ACTIONS, isCenteredX && isCenteredY ? 'center' : isCenteredX ? 'center-x' : isCenteredY ? 'center-y' : 'center', applyCenterPreset, (mode) => setReviewedCenterPreset(transformActionLabel(mode, t)))}
          >
            <span id="properties-document-center-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedCenterPreset || t('Document center presets')}`}
            </span>
            <button
              type="button"
              aria-pressed={isCenteredX}
              title={t('Center horizontally in document')}
              data-value="center-x"
              onClick={() => applyCenterPreset('center-x')}
              onFocus={() => setReviewedCenterPreset(transformActionLabel('center-x', t))}
              className={transformPresetClass(isCenteredX)}
            >
              {t('Center X')}
            </button>
            <button
              type="button"
              aria-pressed={isCenteredY}
              title={t('Center vertically in document')}
              data-value="center-y"
              onClick={() => applyCenterPreset('center-y')}
              onFocus={() => setReviewedCenterPreset(transformActionLabel('center-y', t))}
              className={transformPresetClass(isCenteredY)}
            >
              {t('Center Y')}
            </button>
            <button
              type="button"
              aria-pressed={isCenteredX && isCenteredY}
              title={t('Center in document')}
              data-value="center"
              onClick={() => applyCenterPreset('center')}
              onFocus={() => setReviewedCenterPreset(transformActionLabel('center', t))}
              className={transformPresetClass(isCenteredX && isCenteredY)}
            >
              {t('Center')}
            </button>
          </div>
          <div
            className="grid grid-cols-4 gap-1 mt-2"
            role="group"
            aria-label={t('Rotation presets')}
            aria-describedby="properties-rotation-preset-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleNumberPresetKeys(event, ROTATION_PRESETS, Math.round(sum.angle), (angle) => applyTransformToSelection({ angle }), (angle) => setReviewedRotationPreset(`${t('Rotate')} ${angle}°`))}
          >
            <span id="properties-rotation-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedRotationPreset || t('Rotation presets')}`}
            </span>
            {ROTATION_PRESETS.map((angle) => {
              const active = Math.round(sum.angle) === angle;
              return (
                <button
                  key={angle}
                  type="button"
                  aria-pressed={active}
                  title={`${t('Rotate')} ${angle}°`}
                  onClick={() => applyTransformToSelection({ angle })}
                  onFocus={() => setReviewedRotationPreset(`${t('Rotate')} ${angle}°`)}
                  data-value={angle}
                  className={`px-2 py-1 rounded border text-[10px] tabular-nums transition-colors ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                >
                  {angle}°
                </button>
              );
            })}
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


function hydrateGradientFromObject(obj: unknown): { type: GradientType; angle: number; stops: GradientStop[] } | null {
  const fill = (obj as { fill?: unknown } | null | undefined)?.fill as {
    type?: string;
    coords?: { x1?: number; y1?: number; x2?: number; y2?: number };
    colorStops?: Array<{ offset?: number; color?: string }>;
  } | string | null | undefined;
  if (!fill || typeof fill === 'string' || (fill.type !== 'linear' && fill.type !== 'radial')) return null;
  const stops = Array.isArray(fill.colorStops)
    ? fill.colorStops
      .map(stop => ({ offset: Math.max(0, Math.min(1, Number(stop.offset ?? 0))), color: String(stop.color ?? '#000000') }))
      .sort((a, b) => a.offset - b.offset)
    : [];
  if (stops.length < 2) return null;
  const coords = fill.coords ?? {};
  const dx = Number(coords.x2 ?? 0) - Number(coords.x1 ?? 0);
  const dy = Number(coords.y2 ?? 0) - Number(coords.y1 ?? 0);
  const angle = Number.isFinite(dx) && Number.isFinite(dy)
    ? Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    : 90;
  return { type: fill.type, angle, stops };
}

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



function blendModeLabel(mode: GlobalCompositeOperation, t: (key: string) => string): string {
  if (mode === 'source-over') return t('Normal');
  if (mode === 'multiply') return t('Multiply');
  if (mode === 'screen') return t('Screen');
  if (mode === 'overlay') return t('Overlay');
  if (mode === 'darken') return t('Darken');
  if (mode === 'lighten') return t('Lighten');
  if (mode === 'difference') return t('Difference');
  return mode;
}

function transformActionLabel(action: typeof FIT_SIZE_ACTIONS[number] | typeof DOCUMENT_CENTER_ACTIONS[number], t: (key: string) => string): string {
  if (action === 'fit-width') return t('Fit width to document');
  if (action === 'fit-height') return t('Fit height to document');
  if (action === 'fit-page') return t('Fit selection inside document');
  if (action === 'center-x') return t('Center horizontally in document');
  if (action === 'center-y') return t('Center vertically in document');
  return t('Center in document');
}

function dashPresetLabel(key: keyof typeof DASH_PRESETS, t: (key: string) => string): string {
  if (key === 'solid') return t('Solid');
  if (key === 'dashed') return t('Dashed');
  return t('Dotted');
}

function lineCapLabel(cap: CanvasLineCap, t: (key: string) => string): string {
  if (cap === 'butt') return t('Butt');
  if (cap === 'round') return t('Round');
  return t('Square');
}

function lineJoinLabel(join: CanvasLineJoin, t: (key: string) => string): string {
  if (join === 'miter') return t('Miter');
  if (join === 'round') return t('Round');
  return t('Bevel');
}


function widthProfileLabel(profile: WidthProfile, t: (key: string) => string): string {
  switch (profile) {
    case 'taper-start': return t('Taper Start');
    case 'taper-end': return t('Taper End');
    case 'taper-both': return t('Taper Both');
    case 'bulge': return t('Bulge');
    case 'hourglass': return t('Hourglass');
    default: return t('Uniform');
  }
}

function widthProfileShortLabel(profile: WidthProfile, t: (key: string) => string): string {
  switch (profile) {
    case 'taper-start': return t('Start');
    case 'taper-end': return t('End');
    case 'taper-both': return t('Both');
    case 'bulge': return t('Bulge');
    case 'hourglass': return t('Hourglass');
    default: return t('Uniform');
  }
}

function strokeAlignLabel(mode: StrokeAlign, t: (key: string) => string): string {
  if (mode === 'center') return t('Center');
  if (mode === 'inside') return t('Inside');
  return t('Outside');
}

function BlendPreview({ mode }: { mode: GlobalCompositeOperation }) {
  const cssMode: React.CSSProperties['mixBlendMode'] = mode === 'source-over' ? 'normal' : mode as React.CSSProperties['mixBlendMode'];
  return (
    <svg viewBox="0 0 48 22" className="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true">
      <rect x="0" y="0" width="48" height="22" fill="#f6d365" />
      <circle cx="19" cy="11" r="9" fill="#3d9bff" opacity="0.9" />
      <circle cx="29" cy="11" r="9" fill="#ff4fa3" opacity="0.9" style={{ mixBlendMode: cssMode }} />
    </svg>
  );
}

function PatternPreview({ kind, color1, color2 }: { kind: PatternKind; color1: string; color2: string }) {
  const safeColor1 = color1.startsWith('#') ? color1 : '#ffffff';
  const safeColor2 = color2.startsWith('#') ? color2 : '#000000';
  return (
    <svg viewBox="0 0 48 22" className="mb-1 h-5 w-full rounded-sm border border-border/60 bg-panel" aria-hidden="true">
      <rect width="48" height="22" fill={safeColor1} />
      {kind === 'checker' && Array.from({ length: 4 }, (_, row) => Array.from({ length: 8 }, (_, col) => (
        (row + col) % 2 === 0 ? <rect key={`${row}-${col}`} x={col * 6} y={row * 6} width="6" height="6" fill={safeColor2} /> : null
      )))}
      {kind === 'stripes' && Array.from({ length: 6 }, (_, index) => (
        <rect key={index} x={index * 10 - 2} y="0" width="5" height="28" fill={safeColor2} transform="rotate(25 24 11)" />
      ))}
      {kind === 'dots' && Array.from({ length: 3 }, (_, row) => Array.from({ length: 6 }, (_, col) => (
        <circle key={`${row}-${col}`} cx={4 + col * 8 + (row % 2) * 4} cy={5 + row * 6} r="1.8" fill={safeColor2} />
      )))}
      {kind === 'crosshatch' && (
        <>
          {Array.from({ length: 6 }, (_, index) => (
            <line key={`a${index}`} x1={index * 10 - 10} y1="22" x2={index * 10 + 12} y2="0" stroke={safeColor2} strokeWidth="1.5" />
          ))}
          {Array.from({ length: 6 }, (_, index) => (
            <line key={`b${index}`} x1={index * 10 - 10} y1="0" x2={index * 10 + 12} y2="22" stroke={safeColor2} strokeWidth="1.5" />
          ))}
        </>
      )}
    </svg>
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
function Swatches() {
  const t = useT();
  const [swatches, setSwatches] = useState<string[]>(() => loadSwatches());
  const [activeSwatch, setActiveSwatch] = useState<string | null>(null);
  const style = useEditor(s => s.style);

  useEffect(() => { saveSwatches(swatches); }, [swatches]);

  const onClick = (e: React.MouseEvent, color: string) => {
    e.preventDefault();
    setActiveSwatch(color);
    applySwatchToSelection(color, e.altKey ? 'stroke' : 'fill');
  };

  const onContext = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    if (activeSwatch && normalizeSwatchColor(activeSwatch) === normalizeSwatchColor(swatches[idx])) setActiveSwatch(null);
    setSwatches(swatches.filter((_, i) => i !== idx));
  };

  const addCurrent = () => {
    const c = style.fill;
    if (!c || typeof c !== 'string') return;
    const next = addSavedSwatchColor(c);
    if (next.length !== swatches.length) setSwatches(next);
  };

  // Harvest every solid fill/stroke colour used in the selection into swatches.
  const collectColors = () => {
    const result = collectSelectionColorsIntoSwatches();
    if (result.added) setSwatches(result.swatches);
  };

  const replaceGlobal = () => {
    const target = typeof style.fill === 'string' ? style.fill : '';
    if (!activeSwatch || !target || normalizeSwatchColor(activeSwatch) === normalizeSwatchColor(target)) return;
    const result = replaceSavedSwatchWithColor(activeSwatch, target);
    setSwatches(result.swatches);
    setActiveSwatch(target);
  };

  const selectSwatchArt = () => {
    if (!activeSwatch) return;
    selectObjectsUsingSwatch(activeSwatch);
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
            className={`w-5 h-5 rounded-sm border hover:scale-110 transition-transform ${activeSwatch && normalizeSwatchColor(activeSwatch) === normalizeSwatchColor(c) ? 'border-accent ring-1 ring-accent' : 'border-border'}`}
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
        <button
          type="button"
          title={t('Collect colours from selection')}
          aria-label={t('Collect colours from selection')}
          onClick={collectColors}
          className="w-5 h-5 rounded-sm border border-border bg-panel2 text-muted hover:text-ink hover:bg-panel3 transition-colors flex items-center justify-center"
        ><Pipette size={11} aria-hidden="true" /></button>
        <button
          type="button"
          title={t('Select art using selected swatch')}
          aria-label={t('Select art using selected swatch')}
          disabled={!activeSwatch}
          onClick={selectSwatchArt}
          className="w-5 h-5 rounded-sm border border-border bg-panel2 text-muted hover:text-ink hover:bg-panel3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
        ><MousePointerClick size={11} aria-hidden="true" /></button>
        <button
          type="button"
          title={t('Replace selected global swatch with current fill')}
          aria-label={t('Replace selected global swatch with current fill')}
          disabled={!activeSwatch || typeof style.fill !== 'string' || normalizeSwatchColor(activeSwatch) === normalizeSwatchColor(style.fill)}
          onClick={replaceGlobal}
          className="h-5 px-1 rounded-sm border border-border bg-panel2 text-muted hover:text-ink hover:bg-panel3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[10px] leading-none"
        >{t('Global')}</button>
      </div>
    </div>
  );
}


// ---------- Graphic Styles ----------
function GraphicStyles() {
  const t = useT();
  const [styles, setStyles] = useState<GraphicStyle[]>(() => loadGraphicStyles());
  const hasSelection = useEditor(s => s.selectionIds.length > 0);

  useEffect(() => { saveGraphicStyles(styles); }, [styles]);

  const applyStyle = (style: GraphicStyle) => {
    applyGraphicStyleToSelection(style);
  };

  const addFromSelection = () => {
    const next = saveGraphicStyleFromSelection(`${t('Style')} ${styles.length + 1}`);
    if (!next) return;
    setStyles([...styles, next]);
  };

  const removeStyle = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    if (removeGraphicStyle(id)) setStyles(loadGraphicStyles());
  };

  const selectStyleArt = (event: React.MouseEvent, style: GraphicStyle) => {
    event.preventDefault();
    event.stopPropagation();
    selectObjectsUsingGraphicStyle(style);
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-muted text-[10px] mb-1">
        <span>{t('Graphic Styles')}</span>
        <span className="opacity-60">{t('Click = apply · right-click = remove')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {styles.map((style) => (
          <span key={style.id} className="relative group/style">
            <button
              type="button"
              title={`${style.name} · ${t('Click to apply graphic style')}`}
              aria-label={`${t('Apply graphic style')} ${style.name}`}
              aria-disabled={!hasSelection}
              onClick={() => { if (hasSelection) applyStyle(style); }}
              onContextMenu={(event) => removeStyle(event, style.id)}
              className={`w-8 h-7 rounded border border-border bg-panel2 hover:border-accent2 transition overflow-hidden ${hasSelection ? '' : 'opacity-45'}`}
            >
              <span
                aria-hidden="true"
                className="block w-full h-full"
                style={{
                  background: style.fill || 'transparent',
                  border: `${Math.max(1, Math.min(4, style.strokeWidth || 1))}px solid ${style.stroke || 'transparent'}`,
                  opacity: style.opacity,
                  boxShadow: style.shadow ? `${style.shadow.offsetX / 2}px ${style.shadow.offsetY / 2}px ${Math.max(1, style.shadow.blur / 3)}px ${style.shadow.color}` : 'none',
                }}
              />
            </button>
            <button
              type="button"
              title={t('Select art using graphic style')}
              aria-label={`${t('Select art using graphic style')} ${style.name}`}
              onClick={(event) => selectStyleArt(event, style)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full border border-border bg-panel2 text-muted hover:text-accent2 hover:border-accent2 opacity-0 group-hover/style:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center"
            >
              <MousePointerClick size={9} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          title={t('Save selection as graphic style')}
          aria-label={t('Save selection as graphic style')}
          onClick={addFromSelection}
          disabled={!hasSelection}
          className="w-8 h-7 rounded border border-border bg-panel2 text-muted hover:text-ink hover:bg-panel3 transition-colors flex items-center justify-center text-[11px] leading-none disabled:opacity-45"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
