import { useState } from 'react';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import { alignSelection, distributeSelection, distributeInArtboard, distributeSpacing, flipSelection, setKeyObject } from '../lib/canvasEngine';
import { toast } from '../lib/toast';
import { booleanOp, divideSelection, trimSelection } from '../lib/booleanOps';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';

export function AlignPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const selCount = useEditor(s => s.selectionIds.length);
  const selectionSummary = useEditor(s => s.selectionSummary);
  const artboardCount = useEditor(s => s.artboards.length);
  const [alignRef, setAlignRef] = useState<'selection' | 'artboard' | 'key'>('selection');
  const [keyed, setKeyed] = useState(false);
  const [spacingMm, setSpacingMm] = useState(5);
  // Aligning to the artboard / key object works on a single object; aligning to
  // the selection's own bounds needs 2+.
  const enoughForAlign = alignRef === 'artboard'
    ? (selCount >= 1 && artboardCount >= 1)
    : alignRef === 'key'
    ? (selCount >= 1 && keyed)
    : selCount >= 2;
  const enoughForDistribute = selCount >= 3;
  const enoughForBool = selCount >= 2;
  // Clip mask needs 2+ selected; compound needs 2+ (any objects we can rasterise
  // to a path-d). We let the underlying functions enforce the precise rules and
  // just gate the buttons on a basic count check.
  const enoughForMask = selCount >= 2;
  const canReleaseMask = selCount >= 1;
  const canReleaseCompound = selCount >= 1 && (selectionSummary?.type === 'path' || selectionSummary?.type === 'activeselection');

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="align-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Align & Distribute')}
          </span>
          <span className="panel-count">{selCount}</span>
        </button>
      </h3>
      {open && (
        <div id="align-panel-body" className="px-3 pb-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="field-label !mb-0">{t('Align')}</h4>
              <div className="flex items-center gap-1">
                {alignRef === 'key' && (
                  <button
                    type="button"
                    className="input-num !h-6 !py-0 !px-1.5 !text-[10px] !w-auto hover:text-ink"
                    onClick={() => { if (setKeyObject()) { setKeyed(true); toast.success(t('Key object set')); } else toast.warn(t('Select a single object first.')); }}
                    title={t('Set the selected object as the alignment key')}
                  >
                    {t('Set Key')}
                  </button>
                )}
                <select
                  className="input-num !h-6 !py-0 !text-[10px] !w-auto"
                  value={alignRef}
                  onChange={(e) => setAlignRef(e.target.value as 'selection' | 'artboard' | 'key')}
                  title={t('Align to')}
                  aria-label={t('Align to')}
                >
                  <option value="selection">{t('Selection')}</option>
                  <option value="artboard">{t('Artboard')}</option>
                  <option value="key">{t('Key Object')}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1">
              <Btn title={t('Align left')} disabled={!enoughForAlign} onClick={() => alignSelection('left', alignRef)}>
                <AlignStartVertical size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align center horizontally')} disabled={!enoughForAlign} onClick={() => alignSelection('centerH', alignRef)}>
                <AlignCenterVertical size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align right')} disabled={!enoughForAlign} onClick={() => alignSelection('right', alignRef)}>
                <AlignEndVertical size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align top')} disabled={!enoughForAlign} onClick={() => alignSelection('top', alignRef)}>
                <AlignStartHorizontal size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align center vertically')} disabled={!enoughForAlign} onClick={() => alignSelection('centerV', alignRef)}>
                <AlignCenterHorizontal size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align bottom')} disabled={!enoughForAlign} onClick={() => alignSelection('bottom', alignRef)}>
                <AlignEndHorizontal size={14} aria-hidden="true" />
              </Btn>
            </div>
          </div>

          <div>
            <h4 className="field-label">{t('Distribute')}</h4>
            {/* Two buttons in a `grid-cols-2` instead of `grid-cols-6` —
             * the Align row above naturally fills six cells, but Distribute
             * only has Horizontal + Vertical and the previous 6-col grid
             * left four empty cells on the right, giving the row a
             * lopsided "menu items hugging the left edge" feel. Two equal
             * half-width cells reads as a balanced pair. */}
            <div className="grid grid-cols-4 gap-1">
              <Btn title={t('Distribute horizontally (equal spacing)')} disabled={alignRef === 'artboard' ? !enoughForAlign : !enoughForDistribute} onClick={() => alignRef === 'artboard' ? distributeInArtboard('horizontal') : distributeSelection('horizontal')}>
                <AlignHorizontalSpaceAround size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Distribute vertically (equal spacing)')} disabled={alignRef === 'artboard' ? !enoughForAlign : !enoughForDistribute} onClick={() => alignRef === 'artboard' ? distributeInArtboard('vertical') : distributeSelection('vertical')}>
                <AlignVerticalSpaceAround size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Distribute horizontal centers')} disabled={!enoughForDistribute} onClick={() => distributeSelection('horizontal', 'center')}>
                <AlignHorizontalDistributeCenter size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Distribute vertical centers')} disabled={!enoughForDistribute} onClick={() => distributeSelection('vertical', 'center')}>
                <AlignVerticalDistributeCenter size={14} aria-hidden="true" />
              </Btn>
            </div>
            {/* Exact spacing — gap in mm between consecutive objects. */}
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number" min={0} step={0.5}
                value={spacingMm}
                onChange={(e) => setSpacingMm(Math.max(0, parseFloat(e.target.value) || 0))}
                className="input-num !h-6 !py-0 !text-[10px] w-14"
                aria-label={t('Spacing (mm)')}
                title={t('Exact gap between objects (mm)')}
              />
              <Btn title={t('Space horizontally by value')} disabled={selCount < 2} onClick={() => distributeSpacing('horizontal', spacingMm)}>
                <AlignHorizontalSpaceAround size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Space vertically by value')} disabled={selCount < 2} onClick={() => distributeSpacing('vertical', spacingMm)}>
                <AlignVerticalSpaceAround size={14} aria-hidden="true" />
              </Btn>
            </div>
          </div>

          <div>
            <h4 className="field-label">{t('Flip')}</h4>
            <div className="grid grid-cols-2 gap-1">
              <Btn title={`${t('Flip Horizontal')} (Shift+H)`} disabled={selCount < 1} onClick={() => flipSelection('x')}>
                <FlipHorizontal2 size={14} aria-hidden="true" />
              </Btn>
              <Btn title={`${t('Flip Vertical')} (Shift+V)`} disabled={selCount < 1} onClick={() => flipSelection('y')}>
                <FlipVertical2 size={14} aria-hidden="true" />
              </Btn>
            </div>
          </div>

          <div>
            <h4 className="field-label">{t('Pathfinder')}</h4>
            <div className="grid grid-cols-4 gap-1">
              <TextBtn title={t('Union of selected shapes')} disabled={!enoughForBool} onClick={() => booleanOp('union')}>{t('Union')}</TextBtn>
              <TextBtn title={t('Subtract top shape from bottom')} disabled={!enoughForBool} onClick={() => booleanOp('subtract')}>{t('Subtract')}</TextBtn>
              <TextBtn title={t('Intersection of shapes')} disabled={!enoughForBool} onClick={() => booleanOp('intersect')}>{t('Intersect')}</TextBtn>
              <TextBtn title={t('Exclude overlapping area')} disabled={!enoughForBool} onClick={() => booleanOp('exclude')}>{t('Exclude')}</TextBtn>
            </div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              <TextBtn title={t('Subtract back shape from front')} disabled={!enoughForBool} onClick={() => booleanOp('minus-back')}>{t('Minus Back')}</TextBtn>
              <TextBtn title={t('Split shapes into all their regions')} disabled={!enoughForBool} onClick={() => { divideSelection(); }}>{t('Divide')}</TextBtn>
              <TextBtn title={t('Front shape trims the back; both kept')} disabled={!enoughForBool} onClick={() => { trimSelection(); }}>{t('Trim')}</TextBtn>
            </div>
          </div>

          <div>
            <h4 className="field-label">{t('Mask / Compound')}</h4>
            <div className="grid grid-cols-2 gap-1">
              <TextBtn
                title={t('Use the top selected object to clip the others')}
                disabled={!enoughForMask}
                onClick={() => applyClipMask()}
              >
                {t('Make Clip Mask')}
              </TextBtn>
              <TextBtn
                title={t('Remove clip masks from the selection')}
                disabled={!canReleaseMask}
                onClick={() => releaseClipMask()}
              >
                {t('Release Clip Mask')}
              </TextBtn>
              <TextBtn
                title={t('Merge 2+ paths into a single compound path (even-odd fill)')}
                disabled={!enoughForMask}
                onClick={() => makeCompoundPath()}
              >
                {t('Compound Path')}
              </TextBtn>
              <TextBtn
                title={t('Split a compound path back into individual paths')}
                disabled={!canReleaseCompound}
                onClick={() => releaseCompoundPath()}
              >
                {t('Release Compound')}
              </TextBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  // Icon-only button — provide an explicit accessible name. `title` alone is
  // unreliable across screen readers (NVDA reads it inconsistently, VoiceOver
  // skips it in browse mode), so mirror the same string as aria-label so the
  // button is always announced as e.g. "Align left, button".
  //
  // When disabled, append the requirement so sighted users hovering get a
  // why-not explanation (every Align / Distribute / Pathfinder / Mask
  // operation needs ≥2 selected objects — the same threshold the upstream
  // `enoughForAlign` etc. flags check). Mirrors the conditional-title
  // pattern CharacterPanel uses for its "Text on Path" button.
  const t = useT();
  const tipText = disabled ? `${title} — ${t('Select 2 or more objects first')}` : title;
  return (
    <button
      type="button"
      title={tipText}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="h-8 flex items-center justify-center rounded bg-panel2 border border-border hover:bg-panel3 text-ink disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-panel2 transition-colors"
    >
      {children}
    </button>
  );
}

function TextBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  // Same "why disabled" treatment as the Btn helper above — every Pathfinder
  // / Mask / Compound operation requires ≥2 selected objects, so sighted
  // users hovering a dim button get a useful explanation rather than just
  // the unchanged action name.
  const t = useT();
  const tipText = disabled ? `${title} — ${t('Select 2 or more objects first')}` : title;
  return (
    <button
      type="button"
      title={tipText}
      onClick={onClick}
      disabled={disabled}
      className="h-7 flex items-center justify-center rounded bg-panel2 border border-border hover:bg-panel3 text-ink text-[10px] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-panel2 transition-colors"
    >
      {children}
    </button>
  );
}
