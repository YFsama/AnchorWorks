import { useState, useMemo } from 'react';
import { Sparkles, MousePointer2, Send, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { markOnboarded } from '../lib/onboarding';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { listTools } from '../lib/tools/types';

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}

function ShortcutLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{v}</span>
      <kbd className="kbd-inline">{k}</kbd>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function Onboarding({ open, onClose }: Props) {
  const t = useT();
  const [i, setI] = useState(0);

  // Build slides reactively so they re-translate when language flips.
  const SLIDES: Slide[] = useMemo(() => [
    {
      icon: <Sparkles size={28} className="text-accent2" aria-hidden="true" />,
      title: t('Welcome to Anchorworks'),
      body: (
        <div className="space-y-2 text-sm text-ink/90">
          <p>{t('An AI-assisted vector editor built for designers and makers.')}</p>
          {/* `list-outside` + left padding produces proper hang-indent — the
              bullet sits in the gutter, wrapped lines align under the text.
              The default `list-inside` Tailwind pattern indents wrapped
              second lines under the bullet, which looks broken once any
              language wraps (notably zh, where the first bullet wraps at
              ~460px). */}
          <ul className="list-disc list-outside pl-5 space-y-1 text-muted">
            <li>{t('Powerful Fabric.js canvas with layers, smart guides, snap')}</li>
            <li>{t('SVG, PDF, DXF, PNG, JPG import & export')}</li>
            <li>{t('Boolean path operations and path editing')}</li>
            <li>{t('Direct plotter (G-code / HPGL) output')}</li>
          </ul>
          <p className="text-muted text-xs pt-1">{t('Press')} <kbd className="kbd-inline">F1</kbd> {t('to open the Help Center anytime.')}</p>
        </div>
      ),
    },
    {
      icon: <MousePointer2 size={28} className="text-accent" aria-hidden="true" />,
      title: t('Tools at a Glance'),
      // Generated from the ToolHandler registry — adding a new toolbar tool
      // in registerTools.ts auto-appears on this onboarding slide. Filter on
      // `icon && shortcut` (matches Toolbar / CommandPalette / keymap.ts
      // filters) so non-toolbar tools (directSelect) are excluded.
      body: (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {listTools()
            .filter(h => h.icon && h.shortcut)
            .map(h => <ShortcutLine key={h.id} k={h.shortcut!} v={t(h.label)} />)}
        </div>
      ),
    },
    {
      icon: <Sparkles size={28} className="text-accent2" aria-hidden="true" />,
      title: t('AI Assistant'),
      body: (
        <div className="space-y-2 text-sm text-ink/90">
          <p>{t('Click the orange')} <strong>{t('AI')}</strong> {t('button (top-right).')}</p>
          <p className="text-muted">
            {t('The assistant can see your canvas, suggest layouts, build shapes, align, distribute, and run boolean ops — all by chatting.')}
          </p>
          <p className="text-muted">
            {t('Bring your own Anthropic API key in the panel to get started.')}
          </p>
        </div>
      ),
    },
    {
      icon: <Send size={28} className="text-accent" aria-hidden="true" />,
      title: t('Plotter & Print'),
      body: (
        <div className="space-y-2 text-sm text-ink/90">
          <p>{t('Export from the')} <strong>{t('File')}</strong> {t('menu (SVG, PNG, PDF, DXF, JSON).')}</p>
          <p>
            <strong>{t('Send to Plotter')}</strong> {t('writes G-code or HPGL for pen plotters, laser engravers, and CNC.')}
          </p>
          <p><strong>{t('Print')}</strong> {t('opens the system print dialog with tiled support.')}</p>
        </div>
      ),
    },
  ], [t]);

  // Reset to the first slide whenever the dialog closes. Track the prop during
  // render so we don't cascade an extra render from inside an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setI(0);
  }

  // Escape closes (matches the rest of the dialog system). Mark onboarded
  // first so the user isn't prompted again next launch.
  const close = () => {
    markOnboarded();
    onClose();
  };
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;
  const next = () => (i < SLIDES.length - 1 ? setI(i + 1) : close());
  const prev = () => setI(Math.max(0, i - 1));
  const s = SLIDES[i];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        className="w-[460px] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-gradient-to-br from-accent to-accent2 flex items-center justify-center text-[10px] font-bold" aria-hidden="true">V</span>
            <h2 id="onboarding-title" className="text-xs font-semibold text-ink m-0">{t('Getting Started')}</h2>
          </div>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div id="onboarding-body" className="px-6 py-6">
          <div className="flex items-center gap-3 mb-3">
            {s.icon}
            <h3 className="type-display">{s.title}</h3>
          </div>
          <div className="min-h-[140px]">{s.body}</div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-panel2">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`${t('Slide')} ${idx + 1} ${t('of')} ${SLIDES.length}`}
                aria-current={idx === i ? 'step' : undefined}
                // Visible dot stays 8px (or 20px when active); the pseudo-
                // element `before` extends the tap area to ±8px around it so
                // mobile / coarse-pointer users get a ~24×24 hit target
                // without growing the dot's footprint or changing the row
                // layout. WCAG 2.5.5 (AAA) wants 44×44, AA wants 24×24 — 24
                // is the practical floor for a pagination dot.
                className={`relative w-2 h-2 rounded-full transition-all before:absolute before:-inset-2 before:content-[''] ${idx === i ? 'bg-accent2 w-5' : 'bg-border hover:bg-muted'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn flex items-center gap-1"
              onClick={prev}
              disabled={i === 0}
            >
              <ChevronLeft size={12} aria-hidden="true" />{t('Back')}
            </button>
            <button type="button" className="btn-primary flex items-center gap-1" onClick={next}>
              {i < SLIDES.length - 1 ? (<>{t('Next')}<ChevronRight size={12} aria-hidden="true" /></>) : t('Get Started')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
