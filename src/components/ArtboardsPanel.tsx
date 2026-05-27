import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, FileImage, FileCode, Target } from 'lucide-react';
import { zoomToArtboard } from '../lib/canvasEngine';
import { showConfirm } from '../lib/confirm';
import { useT } from '../lib/i18n';
import {
  createArtboard,
  deleteArtboard,
  renameArtboard,
  moveArtboard,
  resizeArtboard,
  exportArtboardPNG,
  exportArtboardSVGAsync,
} from '../lib/artboards';
import { useEditor } from '../store/editor';
import { download, downloadDataURL } from '../lib/io';
import type { Artboard } from '../types';

export function ArtboardsPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const artboards = useEditor(s => s.artboards);

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="artboards-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Artboards')}
          </span>
          <span className="panel-count">{artboards.length}</span>
        </button>
      </h3>
      {open && (
        <div id="artboards-panel-body" className="px-2 pb-3 space-y-2">
          <button
            type="button"
            onClick={() => createArtboard()}
            className="btn flex items-center gap-1 w-full justify-center"
            title={t('Append a new artboard')}
          >
            <Plus size={12} aria-hidden="true" /> {t('Add Artboard')}
          </button>

          {artboards.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              {/* Two overlapping artboard rectangles — the canonical "multi-page" idea. */}
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <rect x="6.5" y="10.5" width="30" height="22" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" />
                <rect x="20.5" y="6.5" width="30" height="22" rx="1.5" stroke="rgb(var(--color-accent2))" strokeWidth="1.2" />
                <line x1="20.5" y1="13" x2="50.5" y2="13" stroke="rgb(var(--color-accent2))" strokeWidth="1" strokeOpacity="0.5" />
                <circle cx="24" cy="9.5" r="0.8" fill="rgb(var(--color-accent))" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No artboards yet')}</div>
              <div className="type-caption leading-relaxed max-w-[200px]">
                {t('Click "Add Artboard" above to lay out multiple pages side-by-side.')}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {artboards.map((a) => (
                <ArtboardRow key={a.id} artboard={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArtboardRow({ artboard }: { artboard: Artboard }) {
  const t = useT();
  const [name, setName] = useState(artboard.name);
  const [x, setX] = useState(String(artboard.x));
  const [y, setY] = useState(String(artboard.y));
  const [w, setW] = useState(String(artboard.width));
  const [h, setH] = useState(String(artboard.height));

  // Reflect external changes (e.g. another panel renamed the artboard).
  // Render-time sync against the previous prop reference avoids the
  // cascading-effect anti-pattern of 5 separate setState-in-useEffect calls.
  const [prev, setPrev] = useState(artboard);
  if (prev !== artboard) {
    setPrev(artboard);
    setName(artboard.name);
    setX(String(artboard.x));
    setY(String(artboard.y));
    setW(String(artboard.width));
    setH(String(artboard.height));
  }

  const commitName = () => {
    const v = name.trim() || artboard.name;
    if (v !== artboard.name) renameArtboard(artboard.id, v);
  };
  const commitPos = () => {
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      moveArtboard(artboard.id, nx, ny);
    }
  };
  const commitSize = () => {
    const nw = Number(w);
    const nh = Number(h);
    if (Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0) {
      resizeArtboard(artboard.id, nw, nh);
    }
  };

  const slug = artboard.name.replace(/[^a-z0-9-_]+/gi, '_') || artboard.id;

  return (
    <div className="rounded border border-border bg-panel2 p-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          // IME guard: a CJK pinyin/wubi user pressing Enter to confirm an
          // IME candidate would otherwise blur the input mid-composition,
          // committing the partial transliteration as the artboard name.
          // `isComposing` is true on the Enter that closes the IME popup.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="flex-1 bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors"
          aria-label={t('Artboard name')}
        />
        <button
          onClick={() => zoomToArtboard({ x: artboard.x, y: artboard.y, width: artboard.width, height: artboard.height })}
          className="p-1 text-muted hover:text-ink transition-colors"
          title={t('Focus this artboard')}
          aria-label={t('Focus this artboard')}
        >
          <Target size={12} aria-hidden="true" />
        </button>
        <button
          onClick={async () => { if (await showConfirm({ message: `${t('Delete artboard')} "${artboard.name}"?`, confirmLabel: t('Delete'), danger: true })) deleteArtboard(artboard.id); }}
          className="p-1 text-muted hover:text-danger transition-colors"
          title={t('Delete artboard')}
          aria-label={t('Delete artboard')}
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 items-center">
        <Field label="X" value={x} onChange={setX} onCommit={commitPos} />
        <Field label="Y" value={y} onChange={setY} onCommit={commitPos} />
        <Field label="W" value={w} onChange={setW} onCommit={commitSize} />
        <Field label="H" value={h} onChange={setH} onCommit={commitSize} />
      </div>

      <div className="flex gap-1">
        <button
          className="btn flex items-center gap-1 flex-1 justify-center"
          title={t('Export this artboard as PNG')}
          onClick={() => {
            const url = exportArtboardPNG(artboard.id, 2);
            if (url) downloadDataURL(`${slug}.png`, url);
          }}
        >
          <FileImage size={11} aria-hidden="true" /> PNG
        </button>
        <button
          className="btn flex items-center gap-1 flex-1 justify-center"
          title={t('Export this artboard as SVG')}
          onClick={() => {
            void exportArtboardSVGAsync(artboard.id).then((svg) => {
              if (svg) download(`${slug}.svg`, svg, 'image/svg+xml');
            });
          }}
        >
          <FileCode size={11} aria-hidden="true" /> SVG
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      {/* Use the standard 10px field-label rather than the previous one-off
       *  9px so the X/Y/W/H mini-labels match every other field label in
       *  the chrome (10px is the scale's small floor; 9px was a one-off
       *  for "save 1px of vertical space" that the row layout doesn't
       *  actually need). */}
      <span className="field-label !mb-0">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors w-full"
      />
    </label>
  );
}
