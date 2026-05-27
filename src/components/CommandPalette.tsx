import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, PenTool,
  FilePlus2, FolderOpen, FileImage, Image, Printer, Send, FileText, Save,
  Undo2, Redo2, Copy, Trash2, Group, Ungroup, MousePointerClick,
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown,
  Plus, Minus, Maximize2, Bug,
  Settings2, Keyboard, HelpCircle, Sparkles, BookOpen,
  Wand2, Palette, AlignCenter, Grid3X3, SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import {
  undo, redo, zoomBy, zoomFit, deleteSelection, duplicateSelection,
  groupSelection, ungroupSelection,
  bringForward, sendBackward, bringToFront, sendToBack,
} from '../lib/canvasEngine';
import { getCanvas } from '../lib/canvasEngine';
import { getFormat } from '../lib/formats';
import { toast } from '../lib/toast';
import { setOutlineMode, isOutlineMode } from '../lib/outlineView';
import { openProjectFromFile, saveProjectQuick, saveProjectToFile } from '../lib/projectFile';
import { applyClipMask, releaseClipMask, makeCompoundPath, releaseCompoundPath } from '../lib/masks';
import { applyStrokeAlign } from '../lib/strokeAlign';
import { isMac, ariaKeyshortcuts } from '../lib/runtime';
import { listTools } from '../lib/tools/types';
import * as fabric from 'fabric';
import type { ToolId } from '../types';

interface Props {
  onToggleAI: () => void;
  onToggleDebug: () => void;
  onShowOnboarding: () => void;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onImportImage: () => void;
}

interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  keywords?: string;
  // Typed as Lucide's public LucideIcon (extends SVGAttributes) so callers
  // can pass any standard SVG prop — `aria-hidden`, `className`, etc. —
  // without TS narrowing them away. The previous narrow stub forced one-off
  // boolean-form `aria-hidden={true}` syntax that broke the codebase's
  // canonical `aria-hidden="true"` string-form convention.
  icon: LucideIcon;
  run: () => void;
}

