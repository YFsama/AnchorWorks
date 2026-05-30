import { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Sparkles, Printer, Send, FileImage, Settings2, Layers, Hash, Magnet, Crosshair, Target, X, Globe, Check } from 'lucide-react';
import { useEditor } from '../store/editor';
import { undo, redo, zoomBy, zoomFit, zoomToPoint, getCanvas } from '../lib/canvasEngine';
import { importImageFile, tilePrint } from '../lib/io3';
import { getFormat } from '../lib/formats';
import { resetOnboarding } from '../lib/onboarding';
import { useT, useI18n, LANGUAGES, t as tStatic, type Lang } from '../lib/i18n';
import { Logo } from './Logo';
import { showConfirm } from '../lib/confirm';
import { openProjectFromFile, openRecentFile, saveProjectQuick, saveProjectToFile } from '../lib/projectFile';
import { isTauri, isMac, getOSLabel, platformInfo, ariaKeyshortcuts, type NativePlatformInfo } from '../lib/runtime';
import { getAutoSaveStatus, subscribeAutoSaveStatus, type AutoSaveStatus } from '../lib/autosave';
import { setOutlineMode } from '../lib/outlineView';
import { clearRecent, subscribeRecent, type RecentFile } from '../lib/recentFiles';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

interface Props {
  onToggleAI: () => void;
  onToggleDebug: () => void;
  onShowOnboarding: () => void;
}

// Map Rust's `std::env::consts::OS` (lowercase, kebab-free) to the display
// casing used in the About dialog. Falls back to a Title-Cased version of
// the raw value for unknown OSes (BSDs, illumos, etc.).
function formatNativeOS(os: string): string {
  switch (os) {
    case 'macos': return 'macOS';
    case 'linux': return 'Linux';
    case 'windows': return 'Windows';
    case 'ios': return 'iOS';
    case 'android': return 'Android';
    default: return os ? os.charAt(0).toUpperCase() + os.slice(1) : 'Unknown';
  }
}

