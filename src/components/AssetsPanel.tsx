import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Wand2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getStoredAssets,
  insertAsset,
  removeAsset,
  importImageFile,
  traceSelectedImage,
  type StoredAsset,
} from '../lib/io3';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';

export function AssetsPanel() {
  const t = useT();
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [open, setOpen] = useState(true);
  const [tracing, setTracing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setAssets(getStoredAssets());
    refresh();
    const onChange = () => refresh();
    window.addEventListener('vector:assets-changed', onChange as EventListener);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('vector:assets-changed', onChange as EventListener);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await importImageFile(f);
    e.target.value = '';
  };

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="assets-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Assets')}
          </span>
          <span className="panel-count">{assets.length}</span>
        </button>
      </h3>
      {open && (
        <div id="assets-panel-body" className="px-2 pb-3">
          <div className="flex items-center gap-1 mb-2">
            <button
              className="btn flex items-center gap-1 flex-1 justify-center"
              onClick={() => inputRef.current?.click()}
              title={t('Import an image into the library')}
            >
              <Plus size={12} aria-hidden="true" /> {t('Import')}
            </button>
            <button
              className="btn flex items-center gap-1 flex-1 justify-center"
              disabled={tracing}
              aria-busy={tracing}
              onClick={() => {
                void (async () => {
                  setTracing(true);
                  try {
                    await traceSelectedImage();
                    toast.success(t('Image traced'));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err), { title: t('Trace') });
                  } finally {
                    setTracing(false);
                  }
                })();
              }}
              title={t('Trace the selected raster image into a polygon')}
            >
              {tracing
                ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                : <Wand2 size={12} aria-hidden="true" />}
              {/* Verb-tense change reinforces the activity beyond the spinner —
               *  important when prefers-reduced-motion freezes the animation
               *  and the icon is the only visible state cue. */}
              {' '}{tracing ? t('Tracing…') : t('Trace')}
            </button>
          </div>

          {assets.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              {/* Picture frame + corner star — "drop images here" idea, kept line-art. */}
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <rect x="6.5" y="6.5" width="43" height="31" rx="2" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M14 30 L 22 22 L 28 27 L 36 18 L 42 24" stroke="rgb(var(--color-accent2))" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="20" cy="16" r="2" fill="rgb(var(--color-accent))" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No assets yet')}</div>
              <div className="type-caption leading-relaxed">
                {t("Drop images on the canvas or use Import — they'll show up here for quick re-use.")}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {assets.map((a) => (
                <AssetTile key={a.id} asset={a} />
              ))}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif"
            hidden
            onChange={onPickFile}
          />
        </div>
      )}
    </div>
  );
}

function AssetTile({ asset }: { asset: StoredAsset }) {
  const t = useT();
  return (
    <div className="relative group rounded border border-border bg-panel2 hover:border-accent2 transition-colors overflow-hidden">
      <button
        type="button"
        className="block w-full aspect-square p-1"
        title={`${asset.name} — ${t('click to insert')}`}
        aria-label={asset.name}
        onClick={() => { void insertAsset(asset); }}
      >
        {asset.thumb ? (
          <img
            src={asset.thumb}
            alt={asset.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-[10px]">
            {t(asset.kind)}
          </div>
        )}
      </button>
      <button
        // Visible on hover OR when keyboard-focused — without
        // `focus-visible:opacity-100` Tab-cycling lands on an invisible
        // button (opacity-0 hides it for mouse users; focus then has no UI
        // anchor beyond the global focus halo).
        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); removeAsset(asset.id); }}
        title={t('Remove from library')}
        aria-label={t('Remove from library')}
      >
        <Trash2 size={10} aria-hidden="true" />
      </button>
    </div>
  );
}
