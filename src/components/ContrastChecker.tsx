/**
 * ContrastChecker — live WCAG contrast read-out for selected text.
 *
 * Mounts inside PropertiesPanel after CharacterPanel when the selection is
 * an i-text / text / textbox. Subscribes to:
 *   - selectionSummary (fill, type) — the text colour
 *   - doc.background                — fallback background colour
 *
 * On every change we read the live active object via getCanvas() so we can
 * resolve the underlying background by sampling objects beneath the text's
 * bounding-box centre (see findBackgroundUnderObject). If that lookup fails
 * — common when text floats on the bare canvas — we fall back to the
 * document background.
 */
import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import {
  contrastRatio,
  findBackgroundUnderObject,
  wcagGrade,
} from '../lib/contrast';

export function ContrastChecker() {
  const t = useT();
  const selectionSummary = useEditor((s) => s.selectionSummary);
  const docBackground = useEditor((s) => s.doc.background);
  const selectionIds = useEditor((s) => s.selectionIds);
  // selectionIds.join() is included in the memo key so re-selecting a
  // different text object re-samples the background, not just when the
  // colour changes.
  const idKey = selectionIds.join(',');

  const { fg, bg, ratio, grade } = useMemo(() => {
    const fgColor = (selectionSummary?.fill || '#000000') as string;
    const canvas = getCanvas();
    const active = canvas?.getActiveObject() ?? null;
    const bgColor = findBackgroundUnderObject(
      active as Parameters<typeof findBackgroundUnderObject>[0],
      canvas as Parameters<typeof findBackgroundUnderObject>[1],
      docBackground,
    );
    const r = contrastRatio(fgColor, bgColor);
    return { fg: fgColor, bg: bgColor, ratio: r, grade: wcagGrade(r) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSummary?.fill, docBackground, idKey]);

  const pillClass =
    grade.label === 'Excellent' || grade.label === 'Good'
      ? 'bg-success/15 text-success border-success/40'
      : grade.label === 'Fair'
      ? 'bg-warn/15 text-warn border-warn/40'
      : 'bg-danger/15 text-danger border-danger/40';

  const ratioText = Number.isFinite(ratio) ? `${ratio.toFixed(2)} : 1` : '—';

  return (
    <div className="panel-section p-3">
      <h3 className="field-label mb-2">{t('Contrast')}</h3>

      {/* Row 1: swatch pair (text over background) */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1">
          <Swatch color={fg} title={`${t('Text')} ${fg}`} />
          <span className="text-[10px] text-muted" aria-hidden="true">/</span>
          <Swatch color={bg} title={`${t('Background')} ${bg}`} />
        </div>
        <PreviewChip fg={fg} bg={bg} />
      </div>

      {/* Row 2: large ratio number. Title alone isn't reliably announced on
       * non-interactive divs across screen readers, so the ratio also gets an
       * explicit aria-label with the WCAG context — SR users hear
       * "Contrast ratio WCAG 3.45 to 1" instead of an isolated number. */}
      <div
        className="text-2xl font-semibold text-ink leading-tight mb-1 tabular-nums"
        title={t('Contrast ratio (WCAG)')}
        aria-label={`${t('Contrast ratio (WCAG)')}: ${ratioText}`}
        role="img"
      >
        {ratioText}
      </div>

      {/* Row 3: status pill */}
      <div className="mb-2">
        <span
          className={`inline-block px-2 py-0.5 rounded-sm field-label !mb-0 border ${pillClass}`}
        >
          {t(grade.label)}
        </span>
      </div>

      {/* Row 4: WCAG badges */}
      <div className="grid grid-cols-4 gap-1">
        <Badge label="AA" pass={grade.passAA} title={t('WCAG AA — normal text (≥ 4.5:1)')} />
        <Badge label="AAA" pass={grade.passAAA} title={t('WCAG AAA — normal text (≥ 7:1)')} />
        <Badge label="AA Lg" pass={grade.passAALarge} title={t('WCAG AA — large text (≥ 3:1)')} />
        <Badge label="AAA Lg" pass={grade.passAAALarge} title={t('WCAG AAA — large text (≥ 4.5:1)')} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Swatch({ color, title }: { color: string; title: string }) {
  return (
    <div
      className="w-6 h-6 rounded-sm border border-border"
      style={{ background: color }}
      title={title}
      aria-label={title}
    />
  );
}

function PreviewChip({ fg, bg }: { fg: string; bg: string }) {
  const t = useT();
  // A tiny "Aa" preview lets you eyeball the pair without leaving the panel.
  return (
    <div
      className="ml-auto px-2 py-0.5 rounded-sm border border-border text-[11px] font-medium"
      style={{ background: bg, color: fg }}
      title={t('Preview')}
    >
      Aa
    </div>
  );
}

function Badge({ label, pass, title }: { label: string; pass: boolean; title: string }) {
  const t = useT();
  const cls = pass
    ? 'bg-success/15 text-success border-success/40'
    : 'bg-danger/15 text-danger border-danger/40';
  return (
    <div
      className={`flex items-center justify-center gap-1 px-1.5 py-1 rounded-sm border text-[10px] font-medium ${cls}`}
      title={title}
    >
      <span>{label}</span>
      {/* The visual icon is decorative; the SR-only status text after it
       * makes pass/fail explicit ("AA pass" vs "AA fail" instead of just
       * "AA"). */}
      {pass ? <Check size={10} strokeWidth={3} aria-hidden="true" /> : <X size={10} strokeWidth={3} aria-hidden="true" />}
      <span className="sr-only">{pass ? t('pass') : t('fail')}</span>
    </div>
  );
}