/** Local Kbd helper — mirrors the one in MenuBar.tsx (do not extract). */
function Kbd({ combo }: { combo: string }) {
  // Use the canonical `isMac()` from runtime.ts — it prefers Chromium's
  // userAgentData and falls back to legacy navigator.platform, matching the
  // detection used everywhere else for keyboard hints + drag-feel tweaks.
  const isMacPlatform = isMac();
  const parts = combo.split('+').map((p) => {
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

/**
 * Score a command against the query. Lower is better (sorted asc).
 * - Label match wins over category, which wins over keywords/shortcut.
 * - Earlier index within the haystack also ranks better.
 * Returns Infinity if no match.
 */
function score(cmd: Command, q: string): number {
  if (!q) return 0;
  const label = cmd.label.toLowerCase();
  const cat = cmd.category.toLowerCase();
  const kws = (cmd.keywords ?? '').toLowerCase();
  const sc = (cmd.shortcut ?? '').toLowerCase();

  const labelIdx = label.indexOf(q);
  if (labelIdx >= 0) return labelIdx;
  const catIdx = cat.indexOf(q);
  if (catIdx >= 0) return 1000 + catIdx;
  const kwIdx = kws.indexOf(q);
  if (kwIdx >= 0) return 2000 + kwIdx;
  const scIdx = sc.indexOf(q);
  if (scIdx >= 0) return 3000 + scIdx;
  return Infinity;
}

export function CommandPalette({
  onToggleAI, onToggleDebug, onShowOnboarding, onNewDocument, onOpenFile, onImportImage,
}: Props) {
  const t = useT();
  const open = useEditor((s) => s.showCommandPalette);
  const setModal = useEditor((s) => s.setModal);
  const setTool = useEditor((s) => s.setTool);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => setModal('showCommandPalette', false);

  // Helper: open AI panel and copy a preset prompt to clipboard.
  const aiPreset = async (prompt: string) => {
    onToggleAI();
    // navigator.clipboard.writeText is async and the optional-chain trick
    // doesn't catch a rejected Promise — without awaiting, a permission
    // failure would still fire the "copied" toast while the user's
    // clipboard held stale content. Await + catch so the toast only
    // claims success when the write actually landed.
    try {
      await navigator.clipboard?.writeText(prompt);
      toast.info(t('AI prompt copied — paste it into the AI panel.'));
    } catch {
      toast.warn(t('Clipboard unavailable — the AI panel is open; paste manually.'));
    }
  };

  const selectTool = (tool: ToolId) => setTool(tool);

  const selectAll = () => {
    const c = getCanvas();
    if (!c) return;
    const objs = c.getObjects().filter((o) => !(o as { excludeFromExport?: boolean }).excludeFromExport);
    if (!objs.length) return;
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(objs, { canvas: c });
    c.setActiveObject(sel);
    c.requestRenderAll();
  };

  // Build the full command list. Memoised on translation function only —
  // the closures captured here read fresh state from the store on call.
  const commands: Command[] = useMemo(() => [
    // ---------- Tool ----------
    // Drawn from the ToolHandler registry (registerTools.ts) — icon, label,
    // shortcut, keywords all flow from the descriptor so adding a tool means
    // one registry entry, no parallel array to keep in sync. Filtered on
    // `icon` so non-toolbar tools (e.g. directSelect) don't surface here.
    ...listTools().filter(h => h.icon).map(h => ({
      id: `tool.${h.id}`,
      label: t(h.label),
      category: t('Tool'),
      shortcut: h.shortcut,
      keywords: h.keywords,
      icon: h.icon as LucideIcon,
      run: () => selectTool(h.id),
    })),

    // ---------- File ----------
    { id: 'file.new',         label: t('New'),                 category: t('File'), shortcut: 'Ctrl+N', icon: FilePlus2,  run: onNewDocument },
    { id: 'file.template',    label: t('New from Template…'),  category: t('File'), keywords: 'starter preset',           icon: FilePlus2,  run: () => setModal('showTemplates', true) },
    { id: 'file.open',          label: t('Open SVG / JSON…'),    category: t('File'), shortcut: 'Ctrl+O', keywords: 'import load', icon: FolderOpen, run: onOpenFile },
    { id: 'file.openProject',   label: t('Open Project…'),       category: t('File'), keywords: 'vstudio project file',     icon: FolderOpen, run: () => { void openProjectFromFile(); } },
    { id: 'file.saveProject',   label: t('Save Project'),        category: t('File'), shortcut: 'Ctrl+Shift+S', keywords: 'persist vstudio', icon: Save, run: () => { void saveProjectQuick(); } },
    { id: 'file.saveProjectAs', label: t('Save Project As…'),    category: t('File'), keywords: 'copy duplicate vstudio',   icon: Save,       run: () => { void saveProjectToFile(); } },
    { id: 'file.importImage', label: t('Import Image…'),       category: t('File'), keywords: 'png jpg picture',         icon: Image,      run: onImportImage },
    { id: 'file.exportSvg',   label: t('Export SVG'),          category: t('File'), shortcut: 'Ctrl+S', keywords: getFormat('svg')?.keywords, icon: Save,
      // Routes through the format registry — see `formatRegistration.ts`
      // SVG handler. Identical byte output to the previous direct
      // `download(..., exportSVGOptimized())` call, but every future tweak
      // (filename pattern, default options, search keywords) now lives in one place.
      run: () => { try { void getFormat('svg')?.export?.(); toast.success(`${t('Exported')} SVG`); } catch (err) { toast.error((err as Error).message); } } },
    // Raster + PDF exports go through the format registry (see formatRegistration.ts).
    // Behavioural diff is zero — the registry handlers call the same
    // `exportPNG(2)` / `exportJPG(2)` / `exportPDF()` / `exportPDFReal()`
    // underneath — but every future tweak (default DPI, filename pattern,
    // options) lives in one place. The PrintDialog still calls
    // `exportPDFReal` directly because it passes a full options object;
    // the no-args default path is what migrates to the registry.
    { id: 'file.exportPng',   label: t('Export PNG (2×)'),     category: t('File'), keywords: getFormat('png')?.keywords,        icon: FileImage,  run: () => { void getFormat('png')?.export?.(); } },
    { id: 'file.exportJpg',   label: t('Export JPG (2×)'),     category: t('File'), keywords: getFormat('jpg')?.keywords,        icon: FileImage,  run: () => { void getFormat('jpg')?.export?.(); } },
    { id: 'file.exportPdf',   label: t('Export PDF'),          category: t('File'), keywords: getFormat('pdf')?.keywords,        icon: FileText,   run: () => { void getFormat('pdf')?.export?.(); } },
    { id: 'file.exportPdfV',  label: t('Export PDF (Vector)'), category: t('File'), keywords: getFormat('pdf-vector')?.keywords, icon: FileText,   run: () => { void getFormat('pdf-vector')?.export?.(); } },
    { id: 'file.print',       label: t('Print…'),              category: t('File'), shortcut: 'Ctrl+P',                   icon: Printer,    run: () => setModal('showPrint', true) },
    { id: 'file.plotter',     label: t('Send to Plotter…'),    category: t('File'), keywords: 'cutter cnc',               icon: Send,       run: () => setModal('showPlotter', true) },

    // ---------- Edit ----------
    { id: 'edit.undo',       label: t('Undo'),      category: t('Edit'), shortcut: 'Ctrl+Z', icon: Undo2,    run: () => undo() },
    { id: 'edit.redo',       label: t('Redo'),      category: t('Edit'), shortcut: 'Ctrl+Y', icon: Redo2,    run: () => redo() },
    { id: 'edit.duplicate',  label: t('Duplicate'), category: t('Edit'), shortcut: 'Ctrl+D', icon: Copy,     run: () => duplicateSelection() },
    { id: 'edit.delete',     label: t('Delete'),    category: t('Edit'), shortcut: 'Del',    icon: Trash2,   run: () => deleteSelection() },
    { id: 'edit.group',      label: t('Group'),     category: t('Edit'), keywords: 'combine bundle',         icon: Group,    run: () => groupSelection() },
    { id: 'edit.ungroup',    label: t('Ungroup'),   category: t('Edit'),                                     icon: Ungroup,  run: () => ungroupSelection() },
    { id: 'edit.selectAll',  label: t('Select All'), category: t('Edit'), shortcut: 'Ctrl+A',                icon: MousePointerClick, run: selectAll },

    // ---------- Arrange ----------
    { id: 'arrange.front',     label: t('Bring to Front'),     category: t('Arrange'), keywords: 'order z-index top',    icon: ChevronsUp,   run: () => bringToFront() },
    { id: 'arrange.forward',   label: t('Bring Forward'),      category: t('Arrange'), keywords: 'order z-index up',     icon: ChevronUp,    run: () => bringForward() },
    { id: 'arrange.back',      label: t('Send Backward'),      category: t('Arrange'), keywords: 'order z-index down',   icon: ChevronDown,  run: () => sendBackward() },
    { id: 'arrange.bottom',    label: t('Send to Back'),       category: t('Arrange'), keywords: 'order z-index bottom', icon: ChevronsDown, run: () => sendToBack() },
    { id: 'arrange.repeat',    label: t('Repeat (Grid / Radial / Mirror)…'), category: t('Arrange'), keywords: 'array duplicate pattern radial mirror', icon: Grid3X3, run: () => setModal('showRepeat', true) },
    { id: 'arrange.clipMake',  label: t('Make Clip Mask'),     category: t('Arrange'), keywords: 'mask clip',            icon: Wand2,        run: () => { applyClipMask(); } },
    { id: 'arrange.clipFree',  label: t('Release Clip Mask'),  category: t('Arrange'), keywords: 'unmask unclip',         icon: Wand2,        run: () => { releaseClipMask(); } },
    { id: 'arrange.compMake',  label: t('Compound Path'),      category: t('Arrange'), keywords: 'merge paths combine even-odd', icon: PenTool, run: () => { makeCompoundPath(); } },
    { id: 'arrange.compFree',  label: t('Release Compound'),   category: t('Arrange'), keywords: 'split decompose paths', icon: PenTool,      run: () => { releaseCompoundPath(); } },
    { id: 'stroke.alignCenter', label: `${t('Stroke alignment')} — ${t('Center')}`, category: t('Arrange'), keywords: 'stroke align center default', icon: AlignCenter, run: () => applyStrokeAlign('center') },
    { id: 'stroke.alignInside', label: `${t('Stroke alignment')} — ${t('Inside')}`, category: t('Arrange'), keywords: 'stroke align inside inner inset', icon: AlignCenter, run: () => applyStrokeAlign('inside') },
    { id: 'stroke.alignOutside', label: `${t('Stroke alignment')} — ${t('Outside')}`, category: t('Arrange'), keywords: 'stroke align outside outer outset', icon: AlignCenter, run: () => applyStrokeAlign('outside') },

    // ---------- View ----------
    { id: 'view.zoomIn',  label: t('Zoom In'),     category: t('View'), shortcut: 'Ctrl+=', icon: Plus,      run: () => zoomBy(1.25) },
    { id: 'view.zoomOut', label: t('Zoom Out'),    category: t('View'), shortcut: 'Ctrl+-', icon: Minus,     run: () => zoomBy(1 / 1.25) },
    { id: 'view.fit',     label: t('Fit to Page'), category: t('View'), shortcut: 'Ctrl+0', icon: Maximize2, run: () => zoomFit() },
    { id: 'view.outline', label: t('Outline View'), category: t('View'), shortcut: 'Ctrl+Alt+Y', keywords: 'wireframe geometry preview', icon: PenTool, run: () => setOutlineMode(!isOutlineMode()) },
    { id: 'view.debug',   label: t('Toggle Debug'), category: t('View'), keywords: 'logs panel inspect',     icon: Bug,       run: onToggleDebug },

    // ---------- Window ----------
    { id: 'window.docSettings', label: t('Document Settings…'), category: t('Window'), keywords: 'doc size dpi background', icon: Settings2,  run: () => setModal('showDocSettings', true) },
    { id: 'window.preferences', label: t('Open Preferences…'),   category: t('Window'), shortcut: 'Ctrl+,', keywords: 'settings prefs config app',     icon: Settings2,  run: () => setModal('showPreferences', true) },
    { id: 'window.helpCenter',  label: t('Open Help Center'),   category: t('Window'), shortcut: 'F1', keywords: 'docs manual reference guide', icon: BookOpen, run: () => setModal('showHelpCenter', true) },
    { id: 'window.shortcuts',   label: t('Keyboard Shortcuts'), category: t('Window'), shortcut: '?',                       icon: Keyboard,   run: () => setModal('showShortcuts', true) },
    { id: 'window.keymapEditor', label: t('Customize Shortcuts…'), category: t('Window'), keywords: 'rebind remap keybinding hotkey custom', icon: Keyboard, run: () => setModal('showKeymapEditor', true) },
    { id: 'window.onboarding',  label: t('Onboarding…'),        category: t('Window'), keywords: 'tour welcome help start', icon: HelpCircle, run: onShowOnboarding },
    { id: 'window.ai',          label: t('Open AI Panel'),      category: t('Window'), keywords: 'assistant chat',          icon: Sparkles,   run: onToggleAI },
    { id: 'window.theme',       label: t('Toggle Theme'),       category: t('Window'), keywords: 'light dark mode appearance', icon: SunMoon, run: () => { const s = useEditor.getState(); s.setTheme(s.theme === 'light' ? 'dark' : 'light'); } },

    // ---------- AI ----------
    { id: 'ai.critique',  label: t('✨ Critique design'),       category: t('AI'), keywords: 'review feedback improve',
      icon: Wand2,        run: () => aiPreset('Critique the current canvas design. Give 3 concrete, actionable improvements (visual hierarchy, balance, color, spacing). Be specific about which elements to change.') },
    { id: 'ai.palette',   label: t('🎨 Better palette'),        category: t('AI'), keywords: 'color colour scheme harmony',
      icon: Palette,      run: () => aiPreset('Suggest a more harmonious color palette for the current canvas and apply it. Use set_fill / set_stroke on the existing shapes when possible rather than regenerating.') },
    { id: 'ai.tidy',      label: t('📐 Tidy alignment'),        category: t('AI'), keywords: 'align distribute space cleanup',
      icon: AlignCenter,  run: () => aiPreset('Tidy up the alignment and spacing of the elements on this canvas. Use the align_objects and distribute_objects skills to perfectly align and evenly space everything. Do NOT regenerate any SVG.') },
    { id: 'ai.iconSet',   label: t('🧩 Convert to icon set'),   category: t('AI'), keywords: 'icons glyph set generate',
      icon: Grid3X3,      run: () => aiPreset('Convert the current canvas into a small, cohesive icon set — flat, line-based, consistent stroke widths, a unified palette. Replace the canvas with the new icon set as an SVG grid.') },
  // We intentionally do not depend on the callbacks here — they are stable for
  // the lifetime of the parent and the closures read fresh state on call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  // Filter + rank against the query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = commands
      .map((c, i) => ({ c, i, s: score(c, q) }))
      .filter((x) => x.s !== Infinity)
      .sort((a, b) => a.s - b.s || a.i - b.i);
    return ranked.map((x) => x.c);
  }, [commands, query]);

  // Reset state during render on open-transition (no cascading effect).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }
  // Focus the input after open — DOM side-effects belong in an effect.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Derive a safe-clamped active index in render — avoids the setState-in-effect
  // cascade and the one-frame mismatch where the highlight pointed at a stale row.
  const safeActive = active >= filtered.length ? 0 : active;

  // Scroll the active item into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  if (!open) return null;

  const run = (cmd: Command) => {
    close();
    // Run on the next tick so the close animation can begin without React
    // flushing a state update inside the command (e.g. setTool) at the same
    // time we unmount.
    setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // IME guard — Enter during pinyin/kana composition commits the
      // candidate into the search box, not the active command.
      e.preventDefault();
      const cmd = filtered[safeActive];
      if (cmd) run(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, filtered.length - 1));
    } else if (e.key === 'PageDown') {
      // Jump by 10 to match the WAI-ARIA listbox pattern — useful when the
      // empty-query view lists every command and the user wants to skim
      // without holding ArrowDown.
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 10));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 10));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center"
      style={{ paddingTop: '18vh' }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t('Command Palette')}
    >
      <div
        className="w-[520px] max-w-[95vw] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-panel2">
          <Search size={14} className="text-muted shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('Type a command or search…')}
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-label={t('Command Palette')}
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[safeActive] ? `cmd-${filtered[safeActive].id}` : undefined}
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-muted"
          />
          <Kbd combo="Esc" />
        </div>
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          // axe `aria-input-field-name` flags listboxes without a name.
          aria-label={t('Available commands')}
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center px-4 py-8" role="presentation">
              {/* Search-glass with empty inner — consistent line-art style with
                  the other empty states (Layers / Assets / Symbols / Artboards). */}
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <circle cx="19" cy="19" r="11" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.2" />
                <line x1="27" y1="27" x2="36" y2="36" stroke="rgb(var(--color-accent2))" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="19" x2="24" y2="19" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
                <line x1="14" y1="14" x2="20" y2="14" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
                <line x1="14" y1="24" x2="22" y2="24" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No commands found.')}</div>
              <div className="type-caption leading-relaxed max-w-[260px]">
                {t('Try a different keyword — tool, file, edit, view, AI…')}
              </div>
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isActive = idx === safeActive;
              return (
                <button
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isActive}
                  aria-label={cmd.label}
                  aria-keyshortcuts={ariaKeyshortcuts(cmd.shortcut)}
                  onClick={() => run(cmd)}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full h-8 flex items-center gap-2 px-3 text-left text-xs transition-colors ${
                    isActive ? 'bg-panel3 text-ink' : 'text-ink/90 hover:bg-panel3/60'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span className="flex-1 truncate">{cmd.label}</span>
                  <span className="field-label !mb-0 text-[9px]">
                    {cmd.category}
                  </span>
                  {cmd.shortcut && (
                    <span className="ml-1">
                      <Kbd combo={cmd.shortcut} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-panel2 text-[10px] text-muted">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><Kbd combo="↑" /><Kbd combo="↓" /> {t('navigate')}</span>
            <span className="flex items-center gap-1"><Kbd combo="Enter" /> {t('run')}</span>
          </div>
          <span className="tabular-nums">{filtered.length}</span>
        </div>
      </div>
    </div>
  );
}