export function MenuBar({ onToggleAI, onToggleDebug, onShowOnboarding }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [showAbout, setShowAbout] = useState(false);
  // Match the rest of the dialog system: Escape closes, focus returns to the
  // opener (the Logo button in the header) when the modal unmounts. Without
  // these the About dialog was a focus trap with no keyboard exit.
  useEscapeClose(showAbout, () => setShowAbout(false));
  useFocusRestore(showAbout);
  // When About opens under the Tauri shell, replace the UA-heuristic OS label
  // with the authoritative `platform_info` command result. PWA users keep the
  // synchronous `getOSLabel()` path; no extra fetch is paid.
  const [nativeInfo, setNativeInfo] = useState<NativePlatformInfo | null>(null);
  useEffect(() => {
    if (!showAbout || !isTauri() || nativeInfo) return;
    let cancelled = false;
    platformInfo().then((info) => { if (!cancelled && info) setNativeInfo(info); }).catch(() => { /* fall back silently to getOSLabel() */ });
    return () => { cancelled = true; };
  }, [showAbout, nativeInfo]);
  const setModal = useEditor(s => s.setModal);
  const zoom = useEditor(s => s.zoom);
  const canUndo = useEditor(s => s.canUndo);
  const canRedo = useEditor(s => s.canRedo);
  const gridVisible = useEditor(s => s.gridVisible);
  const snapEnabled = useEditor(s => s.snapEnabled);
  const smartGuidesEnabled = useEditor(s => s.smartGuidesEnabled);
  const anchorSnapEnabled = useEditor(s => s.anchorSnapEnabled);
  const setGridVisible = useEditor(s => s.setGridVisible);
  const setSnapEnabled = useEditor(s => s.setSnapEnabled);
  const setSmartGuidesEnabled = useEditor(s => s.setSmartGuidesEnabled);
  const setAnchorSnapEnabled = useEditor(s => s.setAnchorSnapEnabled);
  const highContrast = useEditor(s => s.highContrast);
  const setHighContrast = useEditor(s => s.setHighContrast);
  const theme = useEditor(s => s.theme);
  const setTheme = useEditor(s => s.setTheme);
  const outlineMode = useEditor(s => s.outlineMode);
  // Recent files — subscribed so the menu refreshes after each save / open.
  const [recent, setRecent] = useState<RecentFile[]>([]);
  useEffect(() => subscribeRecent(setRecent), []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    // Both branches route through the format registry — the SVG handler now
    // does the smart preprocessing + warning toast that used to live here.
    if (ext === 'svg') await getFormat('svg')?.import?.(f);
    else if (ext === 'json') await getFormat('json')?.import?.(f);
    e.target.value = '';
  };
  const onJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    await getFormat('json')?.import?.(f);
    e.target.value = '';
  };
  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    await importImageFile(f);
    e.target.value = '';
  };

  const onTilePrint = () => {
    const colsStr = prompt(t('Tile columns'), '3');
    if (colsStr == null) return;
    const rowsStr = prompt(t('Tile rows'), '3');
    if (rowsStr == null) return;
    const cols = Math.max(1, parseInt(colsStr, 10) || 3);
    const rows = Math.max(1, parseInt(rowsStr, 10) || 3);
    // Default page size assumes A4 portrait at ~96 DPI
    tilePrint({ pageW: 794, pageH: 1123, cols, rows });
  };

  return (
    // The outer bar is the app's top banner: <header> gives it an implicit
    // `banner` landmark, pairing with the <main> canvas region and the right
    // <aside> for clean SR landmark navigation. It mixes ARIA menu items (the
    // dropdowns below) with toolbar buttons, which axe's `aria-required-children`
    // rule rightly objects to — so `role="menubar"` is re-attached to the
    // focused dropdown cluster only, not on the outer banner.
    <header className="topbar h-11 flex items-center px-3 gap-2 text-xs" aria-label={t('Application chrome')}>
      <button
        type="button"
        onClick={() => setShowAbout(true)}
        className="flex items-center rounded-sm px-1 -mx-1 hover:bg-panel2 transition-colors"
        title={t('About')}
        aria-label={t('About')}
      >
        <Logo size={20} variant="full" />
      </button>
      <span className="topbar-sep" aria-hidden="true" />

      <div role="menubar" aria-label={t('Application menu')} className="flex items-center gap-2">
      <Dropdown label={t('File')} width="w-64" items={[
        { label: t('Save Project'), onClick: () => { void saveProjectQuick(); }, kbd: 'Ctrl+Shift+S' },
        { label: t('Save Project As…'), onClick: () => { void saveProjectToFile(); } },
        { label: t('Open Project…'), onClick: () => { void openProjectFromFile(); } },
        { sep: true },
        { label: t('New'), onClick: async () => { if (await showConfirm({ title: t('New document'), message: t('Clear canvas?'), confirmLabel: t('Clear'), danger: true })) location.reload(); }, kbd: 'Ctrl+N' },
        { label: t('New from Template…'), onClick: () => setModal('showTemplates', true) },
        { label: t('Open SVG / JSON…'), onClick: () => fileRef.current?.click(), kbd: 'Ctrl+O' },
        { label: t('Import Image…'), onClick: () => imageRef.current?.click() },
        { sep: true },
        // File-menu exports route through the format registry — same files,
        // filenames, and options as before, but every consumer (CommandPalette,
        // drag-drop, AI skills, future Tauri "Save as…" dialog) reads the
        // single source of truth. `exportPDFReal` (vector PDF) doesn't have a
        // registry entry yet; its options story is heavier and migrates in a
        // later cycle.
        { label: t('Export SVG'), onClick: () => { void getFormat('svg')?.export?.(); }, kbd: 'Ctrl+S' },
        { label: t('Export PNG (2×)'), onClick: () => { void getFormat('png')?.export?.(); } },
        { label: t('Export JPG (2×)'), onClick: () => { void getFormat('jpg')?.export?.(); } },
        { label: t('Export PDF'), onClick: () => { void getFormat('pdf')?.export?.(); } },
        { label: t('Export PDF (Vector)'), onClick: () => { void getFormat('pdf-vector')?.export?.(); } },
        { label: t('Export DXF (paths)'), onClick: () => { void getFormat('dxf')?.export?.(); } },
        { label: t('Export JSON'), onClick: () => { void getFormat('json')?.export?.(); } },
        { sep: true },
        { label: t('Print…'), onClick: () => setModal('showPrint', true), kbd: 'Ctrl+P' },
        { label: t('Tile Print…'), onClick: onTilePrint },
        { label: t('Send to Plotter…'), onClick: () => setModal('showPlotter', true) },
        ...buildRecentFilesItems(recent),
      ]} />

      <Dropdown label={t('Edit')} items={[
        { label: t('Undo'), onClick: () => undo(), disabled: !canUndo, kbd: 'Ctrl+Z' },
        { label: t('Redo'), onClick: () => redo(), disabled: !canRedo, kbd: 'Ctrl+Y' },
      ]} />

      <Dropdown label={t('View')} items={[
        { label: t('Zoom In'), onClick: () => zoomBy(1.25), kbd: '+' },
        { label: t('Zoom Out'), onClick: () => zoomBy(1 / 1.25), kbd: '-' },
        { label: t('Fit to Page'), onClick: () => zoomFit(), kbd: '0' },
        { sep: true },
        { label: t('Outline View'), onClick: () => setOutlineMode(!outlineMode), kbd: 'Ctrl+Alt+Y', checked: outlineMode },
      ]} />

      <Dropdown label={t('Document')} items={[
        { label: t('Document Settings…'), onClick: () => setModal('showDocSettings', true) },
        { label: t('Repeat (Grid / Radial / Mirror)…'), onClick: () => setModal('showRepeat', true) },
        { sep: true },
        // Cut Contour suite — opens the multi-tab dialog covering vector
        // offset, bitmap trace, and registration marks. Lives under
        // Document because cut paths are document-level metadata
        // (alongside artboards/symbols), not edit-level operations.
        { label: t('Cut Contour…'), onClick: () => setModal('showCutContour', true), kbd: 'Ctrl+Shift+C' },
      ]} />

      <Dropdown label={t('Help')} items={[
        { label: t('Help Center…'), onClick: () => setModal('showHelpCenter', true), kbd: 'F1' },
        { label: t('Command Palette…'), onClick: () => setModal('showCommandPalette', true), kbd: 'Ctrl+K' },
        { label: t('Preferences…'), onClick: () => setModal('showPreferences', true), kbd: 'Ctrl+,' },
        { label: t('Onboarding…'), onClick: () => { resetOnboarding(); onShowOnboarding(); } },
        { label: t('Keyboard Shortcuts'), onClick: () => setModal('showShortcuts', true), kbd: '?' },
        { label: t('Customize Shortcuts…'), onClick: () => setModal('showKeymapEditor', true) },
        { sep: true },
        // Manual updater check — auto-runs once on boot, but this entry lets
        // users force-check (e.g. after seeing a release blog post). Wired to
        // checkAndPrompt with `announceNoUpdate` so the user gets a confirming
        // toast either way rather than silent success.
        { label: t('Check for Updates…'), onClick: () => {
          void import('../lib/updater').then(m => m.checkAndPrompt({ announceNoUpdate: true }));
        } },
        { label: t('Light Theme'), onClick: () => setTheme(theme === 'light' ? 'dark' : 'light'), kbd: 'Ctrl+Shift+L', checked: theme === 'light' },
        { label: t('High Contrast'), onClick: () => setHighContrast(!highContrast), checked: highContrast },
        { sep: true },
        // Debug panel moved off the top chrome — it's a developer affordance,
        // not something end users should see as primary. Still reachable
        // via Ctrl+Shift+D (dev-tool convention) or this menu entry.
        { label: t('Debug Panel'), onClick: onToggleDebug, kbd: 'Ctrl+Shift+D' },
        { label: t('About'), onClick: () => setShowAbout(true) },
      ]} />
      </div>

      <span className="topbar-sep" aria-hidden="true" />
      <IconBtn title={`${t('Undo')} (Ctrl+Z)`} aria-label={t('Undo')} aria-keyshortcuts={ariaKeyshortcuts('Ctrl+Z')} onClick={() => undo()} disabled={!canUndo}><Undo2 size={14} aria-hidden="true" /></IconBtn>
      <IconBtn title={`${t('Redo')} (Ctrl+Y)`} aria-label={t('Redo')} aria-keyshortcuts={ariaKeyshortcuts('Ctrl+Y')} onClick={() => redo()} disabled={!canRedo}><Redo2 size={14} aria-hidden="true" /></IconBtn>

      <span className="topbar-sep" aria-hidden="true" />
      {/* Grid / Snap / Guides — single segmented control. Each pip is independently
          toggleable; the group reads as one cluster. */}
      <div className="segmented" role="group" aria-label={t('Canvas helpers')}>
        <button
          type="button"
          title={t('Grid')}
          aria-label={t('Grid')}
          aria-pressed={gridVisible}
          onClick={() => setGridVisible(!gridVisible)}
        >
          <Hash size={12} aria-hidden="true" />
          <span>{t('Grid')}</span>
        </button>
        <button
          type="button"
          title={t('Snap to Grid')}
          aria-label={t('Snap to Grid')}
          aria-pressed={snapEnabled}
          onClick={() => setSnapEnabled(!snapEnabled)}
        >
          <Magnet size={12} aria-hidden="true" />
          <span>{t('Snap')}</span>
        </button>
        <button
          type="button"
          title={t('Smart Guides')}
          aria-label={t('Smart Guides')}
          aria-pressed={smartGuidesEnabled}
          onClick={() => setSmartGuidesEnabled(!smartGuidesEnabled)}
        >
          <Crosshair size={12} aria-hidden="true" />
          <span>{t('Guides')}</span>
        </button>
        <button
          type="button"
          title={t('Snap to anchor points')}
          aria-label={t('Snap to anchor points')}
          aria-pressed={anchorSnapEnabled}
          onClick={() => setAnchorSnapEnabled(!anchorSnapEnabled)}
        >
          <Target size={12} aria-hidden="true" />
          <span>{t('Anchor')}</span>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <SaveIndicator />
        {/* Zoom indicator — click to edit %, Enter applies, Escape cancels, blur commits.
            Right-click / shift-click fits the page. */}
        <ZoomChip zoom={zoom} t={t} />
        <span className="topbar-sep" aria-hidden="true" />
        {/* Secondary — output actions. */}
        <button type="button" className="btn flex items-center gap-1" title={t('Send to Plotter…')} aria-label={t('Send to Plotter…')} onClick={() => setModal('showPlotter', true)}>
          <Send size={12} aria-hidden="true" />{t('Plotter')}
        </button>
        <button type="button" className="btn flex items-center gap-1" title={`${t('Print…')} (Ctrl+P)`} aria-label={t('Print…')} aria-keyshortcuts={ariaKeyshortcuts('Ctrl+P')} onClick={() => setModal('showPrint', true)}>
          <Printer size={12} aria-hidden="true" />{t('Print')}
        </button>
        <button type="button" className="btn flex items-center gap-1" title={`${t('Export SVG')} (Ctrl+S)`} aria-label={t('Export SVG')} aria-keyshortcuts={ariaKeyshortcuts('Ctrl+S')} onClick={() => { void getFormat('svg')?.export?.(); }}>
          <FileImage size={12} aria-hidden="true" />{t('Export')}
        </button>
        <button type="button" className="btn flex items-center justify-center w-7 h-7 p-0" title={t('Document Settings…')} aria-label={t('Document Settings…')} onClick={() => setModal('showDocSettings', true)}>
          <Settings2 size={12} aria-hidden="true" />
        </button>
        {/* Primary — AI. */}
        <button type="button" className="btn-primary flex items-center gap-1" title={t('AI Assistant')} aria-label={t('AI Assistant')} onClick={onToggleAI}>
          <Sparkles size={12} aria-hidden="true" />{t('AI')}
        </button>
        <LanguageSwitcher />
      </div>

      <input ref={fileRef} type="file" accept=".svg,.json" hidden onChange={onFile} />
      <input ref={jsonRef} type="file" accept=".json" hidden onChange={onJSON} />
      <input ref={imageRef} data-import-image type="file" accept=".png,.jpg,.jpeg,.webp,.gif" hidden onChange={onImage} />

      {showAbout && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAbout(false)}>
          <div
            className="w-[380px] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-dialog-title"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
              <h2 id="about-dialog-title" className="dialog-title">{t('About')}</h2>
              <button type="button" onClick={() => setShowAbout(false)} className="btn-dialog-close" aria-label={t('Close')}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-3 text-sm">
              <Logo size={40} variant="full" />
              <div className="type-caption">
                {t('Version')} {__APP_VERSION__}
                {' · '}
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: isTauri() ? 'rgb(var(--color-success))' : 'rgb(var(--color-accent2))' }}
                    aria-hidden="true"
                  />
                  {isTauri() ? t('Native shell (Tauri)') : t('Web / PWA')}
                </span>
                <span className="text-muted/80" title={nativeInfo ? `${nativeInfo.os} · ${nativeInfo.arch}` : undefined}>
                  {' · '}
                  {nativeInfo
                    ? `${formatNativeOS(nativeInfo.os)} ${nativeInfo.arch}`
                    : getOSLabel()}
                </span>
              </div>
              <p className="text-muted text-xs leading-relaxed">
                {t('An AI-assisted vector editor built with Fabric.js, React, and Tailwind. AI features powered by Anthropic. Source managed with Git.')}
              </p>
              <div className="text-[10px] text-muted/70 pt-2 border-t border-border">
                {t('Credits: Fabric.js, React, Anthropic, Lucide icons.')}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function LanguageSwitcher() {
  const t = useT();
  const lang = useI18n(s => s.lang);
  const setLang = useI18n(s => s.setLang);
  const labelFor = (l: Lang) => (l === 'zh' ? '中文' : 'EN');
  // Same aria-expanded recipe as the Dropdown component above — track open
  // state so SR knows the menu's actual visibility (CSS hover / focus-within
  // doesn't propagate to the a11y tree on its own).
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        // Pill-style language switcher — rounded-full sets it apart from rectangular buttons.
        className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-panel2 border border-border text-muted hover:text-ink hover:border-border/80 transition-colors"
        title={t('Language')}
        aria-label={t('Language')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Globe size={11} aria-hidden="true" />
        <span>{labelFor(lang)}</span>
      </button>
      <div
        className="absolute right-0 top-full mt-1 bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 w-28 py-1"
        role="menu"
        aria-label={t('Language')}
      >
        {LANGUAGES.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            role="menuitemradio"
            aria-checked={l === lang}
            aria-label={labelFor(l)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 text-ink transition-colors"
          >
            <span>{labelFor(l)}</span>
            {l === lang && <Check size={12} className="text-success" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Build the Recent Files cluster (header + items + clear button) as a list of
 * `MenuItem`s appended to the File dropdown. Returns an empty array when
 * there are no recents, which hides the section entirely.
 */
function buildRecentFilesItems(recent: RecentFile[]): MenuItem[] {
  if (recent.length === 0) return [];
  const top = recent.slice(0, 5);
  const items: MenuItem[] = [{ sep: true }];
  items.push({
    node: (
      <div className="px-3 pt-1.5 pb-1 field-label !mb-0 text-muted/80">
        {tStatic('Recent Files')}
      </div>
    ),
  });
  for (const f of top) {
    items.push({
      node: (
        <button
          onClick={() => { void openRecentFile(f.name); }}
          role="menuitem"
          aria-label={`${tStatic('Open recent')}: ${f.name}`}
          title={f.name}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-panel3 transition-colors"
        >
          {/* 16×16 thumb (was 12×12). At 12px the saved-canvas preview was
              an indistinguishable colour blob inside a tiny square; 16px is
              just enough resolution to read dominant shape + colour, which
              is the whole point of having a preview at all. The menu-row
              height (px-3 py-1.5 ≈ 28px) accommodates it without changing. */}
          <span
            className="w-4 h-4 rounded-sm border border-border bg-panel2 flex-shrink-0 overflow-hidden flex items-center justify-center"
            aria-hidden="true"
          >
            {f.preview ? (
              <img
                src={f.preview}
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              // Fallback icon for projects saved before preview generation
              // was wired up (and any future case where the thumb fails to
              // generate). Without this, the box rendered as an empty grey
              // square — visually broken instead of intentionally placeholder.
              <FileImage size={10} className="text-muted/70" aria-hidden="true" />
            )}
          </span>
          <span className="flex-1 min-w-0 truncate text-ink/90">{f.name}</span>
          <span className="text-[10px] text-muted tabular-nums flex-shrink-0">
            {formatRelativeTime(f.ts)}
          </span>
        </button>
      ),
    });
  }
  items.push({
    node: (
      <button
        onClick={() => clearRecent()}
        role="menuitem"
        aria-label={tStatic('Clear recent files')}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 text-[11px] text-muted hover:text-ink transition-colors"
      >
        <span>{tStatic('Clear Recent')}</span>
      </button>
    ),
  });
  return items;
}

/** Short relative-time helper for the recent-files list. Uses {n} placeholder
 * templates so zh can reorder ("5 分钟前") vs en ("5m ago"). */
function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return tStatic('just now');
  const min = Math.floor(sec / 60);
  if (min < 60) return tStatic('Nm ago').replace('{n}', String(min));
  const hr = Math.floor(min / 60);
  if (hr < 24) return tStatic('Nh ago').replace('{n}', String(hr));
  const day = Math.floor(hr / 24);
  if (day < 7) return tStatic('Nd ago').replace('{n}', String(day));
  const wk = Math.floor(day / 7);
  if (wk < 5) return tStatic('Nw ago').replace('{n}', String(wk));
  const mo = Math.floor(day / 30);
  if (mo < 12) return tStatic('Nmo ago').replace('{n}', String(mo));
  return tStatic('Ny ago').replace('{n}', String(Math.floor(day / 365)));
}

/**
 * Zoom indicator — clickable badge that toggles to an editable input.
 * Type a percentage and press Enter (or blur) to apply. Escape cancels.
 * Shift-click or right-click jumps to Fit-to-Page.
 */
function ZoomChip({ zoom, t }: { zoom: number; t: (k: string) => string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const displayPct = Math.round(zoom * 100);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n > 0) {
      const c = getCanvas();
      const target = Math.max(5, Math.min(3200, n)) / 100;
      if (c) zoomToPoint(c.getWidth() / 2, c.getHeight() / 2, target);
    }
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel2 border border-accent2 text-xs tabular-nums">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className="w-12 bg-transparent outline-none text-ink text-right"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // IME guard — the input is `type="text"` so a CJK keyboard
            // layout (pinyin / kana) could be active. Without isComposing,
            // the Enter that closes the IME candidate popup would
            // double-fire as a zoom commit on the partial transliteration.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          aria-label={t('Zoom')}
        />
        <span className="text-muted">%</span>
      </div>
    );
  }

  return (
    <button
      className="btn-ghost flex items-center gap-1 tabular-nums"
      onClick={(e) => {
        if (e.shiftKey) { zoomFit(); return; }
        setDraft(String(displayPct));
        setEditing(true);
      }}
      onContextMenu={(e) => { e.preventDefault(); zoomFit(); }}
      title={`${displayPct}% — ${t('Click to set, Shift-click to fit')}`}
      aria-label={`${t('Zoom')} ${displayPct}%`}
    >
      <Layers size={11} aria-hidden="true" />
      <span className="text-ink">{displayPct}%</span>
    </button>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // `disabled:hover:*` resets neutralise the active hover styles when the
  // button is disabled (Undo / Redo when there's nothing to undo). Without
  // them a greyed-out Undo button still flashed the bg-panel3 + text-ink
  // hover combo, contradicting its "can't click me" signal.
  return <button {...rest} className="px-2 py-1 rounded hover:bg-panel3 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted transition-colors text-muted hover:text-ink">{children}</button>;
}

/**
 * Compact "Saved Ns ago" / "Unsaved changes" chip. Reads from the autosave
 * status feed and re-renders on a 5s tick (so the relative time stays fresh
 * even when no Fabric events fire). Click triggers `saveProjectQuick()` —
 * writes back to the current handle when we have one, otherwise opens the
 * save picker.
 */
function SaveIndicator() {
  const t = useT();
  const [status, setStatus] = useState<AutoSaveStatus>(() => getAutoSaveStatus());
  // Forces a re-render every 5s so the relative time label refreshes.
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeAutoSaveStatus(setStatus);
    const id = window.setInterval(() => setTick((tk) => tk + 1), 5000);
    return () => { unsub(); window.clearInterval(id); };
  }, []);

  const label = formatSaveLabel(status, t);
  // Visual hierarchy: dirty == warn dot, clean == success dot, never-saved == muted.
  const dotClass = status.dirty
    ? 'bg-warn'
    : status.lastSavedAt
      ? 'bg-success'
      : 'bg-muted/40';

  return (
    <button
      type="button"
      className="btn-ghost flex items-center gap-1.5"
      onClick={() => { void saveProjectQuick(); }}
      // Title carries the action hint ("Save now"); the visible span + aria-
      // label both surface the *status* ("Saved 3m ago" / "Unsaved changes")
      // — splitting these gives the tooltip a job beyond echoing what the
      // sighted user can already read on the chip.
      title={`${t('Save now')} (Ctrl+Shift+S)`}
      aria-label={label}
      aria-keyshortcuts={ariaKeyshortcuts('Ctrl+Shift+S')}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${dotClass}`} aria-hidden="true" />
      <span className="type-caption">{label}</span>
    </button>
  );
}

function formatSaveLabel(s: AutoSaveStatus, t: (k: string) => string): string {
  if (s.dirty) return t('Unsaved changes');
  if (s.lastSavedAt == null) return t('Not saved yet');
  const diff = Math.max(0, Date.now() - s.lastSavedAt);
  if (diff < 5000) return t('Saved just now');
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t('Saved Ns ago').replace('{n}', String(sec));
  const min = Math.floor(sec / 60);
  if (min < 60) return t('Saved Nm ago').replace('{n}', String(min));
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('Saved Nh ago').replace('{n}', String(hr));
  // Roll over into days once we cross the 24-hour mark — matches the
  // Recent Files relative-time scale (Nd / Nw / Nmo ago) so a stale save
  // reads as "Saved 3d ago" instead of "Saved 72h ago".
  const day = Math.floor(hr / 24);
  return t('Saved Nd ago').replace('{n}', String(day));
}

interface MenuItem {
  label?: string;
  onClick?: () => void;
  kbd?: string;
  sep?: boolean;
  disabled?: boolean;
  /** Checked toggle item — renders a ✓ icon next to the kbd. */
  checked?: boolean;
  /** Optional custom JSX — when present, replaces the standard button row. */
  node?: React.ReactNode;
}
function Dropdown({ label, items, width }: { label: string; items: MenuItem[]; width?: string }) {
  // Track open state so aria-expanded reflects reality. The visual
  // transition is still CSS (group-hover / group-focus-within) — this
  // state mirrors those triggers so screen readers know the menu state.
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Only collapse when focus leaves the dropdown subtree entirely —
        // tabbing between menu items stays "open".
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="px-2 py-1 rounded hover:bg-panel2 text-ink/90 hover:text-ink transition-colors"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        role="menuitem"
      >
        {label}
      </button>
      <div
        className={`absolute left-0 top-full mt-1 bg-panel border border-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 ${width ?? 'w-56'} py-1`}
        role="menu"
        aria-label={label}
      >
        {items.map((it, i) => {
          if (it.sep) return <div key={i} className="my-1 border-t border-border" role="separator" />;
          if (it.node) return <div key={i}>{it.node}</div>;
          const isToggle = typeof it.checked === 'boolean';
          return (
            <button
              key={i}
              type="button"
              disabled={it.disabled}
              onClick={it.onClick}
              role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={isToggle ? it.checked : undefined}
              aria-label={it.label}
              aria-keyshortcuts={ariaKeyshortcuts(it.kbd)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-panel3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent gap-2 transition-colors"
            >
              <span className="flex items-center gap-1.5 flex-1 min-w-0 truncate">{it.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {it.kbd && <Kbd combo={it.kbd} />}
                {isToggle && (
                  <span className={`w-3 ${it.checked ? 'text-success' : 'text-transparent'}`} aria-hidden="true">
                    <Check size={12} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Renders a shortcut combo as discrete <kbd> chips. "Ctrl+N" → [Ctrl][N].
 * Uses ⌘ on macOS for the Cmd modifier so the hint matches the actual key.
 */
function Kbd({ combo }: { combo: string }) {
  const isMacPlatform = isMac();
  const parts = combo.split('+').map(p => {
    const k = p.trim();
    if (isMacPlatform && /^Ctrl$/i.test(k)) return '⌘';
    if (isMacPlatform && /^Alt$/i.test(k)) return '⌥';
    if (isMacPlatform && /^Shift$/i.test(k)) return '⇧';
    if (isMacPlatform && /^Meta$/i.test(k)) return '⌘';
    return k;
  });
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {parts.map((p, i) => (
        <kbd key={i} className="kbd-menu">
          {p}
        </kbd>
      ))}
    </span>
  );
}
