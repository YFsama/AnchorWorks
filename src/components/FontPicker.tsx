import { useRef, useState } from 'react';
import { ALL_FONTS, ensureFontLoaded, loadCustomFontFile } from '../lib/fonts';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import * as fabric from 'fabric';
import { Upload, Search } from 'lucide-react';
import { useT } from '../lib/i18n';

export function FontPicker() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const apply = (family: string, name: string) => {
    ensureFontLoaded(name);
    const c = getCanvas(); if (!c) return;
    const a = c.getActiveObject();
    if (a && (a.type === 'i-text' || a.type === 'text' || a.type === 'textbox')) {
      (a as fabric.IText).set({ fontFamily: family });
      c.requestRenderAll();
      pushHistory();
    }
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const def = await loadCustomFontFile(f);
    apply(def.family, def.name);
    e.target.value = '';
  };
  const list = ALL_FONTS.filter(f => f.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 80);
  return (
    <div className="panel-section p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="field-label !mb-0">{t('Font')}</h3>
        <button
          className="btn flex items-center gap-1"
          onClick={() => fileRef.current?.click()}
          title={t('Upload a custom font (TTF / OTF / WOFF)')}
          aria-label={t('Upload a custom font (TTF / OTF / WOFF)')}
        ><Upload size={12} aria-hidden="true" />{t('Upload')}</button>
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={upload} />
      </div>
      {/* Search field — magnifier prefix matches the HelpCenter search so the
          two field-find UIs in the app read as one pattern, rather than the
          FontPicker looking like a generic number input that happens to take
          text. The wrapper carries the `.input-num` border/bg styling; the
          inner <input> is bare so the icon can sit inside the chrome. */}
      <div className="input-num mb-2 flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
        <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('Search fonts…')}
          aria-label={t('Search fonts…')}
          className="flex-1 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70 min-w-0"
        />
      </div>
      <div className="max-h-48 overflow-y-auto border border-border rounded bg-panel2">
        {list.length === 0 ? (
          // Empty state matches the visual pattern of LayersPanel / AssetsPanel:
          // small line-art glyph + heading + caption. Previously this was a
          // single line of caption text inside the scroll box, which read as a
          // bug rather than a designed state when search returned zero hits.
          <div className="px-3 py-4 flex flex-col items-center text-center">
            {/* "Aa" letterform with a magnifier sweep — search-with-no-match idea. */}
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none" className="mb-1.5 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
              <text x="6" y="22" fontFamily="ui-serif, Georgia, serif" fontSize="18" fontWeight="600" fill="currentColor" fillOpacity="0.75">Aa</text>
              <circle cx="29" cy="14" r="6" stroke="rgb(var(--color-accent2))" strokeOpacity="0.7" strokeWidth="1.2" />
              <path d="M33.5 18.5 L 37 22" stroke="rgb(var(--color-accent2))" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <div className="text-xs text-ink/90 mb-0.5">{filter ? t('No matching fonts') : t('No fonts available')}</div>
            <div className="type-caption leading-relaxed max-w-[200px]">
              {filter
                ? t('No fonts match “{q}”. Try a shorter or different keyword.').replace('{q}', filter)
                : t('Upload a TTF/OTF or check back later.')}
            </div>
          </div>
        ) : (
          list.map(f => (
            <button
              key={f.name}
              type="button"
              // Mirror mouse-hover with keyboard-focus so the lazy font-preload
              // fires the same way for Tab / arrow-key navigation. Without
              // the onFocus pair, keyboard users tabbed through the list and
              // saw every row stuck in the fallback font — no preview.
              onMouseEnter={() => ensureFontLoaded(f.name)}
              onFocus={() => ensureFontLoaded(f.name)}
              onClick={() => apply(f.family, f.name)}
              // `rounded-sm` matches the radius of the global focus-visible
              // halo (4px). Without it, keyboard-tab focus painted a 4px-
              // radius ring around a sharp-cornered button — visible mismatch.
              className="block w-full text-left px-2 py-1 text-xs rounded-sm hover:bg-panel3 transition-colors"
              style={{ fontFamily: f.family }}
            >
              {f.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
