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
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { alignSelection, distributeSelection } from '../lib/canvasEngine';
import { booleanOp } from '../lib/booleanOps';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';

export function AlignPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const selCount = useEditor(s => s.selectionIds.length);
  const selectionSummary = useEditor(s => s.selectionSummary);
  const enoughForAlign = selCount >= 2;
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
            <h4 className="field-label">{t('Align')}</h4>
            <div className="grid grid-cols-6 gap-1">
              <Btn title={t('Align left')} disabled={!enoughForAlign} onClick={() => alignSelection('left')}>
                <AlignStartVertical size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align center horizontally')} disabled={!enoughForAlign} onClick={() => alignSelection('centerH')}>
                <AlignCenterVertical size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align right')} disabled={!enoughForAlign} onClick={() => alignSelection('right')}>
                <AlignEndVertical size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align top')} disabled={!enoughForAlign} onClick={() => alignSelection('top')}>
                <AlignStartHorizontal size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align center vertically')} disabled={!enoughForAlign} onClick={() => alignSelection('centerV')}>
                <AlignCenterHorizontal size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Align bottom')} disabled={!enoughForAlign} onClick={() => alignSelection('bottom')}>
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
            <div className="grid grid-cols-2 gap-1">
              <Btn title={t('Distribute horizontally (equal spacing)')} disabled={!enoughForDistribute} onClick={() => distributeSelection('horizontal')}>
                <AlignHorizontalSpaceAround size={14} aria-hidden="true" />
              </Btn>
              <Btn title={t('Distribute vertically (equal spacing)')} disabled={!enoughForDistribute} onClick={() => distributeSelection('vertical')}>
                <AlignVerticalSpaceAround size={14} aria-hidden="true" />
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
