import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Check, X } from 'lucide-react';
import { useT } from '../lib/i18n';
import {
  getSymbols,
  saveSelectionAsSymbol,
  insertSymbol,
  deleteSymbol,
  renameSymbol,
} from '../lib/symbols';
import type { SymbolEntry } from '../types';
import { toast } from '../lib/toast';

export function SymbolsPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  // When non-null we're showing the inline "name this symbol" input in place
  // of the Save Selection button.
  const [namingNew, setNamingNew] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setSymbols(getSymbols());
    refresh();
    const onChange = () => refresh();
    window.addEventListener('vector:symbols-changed', onChange as EventListener);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('vector:symbols-changed', onChange as EventListener);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    if (namingNew != null) newNameRef.current?.focus();
  }, [namingNew]);

  const beginSave = () => setNamingNew('');
  const cancelSave = () => setNamingNew(null);

  const commitSave = async () => {
    if (namingNew == null) return;
    const trimmed = namingNew.trim() || 'Symbol';
    setNamingNew(null);
    const entry = await saveSelectionAsSymbol(trimmed);
    if (!entry) {
      toast.warn(t('Select one or more objects on the canvas first.'));
    }
  };

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="symbols-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Symbols')}
          </span>
          <span className="panel-count">{symbols.length}</span>
        </button>
      </h3>
      {open && (
        <div id="symbols-panel-body" className="px-2 pb-3 space-y-2">
          {namingNew == null ? (
            <button
              type="button"
              className="btn flex items-center gap-1 w-full justify-center"
              onClick={beginSave}
              title={t('Save the current selection as a reusable symbol')}
            >
              <Plus size={12} aria-hidden="true" /> {t('Save Selection as Symbol')}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                ref={newNameRef}
                type="text"
                className="input-num flex-1"
                value={namingNew}
                placeholder={t('Symbol name')}
                aria-label={t('Symbol name')}
                onChange={(e) => setNamingNew(e.target.value)}
                onKeyDown={(e) => {
                  // IME guard — symbol names take Chinese / Japanese / Korean input.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void commitSave(); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelSave(); }
                }}
              />
              <button
                type="button"
                className="btn p-1"
                onClick={() => { void commitSave(); }}
                aria-label={t('Save symbol')}
                title={t('Save (Enter)')}
              >
                <Check size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn p-1"
                onClick={cancelSave}
                aria-label={t('Cancel')}
                title={t('Cancel (Esc)')}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          )}

          {symbols.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              {/* Three-tile mini-grid suggests "reusable instances". One filled tile is the
                  master, the other two are the dim/dashed instances. */}
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <rect x="6.5" y="7.5" width="13" height="13" rx="1.5" fill="rgb(var(--color-accent2))" fillOpacity="0.18" stroke="rgb(var(--color-accent2))" strokeWidth="1.2" />
                <rect x="22.5" y="7.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="2 2" />
                <rect x="38.5" y="7.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="2 2" />
                <path d="M19 28 L 13 33 M27 28 L 29 33 M43 28 L 45 33" stroke="rgb(var(--color-accent2))" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
                <circle cx="13" cy="33" r="1.5" fill="rgb(var(--color-accent))" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No symbols yet')}</div>
              <div className="type-caption leading-relaxed max-w-[200px]">
                {t('Select shape(s) and use "Save Selection" above to make them reusable.')}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {symbols.map((s) => (
                <SymbolTile key={s.id} symbol={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SymbolTile({ symbol }: { symbol: SymbolEntry }) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(symbol.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed the draft when rename mode begins — track during render to avoid the
  // setState-in-effect cascade.
  const [prevRenaming, setPrevRenaming] = useState(renaming);
  if (renaming !== prevRenaming) {
    setPrevRenaming(renaming);
    if (renaming) setDraft(symbol.name);
  }

  // Defer focus + select to next tick so the input is mounted. DOM side-effects
  // belong in an effect.
  useEffect(() => {
    if (renaming) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.select(); }
      });
    }
  }, [renaming]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== symbol.name) renameSymbol(symbol.id, trimmed);
    setRenaming(false);
  };
  const cancel = () => { setDraft(symbol.name); setRenaming(false); };

  const beginRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenaming(true);
  };

  return (
    <div className="relative group rounded border border-border bg-panel2 hover:border-accent2 transition-colors overflow-hidden">
      <button
        type="button"
        className="block w-full aspect-square p-1"
        title={`${symbol.name} — ${t('click to insert, double-click to rename')}`}
        aria-label={symbol.name}
        onClick={() => {
          if (renaming) return;
          void insertSymbol(symbol.id);
        }}
        onDoubleClick={beginRename}
        disabled={renaming}
      >
        {symbol.thumbnail ? (
          <img
            src={symbol.thumbnail}
            alt={symbol.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-[10px]">
            {symbol.name}
          </div>
        )}
      </button>
      {renaming ? (
        <div
          className="absolute bottom-0 inset-x-0 px-0.5 py-0.5 bg-panel/95"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-panel2 border border-accent2 rounded-sm px-1 py-0.5 text-[9px] text-ink outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            aria-label={t('Symbol name')}
            onKeyDown={(e) => {
              // IME guard — same as the new-symbol name input above.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
          />
        </div>
      ) : (
        <div className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none">
          {symbol.name}
        </div>
      )}
      {!renaming && (
        <button
          type="button"
          className="absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); deleteSymbol(symbol.id); }}
          title={t('Delete symbol')}
          aria-label={t('Delete symbol')}
        >
          <Trash2 size={10} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
